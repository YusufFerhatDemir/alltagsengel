import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { holeAntworten } from '@/lib/abrechnung/versand'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/dta/antworten
 *
 * Ruft die Antwortverzeichnisse aller aktiven Datenannahmestellen ab
 * (Quittungen, Fehlerprotokolle, Abrechnungsergebnisse) und importiert
 * gefundene Dateien über den regulären Rückläuferweg.
 *
 * Löscht nichts auf dem Server der Annahmestelle. Ein wiederholter Aufruf
 * erzeugt keine Dubletten — die Erkennung läuft über den Inhaltshash.
 *
 * POST statt GET, weil der Aufruf Daten importiert.
 */
export async function POST(request: Request) {
  const auth = await requireAdminMitOrg('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const ergebnis = await holeAntworten(admin, auth.organizationId, auth.userId)

    return NextResponse.json(ergebnis)
  } catch (err) {
    return safeApiError(err, request)
  }
}
