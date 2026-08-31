// ═══════════════════════════════════════════════════════════════════════════
// MARKETING-/CRM-SCHICHT — Begriffe
//
// Dieses Modul haelt die Vokabeln fest, die ueberall sonst verwendet werden.
// Es hat bewusst KEINE Abhaengigkeit auf Supabase, next/server oder Resend:
// die Segmentlogik und die Einwilligungspruefung sollen ohne Datenbank
// testbar sein, und die Typen wandern bis in die Oberflaeche.
//
// ── DIE WICHTIGSTE UNTERSCHEIDUNG DES GANZEN MODULS ────────────────────────
// TRANSAKTIONSPOST ist keine Werbung. Rechnung, Mahnung, Terminerinnerung,
// Passwortreset erfuellen einen Vertrag (Art. 6 Abs. 1 lit. b DSGVO) und
// laufen weiter ueber lib/notifications.ts. Sie fragen NICHT nach einer
// Einwilligung und stehen NICHT unter der Sperrliste — eine Rechnung, die
// wegen einer Newsletter-Abmeldung nicht zugestellt wird, waere ein Fehler.
//
// WERBEPOST braucht die vorherige ausdrueckliche Einwilligung (§ 7 Abs. 2
// Nr. 2 UWG) und beachtet die Sperrliste. Sie laeuft ausschliesslich ueber
// lib/marketing/versand.ts.
//
// Die beiden Wege teilen sich den Versanddienst und den Absender, sonst
// nichts. Wer eine neue Mail baut, muss zuerst diese Frage beantworten.
// ═══════════════════════════════════════════════════════════════════════════

/** Die Einwilligungsarten. Spiegel des CHECK auf marketing_consents.consent_type. */
export const CONSENT_TYPEN = [
  'newsletter',
  'produktinfo',
  'engel_einsaetze',
  'umfragen',
] as const
export type ConsentTyp = (typeof CONSENT_TYPEN)[number]

export const CONSENT_BEZEICHNUNG: Record<ConsentTyp, string> = {
  newsletter: 'Newsletter',
  produktinfo: 'Infos zum Leistungsangebot',
  engel_einsaetze: 'Einsatzangebote für Engel',
  umfragen: 'Umfragen und Rückmeldungen',
}

/** Spiegel des CHECK auf marketing_consents.source. */
export const CONSENT_QUELLEN = [
  'website_formular',
  'doppel_opt_in',
  'registrierung',
  'vertrag',
  'telefonisch',
  'schriftlich',
  'import',
] as const
export type ConsentQuelle = (typeof CONSENT_QUELLEN)[number]

/** Spiegel des CHECK auf email_suppression_list.reason. */
export const SPERRGRUENDE = [
  'abmeldung',
  'hard_bounce',
  'soft_bounce_dauerhaft',
  'spam_beschwerde',
  'manuell',
  'ungueltig',
] as const
export type Sperrgrund = (typeof SPERRGRUENDE)[number]

export const SPERRGRUND_BEZEICHNUNG: Record<Sperrgrund, string> = {
  abmeldung: 'Selbst abgemeldet',
  hard_bounce: 'Adresse existiert nicht',
  soft_bounce_dauerhaft: 'Dauerhaft unzustellbar',
  spam_beschwerde: 'Als Spam gemeldet',
  manuell: 'Vom Betrieb gesperrt',
  ungueltig: 'Adresse unbrauchbar',
}

/** Zielgruppe einer Vorlage bzw. eines Segments. */
export const ZIELGRUPPEN = ['kunde', 'engel', 'bewerber', 'lead', 'alle'] as const
export type Zielgruppe = (typeof ZIELGRUPPEN)[number]

/** Kampagnenstatus. Spiegel des CHECK auf email_campaigns.status. */
export const KAMPAGNEN_STATUS = [
  'entwurf',
  'geplant',
  'pausiert',
  'versendet',
  'abgebrochen',
] as const
export type KampagnenStatus = (typeof KAMPAGNEN_STATUS)[number]

