// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS_INPUT_REQUIRED — was fehlt, und was trotzdem läuft
//
// PROBLEM, DAS DIESE DATEI LÖST
// Es fehlen Angaben, die kein Code sich ausdenken darf: die Berater- und
// Mandantennummer der Steuerkanzlei, die Preise für ChairMatch Protect. Sie
// stehen in Berichten — und Berichte veralten, werden nicht gelesen und
// beantworten die eine Frage nicht, die im Erstbetrieb zählt:
//
//   „Blockiert das den ersten echten Rechnungsversand?"
//
// Für DATEV und ChairMatch lautet die Antwort NEIN, und das ist keine
// Meinung, sondern eine Eigenschaft des Codes: der Rechnungsweg
// (Festschreibung → PDF → Resend → invoice_email_log) liest weder
// `organizations.datev_config` noch irgendeine ChairMatch-Tabelle — die
// liegen in einem anderen Supabase-Projekt und einem anderen Repo.
//
// ── WARUM DAS EIN MODUL IST UND KEIN ABSATZ IM BERICHT ─────────────────────
// Weil die Unabhängigkeit prüfbar bleiben muss. `__tests__/pilot/
// business-inputs.test.ts` liest die Dateien des Rechnungswegs und stellt
// fest, dass keine davon DATEV oder ChairMatch importiert. Baut jemand
// morgen eine Kontenprüfung in die Festschreibung ein, wird dieser Test rot
// — und die Behauptung „technisch unabhängig" fällt auf, bevor sie falsch
// im nächsten Handoff steht.
//
// ── NICHTS WIRD ERFUNDEN ───────────────────────────────────────────────────
// ‼️ Dieses Modul enthält KEINE Beraternummer, KEINE Mandantennummer und
// KEINEN Preis. ‼️ Es enthält die Liste dessen, was fehlt, wer es liefert
// und was ohne die Angabe geschieht. Ein Standardwert ist etwas anderes als
// eine Erfindung: D3–D6 tragen Werte aus dem veröffentlichten SKR03/SKR04,
// unbestätigt — das steht bei jedem Punkt dabei.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { BERATER_VORGABE_ERFORDERLICH } from '@/lib/billing/datev/datev-validator'
import { getDatevConfig, isDatevConfigComplete } from '@/lib/billing/datev/datev-config'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type EingabeBereich = 'datev' | 'chairmatch'

export type EingabeSchwere =
  /** Ohne diese Angabe bricht der betroffene Vorgang ab. */
  | 'blockierend'
  /** Es läuft mit einem unbestätigten Standardwert weiter. */
  | 'unbestaetigter_standard'
  /** Eine Entscheidung, die getroffen werden muss — kein Standardwert möglich. */
  | 'entscheidung'

export interface BusinessInput {
  /** Kennung wie im Handoff (D1, D2, C1 …) — damit Bericht und Code dieselbe Sprache sprechen. */
  id: string
  bereich: EingabeBereich
  frage: string
  /** Wer die Angabe liefert. Nie ein Name, immer eine Rolle oder Stelle. */
  quelle: string
  schwere: EingabeSchwere
  /** Was passiert, solange die Angabe fehlt. */
  wirkungOffen: string
  /**
   * Was von dieser Angabe NACHWEISLICH nicht abhängt.
   * Der Satz, der verhindert, dass eine offene Kanzleifrage den
   * Rechnungspilot aufhält.
   */
  blockiertNicht: string
}

/**
 * Was der Alltagsengel-Rechnungspilot braucht — und was nicht.
 *
 * Die Liste ist der Prüfgegenstand des Unabhängigkeitstests: jeder Eintrag
 * unter `unabhaengigVon` muss ein Bereich sein, den keine Datei des
 * Rechnungswegs importiert.
 */
