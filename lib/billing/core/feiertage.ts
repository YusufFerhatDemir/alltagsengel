/**
 * Feiertage und Zuschlagsregeln
 *
 * TRENNUNG:
 * 1. Gesetzliche Feiertage → billing_feiertage Tabelle (Fakten)
 * 2. Tarifvertragliche Zuschlagsregeln → billing_tariffs Spalten (Prozentsaetze)
 *
 * Gesetzliche Feiertage sind Fakten und koennen gepflegt werden.
 * Zuschlagsregeln haengen vom jeweiligen Tarif/Vertrag ab und
 * werden NICHT erfunden — sie muessen aus den Verguetungsvereinbarungen
 * oder Tarifvertraegen uebernommen werden.
 *
 * DATENQUELLEN FUER ECHTE ZUSCHLAGSREGELN:
 * - Verguetungsvereinbarung mit der jeweiligen Pflegekasse
 * - Landesrahmenvertrag §75 SGB XI des Bundeslandes
 * - Tarifvertrag (z.B. TVoeD-P, AVR Caritas, AVR Diakonie)
 * - Anerkennungsbescheid der Landesbehoerde
 *
 * KEINE ERFUNDENEN REGELN:
 * Die Default-Zuschlagssaetze in billing_tariffs sind 0%.
 * Echte Saetze kommen aus den oben genannten Dokumenten.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface Feiertag {
  datum: string;
  bezeichnung: string;
  bundesland: string | null;
}

/**
 * Bundesweite gesetzliche Feiertage.
 * Diese 9 Tage gelten in ALLEN Bundeslaendern.
 */
export function bundesweiteFeiertage(jahr: number): Feiertag[] {
  const ostern = berechneOstersonntag(jahr);
  const karfreitag = addDays(ostern, -2);
  const ostermontag = addDays(ostern, 1);
  const himmelfahrt = addDays(ostern, 39);
  const pfingstmontag = addDays(ostern, 50);

  return [
    { datum: `${jahr}-01-01`, bezeichnung: 'Neujahr', bundesland: null },
    { datum: formatDate(karfreitag), bezeichnung: 'Karfreitag', bundesland: null },
    { datum: formatDate(ostermontag), bezeichnung: 'Ostermontag', bundesland: null },
    { datum: `${jahr}-05-01`, bezeichnung: 'Tag der Arbeit', bundesland: null },
    { datum: formatDate(himmelfahrt), bezeichnung: 'Christi Himmelfahrt', bundesland: null },
    { datum: formatDate(pfingstmontag), bezeichnung: 'Pfingstmontag', bundesland: null },
    { datum: `${jahr}-10-03`, bezeichnung: 'Tag der Deutschen Einheit', bundesland: null },
    { datum: `${jahr}-12-25`, bezeichnung: '1. Weihnachtsfeiertag', bundesland: null },
    { datum: `${jahr}-12-26`, bezeichnung: '2. Weihnachtsfeiertag', bundesland: null },
  ];
}

/**
 * Landesspezifische Feiertage fuer alle 16 Bundeslaender.
 *
 * Akzeptiert sowohl Unterstrich- als auch Bindestrich-Format
 * (z.B. 'nordrhein_westfalen' oder 'nordrhein-westfalen').
 * Rueckgabe verwendet immer das kanonische Unterstrich-Format
 * (passend zu BundeslandCode aus lib/expansion/types.ts).
 */
