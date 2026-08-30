import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { requireMarketing } from '@/lib/marketing/api-auth'
import { vorlageAus } from '@/lib/marketing/vorlagen'
import { testversand } from '@/lib/marketing/versand'
import { TESTVERSAND_DOMAENEN } from '@/lib/marketing/freigabe'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'

// ═══════════════════════════════════════════════════════════════════════════
// TESTVERSAND — eine Mail, nur an eigene Adressen
//
// Die Beschraenkung auf @alltagsengel.care ist kein Komfortmerkmal. Ohne
// sie waere der Testversand der Weg, den Freigaberiegel zu umgehen: eine
// Kampagne „testweise" an eine Kundenadresse ist kein Test, sondern ein
// Versand — und der ist nicht zuruecknehmbar.
//
// Ratenbegrenzt, weil diese Route eine Mail ausloest. Ohne Grenze waere sie
// eine Versandhilfe auf die eigenen Postfaecher.
// ═══════════════════════════════════════════════════════════════════════════

export const POST = withTracking(async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    if (!(await rateLimitPersistent(`marketing-test:${auth.ctx.userId}`, 20, 600_000))) {
      return NextResponse.json({ error: 'Zu viele Testversände. Bitte später erneut.' }, { status: 429 })
    }

    const { id } = await params
    const rumpf = await request.json().catch(() => null)
    const an = typeof rumpf?.an === 'string' ? rumpf.an : ''
    if (!an) {
      return NextResponse.json(
        { error: `Zieladresse fehlt. Zulässig sind nur eigene Adressen (@${TESTVERSAND_DOMAENEN[0]}).` },
        { status: 400 },
      )
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('email_campaigns')
      .select('id, template_key')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return NextResponse.json({ error: 'Kampagne nicht gefunden.' }, { status: 404 })

    const ergebnis = await testversand(vorlageAus(data.template_key as string), an)
    if (!ergebnis.ok) return NextResponse.json({ error: ergebnis.grund }, { status: 400 })

    return NextResponse.json({
      ok: true,
      an: ergebnis.an,
      hinweis: 'Testversand — kein Eintrag in der Zustellspur, keine Kennzahl verändert.',
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
