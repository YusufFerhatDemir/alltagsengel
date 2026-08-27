import { handleVerifizierungPatch, handleDetailGet } from '@/lib/billing/tarif-verifizierung-service'
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * GET /api/billing/tariffs/[id]/verifizierung
 * Aktueller Stand, Audit-Historie und hinterlegte Belege eines Tarifs.
 */
export const GET = withTracking(async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleDetailGet('billing_tariffs', id)
})

/**
 * PATCH /api/billing/tariffs/[id]/verifizierung
 *
 * Der EINZIGE zulaessige Anwendungs-Weg, tarif_status zu aendern. POST
 * /api/billing/tariffs ignoriert tarif_status im Body bewusst — neue Tarife
 * starten immer als 'unverified'.
 *
 * Freigabe (verified) verlangt Admin-Rechte, eine Rechtsquelle und — bei
 * kassenrelevanten Tarifen — einen zuvor hochgeladenen Primaerbeleg. Dieselbe
 * Regel erzwingt der DB-Trigger trg_verifizierung_belegpflicht auf jedem
 * Schreibweg (Migration 20260904000000); die Pruefung hier liefert nur die
 * verstaendlichere Fehlermeldung.
 *
 * Jede Aenderung landet in billing_tariff_audit (Trigger trg_billing_tariff_audit)
 * inklusive Beleg-Referenz.
 *
 * Body: { status: 'verified' | 'unverified' | 'blocked', quelle: string, belegId?: string }
 */
export const PATCH = withTracking(async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleVerifizierungPatch(request, 'billing_tariffs', id)
})
