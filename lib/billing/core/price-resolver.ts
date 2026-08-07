/**
 * Price Resolver – Tarifaufloesung und Preisberechnung
 *
 * Findet den spezifischsten gueltigen Tarif und berechnet
 * Gesamtpreise inklusive Zuschlags- und Abschlagsregeln.
 *
 * Aufloesungs-Reihenfolge (spezifischster gewinnt):
 * 1. Exakter Match (Org + Kostentraeger + Leistung + Bundesland + Qualifikation + Vertrag)
 * 2. Ohne Qualifikation
 * 3. Ohne Vertrag
 * 4. Ohne Bundesland
 * 5. Ohne Kostentraeger
 * 6. Fallback: Fehler
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PriceResolveParams {
  leistungsart: string;
  rechtsgrundlage: string;    // P7: 'privat' fuer Privatzahler, '§45b SGB XI' etc. fuer Kasse
  datum: string;              // ISO date YYYY-MM-DD
  kostentraegerIk?: string;
  bundesland?: string;
  qualifikation?: string;
  vertragReferenz?: string;
}

/**
 * P4: Erlaubte Tarifquellen
 */
export type Tarifquelle =
  | 'PRIVATE_PREISLISTE'
  | 'ANERKENNUNGSBESCHEID'
  | 'VERGUETUNGSVEREINBARUNG'
  | 'KASSENVEREINBARUNG'
  | 'MANUELL_FREIGEGEBEN';

/**
 * P7: Budget-Type zu Rechtsgrundlage Mapping.
 * WICHTIG: private → 'privat' (NICHT null), damit nur Privattarife matchen.
 */
export function budgetTypeToRechtsgrundlage(budgetType: string): string {
  const mapping: Record<string, string> = {
    'entlastung': '§45b SGB XI',
    'verhinderung': '§39 SGB XI',
    'carryover': '§45b SGB XI',
    'haeusliche_pflege_36': '§36 SGB XI',
    'private': 'privat',
  };
  const result = mapping[budgetType];
  if (!result) {
    throw new Error(
      `Unbekannter budget_type: "${budgetType}". ` +
      `Erlaubt: ${Object.keys(mapping).join(', ')}`
    );
  }
  return result;
}

export interface BillingTarif {
  id: string;
  organization_id: string;
  kostentraeger_ik: string | null;
  leistungsart: string;
  rechtsgrundlage: string;
  bundesland: string | null;
  vertragsgebiet: string | null;
  vertrag_referenz: string | null;
  qualifikation: string | null;
  verguetungsart: string;
  preis_cent: number;
  einheit: string | null;
  zuschlag_wochenende_prozent: number;
  zuschlag_feiertag_prozent: number;
  zuschlag_nacht_prozent: number;
  nacht_von: string;
  nacht_bis: string;
  kombinations_abschlag_prozent: number;
  gueltig_ab: string;
  gueltig_bis: string | null;
  tarifquelle: Tarifquelle | null;  // P4: Herkunft des Tarifs
}

export interface LineTotalParams {
  tarif: BillingTarif;
  menge: number;
  datum: string;          // ISO date
  zeitVon?: string;       // HH:MM
  zeitBis?: string;       // HH:MM
  istWochenende?: boolean;
  istFeiertag?: boolean;
}

export interface LineTotalResult {
  einzelpreisCent: number;
  zuschlagProzent: number;
  zuschlagGrund: string | null;
  gesamtpreisCent: number;
}

export interface PriceSnapshot {
  tarif_id: string;
  leistungsart: string;
  verguetungsart: string;
  einzelpreis_cent: number;
  einheit: string | null;
  zuschlag_prozent: number;
  zuschlag_grund: string | null;
  gesamtpreis_cent: number;
  rechtsgrundlage: string;
}

// ---------------------------------------------------------------------------
// Tarifaufloesung
// ---------------------------------------------------------------------------

/**
 * Findet den gueltigen Tarif mit hoechster Spezifitaet.
 */
export async function resolvePrice(
  supabase: SupabaseClient,
  params: PriceResolveParams
): Promise<BillingTarif> {
  // Alle potentiell passenden Tarife laden
  let query = supabase
    .from('billing_tariffs')
    .select('*')
    .eq('leistungsart', params.leistungsart)
    .eq('rechtsgrundlage', params.rechtsgrundlage)
    .lte('gueltig_ab', params.datum)
    .is('deleted_at', null);

  const { data: tarife, error } = await query.returns<BillingTarif[]>();

  if (error) {
    throw new Error(`Tarifladen fehlgeschlagen: ${error.message}`);
  }

  if (!tarife || tarife.length === 0) {
    throw new Error(
      `Kein Tarif gefunden für Leistungsart "${params.leistungsart}", ` +
      `Rechtsgrundlage "${params.rechtsgrundlage}", Datum ${params.datum}.`
    );
  }

  // Nur gueltige Tarife (gueltig_bis beachten)
  const gueltige = tarife.filter(t =>
    t.gueltig_bis === null || t.gueltig_bis >= params.datum
  );

  if (gueltige.length === 0) {
    throw new Error(
      `Kein gültiger Tarif zum Datum ${params.datum} für ` +
      `"${params.leistungsart}" / "${params.rechtsgrundlage}".`
    );
  }

  // Spezifitaets-Score berechnen
  const scored = gueltige.map(t => ({
    tarif: t,
    score: computeSpecificityScore(t, params),
  }));

  // Absteigend nach Score sortieren, bei Gleichstand neuester gueltig_ab
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.tarif.gueltig_ab.localeCompare(a.tarif.gueltig_ab);
  });

  const best = scored[0];

  // Mindest-Match: Leistungsart + Rechtsgrundlage muessen passen (Score >= 0)
  if (best.score < 0) {
    throw new Error(
      `Kein passender Tarif gefunden für die angegebenen Kriterien.`
    );
  }

  return best.tarif;
}

