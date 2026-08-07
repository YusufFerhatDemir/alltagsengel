// ═══════════════════════════════════════════════════════════════
// Schlüsselverzeichnisse für die Abrechnung nach § 105 Abs. 2 SGB XI
// Quelle: Technische Anlage 3 (Schlüsselverzeichnisse), Version 6.5.0,
// gkv-datenaustausch.de — sowie Informationsbroschüre TP6 (Stand 07/2026)
// für die Datenannahmestellen.
// ═══════════════════════════════════════════════════════════════

// ── TA3 2.1 — Rechnungsart ──────────────────────────────────────
export const RECHNUNGSART = {
  '1': 'Abrechnung vom Leistungserbringer, Zahlung an IK Leistungserbringer',
  '2': 'Abrechnung über Abrechnungsstelle (ohne Inkasso), Zahlung an IK LE',
  '3': 'Abrechnung über Abrechnungsstelle mit Inkassovollmacht',
} as const

// ── TA3 2.2.1 — Abrechnungscode (Auszug ambulant) ───────────────
export const ABRECHNUNGSCODE = {
  '35': 'frei gemeinnütziger Anbieter (Sozialstation)',
  '36': 'privat gewerblicher Anbieter',
  '37': 'öffentlicher Anbieter',
  '39': 'sonstiger Pflegedienst',
} as const

/** Alltagsengel UG = privat gewerblicher ambulanter Anbieter. */
export const ABRECHNUNGSCODE_ALLTAGSENGEL = '36'

// ── TA3 2.2.2 — Tarifkennzeichen (Stelle 1-2 Tarifbereich) ──────
export const TARIFBEREICH: Record<string, string> = {
  '00': 'Bundeseinheitlicher Tarif',
  '01': 'Baden-Württemberg',
  '02': 'Bayern',
  '04': 'Bremen',
  '05': 'Hamburg',
  '06': 'Hessen',
  '07': 'Niedersachsen',
  '08': 'NRW',
  '09': 'Rheinland-Pfalz',
  '10': 'Saarland',
  '11': 'Schleswig-Holstein',
  '12': 'Brandenburg',
  '13': 'Sachsen',
  '14': 'Sachsen-Anhalt',
  '15': 'Mecklenburg-Vorpommern',
  '16': 'Thüringen',
  '23': 'Berlin (gesamt)',
}

/**
 * Hessen ("06") + Sondertarif "000" (ohne Besonderheiten).
 *
 * @deprecated Nicht mehr als Default verwenden — seit der Deutschland-Architektur
 * ist der Tarifbereich bundeslandabhängig. `tarifkennzeichenFuerBundesland()` nutzen.
 */
export const TARIFKENNZEICHEN_HESSEN = '06000'

/**
 * Tarifbereichs-Schlüssel (TA3 2.2.2, Stelle 1-2) je Bundesland-Katalogcode.
 * Werte stammen aus TARIFBEREICH oben — hier nur nach Katalogcode indiziert,
 * damit die Abrechnung ohne Namensvergleich arbeiten kann.
 */
export const TARIFBEREICH_JE_BUNDESLAND: Record<string, string> = {
  baden_wuerttemberg:     '01',
  bayern:                 '02',
  bremen:                 '04',
  hamburg:                '05',
  hessen:                 '06',
  niedersachsen:          '07',
  nordrhein_westfalen:    '08',
  rheinland_pfalz:        '09',
  saarland:               '10',
  schleswig_holstein:     '11',
  brandenburg:            '12',
  sachsen:                '13',
  sachsen_anhalt:         '14',
  mecklenburg_vorpommern: '15',
  thueringen:             '16',
  berlin:                 '23',
}

/**
 * Baut das fünfstellige Tarifkennzeichen aus Bundesland und Sondertarif.
 * Wirft bei unbekanntem Bundesland — lieber ein Abbruch als eine Abrechnung
 * mit dem Tarifbereich eines fremden Landes.
 */
