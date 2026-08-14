// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Rechnungen für Selbstzahler
//
// WARUM EIN EIGENER RECHNUNGSWEG UND NICHT DER BESTEHENDE:
// Das Betriebs-Rechnungssystem (`invoices`, lib/billing) rechnet
// Pflegeleistungen gegenüber `clients` einer Organisation ab —
// organisationsgebunden, mit Kostenträger-, Budget- und
// Leistungsnachweis-Bezug. Eine PflegeCoach-Bestellung ist nichts
// davon: Sie hat keinen Leistungsort, keinen Kostenträger, kein Budget
// und keinen Pflegevertrag. Um sie dort einzuhängen, müsste für jede
// Käuferin ein `clients`-Datensatz in der Betriebsdatenbank entstehen —
// also ein Pflegekunde, der keiner ist. Das würde
//   * die operativen Auswertungen verfälschen (Kundenzahlen, OPOS),
//   * die Produktgrenze verletzen (kein Admin-Zugriff auf coach_*,
//     siehe Migration 20260826010000) und
//   * eine Person ohne Rechtsgrundlage in die Betriebsdatenbank tragen.
// Deshalb: eigener, schmaler Rechnungsweg im coach_*-Namensraum, mit
// eigenem Nummernkreis. Geteilt wird die Darstellung, nicht die Daten.
//
// ═══ FAIL-CLOSED BEI UNVOLLSTÄNDIGEN PFLICHTANGABEN ════════════
// § 14 Abs. 4 UStG zählt die Pflichtangaben einer Rechnung
// abschließend auf. Fehlt eine davon — allen voran die Steuernummer
// bzw. USt-IdNr., die im Impressum bis heute als „wird nach
// Finanzamt-Zuteilung ergänzt" steht —, ist die Rechnung formal
// fehlerhaft. `pruefeRechnungsangaben()` benennt die Lücken; der
// Aufrufer entscheidet, ob er ausstellt. Es wird NICHTS geraten und
// nichts stillschweigend weggelassen.
// ═══════════════════════════════════════════════════════════════

import { formatiereCent, steuerEinstellung, type CoachTarifKey } from './pricing'
import { formatDatum } from './bestellung'

// ═══════════════════════════════════════════════════════════════
// RECHNUNGSSTELLER
// ═══════════════════════════════════════════════════════════════
// Quelle der Wahrheit ist das Impressum (app/impressum/page.tsx).
// Bewusst OHNE Geschäftsführer-Namen: § 14 UStG verlangt den
// vollständigen Namen des leistenden Unternehmers, das ist die
// Gesellschaft — nicht die vertretende Person. Damit bleibt auch die
// Namens-Policy gewahrt (persönliche Namen nur in Impressum und
// Datenschutzerklärung).

export interface Rechnungssteller {
  name: string
  strasse: string
  plz: string
  ort: string
  land: string
  registergericht: string
  registernummer: string
  email: string
  /** Steuernummer ODER USt-IdNr. — Pflichtangabe, siehe Kopf. */
  steuernummer: string | null
  ustIdNr: string | null
}

export const COACH_STEUERNUMMER_ENV = 'COACH_STEUERNUMMER'
export const COACH_UST_ID_ENV = 'COACH_UST_ID_NR'

export function rechnungssteller(): Rechnungssteller {
  return {
    name: 'Alltagsengel UG (haftungsbeschränkt)',
    strasse: 'Neue Mainzer Straße 66-68',
    plz: '60311',
    ort: 'Frankfurt am Main',
    land: 'Deutschland',
    registergericht: 'Amtsgericht Frankfurt am Main',
    registernummer: 'HRB 140351',
    email: 'info@alltagsengel.care',
    // Nicht hartkodiert: Beide Nummern sind zum Zeitpunkt dieser
    // Implementierung noch nicht zugeteilt (Impressum: „wird nach
    // Finanzamt-Zuteilung ergänzt"). Eine erfundene Nummer auf einer
    // Rechnung wäre schlimmer als eine fehlende.
    steuernummer: process.env[COACH_STEUERNUMMER_ENV] || null,
    ustIdNr: process.env[COACH_UST_ID_ENV] || null,
  }
}

