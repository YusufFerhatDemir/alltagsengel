// ═══════════════════════════════════════════════════════════════
// E-Mail-Vorlagen für den PflegeCoach-Selbstzahler-Weg
//
// Vier Anlässe: Bestellbestätigung, fehlgeschlagene Zahlung,
// Kündigungsbestätigung, Widerrufsbestätigung.
//
// ABSENDER: immer „Alltagsengel <info@alltagsengel.care>", Unterschrift
// immer „Ihr Team von Alltagsengel" — nie ein persönlicher Name
// (Namens-Policy; persönliche Namen erscheinen ausschließlich in
// Impressum und Datenschutzerklärung).
//
// EIGENE VORLAGE STATT sendEmailNotification(): Der allgemeine Helfer
// aus lib/notifications.ts duzt und trägt Marketing-Elemente des
// Plattform-Layouts. Der PflegeCoach siezt durchgehend und ist
// werbefrei — das ist keine Geschmacksfrage, sondern Teil der
// Produktabgrenzung.
//
// KEINE GESUNDHEITSDATEN IN E-MAILS: Keine dieser Mails enthält
// Assessment-Werte, Ziele, Pflegegrad oder sonstige Angaben aus dem
// Produkt. Enthalten sind ausschließlich Vertragsdaten — Tarif, Betrag,
// Zeitraum. E-Mail ist ein unverschlüsselter Transportweg.
//
// FEHLER SIND NIE FATAL: Jede Funktion fängt ihre Fehler selbst und
// gibt false zurück. Eine nicht zugestellte Bestätigungsmail darf
// niemals dazu führen, dass eine bezahlte Freischaltung ausbleibt oder
// ein Stripe-Webhook mit 500 antwortet (Stripe würde ihn sonst endlos
// wiederholen).
// ═══════════════════════════════════════════════════════════════

import { sendRawEmail } from '@/lib/notifications'
import { formatiereCent } from '@/lib/coach/pricing'
import { formatDatum } from '@/lib/coach/bestellung'
import { COACH_SUPPORT_EMAIL } from '@/lib/coach/version'
import { WIDERRUFSFRIST_TAGE } from '@/lib/coach/bestellung'
import { logger } from '@/lib/logger'
const log = logger.child('coach-mail')

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://alltagsengel.care'

/** Minimales HTML-Escaping für alles, was aus Nutzereingaben stammt. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Gemeinsames Layout. Ruhig, ohne Werbeelemente, mit gut lesbarer
 * Schriftgröße (15–16 px) — die Zielgruppe liest das oft am Telefon
 * und häufig nicht mit den besten Augen.
 */
function layout(titel: string, inhalt: string): string {
  return `
  <div style="background:#F7F2EA;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px">
      <h1 style="color:#1A1612;font-size:20px;margin:0 0 16px">${esc(titel)}</h1>
      ${inhalt}
      <p style="color:#666;font-size:14px;line-height:1.6;margin-top:24px">
        Fragen? Schreiben Sie uns an
        <a href="mailto:${COACH_SUPPORT_EMAIL}" style="color:#8B6F3D">${COACH_SUPPORT_EMAIL}</a>.
        Bitte senden Sie uns keine Gesundheitsdaten per E-Mail.
      </p>
      <p style="color:#888;font-size:13px;margin-top:20px;line-height:1.6">
        Herzliche Grüße<br>Ihr Team von Alltagsengel
      </p>
    </div>
    <p style="max-width:560px;margin:12px auto 0;color:#999;font-size:11px;line-height:1.5;text-align:center">
      Alltagsengel UG (haftungsbeschränkt) · Neue Mainzer Straße 66-68 · 60311 Frankfurt am Main<br>
      <a href="${APP_URL}/impressum" style="color:#999">Impressum</a> ·
      <a href="${APP_URL}/pflegecoach/datenschutz" style="color:#999">Datenschutz</a> ·
      <a href="${APP_URL}/pflegecoach/agb" style="color:#999">AGB</a> ·
      <a href="${APP_URL}/pflegecoach/widerruf" style="color:#999">Widerrufsbelehrung</a>
    </p>
  </div>`
}