export function tarifkennzeichenFuerBundesland(
  bundesland: string,
  sondertarif: string = '000'
): string {
  const bereich = TARIFBEREICH_JE_BUNDESLAND[bundesland]
  if (!bereich) {
    throw new Error(
      `Kein Tarifbereich für Bundesland "${bundesland}" hinterlegt. `
      + `Erlaubt: ${Object.keys(TARIFBEREICH_JE_BUNDESLAND).join(', ')}.`
    )
  }
  if (!/^\d{3}$/.test(sondertarif)) {
    throw new Error(`Sondertarif muss dreistellig numerisch sein, erhalten: "${sondertarif}".`)
  }
  return `${bereich}${sondertarif}`
}

// ── TA3 2.3 — Verarbeitungskennzeichen ──────────────────────────
export const VERARBEITUNGSKENNZEICHEN = {
  '01': 'Abrechnung ohne Besonderheiten',
} as const

// ── TA3 2.4 — Art der abgegebenen Leistung ──────────────────────
export const ART_DER_LEISTUNG: Record<string, string> = {
  '01': 'ambulante Pflege (einschl. pflegerische Betreuungsmaßnahmen)',
  '02': 'Tagespflege',
  '03': 'Nachtpflege',
  '04': 'Kurzzeitpflege',
  '05': 'vollstationäre Pflege',
  '06': 'Pflegehilfsmittel',
  '07': 'Verhinderungspflege',
  '08': 'Zuschuss nach § 43 Abs. 3 SGB XI',
  '09': 'Beratungsbesuch nach § 37 Abs. 3 SGB XI',
  '10': 'Entlastungsleistungen nach § 45b SGB XI',
  '11': 'Beratungsgutschein nach § 7b SGB XI',
  '12': 'Wohngruppenzuschlag nach § 38a SGB XI',
  '13': 'Pflegekurse nach § 45 SGB XI',
  '14': 'Leistungen nach § 43b SGB XI',
  '15': 'Ergänzende Unterstützungsleistung für DiPA',
}

// ── TA3 2.5 — Vergütungsart ─────────────────────────────────────
export const VERGUETUNGSART: Record<string, string> = {
  '01': 'Leistungskomplexvergütung',
  '02': 'Zeitvergütung',
  '03': 'teilstationär',
  '04': 'vollstationär / Kurzzeitpflege',
  '05': 'Pflegehilfsmittel',
  '06': 'Wegegebühren',
  '07': 'Entlastungsleistung',
  '08': 'Pauschale (Beratungsbesuch)',
  '99': 'keine Vertragspreisregelung',
}

// ── TA3 2.6 — Qualifikationsabhängige Vergütung ─────────────────
export const QUALIFIKATION: Record<string, string> = {
  '0': 'datentechnisch nicht relevant',
  '1': 'Pflegefachkraft',
  '2': 'hauswirtschaftliche Fachkraft',
  '3': 'ergänzende Hilfen',
  '4': 'BuFDi / Praktikum / FSJ / ISB',
  '8': 'Fachkraft für Betreuung',
}

// ── TA3 2.7.2 — Zeitvergütung: Zeiteinheit (1. Stelle) + Zeitart (2. Stelle)
export const ZEITEINHEIT: Record<string, string> = {
  '1': 'Minute',
  '2': '5 Minuten',
  '3': '15 Minuten',
  '4': 'Stunde',
  '5': 'Tag',
  '6': '10 Minuten',
}

export const ZEITART: Record<string, string> = {
  '1': 'Begleitung zum Arztbesuch',
  '2': 'Begleitung zum Behördenbesuch',
  '3': 'Körperbezogene Pflegemaßnahmen (Grundpflege)',
  '4': 'Hilfen zur Haushaltsführung (hauswirtschaftliche Versorgung)',
  '5': 'Pflegerische Betreuungsmaßnahmen (häusliche Betreuung)',
  '6': 'Hilfe bei selbstverantworteter Haushaltsführung',
  '7': 'Erstbesuch',
  '8': 'Folgebesuch',
  '9': 'Kombination unterschiedlicher Leistungsinhalte',
  'A': 'Beratungsbesuch vor Ort',
  'B': 'Beratungsbesuch Videokonferenz',
  'C': 'Hauswirtschaftliche Versorgung als Poolleistung',
  'D': 'Pflegerische Betreuungsmaßnahmen als Poolleistung',
}

