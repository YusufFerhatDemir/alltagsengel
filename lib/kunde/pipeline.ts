/**
 * Kunden-Pipeline: von der Anfrage bis zum laufenden Einsatz.
 *
 * ANFRAGE → KONTAKTIERT → ERSTGESPRÄCH → ANGEBOT → VERTRAG → AKTIV,
 * Ausstieg ABGESAGT bzw. ARCHIVIERT.
 *
 * ── WARUM SECHS UND NICHT VIER ────────────────────────────────────────
 * Vier Stationen beschreiben den Weg richtig — Anfrage, Erstgespräch,
 * Vertrag, aktiv. Zwei weitere stehen dazwischen, weil an ihnen die
 * Wiedervorlage hängt und ohne sie genau dort Leads liegen bleiben:
 *
 *   KONTAKTIERT  Der Rückruf ist raus, das Gespräch steht noch nicht. Ohne
 *                diese Stufe ist „Anfrage" gleichzeitig „noch niemand hat
 *                angerufen" und „wir warten auf Rückmeldung" — und die
 *                Liste sagt nicht mehr, wer dran ist.
 *   ANGEBOT      Zwischen Beratung und Vertrag liegt ein Leistungs- und
 *                Kostenvorschlag. Wer ihn mit dem Vertrag in eine Stufe
 *                wirft, sieht nicht, ob die Kundin noch überlegt oder ob
 *                die Unterschrift fehlt.
 *
 * Dasselbe Muster wie die Bewerber-Pipeline (`lib/bewerbung/pipeline.ts`),
 * bewusst als eigene Datei: Bewerber und Kunden laufen unterschiedliche
 * Wege, und eine gemeinsame Liste hätte an jeder Stelle ein „gilt nur
 * für …" gebraucht.
 *
 * ── WO DIE STUFE STEHT ────────────────────────────────────────────────
 * `lead_inquiries.status` trägt einen CHECK auf genau fünf CRM-Werte
 * (new, contacted, qualified, converted, lost). Sechs Stufen passen da
 * nicht hinein, und die Spalte zu erweitern bräuchte DDL.
 *
 * Deshalb zwei Ebenen — identisch zur Bewerberseite:
 *   anfrage_daten.pipeline.stufe   die feine Stufe (jsonb, keine Migration)
 *   status                         die grobe CRM-Stufe, abgeleitet und
 *                                  IMMER mitgeschrieben
 *
 * Laufen beide auseinander, gewinnt `status`: er ist die Spalte mit CHECK
 * und der Wert, den /mis/crm und das Marketing-Dashboard sehen.
 */

import { berlinerTagPlus } from '@/lib/leads/follow-up'

export interface KundenStufe {
  key: string
  label: string
  color: string
  /** Wert in `lead_inquiries.status` (CHECK: new|contacted|qualified|converted|lost). */
  dbStatus: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'
  /** Kalendertage bis zur nächsten Wiedervorlage; `null` = Endzustand. */
  wiedervorlageTage: number | null
  /** Was in dieser Stufe zu tun ist — steht in der Zeile, nicht im Handbuch. */
  aufgabe: string
}

export const KUNDEN_STUFEN: readonly KundenStufe[] = [
  // Ein Tag: eine Familie, die sich meldet, hat in aller Regel schon länger
  // überlegt. Zwei Tage Stille sind aus ihrer Sicht eine Absage.
  { key: 'anfrage', label: 'Anfrage', color: '#2196F3', dbStatus: 'new', wiedervorlageTage: 1,
    aufgabe: 'Anfrage sichten und zurückrufen' },
  { key: 'kontaktiert', label: 'Kontaktiert', color: '#29B6F6', dbStatus: 'contacted', wiedervorlageTage: 3,
    aufgabe: 'Rückruf ist raus — Termin für das Erstgespräch vereinbaren' },
  { key: 'erstgespraech', label: 'Erstgespräch', color: '#9C27B0', dbStatus: 'contacted', wiedervorlageTage: 5,
    aufgabe: 'Bedarf aufnehmen: Umfang, Zeiten, Pflegegrad, Ort' },
  { key: 'angebot', label: 'Angebot', color: '#7E57C2', dbStatus: 'qualified', wiedervorlageTage: 5,
    aufgabe: 'Leistungs- und Kostenvorschlag schicken, Rückmeldung nachhalten' },
  { key: 'vertrag', label: 'Vertrag', color: '#00897B', dbStatus: 'qualified', wiedervorlageTage: 4,
    aufgabe: 'Vertrag erstellen, unterschreiben lassen, gegenzeichnen' },
  { key: 'aktiv', label: 'Aktiv', color: '#5CB882', dbStatus: 'converted', wiedervorlageTage: null,
    aufgabe: 'Abgeschlossen — Klient angelegt, Einsätze laufen' },
  { key: 'abgesagt', label: 'Abgesagt', color: '#D04B3B', dbStatus: 'lost', wiedervorlageTage: null,
    aufgabe: 'Abgeschlossen' },
  // Wie bei den Bewerbern: abgesagt ist eine Entscheidung der Kundin,
  // archiviert eine über den Vorgang (nicht erreichbar, Dublette, Anliegen
  // erledigt). Beides zusammenzuwerfen macht jede Absagequote unbrauchbar.
  { key: 'archiviert', label: 'Archiviert', color: '#8A8A8A', dbStatus: 'lost', wiedervorlageTage: null,
    aufgabe: 'Abgeschlossen — kein aktiver Vorgang mehr' },
] as const

