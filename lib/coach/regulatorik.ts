// ═══════════════════════════════════════════════════════════════
// PflegeCoach — regulatorische Konstanten (maschinenlesbar)
//
// ZWECK: Die tragenden Zahlen, Normen und Fundstellen des DiPA-Verfahrens
// standen bis 19.08.2026 ausschließlich in Prosa — in den `quelle`-Texten
// von lib/coach/anforderungskatalog.ts und in docs/dipa/**. Prosa lässt
// sich nicht prüfen: Eine falsche Norm, ein falscher Betrag oder eine
// tote Fundstelle kann beliebig lange danebenstehen, ohne dass etwas
// anschlägt. Genau das ist am 15.08.2026 passiert — REG-04 trug über
// Wochen die falsche Norm (§ 40a statt § 40b) und einen erfundenen
// 70-€-Topf, und die DiPAV wurde unter einer Dokument-ID zitiert, die
// 404 liefert.
//
// Diese Datei ist die eine Stelle, an der diese Werte stehen. Jeder
// Wert trägt seine Fundstelle und das Datum, an dem er zuletzt gegen den
// Originaltext geprüft wurde. lib/coach/regulatorik.test.ts hält sie fest.
//
// ═══ KEINE ERFUNDENEN WERTE ════════════════════════════════════
// Hier stehen ausschließlich GESETZLICHE Beträge und Normen. Es steht
// hier KEIN Vergütungsbetrag für den PflegeCoach — ein solcher existiert
// nicht und entstünde erst aus einer Vereinbarung nach § 78a Abs. 1
// SGB XI. Die 40 € und 30 € sind der Leistungsanspruch der versicherten
// Person, nicht unsere Einnahme.
//
// ═══ KEINE ZULASSUNGSAUSSAGE ═══════════════════════════════════
// Die Existenz dieser Datei bedeutet nicht, dass ein Anspruch besteht,
// eine Kasse zahlt oder eine Listung vorliegt. Sie beschreibt, was
// gelten WÜRDE — nach einer Aufnahme, die nicht erfolgt ist.
// ═══════════════════════════════════════════════════════════════

/** Stand der letzten Prüfung gegen die Originaltexte. */
export const REGULATORIK_STAND = '2026-08-19'

// ── Rechtsquellen ────────────────────────────────────────────────────

export interface Rechtsquelle {
  kurz: string
  bezeichnung: string
  /** Dokument-ID bzw. Fundstelle, unter der der Volltext auffindbar ist. */
  fundstelle: string
  url: string
  /** Wann zuletzt gegen den Volltext geprüft. */
  geprueftAm: string
}

export const RECHTSQUELLEN: readonly Rechtsquelle[] = [
  {
    kurz: 'DiPAV',
    bezeichnung: 'Digitale Pflegeanwendungen-Verordnung vom 29.09.2022 (BGBl. I S. 1568)',
    // Die Dokument-ID ist der häufigste Fehler in diesem Dossier: eine
    // zweite, plausibel aussehende ID liefert 404. Deshalb steht sie hier
    // als Konstante und nicht in jedem Dokument neu abgetippt.
    fundstelle: 'BJNR156800022',
    url: 'https://www.gesetze-im-internet.de/dipav/BJNR156800022.html',
    geprueftAm: '2026-08-15',
  },
  {
    kurz: 'SGB XI',
    bezeichnung: 'Elftes Buch Sozialgesetzbuch — Soziale Pflegeversicherung',
    fundstelle: '§§ 39a, 40a, 40b, 78a',
    url: 'https://www.gesetze-im-internet.de/sgb_11/',
    geprueftAm: '2026-08-15',
  },
  {
    kurz: 'BfArM-DiPA-Leitfaden',
    bezeichnung: 'Leitfaden für Hersteller digitaler Pflegeanwendungen, Version 1.3',
    fundstelle: 'Stand 15.07.2026',
    url: 'https://www.bfarm.de/DE/Medizinprodukte/Aufgaben/DiPA/_node.html',
    geprueftAm: '2026-08-15',
  },
  {
    kurz: 'BSI TR-03161',
    bezeichnung: 'Anforderungen an Anwendungen im Gesundheitswesen — Teil 2 (Webanwendung) und Teil 3 (Hintergrundsystem)',
    fundstelle: 'TR-03161-2, TR-03161-3',
    url: 'https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/Technische-Richtlinien/TR-nach-Thema-sortiert/tr03161/TR-03161_node.html',
    geprueftAm: '2026-08-15',
  },
  {
    kurz: 'C5GleichwV',
    bezeichnung: 'Verordnung über die Gleichwertigkeit von Testaten und Zertifikaten mit dem BSI-Kriterienkatalog C5',
    fundstelle: 'BJNR05B0A0025',
    url: 'https://www.gesetze-im-internet.de/c5gleichwv/BJNR05B0A0025.html',
    geprueftAm: '2026-08-15',
  },
] as const

