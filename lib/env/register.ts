// ═══════════════════════════════════════════════════════════════════════════
// ENV-VERZEICHNIS — eine Quelle der Wahrheit für alle Umgebungsvariablen
//
// PROBLEM, DAS DIESE DATEI LÖST
// Bis hierher lagen 51 verschiedene `process.env.…`-Zugriffe über app/, lib/
// und components/ verstreut. Jeder einzelne war für sich vertretbar, aber es
// gab keine Stelle, an der stand:
//   • WELCHE Variablen es überhaupt gibt,
//   • welche fehlen dürfen und welche nicht,
//   • welche ein Geheimnis tragen und deshalb nie ins Browser-Bundle dürfen.
// Ein fehlendes Pflicht-Geheimnis fiel dadurch erst im Betrieb auf — meistens
// als 401 in einem Cron oder als E-Mail, die nie ankam.
//
// ABGRENZUNG: Dies ist ein VERZEICHNIS, kein zweiter Auswertungsweg.
// Die Module lesen ihre Variablen weiterhin selbst (`supabasePublishableKey()`,
// `dipaModus()`, `preisIdFuerPlan()` …). Diese Datei liest nur, ob etwas
// GESETZT ist — nie, um Verhalten zu steuern. Zwei Auswertungswege wären zwei
// Wahrheiten, und zwei Wahrheiten sind eine zu viel. Dasselbe Prinzip wie in
// lib/coach/schalter.ts.
//
// WARUM `lib/env/register.ts` KEIN `server-only` importiert
// Die Datei enthält ausschließlich NAMEN und Beschreibungen, keine Werte. Sie
// muss aus Tests und (theoretisch) aus Client-Code lesbar sein, ohne dass der
// `server-only`-Wächter wirft. Werte werden nur in `pruefeEnv()` gelesen, und
// dort nur auf Vorhandensein geprüft — kein Wert verlässt dieses Modul.
//
// VOLLSTÄNDIGKEIT wird erzwungen: __tests__/env/env-register.test.ts scannt
// app/, lib/, components/ nach literalen `process.env.NAME`-Zugriffen und
// schlägt fehl, sobald einer davon hier fehlt.
// ═══════════════════════════════════════════════════════════════════════════

/** Wo wird die Variable gelesen? */
export type EnvGeltung =
  /** Nur auf dem Server. Darf NIE ins Browser-Bundle. */
  | 'server'
  /** `NEXT_PUBLIC_*` — von Next.js zur Build-Zeit ins Bundle eingesetzt. */
  | 'client'
  /** Von der Plattform gesetzt (Vercel/Next.js), nicht von uns. */
  | 'plattform'

/** Muss sie gesetzt sein? */
export type EnvNotwendigkeit =
  /** Ohne sie ist die Anwendung kaputt — Start abbrechen. */
  | 'pflicht'
  /** Ohne sie fehlt eine Funktion, der Rest läuft. */
  | 'optional'

/** Wann gilt die Notwendigkeit? */
export type EnvWann =
  /** In jeder Umgebung, auch lokal. */
  | 'immer'
  /** Nur im Produktivbetrieb (NODE_ENV=production, kein Build). */
  | 'produktion'
  /** Nur lokal/Test — in Produktion ein Warnsignal. */
  | 'entwicklung'

export interface EnvEintrag {
  /** Exakter Name, so wie er gesetzt wird. */
  name: string
  /**
   * Ältere/alternative Namen derselben Sache. Gilt als gesetzt, sobald EINER
   * davon einen Wert hat — deckt die laufende Supabase-Key-Migration ab
   * (`sb_publishable_…` neben Legacy-`anon`).
   */
  alternativen?: readonly string[]
  geltung: EnvGeltung
  notwendigkeit: EnvNotwendigkeit
  wann: EnvWann
  /**
   * Trägt die Variable ein Geheimnis? Steuert die Leck-Prüfung: ein Geheimnis
   * darf niemals unter einem `NEXT_PUBLIC_`-Namen auftauchen.
   */
  geheim: boolean
  beschreibung: string
  /**
   * Der Name ist ein PRÄFIX, kein vollständiger Name (z. B. ein Passwort je
   * Datenannahmestelle). Solche Einträge werden nie auf Vorhandensein geprüft
   * — es ist nicht bekannt, welche Suffixe existieren.
   */
  praefix?: boolean
  /**
   * Löst ein Setzen dieser Variable etwas aus, das das Haus verlässt
   * (E-Mail an echte Kunden, Datei an eine Kasse)? Nur zur Dokumentation —
   * die Prüfung verlangt sie nie.
   */
  wirktNachAussen?: boolean
}

