// ═══════════════════════════════════════════════════════════════
// PLZ → BUNDESLAND (deutschlandweit, offline, fail-safe)
// ═══════════════════════════════════════════════════════════════
// Ersetzt die reine Hessen-Prüfung aus lib/hessen-plz.ts durch eine
// bundesweite Zuordnung. Kein Netzwerkzugriff — PLZ-Gebiete ändern
// sich praktisch nie, und die Buchungsstrecke darf nicht von einem
// externen Dienst abhängen.
//
// ── WICHTIG: PLZ-Gebiete sind NICHT deckungsgleich mit Landesgrenzen ──
// Deshalb liefert jede Zuordnung zusätzlich ein `sicher`-Flag:
//
//   sicher = true   Das PLZ-Gebiet liegt (nach bestem Wissen, inkl. der
//                   gepflegten Ausnahmelisten) vollständig in diesem Land.
//   sicher = false  Die Leitregion überschreitet eine Landesgrenze und
//                   es liegt keine 5-stellige Ausnahme vor. Das Ergebnis
//                   ist die wahrscheinlichste, aber nicht garantierte
//                   Zuordnung.
//
// FAIL-SAFE-RICHTUNG (siehe kassenabrechnungMoeglich in state-settings.ts):
//   Für die KASSENABRECHNUNG zählt ausschließlich sicher = true.
//   Ein fälschlich angebotenes „privat" ist ärgerlich, ein fälschlich
//   angebotenes „Kasse" wäre ein Compliance-Verstoß.
//   Für Werbung, Registrierung, Warteliste und Privatleistungen genügt
//   die wahrscheinlichste Zuordnung.
//
// Auflösungsreihenfolge: 5-stellige Ausnahme → 3-stelliges Präfix →
// 2-stelliges Präfix → null (nicht zuordenbar).
// ═══════════════════════════════════════════════════════════════

import { BUNDESLAND_NAMEN, type BundeslandCode } from './types'

export interface BundeslandTreffer {
  /** Katalog-Code des Bundeslands, oder null wenn nicht zuordenbar. */
  code: BundeslandCode | null
  /** true, wenn das PLZ-Gebiet eindeutig in diesem Land liegt. */
  sicher: boolean
  /** Klartextname für die Anzeige, oder null. */
  name: string | null
  /** Woraus die Zuordnung stammt — nützlich für Support und Tests. */
  quelle: 'ausnahme' | 'praefix3' | 'praefix2' | 'unbekannt'
}

const NICHT_ZUORDENBAR: BundeslandTreffer = {
  code: null, sicher: false, name: null, quelle: 'unbekannt',
}

/** Extrahiert eine 5-stellige PLZ aus beliebigem Input ("65933 Frankfurt " → "65933"). */
export function normalizePlz(input: string | null | undefined): string | null {
  if (!input) return null
  const match = String(input).match(/\d{5}/)
  return match ? match[0] : null
}

/**
 * Ermittelt die maßgebliche PLZ aus Profil-Feldern:
 * postal_code hat Vorrang, sonst PLZ aus dem location-Freitext.
 */
export function resolvePlz(
  postalCode: string | null | undefined,
  location?: string | null
): string | null {
  return normalizePlz(postalCode) ?? normalizePlz(location)
}

