// ═══════════════════════════════════════════════════════════════════════════
// DOPPEL-OPT-IN — der Nachweis, dass die Einwilligung von der Adresse kam
//
// WARUM ES DIESES MODUL BRAUCHT
//
// lib/marketing/einwilligung.ts trug eine Einwilligung bis hierher SOFORT
// ein: `erteileEinwilligung` schreibt `granted_at = now()`. Wer ein Formular
// ausfuellt, ist damit eingewilligt — auch dann, wenn er eine fremde Adresse
// eingetragen hat. Genau das ist der Fall, den § 7 Abs. 2 Nr. 2 UWG
// ausschliesst und den der BGH (I ZR 164/09 — „Double-opt-in-Verfahren")
// zum Massstab gemacht hat: der Werbende traegt die Beweislast dafuer, dass
// die Einwilligung von dem Anschlussinhaber stammt. Eine Formularzeile
// beweist das nicht, weil jeder jede Adresse eintragen kann.
//
// Das Verfahren hier trennt deshalb ZWEI Vorgaenge, die vorher einer waren:
//
//   1. ANFRAGE  — jemand traegt eine Adresse ein. Es entsteht KEINE Zeile
//                 in marketing_consents. Es geht eine Bestaetigungsmail an
//                 GENAU DIESE Adresse.
//   2. BESTAETIGUNG — der Empfaenger dieser Mail bestaetigt. ERST JETZT
//                 entsteht die Einwilligung, mit source='doppel_opt_in'.
//
// Zwischen 1 und 2 existiert nichts in der Datenbank. Das ist Absicht:
// eine „schwebende Einwilligung" waere eine Liste von Adressen, die nie
// eingewilligt haben — der Datenbestand, den das Verfahren gerade
// vermeiden soll. Der Schwebezustand steckt vollstaendig im Token.
//
// ── WARUM EIN ANDERES TOKEN ALS BEI DER ABMELDUNG ──────────────────────────
//
// lib/newsletter/abmelde-token.ts signiert nur die Adresse: ohne Ablauf,
// beliebig oft benutzbar. Fuer eine Abmeldung ist das richtig (Art. 21
// DSGVO — der Widerspruch darf nicht erschwert werden). Fuer eine
// Einwilligung ist es FALSCH, und zwar in drei Punkten:
//
//   ABLAUF. Ein Bestaetigungslink, der in zwei Jahren noch wirkt, macht aus
//   einer alten Anfrage eine heutige Einwilligung. Die Bestaetigung muss
//   zeitnah zur Anfrage stehen, sonst belegt sie nichts. Hier: 7 Tage.
//
//   ART. Das Abmelde-Token gilt fuer die Adresse. Ein Einwilligungs-Token
//   muss zusaetzlich sagen, WOZU eingewilligt wird — sonst liesse sich ein
//   Link fuer „Umfragen" zu einer Newsletter-Einwilligung umbiegen.
//
//   MANDANT. Dasselbe Argument fuer die Organisation.
//
// Deshalb signiert dieses Modul (Adresse, Art, Organisation, Ablauf)
// zusammen. Die Ableitungskennung ist eine andere als beim Abmeldeweg —
// ein Abmelde-Token kann damit nie als Bestaetigung durchgehen und
// umgekehrt.
//
// ── WARUM KEINE TOKEN-TABELLE ──────────────────────────────────────────────
//
// Eine Tabelle brauchte, wer EINMALIGE Verwendung erzwingen will. Hier ist
// Mehrfachverwendung harmlos: die zweite Bestaetigung derselben Adresse
// trifft auf den UNIQUE-Index marketing_consents_offen_je_adresse und
// aendert nichts (`ignoreDuplicates`). Und eine Tabelle waere genau die
// Liste unbestaetigter Adressen, die oben ausgeschlossen wurde.
//
// ── FAIL-CLOSED ────────────────────────────────────────────────────────────
//
// Jede Unklarheit ergibt `false`: fehlender Schluessel, falsche Laenge,
// abgelaufen, unlesbar, Ausnahme. Anders als beim Abmeldeweg ist das hier
// die richtige Richtung — „im Zweifel nicht eingewilligt" ist der Zustand,
// in dem niemand Post bekommt, den er nicht wollte.
// ═══════════════════════════════════════════════════════════════════════════

import { createHmac, timingSafeEqual } from 'node:crypto'
import { CONSENT_TYPEN, type ConsentTyp } from './typen'
import { normalisiereAdresse } from './einwilligung'

/**
 * Feste Kennung der Schluesselableitung. BEWUSST verschieden von
 * 'alltagsengel:newsletter-abmeldung:v1' — sonst waere ein Abmelde-Token
 * als Bestaetigung verwendbar (und ein Abmeldelink stuende in jeder
 * Werbemail).
 */
const ABLEITUNGS_KENNUNG = 'alltagsengel:marketing-doppel-opt-in:v1'

/** Gueltigkeit eines Bestaetigungslinks. */
export const GUELTIGKEIT_TAGE = 7
const GUELTIGKEIT_MS = GUELTIGKEIT_TAGE * 24 * 60 * 60 * 1000

/**
 * Der Signaturschluessel.
 *
 * Wie beim Abmeldeweg: ein eigener Schluessel hat Vorrang, sonst wird
 * einer aus dem Dienstschluessel ABGELEITET (nicht dieser selbst
 * verwendet, und der Weg ist nicht umkehrbar).
 *
 * Anders als dort ist das Werfen hier unkritisch: eine Anmeldung, die
 * mangels Schluessel nicht zustande kommt, verwehrt niemandem ein Recht —
 * sie verhindert nur Werbung.
 *
 * @throws wenn keine Quelle vorhanden ist.
 */
