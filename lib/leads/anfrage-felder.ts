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

// ═══════════════════════════════════════════════════════════════════════
// Grenzen und Prüfung für NEU ANGELEGTE Anfragen
// ═══════════════════════════════════════════════════════════════════════

/**
 * Längengrenzen der Freitextfelder.
 *
 * Standen bis zum 13.09.2026 als lokale Konstante in
 * `app/api/lead-inquiry/route.ts` — dem öffentlichen Weg. Der Weg über das
 * CRM (`createLead` in app/mis/crm/actions.ts) prüfte **gar nichts**: die
 * abgeschlossene Tür war die von außen, die offene die von innen.
 *
 * Ein Admin-Login macht unbegrenzten Text nicht in Ordnung. Es macht ihn
 * nur unwahrscheinlicher.
 */
export const LEAD_MAX_LEN = {
  name: 120,
  phone: 40,
  plz: 10,
  message: 2000,
  service: 60,
  source: 60,
  utm_source: 120,
} as const

/**
 * Quellen, die eine Zeile zur BEWERBUNG machen.
 *
 * `lib/admin/ops.ts` erkennt Bewerbungen an `art='bewerbung'` ODER
 * `source='engel-bewerbung'`. Wer über das CRM eine „Kundenanfrage" mit
 * dieser Quelle anlegt, erzeugt damit stillschweigend eine Bewerbung: sie
 * verschwindet aus dem Anfragen-Posteingang und taucht in der
 * Bewerberliste auf. Niemand hat das getippt, und niemand sieht, warum.
 */
export const QUELLEN_NUR_BEWERBUNG: readonly string[] = ['engel-bewerbung']

export interface NeuerLead {
  name: string
  phone: string
  plz?: string
  message?: string
  source: string
  service?: string
}

export interface LeadPruefErgebnis {
  lead: NeuerLead | null
  fehler: string | null
}

/** Mindestens sechs Ziffern — dieselbe Regel wie auf dem öffentlichen Weg. */
export function istTelefonPlausibel(wert: string): boolean {
  return (wert.match(/[0-9]/g) || []).length >= 6
}

/**
 * Prüft eine von Hand angelegte Anfrage.
 *
 * Weist ab statt zu kürzen: ein stillschweigend auf 120 Zeichen
 * abgeschnittener Name ist ein falscher Name, und die Person, die ihn
 * eingetippt hat, erfährt nie davon.
 */
export function pruefeNeuerLead(roh: Record<string, unknown>): LeadPruefErgebnis {
  const text = (k: keyof typeof LEAD_MAX_LEN): string | { fehler: string } => {
    const w = roh[k]
    if (w === undefined || w === null) return ''
    if (typeof w !== 'string') return { fehler: `Ungültige Angabe: ${k}` }
    const t = w.trim()
    if (t.length > LEAD_MAX_LEN[k]) {
      return { fehler: `${k} ist zu lang (max. ${LEAD_MAX_LEN[k]} Zeichen)` }
    }
    return t
  }

  const felder: Record<string, string> = {}
  for (const k of ['name', 'phone', 'plz', 'message', 'source', 'service'] as const) {
    const w = text(k)
    if (typeof w !== 'string') return { lead: null, fehler: w.fehler }
    felder[k] = w
  }

  if (!felder.name) return { lead: null, fehler: 'Name fehlt.' }
  if (!felder.phone) return { lead: null, fehler: 'Telefonnummer fehlt.' }
  if (!istTelefonPlausibel(felder.phone)) {
    return { lead: null, fehler: 'Telefonnummer sieht nicht nach einer Nummer aus.' }
  }
  if (felder.plz && !/^\d{4,5}$/.test(felder.plz)) {
    return { lead: null, fehler: 'PLZ besteht aus vier oder fünf Ziffern.' }
  }
  if (QUELLEN_NUR_BEWERBUNG.includes(felder.source)) {
    return {
      lead: null,
      fehler: `Die Quelle „${felder.source}" kennzeichnet Bewerbungen — eine Kundenanfrage bekommt sie nicht.`,
    }
  }

  return {
    lead: {
      name: felder.name,
      phone: felder.phone,
      plz: felder.plz || undefined,
      message: felder.message || undefined,
      source: felder.source || 'crm',
      service: felder.service || undefined,
    },
    fehler: null,
  }
}

