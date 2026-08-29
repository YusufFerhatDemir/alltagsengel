import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin } from '@/lib/akten/api-auth'
import { assertZuordnungInOrg } from '@/lib/akten/zuordnung-guard'
import { createDokument, listDokumente, uploadDokumentDatei } from '@/lib/akten/dokumente'
import type { DokumentKategorie, DokumentSichtbarkeit, DokumentStatus, DokumentTyp } from '@/lib/akten/types'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  try {
    const auth = await requireAktenAdmin('stammdaten.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const url = new URL(request.url)
    const params = url.searchParams
    const admin = createAdminClient()

    // ── Personalakten sind eine eigene Berechtigung ────────────────
    // Diese Liste mischt Klienten- und Mitarbeiterdokumente, verlangt aber
    // nur `stammdaten.lesen`. Die Rolle `buchhaltung` hat genau die und
    // ausdruecklich NICHT `personal.lesen` (lib/auth/rollen.ts, woertlich:
    // „keine Gesundheitsdaten und keine Personalakten"). Die Seite
    // /admin/dokumente steht in der Navigation — Fuehrungszeugnis,
    // Arbeitsvertrag und Qualifikationsnachweis waren damit einen Klick
    // entfernt, waehrend /admin/mitarbeiterakte (`personal.lesen`) sie
    // derselben Rolle verweigert. Zwei Wege zum selben Bestand mit zwei
    // verschiedenen Antworten.
    //
    // Ein ausdruecklich gefilterter `caregiverId` wird ABGEWIESEN statt
    // still zu einer leeren Liste zu fuehren: „keine Dokumente" waere eine
    // Aussage ueber den Bestand, und die waere falsch.
    const darfPersonal = auth.ctx.darf('personal.lesen')
    const caregiverId = params.get('caregiverId') ?? undefined
    if (!darfPersonal && caregiverId) {
      return NextResponse.json(
        { error: 'Für Mitarbeiterdokumente fehlt Ihnen die Berechtigung.' },
        { status: 403 },
      )
    }

    const dokumente = await listDokumente(admin, {
      organizationId,
      ohnePersonaldokumente: !darfPersonal,
      clientId: params.get('clientId') ?? undefined,
      caregiverId,
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
    return safeApiError(err, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requireAktenAdmin('stammdaten.schreiben')
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
    // Mandantenschutz VOR dem Upload: sonst laege die Datei bereits im
    // Bucket, wenn die Zuordnung abgelehnt wird.
    await assertZuordnungInOrg(admin, { clientId, caregiverId, organizationId })

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
    return safeApiError(err, request)
  }
})
