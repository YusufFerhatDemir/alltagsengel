// ════════════════════════════════════════════════════════════════════
// E-Mail-Templates fuer Konto-Loeschung (Soft-Delete + Widerruf)
// ════════════════════════════════════════════════════════════════════
//
// Zwei Mails:
//   1. Bestaetigungs-Mail: "Du hast dein Konto geloescht. Falls aus
//      Versehen, klick hier zum Wiederherstellen (60 Tage gueltig)."
//   2. Hard-Delete-Mail (optional): "Dein Konto wurde nun endgueltig
//      geloescht." Nur als Compliance-Beweis fuer DSGVO Art. 17.
//
// Wir nutzen den existierenden sendEmailNotification() Helper, der
// das wrapEmailTemplate() Layout mit Alltagsengel-Branding anwendet.
// ════════════════════════════════════════════════════════════════════

import { sendEmailNotification } from '@/lib/notifications'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://alltagsengel.care'
const GRACE_PERIOD_DAYS = 60

export interface DeletionEmailData {
  email: string
  firstName: string
  token: string
}

/**
 * Wird unmittelbar nach dem Soft-Delete verschickt.
 * Enthaelt den Widerrufs-Link mit Token.
 */
export async function sendAccountDeletionEmail(
  data: DeletionEmailData
): Promise<boolean> {
  const undoUrl = `${APP_URL}/api/user/delete/undo?token=${encodeURIComponent(data.token)}`
  const deletionDate = new Date(
    Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
  ).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit',
    month: 'long',
    year: 'numeric', })

  const subject = 'Konto-Loeschung bestaetigt — 60 Tage Widerrufsfrist'

  const html = `
    <h2 style="color:#1A1612;font-size:20px;margin:8px 0 12px;">
      Dein Konto wurde deaktiviert
    </h2>
    <p style="color:#444;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Du hast die Loeschung deines Alltagsengel-Kontos beantragt. Wir haben
      dein Konto sofort deaktiviert — du wirst nicht mehr in Suchergebnissen,
      Buchungen oder Chats angezeigt.
    </p>

    <div style="background:#F0EBE0;border-radius:10px;padding:16px 18px;margin:20px 0;">
      <strong style="color:#1A1612;">Endgueltige Loeschung am ${deletionDate}</strong><br/>
      <span style="color:#666;font-size:13px;">
        Bis dahin kannst du dein Konto jederzeit wiederherstellen.
      </span>
    </div>

    <p style="color:#444;font-size:14px;line-height:1.6;margin:0 0 8px;">
      <strong>War das ein Versehen?</strong> Klick einfach auf den Button —
      dein Konto ist sofort wieder da, mit allen Daten.
    </p>

    <div style="text-align:center;margin:24px 0;">
      <a href="${undoUrl}"
         style="display:inline-block;padding:14px 32px;background:#2D8F5E;
                color:#fff;text-decoration:none;border-radius:10px;
                font-weight:600;font-size:15px;">
        Konto wiederherstellen
      </a>
    </div>

    <p style="color:#888;font-size:12px;line-height:1.5;margin:24px 0 0;">
      Dieser Link ist 60 Tage gueltig (bis ${deletionDate}).
      Danach werden deine Daten gemaess DSGVO Art. 17 unwiderruflich
      geloescht. Falls du die Loeschung NICHT beantragt hast, melde
      dich umgehend bei uns: <a href="mailto:datenschutz@alltagsengel.care"
      style="color:#C9963C;">datenschutz@alltagsengel.care</a>.
    </p>
  `

  return sendEmailNotification(data.email, data.firstName || 'Sie', subject, html)
}

/**
 * Wird nach der endgueltigen Loeschung verschickt (Track 11: aus dem
 * Cron-Lauf /api/cron/konto-loeschung, nicht mehr aus der Edge Function).
 *
 * WARUM DIESER TEXT NEU GESCHRIEBEN WURDE: die Vormassung sagte, „dein
 * Konto und alle damit verknuepften Daten" seien unwiderruflich geloescht,
 * und zaehlte unter „Was wurde geloescht?" ausdruecklich die Buchungen auf.
 * Beides trifft nicht zu. Buchungen bleiben nach § 147 AO als Belege
 * stehen, die Kundenakte nach § 630f Abs. 3 BGB zehn Jahre — beides ist
 * bewusst so entschieden (lib/dsgvo/loeschkatalog.ts). Eine unzutreffende
 * Auskunft ueber den Verbleib der eigenen Daten ist selbst ein Verstoss
 * gegen Art. 12 Abs. 1 DSGVO, deshalb steht hier jetzt, was wirklich
 * bleibt — uebergeben aus demselben Katalog, aus dem die Loeschung laeuft.
 */
export async function sendAccountHardDeletedEmail(
  email: string,
  firstName: string,
  verbleibendeDaten: string[] = []
): Promise<boolean> {
  const subject = 'Ihr Alltagsengel-Konto wurde endgueltig geloescht'

  const verbleibendeListe = verbleibendeDaten.length > 0
    ? `<ul style="color:#666;font-size:13px;line-height:1.6;margin:8px 0 0;padding-left:18px;">`
      + verbleibendeDaten.map(z => `<li>${escapeHtml(z)}</li>`).join('')
      + `</ul>`
    : `<span style="color:#666;font-size:13px;">Es sind keine aufbewahrungspflichtigen Daten verblieben.</span>`

  const html = `
    <h2 style="color:#1A1612;font-size:20px;margin:8px 0 12px;">
      Konto endgueltig geloescht
    </h2>
    <p style="color:#444;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Die 60-taegige Widerrufsfrist ist abgelaufen. Ihr Zugang und die
      daran gebundenen persoenlichen Daten wurden nach Art. 17 DSGVO
      geloescht.
    </p>

    <div style="background:#F0EBE0;border-radius:10px;padding:16px 18px;margin:20px 0;">
      <strong style="color:#1A1612;">Was wurde geloescht?</strong><br/>
      <span style="color:#666;font-size:13px;">
        Ihr Zugang, Ihr Profil, Ihre Nachrichten und Chats, Ihre
        hochgeladenen Dateien, hinterlegte Geraete fuer Benachrichtigungen,
        Ihr Engel-Profil samt Zeitfenstern, Angaben zur betreuten Person,
        Zugaenge zum Angehoerigenportal sowie Ihr PflegeCoach-Konto.
      </span>
    </div>

    <div style="background:#F0EBE0;border-radius:10px;padding:16px 18px;margin:20px 0;">
      <strong style="color:#1A1612;">Was aus rechtlichen Gruenden bleibt</strong><br/>
      <span style="color:#666;font-size:13px;">
        Art. 17 Abs. 3 lit. b DSGVO nimmt Daten aus, deren Aufbewahrung
        gesetzlich vorgeschrieben ist. Bei diesen Unterlagen ist die
        Verknuepfung mit Ihrem Zugang entfernt:
      </span>
      ${verbleibendeListe}
    </div>

    <p style="color:#888;font-size:12px;line-height:1.5;margin:24px 0 0;">
      Fuer eine Auskunft ueber die verbliebenen Daten schreiben Sie uns:
      <a href="mailto:datenschutz@alltagsengel.care" style="color:#C9963C;">
        datenschutz@alltagsengel.care
      </a>
      <br/><br/>
      Herzliche Gruesse<br/>
      Ihr Team von Alltagsengel
    </p>
  `

  return sendEmailNotification(email, firstName || 'Sie', subject, html)
}

/** Nutzertexte aus dem Katalog landen im HTML — also escapen. */
function escapeHtml(wert: string): string {
  return wert
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
