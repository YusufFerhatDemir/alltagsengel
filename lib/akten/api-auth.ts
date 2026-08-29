// ═══════════════════════════════════════════════════════════════
// Auth-Guard für app/api/akten/** — analog dem Inline-Pattern aus
// app/api/billing/dta/**/route.ts, hier als Helper gebündelt weil
// von 13 Routen identisch gebraucht.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { holeRollenQuellen, quellenDuerfen } from '@/lib/auth/rollen-quelle'
import type { Berechtigung } from '@/lib/auth/rollen'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'

export interface AktenAuthContext {
  userId: string
  organizationId: string
  role: string
  /**
   * Prueft eine WEITERE Berechtigung desselben Aufrufers, ohne die
   * Rollenquellen erneut zu laden.
   *
   * Gebraucht, wo eine Route mehrere Bestaende in EINER Antwort mischt.
   * `/api/akten/suche` ist der Fall: sie liefert Klienten- UND
   * Mitarbeiterdokumente, verlangt aber nur `stammdaten.lesen`. Die Rolle
   * `buchhaltung` hat genau diese und ausdruecklich NICHT `personal.lesen`
   * — lib/auth/rollen.ts haelt das woertlich fest („keine
   * Gesundheitsdaten und keine Personalakten"). Ueber die Suche waren
   * Fuehrungszeugnisse, Arbeitsvertraege und Qualifikationsnachweise
   * trotzdem lesbar.
   *
   * Der Weg fuehrt ueber `quellenDuerfen` und damit ueber BEIDE
   * Rollenquellen — nicht ueber `ctx.role` allein: `app_metadata.role`
   * kann einschraenken, und wer nur die Profilrolle liest, kaeme zu einer
   * weiteren Antwort als der Guard darueber.
   */
  darf: (berechtigung: Berechtigung) => boolean
}

export type AktenAuthResult =
  | { ok: true; ctx: AktenAuthContext }
  | { ok: false; response: NextResponse }

/** Admin/Superadmin-Guard mit Organisationszuordnung — für alle /admin/api/akten-Routen. */
/**
 * Rollenkonzept (lib/auth/rollen.ts): der Guard prueft nicht mehr auf
 * „ist Admin", sondern auf eine BERECHTIGUNG. admin/superadmin haben alle,
 * pdl/qm/buchhaltung nur die ihrer Aufgabe. Der Default ist die
 * Lese-Berechtigung des Fachbereichs; schreibende Routen uebergeben die
 * Schreib-Berechtigung ausdruecklich.
 */
export async function requireAktenAdmin(
  berechtigung: Berechtigung = 'stammdaten.lesen'
): Promise<AktenAuthResult> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  if (!quellenDuerfen(quellen, berechtigung)) {
    return { ok: false, response: NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 }) }
  }

  // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
  // NICHT an profiles — profiles hat keine organization_id-Spalte.
  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  return {
    ok: true,
    ctx: {
      userId: quellen.userId,
      organizationId,
      role: quellen.rolle,
      darf: (weitere: Berechtigung) => quellenDuerfen(quellen, weitere),
    },
  }
}

/**
 * Wehrt einen Schreibzugriff auf ein Dokument der PERSONALAKTE ab, wenn
 * dem Aufrufer `personal.lesen` fehlt.
 *
 * BEFUND 29.08.2026, innerhalb EINER Datei sichtbar: In
 * `app/api/akten/dokumente/[id]/route.ts` prueft der GET-Handler seit
 * 0ba1d61e `dokument.caregiver_id && !ctx.darf('personal.lesen')` — PATCH
 * und DELETE daneben nicht. Dasselbe fuer `[id]/sperren` und
 * `[id]/version`. Wer die Personalakte nicht LESEN darf, konnte ein
 * Dokument daraus also weiterhin umbenennen, sperren, ueberschreiben oder
 * loeschen. Die Schreibseite war offener als die Leseseite, und das ist in
 * jeder Richtung die falsche Reihenfolge.
 *
 * HEUTE IST DAS NICHT AUSNUTZBAR, und das ist ausdruecklich kein Grund,
 * es stehen zu lassen: `stammdaten.schreiben` hat aus ROLLEN_MATRIX nur,
 * wer auch `personal.lesen` hat (admin, superadmin, pdl). Der Riegel
 * haengt damit heute an einer Eigenschaft der Rollentabelle statt an einer
 * Pruefung — und die Rollentabelle ist genau die Stelle, an der jemand
 * spaeter eine Rolle ergaenzt.
 *
 * Gibt `null` zurueck, wenn der Zugriff weitergehen darf.
 *
 * 403 und nicht 404: dass es das Dokument gibt, verraet die Kennung
 * ohnehin; ein 404 wuerde behaupten, es existiere nicht, und diese
 * Falschaussage loest spaeter niemand mehr auf. Ein unbekanntes Dokument
 * faellt hier bewusst durch — den 404 vergibt der eigentliche Vorgang,
 * der es ohnehin laedt.
 */
export async function personaldokumentAbgewehrt(
  dienstClient: SupabaseClient,
  dokumentId: string,
  ctx: AktenAuthContext,
): Promise<NextResponse | null> {
  if (ctx.darf('personal.lesen')) return null

  const { data } = await dienstClient
    .from('akten_dokumente')
    .select('caregiver_id')
    // Der Mandanten-Fence muss von Hand stehen: der Dienstschluessel
    // sieht `org_fence_akten_dokumente` nicht.
    .eq('organization_id', ctx.organizationId)
    .eq('id', dokumentId)
    .maybeSingle()

  if (data?.caregiver_id) {
    return NextResponse.json(
      { error: 'Dieses Dokument gehört zu einer Personalakte. Dafür fehlt Ihnen die Berechtigung.' },
      { status: 403 },
    )
  }
  return null
}

/**
 * Auth-Guard für Kunden-/Engel-lesende Routen (z. B. Download).
 * Prüft nur eingeloggten User — die eigentliche Berechtigung auf die
 * konkrete Zeile läuft über RLS (kunde_akten_dokumente_select /
 * engel_akten_dokumente_select / admin_akten_dokumente).
 */
export async function requireAktenUser(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }
  return { ok: true, userId: user.id }
}
