/**
 * OPOS Manager — Offene-Posten-Verwaltung
 *
 * Generiert die OPOS-Liste (alle offenen/teilbezahlten Rechnungen),
 * berechnet Salden, verwaltet Zahlungsstatus und Guthaben,
 * und liefert eine Altersstruktur-Analyse.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OffenerPosten {
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  rechnungsdatum: string;
  faelligkeitsdatum: string | null;
  sollCent: number;
  bezahltCent: number;
  offenCent: number;
  status: string;
  dunningLevel: string;
  alterTage: number;
  altersKlasse: '0-30' | '30-60' | '60-90' | '90+';
}

export interface KlientSaldo {
  clientId: string;
  clientName: string;
  offenGesamt: number;
  rechnungenOffen: number;
  aeltesteFaelligkeit: string | null;
  guthabenCent: number;
}

export interface Altersstruktur {
  /** 0-30 Tage */
  klasse0_30: { anzahl: number; summe: number };
  /** 30-60 Tage */
  klasse30_60: { anzahl: number; summe: number };
  /** 60-90 Tage */
  klasse60_90: { anzahl: number; summe: number };
  /** 90+ Tage */
  klasse90plus: { anzahl: number; summe: number };
}

export interface OposUebersicht {
  offenePosten: OffenerPosten[];
  altersstruktur: Altersstruktur;
  gesamtOffen: number;
  gesamtAnzahl: number;
}

export interface OposFilter {
  status?: 'offen' | 'teilweise_bezahlt' | 'alle';
  clientId?: string;
  minAlterTage?: number;
  maxAlterTage?: number;
  dunningLevel?: string;
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function altersKlasse(tage: number): '0-30' | '30-60' | '60-90' | '90+' {
  if (tage < 30) return '0-30';
  if (tage < 60) return '30-60';
  if (tage < 90) return '60-90';
  return '90+';
}

function tageZwischen(d1: string | Date, d2: string | Date): number {
  const a = new Date(d1);
  const b = new Date(d2);
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// OPOS-Liste
// ---------------------------------------------------------------------------

/**
 * Generiert die Offene-Posten-Liste fuer eine Organisation.
 */
export async function getOposListe(
  supabase: SupabaseClient,
  organizationId: string,
  filter: OposFilter = {},
): Promise<OposUebersicht> {
  let query = supabase
    .from('invoices')
    .select('id, invoice_number, invoice_number_formatted, total_amount, paid_amount, status, dunning_level, created_at, due_date, client_id, client:clients(first_name, last_name)')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .not('status', 'in', '("storniert","akzeptiert")');

  if (filter.clientId) {
    query = query.eq('client_id', filter.clientId);
  }

  if (filter.dunningLevel) {
    query = query.eq('dunning_level', filter.dunningLevel);
  }

  const { data: invoices, error } = await query;

  if (error) throw new Error(`OPOS-Abfrage fehlgeschlagen: ${error.message}`);

  const heute = new Date().toISOString().slice(0, 10);
  const offenePosten: OffenerPosten[] = [];

  for (const inv of invoices || []) {
    const sollCent = Math.round(Number(inv.total_amount || 0) * 100);
    const bezahltCent = Math.round(Number(inv.paid_amount || 0) * 100);
    const offenCent = sollCent - bezahltCent;

    if (offenCent <= 0) continue;

    const faelligkeitsdatum = inv.due_date || null;
    const rechnungsdatum = inv.created_at?.slice(0, 10) ?? heute;
    const bezugsdatum = faelligkeitsdatum || rechnungsdatum;
    const alterTage = Math.max(0, tageZwischen(bezugsdatum, heute));

    // Filter: Status
    if (filter.status === 'offen' && bezahltCent > 0) continue;
    if (filter.status === 'teilweise_bezahlt' && bezahltCent === 0) continue;

    // Filter: Alter
    if (filter.minAlterTage !== undefined && alterTage < filter.minAlterTage) continue;
    if (filter.maxAlterTage !== undefined && alterTage > filter.maxAlterTage) continue;

    const rawClient = inv.client as unknown;
    const client = Array.isArray(rawClient) ? rawClient[0] : rawClient;
    const clientName = client && typeof client === 'object' && 'first_name' in client
      ? `${(client as any).first_name || ''} ${(client as any).last_name || ''}`.trim()
      : '—';

    offenePosten.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number_formatted || inv.invoice_number,
      clientId: inv.client_id,
      clientName,
      rechnungsdatum,
      faelligkeitsdatum,
      sollCent,
      bezahltCent,
      offenCent,
      status: bezahltCent > 0 ? 'teilweise_bezahlt' : 'offen',
      dunningLevel: inv.dunning_level || 'offen',
      alterTage,
      altersKlasse: altersKlasse(alterTage),
    });
  }

  // Sortierung: aelteste zuerst
  offenePosten.sort((a, b) => b.alterTage - a.alterTage);

  // Altersstruktur berechnen
  const altersstruktur: Altersstruktur = {
    klasse0_30: { anzahl: 0, summe: 0 },
    klasse30_60: { anzahl: 0, summe: 0 },
    klasse60_90: { anzahl: 0, summe: 0 },
    klasse90plus: { anzahl: 0, summe: 0 },
  };

  for (const op of offenePosten) {
    const key = op.altersKlasse === '0-30' ? 'klasse0_30'
      : op.altersKlasse === '30-60' ? 'klasse30_60'
      : op.altersKlasse === '60-90' ? 'klasse60_90'
      : 'klasse90plus';
    altersstruktur[key].anzahl++;
    altersstruktur[key].summe += op.offenCent;
  }

  return {
    offenePosten,
    altersstruktur,
    gesamtOffen: offenePosten.reduce((s, p) => s + p.offenCent, 0),
    gesamtAnzahl: offenePosten.length,
  };
}

/**
 * Berechnet den Saldo pro Klient.
 */
export async function getKlientSalden(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<KlientSaldo[]> {
  const { offenePosten } = await getOposListe(supabase, organizationId);

  const byClient = new Map<string, KlientSaldo>();

  for (const op of offenePosten) {
    let saldo = byClient.get(op.clientId);
    if (!saldo) {
      saldo = {
        clientId: op.clientId,
        clientName: op.clientName,
        offenGesamt: 0,
        rechnungenOffen: 0,
        aeltesteFaelligkeit: null,
        guthabenCent: 0,
      };
      byClient.set(op.clientId, saldo);
    }

    saldo.offenGesamt += op.offenCent;
    saldo.rechnungenOffen++;

    if (op.faelligkeitsdatum) {
      if (!saldo.aeltesteFaelligkeit || op.faelligkeitsdatum < saldo.aeltesteFaelligkeit) {
        saldo.aeltesteFaelligkeit = op.faelligkeitsdatum;
      }
    }
  }

  return [...byClient.values()].sort((a, b) => b.offenGesamt - a.offenGesamt);
}
