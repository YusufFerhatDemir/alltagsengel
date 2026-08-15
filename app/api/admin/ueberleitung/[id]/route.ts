import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERLAUBTE_FELDER = [
  'anlass', 'ziel_einrichtung', 'uebergabe_am', 'diagnosen', 'medikamentenplan_beigefuegt',
  'hilfsmittel', 'mobilitaet', 'kommunikation', 'ernaehrung', 'besonderheiten_pflege', 'risiken',
  'ansprechpartner_abgebend', 'ansprechpartner_uebernehmend', 'dokumente_mitgegeben', 'status',
] as const

function nurErlaubteFelder(roh: Record<string, unknown>): Record<string, unknown> {
  const sauber: Record<string, unknown> = {}
  for (const feld of ERLAUBTE_FELDER) {
    if (roh[feld] !== undefined) sauber[feld] = roh[feld]
  }
  return sauber
}

/** GET — einzelnen Überleitungsbogen laden. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('pflegeueberleitungen')
      .select('*, clients(first_name, last_name)')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (error) {
      console.error('[admin/ueberleitung] Laden fehlgeschlagen:', error.message)
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

    return NextResponse.json(data)
  } catch (e) {
    console.error('[admin/ueberleitung] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

/** PATCH — Überleitungsbogen aktualisieren/abschließen. */
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
      .from('pflegeueberleitungen')
      .update(eingabe)
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('[admin/ueberleitung] Update fehlgeschlagen:', error.message)
      return NextResponse.json({ error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    console.error('[admin/ueberleitung] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
