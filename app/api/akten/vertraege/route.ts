import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin } from '@/lib/akten/api-auth'
import { createVertrag, listVertraege } from '@/lib/akten/vertraege'
import type { VertragsStatus, VertragsTyp } from '@/lib/akten/types'

export async function GET(request: Request) {
  try {
    const auth = await requireAktenAdmin()
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()
    const vertraege = await listVertraege(admin, {
      organizationId,
      clientId: params.get('clientId') ?? undefined,
      caregiverId: params.get('caregiverId') ?? undefined,
      status: (params.get('status') as VertragsStatus) ?? undefined,
      vertragstyp: (params.get('vertragstyp') as VertragsTyp) ?? undefined,
      auslaufendBis: params.get('auslaufendBis') ?? undefined,
    })

    return NextResponse.json({ vertraege })
  } catch (err) {
    return safeApiError(err, request)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAktenAdmin()
    if (!auth.ok) return auth.response
    const { userId, organizationId, role } = auth.ctx

    const body = await request.json()
    if (!body.titel || !body.vertragstyp) {
      return NextResponse.json({ error: 'titel und vertragstyp sind Pflichtfelder.' }, { status: 400 })
    }
    if (body.clientId && body.caregiverId) {
      return NextResponse.json({ error: 'Ein Vertrag kann nicht Kunde und Mitarbeiter gleichzeitig zugeordnet sein.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const vertrag = await createVertrag(admin, {
      organizationId,
      clientId: body.clientId ?? null,
      caregiverId: body.caregiverId ?? null,
      titel: body.titel,
      vertragstyp: body.vertragstyp,
      vertragsnummer: body.vertragsnummer ?? null,
      vertragsbeginn: body.vertragsbeginn ?? null,
      vertragsende: body.vertragsende ?? null,
      kuendigungsfristTage: body.kuendigungsfristTage ?? null,
      autoVerlaengerung: body.autoVerlaengerung ?? false,
      dokumentId: body.dokumentId ?? null,
      pdfUrl: body.pdfUrl ?? null,
      bemerkung: body.bemerkung ?? null,
      erstelltVon: userId,
      actorRole: role,
    })

    return NextResponse.json({ vertrag })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