// ────────────────────────────────────────────────────────────────
// 5-stellige Ausnahmen — Grenzfälle, die vom Präfix abweichen.
//
// Der Hessen-Block ist die kuratierte Liste aus lib/hessen-plz.ts und
// bleibt die maßgebliche Quelle für das einzige Bundesland, in dem
// die Kassenabrechnung überhaupt kurz vor der Freischaltung steht.
// ────────────────────────────────────────────────────────────────
const AUSNAHMEN_5: Record<string, BundeslandCode> = {
  // ── Hessen trotz fremdem Präfix ──
  '55246': 'hessen',            // Mainz-Kostheim (Stadtteil von Wiesbaden)
  '55252': 'hessen',            // Mainz-Kastel (Stadtteil von Wiesbaden)
  '68519': 'hessen',            // Viernheim (Kreis Bergstraße)
  '68623': 'hessen',            // Lampertheim (Hessisches Ried)
  '68642': 'hessen',            // Bürstadt
  '68647': 'hessen',            // Biblis
  '68649': 'hessen',            // Groß-Rohrheim
  '69434': 'hessen',            // Neckarsteinach (Kreis Bergstraße)
  '69483': 'hessen',            // Wald-Michelbach
  '69488': 'hessen',            // Birkenau
  '69509': 'hessen',            // Mörlenbach
  '69517': 'hessen',            // Gorxheimertal
  '69518': 'hessen',            // Abtsteinach

  // ── NICHT Hessen trotz hessischem Präfix ──
  '34346': 'niedersachsen',        // Hann. Münden
  '34355': 'niedersachsen',        // Staufenberg
  '34414': 'nordrhein_westfalen',  // Warburg
  '34431': 'nordrhein_westfalen',  // Marsberg
  '34434': 'nordrhein_westfalen',  // Borgentreich
  '34439': 'nordrhein_westfalen',  // Willebadessen
  '65558': 'rheinland_pfalz',      // Holzheim (Rhein-Lahn-Kreis)
  '65582': 'rheinland_pfalz',      // Diez
  '65623': 'rheinland_pfalz',      // Hahnstätten
  '65624': 'rheinland_pfalz',      // Altendiez
  '65626': 'rheinland_pfalz',      // Birlenbach
  '65629': 'rheinland_pfalz',      // Niederneisen
}

// ────────────────────────────────────────────────────────────────
// 3-stellige Präfixe — nur dort gepflegt, wo sie das 2-stellige
// Präfix korrigieren oder eine Leitregion eine Grenze überschreitet.
// ────────────────────────────────────────────────────────────────
type Regel = { bl: BundeslandCode; sicher: boolean }

