// ═══════════════════════════════════════════════════════════════
// Angehörigenportal — Server-seitige Hilfsfunktionen
// Prüft Zugang + Bereich-Freigabe, liefert Klient-Daten
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import type { AngehoerigenZugang, FreigabeBereich } from './types'

export interface PortalAuthContext {
  userId: string
  organizationId: string
  zugaenge: AngehoerigenZugang[]
}

export type PortalAuthResult =
  | { ok: true; ctx: PortalAuthContext }
  | { ok: false; response: NextResponse }

/**
 * Server-seitige Auth-Prüfung für das Angehörigenportal.
 * Prüft ob der User eingeloggt ist und mindestens einen aktiven Zugang hat.
 */
export async function requirePortalAccess(): Promise<PortalAuthResult> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  const { data: zugaenge, error: zugangError } = await supabase
    .from('angehoerigen_zugaenge')
    .select('*')
    .eq('user_id', user.id)
    .eq('organization_id', organizationId)
    .eq('status', 'aktiv')

  if (zugangError) {
    return { ok: false, response: NextResponse.json({ error: 'Zugang konnte nicht geprüft werden.' }, { status: 500 }) }
  }

  // Abgelaufene Zugänge filtern
  const aktiveZugaenge = (zugaenge ?? []).filter(z => {
    if (z.gueltig_bis && new Date(z.gueltig_bis) < new Date()) return false
    return true
  }) as AngehoerigenZugang[]

  if (aktiveZugaenge.length === 0) {
    return { ok: false, response: NextResponse.json({ error: 'Kein aktiver Zugang vorhanden.' }, { status: 403 }) }
  }

  return {
    ok: true,
    ctx: { userId: user.id, organizationId, zugaenge: aktiveZugaenge },
  }
}

/**
 * Prüft ob ein bestimmter Bereich in mindestens einem Zugang freigegeben ist.
 */
export function hatPortalBereichZugriff(
  zugaenge: AngehoerigenZugang[],
  bereich: FreigabeBereich,
  clientId?: string,
): boolean {
  return zugaenge.some(z => {
    if (clientId && z.client_id !== clientId) return false
    if (bereich === 'pflegeberichte' && !z.pflegeberichte_freigegeben) return false
    return z.freigegebene_bereiche.includes(bereich)
  })
}

/**
 * Gibt alle Client-IDs zurück, für die der User Zugang zu einem bestimmten Bereich hat.
 */
export function erlaubteClientIds(
  zugaenge: AngehoerigenZugang[],
  bereich: FreigabeBereich,
): string[] {
  return zugaenge
    .filter(z => {
      if (bereich === 'pflegeberichte' && !z.pflegeberichte_freigegeben) return false
      return z.freigegebene_bereiche.includes(bereich)
    })
    .map(z => z.client_id)
}
