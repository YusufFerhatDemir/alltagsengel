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

export async function wendeAenderungAn(params: WendeAenderungParams): Promise<WendeAenderungErgebnis> {
  const url = new URL(params.endpoint, params.origin).toString()
  const antwort = await fetch(url, {
    method: params.methode,
    headers: {
      'Content-Type': 'application/json',
      Cookie: params.cookieHeader,
    },
    body: JSON.stringify(params.payload),
  })
  const text = antwort.ok ? '' : await antwort.text().catch(() => antwort.statusText)
  return { ok: antwort.ok, status: antwort.status, text }
}
