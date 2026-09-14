/**
 * ATS-Arbeitsfelder — was die Verwaltung über eine Bewerbung weiß.
 *
 * ── ABGRENZUNG ZU `BewerbungDaten` ────────────────────────────────────
 * `lib/bewerbung/katalog.ts` trägt, was die **Bewerberin selbst** im
 * Formular angegeben hat. Diese Datei trägt, was die **Verwaltung**
 * dazuschreibt: Startdatum aus dem Telefonat, Stand des Führungszeugnisses,
 * Notizen, nächste Aktion.
 *
 * Bestehende Felder werden **nicht angefasst**. Vier der fünfzehn
 * beauftragten Angaben gibt es bereits im Formularkatalog
 * (`qualifikation`, `fuehrerschein`, `verfuegbarkeit`, `sprachen`); sie
 * bleiben dort und werden hier nur referenziert, nicht kopiert. Eine
 * zweite Ablage derselben Angabe wäre ein zweiter Ort, an dem sie
 * veralten kann.
 *
 * ── WO ES LIEGT ───────────────────────────────────────────────────────
 * In `lead_inquiries.bewerbung_daten.ats` (jsonb) — derselbe Weg, den
 * `pipeline`, `prio` und `blocker` schon gehen. DDL ist aus der
 * Agentensitzung nicht möglich (42501).
 *
 * Die Migration `20261106000000_bewerbung_ats_felder.sql` beschreibt die
 * Zielform mit echten Spalten. Sie ist **geschrieben, nicht angewendet**.
 * Bis dahin ist das jsonb die Wahrheit; danach ist die Migration der
 * dokumentierte Umzugsweg.
 *
 * ── ALLE FELDER SIND OPTIONAL ─────────────────────────────────────────
 * Was nicht erhoben wurde, ist `undefined` — nicht `0`, nicht `''`, nicht
 * „unbekannt". Der Unterschied zwischen „nicht gefragt" und „mit Null
 * beantwortet" ist der Unterschied zwischen einer offenen Frage und einer
 * falschen Auskunft.
 */

/** Stand des erweiterten Führungszeugnisses. */
export const FZ_STATUS = {
  nicht_beantragt: 'Noch nicht beantragt',
  beantragt: 'Beantragt, läuft',
  eingetroffen: 'Liegt vor',
  abgelehnt: 'Abgelehnt / nicht vorlegbar',
} as const
export type FzStatus = keyof typeof FZ_STATUS

/** Wie kommt die Person zum Einsatz? */
export const MOBILITAET = {
  eigenes_auto: 'Eigenes Auto',
  oepnv: 'Öffentliche Verkehrsmittel',
  fahrrad: 'Fahrrad',
  zu_fuss: 'Zu Fuß im Nahbereich',
  unklar: 'Noch offen',
} as const
export type Mobilitaet = keyof typeof MOBILITAET

/** 1 = dringendst, 5 = nachrangig. Bewusst Zahlen: sie sortieren. */
export const PRIORITAET_MIN = 1
export const PRIORITAET_MAX = 5

/**
 * Die fünfzehn Arbeitsfelder.
 *
 * Vier davon (`qualifikation`, `fuehrerschein`, `verfuegbarkeit`,
 * `sprachen`) stehen hier als **Referenz auf den Formularkatalog** —
 * sie werden von dort gelesen, nicht hier geschrieben.
 */
export interface AtsFelder {
  /** Ab wann einsetzbar (YYYY-MM-DD). */
  startdatum?: string
  fzStatus?: FzStatus
  /** Datum zum FZ-Stand (Antrag oder Ausstellung, YYYY-MM-DD). */
  fzDatum?: string
  /** Referenz auf `BewerbungDaten.qualifikation` — hier nicht gespeichert. */
  qualifikation?: string
  erfahrungJahre?: number
  /** Referenz auf `BewerbungDaten.fuehrerschein`. */
  fuehrerschein?: string
  mobilitaet?: Mobilitaet
  /** Referenz auf `BewerbungDaten.verfuegbarkeit`. */
  verfuegbarkeit?: string[]
  stundenProWoche?: number
  /** Orte oder Stadtteile, in denen ein Einsatz möglich ist. */
  einsatzgebiet?: string[]
  /** Referenz auf `BewerbungDaten.sprachen`. */
  sprachen?: string[]
  /** Freitext der Verwaltung. Gehört niemals in Kundenkommunikation. */
  notizen?: string
  /** Wann zuletzt gesprochen (ISO-Zeitpunkt). */
  letzterKontakt?: string
  naechsteAktion?: string
  /** 1–5, kleiner ist dringender. */
  prioritaet?: number
}

export const ATS_FELDER: readonly (keyof AtsFelder)[] = [
  'startdatum', 'fzStatus', 'fzDatum', 'qualifikation', 'erfahrungJahre',
  'fuehrerschein', 'mobilitaet', 'verfuegbarkeit', 'stundenProWoche',
  'einsatzgebiet', 'sprachen', 'notizen', 'letzterKontakt', 'naechsteAktion',
  'prioritaet',
] as const