export const RECHNUNGSPILOT_ABHAENGIGKEITEN = {
  /** Module, die der erste echte Rechnungsversand durchläuft. */
  weg: [
    'lib/billing/core/invoice-engine.ts',
    'lib/billing/preflight/rechnung-preflight.ts',
    'lib/pilot/rechnung-pilot.ts',
    'lib/billing/versand/rechnung-versand.ts',
    'lib/pdf/rechnung-paket.ts',
  ],
  /** Bereiche, von denen dieser Weg NICHT abhängt. */
  unabhaengigVon: ['datev', 'chairmatch'] as EingabeBereich[],
  /** Import-Kennzeichen, die auf dem Weg nicht vorkommen dürfen. */
  verboteneImporte: ['billing/datev', 'chairmatch', 'protect_pricing', 'compliance_plans'],
} as const

// ---------------------------------------------------------------------------
// Das Register
// ---------------------------------------------------------------------------

/**
 * DATEV — Vorgaben der Steuerkanzlei.
 *
 * D1/D2 stehen zusätzlich in `BERATER_VORGABE_ERFORDERLICH` des Validators;
 * der Test hält beide Listen aneinander, damit sie nicht auseinanderlaufen.
 */
export const DATEV_EINGABEN: readonly BusinessInput[] = [
  {
    id: 'D1',
    bereich: 'datev',
    frage: 'Beraternummer der DATEV-Kanzlei?',
    quelle: 'Steuerkanzlei',
    schwere: 'blockierend',
    wirkungOffen:
      'erstelleDatevExport() bricht ab, bevor irgendetwas erzeugt wird. Es entsteht keine CSV '
      + 'und kein Datensatz in datev_exports.',
    blockiertNicht:
      'Rechnungserstellung, Festschreibung, PDF, Versand, Zahlungseingang, Zuordnung und '
      + 'Mahnwesen laufen vollständig ohne DATEV. Der Export ist eine nachgelagerte Ausleitung.',
  },
  {
    id: 'D2',
    bereich: 'datev',
    frage: 'Mandantennummer der DATEV-Kanzlei?',
    quelle: 'Steuerkanzlei',
    schwere: 'blockierend',
    wirkungOffen:
      'Wie D1: erstelleDatevExport() bricht ab, bevor eine CSV oder ein Datensatz entsteht. '
      + 'Beide Nummern werden gemeinsam geprüft — eine allein genügt nicht.',
    blockiertNicht:
      'Rechnungserstellung, Festschreibung, PDF, Versand, Zahlungseingang, Zuordnung und '
      + 'Mahnwesen laufen vollständig ohne DATEV.',
  },
  {
    id: 'D3',
    bereich: 'datev',
    frage: 'Kontenrahmen SKR03 oder SKR04 — bestätigt die Kanzlei den Standardwert?',
    quelle: 'Steuerkanzlei',
    schwere: 'unbestaetigter_standard',
    wirkungOffen:
      'Der Export läuft mit dem hinterlegten Kontenrahmen. Ob es der richtige ist, kann kein '
      + 'Code wissen — geprüft wird nur, dass jedes Konto AUS einem definierten Vorrat stammt.',
    blockiertNicht: 'Den Rechnungspilot vollständig.',
  },
  {
    id: 'D4',
    bereich: 'datev',
    frage: 'Erlöskonto für steuerfreie Pflegeleistungen (§ 4 Nr. 16 UStG)?',
    quelle: 'Steuerkanzlei',
    schwere: 'unbestaetigter_standard',
    wirkungOffen: 'Der Export bucht auf das Standard-Erlöskonto des Kontenrahmens.',
    blockiertNicht: 'Den Rechnungspilot vollständig.',
  },
  {
    id: 'D5',
    bereich: 'datev',
    frage: 'Sachkontenlänge — 4 oder 5 Stellen?',
    quelle: 'Steuerkanzlei',
    schwere: 'unbestaetigter_standard',
    wirkungOffen: 'Der Export verwendet die hinterlegte Länge. Eine falsche Länge lehnt DATEV beim Import ab.',
    blockiertNicht: 'Den Rechnungspilot vollständig.',
  },
  {
    id: 'D6',
    bereich: 'datev',
    frage: 'Beginn des Wirtschaftsjahres?',
    quelle: 'Steuerkanzlei',
    schwere: 'unbestaetigter_standard',
    wirkungOffen: 'Der Export setzt den Standardwert in den Kopf der Datei.',
    blockiertNicht: 'Den Rechnungspilot vollständig.',
  },
] as const

