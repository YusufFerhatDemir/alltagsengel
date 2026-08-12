/**
 * Billing Core – Public API
 *
 * Modularer Abrechnungskern fuer Alltagsengel (und spaeter efy care).
 */

// Status-Machine
export {
  type InvoiceStatus,
  type CorrectionStatus,
  type TransmissionStatus,
  INVOICE_STATUS_LABELS,
  CORRECTION_STATUS_LABELS,
  TRANSMISSION_STATUS_LABELS,
  isTransitionAllowed,
  getAllowedTransitions,
  isTerminalStatus,
  isValidInvoiceStatus,
  validateTransition,
  isCorrectionTransitionAllowed,
  validateCorrectionTransition,
  INVOICE_NUMBER_PREFIX,
} from './status-machine';

// Audit
export {
  type AuditLogParams,
  computeChecksum,
  computeContentHash,
  computeSnapshotChecksum,
  logBillingAction,
} from './audit';

// Idempotency
export {
  generateIdempotencyKey,
  checkIdempotency,
} from './idempotency';

// Price Resolver
export {
  type PriceResolveParams,
  type BillingTarif,
  type LineTotalParams,
  type LineTotalResult,
  type PriceSnapshot,
  resolvePrice,
  calculateLineTotal,
  snapshotPrice,
} from './price-resolver';

// Invoice Engine
export {
  type CreateDraftParams,
  type CreateDraftResult,
  type FreezeResult,
  type CorrectionLineInput,
  type CorrectionResult,
  type CreditNoteResult,
  type TariffErrorCode,
  TARIFF_ERROR_CODES,
  parseTariffError,
  createInvoiceDraft,
  freezeInvoice,
  generateInvoiceNumber,
  cancelInvoice,
  correctInvoice,
  createCreditNote,
} from './invoice-engine';

// Payments
export {
  type PaymentMethod,
  type PayerType,
  type MatchingStatus,
  type AllocationType,
  type CreatePaymentParams,
  type PaymentResult,
  type AllocatePaymentParams,
  type RecordDifferenceParams,
  createPayment,
  allocatePayment,
  recordPaymentDifference,
} from './payments';

// Dunning
export {
  type DunningLevel,
  type DunningOverview,
  DUNNING_LEVEL_ORDER,
  DUNNING_LABELS,
  DUNNING_DAYS,
  DUNNING_FEES_CENTS,
  ensureDunningEntry,
  checkDunningBlocks,
  advanceDunning,
  getDunningOverview,
} from './dunning';
