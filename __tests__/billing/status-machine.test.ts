/**
 * Tests fuer die Billing Status-Machine
 * @see lib/billing/core/status-machine.ts
 */
import { vi } from 'vitest';
import {
  isTransitionAllowed,
  validateTransition,
  getAllowedTransitions,
  isTerminalStatus,
  isValidInvoiceStatus,
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from '@/lib/billing/core/status-machine';

// ---------------------------------------------------------------------------
// Erlaubte Uebergaenge
// ---------------------------------------------------------------------------

describe('Erlaubte Uebergaenge', () => {
  const erlaubteUebergaenge: [InvoiceStatus, InvoiceStatus[]][] = [
    ['entwurf', ['geprueft', 'storniert']],
    ['geprueft', ['freigegeben', 'entwurf', 'storniert']],
    ['freigegeben', ['uebermittelt', 'storniert']],
    ['uebermittelt', ['quittiert', 'abgelehnt', 'storniert']],
    ['quittiert', ['bezahlt', 'teilweise_bezahlt', 'gekuerzt', 'storniert']],
    ['teilweise_bezahlt', ['bezahlt', 'storniert', 'korrektur_erforderlich']],
    ['gekuerzt', ['korrektur_erforderlich', 'akzeptiert', 'storniert']],
    ['abgelehnt', ['erneut_eingereicht', 'storniert']],
    ['korrektur_erforderlich', ['entwurf', 'storniert']],
    ['erneut_eingereicht', ['uebermittelt', 'storniert']],
  ];

  it.each(erlaubteUebergaenge)(
    '%s -> erlaubte Ziele: %j',
    (from, targets) => {
      for (const to of targets) {
        expect(isTransitionAllowed(from, to)).toBe(true);
        // validateTransition darf NICHT werfen
        expect(() => validateTransition(from, to)).not.toThrow();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Verbotene Uebergaenge
// ---------------------------------------------------------------------------

describe('Verbotene Uebergaenge', () => {
  const verboten: [InvoiceStatus, InvoiceStatus][] = [
    ['entwurf', 'bezahlt'],
    ['entwurf', 'freigegeben'],
    ['freigegeben', 'entwurf'],
    ['geprueft', 'uebermittelt'],
    ['uebermittelt', 'bezahlt'],
  ];

  it.each(verboten)(
    '%s -> %s wirft Fehler',
    (from, to) => {
      expect(isTransitionAllowed(from, to)).toBe(false);
      expect(() => validateTransition(from, to)).toThrow();
    },
  );
});

// ---------------------------------------------------------------------------
// Terminal-Status
// ---------------------------------------------------------------------------

describe('Terminal-Status', () => {
  const terminalStates: InvoiceStatus[] = ['bezahlt', 'storniert', 'akzeptiert'];

  const alleStatus: InvoiceStatus[] = [
    'entwurf', 'geprueft', 'freigegeben', 'uebermittelt',
    'quittiert', 'bezahlt', 'teilweise_bezahlt', 'gekuerzt',
    'abgelehnt', 'korrektur_erforderlich', 'akzeptiert',
    'storniert', 'erneut_eingereicht',
  ];

  it.each(terminalStates)(
    '%s lehnt ALLE Uebergaenge ab',
    (terminal) => {
      for (const target of alleStatus) {
        if (target === terminal) continue; // gleicher Status ist kein Uebergang
        expect(isTransitionAllowed(terminal, target)).toBe(false);
        expect(() => validateTransition(terminal, target)).toThrow();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// isTerminalStatus
// ---------------------------------------------------------------------------

describe('isTerminalStatus', () => {
  it('erkennt terminale Status', () => {
    expect(isTerminalStatus('bezahlt')).toBe(true);
    expect(isTerminalStatus('storniert')).toBe(true);
    expect(isTerminalStatus('akzeptiert')).toBe(true);
  });

  it('erkennt nicht-terminale Status', () => {
    expect(isTerminalStatus('entwurf')).toBe(false);
    expect(isTerminalStatus('freigegeben')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAllowedTransitions
// ---------------------------------------------------------------------------

describe('getAllowedTransitions', () => {
  it('gibt korrekte Arrays zurueck', () => {
    expect(getAllowedTransitions('entwurf')).toEqual(['geprueft', 'storniert']);
    expect(getAllowedTransitions('bezahlt')).toEqual([]);
    expect(getAllowedTransitions('storniert')).toEqual([]);
    expect(getAllowedTransitions('akzeptiert')).toEqual([]);
    expect(getAllowedTransitions('quittiert')).toEqual([
      'bezahlt', 'teilweise_bezahlt', 'gekuerzt', 'strittig', 'storniert',
    ]);
  });
});

// ---------------------------------------------------------------------------
// isValidInvoiceStatus
// ---------------------------------------------------------------------------

describe('isValidInvoiceStatus', () => {
  it('akzeptiert gueltige Status', () => {
    expect(isValidInvoiceStatus('entwurf')).toBe(true);
    expect(isValidInvoiceStatus('bezahlt')).toBe(true);
    expect(isValidInvoiceStatus('korrektur_erforderlich')).toBe(true);
    expect(isValidInvoiceStatus('erneut_eingereicht')).toBe(true);
  });

  it('lehnt ungueltige Strings ab', () => {
    expect(isValidInvoiceStatus('draft')).toBe(false);
    expect(isValidInvoiceStatus('')).toBe(false);
    expect(isValidInvoiceStatus('ENTWURF')).toBe(false);
    expect(isValidInvoiceStatus('paid')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// INVOICE_STATUS_LABELS
// ---------------------------------------------------------------------------

describe('INVOICE_STATUS_LABELS', () => {
  const alleStatus: InvoiceStatus[] = [
    'entwurf', 'geprueft', 'freigegeben', 'uebermittelt',
    'quittiert', 'bezahlt', 'teilweise_bezahlt', 'gekuerzt',
    'abgelehnt', 'korrektur_erforderlich', 'akzeptiert',
    'storniert', 'erneut_eingereicht',
  ];

  it('hat fuer jeden Status ein deutsches Label', () => {
    for (const status of alleStatus) {
      const label = INVOICE_STATUS_LABELS[status];
      expect(label).toBeDefined();
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('Labels sind korrekte deutsche Begriffe', () => {
    expect(INVOICE_STATUS_LABELS.entwurf).toBe('Entwurf');
    expect(INVOICE_STATUS_LABELS.bezahlt).toBe('Bezahlt');
    expect(INVOICE_STATUS_LABELS.storniert).toBe('Storniert');
    expect(INVOICE_STATUS_LABELS.korrektur_erforderlich).toBe('Korrektur erforderlich');
  });
});
