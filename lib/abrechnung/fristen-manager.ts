/**
 * Fristen-Manager — Überwacht Fristen für Rückläufer und eskaliert automatisch
 *
 * Frist-Definitionen:
 *   technischer_fehler:      2 Tage → Priorität kritisch
 *   fachlicher_fehler:       5 Tage → Priorität hoch
 *   abgelehnt:               3 Tage → Priorität kritisch
 *   teilweise_abgelehnt:     5 Tage → Priorität hoch
 *   korrektur_erforderlich:  3 Tage → Priorität kritisch
 *   wiedervorlage:           variabel
 *
 * Eskalationsstufen:
 *   0 = offen (Frist läuft)
 *   1 = mittel → hoch (1. Eskalation, +50% Fristüberschreitung)
 *   2 = hoch → kritisch (2. Eskalation, +100% Fristüberschreitung)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../billing/core/audit'
import { datumBerlin, heuteBerlin } from '@/lib/utils/timezone';
import { logger } from '@/lib/logger';
const log = logger.child('fristen-manager');

// ── Types ───────────────────────────────────────────────────────

export interface FristDefinition {
  typ: string
  tage: number
  beschreibung: string
}

export interface FristEintrag {
  id: string
  aufgabeId: string | null
  ruecklaeuferId: string | null
  fristTyp: string
  faelligAm: string
  eskaliertAm: string | null
  eskalationsstufe: number
  status: 'offen' | 'eskaliert' | 'erledigt' | 'abgelaufen'
  notiz: string | null
  createdAt: string
}

export interface FristenUebersicht {
  gesamt: number
  offen: number
  eskaliert: number
  ueberfaellig: number
  fristen: FristEintrag[]
}

export interface EskalationsErgebnis {
  eskaliert: number
  abgelaufen: number
  fehler: string[]
}

// ── Frist-Definitionen ──────────────────────────────────────────

export const FRIST_DEFINITIONEN: FristDefinition[] = [
  { typ: 'technischer_fehler', tage: 2, beschreibung: 'Technischer Rückläufer muss innerhalb von 2 Tagen korrigiert werden' },
  { typ: 'fachlicher_fehler', tage: 5, beschreibung: 'Fachlicher Fehler muss innerhalb von 5 Tagen bearbeitet werden' },
  { typ: 'abgelehnt', tage: 3, beschreibung: 'Abgelehnte Abrechnung muss in 3 Tagen überprüft werden' },
  { typ: 'teilweise_abgelehnt', tage: 5, beschreibung: 'Teilweise abgelehnte Positionen in 5 Tagen prüfen' },
  { typ: 'korrektur_erforderlich', tage: 3, beschreibung: 'Korrektur muss in 3 Tagen erstellt werden' },
  { typ: 'wiedervorlage', tage: 7, beschreibung: 'Standardfrist für Wiedervorlagen' },
  { typ: 'eskalation', tage: 1, beschreibung: 'Eskalationsfrist' },
]

export function fristFuerTyp(typ: string): number {
  const def = FRIST_DEFINITIONEN.find(d => d.typ === typ)
  return def?.tage ?? 7
}

function faelligkeitsDatum(tage: number, ab: Date = new Date()): string {
  const d = new Date(ab)
  d.setDate(d.getDate() + tage)
  return datumBerlin(d)
}

// ── Frist erstellen ─────────────────────────────────────────────

export async function erstelleFrist(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    aufgabeId?: string
    ruecklaeuferId?: string
    fristTyp: string
    faelligAm?: string
    notiz?: string
    actorId: string
  },
): Promise<string | null> {
  const faelligAm = params.faelligAm || faelligkeitsDatum(fristFuerTyp(params.fristTyp))

  const { data, error } = await supabase
    .from('billing_fristen')
    .insert({
      organization_id: params.organizationId,
      aufgabe_id: params.aufgabeId || null,
      ruecklaeufer_id: params.ruecklaeuferId || null,
      frist_typ: params.fristTyp,
      faellig_am: faelligAm,
      eskalationsstufe: 0,
      status: 'offen',
      notiz: params.notiz || null,
    })
    .select('id')
    .single()

  if (error || !data) {
    log.error('Frist erstellen fehlgeschlagen', { errorMessage: error?.message })
    return null
  }

  await logBillingAction(supabase, {
    entityType: 'billing_fristen',
    organizationId: params.organizationId,
    entityId: data.id,
    action: 'frist_erstellt',
    newState: {
      frist_typ: params.fristTyp,
      faellig_am: faelligAm,
      ruecklaeufer_id: params.ruecklaeuferId,
      aufgabe_id: params.aufgabeId,
    },
    actorId: params.actorId,
  }).catch(err => log.error('Audit fehlgeschlagen', { errorMessage: String(err) }))

  return data.id
}

// ── Wiedervorlage erstellen ─────────────────────────────────────

export async function erstelleWiedervorlage(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    aufgabeId?: string
    ruecklaeuferId?: string
    tage: number
    notiz?: string
    actorId: string
  },
): Promise<string | null> {
  return erstelleFrist(supabase, {
    organizationId: params.organizationId,
    aufgabeId: params.aufgabeId,
    ruecklaeuferId: params.ruecklaeuferId,
    fristTyp: 'wiedervorlage',
    faelligAm: faelligkeitsDatum(params.tage),
    notiz: params.notiz,
    actorId: params.actorId,
  })
}

// ── Überfällige Fristen prüfen ──────────────────────────────────

export async function pruefeUeberfaelligeFristen(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<FristenUebersicht> {
  const heute = heuteBerlin()

  const { data: fristen } = await supabase
    .from('billing_fristen')
    .select('*')
    .eq('organization_id', organizationId)
    .in('status', ['offen', 'eskaliert'])
    .order('faellig_am', { ascending: true })
    .limit(200)

  const eintraege: FristEintrag[] = (fristen ?? []).map(f => ({
    id: f.id,
    aufgabeId: f.aufgabe_id,
    ruecklaeuferId: f.ruecklaeufer_id,
    fristTyp: f.frist_typ,
    faelligAm: f.faellig_am,
    eskaliertAm: f.eskaliert_am,
    eskalationsstufe: f.eskalationsstufe,
    status: f.status,
    notiz: f.notiz,
    createdAt: f.created_at,
  }))

  const ueberfaellig = eintraege.filter(f => f.faelligAm < heute).length

  return {
    gesamt: eintraege.length,
    offen: eintraege.filter(f => f.status === 'offen').length,
    eskaliert: eintraege.filter(f => f.status === 'eskaliert').length,
    ueberfaellig,
    fristen: eintraege,
  }
}

// ── Eskalation durchführen ──────────────────────────────────────

const PRIORITAET_ESKALATION: Record<string, string> = {
  niedrig: 'mittel',
  mittel: 'hoch',
  hoch: 'kritisch',
  kritisch: 'kritisch',
}

export async function escaliereUeberfaellige(
  supabase: SupabaseClient,
  organizationId: string,
  actorId: string,
): Promise<EskalationsErgebnis> {
  const heute = heuteBerlin()
  const jetzt = new Date().toISOString()
  const fehler: string[] = []
  let eskaliert = 0
  let abgelaufen = 0

  // Alle überfälligen offenen Fristen
  const { data: ueberfaellige } = await supabase
    .from('billing_fristen')
    .select('id, aufgabe_id, ruecklaeufer_id, frist_typ, eskalationsstufe, faellig_am')
    .eq('organization_id', organizationId)
    .in('status', ['offen', 'eskaliert'])
    .lt('faellig_am', heute)
    .limit(100)

  for (const frist of ueberfaellige ?? []) {
    try {
      const neueStufe = frist.eskalationsstufe + 1

      if (neueStufe > 2) {
        // Maximale Eskalation erreicht → abgelaufen
        await supabase
          .from('billing_fristen')
          .update({
            status: 'abgelaufen',
            eskaliert_am: jetzt,
            eskalationsstufe: neueStufe,
          })
          .eq('id', frist.id)
          .eq('organization_id', organizationId)
        abgelaufen++
        continue
      }

      // Frist eskalieren
      await supabase
        .from('billing_fristen')
        .update({
          status: 'eskaliert',
          eskaliert_am: jetzt,
          eskalationsstufe: neueStufe,
        })
        .eq('id', frist.id)
        .eq('organization_id', organizationId)

      // Verknüpfte Aufgabe eskalieren
      if (frist.aufgabe_id) {
        const { data: aufgabe } = await supabase
          .from('ops_aufgaben')
          .select('id, prioritaet')
          .eq('id', frist.aufgabe_id)
          .eq('organization_id', organizationId)
          .maybeSingle()

        if (aufgabe) {
          const neuePrio = PRIORITAET_ESKALATION[aufgabe.prioritaet] || 'kritisch'
          if (neuePrio !== aufgabe.prioritaet) {
            await supabase
              .from('ops_aufgaben')
              .update({ prioritaet: neuePrio })
              .eq('id', aufgabe.id)
              .eq('organization_id', organizationId)
          }
        }
      }

      await logBillingAction(supabase, {
        entityType: 'billing_fristen',
        organizationId,
        entityId: frist.id,
        action: 'frist_eskaliert',
        newState: {
          eskalationsstufe: neueStufe,
          aufgabe_id: frist.aufgabe_id,
          ruecklaeufer_id: frist.ruecklaeufer_id,
        },
        actorId,
      }).catch((err) => log.warnWithException('Audit-Log fehlgeschlagen (non-blocking)', err, { scope: 'Fristen' }))

      eskaliert++
    } catch (err) {
      fehler.push(`Frist ${frist.id}: ${(err as Error).message}`)
    }
  }

  return { eskaliert, abgelaufen, fehler }
}

// ── Frist als erledigt markieren ────────────────────────────────

export async function markiereFristErledigt(
  supabase: SupabaseClient,
  fristId: string,
  organizationId: string,
  actorId: string,
): Promise<void> {
  await supabase
    .from('billing_fristen')
    .update({ status: 'erledigt' })
    .eq('id', fristId)
    .eq('organization_id', organizationId)

  await logBillingAction(supabase, {
    entityType: 'billing_fristen',
    organizationId,
    entityId: fristId,
    action: 'frist_erledigt',
    actorId,
  }).catch((err) => log.warnWithException('Audit-Log fehlgeschlagen (non-blocking)', err, { scope: 'Fristen' }))
}
