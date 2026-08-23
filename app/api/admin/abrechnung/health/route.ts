/**
 * GET /api/admin/abrechnung/health
 *
 * Zustand aller drei Übertragungskanäle: Gate-Stand, Betriebsmodus, letzte
 * Übertragung, Warteschlangentiefe, offene Rückläufer und Fehlerqueue.
 *
 * Bewusst nur für Administratoren. Der Bericht nennt Hostnamen, IK-Nummern und
 * die Zahl offener Forderungen — das ist nichts, was hinter einem Monitoring-
 * Token an einen externen Dienst gehen sollte. Wer ihn maschinell abfragen
 * will, tut das mit einer Admin-Sitzung.
 *
 * Der HTTP-Status ist immer 200, solange der Bericht erstellt werden konnte:
 * "ein Kanal ist rot" ist eine Aussage über den Betrieb, kein Fehler dieser
 * Route. Der Zustand steht in `gesamt`.
 */

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { ermittleGesundheit } from '@/lib/abrechnung/health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAdminMitOrg('abrechnung.lesen')
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const admin = createAdminClient()
    const gesundheit = await ermittleGesundheit(admin, auth.organizationId)

    // Kurzform für Statusanzeigen und Cron-Prüfungen.
    if (url.searchParams.get('kurz') === '1') {
      return NextResponse.json({
        gesamt: gesundheit.gesamt,
        geprueftAm: gesundheit.geprueftAm,
        kanaele: gesundheit.kanaele.map(k => ({
          kanal: k.kanal,
          ampel: k.ampel,
          gateOffen: k.gate.offen,
          modus: k.betriebsmodus.modus,
          warteschlange: k.warteschlange.versandbereit,
          deadLetter: k.deadLetter.offen,
        })),
        handlungsbedarf: gesundheit.handlungsbedarf,
      })
    }

    return NextResponse.json(gesundheit)
  } catch (err) {
    return safeApiError(err, request)
  }
}
