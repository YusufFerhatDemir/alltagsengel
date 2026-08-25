/**
 * DATEV Kontenrahmen — SKR03/SKR04 Kontenzuordnung
 *
 * Standard-Kontenrahmen fuer die Pflegebranche.
 * Pflege-Erlöse § 45a sind i.d.R. umsatzsteuerfrei (§ 4 Nr. 16 UStG).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Kontenrahmen-Definitionen
// ---------------------------------------------------------------------------

export type Kontenrahmen = 'SKR03' | 'SKR04';

export interface KontoDefinition {
  konto: string;
  bezeichnung: string;
}

/**
 * SKR03 — Standard-Kontenrahmen fuer Pflegedienste
 */
const SKR03 = {
  // Erlöskonten
  erloesePflege:          { konto: '8120', bezeichnung: 'Steuerfreie Erloese Pflege' },
  erloese19:              { konto: '8400', bezeichnung: 'Erloese 19% USt' },
  sonstigeErloese:        { konto: '8100', bezeichnung: 'Sonstige Erloese' },
  mahngebuehren:          { konto: '8610', bezeichnung: 'Mahngebuehren-Erloese' },
  // Aktivkonten
  bank:                   { konto: '1200', bezeichnung: 'Bank' },
  forderungen:            { konto: '1400', bezeichnung: 'Forderungen aus LuL' },
  // Aufwandskonten
  nebenkostenGeldverkehr: { konto: '4970', bezeichnung: 'Nebenkosten Geldverkehr' },
} as const;

/**
 * SKR04 — Alternativer Kontenrahmen
 */
const SKR04 = {
  erloesePflege:          { konto: '4120', bezeichnung: 'Steuerfreie Erloese Pflege' },
  erloese19:              { konto: '4400', bezeichnung: 'Erloese 19% USt' },
  sonstigeErloese:        { konto: '4100', bezeichnung: 'Sonstige Erloese' },
  mahngebuehren:          { konto: '4610', bezeichnung: 'Mahngebuehren-Erloese' },
  bank:                   { konto: '1800', bezeichnung: 'Bank' },
  forderungen:            { konto: '1200', bezeichnung: 'Forderungen aus LuL' },
  nebenkostenGeldverkehr: { konto: '6855', bezeichnung: 'Nebenkosten Geldverkehr' },
} as const;

export type KontoSchluessel = keyof typeof SKR03;

const KONTENRAHMEN: Record<Kontenrahmen, Record<KontoSchluessel, KontoDefinition>> = {
  SKR03,
  SKR04,
};

/** Debitorennummern-Bereich: 10000–69999 */
const DEBITOR_MIN = 10000;
const DEBITOR_MAX = 69999;

export function getKonto(rahmen: Kontenrahmen, schluessel: KontoSchluessel): KontoDefinition {
  // getDatevConfig() liest den Kontenrahmen aus einer JSONB-Spalte und
  // castet ihn nur (`stored.kontenrahmen as Kontenrahmen`). Steht dort ein
  // anderer Wert — die Spalte ist per SQL beschreibbar —, ergab
  // `KONTENRAHMEN[rahmen][schluessel]` einen TypeError
  // („Cannot read properties of undefined"), der tief im Buchungssatz-
  // Generator auftaucht und nichts darueber sagt, was falsch ist.
  const konten = KONTENRAHMEN[rahmen];
  if (!konten) {
    throw new Error(
      `Unbekannter Kontenrahmen "${rahmen}". Erlaubt: ${Object.keys(KONTENRAHMEN).join(', ')}.`
    );
  }
  const konto = konten[schluessel];
  if (!konto) {
    throw new Error(`Konto "${schluessel}" ist im Kontenrahmen ${rahmen} nicht hinterlegt.`);
  }
  return konto;
}

/**
 * Alle Sachkonten eines Kontenrahmens.
 *
 * Der DATEV-Validator braucht diese Liste, um ein Konto in der fertigen
 * Datei als „gehoert hierher" oder „unbekannt" einzustufen. Sie wird
 * bewusst AUS der Kontenrahmen-Definition abgeleitet und nicht daneben
 * gepflegt — eine zweite Liste waere nach dem ersten neuen Konto falsch,
 * und der Validator wuerde eine korrekte Buchung als Fehler melden.
 */
export function alleSachkonten(rahmen: Kontenrahmen): string[] {
  const konten = KONTENRAHMEN[rahmen];
  if (!konten) {
    throw new Error(
      `Unbekannter Kontenrahmen "${rahmen}". Erlaubt: ${Object.keys(KONTENRAHMEN).join(', ')}.`
    );
  }
  return Object.values(konten).map(k => k.konto);
}

