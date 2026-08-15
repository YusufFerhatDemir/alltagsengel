// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Anforderungskatalog
//
// ZWECK: eine STRUKTUR, in der Zulassungsanforderungen nachgehalten
// werden — welche Anforderung, aus welcher Quelle, wie erfüllt, womit
// belegt, wer verantwortlich, und wer sie überhaupt erledigen kann.
//
// Dies ist die maschinenlesbare Sicht auf docs/DIPA_MATRIX_FINAL.md.
// Beide führen dieselben 48 Anforderungen mit denselben Kennungen; die
// Matrix erklärt sie in Prosa, dieser Katalog macht sie prüfbar
// (`npm run dipa:katalog`).
//
// ═══ KEINE ERFUNDENEN ANFORDERUNGEN ════════════════════════════
// Der Katalog wird hier NICHT inhaltlich ausformuliert. Die verbindlichen
// Anforderungstexte stehen in den Originaldokumenten (Verordnung,
// Leitfaden, technische Richtlinie) und sind zum Zeitpunkt der
// Antragstellung in der dann gültigen Fassung zu entnehmen.
//
// Jeder Eintrag trägt deshalb:
//   * `quelle`           — wo der verbindliche Text steht
//   * `anforderungstextGeprueft` — false, solange niemand den Originaltext
//                          gegen diesen Eintrag geprüft hat
//   * `formulierung`     — unsere ARBEITSFASSUNG, ausdrücklich nicht der
//                          Verordnungstext
// Ein Eintrag mit anforderungstextGeprueft=false darf nie als „erfüllt"
// berichtet werden — katalogFortschritt() rechnet ihn nicht mit.
// Das Nachziehen dieser Flags ist selbst eine offene Aufgabe (AK-REG-01).
// ═══════════════════════════════════════════════════════════════

export type KatalogKategorie =
  | 'produkt_zweckbestimmung'
  | 'datenschutz'
  | 'datensicherheit'
  | 'interoperabilitaet'
  | 'barrierefreiheit'
  | 'qualitaet_inhalte'
  | 'nutzennachweis'
  | 'verbraucherschutz'
  | 'qms_risikomanagement'
  | 'verfahren_regulatorik'

export type ErfuellungsStand = 'offen' | 'in_arbeit' | 'erfuellt' | 'nicht_anwendbar'

/**
 * Bearbeitungsklasse — beantwortet die Frage „wer kann das überhaupt tun?".
 *
 * Sie ist unabhängig vom Erfüllungsstand: Eine C-Anforderung kann offen
 * sein (Dokument noch nicht geschrieben) oder erfüllt (Dokument liegt vor).
 * Eine D- oder E-Anforderung kann intern NIE erfüllt werden — dort ist
 * „offen" kein Versäumnis, sondern eine Tatsache.
 */
export type Bearbeitungsklasse =
  /** A — intern vollständig erledigt, Nachweis im Repository. */
  | 'A'
  /** B — technisch umsetzbar, liegt in unserer Hand. */
  | 'B'
  /** C — Dokumentation, die wir selbst erstellen können. */
  | 'C'
  /** D — externer Dienstleister oder Fachperson nötig (Prüfstelle, Kanzlei, Pflegefachkraft). */
  | 'D'
  /** E — Behörde oder Kostenträger nötig (BfArM, GKV). */
  | 'E'

export interface KatalogEintrag {
  id: string
  kategorie: KatalogKategorie
  /** Arbeitsfassung — NICHT der verbindliche Anforderungstext. */
  formulierung: string
  /** Wo der verbindliche Text nachzulesen ist. */
  quelle: string
  anforderungstextGeprueft: boolean
  stand: ErfuellungsStand
  /** Wer die Anforderung überhaupt erledigen kann. */
  klasse: Bearbeitungsklasse
  /** Womit die Erfüllung belegt wird (Datei, Zertifikat, Testprotokoll). */
  nachweis: string | null
  /**
   * Dateien im Repository, die den Nachweis tragen. Werden von
   * `scripts/dipa-katalog-check.ts` gegen das Dateisystem geprüft — ein
   * Nachweis, der auf eine gelöschte Datei zeigt, ist kein Nachweis.
   */
  nachweisDateien: string[]
  /** Verweis auf die Gap-Liste, falls offen. */
  gapId: string | null
  verantwortlich: 'technik' | 'fachlich' | 'extern' | 'geschaeftsfuehrung'
}

export const KATEGORIE_LABELS: Record<KatalogKategorie, string> = {
  produkt_zweckbestimmung: 'Produkt & Zweckbestimmung',
  datenschutz: 'Datenschutz',
  datensicherheit: 'Datensicherheit',
  interoperabilitaet: 'Interoperabilität',
  barrierefreiheit: 'Barrierefreiheit & Gebrauchstauglichkeit',
  qualitaet_inhalte: 'Qualität der Inhalte',
  nutzennachweis: 'Nutzennachweis / Evaluation',
  verbraucherschutz: 'Verbraucherschutz & Werbefreiheit',
  qms_risikomanagement: 'QMS, Risikomanagement & Betrieb',
  verfahren_regulatorik: 'Verfahren & offene regulatorische Fragen',
}

export const STAND_LABELS: Record<ErfuellungsStand, string> = {
  offen: 'Offen',
  in_arbeit: 'In Arbeit',
  erfuellt: 'Erfüllt',
  nicht_anwendbar: 'Nicht anwendbar',
}

export const KLASSE_LABELS: Record<Bearbeitungsklasse, string> = {
  A: 'Intern erledigt',
  B: 'Intern umsetzbar (technisch)',
  C: 'Intern erstellbar (Dokumentation)',
  D: 'Externer Dienstleister nötig',
  E: 'Behörde/Kostenträger nötig',
}

/**
 * Arbeitskatalog — alle 48 Anforderungen aus docs/DIPA_MATRIX_FINAL.md.
 * Ergänzungen und Korrekturen gehören zuerst in die Matrix, dann hier.
 */
