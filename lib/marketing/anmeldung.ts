// ═══════════════════════════════════════════════════════════════════════════
// SCHRITT 1 DES DOPPEL-OPT-IN — die Bestaetigungsmail
//
// ── WARUM DAS HIER STEHT UND NICHT IN DER ROUTE ────────────────────────────
// Es gab bis zum 31.08.2026 ZWEI oeffentliche Anmeldewege mit
// unterschiedlicher Rechtsfolge:
//
//   /api/newsletter            traegt sofort ein und schickt eine
//                              Willkommensmail — EINFACHES Opt-in.
//   /api/marketing/anmeldung   schickt eine Bestaetigungsmail und traegt
//                              erst nach dem Klick ein — DOPPELTES Opt-in.
//
// Das Formular auf der Website (components/NewsletterSignup.tsx) rief den
// ERSTEN auf. Der zweite hatte ueberhaupt keinen Aufrufer. Beides
// zusammen hiess: die vollstaendig gebaute Doppel-Opt-in-Kette war
// unerreichbar, und der Weg, den Menschen tatsaechlich gingen, war der
// rechtlich schwaechere (§ 7 Abs. 2 Nr. 2 UWG; BGH I ZR 164/09 verlangt
// fuer Werbemail die bestaetigte Einwilligung).
//
// Bemerkenswert dabei: die Oberflaeche VERSPRACH bereits das Doppelte —
// „Bestaetigen Sie Ihre E-Mail — wir haben Ihnen eine Nachricht
// geschickt." Die Nachricht, die ankam, war aber die Willkommensmail, und
// es gab nichts zu bestaetigen.
//
// Der Kern steht deshalb hier, und beide Routen rufen ihn auf. Ein
// gemeinsamer Kern statt zweier Kopien, weil sonst genau wieder
// auseinanderlaeuft, was zusammengehoert.
//
// ── DIESES MODUL TRAEGT KEINE EINWILLIGUNG EIN ─────────────────────────────
// Es verschickt eine Bestaetigungsmail und sonst nichts. Die Einwilligung
// entsteht in /api/marketing/bestaetigung, wenn der Empfaenger DIESER Mail
// bestaetigt — erst dann ist belegt, dass die Anmeldung aus diesem
// Postfach stammt. Jeder kann jede fremde Adresse in ein Formular tippen.
//
// ── DIE RATENGRENZEN BLEIBEN IN DER ROUTE ──────────────────────────────────
// Sie sind eine Eigenschaft des oeffentlichen Zugangs (IP, Adresse), nicht
// der Fachlogik — und die beiden Routen haben unterschiedliche.
//
// ── DER VERSANDWEG WIRD HEREINGEREICHT ─────────────────────────────────────
// `sendRawEmail` ist der Standardwert, nicht der fest verdrahtete Weg. Die
// tragenden Aussagen dieses Moduls sind Aussagen darueber, wann KEINE Mail
// rausgeht — an eine gesperrte Adresse, an eine bereits eingewilligte, bei
// unlesbarer Sperrliste. Ohne einen einsetzbaren Doppelgaenger liesse sich
// eine ausgebliebene Mail nicht belegen; ein Test saehe nur das Ergebnis.
// Dasselbe Muster wie beim Supabase-Client, der ebenfalls hereingereicht
// wird.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendRawEmail } from '@/lib/notifications'
import { normalisiereAdresse, istPlausibleAdresse } from './einwilligung'
import { bestaetigungsLink, GUELTIGKEIT_TAGE } from './doppel-opt-in'
import { CONSENT_BEZEICHNUNG, type ConsentTyp } from './typen'

/**
 * Warum keine Mail rausging. Fuer das Protokoll, NICHT fuer die Antwort
 * nach aussen: die muss in allen Faellen gleich lauten, sonst wird das
 * Formular zur Auskunftsstelle darueber, wer im Verteiler steht.
 */
export type AnmeldeGrund =
  | 'gesendet'
  | 'adresse_unbrauchbar'
  | 'gesperrt'
  | 'bereits_eingewilligt'
  | 'sperrliste_unlesbar'
  | 'bestand_unlesbar'
  | 'kein_link'
  | 'versand_fehlgeschlagen'

export interface AnmeldeErgebnis {
  /** Ist tatsaechlich eine Bestaetigungsmail rausgegangen? */
  gesendet: boolean
  grund: AnmeldeGrund
  /** Nur bei 'adresse_unbrauchbar' — der einzige Fall, den der Absender selbst verschuldet. */
  eingabefehler: boolean
  hinweis?: string
}

/** Der Versandweg. Standard ist `sendRawEmail`; Tests reichen einen Doppelgaenger herein. */
export type Versandweg = typeof sendRawEmail

