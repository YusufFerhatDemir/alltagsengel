/**
 * Kette 12 — Pflegedokumentation auffällig → Aufgabe an PDL.
 *
 * Zwei unabhängige Prüfungen:
 *
 *  a) Grenzwert-Alarm: `berechneAktuelleAlarme()` (lib/vitals/vitals.ts)
 *     existierte bereits, wurde aber nur auf manuellen GET-Abruf berechnet
 *     (app/api/vitals/alarme) — nichts erzeugte daraus eine Aufgabe. Bleibt
 *     hinter dem MDR-Kill-Switch `grenzwertAlarmeAktiv()`: die automatische
 *     Bewertung von Vitalwerten ist eine potenzielle Medizinprodukt-Funktion
 *     und darf nur laufen, wenn das Flag bewusst gesetzt ist (siehe
 *     lib/vitals/config.ts). Diese Kette umgeht den Schalter NICHT.
 *
 *  b) Dokumentationslücke: rein organisatorisch (keine medizinische
 *     Bewertung eines Messwerts) — läuft unabhängig vom MDR-Schalter. Ein
 *     Klient mit konfigurierten Grenzwerten (= aktive Vitalwert-Überwachung)
 *     ohne jede Messung seit X Tagen ist ein Betreuungslücken-Signal.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { berechneAktuelleAlarme } from '@/lib/vitals/vitals'
import { listThresholds, listVitals } from '@/lib/vitals/server'
import { grenzwertAlarmeAktiv } from '@/lib/vitals/config'
import { VITAL_TYPEN } from '@/lib/vitals/types'
import { logAuditEvent } from '@/lib/audit-log'
import { ersterPdlDerOrg } from './org-empfaenger'
import { heuteBerlin } from '@/lib/utils/timezone'

/** Tage ohne jede Vitalwert-Messung, ab denen eine Doku-Lücke gemeldet wird. */
export const DOKU_LUECKE_TAGE = 3

export interface VitalwertePdlErgebnis {
  alarmeGeprueft: number
  alarmAufgabenErstellt: number
  dokuLueckenGeprueft: number
  dokuLueckenAufgabenErstellt: number
  fehler: string[]
}

async function aufgabeFallsNeu(
  supabase: SupabaseClient,
  organizationId: string,
  actorId: string,
  params: {
    schluessel: string
    typ: 'vital_alarm' | 'vital_doku_luecke'
    titel: string
    beschreibung: string
    clientId: string
    verantwortlichId: string | null
    prioritaet: 'hoch' | 'kritisch'
  },
): Promise<boolean> {
  const { data: vorhanden, error: dupErr } = await supabase
    .from('ops_aufgaben')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('metadata->>schluessel', params.schluessel)
    .limit(1)
    .maybeSingle()

  if (dupErr) {
    console.error(`[vitalwerte-pdl] Dublettenprüfung fehlgeschlagen: ${dupErr.message}`)
    return false
  }
  if (vorhanden) return false

  const { data: aufgabe, error } = await supabase
    .from('ops_aufgaben')
    .insert({
      organization_id: organizationId,
      titel: params.titel,
      beschreibung: params.beschreibung,
      kategorie: 'pflege',
      prioritaet: params.prioritaet,
      status: 'offen',
      verantwortlich_id: params.verantwortlichId,
      erstellt_von: actorId,
      faellig_am: heuteBerlin(),
      client_id: params.clientId,
      tags: ['vitalwerte', params.typ],
      metadata: { schluessel: params.schluessel, typ: params.typ, quelle: 'automatisch_vitalwerte' },
    })
    .select('id')
    .single()

  if (error || !aufgabe) {
    console.error(`[vitalwerte-pdl] Anlage fehlgeschlagen: ${error?.message}`)
    return false
  }

  await logAuditEvent({
    action: 'create', actorId, organizationId, entityType: 'ops_aufgabe', entityId: aufgabe.id,
    details: { grund: params.typ, client_id: params.clientId },
  }).catch(err => console.error(`[vitalwerte-pdl] Audit fehlgeschlagen: ${err}`))

  return true
}

