import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Erlaubte Felder fuer Schreibzugriffe — Mass-Assignment-Schutz. */
const ERLAUBTE_FELDER = [
  'anrede', 'titel', 'vorname', 'nachname', 'fachrichtung',
  'lanr', 'bsnr', 'praxis_name', 'strasse', 'plz', 'ort',
  'telefon', 'fax', 'email', 'mobiltelefon', 'notizen', 'aktiv',
] as const

function nurErlaubteFelder(roh: Record<string, unknown>): Record<string, unknown> {
  const sauber: Record<string, unknown> = {}
  for (const feld of ERLAUBTE_FELDER) {
    if (roh[feld] !== undefined) sauber[feld] = roh[feld]
  }
  return sauber
}

/** GET — einzelnen Arzt laden. */
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
      .from('aerzte_praxen')
      .select('id, anrede, titel, vorname, nachname, fachrichtung, lanr, bsnr, praxis_name, strasse, plz, ort, telefon, fax, email, mobiltelefon, notizen, aktiv, created_at, updated_at')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (error) {
      console.error('[admin/aerzte] Laden fehlgeschlagen:', error.message)
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (e) {
    console.error('[admin/aerzte] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

/** PATCH — Arzt aktualisieren. */
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
    // organization_id im WHERE ist die IDOR-Grenze
    const { data, error } = await admin
      .from('aerzte_praxen')
      .update(eingabe)
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('[admin/aerzte] Update fehlgeschlagen:', error.message)
      return NextResponse.json({ error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    }

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    console.error('[admin/aerzte] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

/** DELETE — Soft-Delete (aktiv = false). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const admin = createAdminClient()
    // organization_id im WHERE ist die IDOR-Grenze
    const { data, error } = await admin
      .from('aerzte_praxen')
      .update({ aktiv: false })
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('[admin/aerzte] Deaktivieren fehlgeschlagen:', error.message)
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    }

    return NextResponse.json({ erfolg: true })
  } catch (e) {
    console.error('[admin/aerzte] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
