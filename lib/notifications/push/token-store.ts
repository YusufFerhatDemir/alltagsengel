// ═══════════════════════════════════════════════════════════════════════
// Geraete-Token — Registrierung, Rotation, Widerspruch
// ═══════════════════════════════════════════════════════════════════════
//
// Traegt public.fcm_tokens (Baseline) in der Fassung von Migration
// 20260930000000: mit organization_id, UNIQUE (user_id, token) und
// last_used_at.
//
// ZWEI DINGE, DIE HIER BEWUSST UNTERSCHIEDLICH SCHEITERN
//
//   Ist die Migration noch nicht eingespielt, fehlt die Spalte
//   organization_id. PostgREST antwortet dann mit 42703 und verwirft die
//   GANZE Abfrage — nicht nur die Spalte (siehe Memory "Schema-Drift
//   42703"). Jede Leseabfrage hier faengt das ab und wiederholt ohne die
//   neue Spalte. Die Mandantengrenze geht dabei nicht verloren: die
//   eigentliche Grenze ist user_id, und die gibt es seit jeher.
//
//   Der Widerspruch (`pushErlaubt`) ist umgekehrt fail-CLOSED. Fehlt die
//   Tabelle noch, gilt "erlaubt" — sonst waere der Kanal vor dem Apply
//   komplett tot. Bei JEDEM anderen Lesefehler gilt "nicht erlaubt": ob
//   ein Nutzer widersprochen hat, ist eine Einwilligungsfrage, und auf
//   die darf man nicht raten.
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { istPushPlattform, type Geraet, type PushPlattform } from './typen'

const log = logger.child('push:token')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function istUuid(wert: unknown): wert is string {
  return typeof wert === 'string' && UUID_RE.test(wert)
}

/** PostgREST-Code fuer "Spalte gibt es nicht". */
const SPALTE_FEHLT = '42703'
/** PostgREST-Code fuer "Tabelle gibt es nicht". */
const TABELLE_FEHLT = '42P01'

function fehlerCode(fehler: unknown): string | null {
  if (fehler && typeof fehler === 'object' && 'code' in fehler) {
    const c = (fehler as { code?: unknown }).code
    if (typeof c === 'string') return c
  }
  return null
}

async function holeClient(admin?: SupabaseClient): Promise<SupabaseClient | null> {
  if (admin) return admin
  try {
    const mod = await import('@/lib/supabase/admin')
    return mod.createAdminClient()
  } catch (err) {
    log.errorWithException('Kein Admin-Client fuer Geraete-Token', err)
    return null
  }
}

/**
 * Ein FCM-Registration-Token ist lang und undurchsichtig. In Logs gehoert
 * nur ein Anfang davon — genug, um zwei Geraete zu unterscheiden, zu
 * wenig, um damit zu senden.
 */
export function tokenKuerzel(token: string): string {
  return token.length <= 12 ? '…' : `${token.slice(0, 12)}…`
}

// ───────────────────────────────────────────────────────────────────────
// Registrierung
// ───────────────────────────────────────────────────────────────────────

export interface RegistrierParams {
  userId: string
  organizationId: string
  token: string
  platform?: string
  deviceInfo?: string | null
  admin?: SupabaseClient
}

export interface RegistrierErgebnis {
  ok: boolean
  /** true, wenn das Geraet schon bekannt war und nur aufgefrischt wurde. */
  bekannt: boolean
  grund?: string
}

/**
 * Legt ein Geraet an oder frischt es auf.
 *
 * Idempotent ueber (user_id, token) — derselbe App-Start liefert bei
 * jedem Aufruf denselben Token und darf keine zweite Zeile erzeugen,
 * sonst bekommt der Nutzer jede Nachricht mehrfach. Die Eindeutigkeit
 * steht in der Datenbank (UNIQUE-Index), nicht nur hier.
 *
 * Wechselt der Nutzer die Organisation, wandert das Geraet mit: der
 * Upsert setzt organization_id neu. Ein Geraet gehoert dem Nutzer, nicht
 * dem Mandanten.
 */
