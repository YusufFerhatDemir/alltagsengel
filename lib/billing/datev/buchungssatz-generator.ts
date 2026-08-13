/**
 * Buchungssatz-Generator — Erzeugt DATEV-Buchungssaetze aus Billing-Daten
 *
 * Wandelt Rechnungen, Zahlungseingaenge, Gutschriften, Mahngebuehren
 * und Ruecklastschriften in DATEV-Buchungssaetze um.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { type DatevBuchungssatz, formatDatevDatum } from './datev-format';
import {
  getKonto,
  getOrCreateDebitorennummer,
  type Kontenrahmen,
} from './kontenrahmen';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuchungssatzParams {
  organizationId: string;
  zeitraumVon: string; // YYYY-MM-DD
  zeitraumBis: string; // YYYY-MM-DD
  kontenrahmen: Kontenrahmen;
}

export interface BuchungssatzResult {
  buchungen: DatevBuchungssatz[];
  statistik: {
    rechnungen: number;
    zahlungen: number;
    gutschriften: number;
    mahngebuehren: number;
    ruecklastschriften: number;
    gesamt: number;
  };
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

/**
 * Generiert alle DATEV-Buchungssaetze fuer den angegebenen Zeitraum.
 */
export async function generateBuchungssaetze(
  supabase: SupabaseClient,
  params: BuchungssatzParams,
): Promise<BuchungssatzResult> {
  const { organizationId, zeitraumVon, zeitraumBis, kontenrahmen } = params;

  const buchungen: DatevBuchungssatz[] = [];
  const statistik = {
    rechnungen: 0,
    zahlungen: 0,
    gutschriften: 0,
    mahngebuehren: 0,
    ruecklastschriften: 0,
    gesamt: 0,
  };

  // 1. Rechnungen (Ausgangsrechnungen)
  const rechnungsBuchungen = await generiereRechnungsBuchungen(
    supabase, organizationId, zeitraumVon, zeitraumBis, kontenrahmen,
  );
  buchungen.push(...rechnungsBuchungen);
  statistik.rechnungen = rechnungsBuchungen.length;

  // 2. Zahlungseingaenge
  const zahlungsBuchungen = await generiereZahlungsBuchungen(
    supabase, organizationId, zeitraumVon, zeitraumBis, kontenrahmen,
  );
  buchungen.push(...zahlungsBuchungen);
  statistik.zahlungen = zahlungsBuchungen.length;

  // 3. Gutschriften / Stornos
  const gutschriftBuchungen = await generiereGutschriftBuchungen(
    supabase, organizationId, zeitraumVon, zeitraumBis, kontenrahmen,
  );
  buchungen.push(...gutschriftBuchungen);
  statistik.gutschriften = gutschriftBuchungen.length;

  // 4. Mahngebuehren
  const mahnBuchungen = await generiereMahngebuerenBuchungen(
    supabase, organizationId, zeitraumVon, zeitraumBis, kontenrahmen,
  );
  buchungen.push(...mahnBuchungen);
  statistik.mahngebuehren = mahnBuchungen.length;

  // 5. Ruecklastschriften
  const rlBuchungen = await generiereRuecklastschriftBuchungen(
    supabase, organizationId, zeitraumVon, zeitraumBis, kontenrahmen,
  );
  buchungen.push(...rlBuchungen);
  statistik.ruecklastschriften = rlBuchungen.length;

  statistik.gesamt = buchungen.length;

  return { buchungen, statistik };
}

// ---------------------------------------------------------------------------
// 1. Rechnungsbuchungen: Forderung an Erloese
// ---------------------------------------------------------------------------

