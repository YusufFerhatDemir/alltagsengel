/**
 * DATEV-Konfiguration — Organisations-spezifische Einstellungen
 *
 * Beraternummer, Mandantennummer, Kontenrahmen etc.
 * Gespeichert als JSONB im organizations-Record (Spalte datev_config).
 * Falls die Spalte nicht existiert, werden Defaults zurueckgegeben.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Kontenrahmen } from './kontenrahmen';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DatevConfig {
  /** Beraternummer (vom Steuerberater) */
  beraternummer: string;
  /** Mandantennummer (vom Steuerberater) */
  mandantennummer: string;
  /** Kontenrahmen: SKR03 oder SKR04 */
  kontenrahmen: Kontenrahmen;
  /** Wirtschaftsjahr-Beginn, Format MM-DD (z.B. "01-01") */
  wjBeginn: string;
  /** Sachkontenlänge: 4 oder 5 */
  sachkontenlaenge: number;
  /** Naechste freie Debitorennummer */
  naechsteDebitorennummer: number;
  /** Kürzel des Erzeugers in DATEV-Header */
  erzeugerKuerzel: string;
}

const DEFAULT_CONFIG: DatevConfig = {
  beraternummer: '',
  mandantennummer: '',
  kontenrahmen: 'SKR03',
  wjBeginn: '01-01',
  sachkontenlaenge: 4,
  naechsteDebitorennummer: 10000,
  erzeugerKuerzel: 'AE',
};

// ---------------------------------------------------------------------------
// Laden / Speichern
// ---------------------------------------------------------------------------

/**
 * Laedt die DATEV-Konfiguration einer Organisation.
 * Falls noch nichts konfiguriert ist, werden Defaults zurueckgegeben.
 */
export async function getDatevConfig(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<DatevConfig> {
  const { data } = await supabase
    .from('organizations')
    .select('datev_config')
    .eq('id', organizationId)
    .single();

  if (!data?.datev_config) return { ...DEFAULT_CONFIG };

  const stored = data.datev_config as Partial<DatevConfig>;
  return {
    beraternummer: stored.beraternummer || DEFAULT_CONFIG.beraternummer,
    mandantennummer: stored.mandantennummer || DEFAULT_CONFIG.mandantennummer,
    kontenrahmen: (stored.kontenrahmen as Kontenrahmen) || DEFAULT_CONFIG.kontenrahmen,
    wjBeginn: stored.wjBeginn || DEFAULT_CONFIG.wjBeginn,
    sachkontenlaenge: stored.sachkontenlaenge || DEFAULT_CONFIG.sachkontenlaenge,
    naechsteDebitorennummer: stored.naechsteDebitorennummer || DEFAULT_CONFIG.naechsteDebitorennummer,
    erzeugerKuerzel: stored.erzeugerKuerzel || DEFAULT_CONFIG.erzeugerKuerzel,
  };
}

/**
 * Speichert die DATEV-Konfiguration einer Organisation.
 */
export async function saveDatevConfig(
  supabase: SupabaseClient,
  organizationId: string,
  config: Partial<DatevConfig>,
): Promise<void> {
  // Bestehende Config mergen
  const current = await getDatevConfig(supabase, organizationId);
  const merged: DatevConfig = { ...current, ...config };

  // Validierungen
  if (merged.sachkontenlaenge !== 4 && merged.sachkontenlaenge !== 5) {
    throw new Error('Sachkontenlaenge muss 4 oder 5 sein.');
  }
  if (merged.kontenrahmen !== 'SKR03' && merged.kontenrahmen !== 'SKR04') {
    throw new Error('Kontenrahmen muss SKR03 oder SKR04 sein.');
  }

  const { error } = await supabase
    .from('organizations')
    .update({ datev_config: merged as unknown as Record<string, unknown> })
    .eq('id', organizationId);

  if (error) {
    throw new Error(`DATEV-Konfiguration konnte nicht gespeichert werden: ${error.message}`);
  }
}

/**
 * Prueft ob die DATEV-Konfiguration vollstaendig ist (Pflichtfelder gesetzt).
 */
export function isDatevConfigComplete(config: DatevConfig): { ok: boolean; fehlend: string[] } {
  const fehlend: string[] = [];
  if (!config.beraternummer) fehlend.push('Beraternummer');
  if (!config.mandantennummer) fehlend.push('Mandantennummer');
  return { ok: fehlend.length === 0, fehlend };
}
