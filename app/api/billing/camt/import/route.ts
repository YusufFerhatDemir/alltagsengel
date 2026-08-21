import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOpsAdmin } from '@/lib/ops/api-auth';
import { parseCamtXml, computeCamtFileHash } from '@/lib/billing/camt/camt-parser';
import { matchBuchung } from '@/lib/billing/matching/matching-engine';
import { verarbeiteRuecklastschrift } from '@/lib/billing/sepa/ruecklastschrift';
import { logBillingAction } from '@/lib/billing/core/audit';
import { safeApiError } from '@/lib/api/error-sanitizer';

/**
 * POST /api/billing/camt/import
 * CAMT-Datei hochladen, parsen und automatisch matchen.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin();
    if (!auth.ok) return auth.response;
    const supabase = createAdminClient();
    const { organizationId, userId } = auth.ctx;

    // FormData mit Datei lesen
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Keine Datei hochgeladen' }, { status: 400 });
    }

    const xmlContent = await file.text();
    if (!xmlContent.trim()) {
      return NextResponse.json({ error: 'Datei ist leer' }, { status: 400 });
    }

    // Duplikatpruefung
    const fileHash = computeCamtFileHash(xmlContent);
    const { data: existing } = await supabase
      .from('camt_imports')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('quelldatei_hash', fileHash)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Diese Datei wurde bereits importiert', importId: existing.id },
        { status: 409 },
      );
    }

    // CAMT parsen
    const parseResult = parseCamtXml(xmlContent);

    if (parseResult.buchungen.length === 0 && parseResult.fehler.length > 0) {
      return NextResponse.json(
        { error: 'Keine Buchungen gefunden', fehler: parseResult.fehler },
        { status: 400 },
      );
    }

    // Import-Datensatz anlegen
    const { data: camtImport, error: importErr } = await supabase
      .from('camt_imports')
      .insert({
        organization_id: organizationId,
        dateiname: file.name,
        buchungen_anzahl: parseResult.buchungen.length,
        status: 'importiert',
        quelldatei_hash: fileHash,
        created_by: userId,
      })
      .select('id')
      .single();

    if (importErr || !camtImport) {
      throw new Error(`Import konnte nicht erstellt werden: ${importErr?.message}`);
    }

    // Buchungen speichern und matchen
    let zugeordnet = 0;
    let klaerfaelle = 0;
    const ergebnisse: {
      buchung: number;
      status: string;
      confidence: number;
      istRuecklastschrift: boolean;
    }[] = [];

    for (let i = 0; i < parseResult.buchungen.length; i++) {
      const buchung = parseResult.buchungen[i];

      // Zahlungseingang speichern
      const { data: ze, error: zeErr } = await supabase
        .from('zahlungseingaenge')
        .insert({
          organization_id: organizationId,
          camt_import_id: camtImport.id,
          buchungsdatum: buchung.buchungsdatum,
          valutadatum: buchung.valutadatum,
          betrag_cent: Math.abs(buchung.betragCent),
          waehrung: buchung.waehrung,
          debitor_name: buchung.debitorName,
          debitor_iban: buchung.debitorIban,
          verwendungszweck: buchung.verwendungszweck,
          end_to_end_id: buchung.endToEndId,
          mandate_id: buchung.mandateId,
          buchungsreferenz: buchung.buchungsreferenz,
          ist_ruecklastschrift: buchung.istRuecklastschrift,
          quelldatei_hash: buchung.buchungsHash,
        })
        .select('id')
        .single();

      if (zeErr || !ze) continue;

      // Ruecklastschrift → spezieller Handler
      if (buchung.istRuecklastschrift) {
        const rlResult = await verarbeiteRuecklastschrift(
          supabase, buchung, ze.id, organizationId, userId,
        );
        ergebnisse.push({
          buchung: i + 1,
          status: rlResult.erkannt ? 'ruecklastschrift_verarbeitet' : 'ruecklastschrift_unklar',
          confidence: 0,
          istRuecklastschrift: true,
        });
        if (rlResult.erkannt) zugeordnet++;
        else klaerfaelle++;
        continue;
      }

      // Normales Matching (nur fuer Haben-Buchungen)
      if (buchung.richtung === 'CRDT') {
        const matchResult = await matchBuchung(
          supabase, buchung, ze.id, organizationId,
        );

        if (matchResult.status === 'automatisch') {
          zugeordnet++;
        } else {
          klaerfaelle++;
          // Klaerfall-Datensatz anlegen
          await supabase.from('klaerfaelle').insert({
            organization_id: organizationId,
            zahlungseingang_id: ze.id,
            grund: matchResult.klaerfallGrund || 'Keine Zuordnung moeglich',
            vorschlaege: matchResult.kandidaten,
            status: 'offen',
          });
        }

        ergebnisse.push({
          buchung: i + 1,
          status: matchResult.status,
          confidence: matchResult.confidence,
          istRuecklastschrift: false,
        });
      }
    }

    // Import-Statistik aktualisieren
    await supabase
      .from('camt_imports')
      .update({
        zugeordnet_anzahl: zugeordnet,
        klaerfaelle_anzahl: klaerfaelle,
        status: 'verarbeitet',
      })
      .eq('id', camtImport.id);

    await logBillingAction(supabase, {
      entityType: 'camt_import',
      entityId: camtImport.id,
      organizationId,
      action: 'imported',
      newState: {
        dateiname: file.name,
        format: parseResult.format,
        buchungen: parseResult.buchungen.length,
        zugeordnet,
        klaerfaelle,
      },
      actorId: userId,
    });

    return NextResponse.json({
      importId: camtImport.id,
      format: parseResult.format,
      kontoIban: parseResult.kontoIban,
      buchungenGesamt: parseResult.buchungen.length,
      zugeordnet,
      klaerfaelle,
      parseFehler: parseResult.fehler,
      ergebnisse,
    }, { status: 201 });

  } catch (e) {
    return safeApiError(e, req);
  }
}
