import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOpsAdmin } from '@/lib/ops/api-auth';
import { manuellZuordnen } from '@/lib/billing/matching/matching-engine';
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * POST /api/billing/klaerfaelle/[id]/zuordnen
 * Klaerfall manuell einer Rechnung zuordnen.
 * Body: { invoiceId: string }
 */
export const POST = withTracking(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireOpsAdmin('abrechnung.schreiben');
    if (!auth.ok) return auth.response;
    const supabase = createAdminClient();

    const { id } = await params;
    const body = await req.json();
    const { invoiceId } = body;

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId ist erforderlich' }, { status: 400 });
    }

    const result = await manuellZuordnen(
      supabase,
      id,
      invoiceId,
      auth.ctx.organizationId,
      auth.ctx.userId,
    );

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
})
