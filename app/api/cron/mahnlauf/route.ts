import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { runDunningRun } from '@/lib/billing/core'
import { verarbeiteMahnQueue } from '@/lib/billing/dunning/mahn-versand'
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
//
// VERSAND: Seit dem Mahn-Consumer (lib/billing/dunning/mahn-versand.ts)
// kann derselbe Lauf die Queue auch abarbeiten. Das passiert NUR, wenn
// MAHNVERSAND_AUTOMATISCH='1' gesetzt ist — Mahnschreiben gehen an echte
// Kunden und wurden bisher bewusst erst nach Sichtung unter
// /admin/mahnwesen freigegeben. Ohne das Flag bleibt es beim bisherigen
// Verhalten: Queue befuellen, nichts verschicken. Manuell anstossen laesst
// sich der Versand jederzeit ueber POST /api/billing/dunning/versand.
//
// Der Consumer prueft unmittelbar vor jedem Versand erneut, ob die
// Rechnung inzwischen bezahlt oder blockiert ist, und storniert den
// Queue-Eintrag in dem Fall statt zu mahnen.
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
      return safeApiError(orgError, request)
    }

    // Versand nur mit ausdruecklicher Freischaltung: Mahnschreiben gehen an
    // echte Kunden. Ohne das Flag bleibt es beim bisherigen Verhalten —
    // Queue befuellen, nichts verschicken.
    const versandAktiv = process.env.MAHNVERSAND_AUTOMATISCH === '1'

    const laeufe: Array<Record<string, unknown>> = []
    let eskaliertGesamt = 0
    let blockiertGesamt = 0
    let versendetGesamt = 0
    let storniertGesamt = 0
    let aufgegebenGesamt = 0

    for (const org of orgs || []) {
      try {
        // actorId = Org-ID: der Lauf ist systemgetrieben, es gibt keinen
        // handelnden Benutzer. Der Audit-Eintrag bleibt so zuordenbar.
        const result = await runDunningRun(supabaseAdmin, org.id, org.id, { sendEmails: true })
        eskaliertGesamt += result.eskaliert.length
        blockiertGesamt += result.blockiert.length

        const eintrag: Record<string, unknown> = {
          organizationId: org.id,
          name: org.name,
          geprueft: result.geprueft,
          eskaliert: result.eskaliert.length,
          blockiert: result.blockiert.length,
          unveraendert: result.unveraendert,
          details: result.eskaliert,
        }

        if (versandAktiv) {
          try {
            const q = await verarbeiteMahnQueue(supabaseAdmin, {
              organizationId: org.id,
              actorId: org.id,
              // Faellige Fehlversuche werden mitgenommen. Ohne das blieb
              // jede einmal gescheiterte Mahnung fuer immer liegen —
              // reaktiviereFehlgeschlagene() haelt Obergrenze und
              // Wartezeit ein, ein Dead Letter kommt nicht zurueck.
              wiederholen: true,
            })
            versendetGesamt += q.versendet
            storniertGesamt += q.storniert
            aufgegebenGesamt += q.aufgegeben
            eintrag.versand = {
              geprueft: q.geprueft,
              versendet: q.versendet,
              storniert: q.storniert,
              fehlgeschlagen: q.fehlgeschlagen,
              aufgegeben: q.aufgegeben,
              uebersprungen: q.uebersprungen,
              reaktiviert: q.reaktiviert,
            }
          } catch (versandErr) {
            eintrag.versandFehler = versandErr instanceof Error ? versandErr.message : String(versandErr)
          }
        }

        laeufe.push(eintrag)
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
      versand: versandAktiv
        ? {
            aktiv: true,
            versendet: versendetGesamt,
            storniert: storniertGesamt,
            // Dead Letter: diese Mahnungen gehen nie mehr raus. Steht im
            // Cron-Ergebnis, damit ein Anstieg im Betriebsprotokoll
            // auffaellt, statt in der Queue zu verstauben.
            aufgegeben: aufgegebenGesamt,
          }
        : {
            aktiv: false,
            hinweis: 'MAHNVERSAND_AUTOMATISCH ist nicht gesetzt — Queue wurde nur befüllt.',
          },
      laeufe,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
}