// ── TA3 2.7.6 — Art der Entlastungsleistung (bei Vergütungsart 07)
export const ENTLASTUNGSLEISTUNG: Record<string, string> = {
  '10': 'Leistungen der Tages- oder Nachtpflege',
  '20': 'Leistungen der Kurzzeitpflege',
  '30': 'Leistungen amb. Pflegedienste ohne Leistungsbereich Selbstversorgung',
  '31': 'Leistungen amb. Pflegedienste Leistungsbereich Selbstversorgung',
  '40': 'Nach Landesrecht anerkannte Angebote nach § 45a SGB XI',
}

// ── TA3 2.17 — Ersatz-Beschäftigtennummer (§ 293 Abs. 8 SGB V) ──
// Seit PLAA Version 6 (01.09.2024) ist die Beschäftigtennummer der
// leistungserbringenden Person bei ambulanten Diensten PFLICHT im ELS.
export const ERSATZ_BESCHAEFTIGTENNUMMER = {
  NEU_OHNE_NUMMER: '999999998', // neue(r) Beschäftigte(r) ohne Beschäftigtennummer
  FEHLT_SONSTIGER_GRUND: '999999997', // Nummer fehlt aus sonstigem Grund
  AZUBI: '999999996', // Auszubildende(r) ohne Beschäftigtennummer
} as const

// ── TA3 2.15 — Pflegegrad: 1–5 (numerisch, 1 Stelle) ────────────

// ═══════════════════════════════════════════════════════════════
// Mapping: interne Leistungsarten (lib/admin/ops.ts) → EDIFACT-Schlüssel
// Leistungsziffer = Art der Leistung (2.4) : Vergütungsart (2.5) :
//                   Qualifikation (2.6) : Leistung (2.7.n)
//
// Alltagsengel = Betreuungsdienst / Alltagsbegleitung (KEINE Behandlungs-
// pflege nach SGB V!). Kernleistungen: Entlastungsbetrag § 45b
// (131 €/Monat seit Pflegereform 2025), Verhinderungspflege § 39,
// pflegerische Betreuung + Hauswirtschaft als Sachleistung § 36.
// ═══════════════════════════════════════════════════════════════

export interface EdifactLeistungsSchluessel {
  /** Art der abgegebenen Leistung (TA3 2.4) */
  art: string
  /** Vergütungsart (TA3 2.5) */
  verguetungsart: string
  /** Qualifikationsabhängige Vergütung (TA3 2.6) */
  qualifikation: string
  /** Leistung (TA3 2.7.n) — bei Zeitvergütung: Zeiteinheit+Zeitart */
  leistung: string
  /** true = Zusatzinfo im ELS ist die Dauer in Minuten (Vergütungsart 02) */
  zeitbasiert: boolean
  label: string
}

