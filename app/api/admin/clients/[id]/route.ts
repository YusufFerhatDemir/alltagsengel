import { NextResponse } from 'next/server'
import { rolleDarf } from '@/lib/auth/guard'
import type { Berechtigung } from '@/lib/auth/rollen'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'
import {
  ALLOWED_CLIENT_FIELDS,
  STAMMDATEN_SET,
  pruefeStammdaten,
} from '@/lib/clients/stammdaten'

/**
 * Lokaler Guard dieser Route. Prueft seit dem Rollenkonzept eine
 * BERECHTIGUNG statt der Rolle (lib/auth/rollen.ts) — Klienten-Stammdaten
 * sehen auch pdl/qm/buchhaltung, aendern duerfen sie nur admin und pdl.
 */
async function requireAdmin(berechtigung: Berechtigung = 'stammdaten.lesen') {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false as const, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !rolleDarf(profile.role, berechtigung)) {
    return { ok: false as const, response: NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 }) }
  }
  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false as const, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }
  return { ok: true as const, userId: user.id, organizationId }
}

/**
 * PATCH /api/admin/clients/[id]
 *
 * Aktualisiert Kontaktstammdaten sowie Gesundheitsdaten & Notfallkontakte
 * eines Klienten.
 *
 * Vorher schrieb HealthSection (app/admin/clients/[id]/page.tsx) direkt per
 * Browser-Client gegen `clients` — RLS (clients_admin_all + org_fence)
 * schützte den Schreibzugriff korrekt, aber es entstand KEIN Audit-Log-
 * Eintrag. Damit war die Klienten-Anlage (POST /api/admin/clients) und die
 * Pflegegrad-Änderung (PATCH .../pflegegrad) auditiert, Änderungen an
 * Allergien/Medikamenten/Notfallkontakten aber nicht. Diese Route schließt
 * die Lücke, ohne das Nutzerverhalten zu ändern.
 *
 * Seit Track 6 deckt die Whitelist zusätzlich Name, Adresse, PLZ, Ort,
 * Telefon, E-Mail und Geburtsdatum ab (Bereich 1 der Lückenanalyse) — ein
 * Umzug oder eine Namensänderung war über die Oberfläche sonst nicht
 * abbildbar. Der Lebenszyklus (`status`/`pipeline_status`) läuft bewusst
 * über die eigene Route PATCH /api/admin/clients/[id]/status.
 *
 * Audit-Trail:
 * - Gesundheitsdaten: absichtlich nur die geänderten FELDNAMEN, nicht die
 *   Werte — Allergien/Medikamente/Diagnosen gehören nicht als Klartext in
 *   den Audit-Log.
 * - Stammdaten: ebenfalls nur die Feldnamen; einzige Ausnahme ist eine
 *   Namensänderung, bei der Vorher/Nachher protokolliert wird (der Name
 *   stand ohnehin schon in jedem Eintrag und ist für die Nachvollziehbarkeit
 *   von Rechnungen und Nachweisen nötig).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('stammdaten.schreiben')
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const body = await req.json()

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 })
    }

    const fehler = pruefeStammdaten(body as Record<string, unknown>)
    if (fehler) {
      return NextResponse.json({ error: fehler }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    for (const field of ALLOWED_CLIENT_FIELDS) {
      if (field in body) {
        const v = body[field]
        updateData[field] = typeof v === 'string' ? (v.trim() || null) : v
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Keine Felder zum Speichern übergeben.' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Vorzustand nur für den Audit-Eintrag bei Namensänderung. Ein fehlender
    // Datensatz führt weiter unten zu 404 — hier wird nicht abgebrochen,
    // damit der Org-Fence des UPDATE die einzige Zugriffsprüfung bleibt.
    const { data: vorher } = await admin
      .from('clients')
      .select('first_name, last_name')
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .maybeSingle()

    const { data: client, error: updateError } = await admin
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .select('id, first_name, last_name')
      .maybeSingle()

    if (updateError) {
      return safeApiError(updateError)
    }
    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden.' }, { status: 404 })
    }

    const geaendert = Object.keys(updateData)
    const stammdatenFelder = geaendert.filter(f => STAMMDATEN_SET.has(f))
    const gesundheitsFelder = geaendert.filter(f => !STAMMDATEN_SET.has(f))

    const bereiche: string[] = []
    if (stammdatenFelder.length > 0) bereiche.push('stammdaten')
    if (gesundheitsFelder.length > 0) bereiche.push('gesundheitsdaten_notfallkontakte')

    const nameGeaendert =
      vorher != null &&
      (`${vorher.first_name ?? ''} ${vorher.last_name ?? ''}`.trim() !==
        `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim())

    await logAuditEvent({
      action: 'update',
      actorId: auth.userId,
      organizationId: auth.organizationId,
      entityType: 'client',
      entityId: id,
      details: {
        feld: bereiche.join('+'),
        geaenderte_felder: geaendert,
        name: `${client.first_name} ${client.last_name}`,
        ...(nameGeaendert
          ? { name_vorher: `${vorher!.first_name ?? ''} ${vorher!.last_name ?? ''}`.trim() }
          : {}),
      },
      request: req,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return safeApiError(err, req)
  }
}
