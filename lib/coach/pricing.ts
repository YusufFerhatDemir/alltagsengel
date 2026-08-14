// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Preise und Tarife (Selbstzahler-Infrastruktur)
//
// ═══ ENDNUTZER-ABONNEMENTS SIND NICHT VORGESEHEN ═══════════════
// Geschäftsmodell-Entscheidung vom 14.08.2026: PflegeCoach ist
// dauerhaft KOSTENLOS für alle Endnutzer. Keine Abos, keine
// Monats-/Jahrespreise, keine Paywall, keine Stripe-Zahlung durch
// Nutzer. Monetarisierung ausschließlich über Pflegekassen-
// Erstattung nach tatsächlicher DiPA-Zulassung.
//
// ═══ DIESE DATEI BLEIBT ALS TECHNISCHE INFRASTRUKTUR ═══════════
// Der Selbstzahler-Verkaufsweg wird nicht gelöscht, weil er aktuell
// keinen Nutzer blockiert (COACH_PREISE_FREIGEGEBEN=false, Verkauf
// fail-closed) und bei einer künftigen Umstellung wiederverwendet
// werden könnte.
//
// ═══ DIE BETRÄGE UNTEN SIND PLATZHALTER ════════════════════════
// Sie sind NICHT kaufmännisch entschieden und dürfen niemandem in
// Rechnung gestellt werden. Deshalb ist der Verkauf FAIL-CLOSED:
// Solange COACH_PREISE_FREIGEGEBEN nicht auf 'true' steht, gibt
// `preiseFreigegeben()` false zurück und der gesamte Bestellweg
// (Checkout-Seite, Checkout-API, Stripe-Session) verweigert die
// Annahme. Das ist dasselbe Muster wie bei den Kassentarifen
// (lib/billing: tarif_status) — ein ungeprüfter Betrag darf nie
// versehentlich abgerechnet werden.
//
// KEINE ERSTATTUNGSAUSSAGE: Diese Datei enthält bewusst keinen
// Kostenträger-, Kassen- oder Erstattungsbezug (siehe
// lib/coach/abrechnung.ts für die getrennte, deaktivierte DiPA-Seite).
// ═══════════════════════════════════════════════════════════════

export const COACH_PREISE_FREIGEGEBEN_ENV = 'COACH_PREISE_FREIGEGEBEN'
export const COACH_WAEHRUNG = 'EUR'

/**
 * Ist die Preisliste kaufmännisch freigegeben?
 *
 * Fail-closed: Default AUS. Ohne Freigabe darf keine Bestellung
 * entgegengenommen werden — nicht über die Oberfläche und nicht über
 * einen direkten API-Aufruf.
 */
export function preiseFreigegeben(): boolean {
  return process.env[COACH_PREISE_FREIGEGEBEN_ENV] === 'true'
}

// ═══════════════════════════════════════════════════════════════
// UMSATZSTEUER
// ═══════════════════════════════════════════════════════════════
// Ebenfalls offen und deshalb konfigurierbar. Zwei Fälle:
//
//  * Kleinunternehmer (§ 19 UStG): keine USt ausweisen, dafür MUSS auf
//    der Rechnung der Hinweis stehen. `KLEINUNTERNEHMER_HINWEIS` liefert
//    ihn; lib/coach/rechnung.ts setzt ihn.
//  * Regelbesteuerung: Satz in COACH_UST_SATZ (Prozent, z. B. 19).
//
// Welcher Fall gilt, ist eine steuerliche Feststellung — hier wird
// nichts geraten. Default ist Kleinunternehmer, weil das die
// betragsmäßig konservative Variante ist: Es wird kein Steuerbetrag
// erfunden und keine Vorsteuer suggeriert.
export const COACH_UST_KLEINUNTERNEHMER_ENV = 'COACH_UST_KLEINUNTERNEHMER'
export const COACH_UST_SATZ_ENV = 'COACH_UST_SATZ'

export const KLEINUNTERNEHMER_HINWEIS =
  'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.'

export interface SteuerEinstellung {
  kleinunternehmer: boolean
  /** Prozentsatz, 0 bei Kleinunternehmer. */
  satzProzent: number
  /** Pflichthinweis für die Rechnung, null bei Regelbesteuerung. */
  hinweis: string | null
}

export function steuerEinstellung(): SteuerEinstellung {
  // Default true: lieber keine Steuer ausweisen als eine falsche.
  const klein = process.env[COACH_UST_KLEINUNTERNEHMER_ENV] !== 'false'
  if (klein) {
    return { kleinunternehmer: true, satzProzent: 0, hinweis: KLEINUNTERNEHMER_HINWEIS }
  }
  const satz = Number(process.env[COACH_UST_SATZ_ENV])
  return {
    kleinunternehmer: false,
    satzProzent: Number.isFinite(satz) && satz >= 0 ? satz : 19,
    hinweis: null,
  }
}

