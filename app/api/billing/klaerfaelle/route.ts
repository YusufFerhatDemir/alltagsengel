import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOpsAdmin } from '@/lib/ops/api-auth';

/**
 * GET /api/billing/klaerfaelle
 * Offene Klaerfaelle abrufen.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen');
    if (!auth.ok) return auth.response;
    const supabase = createAdminClient();

    const sp = req.nextUrl.searchParams;
    const status = sp.get('status') || 'offen';

    let query = supabase
      .from('klaerfaelle')
      .select(`
        id, grund, vorschlaege, status, bearbeitet_am,
        zahlungseingang:zahlungseingaenge(
          id, buchungsdatum, betrag_cent, debitor_name, debitor_iban,
          verwendungszweck, ist_ruecklastschrift
        )
      `)
      .eq('organization_id', auth.ctx.organizationId)
      .order('created_at', { ascending: false });

    if (status !== 'alle') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json(data || []);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