export function optInSchluessel(env: NodeJS.ProcessEnv = process.env): string {
  const eigener = env.MARKETING_OPTIN_SECRET
  if (eigener && eigener.length >= 16) return eigener

  const dienst = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (dienst && dienst.length >= 16) {
    return createHmac('sha256', dienst).update(ABLEITUNGS_KENNUNG).digest('hex')
  }

  throw new Error(
    'Kein Schluessel fuer Bestaetigungs-Token: weder MARKETING_OPTIN_SECRET noch '
    + 'SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY gesetzt.',
  )
}

export function istConsentTyp(wert: unknown): wert is ConsentTyp {
  return typeof wert === 'string' && (CONSENT_TYPEN as readonly string[]).includes(wert)
}

/**
 * Der signierte Inhalt. Die Trennzeichen sind Teil der Signatur, damit
 * sich die Felder nicht gegeneinander verschieben lassen: ohne sie waere
 * ('ab', 'c') dasselbe wie ('a', 'bc').
 */
function inhalt(email: string, typ: ConsentTyp, organizationId: string, ablauf: number): string {
  return [normalisiereAdresse(email), typ, organizationId, String(ablauf)].join('\n')
}

export interface OptInToken {
  /** Der vollstaendige Tokenwert fuer den Link. */
  wert: string
  /** Ablaufzeitpunkt in Millisekunden seit Epoche. */
  ablauf: number
}

/**
 * Erzeugt ein Bestaetigungs-Token.
 *
 * Der Ablauf steht IM Token (Klartext, vor dem Punkt) UND in der Signatur.
 * Im Klartext, damit die Route ihn ohne Schluessel lesen und eine
 * verstaendliche Meldung ausgeben kann; in der Signatur, damit er sich
 * nicht verlaengern laesst.
 *
 * @param jetzt Zeitbasis — nur fuer Tests; sonst die aktuelle Zeit.
 */
export function erzeugeOptInToken(
  email: string,
  typ: ConsentTyp,
  organizationId: string,
  env?: NodeJS.ProcessEnv,
  jetzt: number = Date.now(),
): OptInToken {
  const ablauf = jetzt + GUELTIGKEIT_MS
  const signatur = createHmac('sha256', optInSchluessel(env))
    .update(inhalt(email, typ, organizationId, ablauf))
    .digest('hex')
  return { wert: `${ablauf.toString(36)}.${signatur}`, ablauf }
}

export type OptInPruefung =
  | { gueltig: true; ablauf: number }
  | { gueltig: false; grund: 'form' | 'abgelaufen' | 'signatur' | 'schluessel' }

/**
 * Prueft ein Token gegen (Adresse, Art, Organisation).
 *
 * Reihenfolge: Form → Ablauf → Signatur. Der Ablauf steht vor der
 * Signatur, weil ein abgelaufener Link eine EIGENE Meldung verdient
 * („bitte erneut anfordern") — „ungueltig" waere hier irrefuehrend und
 * fuehrte dazu, dass Leute den Weg fuer kaputt halten.
 *
 * Der Signaturvergleich laeuft in konstanter Zeit.
 */
export function pruefeOptInToken(
  email: string,
  typ: unknown,
  organizationId: string,
  token: unknown,
  env?: NodeJS.ProcessEnv,
  jetzt: number = Date.now(),
): OptInPruefung {
  if (typeof token !== 'string' || !token.includes('.')) return { gueltig: false, grund: 'form' }
  if (!istConsentTyp(typ)) return { gueltig: false, grund: 'form' }

  const [ablaufTeil, signatur] = token.split('.', 2)
  const ablauf = Number.parseInt(ablaufTeil, 36)
  if (!Number.isFinite(ablauf) || ablauf <= 0) return { gueltig: false, grund: 'form' }
  if (!signatur) return { gueltig: false, grund: 'form' }

  // Ablauf VOR der Signaturpruefung: die Meldung soll den echten Grund
  // nennen. Ein manipulierter Ablauf faellt gleich danach durch die
  // Signatur — er ist Teil des signierten Inhalts.
  if (jetzt > ablauf) return { gueltig: false, grund: 'abgelaufen' }

  try {
    const erwartet = Buffer.from(
      createHmac('sha256', optInSchluessel(env))
        .update(inhalt(email, typ, organizationId, ablauf))
        .digest('hex'),
      'utf8',
    )
    const erhalten = Buffer.from(signatur, 'utf8')
    // Laengenpruefung VOR timingSafeEqual — die Funktion wirft sonst.
    if (erwartet.length !== erhalten.length) return { gueltig: false, grund: 'signatur' }
    if (!timingSafeEqual(erwartet, erhalten)) return { gueltig: false, grund: 'signatur' }
    return { gueltig: true, ablauf }
  } catch {
    // Fehlender Schluessel oder unlesbares Token. Beides: nicht gueltig.
    return { gueltig: false, grund: 'schluessel' }
  }
}

/** Der Bestaetigungslink fuer die Mail. */
export function bestaetigungsLink(
  email: string,
  typ: ConsentTyp,
  organizationId: string,
  basisUrl: string,
  env?: NodeJS.ProcessEnv,
  jetzt: number = Date.now(),
): { link: string; ablauf: number } {
  const adresse = normalisiereAdresse(email)
  const token = erzeugeOptInToken(adresse, typ, organizationId, env, jetzt)
  const basis = basisUrl.replace(/\/+$/, '')
  const q = new URLSearchParams({ email: adresse, typ, token: token.wert })
  return { link: `${basis}/api/marketing/bestaetigung?${q.toString()}`, ablauf: token.ablauf }
}
