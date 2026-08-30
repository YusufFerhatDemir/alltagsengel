import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { requireMarketing } from '@/lib/marketing/api-auth'
import {
  AUTOMATIONEN,
  AUTOMATIONEN_AUSLOESER_VERDRAHTET,
  automationLaeuft,
  synchronisiereAutomationen,
} from '@/lib/marketing/automationen'

// ═══════════════════════════════════════════════════════════════════════════
// AUTOMATIONEN — ansehen und anlegen. NICHT scharf schalten.
//
// Es gibt hier bewusst KEIN PATCH auf `aktiv`. Eine Automation verschickt
// Post, ohne dass im Moment des Versands ein Mensch beteiligt ist. Bevor
// das ueber eine Schaltflaeche moeglich wird, fehlen drei Dinge — sie
// stehen im Kopf von lib/marketing/automationen.ts:
//   1. Es gibt ueberhaupt Einwilligungen (live: null).
//   2. Der Nachlauf ist begrenzt (sonst trifft der erste Lauf JEDE
//      Registrierung, die je stattgefunden hat).
//   3. Es gibt eine Zustellspur je Person und Automation.
//
// Solange das fehlt, waere ein Einschalt-Knopf eine Zusage, die das System
// nicht halten kann. Die Antwort sagt das ausdrücklich, statt es durch
// eine fehlende Schaltfläche anzudeuten.
// ═══════════════════════════════════════════════════════════════════════════

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('marketing_automations')
      .select('id, automation_key, name, beschreibung, trigger_typ, verzoegerung_tage, template_key, consent_type, aktiv, aktiviert_am')
      .eq('organization_id', auth.ctx.organizationId)
      .order('trigger_typ')
      .order('verzoegerung_tage')

    if (error) throw new Error(error.message)

    return NextResponse.json({
      automationen: (data ?? []).map((a) => ({
        ...a,
        lauf: automationLaeuft(a.aktiv === true),
      })),
      katalog: AUTOMATIONEN,
      ausloeserVerdrahtet: AUTOMATIONEN_AUSLOESER_VERDRAHTET,
      hinweis:
        AUTOMATIONEN_AUSLOESER_VERDRAHTET
          ? 'Automationen sind verdrahtet.'
          : 'Automationen sind VORBEREITET, aber NICHT scharf: es gibt keinen Cron-Eintrag und ' +
            'keinen Aufrufer. Auch eine auf „aktiv" gestellte Zeile verschickt derzeit nichts.',
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})

/** Legt fehlende Automationen aus dem Katalog an — immer mit aktiv=false. */
export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const ergebnis = await synchronisiereAutomationen(createAdminClient(), auth.ctx.organizationId)
    return NextResponse.json({
      ...ergebnis,
      hinweis: 'Angelegt mit aktiv=false. Es wurde nichts scharf geschaltet.',
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
