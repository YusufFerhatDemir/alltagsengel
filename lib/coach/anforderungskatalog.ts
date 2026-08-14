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
    quelle: 'audit/dipa/finale_zweckbestimmung.md; Originaltext: Verordnung/Leitfaden',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'audit/dipa/finale_zweckbestimmung.md; UI: app/pflegecoach/start/page.tsx',
    nachweisDateien: ['audit/dipa/finale_zweckbestimmung.md', 'app/pflegecoach/start/page.tsx'],
    gapId: null, verantwortlich: 'fachlich',
  },
  {
    id: 'AK-PROD-02', kategorie: 'produkt_zweckbestimmung', klasse: 'A',
    formulierung: 'Begründung, warum kein Medizinprodukt vorliegt, liegt schriftlich vor.',
    quelle: 'audit/dipa/mdr_negativabgrenzung.md; Originaltext: MDR/Verordnung',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'audit/dipa/mdr_negativabgrenzung.md; Verbotsliste in lib/coach/empfehlungen.ts',
    nachweisDateien: ['audit/dipa/mdr_negativabgrenzung.md', 'lib/coach/empfehlungen.ts'],
    gapId: null, verantwortlich: 'fachlich',
  },
  {
    id: 'AK-PROD-03', kategorie: 'produkt_zweckbestimmung', klasse: 'A',
    formulierung: 'Das Produkt ist eindeutig identifizierbar und versioniert; Änderungen sind dokumentiert.',
    quelle: 'lib/coach/version.ts, audit/dipa/CHANGELOG_pflegecoach.md',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'SemVer in lib/coach/version.ts, Änderungshistorie im Changelog',
    nachweisDateien: ['lib/coach/version.ts', 'audit/dipa/CHANGELOG_pflegecoach.md'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-PROD-04', kategorie: 'produkt_zweckbestimmung', klasse: 'A',
    formulierung: 'Der Funktionsumfang ist vollständig beschrieben.',
    quelle: 'audit/dipa/funktionsbeschreibung_pflegecoach.md',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'audit/dipa/funktionsbeschreibung_pflegecoach.md, produktbeschreibung_pflegecoach.md',
    nachweisDateien: ['audit/dipa/funktionsbeschreibung_pflegecoach.md', 'audit/dipa/produktbeschreibung_pflegecoach.md'],
    gapId: null, verantwortlich: 'fachlich',
  },
  {
    id: 'AK-PROD-05', kategorie: 'produkt_zweckbestimmung', klasse: 'A',
    formulierung: 'Die Zielgruppe ist definiert und abgegrenzt.',
    quelle: 'audit/dipa/zielgruppendefinition.md',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'audit/dipa/zielgruppendefinition.md',
    nachweisDateien: ['audit/dipa/zielgruppendefinition.md'],
    gapId: null, verantwortlich: 'fachlich',
  },
  {
    id: 'AK-PROD-06', kategorie: 'produkt_zweckbestimmung', klasse: 'A',
    formulierung: 'Der vollständige Nutzerflow bis zur Abrechnung ist abgebildet.',
    quelle: 'audit/dipa/nutzerflow_dipa.md',
    anforderungstextGeprueft: false, stand: 'erfuellt',
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
    quelle: 'audit/dipa/datenfluesse_pflegecoach.md',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'audit/dipa/datenfluesse_pflegecoach.md, datenschutzarchitektur_pflegecoach.md, interoperabilitaet_fhir.md',
    nachweisDateien: ['audit/dipa/datenfluesse_pflegecoach.md', 'audit/dipa/datenschutzarchitektur_pflegecoach.md', 'audit/dipa/interoperabilitaet_fhir.md'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-DS-07', kategorie: 'datenschutz', klasse: 'A',
    formulierung: 'Produktdaten werden nicht für Werbung oder Cross-Selling genutzt.',
    quelle: 'audit/dipa/eul_konzept.md; Umsetzung: keine Tracker unter /pflegecoach',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'Keine anon-Grants und keine Admin-Policies auf coach_*; Tracker deaktiviert; E2E-Test prüft geladene Hosts',
    nachweisDateien: ['components/ClientSideProviders.tsx', 'e2e/pflegecoach.spec.ts'],
    gapId: null, verantwortlich: 'technik',
  },

  // ── Datensicherheit ────────────────────────────────────────────────
  {
    id: 'AK-SEC-01', kategorie: 'datensicherheit', klasse: 'D',
    formulierung: 'Zertifikat über die Erfüllung der einschlägigen technischen Sicherheitsrichtlinie liegt vor.',
    quelle: 'BSI TR-03161; Prüfung durch akkreditierte Prüfstelle',
    anforderungstextGeprueft: false, stand: 'offen',
    nachweis: 'audit/dipa/tr03161_checkliste.md (Selbsteinschätzung, KEIN Zertifikat)',
    nachweisDateien: ['audit/dipa/tr03161_checkliste.md'],
    gapId: 'GAP-TR03161', verantwortlich: 'extern',
  },
  {
    id: 'AK-SEC-02', kategorie: 'datensicherheit', klasse: 'A',
    formulierung: 'Verschlüsselung im Transport und im Ruhezustand ist beschrieben und umgesetzt.',
    quelle: 'audit/dipa/verschluesselungskonzept.md',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'audit/dipa/verschluesselungskonzept.md (inkl. begründeter Entscheidung gegen Ende-zu-Ende)',
    nachweisDateien: ['audit/dipa/verschluesselungskonzept.md'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-SEC-03', kategorie: 'datensicherheit', klasse: 'B',
    formulierung: 'Ein zweiter Faktor bei der Anmeldung ist verfügbar.',
    quelle: 'audit/dipa/security_review_pflegecoach.md',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'TOTP: lib/coach/mfa.ts, /pflegecoach/einstellungen/sicherheit, Code-Abfrage im Login, serverseitige Durchsetzung in lib/coach/api-auth.ts. Pflicht über COACH_MFA_PFLICHT (Default aus)',
    nachweisDateien: ['lib/coach/mfa.ts', 'lib/coach/mfa.test.ts', 'app/pflegecoach/einstellungen/sicherheit/page.tsx', 'lib/coach/api-auth.ts'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-SEC-04', kategorie: 'datensicherheit', klasse: 'D',
    formulierung: 'Ein externer Penetrationstest des Produkts liegt vor.',
    quelle: 'audit/dipa/dipav_gap_liste.md',
    anforderungstextGeprueft: false, stand: 'offen',
    nachweis: 'audit/dipa/pentest_beauftragung_scope.md — Beauftragungsunterlage fertig, Test nicht beauftragt',
    nachweisDateien: ['audit/dipa/pentest_beauftragung_scope.md', 'audit/dipa/security_review_pflegecoach.md'],
    gapId: 'GAP-EXT-REVIEW', verantwortlich: 'extern',
  },
  {
    id: 'AK-SEC-05', kategorie: 'datensicherheit', klasse: 'D',
    formulierung: 'Ein Informationssicherheits-Managementsystem ist eingerichtet.',
    quelle: 'ISO/IEC 27001 o. ä.; Geltungsbereich offen (ORF-2)',
    anforderungstextGeprueft: false, stand: 'offen',
    nachweis: 'audit/dipa/isms_scope_vorbereitung.md — Geltungsbereich vorbereitet, Bestand erhoben, Lücken benannt',
    nachweisDateien: ['audit/dipa/isms_scope_vorbereitung.md'],
    gapId: null, verantwortlich: 'extern',
  },
  {
    id: 'AK-SEC-06', kategorie: 'datensicherheit', klasse: 'A',
    formulierung: 'Ein Rollen- und Rechtekonzept ist technisch durchgesetzt und getestet.',
    quelle: 'audit/dipa/rollen_rechtekonzept.md',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'supabase/shadow/50_pflegecoach_tests.sql — 68/68 bestanden am 14.08.2026 (inkl. der acht Tabellen aus 20260826010000)',
    nachweisDateien: ['audit/dipa/rollen_rechtekonzept.md', 'supabase/shadow/50_pflegecoach_tests.sql'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-SEC-07', kategorie: 'datensicherheit', klasse: 'A',
    formulierung: 'Zugriffe sind auditierbar.',
    quelle: 'audit/dipa/logging_audit_konzept.md',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'coach_audit_log (append-only, nur Metadaten); Tests P7 prüfen Unveränderlichkeit und Abwesenheit von Wertespalten',
    nachweisDateien: ['audit/dipa/logging_audit_konzept.md', 'supabase/shadow/50_pflegecoach_tests.sql'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-SEC-08', kategorie: 'datensicherheit', klasse: 'A',
    formulierung: 'Das Produkt ist von der Betriebsplattform getrennt.',
    quelle: 'audit/dipa/sicherheitsarchitektur_pflegecoach.md; Trennungstiefe offen (BfArM-Frage 13)',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'Eigene Tabellen, eigene Policies, eigenes Layout, kein Betriebszugriff; Tests P3 und P9.5 belegen beide Richtungen. Restrisiko: gemeinsames Datenbankprojekt',
    nachweisDateien: ['audit/dipa/sicherheitsarchitektur_pflegecoach.md', 'lib/coach/api-auth.ts'],
    gapId: null, verantwortlich: 'technik',
  },

  // ── Interoperabilität ──────────────────────────────────────────────
  {
    id: 'AK-INT-01', kategorie: 'interoperabilitaet', klasse: 'A',
    formulierung: 'Der Datenexport ist maschinenlesbar und dokumentiert.',
    quelle: 'lib/coach/export.schema.json',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'Schema de.alltagsengel.pflegecoach.export v1.0 + Konformanz-Test',
    nachweisDateien: ['lib/coach/export.schema.json', 'lib/coach/export.test.ts'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-INT-02', kategorie: 'interoperabilitaet', klasse: 'B',
    formulierung: 'Ein verbindliches Austauschformat (z. B. FHIR) wird unterstützt, sofern gefordert.',
    quelle: 'Offene regulatorische Frage ORF-9 / BfArM-Frage 10',
    anforderungstextGeprueft: false, stand: 'in_arbeit',
    nachweis: 'FHIR-R4-Bundle (Questionnaire, QuestionnaireResponse, Goal, CarePlan) über /api/coach/export?format=fhir. Ausdrücklich OHNE Profil- oder Terminologie-Anspruch; Verbindlichkeit bleibt extern zu klären',
    nachweisDateien: ['lib/coach/fhir.ts', 'lib/coach/fhir.test.ts', 'audit/dipa/interoperabilitaet_fhir.md'],
    gapId: 'GAP-INTEROP', verantwortlich: 'technik',
  },
  {
    id: 'AK-INT-03', kategorie: 'interoperabilitaet', klasse: 'A',
    formulierung: 'Ein menschenlesbarer Bericht zur Weitergabe steht zur Verfügung.',
    quelle: 'audit/dipa/exportfunktionen.md',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: '/pflegecoach/bericht — unveränderliche Snapshots, druckbar',
    nachweisDateien: ['app/pflegecoach/bericht/page.tsx', 'audit/dipa/exportfunktionen.md'],
    gapId: null, verantwortlich: 'technik',
  },

  // ── Barrierefreiheit und Gebrauchstauglichkeit ─────────────────────
  {
    id: 'AK-BF-01', kategorie: 'barrierefreiheit', klasse: 'D',
    formulierung: 'Die Anwendung erfüllt den geltenden Barrierefreiheits-Standard.',
    quelle: 'EN 301 549 / WCAG 2.1 AA — Originaltext maßgeblich',
    anforderungstextGeprueft: false, stand: 'in_arbeit',
    nachweis: 'Grundausstattung umgesetzt (3 Schriftgrade, Kontrastmodus, Sprungmarke, Landmarks, Zielgrößen ≥ 44 px); Strukturprüfung in e2e/pflegecoach.spec.ts. Externer BITV-Test offen',
    nachweisDateien: ['e2e/pflegecoach.spec.ts', 'app/pflegecoach/pflegecoach.css'],
    gapId: 'GAP-A11Y-AUDIT', verantwortlich: 'extern',
  },
  {
    id: 'AK-BF-02', kategorie: 'barrierefreiheit', klasse: 'D',
    formulierung: 'Die Gebrauchstauglichkeit wurde mit der Zielgruppe geprüft und protokolliert.',
    quelle: 'audit/dipa/gebrauchstauglichkeit_testprotokoll.md',
    anforderungstextGeprueft: false, stand: 'in_arbeit',
    nachweis: 'audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md — 5 Testpersonen, 9 Aufgaben, Bewertungsmaßstab festgelegt. Durchführung offen: keine Testperson gewonnen',
    nachweisDateien: ['audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md', 'audit/dipa/gebrauchstauglichkeit_testprotokoll.md'],
    gapId: null, verantwortlich: 'fachlich',
  },
  {
    id: 'AK-BF-03', kategorie: 'barrierefreiheit', klasse: 'C',
    formulierung: 'Ein Screenreader-Durchgang ist durchgeführt und protokolliert.',
    quelle: 'audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md §5',
    anforderungstextGeprueft: false, stand: 'in_arbeit',
    nachweis: 'Maschinelle Strukturprüfung vorhanden (e2e/pflegecoach.spec.ts: Überschriften, Titel, Sprungmarke, Beschriftungen, 200-%-Schrift). Prüfpunkte S1–S8 festgelegt; manueller Durchgang mit VoiceOver/NVDA offen',
    nachweisDateien: ['e2e/pflegecoach.spec.ts', 'audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md'],
    gapId: null, verantwortlich: 'technik',
  },

  // ── Qualität der Inhalte ───────────────────────────────────────────
  {
    id: 'AK-QI-01', kategorie: 'qualitaet_inhalte', klasse: 'D',
    formulierung: 'Alle Inhalte sind pflegefachlich geprüft und freigegeben.',
    quelle: 'lib/coach/inhalte.ts (pruefstatus)',
    anforderungstextGeprueft: false, stand: 'offen',
    nachweis: 'audit/dipa/inhalte_pruefdossier.md — Prüfgegenstand, Kriterien K1–K6 und Protokollform stehen. Alle 12 Module tragen weiterhin pruefstatus: entwurf',
    nachweisDateien: ['audit/dipa/inhalte_pruefdossier.md', 'lib/coach/inhalte.ts'],
    gapId: 'GAP-QS', verantwortlich: 'fachlich',
  },
  {
    id: 'AK-QI-02', kategorie: 'qualitaet_inhalte', klasse: 'D',
    formulierung: 'Verwendete Erhebungsinstrumente sind validiert bzw. lizenziert.',
    quelle: 'BfArM-Frage 16; Lizenzlage FES-I, BSFC-s, SUS',
    anforderungstextGeprueft: false, stand: 'offen',
    nachweis: 'Produkteigenes 7-Item-Kurzinstrument, im Produkt und im FHIR-Export ausdrücklich als nicht validiert gekennzeichnet; lizenzpflichtige Instrumente übertragen nur Summenwerte',
    nachweisDateien: ['lib/coach/belastung.ts', 'lib/coach/fhir.ts'],
    gapId: null, verantwortlich: 'extern',
  },
  {
    id: 'AK-QI-03', kategorie: 'qualitaet_inhalte', klasse: 'A',
    formulierung: 'Pflegeprobleme und -ziele sind fachlich hergeleitet.',
    quelle: 'audit/dipa/pflegeprobleme_pflegeziele.md',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'audit/dipa/pflegeprobleme_pflegeziele.md — mit AK-QI-01 gegenzuprüfen',
    nachweisDateien: ['audit/dipa/pflegeprobleme_pflegeziele.md'],
    gapId: null, verantwortlich: 'fachlich',
  },

  // ── Nutzennachweis ─────────────────────────────────────────────────
  {
    id: 'AK-NN-01', kategorie: 'nutzennachweis', klasse: 'D',
    formulierung: 'Ein wissenschaftliches Evaluationskonzept liegt einreichungsreif vor.',
    quelle: 'audit/dipa/evaluationskonzept.md; Methodik offen (ORF-10)',
    anforderungstextGeprueft: false, stand: 'in_arbeit',
    nachweis: 'audit/dipa/evaluationskonzept.md — kein Studienpartner, kein Ethikvotum',
    nachweisDateien: ['audit/dipa/evaluationskonzept.md'],
    gapId: 'GAP-EVAL', verantwortlich: 'extern',
  },
  {
    id: 'AK-NN-02', kategorie: 'nutzennachweis', klasse: 'A',
    formulierung: 'Nutzungsdaten werden pseudonymisiert und auswertbar erhoben.',
    quelle: 'coach_nutzungsereignisse, lib/coach/nachweise.ts',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'HMAC-Pseudonym aus unlesbarem Schlüsselbestand, ohne Zeitstempel und Inhalte; Tests P9.1/P9.2 belegen die Nicht-Berechenbarkeit fremder Pseudonyme',
    nachweisDateien: ['lib/coach/nachweise.ts', 'lib/coach/nachweise.test.ts', 'app/api/coach/nutzung/route.ts'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-NN-03', kategorie: 'nutzennachweis', klasse: 'A',
    formulierung: 'Ein Pilotdesign liegt vor.',
    quelle: 'audit/dipa/pilotdesign.md',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'audit/dipa/pilotdesign.md — Start hängt an AK-NN-01 und AK-QI-01',
    nachweisDateien: ['audit/dipa/pilotdesign.md'],
    gapId: null, verantwortlich: 'fachlich',
  },

  // ── Verbraucherschutz ──────────────────────────────────────────────
  {
    id: 'AK-VS-01', kategorie: 'verbraucherschutz', klasse: 'A',
    formulierung: 'Die Kernfunktion ist werbefrei; es findet kein Cross-Selling mit den Daten statt.',
    quelle: 'Offene regulatorische Frage ORF-5; Umsetzung: keine Tracker unter /pflegecoach',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'Tracker technisch abgeschaltet; E2E-Test prüft die tatsächlich geladenen Fremdhosts',
    nachweisDateien: ['components/ClientSideProviders.tsx', 'e2e/pflegecoach.spec.ts', 'audit/dipa/eul_konzept.md'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-VS-02', kategorie: 'verbraucherschutz', klasse: 'A',
    formulierung: 'Ein erreichbarer Herstellersupport ist ausgewiesen.',
    quelle: 'lib/coach/version.ts (COACH_SUPPORT_EMAIL)',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'Supportadresse in Fußzeile, Produktseite, Einstellungen und Kontoseite; /pflegecoach/anfrage. Offen: Reaktionszeit-Zusage',
    nachweisDateien: ['lib/coach/version.ts', 'app/pflegecoach/anfrage/page.tsx'],
    gapId: null, verantwortlich: 'geschaeftsfuehrung',
  },
  {
    id: 'AK-VS-03', kategorie: 'verbraucherschutz', klasse: 'A',
    formulierung: 'Die Nutzung ist jederzeit und ohne Hürde beendbar.',
    quelle: 'audit/dipa/loeschkonzept.md',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: '/pflegecoach/einstellungen/konto — Widerruf, Export, Löschung, Kontolöschung; keine Frist, keine Mindestlaufzeit',
    nachweisDateien: ['app/pflegecoach/einstellungen/konto/page.tsx'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-VS-04', kategorie: 'verbraucherschutz', klasse: 'D',
    formulierung: 'Für den Selbstzahler-Weg liegen verständliche Nutzungsbedingungen vor.',
    quelle: 'Betrifft Produkt A, nicht die DiPA-Aufnahme',
    anforderungstextGeprueft: false, stand: 'in_arbeit',
    nachweis: 'audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md — Entwurf mit 13 Paragrafen und Prüfliste; NICHT wirksam, juristische Prüfung offen. Bestellweg technisch gesperrt',
    nachweisDateien: ['audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md', 'lib/coach/pricing.ts', 'lib/coach/bestellung.ts'],
    gapId: null, verantwortlich: 'extern',
  },

  // ── QMS, Risikomanagement, Betrieb ─────────────────────────────────
  {
    id: 'AK-QMS-01', kategorie: 'qms_risikomanagement', klasse: 'C',
    formulierung: 'Ein dokumentiertes Qualitäts- und Risikomanagementsystem liegt vor.',
    quelle: 'audit/dipa/dipav_gap_liste.md (GAP-QMS)',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'QM-Handbuch (Verantwortung, Dokumentenlenkung, Änderungsverfahren, Qualitätstore, Fehlerbehandlung, Fail-Closed-Schalter), Risikoakte mit Bewertung, Lebenszyklus-Dokument. Nicht extern auditiert — die Lücken sind in §9 des Handbuchs benannt',
    nachweisDateien: ['audit/dipa/qms_handbuch_pflegecoach.md', 'audit/dipa/risikoakte_pflegecoach.md', 'audit/dipa/software_lebenszyklus_pflegecoach.md'],
    gapId: null, verantwortlich: 'geschaeftsfuehrung',
  },
  {
    id: 'AK-QMS-02', kategorie: 'qms_risikomanagement', klasse: 'A',
    formulierung: 'Eine Risikoanalyse liegt vor.',
    quelle: 'audit/dipa/risikoanalyse_pflegecoach.md',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'Analyse (Identifikation) plus Risikoakte (Bewertung, Restrisiko, Wiedervorlage): 0 kritische, 3 hohe Restrisiken',
    nachweisDateien: ['audit/dipa/risikoanalyse_pflegecoach.md', 'audit/dipa/risikoakte_pflegecoach.md'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-QMS-03', kategorie: 'qms_risikomanagement', klasse: 'A',
    formulierung: 'Eine technische Dokumentation liegt vor.',
    quelle: 'audit/dipa/technische_dokumentation_pflegecoach.md',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'Technische Dokumentation, Sicherheitsarchitektur, Lebenszyklus',
    nachweisDateien: ['audit/dipa/technische_dokumentation_pflegecoach.md', 'audit/dipa/sicherheitsarchitektur_pflegecoach.md', 'audit/dipa/software_lebenszyklus_pflegecoach.md'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-QS-04', kategorie: 'qms_risikomanagement', klasse: 'B',
    formulierung: 'Automatisierte Tests decken Produktlogik und Zugriffsregeln ab.',
    quelle: 'lib/coach/*.test.ts, supabase/shadow/50_pflegecoach_tests.sql',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: '68/68 Zugriffstests bestanden (14.08.2026), erweitert um P9 für die acht Tabellen aus 20260826010000: Pseudonym-Isolation, kein Selbst-Freischalten, Betriebstabellen unsichtbar. P8 misst jetzt „keine Tabelle ohne RLS" statt einer festen Tabellenzahl',
    nachweisDateien: ['supabase/shadow/50_pflegecoach_tests.sql', 'lib/coach/produktgrenze.test.ts'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-QS-05', kategorie: 'qms_risikomanagement', klasse: 'B',
    formulierung: 'Ein Browser-E2E-Test des Produktbereichs liegt vor.',
    quelle: 'e2e/pflegecoach.spec.ts',
    anforderungstextGeprueft: false, stand: 'in_arbeit',
    nachweis: 'Suite geschrieben: Erreichbarkeit, Zugangsschutz (9 Seiten), 401 auf allen Produkt-APIs, 404 der DiPA-Seiten ohne Schalter, Werbefreiheit, A11y-Struktur. Ausführung in dieser Umgebung nicht erfolgt (keine Playwright-Browser installiert)',
    nachweisDateien: ['e2e/pflegecoach.spec.ts', 'playwright.config.ts'],
    gapId: null, verantwortlich: 'technik',
  },
  {
    id: 'AK-BETR-01', kategorie: 'qms_risikomanagement', klasse: 'A',
    formulierung: 'Der Datenbankstand des Produkts ist auf Produktion angewendet.',
    quelle: 'Migrationen 20260819010000, 20260826010000',
    anforderungstextGeprueft: false, stand: 'erfuellt',
    nachweis: 'Beide Migrationen live (Tabellencheck 12.08.2026). Die Live-Apply-Bestätigung ist als verpflichtender Schritt im Änderungsverfahren festgeschrieben',
    nachweisDateien: ['audit/dipa/qms_handbuch_pflegecoach.md'],
    gapId: null, verantwortlich: 'technik',
  },

  // ── Verfahren und offene regulatorische Fragen ─────────────────────
  {
    id: 'AK-REG-01', kategorie: 'verfahren_regulatorik', klasse: 'E',
    formulierung: 'Die Anforderungstexte sind gegen die Originaldokumente geprüft.',
    quelle: 'DiPAV, BfArM-Leitfaden, BSI TR-03161 in gültiger Fassung',
    anforderungstextGeprueft: false, stand: 'offen',
    nachweis: 'Werkzeug vorhanden: npm run dipa:katalog listet ungeprüfte Einträge und prüft alle Nachweispfade. Die Prüfung selbst setzt die Originaldokumente voraus und wird nicht geraten',
    nachweisDateien: ['scripts/dipa-katalog-check.ts'],
    gapId: null, verantwortlich: 'geschaeftsfuehrung',
  },
  {
    id: 'AK-REG-02', kategorie: 'verfahren_regulatorik', klasse: 'E',
    formulierung: 'Ist ein Freischaltcode-Verfahren verbindlich, und wer gibt die Codes aus?',
    quelle: 'BfArM-Beratung; audit/dipa/nutzerflow_dipa.md',
    anforderungstextGeprueft: false, stand: 'offen',
    nachweis: 'Mechanismus vollständig gebaut und getestet, über COACH_FREISCHALTUNG_PFLICHT deaktiviert',
    nachweisDateien: ['lib/coach/freischaltung.ts', 'lib/coach/freischaltung.test.ts'],
    gapId: null, verantwortlich: 'geschaeftsfuehrung',
  },
  {
    id: 'AK-REG-03', kategorie: 'verfahren_regulatorik', klasse: 'E',
    formulierung: 'Welche Qualifikationsanforderungen gelten für Erbringer ergänzender Unterstützungsleistungen?',
    quelle: 'ORF-1; audit/dipa/eul_qualitaetsanforderungen.md',
    anforderungstextGeprueft: false, stand: 'offen',
    nachweis: 'Kriterien SELBST gesetzt, nicht regulatorisch abgeleitet — ausdrücklich als solche gekennzeichnet',
    nachweisDateien: ['audit/dipa/eul_qualitaetsanforderungen.md'],
    gapId: null, verantwortlich: 'geschaeftsfuehrung',
  },
  {
    id: 'AK-REG-04', kategorie: 'verfahren_regulatorik', klasse: 'E',
    formulierung: 'Wie werden Vergütung und Abrechnungsweg geregelt?',
    quelle: 'Erst nach Aufnahme verhandelbar',
    anforderungstextGeprueft: false, stand: 'offen',
    nachweis: 'coach_abrechnungswege + lib/coach/abrechnung.ts — fail-closed über verguetung_geklaert, keine Beträge im Code',
    nachweisDateien: ['lib/coach/abrechnung.ts', 'lib/coach/abrechnung.test.ts'],
    gapId: null, verantwortlich: 'geschaeftsfuehrung',
  },
  {
    id: 'AK-REG-05', kategorie: 'verfahren_regulatorik', klasse: 'E',
    formulierung: 'Ein formaler BfArM-Beratungstermin hat stattgefunden.',
    quelle: 'audit/dipa/bfarm_fragenkatalog.md',
    anforderungstextGeprueft: false, stand: 'offen',
    nachweis: 'Fragen 1–20 vorbereitet. Günstigster nächster Schritt insgesamt: klärt AK-REG-02 bis AK-REG-04, AK-SEC-01, AK-INT-02 und AK-QI-02 in einem Zug',
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
