import { NextResponse } from 'next/server'
import { rolleDarf } from '@/lib/auth/guard'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'
import { heuteBerlin } from '@/lib/utils/timezone'
import {
  pruefeStatuswechsel,
  sperrtEinsaetze,
  type ClientStatusWert,
  type PipelineStatusWert,
} from '@/lib/clients/status'

/**
 * PATCH /api/admin/clients/[id]/status
 *
 * Betreuung pausieren, beenden oder wieder aufnehmen.
 *
 * FACHLICH GETRENNT VON DER DSGVO-LÖSCHUNG. Diese Route ändert nur den
 * Lebenszyklus-Status; alle Daten, Nachweise, Rechnungen und Budgets des
 * Klienten bleiben unverändert bestehen — sie werden für Aufbewahrungs-
 * fristen und Nachprüfungen weiter gebraucht. Wer Daten wirklich löschen
 * will, nutzt den DSGVO-Weg (app/api/user/delete). Ein beendeter Klient
 * ist NICHT gelöscht, ein gelöschter Klient ist nicht "beendet".
 *
 * Wirkung des Status: `lib/personal/einsatzfreigabe.ts::pruefeClientFreigabe()`
 * lässt nur `aktiv`/`active`/`neu` für die Einsatzplanung zu. Alles andere
 * sperrt neue Einsätze — genau das ist bei Kündigung oder Versterben gewollt.
 *
 * Body: {
 *   status: 'active' | 'paused' | 'inactive' | 'archived',
 *   pipeline_status?: 'lead' | 'erstgespraech' | 'active' | 'paused' | 'ended',
 *   grund?: string   // wandert in den Audit-Log, nicht in die Klientendaten
 * }
 */
export async function PATCH(
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

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !rolleDarf(profile.role, 'stammdaten.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 })
    }

    const pruefung = pruefeStatuswechsel(body as Record<string, unknown>)
    if (pruefung.fehler) {
      return NextResponse.json({ error: pruefung.fehler }, { status: 400 })
    }
    const neuerStatus = pruefung.status as ClientStatusWert
    const neuerPipelineStatus = pruefung.pipelineStatus as PipelineStatusWert | null

    const admin = createAdminClient()

    const { data: client } = await admin
      .from('clients')
      .select('id, first_name, last_name, status, pipeline_status')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden.' }, { status: 404 })
    }

    if (client.status === neuerStatus && (!neuerPipelineStatus || client.pipeline_status === neuerPipelineStatus)) {
      return NextResponse.json({ error: 'Status ist unverändert.' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = { status: neuerStatus }
    if (neuerPipelineStatus) updateData.pipeline_status = neuerPipelineStatus

    const { error: updateError } = await admin
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', organizationId)

    if (updateError) {
      // clients_status_check lässt live nur ('active','paused','inactive') zu,
      // solange 20260907010000_clients_status_check.sql nicht angewendet ist.
      // 'archived' läuft dann in 23514 — mit einer rohen Postgres-Meldung,
      // die niemandem sagt, was zu tun ist.
      if (updateError.code === '23514' && updateError.message.includes('clients_status_check')) {
        return NextResponse.json({
          error:
            `Status „${neuerStatus}" ist in der Datenbank noch nicht freigeschaltet. ` +
            `Migration 20260907010000_clients_status_check.sql anwenden — bis dahin ` +
            `„Pausiert" oder „Inaktiv" verwenden.`,
        }, { status: 409 })
      }
      return safeApiError(updateError)
    }

    await logAuditEvent({
      action: 'update',
      actorId: user.id,
      organizationId,
      entityType: 'client',
      entityId: id,
      details: {
        feld: 'status',
        von: client.status ?? null,
        nach: neuerStatus,
        pipeline_von: client.pipeline_status ?? null,
        pipeline_nach: neuerPipelineStatus ?? client.pipeline_status ?? null,
        grund: typeof body.grund === 'string' && body.grund.trim() ? body.grund.trim() : null,
        // Ausdrücklich festhalten, dass hier NICHT gelöscht wurde — sonst
        // liest sich der Eintrag später wie eine DSGVO-Löschung.
        hinweis: 'Lebenszyklus-Statuswechsel, keine Datenlöschung.',
      },
      request: req,
    })

    // ── Hinweise: was der Statuswechsel NICHT mit erledigt ────────────
    const hinweise: string[] = []
    const sperrt = sperrtEinsaetze(neuerStatus)

    if (sperrt) {
      const heute = heuteBerlin()
      const { data: offeneEinsaetze } = await admin
        .from('assignments')
        .select('id')
        .eq('client_id', id)
        .eq('organization_id', organizationId)
        .gte('assignment_date', heute)
        .not('status', 'in', '("STORNIERT","ABGESCHLOSSEN")')
        .limit(200)

      if (offeneEinsaetze && offeneEinsaetze.length > 0) {
        hinweise.push(
          `${offeneEinsaetze.length} geplante(r) Einsatz/Einsätze ab ${heute} bestehen weiter. ` +
          `Der Statuswechsel storniert sie NICHT — bitte in der Einsatzplanung prüfen.`
        )
      }

      hinweise.push(
        'Bestehende Nachweise, Rechnungen und Budgets bleiben unverändert erhalten ' +
        '(Aufbewahrungspflicht). Für eine echte Datenlöschung ist der DSGVO-Weg zuständig.'
      )
    }

    return NextResponse.json({
      ok: true,
      status: neuerStatus,
      pipeline_status: neuerPipelineStatus ?? client.pipeline_status ?? null,
      vorher: client.status ?? null,
      hinweise,
    })
  } catch (err) {
    return safeApiError(err, req)
  }
}
