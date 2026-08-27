import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { uebertrageJahresbudgets } from '@/lib/budget/auto-budget'
import { berlinParts } from '@/lib/utils/timezone'
import { pruefeCronGeheimnis } from '@/lib/api/cron-auth'
import { withTracking } from '@/lib/monitoring/tracker'

// ═══════════════════════════════════════════════════════════
// CRON: JAHRESÜBERTRAG § 45b
// ═══════════════════════════════════════════════════════════
// Laeuft am 01.01. um 03:00 Uhr (vercel.json).
//
// Nicht verbrauchte Entlastungsbetraege wandern ins Folgejahr und
// verfallen dort am 30.06. (§ 45b Abs. 1 S. 5 SGB XI). Bis dahin hing
// uebertrageJahresbudgets() nur an POST /api/admin/budgets/jahresuebertrag
// — ohne Oberflaeche und ohne Cron. Wer die Route nicht von Hand aufrief,
// verlor den Uebertrag stillschweigend (Bereich 5 der Lueckenanalyse).
//
// Der Lauf ist WIEDERHOLBAR: uebertrageJahresbudgets setzt carryover_amount
// auf den errechneten Restbetrag, es wird nichts addiert. Ein zweiter Lauf
// am selben Tag aendert also nichts.
//
// Der Knopf unter /admin/budgets ruft dieselbe Logik ueber die Admin-Route
// auf — als Nachhol- und Korrekturweg.
// ═══════════════════════════════════════════════════════════

export const GET = withTracking(async function GET(request: Request) {
  const abweisung = pruefeCronGeheimnis(request)
  if (abweisung) return abweisung

  try {
    const admin = createAdminClient()

    // Jahr aus Berliner Zeit: um 03:00 Ortszeit am 01.01. steht UTC bereits
    // auf demselben Tag, aber die Zeitzonen-Helfer sind im ganzen Projekt
    // die Quelle der Wahrheit — kein new Date().getFullYear() im Serverpfad.
    const nachJahr = parseInt(berlinParts(new Date()).year, 10)
    const vonJahr = nachJahr - 1

    const { data: orgs, error: orgError } = await admin
      .from('organizations')
      .select('id, name')

    if (orgError) {
      return safeApiError(orgError, request)
    }

    const laeufe: Array<Record<string, unknown>> = []
    let uebertragenGesamt = 0
    let uebersprungenGesamt = 0
    let fehlerGesamt = 0

    for (const org of orgs || []) {
      try {
        const result = await uebertrageJahresbudgets(admin, org.id, vonJahr, nachJahr)
        uebertragenGesamt += result.uebertragen
        uebersprungenGesamt += result.uebersprungen
        fehlerGesamt += result.fehler.length
        laeufe.push({
          organizationId: org.id,
          name: org.name,
          uebertragen: result.uebertragen,
          uebersprungen: result.uebersprungen,
          fehler: result.fehler,
        })
      } catch (err) {
        // Eine kaputte Organisation darf die uebrigen nicht mitreissen.
        fehlerGesamt++
        laeufe.push({
          organizationId: org.id,
          name: org.name,
          fehler: [err instanceof Error ? err.message : String(err)],
        })
      }
    }

    return NextResponse.json({
      ok: true,
      vonJahr,
      nachJahr,
      organisationen: laeufe.length,
      uebertragen: uebertragenGesamt,
      uebersprungen: uebersprungenGesamt,
      fehler: fehlerGesamt,
      laeufe,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
