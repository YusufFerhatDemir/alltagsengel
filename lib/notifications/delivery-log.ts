// ═══════════════════════════════════════════════════════════════════════
// Zustellspur fuer Benachrichtigungen
// ═══════════════════════════════════════════════════════════════════════
//
// Schreibt nach public.notification_delivery_log (Migration
// 20260923000000). Gegenstueck zu invoice_email_log, aber fuer ALLE
// Kanaele: E-Mail (Resend), Web-Push, In-App und WhatsApp.
//
// GRUNDREGEL: Das Protokoll darf einen Versand NIE verhindern. Fehlt die
// Tabelle (Migration noch nicht eingespielt) oder schlaegt der Insert
// fehl, wird gewarnt und `ok: false` gemeldet — der Aufrufer versendet
// trotzdem. Der fachliche Zustand haengt weiterhin an notifications /
// invoices.sent_at.
//
// AUSNAHME davon ist `bereitsZugestellt()`: das ist eine bewusste
// Vorab-Sperre fuer den Wiederholungslauf. Sie ist fail-closed —
// laesst sich der Zustand nicht lesen, gilt der Vorgang als "schon
// zugestellt" und wird NICHT wiederholt. Lieber eine Nachricht zu wenig
// als eine doppelte Rechnungsmail.
// ═══════════════════════════════════════════════════════════════════════

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

const log = logger.child('zustellspur')

export const ZUSTELL_KANAELE = ['email', 'push', 'in_app', 'whatsapp'] as const
export type ZustellKanal = (typeof ZUSTELL_KANAELE)[number]

export const ZUSTELL_STATUS = ['queued', 'sent', 'delivered', 'failed', 'skipped'] as const
export type ZustellStatus = (typeof ZUSTELL_STATUS)[number]

export const ZUSTELL_PROVIDER = ['resend', 'web_push', 'supabase', 'whatsapp_api'] as const
export type ZustellProvider = (typeof ZUSTELL_PROVIDER)[number]

/** Endzustaende — daraus wird nicht mehr wiederholt. */
const ERFOLGSSTATUS: ReadonlySet<ZustellStatus> = new Set<ZustellStatus>(['sent', 'delivered'])

/**
 * Kontext, den ein Aufrufer mitgeben muss, damit ueberhaupt protokolliert
 * werden kann. Ohne `organizationId` gibt es keine Zeile — die Spalte ist
 * NOT NULL und traegt die Mandantengrenze (org_fence).
 */
export interface ZustellKontext {
  organizationId: string
  /** Zuordnung zum Geschaeftsvorfall (Buchung, Rechnung, Termin). */
  correlationId?: string | null
  /** Zeile in public.notifications, sofern der Kanal eine angelegt hat. */
  notificationId?: string | null
}

export interface ZustellEintrag extends ZustellKontext {
  channel: ZustellKanal
  /** E-Mail, Telefonnummer oder User-ID — je nach Kanal. */
  recipient: string
  status: ZustellStatus
  provider?: ZustellProvider | null
  providerMessageId?: string | null
  /** Roher Fehler; wird vor dem Schreiben sanitisiert. */
  fehler?: unknown
  /** Ueberschreibt den automatisch ermittelten Versuchszaehler. */
  attemptCount?: number
  queuedAt?: string | null
  attemptedAt?: string | null
  deliveredAt?: string | null
  failedAt?: string | null
}

export interface ZustellErgebnis {
  /** true, wenn eine Zeile geschrieben wurde. */
  ok: boolean
  /** true, wenn der Idempotenz-Riegel gegriffen hat (Erfolg existierte schon). */
  doppelt: boolean
  grund?: string
}

// ───────────────────────────────────────────────────────────────────────
// Fehler-Sanitisierung
// ───────────────────────────────────────────────────────────────────────

const MAX_FEHLERLAENGE = 500

/**
 * Ersetzungen in dieser Reihenfolge. Spezifisch vor allgemein: der
 * Bearer-Header muss weg, bevor die generische Base64-Regel ihn
 * halbherzig anfasst.
 */
