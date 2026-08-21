import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { runDunningRun } from '@/lib/billing/core'
import { createAdminClient } from '@/lib/supabase/admin'

// ═══════════════════════════════════════════════════════════
// CRON: AUTOMATISCHER MAHNLAUF
// ═══════════════════════════════════════════════════════════
// Laeuft taeglich um 07:00 Uhr (vercel.json).
// Prueft alle Organisationen auf faellige, unbezahlte Rechnungen und
// eskaliert je Rechnung hoechstens EINE Mahnstufe pro Lauf.
//
// Fristen (Tage nach Faelligkeit): 14 Zahlungserinnerung, 28 1. Mahnung,
// 42 2. Mahnung, 56 Letzte Mahnung, 70 Inkasso-Vorbereitung.
//
// Der Lauf eskaliert die Mahnstufe UND legt bei jeder Eskalation automatisch
// eine Mahnung (PDF + E-Mail) in `dunning_email_queue` (status='wartend') an.
// Der tatsaechliche E-Mail-VERSAND bleibt bewusst manuell unter
// /admin/mahnwesen, weil Mahnschreiben vor dem Rausgehen gesichtet werden
// sollen — hier wird nur die Queue befuellt, nichts verschickt.
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
    let eskaliertGesamt = 0
    let blockiertGesamt = 0

    for (const org of orgs || []) {
      try {
        // actorId = Org-ID: der Lauf ist systemgetrieben, es gibt keinen
        // handelnden Benutzer. Der Audit-Eintrag bleibt so zuordenbar.
        const result = await runDunningRun(supabaseAdmin, org.id, org.id, { sendEmails: true })
        eskaliertGesamt += result.eskaliert.length
        blockiertGesamt += result.blockiert.length
        laeufe.push({
          organizationId: org.id,
          name: org.name,
          geprueft: result.geprueft,
          eskaliert: result.eskaliert.length,
          blockiert: result.blockiert.length,
          unveraendert: result.unveraendert,
          details: result.eskaliert,
        })
      } catch (err) {
        laeufe.push({
          organizationId: org.id,
          name: org.name,
          fehler: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({
      ok: true,
      organisationen: laeufe.length,
      eskaliert: eskaliertGesamt,
      blockiert: blockiertGesamt,
      laeufe,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
}
