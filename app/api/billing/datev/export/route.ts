import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOpsAdmin } from '@/lib/ops/api-auth';
import { erstelleDatevExport, getDatevExportListe, DatevPruefungFehlgeschlagen } from '@/lib/billing/datev/export-service';

/**
 * GET /api/billing/datev/export
 * Liste aller DATEV-Exporte.
 */
export async function GET() {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen');
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
    const auth = await requireOpsAdmin('abrechnung.schreiben');
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
      // Warnungen sind kein Abbruchgrund, muessen aber sichtbar sein.
      // Ohne sie in der Antwort steht der Hinweis „zwei betragsgleiche
      // Vorgaenge — pruefen" nur in der Protokolldatei im Storage, die
      // niemand oeffnet, bevor er importiert.
      pruefung: {
        ok: result.pruefung.ok,
        warnungen: result.pruefung.warnungen,
        kennzahlen: result.pruefung.kennzahlen,
      },
    });
  } catch (e: unknown) {
    // Die Pruefbefunde gehoeren unveraendert in die Antwort. Sonst muesste
    // man den Export ein zweites Mal erzeugen, um zu sehen, was ihn
    // blockiert hat — und genau das erzeugt er absichtlich nicht.
    if (e instanceof DatevPruefungFehlgeschlagen) {
      return NextResponse.json(
        {
          error: 'Der Buchungsstapel hat die Pruefung nicht bestanden. Es wurde keine Datei erzeugt.',
          befunde: e.ergebnis.fehler,
          warnungen: e.ergebnis.warnungen,
          kennzahlen: e.ergebnis.kennzahlen,
        },
        { status: 422 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