function absatz(text: string): string {
  return `<p style="color:#444;font-size:15px;line-height:1.65;margin:0 0 14px">${text}</p>`
}

function datenTabelle(zeilen: Array<[string, string]>): string {
  return `<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:15px">${zeilen
    .map(
      ([k, v]) =>
        `<tr><td style="padding:7px 0;color:#777;vertical-align:top;width:45%">${esc(k)}</td>` +
        `<td style="padding:7px 0;color:#1A1612;font-weight:600">${esc(v)}</td></tr>`
    )
    .join('')}</table>`
}

function knopf(text: string, pfad: string): string {
  return `<p style="margin:22px 0">
    <a href="${APP_URL}${pfad}" style="display:inline-block;background:#8B6F3D;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:600">${esc(text)}</a>
  </p>`
}

/**
 * Versendet eine der vier PflegeCoach-Mails.
 *
 * ── WARUM UEBER sendRawEmail() UND NICHT MEHR DIREKT UEBER DAS SDK ────
 * Dieses Modul hatte einen EIGENEN Resend-Client und damit keine der vier
 * Haertungen, die lib/notifications.ts fuer den Provider-Aufruf hat:
 *
 *   1. KEIN ZEITLIMIT. Das Resend-SDK setzt keines. Antwortet der Provider
 *      nicht, haengt der Aufruf, bis die Serverless-Funktion abgeraeumt
 *      wird — ohne Log, ohne Rueckgabewert, ohne jede Spur.
 *   2. ERFOLG OHNE PROVIDER-ID. `const { error } = …; if (error) …;
 *      return true` meldete Erfolg, sobald kein Fehler kam — auch dann,
 *      wenn Resend keine Nachrichten-ID lieferte. Die ID IST die
 *      Empfangsbestaetigung; ohne sie war das `true` eine Behauptung.
 *   3. STATUSCODE VERLOREN. Ohne ihn ist nicht unterscheidbar, ob ein
 *      weiterer Versuch Sinn hat (422 dauerhaft vs. 429/5xx voruebergehend).
 *   4. Keine einheitliche Fehlerklassifizierung.
 *
 * sendRawEmail() bringt alle vier mit und legt — anders als
 * sendEmailNotification() — KEIN Layout um das HTML. Die Produktabgrenzung
 * des PflegeCoach (siezend, werbefrei) bleibt damit unberuehrt: Betreff
 * und HTML kommen weiter vollstaendig aus diesem Modul.
 *
 * Der Absender ist in beiden Faellen derselbe („Alltagsengel", nie ein
 * persoenlicher Name).
 *
 * OFFEN: eine Zeile in notification_delivery_log wird hier noch nicht
 * geschrieben — dafuer braeuchte ZustellKontext eine organizationId, die
 * diesen vier Funktionen bisher nicht uebergeben wird. Ohne Protokollzeile
 * ist eine gescheiterte Coach-Mail nicht wiederholbar.
 */
async function sende(an: string, betreff: string, html: string, anlass: string): Promise<boolean> {
  const ergebnis = await sendRawEmail({ to: an, subject: betreff, html })

  if (!ergebnis.ok) {
    if (ergebnis.uebersprungen) {
      log.error(`RESEND_API_KEY fehlt — ${anlass} nicht versendet`)
    } else {
      log.errorWithException(`${anlass} fehlgeschlagen:`, ergebnis.fehler)
    }
    return false
  }
  return true
}

// ═══════════════════════════════════════════════════════════════
// 1. BESTELLBESTÄTIGUNG
// ═══════════════════════════════════════════════════════════════

export interface BestellbestaetigungDaten {
  email: string
  name: string
  tarifBezeichnung: string
  betragCent: number
  laufzeitBis: string
  widerrufsfristEnde: string
  rechnungsnummer?: string | null
}

/**
 * Pflichtinhalte: bestellte Leistung, Preis, Laufzeit und die
 * Widerrufsbelehrung in Textform (Art. 246a § 1 Abs. 2 EGBGB — die
 * Belehrung muss auf einem dauerhaften Datenträger zugehen, die
 * Anzeige auf der Bestellseite allein genügt dafür nicht).
 */