/**
 * Prueft eine von Hand vergebene Debitorennummer.
 *
 * Dieselbe Regel, nach der getOrCreateDebitorennummer() automatisch
 * vergibt: ganzzahlig im Bereich DEBITOR_MIN…DEBITOR_MAX. Die
 * Kontenzuordnungs-Route pruefte bisher nur auf „nicht leer" und liess
 * damit jede Zeichenkette in eine Spalte, die spaeter unveraendert als
 * Kontonummer in den Buchungsstapel geschrieben wird.
 */
export function pruefeDebitorennummer(wert: string): { ok: true } | { ok: false; fehler: string } {
  const roh = String(wert ?? '').trim();
  if (!/^\d+$/.test(roh)) {
    return { ok: false, fehler: 'Debitorennummer muss ausschliesslich aus Ziffern bestehen.' };
  }
  const zahl = Number(roh);
  if (zahl < DEBITOR_MIN || zahl > DEBITOR_MAX) {
    return {
      ok: false,
      fehler: `Debitorennummer muss zwischen ${DEBITOR_MIN} und ${DEBITOR_MAX} liegen.`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// USt-Schluessel
// ---------------------------------------------------------------------------

/** 0 = steuerfrei, 3 = 19% USt */
export type UStSchluessel = 0 | 3;

export function getUStSchluessel(steuerfrei: boolean): UStSchluessel {
  return steuerfrei ? 0 : 3;
}

// ---------------------------------------------------------------------------
// Debitorennummer-Verwaltung
// ---------------------------------------------------------------------------

/**
 * Holt oder erstellt eine Debitorennummer fuer einen Klienten.
 */
export async function getOrCreateDebitorennummer(
  supabase: SupabaseClient,
  organizationId: string,
  clientId: string,
): Promise<string> {
  // Bestehende Zuordnung pruefen
  const { data: existing } = await supabase
    .from('datev_kontenzuordnung')
    .select('debitorennummer')
    .eq('organization_id', organizationId)
    .eq('client_id', clientId)
    .single();

  if (existing) return existing.debitorennummer;

  // Hoechste vergebene Nummer finden
  const { data: maxRow } = await supabase
    .from('datev_kontenzuordnung')
    .select('debitorennummer')
    .eq('organization_id', organizationId)
    .order('debitorennummer', { ascending: false })
    .limit(1)
    .single();

  let nextNum = DEBITOR_MIN;
  if (maxRow) {
    const parsed = parseInt(maxRow.debitorennummer, 10);
    if (!isNaN(parsed) && parsed >= DEBITOR_MIN) {
      nextNum = parsed + 1;
    }
  }

  if (nextNum > DEBITOR_MAX) {
    throw new Error(`Debitorennummern-Bereich erschoepft (max ${DEBITOR_MAX}).`);
  }

  const debitorennummer = String(nextNum);

  const { error } = await supabase
    .from('datev_kontenzuordnung')
    .insert({
      organization_id: organizationId,
      client_id: clientId,
      debitorennummer,
    });

  if (error) {
    // UNIQUE-Verletzung bei konkurrierendem Zugriff → erneut lesen
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('datev_kontenzuordnung')
        .select('debitorennummer')
        .eq('organization_id', organizationId)
        .eq('client_id', clientId)
        .single();
      if (retry) return retry.debitorennummer;
    }
    throw new Error(`Debitorennummer konnte nicht erstellt werden: ${error.message}`);
  }

  return debitorennummer;
}

/**
 * Holt alle Kontenzuordnungen einer Organisation.
 */
export async function getKontenzuordnungen(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<{ clientId: string; clientName: string; debitorennummer: string }[]> {
  const { data, error } = await supabase
    .from('datev_kontenzuordnung')
    .select('client_id, debitorennummer, client:clients(first_name, last_name)')
    .eq('organization_id', organizationId)
    .order('debitorennummer', { ascending: true });

  if (error) throw new Error(`Kontenzuordnungen konnten nicht geladen werden: ${error.message}`);

  return (data || []).map((row: any) => {
    const c = Array.isArray(row.client) ? row.client[0] : row.client;
    return {
      clientId: row.client_id,
      clientName: c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : '—',
      debitorennummer: row.debitorennummer,
    };
  });
}

/**
 * Erstellt oder aktualisiert eine manuelle Kontenzuordnung.
 */
export async function upsertKontenzuordnung(
  supabase: SupabaseClient,
  organizationId: string,
  clientId: string,
  debitorennummer: string,
): Promise<void> {
  const pruefung = pruefeDebitorennummer(debitorennummer);
  if (!pruefung.ok) throw new Error(pruefung.fehler);

  const { error } = await supabase
    .from('datev_kontenzuordnung')
    .upsert(
      { organization_id: organizationId, client_id: clientId, debitorennummer },
      { onConflict: 'organization_id,client_id' },
    );

  if (error) throw new Error(`Kontenzuordnung konnte nicht gespeichert werden: ${error.message}`);
}