async function generiereRechnungsBuchungen(
  supabase: SupabaseClient,
  orgId: string,
  von: string,
  bis: string,
  rahmen: Kontenrahmen,
): Promise<DatevBuchungssatz[]> {
  // LIVE-SCHEMA: invoices hat KEINE Spalte `is_credit_note`. Gutschriften und
  // Stornos stehen in `correction_type`. Select und Filter darauf ließen die
  // Abfrage mit 42703 scheitern — der DATEV-Export lieferte dann stillschweigend
  // NULL Rechnungsbuchungen, sah also aus wie „nichts zu exportieren".
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_number_formatted, total_amount, created_at, client_id, client:clients(first_name, last_name), correction_type')
    .eq('organization_id', orgId)
    .gte('created_at', `${von}T00:00:00`)
    .lte('created_at', `${bis}T23:59:59`)
    .is('deleted_at', null)
    // Gutschriften/Stornos laufen über generiereGutschriftBuchungen.
    .or('correction_type.is.null,correction_type.eq.rechnung')
    .not('status', 'eq', 'entwurf');

  // FAIL-CLOSED: ein Lesefehler darf nicht als „keine Rechnungen" durchgehen,
  // sonst entsteht ein unvollständiger Export, der wie ein vollständiger aussieht.
  if (error) throw new Error(`Rechnungen für DATEV nicht lesbar: ${error.message}`);
  if (!invoices?.length) return [];

  const buchungen: DatevBuchungssatz[] = [];
  const erloesKonto = getKonto(rahmen, 'erloesePflege');

  for (const inv of invoices) {
    const betrag = Number(inv.total_amount || 0);
    if (betrag <= 0) continue;

    const debitorNr = await getOrCreateDebitorennummer(supabase, orgId, inv.client_id);
    const reDatum = inv.created_at?.slice(0, 10) || von;
    const reNummer = inv.invoice_number_formatted || inv.invoice_number || inv.id.slice(0, 8);

    const rawClient = inv.client as unknown;
    const client = Array.isArray(rawClient) ? rawClient[0] : rawClient;
    const clientName = client && typeof client === 'object' && 'last_name' in client
      ? `${(client as any).last_name || ''}`
      : '';

    // Forderung (Debitor) an Erloes
    buchungen.push({
      umsatz: betrag,
      sollHaben: 'S',
      konto: debitorNr,
      gegenkonto: erloesKonto.konto,
      belegdatum: formatDatevDatum(reDatum),
      belegnummer: reNummer,
      buchungstext: `Rechnung ${reNummer} ${clientName}`.trim().substring(0, 60),
      ustSchluessel: 0, // Pflege = steuerfrei
    });
  }

  return buchungen;
}

// ---------------------------------------------------------------------------
// 2. Zahlungsbuchungen: Bank an Forderung (Debitor)
// ---------------------------------------------------------------------------

async function generiereZahlungsBuchungen(
  supabase: SupabaseClient,
  orgId: string,
  von: string,
  bis: string,
  rahmen: Kontenrahmen,
): Promise<DatevBuchungssatz[]> {
  // Zahlungszuordnungen im Zeitraum
  const { data: allocations } = await supabase
    .from('payment_allocations')
    .select(`
      id, amount_cents, created_at,
      payment:payments(payment_date),
      invoice:invoices(id, invoice_number, invoice_number_formatted, client_id, client:clients(last_name))
    `)
    .eq('organization_id', orgId)
    .gte('created_at', `${von}T00:00:00`)
    .lte('created_at', `${bis}T23:59:59`);

  if (!allocations?.length) return [];

  const bankKonto = getKonto(rahmen, 'bank');
  const buchungen: DatevBuchungssatz[] = [];

  for (const alloc of allocations) {
    const betragEur = (alloc.amount_cents || 0) / 100;
    if (betragEur <= 0) continue;

    const inv = Array.isArray(alloc.invoice) ? alloc.invoice[0] : alloc.invoice;
    if (!inv) continue;

    const debitorNr = await getOrCreateDebitorennummer(supabase, orgId, inv.client_id);
    const reNummer = inv.invoice_number_formatted || inv.invoice_number || '';

    const paymentRaw = Array.isArray(alloc.payment) ? alloc.payment[0] : alloc.payment;
    const zahlDatum = (paymentRaw as any)?.payment_date || alloc.created_at?.slice(0, 10) || von;

    const rawClient = (inv as any).client;
    const client = Array.isArray(rawClient) ? rawClient[0] : rawClient;
    const clientName = client && typeof client === 'object' && 'last_name' in client
      ? (client as any).last_name || ''
      : '';

    // Bank an Debitor
    buchungen.push({
      umsatz: betragEur,
      sollHaben: 'S',
      konto: bankKonto.konto,
      gegenkonto: debitorNr,
      belegdatum: formatDatevDatum(zahlDatum),
      belegnummer: reNummer,
      buchungstext: `Zahlung ${reNummer} ${clientName}`.trim().substring(0, 60),
    });
  }

  return buchungen;
}

