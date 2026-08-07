// ═══════════════════════════════════════════════════════════════
// AKTIVES BUNDESLAND — serverseitiger Kontext für die Admin-Oberfläche
// ═══════════════════════════════════════════════════════════════
// Analog zur aktiven Organisation (lib/organizations/server.ts): Der
// Admin wählt oben in der Seitenleiste ein Bundesland; alle Listen und
// Auswertungen zeigen dann nur diesen Ausschnitt.
//
// Bewusst NUR ein Anzeigefilter — keine Sicherheitsgrenze. Die
// Mandantentrennung läuft weiterhin über organization_id und RLS, die
// Freischaltungslogik über state_settings. Ein manipuliertes Cookie
// kann höchstens die eigene Liste falsch filtern.
// ═══════════════════════════════════════════════════════════════

import { cookies } from 'next/headers'
import { normalizeBundesland } from './plz-bundesland'
import {
  ACTIVE_BUNDESLAND_COOKIE,
  ALLE_BUNDESLAENDER,
  type BundeslandAuswahl,
} from './types'

/**
 * Aktuell gewähltes Bundesland aus dem Cookie.
 * Ungültiger oder fehlender Wert → 'alle' (kein Filter).
 */
export async function getActiveBundesland(): Promise<BundeslandAuswahl> {
  try {
    const store = await cookies()
    const roh = store.get(ACTIVE_BUNDESLAND_COOKIE)?.value
    if (!roh || roh === ALLE_BUNDESLAENDER) return ALLE_BUNDESLAENDER
    return normalizeBundesland(roh) ?? ALLE_BUNDESLAENDER
  } catch {
    return ALLE_BUNDESLAENDER
  }
}

/**
 * Wie getActiveBundesland, liefert aber null statt 'alle' —
 * praktisch für `if (land) query.eq('bundesland', land)`.
 */
export async function getActiveBundeslandFilter(): Promise<string | null> {
  const auswahl = await getActiveBundesland()
  return auswahl === ALLE_BUNDESLAENDER ? null : auswahl
}