export async function registriereGeraet(
  params: RegistrierParams
): Promise<RegistrierErgebnis> {
  const { userId, organizationId, token } = params

  if (!istUuid(userId)) return { ok: false, bekannt: false, grund: 'Ungueltige Nutzer-ID' }
  if (typeof token !== 'string' || token.trim().length < 20) {
    return { ok: false, bekannt: false, grund: 'Ungueltiger Token' }
  }
  const plattform: PushPlattform = istPushPlattform(params.platform)
    ? params.platform
    : 'android'

  const client = await holeClient(params.admin)
  if (!client) return { ok: false, bekannt: false, grund: 'Kein Datenbank-Client' }

  const jetzt = new Date().toISOString()
  const bekannt = (await geraetExistiert(client, userId, token)) === true

  const zeile: Record<string, unknown> = {
    user_id: userId,
    token: token.trim(),
    platform: plattform,
    device_info: params.deviceInfo ?? null,
    updated_at: jetzt,
  }
  if (istUuid(organizationId)) zeile.organization_id = organizationId

  const schreibe = async (mitOrg: boolean, mitLastUsed: boolean) => {
    const nutzlast = { ...zeile }
    if (!mitOrg) delete nutzlast.organization_id
    if (mitLastUsed) nutzlast.last_used_at = jetzt
    return client.from('fcm_tokens').upsert(nutzlast, { onConflict: 'user_id,token' })
  }

  let { error } = await schreibe(true, true)

  // Migration noch nicht eingespielt: ohne die neuen Spalten erneut
  // versuchen, statt die Registrierung ganz zu verlieren.
  if (error && fehlerCode(error) === SPALTE_FEHLT) {
    log.warn('fcm_tokens ohne neue Spalten — Registrierung im Altformat', {
      errorMessage: error.message,
    })
    ;({ error } = await schreibe(false, false))
  }

  if (error) {
    log.error('Geraet nicht registrierbar', {
      errorMessage: error.message,
      tokenKuerzel: tokenKuerzel(token),
    })
    return { ok: false, bekannt, grund: error.message }
  }

  return { ok: true, bekannt }
}