const PRAEFIX_3: Record<string, Regel> = {
  // ── Sachsen / Thüringen / Brandenburg-Grenzen ──
  '046': { bl: 'thueringen',   sicher: false }, // Altenburg (TH) ↔ Geithain/Frohburg (SN)
  '048': { bl: 'sachsen',      sicher: false }, // Torgau (SN) ↔ Falkenberg (BB)
  '049': { bl: 'brandenburg',  sicher: false }, // Elsterwerda/Herzberg (BB) ↔ Oschatz-Rand
  '065': { bl: 'sachsen_anhalt', sicher: false }, // Sangerhausen (ST) ↔ Artern/Bad Frankenhausen (TH)

  // ── Berlin / Brandenburg (Leitregion 14) ──
  '140': { bl: 'berlin',       sicher: true },
  '141': { bl: 'berlin',       sicher: true },
  '144': { bl: 'brandenburg',  sicher: true },  // Potsdam
  '145': { bl: 'brandenburg',  sicher: true },
  '146': { bl: 'brandenburg',  sicher: true },
  '147': { bl: 'brandenburg',  sicher: true },
  '148': { bl: 'brandenburg',  sicher: true },
  '149': { bl: 'brandenburg',  sicher: true },

  // ── MV / Brandenburg ──
  '172': { bl: 'brandenburg',  sicher: false }, // Templin/Prenzlau (BB) im 17er-Gebiet
  '193': { bl: 'brandenburg',  sicher: false }, // Wittenberge/Perleberg (BB) ↔ Grabow (MV)

  // ── Hamburg / Niedersachsen / Schleswig-Holstein ──
  '210': { bl: 'hamburg',            sicher: false }, // Bergedorf (HH) ↔ Börnsen (SH)
  '211': { bl: 'hamburg',            sicher: true },
  '212': { bl: 'niedersachsen',      sicher: true },
  '213': { bl: 'niedersachsen',      sicher: true },
  '214': { bl: 'niedersachsen',      sicher: false }, // Winsen (NI) ↔ Reinbek/Lauenburg (SH)
  '215': { bl: 'schleswig_holstein', sicher: true },  // Geesthacht, Herzogtum Lauenburg
  '216': { bl: 'niedersachsen',      sicher: true },  // Buxtehude
  '217': { bl: 'niedersachsen',      sicher: true },  // Stade
  '228': { bl: 'schleswig_holstein', sicher: true },  // Norderstedt, Wedel
  '229': { bl: 'schleswig_holstein', sicher: true },  // Ahrensburg, Bargteheide
  '239': { bl: 'mecklenburg_vorpommern', sicher: false }, // Wismar (MV) ↔ Ratzeburg (SH)

  // ── Bremen / Niedersachsen ──
  '275': { bl: 'bremen',        sicher: true },  // Bremerhaven
  '288': { bl: 'niedersachsen', sicher: true },  // Achim, Weyhe, Syke, Ottersberg
  '294': { bl: 'niedersachsen', sicher: false }, // Lüchow (NI) ↔ Salzwedel/Kalbe (ST)

  // ── Hessen / Thüringen / Bayern / Niedersachsen ──
  '360': { bl: 'hessen',        sicher: true },  // Fulda
  '361': { bl: 'hessen',        sicher: true },  // Bad Hersfeld
  '362': { bl: 'hessen',        sicher: true },
  '363': { bl: 'hessen',        sicher: true },  // Schlüchtern
  '364': { bl: 'thueringen',    sicher: true },  // Bad Salzungen, Vacha
  '370': { bl: 'niedersachsen', sicher: true },  // Göttingen
  '371': { bl: 'niedersachsen', sicher: true },  // Northeim
  '372': { bl: 'hessen',        sicher: true },  // Witzenhausen, Eschwege
  '373': { bl: 'thueringen',    sicher: true },  // Heilbad Heiligenstadt, Leinefelde
  '384': { bl: 'niedersachsen', sicher: false }, // Wolfsburg-Umland (NI) ↔ Klötze (ST)
  '388': { bl: 'sachsen_anhalt', sicher: true }, // Halberstadt, Wernigerode
  '389': { bl: 'sachsen_anhalt', sicher: true },

  // ── NRW / Niedersachsen ──
  '484': { bl: 'nordrhein_westfalen', sicher: false }, // Rheine-Umland ↔ Bad Bentheim (NI)
  '495': { bl: 'nordrhein_westfalen', sicher: false }, // Tecklenburger Land ↔ Rieste (NI)

  // ── NRW / Rheinland-Pfalz ──
  '534': { bl: 'rheinland_pfalz',     sicher: true },  // Remagen, Bad Neuenahr-Ahrweiler
  '535': { bl: 'rheinland_pfalz',     sicher: true },  // Adenau, Linz, Unkel
  '536': { bl: 'nordrhein_westfalen', sicher: false }, // Bad Honnef (NW) ↔ Rheinbreitbach (RP)
  '575': { bl: 'rheinland_pfalz',     sicher: true },  // Betzdorf, Wissen
  '576': { bl: 'rheinland_pfalz',     sicher: true },  // Altenkirchen

  // ── Hessen / Bayern (Untermain) ──
  '630': { bl: 'hessen', sicher: true },  // Offenbach
  '631': { bl: 'hessen', sicher: true },
  '632': { bl: 'hessen', sicher: true },
  '633': { bl: 'hessen', sicher: true },
  '634': { bl: 'hessen', sicher: true },
  '635': { bl: 'hessen', sicher: true },  // Hanau
  '636': { bl: 'hessen', sicher: true },  // Main-Kinzig
  '637': { bl: 'bayern', sicher: true },  // Aschaffenburg
  '638': { bl: 'bayern', sicher: true },  // Alzenau
  '639': { bl: 'bayern', sicher: true },  // Miltenberg

  // ── Saarland / Rheinland-Pfalz ──
  '668': { bl: 'saarland',        sicher: false }, // Lebach/Schmelz (SL) ↔ Landstuhl (RP)
  '669': { bl: 'rheinland_pfalz', sicher: true },  // Kusel, Ramstein, Pirmasens

  // ── Baden-Württemberg / Rheinland-Pfalz (Südpfalz) ──
  '768': { bl: 'rheinland_pfalz', sicher: true },  // Landau, Kandel, Bad Bergzabern

  // ── Baden-Württemberg / Bayern (Bodensee, Ulm/Neu-Ulm) ──
  '880': { bl: 'baden_wuerttemberg', sicher: true },  // Tettnang, Friedrichshafen-Umland
  '881': { bl: 'bayern',             sicher: false }, // Lindau (BY) ↔ Achberg (BW)
  '890': { bl: 'baden_wuerttemberg', sicher: true },  // Ulm
  '891': { bl: 'baden_wuerttemberg', sicher: true },  // Langenau, Blaubeuren
  '892': { bl: 'bayern',             sicher: true },  // Neu-Ulm, Senden
  '893': { bl: 'bayern',             sicher: true },  // Burgau, Günzburg
  '894': { bl: 'bayern',             sicher: true },  // Dillingen
  '895': { bl: 'baden_wuerttemberg', sicher: true },  // Heidenheim
  '896': { bl: 'baden_wuerttemberg', sicher: true },  // Schelklingen, Blaubeuren

  // ── Bayern / Thüringen ──
  '965': { bl: 'thueringen', sicher: true },  // Sonneberg, Steinach, Schalkau

  // ── Bayern / Baden-Württemberg (Main-Tauber) ──
  '978': { bl: 'bayern',             sicher: false }, // Marktheidenfeld (BY) ↔ Wertheim (BW)
  '979': { bl: 'baden_wuerttemberg', sicher: false }, // Tauberbischofsheim (BW) ↔ Hasloch (BY)
}

