/**
 * Tarif-Import: Importiert echte Verguetungsvereinbarungen in billing_tariffs.
 *
 * KEINE erfundenen Preise. Dieses Modul validiert und importiert Daten
 * aus offiziellen Quellen (Verguetungsvereinbarungen, Anerkennungsbescheide,
 * interne Preislisten).
 *
 * Pflichtfelder je Tarif:
 * - bundesland: Bundesland-Code (z.B. 'hessen')
 * - kostentraeger_ik: IK-Nummer des Kostentraegers (9 Ziffern + Luhn)
 * - leistungsart: Code aus billing_leistungsarten
 * - rechtsgrundlage: Code aus billing_rechtsgrundlagen
 * - bezeichnung: Menschenlesbare Bezeichnung
 * - preis_cent: Preis in Cent (ganzzahlig, >= 0)
 * - einheit: z.B. 'stunde', 'einsatz', 'pauschale'
 * - verguetungsart: aus billing_tariffs CHECK
 * - gueltig_ab: Startdatum (ISO)
 * - gueltig_bis: Enddatum (ISO, optional)
 * - tarifquelle: Code aus billing_tarifquellen
 * - quellen_referenz: Aktenzeichen/Vertragsnummer/Dokumentenverweis
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface TariffImportRow {
  bundesland: string;
  kostentraeger_ik: string | null;
  leistungsart: string;
  rechtsgrundlage: string;
  bezeichnung: string;
  preis_cent: number;
  einheit: string;
  verguetungsart: string;
  gueltig_ab: string;
  gueltig_bis?: string | null;
  tarifquelle: string;
  quellen_referenz: string;
  qualifikation?: string | null;
  zuschlag_wochenende_prozent?: number;
  zuschlag_feiertag_prozent?: number;
  zuschlag_nacht_prozent?: number;
}

export interface TariffImportResult {
  imported: number;
  skipped: number;
  errors: TariffImportError[];
}

export interface TariffImportError {
  row: number;
  field: string;
  message: string;
}

const VALID_VERGUETUNGSARTEN = new Set([
  'zeit_stunde', 'zeit_minute', 'leistungskomplex',
  'pauschale', 'wegepauschale', 'zuschlag',
]);

const VALID_EINHEITEN = new Set([
  'stunde', 'minute', 'einsatz', 'pauschale', 'km', 'tag',
]);

function validateIkNummer(ik: string): boolean {
  const cleaned = ik.replace(/\s/g, '');
  if (!/^\d{9}$/.test(cleaned)) return false;

  const digits = cleaned.split('').map(Number);
  const weights = [2, 1, 2, 1, 2, 1];
  let sum = 0;
  for (let i = 0; i < 6; i++) {
    const product = digits[i + 2] * weights[i];
    sum += product > 9 ? product - 9 : product;
  }
  return digits[8] === sum % 10;
}

function validateRow(row: TariffImportRow, index: number): TariffImportError[] {
  const errors: TariffImportError[] = [];
  const r = index + 1;

  if (!row.bundesland?.trim()) {
    errors.push({ row: r, field: 'bundesland', message: 'Bundesland ist Pflicht' });
  }
  if (row.kostentraeger_ik && !validateIkNummer(row.kostentraeger_ik)) {
    errors.push({ row: r, field: 'kostentraeger_ik', message: `IK-Pruefziffer ungueltig: ${row.kostentraeger_ik}` });
  }
  if (!row.leistungsart?.trim()) {
    errors.push({ row: r, field: 'leistungsart', message: 'Leistungsart ist Pflicht' });
  }
  if (!row.rechtsgrundlage?.trim()) {
    errors.push({ row: r, field: 'rechtsgrundlage', message: 'Rechtsgrundlage ist Pflicht' });
  }
  if (typeof row.preis_cent !== 'number' || row.preis_cent < 0 || !Number.isInteger(row.preis_cent)) {
    errors.push({ row: r, field: 'preis_cent', message: `Preis muss ganzzahlig >= 0 sein, erhalten: ${row.preis_cent}` });
  }
  if (!row.einheit || !VALID_EINHEITEN.has(row.einheit)) {
    errors.push({ row: r, field: 'einheit', message: `Ungueltige Einheit: ${row.einheit}` });
  }
  if (!row.verguetungsart || !VALID_VERGUETUNGSARTEN.has(row.verguetungsart)) {
    errors.push({ row: r, field: 'verguetungsart', message: `Ungueltige Verguetungsart: ${row.verguetungsart}` });
  }
  if (!row.gueltig_ab || !/^\d{4}-\d{2}-\d{2}$/.test(row.gueltig_ab)) {
    errors.push({ row: r, field: 'gueltig_ab', message: 'Gueltig-ab muss im Format YYYY-MM-DD sein' });
  }
  if (row.gueltig_bis && !/^\d{4}-\d{2}-\d{2}$/.test(row.gueltig_bis)) {
    errors.push({ row: r, field: 'gueltig_bis', message: 'Gueltig-bis muss im Format YYYY-MM-DD sein' });
  }
  if (row.gueltig_ab && row.gueltig_bis && row.gueltig_bis < row.gueltig_ab) {
    errors.push({ row: r, field: 'gueltig_bis', message: 'Gueltig-bis darf nicht vor Gueltig-ab liegen' });
  }
  if (!row.tarifquelle?.trim()) {
    errors.push({ row: r, field: 'tarifquelle', message: 'Tarifquelle ist Pflicht' });
  }
  if (!row.quellen_referenz?.trim()) {
    errors.push({ row: r, field: 'quellen_referenz', message: 'Quellen-Referenz (Aktenzeichen/Vertragsnummer) ist Pflicht' });
  }

  return errors;
}

export async function importTariffs(
  supabase: SupabaseClient,
  organizationId: string,
  rows: TariffImportRow[],
  actorId: string,
  options: { dryRun?: boolean } = {}
): Promise<TariffImportResult> {
  const allErrors: TariffImportError[] = [];
  let imported = 0;
  let skipped = 0;

  // 1. Validierung aller Zeilen
  for (let i = 0; i < rows.length; i++) {
    const rowErrors = validateRow(rows[i], i);
    allErrors.push(...rowErrors);
  }

  if (allErrors.length > 0) {
    return { imported: 0, skipped: rows.length, errors: allErrors };
  }

  // 2. Katalog-Validierung (leistungsart, rechtsgrundlage, tarifquelle)
  const { data: leistungsarten } = await supabase
    .from('billing_leistungsarten')
    .select('code');
  const validLeistungsarten = new Set((leistungsarten || []).map((l: any) => l.code));

  const { data: rechtsgrundlagen } = await supabase
    .from('billing_rechtsgrundlagen')
    .select('code');
  const validRechtsgrundlagen = new Set((rechtsgrundlagen || []).map((r: any) => r.code));

  const { data: tarifquellen } = await supabase
    .from('billing_tarifquellen')
    .select('code');
  const validTarifquellen = new Set((tarifquellen || []).map((t: any) => t.code));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!validLeistungsarten.has(row.leistungsart)) {
      allErrors.push({ row: i + 1, field: 'leistungsart', message: `Unbekannte Leistungsart: ${row.leistungsart}` });
    }
    if (!validRechtsgrundlagen.has(row.rechtsgrundlage)) {
      allErrors.push({ row: i + 1, field: 'rechtsgrundlage', message: `Unbekannte Rechtsgrundlage: ${row.rechtsgrundlage}` });
    }
    if (!validTarifquellen.has(row.tarifquelle)) {
      allErrors.push({ row: i + 1, field: 'tarifquelle', message: `Unbekannte Tarifquelle: ${row.tarifquelle}` });
    }
  }

  if (allErrors.length > 0) {
    return { imported: 0, skipped: rows.length, errors: allErrors };
  }

  if (options.dryRun) {
    return { imported: 0, skipped: rows.length, errors: [] };
  }

  // 3. Import
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const { error } = await supabase
      .from('billing_tariffs')
      .insert({
        organization_id: organizationId,
        bundesland: row.bundesland,
        kostentraeger_ik: row.kostentraeger_ik || null,
        leistungsart: row.leistungsart,
        rechtsgrundlage: row.rechtsgrundlage,
        preis_cent: row.preis_cent,
        einheit: row.einheit,
        verguetungsart: row.verguetungsart,
        gueltig_ab: row.gueltig_ab,
        gueltig_bis: row.gueltig_bis || null,
        tarifquelle: row.tarifquelle,
        vertrag_referenz: row.quellen_referenz,
        qualifikation: row.qualifikation || null,
        zuschlag_wochenende_prozent: row.zuschlag_wochenende_prozent ?? 0,
        zuschlag_feiertag_prozent: row.zuschlag_feiertag_prozent ?? 0,
        zuschlag_nacht_prozent: row.zuschlag_nacht_prozent ?? 0,
        created_by: actorId,
      });

    if (error) {
      if (error.message.includes('no_overlapping_tariffs')) {
        allErrors.push({
          row: i + 1,
          field: 'gueltig_ab',
          message: `Zeitliche Ueberschneidung mit bestehendem Tarif: ${row.leistungsart} / ${row.rechtsgrundlage}`,
        });
        skipped++;
      } else {
        allErrors.push({ row: i + 1, field: 'insert', message: error.message });
        skipped++;
      }
    } else {
      imported++;
    }
  }

  return { imported, skipped, errors: allErrors };
}

/**
 * Dokumentation: Welche offiziellen Dokumente werden benoetigt?
 *
 * Fuer den Import echter Tarife werden folgende Dokumente benoetigt:
 *
 * 1. VERGUETUNGSVEREINBARUNGEN (§89 SGB XI)
 *    - Individuelle Vereinbarung zwischen Pflegedienst und Pflegekasse
 *    - Enthalt: Leistungsart, Verguetungssatz, Laufzeit
 *    - Quelle: Eigene Vertragsakte / Verbandsvertrag
 *
 * 2. ANERKENNUNGSBESCHEID (§45a SGB XI)
 *    - Bescheid der Landesbehoerde ueber anerkannte Leistungen
 *    - Enthalt: Leistungsarten, Stundensaetze, Geltungsbereich
 *    - Quelle: Landesamt / RP (je Bundesland verschieden)
 *
 * 3. RAHMENVERTRAEGE
 *    - Landesrahmenvertraege nach §75 SGB XI
 *    - Enthalt: Mindest-/Hoechstverguetungen, Qualifikationsanforderungen
 *    - Quelle: Pflegekassenverband des Bundeslandes
 *
 * 4. PRIVATE PREISLISTE
 *    - Eigene Preisliste fuer Privatleistungen
 *    - Keine behordliche Genehmigung noetig
 *    - Quelle: Interne Kalkulation
 *
 * 5. BUNDESLAND-SPEZIFISCH:
 *    Hessen:
 *    - RP Giessen (Anerkennungsbescheide §45a)
 *    - AOK Hessen, BKK, IKK (Verguetungsvereinbarungen)
 *    - GKV-Spitzenverband: IK-Verzeichnis
 *
 * WICHTIG: Alle Preise muessen aus den Originaldokumenten stammen.
 * Keine Schaetzungen, keine gerundeten Werte, keine Fantasietarife.
 */