// ---------------------------------------------------------------------------
// 3. Gutschriften/Stornos: Erloes an Forderung (Debitor)
// ---------------------------------------------------------------------------

async function generiereGutschriftBuchungen(
  supabase: SupabaseClient,
  orgId: string,
  von: string,
  bis: string,
  rahmen: Kontenrahmen,
): Promise<DatevBuchungssatz[]> {
  // LIVE-SCHEMA: kein `is_credit_note` — der Belegtyp steht in correction_type
  // (siehe DOCUMENT_KINDS in app/api/admin/invoices/[id]/generate-pdf).
  const { data: credits, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_number_formatted, total_amount, created_at, client_id, client:clients(last_name)')
    .eq('organization_id', orgId)
    .in('correction_type', ['gutschrift', 'storno', 'teilstorno'])
    .gte('created_at', `${von}T00:00:00`)
    .lte('created_at', `${bis}T23:59:59`)
    .is('deleted_at', null);

  if (error) throw new Error(`Gutschriften für DATEV nicht lesbar: ${error.message}`);
  if (!credits?.length) return [];

  const erloesKonto = getKonto(rahmen, 'erloesePflege');
  const buchungen: DatevBuchungssatz[] = [];

  for (const cr of credits) {
    const betrag = Math.abs(Number(cr.total_amount || 0));
    if (betrag <= 0) continue;

    const debitorNr = await getOrCreateDebitorennummer(supabase, orgId, cr.client_id);
    const datum = cr.created_at?.slice(0, 10) || von;
    const nummer = cr.invoice_number_formatted || cr.invoice_number || '';

    const rawClient = cr.client as unknown;
    const client = Array.isArray(rawClient) ? rawClient[0] : rawClient;
    const clientName = client && typeof client === 'object' && 'last_name' in client
      ? (client as any).last_name || ''
      : '';

    // Erloes (S) an Debitor (H) — Storno
    buchungen.push({
      umsatz: betrag,
      sollHaben: 'S',
      konto: erloesKonto.konto,
      gegenkonto: debitorNr,
      belegdatum: formatDatevDatum(datum),
      belegnummer: nummer,
      buchungstext: `Gutschrift ${nummer} ${clientName}`.trim().substring(0, 60),
      ustSchluessel: 0,
      storno: true,
    });
  }

  return buchungen;
}

// ---------------------------------------------------------------------------
// 4. Mahngebuehren: Forderung (Debitor) an Mahnerloese
// ---------------------------------------------------------------------------

async function generiereMahngebuerenBuchungen(
  supabase: SupabaseClient,
  orgId: string,
  von: string,
  bis: string,
  rahmen: Kontenrahmen,
): Promise<DatevBuchungssatz[]> {
  // LIVE-SCHEMA: die Spalte heißt dunning_fee_cents, nicht gebuehr_cents.
  const { data: entries, error } = await supabase
    .from('dunning_entries')
    .select(`
      id, dunning_fee_cents, created_at, dunning_level,
      invoice:invoices(id, invoice_number_formatted, client_id, client:clients(last_name))
    `)
    .eq('organization_id', orgId)
    .gte('created_at', `${von}T00:00:00`)
    .lte('created_at', `${bis}T23:59:59`)
    .gt('dunning_fee_cents', 0);

  if (error) throw new Error(`Mahngebühren für DATEV nicht lesbar: ${error.message}`);
  if (!entries?.length) return [];

  const mahnKonto = getKonto(rahmen, 'mahngebuehren');
  const buchungen: DatevBuchungssatz[] = [];

  for (const entry of entries) {
    const betragEur = (entry.dunning_fee_cents || 0) / 100;
    if (betragEur <= 0) continue;

    const inv = Array.isArray(entry.invoice) ? entry.invoice[0] : entry.invoice;
    if (!inv) continue;

    const debitorNr = await getOrCreateDebitorennummer(supabase, orgId, inv.client_id);
    const datum = entry.created_at?.slice(0, 10) || von;
    const reNummer = inv.invoice_number_formatted || '';

    const rawClient = (inv as any).client;
    const client = Array.isArray(rawClient) ? rawClient[0] : rawClient;
    const clientName = client && typeof client === 'object' && 'last_name' in client
      ? (client as any).last_name || ''
      : '';

    // Debitor (S) an Mahnerloese (H)
    buchungen.push({
      umsatz: betragEur,
      sollHaben: 'S',
      konto: debitorNr,
      gegenkonto: mahnKonto.konto,
      belegdatum: formatDatevDatum(datum),
      belegnummer: reNummer || `MAHN-${entry.id.slice(0, 8)}`,
      buchungstext: `Mahngebuehr ${entry.dunning_level || ''} ${clientName}`.trim().substring(0, 60),
    });
  }

  return buchungen;
}

// ---------------------------------------------------------------------------
// 5. Ruecklastschriften: Debitor (S) / Bank (H) + Gebuehr: Aufwand (S) / Bank (H)
// ---------------------------------------------------------------------------

async function generiereRuecklastschriftBuchungen(
  supabase: SupabaseClient,
  orgId: string,
  von: string,
  bis: string,
  rahmen: Kontenrahmen,
): Promise<DatevBuchungssatz[]> {
  // Zahlungseingaenge mit ist_ruecklastschrift = true
  const { data: ruecklastschriften } = await supabase
    .from('zahlungseingaenge')
    .select(`
      id, betrag_cent, buchungsdatum, debitor_name, verwendungszweck,
      payment:payments(id, amount_cents,
        allocations:payment_allocations(invoice:invoices(id, client_id, invoice_number_formatted))
      )
    `)
    .eq('organization_id', orgId)
    .eq('ist_ruecklastschrift', true)
    .gte('buchungsdatum', von)
    .lte('buchungsdatum', bis);

  if (!ruecklastschriften?.length) return [];

  const bankKonto = getKonto(rahmen, 'bank');
  const gebuehrKonto = getKonto(rahmen, 'nebenkostenGeldverkehr');
  const buchungen: DatevBuchungssatz[] = [];

  for (const rl of ruecklastschriften) {
    const betragEur = Math.abs((rl.betrag_cent || 0) / 100);
    if (betragEur <= 0) continue;

    const datum = rl.buchungsdatum || von;

    // Versuche Debitorennummer aus zugehöriger Rechnung zu ermitteln
    let debitorNr = '';
    let reNummer = '';
    const paymentRaw = Array.isArray(rl.payment) ? rl.payment[0] : rl.payment;
    if (paymentRaw) {
      const allocRaw = (paymentRaw as any).allocations;
      const allocs = Array.isArray(allocRaw) ? allocRaw : [];
      if (allocs.length > 0) {
        const invRaw = allocs[0].invoice;
        const inv = Array.isArray(invRaw) ? invRaw[0] : invRaw;
        if (inv?.client_id) {
          debitorNr = await getOrCreateDebitorennummer(supabase, orgId, inv.client_id);
          reNummer = inv.invoice_number_formatted || '';
        }
      }
    }

    // Falls kein Debitor gefunden, Forderungskonto verwenden
    const forderungsKonto = debitorNr || getKonto(rahmen, 'forderungen').konto;

    // Buchung 1: Zahlung stornieren — Debitor (S) an Bank (H)
    buchungen.push({
      umsatz: betragEur,
      sollHaben: 'S',
      konto: forderungsKonto,
      gegenkonto: bankKonto.konto,
      belegdatum: formatDatevDatum(datum),
      belegnummer: reNummer || `RL-${rl.id.slice(0, 8)}`,
      buchungstext: `Ruecklastschrift ${rl.debitor_name || ''}`.trim().substring(0, 60),
    });

    // Buchung 2: Gebuehr (pauschal 5 EUR, kann angepasst werden)
    const gebuehr = 5.00;
    buchungen.push({
      umsatz: gebuehr,
      sollHaben: 'S',
      konto: gebuehrKonto.konto,
      gegenkonto: bankKonto.konto,
      belegdatum: formatDatevDatum(datum),
      belegnummer: reNummer || `RL-${rl.id.slice(0, 8)}`,
      buchungstext: `RL-Gebuehr ${rl.debitor_name || ''}`.trim().substring(0, 60),
    });
  }

  return buchungen;
}