export async function sendeBestellbestaetigung(d: BestellbestaetigungDaten): Promise<boolean> {
  const zeilen: Array<[string, string]> = [
    ['Leistung', 'Digitaler PflegeCoach — Zugang'],
    ['Tarif', d.tarifBezeichnung],
    ['Betrag', formatiereCent(d.betragCent)],
    ['Bezahlt bis', formatDatum(d.laufzeitBis)],
  ]
  if (d.rechnungsnummer) zeilen.push(['Rechnungsnummer', d.rechnungsnummer])

  const html = layout(
    'Ihr Zugang ist freigeschaltet',
    absatz(`Guten Tag ${esc(d.name)},`) +
      absatz('vielen Dank für Ihre Bestellung. Ihr Zugang zum Digitalen PflegeCoach ist ab sofort freigeschaltet.') +
      datenTabelle(zeilen) +
      knopf('Zum PflegeCoach', '/pflegecoach') +
      absatz(
        `<strong>Ihr Widerrufsrecht:</strong> Sie können diesen Vertrag binnen ${WIDERRUFSFRIST_TAGE} Tagen ohne Angabe von Gründen widerrufen — ` +
          `die Frist läuft bis zum ${esc(formatDatum(d.widerrufsfristEnde))}. Sie erhalten dann den vollen Betrag zurück; ` +
          'Wertersatz für die zwischenzeitliche Nutzung verlangen wir nicht. Den Widerruf erklären Sie am einfachsten ' +
          `in Ihrem Konto oder formlos per E-Mail an ${COACH_SUPPORT_EMAIL}. ` +
          `Die vollständige Belehrung samt Muster-Widerrufsformular finden Sie unter <a href="${APP_URL}/pflegecoach/widerruf" style="color:#8B6F3D">alltagsengel.care/pflegecoach/widerruf</a>.`
      ) +
      absatz(
        'Ihre Rechnung und den Stand Ihres Zugangs finden Sie jederzeit in Ihrem Konto. ' +
          'Dort können Sie auch kündigen, Ihre Daten herunterladen oder löschen.'
      ) +
      absatz(
        '<span style="color:#777;font-size:14px">Zur Einordnung: Der PflegeCoach ist kein Medizinprodukt und keine ' +
          'Leistung der gesetzlichen Pflege- oder Krankenversicherung. Er ersetzt keine ärztliche oder ' +
          'pflegefachliche Beratung. In Notfällen wählen Sie bitte die 112.</span>'
      )
  )

  return sende(d.email, 'Ihre Bestellung: Digitaler PflegeCoach', html, 'Bestellbestätigung')
}

// ═══════════════════════════════════════════════════════════════
// 2. ZAHLUNG FEHLGESCHLAGEN
// ═══════════════════════════════════════════════════════════════

export interface ZahlungFehlgeschlagenDaten {
  email: string
  name: string
  betragCent: number
  /** Bis wann der Zugang trotz offener Zahlung bestehen bleibt. */
  zugangBis: string | null
}

export async function sendeZahlungFehlgeschlagen(d: ZahlungFehlgeschlagenDaten): Promise<boolean> {
  const html = layout(
    'Ihre Zahlung konnte nicht eingezogen werden',
    absatz(`Guten Tag ${esc(d.name)},`) +
      absatz(
        `der Betrag von ${esc(formatiereCent(d.betragCent))} für Ihren PflegeCoach-Zugang konnte nicht ` +
          'eingezogen werden. Das hat meist einen harmlosen Grund — eine abgelaufene Karte oder ein ' +
          'nicht ausreichend gedecktes Konto.'
      ) +
      absatz(
        d.zugangBis
          ? `<strong>Ihr Zugang bleibt zunächst bestehen.</strong> Bitte hinterlegen Sie bis zum ${esc(formatDatum(d.zugangBis))} ein anderes Zahlungsmittel.`
          : '<strong>Ihr Zugang bleibt zunächst bestehen.</strong> Bitte hinterlegen Sie in den nächsten Tagen ein anderes Zahlungsmittel.'
      ) +
      knopf('Zahlungsmittel aktualisieren', '/pflegecoach/einstellungen/konto') +
      absatz(
        'Ihre Daten im PflegeCoach bleiben in jedem Fall erhalten — auch dann, wenn der Zugang ' +
          'vorübergehend ruht. Sie können sie jederzeit herunterladen.'
      )
  )

  return sende(d.email, 'PflegeCoach: Zahlung konnte nicht eingezogen werden', html, 'Zahlungsfehler-Mail')
}

