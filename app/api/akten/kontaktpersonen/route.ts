import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin } from '@/lib/akten/api-auth'
import { createKontaktperson, listKontaktpersonen } from '@/lib/akten/kontaktpersonen'

export async function GET(request: Request) {
  try {
    const auth = await requireAktenAdmin()
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const clientId = new URL(request.url).searchParams.get('clientId')
    if (!clientId) return NextResponse.json({ error: 'clientId ist Pflicht.' }, { status: 400 })

    const admin = createAdminClient()
    const kontaktpersonen = await listKontaktpersonen(admin, organizationId, clientId)

    return NextResponse.json({ kontaktpersonen })
  } catch (err) {
    return safeApiError(err, request)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAktenAdmin()
    if (!auth.ok) return auth.response
    const { organizationId, userId, role } = auth.ctx

    const body = await request.json()
    if (!body.clientId || !body.rolle || !body.vorname || !body.nachname) {
      return NextResponse.json({ error: 'clientId, rolle, vorname und nachname sind Pflichtfelder.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const kontaktperson = await createKontaktperson(admin, {
      organizationId,
      clientId: body.clientId,
      rolle: body.rolle,
      anrede: body.anrede ?? null,
      vorname: body.vorname,
      nachname: body.nachname,
      telefon: body.telefon ?? null,
      mobil: body.mobil ?? null,
      email: body.email ?? null,
      adresse: body.adresse ?? null,
      plz: body.plz ?? null,
      ort: body.ort ?? null,
      vollmachtTyp: body.vollmachtTyp ?? null,
      vollmachtDatum: body.vollmachtDatum ?? null,
      vollmachtDokumentId: body.vollmachtDokumentId ?? null,
      bevorzugteKontaktart: body.bevorzugteKontaktart ?? null,
      beziehung: body.beziehung ?? null,
      istHauptkontakt: body.istHauptkontakt ?? false,
      bemerkung: body.bemerkung ?? null,
      actorId: userId,
      actorRole: role,
    })

    return NextResponse.json({ kontaktperson })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
