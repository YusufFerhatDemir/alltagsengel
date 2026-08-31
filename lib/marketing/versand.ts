// ═══════════════════════════════════════════════════════════════════════════
// VERSAND — Trockenlauf, Vorschau, Testversand, Produktionsversand
//
// Vier Wege, und nur EINER von ihnen erreicht echte Empfaenger:
//
//   trockenlauf()   zaehlt und schluesselt auf. Sendet NICHTS.
//   vorschau()      rendert EINE Mail. Sendet NICHTS.
//   testversand()   sendet an eine EIGENE Adresse. Nie an Kundschaft.
//   fuehreVersandAus()  der einzige scharfe Weg, hinter drei Toren.
//
// ── DIE DREI TORE VOR DEM SCHARFEN VERSAND ─────────────────────────────────
//  1. MARKETINGVERSAND_FREIGEGEBEN='1' und Produktionslauf (freigabe.ts)
//  2. Die Kampagne traegt eine menschliche Freigabe, die sich auf die beim
//     Trockenlauf gesehene Empfaengerzahl bezieht.
//  3. Die Kampagne wurde noch nicht versendet — der UNIQUE-Teilindex
//     email_campaigns_einmal_versendet macht das zur Datenbankregel und
//     nicht zur Absichtserklaerung.
//
// Tor 2 verdient eine Erklaerung. Die Freigabe merkt sich die ZAHL, die der
// freigebende Mensch gesehen hat. Waechst das Segment zwischen Freigabe und
// Versand — jemand traegt Einwilligungen nach, ein Import laeuft, eine
// Sperre wird aufgehoben —, dann gilt die Freigabe NICHT mehr. Sonst waere
// „ich habe 12 Empfaenger freigegeben" die Grundlage fuer einen Versand an
// 1200.
//
// ── WARUM JEDE MAIL EINZELN PROTOKOLLIERT WIRD, BEVOR SIE RAUSGEHT ─────────
// Der Eintrag in email_campaign_logs entsteht VOR dem Provider-Aufruf und
// wird danach fortgeschrieben. Bricht der Lauf mitten drin ab, steht
// hinterher fest, wer schon dran war. Andersherum — erst senden, dann
// protokollieren — waere ein Absturz zwischen beiden Schritten eine Mail
// ohne Spur, und der Wiederaufnahmelauf schickte sie ein zweites Mal.
//
// Der UNIQUE-Index (campaign_id, empfaenger) macht diesen Vor-Eintrag
// zugleich zur Doppelversand-Sperre: ein zweiter Eintrag fuer dieselbe
// Adresse schlaegt fehl, also unterbleibt die zweite Mail.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendRawEmail } from '@/lib/notifications'
import { abmeldeLink } from '@/lib/newsletter/abmelde-token'
import { logger } from '@/lib/logger'
import { ladeBereitsErhalten, ladeMarketingKontakte } from './empfaenger'
import { ladeEinwilligungsLage, normalisiereAdresse, pruefeEmpfaenger } from './einwilligung'
import { istTestversandZiel, leseMarketingFreigabe } from './freigabe'
import { filtereRegion, filtereSegment, segmentAus } from './segmente'
import { pruefeVorlage, rendere, textTeilAus, vorlageAus, werteFuer, type Vorlage } from './vorlagen'
import {
  AUSSCHLUSS_GRUENDE,
  type AusschlussGrund,
  type MarketingKontakt,
  type SegmentZaehlung,
} from './typen'

const log = logger.child('marketing:versand')

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'

/**
 * Der Abmeldelink einer WERBEMAIL.
 *
 * Zeigt auf /api/marketing/abmeldung, nicht auf den Newsletter-Weg: die
 * Marketing-Abmeldung muss zusaetzlich die Einwilligung widerrufen und die
 * Adresse sperren. Das TOKEN ist dasselbe (HMAC ueber die Adresse, ohne
 * Ablauf, beliebig oft benutzbar) — ein Abmeldelink muss noch in einer zwei
 * Jahre alten Mail funktionieren, Art. 21 DSGVO.
 */
export function marketingAbmeldelink(email: string, basisUrl: string = SITE): string {
  // abmeldeLink baut Adresse + Token; nur der Pfad ist ein anderer.
  return abmeldeLink(email, basisUrl).replace(
    '/api/newsletter/unsubscribe?',
    '/api/marketing/abmeldung?',
  )
}