// ───────────────────────────────────────────────────────────────────────────
// Das Verzeichnis
// ───────────────────────────────────────────────────────────────────────────

export const ENV_REGISTER: readonly EnvEintrag[] = [
  // ═══ Kern: ohne diese drei läuft nichts ═══
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    geltung: 'client',
    notwendigkeit: 'pflicht',
    wann: 'immer',
    geheim: false,
    beschreibung: 'Projekt-URL der Datenbank. Aus ihr wird auch der Auth-Storage-Key abgeleitet (lib/supabase/storage-key.ts) — fehlt sie, meldet sich niemand mehr an.',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    alternativen: ['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    geltung: 'client',
    notwendigkeit: 'pflicht',
    wann: 'immer',
    geheim: false,
    beschreibung: 'Öffentlicher Datenbank-Schlüssel (neu `sb_publishable_…`, alt Legacy-JWT). Gelesen über supabasePublishableKey(); fehlt er, sperrt proxy.ts fail-closed alle geschützten Routen.',
  },
  {
    name: 'SUPABASE_SECRET_KEY',
    alternativen: ['SUPABASE_SERVICE_ROLE_KEY'],
    geltung: 'server',
    notwendigkeit: 'pflicht',
    wann: 'immer',
    geheim: true,
    beschreibung: 'Geheimer Server-Schlüssel — umgeht RLS. Nur in lib/supabase/admin.ts (dort per `server-only` gesperrt). Ohne ihn schlägt jeder Admin-/Cron-Pfad fehl.',
  },

  // ═══ Betrieb: in Produktion Pflicht ═══
  {
    name: 'RESEND_API_KEY',
    geltung: 'server',
    notwendigkeit: 'pflicht',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Mailversand. Ohne ihn geht keine einzige Mail raus — weder Registrierungs- noch Rechnungs- noch Mahnmail. Der gehärtete Sendeweg ist lib/notifications.ts / sendRawEmail().',
  },
  {
    name: 'CRON_SECRET',
    geltung: 'server',
    notwendigkeit: 'pflicht',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Bearer-Token aller sieben Cron-Routen (vercel.json) und des Workflows .github/workflows/zustellung-retry.yml. Fehlt er, antworten alle Cron-Routen fail-closed mit 401 — die Automatisierung steht still, ohne dass etwas rot wird.',
  },
  {
    name: 'ADMIN_ALLOWED_EMAILS',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Zusatz-Whitelist für Admin-Zugänge.',
  },
  {
    name: 'ADMIN_ALERT_EMAIL',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Empfänger interner Benachrichtigungen (Kontaktformular, Coach-Anfrage, Besucher-Alarm).',
  },

  // ═══ Versand-Schalter: steuern echte Post an echte Kunden ═══
  {
    name: 'RECHNUNGSVERSAND_AUTOMATISCH',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    wirktNachAussen: true,
    beschreibung: "Nur '1' schaltet den automatischen Rechnungsversand scharf (Festschreiben + Sammelrechnungslauf). Jeder andere Wert und das Fehlen bedeuten: Beleg entsteht, verlässt aber nicht das Haus. Nachsenden jederzeit über POST /api/billing/invoices/[id]/versenden.",
  },
  {
    name: 'MAHNVERSAND_AUTOMATISCH',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    wirktNachAussen: true,
    beschreibung: "Nur '1' lässt den täglichen Mahnlauf (/api/cron/mahnlauf, 07:00) die Mahn-Queue auch abarbeiten. Ohne den Schalter wird die Queue nur befüllt und unter /admin/mahnwesen von Hand freigegeben.",
  },

  {
    name: 'VERSAND_NICHT_PRODUKTION_ERLAUBT',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'entwicklung',
    geheim: false,
    wirktNachAussen: true,
    beschreibung: "Ausnahme zur Umgebungstrennung der beiden Versand-Schalter: nur mit '1' wirken RECHNUNGSVERSAND_AUTOMATISCH / MAHNVERSAND_AUTOMATISCH auch ausserhalb eines Produktionslaufs (Preview, lokal). Ohne sie bleibt eine fuer 'All Environments' gesetzte Vercel-Variable in jedem Branch-Preview wirkungslos. In der Produktion selbst wirkungslos und dort zu entfernen. Ausgewertet in lib/config/versand-flags.ts.",
  },
  {
    name: 'CAMT_IMPORT_MODE',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    wirktNachAussen: false,
    beschreibung: "Betriebsart des CAMT-Imports. Standard (und jeder unbekannte Wert) ist 'DRY_RUN': die Datei wird vollstaendig gelesen, geprueft und je Buchung eingeordnet, aber NICHTS gebucht. Nur der exakte Wert 'LIVE' laesst den Import Zahlungseingaenge anlegen und matchen. Ausgewertet in lib/billing/camt/camt-modus.ts.",
  },

  // ═══ Externe Freigaben (lib/abrechnung/externe-freigaben.ts) ═══
  {
    name: 'ITSG_ZERTIFIZIERT',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    wirktNachAussen: true,
    beschreibung: "Nur 'true' gibt den Kassen-Datenaustausch frei. Setzt ein vorliegendes ITSG-Zertifikat voraus.",
  },
  {
    name: 'SGB_V_302_FREIGABE',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    wirktNachAussen: true,
    beschreibung: "Nur 'true' gibt die §-302-SGB-V-Abrechnung frei. Der Generator wirft bis dahin absichtlich (TA1 fehlt).",
  },
  {
    name: 'KIM_AKTIV',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    wirktNachAussen: true,
    beschreibung: "Nur 'true' schaltet echten KIM-/TI-Versand scharf. Ist er gesetzt, sperrt sich der Simulator selbst.",
  },
  {
    name: 'VITALS_GRENZWERT_ALARME_AKTIV',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: "Nur 'true' schaltet die Grenzwert-Alarme der Vitalwerte scharf (lib/vitals/config.ts). Default aus — fail-closed.",
  },

  // ═══ Kassenabrechnung / SECON ═══
  {
    name: 'SECON_ZERT_PASSWORT',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Passwort des SECON-Zertifikats für die Verschlüsselung der Kassendateien.',
  },
  {
    name: 'SECON_SFTP_PASSWORT_',
    praefix: true,
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Präfix: je Datenannahmestelle eine eigene Variable (Name der Stelle in GROSSBUCHSTABEN angehängt). Alternative zum hochgeladenen SSH-Key.',
  },
  {
    name: 'ALLTAGSENGEL_IK',
    alternativen: ['NEXT_PUBLIC_ALLTAGSENGEL_IK'],
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Institutionskennzeichen des eigenen Betriebs. Nie im Code hartkodieren (scripts/ci-ik-check.sh prüft das).',
  },

  // ═══ PflegeCoach (Verzeichnis: lib/coach/schalter.ts) ═══
  {
    name: 'COACH_DIPA_MODUS',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    wirktNachAussen: true,
    beschreibung: 'Zulassungsgebunden — setzt eine BfArM-Listung voraus. Details in lib/coach/schalter.ts.',
  },
  {
    name: 'COACH_PREISE_FREIGEGEBEN',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    wirktNachAussen: true,
    beschreibung: 'Gibt die Selbstzahler-Preise frei. Muss zusammen mit COACH_FREISCHALTUNG_PFLICHT gesetzt werden.',
  },
  {
    name: 'COACH_FREISCHALTUNG_PFLICHT',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Verlangt eine ausdrückliche Freischaltung je Konto.',
  },
  {
    name: 'COACH_MFA_PFLICHT',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Erzwingt Mehr-Faktor-Anmeldung im PflegeCoach.',
  },
  {
    name: 'COACH_NUTZUNGSNACHWEIS_AKTIV',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Schaltet die Nutzungsnachweis-Erhebung ein.',
  },
  {
    name: 'COACH_PREIS_MONATLICH_CENT',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Monatspreis in Cent. Ohne Wert bleibt der Verkaufsweg fail-closed.',
  },
  {
    name: 'COACH_PREIS_JAEHRLICH_CENT',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Jahrespreis in Cent. Ohne Wert bleibt der Verkaufsweg fail-closed.',
  },
  {
    name: 'COACH_TESTPHASE_MONATLICH_TAGE',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Länge der Testphase im Monatsabo (Tage).',
  },
  {
    name: 'COACH_TESTPHASE_JAEHRLICH_TAGE',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Länge der Testphase im Jahresabo (Tage).',
  },
  {
    name: 'COACH_STRIPE_PRICE_MONATLICH',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Stripe-Price-ID des Monatsabos.',
  },
  {
    name: 'COACH_STRIPE_PRICE_JAEHRLICH',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Stripe-Price-ID des Jahresabos.',
  },
  {
    name: 'COACH_STRIPE_WEBHOOK_SECRET',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Signaturgeheimnis des Coach-Stripe-Webhooks (/api/coach/webhook).',
  },
  {
    name: 'COACH_CODE_PEPPER',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Pepper für die Freischaltcodes des PflegeCoach.',
  },
  {
    name: 'COACH_STEUERNUMMER',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Steuernummer auf PflegeCoach-Rechnungen.',
  },
  {
    name: 'COACH_UST_ID_NR',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Umsatzsteuer-Identifikationsnummer auf PflegeCoach-Rechnungen.',
  },
  {
    name: 'COACH_UST_SATZ',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Umsatzsteuersatz in Prozent.',
  },
  {
    name: 'COACH_UST_KLEINUNTERNEHMER',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: "Umgekehrt gepolt: nur ein ausdrückliches 'false' schaltet die Kleinunternehmerregelung AUS. Der eingeschaltete Zustand ist hier der konservative.",
  },

  // ═══ Stripe (Mandanten-Abos) ═══
  {
    name: 'STRIPE_SECRET_KEY',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Geheimer Stripe-Schlüssel.',
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Signaturgeheimnis des Stripe-Webhooks (/api/stripe/webhook).',
  },
  {
    name: 'STRIPE_PRICE_STARTER',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Price-ID des Starter-Plans. Fehlt EINE der drei STRIPE_PRICE_*, wirft planFromPriceId() — bewusst, statt einen zahlenden Mandanten still auf "free" zurückzusetzen.',
  },
  {
    name: 'STRIPE_PRICE_PRO',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Price-ID des Pro-Plans. Siehe STRIPE_PRICE_STARTER.',
  },
  {
    name: 'STRIPE_PRICE_SCALE',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Price-ID des Scale-Plans. Siehe STRIPE_PRICE_STARTER.',
  },

  // ═══ Push / WhatsApp ═══
  {
    name: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
    geltung: 'client',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Öffentlicher VAPID-Schlüssel für Web-Push. Gehört ins Bundle — das ist seine Aufgabe.',
  },
  {
    name: 'VAPID_PRIVATE_KEY',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Privater VAPID-Schlüssel. Gegenstück zum öffentlichen — darf nie ins Bundle.',
  },
  {
    name: 'FCM_PROJECT_ID',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Firebase-Projekt für nativen Push (lib/notifications/push).',
  },
  {
    name: 'FCM_CLIENT_EMAIL',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Dienstkonto für nativen Push.',
  },
  {
    name: 'FCM_PRIVATE_KEY',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Privater Schlüssel des Push-Dienstkontos.',
  },
  {
    name: 'WHATSAPP_ACCESS_TOKEN',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Zugangstoken der WhatsApp Business API.',
  },
  {
    name: 'WHATSAPP_PHONE_NUMBER_ID',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Absender-Rufnummern-ID der WhatsApp Business API.',
  },
  {
    name: 'WHATSAPP_VERIFY_TOKEN',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Token für die Webhook-Verifizierung von Meta.',
  },
  {
    name: 'WHATSAPP_APP_SECRET',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'App-Secret für die Signaturprüfung eingehender WhatsApp-Webhooks.',
  },

  // ═══ KI-Dienste ═══
  {
    name: 'OPENAI_API_KEY',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Schlüssel für den Beratungs-/Chat-Assistenten.',
  },
  {
    name: 'GOOGLE_AI_API_KEY',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Alternativer KI-Anbieter für dieselben Chat-Routen.',
  },

  // ═══ Marketing / Analytics ═══
  {
    name: 'NEXT_PUBLIC_SITE_URL',
    geltung: 'client',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Basis-URL für Links in E-Mails und Stripe-Rücksprüngen. Ohne Wert greift überall ein hartkodierter Rückfall auf die Produktionsdomain — deshalb optional, nicht Pflicht.',
  },
  {
    name: 'NEXT_PUBLIC_APP_URL',
    geltung: 'client',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Zweite Basis-URL neben NEXT_PUBLIC_SITE_URL — historisch gewachsen, gleicher Rückfall. Beide zu setzen (auf denselben Wert) ist die sichere Variante.',
  },
  {
    name: 'NEXT_PUBLIC_BASE_URL',
    geltung: 'client',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Dritte Basis-URL, nur in app/api/track/route.ts. Ebenfalls mit Rückfall.',
  },
  {
    name: 'NEXT_PUBLIC_GA4_MEASUREMENT_ID',
    geltung: 'client',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Google-Analytics-Messkennung.',
  },
  {
    name: 'NEXT_PUBLIC_META_PIXEL_ID',
    geltung: 'client',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Meta-Pixel im Browser.',
  },
  {
    name: 'META_PIXEL_ID',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Meta-Pixel serverseitig (Conversions API).',
  },
  {
    name: 'META_CAPI_ACCESS_TOKEN',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Zugangstoken der Meta Conversions API.',
  },
  {
    name: 'NEXT_PUBLIC_TIKTOK_PIXEL_ID',
    geltung: 'client',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'TikTok-Pixel im Browser.',
  },
  {
    name: 'TIKTOK_PIXEL_ID',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'TikTok-Pixel serverseitig (Events API).',
  },
  {
    name: 'TIKTOK_CAPI_ACCESS_TOKEN',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Zugangstoken der TikTok Events API.',
  },
  {
    name: 'NEXT_PUBLIC_GOOGLE_REVIEW_URL',
    geltung: 'client',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Ziel des Bewertungs-Aufrufs.',
  },
  {
    name: 'GOOGLE_PLACE_ID',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Ortskennung für das Abrufen der Google-Bewertungen.',
  },
  {
    name: 'GOOGLE_MAPS_API_KEY',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Schlüssel für die Places-Abfrage der Google-Bewertungen.',
  },
  {
    name: 'INDEXNOW_KEY',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Schlüssel für die IndexNow-Meldung an Suchmaschinen.',
  },
  {
    name: 'EXCLUDED_TRACKING_IPS',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Eigene IPs, die nicht in die Besucherstatistik zählen.',
  },

  // ═══ Beobachtbarkeit ═══
  {
    name: 'SENTRY_DSN',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Fehlermeldeziel für Server und Edge (instrumentation.ts).',
  },
  {
    name: 'NEXT_PUBLIC_SENTRY_DSN',
    geltung: 'client',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Fehlermeldeziel im Browser (instrumentation-client.ts).',
  },
  {
    name: 'SENTRY_AUTH_TOKEN',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: true,
    beschreibung: 'Nur zur Build-Zeit: lädt die Source-Maps hoch (next.config.ts).',
  },
  {
    name: 'SENTRY_ORG',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Sentry-Organisation, nur zur Build-Zeit.',
  },
  {
    name: 'SENTRY_PROJECT',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'produktion',
    geheim: false,
    beschreibung: 'Sentry-Projekt, nur zur Build-Zeit.',
  },
  {
    name: 'LOG_LEVEL',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'immer',
    geheim: false,
    beschreibung: 'Schwelle des Protokolls (lib/logger.ts).',
  },

  // ═══ Nur Entwicklung / Test ═══
  {
    name: 'DISABLE_RATE_LIMIT_FOR_E2E',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'entwicklung',
    geheim: false,
    beschreibung: "Hebt die Ratenbegrenzung auf. NUR für Playwright gegen localhost — in Produktion gesetzt wäre das ein offenes Tor. Die Prüfung meldet das deshalb als Warnung, sobald es in Produktion auftaucht.",
  },
  {
    name: 'ANALYZE',
    geltung: 'server',
    notwendigkeit: 'optional',
    wann: 'entwicklung',
    geheim: false,
    beschreibung: 'Schaltet die Bundle-Analyse im Build ein (next.config.ts).',
  },

  // ═══ Von der Plattform gesetzt — nie selbst eintragen ═══
  {
    name: 'NODE_ENV',
    geltung: 'plattform',
    notwendigkeit: 'optional',
    wann: 'immer',
    geheim: false,
    beschreibung: 'Von Next.js gesetzt.',
  },
  {
    name: 'NEXT_RUNTIME',
    geltung: 'plattform',
    notwendigkeit: 'optional',
    wann: 'immer',
    geheim: false,
    beschreibung: "Von Next.js gesetzt ('nodejs' | 'edge').",
  },
  {
    name: 'CI',
    geltung: 'plattform',
    notwendigkeit: 'optional',
    wann: 'immer',
    geheim: false,
    beschreibung: 'Von GitHub Actions gesetzt.',
  },
  {
    name: 'VERCEL_GIT_COMMIT_SHA',
    geltung: 'plattform',
    notwendigkeit: 'optional',
    wann: 'immer',
    geheim: false,
    beschreibung: 'Von Vercel gesetzt — dient als Release-Kennung.',
  },
  {
    name: 'NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA',
    geltung: 'plattform',
    notwendigkeit: 'optional',
    wann: 'immer',
    geheim: false,
    beschreibung: 'Von Vercel gesetzt — Release-Kennung im Browser.',
  },
]