// ═══════════════════════════════════════════════════════════════
// TARIFE
// ═══════════════════════════════════════════════════════════════

export type CoachTarifKey = 'monatlich' | 'jaehrlich'

export const COACH_TARIF_KEYS: CoachTarifKey[] = ['monatlich', 'jaehrlich']

export interface CoachTarif {
  key: CoachTarifKey
  bezeichnung: string
  /**
   * Bruttopreis je Abrechnungszeitraum in CENT.
   *
   * Cent und nicht Euro — bewusst, und mit Nachdruck: In der
   * Betriebs-Abrechnung liegt `total_amount` in Euro, was schon einmal
   * zu Faktor-100-Fehlern geführt hat. Hier ist die Einheit im
   * Feldnamen und im Typ verankert, und die Datenbank speichert
   * ebenfalls Cent (coach_bestellungen.betrag_cent).
   */
  betragCent: number
  /** Monate je Abrechnungszeitraum — steuert Laufzeit und Verlängerung. */
  intervallMonate: number
  /** Stripe-Price-ID; leer, solange in Stripe nichts angelegt ist. */
  stripePriceId: string
  /**
   * Kostenlose Testphase in Tagen. 0 = keine.
   * Ebenfalls Platzhalter — eine Testphase ist eine kaufmännische
   * Entscheidung, keine technische.
   */
  testphaseTage: number
  /** Kurzbeschreibung für die Verkaufs- und Bestellseite. */
  beschreibung: string
}

/**
 * PLATZHALTER-BETRÄGE — siehe Kopf dieser Datei.
 *
 * Warum überhaupt Zahlen und nicht null? Damit der gesamte Weg
 * (Anzeige, Rundung, Rechnungsdarstellung, Tests) mit realistischen
 * Werten durchlaufen und geprüft werden kann. Scharf geschaltet wird
 * er ausschließlich über preiseFreigegeben().
 *
 * Jeder Wert ist zusätzlich per Env überschreibbar, damit die Freigabe
 * ohne Code-Änderung erfolgen kann.
 */
const TARIF_VORGABEN: Record<CoachTarifKey, Omit<CoachTarif, 'stripePriceId' | 'betragCent' | 'testphaseTage'>> = {
  monatlich: {
    key: 'monatlich',
    bezeichnung: 'Monatlich',
    intervallMonate: 1,
    beschreibung: 'Monatlich kündbar. Die Zahlung wird jeden Monat im Voraus fällig.',
  },
  jaehrlich: {
    key: 'jaehrlich',
    bezeichnung: 'Jährlich',
    intervallMonate: 12,
    beschreibung: 'Ein Jahr Laufzeit, Zahlung einmal im Voraus. Günstiger als zwölf Monatszahlungen.',
  },
}

/** PLATZHALTER. Nicht kaufmännisch entschieden. */
const PLATZHALTER_BETRAG_CENT: Record<CoachTarifKey, number> = {
  monatlich: 1900,
  jaehrlich: 19000,
}

/** PLATZHALTER. 0 = keine Testphase. */
const PLATZHALTER_TESTPHASE_TAGE: Record<CoachTarifKey, number> = {
  monatlich: 0,
  jaehrlich: 0,
}

const ENV_BETRAG: Record<CoachTarifKey, string> = {
  monatlich: 'COACH_PREIS_MONATLICH_CENT',
  jaehrlich: 'COACH_PREIS_JAEHRLICH_CENT',
}

const ENV_PRICE_ID: Record<CoachTarifKey, string> = {
  monatlich: 'COACH_STRIPE_PRICE_MONATLICH',
  jaehrlich: 'COACH_STRIPE_PRICE_JAEHRLICH',
}

const ENV_TESTPHASE: Record<CoachTarifKey, string> = {
  monatlich: 'COACH_TESTPHASE_MONATLICH_TAGE',
  jaehrlich: 'COACH_TESTPHASE_JAEHRLICH_TAGE',
}

function ganzzahlAusEnv(name: string, vorgabe: number): number {
  const roh = process.env[name]
  if (roh === undefined || roh === '') return vorgabe
  const wert = Number(roh)
  // Unbrauchbare Eingabe fällt auf die Vorgabe zurück statt NaN in einen
  // Zahlbetrag zu tragen. Negatives ebenso — ein negativer Preis wäre eine
  // Gutschrift und die gibt es in diesem Weg nicht.
  if (!Number.isInteger(wert) || wert < 0) return vorgabe
  return wert
}

