import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOpsAdmin } from '@/lib/ops/api-auth';
import { getKontenzuordnungen, upsertKontenzuordnung } from '@/lib/billing/datev/kontenrahmen';
import { logBillingAction } from '@/lib/billing/core/audit';

/**
 * GET /api/billing/datev/kontenzuordnung
 * Alle Kontenzuordnungen laden.
 */
export async function GET() {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen');
    if (!auth.ok) return auth.response;
    const supabase = createAdminClient();

    const zuordnungen = await getKontenzuordnungen(supabase, auth.ctx.organizationId);
    return NextResponse.json(zuordnungen);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/**
 * POST /api/billing/datev/kontenzuordnung
 * Kontenzuordnung erstellen/aendern.
 * Body: { clientId: string, debitorennummer: string }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin('abrechnung.schreiben');
    if (!auth.ok) return auth.response;
    const supabase = createAdminClient();

    const body = await req.json();
    const { clientId, debitorennummer } = body;

    if (!clientId || !debitorennummer) {
      return NextResponse.json(
        { error: 'clientId und debitorennummer sind Pflichtfelder.' },
        { status: 400 },
      );
    }

    await upsertKontenzuordnung(supabase, auth.ctx.organizationId, clientId, debitorennummer);

    await logBillingAction(supabase, {
      entityType: 'datev_kontenzuordnung',
      organizationId: auth.ctx.organizationId,
      entityId: clientId,
      action: 'upserted',
      newState: { debitorennummer },
      actorId: auth.ctx.userId,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
