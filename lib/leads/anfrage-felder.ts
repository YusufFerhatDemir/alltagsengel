/**
 * Felder der Kundenanfrage — eine Definition für Formular und Route.
 *
 * WARUM DIESE DATEI EXISTIERT
 * Am 12.09.2026 hatte **kein einziger** der 50 Leads eine E-Mail-Adresse.
 * Die Spalte `lead_inquiries.email` gab es die ganze Zeit; das Formular fragte
 * sie nicht ab und die Route schrieb sie nicht. Es fehlte keine Migration,
 * es fehlte ein Feld. Die Folge war handfest: schriftliches Nachfassen war
 * unmöglich, die Follow-up-Kette konnte nur die Verwaltung erreichen, nie den
 * Kunden.
 *
 * Zweiter Befund desselben Tages: acht Rückrufe trugen als einzigen Inhalt
 * „Rückruf gewünscht — bevorzugte Zeit: Nachmittags". Ob dahinter eine Kundin,
 * ein Angehöriger oder ein Bewerber stand, war ohne Anruf nicht zu entscheiden.
 *
 * OHNE MIGRATION: Die neuen Angaben gehen in `lead_inquiries.anfrage_daten`
 * (jsonb, existiert bereits). DDL ist aus der Agent-Sitzung heraus nicht
 * möglich (42501) — und für Formularfelder auch gar nicht nötig.
 *
 * DIE REGEL: Alles, was von außen kommt, wird gegen diese Listen geprüft.
 * Ein unbekannter Wert wird **abgewiesen**, nicht stillschweigend verworfen —
 * sonst meldet das Formular „gespeichert", und die Angabe ist weg
 * (siehe Projekt-Memory „Stille Feldverwerfung UI↔API").
 */

export const ANLIEGEN = {
  kunde: 'Ich suche Unterstützung für mich selbst',
  angehoeriger: 'Ich frage für eine angehörige Person',
  bewerber: 'Ich möchte als Alltagsbegleiter/in arbeiten',
  sonstiges: 'Etwas anderes',
} as const
export type Anliegen = keyof typeof ANLIEGEN

export const DRINGLICHKEIT = {
  sofort: 'So schnell wie möglich',
  wochen: 'In den nächsten Wochen',
  planung: 'Ich informiere mich erst einmal',
} as const
export type Dringlichkeit = keyof typeof DRINGLICHKEIT

export const KONTAKTWEG = {
  telefon: 'Telefon',
  email: 'E-Mail',
  whatsapp: 'WhatsApp',
  egal: 'Egal',
} as const
export type Kontaktweg = keyof typeof KONTAKTWEG

/**
 * Pflegegrad. „kein" und „beantragt" sind eigene Werte, nicht 0 — ein
 * beantragter Grad ist für die Beratung etwas völlig anderes als keiner:
 * Leistungen nach §45b gibt es ab Grad 1, und wer gerade beantragt hat,
 * braucht oft zuerst Hilfe beim Verfahren.
 *
 * ACHTUNG bei den Schlüsseln: `grad1` statt `1`. JavaScript sortiert
 * ganzzahlige Objektschlüssel beim Aufzählen VOR alle anderen — mit `'1'`
 * standen im Auswahlfeld erst die Grade 1 bis 5 und danach „Weiß ich nicht",
 * „Kein Pflegegrad" und „Beantragt". Genau verkehrt herum: Die häufigste
 * Antwort einer Person, die sich gerade erst informiert, ist „weiß ich nicht".
 * Am 12.09.2026 im Browser gesehen und hier behoben, solange noch keine
 * gespeicherte Zeile die alten Schlüssel trug (live geprüft: 0 Zeilen).
 */
export const PFLEGEGRAD = {
  unbekannt: 'Weiß ich nicht',
  kein: 'Kein Pflegegrad',
  beantragt: 'Beantragt, noch kein Bescheid',
  grad1: 'Pflegegrad 1',
  grad2: 'Pflegegrad 2',
  grad3: 'Pflegegrad 3',
  grad4: 'Pflegegrad 4',
  grad5: 'Pflegegrad 5',
} as const
export type Pflegegrad = keyof typeof PFLEGEGRAD

/** Schlüssel → Anzeigetext, für Formular-Optionen. */
export function optionen<T extends Record<string, string>>(katalog: T): { wert: keyof T; text: string }[] {
  return (Object.keys(katalog) as (keyof T)[]).map(wert => ({ wert, text: katalog[wert] }))
}

/** Was in `anfrage_daten` landet. Alle Felder optional — das Formular bleibt niedrigschwellig. */
export interface AnfrageDaten {
  anliegen?: Anliegen
  dringlichkeit?: Dringlichkeit
  kontaktweg?: Kontaktweg
  pflegegrad?: Pflegegrad
}

const KATALOGE = {
  anliegen: ANLIEGEN,
  dringlichkeit: DRINGLICHKEIT,
  kontaktweg: KONTAKTWEG,
  pflegegrad: PFLEGEGRAD,
} as const

export const ANFRAGE_FELDER = Object.keys(KATALOGE) as (keyof typeof KATALOGE)[]

export interface PruefErgebnis {
  daten: AnfrageDaten
  /** Erster Fehler in Klartext, oder `null`. Die Route gibt ihn als 400 zurück. */
  fehler: string | null
}

/**
 * Prüft die Katalogfelder aus dem Anfrage-Body.
 *
 * Fehlende Felder sind in Ordnung (alles optional). Ein **vorhandenes** Feld
 * mit unbekanntem Wert ist ein Fehler — nicht ein stillschweigend
 * weggelassener Wert.
 */
export function pruefeAnfrageDaten(body: Record<string, unknown>): PruefErgebnis {
  const daten: Record<string, string> = {}
  for (const feld of ANFRAGE_FELDER) {
    const roh = body[feld]
    if (roh === undefined || roh === null || roh === '') continue
    if (typeof roh !== 'string') {
      return { daten: {}, fehler: `Ungültige Angabe: ${feld}` }
    }
    if (!(roh in KATALOGE[feld])) {
      return { daten: {}, fehler: `Unbekannter Wert für ${feld}` }
    }
    daten[feld] = roh
  }
  return { daten: daten as AnfrageDaten, fehler: null }
}

/**
 * E-Mail-Prüfung. Bewusst grob: ein strenges Muster weist mehr echte
 * Adressen ab, als es falsche fängt. Verlangt wird das Nötigste —
 * ein @ mit etwas davor und einer Punkt-Domain dahinter.
 */
export const EMAIL_MAX = 254
export function istEmailPlausibel(wert: string): boolean {
  if (wert.length > EMAIL_MAX) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(wert)
}

/**
 * Der Rückruf braucht das Anliegen — sonst entsteht wieder ein Lead, den
 * niemand einordnen kann. Gilt NUR für den Rückrufweg; das ausführliche
 * Formular hat genug andere Signale.
 */
export function anliegenPflichtFuer(source: string | undefined): boolean {
  return source === 'rueckruf'
}