export function landesFeiertage(jahr: number, bundesland: string): Feiertag[] {
  const ostern = berechneOstersonntag(jahr);
  const fronleichnam = addDays(ostern, 60);
  const feiertage: Feiertag[] = [];

  // Normalisieren: lowercase + Bindestriche → Unterstriche
  const bl = bundesland.toLowerCase().replace(/-/g, '_');

  switch (bl) {
    case 'baden_wuerttemberg':
      feiertage.push(
        { datum: `${jahr}-01-06`, bezeichnung: 'Heilige Drei Koenige', bundesland: 'baden_wuerttemberg' },
        { datum: formatDate(fronleichnam), bezeichnung: 'Fronleichnam', bundesland: 'baden_wuerttemberg' },
        { datum: `${jahr}-11-01`, bezeichnung: 'Allerheiligen', bundesland: 'baden_wuerttemberg' },
      );
      break;

    case 'bayern':
      feiertage.push(
        { datum: `${jahr}-01-06`, bezeichnung: 'Heilige Drei Koenige', bundesland: 'bayern' },
        { datum: formatDate(fronleichnam), bezeichnung: 'Fronleichnam', bundesland: 'bayern' },
        { datum: `${jahr}-08-15`, bezeichnung: 'Mariae Himmelfahrt', bundesland: 'bayern' },
        { datum: `${jahr}-11-01`, bezeichnung: 'Allerheiligen', bundesland: 'bayern' },
      );
      break;

    case 'berlin':
      feiertage.push(
        { datum: `${jahr}-03-08`, bezeichnung: 'Frauentag', bundesland: 'berlin' },
      );
      break;

    case 'brandenburg':
      feiertage.push(
        { datum: `${jahr}-10-31`, bezeichnung: 'Reformationstag', bundesland: 'brandenburg' },
      );
      break;

    case 'bremen':
      feiertage.push(
        { datum: `${jahr}-10-31`, bezeichnung: 'Reformationstag', bundesland: 'bremen' },
      );
      break;

    case 'hamburg':
      feiertage.push(
        { datum: `${jahr}-10-31`, bezeichnung: 'Reformationstag', bundesland: 'hamburg' },
      );
      break;

    case 'hessen':
      feiertage.push(
        { datum: formatDate(fronleichnam), bezeichnung: 'Fronleichnam', bundesland: 'hessen' },
      );
      break;

    case 'mecklenburg_vorpommern':
      feiertage.push(
        { datum: `${jahr}-03-08`, bezeichnung: 'Frauentag', bundesland: 'mecklenburg_vorpommern' },
        { datum: `${jahr}-10-31`, bezeichnung: 'Reformationstag', bundesland: 'mecklenburg_vorpommern' },
      );
      break;

    case 'niedersachsen':
      feiertage.push(
        { datum: `${jahr}-10-31`, bezeichnung: 'Reformationstag', bundesland: 'niedersachsen' },
      );
      break;

    case 'nordrhein_westfalen':
    case 'nrw':
      feiertage.push(
        { datum: formatDate(fronleichnam), bezeichnung: 'Fronleichnam', bundesland: 'nordrhein_westfalen' },
        { datum: `${jahr}-11-01`, bezeichnung: 'Allerheiligen', bundesland: 'nordrhein_westfalen' },
      );
      break;

    case 'rheinland_pfalz':
      feiertage.push(
        { datum: formatDate(fronleichnam), bezeichnung: 'Fronleichnam', bundesland: 'rheinland_pfalz' },
        { datum: `${jahr}-11-01`, bezeichnung: 'Allerheiligen', bundesland: 'rheinland_pfalz' },
      );
      break;

    case 'saarland':
      feiertage.push(
        { datum: formatDate(fronleichnam), bezeichnung: 'Fronleichnam', bundesland: 'saarland' },
        { datum: `${jahr}-08-15`, bezeichnung: 'Mariae Himmelfahrt', bundesland: 'saarland' },
        { datum: `${jahr}-11-01`, bezeichnung: 'Allerheiligen', bundesland: 'saarland' },
      );
      break;

    case 'sachsen':
      feiertage.push(
        { datum: `${jahr}-10-31`, bezeichnung: 'Reformationstag', bundesland: 'sachsen' },
        { datum: formatDate(berechneBussUndBettag(jahr)), bezeichnung: 'Buss und Bettag', bundesland: 'sachsen' },
      );
      break;

    case 'sachsen_anhalt':
      feiertage.push(
        { datum: `${jahr}-01-06`, bezeichnung: 'Heilige Drei Koenige', bundesland: 'sachsen_anhalt' },
        { datum: `${jahr}-10-31`, bezeichnung: 'Reformationstag', bundesland: 'sachsen_anhalt' },
      );
      break;

    case 'schleswig_holstein':
      feiertage.push(
        { datum: `${jahr}-10-31`, bezeichnung: 'Reformationstag', bundesland: 'schleswig_holstein' },
      );
      break;

    case 'thueringen':
      feiertage.push(
        { datum: `${jahr}-09-20`, bezeichnung: 'Weltkindertag', bundesland: 'thueringen' },
        { datum: `${jahr}-10-31`, bezeichnung: 'Reformationstag', bundesland: 'thueringen' },
      );
      break;
  }

  return feiertage;
}

export async function istFeiertag(
  supabase: SupabaseClient,
  datum: string,
  bundesland?: string
): Promise<boolean> {
  let query = supabase
    .from('billing_feiertage')
    .select('id')
    .eq('datum', datum);

  if (bundesland) {
    query = query.or(`bundesland.is.null,bundesland.eq.${bundesland}`);
  } else {
    query = query.is('bundesland', null);
  }

  const { data } = await query.limit(1);
  return (data?.length ?? 0) > 0;
}

export interface FeiertagImportErgebnis {
  /** Neu angelegte Zeilen. */
  importiert: number;
  /** Zeilen, die es schon gab (Unique-Verletzung) — der Normalfall bei
   *  jedem Lauf nach dem ersten. */
  vorhanden: number;
  /** Echte Fehler (fehlende Tabelle, RLS, Constraint) — benannt, nicht
   *  als "uebersprungen" verbucht. */
  fehler: string[];
}