export const KAMPAGNEN_STATUS_BEZEICHNUNG: Record<KampagnenStatus, string> = {
  entwurf: 'Entwurf',
  geplant: 'Geplant',
  pausiert: 'Pausiert',
  versendet: 'Versendet',
  abgebrochen: 'Abgebrochen',
}

/** Zustellstatus je Empfaenger. Spiegel des CHECK auf email_campaign_logs.status. */
export const ZUSTELL_STATUS = [
  'geplant',
  'gesendet',
  'zugestellt',
  'geoeffnet',
  'geklickt',
  'unzustellbar',
  'abgemeldet',
  'fehler',
] as const
export type ZustellStatus = (typeof ZUSTELL_STATUS)[number]

/** Trigger-Arten der vorbereiteten Automationen. */
export const TRIGGER_TYPEN = [
  'registrierung_unvollstaendig',
  'engel_ohne_einsatz',
  'kunde_ohne_buchung',
  'lange_kein_einsatz',
  'lange_keine_buchung',
] as const
export type TriggerTyp = (typeof TRIGGER_TYPEN)[number]

// ───────────────────────────────────────────────────────────────────────────
// Der Kontakt
// ───────────────────────────────────────────────────────────────────────────

/** In welcher Eigenschaft eine Person im Verteiler steht. */
export type KontaktRolle = 'kunde' | 'engel' | 'bewerber' | 'lead' | 'abonnent'

/**
 * Eine Person, wie das Marketing sie sieht.
 *
 * Bewusst FLACH und aus mehreren Tabellen zusammengesetzt: profiles,
 * clients, angels, caregivers, bookings, newsletter_subscribers. Die
 * Segmentlogik arbeitet nur auf dieser Form — dadurch ist sie ohne
 * Datenbank testbar, und ein Schemawechsel trifft nur den Lader
 * (lib/marketing/empfaenger.ts), nicht die Regeln.
 */
export interface MarketingKontakt {
  /** Kontokennung, falls es ein Konto gibt. Newsletter-Anmeldungen haben keine. */
  userId: string | null
  /** Kleingeschrieben und getrimmt. Leer, wenn keine Adresse bekannt ist. */
  email: string
  anzeigename: string
  rolle: KontaktRolle

  plz: string | null
  bundesland: string | null

  /** Testkonto (profiles.is_test) — geht NIE in einen Versand. */
  istTestkonto: boolean
  /** Konto zur Löschung vorgemerkt (profiles.deleted_at). */
  istGeloescht: boolean
  /**
   * Nutzt dieses Konto den digitalen PflegeCoach (Eintrag in coach_users)?
   *
   * WARUM DAS EINE MARKETING-EIGENSCHAFT IST
   * Der PflegeCoach ist die DiPA. DiPAV §6 Abs. 4: „Digitale
   * Pflegeanwendungen müssen frei von Werbung sein." §5 Abs. 5 bindet die
   * Datenverarbeitung an den Versorgungszweck und schließt Werbung
   * ausdrücklich aus. Ein Coach-Nutzer, der zugleich ein Kundenkonto hat,
   * darf deshalb NICHT über die Kundenliste beworben werden — das wäre
   * genau das Cross-Selling mit den Daten, das AK-VS-01 verbietet.
   *
   * Die Eigenschaft steht hier und nicht in einer Segmentbedingung, weil
   * sie für JEDES Segment gilt und keine Ausnahme kennt.
   */
  istDipaNutzer: boolean

  /** profiles.onboarding_completed bzw. das jeweilige Gegenstueck. */
  registrierungVollstaendig: boolean
  registriertAm: string | null

