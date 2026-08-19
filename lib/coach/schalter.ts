// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Schalterverzeichnis (Deployment-Freigaben)
//
// PROBLEM, DAS DIESE DATEI LÖST: Die Schalter des PflegeCoach lagen bis
// 19.08.2026 über fünf Module verstreut (config.ts, pricing.ts,
// rechnung.ts, mfa.ts, freischaltung.ts, webhook/route.ts). Jeder war für
// sich gut dokumentiert — aber es gab keine Stelle, an der man sehen
// konnte, WELCHE Schalter es gibt, welcher Zustand der sichere ist, und
// welche externe Freigabe fehlt, bevor einer davon umgelegt werden darf.
// Die Antwort stand nur in Fließtext-Kommentaren; wer einen zehnten
// Schalter hinzufügte, konnte das unbemerkt tun.
//
// Diese Datei ist ein VERZEICHNIS, kein zweiter Auswertungsweg. Sie
// liest keine Schalter aus, um Verhalten zu steuern — das machen
// weiterhin `dipaModus()`, `preiseFreigegeben()` und die anderen
// Funktionen in ihren Modulen. Doppelte Auswertung wäre eine zweite
// Wahrheit, und zwei Wahrheiten sind eine zu viel.
//
// `lib/coach/schalter.test.ts` erzwingt Vollständigkeit: Jede
// `*_ENV`-Konstante in lib/coach muss hier eingetragen sein.
// ═══════════════════════════════════════════════════════════════

/**
 * Was muss vorliegen, bevor der Schalter umgelegt werden darf?
 *
 * Der Unterschied ist nicht akademisch: Bei `intern` liegt die
 * Entscheidung im Haus, bei `extern` wartet sie auf eine Stelle, die wir
 * nicht kontrollieren. Ein Schalter der zweiten Art ist kein „TODO",
 * sondern eine Tatsache über den Zulassungsstand.
 */
export type Freigabeweg = 'intern' | 'extern' | 'entfaellt'

/** Welcher Zustand ist der sichere, wenn nichts gesetzt ist? */
export type SichererStand = 'aus' | 'an' | 'wert_noetig'

/**
 * Wie liest das auswertende Modul den Wert?
 *
 * Die Schalter sind NICHT einheitlich gepolt, und das ist Absicht — bei
 * der Kleinunternehmerregelung ist der eingeschaltete Zustand der
 * konservative, also muss man ihn AUSschalten und nicht einschalten.
 * Diese Uneinheitlichkeit wegzumodellieren wäre bequem und falsch: Das
 * Verzeichnis würde dann etwas anderes behaupten als der Code tut.
 */
export type Schaltlogik =
  /** `=== 'true'` — Default aus. Der Normalfall. */
  | 'true_schaltet_an'
  /** `!== 'false'` — Default an, nur ein ausdrückliches 'false' schaltet aus. */
  | 'false_schaltet_aus'
  /** Kein Ja/Nein-Schalter, sondern ein Wert (Schlüssel, Nummer, Satz). */
  | 'wert'

export interface CoachSchalter {
  /** Name der Umgebungsvariablen — exakt so, wie sie gesetzt wird. */
  env: string
  titel: string
  /** Wo der Schalter ausgewertet wird (eine Stelle, nie mehrere). */
  modul: string
  /** Was passiert, wenn er scharf ist. */
  wirkung: string
  sicherer_stand: SichererStand
  /** Wie das auswertende Modul den Rohwert liest. */
  schaltlogik: Schaltlogik
  /** Ist der sichere Stand auch der Default, wenn die Variable fehlt? */
  default_ist_sicher: boolean
  freigabeweg: Freigabeweg
  /** Was konkret vorliegen muss, bevor umgelegt werden darf. */
  voraussetzung: string
  /** Was passiert, wenn er ohne diese Voraussetzung scharf gestellt wird. */
  risiko: string
  /**
   * Bindet der Schalter eine Aussage, die ohne BfArM-Listung falsch wäre?
   * Diese Schalter sind die eigentliche Schutzschicht des Produkts.
   */
  zulassungsgebunden: boolean
}

