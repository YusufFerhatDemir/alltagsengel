/**
 * DATEV Export-Service — Orchestriert den kompletten Export-Vorgang
 *
 * Sammelt Buchungsvorfaelle, generiert DATEV-CSV, speichert in Storage,
 * protokolliert den Export in der DB und liefert ZIP zum Download.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateDatevCsv, type DatevHeaderParams } from './datev-format';
import { generateBuchungssaetze, type BuchungssatzResult } from './buchungssatz-generator';
import { getDatevConfig, isDatevConfigComplete } from './datev-config';
import { logBillingAction } from '../core/audit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportParams {
  organizationId: string;
  zeitraumVon: string; // YYYY-MM-DD
  zeitraumBis: string; // YYYY-MM-DD
  actorId: string;
  /** Duplikat-Export erzwingen */
  force?: boolean;
}

export interface ExportResult {
  exportId: string;
  buchungenAnzahl: number;
  csvContent: string;
  protokoll: string;
  statistik: BuchungssatzResult['statistik'];
}

export interface ExportListItem {
  id: string;
  zeitraumVon: string;
  zeitraumBis: string;
  buchungenAnzahl: number;
  exportDatum: string;
  status: string;
  beraternummer: string;
  mandantennummer: string;
  kontenrahmen: string;
  fehlerDetails: string | null;
}

// ---------------------------------------------------------------------------
// Export erstellen
// ---------------------------------------------------------------------------

/**
 * Erstellt einen DATEV-Export fuer den angegebenen Zeitraum.
 */
export async function erstelleDatevExport(
  supabase: SupabaseClient,
  params: ExportParams,
): Promise<ExportResult> {
  const { organizationId, zeitraumVon, zeitraumBis, actorId, force } = params;

  // 1. Config pruefen
  const config = await getDatevConfig(supabase, organizationId);
  const { ok, fehlend } = isDatevConfigComplete(config);
  if (!ok) {
    throw new Error(`DATEV-Konfiguration unvollstaendig. Fehlend: ${fehlend.join(', ')}`);
  }

  // 2. Duplikat-Pruefung
  if (!force) {
    const { data: existing } = await supabase
      .from('datev_exports')
      .select('id, status')
      .eq('organization_id', organizationId)
      .eq('zeitraum_von', zeitraumVon)
      .eq('zeitraum_bis', zeitraumBis)
      .neq('status', 'fehler')
      .limit(1);

    if (existing?.length) {
      throw new Error(
        `Fuer den Zeitraum ${zeitraumVon} bis ${zeitraumBis} existiert bereits ein Export. ` +
        `Verwende force=true zum Ueberschreiben.`
      );
    }
  }

  // 3. Buchungssaetze generieren
  let result: BuchungssatzResult;
  try {
    result = await generateBuchungssaetze(supabase, {
      organizationId,
      zeitraumVon,
      zeitraumBis,
      kontenrahmen: config.kontenrahmen,
    });
  } catch (err) {
    // Export-Record mit Fehler erstellen
    await supabase.from('datev_exports').insert({
      organization_id: organizationId,
      zeitraum_von: zeitraumVon,
      zeitraum_bis: zeitraumBis,
      buchungen_anzahl: 0,
      status: 'fehler',
      beraternummer: config.beraternummer,
      mandantennummer: config.mandantennummer,
      kontenrahmen: config.kontenrahmen,
      fehler_details: err instanceof Error ? err.message : String(err),
      created_by: actorId,
    });
    throw err;
  }

  if (result.buchungen.length === 0) {
    throw new Error(`Keine Buchungsvorfaelle im Zeitraum ${zeitraumVon} bis ${zeitraumBis} gefunden.`);
  }

  // 4. DATEV-CSV generieren
  const wjBeginnYear = zeitraumVon.slice(0, 4);
  const wjBeginnMMDD = config.wjBeginn.replace('-', '');
  const headerParams: DatevHeaderParams = {
    beraternummer: config.beraternummer,
    mandantennummer: config.mandantennummer,
    wjBeginn: `${wjBeginnYear}${wjBeginnMMDD}`,
    sachkontenlaenge: config.sachkontenlaenge,
    datumVon: zeitraumVon.replace(/-/g, ''),
    datumBis: zeitraumBis.replace(/-/g, ''),
    erzeugerKuerzel: config.erzeugerKuerzel,
  };

  const csvContent = generateDatevCsv(headerParams, result.buchungen);

  // 5. Protokoll generieren
  const protokoll = generiereProtokoll(params, result, config);

  // 6. In Storage speichern
  const storagePath = `datev/${organizationId}/${zeitraumVon}_${zeitraumBis}.csv`;
  const csvBuffer = new TextEncoder().encode(csvContent);

  await supabase.storage
    .from('dta-dateien')
    .upload(storagePath, csvBuffer, {
      contentType: 'text/csv; charset=windows-1252',
      upsert: true,
    });

  // Protokoll auch speichern
  const protokollPath = `datev/${organizationId}/${zeitraumVon}_${zeitraumBis}_protokoll.txt`;
  const protokollBuffer = new TextEncoder().encode(protokoll);
  await supabase.storage
    .from('dta-dateien')
    .upload(protokollPath, protokollBuffer, {
      contentType: 'text/plain; charset=utf-8',
      upsert: true,
    });

  // 7. Export-Record in DB
  const { data: exportRecord, error: insertError } = await supabase
    .from('datev_exports')
    .insert({
      organization_id: organizationId,
      zeitraum_von: zeitraumVon,
      zeitraum_bis: zeitraumBis,
      buchungen_anzahl: result.buchungen.length,
      status: 'erstellt',
      datei_pfad: storagePath,
      beraternummer: config.beraternummer,
      mandantennummer: config.mandantennummer,
      kontenrahmen: config.kontenrahmen,
      created_by: actorId,
    })
    .select('id')
    .single();

  if (insertError || !exportRecord) {
    throw new Error(`Export-Datensatz konnte nicht erstellt werden: ${insertError?.message}`);
  }

  // 8. Audit-Trail
  await logBillingAction(supabase, {
    entityType: 'datev_export',
    organizationId,
    entityId: exportRecord.id,
    action: 'created',
    newState: {
      zeitraum_von: zeitraumVon,
      zeitraum_bis: zeitraumBis,
      buchungen_anzahl: result.buchungen.length,
      kontenrahmen: config.kontenrahmen,
    },
    actorId,
  });

  return {
    exportId: exportRecord.id,
    buchungenAnzahl: result.buchungen.length,
    csvContent,
    protokoll,
    statistik: result.statistik,
  };
}

