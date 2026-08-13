import { NextResponse } from 'next/server'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { kimKanalStatus, versucheKimOperation } from '@/lib/kim/adapter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/kim/adapter
 *
 * Zustand der KIM-Schnittstelle: Gate, registrierter Provider, Versandpfad.
 *
 * POST /api/billing/kim/adapter  → Selbsttest
 * Body: { "operation": "status", "provider_nachricht_id": "…" }
 *
 * Der Selbsttest ruft die Adapter-Operation echt auf. Ohne registrierten
 * Provider oder bei geschlossenem Gate kommt eine erklärte 409 zurück —
 * genau das ist der erwartete Zustand, und der Aufruf beweist, dass die
 * Sperre greift, statt sie nur zu behaupten.
 */
export async function GET() {
  const auth = await requireAdminMitOrg()
  if (!auth.ok) return auth.response
  return NextResponse.json(kimKanalStatus())
}

export async function POST(request: Request) {
  const auth = await requireAdminMitOrg()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    // Ohne Body: Statusabfrage mit Platzhalter-Kennung.
  }

  const providerNachrichtId = typeof body.provider_nachricht_id === 'string'
    ? body.provider_nachricht_id
    : 'selbsttest'

  const ergebnis = await versucheKimOperation('status', adapter =>
    adapter.status({ organizationId: auth.organizationId, providerNachrichtId }),
  )

  if (!ergebnis.ok) {
    return NextResponse.json(
      { ...ergebnis, kanal: kimKanalStatus() },
      { status: ergebnis.code === 'FEHLER' ? 500 : 409 },
    )
  }

  return NextResponse.json({ ...ergebnis, kanal: kimKanalStatus() })
}
