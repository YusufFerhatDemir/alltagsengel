// Server-seitiger Admin-Check für die Abrechnungs-API-Routen.
import { NextResponse } from 'next/server'
import { holeRollenQuellen, quellenDuerfen } from '@/lib/auth/rollen-quelle'
import type { Berechtigung } from '@/lib/auth/rollen'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { zweiterFaktorRiegel } from '@/lib/auth/zweiter-faktor'

/**
 * Rollenkonzept (lib/auth/rollen.ts): geprueft wird eine BERECHTIGUNG,
 * nicht die Rolle. Default ist die Lese-Berechtigung der Abrechnung —
 * schreibende Routen uebergeben 'abrechnung.schreiben', Routen an
 * Zugangsdaten/Zertifikaten 'system.verwalten' (lib/auth/bereiche.ts).
 */
export async function requireAdmin(
  berechtigung: Berechtigung = 'abrechnung.lesen'
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }) }
  }
  if (!quellenDuerfen(quellen, berechtigung)) {
    return { ok: false, response: NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 }) }
  }
  // Zweiter Faktor: Konto MIT bestaetigtem Faktor muss auf AAL2 stehen.
  // Fail-open bleibt ausdruecklich fuer Konten OHNE Faktor — sonst kaeme
  // niemand mehr an die Einrichtung heran. Ob ein Faktor existiert, sagt
  // jetzt die Faktorliste und nicht mehr das Gelingen der AAL-Abfrage
  // (Block 95, lib/auth/zweiter-faktor.ts).
  const aalBlock = await zweiterFaktorRiegel(supabase, quellen.faktoren)
  if (aalBlock) return { ok: false, response: aalBlock }
  return { ok: true }
}

/**
 * Admin-Check inklusive aktiver Organisation.
 *
 * Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
 * NICHT an profiles — profiles hat keine organization_id-Spalte. Guards, die
 * sie dort selektieren, liefern still 403.
 *
 * Jede Route, die Mandantendaten liest oder schreibt, muss ueber diesen
 * Einstieg gehen: eine fehlende organization_id ist der Unterschied zwischen
 * "eigene Stammdaten" und "Stammdaten aller Mandanten".
 *
 * Rollenkonzept (lib/auth/rollen.ts): geprueft wird eine BERECHTIGUNG,
 * nicht die Rolle.
 */
export async function requireAdminMitOrg(
  berechtigung: Berechtigung = 'abrechnung.lesen'
): Promise<
  | { ok: true; userId: string; organizationId: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }) }
  }
  if (!quellenDuerfen(quellen, berechtigung)) {
    return { ok: false, response: NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 }) }
  }
  // Zweiter Faktor: Konto MIT bestaetigtem Faktor muss auf AAL2 stehen.
  // Fail-open bleibt ausdruecklich fuer Konten OHNE Faktor — sonst kaeme
  // niemand mehr an die Einrichtung heran. Ob ein Faktor existiert, sagt
  // jetzt die Faktorliste und nicht mehr das Gelingen der AAL-Abfrage
  // (Block 95, lib/auth/zweiter-faktor.ts).
  const aalBlock = await zweiterFaktorRiegel(supabase, quellen.faktoren)
  if (aalBlock) return { ok: false, response: aalBlock }

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen' }, { status: 403 }) }
  }

  return { ok: true, userId: quellen.userId, organizationId }
}
