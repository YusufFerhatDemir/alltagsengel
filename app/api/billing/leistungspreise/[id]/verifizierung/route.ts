import { handleVerifizierungPatch, handleDetailGet } from '@/lib/billing/tarif-verifizierung-service'
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * GET /api/billing/leistungspreise/[id]/verifizierung
 * Aktueller Stand, Audit-Historie und hinterlegte Belege eines Leistungspreises.
 */
export const GET = withTracking(async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleDetailGet('leistungspreise', id)
})

/**
 * PATCH /api/billing/leistungspreise/[id]/verifizierung
 *
 * Gegenstueck zu /api/billing/tariffs/[id]/verifizierung fuer die zweite
 * Preistabelle. leistungspreise speist den Monatsabschluss und den
 * Kassen-Vorlauf (lib/abrechnung/monatsabschluss.ts) und ist deshalb IMMER
 * belegpflichtig — anders als billing_tariffs gibt es hier keine
 * Privattarif-Ausnahme, weil die Tabelle keine rechtsgrundlage kennt.
 *
 * Body: { status: 'verified' | 'unverified' | 'blocked', quelle: string, belegId?: string }
 */
export const PATCH = withTracking(async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleVerifizierungPatch(request, 'leistungspreise', id)
})