async function geraetExistiert(
  client: SupabaseClient,
  userId: string,
  token: string
): Promise<boolean | null> {
  try {
    const { count, error } = await client
      .from('fcm_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('token', token)
    if (error) return null
    return (count ?? 0) > 0
  } catch {
    return null
  }
}

// ───────────────────────────────────────────────────────────────────────
// Abmeldung und Rotation
// ───────────────────────────────────────────────────────────────────────

/**
 * Entfernt ein Geraet des Nutzers (Logout, Push in den Einstellungen
 * abgeschaltet).
 *
 * Immer auf user_id eingeschraenkt: ein fremder Token darf sich nicht
 * ueber diesen Weg loeschen lassen, auch nicht versehentlich.
 */
export async function entferneGeraet(
  userId: string,
  token: string,
  admin?: SupabaseClient
): Promise<{ ok: boolean; grund?: string }> {
  if (!istUuid(userId)) return { ok: false, grund: 'Ungueltige Nutzer-ID' }
  if (typeof token !== 'string' || !token.trim()) return { ok: false, grund: 'Token fehlt' }

  const client = await holeClient(admin)
  if (!client) return { ok: false, grund: 'Kein Datenbank-Client' }

  const { error } = await client
    .from('fcm_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('token', token.trim())

  if (error) {
    log.error('Geraet nicht entfernbar', { errorMessage: error.message })
    return { ok: false, grund: error.message }
  }
  return { ok: true }
}

/**
 * Token-Rotation: FCM hat das Geraet als endgueltig unerreichbar
 * gemeldet (App deinstalliert, Token durch die Firebase-SDK ersetzt).
 *
 * Anders als `entferneGeraet` OHNE user_id — der Aufrufer ist der
 * Sendeweg und kennt nur den Token. Das ist unbedenklich: der Token ist
 * eindeutig, und eine Adresse, an die Google nicht mehr zustellt, hat in
 * keiner Zeile etwas verloren.
 */
export async function entwerteToken(
  token: string,
  grund: string,
  admin?: SupabaseClient
): Promise<boolean> {
  const client = await holeClient(admin)
  if (!client) return false

  const { error } = await client.from('fcm_tokens').delete().eq('token', token)
  if (error) {
    log.warn('Ungueltiger Token nicht entfernbar', { errorMessage: error.message })
    return false
  }
  log.info('Geraete-Token entfernt (Rotation)', { tokenKuerzel: tokenKuerzel(token), grund })
  return true
}

/** Merkt den erfolgreichen Zustellzeitpunkt. Best effort — nie blockierend. */
export async function markiereGenutzt(
  tokens: string[],
  admin?: SupabaseClient
): Promise<void> {
  if (tokens.length === 0) return
  const client = await holeClient(admin)
  if (!client) return
  try {
    const { error } = await client
      .from('fcm_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .in('token', tokens)
    if (error && fehlerCode(error) !== SPALTE_FEHLT) {
      log.warn('last_used_at nicht schreibbar', { errorMessage: error.message })
    }
  } catch {
    /* Nutzungszeitpunkt ist Statistik, kein Zustellzustand. */
  }
}

// ───────────────────────────────────────────────────────────────────────
// Lesen
// ───────────────────────────────────────────────────────────────────────

/**
 * Alle Geraete eines Nutzers.
 *
 * `organizationId` engt zusaetzlich ein. Der Aufrufer laeuft mit
 * service_role und umgeht RLS — die Einschraenkung muss deshalb hier
 * stehen, sonst gibt es sie nicht (Kontrakt aus lib/organizations/server).
 */
export async function geraeteFuerNutzer(
  userId: string,
  organizationId?: string,
  admin?: SupabaseClient
): Promise<Geraet[]> {
  if (!istUuid(userId)) return []
  const client = await holeClient(admin)
  if (!client) return []

  // Zwei getrennte Abfragen statt einer mit variabler Spaltenliste: der
  // Typ-Parser von supabase-js liest die Spaltenliste zur Uebersetzungs-
  // zeit und kommt mit einem Ausdruck an dieser Stelle nicht zurecht.
  const leseMitOrg = async () => {
    let q = client
      .from('fcm_tokens')
      .select('id, user_id, token, platform, organization_id, last_used_at')
      .eq('user_id', userId)
    if (istUuid(organizationId)) q = q.eq('organization_id', organizationId)
    return q
  }

  const leseOhneOrg = async () =>
    client.from('fcm_tokens').select('id, user_id, token, platform').eq('user_id', userId)

  let { data, error } = (await leseMitOrg()) as {
    data: Record<string, unknown>[] | null
    error: { code?: string; message: string } | null
  }

  if (error && fehlerCode(error) === SPALTE_FEHLT) {
    log.warn('fcm_tokens ohne organization_id — Mandantenfilter entfaellt', {
      hinweis: 'Migration 20260930000000 noch nicht eingespielt',
    })
    ;({ data, error } = (await leseOhneOrg()) as {
      data: Record<string, unknown>[] | null
      error: { code?: string; message: string } | null
    })
  }

  if (error) {
    log.error('Geraete nicht lesbar', { errorMessage: error.message })
    return []
  }

  return (data ?? []).map((z: Record<string, unknown>) => ({
    id: String(z.id),
    userId: String(z.user_id),
    organizationId: typeof z.organization_id === 'string' ? z.organization_id : null,
    token: String(z.token),
    platform: istPushPlattform(z.platform) ? z.platform : 'android',
    lastUsedAt: typeof z.last_used_at === 'string' ? z.last_used_at : null,
  }))
}

// ───────────────────────────────────────────────────────────────────────
// Widerspruch
// ───────────────────────────────────────────────────────────────────────

export interface PushErlaubnis {
  erlaubt: boolean
  grund?: string
}

/**
 * Hat der Nutzer dem Push-Kanal widersprochen?
 *
 * FEHLENDE ZEILE = ERLAUBT. Ein registriertes Geraet ist bereits eine
 * Einwilligung: das Betriebssystem hat gefragt, der Nutzer hat zugesagt.
 * Die Zeile in notification_preferences ist der spaetere Widerruf.
 *
 * FEHLENDE TABELLE = ERLAUBT (Migration nicht eingespielt).
 * JEDER ANDERE FEHLER = NICHT ERLAUBT. Ob ein Widerspruch vorliegt, ist
 * eine Einwilligungsfrage — bei Unklarheit wird nicht gesendet.
 */
export async function pushErlaubt(
  userId: string,
  organizationId?: string,
  admin?: SupabaseClient
): Promise<PushErlaubnis> {
  if (!istUuid(userId)) return { erlaubt: false, grund: 'Ungueltige Nutzer-ID' }

  const client = await holeClient(admin)
  if (!client) return { erlaubt: false, grund: 'Einwilligung nicht pruefbar' }

  try {
    let q = client
      .from('notification_preferences')
      .select('enabled')
      .eq('user_id', userId)
      .eq('channel', 'push')
    if (istUuid(organizationId)) q = q.eq('organization_id', organizationId)

    const { data, error } = await q.limit(1)

    if (error) {
      if (fehlerCode(error) === TABELLE_FEHLT) {
        return { erlaubt: true, grund: 'Widerspruchstabelle fehlt — Migration offen' }
      }
      log.warn('Push-Einwilligung nicht lesbar — es wird NICHT gesendet', {
        errorMessage: error.message,
      })
      return { erlaubt: false, grund: 'Einwilligung nicht lesbar' }
    }

    const zeile = (data ?? [])[0] as { enabled?: boolean } | undefined
    if (!zeile) return { erlaubt: true }
    return zeile.enabled === false
      ? { erlaubt: false, grund: 'Nutzer hat Push abgewaehlt' }
      : { erlaubt: true }
  } catch (err) {
    log.errorWithException('Push-Einwilligung: Ausnahme', err)
    return { erlaubt: false, grund: 'Einwilligung nicht pruefbar' }
  }
}

/** Setzt den Widerspruch (oder nimmt ihn zurueck). */
export async function setzePushErlaubnis(
  userId: string,
  organizationId: string,
  erlaubt: boolean,
  admin?: SupabaseClient
): Promise<{ ok: boolean; grund?: string }> {
  if (!istUuid(userId) || !istUuid(organizationId)) {
    return { ok: false, grund: 'Ungueltige IDs' }
  }
  const client = await holeClient(admin)
  if (!client) return { ok: false, grund: 'Kein Datenbank-Client' }

  const { error } = await client.from('notification_preferences').upsert(
    {
      user_id: userId,
      organization_id: organizationId,
      channel: 'push',
      enabled: erlaubt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,channel' }
  )

  if (error) return { ok: false, grund: error.message }
  return { ok: true }
}