export const REQUIRED_DOCUMENTS = {
  VERGUETUNGSVEREINBARUNG: {
    beschreibung: 'Individuelle Verguetungsvereinbarung mit Pflegekasse(n)',
    quelle: 'Eigene Vertragsakte',
    pflichtfelder: ['kostentraeger_ik', 'leistungsart', 'preis_cent', 'gueltig_ab', 'gueltig_bis'],
  },
  ANERKENNUNGSBESCHEID: {
    beschreibung: 'Anerkennungsbescheid der Landesbehoerde (§45a SGB XI)',
    quelle: 'Landesamt / Regierungspraesidium',
    pflichtfelder: ['bundesland', 'leistungsart', 'preis_cent', 'gueltig_ab'],
  },
  PRIVATE_PREISLISTE: {
    beschreibung: 'Interne Preisliste fuer Privatleistungen',
    quelle: 'Interne Kalkulation / Geschaeftsfuehrung',
    pflichtfelder: ['leistungsart', 'preis_cent', 'gueltig_ab'],
  },
  IK_VERZEICHNIS: {
    beschreibung: 'IK-Nummern der Kostentraeger',
    quelle: 'GKV-Spitzenverband / ARGE IK',
    pflichtfelder: ['kostentraeger_ik'],
  },
} as const;
