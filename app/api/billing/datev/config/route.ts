import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOpsAdmin } from '@/lib/ops/api-auth';
import { getDatevConfig, saveDatevConfig } from '@/lib/billing/datev/datev-config';

/**
 * GET /api/billing/datev/config
 * Aktuelle DATEV-Konfiguration laden.
 */
export async function GET() {
  try {
    const auth = await requireOpsAdmin();
    if (!auth.ok) return auth.response;
    const supabase = createAdminClient();

    const config = await getDatevConfig(supabase, auth.ctx.organizationId);
    return NextResponse.json(config);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/**
 * PUT /api/billing/datev/config
 * DATEV-Konfiguration speichern.
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin();
    if (!auth.ok) return auth.response;
    const supabase = createAdminClient();

    const body = await req.json();
    await saveDatevConfig(supabase, auth.ctx.organizationId, body);

    const updated = await getDatevConfig(supabase, auth.ctx.organizationId);
    return NextResponse.json(updated);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
