import { createClient } from '@/lib/supabase/server'
import { rolleDarf } from '@/lib/auth/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { preFlightValidierung } from '@/lib/abrechnung/kassenabrechnung-engine'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { logBillingAction } from '@/lib/billing/core/audit'
import { meldeAbrechnungsfehler } from '@/lib/automation/abrechnung-fehler-aufgabe'
import { logger } from '@/lib/logger'
const log = logger.child('dta/preflight')

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

    if (!profile || !rolleDarf(profile.role, 'abrechnung.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const body = await request.json()
    const { abrechnungsmonat, bundesland, kostentraegerIk } = body

    if (!abrechnungsmonat || !bundesland) {
      return NextResponse.json(
        { error: 'abrechnungsmonat und bundesland sind Pflichtfelder.' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const ergebnis = await preFlightValidierung(admin, {
      organizationId,
      abrechnungsmonat,
      bundesland,
      kostentraegerIk,
    })

    // Protokollieren, damit die Readiness-Ansicht "letzter Preflight" aus
    // einer echten Quelle beantworten kann statt aus einer Schaetzung.
    // Best effort: ein fehlgeschlagener Audit-Eintrag darf das Ergebnis
    // nicht verschlucken.
    await logBillingAction(admin, {
      entityType: 'dta_validierung',
      organizationId,
      entityId: organizationId,
      action: 'preflight_ausgefuehrt',
      newState: {
        abrechnungsmonat,
        bundesland,
        kostentraeger_ik: kostentraegerIk ?? null,
        bestanden: ergebnis.bestanden,
        fehler: ergebnis.fehler.length,
        warnungen: ergebnis.warnungen.length,
      },
      actorId: user.id,
    }).catch(err => log.errorWithException('Audit fehlgeschlagen', err))

    // Kette 9: Pflicht-Prüfpunkte durchgefallen → Aufgabe an Sachbearbeiter.
    // Best effort — ein fehlgeschlagenes Aufgaben-Anlegen darf das
    // Preflight-Ergebnis selbst nicht verschlucken.
    if (!ergebnis.bestanden) {
      const pflichtFehler = ergebnis.fehler.filter(p => p.pflicht)
      if (pflichtFehler.length > 0) {
        await meldeAbrechnungsfehler(admin, {
          organizationId,
          actorId: user.id,
          abrechnungsmonat,
          bundesland,
          fehlgeschlagenePruefpunkte: pflichtFehler.map(p => ({ label: p.label, details: p.details ?? '' })),
        }).catch(err => log.errorWithException('Aufgaben-Erstellung fehlgeschlagen', err))
      }
    }

    return NextResponse.json(ergebnis)
  } catch (err) {
    return safeApiError(err, request)
  }
}
