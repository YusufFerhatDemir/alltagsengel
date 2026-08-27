// ═══════════════════════════════════════════════════════════════
// Gemeinsame Ausführungslogik: ruft einen bestehenden Modul-Endpunkt
// per internem Fetch auf (gleicher Origin, Cookie-Weiterleitung).
// Wird sowohl vom Batch-Sync-Endpunkt (app/api/sync/route.ts) als auch
// bei der manuellen Konfliktauflösung im Admin-UI
// (app/api/admin/sync-konflikte/[id]/route.ts) genutzt, damit die
// Delegation an einer einzigen Stelle steht.
// ═══════════════════════════════════════════════════════════════

import type { SyncHttpMethode } from './entity-registry'

export interface WendeAenderungParams {
  origin: string
  endpoint: string
  methode: SyncHttpMethode
  payload: Record<string, unknown>
  cookieHeader: string
}

export interface WendeAenderungErgebnis {
  ok: boolean
  status: number
  text: string
}

/**
 * Zeitlimit fuer den internen Aufruf. `fetch` hat von sich aus KEINES: ein
 * haengender Ziel-Endpunkt blockierte den Batch-Lauf in app/api/sync/route.ts
 * unbegrenzt — und weil die Items dort sequentiell abgearbeitet werden, mit
 * ihm den gesamten restlichen Batch.
 */
export const SYNC_FETCH_TIMEOUT_MS = 20_000

/**
 * Der weitergereichte Cookie-Header ist die Sitzung des angemeldeten
 * Nutzers. Er darf ausschliesslich an den eigenen Origin gehen.
 *
 * `new URL(endpoint, origin)` ignoriert die Basis, sobald `endpoint` selbst
 * absolut ist ('https://…' oder auch protokollrelativ '//…') — der Aufruf
 * ginge dann samt Sitzungs-Cookie an einen fremden Host. Ebenso normalisiert
 * `new URL()` '..'-Segmente weg, wodurch ein praepariertes Pfadstueck aus
 * einem Registry-Endpunkt einen ganz anderen macht. Beides wird hier
 * abgefangen, unabhaengig davon, dass die Registry die IDs bereits prueft:
 * das ist die Stelle, an der der Cookie tatsaechlich das Haus verlaesst.
 */
function baueZielUrl(endpoint: string, origin: string): string {
  if (!endpoint.startsWith('/') || endpoint.startsWith('//')) {
    throw new Error(`Sync-Endpunkt muss ein origin-relativer Pfad sein: ${endpoint}`)
  }
  const basis = new URL(origin)
  const ziel = new URL(endpoint, basis)
  if (ziel.origin !== basis.origin) {
    throw new Error(`Sync-Endpunkt zeigt auf einen fremden Origin: ${endpoint}`)
  }
  if (!ziel.pathname.startsWith('/api/')) {
    throw new Error(`Sync-Endpunkt liegt ausserhalb von /api/: ${ziel.pathname}`)
  }
  return ziel.toString()
}

export async function wendeAenderungAn(params: WendeAenderungParams): Promise<WendeAenderungErgebnis> {
  const url = baueZielUrl(params.endpoint, params.origin)

  let antwort: Response
  try {
    antwort = await fetch(url, {
      method: params.methode,
      headers: {
        'Content-Type': 'application/json',
        Cookie: params.cookieHeader,
      },
      body: JSON.stringify(params.payload),
      signal: AbortSignal.timeout(SYNC_FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    // Als Ergebnis statt als Ausnahme: der Aufrufer protokolliert daraus
    // einen sync_error und arbeitet den restlichen Batch ab. Ein Wurf haette
    // hier zwar auch nicht den Batch abgebrochen, aber ohne Statuscode auch
    // keinen verwertbaren Audit-Eintrag hinterlassen.
    const abbruch = (err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError'
    return {
      ok: false,
      status: abbruch ? 504 : 502,
      text: abbruch
        ? `Zeitlimit von ${SYNC_FETCH_TIMEOUT_MS} ms ueberschritten.`
        : `Interner Aufruf fehlgeschlagen: ${(err as Error)?.message ?? 'unbekannt'}`,
    }
  }

  const text = antwort.ok ? '' : await antwort.text().catch(() => antwort.statusText)
  return { ok: antwort.ok, status: antwort.status, text }
}