const MUSTER: ReadonlyArray<readonly [RegExp, string]> = [
  // Authorization-Header und Query-Parameter mit Geheimnis
  [/\b(bearer)\s+[A-Za-z0-9._\-+/=]{8,}/gi, '$1 [entfernt]'],
  [/\b(api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|token|secret|password|passwort|pwd|signature|sig)\b(\s*[:=]\s*|"\s*:\s*")["']?[^\s,;"'&}]{4,}/gi, '$1=[entfernt]'],
  // Supabase- und Resend-Schluessel
  [/\bsb_(secret|publishable)_[A-Za-z0-9_-]{4,}/g, 'sb_$1_[entfernt]'],
  [/\bre_[A-Za-z0-9_-]{8,}/g, 're_[entfernt]'],
  // Dreiteiliges Token im JWT-Format
  [/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g, '[token entfernt]'],
  // PII
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email entfernt]'],
  [/\b[A-Z]{2}\d{2}[A-Za-z0-9]{10,30}\b/g, '[iban entfernt]'],
  [/\+?\d[\d\s()/-]{8,}\d/g, '[telefon entfernt]'],
  // Query-String an URLs abschneiden (kann Tokens tragen)
  [/(https?:\/\/[^\s?"']+)\?[^\s"']*/gi, '$1?[entfernt]'],
  // Lange undurchsichtige Zeichenketten (Hex/Base64) als letzte Instanz
  [/\b[A-Fa-f0-9]{32,}\b/g, '[hex entfernt]'],
  [/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '[base64 entfernt]'],
]

/**
 * Macht aus einem beliebigen Fehler einen Text, der ohne Bedenken in der
 * Datenbank liegen darf.
 *
 * Fail-closed: Was sich nicht sauber in Text ueberfuehren laesst, wird
 * NICHT roh durchgereicht, sondern durch einen Platzhalter ersetzt.
 */
export function sanitisiereFehler(fehler: unknown): string | null {
  if (fehler === null || fehler === undefined) return null

  let roh: string
  try {
    if (typeof fehler === 'string') {
      roh = fehler
    } else if (fehler instanceof Error) {
      // Stack bewusst NICHT: enthaelt Dateipfade des Servers.
      roh = fehler.message
    } else if (typeof fehler === 'object' && 'message' in (fehler as Record<string, unknown>)) {
      const m = (fehler as Record<string, unknown>).message
      roh = typeof m === 'string' ? m : JSON.stringify(m)
    } else if (typeof fehler === 'number' || typeof fehler === 'boolean') {
      roh = String(fehler)
    } else {
      roh = JSON.stringify(fehler)
    }
  } catch {
    return 'Fehler nicht darstellbar'
  }

  if (typeof roh !== 'string' || roh.trim() === '') return 'Unbekannter Fehler'

  let sauber = roh
  for (const [muster, ersatz] of MUSTER) {
    sauber = sauber.replace(muster, ersatz)
  }

  sauber = sauber.replace(/\s+/g, ' ').trim()
  if (sauber.length > MAX_FEHLERLAENGE) {
    sauber = sauber.slice(0, MAX_FEHLERLAENGE - 1) + '…'
  }
  return sauber || 'Unbekannter Fehler'
}

// ───────────────────────────────────────────────────────────────────────
// Client-Aufloesung
// ───────────────────────────────────────────────────────────────────────

/**
 * Dynamischer Import: lib/supabase/admin.ts traegt `server-only` und
 * darf nicht statisch in den Modulgraphen dieser Datei. Der Aufrufer
 * kann jederzeit einen eigenen Client uebergeben (Tests, Batchlaeufe,
 * die ohnehin schon einen haben).
 */
async function holeClient(admin?: SupabaseClient): Promise<SupabaseClient | null> {
  if (admin) return admin
  try {
    const mod = await import('@/lib/supabase/admin')
    return mod.createAdminClient()
  } catch (err) {
    log.errorWithException('Kein Admin-Client fuer die Zustellspur verfuegbar', err)
    return null
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function istUuid(wert: string | null | undefined): wert is string {
  return typeof wert === 'string' && UUID_RE.test(wert)
}

// ───────────────────────────────────────────────────────────────────────
// Schreiben
// ───────────────────────────────────────────────────────────────────────

/**
 * Zaehlt die bisherigen Versuche fuer denselben Vorgang.
 *
 * Zaehlgrundlage ist (correlation_id, channel); fehlt die correlation_id,
 * wird auf (notification_id, channel) ausgewichen. Ohne beides gibt es
 * keinen Vorgangsbezug — dann ist es immer Versuch 1.
 */
async function ermittleVersuch(
  client: SupabaseClient,
  eintrag: ZustellEintrag
): Promise<number> {
  const schluessel = istUuid(eintrag.correlationId)
    ? { spalte: 'correlation_id', wert: eintrag.correlationId }
    : istUuid(eintrag.notificationId)
      ? { spalte: 'notification_id', wert: eintrag.notificationId }
      : null

  if (!schluessel) return 1

  try {
    const { count, error } = await client
      .from('notification_delivery_log')
      .select('id', { count: 'exact', head: true })
      .eq(schluessel.spalte, schluessel.wert)
      .eq('channel', eintrag.channel)
    if (error) return 1
    return (count ?? 0) + 1
  } catch {
    return 1
  }
}

/**
 * Schreibt eine Zeile in die Zustellspur.
 *
 * Best effort — siehe Kopfkommentar. Verletzt der Insert den
 * Idempotenz-Index (zweiter Erfolg fuer denselben Vorgang), wird das
 * NICHT als Fehler behandelt, sondern als `doppelt: true` gemeldet: der
 * Aufrufer hat dann parallel zu einem anderen Lauf versendet.
 */
export async function protokolliereZustellung(
  eintrag: ZustellEintrag,
  admin?: SupabaseClient
): Promise<ZustellErgebnis> {
  if (!istUuid(eintrag.organizationId)) {
    log.warn('Zustellspur ohne gueltige Organisation — nicht protokolliert', {
      channel: eintrag.channel,
      status: eintrag.status,
    })
    return { ok: false, doppelt: false, grund: 'organization_id fehlt' }
  }

  const client = await holeClient(admin)
  if (!client) return { ok: false, doppelt: false, grund: 'Kein Datenbank-Client' }

  const jetzt = new Date().toISOString()
  const versuch = eintrag.attemptCount ?? (await ermittleVersuch(client, eintrag))

  const zeile = {
    organization_id: eintrag.organizationId,
    notification_id: istUuid(eintrag.notificationId) ? eintrag.notificationId : null,
    channel: eintrag.channel,
    recipient: eintrag.recipient,
    status: eintrag.status,
    attempt_count: Math.max(1, versuch),
    provider: eintrag.provider ?? null,
    provider_message_id: eintrag.providerMessageId ?? null,
    sanitized_error: sanitisiereFehler(eintrag.fehler),
    correlation_id: istUuid(eintrag.correlationId) ? eintrag.correlationId : null,
    queued_at: eintrag.queuedAt ?? (eintrag.status === 'queued' ? jetzt : null),
    attempted_at: eintrag.attemptedAt ?? (eintrag.status === 'queued' ? null : jetzt),
    delivered_at:
      eintrag.deliveredAt ?? (ERFOLGSSTATUS.has(eintrag.status) ? jetzt : null),
    failed_at: eintrag.failedAt ?? (eintrag.status === 'failed' ? jetzt : null),
  }

  try {
    const { error } = await client.from('notification_delivery_log').insert(zeile)
    if (error) {
      // 23505 = unique_violation → der Idempotenz-Index hat gegriffen.
      if (error.code === '23505') {
        log.info('Zustellspur: Erfolg war bereits protokolliert', {
          channel: eintrag.channel,
          correlationId: zeile.correlation_id ?? undefined,
        })
        return { ok: false, doppelt: true, grund: 'Bereits als zugestellt protokolliert' }
      }
      log.warn('Zustellspur nicht schreibbar — Versand bleibt gueltig', {
        channel: eintrag.channel,
        status: eintrag.status,
        errorMessage: error.message,
      })
      return { ok: false, doppelt: false, grund: error.message }
    }
    return { ok: true, doppelt: false }
  } catch (err) {
    log.errorWithException('Zustellspur: Ausnahme beim Schreiben', err, {
      channel: eintrag.channel,
    })
    return { ok: false, doppelt: false, grund: 'Ausnahme beim Schreiben' }
  }
}

// ───────────────────────────────────────────────────────────────────────
// Idempotenz-Abfrage
// ───────────────────────────────────────────────────────────────────────

export interface ZustellSchluessel {
  correlationId: string
  channel: ZustellKanal
  organizationId?: string
}

/**
 * Wurde dieser Vorgang auf diesem Kanal schon erfolgreich zugestellt?
 *
 * FAIL-CLOSED: Bei fehlender correlation_id, fehlendem Client, Lesefehler
 * oder Ausnahme wird `true` geliefert — "gilt als zugestellt". Der
 * Wiederholungslauf laesst den Vorgang dann liegen, statt eine mogliche
 * Dublette zu erzeugen. Der Erstversand geht diesen Weg NICHT; er hat
 * seinen eigenen Zustand (invoices.sent_at, notifications).
 */
export async function bereitsZugestellt(
  schluessel: ZustellSchluessel,
  admin?: SupabaseClient
): Promise<boolean> {
  if (!istUuid(schluessel.correlationId)) return true

  const client = await holeClient(admin)
  if (!client) return true

  try {
    let abfrage = client
      .from('notification_delivery_log')
      .select('id', { count: 'exact', head: true })
      .eq('correlation_id', schluessel.correlationId)
      .eq('channel', schluessel.channel)
      .in('status', ['sent', 'delivered'])

    if (istUuid(schluessel.organizationId)) {
      abfrage = abfrage.eq('organization_id', schluessel.organizationId)
    }

    const { count, error } = await abfrage
    if (error) {
      log.warn('Zustellspur nicht lesbar — Wiederholung wird ausgelassen', {
        channel: schluessel.channel,
        errorMessage: error.message,
      })
      return true
    }
    return (count ?? 0) > 0
  } catch (err) {
    log.errorWithException('Zustellspur: Ausnahme beim Lesen', err)
    return true
  }
}

// ───────────────────────────────────────────────────────────────────────
// Vorgangs-ID
// ───────────────────────────────────────────────────────────────────────

/** Namensraum-UUID (RFC 4122, "URL"). Fest — sonst aendern sich alle IDs. */
const NAMENSRAUM = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'

/**
 * Baut eine reproduzierbare Vorgangs-ID (UUID v5) aus beliebigen Teilen.
 *
 * WARUM NICHT EINFACH DIE FACHLICHE ID
 * correlation_id + channel ist der Idempotenzschluessel. Wuerde man fuer
 * jede Nachricht zu einer Buchung schlicht die booking_id nehmen, waere
 * schon die zweite Nachricht zu derselben Buchung ("angenommen", nachdem
 * "neue Anfrage" raus ist) eine vermeintliche Dublette und wuerde
 * blockiert. Der Vorgang ist deshalb nicht "die Buchung", sondern
 * "dieses Ereignis zu dieser Buchung fuer diesen Empfaenger".
 *
 * Gleiche Teile ⇒ gleiche UUID, auch ueber Prozessgrenzen und Neustarts
 * hinweg. Genau das macht die Wiederholung idempotent.
 *
 *   vorgangsId('booking-neu', bookingId, angelUserId)
 */
export function vorgangsId(...teile: Array<string | number>): string {
  const nsBytes = Buffer.from(NAMENSRAUM.replace(/-/g, ''), 'hex')
  const name = Buffer.from(teile.map(String).join(':'), 'utf8')
  const hash = createHash('sha1').update(Buffer.concat([nsBytes, name])).digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50 // Version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // Variante RFC 4122
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
