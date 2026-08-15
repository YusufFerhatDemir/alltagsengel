/**
 * Kette 3 — Frist überschritten → Eskalation + Aufgabenerstellung.
 *
 * `lib/abrechnung/fristen-manager.ts::escaliereUeberfaellige()` eskaliert
 * bereits überfällige Abrechnungsfristen (Rückläufer/Wiedervorlagen). Für
 * abgelaufene Qualifikationen, Verordnungen, Schulungen und Dokumente
 * existierte dagegen keine Eskalation — sie tauchten nur als "überfällig"
 * im Fristen-Dashboard auf, ohne dass daraus eine Aufgabe entstand.
 *
 * Abgelaufene Qualifikationen blockieren den Einsatz bereits reaktiv über
 * `lib/personal/einsatzfreigabe.ts::pruefeEinsatzfreigabe()` (bei jeder
 * neuen Zuordnung live geprüft) — diese Kette ergänzt die AKTIVE Meldung an
 * die PDL, damit niemand erst beim nächsten Einsatzversuch davon erfährt.
 *
 * DUBLETTENSCHUTZ: höchstens eine offene Aufgabe pro (Entitätstyp, Id) —
 * Schlüssel `metadata->>frist_entitaet_id`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sammleFristen, type FristItem, type FristEntitaetTyp } from './fristen-sammler'
import { ersterPdlDerOrg } from './org-empfaenger'
import { logAuditEvent } from '@/lib/audit-log'
import type { AufgabenKategorie } from '@/lib/ops/types'

const KATEGORIE: Record<FristEntitaetTyp, AufgabenKategorie> = {
  qualifikation: 'qualifikation',
  verordnung: 'verordnung',
  genehmigung: 'verordnung',
  schulung: 'qualifikation',
  dokument: 'dokument',
  abrechnungsfrist: 'abrechnung',
  probezeit: 'mitarbeiter',
  mitarbeitergespraech: 'mitarbeiter',
  arbeitszeit_verstoss: 'mitarbeiter',
  fem_ueberwachung: 'pflege',
}

export interface EskalationFristenErgebnis {
  geprueft: number
  aufgabenErstellt: number
  fehler: string[]
}

/**
 * Erstellt Eskalations-Aufgaben für überfällige Qualifikationen,
 * Verordnungen/Genehmigungen, Schulungen und Dokumente. Abrechnungsfristen
 * bleiben bewusst ausgeschlossen — die laufen bereits über
 * `escaliereUeberfaellige()` in fristen-manager.ts.
 */
export async function eskaliereAbgelaufeneFristen(
  supabase: SupabaseClient,
  organizationId: string,
  actorId: string,
): Promise<EskalationFristenErgebnis> {
  const { fristen } = await sammleFristen(supabase, organizationId)
  const ueberfaellig = fristen.filter(
    f => f.dringlichkeit === 'ueberfaellig' && f.entitaetTyp !== 'abrechnungsfrist',
  )

  const fehler: string[] = []
  let aufgabenErstellt = 0
  const pdlId = await ersterPdlDerOrg(supabase, organizationId)

  for (const item of ueberfaellig) {
    try {
      const erstellt = await erstelleFristEskalationsAufgabe(supabase, organizationId, actorId, item, pdlId)
      if (erstellt) aufgabenErstellt++
    } catch (err) {
      fehler.push(`${item.id}: ${(err as Error).message}`)
    }
  }

  return { geprueft: ueberfaellig.length, aufgabenErstellt, fehler }
}

async function erstelleFristEskalationsAufgabe(
  supabase: SupabaseClient,
  organizationId: string,
  actorId: string,
  item: FristItem,
  verantwortlichId: string | null,
): Promise<boolean> {
  const { data: vorhanden, error: dupErr } = await supabase
    .from('ops_aufgaben')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('metadata->>frist_entitaet_id', item.entitaetId)
    .eq('metadata->>frist_entitaet_typ', item.entitaetTyp)
    .limit(1)
    .maybeSingle()

  if (dupErr) {
    console.error(`[eskalation-fristen] Dublettenprüfung fehlgeschlagen: ${dupErr.message}`)
    throw new Error(`Dublettenprüfung fehlgeschlagen: ${dupErr.message}`)
  }
  if (vorhanden) return false

  const titel = `Abgelaufen: ${item.titel} (${item.bezug})`
  const beschreibung = [
    item.beschreibung,
    `Betroffen: ${item.bezug}`,
    `Fällig war: ${item.faelligAm} (${Math.abs(item.tageVerbleibend)} Tage überfällig)`,
    item.entitaetTyp === 'qualifikation'
      ? 'Der Einsatz dieses Mitarbeiters wird bei neuen Zuordnungen automatisch blockiert, solange die Qualifikation nicht erneuert ist.'
      : null,
  ].filter((v): v is string => v !== null).join('\n')

  const { data: aufgabe, error } = await supabase
    .from('ops_aufgaben')
    .insert({
      organization_id: organizationId,
      titel,
      beschreibung,
      kategorie: KATEGORIE[item.entitaetTyp],
      prioritaet: 'kritisch',
      status: 'offen',
      verantwortlich_id: verantwortlichId,
      erstellt_von: actorId,
      faellig_am: new Date().toISOString().slice(0, 10),
      client_id: item.clientId,
      caregiver_id: item.caregiverId,
      tags: ['frist_abgelaufen', item.entitaetTyp],
      metadata: {
        frist_entitaet_id: item.entitaetId,
        frist_entitaet_typ: item.entitaetTyp,
        faellig_am: item.faelligAm,
        quelle: 'automatisch_frist_eskalation',
      },
    })
    .select('id')
    .single()

  if (error || !aufgabe) {
    console.error(`[eskalation-fristen] Anlage fehlgeschlagen: ${error?.message}`)
    throw new Error(error?.message ?? 'Aufgabe konnte nicht angelegt werden')
  }

  await logAuditEvent({
    action: 'create',
    actorId,
    organizationId,
    entityType: 'ops_aufgabe',
    entityId: aufgabe.id,
    details: { grund: 'frist_abgelaufen', frist_entitaet_typ: item.entitaetTyp, frist_entitaet_id: item.entitaetId },
  }).catch(err => console.error(`[eskalation-fristen] Audit fehlgeschlagen: ${err}`))

  return true
}
