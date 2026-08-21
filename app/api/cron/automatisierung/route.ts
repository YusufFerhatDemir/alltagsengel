import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { fuehreTaeglicheAutomatisierungAus } from '@/lib/automation'

// ═══════════════════════════════════════════════════════════
// CRON: TAEGLICHE AUTOMATISIERUNGSKETTEN (WS7)
// ═══════════════════════════════════════════════════════════
// Laeuft taeglich um 05:00 Uhr (vercel.json) — vor dem Mahnlauf (07:00),
// damit Fristen-/Budget-/Nachweis-Aufgaben schon stehen, wenn der Tag
// beginnt. Iteriert alle Organisationen, jede Kette pro Organisation
// fehlertolerant (siehe lib/automation/index.ts).
// ═══════════════════════════════════════════════════════════

const supabaseAdmin = createAdminClient()

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: orgs, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, name')

    if (orgError) {
      return NextResponse.json({ error: `Organisationen laden: ${orgError.message}` }, { status: 500 })
    }

    const laeufe: Array<Record<string, unknown>> = []
    for (const org of orgs || []) {
      try {
        const ergebnis = await fuehreTaeglicheAutomatisierungAus(supabaseAdmin, org.id)
        laeufe.push({ name: org.name, ...ergebnis })
      } catch (err) {
        laeufe.push({
          organizationId: org.id,
          name: org.name,
          fehler: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({ ok: true, organisationen: laeufe.length, laeufe })
  } catch (err) {
    return safeApiError(err, request)
  }
}
