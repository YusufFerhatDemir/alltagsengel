/**
 * Billing Status-Machine
 * Definiert alle erlaubten Statusuebergaenge fuer Rechnungen.
 *
 * Dieses Modul ist bewusst framework-unabhaengig gehalten,
 * damit es spaeter auch in efy care wiederverwendbar ist.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InvoiceStatus =
  | 'entwurf'
  | 'geprueft'
  | 'freigegeben'
  | 'uebermittelt'
  | 'quittiert'
  | 'bezahlt'
  | 'teilweise_bezahlt'
  | 'gekuerzt'
  | 'abgelehnt'
  | 'korrektur_erforderlich'
  | 'akzeptiert'
  | 'storniert'
  | 'erneut_eingereicht';

export type CorrectionStatus =
  | 'entwurf'
  | 'freigegeben'
  | 'uebermittelt'
  | 'verarbeitet';

export type TransmissionStatus =
  | 'nicht_uebermittelt'
  | 'in_uebermittlung'
  | 'uebermittelt'
  | 'quittiert'
  | 'abgelehnt';

// ---------------------------------------------------------------------------
// Erlaubte Uebergaenge
// ---------------------------------------------------------------------------

const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  entwurf:                ['geprueft', 'storniert'],
  geprueft:               ['freigegeben', 'entwurf', 'storniert'],
  freigegeben:            ['uebermittelt', 'storniert'],
  uebermittelt:           ['quittiert', 'abgelehnt', 'storniert'],
  quittiert:              ['bezahlt', 'teilweise_bezahlt', 'gekuerzt', 'storniert'],
  teilweise_bezahlt:      ['bezahlt', 'storniert', 'korrektur_erforderlich'],
  gekuerzt:               ['korrektur_erforderlich', 'akzeptiert', 'storniert'],
  abgelehnt:              ['erneut_eingereicht', 'storniert'],
  korrektur_erforderlich: ['entwurf', 'storniert'],
  erneut_eingereicht:     ['uebermittelt', 'storniert'],
  // Endgueltige Status – keine Uebergaenge moeglich
  bezahlt:                [],
  akzeptiert:             [],
  storniert:              [],
};

const CORRECTION_TRANSITIONS: Record<CorrectionStatus, CorrectionStatus[]> = {
  entwurf:     ['freigegeben'],
  freigegeben: ['uebermittelt'],
  uebermittelt:['verarbeitet'],
  verarbeitet: [],
};

// Endgueltige Status (Terminal States)
const TERMINAL_STATUSES: ReadonlySet<InvoiceStatus> = new Set([
  'bezahlt',
  'akzeptiert',
  'storniert',
]);

// ---------------------------------------------------------------------------
// Labels (Deutsch)
// ---------------------------------------------------------------------------

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  entwurf:                'Entwurf',
  geprueft:               'Geprüft',
  freigegeben:            'Freigegeben',
  uebermittelt:           'Übermittelt',
  quittiert:              'Quittiert',
  bezahlt:                'Bezahlt',
  teilweise_bezahlt:      'Teilweise bezahlt',
  gekuerzt:               'Gekürzt',
  abgelehnt:              'Abgelehnt',
  korrektur_erforderlich: 'Korrektur erforderlich',
  akzeptiert:             'Akzeptiert',
  storniert:              'Storniert',
  erneut_eingereicht:     'Erneut eingereicht',
};

export const CORRECTION_STATUS_LABELS: Record<CorrectionStatus, string> = {
  entwurf:     'Entwurf',
  freigegeben: 'Freigegeben',
  uebermittelt:'Übermittelt',
  verarbeitet: 'Verarbeitet',
};

export const TRANSMISSION_STATUS_LABELS: Record<TransmissionStatus, string> = {
  nicht_uebermittelt: 'Nicht übermittelt',
  in_uebermittlung:   'In Übermittlung',
  uebermittelt:       'Übermittelt',
  quittiert:          'Quittiert',
  abgelehnt:          'Abgelehnt',
};

// ---------------------------------------------------------------------------
// Validierungsfunktionen
// ---------------------------------------------------------------------------

/**
 * Prueft ob ein Statusuebergang erlaubt ist.
 */
export function isTransitionAllowed(
  from: InvoiceStatus,
  to: InvoiceStatus
): boolean {
  const allowed = INVOICE_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Gibt alle erlaubten Folgestatus zurueck.
 */
export function getAllowedTransitions(status: InvoiceStatus): InvoiceStatus[] {
  return INVOICE_TRANSITIONS[status] ?? [];
}

/**
 * Prueft ob ein Status endgueltig ist (kein Weg zurueck).
 */
export function isTerminalStatus(status: InvoiceStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Prueft ob ein Status ein gueltiger InvoiceStatus ist.
 */
export function isValidInvoiceStatus(status: string): status is InvoiceStatus {
  return status in INVOICE_TRANSITIONS;
}

/**
 * Validiert einen Statusuebergang und wirft bei unerlaubtem Uebergang.
 */
export function validateTransition(
  from: InvoiceStatus,
  to: InvoiceStatus
): void {
  if (isTerminalStatus(from)) {
    throw new Error(
      `Rechnung im Status "${INVOICE_STATUS_LABELS[from]}" kann nicht mehr geändert werden.`
    );
  }
  if (!isTransitionAllowed(from, to)) {
    throw new Error(
      `Ungültiger Statusübergang: "${INVOICE_STATUS_LABELS[from]}" → "${INVOICE_STATUS_LABELS[to]}". ` +
      `Erlaubt: ${getAllowedTransitions(from).map(s => INVOICE_STATUS_LABELS[s]).join(', ') || 'keine'}.`
    );
  }
}

/**
 * Prueft ob ein Korrektur-Statusuebergang erlaubt ist.
 */
export function isCorrectionTransitionAllowed(
  from: CorrectionStatus,
  to: CorrectionStatus
): boolean {
  const allowed = CORRECTION_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Validiert einen Korrektur-Statusuebergang.
 */
export function validateCorrectionTransition(
  from: CorrectionStatus,
  to: CorrectionStatus
): void {
  if (!isCorrectionTransitionAllowed(from, to)) {
    throw new Error(
      `Ungültiger Korrektur-Statusübergang: "${CORRECTION_STATUS_LABELS[from]}" → "${CORRECTION_STATUS_LABELS[to]}".`
    );
  }
}

// ---------------------------------------------------------------------------
// Prefix-Mapping fuer Rechnungsnummern
// ---------------------------------------------------------------------------

export const INVOICE_NUMBER_PREFIX: Record<string, string> = {
  rechnung:   'RE',
  storno:     'ST',
  korrektur:  'KR',
  gutschrift: 'GS',
};