// ═══════════════════════════════════════════════════════════════
// NUMMERNKREIS
// ═══════════════════════════════════════════════════════════════
// Eigener Kreis mit eigenem Präfix, damit PflegeCoach-Rechnungen nie
// mit Pflege-Rechnungen kollidieren und in der Buchhaltung auf einen
// Blick unterscheidbar sind. Die laufende Nummer kommt aus einer
// Datenbank-Sequenz (Migration 20260907000000) — nicht aus einem
// SELECT max()+1, das unter zwei gleichzeitigen Zahlungen dieselbe
// Nummer zweimal vergeben würde.

export const RECHNUNG_PRAEFIX = 'PC'

/** `PC-2026-000042` — Präfix, Jahr, sechsstellige laufende Nummer. */
export function rechnungsnummer(jahr: number, laufend: number): string {
  return `${RECHNUNG_PRAEFIX}-${jahr}-${String(laufend).padStart(6, '0')}`
}

const NUMMER_MUSTER = new RegExp(`^${RECHNUNG_PRAEFIX}-\\d{4}-\\d{6}$`)

export function istRechnungsnummerGueltig(wert: string): boolean {
  return NUMMER_MUSTER.test(wert)
}

// ═══════════════════════════════════════════════════════════════
// RECHNUNGSDATEN
// ═══════════════════════════════════════════════════════════════

export interface RechnungsEmpfaenger {
  name: string
  /** Anschrift, wie sie im Checkout erhoben wurde. Zeilenweise. */
  anschrift: string[]
  email: string
}

export interface RechnungsDaten {
  nummer: string
  /** Ausstellungsdatum, ISO. */
  datum: string
  /** Leistungszeitraum — bei Abos der bezahlte Zeitraum. */
  leistung_von: string
  leistung_bis: string
  tarif: CoachTarifKey
  tarif_bezeichnung: string
  /** Bruttobetrag in Cent — der tatsächlich eingezogene Betrag. */
  brutto_cent: number
  empfaenger: RechnungsEmpfaenger
}

export interface RechnungsPosition {
  bezeichnung: string
  zeitraum: string
  nettoCent: number
  steuerCent: number
  bruttoCent: number
}

export interface AufbereiteteRechnung {
  nummer: string
  datumAnzeige: string
  steller: Rechnungssteller
  empfaenger: RechnungsEmpfaenger
  position: RechnungsPosition
  /** Hinweis auf Steuerbefreiung (§ 19 UStG) — null bei Regelbesteuerung. */
  steuerHinweis: string | null
  steuersatzProzent: number
  summeNettoAnzeige: string
  summeSteuerAnzeige: string
  summeBruttoAnzeige: string
  /** Zahlungshinweis: bei Stripe bereits eingezogen, keine Überweisung nötig. */
  zahlungshinweis: string
}

/**
 * Rechnet den Bruttobetrag in Netto und Steuer auf.
 *
 * Rückwärts aus dem Brutto, nicht vorwärts aus einem Netto: Eingezogen
 * wird über Stripe genau der Bruttobetrag aus der Preisliste. Würde man
 * netto rechnen und dann Steuer aufschlagen, ergäbe die Rundung
 * gelegentlich einen Cent Abweichung zum tatsächlich abgebuchten
 * Betrag — und eine Rechnung, deren Summe nicht der Abbuchung
 * entspricht, ist wertlos.
 */
export function zerlegeBrutto(bruttoCent: number, satzProzent: number): { nettoCent: number; steuerCent: number } {
  if (satzProzent <= 0) return { nettoCent: bruttoCent, steuerCent: 0 }
  const netto = Math.round(bruttoCent / (1 + satzProzent / 100))
  return { nettoCent: netto, steuerCent: bruttoCent - netto }
}

