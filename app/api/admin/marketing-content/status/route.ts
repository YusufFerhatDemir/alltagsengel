import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { holeRollenQuellenFuer, quellenSindAdministration } from '@/lib/auth/rollen-quelle'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'
import { logger } from '@/lib/logger'
import { istContentStatus, statusFelder } from '@/lib/marketing/content-status'

const log = logger.child('api:marketing-content-status')

/**
 * PATCH /api/admin/marketing-content/status
 *
 * Setzt den Bearbeitungsstand eines Content-Stücks. Der Inhalt selbst
 * bleibt im Markdown unter docs/marketing/ — hier wird nur vermerkt, was
 * damit passiert ist.
 *
 * ── OHNE DIENSTSCHLÜSSEL ──────────────────────────────────────────────
 * Geschrieben wird mit dem Sitzungs-Client, nicht mit dem Dienstschlüssel.
 * Damit greift die RLS-Policy der Tabelle (is_admin()) als zweite Schranke
 * hinter der Rollenprüfung. Ein Dienstschlüssel wäre hier nur nötig, wenn
 * ein anonymer Weg schreiben müsste — es gibt keinen.
 *
 * ── BEIDE ROLLENQUELLEN ───────────────────────────────────────────────
 * `profiles` allein ließe eine Herabstufung in `app_metadata` wirkungslos;
 * `npm run lint:route-auth` prüft das.
 */
export const runtime = 'nodejs'

const NOTIZ_MAX = 500
const KANAL_MAX = 120

function text(wert: unknown, max: number): string | null {
  if (typeof wert !== 'string') return null
  const t = wert.trim()
  return t ? t.slice(0, max) : null
}

export const PATCH = withTracking(async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authFehler } = await supabase.auth.getUser()
    if (authFehler || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const quellen = await holeRollenQuellenFuer(supabase, user)
    if (!quellenSindAdministration(quellen)) {
      return NextResponse.json({ error: 'Nur fuer Administratoren.' }, { status: 403 })
    }

    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const contentId = text(body?.contentId, 200)
    if (!contentId) {
      return NextResponse.json({ error: 'contentId fehlt.' }, { status: 400 })
    }
    if (!istContentStatus(body?.status)) {
      return NextResponse.json({ error: 'Unbekannter Status.' }, { status: 400 })
    }

    // Vorhandenen Zeitpunkt lesen, damit eine nachgetragene Notiz das
    // Veroeffentlichungsdatum nicht auf heute verschiebt.
    const { data: bestand } = await supabase
      .from('marketing_content_status')
      .select('status, veroeffentlicht_am')
      .eq('organization_id', organizationId)
      .eq('content_id', contentId)
      .maybeSingle()

    const felder = statusFelder(
      body.status,
      new Date(),
      bestand?.status === 'veroeffentlicht' ? bestand.veroeffentlicht_am : null,
    )

    const { error: schreibFehler } = await supabase
      .from('marketing_content_status')
      .upsert({
        organization_id: organizationId,
        content_id: contentId,
        ...felder,
        kanal: text(body?.kanal, KANAL_MAX),
        notiz: text(body?.notiz, NOTIZ_MAX),
        geaendert_von: user.id,
      }, { onConflict: 'organization_id,content_id' })

    if (schreibFehler) {
      // PGRST205: Tabelle nicht im Schema-Cache — die Migration ist noch
      // nicht angewendet. Das ist kein Serverfehler, sondern ein offener
      // Schritt, und die Meldung soll das auch sagen.
      if (schreibFehler.code === 'PGRST205') {
        log.warn('marketing_content_status fehlt — Migration 20261103000000 nicht angewendet.')
        return NextResponse.json(
          { error: 'Der Bearbeitungsstand ist noch nicht eingerichtet (Migration offen).' },
          { status: 503 },
        )
      }
      throw new Error(`${schreibFehler.code}: ${schreibFehler.message}`)
    }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: user.id,
      actorRole: quellen.rolle,
      actorName: quellen.name,
      organizationId,
      entityType: 'marketing_content_status',
      // content_id ist keine UUID, sondern eine Stelle im Plan — sie steht
      // deshalb in den Details, nicht in entityId.
      details: { contentId, status: felder.status },
    })

    return NextResponse.json({ ok: true, status: felder.status, veroeffentlichtAm: felder.veroeffentlicht_am })
  } catch (fehler) {
    return safeApiError(fehler, request)
  }
})