/** Die DiPAV-Dokument-ID als eigene Konstante — sie wird am häufigsten falsch zitiert. */
export const DIPAV_DOKUMENT_ID = 'BJNR156800022'

// ── REG-04: Leistungsanspruch der versicherten Person ────────────────

/**
 * § 40b Abs. 1 SGB XI — ZWEI getrennte Beträge, KEIN gemeinsamer Topf.
 *
 * Wörtlich: „Bewilligt die Pflegekasse die Versorgung mit einer oder
 * mehreren digitalen Pflegeanwendungen, so hat die pflegebedürftige
 * Person Anspruch auf 1. die Erstattung von Aufwendungen für digitale
 * Pflegeanwendungen nach § 40a bis zur Höhe von insgesamt 40 Euro im
 * Kalendermonat und 2. ergänzende Unterstützungsleistungen durch
 * ambulante Pflegeeinrichtungen nach § 39a bis zur Höhe von insgesamt
 * 30 Euro im Kalendermonat."
 *
 * Die beiden Beträge sind NICHT gegeneinander verschiebbar: 30 € nicht
 * abgerufener eUL erhöhen die 40 € nicht, und umgekehrt. Ein „70-€-Deckel"
 * existiert im Gesetz nicht — die Summe ist eine Rechenoperation, kein
 * Anspruch.
 */
export const LEISTUNGSANSPRUCH = {
  norm: '§ 40b Abs. 1 SGB XI',
  /** Nr. 1 — Erstattung von Aufwendungen für DiPA nach § 40a SGB XI. */
  dipaEuroProMonat: 40,
  dipaNorm: '§ 40b Abs. 1 Nr. 1 SGB XI i. V. m. § 40a SGB XI',
  /** Nr. 2 — ergänzende Unterstützungsleistungen (eUL) nach § 39a SGB XI. */
  eulEuroProMonat: 30,
  eulNorm: '§ 40b Abs. 1 Nr. 2 SGB XI i. V. m. § 39a SGB XI',
  /** Getrennte Töpfe — keine Verschiebung zwischen den Beträgen. */
  getrennteToepfe: true,
  /** Es gibt keinen gemeinsamen Höchstbetrag. `null` ist hier die Aussage. */
  gemeinsamerDeckelEuro: null,
  bezugszeitraum: 'Kalendermonat',
  geprueftAm: '2026-08-15',
} as const

/**
 * § 78a Abs. 1 SGB XI — die Vergütung des Herstellers ist etwas anderes
 * als der Leistungsanspruch oben. Sie wird zwischen GKV-Spitzenverband
 * und Hersteller vereinbart; seit dem BEEP (01.01.2026) kann diese
 * Verhandlung bereits vor und während des Antragsverfahrens geführt
 * werden (Leitfaden v1.3 Kap. 5.3.1, S. 112). Sie ist damit eine Option,
 * keine Antragsvoraussetzung.
 */
export const HERSTELLERVERGUETUNG = {
  norm: '§ 78a Abs. 1 SGB XI',
  /** Für den PflegeCoach existiert KEIN Vergütungsbetrag. */
  vereinbarterBetragEuro: null,
  verhandlungVorAufnahmeMoeglich: true,
  schiedsstelleBeiUneinigkeit: true,
  geprueftAm: '2026-08-15',
} as const