export const LEISTUNGSART_SCHLUESSEL: Record<string, EdifactLeistungsSchluessel> = {
  // § 45b Entlastungsleistungen (131 €/Monat) über ambulanten Dienst —
  // ohne Selbstversorgung (Betreuung/Hauswirtschaft) = Schlüssel 30
  entlastung_45b: {
    art: '10', verguetungsart: '07', qualifikation: '3', leistung: '30',
    zeitbasiert: false, label: 'Entlastungsleistung § 45b (ohne Selbstversorgung)',
  },
  // Nach Landesrecht anerkanntes Angebot § 45a (Alltagsbegleitung)
  alltagsbegleitung_45a: {
    art: '10', verguetungsart: '07', qualifikation: '3', leistung: '40',
    zeitbasiert: false, label: 'Anerkanntes Angebot § 45a (über § 45b abgerechnet)',
  },
  // § 39 Verhinderungspflege — keine Vertragspreisregelung → 99/99
  verhinderungspflege_39: {
    art: '07', verguetungsart: '99', qualifikation: '0', leistung: '99',
    zeitbasiert: false, label: 'Verhinderungspflege § 39',
  },
  // § 36 Sachleistung, Zeitvergütung je Stunde:
  // Zeiteinheit 4 (Stunde) + Zeitart 4 (Hauswirtschaft) = "44"
  hauswirtschaft: {
    art: '01', verguetungsart: '02', qualifikation: '2', leistung: '44',
    zeitbasiert: true, label: 'Hauswirtschaftliche Versorgung (Zeitvergütung/Std.)',
  },
  // Zeiteinheit 4 (Stunde) + Zeitart 5 (pflegerische Betreuung) = "45"
  betreuung: {
    art: '01', verguetungsart: '02', qualifikation: '8', leistung: '45',
    zeitbasiert: true, label: 'Pflegerische Betreuungsmaßnahmen (Zeitvergütung/Std.)',
  },
  // Zeiteinheit 4 (Stunde) + Zeitart 3 (körperbezogene Pflege) = "43"
  grosse_koerperpflege: {
    art: '01', verguetungsart: '02', qualifikation: '1', leistung: '43',
    zeitbasiert: true, label: 'Körperbezogene Pflegemaßnahmen (Zeitvergütung/Std.)',
  },
  kleine_koerperpflege: {
    art: '01', verguetungsart: '02', qualifikation: '1', leistung: '43',
    zeitbasiert: true, label: 'Körperbezogene Pflegemaßnahmen (Zeitvergütung/Std.)',
  },
  // Begleitung zum Arztbesuch (Zeitart 1)
  fahrdienst_begleitung: {
    art: '01', verguetungsart: '02', qualifikation: '3', leistung: '41',
    zeitbasiert: true, label: 'Begleitung zum Arztbesuch (Zeitvergütung/Std.)',
  },
  // Kombinationsleistung § 38 wird als Sachleistungsanteil (§ 36) abgerechnet
  kombinationsleistung: {
    art: '01', verguetungsart: '02', qualifikation: '8', leistung: '45',
    zeitbasiert: true, label: 'Kombinationsleistung § 38 (Sachleistungsanteil)',
  },
  sonstige: {
    art: '01', verguetungsart: '99', qualifikation: '0', leistung: '99',
    zeitbasiert: false, label: 'Sonstige Leistung ohne Vertragspreis',
  },
}

// ═══════════════════════════════════════════════════════════════
// Datenannahmestellen je Kassenart (Kostenträgerdatei / Broschüre TP6)
//
// Je Datenannahmestelle mit Entschlüsselungsbefugnis ist je Kassenart
// EINE Nutzdatendatei (UNB..UNZ) zu erstellen. Die IK der Annahmestelle
// gehört in UNB.Empfänger sowie in der Auftragsdatei in EMPFÄNGER_NUTZER
// und EMPFÄNGER_PHYSIKALISCH.
//
// MASSGEBLICH ist immer die aktuelle Kostenträgerdatei der Kassenart
// (gkv-datenaustausch.de) — diese Tabelle ist der Stand der
// Informationsbroschüre TP6 vom 15.07.2026.
// ═══════════════════════════════════════════════════════════════

export type Kassenart = 'AO' | 'BK' | 'BN' | 'EK' | 'IK' | 'LK' | 'SE'

export const KASSENART_LABEL: Record<Kassenart, string> = {
  AO: 'AOK',
  BK: 'Betriebskrankenkassen',
  BN: 'Knappschaft',
  EK: 'Ersatzkassen',
  IK: 'Innungskrankenkassen',
  LK: 'Landwirtschaftliche Krankenkasse (SVLFG)',
  SE: 'Seekasse',
}

export interface Datenannahmestelle {
  ik: string
  name: string
  kassenart: Kassenart
  email?: string
  hinweis?: string
}

