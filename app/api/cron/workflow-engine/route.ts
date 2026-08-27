import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { pruefeCronGeheimnis } from '@/lib/api/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { processPending, checkFristen } from '@/lib/workflow/processing'
import { withTracking } from '@/lib/monitoring/tracker'

// ═══════════════════════════════════════════════════════════
// CRON: WORKFLOW-ENGINE (wf_events / wf_warteschlange / wf_dead_letter)
// ═══════════════════════════════════════════════════════════
// `wf_process_pending()` und `wf_check_fristen()` (Migration
// 20260813010000_workflow_engine.sql) waren bislang nur ueber POST
// /api/ops/workflow/processing manuell (Superadmin-Button) erreichbar —
// kein Registereintrag in vercel.json, kein GitHub-Workflow, kein Aufruf
// aus lib/automation/index.ts. Ohne einen Taktgeber verarbeitet niemand
// die Warteschlange automatisch: neue Events blieben in 'neu' liegen,
// fehlgeschlagene Warteschlangen-Eintraege liefen nie in den naechsten
// Versuch (naechster_versuch mit exponentiellem Backoff wird nie erneut
// geprueft) und Eintraege, die ihre max_versuche erreicht haben, landen
// zwar korrekt im Dead Letter (DB-seitig bereits robust), aber ohne
// Lauf merkt das niemand rechtzeitig. Gleiches Muster wie beim
// Zustellungs-Retry, siehe .github/workflows/zustellung-retry.yml und
// [[zustellung-retry-worker]] in der Projekt-Historie.
//
// TAKT: alle 5 Minuten ueber .github/workflows/workflow-engine.yml.
// In vercel.json steht zusaetzlich ein taeglicher Rueckfall um 02:00 Uhr,
// weil Vercel in diesem Tarif keinen Sub-Tages-Cron zulaesst (siehe
// [[ci-deploy-topologie]]).
//
// Reihenfolge bewusst: erst Fristenpruefung (kann neue Events erzeugen),
// danach Verarbeitung — sonst wartet eine frisch erzeugte Frist-Meldung
// bis zum naechsten Takt.
export const GET = withTracking(async function GET(request: Request) {
  const abweisung = pruefeCronGeheimnis(request)
  if (abweisung) return abweisung

  const admin = createAdminClient()
  try {
    const fristen = await checkFristen(admin)
    const verarbeitung = await processPending(admin, { limit: 100 })
    return NextResponse.json({ fristen, verarbeitung })
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
