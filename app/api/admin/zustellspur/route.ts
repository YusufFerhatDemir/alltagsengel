/**
 * GET /api/admin/zustellspur
 *
 * Betriebsansicht des Benachrichtigungsversands fuer die aktive
 * Organisation:
 *
 *   • deadLetter — aufgegebene Zustellungen samt Grund. Das ist die
 *     Liste, die jemand ansehen muss: hier ist eine Nachricht NICHT
 *     angekommen und wird auch nicht mehr versendet.
 *   • offen      — noch in Wiederholung
 *   • laeufe     — die letzten Wiederholungslaeufe (mandantenuebergreifend,
 *     der Lauf ist es auch; deshalb ohne Organisationsbezug)
 *   • vorgaenge  — welche Vorgangsarten dieser Prozess wiederherstellen kann
 *
 * Der Mandantenfilter ist explizit gesetzt: die Abfragen laufen ueber den
 * service_role-Client (RLS greift dort nicht), also muss der Filter im
 * Code stehen.
 */

import { NextResponse } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { offeneZustellungen } from '@/lib/notifications/retry'
import { zustellspurSchemaBereit } from '@/lib/notifications/delivery-log'
import { registrierteVorgaenge } from '@/lib/notifications/vorgaenge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const organizationId = auth.ctx.organizationId
    const schemaBereit = await zustellspurSchemaBereit(admin)

    const offen = await offeneZustellungen(organizationId, { limit: 200, admin })

    let deadLetter: unknown[] = []
    if (schemaBereit) {
      const { data } = await admin
        .from('notification_delivery_log')
        .select('id, channel, recipient, grund, sanitized_error, attempt_count, correlation_id, vorgang_art, vorgang_ref, created_at')
        .eq('organization_id', organizationId)
        .eq('status', 'skipped')
        .not('grund', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100)
      deadLetter = data ?? []
    }

    const { data: laeufe } = await admin
      .from('zustellung_retry_laeufe')
      .select('id, status, gestartet_am, beendet_am, laufzeit_ms, versuch, verarbeitet, erfolgreich, fehlgeschlagen, dead_letter, uebersprungen, abbruchgrund')
      .order('gestartet_am', { ascending: false })
      .limit(10)

    return NextResponse.json({
      schemaBereit,
      // Ohne die Migration gibt es keinen Wiederholungslauf — das gehoert
      // in die Oberflaeche, nicht nur ins Serverprotokoll.
      hinweis: schemaBereit
        ? null
        : 'Migration 20260927000000 ist nicht eingespielt — der Wiederholungslauf ist abgeschaltet.',
      offen,
      deadLetter,
      laeufe: laeufe ?? [],
      vorgaenge: registrierteVorgaenge(),
    })
  } catch (err) {
    return safeApiError(err, request)
  }
}