export const KUNDEN_STUFEN_FLOW: readonly string[] = KUNDEN_STUFEN.map(s => s.key)

/** Vorwärtsweg ohne Ausstieg. */
export const KUNDEN_VORWAERTS: readonly string[] =
  KUNDEN_STUFEN_FLOW.filter(s => s !== 'abgesagt' && s !== 'archiviert')

export const KUNDEN_ENDZUSTAENDE: readonly string[] = ['aktiv', 'abgesagt', 'archiviert']

/**
 * Grobe → feine Stufe für Anfragen ohne gespeicherte Pipeline und für
 * auseinandergelaufene Stände. Jeweils die ERSTE feine Stufe, die zur
 * groben passt — nie eine, die mehr behauptet.
 */
const STATUS_ZU_STUFE: Record<string, string> = {
  new: 'anfrage',
  contacted: 'kontaktiert',
  qualified: 'angebot',
  converted: 'aktiv',
  lost: 'abgesagt',
}

export function istKundenStufe(wert: unknown): wert is string {
  return typeof wert === 'string' && KUNDEN_STUFEN_FLOW.includes(wert)
}

export function kundenStufe(key: string): KundenStufe {
  return KUNDEN_STUFEN.find(s => s.key === key) ?? KUNDEN_STUFEN[0]
}

export interface KundenVerlauf {
  stufe: string
  am: string
  /** Anzeigename der Verwaltung. Kein Personenname nach außen — nur intern. */
  von: string | null
}

export interface KundenPipelineStand {
  stufe: string
  seit: string
  verlauf: KundenVerlauf[]
}

/** Höchstens so viele Verlaufseinträge im jsonb — es ist kein Audit-Log. */
export const KUNDEN_VERLAUF_MAX = 20

function pipelineAus(daten: unknown): KundenPipelineStand | null {
  if (!daten || typeof daten !== 'object') return null
  const p = (daten as Record<string, unknown>).pipeline
  if (!p || typeof p !== 'object') return null
  const stand = p as Partial<KundenPipelineStand>
  if (!istKundenStufe(stand.stufe) || typeof stand.seit !== 'string') return null
  return {
    stufe: stand.stufe,
    seit: stand.seit,
    verlauf: Array.isArray(stand.verlauf) ? stand.verlauf.filter(v => v && istKundenStufe(v.stufe)) : [],
  }
}

/**
 * Feine Stufe einer Anfrage. Gespeicherte Pipeline gilt nur, solange sie
 * zum Status passt — sonst gewinnt der Status (siehe Kopfkommentar).
 */
export function stufeFuerAnfrage(daten: unknown, status: string | null | undefined): {
  stufe: string
  seit: string | null
  ausStatus: boolean
} {
  const p = pipelineAus(daten)
  const s = status || 'new'
  if (p && kundenStufe(p.stufe).dbStatus === s) {
    return { stufe: p.stufe, seit: p.seit, ausStatus: false }
  }
  return { stufe: STATUS_ZU_STUFE[s] ?? 'anfrage', seit: null, ausStatus: true }
}

/**
 * Neue jsonb-Nutzlast mit gesetzter Stufe. Alle übrigen Schlüssel bleiben
 * unangetastet — `anfrage_daten` trägt die Formularangaben (Anliegen,
 * Dringlichkeit, Kontaktweg, Pflegegrad), und die dürfen durch einen
 * Stufenwechsel nicht verloren gehen.
 */
export function mitKundenStufe(
  daten: unknown,
  stufe: string,
  jetzt: Date,
  von: string | null,
): Record<string, unknown> {
  const basis: Record<string, unknown> = daten && typeof daten === 'object' && !Array.isArray(daten)
    ? { ...(daten as Record<string, unknown>) }
    : {}
  const alt = pipelineAus(daten)
  const am = jetzt.toISOString()
  const verlauf = [...(alt?.verlauf ?? []), { stufe, am, von }].slice(-KUNDEN_VERLAUF_MAX)
  basis.pipeline = { stufe, seit: am, verlauf } satisfies KundenPipelineStand
  return basis
}

/**
 * Wiedervorlagedatum für eine Stufe — oder `null` im Endzustand.
 *
 * `null` heißt ausdrücklich „Spalte leeren", nicht „Datum unverändert
 * lassen": ein abgeschlossener Vorgang, der weiter in der Fälligkeitsliste
 * steht, macht die Liste unbrauchbar.
 *
 * `berlinerTagPlus`, nicht `plusTage`: `lead_inquiries.follow_up_date` ist
 * eine `date`-Spalte. Ein UTC-Zeitstempel wäre zwischen 22 und 24 Uhr
 * deutscher Zeit schon der Folgetag — dieselbe Rechnung wie auf der
 * Bewerberseite.
 */
export function wiedervorlageFuerStufe(stufe: string, jetzt: Date): string | null {
  const tage = kundenStufe(stufe).wiedervorlageTage
  return tage === null ? null : berlinerTagPlus(jetzt, tage)
}
