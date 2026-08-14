import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { deleteThreshold, listThresholds, upsertThreshold } from '@/lib/vitals/server'
import { grenzwertAlarmeAktiv } from '@/lib/vitals/config'

export async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const grenzwerte = await listThresholds(
      createAdminClient(), auth.ctx.organizationId, params.get('clientId') ?? undefined,
    )
    return NextResponse.json({ grenzwerte, alarmeAktiv: grenzwertAlarmeAktiv() })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

/** PUT — Grenzwert-Satz je (Klient, Vitaltyp) anlegen oder überschreiben. */
export async function PUT(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const body = await request.json()
    if (!body.clientId || !body.typ) {
      return NextResponse.json({ error: 'clientId und typ sind Pflichtfelder.' }, { status: 400 })
    }

    const alsZahl = (v: unknown): number | null =>
      v === undefined || v === null || v === '' ? null : Number(v)

    const admin = createAdminClient()
    // Mandantenschutz: der Klient muss zur aktiven Organisation gehören.
    const { data: client } = await admin
      .from('clients')
      .select('id')
      .eq('id', body.clientId)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()
    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden oder gehört nicht zur Organisation.' }, { status: 404 })
    }

    const grenzwert = await upsertThreshold(admin, {
      organizationId: auth.ctx.organizationId,
      clientId: body.clientId,
      typ: body.typ,
      min_warn: alsZahl(body.min_warn),
      max_warn: alsZahl(body.max_warn),
      min_critical: alsZahl(body.min_critical),
      max_critical: alsZahl(body.max_critical),
      min_warn_secondary: alsZahl(body.min_warn_secondary),
      max_warn_secondary: alsZahl(body.max_warn_secondary),
      min_critical_secondary: alsZahl(body.min_critical_secondary),
      max_critical_secondary: alsZahl(body.max_critical_secondary),
      enabled: body.enabled ?? true,
      notizen: body.notizen,
      erstelltVon: auth.ctx.userId,
    })

    return NextResponse.json({ grenzwert })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const id = params.get('id')
    if (!id) return NextResponse.json({ error: 'id ist ein Pflichtfeld.' }, { status: 400 })

    await deleteThreshold(createAdminClient(), id, auth.ctx.organizationId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