/** Felder, die aus dem Formularkatalog stammen und hier nicht geschrieben werden. */
export const AUS_FORMULAR: readonly (keyof AtsFelder)[] = [
  'qualifikation', 'fuehrerschein', 'verfuegbarkeit', 'sprachen',
] as const

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/

export interface PruefErgebnis {
  felder: AtsFelder
  /** Erster Fehler in Klartext, oder `null`. */
  fehler: string | null
}

/**
 * Prüft eine Eingabe. Unbekannte Werte werden **abgewiesen**, nicht
 * stillschweigend verworfen — sonst meldet die Oberfläche „gespeichert"
 * und die Angabe ist weg.
 */
export function pruefeAtsFelder(roh: Record<string, unknown>): PruefErgebnis {
  const f: Record<string, unknown> = {}

  const text = (k: string, max: number): string | null => {
    const w = roh[k]
    if (w === undefined || w === null || w === '') return null
    if (typeof w !== 'string') return `Ungültige Angabe: ${k}`
    if (w.length > max) return `${k} ist zu lang (max. ${max} Zeichen)`
    f[k] = w.trim()
    return null
  }

  const tag = (k: string): string | null => {
    const w = roh[k]
    if (w === undefined || w === null || w === '') return null
    if (typeof w !== 'string' || !ISO_TAG.test(w)) return `${k} braucht das Format JJJJ-MM-TT`
    f[k] = w
    return null
  }

  const zahl = (k: string, min: number, max: number): string | null => {
    const w = roh[k]
    if (w === undefined || w === null || w === '') return null
    const n = typeof w === 'number' ? w : Number(w)
    if (!Number.isFinite(n)) return `${k} muss eine Zahl sein`
    if (!Number.isInteger(n)) return `${k} muss eine ganze Zahl sein`
    if (n < min || n > max) return `${k} liegt außerhalb von ${min}–${max}`
    f[k] = n
    return null
  }

  const ausKatalog = (k: string, katalog: Record<string, string>): string | null => {
    const w = roh[k]
    if (w === undefined || w === null || w === '') return null
    if (typeof w !== 'string' || !(w in katalog)) return `Unbekannter Wert für ${k}`
    f[k] = w
    return null
  }

  const liste = (k: string, maxEintraege: number): string | null => {
    const w = roh[k]
    if (w === undefined || w === null) return null
    if (!Array.isArray(w)) return `${k} muss eine Liste sein`
    const sauber = w.filter((x): x is string => typeof x === 'string' && !!x.trim())
    if (sauber.length !== w.length) return `${k} enthält ungültige Einträge`
    if (sauber.length > maxEintraege) return `${k}: höchstens ${maxEintraege} Einträge`
    if (sauber.length > 0) f[k] = [...new Set(sauber.map(s => s.trim()))]
    return null
  }

  const fehler =
    tag('startdatum')
    ?? ausKatalog('fzStatus', FZ_STATUS)
    ?? tag('fzDatum')
    ?? zahl('erfahrungJahre', 0, 60)
    ?? ausKatalog('mobilitaet', MOBILITAET)
    ?? zahl('stundenProWoche', 1, 60)
    ?? liste('einsatzgebiet', 20)
    ?? text('notizen', 4000)
    ?? text('naechsteAktion', 400)
    ?? text('letzterKontakt', 40)
    ?? zahl('prioritaet', PRIORITAET_MIN, PRIORITAET_MAX)

  if (fehler) return { felder: {}, fehler }

  // Ein FZ-Datum ohne Status ist eine Angabe über nichts.
  if (f.fzDatum && !f.fzStatus) {
    return { felder: {}, fehler: 'fzDatum ohne fzStatus — der Stand fehlt' }
  }
  return { felder: f as AtsFelder, fehler: null }
}

/**
 * Torwaechter fuer alles, was von aussen kommt (Maske, Server Action).
 *
 * `pruefeAtsFelder` prueft **Werte**. Diese Funktion prueft davor die
 * **Schluessel** — und zwar so, dass beide Verwechslungsarten einen Fehler
 * ergeben statt eines stillen Nichts:
 *
 *   1. Ein Feld aus dem Formularkatalog (`AUS_FORMULAR`) wuerde von
 *      `pruefeAtsFelder` kommentarlos fallen gelassen. Die Oberflaeche
 *      meldete „gespeichert", und die Angabe waere weg.
 *   2. Ein voellig unbekannter Schluessel ebenso.
 *
 * Steht hier und nicht in der Server Action, damit jeder weitere Schreibweg
 * (Import, Massenpflege, API) dieselbe Regel bekommt — eine zweite Kopie
 * der Bedingung driftet sonst ab.
 */
