import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { requireMarketing } from '@/lib/marketing/api-auth'
import { istKampagnenStatus } from '@/lib/marketing/typen'
import { pruefeVersandtore, type Kampagne } from '@/lib/marketing/versand'
import { leseMarketingFreigabe } from '@/lib/marketing/freigabe'

// ═══════════════════════════════════════════════════════════════════════════
// EINZELNE KAMPAGNE — lesen, Status ändern, freigeben
//
// ── DER FREIGABEWEG IST DER KERN DIESER DATEI ──────────────────────────────
// `PATCH { freigeben: true }` bindet die Freigabe an die ZAHL, die beim
// letzten Trockenlauf ermittelt wurde. Waechst das Segment danach, gilt die
// Freigabe nicht mehr (geprueft in pruefeVersandtore). Ohne diese Bindung
// waere „ich habe 12 Empfaenger freigegeben" die Grundlage fuer einen
// Versand an 1200.
//
// Eine Freigabe OHNE vorherigen Trockenlauf ist nicht moeglich — der CHECK
// email_campaigns_freigabe_braucht_dry_run weist sie schon in der Datenbank
// ab. Die Pruefung steht hier trotzdem, damit die Antwort eine Erklaerung
// traegt und kein 'Interner Serverfehler'.
//
// ── STILLE FELDVERWERFUNG ──────────────────────────────────────────────────
// Unbekannte Felder im Rumpf werden ABGEWIESEN, nicht verworfen. Ein
// verworfenes Feld erzeugt ein gruenes „Gespeichert" ohne Speicherung —
// derselbe Befund wie bei den Stammdaten.
// ═══════════════════════════════════════════════════════════════════════════

const ERLAUBTE_FELDER = new Set(['name', 'status', 'geplant_fuer', 'freigeben', 'freigabe_zuruecknehmen'])

async function ladeKampagne(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
  organizationId: string,
): Promise<Kampagne | null> {
  const { data, error } = await supabase
    .from('email_campaigns')
    // Einzelnes Literal — supabase-js typisiert nur daraus (siehe
    // campaigns/route.ts).
    .select('id, organization_id, name, template_key, segment_key, status, dry_run_am, dry_run_ergebnis, empfaenger_anzahl, freigegeben_am, freigegeben_von, freigegeben_fuer_anzahl, versendet_am, versendet_von, geplant_fuer, created_at, updated_at')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as unknown as Kampagne | null) ?? null
}