/**
 * Berechnet den Spezifitaets-Score eines Tarifs.
 * Hoeherer Score = spezifischerer Match.
 */
function computeSpecificityScore(
  tarif: BillingTarif,
  params: PriceResolveParams
): number {
  let score = 0;

  // Kostentraeger-Match: +10 Punkte (negativer Score wenn Tarif spezifisch aber nicht passend)
  if (tarif.kostentraeger_ik) {
    if (params.kostentraegerIk === tarif.kostentraeger_ik) {
      score += 10;
    } else {
      return -1; // Tarif ist fuer einen anderen Kostentraeger
    }
  }

  // Bundesland-Match: +5 Punkte
  if (tarif.bundesland) {
    if (params.bundesland === tarif.bundesland) {
      score += 5;
    } else {
      return -1; // Tarif ist fuer ein anderes Bundesland
    }
  }

  // Qualifikation-Match: +3 Punkte
  if (tarif.qualifikation) {
    if (params.qualifikation === tarif.qualifikation) {
      score += 3;
    } else {
      return -1; // Tarif ist fuer eine andere Qualifikation
    }
  }

  // Vertrag-Match: +2 Punkte
  if (tarif.vertrag_referenz) {
    if (params.vertragReferenz === tarif.vertrag_referenz) {
      score += 2;
    } else {
      return -1; // Tarif ist fuer einen anderen Vertrag
    }
  }

  return score;
}

// ---------------------------------------------------------------------------
// Preisberechnung
// ---------------------------------------------------------------------------

/**
 * Berechnet den Gesamtpreis einer Position inklusive Zuschlags-/Abschlagslogik.
 */
export function calculateLineTotal(params: LineTotalParams): LineTotalResult {
  const { tarif, menge, zeitVon, zeitBis } = params;

  let zuschlagProzent = 0;
  let zuschlagGrund: string | null = null;

  // Feiertag hat Vorrang vor Wochenende
  if (params.istFeiertag && tarif.zuschlag_feiertag_prozent > 0) {
    zuschlagProzent = Number(tarif.zuschlag_feiertag_prozent);
    zuschlagGrund = 'feiertag';
  } else if (params.istWochenende && tarif.zuschlag_wochenende_prozent > 0) {
    zuschlagProzent = Number(tarif.zuschlag_wochenende_prozent);
    zuschlagGrund = 'wochenende';
  }

  // Nachtzuschlag (kumulativ)
  if (zeitVon && zeitBis && tarif.zuschlag_nacht_prozent > 0) {
    if (isNachtzeit(zeitVon, zeitBis, tarif.nacht_von, tarif.nacht_bis)) {
      zuschlagProzent += Number(tarif.zuschlag_nacht_prozent);
      zuschlagGrund = zuschlagGrund
        ? `${zuschlagGrund}+nacht`
        : 'nacht';
    }
  }

  // Basis: Preis * Menge
  const basisCent = tarif.preis_cent * menge;

  // Zuschlag anwenden
  const zuschlagCent = Math.round(basisCent * zuschlagProzent / 100);
  const gesamtCent = Math.round(basisCent + zuschlagCent);

  return {
    einzelpreisCent: tarif.preis_cent,
    zuschlagProzent,
    zuschlagGrund,
    gesamtpreisCent: gesamtCent,
  };
}

/**
 * Prueft ob ein Zeitraum in der Nachtzeit liegt.
 * Einfache Heuristik: mindestens Beginn ODER Ende liegt in der Nachtzeit.
 */
function isNachtzeit(
  zeitVon: string,
  zeitBis: string,
  nachtVon: string,
  nachtBis: string
): boolean {
  // Nachtzeit: z.B. 20:00 - 06:00 (ueber Mitternacht)
  const von = parseTime(zeitVon);
  const bis = parseTime(zeitBis);
  const nVon = parseTime(nachtVon);
  const nBis = parseTime(nachtBis);

  // Nacht geht ueber Mitternacht (nVon > nBis, z.B. 20:00-06:00)
  if (nVon > nBis) {
    // Nachtzeit = [nVon, 24:00) oder [00:00, nBis)
    return von >= nVon || von < nBis || bis > nVon || bis <= nBis;
  }

  // Nacht innerhalb eines Tages (z.B. 22:00-05:00 wuerde als nVon > nBis behandelt)
  return von >= nVon && von < nBis;
}

function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/**
 * Erzeugt einen unveraenderlichen Preis-Snapshot fuer invoice_line_snapshots.
 */
export function snapshotPrice(
  tarif: BillingTarif,
  lineResult: LineTotalResult
): PriceSnapshot {
  return {
    tarif_id: tarif.id,
    leistungsart: tarif.leistungsart,
    verguetungsart: tarif.verguetungsart,
    einzelpreis_cent: lineResult.einzelpreisCent,
    einheit: tarif.einheit,
    zuschlag_prozent: lineResult.zuschlagProzent,
    zuschlag_grund: lineResult.zuschlagGrund,
    gesamtpreis_cent: lineResult.gesamtpreisCent,
    rechtsgrundlage: tarif.rechtsgrundlage,
  };
}
