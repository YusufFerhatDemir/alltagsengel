import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'
import { berlinParts } from '@/lib/utils/timezone'
import { erstelleInitialBudgets } from '@/lib/budget/auto-budget'
import { budgetVersionFuerJahr } from '@/lib/config/budget-constants'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'

/**
 * PATCH /api/admin/clients/[id]/pflegegrad
 *
 * Aendert den Pflegegrad eines Klienten (Hoeher-/Herabstufung durch den MDK).
 * Die Budget-Berechtigung wird danach neu bewertet:
 *
 * - §45b Entlastungsbetrag gilt ab PG 1
 * - §42a VP/KZP gilt ab PG 2 — beim Hochstufen wird das Budget nachgelegt
 *
 * Beim Herabstufen wird ein bereits bestehendes VP/KZP-Budget NICHT geloescht:
 * fuer den Zeitraum vor der Herabstufung bestand der Anspruch, und es koennen
 * bereits Leistungen dagegen abgerechnet sein. Der Fall wird stattdessen als
 * Hinweis zurueckgemeldet und muss fachlich entschieden werden.
 *
 * Body: { care_level: number (0-5), care_level_since?: 'YYYY-MM-DD' }
 * care_level = 0 bedeutet "kein Pflegegrad".
 */
export const PATCH = withTracking(async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const quellen = await holeRollenQuellenFuer(supabase, user)
    if (!quellenDuerfen(quellen, 'stammdaten.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const body = await req.json()

    if (body.care_level === undefined || body.care_level === null || body.care_level === '') {
      return NextResponse.json({ error: 'care_level ist erforderlich.' }, { status: 400 })
    }

    const neuerPg = Number(body.care_level)
    if (!Number.isInteger(neuerPg) || neuerPg < 0 || neuerPg > 5) {
      return NextResponse.json(
        { error: 'Pflegegrad muss eine ganze Zahl zwischen 0 (kein Pflegegrad) und 5 sein.' },
        { status: 400 }
      )
    }

    let seit: string | null = null
    if (body.care_level_since) {
      if (typeof body.care_level_since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.care_level_since)) {
        return NextResponse.json({ error: 'care_level_since muss im Format JJJJ-MM-TT sein.' }, { status: 400 })
      }
      seit = body.care_level_since
    }

    // Org-Fence: der Admin-Client umgeht RLS (BYPASSRLS).
    const admin = createAdminClient()

    const { data: client } = await admin
      .from('clients')
      .select('id, first_name, last_name, care_level, pflegegrad, care_level_since, organization_id')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden.' }, { status: 404 })
    }

    const alterPg = client.care_level ?? client.pflegegrad ?? 0

    if (alterPg === neuerPg && (!seit || seit === client.care_level_since)) {
      return NextResponse.json({ error: 'Pflegegrad ist unverändert.' }, { status: 400 })
    }

    // clients fuehrt care_level und pflegegrad parallel — beide muessen
    // gleich bleiben, sonst laufen FHIR-Export und PDF-Generierung auseinander.
    const updateData: Record<string, unknown> = {
      care_level: neuerPg === 0 ? null : neuerPg,
      pflegegrad: neuerPg === 0 ? null : neuerPg,
    }
    if (seit) updateData.care_level_since = seit

    const { error: updateError } = await admin
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', organizationId)

    if (updateError) {
      return safeApiError(updateError)
    }

    await logAuditEvent({
      action: 'update',
      actorId: user.id,
      organizationId,
      entityType: 'client',
      entityId: id,
      details: {
        feld: 'pflegegrad',
        von: alterPg || null,
        nach: neuerPg || null,
        gueltig_ab: seit || client.care_level_since || null,
      },
      request: req,
    })

    // ── Budget-Berechtigung neu bewerten ────────────────────────────
    const hinweise: string[] = []
    let budgetErstellt = false

    if (neuerPg >= 1) {
      // erstelleInitialBudgets ist idempotent: es legt nur an, was fehlt.
      // Beim Hochstufen 1 → 2+ kommt so das VP/KZP-Budget dazu.
      const pgMonat = seit ? parseInt(seit.slice(5, 7), 10) : undefined
      const jahr = parseInt(berlinParts(new Date()).year, 10)
      const seitJahr = seit ? parseInt(seit.slice(0, 4), 10) : jahr

      const res = await erstelleInitialBudgets(
        admin,
        id,
        organizationId,
        neuerPg,
        // Ein Beginn in einem frueheren Jahr rechtfertigt kein anteiliges
        // Budget im laufenden Jahr — dann gilt der volle Jahresanspruch.
        seitJahr === jahr ? pgMonat : 1
      )
      budgetErstellt = res.erstellt
      if (res.fehler && !res.erstellt) hinweise.push(`Budget: ${res.fehler}`)
    }

    const version = budgetVersionFuerJahr(parseInt(berlinParts(new Date()).year, 10))

    if (neuerPg < version.minPflegegradVpKzp && alterPg >= version.minPflegegradVpKzp) {
      // LIVE-SCHEMA: eine Zeile je Kunde und Jahr, VP/KZP steht in den
      // combined_*-Spalten — es gibt kein budget_type (siehe
      // lib/budget/auto-budget.ts). Der alte Filter ließ die Abfrage mit
      // 42703 scheitern, der Hinweis auf ein verbrauchtes VP-Budget blieb
      // bei jeder Herabstufung aus.
      const { data: vpBudget } = await admin
        .from('client_budgets')
        .select('id, combined_annual_amount, combined_used_amount')
        .eq('client_id', id)
        .eq('organization_id', organizationId)
        .eq('year', parseInt(berlinParts(new Date()).year, 10))
        .maybeSingle()

      if (vpBudget && Number(vpBudget.combined_annual_amount ?? 0) > 0) {
        const verbraucht = Number(vpBudget.combined_used_amount ?? 0)
        hinweise.push(
          `Herabstufung auf PG ${neuerPg}: Der Anspruch auf Verhinderungs-/Kurzzeitpflege (ab PG ${version.minPflegegradVpKzp}) entfällt ab dem Änderungsdatum. ` +
          `Das bestehende VP/KZP-Budget (bereits verbraucht: ${verbraucht.toFixed(2)} €) wurde NICHT gelöscht und muss manuell geprüft werden.`
        )
      }
    }

    if (neuerPg === 0) {
      hinweise.push('Ohne Pflegegrad besteht kein Anspruch auf §45b-Entlastungsbetrag. Bestehende Budgets bleiben unverändert und müssen manuell geprüft werden.')
    }

    return NextResponse.json({
      ok: true,
      care_level: neuerPg === 0 ? null : neuerPg,
      care_level_since: seit || client.care_level_since || null,
      vorher: alterPg || null,
      budgetErstellt,
      hinweise,
    })
  } catch (err) {
    return safeApiError(err, req)
  }
})
