import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { fuehreSammelrechnungslaufAus } from '@/lib/billing/core'
import { safeApiError } from '@/lib/api/error-sanitizer'

// ═══════════════════════════════════════════════════════════════
// SAMMELRECHNUNGSLAUF (Batch-Invoicing)
// ═══════════════════════════════════════════════════════════════
//
// GET  ?month=YYYY-MM   → Vorschau: welche Gruppen wären abrechenbar,
//                         welche werden warum übersprungen. Schreibt nichts.
// POST { month, … }     → Lauf. Erzeugt Entwürfe über dieselbe Engine wie
//                         die Einzelerstellung (createInvoiceDraft →
//                         create_invoice_draft_atomic), inklusive aller
//                         Sperren: Tarif-Fail-Closed, Unterschriftspflicht,
//                         Budgetdeckel § 45b / § 42a.
//
// Body (POST):
//   month           string   Pflicht, YYYY-MM
//   dryRun          boolean  nur prüfen (Standard: false)
//   clientIds       string[] auf einzelne Klienten einschränken
//   festschreiben   boolean  Entwurf → geprüft → festgeschrieben
//                            (Standard: false — die Festschreibung ist der
//                            Punkt, ab dem nur noch Storno korrigiert)
//
// VERSAND: nicht über den Body steuerbar. Der automatische Versand hängt
// allein an RECHNUNGSVERSAND_AUTOMATISCH='1' UND `festschreiben` — ein
// Browser-Feld dafür wäre ein Knopf, der ohne Gegenprüfung echte Post an
// echte Kunden auslöst.
// ═══════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

function leseMonat(wert: unknown): string | null {
  return typeof wert === 'string' && /^\d{4}-\d{2}$/.test(wert) ? wert : null
}

export async function GET(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response
  const { organizationId, userId } = auth.ctx

  try {
    const { searchParams } = new URL(request.url)
    const month = leseMonat(searchParams.get('month'))
    if (!month) {
      return NextResponse.json({ error: 'month im Format YYYY-MM erforderlich.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const ergebnis = await fuehreSammelrechnungslaufAus(admin, {
      organizationId,
      periodMonth: month,
      actorId: userId,
      dryRun: true,
    })

    return NextResponse.json(ergebnis)
  } catch (err) {
    return safeApiError(err, request)
  }
}

export async function POST(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response
  const { organizationId, userId } = auth.ctx

  try {
    const body = await request.json().catch(() => ({}))
    const month = leseMonat((body as Record<string, unknown>).month)
    if (!month) {
      return NextResponse.json({ error: 'month im Format YYYY-MM erforderlich.' }, { status: 400 })
    }

    const rohClientIds = (body as Record<string, unknown>).clientIds
    const clientIds = Array.isArray(rohClientIds)
      ? rohClientIds.filter((v): v is string => typeof v === 'string')
      : undefined

    const dryRun = (body as Record<string, unknown>).dryRun === true
    const festschreiben = (body as Record<string, unknown>).festschreiben === true

    // Auto-Versand nur, wenn ausdrücklich freigeschaltet UND festgeschrieben
    // wird. Ohne das Flag entstehen Entwürfe/Belege, aber es verlässt nichts
    // das Haus — Nachsenden geht jederzeit über
    // POST /api/billing/invoices/[id]/versenden.
    const autoVersand = festschreiben && process.env.RECHNUNGSVERSAND_AUTOMATISCH === '1'

    const admin = createAdminClient()
    const ergebnis = await fuehreSammelrechnungslaufAus(admin, {
      organizationId,
      periodMonth: month,
      actorId: userId,
      dryRun,
      clientIds,
      festschreiben,
      autoVersand,
    })

    return NextResponse.json(ergebnis, { status: dryRun ? 200 : 201 })
  } catch (err) {
    return safeApiError(err, request)
  }
}