/**
 * Verschickt die Bestaetigungsmail — oder ausdruecklich keine.
 *
 * Drei Faelle bekommen KEINE Mail, und jeder aus einem eigenen Grund:
 *
 *   gesperrt          Wer widersprochen hat (Art. 21 DSGVO), bekommt auch
 *                     keine Einladung, doch wieder einzuwilligen. Sonst
 *                     waere die Sperrliste ueber dieses Formular als
 *                     Mailversand nutzbar.
 *   schon dabei       Eine zweite Bestaetigung aendert nichts (partieller
 *                     UNIQUE-Index), und eine Mail „bestaetigen Sie Ihre
 *                     Anmeldung" an jemanden, der bereits angemeldet ist,
 *                     ist selbst unerwuenschte Post.
 *   nicht pruefbar    Fail-closed. Eine unlesbare Sperrliste ist kein
 *                     Freibrief.
 */
export async function sendeBestaetigungsmail(
  admin: SupabaseClient,
  eingabe: { email: string; typ: ConsentTyp; organizationId: string; site: string },
  versende: Versandweg = sendRawEmail,
): Promise<AnmeldeErgebnis> {
  const email = normalisiereAdresse(eingabe.email)
  if (!email || !istPlausibleAdresse(email)) {
    return { gesendet: false, grund: 'adresse_unbrauchbar', eingabefehler: true }
  }

  const { data: sperre, error: sperrFehler } = await admin
    .from('email_suppression_list')
    .select('id')
    .eq('organization_id', eingabe.organizationId)
    .eq('email', email)
    .maybeSingle()

  if (sperrFehler) {
    return {
      gesendet: false, grund: 'sperrliste_unlesbar', eingabefehler: false,
      hinweis: sperrFehler.message,
    }
  }
  if (sperre) return { gesendet: false, grund: 'gesperrt', eingabefehler: false }

  const { data: bestehend, error: bestandFehler } = await admin
    .from('marketing_consents')
    .select('id')
    .eq('organization_id', eingabe.organizationId)
    .eq('email', email)
    .eq('consent_type', eingabe.typ)
    .is('revoked_at', null)
    .maybeSingle()

  if (bestandFehler) {
    return {
      gesendet: false, grund: 'bestand_unlesbar', eingabefehler: false,
      hinweis: bestandFehler.message,
    }
  }
  if (bestehend) return { gesendet: false, grund: 'bereits_eingewilligt', eingabefehler: false }

  let link: string
  try {
    ({ link } = bestaetigungsLink(email, eingabe.typ, eingabe.organizationId, eingabe.site))
  } catch (err) {
    // Fehlender Signaturschluessel. Nach aussen unveraendert — der Betrieb
    // sieht es im Protokoll.
    return {
      gesendet: false, grund: 'kein_link', eingabefehler: false,
      hinweis: err instanceof Error ? err.message : String(err),
    }
  }

  const bezeichnung = CONSENT_BEZEICHNUNG[eingabe.typ]
  const ergebnis = await versende({
    to: email,
    subject: `Bitte bestätigen Sie Ihre Anmeldung — ${bezeichnung}`,
    html: bestaetigungsMail(bezeichnung, link),
    text:
      `Bitte bestätigen Sie Ihre Anmeldung zu: ${bezeichnung}\n\n${link}\n\n`
      + `Der Link ist ${GUELTIGKEIT_TAGE} Tage gültig. Haben Sie sich nicht angemeldet, `
      + `ignorieren Sie diese E-Mail einfach — ohne Bestätigung geschieht nichts.\n\n`
      + `Herzliche Grüße\nIhr Team von Alltagsengel`,
    // Diese Mail ist selbst KEINE Werbung, sondern die Rueckfrage zu einer
    // Anfrage. Sie traegt deshalb bewusst keinen Abmeldelink: ohne
    // Bestaetigung entsteht nichts, wovon man sich abmelden koennte.
    idempotenzSchluessel: `marketing-optin:${eingabe.typ}:${email}`,
  })

  if (!ergebnis.ok) {
    return {
      gesendet: false, grund: 'versand_fehlgeschlagen', eingabefehler: false,
      hinweis: ergebnis.grund,
    }
  }
  return { gesendet: true, grund: 'gesendet', eingabefehler: false }
}

export function bestaetigungsMail(bezeichnung: string, link: string): string {
  return `<!DOCTYPE html>
<html lang="de"><body style="margin:0;padding:24px;background:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1A1612;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
    <h1 style="font-size:20px;margin:0 0 16px;">Bitte bestätigen Sie Ihre Anmeldung</h1>
    <p style="line-height:1.6;margin:0 0 16px;">
      Sie haben sich für <strong>${bezeichnung}</strong> angemeldet. Damit wir sicher sein können,
      dass diese Anmeldung wirklich von Ihnen stammt, bitten wir um eine Bestätigung.
    </p>
    <p style="margin:24px 0;">
      <a href="${link}" style="display:inline-block;background:#1A1612;color:#F5F0E8;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:600;">Anmeldung bestätigen</a>
    </p>
    <p style="line-height:1.6;margin:0 0 16px;font-size:14px;color:#5A5248;">
      Der Link ist ${GUELTIGKEIT_TAGE} Tage gültig. Haben Sie sich nicht angemeldet, ignorieren Sie
      diese E-Mail einfach — ohne Bestätigung geschieht nichts, und wir speichern keine Einwilligung.
    </p>
    <p style="line-height:1.6;margin:24px 0 0;">Herzliche Grüße<br>Ihr Team von Alltagsengel</p>
  </div>
</body></html>`
}
