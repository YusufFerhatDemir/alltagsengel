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
import { logger } from '@/lib/logger'

const log = logger.child('pipeline-orchestrator')

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
  /** Steht in einem Zwischenzustand fest (siehe `stehtStill`). */
  haengengeblieben: boolean
}

export interface PipelineStatus {
  laeufe: PipelineLauf[]
  zusammenfassung: {
    gesamt: number
    wartendAufFreigabe: number
    wartendAufAntwort: number
    fehlerhaft: number
    abgeschlossen: number
    /**
     * Laeufe, die in einem Zwischenzustand stehengeblieben sind.
     *
     * Eigene Zahl statt einer Erweiterung von `fehlerhaft`: „fehlerhaft"
     * meint einen Lauf, den die Kasse oder die Validierung beanstandet
     * hat. Ein Stillstand ist etwas anderes — er braucht einen Anstoss,
     * keine Korrektur.
     */
    haengengeblieben: number
  }
  unzugeordneteRuecklaeufer: number
}

export interface PipelineVerarbeitungErgebnis {
  autoFreigegeben: number
  ruecklaeuferZugeordnet: number
  korrekturVorschlaegeErstellt: number
  fehler: string[]
}

// ── Stillstand in einem Zwischenzustand ─────────────────────────

/**
 * Die drei Zustaende, in denen ein Lauf nicht wartet, sondern LAEUFT.
 *
 * BEFUND (Block 73): sie zaehlten in keiner einzigen Kennzahl der
 * Uebersicht mit — nicht in `wartendAufFreigabe`, nicht in
 * `wartendAufAntwort`, nicht in `fehlerhaft`, nicht in `abgeschlossen`.
 * `naechsterSchrittText` kannte sie nicht und lieferte `null`, die Spalte
 * „Naechster Schritt" zeigte „—", und `laufStatusZuSchritt` ordnete sie
 * dem VORIGEN Meilenstein zu. Ein haengengebliebener Lauf sah damit aus
 * wie einer, der gerade eben gestartet ist — dauerhaft.
 *
 * Block 72 hat die Ursache im Export geschlossen: jeder Abbruch holt den
 * Lauf jetzt wieder heraus. Das deckt aber nur Abbrueche, bei denen
 * ueberhaupt noch Code laeuft. Ein abgebrochener Serverless-Aufruf, ein
 * Zeitlimit der Plattform, ein Neustart mitten im Export — dort greift
 * kein catch. Dagegen hilft nur, dass es auffaellt.
 */
export const ZWISCHENZUSTAENDE = [
  'validierung_laeuft', 'export_laeuft', 'uebermittlung_laeuft',
] as const

/**
 * Ab wann ein Zwischenzustand kein Vorgang mehr ist, sondern ein
 * Stillstand.
 *
 * Validierung, Export und Uebermittlung eines Monatslaufs dauern Sekunden
 * bis wenige Minuten. Eine halbe Stunde ist reichlich Luft fuer einen
 * langsamen Lauf und kurz genug, dass ein Stillstand am selben Arbeitstag
 * auffaellt.
 */
export const STILLSTAND_MINUTEN = 30

/**
 * Steht dieser Lauf still?
 *
 * Ohne Zeitstempel wird NICHT behauptet, er stehe still: „nicht wissen,
 * seit wann" ist keine Aussage ueber die Dauer.
 */
export function stehtStill(
  status: string,
  letzteAenderung: string | null | undefined,
  jetzt: Date = new Date(),
): boolean {
  if (!(ZWISCHENZUSTAENDE as readonly string[]).includes(status)) return false
  if (!letzteAenderung) return false
  const seit = new Date(letzteAenderung).getTime()
  if (Number.isNaN(seit)) return false
  return jetzt.getTime() - seit > STILLSTAND_MINUTEN * 60_000
}