/**
 * ChairMatch — Preise und Zeitversionierung.
 *
 * ChairMatch ist ein EIGENES Repo (/Users/work/chairmatch) mit einem eigenen
 * Supabase-Projekt. Diese Einträge stehen hier, weil der Pilotbericht sie
 * nennen muss — nicht, weil dieser Code sie liest. Es gibt keine Verbindung
 * zwischen den beiden Systemen.
 */
export const CHAIRMATCH_EINGABEN: readonly BusinessInput[] = [
  {
    id: 'C1',
    bereich: 'chairmatch',
    frage: 'Welche Beträge stehen in protect_pricing und compliance_plans?',
    quelle: 'Geschäftsführung',
    schwere: 'entscheidung',
    wirkungOffen:
      'Beide Tabellen sind strukturell fertig und LEER. Solange sie leer sind, kann ChairMatch '
      + 'nichts verkaufen. Die Werte aus der Entwurfsmigration 20260310 gelten ausdrücklich NICHT.',
    blockiertNicht:
      'Alltagsengel vollständig — anderes Repo, anderes Supabase-Projekt, kein gemeinsamer Code.',
  },
  {
    id: 'C2',
    bereich: 'chairmatch',
    frage: 'Wird Protect für alle vier Risikostufen verkauft oder nur HIGH/VERY_HIGH?',
    quelle: 'Geschäftsführung',
    schwere: 'entscheidung',
    wirkungOffen:
      'Nicht verkaufte Stufen gehören GESTRICHEN, nicht mit 0 befüllt — eine 0 in einer '
      + 'Preisspalte heißt „gratis", nicht „gibt es nicht".',
    blockiertNicht: 'Alltagsengel vollständig.',
  },
  {
    id: 'C3',
    bereich: 'chairmatch',
    frage: 'Sind die Beträge netto oder brutto?',
    quelle: 'Geschäftsführung / Steuerkanzlei',
    schwere: 'entscheidung',
    wirkungOffen: 'Die Spalten heißen *_cents ohne Steuerkennzeichen — die Frage ist im Schema nicht beantwortet.',
    blockiertNicht: 'Alltagsengel vollständig.',
  },
  {
    id: 'C4',
    bereich: 'chairmatch',
    frage: 'Bleibt es bei den Abrechnungszyklen one_time / yearly / monthly?',
    quelle: 'Geschäftsführung',
    schwere: 'entscheidung',
    wirkungOffen: 'Ein weiterer Zyklus verlangt eine Schemaänderung, keine Datenpflege.',
    blockiertNicht: 'Alltagsengel vollständig.',
  },
  {
    id: 'C5',
    bereich: 'chairmatch',
    frage: 'Soll 20260826_pricing_gueltigkeit.sql (effective_from/effective_to) angewendet werden?',
    quelle: 'Geschäftsführung',
    schwere: 'entscheidung',
    wirkungOffen:
      'Ohne sie überschreibt der Seed alte Preise, und zu einem Vertrag von gestern lässt sich '
      + 'der damals gültige Preis nicht mehr feststellen. Solange beide Tabellen leer sind, ist '
      + 'der Schaden null — vor dem ersten verkauften Vertrag ist die Migration billig, danach teuer.',
    blockiertNicht: 'Alltagsengel vollständig.',
  },
] as const

export const ALLE_EINGABEN: readonly BusinessInput[] = [
  ...DATEV_EINGABEN,
  ...CHAIRMATCH_EINGABEN,
]

// ---------------------------------------------------------------------------
// Live-Stand
// ---------------------------------------------------------------------------

export type EingabeStand = 'offen' | 'gesetzt' | 'nicht_pruefbar'

export interface BusinessInputStand extends BusinessInput {
  stand: EingabeStand
  /** Woher der Stand kommt. Nie der Wert selbst. */
  befund: string
}

