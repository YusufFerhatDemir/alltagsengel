/**
 * Pipeline-Orchestrator — Reduziert manuelle Klicks im DTA-Workflow
 *
 * Stellt die Abrechnung als Pipeline dar:
 *   Leistung → Rechnung → EDIFACT → Versand → Rückläufer → Korrektur → Zahlung
 *
 * Funktionen:
 *   - pruefeUndVerarbeitePipeline(): prüft offene Läufe + nächste Schritte
 *   - holePipelineStatus(): Dashboard-Übersicht
 *   - ordneRuecklaeuferAutomatischZu(): versucht Rückläufer einem Lauf zuzuordnen
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../billing/core/audit'
import type { LaufStatus } from './kassenabrechnung-engine'

// ── Types ───────────────────────────────────────────────────────

export type PipelineSchritt =
  | 'erstellt' | 'geprueft' | 'freigegeben'
  | 'exportiert' | 'uebermittelt' | 'quittiert'
  | 'antwort_eingegangen' | 'korrektur_noetig' | 'abgeschlossen'

export interface PipelineLauf {
  id: string
  abrechnungsmonat: string
  kostentraegerName: string
  kostentraegerIk: string
  status: LaufStatus
  aktuellerSchritt: PipelineSchritt
  naechsterSchritt: string | null
  autoFreigabeMoeglich: boolean
  ruecklaeuferAnzahl: number
  letzteAenderung: string
}

export interface PipelineStatus {
  laeufe: PipelineLauf[]
  zusammenfassung: {
    gesamt: number
    wartendAufFreigabe: number
    wartendAufAntwort: number
    fehlerhaft: number
    abgeschlossen: number
  }
  unzugeordneteRuecklaeufer: number
}

export interface PipelineVerarbeitungErgebnis {
  autoFreigegeben: number
  ruecklaeuferZugeordnet: number
  korrekturVorschlaegeErstellt: number
  fehler: string[]
}

// ── Schritt-Mapping ─────────────────────────────────────────────

function laufStatusZuSchritt(status: LaufStatus): PipelineSchritt {
  switch (status) {
    case 'erstellt':
    case 'validierung_laeuft':
    case 'validierung_fehlgeschlagen':
      return 'erstellt'
    case 'geprueft':
    case 'bereit_zum_export':
      return 'geprueft'
    case 'freigegeben':
    case 'export_laeuft':
      return 'freigegeben'
    case 'exportiert':
    case 'bereit_zur_uebermittlung':
    case 'uebermittlung_laeuft':
      return 'exportiert'
    case 'uebermittelt':
      return 'uebermittelt'
    case 'quittiert':
      return 'quittiert'
    case 'angenommen':
    case 'teilweise_abgelehnt':
    case 'abgelehnt':
      return 'antwort_eingegangen'
    case 'korrektur_erforderlich':
    case 'korrigiert':
      return 'korrektur_noetig'
    case 'abgeschlossen':
    case 'storniert':
      return 'abgeschlossen'
    default:
      return 'erstellt'
  }
}

function naechsterSchrittText(status: LaufStatus): string | null {
  switch (status) {
    case 'erstellt': return 'Validierung starten'
    case 'validierung_fehlgeschlagen': return 'Fehler korrigieren und erneut validieren'
    case 'geprueft': return 'Freigabe erteilen'
    case 'bereit_zum_export': return 'Freigabe erteilen'
    case 'freigegeben': return 'EDIFACT exportieren'
    case 'exportiert': return 'Über DAKOTA versenden'
    case 'bereit_zur_uebermittlung': return 'Über DAKOTA versenden'
    case 'uebermittelt': return 'Auf Quittung warten'
    case 'quittiert': return 'Auf Rückmeldung der Kasse warten'
    case 'angenommen': return 'Zahlungseingang prüfen'
    case 'teilweise_abgelehnt': return 'Korrekturlauf erstellen'
    case 'abgelehnt': return 'Korrekturlauf erstellen'
    case 'korrektur_erforderlich': return 'Korrektur durchführen'
    case 'abgeschlossen': return null
    case 'storniert': return null
    default: return null
  }
}

// ── Pipeline-Status holen ───────────────────────────────────────

export async function holePipelineStatus(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<PipelineStatus> {
  // Alle aktiven Läufe (nicht storniert, nicht abgeschlossen)
  const { data: laeufe } = await supabase
    .from('abrechnungslaeufe')
    .select('id, abrechnungsmonat, kostentraeger_name, kostentraeger_ik, status, updated_at')
    .eq('organization_id', organizationId)
    .not('status', 'in', '("storniert","abgeschlossen")')
    // abrechnungslaeufe hat kein created_at — der Anlagezeitpunkt heißt
    // erstellt_am. Mit dem falschen Namen scheiterte die Abfrage mit 42703
    // und die Pipeline-Übersicht war dauerhaft leer.
    .order('erstellt_am', { ascending: false })
    .limit(100)

  // Rückläufer-Counts pro Lauf
  const laufIds = (laeufe ?? []).map(l => l.id)
  let ruecklaeuferCounts: Record<string, number> = {}

  if (laufIds.length > 0) {
    const { data: rlCounts } = await supabase
      .from('dta_ruecklaeufer')
      .select('lauf_id')
      .eq('organization_id', organizationId)
      .in('lauf_id', laufIds)

    if (rlCounts) {
      for (const rc of rlCounts) {
        if (rc.lauf_id) {
          ruecklaeuferCounts[rc.lauf_id] = (ruecklaeuferCounts[rc.lauf_id] || 0) + 1
        }
      }
    }
  }

  // Unzugeordnete Rückläufer
  const { count: unzugeordnet } = await supabase
    .from('dta_ruecklaeufer')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('lauf_id', null)
    .not('status', 'in', '("erledigt","duplikat")')

  const pipelineLaeufe: PipelineLauf[] = (laeufe ?? []).map(l => {
    const status = l.status as LaufStatus
    return {
      id: l.id,
      abrechnungsmonat: l.abrechnungsmonat,
      kostentraegerName: l.kostentraeger_name || '—',
      kostentraegerIk: l.kostentraeger_ik || '',
      status,
      aktuellerSchritt: laufStatusZuSchritt(status),
      naechsterSchritt: naechsterSchrittText(status),
      autoFreigabeMoeglich: status === 'geprueft' || status === 'bereit_zum_export',
      ruecklaeuferAnzahl: ruecklaeuferCounts[l.id] || 0,
      letzteAenderung: l.updated_at,
    }
  })

  const zusammenfassung = {
    gesamt: pipelineLaeufe.length,
    wartendAufFreigabe: pipelineLaeufe.filter(l =>
      l.status === 'geprueft' || l.status === 'bereit_zum_export',
    ).length,
    wartendAufAntwort: pipelineLaeufe.filter(l =>
      ['uebermittelt', 'quittiert'].includes(l.status),
    ).length,
    fehlerhaft: pipelineLaeufe.filter(l =>
      ['validierung_fehlgeschlagen', 'teilweise_abgelehnt', 'abgelehnt', 'korrektur_erforderlich'].includes(l.status),
    ).length,
    abgeschlossen: pipelineLaeufe.filter(l => l.status === 'angenommen').length,
  }

  return {
    laeufe: pipelineLaeufe,
    zusammenfassung,
    unzugeordneteRuecklaeufer: unzugeordnet ?? 0,
  }
}

// ── Automatische Rückläufer-Zuordnung ───────────────────────────

async function ordneRuecklaeuferAutomatischZu(
  supabase: SupabaseClient,
  organizationId: string,
  actorId: string,
): Promise<number> {
  // Finde unzugeordnete Rückläufer mit Kostenträger-IK
  const { data: offene } = await supabase
    .from('dta_ruecklaeufer')
    .select('id, kostentraeger_ik, created_at')
    .eq('organization_id', organizationId)
    .is('lauf_id', null)
    .not('status', 'in', '("erledigt","duplikat")')
    .not('kostentraeger_ik', 'is', null)
    .limit(50)

  if (!offene?.length) return 0

  let zugeordnet = 0

  for (const rl of offene) {
    if (!rl.kostentraeger_ik) continue

    // Suche den neuesten passenden Lauf für diesen Kostenträger
    const { data: lauf } = await supabase
      .from('abrechnungslaeufe')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('kostentraeger_ik', rl.kostentraeger_ik)
      .in('status', [
        'uebermittelt', 'quittiert',
        'angenommen', 'teilweise_abgelehnt', 'abgelehnt',
        'korrektur_erforderlich',
      ])
      .order('erstellt_am', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lauf) {
      await supabase
        .from('dta_ruecklaeufer')
        .update({
          lauf_id: lauf.id,
          status: 'zugeordnet',
          bearbeitet_von: actorId,
          bearbeitet_am: new Date().toISOString(),
        })
        .eq('id', rl.id)
        .eq('organization_id', organizationId)

      zugeordnet++
    }
  }

  return zugeordnet
}

// ── Pipeline verarbeiten ────────────────────────────────────────

export async function pruefeUndVerarbeitePipeline(
  supabase: SupabaseClient,
  organizationId: string,
  actorId: string,
  optionen?: { autoFreigabe?: boolean },
): Promise<PipelineVerarbeitungErgebnis> {
  const fehler: string[] = []
  let autoFreigegeben = 0
  let korrekturVorschlaegeErstellt = 0

  // 1. Automatische Rückläufer-Zuordnung
  const ruecklaeuferZugeordnet = await ordneRuecklaeuferAutomatischZu(
    supabase, organizationId, actorId,
  )

  // 2. Auto-Freigabe (wenn aktiviert)
  if (optionen?.autoFreigabe) {
    const { data: zuFreigeben } = await supabase
      .from('abrechnungslaeufe')
      .select('id')
      .eq('organization_id', organizationId)
      .in('status', ['geprueft', 'bereit_zum_export'])
      .limit(20)

    for (const lauf of zuFreigeben ?? []) {
      try {
        await supabase
          .from('abrechnungslaeufe')
          .update({
            status: 'freigegeben',
            freigegeben_von: actorId,
            freigegeben_am: new Date().toISOString(),
          })
          .eq('id', lauf.id)
          .eq('organization_id', organizationId)

        await logBillingAction(supabase, {
          entityType: 'dta_lauf',
          organizationId,
          entityId: lauf.id,
          action: 'pipeline_auto_freigabe',
          newState: { status: 'freigegeben' },
          actorId,
        })

        autoFreigegeben++
      } catch (err) {
        fehler.push(`Auto-Freigabe Lauf ${lauf.id}: ${(err as Error).message}`)
      }
    }
  }

  // 3. Korrekturvorschlag für abgelehnte Läufe
  const { data: abgelehnteRl } = await supabase
    .from('dta_ruecklaeufer')
    .select('id, lauf_id')
    .eq('organization_id', organizationId)
    .in('status', ['abgelehnt', 'teilweise_abgelehnt'])
    .not('lauf_id', 'is', null)
    .limit(20)

  for (const rl of abgelehnteRl ?? []) {
    if (!rl.lauf_id) continue

    // Prüfe ob bereits ein Korrekturlauf existiert
    const { data: bestehendeKorrektur } = await supabase
      .from('dta_korrekturlaeufe')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('original_lauf_id', rl.lauf_id)
      .limit(1)
      .maybeSingle()

    if (!bestehendeKorrektur) {
      // Markiere den Rückläufer als korrektur_erforderlich
      await supabase
        .from('dta_ruecklaeufer')
        .update({ status: 'korrektur_erforderlich' })
        .eq('id', rl.id)
        .eq('organization_id', organizationId)

      korrekturVorschlaegeErstellt++
    }
  }

  return {
    autoFreigegeben,
    ruecklaeuferZugeordnet,
    korrekturVorschlaegeErstellt,
    fehler,
  }
}
