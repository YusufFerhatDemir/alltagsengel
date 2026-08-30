import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { requireMarketing } from '@/lib/marketing/api-auth'
import { istSegmentKey, segmentAus } from '@/lib/marketing/segmente'
import { istVorlagenKey, vorlageAus } from '@/lib/marketing/vorlagen'
import { leseMarketingFreigabe } from '@/lib/marketing/freigabe'

// ═══════════════════════════════════════════════════════════════════════════
// KAMPAGNEN — Liste und Anlage
//
// Der Dienstschluessel wird hier bewusst benutzt, der Mandantenzaun steht
// im Code (`.eq('organization_id', ctx.organizationId)` in JEDER Abfrage).
// Grund: dieselbe Bauart wie die uebrigen Admin-Routen.
//
// SEGMENT UND VORLAGE WERDEN GEGEN DEN KATALOG GEPRUEFT, nicht gespeichert
// wie geliefert. Ein freier Segmentausdruck aus einem Formular waere eine
// Abfrage, die jemand von aussen schreibt — und die Folge waere nicht ein
// falsches Suchergebnis, sondern Post an den falschen Personenkreis.
// ═══════════════════════════════════════════════════════════════════════════

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const supabase = createAdminClient()
    const url = new URL(request.url)
    const status = url.searchParams.get('status')

    let abfrage = supabase
      .from('email_campaigns')
      // Eine einzige Zeichenkette, nicht zusammengesetzt: supabase-js liest
      // die Spaltenliste beim Typisieren aus dem Literal. Eine mit `+`
      // gebaute Liste kann es nicht lesen und liefert GenericStringError.
      .select('id, name, template_key, segment_key, status, geplant_fuer, dry_run_am, empfaenger_anzahl, freigegeben_am, freigegeben_fuer_anzahl, versendet_am, created_at, updated_at')
      .eq('organization_id', auth.ctx.organizationId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (status) abfrage = abfrage.eq('status', status)

    const { data, error } = await abfrage
    if (error) throw new Error(error.message)

    // Kennzahlen je Kampagne aus der Zustellspur. Getrennte Abfrage statt
    // Join: `email_campaign_logs` ist die Tabelle, die als einzige waechst,
    // und ein Join haette die Kampagnenliste an ihr Wachstum gekoppelt.
    const ids = (data ?? []).map((k) => k.id as string)
    const kennzahlen = new Map<string, Record<string, number>>()

    if (ids.length > 0) {
      const { data: logs, error: logFehler } = await supabase
        .from('email_campaign_logs')
        .select('campaign_id, status, opened_at, clicked_at, bounced_at, unsubscribed_at, delivered_at')
        .in('campaign_id', ids)
      if (logFehler) throw new Error(logFehler.message)

      for (const z of logs ?? []) {
        const id = z.campaign_id as string
        const k = kennzahlen.get(id) ?? {
          gesendet: 0, zugestellt: 0, geoeffnet: 0, geklickt: 0, unzustellbar: 0, abgemeldet: 0, fehler: 0,
        }
        if (z.status === 'fehler') k.fehler += 1
        else if (z.status !== 'geplant') k.gesendet += 1
        if (z.delivered_at) k.zugestellt += 1
        if (z.opened_at) k.geoeffnet += 1
        if (z.clicked_at) k.geklickt += 1
        if (z.bounced_at) k.unzustellbar += 1
        if (z.unsubscribed_at) k.abgemeldet += 1
        kennzahlen.set(id, k)
      }
    }

    return NextResponse.json({
      kampagnen: (data ?? []).map((k) => ({
        ...k,
        segmentName: istSegmentKey(k.segment_key) ? segmentAus(k.segment_key as string).name : null,
        vorlageName: istVorlagenKey(k.template_key) ? vorlageAus(k.template_key as string).name : null,
        kennzahlen: kennzahlen.get(k.id as string) ?? {
          gesendet: 0, zugestellt: 0, geoeffnet: 0, geklickt: 0, unzustellbar: 0, abgemeldet: 0, fehler: 0,
        },
      })),
      // Der Freigabestand gehoert in JEDE Antwort: die Oberflaeche soll
      // nicht raten muessen, ob ein Versand ueberhaupt moeglich waere.
      freigabe: leseMarketingFreigabe(),
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const rumpf = await request.json().catch(() => null)
    const name = typeof rumpf?.name === 'string' ? rumpf.name.trim() : ''
    const templateKey = rumpf?.template_key
    const segmentKey = rumpf?.segment_key
    const geplantFuer = rumpf?.geplant_fuer ?? null

    if (!name) {
      return NextResponse.json({ error: 'Name fehlt.' }, { status: 400 })
    }
    // Fail-closed gegen den Katalog. Ein unbekannter Schluessel ist ein
    // Fehler, kein leeres Segment.
    if (!istVorlagenKey(templateKey)) {
      return NextResponse.json({ error: 'Unbekannte Vorlage.' }, { status: 400 })
    }
    if (!istSegmentKey(segmentKey)) {
      return NextResponse.json({ error: 'Unbekanntes Segment.' }, { status: 400 })
    }

    const vorlage = vorlageAus(templateKey)
    const segment = segmentAus(segmentKey)
    if (vorlage.consentTyp !== segment.consentTyp) {
      return NextResponse.json(
        {
          error:
            `Vorlage „${vorlage.name}" verlangt die Einwilligung „${vorlage.consentTyp}", ` +
            `Segment „${segment.name}" steht auf „${segment.consentTyp}". Diese Kombination ist ` +
            'nicht zulässig — sonst würde eine Einwilligung für etwas anderes verwendet.',
        },
        { status: 400 },
      )
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('email_campaigns')
      .insert({
        organization_id: auth.ctx.organizationId,
        name,
        template_key: vorlage.templateKey,
        segment_key: segment.key,
        // Neue Kampagnen starten IMMER als Entwurf. Ein per Rumpf
        // gesetzter Status waere der Weg, den Freigabeweg zu ueberspringen.
        status: 'entwurf',
        geplant_fuer: geplantFuer,
        erstellt_von: auth.ctx.userId,
      })
      .select('id, name, status')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return safeApiError(err, request)
  }
})