// ═══════════════════════════════════════════════════════════════
// 3. KÜNDIGUNGSBESTÄTIGUNG
// ═══════════════════════════════════════════════════════════════

export interface KuendigungDaten {
  email: string
  name: string
  /** Bis zu diesem Tag bleibt der Zugang bestehen. */
  zugangBis: string | null
}

/**
 * Nach § 312k Abs. 4 BGB muss der Zugang der Kündigungserklärung samt
 * Zeitpunkt und Wirkung in Textform bestätigt werden. Diese Mail ist
 * diese Bestätigung — sie ist deshalb keine Kür.
 */
export async function sendeKuendigungsbestaetigung(d: KuendigungDaten): Promise<boolean> {
  const html = layout(
    'Ihre Kündigung ist eingegangen',
    absatz(`Guten Tag ${esc(d.name)},`) +
      absatz('wir bestätigen den Eingang Ihrer Kündigung des PflegeCoach-Zugangs.') +
      datenTabelle([
        ['Eingegangen am', formatDatum(new Date().toISOString().slice(0, 10))],
        ['Zugang endet am', d.zugangBis ? formatDatum(d.zugangBis) : 'sofort'],
        ['Weitere Abbuchungen', 'keine'],
      ]) +
      absatz(
        'Bis dahin können Sie den PflegeCoach unverändert weiter nutzen. Danach verlängert sich ' +
          'nichts und es wird nichts mehr abgebucht.'
      ) +
      absatz(
        '<strong>Ihre Daten bleiben erhalten</strong> — auch nach dem Ende des Zugangs. Sie können sie jederzeit ' +
          'herunterladen oder vollständig löschen. Gelöscht wird nur, wenn Sie es ausdrücklich veranlassen.'
      ) +
      knopf('Daten herunterladen oder löschen', '/pflegecoach/einstellungen/konto')
  )

  return sende(d.email, 'PflegeCoach: Kündigung bestätigt', html, 'Kündigungsbestätigung')
}

// ═══════════════════════════════════════════════════════════════
// 4. WIDERRUFSBESTÄTIGUNG
// ═══════════════════════════════════════════════════════════════

export interface WiderrufDaten {
  email: string
  name: string
  erstattungCent: number
}

export async function sendeWiderrufsbestaetigung(d: WiderrufDaten): Promise<boolean> {
  const html = layout(
    'Ihr Widerruf ist bestätigt',
    absatz(`Guten Tag ${esc(d.name)},`) +
      absatz(
        'wir bestätigen Ihren Widerruf. Der Vertrag über den Digitalen PflegeCoach gilt damit als ' +
          'nicht geschlossen, Ihr Zugang ist beendet.'
      ) +
      datenTabelle([
        ['Erstattungsbetrag', formatiereCent(d.erstattungCent)],
        ['Erstattung über', 'dasselbe Zahlungsmittel wie bei der Zahlung'],
      ]) +
      absatz(
        'Die Gutschrift erscheint je nach Zahlungsmittel innerhalb weniger Werktage auf Ihrem Konto. ' +
          'Wertersatz für die zwischenzeitliche Nutzung berechnen wir nicht.'
      ) +
      absatz(
        '<strong>Ihre Daten bleiben zunächst erhalten</strong>, damit Sie sie noch herunterladen können. ' +
          'Sie können sie jederzeit selbst vollständig löschen.'
      ) +
      knopf('Daten herunterladen oder löschen', '/pflegecoach/einstellungen/konto')
  )

  return sende(d.email, 'PflegeCoach: Widerruf bestätigt', html, 'Widerrufsbestätigung')
}
