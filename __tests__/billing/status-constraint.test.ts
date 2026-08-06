/**
 * Tests fuer den invoices_status_check Constraint
 * Verifiziert, dass die Reconciliation-Migration alle benoetigten
 * Statuswerte enthaelt — sowohl Legacy (englisch) als auch neue (deutsch).
 *
 * @see supabase/migrations/20260806300000_pr35_reconciliation_status_constraint.sql
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/20260806300000_pr35_reconciliation_status_constraint.sql'
);

const ROLLBACK_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/20260806300001_rollback_pr35_reconciliation.sql'
);

// Alle Status, die der Constraint erlauben MUSS
const LEGACY_ENGLISH = ['draft', 'sent', 'paid', 'partial', 'rejected', 'disputed'] as const;

const NEW_GERMAN = [
  'entwurf', 'geprueft', 'freigegeben', 'uebermittelt',
  'quittiert', 'abgelehnt', 'bezahlt', 'teilweise_bezahlt',
  'gekuerzt', 'korrektur_erforderlich', 'erneut_eingereicht',
  'akzeptiert', 'storniert',
] as const;

describe('invoices_status_check Reconciliation-Migration', () => {
  const migrationSQL = fs.readFileSync(MIGRATION_PATH, 'utf-8');

  it('enthaelt alle Legacy-Statuswerte (englisch)', () => {
    for (const status of LEGACY_ENGLISH) {
      expect(migrationSQL).toContain(`'${status}'`);
    }
  });

  it('enthaelt alle neuen Statuswerte (deutsch)', () => {
    for (const status of NEW_GERMAN) {
      expect(migrationSQL).toContain(`'${status}'`);
    }
  });

  it('verwendet DROP IF EXISTS fuer Idempotenz', () => {
    expect(migrationSQL).toContain('DROP CONSTRAINT IF EXISTS invoices_status_check');
  });

  it('erstellt den Constraint mit ADD CONSTRAINT', () => {
    expect(migrationSQL).toContain('ADD CONSTRAINT invoices_status_check');
  });

  it('enthaelt genau 19 Statuswerte (6 englisch + 13 deutsch)', () => {
    const allStatus = [...LEGACY_ENGLISH, ...NEW_GERMAN];
    expect(allStatus.length).toBe(19);
    for (const status of allStatus) {
      expect(migrationSQL).toContain(`'${status}'`);
    }
  });
});

describe('invoices_status_check Rollback-Migration', () => {
  const rollbackSQL = fs.readFileSync(ROLLBACK_PATH, 'utf-8');

  it('entfernt den erweiterten Constraint', () => {
    expect(rollbackSQL).toContain('DROP CONSTRAINT IF EXISTS invoices_status_check');
  });

  it('stellt nur die 6 englischen Legacy-Werte wieder her', () => {
    for (const status of LEGACY_ENGLISH) {
      expect(rollbackSQL).toContain(`'${status}'`);
    }
  });

  it('enthaelt KEINE deutschen Statuswerte', () => {
    for (const status of NEW_GERMAN) {
      expect(rollbackSQL).not.toContain(`'${status}'`);
    }
  });
});

describe('PR #35 Rollback-Migration enthaelt Constraint-Wiederherstellung', () => {
  const pr35Rollback = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../supabase/migrations/20260806200001_rollback_billing_core_corrections.sql'
    ),
    'utf-8'
  );

  it('setzt den Constraint auf englische Werte zurueck', () => {
    expect(pr35Rollback).toContain('invoices_status_check');
    for (const status of LEGACY_ENGLISH) {
      expect(pr35Rollback).toContain(`'${status}'`);
    }
  });
});
