/**
 * Audit-Tests F1-F8: Billing-Sicherheit und Korrektheit
 *
 * F1: Org-Fence auf invoices/invoice_items (RLS + Engine Defense-in-Depth)
 * F2: Admin-UI Status-Updates (Statusmaschine serverseitig)
 * F3: correctInvoice() insert-Fehler-Behandlung
 * F4: monatsabschluss.ts kein service_records.amount Fallback
 * F5: Rollback-Dateien existieren
 * F6: freezeInvoice einzelpreis_cent != gesamtpreis_cent
 * F7: tariff_version Analyse
 * F8: generateInvoiceNumberFallback Race-Condition
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

// ---------------------------------------------------------------------------
// F1: Org-Fence Migration + Engine Defense-in-Depth
// ---------------------------------------------------------------------------

describe('F1: Org-Fence auf invoices und invoice_items', () => {
  it('Migration 20260819020000 existiert', () => {
    expect(existsSync(
      path.join(REPO_ROOT, 'supabase/migrations/20260819020000_billing_org_fence_haertung.sql')
    )).toBe(true);
  });

  it('Migration erstellt RESTRICTIVE org_fence auf invoices', () => {
    const sql = read('supabase/migrations/20260819020000_billing_org_fence_haertung.sql');
    expect(sql).toMatch(/CREATE POLICY.*invoices_org_fence.*ON public\.invoices/);
    expect(sql).toMatch(/AS RESTRICTIVE/);
    expect(sql).toMatch(/organization_id\s*=\s*public\.current_org_id\(\)/);
  });

  it('Migration erstellt RESTRICTIVE org_fence auf invoice_items', () => {
    const sql = read('supabase/migrations/20260819020000_billing_org_fence_haertung.sql');
    expect(sql).toMatch(/CREATE POLICY.*invoice_items_org_fence.*ON public\.invoice_items/);
    expect(sql).toMatch(/AS RESTRICTIVE.*FOR ALL/);
  });

  it('Migration sperrt anon-Zugriff auf invoices', () => {
    const sql = read('supabase/migrations/20260819020000_billing_org_fence_haertung.sql');
    expect(sql).toMatch(/invoices_anon_deny/);
    expect(sql).toMatch(/TO anon[\s\S]*?USING\s*\(false\)/);
  });

  it('Migration sperrt anon-Zugriff auf invoice_items', () => {
    const sql = read('supabase/migrations/20260819020000_billing_org_fence_haertung.sql');
    expect(sql).toMatch(/invoice_items_anon_deny/);
  });

  it('Rollback fuer 20260819020000 existiert', () => {
    expect(existsSync(
      path.join(REPO_ROOT, 'supabase/migrations/20260819020001_rollback_billing_org_fence_haertung.sql')
    )).toBe(true);
  });

  describe('Engine-Funktionen akzeptieren expectedOrgId', () => {
    const engineSrc = read('lib/billing/core/invoice-engine.ts');

    it('freezeInvoice hat expectedOrgId Parameter', () => {
      expect(engineSrc).toMatch(/freezeInvoice\([^)]*expectedOrgId\??: string/);
    });

    it('cancelInvoice hat expectedOrgId Parameter', () => {
      expect(engineSrc).toMatch(/cancelInvoice\([^)]*expectedOrgId\??: string/);
    });

    it('correctInvoice hat expectedOrgId Parameter', () => {
      expect(engineSrc).toMatch(/correctInvoice\([^)]*expectedOrgId\??: string/);
    });

    it('createCreditNote hat expectedOrgId Parameter', () => {
      expect(engineSrc).toMatch(/createCreditNote\([^)]*expectedOrgId\??: string/);
    });

    it('alle Engine-Funktionen pruefen organization_id bei Mismatch', () => {
      const checks = (engineSrc.match(
        /if \(expectedOrgId && (?:invoice|original)\.organization_id !== expectedOrgId\)/g
      ) || []);
      expect(checks.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('API-Routen uebergeben orgId an Engine', () => {
    const routes = [
      { file: 'app/api/billing/invoices/[id]/freeze/route.ts', fn: 'freezeInvoice' },
      { file: 'app/api/billing/invoices/[id]/cancel/route.ts', fn: 'cancelInvoice' },
      { file: 'app/api/billing/invoices/[id]/correct/route.ts', fn: 'correctInvoice' },
      { file: 'app/api/billing/invoices/[id]/credit/route.ts', fn: 'createCreditNote' },
    ];

    it.each(routes)('$file uebergibt organizationId an $fn', ({ file, fn }) => {
      const src = read(file);
      const call = src.slice(src.indexOf(fn));
      expect(call).toMatch(/organizationId\)/);
    });
  });
});

// ---------------------------------------------------------------------------
// F2: Admin-UI Status-Updates via serverseitige Statusmaschine
// ---------------------------------------------------------------------------

describe('F2: Statusmaschine ist serverseitig erzwungen', () => {
  it('DB-Trigger validate_invoice_status_transition existiert', () => {
    const sql = read('supabase/migrations/20260806200000_billing_core_corrections.sql');
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION.*validate_invoice_status_transition/);
    expect(sql).toMatch(/CREATE TRIGGER.*trg_validate_invoice_status/);
  });

  it('Trigger prueft Terminal-Status (bezahlt, storniert, akzeptiert)', () => {
    const sql = read('supabase/migrations/20260806200000_billing_core_corrections.sql');
    expect(sql).toMatch(/'bezahlt'.*'storniert'.*'akzeptiert'/);
    expect(sql).toMatch(/kann nicht mehr geaendert werden/);
  });

  it('Trigger schuetzt festgeschriebene Rechnungen', () => {
    const sql = read('supabase/migrations/20260806200000_billing_core_corrections.sql');
    expect(sql).toMatch(/OLD\.frozen_at IS NOT NULL/);
    expect(sql).toMatch(/Festgeschriebene Rechnung darf inhaltlich nicht veraendert werden/);
  });
});

// ---------------------------------------------------------------------------
// F3: correctInvoice() insert-Fehler-Behandlung
// ---------------------------------------------------------------------------

describe('F3: correctInvoice prueft insert-Fehler bei invoice_items', () => {
  it('invoice_items insert-Fehler wird geworfen', () => {
    const src = read('lib/billing/core/invoice-engine.ts');
    expect(src).toMatch(/const \{ error: itemsInsertError \} = await supabase\.from\('invoice_items'\)\.insert\(items\)/);
    expect(src).toMatch(/if \(itemsInsertError\)/);
    expect(src).toMatch(/Korrekturpositionen konnten nicht erstellt werden/);
  });
});

// ---------------------------------------------------------------------------
// F4: monatsabschluss.ts kein service_records.amount Fallback
// ---------------------------------------------------------------------------

describe('F4: Monatsabschluss nutzt keinen service_records.amount Fallback', () => {
  const src = read('lib/abrechnung/monatsabschluss.ts');

  it('ist als VORSCHAU markiert', () => {
    expect(src).toMatch(/VORSCHAU/);
    expect(src).toMatch(/KEINE[\s\S]*?verbindliche Abrechnung/i);
  });

  it('hat keinen direkten service_records.amount Fallback mehr', () => {
    expect(src).not.toMatch(/Number\(r\.amount\)/);
  });

  it('warnt bei fehlenden leistungspreise-Eintraegen', () => {
    // Preisluecken werden benannt statt still mit 0 durchgereicht.
    // Seit Stream 5 unterscheidet die Meldung 'kein_eintrag' von
    // 'nicht_verifiziert' — beides erzeugt eine Warnung, keinen Ersatzpreis.
    expect(src).toMatch(/Preisluecke/);
    expect(src).toMatch(/kein_eintrag/);
    expect(src).toMatch(/nicht_verifiziert/);
    expect(src).toMatch(/Vorschau-Betrag unvollstaendig/);
  });

  it('verweist auf billing_tariffs als verbindliche Quelle', () => {
    expect(src).toMatch(/billing_tariffs.*bei Rechnungserstellung/);
  });
});

// ---------------------------------------------------------------------------
// F5: Rollback-Dateien existieren
// ---------------------------------------------------------------------------

describe('F5: Billing-Migrationen haben Rollbacks', () => {
  const billingMigrations = [
    '20260806200000_billing_core_corrections',
    '20260807100000_create_invoice_draft_atomic',
    '20260807110000_tariff_based_invoice_creation',
    '20260807120000_tariff_model_hardening',
    '20260807180000_tariff_stammdaten_v2',
    '20260808110000_tarifschichten_bundesland',
    '20260808210000_zahlungen_forderungen_monatsabschluss',
    '20260808220000_kassenabrechnung_dta_dakota',
    '20260819020000_billing_org_fence_haertung',
  ];

  it.each(billingMigrations)('%s hat eine Rollback-Datei', (migration) => {
    const timestamp = migration.slice(0, 14);
    const migDir = path.join(REPO_ROOT, 'supabase/migrations');
    const files = require('node:fs').readdirSync(migDir) as string[];
    const rollback = files.find(f =>
      f.startsWith(timestamp.slice(0, 8)) && f.includes('rollback') &&
      f.includes(migration.replace(/^\d+_/, '').split('_').slice(0, 2).join('_'))
    );
    if (!rollback) {
      const altRollback = files.find(f =>
        f.includes(timestamp.replace(/0000$/, '0001')) && f.includes('rollback')
      );
      expect(altRollback || rollback, `Kein Rollback fuer ${migration}`).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// F6: freezeInvoice einzelpreis_cent berechnet korrekt
// ---------------------------------------------------------------------------

describe('F6: freezeInvoice einzelpreis_cent != gesamtpreis_cent', () => {
  it('berechnet einzelpreis_cent aus gesamtpreis_cent / menge', () => {
    const src = read('lib/billing/core/invoice-engine.ts');
    expect(src).toMatch(/einzelpreisCent\s*=\s*menge > 0 \? Math\.round\(gesamtpreisCent \/ menge\)/);
  });

  it('berechnet menge aus duration_minutes', () => {
    const src = read('lib/billing/core/invoice-engine.ts');
    expect(src).toMatch(/const menge = item\.duration_minutes \? item\.duration_minutes \/ 60 : 1/);
  });

  it('gesamtpreis_cent kommt aus item.amount', () => {
    const src = read('lib/billing/core/invoice-engine.ts');
    expect(src).toMatch(/const gesamtpreisCent = Math\.round\(Number\(item\.amount\) \* 100\)/);
  });
});

// ---------------------------------------------------------------------------
// F7: tariff_version Analyse
// ---------------------------------------------------------------------------

describe('F7: Tarif-Versionierung', () => {
  it('billing_tariffs hat gueltig_ab und gueltig_bis als Versionsproxy', () => {
    const sql = read('supabase/migrations/20260806200000_billing_core_corrections.sql');
    expect(sql).toMatch(/gueltig_ab\s+DATE\s+NOT NULL/);
    expect(sql).toMatch(/gueltig_bis\s+DATE/);
  });

  it('Overlap-Constraint verhindert zeitlich ueberlappende Tarife', () => {
    const hardening = read('supabase/migrations/20260807120000_tariff_model_hardening.sql');
    expect(hardening).toMatch(/no_overlapping_tariffs/);
    expect(hardening).toMatch(/EXCLUDE USING gist/);
  });

  it('RPC loest Tarif nach Stichtag auf (gueltig_ab <= Leistungsdatum)', () => {
    const rpc = read('supabase/migrations/20260808120002_invoice_bundesland_klient.sql');
    expect(rpc).toMatch(/gueltig_ab\s*<=\s*v_rec\.date/);
  });
});

// ---------------------------------------------------------------------------
// F8: generateInvoiceNumberFallback Race-Condition
// ---------------------------------------------------------------------------

describe('F8: generateInvoiceNumber Fallback-Analyse', () => {
  const src = read('lib/billing/core/invoice-engine.ts');

  it('primaerer Pfad nutzt atomische RPC (next_billing_number)', () => {
    expect(src).toMatch(/supabase\.rpc\('next_billing_number'/);
  });

  it('RPC ist atomisch via INSERT ON CONFLICT DO UPDATE', () => {
    const sql = read('supabase/migrations/20260806200000_billing_core_corrections.sql');
    expect(sql).toMatch(/INSERT INTO public\.billing_number_sequences.*ON CONFLICT.*DO UPDATE/s);
  });

  it('Fallback wird nur bei RPC-Fehler aufgerufen', () => {
    expect(src).toMatch(/if \(error\)[\s\S]*?generateInvoiceNumberFallback/);
  });

  it('Fallback hat keine SELECT FOR UPDATE (bekannte Race-Condition)', () => {
    expect(src).toMatch(/SELECT FOR UPDATE nicht moeglich via Supabase-Client/);
  });
});

// ---------------------------------------------------------------------------
// Tarifaufloesung: zeitliche Grenzen
// ---------------------------------------------------------------------------

describe('Tarif-Zeitliche-Grenzen', () => {
  it('RPC prueft gueltig_ab <= Leistungsdatum', () => {
    const sql = read('supabase/migrations/20260808120002_invoice_bundesland_klient.sql');
    expect(sql).toMatch(/gueltig_ab.*<=.*v_rec\.date/);
  });

  it('RPC prueft gueltig_bis >= Leistungsdatum oder NULL', () => {
    const sql = read('supabase/migrations/20260808120002_invoice_bundesland_klient.sql');
    expect(sql).toMatch(/gueltig_bis.*IS NULL.*OR.*gueltig_bis.*>=.*v_rec\.date/s);
  });
});

// ---------------------------------------------------------------------------
// Audit-Trail-Integritaet
// ---------------------------------------------------------------------------

describe('Audit-Trail', () => {
  it('audit_trail hat checksum-Spalte (SHA-256)', () => {
    const sql = read('supabase/migrations/20260806200000_billing_core_corrections.sql');
    expect(sql).toMatch(/billing_audit_trail[\s\S]*?checksum\s+TEXT\s+NOT NULL/);
  });

  it('audit_trail ist unveraenderlich (kein UPDATE/DELETE)', () => {
    const sql = read('supabase/migrations/20260806200000_billing_core_corrections.sql');
    expect(sql).toMatch(/Kein UPDATE\/DELETE auf Audit-Trail/);
  });
});

// ---------------------------------------------------------------------------
// Statusmaschine: Vollstaendigkeitspruefung
// ---------------------------------------------------------------------------

describe('Statusmaschine Vollstaendigkeit', () => {
  it('alle 14 InvoiceStatus-Werte sind definiert', () => {
    const src = read('lib/billing/core/status-machine.ts');
    const expected = [
      'entwurf', 'geprueft', 'freigegeben', 'uebermittelt', 'quittiert',
      'bezahlt', 'teilweise_bezahlt', 'gekuerzt', 'abgelehnt',
      'korrektur_erforderlich', 'akzeptiert', 'storniert',
      'erneut_eingereicht', 'strittig',
    ];
    for (const status of expected) {
      expect(src).toContain(`'${status}'`);
    }
  });

  it('Terminal-Status haben leere Uebergangs-Arrays', () => {
    const src = read('lib/billing/core/status-machine.ts');
    expect(src).toMatch(/bezahlt:\s*\[\]/);
    expect(src).toMatch(/akzeptiert:\s*\[\]/);
    expect(src).toMatch(/storniert:\s*\[\]/);
  });
});