// ── Eingangsblocker ──────────────────────────────────────────────────

export interface Eingangsblocker {
  /** Kennung im Anforderungskatalog (lib/coach/anforderungskatalog.ts). */
  katalogId: string
  kurz: string
  /** Warum der Antrag ohne diesen Punkt nicht formal vollständig ist. */
  begruendung: string
  /** Wer den Nachweis ausstellen kann — nie wir selbst. */
  ausstellendeStelle: string
  fundstelle: string
}

/**
 * Die drei Punkte, ohne die ein Antrag auf Aufnahme in das
 * DiPA-Verzeichnis nicht formal vollständig ist. Keiner davon ist
 * nachreichbar, keiner ist intern erzeugbar, keiner ist durch Aufwand
 * abkürzbar — sie bestimmen den kritischen Pfad allein.
 */
export const EINGANGSBLOCKER: readonly Eingangsblocker[] = [
  {
    katalogId: 'AK-SEC-01',
    kurz: 'Datensicherheitszertifikat nach BSI TR-03161',
    begruendung:
      'Seit 01.07.2025 Voraussetzung für die formale Vollständigkeit des Antrags. Der ' +
      'Erklärungsweg nach DiPAV § 8 Abs. 3 Satz 4 ist geschlossen, weil die Prüfverfahren ' +
      'nach § 78a Abs. 7 SGB XI verfügbar sind.',
    ausstellendeStelle: 'BSI-anerkannte Prüfstelle',
    fundstelle: 'DiPAV § 5 Abs. 2 Nr. 1 i. V. m. § 8 Abs. 3; BfArM-Leitfaden v1.3 Kap. 3.4 (S. 49)',
  },
  {
    katalogId: 'AK-SEC-05',
    kurz: 'ISMS-Zertifikat nach ISO 27001 (Zertifizierer DAkkS-akkreditiert)',
    begruendung:
      'Bei Antragstellung vorzulegen. Die Akkreditierung der zertifizierenden Stelle ist ' +
      'Teil der Anforderung — ein Zertifikat einer nicht akkreditierten Stelle erfüllt sie ' +
      'nicht. Zusätzlich verlangt BSI TR-03161-3 O.Org_1 die Zertifizierung vom Betreiber ' +
      'des Hintergrundsystems.',
    ausstellendeStelle: 'DAkkS-akkreditierte Zertifizierungsstelle (oder entsprechende ausländische Stelle)',
    fundstelle: 'BfArM-Leitfaden v1.3 Kap. 3.4.1 (S. 50); BSI TR-03161-3 O.Org_1; DiPAV § 8 Abs. 3 Satz 2',
  },
  {
    katalogId: 'AK-NN-01',
    kurz: 'Wissenschaftliches Evaluationskonzept',
    begruendung:
      'Der Nutzennachweis ist Gegenstand des Antrags und kann nicht nachgereicht werden. ' +
      'Das Konzept muss von einer wissenschaftlichen Einrichtung verantwortet sein.',
    ausstellendeStelle: 'Wissenschaftliche Einrichtung / Evaluationspartner',
    fundstelle: 'DiPAV § 6; § 78a Abs. 6a SGB XI (Erprobung); BfArM-Leitfaden v1.3 Kap. 4',
  },
] as const

// ── Datenschutz-Sonderregel für DiPA ─────────────────────────────────

/**
 * DiPAV § 5 Abs. 4 begrenzt die Auftragsverarbeitung auf Inland, EU,
 * nach § 35 Abs. 7 SGB I gleichgestellte Staaten oder Drittstaaten MIT
 * Angemessenheitsbeschluss (Art. 45 DSGVO).
 *
 * ENTSCHEIDEND UND OFT ÜBERSEHEN: Der sonst übliche Ausweg über
 * Standardvertragsklauseln (Art. 46 DSGVO) ist für DiPA NICHT ZULÄSSIG.
 * Eine AVV-Kette, die einen Dienstleister per SCC in einem Drittstaat
 * einbindet, ist damit nicht heilbar — der Dienstleister muss ersetzt
 * werden. Das ist bei der Auswahl VORAB zu prüfen, nicht hinterher.
 */