export const COACH_SCHALTER: readonly CoachSchalter[] = [
  // ── Zulassungsgebunden ────────────────────────────────────────────
  {
    env: 'COACH_DIPA_MODUS',
    titel: 'DiPA-Modus',
    modul: 'lib/coach/config.ts → dipaModus()',
    wirkung:
      'Blendet Anspruchsprüfung, Kassenbezug und Abrechnungswege ein (/pflegecoach/anspruch, ' +
      '/api/coach/anspruch) und hebt die MFA-Pflicht auf das DiPA-Niveau.',
    sicherer_stand: 'aus',
    schaltlogik: 'true_schaltet_an',
    default_ist_sicher: true,
    freigabeweg: 'extern',
    voraussetzung:
      'Aufnahme in das Verzeichnis für digitale Pflegeanwendungen durch das BfArM ' +
      '(§ 78a Abs. 3 SGB XI i. V. m. DiPAV). Liegt nicht vor.',
    risiko:
      'Das Produkt macht Aussagen zu einem Leistungsanspruch, der ohne Listung nicht besteht. ' +
      'Das ist keine Anzeigeungenauigkeit, sondern eine irreführende Angabe gegenüber Menschen ' +
      'in einer Pflegesituation.',
    zulassungsgebunden: true,
  },
  {
    env: 'COACH_FREISCHALTUNG_PFLICHT',
    titel: 'Zugang nur mit Freischaltcode',
    modul: 'lib/coach/config.ts → freischaltungPflicht()',
    wirkung:
      'Schreibende Zugriffe verlangen zusätzlich eine gültige Freischaltung ' +
      '(lib/coach/api-auth.ts → pruefeSchreibzugriff).',
    sicherer_stand: 'aus',
    schaltlogik: 'true_schaltet_an',
    default_ist_sicher: true,
    freigabeweg: 'extern',
    voraussetzung:
      'Klärung, ob und wie ein Code-Verfahren im DiPA-Versorgungsweg vorgesehen ist ' +
      '(audit/dipa/nutzerflow_dipa.md). Der Mechanismus ist gebaut und sofort aktivierbar.',
    risiko:
      'Vorzeitiges Einschalten sperrt bestehende Nutzer aus einem kostenlosen Angebot aus, ' +
      'ohne dass es dafür eine Grundlage gäbe.',
    zulassungsgebunden: true,
  },
  {
    env: 'COACH_PREISE_FREIGEGEBEN',
    titel: 'Preisliste kaufmännisch freigegeben',
    modul: 'lib/coach/pricing.ts → preiseFreigegeben()',
    wirkung: 'Gibt den gesamten Bestellweg frei (Checkout-Seite, Checkout-API, Stripe-Session).',
    sicherer_stand: 'aus',
    schaltlogik: 'true_schaltet_an',
    default_ist_sicher: true,
    freigabeweg: 'entfaellt',
    voraussetzung:
      'ENTFÄLLT — der PflegeCoach ist dauerhaft kostenlos für Endnutzer ' +
      '(Geschäftsmodell-Entscheidung 14.08.2026). Dieser Schalter bleibt auf aus. Die ' +
      'Beträge in pricing.ts sind technische Platzhalter, keine Preise.',
    risiko:
      'Einschalten würde Endnutzern Platzhalterbeträge in Rechnung stellen und der ' +
      'Kostenlos-Zusage widersprechen. lib/coach/kostenfreiheit.test.ts hält das fest.',
    zulassungsgebunden: true,
  },
  {
    env: 'COACH_NUTZUNGSNACHWEIS_AKTIV',
    titel: 'Pseudonyme Nutzungserfassung für die Evaluation',
    modul: 'lib/coach/config.ts → nutzungsnachweisAktiv()',
    wirkung: 'Erfasst pseudonymisierte Nutzungsereignisse für den Nutzennachweis.',
    sicherer_stand: 'aus',
    schaltlogik: 'true_schaltet_an',
    default_ist_sicher: true,
    freigabeweg: 'extern',
    voraussetzung:
      'Einreichungsreifes Evaluationskonzept (AK-NN-01, Eingangsblocker) und je Nutzer die ' +
      'gesonderte Einwilligung „wissenschaftliche_auswertung". Der Schalter allein genügt nie.',
    risiko:
      'Erfassung von Gesundheitsdaten zu Forschungszwecken ohne tragfähiges Konzept — ' +
      'Art. 9 DSGVO. Die zweite Sperre (Einwilligung) greift zwar weiterhin, aber ein ' +
      'Schalter, der sich auf die nächste Sperre verlässt, ist kein Schutz.',
    zulassungsgebunden: true,
  },

  // ── Sicherheit ────────────────────────────────────────────────────
  {
    env: 'COACH_MFA_PFLICHT',
    titel: 'Zweiter Faktor verpflichtend',
    modul: 'lib/coach/mfa.ts',
    wirkung:
      'Verlangt einen eingerichteten und verifizierten zweiten Faktor für schreibende ' +
      'Zugriffe. Im DiPA-Modus ohnehin erzwungen.',
    sicherer_stand: 'an',
    schaltlogik: 'true_schaltet_an',
    // Der einzige Schalter, dessen sicherer Stand NICHT der Default ist —
    // und deshalb der einzige, den man aktiv setzen muss.
    default_ist_sicher: false,
    freigabeweg: 'intern',
    voraussetzung:
      'Betriebliche Entscheidung: Ein erzwungener zweiter Faktor sperrt Nutzer aus, die ihn ' +
      'nicht einrichten können. Bei der Zielgruppe (ältere Menschen, pflegende Angehörige) ' +
      'ist das eine Abwägung zwischen Zugang und Schutz, keine reine Technikfrage.',
    risiko:
      'Bleibt er aus, genügt ein gestohlenes Passwort für den Zugriff auf Gesundheitsdaten. ' +
      'Wer freiwillig einen Faktor eingerichtet hat, ist unabhängig davon geschützt.',
    zulassungsgebunden: false,
  },
  {
    env: 'COACH_CODE_PEPPER',
    titel: 'Pepper für Freischaltcode-Hashes',
    modul: 'lib/coach/freischaltung.ts',
    wirkung: 'Geht in den Hash der Freischaltcodes ein — Codes sind ohne ihn nicht ableitbar.',
    sicherer_stand: 'wert_noetig',
    schaltlogik: 'wert',
    default_ist_sicher: false,
    freigabeweg: 'intern',
    voraussetzung:
      'Muss gesetzt sein, BEVOR der erste Code ausgegeben wird. Ein nachträglicher Wechsel ' +
      'entwertet alle bereits ausgegebenen Codes.',
    risiko: 'Ohne Pepper sind Codes allein aus dem Klartext berechenbar.',
    zulassungsgebunden: false,
  },
  {
    env: 'COACH_STRIPE_WEBHOOK_SECRET',
    titel: 'Stripe-Webhook-Signaturschlüssel',
    modul: 'app/api/coach/webhook/route.ts',
    wirkung: 'Prüft die Echtheit eingehender Stripe-Rückrufe.',
    sicherer_stand: 'wert_noetig',
    schaltlogik: 'wert',
    default_ist_sicher: false,
    freigabeweg: 'entfaellt',
    voraussetzung:
      'ENTFÄLLT, solange kein Verkauf stattfindet. Wird er je gebraucht, gilt: ohne Secret ' +
      'darf die Route keinen Rückruf annehmen (fail-closed).',
    risiko: 'Ein unsignierter Rückruf könnte Bestellzustände fälschen.',
    zulassungsgebunden: false,
  },

  // ── Steuerliche Angaben (nur bei aktivem Verkauf relevant) ────────
  {
    env: 'COACH_UST_KLEINUNTERNEHMER',
    titel: 'Kleinunternehmerregelung § 19 UStG',
    modul: 'lib/coach/pricing.ts → steuerEinstellung()',
    wirkung: 'Weist keine Umsatzsteuer aus und setzt stattdessen den Pflichthinweis.',
    sicherer_stand: 'an',
    schaltlogik: 'false_schaltet_aus',
    // Default ist hier bewusst der konservative Fall: lieber keine Steuer
    // ausweisen als eine erfundene. Deshalb ist der Default sicher.
    default_ist_sicher: true,
    freigabeweg: 'intern',
    voraussetzung: 'Steuerliche Feststellung. Wird nur wirksam, wenn überhaupt abgerechnet wird.',
    risiko: 'Falsche Einstellung führt zu fehlerhaften Rechnungen (§ 14 UStG).',
    zulassungsgebunden: false,
  },
  {
    env: 'COACH_UST_SATZ',
    titel: 'Umsatzsteuersatz bei Regelbesteuerung',
    modul: 'lib/coach/pricing.ts → steuerEinstellung()',
    wirkung: 'Prozentsatz, der bei Regelbesteuerung ausgewiesen wird (Rückfall: 19).',
    sicherer_stand: 'wert_noetig',
    schaltlogik: 'wert',
    default_ist_sicher: true,
    freigabeweg: 'intern',
    voraussetzung: 'Nur relevant, wenn COACH_UST_KLEINUNTERNEHMER auf false steht.',
    risiko: 'Ein falscher Satz erzeugt einen falschen Steuerausweis.',
    zulassungsgebunden: false,
  },
  {
    env: 'COACH_STEUERNUMMER',
    titel: 'Steuernummer des Rechnungsstellers',
    modul: 'lib/coach/rechnung.ts',
    wirkung: 'Pflichtangabe auf der Rechnung (§ 14 Abs. 4 UStG).',
    sicherer_stand: 'wert_noetig',
    schaltlogik: 'wert',
    default_ist_sicher: true,
    freigabeweg: 'intern',
    voraussetzung:
      'Nur bei aktivem Verkauf nötig. Ohne Wert lässt die Rechnung die Zeile weg statt eine ' +
      'Nummer zu erfinden.',
    risiko: 'Eine erfundene Nummer wäre schwerwiegender als eine fehlende.',
    zulassungsgebunden: false,
  },
  {
    env: 'COACH_UST_ID_NR',
    titel: 'Umsatzsteuer-Identifikationsnummer',
    modul: 'lib/coach/rechnung.ts',
    wirkung: 'Alternative zur Steuernummer auf der Rechnung; wird bevorzugt ausgewiesen.',
    sicherer_stand: 'wert_noetig',
    schaltlogik: 'wert',
    default_ist_sicher: true,
    freigabeweg: 'intern',
    voraussetzung: 'Nur bei aktivem Verkauf nötig. Eine der beiden Nummern genügt.',
    risiko: 'Siehe COACH_STEUERNUMMER.',
    zulassungsgebunden: false,
  },
  {
    env: 'COACH_STRIPE_PRICE_MONATLICH',
    titel: 'Stripe-Price-ID (monatlich)',
    modul: 'lib/coach/pricing.ts',
    wirkung: 'Verknüpft den Tarif mit einem Stripe-Preis; fehlt sie, ist der Tarif nicht bestellbar.',
    sicherer_stand: 'wert_noetig',
    schaltlogik: 'wert',
    default_ist_sicher: true,
    freigabeweg: 'entfaellt',
    voraussetzung: 'ENTFÄLLT — kein Endnutzer-Abonnement vorgesehen.',
    risiko: 'Setzen allein löst nichts aus; der Verkauf hängt zusätzlich an COACH_PREISE_FREIGEGEBEN.',
    zulassungsgebunden: false,
  },
  {
    env: 'COACH_STRIPE_PRICE_JAEHRLICH',
    titel: 'Stripe-Price-ID (jährlich)',
    modul: 'lib/coach/pricing.ts',
    wirkung: 'Wie COACH_STRIPE_PRICE_MONATLICH, für den Jahrestarif.',
    sicherer_stand: 'wert_noetig',
    schaltlogik: 'wert',
    default_ist_sicher: true,
    freigabeweg: 'entfaellt',
    voraussetzung: 'ENTFÄLLT — kein Endnutzer-Abonnement vorgesehen.',
    risiko: 'Siehe COACH_STRIPE_PRICE_MONATLICH.',
    zulassungsgebunden: false,
  },
] as const

