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
 * Landesspezifische Feiertage.
 * Nur die wichtigsten fuer die Pflege-Abrechnung.
 */
export function landesFeiertage(jahr: number, bundesland: string): Feiertag[] {
  const ostern = berechneOstersonntag(jahr);
  const fronleichnam = addDays(ostern, 60);
  const feiertage: Feiertag[] = [];

  switch (bundesland.toLowerCase()) {
    case 'hessen':
      feiertage.push(
        { datum: formatDate(fronleichnam), bezeichnung: 'Fronleichnam', bundesland: 'hessen' },
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
    case 'nordrhein-westfalen':
    case 'nrw':
      feiertage.push(
        { datum: formatDate(fronleichnam), bezeichnung: 'Fronleichnam', bundesland: 'nordrhein-westfalen' },
        { datum: `${jahr}-11-01`, bezeichnung: 'Allerheiligen', bundesland: 'nordrhein-westfalen' },
      );
      break;
    case 'niedersachsen':
      feiertage.push(
        { datum: `${jahr}-10-31`, bezeichnung: 'Reformationstag', bundesland: 'niedersachsen' },
      );
      break;
    case 'baden-wuerttemberg':
      feiertage.push(
        { datum: `${jahr}-01-06`, bezeichnung: 'Heilige Drei Koenige', bundesland: 'baden-wuerttemberg' },
        { datum: formatDate(fronleichnam), bezeichnung: 'Fronleichnam', bundesland: 'baden-wuerttemberg' },
        { datum: `${jahr}-11-01`, bezeichnung: 'Allerheiligen', bundesland: 'baden-wuerttemberg' },
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

/**
 * Importiert Feiertage fuer ein Jahr in die billing_feiertage Tabelle.
 * Idempotent (ON CONFLICT DO NOTHING via unique Index).
 */
export async function importiereFeiertage(
  supabase: SupabaseClient,
  jahr: number,
  bundeslaender: string[]
): Promise<{ imported: number; skipped: number }> {
  const alleFeiertage = [
    ...bundesweiteFeiertage(jahr),
    ...bundeslaender.flatMap(bl => landesFeiertage(jahr, bl)),
  ];

  let imported = 0;
  let skipped = 0;

  for (const f of alleFeiertage) {
    const { error } = await supabase
      .from('billing_feiertage')
      .insert({
        datum: f.datum,
        bezeichnung: f.bezeichnung,
        bundesland: f.bundesland,
      });

    if (error) {
      skipped++;
    } else {
      imported++;
    }
  }

  return { imported, skipped };
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
