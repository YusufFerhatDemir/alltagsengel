// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Anforderungskatalog (Block 15c)
//
// ZWECK: eine STRUKTUR, in der Zulassungsanforderungen nachgehalten
// werden — welche Anforderung, aus welcher Quelle, wie erfüllt, womit
// belegt, wer verantwortlich.
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
//
// Der Erfüllungsstand wird aus der bestehenden Gap-Liste gepflegt:
// audit/dipa/dipav_gap_liste.md ist die Wahrheit, dieser Katalog die
// maschinenlesbare Sicht darauf.
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

export type ErfuellungsStand = 'offen' | 'in_arbeit' | 'erfuellt' | 'nicht_anwendbar'

export interface KatalogEintrag {
  id: string
  kategorie: KatalogKategorie
  /** Arbeitsfassung — NICHT der verbindliche Anforderungstext. */
  formulierung: string
  /** Wo der verbindliche Text nachzulesen ist. */
  quelle: string
  anforderungstextGeprueft: boolean
  stand: ErfuellungsStand
  /** Womit die Erfüllung belegt wird (Datei, Zertifikat, Testprotokoll). */
  nachweis: string | null
  /** Verweis auf die Gap-Liste, falls offen. */
  gapId: string | null
  verantwortlich: 'technik' | 'fachlich' | 'extern' | 'geschaeftsfuehrung'
}

export const KATEGORIE_LABELS: Record<KatalogKategorie, string> = {
  produkt_zweckbestimmung: 'Produkt & Zweckbestimmung',
  datenschutz: 'Datenschutz',
  datensicherheit: 'Datensicherheit',
  interoperabilitaet: 'Interoperabilität',
  barrierefreiheit: 'Barrierefreiheit',
  qualitaet_inhalte: 'Qualität der Inhalte',
  nutzennachweis: 'Nutzennachweis / Evaluation',
  verbraucherschutz: 'Verbraucherschutz & Werbefreiheit',
  qms_risikomanagement: 'QMS & Risikomanagement',
}

export const STAND_LABELS: Record<ErfuellungsStand, string> = {
  offen: 'Offen',
  in_arbeit: 'In Arbeit',
  erfuellt: 'Erfüllt',
  nicht_anwendbar: 'Nicht anwendbar',
}

/**
 * Arbeitskatalog. Spiegelt den Stand aus audit/dipa/dipav_gap_liste.md.
 * Ergänzungen und Korrekturen gehören zuerst in die Gap-Liste, dann hier.
 */
