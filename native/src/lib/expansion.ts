// ═══════════════════════════════════════════════════════════
// EXPANSION DEUTSCHLAND — Native-Client
// ═══════════════════════════════════════════════════════════
// Die App trifft KEINE eigene Entscheidung darüber, wo die
// Kassenabrechnung erlaubt ist. Sie fragt /api/expansion/status,
// wo dieselbe Logik läuft wie in der Web-App (state_settings).
//
// Damit gilt: Wird ein Bundesland im Admin freigeschaltet, ändert
// sich das Verhalten der App sofort — ohne App-Update, ohne Review,
// ohne Deployment.
//
// Fail-safe: Netzwerkfehler oder unklare Antwort ⇒ keine
// Kassenleistung anbieten (nur Privat/Warteliste).
// ═══════════════════════════════════════════════════════════

import { API_BASE } from '../constants/config'

export type ExpansionStatus =
  | 'VORBEREITUNG'
  | 'ANTRAG_EINGEREICHT'
  | 'IN_PRUEFUNG'
  | 'ANERKANNT'
  | 'ABGELEHNT'

export interface BundeslandLage {
  bundesland: string | null
  bundeslandName: string | null
  eindeutig: boolean
  plz: string | null
  status: ExpansionStatus
  werbung: boolean
  registrierung: boolean
  warteliste: boolean
  privatleistungen: boolean
  kassenabrechnung: boolean
  hinweis: string
  goLive: string | null
  ansprechpartner: { name: string | null; email: string | null; telefon: string | null }
}

export const TEXT_KASSE_IM_VERFAHREN =
  'Die Anerkennung für die Abrechnung mit den Pflegekassen befindet sich derzeit im ' +
  'Genehmigungsverfahren. Sie können sich bereits registrieren und werden automatisch ' +
  'informiert, sobald die Kassenabrechnung verfügbar ist.'

/** Zustand vor der ersten Antwort und bei jedem Fehler. */
export const FALLBACK_LAGE: BundeslandLage = {
  bundesland: null,
  bundeslandName: null,
  eindeutig: false,
  plz: null,
  status: 'VORBEREITUNG',
  werbung: true,
  registrierung: true,
  warteliste: true,
  privatleistungen: false,
  kassenabrechnung: false,
  hinweis: TEXT_KASSE_IM_VERFAHREN,
  goLive: null,
  ansprechpartner: { name: null, email: null, telefon: null },
}

const cache = new Map<string, { lage: BundeslandLage; ts: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Status für eine Postleitzahl abrufen.
 * Antwortet immer — im Fehlerfall mit dem Fail-safe-Zustand.
 */
export async function ladeBundeslandLage(plz: string): Promise<BundeslandLage> {
  const key = (plz || '').match(/\d{5}/)?.[0] ?? ''
  if (!key) return FALLBACK_LAGE

  const treffer = cache.get(key)
  if (treffer && Date.now() - treffer.ts < CACHE_TTL_MS) return treffer.lage

  try {
    const res = await fetch(`${API_BASE}/api/expansion/status?plz=${key}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return FALLBACK_LAGE

    const json = (await res.json()) as Partial<BundeslandLage>
    // Defensive Übernahme: fehlende Felder dürfen nie zu „Kasse an" führen.
    const lage: BundeslandLage = {
      ...FALLBACK_LAGE,
      ...json,
      kassenabrechnung: json.kassenabrechnung === true,
      privatleistungen: json.privatleistungen === true,
      ansprechpartner: json.ansprechpartner ?? FALLBACK_LAGE.ansprechpartner,
    }
    cache.set(key, { lage, ts: Date.now() })
    return lage
  } catch {
    return FALLBACK_LAGE
  }
}

/** Cache leeren (z. B. beim App-Start oder nach Pull-to-Refresh). */
export function leereLageCache(): void {
  cache.clear()
}

export interface WartelisteEintrag {
  plz?: string | null
  bundesland?: string | null
  name?: string | null
  email: string
  telefon?: string | null
  interesse?: 'kasse' | 'privat' | 'beides' | 'mitarbeit'
}

/** Auf die Warteliste des Bundeslands setzen. */
export async function wartelisteEintragen(
  eintrag: WartelisteEintrag
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/expansion/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quelle: 'native', interesse: 'kasse', ...eintrag }),
    })
    if (res.ok) return { ok: true }
    const data = await res.json().catch(() => null)
    return { ok: false, error: data?.error }
  } catch {
    return { ok: false, error: 'Keine Verbindung. Bitte später erneut versuchen.' }
  }
}
