import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { pruefeZuordnung, gateBerichtText } from '@/lib/pilot/allocation-gate'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'

// ═══════════════════════════════════════════════════════════════
// GET /api/pilot/zuordnung-pruefung
//
// Track 6 von Phase 8, LESENDER TEIL. Was würde passieren, wenn diese
// eine Zahlung auf diese eine Rechnung gebucht würde — alle zehn
// Prüfpunkte, mit Beträgen und Begründung?
//
// ‼️ Diese Route STELLT KEIN TOKEN AUS und BUCHT NICHT. ‼️
// Sie ruft ausschliesslich `pruefeZuordnung()`, die rein liest.
//
// ── WARUM DAS TOKEN NICHT ÜBER HTTP GEHT ───────────────────────
// `oeffneAllocationGate()` und `loeseAllocationGateEin()` sind gebaut
// und geprüft, aber bewusst NICHT als Route freigelegt. Der Weg vom
// eingelösten Token zur echten Buchung ist genau der Schritt, den die
// Stopp-Grenze dieser Phase ausschliesst. Die Funktionen sind da,
// sobald der begleitete Erstlauf ansteht; freigelegt werden sie mit
// ihm — nicht vorher.
//
// ?payment=…&invoice=…&betrag=<Cent>[&kunde=…]
// ?format=text  Bericht zur Gegenzeichnung.
// ═══════════════════════════════════════════════════════════════

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withTracking(async function GET(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen')
    if (!auth.ok) return auth.response
    const { organizationId, userId } = auth.ctx

    const { searchParams } = new URL(req.url)
    const paymentId = searchParams.get('payment')
    const invoiceId = searchParams.get('invoice')
    const betragRoh = Number(searchParams.get('betrag'))

    if (!paymentId || !invoiceId) {
      return NextResponse.json(
        { error: 'payment und invoice sind Pflichtangaben.' },
        { status: 400 },
      )
    }
    if (!Number.isInteger(betragRoh) || betragRoh <= 0) {
      return NextResponse.json(
        { error: 'betrag muss eine positive ganze Zahl in Cent sein.' },
        { status: 400 },
      )
    }

    const ergebnis = await pruefeZuordnung(createAdminClient(), {
      organizationId,
      paymentId,
      invoiceId,
      betragCent: betragRoh,
      erwarteterClientId: searchParams.get('kunde') ?? undefined,
      actorId: userId,
    })

    if (searchParams.get('format') === 'text') {
      return new NextResponse(gateBerichtText(ergebnis), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }
    // Ausdrücklich: dieser Weg gibt NIE ein Token aus. `pruefeZuordnung`
    // setzt es auf null, und hier wird es nicht nachgereicht.
    return NextResponse.json(ergebnis, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return safeApiError(e, req)
  }
})
