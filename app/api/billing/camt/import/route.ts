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
    const auth = await requireOpsAdmin('abrechnung.schreiben');
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

    // ── Ganz oder gar nicht ──
    // Vorher wurde nur abgebrochen, wenn KEINE einzige Buchung lesbar war.
    // Waren 9 von 10 Zeilen lesbar, importierte die Route die 9 mit Status
    // 201 und legte die zehnte nur als Text in `parseFehler` ab — in einem
    // Kontoauszug ist das eine stille Luecke: der Saldo stimmt nicht mehr,
    // und niemand sieht an den Zahlungseingaengen, dass etwas fehlt.
    // Ein abgewiesener Auszug ist reparierbar, ein halb importierter nicht.
    if (parseResult.fehler.length > 0) {
      return NextResponse.json(
        {
          error: 'Kontoauszug nicht vollständig lesbar — es wurde nichts importiert.',
          fehler: parseResult.fehler,
          buchungenLesbar: parseResult.buchungen.length,
        },
        { status: 400 },
      );
    }

    if (parseResult.buchungen.length === 0) {
      return NextResponse.json(
        { error: 'Keine Buchungen in der Datei gefunden' },
        { status: 400 },
      );
    }

    // ── Nur endgueltig gebuchte Posten ──
    // PDNG (vorgemerkt) und INFO sind keine Geldeingaenge: sie koennen noch
    // wegfallen. Wuerden sie als Zahlungseingang verbucht, gaelte eine
    // Rechnung als bezahlt, bevor das Geld da ist. Sie erscheinen im
    // naechsten Auszug erneut, dann mit BOOK.
    const vorgemerkt = parseResult.buchungen.filter(b => !b.istGebucht);
    const zuVerarbeiten = parseResult.buchungen.filter(b => b.istGebucht);

    if (zuVerarbeiten.length === 0) {
      return NextResponse.json(
        {
          error: 'Die Datei enthält ausschließlich vorgemerkte Buchungen (nicht BOOK) — nichts zu verbuchen.',
          vorgemerkt: vorgemerkt.length,
        },
        { status: 400 },
      );
    }

    // Import-Datensatz anlegen
    const { data: camtImport, error: importErr } = await supabase
      .from('camt_imports')
      .insert({
        organization_id: organizationId,
        dateiname: file.name,
        buchungen_anzahl: zuVerarbeiten.length,
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
      /** Woran die Ruecklastschrift erkannt wurde — null, wenn keine. */
      ruecklastschriftGrund: string | null;
    }[] = [];

    /** Buchungen, deren Zeile nicht angelegt werden konnte (siehe unten). */
    const nichtGespeichert: { buchung: number; grund: string }[] = [];
    /** Ausgehende Zahlungen, die keine Ruecklastschrift sind. */
    let ausgehendeUebersprungen = 0;

    for (let i = 0; i < zuVerarbeiten.length; i++) {
      const buchung = zuVerarbeiten[i];

      // ── Ausgehende Zahlung, die keine Ruecklastschrift ist ──
      // Sie gehoert nicht in `zahlungseingaenge`: dort wurde sie mit
      // `Math.abs()` als POSITIVER Eingang gespeichert, obwohl Geld
      // abgeflossen ist. Eine eigene Lohn- oder Lieferantenueberweisung
      // sah damit wie ein Kundenzahlung aus. Nur Ruecklastschriften
      // brauchen als DBIT-Buchung eine Zeile — der Handler haengt daran.
      if (buchung.richtung === 'DBIT' && !buchung.istRuecklastschrift) {
        ausgehendeUebersprungen++;
        continue;
      }

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

      if (zeErr || !ze) {
        // Vorher: stilles `continue`. Der Import galt anschliessend als
        // 'verarbeitet', obwohl eine Buchung des Auszugs fehlte — ohne
        // Zaehler, ohne Meldung, ohne Spur in der Antwort.
        nichtGespeichert.push({
          buchung: i + 1,
          grund: zeErr?.message || 'Zahlungseingang konnte nicht angelegt werden',
        });
        continue;
      }

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
          ruecklastschriftGrund: buchung.ruecklastschriftGrund,
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
          ruecklastschriftGrund: null,
        });
      }
    }

    // Import-Statistik aktualisieren
    await supabase
      .from('camt_imports')
      .update({
        zugeordnet_anzahl: zugeordnet,
        klaerfaelle_anzahl: klaerfaelle,
        // Ein Import mit fehlenden Zeilen ist nicht 'verarbeitet' — sonst
        // sieht er in jeder Uebersicht abgeschlossen aus. 'fehler' ist der
        // dafuer vorgesehene Wert; die CHECK-Beschraenkung der Spalte laesst
        // nur importiert|verarbeitet|fehler zu (Migration 20260825010000),
        // ein neuer Wert waere still an 23514 gescheitert.
        status: nichtGespeichert.length > 0 ? 'fehler' : 'verarbeitet',
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
        buchungen: zuVerarbeiten.length,
        vorgemerkt_uebersprungen: vorgemerkt.length,
        ausgehende_uebersprungen: ausgehendeUebersprungen,
        nicht_gespeichert: nichtGespeichert.length,
        zugeordnet,
        klaerfaelle,
      },
      actorId: userId,
    });

    return NextResponse.json({
      importId: camtImport.id,
      format: parseResult.format,
      kontoIban: parseResult.kontoIban,
      buchungenGesamt: zuVerarbeiten.length,
      // Vorgemerkte Posten sind bewusst NICHT verbucht — die Zahl muss
      // sichtbar sein, sonst sieht ein unvollstaendiger Import vollstaendig aus.
      vorgemerktUebersprungen: vorgemerkt.length,
      ausgehendeUebersprungen,
      nichtGespeichert,
      zugeordnet,
      klaerfaelle,
      ergebnisse,
    }, { status: 201 });

  } catch (e) {
    return safeApiError(e, req);
  }
}
