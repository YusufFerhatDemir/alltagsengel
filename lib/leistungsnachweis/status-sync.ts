// ═══════════════════════════════════════════════════════════════════
// Leistungsnachweis — Sync zwischen proof_status und status
// ═══════════════════════════════════════════════════════════════════
//
// PROBLEM (gefixt hier):
// service_records führt ZWEI Statusfelder:
//
//   status        ('draft'|'incomplete'|'complete'|'signed'|'invoiced')
//                 — das ALTE Feld, auf das der Rest des Systems hört:
//                   • create_invoice_draft_atomic() selektiert ausschliesslich
//                     status IN ('signed','complete')
//                   • der used_amount-Trigger auf client_budgets zählt nur
//                     Einsätze mit status <> 'draft'
//                   • /admin/records, /mis/team, /admin/clients/[id] rendern
//                     RECORD_STATUS[status]
//
//   proof_status  ('ENTWURF'|'ABGESCHLOSSEN'|'UNTERSCHRIEBEN'|'ABGERECHNET'|
//                  'STORNIERT')
//                 — das NEUE Nachweis-Feld aus der Einsatzplanung
//                   (Migration 20260808200000).
//
// Der Signatur-Flow schrieb bisher NUR proof_status. Ein unterschriebener
// Nachweis blieb dadurch auf status='draft' hängen — mit drei Folgen:
//   1. Der Einsatz erscheint in der Oberfläche weiter als "Entwurf"/offen.
//   2. Er wird NIE in eine Rechnung aufgenommen (RPC filtert auf
//      status IN ('signed','complete')).
//   3. Das Entlastungsbudget wird nicht belastet (Trigger zählt nur
//      status <> 'draft').
//
// REGEL: monoton vorwärts, nie zurück.
// Ein bereits abgerechneter Einsatz (status='invoiced') darf durch einen
// nachlaufenden proof_status-Schreibvorgang nicht auf 'signed' zurückfallen,
// und ein manuell auf 'incomplete' gesetzter Entwurf nicht auf 'draft'.
// Deshalb wird der Zielstatus nur übernommen, wenn er in der Rangfolge ECHT
// höher liegt als der aktuelle.
//
// 'STORNIERT' hat bewusst KEIN status-Gegenstück: das status-Werteset
// (Check-Constraint service_records_status_check) kennt keinen Storno-Wert.
// Die Stornierung wird über billing_status='STORNIERT' geführt; status
// bleibt unverändert stehen.
//
// Dieselbe Logik liegt zusätzlich als DB-Trigger vor
// (supabase/migrations/20260901010000_service_record_status_sync.sql), damit
// auch Schreibpfade ausserhalb dieser Anwendung (RPCs, Backfills, SQL-Editor)
// nicht wieder desynchronisieren. Die Anwendung setzt den Wert trotzdem
// selbst — dann greift der Fix sofort, auch bevor die Migration eingespielt
// ist.
// ═══════════════════════════════════════════════════════════════════

/** Werteset des Check-Constraints service_records_status_check. */
export const RECORD_STATUS_WERTE = [
  'draft',
  'incomplete',
  'complete',
  'signed',
  'invoiced',
] as const

export type RecordStatus = (typeof RECORD_STATUS_WERTE)[number]

/** Werteset des Check-Constraints auf service_records.proof_status. */
export const PROOF_STATUS_WERTE = [
  'ENTWURF',
  'ABGESCHLOSSEN',
  'UNTERSCHRIEBEN',
  'ABGERECHNET',
  'STORNIERT',
] as const

export type ProofStatus = (typeof PROOF_STATUS_WERTE)[number]

/**
 * Rangfolge des alten status-Feldes. Nur ein ECHT höherer Rang darf
 * geschrieben werden (monoton vorwärts).
 */
const STATUS_RANG: Record<RecordStatus, number> = {
  draft: 0,
  incomplete: 1,
  complete: 2,
  signed: 3,
  invoiced: 4,
}

/**
 * Abbildung Nachweis-Status → status.
 * 'STORNIERT' fehlt absichtlich (kein Gegenstück im status-Werteset).
 */
export const PROOF_STATUS_ZU_RECORD_STATUS: Partial<Record<ProofStatus, RecordStatus>> = {
  ENTWURF: 'draft',
  ABGESCHLOSSEN: 'complete',
  UNTERSCHRIEBEN: 'signed',
  ABGERECHNET: 'invoiced',
}

/**
 * Liefert den status-Wert, der zu einem proof_status gehört — oder null,
 * wenn der aktuelle status bereits gleich weit oder weiter ist bzw. der
 * proof_status kein Gegenstück hat ('STORNIERT', unbekannte Werte).
 *
 * @param proofStatus  neuer proof_status
 * @param aktuellerStatus  aktuell in der DB stehender status
 * @returns neuer status oder null (= nichts schreiben)
 */
export function statusFuerProofStatus(
  proofStatus: string | null | undefined,
  aktuellerStatus: string | null | undefined,
): RecordStatus | null {
  if (!proofStatus) return null

  const ziel = PROOF_STATUS_ZU_RECORD_STATUS[proofStatus as ProofStatus]
  if (!ziel) return null

  // Unbekannter/leerer Ist-Status → Rang 0 (schlechtestenfalls setzen wir vor).
  const istRang =
    aktuellerStatus && aktuellerStatus in STATUS_RANG
      ? STATUS_RANG[aktuellerStatus as RecordStatus]
      : -1

  return STATUS_RANG[ziel] > istRang ? ziel : null
}

/**
 * Ergänzt ein Update-Objekt für service_records um das synchrone status-Feld.
 *
 * WICHTIG: Der status MUSS im SELBEN UPDATE mitgeschickt werden wie der
 * proof_status. Ein nachgelagertes zweites UPDATE scheitert, sobald der
 * Signatur-Trigger is_locked=true gesetzt hat — prevent_locked_record_change()
 * blockiert dann jede weitere Änderung.
 *
 * @returns Kopie von `updates` inkl. `status`, falls ein Sync nötig ist.
 */
export function mitStatusSync<T extends Record<string, unknown>>(
  updates: T,
  proofStatus: string | null | undefined,
  aktuellerStatus: string | null | undefined,
): T & { status?: RecordStatus } {
  const neuerStatus = statusFuerProofStatus(proofStatus, aktuellerStatus)
  if (!neuerStatus) return updates
  return { ...updates, status: neuerStatus }
}