/** Was zu tun ist, wenn ein Lauf in einem Zwischenzustand steht. */
const STILLSTAND_TEXT: Record<string, string> = {
  validierung_laeuft:
    'Steht seit über einer halben Stunde in der Validierung — Lauf öffnen und erneut validieren.',
  export_laeuft:
    'Steht seit über einer halben Stunde im Export — Lauf öffnen; er muss auf „Validierung fehlgeschlagen" zurück, bevor er neu exportiert werden kann.',
  uebermittlung_laeuft:
    'Steht seit über einer halben Stunde in der Übermittlung — Aufträge des Laufs prüfen und den Versand erneut anstoßen.',
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

function naechsterSchrittText(status: LaufStatus, stillstand: boolean): string | null {
  // Der Stillstand geht jedem regulaeren Text vor: er IST der naechste
  // Schritt.
  if (stillstand && STILLSTAND_TEXT[status]) return STILLSTAND_TEXT[status]
  switch (status) {
    // Laeuft gerade — und laeuft noch nicht zu lange.
    case 'validierung_laeuft': return 'Validierung läuft …'
    case 'export_laeuft': return 'Export läuft …'
    case 'uebermittlung_laeuft': return 'Übermittlung läuft …'
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
  const { data: laeufe, error: laeufeFehler } = await supabase
    .from('abrechnungslaeufe')
    .select('id, abrechnungsmonat, kostentraeger_name, kostentraeger_ik, status, updated_at')
    .eq('organization_id', organizationId)
    .not('status', 'in', '("storniert","abgeschlossen")')
    // abrechnungslaeufe hat kein created_at — der Anlagezeitpunkt heißt
    // erstellt_am. Mit dem falschen Namen scheiterte die Abfrage mit 42703
    // und die Pipeline-Übersicht war dauerhaft leer.
    .order('erstellt_am', { ascending: false })
    .limit(100)

  /*
   * FAIL-CLOSED: ein Lesefehler darf nicht als "nichts offen" durchgehen.
   *
   * Ohne diese Pruefung lieferte ein RLS-Treffer, ein Schema-Drift oder ein
   * Netzwerkfehler `laeufe: []` und eine Zusammenfassung aus lauter Nullen —
   * nicht unterscheidbar von einer wirklich leeren Pipeline. Genau so war
   * diese Uebersicht schon einmal wochenlang leer (der 42703-Kommentar
   * oben); repariert wurde damals der Spaltenname, nicht das Verschlucken.
   * Eine Kassenabrechnung, die aus dem Blick faellt, verliert Fristen.
   */
  if (laeufeFehler) {
    throw new Error(`Abrechnungslaeufe fuer die Pipeline nicht lesbar: ${laeufeFehler.message}`)
  }

  // Rückläufer-Counts pro Lauf
  const laufIds = (laeufe ?? []).map(l => l.id)
  const ruecklaeuferCounts: Record<string, number> = {}

  if (laufIds.length > 0) {
    const { data: rlCounts, error: rlFehler } = await supabase
      .from('dta_ruecklaeufer')
      .select('lauf_id')
      .eq('organization_id', organizationId)
      .in('lauf_id', laufIds)

    // Auch hier fail-closed: ein Lauf ohne sichtbare Ruecklaeufer sieht aus
    // wie ein Lauf ohne Beanstandung.
    if (rlFehler) {
      throw new Error(`Ruecklaeufer fuer die Pipeline nicht lesbar: ${rlFehler.message}`)
    }

    if (rlCounts) {
      for (const rc of rlCounts) {
        if (rc.lauf_id) {
          ruecklaeuferCounts[rc.lauf_id] = (ruecklaeuferCounts[rc.lauf_id] || 0) + 1
        }
      }
    }
  }

  // Unzugeordnete Rückläufer
  const { count: unzugeordnet, error: unzugeordnetFehler } = await supabase
    .from('dta_ruecklaeufer')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('lauf_id', null)
    .not('status', 'in', '("erledigt","duplikat")')

  if (unzugeordnetFehler) {
    throw new Error(
      `Unzugeordnete Ruecklaeufer nicht zaehlbar: ${unzugeordnetFehler.message}`,
    )
  }

  // EIN Zeitpunkt fuer die ganze Liste: sonst koennten zwei Laeufe mit
  // demselben Zeitstempel verschieden beurteilt werden.
  const jetztPruefung = new Date()
  const pipelineLaeufe: PipelineLauf[] = (laeufe ?? []).map(l => {
    const status = l.status as LaufStatus
    const haengengeblieben = stehtStill(status, l.updated_at, jetztPruefung)
    return {
      id: l.id,
      abrechnungsmonat: l.abrechnungsmonat,
      kostentraegerName: l.kostentraeger_name || '—',
      kostentraegerIk: l.kostentraeger_ik || '',
      status,
      aktuellerSchritt: laufStatusZuSchritt(status),
      naechsterSchritt: naechsterSchrittText(status, haengengeblieben),
      autoFreigabeMoeglich: status === 'geprueft' || status === 'bereit_zum_export',
      ruecklaeuferAnzahl: ruecklaeuferCounts[l.id] || 0,
      letzteAenderung: l.updated_at,
      haengengeblieben,
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
    haengengeblieben: pipelineLaeufe.filter(l => l.haengengeblieben).length,
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
      // `zugeordnet` ist die Zahl, die der Betrieb hinterher liest. Sie darf
      // nur zaehlen, was wirklich geschrieben wurde — sonst meldet der Lauf
      // „14 zugeordnet", waehrend die Rückläufer weiter offen in der
      // Arbeitsliste stehen.
      //
      // Geworfen wird nicht: das ist eine Schleife ueber viele Zeilen, und
      // eine davon darf den ganzen Lauf nicht abbrechen.
      const { data: markiert, error: markFehler } = await supabase
        .from('dta_ruecklaeufer')
        .update({
          lauf_id: lauf.id,
          status: 'zugeordnet',
          bearbeitet_von: actorId,
          bearbeitet_am: new Date().toISOString(),
        })
        .eq('id', rl.id)
        .eq('organization_id', organizationId)
        .select('id')

      if (markFehler || (markiert?.length ?? 0) === 0) {
        log.error('Rückläufer nicht als zugeordnet vermerkt — er bleibt offen', {
          ruecklaeuferId: rl.id, laufId: lauf.id, organizationId,
          errorMessage: markFehler?.message ?? 'keine Zeile getroffen',
        })
        continue
      }

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
    const { data: zuFreigeben, error: zuFreigebenFehler } = await supabase
      .from('abrechnungslaeufe')
      .select('id')
      .eq('organization_id', organizationId)
      .in('status', ['geprueft', 'bereit_zum_export'])
      .limit(20)

    // Verworfen war dieser Fehler nicht von „nichts freizugeben" zu
    // unterscheiden: der Lauf meldete Erfolg mit leerer Fehlerliste,
    // waehrend die Auto-Freigabe gar nicht stattgefunden hatte.
    if (zuFreigebenFehler) {
      fehler.push(`Auto-Freigabe übersprungen — Läufe nicht lesbar: ${zuFreigebenFehler.message}`)
    }

    for (const lauf of zuFreigeben ?? []) {
      try {
        /*
         * Der Status gehoert in die WHERE-Bedingung, nicht nur in die
         * Kandidatenabfrage.
         *
         * Zwischen Lesen und Schreiben liegt ein Zeitfenster. Traf das
         * Update den Lauf allein ueber seine ID, gaben zwei parallele
         * Pipeline-Laeufe (Tages-Cron plus Klick auf der Oberflaeche)
         * denselben Lauf zweimal frei — und ein Lauf, den jemand
         * zwischenzeitlich von Hand storniert hatte, wurde ueberschrieben
         * und ging an die Kasse.
         *
         * `.select('id')` liefert die tatsaechlich getroffenen Zeilen. Nur
         * die werden gezaehlt: wer das Rennen verliert, hat nichts
         * freigegeben und darf das auch nicht melden.
         */
        const { data: getroffen, error: freigabeFehler } = await supabase
          .from('abrechnungslaeufe')
          .update({
            status: 'freigegeben',
            freigegeben_von: actorId,
            freigegeben_am: new Date().toISOString(),
          })
          .eq('id', lauf.id)
          .eq('organization_id', organizationId)
          .in('status', ['geprueft', 'bereit_zum_export'])
          .select('id')

        if (freigabeFehler) {
          fehler.push(`Auto-Freigabe Lauf ${lauf.id}: ${freigabeFehler.message}`)
          continue
        }
        if (!getroffen?.length) {
          // Kein Fehler, aber auch keine Freigabe: der Lauf hat den Status
          // inzwischen gewechselt. Still weiterzaehlen waere eine Luege.
          fehler.push(`Auto-Freigabe Lauf ${lauf.id}: Status inzwischen geaendert, nicht freigegeben`)
          continue
        }

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
  const { data: abgelehnteRl, error: abgelehnteFehler } = await supabase
    .from('dta_ruecklaeufer')
    .select('id, lauf_id')
    .eq('organization_id', organizationId)
    .in('status', ['abgelehnt', 'teilweise_abgelehnt'])
    .not('lauf_id', 'is', null)
    .limit(20)

  // Dasselbe eine Stufe spaeter: ohne Riegel sah ein Tag, an dem die
  // Ruecklaeufer nicht lesbar waren, aus wie ein Tag ohne Ablehnungen —
  // und fuer jede abgelehnte Lieferung entstand kein Korrekturvorschlag.
  if (abgelehnteFehler) {
    fehler.push(`Korrekturvorschläge übersprungen — abgelehnte Rückläufer nicht lesbar: ${abgelehnteFehler.message}`)
  }

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
      // Markiere den Rückläufer als korrektur_erforderlich. Auch hier gilt:
      // gezaehlt wird nur, was angekommen ist.
      const { data: markiert, error: markFehler } = await supabase
        .from('dta_ruecklaeufer')
        .update({ status: 'korrektur_erforderlich' })
        .eq('id', rl.id)
        .eq('organization_id', organizationId)
        .select('id')

      if (markFehler || (markiert?.length ?? 0) === 0) {
        log.error('Rückläufer nicht als korrekturbedürftig vermerkt', {
          ruecklaeuferId: rl.id, organizationId,
          errorMessage: markFehler?.message ?? 'keine Zeile getroffen',
        })
        continue
      }

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
