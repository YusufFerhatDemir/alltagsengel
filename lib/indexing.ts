/**
 * Indexing-Notifier für alltagsengel.care — pingt Suchmaschinen, sobald
 * neue/aktualisierte URLs verfügbar sind. Beschleunigt Erst-Indexierung
 * dramatisch (Stunden statt Wochen). Muster übernommen von ChairMatch.
 *
 * Implementiert: IndexNow (Bing, Yandex, Seznam, Naver) — kein Setup auf
 * Suchmaschinen-Seite nötig, nur das Key-File muss public erreichbar sein:
 *   https://alltagsengel.care/<KEY>.txt   (liegt in public/)
 *
 * Aufruf:
 *   import { notifyIndexers } from '@/lib/indexing'
 *   await notifyIndexers(['https://alltagsengel.care/blog/neuer-artikel'])
 *
 * Bulk-Ping aller Sitemap-URLs: npx tsx scripts/indexnow-ping.ts
 *
 * Failure-Mode: fire-and-forget mit Try/Catch — niemals einen Hot-Path
 * blockieren, wenn ein Indexer down ist.
 */

const INDEXNOW_HOST = 'alltagsengel.care'

/**
 * Der Key ist per Protokoll-Design ÖFFENTLICH (wird als Klartext-File an
 * jeden ausgeliefert) — kein Secret, darf im Repo liegen. Rotation:
 * `openssl rand -hex 16`, hier + public/<KEY>.txt ersetzen, deployen.
 * ENV INDEXNOW_KEY überschreibt den Fallback.
 */
export const INDEXNOW_FALLBACK_KEY = '220086f2a9d279a78836a0b250338d81'

export interface IndexNowResult {
  ok: boolean
  status?: number
  error?: string
  submitted?: number
}

/** IndexNow Protocol: https://www.indexnow.org/ */
export async function notifyIndexers(urls: string[]): Promise<IndexNowResult> {
  const key = process.env.INDEXNOW_KEY || INDEXNOW_FALLBACK_KEY

  const cleanUrls = Array.from(new Set(
    urls
      .map((u) => u.trim())
      .filter((u) => u.startsWith(`https://${INDEXNOW_HOST}/`) || u === `https://${INDEXNOW_HOST}`)
  ))
  if (cleanUrls.length === 0) return { ok: true, submitted: 0 }

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: INDEXNOW_HOST,
        key,
        keyLocation: `https://${INDEXNOW_HOST}/${key}.txt`,
        urlList: cleanUrls,
      }),
    })
    if (!res.ok) {
      console.warn(`[indexing] IndexNow-Ping fehlgeschlagen: HTTP ${res.status}`)
    }
    return { ok: res.ok, status: res.status, submitted: cleanUrls.length }
  } catch (e) {
    console.warn('[indexing] IndexNow-Ping Fehler:', e)
    return { ok: false, error: String(e) }
  }
}