// ────────────────────────────────────────────────────────────────
// 2-stellige Präfixe — Grundraster.
// Nicht vergebene Leitzonen (05, 11, 43, 62) fehlen bewusst.
// ────────────────────────────────────────────────────────────────
const PRAEFIX_2: Record<string, Regel> = {
  '01': { bl: 'sachsen',                sicher: true },  // Dresden
  '02': { bl: 'sachsen',                sicher: true },  // Oberlausitz
  '03': { bl: 'brandenburg',            sicher: true },  // Cottbus
  '04': { bl: 'sachsen',                sicher: true },  // Leipzig
  '06': { bl: 'sachsen_anhalt',         sicher: true },  // Halle, Dessau
  '07': { bl: 'thueringen',             sicher: true },  // Gera, Jena
  '08': { bl: 'sachsen',                sicher: true },  // Zwickau, Plauen
  '09': { bl: 'sachsen',                sicher: true },  // Chemnitz
  '10': { bl: 'berlin',                 sicher: true },
  '12': { bl: 'berlin',                 sicher: true },
  '13': { bl: 'berlin',                 sicher: true },
  '14': { bl: 'brandenburg',            sicher: false }, // durch PRAEFIX_3 aufgelöst
  '15': { bl: 'brandenburg',            sicher: true },
  '16': { bl: 'brandenburg',            sicher: true },
  '17': { bl: 'mecklenburg_vorpommern', sicher: true },
  '18': { bl: 'mecklenburg_vorpommern', sicher: true },  // Rostock
  '19': { bl: 'mecklenburg_vorpommern', sicher: true },  // Schwerin
  '20': { bl: 'hamburg',                sicher: true },
  '21': { bl: 'niedersachsen',          sicher: false }, // durch PRAEFIX_3 aufgelöst
  '22': { bl: 'hamburg',                sicher: true },
  '23': { bl: 'schleswig_holstein',     sicher: true },  // Lübeck
  '24': { bl: 'schleswig_holstein',     sicher: true },  // Kiel
  '25': { bl: 'schleswig_holstein',     sicher: true },
  '26': { bl: 'niedersachsen',          sicher: true },  // Oldenburg, Ostfriesland
  '27': { bl: 'niedersachsen',          sicher: true },
  '28': { bl: 'bremen',                 sicher: true },
  '29': { bl: 'niedersachsen',          sicher: true },  // Celle, Uelzen
  '30': { bl: 'niedersachsen',          sicher: true },  // Hannover
  '31': { bl: 'niedersachsen',          sicher: true },
  '32': { bl: 'nordrhein_westfalen',    sicher: true },  // Minden, Herford
  '33': { bl: 'nordrhein_westfalen',    sicher: true },  // Bielefeld, Paderborn
  '34': { bl: 'hessen',                 sicher: true },  // Nordhessen (Ausnahmen s. o.)
  '35': { bl: 'hessen',                 sicher: true },  // Mittelhessen
  '36': { bl: 'hessen',                 sicher: false }, // durch PRAEFIX_3 aufgelöst
  '37': { bl: 'niedersachsen',          sicher: false }, // durch PRAEFIX_3 aufgelöst
  '38': { bl: 'niedersachsen',          sicher: true },  // Braunschweig
  '39': { bl: 'sachsen_anhalt',         sicher: true },  // Magdeburg
  '40': { bl: 'nordrhein_westfalen',    sicher: true },  // Düsseldorf
  '41': { bl: 'nordrhein_westfalen',    sicher: true },
  '42': { bl: 'nordrhein_westfalen',    sicher: true },  // Wuppertal
  '44': { bl: 'nordrhein_westfalen',    sicher: true },  // Dortmund
  '45': { bl: 'nordrhein_westfalen',    sicher: true },  // Essen, Bochum
  '46': { bl: 'nordrhein_westfalen',    sicher: true },
  '47': { bl: 'nordrhein_westfalen',    sicher: true },  // Duisburg, Krefeld
  '48': { bl: 'nordrhein_westfalen',    sicher: true },  // Münster
  '49': { bl: 'niedersachsen',          sicher: true },  // Osnabrück, Emsland
  '50': { bl: 'nordrhein_westfalen',    sicher: true },  // Köln
  '51': { bl: 'nordrhein_westfalen',    sicher: true },
  '52': { bl: 'nordrhein_westfalen',    sicher: true },  // Aachen
  '53': { bl: 'nordrhein_westfalen',    sicher: false }, // durch PRAEFIX_3 aufgelöst
  '54': { bl: 'rheinland_pfalz',        sicher: true },  // Trier
  '55': { bl: 'rheinland_pfalz',        sicher: true },  // Mainz (Ausnahmen s. o.)
  '56': { bl: 'rheinland_pfalz',        sicher: true },  // Koblenz
  '57': { bl: 'nordrhein_westfalen',    sicher: false }, // durch PRAEFIX_3 aufgelöst
  '58': { bl: 'nordrhein_westfalen',    sicher: true },  // Hagen
  '59': { bl: 'nordrhein_westfalen',    sicher: true },  // Hamm, Soest
  '60': { bl: 'hessen',                 sicher: true },  // Frankfurt am Main
  '61': { bl: 'hessen',                 sicher: true },  // Hochtaunus, Wetterau
  '63': { bl: 'hessen',                 sicher: false }, // durch PRAEFIX_3 aufgelöst
  '64': { bl: 'hessen',                 sicher: true },  // Darmstadt, Odenwald
  '65': { bl: 'hessen',                 sicher: true },  // Wiesbaden (Ausnahmen s. o.)
  '66': { bl: 'saarland',               sicher: false }, // durch PRAEFIX_3 aufgelöst
  '67': { bl: 'rheinland_pfalz',        sicher: true },  // Ludwigshafen, Kaiserslautern
  '68': { bl: 'baden_wuerttemberg',     sicher: true },  // Mannheim (Ausnahmen s. o.)
  '69': { bl: 'baden_wuerttemberg',     sicher: true },  // Heidelberg (Ausnahmen s. o.)
  '70': { bl: 'baden_wuerttemberg',     sicher: true },  // Stuttgart
  '71': { bl: 'baden_wuerttemberg',     sicher: true },
  '72': { bl: 'baden_wuerttemberg',     sicher: true },  // Tübingen, Reutlingen
  '73': { bl: 'baden_wuerttemberg',     sicher: true },
  '74': { bl: 'baden_wuerttemberg',     sicher: true },  // Heilbronn
  '75': { bl: 'baden_wuerttemberg',     sicher: true },  // Pforzheim
  '76': { bl: 'baden_wuerttemberg',     sicher: true },  // Karlsruhe (768 = RP)
  '77': { bl: 'baden_wuerttemberg',     sicher: true },  // Offenburg
  '78': { bl: 'baden_wuerttemberg',     sicher: true },  // Villingen, Konstanz
  '79': { bl: 'baden_wuerttemberg',     sicher: true },  // Freiburg, Lörrach
  '80': { bl: 'bayern',                 sicher: true },  // München
  '81': { bl: 'bayern',                 sicher: true },
  '82': { bl: 'bayern',                 sicher: true },
  '83': { bl: 'bayern',                 sicher: true },  // Rosenheim
  '84': { bl: 'bayern',                 sicher: true },  // Landshut
  '85': { bl: 'bayern',                 sicher: true },  // Ingolstadt
  '86': { bl: 'bayern',                 sicher: true },  // Augsburg
  '87': { bl: 'bayern',                 sicher: true },  // Kempten
  '88': { bl: 'baden_wuerttemberg',     sicher: true },  // Ravensburg (881 = BY)
  '89': { bl: 'baden_wuerttemberg',     sicher: true },  // Ulm (892-894 = BY)
  '90': { bl: 'bayern',                 sicher: true },  // Nürnberg
  '91': { bl: 'bayern',                 sicher: true },  // Erlangen, Ansbach
  '92': { bl: 'bayern',                 sicher: true },  // Amberg, Weiden
  '93': { bl: 'bayern',                 sicher: true },  // Regensburg
  '94': { bl: 'bayern',                 sicher: true },  // Passau
  '95': { bl: 'bayern',                 sicher: true },  // Hof, Bayreuth
  '96': { bl: 'bayern',                 sicher: true },  // Bamberg, Coburg (965 = TH)
  '97': { bl: 'bayern',                 sicher: true },  // Würzburg (978/979 s. o.)
  '98': { bl: 'thueringen',             sicher: true },  // Suhl, Meiningen
  '99': { bl: 'thueringen',             sicher: true },  // Erfurt, Gotha
}