export const GET = withTracking(async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const supabase = createAdminClient()
    const kampagne = await ladeKampagne(supabase, id, auth.ctx.organizationId)
    if (!kampagne) return NextResponse.json({ error: 'Kampagne nicht gefunden.' }, { status: 404 })

    const { data: logs, error: logFehler } = await supabase
      .from('email_campaign_logs')
      .select('status, sent_at, delivered_at, opened_at, clicked_at, bounced_at, unsubscribed_at, fehler_text')
      .eq('campaign_id', id)
      .eq('organization_id', auth.ctx.organizationId)
    if (logFehler) throw new Error(logFehler.message)

    const zeilen = logs ?? []
    const kennzahlen = {
      empfaenger: zeilen.length,
      gesendet: zeilen.filter((z) => z.sent_at).length,
      zugestellt: zeilen.filter((z) => z.delivered_at).length,
      geoeffnet: zeilen.filter((z) => z.opened_at).length,
      geklickt: zeilen.filter((z) => z.clicked_at).length,
      unzustellbar: zeilen.filter((z) => z.bounced_at).length,
      abgemeldet: zeilen.filter((z) => z.unsubscribed_at).length,
      fehler: zeilen.filter((z) => z.status === 'fehler').length,
    }

    // Die Tore werden gegen die ZULETZT ermittelte Empfaengerzahl geprueft,
    // nicht gegen eine frisch geladene: das GET soll anzeigen, nicht rechnen.
    const tore = pruefeVersandtore(kampagne, kampagne.empfaenger_anzahl ?? 0)

    return NextResponse.json({
      kampagne,
      kennzahlen,
      versandtore: tore,
      freigabe: leseMarketingFreigabe(),
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const PATCH = withTracking(async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const rumpf = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!rumpf || typeof rumpf !== 'object') {
      return NextResponse.json({ error: 'Kein Rumpf.' }, { status: 400 })
    }

    const unbekannt = Object.keys(rumpf).filter((k) => !ERLAUBTE_FELDER.has(k))
    if (unbekannt.length > 0) {
      return NextResponse.json(
        { error: `Unbekannte Felder: ${unbekannt.join(', ')}. Nichts wurde gespeichert.` },
        { status: 400 },
      )
    }

    const supabase = createAdminClient()
    const kampagne = await ladeKampagne(supabase, id, auth.ctx.organizationId)
    if (!kampagne) return NextResponse.json({ error: 'Kampagne nicht gefunden.' }, { status: 404 })

    if (kampagne.versendet_am) {
      return NextResponse.json(
        { error: 'Eine versendete Kampagne lässt sich nicht mehr ändern.' },
        { status: 409 },
      )
    }

    const aenderung: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (typeof rumpf.name === 'string') {
      const name = rumpf.name.trim()
      if (!name) return NextResponse.json({ error: 'Name darf nicht leer sein.' }, { status: 400 })
      aenderung.name = name
    }

    if (rumpf.status !== undefined) {
      if (!istKampagnenStatus(rumpf.status)) {
        return NextResponse.json({ error: 'Unbekannter Status.' }, { status: 400 })
      }
      // 'versendet' laesst sich NICHT von Hand setzen. Dieser Status
      // entsteht ausschliesslich im Versandweg, zusammen mit versendet_am —
      // sonst waere er ein Etikett ohne Vorgang dahinter.
      if (rumpf.status === 'versendet') {
        return NextResponse.json(
          { error: 'Der Status „versendet" entsteht nur durch einen tatsächlichen Versand.' },
          { status: 400 },
        )
      }
      aenderung.status = rumpf.status
    }

    if (rumpf.geplant_fuer !== undefined) {
      aenderung.geplant_fuer = rumpf.geplant_fuer === null ? null : String(rumpf.geplant_fuer)
    }

    // ── Freigabe ─────────────────────────────────────────────────────────
    if (rumpf.freigeben === true) {
      if (!kampagne.dry_run_am || kampagne.empfaenger_anzahl == null) {
        return NextResponse.json(
          {
            error:
              'Vor der Freigabe muss ein Trockenlauf laufen. Niemand gibt eine Empfängerzahl frei, ' +
              'die er nicht gesehen hat.',
          },
          { status: 400 },
        )
      }
      aenderung.freigegeben_am = new Date().toISOString()
      aenderung.freigegeben_von = auth.ctx.userId
      // Die Zahl AUS DEM TROCKENLAUF, nicht die aktuelle. Genau darin
      // besteht die Bindung.
      aenderung.freigegeben_fuer_anzahl = kampagne.empfaenger_anzahl
    }

    if (rumpf.freigabe_zuruecknehmen === true) {
      aenderung.freigegeben_am = null
      aenderung.freigegeben_von = null
      aenderung.freigegeben_fuer_anzahl = null
    }

    // `.select()` ist der Wirkungsnachweis — ohne ihn meldet PostgREST
    // keinen Fehler, wenn NULL Zeilen getroffen wurden.
    const { data, error } = await supabase
      .from('email_campaigns')
      .update(aenderung)
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .is('versendet_am', null)
      .select('id, name, status, freigegeben_am, freigegeben_fuer_anzahl, geplant_fuer')

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Nichts geändert — die Kampagne wurde zwischenzeitlich versendet oder entfernt.' },
        { status: 409 },
      )
    }

    return NextResponse.json(data[0])
  } catch (err) {
    return safeApiError(err, request)
  }
})
