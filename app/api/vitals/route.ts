import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requirePflegeAdmin, requirePflegeUser } from '@/lib/pflege/api-auth'
import { bewerteMesswert } from '@/lib/vitals/vitals'
import { createVital, listThresholds, listVitals } from '@/lib/vitals/server'
import { grenzwertAlarmeAktiv } from '@/lib/vitals/config'
import type { VitalTyp } from '@/lib/vitals/types'

export async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()
    const messungen = await listVitals(admin, {
      organizationId: auth.ctx.organizationId,
      clientId: params.get('clientId') ?? undefined,
      typ: (params.get('typ') as VitalTyp) ?? undefined,
      vonDatum: params.get('vonDatum') ?? undefined,
      bisDatum: params.get('bisDatum') ?? undefined,
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    })

    return NextResponse.json({ messungen, alarmeAktiv: grenzwertAlarmeAktiv() })
  } catch (err) {
    return safeApiError(err, request)
  }
}

/**
 * POST — Messung erfassen.
 * Admins schreiben mit Service-Role und expliziter Organisation.
 * Engel schreiben mit ihrem eigenen Client: RLS (engel_vital_signs_insert)
 * prüft die aktive Zuordnung, current_org_id() setzt die Organisation.
 * Die Antwort enthält die Alarm-Bewertung der neuen Messung.
 */
export async function POST(request: Request) {
  try {
    const auth = await requirePflegeUser()
    if (!auth.ok) return auth.response

    const body = await request.json()
    if (!body.clientId || !body.typ || body.wert === undefined || body.wert === null) {
      return NextResponse.json({ error: 'clientId, typ und wert sind Pflichtfelder.' }, { status: 400 })
    }

    const istAdmin = ['admin', 'superadmin'].includes(auth.role)
    let supabase = await createClient()
    let organizationId: string | undefined

    if (istAdmin) {
      const adminAuth = await requirePflegeAdmin()
      if (!adminAuth.ok) return adminAuth.response
      organizationId = adminAuth.ctx.organizationId
      supabase = createAdminClient()

      // Mandantenschutz: der Klient muss zur aktiven Organisation gehören.
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('id', body.clientId)
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (!client) {
        return NextResponse.json({ error: 'Klient nicht gefunden oder gehört nicht zur Organisation.' }, { status: 404 })
      }
    }

    const messung = await createVital(supabase, {
      organizationId,
      clientId: body.clientId,
      typ: body.typ,
      wert: Number(body.wert),
      wertSekundaer: body.wertSekundaer !== undefined && body.wertSekundaer !== null && body.wertSekundaer !== ''
        ? Number(body.wertSekundaer)
        : null,
      gemessenAm: body.gemessenAm,
      gemessenVon: auth.userId,
      gemessenVonName: auth.name,
      gemessenVonRolle: auth.role,
      notizen: body.notizen,
    })

    // MDR-Kill-Switch: Die automatische Grenzwert-Bewertung ist eine
    // potenzielle Medizinprodukt-Funktion und bleibt aus, bis regulatorisch
    // freigegeben. Die Messung wird trotzdem gespeichert (Dokumentation).
    if (!grenzwertAlarmeAktiv()) {
      return NextResponse.json({ messung, bewertung: null, alarmeAktiv: false })
    }

    // Grenzwerte mit Service-Role lesen: der Alarm gehört zur Antwort,
    // unabhängig davon, ob der Erfasser die Grenzwert-Tabelle sehen darf.
    const grenzwerte = await listThresholds(createAdminClient(), messung.organization_id, messung.client_id)
    const grenzwert = grenzwerte.find(g => g.type === messung.type) ?? null
    const bewertung = bewerteMesswert(
      messung.type, Number(messung.value),
      messung.value_secondary != null ? Number(messung.value_secondary) : null,
      grenzwert,
    )

    return NextResponse.json({ messung, bewertung, alarmeAktiv: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
