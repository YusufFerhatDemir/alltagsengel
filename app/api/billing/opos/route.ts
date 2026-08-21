import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOpsAdmin } from '@/lib/ops/api-auth';
import { getOposListe, type OposFilter } from '@/lib/billing/opos/opos-manager';
import { safeApiError } from '@/lib/api/error-sanitizer';

/**
 * GET /api/billing/opos
 * Offene-Posten-Liste mit optionalen Filtern.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin();
    if (!auth.ok) return auth.response;
    const supabase = createAdminClient();

    const sp = req.nextUrl.searchParams;
    const filter: OposFilter = {};

    const status = sp.get('status');
    if (status === 'offen' || status === 'teilweise_bezahlt') {
      filter.status = status;
    }

    const clientId = sp.get('clientId');
    if (clientId) filter.clientId = clientId;

    const dunningLevel = sp.get('dunningLevel');
    if (dunningLevel) filter.dunningLevel = dunningLevel;

    const minAlter = sp.get('minAlterTage');
    if (minAlter) filter.minAlterTage = parseInt(minAlter, 10);

    const maxAlter = sp.get('maxAlterTage');
    if (maxAlter) filter.maxAlterTage = parseInt(maxAlter, 10);

    const data = await getOposListe(supabase, auth.ctx.organizationId, filter);
    return NextResponse.json(data);
  } catch (e) {
    return safeApiError(e, req);
  }
}
