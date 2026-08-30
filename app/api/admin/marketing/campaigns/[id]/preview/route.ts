import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { requireMarketing } from '@/lib/marketing/api-auth'
import { vorlageAus } from '@/lib/marketing/vorlagen'
import { vorschau } from '@/lib/marketing/versand'

// ═══════════════════════════════════════════════════════════════════════════
// VORSCHAU — rendert die Mail, sendet nichts
//
// Der Abmeldelink wird ECHT gerendert. Eine Vorschau mit Platzhalter statt
// Link haette einen fehlenden Signaturschluessel bis in den Versand
// getragen — und dort waere die Folge eine Werbemail ohne funktionierende
// Abmeldemoeglichkeit.
// ═══════════════════════════════════════════════════════════════════════════

export const GET = withTracking(async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('email_campaigns')
      .select('id, template_key, name')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return NextResponse.json({ error: 'Kampagne nicht gefunden.' }, { status: 404 })

    const ergebnis = vorschau(vorlageAus(data.template_key as string))
    return NextResponse.json(ergebnis)
  } catch (err) {
    return safeApiError(err, request)
  }
})
