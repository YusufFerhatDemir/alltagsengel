import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin } from '@/lib/akten/api-auth'
import { sucheDokumente } from '@/lib/akten/suche'
import type { DokumentKategorie, DokumentStatus, DokumentTyp } from '@/lib/akten/types'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  try {
    const auth = await requireAktenAdmin('stammdaten.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const params = new URL(request.url).searchParams
    const tagsRaw = params.get('tags')
    const admin = createAdminClient()

    // ── Personalakten sind eine eigene Berechtigung ────────────────
    // Diese Route mischt Klienten- und Mitarbeiterdokumente in EINER
    // Antwort, verlangt aber nur `stammdaten.lesen`. Die Rolle
    // `buchhaltung` hat genau die und ausdruecklich NICHT `personal.lesen`
    // (lib/auth/rollen.ts, woertlich: „keine Gesundheitsdaten und keine
    // Personalakten"). Ueber diese Suche waren Fuehrungszeugnis,
    // Arbeitsvertrag und Qualifikationsnachweise trotzdem lesbar — die
    // Mitarbeiterakte selbst verweigert sie derselben Rolle
    // (`/admin/mitarbeiterakte` steht auf `personal.lesen`).
    //
    // Ein ausdruecklich gefilterter `caregiverId` wird ABGEWIESEN statt
    // still zu einer leeren Liste zu fuehren: „keine Dokumente" waere eine
    // Aussage ueber den Bestand, und die waere falsch.
    const darfPersonal = auth.ctx.darf('personal.lesen')
    const caregiverId = params.get('caregiverId') ?? undefined
    if (!darfPersonal && caregiverId) {
      return NextResponse.json(
        { error: 'Für Mitarbeiterdokumente fehlt Ihnen die Berechtigung.' },
        { status: 403 },
      )
    }

    const treffer = await sucheDokumente(admin, {
      organizationId,
      suchtext: params.get('suchtext') ?? undefined,
      clientId: params.get('clientId') ?? undefined,
      caregiverId,
      ohnePersonaldokumente: !darfPersonal,
      dokumentTyp: (params.get('dokumentTyp') as DokumentTyp) ?? undefined,
      kategorie: (params.get('kategorie') as DokumentKategorie) ?? undefined,
      status: (params.get('status') as DokumentStatus) ?? undefined,
      tags: tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      von: params.get('von') ?? undefined,
      bis: params.get('bis') ?? undefined,
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    })

    return NextResponse.json({ treffer })
  } catch (err) {
    return safeApiError(err, request)
  }
})
