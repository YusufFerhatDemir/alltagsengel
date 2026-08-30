// ═══════════════════════════════════════════════════════════════════════════
// SEGMENTE — wer bekommt eine Kampagne
//
// ── WARUM SEGMENTE IM CODE STEHEN UND NICHT IN DER DATENBANK ───────────────
// Ein frei zusammensetzbarer Filter aus der Oberflaeche ist eine Abfrage,
// die jemand ueber ein Formular in die Datenbank schreibt. Genau daran ist
// die Suche schon einmal aufgelaufen: ein roher Suchbegriff in
// PostgREST-`.or()` ist keine Eingabe, sondern eine freie Abfrage
// (lib/utils/postgrest.ts, postgrestSuchwert). Bei einem Verteiler waere
// die Folge nicht ein falsches Suchergebnis, sondern eine Mail an den
// falschen Personenkreis — und die holt niemand zurueck.
//
// Deshalb: Segmente sind ein geschlossener Katalog. Die Kampagne speichert
// nur den SCHLUESSEL, die Regel steht hier. Ein unbekannter Schluessel ist
// ein Fehler, kein leeres Segment (fail-closed).
//
// ── DIE REGELN SIND REINE FUNKTIONEN ───────────────────────────────────────
// `passt(kontakt, heute)` bekommt das Bezugsdatum ausdruecklich mit und
// liest nirgends die Uhr. Sonst waere „inaktiv seit 30 Tagen" nicht
// testbar, und der Trockenlauf von gestern haette ein anderes Ergebnis als
// der Versand von heute.
//
// ── WAS EIN SEGMENT NICHT ENTSCHEIDET ──────────────────────────────────────
// Ob jemand angeschrieben werden DARF. Das entscheidet allein die
// Einwilligung (lib/marketing/einwilligung.ts). Ein Segment beantwortet
// „passt die Person thematisch", nicht „ist es erlaubt". Die beiden Fragen
// zu vermischen waere der schnellste Weg zu einer Kampagne, die an
// Widersprechende geht.
// ═══════════════════════════════════════════════════════════════════════════

import type { ConsentTyp, MarketingKontakt, Zielgruppe } from './typen'

/** Tage zwischen zwei ISO-Daten. Negativ, wenn `datum` in der Zukunft liegt. */
export function tageSeit(datum: string | null, heute: Date): number | null {
  if (!datum) return null
  const t = Date.parse(datum)
  if (Number.isNaN(t)) return null
  return Math.floor((heute.getTime() - t) / 86_400_000)
}

/**
 * Engagement-Score 0–100.
 *
 * Bewusst einfach und nachvollziehbar statt gewichtet-geheimnisvoll: der
 * Wert steuert nur, wen man ZUERST anspricht, und muss deshalb erklaerbar
 * sein, wenn jemand fragt, warum er in „schlaeft ein" gelandet ist.
 *
 *   bis 40 Punkte  Buchungen (10 je Buchung, gedeckelt)
 *   bis 40 Punkte  Aktualitaet der letzten Aktivitaet
 *   bis 20 Punkte  Vollstaendigkeit (Registrierung, PLZ)
 *
 * Ein Kontakt ohne jede Aktivitaet landet bei 0 — nicht bei „unbekannt".
 * Das ist Absicht: „nie etwas getan" ist eine Aussage, kein fehlender Wert.
 */
export function engagementScore(k: MarketingKontakt, heute: Date): number {
  const buchungen = Math.min(40, Math.max(0, k.anzahlBuchungen) * 10)

  const tage = tageSeit(k.letzteAktivitaet, heute)
  let aktualitaet = 0
  if (tage !== null) {
    if (tage <= 7) aktualitaet = 40
    else if (tage <= 30) aktualitaet = 30
    else if (tage <= 90) aktualitaet = 20
    else if (tage <= 180) aktualitaet = 10
    else aktualitaet = 0
  }

  let vollstaendigkeit = 0
  if (k.registrierungVollstaendig) vollstaendigkeit += 12
  if (k.plz) vollstaendigkeit += 8

  return Math.min(100, buchungen + aktualitaet + vollstaendigkeit)
}