/**
 * RFC-8058-Kopfzeilen. Ohne sie zeigen Gmail und Outlook keinen
 * Ein-Klick-Abmeldeknopf; die Empfaenger greifen dann zum Spam-Knopf, und
 * der beschaedigt die Zustellbarkeit ALLER Mails der Domain — auch der
 * Rechnungen.
 */
function abmeldeKopfzeilen(abmeldelink: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${abmeldelink}>, <mailto:info@alltagsengel.care?subject=Abmeldung>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Gemeinsame Empfängerermittlung
// ───────────────────────────────────────────────────────────────────────────

export interface Kampagne {
  id: string
  organization_id: string
  name: string
  template_key: string
  segment_key: string
  status: string
  dry_run_am: string | null
  empfaenger_anzahl: number | null
  freigegeben_am: string | null
  freigegeben_fuer_anzahl: number | null
  versendet_am: string | null
}

export interface Empfaengerlage {
  segment: ReturnType<typeof segmentAus>
  vorlage: Vorlage
  /** Personen im Segment, vor jeder Einwilligungsprüfung. */
  imSegment: MarketingKontakt[]
  /** Davon versandfähig. */
  versandfaehig: MarketingKontakt[]
  ausschluesse: Record<AusschlussGrund, number>
}

function leereAusschluesse(): Record<AusschlussGrund, number> {
  return Object.fromEntries(AUSSCHLUSS_GRUENDE.map((g) => [g, 0])) as Record<AusschlussGrund, number>
}

/**
 * Ermittelt die Empfaengerlage einer Kampagne.
 *
 * WIRFT bei jedem Ladefehler. Eine halbe Empfaengerliste ist gefaehrlicher
 * als gar keine — sie sieht im Trockenlauf klein aus und waere beim Versand
 * gross.
 *
 * `heute` kommt von aussen, damit Trockenlauf und Versand desselben
 * Zeitpunkts dasselbe Ergebnis liefern und die Segmentregeln testbar
 * bleiben.
 */
export async function ermittleEmpfaenger(
  supabase: SupabaseClient,
  kampagne: Pick<Kampagne, 'id' | 'organization_id' | 'template_key' | 'segment_key'>,
  heute: Date,
  plzPraefixe: readonly string[] = [],
): Promise<Empfaengerlage> {
  const segment = segmentAus(kampagne.segment_key)
  const vorlage = vorlageAus(kampagne.template_key)

  // Vorlage und Segment muessen dieselbe Einwilligungsart verlangen. Sonst
  // schickte eine Engel-Vorlage an ein Kundensegment — mit einer
  // Einwilligung, die fuer etwas anderes erteilt wurde.
  if (vorlage.consentTyp !== segment.consentTyp) {
    throw new Error(
      `Vorlage '${vorlage.templateKey}' verlangt die Einwilligung '${vorlage.consentTyp}', ` +
        `Segment '${segment.key}' steht auf '${segment.consentTyp}'. Diese Kombination ist nicht zulässig.`,
    )
  }

  const alle = await ladeMarketingKontakte(supabase, kampagne.organization_id)
  const imSegment = filtereRegion(filtereSegment(alle, segment.key, heute), plzPraefixe)

  const lage = await ladeEinwilligungsLage(
    supabase,
    kampagne.organization_id,
    imSegment.map((k) => k.email),
    segment.consentTyp,
  )
  const bereits = await ladeBereitsErhalten(supabase, kampagne.id)

  const geprueft = pruefeEmpfaenger(imSegment, lage, bereits)
  const ausschluesse = leereAusschluesse()
  const versandfaehig: MarketingKontakt[] = []

  for (const e of geprueft) {
    if (e.versandfaehig) versandfaehig.push(e.kontakt)
    else ausschluesse[e.grund] += 1
  }

  return { segment, vorlage, imSegment, versandfaehig, ausschluesse }
}

// ───────────────────────────────────────────────────────────────────────────
// 1) Trockenlauf — sendet nichts
// ───────────────────────────────────────────────────────────────────────────

export interface TrockenlaufErgebnis extends SegmentZaehlung {
  kampagneId: string
  kampagneName: string
  vorlage: string
  betreff: string
  /** Befund der Vorlagenprüfung. Ein Trockenlauf mit Befund darf nicht freigegeben werden. */
  vorlagenFehler: string[]
  /** Bis zu fünf Beispieladressen, gekürzt — für die Sichtprüfung. */
  beispiele: string[]
  freigabeStand: ReturnType<typeof leseMarketingFreigabe>
  gelaufenAm: string
}

/** Kürzt eine Adresse für die Anzeige: `ma***@example.com`. */
export function kuerzeAdresse(email: string): string {
  const [lokal, domaene] = normalisiereAdresse(email).split('@')
  if (!domaene) return '***'
  const sichtbar = lokal.slice(0, 2)
  return `${sichtbar}${'*'.repeat(Math.max(1, lokal.length - 2))}@${domaene}`
}

/**
 * Zaehlt, schluesselt auf, sendet NICHTS.
 *
 * Das Ergebnis ist die Grundlage jeder Freigabe. Die Aufschluesselung ist
 * dabei wichtiger als die Gesamtzahl: „312 im Segment, 0 versandfähig,
 * davon 312 ohne Einwilligung" ist eine vollstaendige Aussage. „0
 * Empfänger" allein waere nicht von einem Fehler zu unterscheiden.
 */
export async function trockenlauf(
  supabase: SupabaseClient,
  kampagne: Kampagne,
  heute: Date = new Date(),
  plzPraefixe: readonly string[] = [],
): Promise<TrockenlaufErgebnis> {
  const lage = await ermittleEmpfaenger(supabase, kampagne, heute, plzPraefixe)
  const befund = pruefeVorlage(lage.vorlage)

  const ergebnis: TrockenlaufErgebnis = {
    kampagneId: kampagne.id,
    kampagneName: kampagne.name,
    segmentKey: lage.segment.key,
    vorlage: lage.vorlage.templateKey,
    betreff: lage.vorlage.betreff,
    imSegment: lage.imSegment.length,
    versandfaehig: lage.versandfaehig.length,
    ausschluesse: lage.ausschluesse,
    vorlagenFehler: befund.fehler,
    beispiele: lage.versandfaehig.slice(0, 5).map((k) => kuerzeAdresse(k.email)),
    freigabeStand: leseMarketingFreigabe(),
    gelaufenAm: heute.toISOString(),
  }

  // Das Ergebnis wird an der Kampagne festgehalten — die spaetere Freigabe
  // bezieht sich darauf. Ohne diesen Schritt gaebe es keine Zahl, gegen die
  // sich eine Freigabe binden liesse.
  const { error } = await supabase
    .from('email_campaigns')
    .update({
      dry_run_am: ergebnis.gelaufenAm,
      dry_run_ergebnis: ergebnis as unknown as Record<string, unknown>,
      empfaenger_anzahl: ergebnis.versandfaehig,
      updated_at: new Date().toISOString(),
    })
    .eq('id', kampagne.id)
    .eq('organization_id', kampagne.organization_id)
    .select('id')

  if (error) throw new Error(`Trockenlauf nicht festgehalten: ${error.message}`)

  return ergebnis
}

// ───────────────────────────────────────────────────────────────────────────
// 2) Vorschau — rendert eine Mail, sendet nichts
// ───────────────────────────────────────────────────────────────────────────

export interface VorschauErgebnis {
  betreff: string
  html: string
  text: string
  /** Gegen welchen Beispielkontakt gerendert wurde. */
  beispielName: string
  vorlagenFehler: string[]
}

/**
 * Rendert die Mail so, wie ein echter Empfaenger sie bekaeme.
 *
 * Der Abmeldelink wird MIT gerendert und ist echt — nur so faellt auf, wenn
 * das Token nicht gebaut werden kann (fehlender Schluessel). Eine Vorschau
 * mit Platzhalter statt Link haette den Fehler bis in den Versand getragen.
 */
/**
 * Der Beispielkontakt fuer Vorschau und Testversand.
 *
 * `istTestkonto: true` ist Absicht — dieser Kontakt darf unter keinen
 * Umstaenden versehentlich in eine Empfaengerliste geraten; `echterKontakt()`
 * in segmente.ts wuerde ihn dann herausfiltern.
 */
export function beispielKontakt(): MarketingKontakt {
  return {
    userId: null,
    email: 'vorschau@alltagsengel.care',
    anzeigename: 'Frau Musterfrau',
    rolle: 'kunde',
    plz: '60311',
    bundesland: 'Hessen',
    istTestkonto: true,
    istGeloescht: false,
    istDipaNutzer: false,
    registrierungVollstaendig: true,
    registriertAm: null,
    letzteAktivitaet: null,
    letzteBuchung: null,
    anzahlBuchungen: 0,
    verfuegbarkeitsFenster: 0,
    qualifiziert: false,
    einsatzfreigabe: false,
    fuehrungszeugnisGueltigBis: null,
    vertragsstatus: null,
    ausgetretenAm: null,
  }
}

export function vorschau(vorlage: Vorlage, beispiel?: MarketingKontakt): VorschauErgebnis {
  const kontakt: MarketingKontakt = beispiel ?? beispielKontakt()

  let link: string
  try {
    link = marketingAbmeldelink(kontakt.email)
  } catch (err) {
    // Fehlender Signaturschluessel: das ist ein echter Befund und darf
    // nicht als hübsche Vorschau durchgehen.
    throw new Error(
      `Abmeldelink nicht erzeugbar — ohne ihn darf keine Werbemail raus: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }

  const werte = werteFuer(kontakt, link)
  const html = rendere(vorlage.html, werte)

  return {
    betreff: rendere(vorlage.betreff, werte),
    html,
    text: textTeilAus(html),
    beispielName: kontakt.anzeigename,
    vorlagenFehler: pruefeVorlage(vorlage).fehler,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 3) Testversand — nur an eigene Adressen
// ───────────────────────────────────────────────────────────────────────────

export type TestversandErgebnis =
  | { ok: true; an: string }
  | { ok: false; grund: string }

/**
 * Sendet EINE Mail an eine eigene Adresse.
 *
 * Der Ziel-Check ist der Kern: ohne ihn waere der Testversand der Weg, den
 * Freigaberiegel zu umgehen. Eine Kampagne „testweise" an eine
 * Kundenadresse ist kein Test, sondern ein Versand.
 *
 * Es entsteht KEIN Eintrag in email_campaign_logs — die Zustellspur zaehlt
 * echte Empfaenger. Ein Testversand darin wuerde die Kennzahlen verfaelschen
 * und die Adresse spaeter faelschlich als „hat schon bekommen" ausschliessen.
 */
export async function testversand(
  vorlage: Vorlage,
  an: string,
): Promise<TestversandErgebnis> {
  const adresse = normalisiereAdresse(an)

  if (!istTestversandZiel(adresse)) {
    return {
      ok: false,
      grund:
        'Testversand geht ausschließlich an eigene Adressen (@alltagsengel.care). ' +
        'Eine Kampagne an eine fremde Adresse zu „testen" wäre ein Versand.',
    }
  }

  const befund = pruefeVorlage(vorlage)
  if (!befund.ok) {
    return { ok: false, grund: `Vorlage nicht versandfähig: ${befund.fehler.join(' ')}` }
  }

  // Gegen einen ECHTEN Kontakt rendern, nicht gegen ein Teilobjekt: nur so
  // laeuft der Testversand durch dieselben Platzhalter wie der Ernstfall.
  const testKontakt: MarketingKontakt = { ...beispielKontakt(), email: adresse, anzeigename: 'Testversand' }
  const link = marketingAbmeldelink(adresse)
  const werte = werteFuer(testKontakt, link)
  const html = rendere(vorlage.html, werte)
  const betreff = rendere(vorlage.betreff, werte)

  const ergebnis = await sendRawEmail({
    to: adresse,
    subject: `[TEST] ${betreff}`,
    html,
    text: textTeilAus(html),
    headers: abmeldeKopfzeilen(link),
    // Kein Idempotenzschluessel: ein zweiter Testversand ist die Absicht.
  })

  if (!ergebnis.ok) return { ok: false, grund: ergebnis.grund }
  return { ok: true, an: adresse }
}

// ───────────────────────────────────────────────────────────────────────────
// 4) Produktionsversand — der einzige scharfe Weg
// ───────────────────────────────────────────────────────────────────────────

export interface VersandErgebnis {
  ok: boolean
  gesendet: number
  fehlgeschlagen: number
  uebersprungen: number
  /** Warum der Lauf gar nicht erst begonnen hat. */
  abbruchgrund?: string
}

/**
 * Prueft die drei Tore vor dem scharfen Versand.
 *
 * Getrennt von der Ausfuehrung, damit die Oberflaeche denselben Befund
 * ANZEIGEN kann, den der Versand anwenden wuerde — ohne ihn auszuloesen.
 */
export function pruefeVersandtore(
  kampagne: Kampagne,
  versandfaehigJetzt: number,
): { erlaubt: boolean; gruende: string[] } {
  const gruende: string[] = []

  const freigabe = leseMarketingFreigabe()
  if (!freigabe.aktiv) gruende.push(freigabe.grund)

  if (kampagne.versendet_am) {
    gruende.push(
      `Diese Kampagne wurde am ${kampagne.versendet_am} bereits versendet. Ein zweiter Versand ` +
        'ist ausgeschlossen (UNIQUE-Index email_campaigns_einmal_versendet).',
    )
  }

  if (kampagne.status === 'pausiert' || kampagne.status === 'abgebrochen') {
    gruende.push(`Kampagne steht auf '${kampagne.status}'.`)
  }

  if (!kampagne.freigegeben_am || kampagne.freigegeben_fuer_anzahl == null) {
    gruende.push(
      'Keine Freigabe. Ein Werbeversand braucht einen Trockenlauf und danach die ausdrückliche ' +
        'Freigabe eines Menschen.',
    )
  } else if (versandfaehigJetzt > kampagne.freigegeben_fuer_anzahl) {
    gruende.push(
      `Die Freigabe gilt für ${kampagne.freigegeben_fuer_anzahl} Empfänger, versandfähig sind ` +
        `inzwischen ${versandfaehigJetzt}. Das Segment ist seit der Freigabe gewachsen — ` +
        'bitte Trockenlauf und Freigabe wiederholen.',
    )
  }

  return { erlaubt: gruende.length === 0, gruende }
}

/**
 * Fuehrt den Versand aus.
 *
 * Der Ablauf je Empfaenger ist bewusst: PROTOKOLL ANLEGEN → SENDEN →
 * PROTOKOLL FORTSCHREIBEN. Begruendung im Modulkopf.
 */
export async function fuehreVersandAus(
  supabase: SupabaseClient,
  kampagne: Kampagne,
  ausgeloestVon: string,
  heute: Date = new Date(),
  plzPraefixe: readonly string[] = [],
): Promise<VersandErgebnis> {
  const lage = await ermittleEmpfaenger(supabase, kampagne, heute, plzPraefixe)

  const befund = pruefeVorlage(lage.vorlage)
  if (!befund.ok) {
    return {
      ok: false,
      gesendet: 0,
      fehlgeschlagen: 0,
      uebersprungen: lage.versandfaehig.length,
      abbruchgrund: `Vorlage nicht versandfähig: ${befund.fehler.join(' ')}`,
    }
  }

  const tore = pruefeVersandtore(kampagne, lage.versandfaehig.length)
  if (!tore.erlaubt) {
    return {
      ok: false,
      gesendet: 0,
      fehlgeschlagen: 0,
      uebersprungen: lage.versandfaehig.length,
      abbruchgrund: tore.gruende.join(' '),
    }
  }

  // Der Versand-Vermerk wird ZUERST gesetzt, mit CAS auf versendet_am IS
  // NULL. Zwei gleichzeitige Aufrufe koennen so nicht beide loslaufen —
  // der zweite trifft null Zeilen und bricht ab.
  //
  // ── DER PREIS DIESER REIHENFOLGE, AUSDRUECKLICH ────────────────────
  // Faellt der Versanddienst mitten im Lauf aus, steht die Kampagne
  // trotzdem auf 'versendet' — und laesst sich NICHT wieder aufnehmen.
  // Das ist die bewusste Wahl zwischen zwei Fehlern:
  //
  //   a) Kampagne verbrannt, ein Mensch legt eine neue an. Aergerlich.
  //   b) Kampagne wiederaufnehmbar, und ein zweiter Lauf schickt allen
  //      dieselbe Werbemail noch einmal. Nicht zurueckholbar.
  //
  // (b) ist der schwerere Fehler, also faellt die Entscheidung auf (a).
  // Wer nachsehen will, WAS tatsaechlich rausging, liest
  // email_campaign_logs — dort steht je Empfaenger, ob gesendet oder
  // nicht. Der UNIQUE-Index (campaign_id, empfaenger) sorgt dabei
  // dafuer, dass eine NEUE Kampagne auf dieselben Empfaenger nicht
  // dieselbe Zeile schreibt, sondern eine eigene: die Doppelversand-
  // Sperre wirkt je Kampagne, nicht je Adresse. Wer nach einem
  // Teilausfall die restlichen Empfaenger erreichen will, legt eine
  // neue Kampagne an und schliesst die bereits erreichten aus.
  const { data: beansprucht, error: anspruchFehler } = await supabase
    .from('email_campaigns')
    .update({
      status: 'versendet',
      versendet_am: heute.toISOString(),
      versendet_von: ausgeloestVon,
      updated_at: new Date().toISOString(),
    })
    .eq('id', kampagne.id)
    .eq('organization_id', kampagne.organization_id)
    .is('versendet_am', null)
    .select('id')

  if (anspruchFehler) {
    return {
      ok: false,
      gesendet: 0,
      fehlgeschlagen: 0,
      uebersprungen: lage.versandfaehig.length,
      abbruchgrund: `Kampagne nicht als versendet markierbar: ${anspruchFehler.message}`,
    }
  }
  if (!beansprucht || beansprucht.length === 0) {
    return {
      ok: false,
      gesendet: 0,
      fehlgeschlagen: 0,
      uebersprungen: lage.versandfaehig.length,
      abbruchgrund:
        'Die Kampagne wurde bereits von einem anderen Lauf beansprucht. Kein zweiter Versand.',
    }
  }

  let gesendet = 0
  let fehlgeschlagen = 0
  let uebersprungen = 0

  for (const kontakt of lage.versandfaehig) {
    const adresse = kontakt.email

    // ── Vor-Eintrag. Schlaegt er fehl, hat diese Adresse die Kampagne
    //    schon (UNIQUE-Index) — dann NICHT senden.
    const { data: eintrag, error: eintragFehler } = await supabase
      .from('email_campaign_logs')
      .insert({
        organization_id: kampagne.organization_id,
        campaign_id: kampagne.id,
        recipient_id: kontakt.userId,
        empfaenger: adresse,
        status: 'geplant',
      })
      .select('id')
      .maybeSingle()

    if (eintragFehler || !eintrag) {
      uebersprungen += 1
      log.warn('Empfänger übersprungen — Protokolleintrag nicht möglich', {
        kampagne: kampagne.id,
        grund: eintragFehler?.message ?? 'kein Eintrag',
      })
      continue
    }

    let link: string
    try {
      link = marketingAbmeldelink(adresse)
    } catch (err) {
      fehlgeschlagen += 1
      await supabase
        .from('email_campaign_logs')
        .update({
          status: 'fehler',
          fehler_text: `Abmeldelink nicht erzeugbar: ${err instanceof Error ? err.message : String(err)}`,
        })
        .eq('id', eintrag.id)
      continue
    }

    const werte = werteFuer(kontakt, link)
    const html = rendere(lage.vorlage.html, werte)
    const betreff = rendere(lage.vorlage.betreff, werte)

    const ergebnis = await sendRawEmail({
      to: adresse,
      subject: betreff,
      html,
      text: textTeilAus(html),
      headers: abmeldeKopfzeilen(link),
      // Derselbe Vorgang, dieselbe Mail: eine Wiederholung nach einer
      // Zeitueberschreitung darf keine zweite Mail erzeugen.
      idempotenzSchluessel: `marketing:${kampagne.id}:${adresse}`,
    })

    if (ergebnis.ok) {
      gesendet += 1
      await supabase
        .from('email_campaign_logs')
        .update({
          status: 'gesendet',
          sent_at: new Date().toISOString(),
          provider_id: ergebnis.messageId,
        })
        .eq('id', eintrag.id)
    } else {
      fehlgeschlagen += 1
      await supabase
        .from('email_campaign_logs')
        .update({ status: 'fehler', fehler_text: ergebnis.grund })
        .eq('id', eintrag.id)
    }
  }

  log.info('Kampagnenversand abgeschlossen', {
    kampagne: kampagne.id,
    gesendet,
    fehlgeschlagen,
    uebersprungen,
  })

  return { ok: true, gesendet, fehlgeschlagen, uebersprungen }
}