export const ANFORDERUNGSKATALOG: KatalogEintrag[] = [
  // ── Produkt und Zweckbestimmung ────────────────────────────────────
  {
    id: 'AK-PROD-01', kategorie: 'produkt_zweckbestimmung', klasse: 'A',
    formulierung: 'Zweckbestimmung ist eindeutig formuliert und in Produkt und Unterlagen konsistent verwendet.',
    quelle: 'DiPAV §2 Abs. 1 Nr. 2 ("Zweckbestimmung"), Nr. 6 ("Zweckbestimmung, Wirkungsweise, Inhalt und Nutzung... in allgemeinverständlicher Form"), Fassung 22.06.2026; zusätzlich audit/dipa/finale_zweckbestimmung.md. Intern geprüft 14.08.2026.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'audit/dipa/finale_zweckbestimmung.md; UI: app/pflegecoach/start/page.tsx',
    nachweisDateien: ['audit/dipa/finale_zweckbestimmung.md', 'app/pflegecoach/start/page.tsx'],
    gapId: null, verantwortlich: 'fachlich',
  },
  {
    id: 'AK-PROD-02', kategorie: 'produkt_zweckbestimmung', klasse: 'A',
    formulierung: 'Begründung, warum kein Medizinprodukt vorliegt, liegt schriftlich vor.',
    quelle: 'Art. 2 Nr. 1 Verordnung (EU) 2017/745 (MDR) — Definition "Medizinprodukt" über vier Zweckbestimmungs-Alternativen (Diagnose/Verhütung/Überwachung/Vorhersage/Prognose/Behandlung/Linderung von Krankheit; dasselbe für Verletzung/Behinderung; Untersuchung/Ersatz/Veränderung von Anatomie oder physiologischem Vorgang; Information aus In-vitro-Untersuchung von Körperproben). audit/dipa/mdr_negativabgrenzung.md prüft alle vier Alternativen einzeln durch. DiPAV selbst entscheidet die Produktklassifikation NICHT (§3 vs. §4 DiPAV regeln beide Fälle parallel, §40a Abs. 1b SGB XI erlaubt DiPA ausdrücklich auch als Medizinprodukt niedriger Risikoklasse). Intern gegen MDR-Originaltext geprüft 14.08.2026. Finale juristische Prüfung vor Antragstellung bleibt empfohlen (Bündel mit DS-02/VS-04, siehe externe Todo-Liste).',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'audit/dipa/mdr_negativabgrenzung.md; Verbotsliste in lib/coach/empfehlungen.ts',
    nachweisDateien: ['audit/dipa/mdr_negativabgrenzung.md', 'lib/coach/empfehlungen.ts'],
    gapId: null, verantwortlich: 'fachlich',
  },
  {
    id: 'AK-PROD-03', kategorie: 'produkt_zweckbestimmung', klasse: 'A',
    formulierung: 'Das Produkt ist eindeutig identifizierbar und versioniert; Änderungen sind dokumentiert.',
    quelle: 'Kein externer Normtext (eigene Versionierungsdisziplin, Formvorgabe der DiPAV bleibt zu prüfen, siehe REG-01 §3.1). Intern geprüft 14.08.2026 gegen lib/coach/version.ts, audit/dipa/CHANGELOG_pflegecoach.md',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'SemVer in lib/coach/version.ts, Änderungshistorie im Changelog',
    nachweisDateien: ['lib/coach/version.ts', 'audit/dipa/CHANGELOG_pflegecoach.md'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-PROD-04', kategorie: 'produkt_zweckbestimmung', klasse: 'A',
    formulierung: 'Der Funktionsumfang ist vollständig beschrieben.',
    quelle: 'DiPAV §2 Abs. 1 Nr. 7 ("den Funktionen der digitalen Pflegeanwendung"), Fassung 22.06.2026; zusätzlich audit/dipa/funktionsbeschreibung_pflegecoach.md. Intern geprüft 14.08.2026.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'audit/dipa/funktionsbeschreibung_pflegecoach.md, produktbeschreibung_pflegecoach.md',
    nachweisDateien: ['audit/dipa/funktionsbeschreibung_pflegecoach.md', 'audit/dipa/produktbeschreibung_pflegecoach.md'],
    gapId: null, verantwortlich: 'fachlich',
  },
  {
    id: 'AK-PROD-05', kategorie: 'produkt_zweckbestimmung', klasse: 'A',
    formulierung: 'Die Zielgruppe ist definiert und abgegrenzt.',
    quelle: 'DiPAV §2 Abs. 1 Nr. 11 ("der Gruppe von Pflegebedürftigen und sonstigen Nutzern, für die ein pflegerischer Nutzen... nachgewiesen wurde"), Fassung 22.06.2026; zusätzlich audit/dipa/zielgruppendefinition.md. Intern geprüft 14.08.2026.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'audit/dipa/zielgruppendefinition.md',
    nachweisDateien: ['audit/dipa/zielgruppendefinition.md'],
    gapId: null, verantwortlich: 'fachlich',
  },
  {
    id: 'AK-PROD-06', kategorie: 'produkt_zweckbestimmung', klasse: 'A',
    formulierung: 'Der vollständige Nutzerflow bis zur Abrechnung ist abgebildet.',
    quelle: 'GEPRÜFT 15.08.2026 gegen DiPAV-Volltext. Es gibt KEINE Vorschrift, die wörtlich einen „Nutzerflow bis zur Abrechnung" verlangt — der Punkt ist ein eigener QS-Standard. Er hat aber vier echte Anknüpfungspunkte im Antragsinhalt, die ohne durchgängig abgebildeten Flow nicht beantwortbar sind: DiPAV §2 Abs. 1 Nr. 6 (Zweckbestimmung, Wirkungsweise, Inhalt und NUTZUNG in allgemeinverständlicher Form), Nr. 7 (Funktionen), Nr. 15 (die vorgesehenen NUTZERROLLEN) und Nr. 17 (ergänzende Unterstützungsleistungen nach Art, Inhalt, Umfang und Dauer). Ergänzend Anlage 2 Themenfeld III Nr. 2 (es muss „klar erkennbar" sein, welche Funktionen mit der Nutzung verfügbar sind und welche zu welchem Preis hinzugekauft werden). Einordnung: eigener QS-Standard mit belegten Teil-Anknüpfungen, kein eigenständiger Verordnungspunkt — dieselbe Kategorie wie AK-PROD-03/AK-QS-04/AK-QS-05.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'audit/dipa/nutzerflow_dipa.md; Migration 20260826010000',
    nachweisDateien: ['audit/dipa/nutzerflow_dipa.md'],
    gapId: null, verantwortlich: 'technik',
  },

  // ── Datenschutz ────────────────────────────────────────────────────
  {
    id: 'AK-DS-01', kategorie: 'datenschutz', klasse: 'A',
    formulierung: 'Ausdrückliche, versionierte Einwilligung für Gesundheitsdaten liegt technisch vor.',
    quelle: 'Art. 9 Abs. 2 lit. a DSGVO; Umsetzung: coach_consents',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'lib/coach/consent.ts, app/api/coach/consents; append-only mit Widerrufsprotokoll',
    nachweisDateien: ['lib/coach/consent.ts', 'lib/coach/consent.test.ts', 'app/api/coach/consents/route.ts'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-DS-02', kategorie: 'datenschutz', klasse: 'D',
    formulierung: 'Datenschutz-Folgenabschätzung ist durchgeführt und dokumentiert.',
    quelle: 'Art. 35 DSGVO',
    anforderungstextGeprueft: true, stand: 'in_arbeit',
    nachweis: 'audit/dipa/dsfa_pflegecoach.md (Vorbereitung; juristische Bewertung offen)',
    nachweisDateien: ['audit/dipa/dsfa_pflegecoach.md'],
    gapId: 'GAP-DSFA', verantwortlich: 'extern',
  },
  {
    id: 'AK-DS-03', kategorie: 'datenschutz', klasse: 'A',
    formulierung: 'Löschkonzept mit Löschanspruch und Datenportabilität liegt vor und ist umgesetzt.',
    quelle: 'Art. 17, Art. 20 DSGVO',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'audit/dipa/loeschkonzept.md; /pflegecoach/loeschung, /api/coach/export. Offen: Aufbewahrungsfrist der Sicherungen (hängt an AK-DS-04)',
    nachweisDateien: ['audit/dipa/loeschkonzept.md', 'app/api/coach/loeschung/route.ts', 'app/api/coach/export/route.ts'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-DS-04', kategorie: 'datenschutz', klasse: 'D',
    formulierung: 'Auftragsverarbeitungs-Kette ist produktbezogen dokumentiert.',
    quelle: 'Art. 28 DSGVO',
    anforderungstextGeprueft: true, stand: 'in_arbeit',
    nachweis: 'audit/dipa/avv_dossier_pflegecoach.md — Kette erhoben, Verträge fehlen',
    nachweisDateien: ['audit/dipa/avv_dossier_pflegecoach.md'],
    gapId: 'GAP-DSFA', verantwortlich: 'geschaeftsfuehrung',
  },
  {
    id: 'AK-DS-05', kategorie: 'datenschutz', klasse: 'A',
    formulierung: 'Ein Verzeichnis der Verarbeitungstätigkeiten liegt vor.',
    quelle: 'Art. 30 DSGVO',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'audit/dipa/verarbeitungsverzeichnis_pflegecoach.md',
    nachweisDateien: ['audit/dipa/verarbeitungsverzeichnis_pflegecoach.md'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-DS-06', kategorie: 'datenschutz', klasse: 'A',
    formulierung: 'Die Datenflüsse sind dokumentiert.',
    quelle: 'KORRIGIERT 15.08.2026 — der vorherige Durchgang notierte „kein eigenständiger Normtext, deckt sich vermutlich mit DS-05". Das war falsch: DiPAV §2 Abs. 1 Nr. 18 verlangt im Antrag ausdrücklich Angaben zu „den Standorten der Datenverarbeitung der digitalen Pflegeanwendung". DiPAV §5 Abs. 4 begrenzt diese Standorte materiell — Verarbeitung, auch im Auftrag, nur „im Inland, in einem Mitgliedstaat der Europäischen Union oder in einem diesem nach § 35 Absatz 7 des Ersten Buches Sozialgesetzbuch gleichgestellten Staat oder, sofern ein Angemessenheitsbeschluss gemäß Artikel 45 der Datenschutz-Grundverordnung vorliegt, in einem Drittstaat". Beides ist ohne dokumentierte Datenflüsse weder erklärbar noch prüfbar. Ergänzend Art. 30 Abs. 1 lit. c und lit. e DSGVO (Empfängerkategorien, Drittlandübermittlungen). DS-06 ist damit ein eigenständiger Punkt und fällt NICHT mit DS-05 zusammen: DS-05 ist das Verzeichnis, DS-06 der Nachweis der Standortgrenze aus §5 Abs. 4. Gegen Verordnungsvolltext (gesetze-im-internet.de) geprüft 15.08.2026.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'audit/dipa/datenfluesse_pflegecoach.md, datenschutzarchitektur_pflegecoach.md, interoperabilitaet_fhir.md',
    nachweisDateien: ['audit/dipa/datenfluesse_pflegecoach.md', 'audit/dipa/datenschutzarchitektur_pflegecoach.md', 'audit/dipa/interoperabilitaet_fhir.md'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-DS-07', kategorie: 'datenschutz', klasse: 'A',
    formulierung: 'Produktdaten werden nicht für Werbung oder Cross-Selling genutzt.',
    quelle: 'DiPAV §5 Abs. 5 ("Eine Verarbeitung personenbezogener Daten zu anderen als den in Absatz 3 Satz 1 genannten Zwecken, insbesondere zu Werbezwecken, ist ausgeschlossen."), Fassung 22.06.2026; zusätzlich audit/dipa/eul_konzept.md. Intern geprüft 14.08.2026.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'Keine anon-Grants und keine Admin-Policies auf coach_*; Tracker deaktiviert; E2E-Test prüft geladene Hosts',
    nachweisDateien: ['components/ClientSideProviders.tsx', 'e2e/pflegecoach.spec.ts'],
    gapId: null, verantwortlich: 'technik',
  },

  // ── Datensicherheit ────────────────────────────────────────────────
  {
    id: 'AK-SEC-01', kategorie: 'datensicherheit', klasse: 'D',
    formulierung: 'Zertifikat über die Erfüllung der einschlägigen technischen Sicherheitsrichtlinie liegt vor.',
    quelle: 'DiPAV §5 Abs. 2 Nr. 1 ("die nach § 78a Absatz 7 des Elften Buches Sozialgesetzbuch vom Bundesamt für Sicherheit in der Informationstechnik festgelegten Anforderungen an die Datensicherheit erfüllen") i. V. m. §8 Abs. 3 DiPAV (Zertifikatsnachweis vorgesehen); BfArM-DiPA-Leitfaden Version 1.3 (Stand 15.07.2026) Kap. 3.4, benennt das Zertifikat wörtlich als "Datensicherheitszertifikat gemäß der Technischen Richtlinien (BSI TR-03161 Anforderungen an Anwendungen im Gesundheitswesen)". Zwingend, kein Wahlnachweis — Fassung 22.06.2026/15.07.2026 gegen Volltext geprüft 14.08.2026. GEGENPROBE 15.08.2026, weil §8 Abs. 3 eine Ausweichmöglichkeit enthält, die bisher nicht geprüft war: Satz 4 lautet „Bis zum Vorliegen der Verfahren weist der Hersteller abweichend von Satz 1 die Erfüllung der zu gewährleistenden Anforderungen an die Datensicherheit durch eine Erklärung nach § 4 Absatz 6 Satz 2 der Digitale Gesundheitsanwendungen-Verordnung nach." Die Erklärungs-Option hängt also NICHT nur am Datum aus Satz 1, sondern zusätzlich daran, ob die Prüfverfahren nach §78a Abs. 7 SGB XI verfügbar sind. Geprüft: sie sind es. §78a Abs. 7 Satz 2 SGB XI erklärt §139e Abs. 10 Satz 2 bis 4 SGB V für entsprechend anwendbar; Satz 2 verpflichtet das BSI, „ab dem 1. Juni 2024" Prüf- und Zertifizierungsverfahren anzubieten, Satz 3 setzt den Stichtag für den Zertifikatsnachweis auf „spätestens ab dem 1. Januar 2025". Am Markt sind BSI-anerkannte Prüfstellen tätig (u. a. TÜVIT, secuvera, SRC). Das BfArM benennt auf seiner Seite zu den DiGA-/DiPA-Datensicherheitskriterien ausdrücklich, dass bereits gelistete DiPA „zum 01.01.2025 ein Zertifikat zum Nachweis der Erfüllung der Anforderungen an die Datensicherheit vorgelegt werden muss", und die einzige Übergangserleichterung (Zertifizierung während des laufenden Verfahrens gegen Vorlage einer „Terminbestätigung einer zuständigen Prüfstelle") lief zum 30.06.2025 aus. ERGEBNIS: Der Erklärungsweg nach §8 Abs. 3 Satz 4 ist geschlossen, die bisherige Einordnung bleibt richtig. Anwendbare Teile für uns: TR-03161-2 (Webanwendung) und TR-03161-3 (Hintergrundsystem).',
    anforderungstextGeprueft: true, stand: 'offen',
    nachweis: 'audit/dipa/tr03161_checkliste.md (Selbsteinschätzung, KEIN Zertifikat)',
    nachweisDateien: ['audit/dipa/tr03161_checkliste.md'],
    gapId: 'GAP-TR03161', verantwortlich: 'extern',
  },
  {
    id: 'AK-SEC-02', kategorie: 'datensicherheit', klasse: 'A',
    formulierung: 'Verschlüsselung im Transport und im Ruhezustand ist beschrieben und umgesetzt.',
    quelle: 'GEFUNDEN 15.08.2026 — der vorherige Durchgang suchte nur in DiPAV und Anlage 1 und notierte „kein Textfund". Die Anforderung steht nicht dort, sondern in der über DiPAV §5 Abs. 2 Nr. 1 → §78a Abs. 7 SGB XI verbindlich gemachten BSI TR-03161, und dort wörtlich: TR-03161-3 (Hintergrundsysteme) O.Data_1 „Sensible Daten MÜSSEN verschlüsselt gespeichert werden."; O.Arch_4 „In Backups gespeicherte sensible Daten MÜSSEN gemäß dem Stand der Technik verschlüsselt sein."; O.Ntwk_1 „Jegliche Netzwerkkommunikation der Anwendung MUSS durchgängig mit gegenseitiger Authentisierung verschlüsselt (zum Beispiel mittels mTLS) werden."; O.Ntwk_2 (Konfiguration nach [TR02102-2]). Kryptographische Eignung: TR-03161-1 O.Cryp_1 bis O.Cryp_7 (keine fest einprogrammierten Schlüssel, bewährte Implementierungen, Stärke nach [TR02102-1], keine Mehrfachnutzung von Schlüsseln). Verordnungsseitiger Oberbegriff: DiPAV §5 Abs. 1 („Anforderungen an die Datensicherheit nach dem Stand der Technik unter Berücksichtigung der Art der verarbeiteten Daten und der damit verbundenen Schutzstufen sowie des Schutzbedarfs"). Rohtexte der TR-03161 Teile 1 und 3 direkt von bsi.bund.de gelesen 15.08.2026. HINWEIS: Die Erfüllung wird hier intern festgestellt; die formale Bestätigung derselben Punkte ist Gegenstand von AK-SEC-01 (Zertifikat).',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'audit/dipa/verschluesselungskonzept.md (inkl. begründeter Entscheidung gegen Ende-zu-Ende)',
    nachweisDateien: ['audit/dipa/verschluesselungskonzept.md'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-SEC-03', kategorie: 'datensicherheit', klasse: 'B',
    formulierung: 'Ein zweiter Faktor ist bei jedem Authentifizierungsvorgang durchgesetzt.',
    quelle: 'GEFUNDEN 15.08.2026, und die Anforderung ist STRENGER als bisher angenommen. Vorher stand hier „kein Textfund", die Formulierung lautete nur „verfügbar" und der Kommentar in lib/coach/mfa.ts hielt fest, die Pflicht sei „offen (BfArM-Beratung)". Beides ist überholt: BSI TR-03161-1 O.Auth_3 und TR-03161-3 O.Auth_4 lauten wörtlich „Jeder Authentifizierungsvorgang des Nutzers MUSS in Form einer Zwei-Faktor-Authentisierung umgesetzt werden." — ein MUSS, kein SOLL. Verbindlich über DiPAV §5 Abs. 2 Nr. 1 → §78a Abs. 7 SGB XI. Die gesetzliche Gegenprobe bestätigt es: §78a Abs. 7 Satz 2 SGB XI erklärt §139e Abs. 10 Satz 2 bis 4 SGB V für entsprechend anwendbar; Satz 4 setzt „ein geeignetes sicheres technisches Verfahren zur Authentifizierung des Versicherten... das einen hohen Sicherheitsstandard gewährleistet" voraus und regelt ausdrücklich nur die Einwilligung in ein NIEDRIGERES Niveau als Ausnahme. Diese Herabstufung ist in TR-03161-1 O.Auth_4 / -3 O.Auth_5 als KANN ausgestaltet und verlangt „umfassende Information und Einwilligung" des einzelnen Nutzers — ein globaler Deployment-Schalter genügt dafür nicht. Rohtexte gegen bsi.bund.de und gesetze-im-internet.de geprüft 15.08.2026.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'TOTP: lib/coach/mfa.ts, /pflegecoach/einstellungen/sicherheit, Code-Abfrage im Login, serverseitige Durchsetzung in lib/coach/api-auth.ts. NACHGEZOGEN 15.08.2026: mfaPflicht() liefert im DiPA-Modus true und lässt sich dort NICHT per COACH_MFA_PFLICHT=false abschalten (fail-closed, O.Auth_3); ausserhalb des DiPA-Modus bleibt der bisherige Default (freiwillig) unverändert. Fünf neue Tests in lib/coach/mfa.test.ts halten beide Richtungen fest. BEWUSSTE, DOKUMENTIERTE ABWEICHUNG vom Wortlaut des O.Auth_3: die Sperre greift auf schreibende Zugriffe, während Lesen, Export, Widerruf und Löschung ohne zweiten Faktor erreichbar bleiben — Art. 7 Abs. 3 DSGVO verlangt, dass der Widerruf so einfach ist wie die Erteilung, Art. 15/20 DSGVO sichern Auskunft und Portabilität. Diese Abweichung ist als Herstelleraussage in die TR-03161-Prüfung (AK-SEC-01) einzubringen, nicht stillschweigend zu lassen',
    nachweisDateien: ['lib/coach/mfa.ts', 'lib/coach/mfa.test.ts', 'app/pflegecoach/einstellungen/sicherheit/page.tsx', 'lib/coach/api-auth.ts'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-SEC-04', kategorie: 'datensicherheit', klasse: 'D',
    formulierung: 'Ein externer Penetrationstest des Produkts liegt vor.',
    quelle: 'DiPAV §8 Abs. 3 Satz "Das Institut kann dann ergänzend Penetrationstests oder Sicherheitsgutachten fordern"; BfArM-Leitfaden Kap. 3.4: Pentest-Pflicht kommt über das DVPMG in die DiGAV und "somit auch für alle DiPA", verpflichtend für alle Komponenten inkl. Backend, mit Code-Review und Whitebox-Test. WICHTIGER BEFUND: Der Leitfaden stellt klar, dass das TR-03161-Datensicherheitszertifikat (AK-SEC-01) die Anforderung "in der Regel... vollständig abdecken" wird, sodass ein GESONDERTER Pentest-Nachweis nur bei besonderem Anlass zusätzlich verlangt wird. SEC-01 und SEC-04 sind daher als EIN Beschaffungsvorgang zu behandeln, nicht als zwei unabhängige Mandate — siehe externe Todo-Liste. Gegen Originaltext geprüft 14.08.2026.',
    anforderungstextGeprueft: true, stand: 'offen',
    nachweis: 'audit/dipa/pentest_beauftragung_scope.md — Beauftragungsunterlage fertig, Test nicht beauftragt. Sollte NICHT separat von SEC-01 beauftragt werden, siehe quelle',
    nachweisDateien: ['audit/dipa/pentest_beauftragung_scope.md', 'audit/dipa/security_review_pflegecoach.md'],
    gapId: 'GAP-EXT-REVIEW', verantwortlich: 'extern',
  },
  {
    id: 'AK-SEC-05', kategorie: 'datensicherheit', klasse: 'D',
    formulierung: 'Ein Informationssicherheits-Managementsystem ist eingerichtet.',
    quelle: 'BfArM-DiPA-Leitfaden Version 1.3 (Stand 15.07.2026) Kap. 3.4.1, S. 50: "Der Hersteller einer DiPA muss bei der Antragstellung ein Zertifikat über die Umsetzung eines ISMS nach ISO 27001 bzw. ISO 27001 auf Basis IT-Grundschutz vorweisen. Die zertifizierende Stelle muss durch die DAkkS oder eine entsprechende ausländische Stelle für die Durchführung einer ISO 27001 [-Zertifizierung akkreditiert sein]." KORREKTUR gegenüber vorheriger Formulierung: kein "o. ä." — Zertifikat ist laut Leitfaden zwingender Bestandteil der Antragstellung, nicht optional. Geltungsbereich (Gesamtbetrieb vs. Produktumfang) bleibt Klärungspunkt für die Beauftragung, aber die Zertifizierungspflicht selbst ist nicht mehr offen. Gegen Originaltext geprüft 14.08.2026. VORBEHALT VOM 15.08.2026 ZURÜCKGENOMMEN — er war falsch, und zwar zugunsten des Produkts, was der gefährlichere Fehler ist. Der Vorbehalt lautete, Anlage 1 DiPAV verlange nur eine Selbstauskunft und die ISO-27001-Pflicht stehe „ausschließlich im nicht bindenden Leitfaden", die Verbindlichkeit sei daher schwächer als bei AK-SEC-01. Beide Annahmen halten der Prüfung des Rohtextes nicht stand. ERSTENS: BSI TR-03161-3 (Hintergrundsysteme) Prüfaspekt 10 „Organisatorische Sicherheit", O.Org_1, wörtlich: „Der Betreiber der Hintergrundsysteme MUSS eine Zertifizierung nach [ISO27001], auf der Basis von IT-Grundschutz [BSI27001] oder einem vergleichbaren Standard nachweisen." Die TR-03161 ist über DiPAV §5 Abs. 2 Nr. 1 → §78a Abs. 7 SGB XI verbindlich — dieselbe Kette wie bei AK-SEC-01, nicht eine schwächere. ZWEITENS: DiPAV §8 Abs. 3 Satz 2 gibt dem BfArM ausdrücklich die Befugnis, „ergänzend die Vorlage eines geeigneten Zertifikates oder Nachweises über ein Informationssicherheitsmanagementsystem" zu verlangen — der Verordnungstext kennt die Anforderung also sehr wohl. Der einzige verbleibende Unterschied zu AK-SEC-01: dort ist die Vorlage zwingend („weist... nach"), hier ein „kann verlangen" plus die TR-Anforderung an den BETREIBER. WEITERE, BISHER NICHT ERFASSTE TEILANFORDERUNGEN aus demselben Prüfaspekt, die mit dem ISMS-Auftrag zusammen zu beschaffen sind: O.Org_2 — ist das Hintergrundsystem ganz oder teilweise als Cloud-Lösung realisiert, MUSS der Cloud-Anbieter „über ein C5 Testat vom Typ 2 oder ein vergleichbares Testat oder Zertifikat verfügen" (betrifft uns unmittelbar: Datenbank- und Hosting-Dienstleister sind zu prüfen und die Testate zu den Akten zu nehmen); O.Org_3 — Monitoring-System, das bei verdächtigen Operationen Alarm auslöst (MUSS); O.Org_4 — definierte Prozesse je Alarmtyp; O.Org_5 — Notfallvorsorgekonzept. Rohtext bsi.bund.de, geprüft 15.08.2026. Die Einordnung in docs/DIPA_EXTERNE_RECLASSIFIZIERUNG_2026-08-15.md ist an dieser Stelle überholt.',
    anforderungstextGeprueft: true, stand: 'offen',
    nachweis: 'audit/dipa/isms_scope_vorbereitung.md — Geltungsbereich vorbereitet, Bestand erhoben, Lücken benannt. NEU ZU ERGÄNZEN (15.08.2026): C5-Typ-2-Testate der eingesetzten Cloud-Dienstleister einholen (O.Org_2), Monitoring mit Alarmierung und Alarmprozesse (O.Org_3/O.Org_4) sowie ein Notfallvorsorgekonzept (O.Org_5) — diese vier Punkte waren im bisherigen ISMS-Scope nicht enthalten',
    nachweisDateien: ['audit/dipa/isms_scope_vorbereitung.md'],
    gapId: null, verantwortlich: 'extern',
  },
  {
    id: 'AK-SEC-06', kategorie: 'datensicherheit', klasse: 'A',
    formulierung: 'Ein Rollen- und Rechtekonzept ist technisch durchgesetzt und getestet.',
    quelle: 'GEFUNDEN 15.08.2026 (vorher „kein Textfund"). BSI TR-03161-3 (Hintergrundsysteme), verbindlich über DiPAV §5 Abs. 2 Nr. 1 → §78a Abs. 7 SGB XI: O.Auth_1 „Der Hersteller MUSS ein Konzept zur Authentisierung auf angemessenem Vertrauensniveau (vgl. [TR03107-1]), zur Autorisierung (Rollenkonzept) und zum Beenden von Sitzungen dokumentieren."; O.Auth_3 „Sind für den Zugriff auf das Hintergrundsystem verschiedene Rollen notwendig, MUSS eine Autorisierung bei jedem Datenzugriff separat realisiert werden."; O.Auth_7 „Das Hintergrundsystem MUSS jede Anfrage gemäß des Rechte- und Rollenkonzeptes (vgl. O.Auth_1) authentifizieren und autorisieren." Ergänzend TR-03161-3 O.Arch_10 (Dienste laufen nur mit den notwendigen Rechten, von aussen erreichbare Dienste nicht mit Administrator-/Root-Rechten). Genau diese Formulierung „Autorisierung bei JEDEM Datenzugriff" ist der Grund, warum die Durchsetzung über zeilenbasierte RLS-Policies und nicht über Prüfungen in der Anwendungsschicht erfolgt: RLS greift pro Zeile und pro Anfrage, eine Anwendungsprüfung nur dort, wo sie jemand aufgerufen hat. Rohtext bsi.bund.de, geprüft 15.08.2026.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'supabase/shadow/50_pflegecoach_tests.sql — 68/68 bestanden am 14.08.2026 (inkl. der acht Tabellen aus 20260826010000)',
    nachweisDateien: ['audit/dipa/rollen_rechtekonzept.md', 'supabase/shadow/50_pflegecoach_tests.sql'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-SEC-07', kategorie: 'datensicherheit', klasse: 'A',
    formulierung: 'Zugriffe sind auditierbar.',
    quelle: 'GEFUNDEN 15.08.2026 (vorher „kein Textfund"). BSI TR-03161-3 O.Arch_11, wörtlich: „Das Hintergrundsystem MUSS über ein zentrales Protokollierungssystem verfügen, in dem alle Log-Nachrichten der verschiedenen Dienste zusammenlaufen. Protokolle SOLLEN auf einem dedizierten System (sog. Logserver) gesammelt werden, um einem Löschen und Manipulieren auf den Quellsystemen entgegenzuwirken." Ergänzend: TR-03161-3 O.Pass_x „Das Ändern und Zurücksetzen von Passwörtern MUSS protokolliert werden ohne das Passwort selbst zu protokollieren."; O.Ntwk_8 (abgebrochener Verbindungsaufbau MUSS als Sicherheitsereignis protokolliert werden); TR-03161-3 O.Org_3 (Monitoring-System mit Alarm bei verdächtigen Operationen, MUSS). Verbindlich über DiPAV §5 Abs. 2 Nr. 1 → §78a Abs. 7 SGB XI. Rohtext bsi.bund.de, geprüft 15.08.2026. ABGRENZUNG: Der MUSS-Teil (zentrale, manipulationsgeschützte Protokollierung der Produktzugriffe) ist erfüllt; der SOLL-Teil (dedizierter, vom Quellsystem getrennter Logserver) ist es nicht — coach_audit_log liegt in derselben Datenbank wie die protokollierten Daten, geschützt nur durch die append-only-Policy. Das ist ein SOLL, kein MUSS, und gehört als Herstelleraussage in die TR-03161-Prüfung.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'coach_audit_log (append-only, nur Metadaten); Tests P7 prüfen Unveränderlichkeit und Abwesenheit von Wertespalten. Offen als SOLL (nicht MUSS): dedizierter Logserver getrennt vom Quellsystem, sowie O.Org_3 Monitoring mit Alarmierung — beides Betriebsthemen, siehe AK-SEC-05',
    nachweisDateien: ['audit/dipa/logging_audit_konzept.md', 'supabase/shadow/50_pflegecoach_tests.sql'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-SEC-08', kategorie: 'datensicherheit', klasse: 'A',
    formulierung: 'Das Produkt ist von der Betriebsplattform getrennt.',
    quelle: 'GEFUNDEN 15.08.2026 (vorher „kein Textfund"), und die tragende Fundstelle ist eine andere als vermutet: Nicht die Sicherheitsarchitektur begründet die Trennung, sondern die Zweckbindung. DiPAV §5 Abs. 3 Satz 1 erlaubt die Verarbeitung der im Rahmen der DiPA-Nutzung anfallenden Daten AUSSCHLIESSLICH zu drei abschliessend aufgezählten Zwecken (Erbringung der ergänzenden Unterstützungsleistungen und der Versorgung nach §40a SGB XI; Nutzennachweis in einer Erprobung nach §78a Abs. 6a SGB XI; Gewährleistung von Sicherheit, Funktionstauglichkeit, altersgerechter Nutzbarkeit und qualitätsorientierter Weiterentwicklung). §5 Abs. 5 stellt klar: „Eine Verarbeitung personenbezogener Daten zu anderen als den in Absatz 3 Satz 1 genannten Zwecken... ist ausgeschlossen." Die Zwecke der Alltagsengel-Betriebsplattform (Einsatzplanung, Abrechnung, Kundenverwaltung) sind dort nicht genannt — die Trennung ist damit rechtlich geboten, nicht bloss gute Praxis. Sicherheitsseitig ergänzend BSI TR-03161-3 O.Arch_9: „Insbesondere bei externem Hosting und Cloud-Diensten MUSS sichergestellt werden, dass der Betreiber Zugriffsmöglichkeiten zwischen verschiedenen Kunden unterbindet." Gegen Verordnungs- und TR-Volltext geprüft 15.08.2026. Die offene Frage nach der TRENNUNGSTIEFE (gemeinsames Datenbankprojekt, BfArM-Frage 13) bleibt bestehen — sie betrifft das Wie, nicht mehr das Ob.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'Eigene Tabellen, eigene Policies, eigenes Layout, kein Betriebszugriff; Tests P3 und P9.5 belegen beide Richtungen. Restrisiko: gemeinsames Datenbankprojekt',
    nachweisDateien: ['audit/dipa/sicherheitsarchitektur_pflegecoach.md', 'lib/coach/api-auth.ts'],
    gapId: null, verantwortlich: 'technik',
  },

  // ── Interoperabilität ──────────────────────────────────────────────
  {
    id: 'AK-INT-01', kategorie: 'interoperabilitaet', klasse: 'A',
    formulierung: 'Der Datenexport ist maschinenlesbar und dokumentiert.',
    quelle: 'Kein externer Normtext (eigenes Schema, keine externe Formvorgabe). Intern geprüft 14.08.2026 gegen lib/coach/export.schema.json, lib/coach/export.test.ts',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'Schema de.alltagsengel.pflegecoach.export v1.0 + Konformanz-Test',
    nachweisDateien: ['lib/coach/export.schema.json', 'lib/coach/export.test.ts'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-INT-02', kategorie: 'interoperabilitaet', klasse: 'B',
    formulierung: 'Ein verbindliches Austauschformat (z. B. FHIR) wird unterstützt, sofern gefordert.',
    quelle: 'DiPAV §7 ("Als interoperable Formate... gelten offene, international anerkannte Standards und vom Hersteller... bereitgestellte Profile über offene, international anerkannte Standards"), §2 Abs. 1 Nr. 20, Fassung 22.06.2026 — DiPAV schreibt KEIN bestimmtes Format (z. B. FHIR) im Verordnungstext selbst verbindlich vor. ERGÄNZT 14.08.2026 durch BfArM-DiPA-Leitfaden v1.3 (Kap. 2, S. 45ff.): existiert ein passendes MIO/PIO der KBV (HL7-FHIR-Basisprofile), "sollte dieses immer die erste Wahl" sein; nur wenn kein solcher Standard existiert, darf der Hersteller ein eigenes Profil über offene Standards definieren. Das ist eine klare Präferenzregel, aber weiterhin keine absolute Pflicht für jede DiPA unabhängig vom Anwendungsfall — Einzelfallprüfung bleibt bei BfArM-Beratung sinnvoll (AK-REG-05).',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'GESCHLOSSEN 15.08.2026. Die Verbindlichkeitsfrage ist beantwortet, und der verbleibende echte Rest war ein anderer als gedacht. (1) FHIR ist NICHT als bestimmtes Format vorgeschrieben; Anlage 2 Themenfeld I Nr. 1 lässt ausdrücklich „einen offenen anerkannten internationalen Standard" ODER — nur „sofern kein entsprechender Standard vorhanden ist" — ein offengelegtes Eigenprofil zu. HL7 FHIR R4 ist ein solcher offener Standard, damit greift die erste Alternative und ein Eigenprofil ist gerade nicht nötig. (2) Der tatsächlich offene Punkt war Anlage 2 I Nr. 4: die genutzten Standards müssen „vollständig veröffentlicht, auf der Anwendungswebseite verlinkt" und diskriminierungsfrei nutzbar sein. Diese Veröffentlichung gab es bis 15.08.2026 nicht — der Export war gebaut, aber nirgends öffentlich beschrieben. Nachgezogen: lib/coach/interop.ts als einzige Wahrheit, gerendert unter /pflegecoach/interoperabilitaet, verlinkt in der Fusszeile jeder Produktseite (CoachShell, nicht auf einer Einzelseite). lib/coach/interop.test.ts prüft in beide Richtungen, dass die veröffentlichte Ressourcenliste genau dem entspricht, was buildFhirBundle erzeugt — eine Veröffentlichung, die vom Code abweicht, wäre eine falsche Erklärung gegenüber dem BfArM. (3) Anlage 2 I Nr. 3 (Medizingeräte/Wearables) und Nr. 5 (eigene Profilierungen) sind „nicht zutreffend" mit genau den dort zugelassenen Begründungen, ebenfalls in interop.ts hinterlegt und getestet. Verbleibende Einzelfallfrage für die BfArM-Beratung: ob für unseren Anwendungsfall ein passendes MIO/PIO der KBV existiert, das nach Leitfaden Kap. 2 „erste Wahl" wäre — derzeit ist keines bekannt',
    nachweisDateien: ['lib/coach/fhir.ts', 'lib/coach/fhir.test.ts', 'lib/coach/interop.ts', 'lib/coach/interop.test.ts', 'app/pflegecoach/interoperabilitaet/page.tsx', 'audit/dipa/interoperabilitaet_fhir.md'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-INT-03', kategorie: 'interoperabilitaet', klasse: 'A',
    formulierung: 'Ein menschenlesbarer Bericht zur Weitergabe steht zur Verfügung.',
    quelle: 'DiPAV §2 Abs. 1 Nr. 20 ("Angaben zu den menschenlesbaren Exportformaten"), Fassung 22.06.2026; zusätzlich audit/dipa/exportfunktionen.md. Intern geprüft 14.08.2026.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: '/pflegecoach/bericht — unveränderliche Snapshots, druckbar',
    nachweisDateien: ['app/pflegecoach/bericht/page.tsx', 'audit/dipa/exportfunktionen.md'],
    gapId: null, verantwortlich: 'technik',
  },

  // ── Barrierefreiheit und Gebrauchstauglichkeit ─────────────────────
  {
    id: 'AK-BF-01', kategorie: 'barrierefreiheit', klasse: 'C',
    formulierung: 'Die Anwendung erfüllt den geltenden Barrierefreiheits-Standard.',
    quelle: 'KORRIGIERT 14.08.2026 — bisherige Annahme EN 301 549/WCAG 2.1 AA war FALSCH, gegen Originaltext widerlegt: DiPAV §6 Abs. 6 ("Digitale Pflegeanwendungen setzen die Anforderungen an die Barrierefreiheit um") verweist auf Anlage 2 DiPAV. BfArM-DiPA-Leitfaden v1.3 Kap. 3.6.3.2 (S. 73) benennt den konkreten Maßstab: "DIN EN ISO 9241-171 Leitlinien für die Zugänglichkeit von Software — vor allem der Anhang D und die Checkliste in Anhang C". WCAG, EN 301 549 und BFSG werden im Leitfaden nirgends als verbindlicher Maßstab genannt (nur die "Bundesfachstelle Barrierefreiheit" als optionale Orientierungshilfe). Der bisherige axe-core/WCAG-Ansatz ist sinnvolle Praxis, deckt aber NICHT direkt die im Verordnungstext benannte Norm ab — Anlage-C/D-Checkliste separat zu prüfen.',
    anforderungstextGeprueft: true, stand: 'in_arbeit',
    nachweis: 'KLASSE KORRIGIERT D→C am 15.08.2026, gegen den Rohtext der Anlage 2 geprüft. Der bisherige Eintrag ging von einer externen Konformitätsprüfung als Blocker aus. Das gibt die Verordnung nicht her: Anlage 2 ist ein SELBSTERKLÄRUNGS-Fragebogen — ihr Vorspann lautet „Mit dem nachfolgend aufgeführten Fragebogen hat der Hersteller die Erfüllung der Anforderungen an digitale Pflegeanwendungen nach § 6 zu erklären. Der Hersteller bestätigt die Erfüllung der Anforderungen durch Kennzeichnung in der Spalte ‚zutreffend‘", und §6 Abs. 11 verlangt nur „eine Erklärung nach Maßgabe der Anlage 2". Der einschlägige Punkt ist Anlage 2 Themenfeld IV Nr. 13: „die digitale Pflegeanwendung bietet Bedienhilfen für pflegebedürftige Menschen mit Einschränkungen oder unterstützt die durch die Plattform angebotenen Bedienhilfen. Insbesondere werden die aktuellsten Empfehlungen der DIN EN ISO 9241-171-Normenfamilie berücksichtigt." Dazu Nr. 14/15 (Anpassungen und Informationsdarbietung „auf mehr als eine Art"). Eine akkreditierte Prüfstelle ist dafür nirgends gefordert; §8 Abs. 1 erlaubt dem BfArM lediglich, im Einzelfall Zertifikate zu VERLANGEN. UMGESETZT: 3 Schriftgrade, Kontrastmodus, Sprungmarke, Landmarks, Zielgrössen ≥ 44 px, axe-core WCAG-2.1-A/AA ohne Verstoss, seit 15.08.2026 zusätzlich ein Screenreader-Semantiklauf (ARIA, Rolle/Name/Wert, Dokumentstruktur) über alle öffentlichen Seiten. ECHTER REST: Der Normtext der DIN EN ISO 9241-171 ist kostenpflichtig und liegt uns nicht vor. Ohne ihn lässt sich das „berücksichtigt" nicht belastbar dokumentieren — und eine Abgleichdokumentation gegen eine Norm, die niemand gelesen hat, wäre erfunden. Nächster Schritt ist deshalb der Erwerb des Normtextes (Beuth/DIN, Grössenordnung niedriger dreistelliger Betrag), nicht die Beauftragung einer Prüfstelle',
    nachweisDateien: ['e2e/pflegecoach.spec.ts', 'e2e/pflegecoach-axe.spec.ts', 'app/pflegecoach/pflegecoach.css'],
    gapId: 'GAP-A11Y-AUDIT', verantwortlich: 'technik',
  },
  {
    id: 'AK-BF-02', kategorie: 'barrierefreiheit', klasse: 'D',
    formulierung: 'Die Gebrauchstauglichkeit wurde mit der Zielgruppe geprüft und protokolliert.',
    quelle: 'FUNDSTELLE VERSCHÄRFT 15.08.2026: Die Forderung nach formativer UND summativer Runde steht nicht nur im (nicht bindenden) Leitfaden, sondern wörtlich im Verordnungstext selbst. Anlage 2 DiPAV, Themenfeld IV Nr. 2: „eine formative Evaluation wurde mindestens einmal in der Entwicklungsphase einer digitalen Pflegeanwendung in einer simulierten oder tatsächlichen Anwenderumgebung durchgeführt, z. B. als Cognitive Walkthrough". Nr. 3: „eine summative Validierung wurde mit einer ausreichenden Anzahl von repräsentativen Vertretern der vorgesehenen Nutzergruppe(n)... durchgeführt. Die Wahl der Anzahl der Vertreter ist nachvollziehbar begründet, die Validierung sollte mit jeweils mindestens fünf repräsentativen Vertretern durchgeführt werden." Ergänzend Nr. 10 (Befragung zur zufriedenstellenden Nutzbarkeit) und Nr. 12 (Fokusgruppen-Test zur leichten und intuitiven Nutzbarkeit) — beides ebenfalls Nutzertests, die unser Plan bisher nicht vorsieht. BfArM-Leitfaden v1.3 Kap. 3.6.3.1 (S. 70f.) und die Bezugsnormen DIN EN ISO 9241-11/-110 bleiben als Konkretisierung gültig. Unser Durchführungsplan deckt weiterhin nur die summative Runde ab. Rohtext gesetze-im-internet.de, geprüft 15.08.2026.',
    anforderungstextGeprueft: true, stand: 'in_arbeit',
    nachweis: 'audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md — 5 Testpersonen, 9 Aufgaben, Bewertungsmaßstab festgelegt. Durchführung offen: keine Testperson gewonnen',
    nachweisDateien: ['audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md', 'audit/dipa/gebrauchstauglichkeit_testprotokoll.md'],
    gapId: null, verantwortlich: 'fachlich',
  },
  {
    id: 'AK-BF-03', kategorie: 'barrierefreiheit', klasse: 'C',
    formulierung: 'Ein Screenreader-Durchgang ist durchgeführt und protokolliert.',
    quelle: 'Kein eigener Normtext, der wörtlich einen "Screenreader-Durchgang" fordert — Operationalisierung von AK-BF-01: DIN EN ISO 9241-171 Anhang D adressiert Zugänglichkeit bei Seh-Beeinträchtigungen ausdrücklich über "alternative Rezeption ausgegebener Informationen... auf auditivem... Weg" (BfArM-Leitfaden v1.3 Kap. 3.6.3.2, S. 73). Ein Screenreader-Durchgang ist die naheliegende Prüfmethode dafür, aber nicht selbst die Norm. Intern gegen Leitfaden geprüft 14.08.2026 (Muster wie AK-PROD-03/AK-QS-04/AK-QS-05).',
    anforderungstextGeprueft: true, stand: 'in_arbeit',
    nachweis: 'AUSGEBAUT 15.08.2026. Vorher: Strukturprüfung in e2e/pflegecoach.spec.ts (Überschriften, Titel, Sprungmarke, Beschriftungen, 200-%-Schrift), alles Weitere dem manuellen Durchgang überlassen. Neu in e2e/pflegecoach-axe.spec.ts ein eigener Block „Screenreader-Semantik": axe-core-Lauf über die Regelkategorien cat.aria, cat.name-role-value, cat.structure und cat.semantics — also gerade die Regeln, die axe als „best-practice" führt und die der bisherige wcag2a/wcag2aa-Lauf deshalb NICHT abdeckte, obwohl sie für eine Screenreader-Ausgabe entscheidend sind (Überschriftenhierarchie, Landmark-Struktur, Vollständigkeit von Rolle/Name/Wert). Dazu drei gezielte Prüfungen der Punkte S1 bis S3: eindeutige Dokumenttitel über alle öffentlichen Seiten (ein Screenreader sagt den Titel beim Seitenwechsel zuerst an — zwei gleiche Titel machen die Ansage wertlos), html-lang beginnt mit „de" (ohne das liest die Systemstimme deutschen Text englisch vor), und die Sprungmarke zeigt auf ein tatsächlich existierendes Element (ein totes Sprungziel ist schlimmer als keines). WARUM DER PUNKT TROTZDEM OFFEN BLEIBT: S4 bis S8 — Verständlichkeit der Ansagen, Zeitpunkt von Live-Regionen, inhaltliche Richtigkeit von Alternativtexten, Sinnhaftigkeit der Vorlesereihenfolge, Fokusfallen in echter Bedienung — sind maschinell nicht entscheidbar. Ein Screenreader-Nachweis ohne gelaufenen Screenreader wäre ein erfundener Nachweis. Der manuelle Durchgang mit VoiceOver/NVDA ist intern leistbar und braucht keinen externen Akteur, nur eine Person und einen Termin',
    nachweisDateien: ['e2e/pflegecoach.spec.ts', 'e2e/pflegecoach-axe.spec.ts', 'audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md'],
    gapId: null, verantwortlich: 'technik',
  },

  // ── Qualität der Inhalte ───────────────────────────────────────────
  {
    id: 'AK-QI-01', kategorie: 'qualitaet_inhalte', klasse: 'D',
    formulierung: 'Alle Inhalte sind pflegefachlich geprüft und freigegeben.',
    quelle: 'GEFUNDEN 15.08.2026 — und zwar als HARTER Verordnungstext, nicht als eigener Qualitätsanspruch, wie der vorherige Durchgang annahm. DiPAV §6 Abs. 8 Satz 1 wörtlich: „Die von einer digitalen Pflegeanwendung verwendeten pflegebezogenen Inhalte müssen qualitätsgesichert sein und dem allgemein anerkannten Stand der pflegerisch-medizinischen Erkenntnisse entsprechen." Satz 2 erstreckt das auf Gesundheitsinformationen („müssen ebenfalls dem allgemein anerkannten fachlichen Stand entsprechen und zielgruppengerecht aufbereitet sein"). Konkretisiert in Anlage 2, Themenfeld VI („Qualität der pflegebezogenen Inhalte") mit 19 Einzelpunkten, darunter Nr. 1 (Inhalte beruhen auf dem allgemein anerkannten fachlichen Standard), Nr. 2 (Prozesse, um sie aktuell zu halten), Nr. 3 (Quellen — Expertenstandards, Lehrwerke, Studien — sind veröffentlicht und in der Anwendung benannt) und Nr. 5 (Interessenkonflikte der Verfasser werden benannt). Antragsseitig korrespondiert DiPAV §2 Abs. 1 Nr. 9 (Angaben zu den Quellen der pflegebezogenen Inhalte). BEACHTE für die Beauftragung: Anlage 2 ist ein SELBSTERKLÄRUNGS-Fragebogen (§6 Abs. 11: „Der Hersteller fügt seinem Antrag eine Erklärung nach Maßgabe der Anlage 2 bei"). Es ist also KEINE externe Zertifizierungsstelle vorgeschrieben — es wird eine pflegefachlich qualifizierte Person gebraucht, die die Freigabe verantworten kann, und das kann eine Fachkraft aus dem eigenen Netz sein. Rohtexte gesetze-im-internet.de, geprüft 15.08.2026.',
    anforderungstextGeprueft: true, stand: 'offen',
    nachweis: 'audit/dipa/inhalte_pruefdossier.md — Prüfgegenstand, Kriterien K1–K6 und Protokollform stehen. Alle 12 Module tragen weiterhin pruefstatus: entwurf',
    nachweisDateien: ['audit/dipa/inhalte_pruefdossier.md', 'lib/coach/inhalte.ts'],
    gapId: 'GAP-QS', verantwortlich: 'fachlich',
  },
  {
    id: 'AK-QI-02', kategorie: 'qualitaet_inhalte', klasse: 'D',
    formulierung: 'Verwendete Erhebungsinstrumente sind validiert bzw. lizenziert.',
    quelle: 'BfArM-DiPA-Leitfaden v1.3, Kap. 4.5.1: "[Der Nachweis des] pflegerischen Nutzens einer DiPA muss grundsätzlich auf einem validierten Messinstrument (z. B. ein validierter Fragebogen) basieren." Ausnahmeverfahren beschrieben, falls kein geeignetes validiertes Instrument existiert (eigene Validierung im Rahmen der Nachweisstudie). DiPAV selbst (§§9-12) schreibt keine konkreten Instrumente vor, das Validierungsgebot kommt aus dem Leitfaden. Gegen Originaltext geprüft 14.08.2026.',
    anforderungstextGeprueft: true, stand: 'offen',
    nachweis: 'Produkteigenes 7-Item-Kurzinstrument, im Produkt und im FHIR-Export ausdrücklich als nicht validiert gekennzeichnet; lizenzpflichtige Instrumente übertragen nur Summenwerte',
    nachweisDateien: ['lib/coach/belastung.ts', 'lib/coach/fhir.ts'],
    gapId: null, verantwortlich: 'extern',
  },
  {
    id: 'AK-QI-03', kategorie: 'qualitaet_inhalte', klasse: 'A',
    formulierung: 'Pflegeprobleme und -ziele sind fachlich hergeleitet.',
    quelle: 'Kein externer Normtext (fachliche Herleitung nach Pflegeprozess-Methodik, keine DiPAV-Textvorgabe zur Herleitungsmethode). Bleibt sachlich abhängig von der fachlichen Freigabe unter AK-QI-01 (dort weiterhin offen). Intern geprüft 14.08.2026 gegen audit/dipa/pflegeprobleme_pflegeziele.md.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'audit/dipa/pflegeprobleme_pflegeziele.md — mit AK-QI-01 gegenzuprüfen',
    nachweisDateien: ['audit/dipa/pflegeprobleme_pflegeziele.md'],
    gapId: null, verantwortlich: 'fachlich',
  },

  // ── Nutzennachweis ─────────────────────────────────────────────────
  {
    id: 'AK-NN-01', kategorie: 'nutzennachweis', klasse: 'D',
    formulierung: 'Ein wissenschaftliches Evaluationskonzept liegt einreichungsreif vor.',
    quelle: 'DiPAV §§11-12 (Studien zum Nachweis des pflegerischen Nutzens, Bewertungsentscheidung des BfArM); BfArM-DiPA-Leitfaden v1.3 Kap. 4.5.2 (S. 100ff.), wörtlich: "Das Evaluationskonzept muss von einem herstellerunabhängigen wissenschaftlichen Institut erstellt werden." Damit ist die Notwendigkeit eines externen wissenschaftlichen Partners keine Empfehlung, sondern zwingende Voraussetzung — nicht durch eigenes Personal ersetzbar. Gegen Originaltext geprüft 14.08.2026. NACHGETRAGEN 15.08.2026, GESETZESRANG statt nur Leitfaden, und es beantwortet die Frage „gilt das erst für die endgültige Aufnahme?" mit NEIN: §78a Abs. 6a Satz 2 Nr. 3 SGB XI zählt die Unterlagen auf, die schon dem Antrag auf Aufnahme ZUR ERPROBUNG beizufügen sind, darunter wörtlich „ein von einer herstellerunabhängigen Institution erstelltes wissenschaftliches Evaluationskonzept zum Nachweis des pflegerischen Nutzens". Der Weg über die vorläufige Aufnahme (bis zu zwölf Monate, §78a Abs. 6a Satz 1) umgeht diesen Punkt also nicht, sondern setzt ihn voraus. Praktische Folge: AK-NN-01 ist unter beiden Antragswegen ein Eingangs-Blocker und damit neben AK-SEC-01 der zweite Punkt auf dem kritischen Pfad. Rohtext gesetze-im-internet.de, geprüft 15.08.2026.',
    anforderungstextGeprueft: true, stand: 'in_arbeit',
    nachweis: 'audit/dipa/evaluationskonzept.md — kein Studienpartner, kein Ethikvotum',
    nachweisDateien: ['audit/dipa/evaluationskonzept.md'],
    gapId: 'GAP-EVAL', verantwortlich: 'extern',
  },
  {
    id: 'AK-NN-02', kategorie: 'nutzennachweis', klasse: 'A',
    formulierung: 'Nutzungsdaten werden pseudonymisiert und auswertbar erhoben.',
    quelle: 'GEFUNDEN 15.08.2026 (vorher „kein Textfund"). Zwei Stränge tragen den Punkt. (1) Zulässigkeitsgrund: DiPAV §5 Abs. 3 Satz 1 Nr. 2 erlaubt die Verarbeitung „zu dem Nachweis des pflegerischen Nutzens im Rahmen einer Erprobung nach § 78a Absatz 6a des Elften Buches Sozialgesetzbuch" — ohne erhobene Nutzungsdaten gibt es diesen Nachweis nicht, und §5 Abs. 3 Satz 2 verlangt für den Zweck Nr. 3 eine GETRENNT einzuholende Einwilligung. Genau deshalb steht die Erfassung unter doppeltem Vorbehalt (Schalter COACH_NUTZUNGSNACHWEIS_AKTIV UND Einwilligung „wissenschaftliche_auswertung"). (2) Ausgestaltung: Art. 5 Abs. 1 lit. c DSGVO (Datenminimierung), Art. 32 Abs. 1 lit. a DSGVO (Pseudonymisierung als benannte Maßnahme), sowie BSI TR-03161-3 O.Data_3 „Das Hintergrundsystem MUSS die Grundsätze der Datensparsamkeit und Zweckbindung berücksichtigen." Rohtexte gesetze-im-internet.de und bsi.bund.de, geprüft 15.08.2026.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'HMAC-Pseudonym aus unlesbarem Schlüsselbestand, ohne Zeitstempel und Inhalte; Tests P9.1/P9.2 belegen die Nicht-Berechenbarkeit fremder Pseudonyme',
    nachweisDateien: ['lib/coach/nachweise.ts', 'lib/coach/nachweise.test.ts', 'app/api/coach/nutzung/route.ts'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-NN-03', kategorie: 'nutzennachweis', klasse: 'A',
    formulierung: 'Ein Pilotdesign liegt vor.',
    quelle: 'GEPRÜFT 15.08.2026: Es gibt KEINE Vorschrift, die ein „Pilotdesign" als solches verlangt — der Punkt ist ein eigener QS-Standard, dieselbe Kategorie wie AK-PROD-03/AK-PROD-06/AK-QS-04/AK-QS-05. Sein Zweck ist die Vorbereitung auf zwei Verfahren, die es sehr wohl gibt: §78a Abs. 6a SGB XI (Aufnahme zur Erprobung für bis zu zwölf Monate, mit Nachweispflicht spätestens nach Ablauf des Erprobungszeitraums) und DiPAV §§11-13 (Studien bzw. systematische Datenauswertungen zum Nachweis des pflegerischen Nutzens). WICHTIG für die Reihenfolge: §78a Abs. 6a Satz 2 Nr. 3 SGB XI verlangt bereits für den ERPROBUNGS-Antrag „ein von einer herstellerunabhängigen Institution erstelltes wissenschaftliches Evaluationskonzept" — das Pilotdesign ersetzt es nicht und darf nicht als dessen Vorstufe missverstanden werden (siehe AK-NN-01). Rohtext gesetze-im-internet.de, geprüft 15.08.2026.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'audit/dipa/pilotdesign.md — Start hängt an AK-NN-01 und AK-QI-01',
    nachweisDateien: ['audit/dipa/pilotdesign.md'],
    gapId: null, verantwortlich: 'fachlich',
  },

  // ── Verbraucherschutz ──────────────────────────────────────────────
  {
    id: 'AK-VS-01', kategorie: 'verbraucherschutz', klasse: 'A',
    formulierung: 'Die Kernfunktion ist werbefrei; es findet kein Cross-Selling mit den Daten statt.',
    quelle: 'DiPAV §6 Abs. 4 ("Digitale Pflegeanwendungen müssen frei von Werbung sein."); §5 Abs. 5 (Zweckbindung, ausdrücklicher Werbeausschluss bei der Datenverarbeitung), Fassung 22.06.2026; zusätzlich audit/dipa/eul_konzept.md. Intern geprüft 14.08.2026.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'Tracker technisch abgeschaltet; E2E-Test prüft die tatsächlich geladenen Fremdhosts',
    nachweisDateien: ['components/ClientSideProviders.tsx', 'e2e/pflegecoach.spec.ts', 'audit/dipa/eul_konzept.md'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-VS-02', kategorie: 'verbraucherschutz', klasse: 'C',
    formulierung: 'Ein erreichbarer Herstellersupport ist ausgewiesen, Reaktion innerhalb der geforderten Frist.',
    quelle: 'Anlage 2 DiPAV, Themenfeld III Nr. 8 (zu §6 Abs. 5), wörtlich: "Ja, der Hersteller stellt zur Unterstützung der Pflegebedürftigen und der weiteren Nutzer eine kostenlose deutschsprachige Anwenderbetreuung • bei der Bedienung der digitalen Pflegeanwendung und • zur Beantwortung von Anfragen spätestens innerhalb von 24 Stunden zur Verfügung." Gegen Originaltext geprüft 14.08.2026, am 15.08.2026 gegen den Rohtext der Anlage 2 wortgleich bestätigt. Die Frist ist damit weder verhandelbar noch auslegungsfähig — 24 Stunden, kostenlos, deutschsprachig. Eine Ausweichmöglichkeit gäbe es nur über §6 Abs. 10 Satz 2 (Abweichung, wenn "die jeweilige Anforderung durch eine abweichende Umsetzung gleichermaßen erreicht wird", mit Begründung im Antrag) — für eine reine Fristangabe ist das praktisch kein Weg.',
    anforderungstextGeprueft: true, stand: 'offen',
    nachweis: 'Supportadresse in Fußzeile, Produktseite, Einstellungen und Kontoseite; /pflegecoach/anfrage vorhanden. Fehlt: eine 24h-Antwortzusage ist nirgends dokumentiert oder betrieblich zugesichert (bestätigt durch Volltextsuche in lib/coach, app/pflegecoach, audit/dipa — kein Treffer). AUSDRÜCKLICH NICHT NACHGEZOGEN am 15.08.2026: Es wäre technisch trivial, die 24-Stunden-Zusage auf die Support- und Produktseiten zu schreiben. Das ist bewusst unterblieben — eine veröffentlichte Reaktionszeit ist eine bindende Zusage gegenüber Kunden und setzt eine Personal- und Bereitschaftsentscheidung voraus, die die Geschäftsführung trifft, nicht die Technik. Eine Zusage zu veröffentlichen, die betrieblich nicht hinterlegt ist, wäre schlechter als keine. Was zu entscheiden ist: Abdeckung an Wochenenden und Feiertagen (die Frist kennt keine Ausnahme), Vertretungsregelung, und wo die Zusage steht. Sobald entschieden: Text auf Produktseite und /pflegecoach/anfrage, Aufnahme in die Anlage-2-Erklärung',
    nachweisDateien: ['lib/coach/version.ts', 'app/pflegecoach/anfrage/page.tsx'],
    gapId: 'GAP-SUPPORT-SLA', verantwortlich: 'geschaeftsfuehrung',
  },
  {
    id: 'AK-VS-03', kategorie: 'verbraucherschutz', klasse: 'A',
    formulierung: 'Die Nutzung ist jederzeit und ohne Hürde beendbar.',
    quelle: 'GEFUNDEN 15.08.2026 (vorher „kein Textfund in Anlage 2"). Die tragende Norm steht nicht in Anlage 2, sondern in der DSGVO — was hier deshalb einschlägig ist, weil DiPAV §5 Abs. 3 Satz 1 die Verarbeitung ausschliesslich auf eine Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO stützt: Art. 7 Abs. 3 DSGVO, wörtlich „Die betroffene Person hat das Recht, ihre Einwilligung jederzeit zu widerrufen... Der Widerruf der Einwilligung muss so einfach wie die Erteilung der Einwilligung sein." Da die Einwilligung die EINZIGE zulässige Grundlage ist, beendet ihr Widerruf die Nutzung, und die Hürde dafür darf die der Erteilung nicht übersteigen. Flankierend: Anlage 2 Themenfeld III Nr. 6 („die digitale Pflegeanwendung enthält keine für Pflegebedürftige und weitere Nutzer intransparenten Angebote, wie z. B. sich automatisch verlängernde Abonnements oder zeitlich befristete Sonderangebote"), Art. 17 DSGVO (Löschung) sowie BSI TR-03161-3 O.Data_7, das dem Nutzer ausdrücklich die Möglichkeit einräumen MUSS, alle sensiblen Daten vollständig löschen zu lassen. Rohtexte gesetze-im-internet.de und bsi.bund.de, geprüft 15.08.2026.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: '/pflegecoach/einstellungen/konto — Widerruf, Export, Löschung, Kontolöschung; keine Frist, keine Mindestlaufzeit',
    nachweisDateien: ['app/pflegecoach/einstellungen/konto/page.tsx'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-VS-04', kategorie: 'verbraucherschutz', klasse: 'D',
    formulierung: 'Für den Selbstzahler-Weg liegen verständliche Nutzungsbedingungen vor.',
    quelle: 'Kein DiPAV-Bezug — betrifft ausdrücklich Produkt A (Selbstzahler), nicht die DiPA-Aufnahme. Geprüft 14.08.2026: DiPAV §2 Abs. 4 verlangt für DiPA selbst kostenfreien Zugang, was den Selbstzahler-Weg als Antragsinhalt gerade ausschließt (siehe Abgrenzung Produkt A/B in DIPA_MATRIX_FINAL.md). Der Regelungsbedarf für VS-04 ist deshalb reines Zivil-/Verbraucherrecht (AGB-Recht), keine DiPAV-Anforderung.',
    anforderungstextGeprueft: true, stand: 'in_arbeit',
    nachweis: 'audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md — Entwurf mit 13 Paragrafen und Prüfliste; NICHT wirksam, juristische Prüfung offen. Bestellweg technisch gesperrt',
    nachweisDateien: ['audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md', 'lib/coach/pricing.ts', 'lib/coach/bestellung.ts'],
    gapId: null, verantwortlich: 'extern',
  },

  // ── QMS, Risikomanagement, Betrieb ─────────────────────────────────
  {
    id: 'AK-QMS-01', kategorie: 'qms_risikomanagement', klasse: 'C',
    formulierung: 'Ein dokumentiertes Qualitäts- und Risikomanagementsystem liegt vor.',
    quelle: 'KORRIGIERT 14.08.2026 — vorheriger Durchgang fand keine passende DiPAV-Stelle und beließ den Eintrag auf false; die richtige Fundstelle ist nicht §6 Abs. 2, sondern Anlage 1 DiPAV (Fragebogen nach §3 Abs. 2), Themenfeld "Qualitätsmanagementsystem" (5 Einzelanforderungen: Existenz eines QMS orientiert an Medizinprodukte-Standards, Abdeckung aller sicherheits-/funktionstauglichkeitsrelevanten Organisationsteile, Dokumentation von Strukturen/Verfahren/Verantwortlichkeiten, Pflichtinhalte inkl. Änderungsmanagement/Marktbeobachtung/Sofortabhilfe/Behördenmeldung, kontinuierliche Verbesserung) sowie Themenfeld "Risikomanagementsystem" (Risikomanagementplan, systematische Gefährdungsanalyse, Bewertung, Kontrolle/Beseitigung, laufende Nutzen-Risiko-Bewertung). Rohtext direkt von gesetze-im-internet.de/dipav/anlage_1.html gelesen (nicht nur zusammengefasst) am 14.08.2026 — beide Themenfelder sind für Nicht-Medizinprodukte zwingend zu bestätigende Fragebogenpunkte, keine Kann-Bestimmung.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'QM-Handbuch (Verantwortung, Dokumentenlenkung, Änderungsverfahren, Qualitätstore, Fehlerbehandlung, Fail-Closed-Schalter), Risikoakte mit Bewertung, Lebenszyklus-Dokument. Nicht extern auditiert — die Lücken sind in §9 des Handbuchs benannt',
    nachweisDateien: ['audit/dipa/qms_handbuch_pflegecoach.md', 'audit/dipa/risikoakte_pflegecoach.md', 'audit/dipa/software_lebenszyklus_pflegecoach.md'],
    gapId: null, verantwortlich: 'geschaeftsfuehrung',
  },
  {
    id: 'AK-QMS-02', kategorie: 'qms_risikomanagement', klasse: 'A',
    formulierung: 'Eine Risikoanalyse liegt vor.',
    quelle: 'STÄRKERE FUNDSTELLE nachgetragen 14.08.2026: Anlage 1 DiPAV, Themenfeld "Risikomanagementsystem" — zwingender Fragebogenpunkt (Risikomanagementplan, systematische Gefährdungsanalyse einschließlich Anwendungsfehlern, Risikobewertung, Kontrolle/Beseitigung, laufende Nutzen-Risiko-Bewertung), nicht nur das in §3 Abs. 3 Satz 2 genannte Beispiel für einen Anlass-Nachweis. §3 Abs. 3 Satz 2 ("eine Risikoanalyse und -bewertung in erwarteter Nutzung", Fassung 22.06.2026) bleibt als zusätzliche Fundstelle korrekt, ist aber nicht die einzige. Beide gegen Rohtext geprüft 14.08.2026 (siehe auch AK-QMS-01).',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'Analyse (Identifikation) plus Risikoakte (Bewertung, Restrisiko, Wiedervorlage): 0 kritische, 3 hohe Restrisiken',
    nachweisDateien: ['audit/dipa/risikoanalyse_pflegecoach.md', 'audit/dipa/risikoakte_pflegecoach.md'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-QMS-03', kategorie: 'qms_risikomanagement', klasse: 'A',
    formulierung: 'Eine technische Dokumentation liegt vor.',
    quelle: 'DiPAV §3 Abs. 3 Satz 2 nennt "eine Dokumentation der Sicherheit und Funktionstauglichkeit" und "Unterlagen und Ergebnisse technischer Prüfungen" als Beispiele für geeignete Nachweise, Fassung 22.06.2026; zusätzlich audit/dipa/technische_dokumentation_pflegecoach.md. Hinweis: Beispiel-Nachweis, keine eigenständige Pflichtanforderung im Verordnungstext; BfArM-Leitfaden-Konkretisierung steht noch aus. Intern geprüft 14.08.2026.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'Technische Dokumentation, Sicherheitsarchitektur, Lebenszyklus',
    nachweisDateien: ['audit/dipa/technische_dokumentation_pflegecoach.md', 'audit/dipa/sicherheitsarchitektur_pflegecoach.md', 'audit/dipa/software_lebenszyklus_pflegecoach.md'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-QS-04', kategorie: 'qms_risikomanagement', klasse: 'B',
    formulierung: 'Automatisierte Tests decken Produktlogik und Zugriffsregeln ab.',
    quelle: 'Kein externer Normtext (eigene QS-Erwartung, keine externe Formvorgabe). Intern geprüft 14.08.2026 gegen lib/coach/*.test.ts, supabase/shadow/50_pflegecoach_tests.sql',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: '68/68 Zugriffstests bestanden (14.08.2026), erweitert um P9 für die acht Tabellen aus 20260826010000: Pseudonym-Isolation, kein Selbst-Freischalten, Betriebstabellen unsichtbar. P8 misst jetzt „keine Tabelle ohne RLS" statt einer festen Tabellenzahl',
    nachweisDateien: ['supabase/shadow/50_pflegecoach_tests.sql', 'lib/coach/produktgrenze.test.ts'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-QS-05', kategorie: 'qms_risikomanagement', klasse: 'B',
    formulierung: 'Ein Browser-E2E-Test des Produktbereichs liegt vor.',
    quelle: 'Kein externer Normtext (eigene QS-Erwartung, keine externe Formvorgabe). Intern geprüft 14.08.2026 gegen e2e/pflegecoach.spec.ts, CI-Job in .github/workflows/ci.yml',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'Am 14.08.2026 erstmals ausgeführt (Chromium + Mobile Safari, 24 Tests je Browser). Dabei 4 Fehler in der Testlogik selbst gefunden und behoben (falsche 404-Erwartung statt Redirect-Prüfung, zwei fehlende Waits vor async Content-Load, zu enger Formularfeld-Label-Check, ungefilterter Button-Selektor traf Next.js-Dev-Tools) sowie 1 echten Produktfehler (Inhalts-Abschneidung auf schmalen Viewports durch body-Flex-Layout, siehe unten) gefunden und in app/pflegecoach/pflegecoach.css behoben. Ergebnis danach: 24/24 grün auf beiden Browsern, reproduziert über mehrere Läufe. In .github/workflows/ci.yml als eigener Job aufgenommen.',
    nachweisDateien: ['e2e/pflegecoach.spec.ts', 'playwright.config.ts', '.github/workflows/ci.yml', 'app/pflegecoach/pflegecoach.css'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-BETR-01', kategorie: 'qms_risikomanagement', klasse: 'A',
    formulierung: 'Der Datenbankstand des Produkts ist auf Produktion angewendet.',
    quelle: 'Kein externer Normtext (interner Betriebszustand — Migrationsanwendung auf Produktion, keine DiPAV-Textvorgabe). Intern geprüft 14.08.2026 gegen Migrationen 20260819010000, 20260826010000 (Tabellencheck 12.08.2026).',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'Beide Migrationen live (Tabellencheck 12.08.2026). Die Live-Apply-Bestätigung ist als verpflichtender Schritt im Änderungsverfahren festgeschrieben',
    nachweisDateien: ['audit/dipa/qms_handbuch_pflegecoach.md'],
    gapId: null, verantwortlich: 'technik',
  },

  // ── Verfahren und offene regulatorische Fragen ─────────────────────
  {
    id: 'AK-REG-01', kategorie: 'verfahren_regulatorik', klasse: 'C',
    formulierung: 'Die Anforderungstexte sind gegen die Originaldokumente geprüft.',
    quelle: 'DiPAV (Fassung 22.06.2026) einschliesslich Anlage 1 und Anlage 2, SGB XI §78a, SGB V §139e, BSI TR-03161 Teile 1 bis 3, BfArM-DiPA-Leitfaden Version 1.3, jeweils im Volltext. ABGESCHLOSSEN 15.08.2026: alle 48 Einträge tragen anforderungstextGeprueft=true. Der Rest der zwölf zuletzt offenen Einträge wurde nicht durch Nachschlagen in Zusammenfassungen geschlossen, sondern durch Lesen der Rohtexte von gesetze-im-internet.de und bsi.bund.de. Dabei fiel auf, dass die vorherige Suche systematisch zu eng war: sieben der zwölf „kein Textfund"-Einträge (SEC-02, SEC-03, SEC-06, SEC-07, SEC-08, NN-02 und QI-01) hatten sehr wohl einen verbindlichen Text, nur nicht dort, wo gesucht worden war — die Datensicherheitsanforderungen stehen nicht in Anlage 1 DiPAV, sondern in der über §5 Abs. 2 Nr. 1 verbindlich gemachten BSI TR-03161, und QI-01 steht als klarer Verordnungssatz in §6 Abs. 8. Fünf Einträge (PROD-06, DS-06 teilweise, NN-03, sowie unverändert QS-04/QS-05) sind tatsächlich eigene QS-Standards und jetzt als solche begründet statt offengelassen. Details: docs/dipa/21_FINAL_MATRIX_2026-08-15.md.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'Alle 48 Einträge geprüft (npm run dipa:katalog meldet 0 ungeprüfte). Das Werkzeug prüft zusätzlich jeden Nachweispfad gegen das Dateisystem. Wiedervorlage: bei jeder neuen Fassung von DiPAV, TR-03161 oder BfArM-Leitfaden ist dieser Punkt erneut zu öffnen — „geprüft" gilt gegen die genannten Fassungen, nicht auf Dauer',
    nachweisDateien: ['scripts/dipa-katalog-check.ts', 'docs/dipa/21_FINAL_MATRIX_2026-08-15.md'],
    gapId: null, verantwortlich: 'geschaeftsfuehrung',
  },
  {
    id: 'AK-REG-02', kategorie: 'verfahren_regulatorik', klasse: 'E',
    formulierung: 'Ist ein Freischaltcode-Verfahren verbindlich, und wer gibt die Codes aus?',
    quelle: 'BEANTWORTET 14.08.2026 durch BfArM-DiPA-Leitfaden v1.3 Kap. 1/1.1 (S. 6): "Die Inanspruchnahme von DiPA durch die Pflegebedürftigen erfolgt auf dem Weg der Kostenerstattung. Voraussetzung für die Erstattung von DiPA ist eine Bewilligung der Sozialen Pflegeversicherung (SPV)." DiPA nutzt — anders als DiGA — KEIN Freischaltcode-/Rezeptcode-Verfahren (Volltextsuche im Leitfaden nach "Freischaltcode"/"Rezeptcode"/"16-stellig" ohne Treffer). Zugang erfolgt über einen Kostenerstattungsantrag des Pflegebedürftigen bei seiner Pflegekasse, nicht über einen von der Kasse ausgegebenen Code. Die ursprüngliche Formulierung war eine unzutreffende Analogie zum DiGA-Modell.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'Frage beantwortet: kein Freischaltcode-Verfahren vorgeschrieben. lib/coach/freischaltung.ts (COACH_FREISCHALTUNG_PFLICHT) bleibt als eigener Zugangsschalter sinnvoll, ist aber keine regulatorisch vorgeschriebene Code-Ausgabe — vor Aktivierung an das tatsächliche Kostenerstattungsmodell anzupassen',
    nachweisDateien: ['lib/coach/freischaltung.ts', 'lib/coach/freischaltung.test.ts'],
    gapId: null, verantwortlich: 'geschaeftsfuehrung',
  },
  {
    id: 'AK-REG-03', kategorie: 'verfahren_regulatorik', klasse: 'E',
    formulierung: 'Welche Qualifikationsanforderungen gelten für Erbringer ergänzender Unterstützungsleistungen?',
    quelle: 'BEANTWORTET 14.08.2026 durch BfArM-DiPA-Leitfaden v1.3 (S. 88): "Sofern pflegende Dritte, die nicht ein nach SGB XI zugelassener Pflegedienst sind, Nutzende der DiPA sein sollen, muss vom Hersteller angegeben werden, ob bestimmte Qualifikationsanforderungen erforderlich sind." Der Leitfaden schreibt selbst KEINE feste Qualifikationsliste vor — die Entscheidung, ob und welche Qualifikation nötig ist, liegt beim Hersteller (mit Ausnahme des Sonderfalls "zugelassener Pflegedienst nach SGB XI", der über eigene Zulassungsvoraussetzungen verfügt). Bestätigt damit die bisherige Einordnung "selbst gesetzt" als tatsächlich korrekt, nicht nur als Annahme. Gegen Originaltext geprüft 14.08.2026.',
    anforderungstextGeprueft: true, stand: 'erfuellt',
    nachweis: 'Kriterien SELBST gesetzt, nicht regulatorisch abgeleitet — jetzt durch Primärquelle bestätigt, dass dies der vorgesehene Weg ist, nicht nur eine Verlegenheitslösung',
    nachweisDateien: ['audit/dipa/eul_qualitaetsanforderungen.md'],
    gapId: null, verantwortlich: 'geschaeftsfuehrung',
  },
  {
    id: 'AK-REG-04', kategorie: 'verfahren_regulatorik', klasse: 'E',
    formulierung: 'Wie werden Vergütung und Abrechnungsweg geregelt?',
    quelle: 'TEILWEISE BEANTWORTET 14.08.2026 durch BfArM-DiPA-Leitfaden v1.3 Kap. 1 (S. 6) und §40a Abs. 1a SGB XI: DiPA-Erstattung ist Aufwendungsersatz nach Bewilligung der SPV, gedeckelt — Pflegebedürftige haben Anspruch auf Erstattung von DiPA-Aufwendungen UND ergänzenden Unterstützungsleistungen (§39a SGB XI) zusammen "bis zur Höhe von insgesamt bis zu 70 € im Monat". Das ist ein gesetzlicher Kostenerstattungs-Höchstbetrag, KEINE individuell verhandelte Herstellervergütung wie beim DiGA-Modell (freie Preisbildung + spätere GKV-SV-Verhandlung) — strukturell ein anderer Mechanismus. Der konkrete Abrechnungsweg für uns (Rolle als Hersteller vs. eUL-Erbringer, Anteil am 70€-Deckel) bleibt offen und ist erst nach Aufnahme klärbar. Keine Preise erfunden — 70€ ist der gesetzliche Rahmen, keine von uns festgelegte Zahl.',
    anforderungstextGeprueft: true, stand: 'offen',
    nachweis: 'coach_abrechnungswege + lib/coach/abrechnung.ts — fail-closed über verguetung_geklaert, keine Beträge im Code',
    nachweisDateien: ['lib/coach/abrechnung.ts', 'lib/coach/abrechnung.test.ts'],
    gapId: null, verantwortlich: 'geschaeftsfuehrung',
  },
  {
    id: 'AK-REG-05', kategorie: 'verfahren_regulatorik', klasse: 'E',
    formulierung: 'Ein formaler BfArM-Beratungstermin hat stattgefunden.',
    quelle: 'DiPAV §22 ("Beratung"): das BfArM berät "auf deren Anfrage" — Formulierung belegt Freiwilligkeit. BfArM-DiPA-Leitfaden v1.3 Kap. 5.5/5.5.1 (S. 117f.) bestätigt: Beratung ist ein optionales Angebot vor und nach Aufnahme, "Aus der Beratung ergibt sich keine rechtliche Bindung des BfArM", gebührenpflichtig, per Formular/Videokonferenz. KEINE Pflichtvoraussetzung für die Antragstellung selbst. Gegen Originaltext geprüft 14.08.2026 — beantwortet die in Phase 5 gestellte Frage "ist das wirklich verpflichtend?" mit NEIN, mit der Einschränkung, dass sie angesichts der Komplexität der Nutzennachweis-Anforderungen (§§9-12 DiPAV) dringend zu empfehlen bleibt.',
    anforderungstextGeprueft: true, stand: 'offen',
    nachweis: 'Fragen 1–20 vorbereitet. Günstigster nächster Schritt insgesamt: klärt AK-REG-04 (Vergütungsanteil), AK-SEC-01 (TR-03161-Scope), AK-INT-02 und AK-QI-02 in einem Zug. Nicht verpflichtend, aber weiterhin die höchste Hebelwirkung im Katalog',
    nachweisDateien: ['audit/dipa/bfarm_fragenkatalog.md'],
    gapId: null, verantwortlich: 'geschaeftsfuehrung',
  },
]

export interface KatalogFortschritt {
  gesamt: number
  erfuellt: number
  inArbeit: number
  offen: number
  nichtAnwendbar: number
  /** Einträge, deren Anforderungstext noch nie gegen das Original geprüft wurde. */
  ungeprueft: number
  /** Anteil erfüllter Anforderungen (0–1), ohne 'nicht_anwendbar'. */
  quote: number
}

/**
 * Fortschritt über den Katalog. Ein Eintrag zählt nur dann als erfüllt,
 * wenn sein Anforderungstext gegen das Originaldokument geprüft wurde —
 * sonst wäre der Fortschritt eine Selbsttäuschung.
 */
export function katalogFortschritt(eintraege: KatalogEintrag[] = ANFORDERUNGSKATALOG): KatalogFortschritt {
  const relevant = eintraege.filter(e => e.stand !== 'nicht_anwendbar')
  const erfuellt = relevant.filter(e => e.stand === 'erfuellt' && e.anforderungstextGeprueft).length
  return {
    gesamt: eintraege.length,
    erfuellt: eintraege.filter(e => e.stand === 'erfuellt').length,
    inArbeit: eintraege.filter(e => e.stand === 'in_arbeit').length,
    offen: eintraege.filter(e => e.stand === 'offen').length,
    nichtAnwendbar: eintraege.filter(e => e.stand === 'nicht_anwendbar').length,
    ungeprueft: eintraege.filter(e => !e.anforderungstextGeprueft).length,
    quote: relevant.length ? Math.round((erfuellt / relevant.length) * 100) / 100 : 0,
  }
}

/** Alle Einträge einer Kategorie — für die Darstellung im Admin-Bereich. */
export function katalogNachKategorie(
  eintraege: KatalogEintrag[] = ANFORDERUNGSKATALOG
): Array<{ kategorie: KatalogKategorie; eintraege: KatalogEintrag[] }> {
  const kategorien = Object.keys(KATEGORIE_LABELS) as KatalogKategorie[]
  return kategorien
    .map(kategorie => ({ kategorie, eintraege: eintraege.filter(e => e.kategorie === kategorie) }))
    .filter(gruppe => gruppe.eintraege.length > 0)
}

/**
 * Verteilung über die Bearbeitungsklassen — beantwortet die Frage, wie viel
 * überhaupt noch in eigener Hand liegt.
 */
export function katalogNachKlasse(
  eintraege: KatalogEintrag[] = ANFORDERUNGSKATALOG
): Record<Bearbeitungsklasse, { gesamt: number; offen: number }> {
  const klassen: Bearbeitungsklasse[] = ['A', 'B', 'C', 'D', 'E']
  const ergebnis = {} as Record<Bearbeitungsklasse, { gesamt: number; offen: number }>
  for (const klasse of klassen) {
    const gruppe = eintraege.filter(e => e.klasse === klasse)
    ergebnis[klasse] = {
      gesamt: gruppe.length,
      offen: gruppe.filter(e => e.stand !== 'erfuellt' && e.stand !== 'nicht_anwendbar').length,
    }
  }
  return ergebnis
}

/**
 * Was liegt noch in eigener Hand? Klassen A–C sind intern bearbeitbar,
 * D und E nicht. Diese Trennung ist der Kern der Planung: Ein offener
 * D-Punkt ist kein Rückstand, sondern eine Beauftragung.
 */
export function internOffen(eintraege: KatalogEintrag[] = ANFORDERUNGSKATALOG): KatalogEintrag[] {
  return eintraege.filter(
    e => ['A', 'B', 'C'].includes(e.klasse) && e.stand !== 'erfuellt' && e.stand !== 'nicht_anwendbar'
  )
}
