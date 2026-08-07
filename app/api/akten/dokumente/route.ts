import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin } from '@/lib/akten/api-auth'
import { createDokument, listDokumente, uploadDokumentDatei } from '@/lib/akten/dokumente'
import type { DokumentKategorie, DokumentSichtbarkeit, DokumentStatus, DokumentTyp } from '@/lib/akten/types'

export async function GET(request: Request) {
  try {
    const auth = await requireAktenAdmin()
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const url = new URL(request.url)
    const params = url.searchParams
    const admin = createAdminClient()

    const dokumente = await listDokumente(admin, {
      organizationId,
      clientId: params.get('clientId') ?? undefined,
      caregiverId: params.get('caregiverId') ?? undefined,
      dokumentTyp: (params.get('dokumentTyp') as DokumentTyp) ?? undefined,
      kategorie: (params.get('kategorie') as DokumentKategorie) ?? undefined,
      status: (params.get('status') as DokumentStatus) ?? undefined,
      sichtbarkeit: (params.get('sichtbarkeit') as DokumentSichtbarkeit) ?? undefined,
      tag: params.get('tag') ?? undefined,
      suche: params.get('suche') ?? undefined,
      ablaufBis: params.get('ablaufBis') ?? undefined,
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
      offset: params.get('offset') ? Number(params.get('offset')) : undefined,
    })

    return NextResponse.json({ dokumente })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAktenAdmin()
    if (!auth.ok) return auth.response
    const { userId, organizationId, role } = auth.ctx

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Datei ist Pflichtfeld.' }, { status: 400 })
    }

    const titel = formData.get('titel')?.toString()
    const dokumentTyp = formData.get('dokumentTyp')?.toString() as DokumentTyp
    if (!titel || !dokumentTyp) {
      return NextResponse.json({ error: 'titel und dokumentTyp sind Pflichtfelder.' }, { status: 400 })
    }

    const clientId = formData.get('clientId')?.toString() || null
    const caregiverId = formData.get('caregiverId')?.toString() || null
    if (clientId && caregiverId) {
      return NextResponse.json({ error: 'Ein Dokument kann nicht Kunde und Mitarbeiter gleichzeitig zugeordnet sein.' }, { status: 400 })
    }

    const tagsRaw = formData.get('tags')?.toString()
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []

    const admin = createAdminClient()
    const arrayBuffer = await file.arrayBuffer()
    const datei = await uploadDokumentDatei(admin, {
      organizationId,
      clientId,
      caregiverId,
      datei: { name: file.name, type: file.type, arrayBuffer },
    })

    const dokument = await createDokument(admin, {
      organizationId,
      clientId,
      caregiverId,
      titel,
      dokumentTyp,
      kategorie: (formData.get('kategorie')?.toString() as DokumentKategorie) || 'allgemein',
      datei,
      dokumentDatum: formData.get('dokumentDatum')?.toString() || null,
      gueltigVon: formData.get('gueltigVon')?.toString() || null,
      gueltigBis: formData.get('gueltigBis')?.toString() || null,
      ablaufdatum: formData.get('ablaufdatum')?.toString() || null,
      sichtbarkeit: (formData.get('sichtbarkeit')?.toString() as DokumentSichtbarkeit) || 'intern',
      tags,
      interneBemerkung: formData.get('interneBemerkung')?.toString() || null,
      erstelltVon: userId,
      actorRole: role,
    })

    return NextResponse.json({ dokument })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