  /** Juengster Zeitpunkt irgendeiner Aktivitaet. ISO-Datum oder null. */
  letzteAktivitaet: string | null
  /** Juengste Buchung (Kundschaft) bzw. juengster Einsatz (Engel). */
  letzteBuchung: string | null
  anzahlBuchungen: number

  // ── nur bei Engeln belegt ────────────────────────────────────────────
  /** Anzahl hinterlegter Verfuegbarkeitsfenster (angel_availability). */
  verfuegbarkeitsFenster: number
  /** angels.is_certified bzw. eine hinterlegte Qualifikation. */
  qualifiziert: boolean
  /** caregivers.einsatzfreigabe — ohne sie darf der Engel nicht arbeiten. */
  einsatzfreigabe: boolean
  /** caregivers.fuehrungszeugnis_gueltig_bis, ISO-Datum. */
  fuehrungszeugnisGueltigBis: string | null
}

/**
 * Ein Werteintrag fuer die Anzeige: welches Segment, wie viele Personen —
 * und wie viele davon ueberhaupt angeschrieben werden duerfen.
 */
export interface SegmentZaehlung {
  segmentKey: string
  /** Personen im Segment, unabhaengig von der Einwilligung. */
  imSegment: number
  /** Davon mit gueltiger Einwilligung und nicht gesperrt. */
  versandfaehig: number
  /** Warum die Differenz zustande kommt. Summiert sich auf imSegment. */
  ausschluesse: Record<AusschlussGrund, number>
}

/**
 * Warum eine Person aus einem Segment NICHT angeschrieben wird.
 *
 * Die Aufschluesselung ist der eigentliche Zweck des Trockenlaufs: ein
 * Segment mit 500 Personen und 0 Empfaengern ist kein Fehler, sondern die
 * Aussage „niemand hat eingewilligt". Ohne Aufschluesselung sieht beides
 * gleich aus.
 */
export const AUSSCHLUSS_GRUENDE = [
  'dipa_nutzer',
  'keine_adresse',
  'keine_einwilligung',
  'einwilligung_widerrufen',
  'gesperrt',
  'testkonto',
  'konto_geloescht',
  'bereits_erhalten',
] as const
export type AusschlussGrund = (typeof AUSSCHLUSS_GRUENDE)[number]

export const AUSSCHLUSS_BEZEICHNUNG: Record<AusschlussGrund, string> = {
  dipa_nutzer: 'Nutzt den PflegeCoach — die DiPA ist werbefrei (DiPAV §6 Abs. 4)',
  keine_adresse: 'Keine E-Mail-Adresse hinterlegt',
  keine_einwilligung: 'Keine Werbeeinwilligung erteilt',
  einwilligung_widerrufen: 'Einwilligung widerrufen',
  gesperrt: 'Steht auf der Sperrliste',
  testkonto: 'Testkonto',
  konto_geloescht: 'Konto zur Löschung vorgemerkt',
  bereits_erhalten: 'Hat diese Kampagne bereits erhalten',
}

/** Ergebnis der Empfaengerpruefung fuer EINE Person. */
export type EmpfaengerPruefung =
  | { versandfaehig: true; kontakt: MarketingKontakt }
  | { versandfaehig: false; kontakt: MarketingKontakt; grund: AusschlussGrund }

export function istConsentTyp(wert: unknown): wert is ConsentTyp {
  return typeof wert === 'string' && (CONSENT_TYPEN as readonly string[]).includes(wert)
}
export function istSperrgrund(wert: unknown): wert is Sperrgrund {
  return typeof wert === 'string' && (SPERRGRUENDE as readonly string[]).includes(wert)
}
export function istKampagnenStatus(wert: unknown): wert is KampagnenStatus {
  return typeof wert === 'string' && (KAMPAGNEN_STATUS as readonly string[]).includes(wert)
}
export function istConsentQuelle(wert: unknown): wert is ConsentQuelle {
  return typeof wert === 'string' && (CONSENT_QUELLEN as readonly string[]).includes(wert)
}
