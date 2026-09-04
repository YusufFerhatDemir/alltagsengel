'use server'
/**
 * Server Actions für den Bewerberablauf — Alternative zu den API-Routen.
 *
 * ── WANN WELCHER WEG ───────────────────────────────────────────────────
 * Die Seite unter app/onboarding/bewerber nutzt die API-Routen: der
 * Wizard ist eine Client-Komponente, braucht den Fehlerfall als Rückgabe
 * (nicht als Ausnahme) und lädt eine Datei per FormData hoch.
 *
 * Diese Actions sind für den umgekehrten Fall gedacht: ein Formular, das
 * ohne JavaScript abgeschickt wird, oder eine Server-Komponente, die den
 * Stand direkt schreibt. Beide Wege laufen durch DIESELBEN Funktionen in
 * lib/onboarding/service.ts — es gibt keine zweite Regelmenge, die man
 * vergessen könnte abzusichern.
 *
 * ── SIE WERFEN NICHT ───────────────────────────────────────────────────
 * Eine Action, die wirft, wird in der Oberfläche zu einem unbrauchbaren
 * „Something went wrong". Diese hier liefern `{ ok, fehler }` zurück,
 * damit der Aufrufer den Text anzeigen und den Stand behalten kann —
 * dieselbe Zusage wie im Wizard: Eingaben gehen nicht verloren.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgIdOrDefault } from '@/lib/organizations/server'
import {
  holeOderStarte, merkeAbbruch, schliesseAb, speichereSchritt,
  type OnboardingFortschritt,
} from '@/lib/onboarding/service'
import { baueEinreichung } from '@/lib/onboarding/einreichung'
import type { SchrittStatus } from '@/lib/onboarding/schritte'
import { logger } from '@/lib/logger'

const log = logger.child('onboarding:actions')

export type ActionErgebnis<T = undefined> =
  | { ok: true; daten: T }
  | { ok: false; fehler: string }

const TYP = 'bewerber' as const

async function kennung() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { userId: user.id, organizationId: await getActiveOrgIdOrDefault(), typ: TYP }
}

const NICHT_ANGEMELDET = 'Bitte melden Sie sich an, um Ihren Stand zu speichern.'

/** Eigenen Stand holen (legt ihn beim ersten Aufruf an). */
export async function ladeFortschritt(): Promise<ActionErgebnis<OnboardingFortschritt>> {
  const k = await kennung()
  if (!k) return { ok: false, fehler: NICHT_ANGEMELDET }
  try {
    return { ok: true, daten: await holeOderStarte(createAdminClient(), k) }
  } catch (err) {
    log.errorWithException('Fortschritt laden', err)
    return { ok: false, fehler: 'Ihr Stand konnte nicht geladen werden.' }
  }
}

/** Einen Schritt speichern. */
export async function speichereSchrittAction(eingabe: {
  schritt: number
  daten?: Record<string, unknown>
  status?: SchrittStatus
}): Promise<ActionErgebnis<OnboardingFortschritt>> {
  const k = await kennung()
  if (!k) return { ok: false, fehler: NICHT_ANGEMELDET }
  try {
    return { ok: true, daten: await speichereSchritt(createAdminClient(), k, eingabe) }
  } catch (err) {
    // Der Text kommt aus dem Service und ist bereits für Menschen
    // geschrieben — er wird durchgereicht, nicht ersetzt.
    return {
      ok: false,
      fehler: err instanceof Error ? err.message : 'Das Speichern hat nicht geklappt.',
    }
  }
}

/** „Später fortsetzen": Abbruchstelle merken. */
export async function merkeAbbruchAction(stelle: string): Promise<ActionErgebnis> {
  const k = await kennung()
  if (!k) return { ok: false, fehler: NICHT_ANGEMELDET }
  try {
    await merkeAbbruch(createAdminClient(), k, String(stelle).slice(0, 120))
    return { ok: true, daten: undefined }
  } catch (err) {
    log.errorWithException('Abbruchstelle merken', err)
    // Nur die Auswertung leidet — der Stand selbst ist gespeichert.
    return { ok: false, fehler: 'Der Stand wurde gespeichert.' }
  }
}

/**
 * Bewerbung einreichen. Gleiche Reihenfolge wie in der API-Route: erst
 * die Bewerbung anlegen, dann den Ablauf abschließen.
 */
export async function sendeBewerbungAction(): Promise<ActionErgebnis<{ bereitsEingereicht: boolean }>> {
  const k = await kennung()
  if (!k) return { ok: false, fehler: NICHT_ANGEMELDET }

  try {
    const admin = createAdminClient()
    const fortschritt = await holeOderStarte(admin, k)

    const { error } = await admin.from('lead_inquiries').insert({
      ...baueEinreichung({
        schritteDaten: fortschritt.schritteDaten,
        fehlendeAngaben: fortschritt.fehlendeAngaben,
        fortschrittId: fortschritt.id,
        organizationId: k.organizationId,
      }),
      // Ausdrücklich an der Aufrufstelle — siehe API-Route.
      organization_id: k.organizationId,
    })

    if (error && error.code !== '23505') {
      log.errorWithException('Bewerbung nicht speicherbar', new Error(error.message))
      return { ok: false, fehler: 'Das Absenden hat nicht geklappt. Ihre Angaben sind gespeichert.' }
    }

    await schliesseAb(admin, k)
    return { ok: true, daten: { bereitsEingereicht: error?.code === '23505' } }
  } catch (err) {
    return {
      ok: false,
      fehler: err instanceof Error ? err.message : 'Das Absenden hat nicht geklappt.',
    }
  }
}
