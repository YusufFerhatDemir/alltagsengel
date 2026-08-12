import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin } from '@/lib/akten/api-auth'
import { getDokument, softDeleteDokument, updateDokument } from '@/lib/akten/dokumente'
import { logAktenZugriff } from '@/lib/akten/zugriff-log'
import type { DokumentKategorie, DokumentSichtbarkeit, DokumentStatus } from '@/lib/akten/types'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAktenAdmin()
    if (!auth.ok) return auth.response
    const { organizationId, userId, role } = auth.ctx

    const admin = createAdminClient()
    const dokument = await getDokument(admin, id, organizationId)
    if (!dokument) return NextResponse.json({ error: 'Dokument nicht gefunden.' }, { status: 404 })

    await logAktenZugriff(admin, {
      organizationId, entitaetTyp: 'dokument', entitaetId: id, aktion: 'angesehen',
      benutzerId: userId, benutzerRolle: role, dokumentId: id,
    })

    return NextResponse.json({ dokument })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAktenAdmin()
    if (!auth.ok) return auth.response
    const { organizationId, userId, role } = auth.ctx

    const body = await request.json()
    const admin = createAdminClient()
    const dokument = await updateDokument(
      admin,
      id,
      organizationId,
      {
        titel: body.titel,
        kategorie: body.kategorie as DokumentKategorie | undefined,
        gueltigVon: body.gueltigVon,
        gueltigBis: body.gueltigBis,
        ablaufdatum: body.ablaufdatum,
        status: body.status as DokumentStatus | undefined,
        sichtbarkeit: body.sichtbarkeit as DokumentSichtbarkeit | undefined,
        tags: body.tags,
        interneBemerkung: body.interneBemerkung,
      },
      userId,
      role
    )

    return NextResponse.json({ dokument })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAktenAdmin()
    if (!auth.ok) return auth.response
    const { organizationId, userId, role } = auth.ctx

    const admin = createAdminClient()
    await softDeleteDokument(admin, id, organizationId, userId, role)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
