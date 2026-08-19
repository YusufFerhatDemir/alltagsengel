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
  type TarifStatus,
  type LineTotalParams,
  type LineTotalResult,
  type PriceSnapshot,
  TarifNichtVerifiziertError,
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
  type WriteOffResult,
  type TariffErrorCode,
  TARIFF_ERROR_CODES,
  parseTariffError,
  createInvoiceDraft,
  wendeBudgetDeckelAn,
  freezeInvoice,
  generateInvoiceNumber,
  cancelInvoice,
  correctInvoice,
  createCreditNote,
  writeOffInvoice,
} from './invoice-engine';

// Budgetdeckel § 45b / § 42a
export {
  type BudgetTopf,
  type GedeckelterTopf,
  type BudgetDeckelEingabe,
  type BudgetDeckelErgebnis,
  type BudgetLage,
  ENTLASTUNG_BUDGET_TYPEN,
  VERHINDERUNG_BUDGET_TYPEN,
  SACHLEISTUNG_36_BUDGET_TYPEN,
  PRIVAT_BUDGET_TYPEN,
  UNGEDECKELTE_TOEPFE,
  UnbekannterBudgetTypError,
  BudgetLageNichtErmittelbarError,
  budgetTopfFuer,
  istGedeckelt,
  berechneBudgetDeckel,
  ermittleBudgetLage,
  deckelAusLage,
} from './budget-cap';

// Gutschrift-Lebenszyklus (Freigabe / Verwerfen)
export {
  type CreditNoteRow,
  type ReleaseCreditNoteResult,
  type DiscardCreditNoteResult,
  releaseCreditNote,
  discardCreditNote,
  getRemainingCreditableCents,
} from './credit-notes';

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
  type DunningRunEscalation,
  type DunningRunSkip,
  type DunningRunResult,
  DUNNING_LEVEL_ORDER,
  DUNNING_LABELS,
  DUNNING_DAYS,
  DUNNING_FEES_CENTS,
  ensureDunningEntry,
  checkDunningBlocks,
  advanceDunning,
  getDunningOverview,
  runDunningRun,
} from './dunning';
