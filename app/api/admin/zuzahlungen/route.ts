import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** §61 SGB V: max. 28 Kalendertage/Jahr werden auf die Zuzahlungspflicht angerechnet. */
const JAHRESGRENZE_TAGE = 28

const ERLAUBTE_FELDER = [
  'client_id', 'verordnung_id', 'invoice_id', 'jahr', 'betrag', 'tage',
  'faellig_am', 'befreit', 'befreiung_gueltig_von', 'befreiung_gueltig_bis',
  'befreiung_nachweis_hochgeladen', 'bemerkung',
] as const

function nurErlaubteFelder(roh: Record<string, unknown>): Record<string, unknown> {
  const sauber: Record<string, unknown> = {}
  for (const feld of ERLAUBTE_FELDER) {
    if (roh[feld] !== undefined) sauber[feld] = roh[feld]
  }
  return sauber
}

/** GET — Zuzahlungen, optional gefiltert nach Klient/Jahr; inkl. Jahresstand (§61-28-Tage-Grenze). */
export async function GET(request: NextRequest) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const params = request.nextUrl.searchParams
    const clientId = params.get('clientId')
    const jahr = params.get('jahr')

    const admin = createAdminClient()
    let query = admin
      .from('zuzahlungen')
      .select('id, client_id, jahr, betrag, tage, grundlage, faellig_am, bezahlt, bezahlt_am, befreit, befreiung_gueltig_von, befreiung_gueltig_bis, befreiung_nachweis_hochgeladen, bemerkung, created_at, clients(first_name, last_name)')
      .eq('organization_id', auth.ctx.organizationId)
      .order('faellig_am', { ascending: false, nullsFirst: false })

    if (clientId) query = query.eq('client_id', clientId)
    if (jahr) query = query.eq('jahr', Number(jahr))

    const { data, error } = await query
    if (error) {
      console.error('[admin/zuzahlungen] Laden fehlgeschlagen:', error.message)
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }

    // Jahresstand pro Klient/Jahr (28-Tage-Grenze §61 SGB V) — nicht angerechnet,
    // wenn für den Zeitraum eine Befreiung vorliegt.
    const jahresstand = new Map<string, number>()
    for (const z of data ?? []) {
      if (z.befreit) continue
      const key = `${z.client_id}:${z.jahr}`
      jahresstand.set(key, (jahresstand.get(key) ?? 0) + (z.tage ?? 0))
    }

    return NextResponse.json({
      zuzahlungen: data ?? [],
      jahresstand: Object.fromEntries(jahresstand),
      jahresgrenzeTage: JAHRESGRENZE_TAGE,
    })
  } catch (e) {
    console.error('[admin/zuzahlungen] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

/** POST — neue Zuzahlung erfassen. */
export async function POST(req: NextRequest) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
    }

    const eingabe = nurErlaubteFelder(body)
    if (!eingabe.client_id || !eingabe.jahr || eingabe.betrag === undefined) {
      return NextResponse.json({ error: 'Klient, Jahr und Betrag sind Pflichtfelder' }, { status: 400 })
    }
    if (eingabe.befreit && (!eingabe.befreiung_gueltig_von || !eingabe.befreiung_gueltig_bis)) {
      return NextResponse.json({ error: 'Bei Befreiung sind Gültigkeitszeitraum-Angaben Pflicht.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: client } = await admin
      .from('clients')
      .select('id')
      .eq('id', eingabe.client_id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()
    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden.' }, { status: 404 })
    }

    const { data, error } = await admin
      .from('zuzahlungen')
      .insert({ ...eingabe, organization_id: auth.ctx.organizationId, erstellt_von: auth.ctx.userId })
      .select('id')
      .single()

    if (error) {
      console.error('[admin/zuzahlungen] Anlegen fehlgeschlagen:', error.message)
      return NextResponse.json({ error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    console.error('[admin/zuzahlungen] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