/**
 * Ordnet eine Postleitzahl einem Bundesland zu.
 * Unbekannte, fehlende oder nicht vergebene PLZ → { code: null, sicher: false }.
 */
export function bundeslandFuerPlz(input: string | null | undefined): BundeslandTreffer {
  const plz = normalizePlz(input)
  if (!plz) return NICHT_ZUORDENBAR

  const ausnahme = AUSNAHMEN_5[plz]
  if (ausnahme) {
    return { code: ausnahme, sicher: true, name: BUNDESLAND_NAMEN[ausnahme], quelle: 'ausnahme' }
  }

  const regel3 = PRAEFIX_3[plz.slice(0, 3)]
  if (regel3) {
    return { code: regel3.bl, sicher: regel3.sicher, name: BUNDESLAND_NAMEN[regel3.bl], quelle: 'praefix3' }
  }

  const regel2 = PRAEFIX_2[plz.slice(0, 2)]
  if (regel2) {
    return { code: regel2.bl, sicher: regel2.sicher, name: BUNDESLAND_NAMEN[regel2.bl], quelle: 'praefix2' }
  }

  return NICHT_ZUORDENBAR
}

/** Kurzform: nur der Code (oder null). */
export function bundeslandCodeFuerPlz(input: string | null | undefined): BundeslandCode | null {
  return bundeslandFuerPlz(input).code
}