export interface BusinessInputBericht {
  organizationId: string
  eingaben: BusinessInputStand[]
  /** Zusammenfassung nach Bereich. */
  jeBereich: Record<EingabeBereich, { offen: number; gesetzt: number; nichtPruefbar: number }>
  /**
   * Die Kernaussage: läuft der Rechnungspilot trotz offener Punkte?
   * Immer true, solange kein offener Punkt den Rechnungsweg berührt.
   */
  rechnungspilotBlockiert: boolean
  /** Was ohne jede dieser Angaben vollständig funktioniert. */
  laeuftUnabhaengig: string[]
  /** Was ohne die blockierenden Angaben NICHT läuft. */
  laeuftNicht: string[]
}

/**
 * Was ohne jede offene Geschäftsangabe vollständig läuft.
 *
 * Bewusst als Liste im Datenmodell und nicht als Fließtext auf einer Seite:
 * sie ist die Antwort auf „können wir trotzdem anfangen", und die soll auch
 * in einer API-Antwort auftauchen.
 */
export const LAEUFT_UNABHAENGIG: readonly string[] = [
  'Kunde anlegen, Leistung erfassen, Leistungsnachweis unterschreiben',
  'Rechnung erzeugen, prüfen, festschreiben (invoice-engine)',
  '16-Punkte-Preflight und Pilot-Prüfung der Rechnung',
  'PDF erzeugen und per Resend versenden, Protokoll in invoice_email_log',
  'Kontoauszug einlesen und im Trockenlauf einordnen (CAMT-Pilot)',
  'Zahlung anlegen und über das Allocation-Gate genau einer Rechnung zuordnen',
  'Mahnwesen-Trockenlauf und Mahn-Safety-Gate',
  'Money-Path-Abstimmung über alle neun Stufen',
] as const

/** Was ohne die blockierenden Angaben NICHT läuft. */
export const LAEUFT_NICHT_OHNE_D1_D2: readonly string[] = [
  'DATEV-Buchungsstapel erzeugen (erstelleDatevExport bricht vorher ab)',
  'Übergabe an die Steuerkanzlei',
  'Stufe 8 der Money-Path-Abstimmung (sie hat nichts abzustimmen, solange kein Export existiert)',
] as const

/**
 * Erhebt den Stand der Geschäftsangaben. Rein lesend.
 *
 * Geprüft wird ausschließlich die EXISTENZ von D1/D2 — nie ihr Wert, und
 * der Wert wird auch nie zurückgegeben. Für ChairMatch findet keine Abfrage
 * statt: das ist ein anderes Supabase-Projekt, zu dem dieser Prozess keine
 * Verbindung hat. Die Einträge stehen deshalb fest auf 'nicht_pruefbar' —
 * und das ist die ehrliche Antwort, nicht 'offen'.
 */