// ── Auswertung ───────────────────────────────────────────────────────

export interface SchalterBefund {
  schalter: CoachSchalter
  /** Ist die Variable überhaupt gesetzt? */
  gesetzt: boolean
  /** Steht sie auf 'true'? (nur bei Ja/Nein-Schaltern aussagekräftig) */
  aktiv: boolean
  /**
   * Weicht der aktuelle Zustand vom sicheren ab? Bei `wert_noetig`-
   * Schaltern immer false — ein Wert ist weder sicher noch unsicher, er
   * ist nötig oder nicht.
   */
  abweichung: boolean
}

/**
 * Liest den aktuellen Stand. Bewusst NUR lesend und ohne jede
 * Verhaltenssteuerung: Wer hieraus eine Entscheidung ableitet, hat eine
 * zweite Auswertung neben `dipaModus()` gebaut — und damit die Gefahr,
 * dass beide auseinanderlaufen.
 *
 * `env` wird injizierbar gehalten, damit der Test nicht an
 * `process.env` herumschrauben muss.
 */
export function schalterStand(
  env: Record<string, string | undefined> = process.env,
  schalter: readonly CoachSchalter[] = COACH_SCHALTER
): SchalterBefund[] {
  return schalter.map(s => {
    const wert = env[s.env]
    const gesetzt = wert !== undefined && wert !== ''
    // Die Polarität kommt aus dem Verzeichnis, nicht aus einer Annahme —
    // `COACH_UST_KLEINUNTERNEHMER` ist umgekehrt gepolt, und ein
    // einheitlich unterstelltes `=== 'true'` würde sie dauerhaft als
    // unsicher melden, obwohl ihr Default gerade der konservative ist.
    const aktiv = s.schaltlogik === 'false_schaltet_aus'
      ? wert !== 'false'
      : wert === 'true'
    let abweichung = false
    if (s.sicherer_stand === 'aus') abweichung = aktiv
    else if (s.sicherer_stand === 'an') abweichung = !aktiv
    return { schalter: s, gesetzt, aktiv, abweichung }
  })
}

/**
 * Die Teilmenge, die eine Aussage freischaltet, für die eine BfArM-Listung
 * nötig wäre. Steht hier etwas auf `abweichung: true`, behauptet das
 * Produkt gerade etwas, das nicht gedeckt ist — das ist der Befund, der
 * einen Betriebsstopp rechtfertigt, nicht bloß ein Hinweis.
 */
export function zulassungsgebundeneAbweichungen(
  env: Record<string, string | undefined> = process.env
): SchalterBefund[] {
  return schalterStand(env).filter(b => b.schalter.zulassungsgebunden && b.abweichung)
}

/** Kurzform für Log- und Bannerausgabe. */
export function formatiereSchalter(befund: SchalterBefund): string {
  const zustand = befund.gesetzt ? (befund.aktiv ? 'an' : 'aus/Wert gesetzt') : 'nicht gesetzt'
  return `${befund.schalter.env} = ${zustand}${befund.abweichung ? ' ⚠ weicht vom sicheren Stand ab' : ''}`
}