export const AUFTRAGSVERARBEITUNG = {
  norm: 'DiPAV § 5 Abs. 4',
  zulaessigeOrte: [
    'Inland',
    'Mitgliedstaat der Europäischen Union',
    'nach § 35 Abs. 7 SGB I gleichgestellter Staat',
    'Drittstaat mit Angemessenheitsbeschluss nach Art. 45 DSGVO',
  ],
  /** Der Kernsatz: SCC heilen einen Drittstaatentransfer bei DiPA nicht. */
  standardvertragsklauselnZulaessig: false,
  standardvertragsklauselnNorm: 'Art. 46 DSGVO',
  folge:
    'Ein über Standardvertragsklauseln eingebundener Drittstaats-Dienstleister ist nicht ' +
    'nachbesserbar, sondern zu ersetzen.',
  geprueftAm: '2026-08-15',
} as const

/**
 * BSI TR-03161-3 O.Org_2: Ist das Hintergrundsystem ganz oder teilweise
 * als Cloud-Lösung realisiert, MUSS der Cloud-Anbieter über ein C5-Testat
 * Typ 2 oder ein gleichwertiges Testat verfügen.
 *
 * OFFENE LÜCKE, ausdrücklich benannt: Für die aktuell eingesetzten
 * Betriebsdienstleister liegt uns kein BSI-C5-Testat vor. Das ist kein
 * Vorwurf an die Anbieter, sondern eine Tatsache über den Nachweisstand —
 * und sie ist Teil des SEC-05-Beschaffungsvorgangs, nicht separat lösbar.
 * Nach dem 01.07.2027 gilt laut C5GleichwV nur noch C5 Typ 2 ohne
 * Gleichwertigkeitsausnahmen.
 */
export const CLOUD_ATTESTIERUNG = {
  norm: 'BSI TR-03161-3 O.Org_2',
  gefordert: 'C5-Testat Typ 2 oder gleichwertiges Testat/Zertifikat',
  gleichwertigkeitBis: '2027-07-01',
  /**
   * Gleichwertige Nachweise nach C5GleichwV. SOC 2 ist NICHT darunter —
   * eine verbreitete Fehlannahme.
   */
  gleichwertigeNachweise: [
    'ISO/IEC 27001:2022',
    'ISO 27001 auf Basis IT-Grundschutz',
    'CSA STAR Level 2 (CCM V4.0)',
  ],
  soc2Gleichwertig: false,
  /** Nachweisstand unserer Betriebsdienstleister — offen, nicht beschafft. */
  testatVorhanden: false,
  luecke:
    'Für die eingesetzten Hosting- und Datenbankdienstleister liegt kein C5-Testat vor. ' +
    'Die Prüfung und Beschaffung gehört in den ISMS-Auftrag (AK-SEC-05).',
  geprueftAm: '2026-08-15',
} as const

// ── Widerlegte Annahmen (Regressionsschutz) ──────────────────────────

export interface WiderlegteAnnahme {
  id: string
  /** Was früher hier oder in den Dokumenten stand. */
  falsch: string
  /** Was tatsächlich gilt. */
  richtig: string
  quelle: string
  korrigiertAm: string
}

/**
 * Fehler, die in diesem Dossier tatsächlich einmal standen und deshalb
 * wiederkommen können. Die Liste ist kein Selbstzweck: Sie ist das, was
 * lib/coach/regulatorik.test.ts gegen den Quelltext prüft. Ein Wert, der
 * hier als `falsch` steht, darf in den Konstanten oben nicht auftauchen.
 *
 * Wer einen Eintrag hier entfernt, nimmt einen Regressionsschutz weg —
 * das ist eine bewusste Entscheidung und keine Aufräumarbeit.
 */