/** Grobe Einordnung des Engagements fuer die Anzeige. */
export function engagementStufe(score: number): 'hoch' | 'mittel' | 'niedrig' | 'kalt' {
  if (score >= 70) return 'hoch'
  if (score >= 40) return 'mittel'
  if (score >= 15) return 'niedrig'
  return 'kalt'
}

export interface Segment {
  key: string
  name: string
  /** Ein Satz: wen dieses Segment meint. Steht so auch in der Oberflaeche. */
  beschreibung: string
  zielgruppe: Zielgruppe
  /**
   * Welche Einwilligung eine Kampagne auf dieses Segment mindestens
   * braucht. Ein Segment kann nur mit einer Vorlage kombiniert werden,
   * die dieselbe Einwilligungsart verlangt.
   */
  consentTyp: ConsentTyp
  /** Die Regel. Rein, ohne Uhr, ohne Datenbank. */
  passt(kontakt: MarketingKontakt, heute: Date): boolean
}

/** Grundbedingung fuer JEDES Segment: eine echte, lebende Person mit Adresse. */
function echterKontakt(k: MarketingKontakt): boolean {
  return Boolean(k.email) && !k.istTestkonto && !k.istGeloescht
}

const inaktivSeit = (tage: number) => (k: MarketingKontakt, heute: Date): boolean => {
  const t = tageSeit(k.letzteAktivitaet, heute)
  // Nie aktiv gewesen zaehlt als inaktiv — sonst faellt genau die Gruppe
  // heraus, die eine Reaktivierung am noetigsten haette.
  return t === null || t >= tage
}

/**
 * DER KATALOG.
 *
 * Reihenfolge = Anzeigereihenfolge. Wer ein Segment ergaenzt, ergaenzt den
 * Test in lib/marketing/segmente.test.ts mit.
 */