export function pruefeAtsEingabe(roh: Record<string, unknown>): PruefErgebnis {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
    return { felder: {}, fehler: 'Keine Felder uebergeben.' }
  }
  const schluessel = Object.keys(roh)

  const gesperrt = schluessel.filter(k => (AUS_FORMULAR as readonly string[]).includes(k))
  if (gesperrt.length > 0) {
    return {
      felder: {},
      fehler: `Aus dem Bewerbungsformular, hier nicht änderbar: ${gesperrt.join(', ')}`,
    }
  }

  const unbekannt = schluessel.filter(k => !(ATS_FELDER as readonly string[]).includes(k))
  if (unbekannt.length > 0) {
    return { felder: {}, fehler: `Unbekannte Felder: ${unbekannt.join(', ')}` }
  }

  const { felder, fehler } = pruefeAtsFelder(roh)
  if (fehler) return { felder: {}, fehler }

  // Nur die uebergebenen Schluessel zurueckgeben. Ein Feld, das die Maske
  // gar nicht geschickt hat, darf spaeter nicht als „geloescht" ankommen —
  // sonst raeumt ein Teilformular die Angaben eines anderen weg.
  const nur: Record<string, unknown> = {}
  for (const k of schluessel) nur[k] = (felder as Record<string, unknown>)[k]
  return { felder: nur as AtsFelder, fehler: null }
}

/** Liest die Arbeitsfelder aus `bewerbung_daten`. */
export function atsFelderAus(daten: unknown): AtsFelder {
  if (!daten || typeof daten !== 'object') return {}
  const a = (daten as Record<string, unknown>).ats
  if (!a || typeof a !== 'object' || Array.isArray(a)) return {}
  return pruefeAtsFelder(a as Record<string, unknown>).felder
}

/**
 * Neue jsonb-Nutzlast mit gesetzten Arbeitsfeldern.
 *
 * Alles daneben — Formularangaben, `pipeline`, `prio`, `blocker` — bleibt
 * unangetastet. Felder mit `undefined` werden **entfernt**, nicht auf
 * `null` gesetzt: „nicht erhoben" soll später nicht wie „ausdrücklich
 * leer" aussehen.
 */
export function mitAtsFeldern(daten: unknown, neu: AtsFelder): Record<string, unknown> {
  const basis: Record<string, unknown> = daten && typeof daten === 'object' && !Array.isArray(daten)
    ? { ...(daten as Record<string, unknown>) }
    : {}
  const alt = atsFelderAus(daten)
  const zusammen: Record<string, unknown> = { ...alt }
  for (const [k, v] of Object.entries(neu)) {
    if (v === undefined) delete zusammen[k]
    else zusammen[k] = v
  }
  if (Object.keys(zusammen).length === 0) delete basis.ats
  else basis.ats = zusammen
  return basis
}

/**
 * Gilt eine Bewerbung aufgrund dieser Felder als geprüft?
 *
 * **IMMER `false`.** Und das ist keine Platzhalterimplementierung.
 *
 * Jedes Feld hier ist entweder Selbstauskunft der Bewerberin oder eine
 * Notiz der Verwaltung aus einem Telefonat. Kein einziges ist gegen ein
 * Dokument geprüft: `fzStatus = 'eingetroffen'` heißt, dass jemand das in
 * eine Maske getippt hat — nicht, dass ein Führungszeugnis vorliegt.
 *
 * Solange es keine Belegkette gibt (Dokument hochgeladen, gesichtet,
 * Prüfer und Zeitpunkt festgehalten), wäre jedes `true` hier eine
 * Behauptung über eine Prüfung, die nicht stattgefunden hat. Bei § 45a
 * hängt daran die Einsatzfreigabe.
 *
 * Wer das ändern will, braucht zuerst die Belegkette — nicht diese Zeile.
 *
 * ── WO DIE BELEGKETTE INZWISCHEN VERLANGT WIRD ───────────────────────
 *
 * Der Satz „Bei § 45a hängt daran die Einsatzfreigabe" war bis Block 29
 * ein Versprechen ohne Deckung: `sammleVoraussetzungen` in
 * lib/personal/einsatzfreigabe.ts prüfte nur, ob eine Zeile mit passendem
 * Titel und `pflicht = true` existierte. Eine von Hand angelegte
 * Qualifikation ohne Dokument und ohne Prüfvermerk gab die Freigabe.
 *
 * Seit Block 29 verlangt lib/personal/pflichtnachweis.ts für jeden
 * Pflichtnachweis `dokument_id` UND `verifiziert_am` + `verifiziert_von`.
 * Der Riegel hier bleibt trotzdem, was er ist: die ATS-Felder sind nach
 * wie vor Selbstauskunft, und eine Bewerbung wird nicht dadurch geprüft,
 * dass es anderswo eine geprüfte Qualifikation gibt.
 */
export function darfAlsVerifiziertGelten(_felder: AtsFelder): false {
  return false
}
