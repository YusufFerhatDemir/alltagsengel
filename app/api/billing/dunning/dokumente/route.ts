import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createMahnungDocument, generateMahnungEmail } from '@/lib/billing/dunning/mahnung-pdf'
import type { DunningLevel } from '@/lib/billing/core/dunning'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const body = await req.json()
    const { invoiceId, dunningEntryId, dunningLevel } = body

    if (!invoiceId || !dunningEntryId || !dunningLevel) {
      return NextResponse.json(
        { error: 'invoiceId, dunningEntryId und dunningLevel sind erforderlich.' },
        { status: 400 }
      )
    }

    const result = await createMahnungDocument(supabase, {
      organizationId: auth.ctx.organizationId,
      invoiceId,
      dunningEntryId,
      dunningLevel: dunningLevel as DunningLevel,
      actorId: auth.ctx.userId,
    })

    // E-Mail-Inhalt dazugeben
    const emailContent = generateMahnungEmail(result.mahnungData)

    return NextResponse.json({
      documentId: result.documentId,
      html: result.html,
      paymentDeadline: result.paymentDeadline,
      email: emailContent,
    }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