export const SEGMENTE: readonly Segment[] = [
  // ── Kundschaft ─────────────────────────────────────────────────────────
  {
    key: 'kunden_alle',
    name: 'Alle Kundinnen und Kunden',
    beschreibung: 'Jedes Kundenkonto mit E-Mail-Adresse, ohne Testkonten.',
    zielgruppe: 'kunde',
    consentTyp: 'newsletter',
    passt: (k) => echterKontakt(k) && k.rolle === 'kunde',
  },
  {
    key: 'kunden_neu_30t',
    name: 'Neu registriert (30 Tage)',
    beschreibung: 'Kundenkonten, die in den letzten 30 Tagen angelegt wurden — Zielgruppe der Willkommensserie.',
    zielgruppe: 'kunde',
    consentTyp: 'newsletter',
    passt: (k, heute) => {
      if (!echterKontakt(k) || k.rolle !== 'kunde') return false
      const t = tageSeit(k.registriertAm, heute)
      return t !== null && t <= 30
    },
  },
  {
    key: 'kunden_registrierung_unvollstaendig',
    name: 'Registrierung unvollständig',
    beschreibung: 'Kundenkonten, deren Registrierung begonnen, aber nie abgeschlossen wurde.',
    zielgruppe: 'kunde',
    consentTyp: 'produktinfo',
    passt: (k) => echterKontakt(k) && k.rolle === 'kunde' && !k.registrierungVollstaendig,
  },
  {
    key: 'kunden_ohne_buchung',
    name: 'Registriert, aber nie gebucht',
    beschreibung: 'Vollständig registrierte Kundenkonten ohne eine einzige Buchung.',
    zielgruppe: 'kunde',
    consentTyp: 'produktinfo',
    passt: (k) =>
      echterKontakt(k) && k.rolle === 'kunde' && k.registrierungVollstaendig && k.anzahlBuchungen === 0,
  },
  {
    key: 'kunden_aktiv',
    name: 'Aktive Kundschaft',
    beschreibung: 'Mindestens eine Buchung und in den letzten 90 Tagen aktiv.',
    zielgruppe: 'kunde',
    consentTyp: 'newsletter',
    passt: (k, heute) => {
      if (!echterKontakt(k) || k.rolle !== 'kunde' || k.anzahlBuchungen === 0) return false
      const t = tageSeit(k.letzteAktivitaet, heute)
      return t !== null && t < 90
    },
  },
  {
    key: 'kunden_inaktiv_30t',
    name: 'Inaktiv seit 30 Tagen',
    beschreibung: 'Kundschaft mit früherer Buchung, seit 30 Tagen ohne Aktivität.',
    zielgruppe: 'kunde',
    consentTyp: 'produktinfo',
    passt: (k, heute) =>
      echterKontakt(k) && k.rolle === 'kunde' && k.anzahlBuchungen > 0 && inaktivSeit(30)(k, heute),
  },
  {
    key: 'kunden_inaktiv_60t',
    name: 'Inaktiv seit 60 Tagen',
    beschreibung: 'Zweite Stufe der Reaktivierung.',
    zielgruppe: 'kunde',
    consentTyp: 'produktinfo',
    passt: (k, heute) =>
      echterKontakt(k) && k.rolle === 'kunde' && k.anzahlBuchungen > 0 && inaktivSeit(60)(k, heute),
  },
  {
    key: 'kunden_inaktiv_90t',
    name: 'Inaktiv seit 90 Tagen',
    beschreibung: 'Letzte Stufe der Reaktivierung, bevor der Kontakt ruht.',
    zielgruppe: 'kunde',
    consentTyp: 'produktinfo',
    passt: (k, heute) =>
      echterKontakt(k) && k.rolle === 'kunde' && k.anzahlBuchungen > 0 && inaktivSeit(90)(k, heute),
  },
  {
    key: 'kunden_engagement_hoch',
    name: 'Hohes Engagement',
    beschreibung: 'Kundschaft mit Engagement-Score ab 70 — Zielgruppe des Empfehlungsprogramms.',
    zielgruppe: 'kunde',
    consentTyp: 'produktinfo',
    passt: (k, heute) => echterKontakt(k) && k.rolle === 'kunde' && engagementScore(k, heute) >= 70,
  },

  // ── Engel ──────────────────────────────────────────────────────────────
  {
    key: 'engel_alle',
    name: 'Alle Engel',
    beschreibung: 'Jedes Engel-Konto mit E-Mail-Adresse, ohne Testkonten.',
    zielgruppe: 'engel',
    consentTyp: 'engel_einsaetze',
    passt: (k) => echterKontakt(k) && k.rolle === 'engel',
  },
  {
    key: 'engel_profil_unvollstaendig',
    name: 'Profil unvollständig',
    beschreibung: 'Engel ohne abgeschlossene Registrierung oder ohne hinterlegte Verfügbarkeit.',
    zielgruppe: 'engel',
    consentTyp: 'engel_einsaetze',
    passt: (k) =>
      echterKontakt(k) &&
      k.rolle === 'engel' &&
      (!k.registrierungVollstaendig || k.verfuegbarkeitsFenster === 0),
  },
  {
    key: 'engel_ohne_fuehrungszeugnis',
    name: 'Führungszeugnis fehlt oder läuft ab',
    beschreibung: 'Engel ohne gültiges Führungszeugnis oder mit Ablauf in den nächsten 60 Tagen.',
    zielgruppe: 'engel',
    consentTyp: 'engel_einsaetze',
    passt: (k, heute) => {
      if (!echterKontakt(k) || k.rolle !== 'engel') return false
      if (!k.fuehrungszeugnisGueltigBis) return true
      const restTage = -(tageSeit(k.fuehrungszeugnisGueltigBis, heute) ?? 0)
      return restTage <= 60
    },
  },
  {
    key: 'engel_verfuegbar',
    name: 'Verfügbare Engel',
    beschreibung: 'Engel mit Einsatzfreigabe und mindestens einem hinterlegten Zeitfenster.',
    zielgruppe: 'engel',
    consentTyp: 'engel_einsaetze',
    passt: (k) =>
      echterKontakt(k) && k.rolle === 'engel' && k.einsatzfreigabe && k.verfuegbarkeitsFenster > 0,
  },
  {
    key: 'engel_qualifiziert',
    name: 'Qualifizierte Engel',
    beschreibung: 'Engel mit hinterlegter Qualifikation bzw. Zertifizierung.',
    zielgruppe: 'engel',
    consentTyp: 'engel_einsaetze',
    passt: (k) => echterKontakt(k) && k.rolle === 'engel' && k.qualifiziert,
  },
  {
    key: 'engel_ohne_einsatz',
    name: 'Registriert, aber nie im Einsatz',
    beschreibung: 'Engel-Konten ohne einen einzigen Einsatz.',
    zielgruppe: 'engel',
    consentTyp: 'engel_einsaetze',
    passt: (k) => echterKontakt(k) && k.rolle === 'engel' && k.anzahlBuchungen === 0,
  },
  {
    key: 'engel_inaktiv_60t',
    name: 'Engel seit 60 Tagen ohne Einsatz',
    beschreibung: 'Engel mit früheren Einsätzen, seit 60 Tagen ohne Aktivität.',
    zielgruppe: 'engel',
    consentTyp: 'engel_einsaetze',
    passt: (k, heute) =>
      echterKontakt(k) && k.rolle === 'engel' && k.anzahlBuchungen > 0 && inaktivSeit(60)(k, heute),
  },
  {
    key: 'engel_neu_30t',
    name: 'Neu registrierte Engel (30 Tage)',
    beschreibung: 'Zielgruppe der Onboarding-Serie.',
    zielgruppe: 'engel',
    consentTyp: 'engel_einsaetze',
    passt: (k, heute) => {
      if (!echterKontakt(k) || k.rolle !== 'engel') return false
      const t = tageSeit(k.registriertAm, heute)
      return t !== null && t <= 30
    },
  },

  // ── Übergreifend ───────────────────────────────────────────────────────
  {
    key: 'abonnenten_newsletter',
    name: 'Newsletter-Abonnenten',
    beschreibung: 'Anmeldungen über das Formular auf der Website, ohne Kundenkonto.',
    zielgruppe: 'lead',
    consentTyp: 'newsletter',
    passt: (k) => echterKontakt(k) && k.rolle === 'abonnent',
  },
  {
    key: 'bewerber_offen',
    name: 'Bewerberinnen und Bewerber',
    beschreibung: 'Eingegangene Bewerbungen mit E-Mail-Adresse.',
    zielgruppe: 'bewerber',
    consentTyp: 'produktinfo',
    passt: (k) => echterKontakt(k) && k.rolle === 'bewerber',
  },
]

