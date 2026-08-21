import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { alsGesperrtMarkieren } from '@/lib/kim/nachrichten'
import { aktuelleVersion } from '@/lib/kim/versionen'
import { versendeKimNachricht, KimSpecFehltError } from '@/lib/kim/versand'
import { heuteBerlin } from '@/lib/utils/timezone';
import { safeApiError } from '@/lib/api/error-sanitizer'

/**
 * POST /api/billing/kim/nachrichten/[id]/versenden
 *
 * Versucht, eine KIM-Nachricht zu versenden — und weist das IMMER mit 409 ab.
 * versendeKimNachricht() wirft ausnahmslos (s. lib/kim/versand.ts): weder
 * KIM-Client-Protokoll noch Konnektor-Anbindung sind implementiert. Der
 * Versuch wird in der Warteschlange als "gesperrt" festgehalten, damit
 * sichtbar bleibt, dass ein Versand angefordert, aber abgewiesen wurde.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { organizationId } = auth.ctx

  const { id } = await params
  const admin = createAdminClient()

  try {
    const heute = heuteBerlin()
    const versionAufloesung = await aktuelleVersion(admin, organizationId, heute)

    versendeKimNachricht({ nachrichtId: id, version: versionAufloesung.version })
    // Unerreichbar — versendeKimNachricht() wirft immer. Explizit hier, damit
    // ein künftiger Refactoring-Fehler (Sperre versehentlich entfernt) nicht
    // stillschweigend "erfolgreich" zurückmeldet.
    return NextResponse.json({ error: 'KIM-Versand ist gesperrt.' }, { status: 409 })
  } catch (err) {
    if (err instanceof KimSpecFehltError) {
      try {
        await alsGesperrtMarkieren(admin, organizationId, id, err.message)
      } catch {
        // Markieren ist best-effort — die Sperre selbst gilt in jedem Fall.
      }
      return apiErrorResponse(err, undefined, 409)
    }
    return safeApiError(err, _request)
  }
}