// ---------------------------------------------------------------------------
// Export-Liste
// ---------------------------------------------------------------------------

/**
 * Holt die Liste aller DATEV-Exporte einer Organisation.
 */
export async function getDatevExportListe(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ExportListItem[]> {
  const { data, error } = await supabase
    .from('datev_exports')
    .select('id, zeitraum_von, zeitraum_bis, buchungen_anzahl, export_datum, status, beraternummer, mandantennummer, kontenrahmen, fehler_details')
    .eq('organization_id', organizationId)
    .order('export_datum', { ascending: false });

  if (error) throw new Error(`Export-Liste konnte nicht geladen werden: ${error.message}`);

  return (data || []).map((row: any) => ({
    id: row.id,
    zeitraumVon: row.zeitraum_von,
    zeitraumBis: row.zeitraum_bis,
    buchungenAnzahl: row.buchungen_anzahl,
    exportDatum: row.export_datum,
    status: row.status,
    beraternummer: row.beraternummer || '',
    mandantennummer: row.mandantennummer || '',
    kontenrahmen: row.kontenrahmen,
    fehlerDetails: row.fehler_details,
  }));
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * Laedt die Dateien eines Exports und gibt sie als CSV+Protokoll zurueck.
 */
export async function downloadDatevExport(
  supabase: SupabaseClient,
  organizationId: string,
  exportId: string,
): Promise<{ csv: Uint8Array; protokoll: Uint8Array; dateiname: string }> {
  const { data: exp } = await supabase
    .from('datev_exports')
    .select('id, datei_pfad, zeitraum_von, zeitraum_bis, status')
    .eq('id', exportId)
    .eq('organization_id', organizationId)
    .single();

  if (!exp) throw new Error('Export nicht gefunden.');

  if (!exp.datei_pfad) throw new Error('Export-Datei nicht vorhanden.');

  const { data: csvData, error: csvErr } = await supabase.storage
    .from('dta-dateien')
    .download(exp.datei_pfad);

  if (csvErr || !csvData) {
    throw new Error(`CSV-Datei konnte nicht geladen werden: ${csvErr?.message}`);
  }

  const protokollPath = exp.datei_pfad.replace('.csv', '_protokoll.txt');
  const { data: protoData } = await supabase.storage
    .from('dta-dateien')
    .download(protokollPath);

  const csvBytes = new Uint8Array(await csvData.arrayBuffer());
  const protoBytes = protoData
    ? new Uint8Array(await protoData.arrayBuffer())
    : new TextEncoder().encode('Kein Protokoll vorhanden.');

  // Status auf "heruntergeladen" setzen
  await supabase
    .from('datev_exports')
    .update({ status: 'heruntergeladen' })
    .eq('id', exportId)
    .eq('status', 'erstellt');

  return {
    csv: csvBytes,
    protokoll: protoBytes,
    dateiname: `DATEV_${exp.zeitraum_von}_${exp.zeitraum_bis}`,
  };
}

// ---------------------------------------------------------------------------
// Protokoll-Generator
// ---------------------------------------------------------------------------

function generiereProtokoll(
  params: ExportParams,
  result: BuchungssatzResult,
  config: { beraternummer: string; mandantennummer: string; kontenrahmen: string },
): string {
  const lines = [
    '═══════════════════════════════════════════════════════════',
    '  DATEV-Export Protokoll — Alltagsengel',
    '═══════════════════════════════════════════════════════════',
    '',
    `Exportdatum:       ${new Date().toLocaleString('de-DE')}`,
    `Zeitraum:          ${params.zeitraumVon} bis ${params.zeitraumBis}`,
    `Beraternummer:     ${config.beraternummer}`,
    `Mandantennummer:   ${config.mandantennummer}`,
    `Kontenrahmen:      ${config.kontenrahmen}`,
    '',
    '───────────────────────────────────────────────────────────',
    '  Statistik',
    '───────────────────────────────────────────────────────────',
    '',
    `Rechnungen:        ${result.statistik.rechnungen}`,
    `Zahlungen:         ${result.statistik.zahlungen}`,
    `Gutschriften:      ${result.statistik.gutschriften}`,
    `Mahngebuehren:     ${result.statistik.mahngebuehren}`,
    `Ruecklastschriften: ${result.statistik.ruecklastschriften}`,
    `─────────────────────────────`,
    `Gesamt:            ${result.statistik.gesamt} Buchungssaetze`,
    '',
    '───────────────────────────────────────────────────────────',
    '  Hinweise',
    '───────────────────────────────────────────────────────────',
    '',
    '- Datei-Encoding: Windows-1252 (ANSI)',
    '- Feldtrenner: Semikolon',
    '- Dezimaltrenner: Komma',
    '- Pflege-Erloese als steuerfrei (USt-Schluessel 0) gebucht',
    '- Debitorennummern: 10000-69999',
    '',
    '═══════════════════════════════════════════════════════════',
  ];

  return lines.join('\n');
}