const NACH_KEY = new Map(SEGMENTE.map((s) => [s.key, s]))

/**
 * Segment zum Schluessel. Wirft bei unbekanntem Schluessel.
 *
 * FAIL-CLOSED: ein unbekanntes Segment darf NICHT als leeres Segment
 * durchgehen. Sonst versendet eine Kampagne mit vertipptem Schluessel
 * still an niemanden — und der naechste Versuch, den Tippfehler zu
 * beheben, waere ein zweiter Versand.
 */
export function segmentAus(key: string): Segment {
  const s = NACH_KEY.get(key)
  if (!s) {
    throw new Error(
      `Unbekanntes Segment '${key}'. Zulässig sind: ${SEGMENTE.map((x) => x.key).join(', ')}`,
    )
  }
  return s
}

export function istSegmentKey(wert: unknown): wert is string {
  return typeof wert === 'string' && NACH_KEY.has(wert)
}

/** Alle Kontakte eines Segments. Rein — die Liste kommt von aussen. */
export function filtereSegment(
  kontakte: readonly MarketingKontakt[],
  key: string,
  heute: Date,
): MarketingKontakt[] {
  const segment = segmentAus(key)
  return kontakte.filter((k) => segment.passt(k, heute))
}

/**
 * Zusaetzlicher Regionsfilter.
 *
 * PLZ-Praefixe statt Bundesland, weil das Einsatzgebiet ueber PLZ
 * geschnitten wird (lib/hessen-plz.ts) und ein Bundesland dafuer zu grob
 * ist. Leere Liste = keine Einschraenkung; das ist KEIN fail-open, weil
 * die Region ein zusaetzlicher Filter ist und nie eine Erlaubnis.
 */
export function filtereRegion(
  kontakte: readonly MarketingKontakt[],
  plzPraefixe: readonly string[],
): MarketingKontakt[] {
  if (plzPraefixe.length === 0) return [...kontakte]
  const sauber = plzPraefixe
    .map((p) => String(p).replace(/\D/g, ''))
    .filter((p) => p.length > 0 && p.length <= 5)
  if (sauber.length === 0) return []
  return kontakte.filter((k) => k.plz != null && sauber.some((p) => k.plz!.startsWith(p)))
}