export function tarif(key: CoachTarifKey): CoachTarif {
  return {
    ...TARIF_VORGABEN[key],
    betragCent: ganzzahlAusEnv(ENV_BETRAG[key], PLATZHALTER_BETRAG_CENT[key]),
    testphaseTage: ganzzahlAusEnv(ENV_TESTPHASE[key], PLATZHALTER_TESTPHASE_TAGE[key]),
    stripePriceId: process.env[ENV_PRICE_ID[key]] ?? '',
  }
}

export function alleTarife(): CoachTarif[] {
  return COACH_TARIF_KEYS.map(tarif)
}

export function istTarifKey(wert: unknown): wert is CoachTarifKey {
  return typeof wert === 'string' && (COACH_TARIF_KEYS as string[]).includes(wert)
}

// ═══════════════════════════════════════════════════════════════
// ABLEITUNGEN FÜR DIE ANZEIGE
// ═══════════════════════════════════════════════════════════════

/** Cent → „19,00 €". Immer über diese Funktion, nie per Hand formatiert. */
export function formatiereCent(cent: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: COACH_WAEHRUNG,
  }).format(cent / 100)
}

/**
 * Ersparnis des Jahres- gegenüber dem Monatstarif.
 * Gibt null zurück, wenn der Jahrestarif nicht günstiger ist — dann darf
 * auf der Verkaufsseite auch kein Vorteil behauptet werden.
 */
export interface Ersparnis {
  betragCent: number
  prozent: number
}

export function jahresErsparnis(): Ersparnis | null {
  const m = tarif('monatlich')
  const j = tarif('jaehrlich')
  const zwoelfMonate = m.betragCent * 12
  const diff = zwoelfMonate - j.betragCent
  if (diff <= 0 || zwoelfMonate === 0) return null
  return { betragCent: diff, prozent: Math.round((diff / zwoelfMonate) * 100) }
}

/** Monatlicher Rechenwert eines Tarifs — nur zur Vergleichsanzeige. */
export function proMonatCent(t: CoachTarif): number {
  return Math.round(t.betragCent / t.intervallMonate)
}

// ═══════════════════════════════════════════════════════════════
// VERKAUFS-BEREITSCHAFT
// ═══════════════════════════════════════════════════════════════

export type VerkaufsBereitschaft =
  | { bereit: true }
  | { bereit: false; grund: string; code: VerkaufSperreCode }

export type VerkaufSperreCode =
  | 'PREISE_NICHT_FREIGEGEBEN'
  | 'STRIPE_NICHT_KONFIGURIERT'
  | 'PREIS_ID_FEHLT'
  | 'BETRAG_UNGUELTIG'

/** Text, den Kundinnen und Kunden bei gesperrtem Verkauf sehen. */
export const VERKAUF_GESPERRT_TEXT =
  'Der PflegeCoach kann derzeit nicht online bestellt werden. Bitte stellen Sie uns eine ' +
  'Anfrage — wir melden uns mit den aktuellen Konditionen bei Ihnen zurück.'

/**
 * Darf dieser Tarif verkauft werden?
 *
 * Fail-closed an vier Stellen: Preisfreigabe, Stripe-Schlüssel,
 * Stripe-Price-ID und Betrag. Es genügt eine fehlende Voraussetzung,
 * damit nichts entgegengenommen wird.
 *
 * Der `grund` ist für Protokoll und Admin gedacht, nicht für die
 * Kundenanzeige — dort steht VERKAUF_GESPERRT_TEXT, damit keine
 * internen Konfigurationsdetails nach außen gelangen.
 */
export function istVerkaufBereit(t: CoachTarif): VerkaufsBereitschaft {
  if (!preiseFreigegeben()) {
    return {
      bereit: false,
      code: 'PREISE_NICHT_FREIGEGEBEN',
      grund: `Preisliste ist nicht freigegeben (${COACH_PREISE_FREIGEGEBEN_ENV} ist nicht 'true').`,
    }
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      bereit: false,
      code: 'STRIPE_NICHT_KONFIGURIERT',
      grund: 'STRIPE_SECRET_KEY fehlt.',
    }
  }
  if (!t.stripePriceId) {
    return {
      bereit: false,
      code: 'PREIS_ID_FEHLT',
      grund: `Stripe-Price-ID fehlt (${ENV_PRICE_ID[t.key]}).`,
    }
  }
  if (t.betragCent <= 0) {
    return {
      bereit: false,
      code: 'BETRAG_UNGUELTIG',
      grund: `Betrag für Tarif „${t.bezeichnung}" ist 0 oder negativ.`,
    }
  }
  return { bereit: true }
}

/** Ist mindestens ein Tarif verkäuflich? Steuert die Kaufen-Schaltflächen. */
export function verkaufMoeglich(): boolean {
  return alleTarife().some(t => istVerkaufBereit(t).bereit)
}
