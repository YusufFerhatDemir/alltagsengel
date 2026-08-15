import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERLAUBTE_FELDER = [
  'gespraechsart', 'datum', 'teilnehmer', 'themen', 'ziele_vereinbart', 'massnahmen',
  'naechstes_gespraech_geplant_am', 'status', 'vertraulich',
] as const

function nurErlaubteFelder(roh: Record<string, unknown>): Record<string, unknown> {
  const sauber: Record<string, unknown> = {}
  for (const feld of ERLAUBTE_FELDER) {
    if (roh[feld] !== undefined) sauber[feld] = roh[feld]
  }
  return sauber
}

/** PATCH — Mitarbeitergespräch aktualisieren. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
    }
    const eingabe = nurErlaubteFelder(body)
    if (Object.keys(eingabe).length === 0) {
      return NextResponse.json({ error: 'Keine aenderbaren Felder uebergeben' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('mitarbeitergespraeche')
      .update(eingabe)
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('[admin/mitarbeitergespraeche] Update fehlgeschlagen:', error.message)
      return NextResponse.json({ error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    console.error('[admin/mitarbeitergespraeche] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