export async function ermittleBusinessInputs(
  admin: SupabaseClient,
  organizationId: string,
): Promise<BusinessInputBericht> {
  const eingaben: BusinessInputStand[] = []

  let datevBefund = 'DATEV-Konfiguration nicht lesbar.'
  let d1d2Gesetzt: boolean | null = null
  let fehlend: string[] = []
  try {
    const config = await getDatevConfig(admin, organizationId)
    const ergebnis = isDatevConfigComplete(config)
    d1d2Gesetzt = ergebnis.ok
    fehlend = ergebnis.fehlend
    datevBefund = ergebnis.ok
      ? 'Berater- und Mandantennummer sind hinterlegt (nur Existenz geprüft, nie der Wert).'
      : `Nicht hinterlegt: ${ergebnis.fehlend.join(', ')}.`
  } catch (err) {
    datevBefund = `DATEV-Konfiguration nicht lesbar: ${(err as Error).message}`
  }

  for (const e of DATEV_EINGABEN) {
    if (e.id === 'D1' || e.id === 'D2') {
      const betrifftMich = fehlend.some(f =>
        (e.id === 'D1' && /berater/i.test(f)) || (e.id === 'D2' && /mandant/i.test(f)))
      eingaben.push({
        ...e,
        stand: d1d2Gesetzt === null ? 'nicht_pruefbar' : (d1d2Gesetzt || !betrifftMich) ? 'gesetzt' : 'offen',
        befund: datevBefund,
      })
    } else {
      // D3–D6 tragen Standardwerte. „gesetzt" wäre hier eine Falschaussage:
      // ein Standardwert ist kein bestätigter Wert.
      eingaben.push({
        ...e,
        stand: 'offen',
        befund: 'Standardwert aus dem Kontenrahmen in Benutzung, von der Kanzlei nicht bestätigt.',
      })
    }
  }

  for (const e of CHAIRMATCH_EINGABEN) {
    eingaben.push({
      ...e,
      stand: 'nicht_pruefbar',
      befund:
        'Anderes Repo (/Users/work/chairmatch), anderes Supabase-Projekt. Dieser Prozess hat '
        + 'keine Verbindung dorthin und behauptet deshalb keinen Stand.',
    })
  }

  const jeBereich: Record<EingabeBereich, { offen: number; gesetzt: number; nichtPruefbar: number }> = {
    datev: { offen: 0, gesetzt: 0, nichtPruefbar: 0 },
    chairmatch: { offen: 0, gesetzt: 0, nichtPruefbar: 0 },
  }
  for (const e of eingaben) {
    const z = jeBereich[e.bereich]
    if (e.stand === 'offen') z.offen++
    else if (e.stand === 'gesetzt') z.gesetzt++
    else z.nichtPruefbar++
  }

  return {
    organizationId,
    eingaben,
    jeBereich,
    // Konstant false, und das ist der Punkt: keiner der Bereiche liegt auf
    // dem Rechnungsweg. Der Wert steht als Feld da, damit eine Oberfläche
    // ihn anzeigen kann, ohne die Begründung nachzubauen — und damit ein
    // Test ihn festhält.
    rechnungspilotBlockiert: false,
    laeuftUnabhaengig: [...LAEUFT_UNABHAENGIG],
    laeuftNicht: [...LAEUFT_NICHT_OHNE_D1_D2],
  }
}

// ---------------------------------------------------------------------------
// Bericht
// ---------------------------------------------------------------------------

const SCHWERE_ZEICHEN: Record<EingabeSchwere, string> = {
  blockierend: '✖',
  unbestaetigter_standard: '~',
  entscheidung: '?',
}

export function businessInputsBerichtText(b: BusinessInputBericht): string {
  const z: string[] = []
  const linie = '═'.repeat(74)

  z.push(linie)
  z.push('BUSINESS_INPUT_REQUIRED — offene Geschäftsangaben')
  z.push(linie)
  z.push(`Mandant : ${b.organizationId}`)
  z.push('')
  z.push(`RECHNUNGSPILOT BLOCKIERT: ${b.rechnungspilotBlockiert ? 'JA' : 'NEIN'}`)
  z.push('')
  z.push('LÄUFT OHNE JEDE DIESER ANGABEN VOLLSTÄNDIG:')
  for (const x of b.laeuftUnabhaengig) z.push(`  ✔ ${x}`)
  z.push('')
  z.push('LÄUFT NICHT, SOLANGE D1/D2 FEHLEN:')
  for (const x of b.laeuftNicht) z.push(`  ✖ ${x}`)

  for (const bereich of ['datev', 'chairmatch'] as EingabeBereich[]) {
    const gruppe = b.eingaben.filter(e => e.bereich === bereich)
    if (gruppe.length === 0) continue
    z.push('')
    z.push('─'.repeat(74))
    z.push(`${bereich.toUpperCase()} — ${gruppe.length} Punkt(e)`)
    z.push('─'.repeat(74))
    for (const e of gruppe) {
      z.push(`${SCHWERE_ZEICHEN[e.schwere]} ${e.id} [${e.stand}] ${e.frage}`)
      z.push(`     Quelle  : ${e.quelle}`)
      z.push(`     Befund  : ${e.befund}`)
      z.push(`     Offen   : ${e.wirkungOffen}`)
      z.push(`     Trotzdem: ${e.blockiertNicht}`)
    }
  }

  z.push('')
  z.push(linie)
  z.push('Keine Zahl und kein Preis in diesem Bericht ist erfunden — es stehen keine drin.')
  z.push(linie)
  return z.join('\n')
}

/** Nur für den Abgleichstest: die Liste des Validators bleibt die Quelle für D1–D6. */
export const VALIDATOR_VORGABEN = BERATER_VORGABE_ERFORDERLICH
