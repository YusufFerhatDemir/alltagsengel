import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { requireMarketing } from '@/lib/marketing/api-auth'
import { VORLAGEN, pruefeVorlage, synchronisiereVorlagen } from '@/lib/marketing/vorlagen'

// ═══════════════════════════════════════════════════════════════════════════
// VORLAGEN — Katalog ansehen und in die Datenbank übernehmen
//
// Die Antwort trägt je Vorlage den Befund der Prüfung mit. Eine Vorlage
// ohne {{abmeldelink}} oder mit einem veralteten Entlastungsbetrag ist
// nicht versandfähig, und das soll man sehen, bevor eine Kampagne darauf
// gebaut wird — nicht erst beim Versuch zu senden.
// ═══════════════════════════════════════════════════════════════════════════

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('email_templates')
      .select('template_key, name, zielgruppe, consent_type, betreff, aktiv, updated_at')
      .eq('organization_id', auth.ctx.organizationId)
    if (error) throw new Error(error.message)

    const abgelegt = new Set((data ?? []).map((z) => z.template_key as string))

    return NextResponse.json({
      vorlagen: VORLAGEN.map((v) => {
        const befund = pruefeVorlage(v)
        return {
          templateKey: v.templateKey,
          name: v.name,
          zielgruppe: v.zielgruppe,
          consentTyp: v.consentTyp,
          betreff: v.betreff,
          empfohlenesSegment: v.empfohlenesSegment ?? null,
          versandfaehig: befund.ok,
          fehler: befund.fehler,
          inDatenbank: abgelegt.has(v.templateKey),
        }
      }),
      abgelegt: data ?? [],
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const ergebnis = await synchronisiereVorlagen(
      createAdminClient(),
      auth.ctx.organizationId,
    )
    return NextResponse.json({
      ...ergebnis,
      hinweis:
        'Vorhandene Vorlagen wurden NICHT überschrieben — eine im Betrieb nachgebesserte ' +
        'Formulierung bleibt erhalten.',
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
