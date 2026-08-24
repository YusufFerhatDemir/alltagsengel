import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { notifyIndexers } from '@/lib/indexing'
import { logger } from '@/lib/logger'
import { pruefeCronGeheimnis } from '@/lib/api/cron-auth'
const log = logger.child('cron:indexnow')

// ═══════════════════════════════════════════════════════════
// VERCEL CRON JOB — IndexNow-Ping (Bing/Yandex/Seznam/Naver)
// ═══════════════════════════════════════════════════════════
// Pingt wöchentlich alle URLs der LIVE-Sitemap an IndexNow.
// Bing speist ChatGPT-Search & Copilot — Kern-GEO-Kanal.
// Bewusst Cron statt deploy.sh-Hook: zum Push-Zeitpunkt serviert
// Vercel die neuen URLs noch nicht; der Cron pingt nur, was live ist.
// Geschützt durch CRON_SECRET (Muster wie /api/cron/drip).
// ═══════════════════════════════════════════════════════════

const SITEMAP_URL = 'https://alltagsengel.care/sitemap.xml'

export async function GET(request: Request) {
  const abweisung = pruefeCronGeheimnis(request)
  if (abweisung) return abweisung

  try {
    const res = await fetch(SITEMAP_URL, { cache: 'no-store' })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Sitemap nicht erreichbar (${res.status})` },
        { status: 502 }
      )
    }
    const xml = await res.text()
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])

    const result = await notifyIndexers(urls)
    log.info('IndexNow-Ping', { result })

    return NextResponse.json({
      success: result.ok,
      urlCount: urls.length,
      timestamp: new Date().toISOString(),
      result,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
}