export function bereiteRechnungAuf(daten: RechnungsDaten): AufbereiteteRechnung {
  const steuer = steuerEinstellung()
  const { nettoCent, steuerCent } = zerlegeBrutto(daten.brutto_cent, steuer.satzProzent)
  const zeitraum = `${formatDatum(daten.leistung_von)} – ${formatDatum(daten.leistung_bis)}`

  return {
    nummer: daten.nummer,
    datumAnzeige: formatDatum(daten.datum),
    steller: rechnungssteller(),
    empfaenger: daten.empfaenger,
    position: {
      bezeichnung: `Digitaler PflegeCoach — Zugang, Tarif ${daten.tarif_bezeichnung}`,
      zeitraum,
      nettoCent,
      steuerCent,
      bruttoCent: daten.brutto_cent,
    },
    steuerHinweis: steuer.hinweis,
    steuersatzProzent: steuer.satzProzent,
    summeNettoAnzeige: formatiereCent(nettoCent),
    summeSteuerAnzeige: formatiereCent(steuerCent),
    summeBruttoAnzeige: formatiereCent(daten.brutto_cent),
    zahlungshinweis:
      'Der Betrag wurde bereits über das von Ihnen gewählte Zahlungsmittel eingezogen. ' +
      'Diese Rechnung dient Ihrem Nachweis — bitte überweisen Sie nichts.',
  }
}

// ═══════════════════════════════════════════════════════════════
// PFLICHTANGABEN-PRÜFUNG (§ 14 Abs. 4 UStG)
// ═══════════════════════════════════════════════════════════════

export interface RechnungsPruefung {
  vollstaendig: boolean
  /** Klartext-Bezeichnung jeder fehlenden Pflichtangabe. */
  fehlend: string[]
}

/**
 * Prüft, ob alle Pflichtangaben vorliegen.
 *
 * Bewusst KEIN Wurf und keine Sperre in dieser Funktion: Ob eine
 * unvollständige Rechnung gar nicht erst ausgestellt oder mit Vermerk
 * ausgestellt wird, ist eine kaufmännische Entscheidung. Die Funktion
 * stellt sie nur fest — sichtbar, benennbar und testbar, statt dass die
 * Lücke unbemerkt bleibt.
 */
export function pruefeRechnungsangaben(daten: RechnungsDaten): RechnungsPruefung {
  const steller = rechnungssteller()
  const fehlend: string[] = []

  if (!steller.steuernummer && !steller.ustIdNr) {
    fehlend.push(
      `Steuernummer oder Umsatzsteuer-Identifikationsnummer des Rechnungsstellers ` +
      `(${COACH_STEUERNUMMER_ENV} bzw. ${COACH_UST_ID_ENV})`
    )
  }
  if (!istRechnungsnummerGueltig(daten.nummer)) {
    fehlend.push('Fortlaufende Rechnungsnummer im gültigen Format')
  }
  if (!daten.empfaenger.name.trim()) {
    fehlend.push('Name des Leistungsempfängers')
  }
  if (daten.empfaenger.anschrift.filter(z => z.trim()).length === 0) {
    fehlend.push('Anschrift des Leistungsempfängers')
  }
  if (!daten.datum) fehlend.push('Ausstellungsdatum')
  if (!daten.leistung_von || !daten.leistung_bis) fehlend.push('Leistungszeitraum')
  if (!(daten.brutto_cent > 0)) fehlend.push('Entgelt')

  return { vollstaendig: fehlend.length === 0, fehlend }
}

// ═══════════════════════════════════════════════════════════════
// DARSTELLUNG
// ═══════════════════════════════════════════════════════════════

