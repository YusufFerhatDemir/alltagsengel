/**
 * GET /api/admin/monitoring/abrechnung
 *
 * Fachliches Monitoring der Geldwege: Zaehler fuer Rechnungen, Mahnungen,
 * CAMT-Importe und Zahlungen, Fehlerquote im Rechnungsversand, eine
 * Zusammenfassung des Abrechnungs-Audit-Trails und die daraus abgeleiteten
 * Auffaelligkeiten.
 *
 * Abgrenzung zu GET /api/admin/monitoring: dort stehen HTTP-Antwortzeiten aus
 * einem In-Memory-Ring-Buffer (pro Serverless-Instanz, weg nach Cold Start).
 * Hier stehen fachliche Vorgaenge aus der Datenbank — die ueberleben den
 * Neustart und sind das, was bei einer Abrechnungsstoerung zaehlt.
 *
 * Liest ausschliesslich. Kein Versand, keine Zustandsaenderung.
 *
 * Parameter:
 *   stunden  Beobachtungsfenster, 1..720 (Standard 24). Verglichen wird
 *            immer mit dem unmittelbar davorliegenden, gleich langen Fenster.
 */

import { NextResponse } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sammleAbrechnungsMetriken } from '@/lib/monitoring/abrechnung-metriken'
import { safeApiError } from '@/lib/api/error-sanitizer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STUNDEN_MIN = 1
const STUNDEN_MAX = 720
const STUNDEN_STANDARD = 24

export async function GET(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  try {
    const roh = new URL(request.url).searchParams.get('stunden')
    const gewuenscht = roh === null ? STUNDEN_STANDARD : Number(roh)
    if (!Number.isFinite(gewuenscht) || !Number.isInteger(gewuenscht)
        || gewuenscht < STUNDEN_MIN || gewuenscht > STUNDEN_MAX) {
      // Bewusst ein Fehler statt einer stillen Korrektur: sonst zeigte die
      // Seite ein anderes Fenster als das, nach dem gefragt wurde.
      return NextResponse.json(
        { error: `Parameter "stunden" muss eine ganze Zahl zwischen ${STUNDEN_MIN} und ${STUNDEN_MAX} sein.` },
        { status: 400 },
      )
    }

    const metriken = await sammleAbrechnungsMetriken(createAdminClient(), {
      organizationId: auth.ctx.organizationId,
      fensterStunden: gewuenscht,
    })

    return NextResponse.json(metriken, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (err) {
    return safeApiError(err, request)
  }
}
