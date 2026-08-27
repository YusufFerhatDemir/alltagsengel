import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOpsAdmin } from '@/lib/ops/api-auth';
import { downloadDatevExport } from '@/lib/billing/datev/export-service';
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * GET /api/billing/datev/export/[id]/download
 * Laed die DATEV-Export-Dateien (CSV + Protokoll) als ZIP herunter.
 *
 * Da serverseitiges ZIP-Erstellen ohne externe Pakete komplex ist,
 * liefern wir die CSV direkt. Fuer ein ZIP-Bundle kann spaeter
 * JSZip oder archiver ergaenzt werden.
 */
export const GET = withTracking(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen');
    if (!auth.ok) return auth.response;
    const supabase = createAdminClient();
    const { id } = await params;

    const result = await downloadDatevExport(supabase, auth.ctx.organizationId, id);

    // CSV-Download als Response
    return new NextResponse(result.csv as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=windows-1252',
        'Content-Disposition': `attachment; filename="${result.dateiname}.csv"`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
})
