/**
 * Tests fuer den Status 'strittig' in der Statusmaschine
 */
import { describe, it, expect } from 'vitest';
import {
  isTransitionAllowed,
  isValidInvoiceStatus,
  isTerminalStatus,
  getAllowedTransitions,
  validateTransition,
  INVOICE_STATUS_LABELS,
} from '../../lib/billing/core/status-machine';

describe('Status strittig — Typen und Labels', () => {
  it('ist ein gueltiger InvoiceStatus', () => {
    expect(isValidInvoiceStatus('strittig')).toBe(true);
  });

  it('ist KEIN Terminal-Status', () => {
    expect(isTerminalStatus('strittig')).toBe(false);
  });

  it('hat ein deutsches Label', () => {
    expect(INVOICE_STATUS_LABELS.strittig).toBe('Strittig');
  });
});

describe('Status strittig — Uebergaenge NACH strittig', () => {
  it('quittiert → strittig erlaubt', () => {
    expect(isTransitionAllowed('quittiert', 'strittig')).toBe(true);
  });

  it('teilweise_bezahlt → strittig erlaubt', () => {
    expect(isTransitionAllowed('teilweise_bezahlt', 'strittig')).toBe(true);
  });

  it('gekuerzt → strittig erlaubt', () => {
    expect(isTransitionAllowed('gekuerzt', 'strittig')).toBe(true);
  });

  it('entwurf → strittig NICHT erlaubt', () => {
    expect(isTransitionAllowed('entwurf', 'strittig')).toBe(false);
  });

  it('freigegeben → strittig NICHT erlaubt', () => {
    expect(isTransitionAllowed('freigegeben', 'strittig')).toBe(false);
  });

  it('uebermittelt → strittig NICHT erlaubt', () => {
    expect(isTransitionAllowed('uebermittelt', 'strittig')).toBe(false);
  });
});

describe('Status strittig — Uebergaenge AUS strittig', () => {
  const erlaubteZiele = [
    'gekuerzt',
    'korrektur_erforderlich',
    'abgelehnt',
    'akzeptiert',
    'bezahlt',
    'storniert',
    'abgeschrieben',
  ] as const;

  for (const ziel of erlaubteZiele) {
    it(`strittig → ${ziel} erlaubt`, () => {
      expect(isTransitionAllowed('strittig', ziel)).toBe(true);
    });
  }

  it('strittig → entwurf NICHT erlaubt', () => {
    expect(isTransitionAllowed('strittig', 'entwurf')).toBe(false);
  });

  it('strittig → geprueft NICHT erlaubt', () => {
    expect(isTransitionAllowed('strittig', 'geprueft')).toBe(false);
  });

  it('strittig → strittig NICHT erlaubt (kein Selbstuebergang)', () => {
    expect(isTransitionAllowed('strittig', 'strittig')).toBe(false);
  });

  it('getAllowedTransitions liefert genau 7 Ziele', () => {
    const transitions = getAllowedTransitions('strittig');
    expect(transitions).toHaveLength(7);
    expect(new Set(transitions)).toEqual(new Set(erlaubteZiele));
  });
});

describe('Status strittig — validateTransition', () => {
  it('strittig → bezahlt wirft nicht', () => {
    expect(() => validateTransition('strittig', 'bezahlt')).not.toThrow();
  });

  it('strittig → entwurf wirft', () => {
    expect(() => validateTransition('strittig', 'entwurf')).toThrow('Ungültiger Statusübergang');
  });
});