export async function pruefeVitalwerteUndMeldePdl(
  supabase: SupabaseClient,
  organizationId: string,
  actorId: string,
): Promise<VitalwertePdlErgebnis> {
  const fehler: string[] = []
  const pdlId = await ersterPdlDerOrg(supabase, organizationId)

  // ── a) Grenzwert-Alarme (nur wenn MDR-Freigabe aktiv) ──────────
  let alarmeGeprueft = 0
  let alarmAufgabenErstellt = 0
  if (grenzwertAlarmeAktiv()) {
    try {
      const vonDatum = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const [messungen, grenzwerte] = await Promise.all([
        listVitals(supabase, { organizationId, vonDatum, limit: 2000 }),
        listThresholds(supabase, organizationId),
      ])
      const alarme = berechneAktuelleAlarme(messungen, grenzwerte)
      alarmeGeprueft = alarme.length
      const kritisch = alarme.filter(a => a.bewertung.stufe === 'kritisch')

      for (const alarm of kritisch) {
        const schluessel = `vital-${alarm.client_id}-${alarm.type}-${alarm.messung.measured_at}`
        const { data: client } = await supabase
          .from('clients').select('first_name, last_name').eq('id', alarm.client_id).maybeSingle()
        const clientName = client ? `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim() : alarm.client_id
        const label = VITAL_TYPEN[alarm.type]?.label ?? alarm.type

        const erstellt = await aufgabeFallsNeu(supabase, organizationId, actorId, {
          schluessel,
          typ: 'vital_alarm',
          titel: `Kritischer Vitalwert-Alarm: ${clientName} (${label})`,
          beschreibung: `${alarm.bewertung.meldungen.join('; ')} — gemessen am ${alarm.messung.measured_at}.`,
          clientId: alarm.client_id,
          verantwortlichId: pdlId,
          prioritaet: 'kritisch',
        })
        if (erstellt) alarmAufgabenErstellt++
      }
    } catch (err) {
      fehler.push(`Grenzwert-Alarme: ${(err as Error).message}`)
    }
  }

  // ── b) Dokumentationslücke (unabhängig vom MDR-Schalter) ───────
  let dokuLueckenGeprueft = 0
  let dokuLueckenAufgabenErstellt = 0
  try {
    const { data: ueberwachteClients, error: thErr } = await supabase
      .from('vital_sign_thresholds')
      .select('client_id')
      .eq('organization_id', organizationId)
      .eq('enabled', true)
    if (thErr) throw new Error(thErr.message)

    const clientIds = Array.from(new Set((ueberwachteClients ?? []).map((t: { client_id: string }) => t.client_id)))
    dokuLueckenGeprueft = clientIds.length
    const grenzDatum = new Date(Date.now() - DOKU_LUECKE_TAGE * 24 * 60 * 60 * 1000).toISOString()

    for (const clientId of clientIds) {
      const { data: letzte, error: vErr } = await supabase
        .from('vital_signs')
        .select('measured_at')
        .eq('organization_id', organizationId)
        .eq('client_id', clientId)
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (vErr) {
        fehler.push(`Doku-Lücke ${clientId}: ${vErr.message}`)
        continue
      }
      if (letzte && letzte.measured_at >= grenzDatum) continue

      const { data: client } = await supabase
        .from('clients').select('first_name, last_name').eq('id', clientId).maybeSingle()
      const clientName = client ? `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim() : clientId
      const heute = heuteBerlin()
      const schluessel = `doku-luecke-${clientId}-${heute.slice(0, 7)}`

      const erstellt = await aufgabeFallsNeu(supabase, organizationId, actorId, {
        schluessel,
        typ: 'vital_doku_luecke',
        titel: `Pflegedokumentation fehlt: ${clientName}`,
        beschreibung: letzte
          ? `Letzte Vitalwert-Messung am ${letzte.measured_at.slice(0, 10)} — seit mehr als ${DOKU_LUECKE_TAGE} Tagen keine neue Dokumentation.`
          : `Für diesen Klienten sind Grenzwerte hinterlegt, aber noch nie eine Vitalwert-Messung erfasst worden.`,
        clientId,
        verantwortlichId: pdlId,
        prioritaet: 'hoch',
      })
      if (erstellt) dokuLueckenAufgabenErstellt++
    }
  } catch (err) {
    fehler.push(`Dokumentationslücke: ${(err as Error).message}`)
  }

  return { alarmeGeprueft, alarmAufgabenErstellt, dokuLueckenGeprueft, dokuLueckenAufgabenErstellt, fehler }
}