/**
 * Rechnung als eigenständiges HTML-Dokument.
 *
 * HTML und nicht PDF: Der Browser druckt es über „Speichern als PDF"
 * in genau der Qualität, die hier gebraucht wird, und das Projekt
 * müsste sonst eine PDF-Bibliothek in eine Serverless-Funktion ziehen.
 * Dieselbe Entscheidung wie beim Verlaufsbericht (/pflegecoach/bericht).
 *
 * Alle Werte sind bereits aufbereitete Strings; eingesetzt wird nur, was
 * durch escapeHtml gegangen ist — Empfängername und Anschrift stammen
 * aus einer Formulareingabe.
 */
export function rechnungHtml(r: AufbereiteteRechnung, escapeHtml: (s: string) => string): string {
  const anschrift = r.empfaenger.anschrift
    .filter(z => z.trim())
    .map(z => escapeHtml(z))
    .join('<br>')

  const steuerZeile = r.steuerHinweis
    ? `<tr><td colspan="2" class="hinweis">${escapeHtml(r.steuerHinweis)}</td></tr>`
    : `<tr><td>zzgl. ${r.steuersatzProzent} % Umsatzsteuer</td><td class="r">${r.summeSteuerAnzeige}</td></tr>`

  const steuerNummerZeile = r.steller.ustIdNr
    ? `USt-IdNr.: ${escapeHtml(r.steller.ustIdNr)}`
    : r.steller.steuernummer
      ? `Steuernummer: ${escapeHtml(r.steller.steuernummer)}`
      : ''

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Rechnung ${escapeHtml(r.nummer)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1A1612; max-width: 760px; margin: 0 auto; padding: 40px 24px; line-height: 1.6; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .absender { font-size: 12px; color: #666; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 32px; }
  .empfaenger { margin-bottom: 32px; }
  .meta { margin-bottom: 24px; font-size: 14px; }
  .meta div { margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 14px; }
  th, td { padding: 10px 8px; text-align: left; border-bottom: 1px solid #eee; }
  .r { text-align: right; white-space: nowrap; }
  .summe td { font-weight: 700; border-top: 2px solid #1A1612; border-bottom: none; font-size: 16px; }
  .hinweis { color: #555; font-style: italic; }
  .fuss { margin-top: 40px; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 12px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="absender">
    ${escapeHtml(r.steller.name)} · ${escapeHtml(r.steller.strasse)} · ${escapeHtml(r.steller.plz)} ${escapeHtml(r.steller.ort)}
  </div>

  <div class="empfaenger">
    ${escapeHtml(r.empfaenger.name)}<br>${anschrift}
  </div>

  <h1>Rechnung ${escapeHtml(r.nummer)}</h1>

  <div class="meta">
    <div>Rechnungsdatum: ${escapeHtml(r.datumAnzeige)}</div>
    <div>Leistungszeitraum: ${escapeHtml(r.position.zeitraum)}</div>
  </div>

  <table>
    <thead>
      <tr><th>Leistung</th><th class="r">Betrag</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>${escapeHtml(r.position.bezeichnung)}<br><span class="hinweis">${escapeHtml(r.position.zeitraum)}</span></td>
        <td class="r">${r.summeNettoAnzeige}</td>
      </tr>
      ${steuerZeile}
      <tr class="summe"><td>Gesamtbetrag</td><td class="r">${r.summeBruttoAnzeige}</td></tr>
    </tbody>
  </table>

  <p>${escapeHtml(r.zahlungshinweis)}</p>

  <div class="fuss">
    ${escapeHtml(r.steller.name)}, ${escapeHtml(r.steller.strasse)}, ${escapeHtml(r.steller.plz)} ${escapeHtml(r.steller.ort)}<br>
    ${escapeHtml(r.steller.registergericht)}, ${escapeHtml(r.steller.registernummer)}<br>
    ${steuerNummerZeile ? steuerNummerZeile + '<br>' : ''}
    E-Mail: ${escapeHtml(r.steller.email)}
  </div>
</body>
</html>`
}
