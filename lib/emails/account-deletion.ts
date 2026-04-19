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
// das wrapEmailTemplate() Layout mit AlltagsEngel-Branding anwendet.
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
  ).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const subject = 'Konto-Loeschung bestaetigt — 60 Tage Widerrufsfrist'

  const html = `
    <h2 style="color:#1A1612;font-size:20px;margin:8px 0 12px;">
      Dein Konto wurde deaktiviert
    </h2>
    <p style="color:#444;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Du hast die Loeschung deines AlltagsEngel-Kontos beantragt. Wir haben
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
 * Wird vom Edge-Cron-Job verschickt, NACHDEM der Hard-Delete erfolgte.
 * Reine Bestaetigung — kein Widerrufs-Link mehr moeglich.
 */
export async function sendAccountHardDeletedEmail(
  email: string,
  firstName: string
): Promise<boolean> {
  const subject = 'Dein AlltagsEngel-Konto wurde endgueltig geloescht'

  const html = `
    <h2 style="color:#1A1612;font-size:20px;margin:8px 0 12px;">
      Konto endgueltig geloescht
    </h2>
    <p style="color:#444;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Die 60-taegige Widerrufsfrist ist abgelaufen. Dein Konto und alle
      damit verknuepften Daten wurden gemaess DSGVO Art. 17 unwiderruflich
      geloescht.
    </p>

    <div style="background:#F0EBE0;border-radius:10px;padding:16px 18px;margin:20px 0;">
      <strong style="color:#1A1612;">Was wurde geloescht?</strong><br/>
      <span style="color:#666;font-size:13px;">
        Profil, Engel-Daten, Buchungen, Chats, Dokumente, Bezahldaten,
        Benachrichtigungen, Auth-Account.
      </span>
    </div>

    <p style="color:#888;font-size:12px;line-height:1.5;margin:24px 0 0;">
      Audit-Log-Eintraege bleiben aus rechtlichen Gruenden (HGB §257,
      AO §147) bis zu 10 Jahre erhalten — diese enthalten jedoch keine
      personenbezogenen Daten ausser einer pseudonymisierten User-ID.
      <br/><br/>
      Falls du einen Auszug der gespeicherten Audit-Daten anfordern
      moechtest, schreib uns:
      <a href="mailto:datenschutz@alltagsengel.care" style="color:#C9963C;">
        datenschutz@alltagsengel.care
      </a>
    </p>
  `

  return sendEmailNotification(email, firstName || 'Sie', subject, html)
}
