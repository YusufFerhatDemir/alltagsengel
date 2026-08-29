import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { personaldokumentAbgewehrt, requireAktenAdmin } from '@/lib/akten/api-auth'
import { getDokument, softDeleteDokument, updateDokument } from '@/lib/akten/dokumente'
import { logAktenZugriff } from '@/lib/akten/zugriff-log'
import type { DokumentKategorie, DokumentSichtbarkeit, DokumentStatus } from '@/lib/akten/types'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAktenAdmin('stammdaten.lesen')
    if (!auth.ok) return auth.response
    const { organizationId, userId, role } = auth.ctx

    const admin = createAdminClient()
    const dokument = await getDokument(admin, id, organizationId)
    if (!dokument) return NextResponse.json({ error: 'Dokument nicht gefunden.' }, { status: 404 })

    // Personalakte hat eine eigene Berechtigung. Auf den Listen wird das
    // als Filter durchgesetzt (app/api/akten/dokumente/route.ts) — hier,
    // beim Zugriff ueber die Id, muss es an der ZEILE haengen: eine Id
    // kennt man auch ohne Liste, etwa aus einem Verweis.
    //
    // 403 und nicht 404: dass es das Dokument gibt, verraet die Id
    // ohnehin. Ein 404 wuerde behaupten, es existiere nicht — eine
    // Falschaussage, die spaeter niemand mehr aufloest.
    if (dokument.caregiver_id && !auth.ctx.darf('personal.lesen')) {
      return NextResponse.json(
        { error: 'Für Mitarbeiterdokumente fehlt Ihnen die Berechtigung.' },
        { status: 403 },
      )
    }

    await logAktenZugriff(admin, {
      organizationId, entitaetTyp: 'dokument', entitaetId: id, aktion: 'angesehen',
      benutzerId: userId, benutzerRolle: role, dokumentId: id,
    })

    return NextResponse.json({ dokument })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const PATCH = withTracking(async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAktenAdmin('stammdaten.schreiben')
    if (!auth.ok) return auth.response
    const { organizationId, userId, role } = auth.ctx

    const body = await request.json()
    const admin = createAdminClient()

    const abwehr = await personaldokumentAbgewehrt(admin, id, auth.ctx)
    if (abwehr) return abwehr

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
    return apiErrorResponse(err, request)
  }
})

export const DELETE = withTracking(async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAktenAdmin('stammdaten.schreiben')
    if (!auth.ok) return auth.response
    const { organizationId, userId, role } = auth.ctx

    const admin = createAdminClient()

    const abwehr = await personaldokumentAbgewehrt(admin, id, auth.ctx)
    if (abwehr) return abwehr

    await softDeleteDokument(admin, id, organizationId, userId, role)

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiErrorResponse(err, _request)
  }
})