export const ANFORDERUNGSKATALOG: KatalogEintrag[] = [
  {
    id: 'AK-PROD-01',
    kategorie: 'produkt_zweckbestimmung',
    formulierung: 'Zweckbestimmung ist eindeutig formuliert und in Produkt und Unterlagen konsistent verwendet.',
    quelle: 'audit/dipa/finale_zweckbestimmung.md; Originaltext: Verordnung/Leitfaden',
    anforderungstextGeprueft: false,
    stand: 'erfuellt',
    nachweis: 'audit/dipa/finale_zweckbestimmung.md',
    gapId: null,
    verantwortlich: 'fachlich',
  },
  {
    id: 'AK-PROD-02',
    kategorie: 'produkt_zweckbestimmung',
    formulierung: 'Begründung, warum kein Medizinprodukt vorliegt, liegt schriftlich vor.',
    quelle: 'audit/dipa/mdr_negativabgrenzung.md; Originaltext: Verordnung Anlage 1',
    anforderungstextGeprueft: false,
    stand: 'erfuellt',
    nachweis: 'audit/dipa/mdr_negativabgrenzung.md',
    gapId: null,
    verantwortlich: 'fachlich',
  },
  {
    id: 'AK-PROD-03',
    kategorie: 'produkt_zweckbestimmung',
    formulierung: 'Das Produkt ist eindeutig identifizierbar und versioniert; Änderungen sind dokumentiert.',
    quelle: 'lib/coach/version.ts, audit/dipa/CHANGELOG_pflegecoach.md',
    anforderungstextGeprueft: false,
    stand: 'erfuellt',
    nachweis: 'audit/dipa/CHANGELOG_pflegecoach.md',
    gapId: null,
    verantwortlich: 'technik',
  },
  {
    id: 'AK-DS-01',
    kategorie: 'datenschutz',
    formulierung: 'Ausdrückliche, versionierte Einwilligung für Gesundheitsdaten liegt technisch vor.',
    quelle: 'Art. 9 Abs. 2 lit. a DSGVO; Umsetzung: coach_consents',
    anforderungstextGeprueft: true,
    stand: 'erfuellt',
    nachweis: 'Migration 20260819010000, app/api/coach/consents',
    gapId: null,
    verantwortlich: 'technik',
  },
  {
    id: 'AK-DS-02',
    kategorie: 'datenschutz',
    formulierung: 'Datenschutz-Folgenabschätzung ist durchgeführt und dokumentiert.',
    quelle: 'Art. 35 DSGVO',
    anforderungstextGeprueft: true,
    stand: 'in_arbeit',
    nachweis: 'audit/dipa/dsfa_pflegecoach.md (Vorbereitung, juristische Prüfung offen)',
    gapId: 'GAP-DSFA',
    verantwortlich: 'extern',
  },
  {
    id: 'AK-DS-03',
    kategorie: 'datenschutz',
    formulierung: 'Löschkonzept mit Aufbewahrungsfristen, Löschanspruch und Datenportabilität liegt vor und ist umgesetzt.',
    quelle: 'Art. 17, Art. 20 DSGVO',
    anforderungstextGeprueft: true,
    stand: 'in_arbeit',
    nachweis: 'audit/dipa/loeschkonzept.md; app/api/coach/loeschung, app/api/coach/export',
    gapId: 'GAP-LOESCHUNG',
    verantwortlich: 'technik',
  },
  {
    id: 'AK-DS-04',
    kategorie: 'datenschutz',
    formulierung: 'Auftragsverarbeitungs-Kette ist produktbezogen dokumentiert.',
    quelle: 'Art. 28 DSGVO',
    anforderungstextGeprueft: true,
    stand: 'offen',
    nachweis: null,
    gapId: 'GAP-DSFA',
    verantwortlich: 'geschaeftsfuehrung',
  },
  {
    id: 'AK-SEC-01',
    kategorie: 'datensicherheit',
    formulierung: 'Zertifikat über die Erfüllung der einschlägigen technischen Sicherheitsrichtlinie liegt vor.',
    quelle: 'BSI TR-03161; Prüfung durch akkreditierte Prüfstelle',
    anforderungstextGeprueft: false,
    stand: 'offen',
    nachweis: 'audit/dipa/tr03161_checkliste.md (Selbsteinschätzung, kein Zertifikat)',
    gapId: 'GAP-TR03161',
    verantwortlich: 'extern',
  },
  {
    id: 'AK-SEC-02',
    kategorie: 'datensicherheit',
    formulierung: 'Verschlüsselung im Transport und im Ruhezustand ist beschrieben und umgesetzt.',
    quelle: 'audit/dipa/verschluesselungskonzept.md',
    anforderungstextGeprueft: false,
    stand: 'in_arbeit',
    nachweis: 'audit/dipa/verschluesselungskonzept.md',
    gapId: null,
    verantwortlich: 'technik',
  },
  {
    id: 'AK-SEC-03',
    kategorie: 'datensicherheit',
    formulierung: 'Zweiter Faktor bei der Anmeldung ist verfügbar.',
    quelle: 'audit/dipa/security_review_pflegecoach.md',
    anforderungstextGeprueft: false,
    stand: 'offen',
    nachweis: null,
    gapId: 'GAP-MFA',
    verantwortlich: 'technik',
  },
  {
    id: 'AK-SEC-04',
    kategorie: 'datensicherheit',
    formulierung: 'Externer Penetrationstest des Produkts liegt vor.',
    quelle: 'audit/dipa/dipav_gap_liste.md',
    anforderungstextGeprueft: false,
    stand: 'offen',
    nachweis: null,
    gapId: 'GAP-EXT-REVIEW',
    verantwortlich: 'extern',
  },
  {
    id: 'AK-INT-01',
    kategorie: 'interoperabilitaet',
    formulierung: 'Datenexport ist maschinenlesbar und dokumentiert.',
    quelle: 'lib/coach/export.schema.json',
    anforderungstextGeprueft: false,
    stand: 'erfuellt',
    nachweis: 'lib/coach/export.schema.json + Konformanz-Test',
    gapId: null,
    verantwortlich: 'technik',
  },
  {
    id: 'AK-INT-02',
    kategorie: 'interoperabilitaet',
    formulierung: 'Ein verbindliches Austauschformat (z. B. FHIR-Profile) wird unterstützt, sofern gefordert.',
    quelle: 'Offene regulatorische Frage ORF-9',
    anforderungstextGeprueft: false,
    stand: 'offen',
    nachweis: null,
    gapId: 'GAP-INTEROP',
    verantwortlich: 'technik',
  },
  {
    id: 'AK-BF-01',
    kategorie: 'barrierefreiheit',
    formulierung: 'Die Anwendung erfüllt den geltenden Barrierefreiheits-Standard.',
    quelle: 'EN 301 549 / WCAG 2.1 AA — Originaltext maßgeblich',
    anforderungstextGeprueft: false,
    stand: 'in_arbeit',
    nachweis: 'Grundausstattung umgesetzt; externer Test offen',
    gapId: 'GAP-A11Y-AUDIT',
    verantwortlich: 'extern',
  },
  {
    id: 'AK-BF-02',
    kategorie: 'barrierefreiheit',
    formulierung: 'Gebrauchstauglichkeit wurde mit der Zielgruppe geprüft und protokolliert.',
    quelle: 'audit/dipa/gebrauchstauglichkeit_testprotokoll.md',
    anforderungstextGeprueft: false,
    stand: 'in_arbeit',
    nachweis: 'audit/dipa/gebrauchstauglichkeit_testprotokoll.md (Vorlage, Durchführung offen)',
    gapId: null,
    verantwortlich: 'fachlich',
  },
  {
    id: 'AK-QS-01',
    kategorie: 'qualitaet_inhalte',
    formulierung: 'Alle Inhalte sind pflegefachlich geprüft und freigegeben.',
    quelle: 'lib/coach/inhalte.ts (pruefstatus)',
    anforderungstextGeprueft: false,
    stand: 'offen',
    nachweis: null,
    gapId: 'GAP-QS',
    verantwortlich: 'fachlich',
  },
  {
    id: 'AK-NN-01',
    kategorie: 'nutzennachweis',
    formulierung: 'Ein wissenschaftliches Evaluationskonzept liegt vor.',
    quelle: 'audit/dipa/evaluationskonzept.md',
    anforderungstextGeprueft: false,
    stand: 'in_arbeit',
    nachweis: 'audit/dipa/evaluationskonzept.md',
    gapId: 'GAP-EVAL',
    verantwortlich: 'extern',
  },
  {
    id: 'AK-NN-02',
    kategorie: 'nutzennachweis',
    formulierung: 'Nutzungsdaten werden pseudonymisiert und auswertbar erhoben.',
    quelle: 'coach_nutzungsereignisse, lib/coach/nachweise.ts',
    anforderungstextGeprueft: false,
    stand: 'erfuellt',
    nachweis: 'Migration 20260826010000, app/api/coach/nutzung',
    gapId: null,
    verantwortlich: 'technik',
  },
  {
    id: 'AK-VS-01',
    kategorie: 'verbraucherschutz',
    formulierung: 'Die Kernfunktion ist werbefrei; es findet kein Cross-Selling mit den Daten statt.',
    quelle: 'Offene regulatorische Frage ORF-5; Umsetzung: keine Tracker unter /pflegecoach',
    anforderungstextGeprueft: false,
    stand: 'erfuellt',
    nachweis: 'components/ClientSideProviders.tsx, audit/dipa/eul_konzept.md',
    gapId: null,
    verantwortlich: 'technik',
  },
  {
    id: 'AK-QMS-01',
    kategorie: 'qms_risikomanagement',
    formulierung: 'Ein dokumentiertes Qualitätsmanagement- und Risikomanagementsystem liegt vor.',
    quelle: 'audit/dipa/dipav_gap_liste.md (GAP-QMS)',
    anforderungstextGeprueft: false,
    stand: 'offen',
    nachweis: null,
    gapId: 'GAP-QMS',
    verantwortlich: 'geschaeftsfuehrung',
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