/** Postgres-Fehlercode fuer unique_violation. */
const UNIQUE_VERLETZUNG = '23505';

/**
 * Importiert Feiertage fuer ein Jahr in die billing_feiertage Tabelle.
 * Idempotent: ein zweiter Lauf legt nichts doppelt an (unique Index
 * ueber datum + COALESCE(bundesland,'__ALL__')).
 *
 * WICHTIG — Fehler werden NICHT als "uebersprungen" verbucht.
 * Die frueehere Fassung zaehlte jeden Fehler in `skipped`: eine fehlende
 * Tabelle, eine RLS-Ablehnung und eine harmlose Dublette sahen im Ergebnis
 * identisch aus. Ein Lauf, der nichts geschrieben hat, war von einem Lauf,
 * bei dem schon alles stand, nicht zu unterscheiden. Nur die
 * Unique-Verletzung gilt jetzt als "vorhanden", alles andere landet
 * benannt in `fehler`.
 *
 * Der Aufrufer braucht Schreibrechte auf den Katalog (Admin oder
 * service_role, siehe Migration 20260808140000_katalog_rls.sql).
 */
export async function importiereFeiertage(
  supabase: SupabaseClient,
  jahr: number,
  bundeslaender: string[]
): Promise<FeiertagImportErgebnis> {
  const alleFeiertage = [
    ...bundesweiteFeiertage(jahr),
    ...bundeslaender.flatMap(bl => landesFeiertage(jahr, bl)),
  ];

  let importiert = 0;
  let vorhanden = 0;
  const fehler: string[] = [];

  for (const f of alleFeiertage) {
    const { error } = await supabase
      .from('billing_feiertage')
      .insert({
        datum: f.datum,
        bezeichnung: f.bezeichnung,
        bundesland: f.bundesland,
      });

    if (!error) {
      importiert++;
      continue;
    }

    const code = (error as { code?: string }).code;
    if (code === UNIQUE_VERLETZUNG || /duplicate key|unique/i.test(error.message)) {
      vorhanden++;
    } else {
      fehler.push(`${f.datum} ${f.bezeichnung} (${f.bundesland ?? 'bundesweit'}): ${error.message}`);
    }
  }

  return { importiert, vorhanden, fehler };
}

// --- Hilfsfunktionen ---

function berechneOstersonntag(jahr: number): Date {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(jahr, monat - 1, tag);
}

/**
 * Berechnet den Buss- und Bettag (Mittwoch vor dem 23. November).
 * Faellt immer zwischen den 16. und 22. November.
 * Gesetzlicher Feiertag nur noch in Sachsen.
 */
function berechneBussUndBettag(jahr: number): Date {
  const nov23 = new Date(jahr, 10, 23); // Monat 0-indiziert: 10 = November
  const dow = nov23.getDay(); // 0=So, 1=Mo, ..., 6=Sa
  // Tage zurueck zum letzten Mittwoch (Mittwoch = 3) VOR dem 23.
  const daysBack = ((dow - 3) + 7) % 7 || 7;
  return addDays(nov23, -daysBack);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * ZUSCHLAGSREGELN — was noch benoetigt wird:
 *
 * Die Zuschlagsspalten in billing_tariffs sind:
 * - zuschlag_wochenende_prozent (Default 0)
 * - zuschlag_feiertag_prozent (Default 0)
 * - zuschlag_nacht_prozent (Default 0)
 * - nacht_von / nacht_bis (Default 20:00-06:00)
 *
 * Diese Werte DUERFEN NICHT erfunden werden.
 * Sie kommen aus:
 *
 * 1. Der individuellen Verguetungsvereinbarung mit der Pflegekasse
 *    → Abschnitt "Zuschlaege" / "Sonderverguetungen"
 *
 * 2. Dem Landesrahmenvertrag (§75 SGB XI)
 *    → Anlage "Verguetung" / "Zuschlagsregelungen"
 *
 * 3. Dem anwendbaren Tarifvertrag (falls tarifgebunden)
 *    → TVoeD-P §8 (Zeitzuschlaege)
 *    → AVR Caritas/Diakonie (Anlage Zeitzuschlaege)
 *
 * Typische Struktur (BEISPIEL — NICHT als Fakt verwenden):
 * - Sonntagszuschlag: vertragsabhaengig
 * - Feiertagszuschlag: vertragsabhaengig
 * - Nachtzuschlag: vertragsabhaengig
 * - Nachtzeit-Definition: vertragsabhaengig (oft 20-06 oder 22-06)
 *
 * AKTION: Die echten Saetze muessen aus den Vertragsunterlagen
 * extrahiert und ueber den Tarif-Import eingepflegt werden.
 */