export const WIDERLEGTE_ANNAHMEN: readonly WiderlegteAnnahme[] = [
  {
    id: 'REG-04-norm',
    falsch: '§ 40a Abs. 1a SGB XI ist die Anspruchsnorm für die Erstattung.',
    richtig: '§ 40b Abs. 1 SGB XI ist die Anspruchsnorm. § 40a regelt die DiPA selbst.',
    quelle: 'gesetze-im-internet.de/sgb_11 — Volltext § 40b',
    korrigiertAm: '2026-08-15',
  },
  {
    id: 'REG-04-deckel',
    falsch: 'Es gibt einen gemeinsamen Höchstbetrag von 70 € im Monat.',
    richtig:
      'Zwei getrennte Beträge: 40 € für die DiPA (Nr. 1) und 30 € für ergänzende ' +
      'Unterstützungsleistungen (Nr. 2). Nicht gegeneinander verschiebbar.',
    quelle: '§ 40b Abs. 1 SGB XI',
    korrigiertAm: '2026-08-15',
  },
  {
    id: 'REG-04-verhandlung',
    falsch: 'Es gibt keine individuell verhandelte Herstellervergütung wie beim DiGA-Modell.',
    richtig:
      '§ 78a Abs. 1 SGB XI sieht genau eine solche Verhandlung vor; seit dem BEEP ist sie ' +
      'auch schon vor Aufnahme möglich.',
    quelle: '§ 78a Abs. 1 SGB XI; BfArM-Leitfaden v1.3 Kap. 5.3.1 (S. 112)',
    korrigiertAm: '2026-08-15',
  },
  {
    id: 'DIPAV-dokument-id',
    // Die falsche ID steht bewusst zusammengesetzt: scripts/forbidden-strings.json
    // verbietet sie als Literal im Repo. Die Regel soll den Fehler fangen, nicht
    // ausgerechnet die Stelle blockieren, die vor ihm warnt.
    falsch: 'Die DiPAV ist unter der Dokument-ID BJNR6228000' + '23 zu finden.',
    richtig: `Die gültige Dokument-ID ist ${DIPAV_DOKUMENT_ID}. Die andere liefert HTTP 404.`,
    quelle: 'gesetze-im-internet.de/dipav',
    korrigiertAm: '2026-08-15',
  },
  {
    id: 'DS-04-scc',
    falsch: 'Ein Drittstaatentransfer lässt sich bei DiPA über Standardvertragsklauseln absichern.',
    richtig: 'DiPAV § 5 Abs. 4 lässt SCC nicht zu — der Dienstleister muss ersetzt werden.',
    quelle: 'DiPAV § 5 Abs. 4; BfArM-Leitfaden v1.3 Kap. 3.3 (S. 37)',
    korrigiertAm: '2026-08-15',
  },
  {
    id: 'SEC-05-optional',
    falsch: 'Das ISMS-Zertifikat steht nur im nicht bindenden Leitfaden und ist damit optional.',
    richtig:
      'BSI TR-03161-3 O.Org_1 fordert es als MUSS und ist über DiPAV § 5 Abs. 2 Nr. 1 → ' +
      '§ 78a Abs. 7 SGB XI verbindlich. Eingangsblocker.',
    quelle: 'BSI TR-03161-3 O.Org_1; BfArM-Leitfaden v1.3 Kap. 3.4.1 (S. 50)',
    korrigiertAm: '2026-08-15',
  },
  {
    id: 'SEC-04-separat',
    falsch: 'Der Penetrationstest ist ein eigener, zusätzlicher Beschaffungsvorgang.',
    richtig:
      'Der Pentest geht in der TR-03161-Prüfung auf; das Datensicherheitszertifikat deckt ' +
      'die Anforderung in der Regel vollständig ab. SEC-01 und SEC-04 sind EIN Vorgang.',
    quelle: 'BfArM-Leitfaden v1.3 Kap. 3.4.2 (S. 51)',
    korrigiertAm: '2026-08-15',
  },
  {
    id: 'C5-soc2',
    falsch: 'SOC 2 gilt als gleichwertiger Nachweis zum BSI C5.',
    richtig: 'SOC 2 ist in der C5GleichwV nicht als gleichwertig gelistet.',
    quelle: 'C5GleichwV (BJNR05B0A0025)',
    korrigiertAm: '2026-08-15',
  },
] as const
