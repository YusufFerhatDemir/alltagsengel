import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { importiereRuecklaeufer } from '@/lib/abrechnung/ruecklaeufer'
import { getActiveOrgId } from '@/lib/organizations/server'
import { createAufgabe } from '@/lib/ops/aufgaben'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const laufId = searchParams.get('lauf_id')

    const admin = createAdminClient()
    let query = admin
      .from('dta_ruecklaeufer')
      .select('*, lauf:abrechnungslaeufe(id, abrechnungsmonat, kostentraeger_name, status)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (status) query = query.eq('status', status)
    if (laufId) query = query.eq('lauf_id', laufId)

    const { data } = await query
    return NextResponse.json(data ?? [])
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const body = await request.json()
    if (!body.ruecklaeuferTyp || !body.originalMeldung) {
      return NextResponse.json(
        { error: 'ruecklaeuferTyp und originalMeldung sind Pflichtfelder.' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const ergebnis = await importiereRuecklaeufer(admin, {
      ruecklaeuferTyp: body.ruecklaeuferTyp,
      originalMeldung: body.originalMeldung,
      laufId: body.laufId,
      quelldateiName: body.quelldateiName,
      kostentraegerIk: body.kostentraegerIk,
      fehlerCode: body.fehlerCode,
      fehlerText: body.fehlerText,
      organizationId,
      actorId: user.id,
    })

    if (ergebnis.fehlerErstellt) {
      const istAbgelehnt = ergebnis.status === 'abgelehnt'
      const fristTage = istAbgelehnt ? 3 : 7
      const faelligAm = new Date()
      faelligAm.setDate(faelligAm.getDate() + fristTage)
      try {
        await createAufgabe(admin, {
          organizationId,
          data: {
            titel: istAbgelehnt
              ? `Abrechnung abgelehnt – Korrektur erforderlich${body.kostentraegerIk ? ` (IK ${body.kostentraegerIk})` : ''}`
              : `Rückläufer mit Fehlern – Prüfung erforderlich${body.kostentraegerIk ? ` (IK ${body.kostentraegerIk})` : ''}`,
            beschreibung: [
              `Rückläufer-Typ: ${body.ruecklaeuferTyp}`,
              `Status: ${ergebnis.status}`,
              body.fehlerCode ? `Fehlercode: ${body.fehlerCode}` : null,
              body.fehlerText ? `Fehlermeldung: ${body.fehlerText}` : null,
              ergebnis.positionenAbgelehnt > 0 ? `${ergebnis.positionenAbgelehnt} von ${ergebnis.positionenGesamt} Positionen abgelehnt` : null,
              body.laufId ? `Abrechnungslauf: ${body.laufId}` : null,
            ].filter(Boolean).join('\n'),
            kategorie: 'abrechnung',
            prioritaet: istAbgelehnt ? 'kritisch' : 'hoch',
            status: 'offen',
            erstellt_von: user.id,
            abrechnungslauf_id: body.laufId || null,
            client_id: body.clientId || null,
            faellig_am: faelligAm.toISOString().split('T')[0],
            metadata: { ruecklaeufer_id: ergebnis.ruecklaeuferId },
          },
        })
      } catch (aufgabenErr) {
        console.error('[ruecklaeufer] Aufgaben-Erstellung fehlgeschlagen:', aufgabenErr)
      }
    }

    return NextResponse.json(ergebnis)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