/**
 * Nur für die Kassenabrechnung: verlangt eine EINDEUTIGE Zuordnung.
 * Grenzregionen ohne 5-stellige Ausnahme liefern bewusst null.
 */
export function eindeutigesBundeslandFuerPlz(
  input: string | null | undefined
): BundeslandCode | null {
  const treffer = bundeslandFuerPlz(input)
  return treffer.sicher ? treffer.code : null
}

/**
 * Normalisiert beliebige Bundesland-Schreibweisen auf den Katalog-Code.
 * Spiegelt public.normalize_bundesland() aus der Datenbank.
 * Nicht zuordenbar → null (fail-safe).
 */
export function normalizeBundesland(input: string | null | undefined): BundeslandCode | null {
  if (!input) return null
  const roh = String(input).trim()
  if (!roh) return null

  const norm = roh
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (norm in BUNDESLAND_NAMEN) return norm as BundeslandCode

  // ISO-Code (DE-HE) und Kurzform (HE)
  const kurz = roh.toUpperCase().replace(/^DE-/, '')
  for (const [code, iso] of Object.entries(ISO_KURZ)) {
    if (iso === kurz) return code as BundeslandCode
  }

  // Klartextname, ebenfalls normalisiert
  for (const [code, name] of Object.entries(BUNDESLAND_NAMEN)) {
    const nameNorm = name
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    if (nameNorm === norm) return code as BundeslandCode
  }

  return null
}

const ISO_KURZ: Record<string, string> = {
  baden_wuerttemberg: 'BW', bayern: 'BY', berlin: 'BE', brandenburg: 'BB',
  bremen: 'HB', hamburg: 'HH', hessen: 'HE', mecklenburg_vorpommern: 'MV',
  niedersachsen: 'NI', nordrhein_westfalen: 'NW', rheinland_pfalz: 'RP',
  saarland: 'SL', sachsen: 'SN', sachsen_anhalt: 'ST',
  schleswig_holstein: 'SH', thueringen: 'TH',
}

// ────────────────────────────────────────────────────────────────
// Abwärtskompatibilität zu lib/hessen-plz.ts
// ────────────────────────────────────────────────────────────────

/**
 * true, wenn die PLZ (nach bestem Wissen) in Hessen liegt.
 *
 * @deprecated Hessen-spezifische Prüfungen gehören nicht mehr in den Code.
 * Für Freischaltungsentscheidungen `bundeslandFuerPlz()` zusammen mit
 * `lib/expansion/state-settings.ts` verwenden.
 */
export function isHessenPlz(input: string | null | undefined): boolean {
  return bundeslandFuerPlz(input).code === 'hessen'
}