export const DATENANNAHMESTELLEN: Record<string, Datenannahmestelle> = {
  // AOK Hessen → DAV der ITSCare, Schwalmstadt (IK 105810615;
  // Kostenträger-IK der AOK-Hessen-Pflegekasse: 185313145)
  aok_hessen: {
    ik: '105810615',
    name: 'DAV der ITSCare (AOK Hessen), Schwalmstadt',
    kassenart: 'AO',
    email: 'dav-team-leistungserbringer@itscare.de',
    hinweis: 'Kostenträger-IK AOK Hessen Pflegekasse: 185313145 — vor Erstlieferung gegen aktuelle AOK-Kostenträgerdatei prüfen',
  },
  // Betriebskrankenkassen → BITMARCK, Essen
  bkk: {
    ik: '104027544',
    name: 'BITMARCK GmbH (BKK), Essen',
    kassenart: 'BK',
    email: 'le@bitmarck-daten.de',
    hinweis: 'Betreff der Liefer-E-Mail: nur das Absender-IK',
  },
  // Innungskrankenkassen → BITMARCK, Essen
  ikk: {
    ik: '109900019',
    name: 'BITMARCK GmbH (IKK), Essen',
    kassenart: 'IK',
    email: 'le@bitmarck-daten.de',
  },
  // Knappschaft → BITMARCK Service für KBS
  knappschaft: {
    ik: '109905003',
    name: 'KNAPPSCHAFT (Annahme via BITMARCK), Essen',
    kassenart: 'BN',
    email: 'le@bitmarck-daten.de',
  },
  // Ersatzkassen — jede Kasse hat eine eigene Annahmestelle:
  tk: {
    ik: '109989162',
    name: 'T-Systems DTV (Techniker Krankenkasse), Stuttgart',
    kassenart: 'EK',
  },
  barmer: {
    ik: '660510336',
    name: 'DDG GmbH (BARMER), Essen',
    kassenart: 'EK',
  },
  dak: {
    ik: '661430035',
    name: 'Inter-Forum Data Services / DAVASO (DAK-Gesundheit), Leipzig',
    kassenart: 'EK',
  },
  hek: {
    ik: '661430035',
    name: 'DAVASO GmbH (HEK), Leipzig',
    kassenart: 'EK',
    email: 'edi302@davaso.de',
  },
  kkh: {
    ik: '104593971',
    name: 'BITMARCK (KKH), Essen',
    kassenart: 'EK',
    email: 'le-ek@bitmarck-daten.de',
    hinweis: 'Kostenträger-IK der KKH-Pflegekasse: 182171012',
  },
  hkk: {
    ik: '107436557',
    name: 'ARZ Emmendingen (hkk)',
    kassenart: 'EK',
    email: 'inbox@tp5.arz-emmendingen.de',
  },
}

/**
 * Ermittelt die zuständige Datenannahmestelle anhand des Kassennamens.
 *
 * Für die namentlich hinterlegten Ersatz-/Betriebskassen ist die Annahmestelle
 * bundesweit dieselbe. Nur die AOK ist landesspezifisch — hinterlegt ist bisher
 * ausschließlich die AOK Hessen (ITSCare Schwalmstadt).
 *
 * Deshalb: Greift keine Namensregel, gilt der AOK-Hessen-Fallback NUR, wenn
 * das Bundesland Hessen ist (oder gar nicht angegeben wurde — Bestandsverhalten).
 * Für jedes andere Bundesland wird `null` geliefert, statt eine Datei an die
 * falsche Annahmestelle zu adressieren.
 */
export function findeDatenannahmestelle(
  kassenName: string,
  bundesland?: string | null
): Datenannahmestelle | null {
  const n = (kassenName || '').toLowerCase()
  if (n.includes('techniker') || /\btk\b/.test(n)) return DATENANNAHMESTELLEN.tk
  if (n.includes('barmer')) return DATENANNAHMESTELLEN.barmer
  if (n.includes('dak')) return DATENANNAHMESTELLEN.dak
  if (n.includes('hek') || n.includes('hanseatische')) return DATENANNAHMESTELLEN.hek
  if (n.includes('kkh') || n.includes('kaufmännische')) return DATENANNAHMESTELLEN.kkh
  if (n.includes('hkk') || n.includes('handelskrankenkasse')) return DATENANNAHMESTELLEN.hkk
  if (n.includes('knappschaft')) return DATENANNAHMESTELLEN.knappschaft
  if (n.includes('ikk') || n.includes('innung')) return DATENANNAHMESTELLEN.ikk
  if (n.includes('bkk') || n.includes('betriebskrankenkasse')) return DATENANNAHMESTELLEN.bkk

  // Unbekannter Kassenname ⇒ AOK-Annahmestelle. Hinterlegt ist nur Hessen.
  if (!bundesland || bundesland === 'hessen') return DATENANNAHMESTELLEN.aok_hessen
  return null
}
