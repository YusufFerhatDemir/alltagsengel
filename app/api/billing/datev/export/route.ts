import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOpsAdmin } from '@/lib/ops/api-auth';
import { erstelleDatevExport, getDatevExportListe } from '@/lib/billing/datev/export-service';

/**
 * GET /api/billing/datev/export
 * Liste aller DATEV-Exporte.
 */
export async function GET() {
  try {
    const auth = await requireOpsAdmin();
    if (!auth.ok) return auth.response;
    const supabase = createAdminClient();

    const liste = await getDatevExportListe(supabase, auth.ctx.organizationId);
    return NextResponse.json(liste);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/**
 * POST /api/billing/datev/export
 * Neuen DATEV-Export erstellen.
 * Body: { zeitraumVon: string, zeitraumBis: string, force?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin();
    if (!auth.ok) return auth.response;
    const supabase = createAdminClient();

    const body = await req.json();
    const { zeitraumVon, zeitraumBis, force } = body;

    if (!zeitraumVon || !zeitraumBis) {
      return NextResponse.json(
        { error: 'zeitraumVon und zeitraumBis sind Pflichtfelder.' },
        { status: 400 },
      );
    }

    const result = await erstelleDatevExport(supabase, {
      organizationId: auth.ctx.organizationId,
      zeitraumVon,
      zeitraumBis,
      actorId: auth.ctx.userId,
      force: !!force,
    });

    return NextResponse.json({
      exportId: result.exportId,
      buchungenAnzahl: result.buchungenAnzahl,
      statistik: result.statistik,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
