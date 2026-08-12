import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOpsAdmin } from '@/lib/ops/api-auth';

/**
 * GET /api/billing/camt/imports
 * Import-Historie abrufen.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin();
    if (!auth.ok) return auth.response;
    const supabase = createAdminClient();

    const sp = req.nextUrl.searchParams;
    const limit = Math.min(parseInt(sp.get('limit') || '50', 10), 200);
    const offset = parseInt(sp.get('offset') || '0', 10);

    const { data, error, count } = await supabase
      .from('camt_imports')
      .select('*', { count: 'exact' })
      .eq('organization_id', auth.ctx.organizationId)
      .order('import_datum', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);

    return NextResponse.json({ imports: data || [], total: count || 0 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
