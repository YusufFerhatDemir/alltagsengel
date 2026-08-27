/**
 * VP/KZP — Jahresuebersicht und Vorabpruefung
 *
 * GET  /api/admin/vpkzp?jahr=2026        Jahresstaende aller Klienten
 * POST /api/admin/vpkzp                  Pruefprotokoll zu einer geplanten Buchung
 *
 * Die POST-Route BUCHT NICHT. Sie liefert ausschliesslich das Ergebnis des
 * Pruefprotokolls, damit die Oberflaeche vor dem Anlegen zeigen kann, was
 * gedeckt ist und was nicht. Das Anlegen selbst laeuft ueber
 * vpkzp_buchungen; die Datenbank haelt dort mit Trigger und CHECKs
 * dieselben Grenzen ein — eine Route ist eine Bequemlichkeit, keine Sperre.
 */

import { NextResponse } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ladeBestand,
  ladeJahresUebersicht,
  offeneFachfragenAlsBefunde,
  pruefeBuchung,
  VpKzpLageNichtErmittelbarError,
} from '@/lib/billing/vpkzp'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'

const log = logger.child('api:vpkzp')

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const roh = url.searchParams.get('jahr')
    const jahr = roh ? Number(roh) : new Date().getFullYear()

    if (!Number.isInteger(jahr) || jahr < 2024 || jahr > 2100) {
      return NextResponse.json(
        { error: 'Parameter "jahr" muss eine Jahreszahl ab 2024 sein.' },
        { status: 400 },
      )
    }

    const zeilen = await ladeJahresUebersicht(createAdminClient(), {
      organizationId: auth.ctx.organizationId,
      jahr,
    })

    return NextResponse.json({
      jahr,
      zeilen,
      offeneFachfragen: offeneFachfragenAlsBefunde(),
    })
  } catch (err) {
    if (err instanceof VpKzpLageNichtErmittelbarError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    log.errorWithException('VP/KZP-Uebersicht fehlgeschlagen', err)
    return NextResponse.json(
      { error: 'Jahresuebersicht konnte nicht geladen werden.' },
      { status: 500 },
    )
  }
})

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungueltiger Anfragekoerper.' }, { status: 400 })
    }

    const { clientId, art, von, bis, betragEuro, tarif } = body as Record<string, unknown>

    if (!clientId || !von || !bis) {
      return NextResponse.json(
        { error: 'clientId, von und bis sind erforderlich.' },
        { status: 400 },
      )
    }

    const zeitraum = { von: String(von), bis: String(bis) }
    const supabase = createAdminClient()

    // Mandant kommt IMMER aus dem Sitzungskontext, nie aus dem Anfragekoerper
    // — sonst kann ein Aufrufer die Pruefung gegen einen fremden Mandanten
    // laufen lassen und dessen Jahresstaende auslesen.
    const organizationId = auth.ctx.organizationId

    const bestand = await ladeBestand(supabase, {
      clientId: String(clientId),
      organizationId,
      zeitraum,
    })

    const ergebnis = pruefeBuchung({
      organizationId,
      clientId: String(clientId),
      art: String(art ?? ''),
      zeitraum,
      betragEuro: Number(betragEuro ?? 0),
      pflegegrad: bestand.pflegegrad,
      // Kein Tarif im Anfragekoerper heisst: kein verifizierter Tarif.
      // Das Pruefprotokoll lehnt dann mit TARIF_NICHT_VERIFIZIERT ab.
      tarif: (tarif ?? null) as Parameters<typeof pruefeBuchung>[0]['tarif'],
      staende: bestand.staende,
      bestand: bestand.bestand,
    })

    return NextResponse.json({ ergebnis })
  } catch (err) {
    if (err instanceof VpKzpLageNichtErmittelbarError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    log.errorWithException('VP/KZP-Pruefung fehlgeschlagen', err)
    return NextResponse.json(
      { error: 'Pruefung konnte nicht durchgefuehrt werden.' },
      { status: 500 },
    )
  }
})
