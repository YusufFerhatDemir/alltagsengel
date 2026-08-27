import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUebergabeUser } from '@/lib/uebergabe/api-auth'
import { getProtokoll } from '@/lib/uebergabe/protokolle'
import { createPunkt, listPunkte } from '@/lib/uebergabe/punkte'
import { clientGehoertZuOrg } from '@/lib/clients/organization-guard'
import { safeErrorResponse } from '@/lib/utils/api-error'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUebergabeUser()
    if (!auth.ok) return auth.response
    const { id } = await params

    const supabase = auth.ctx.istAdmin ? createAdminClient() : await createClient()
    const punkte = await listPunkte(supabase, id, auth.ctx.organizationId)
    return NextResponse.json({ punkte })
  } catch (err) {
    return safeErrorResponse(err, 400)
  }
})

export const POST = withTracking(async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUebergabeUser()
    if (!auth.ok) return auth.response
    const { id } = await params
    const body = await request.json()

    if (!body.inhalt) {
      return NextResponse.json({ error: 'inhalt ist ein Pflichtfeld.' }, { status: 400 })
    }

    const supabase = auth.ctx.istAdmin ? createAdminClient() : await createClient()

    // Ob ein Punkt ein Nachtrag ist, entscheidet der Protokollstatus —
    // nicht der Client. Sonst könnte ein abgeschlossenes Protokoll
    // nachträglich mit „regulären" Punkten aufgefüllt werden.
    const protokoll = await getProtokoll(supabase, id, auth.ctx.organizationId)
    if (!protokoll) {
      return NextResponse.json({ error: 'Übergabeprotokoll nicht gefunden.' }, { status: 404 })
    }

    // Mandantenschutz: client_id hat keinen Org-Bezug in der Tabelle selbst
    // (nur organization_id des Punktes wird vom Trigger geprüft) — ohne
    // diese Prüfung könnte insbesondere die Service-Role-Route (istAdmin)
    // einen Übergabepunkt unter einem fremden Klienten anlegen.
    if (body.clientId && !(await clientGehoertZuOrg(supabase, body.clientId, auth.ctx.organizationId))) {
      return NextResponse.json({ error: 'Klient nicht gefunden oder gehört nicht zur Organisation.' }, { status: 404 })
    }

    const punkt = await createPunkt(supabase, {
      protokollId: id,
      organizationId: auth.ctx.istAdmin ? auth.ctx.organizationId : undefined,
      clientId: body.clientId ?? null,
      kategorie: body.kategorie,
      dringlichkeit: body.dringlichkeit,
      inhalt: body.inhalt,
      handlungsbedarf: body.handlungsbedarf,
      quelleTyp: body.quelleTyp ?? null,
      quelleId: body.quelleId ?? null,
      aufgabeId: body.aufgabeId ?? null,
      nachtrag: protokoll.status === 'abgeschlossen',
      erstelltVon: auth.ctx.userId,
      erstelltVonName: auth.ctx.name,
    })

    return NextResponse.json({ punkt }, { status: 201 })
  } catch (err) {
    return safeErrorResponse(err, 400)
  }
})
