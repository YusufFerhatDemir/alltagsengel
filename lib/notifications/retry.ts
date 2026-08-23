// ═══════════════════════════════════════════════════════════════════════
// Wiederholung von Benachrichtigungen — idempotent ueber
// (correlation_id, channel)
// ═══════════════════════════════════════════════════════════════════════
//
// WARUM NICHT AUS DEM PROTOKOLL HERAUS WIEDERHOLT WIRD
// notification_delivery_log speichert bewusst KEINEN Nachrichteninhalt:
// Betreff, Text und Anhang einer Pflege- oder Rechnungsmail sind
// Gesundheits- bzw. Finanzdaten und haben in einem Betriebsprotokoll
// nichts verloren. Eine Wiederholung kann deshalb nicht "die Zeile
// nochmal senden" — sie fuehrt den fachlichen Vorgang erneut aus.
//
// Genau dafuer ist `sendeIdempotent()` da: der Aufrufer uebergibt seinen
// normalen Versandaufruf, davor liegt der Idempotenz-Riegel. Der zweite
// Lauf desselben Vorgangs macht dann nichts mehr.
//
// DIE DREI SPERREN
//   1. Vorab-Abfrage `bereitsZugestellt()` — fail-closed (kein Lesen
//      moeglich ⇒ es wird NICHT gesendet).
//   2. Versuchsobergrenze samt Wartezeit (exponentiell) — verhindert,
//      dass ein dauerhaft kaputter Empfaenger den Lauf jede Runde
//      erneut belastet.
//   3. Der Partial-Unique-Index in der Datenbank (Migration
//      20260923000000) — faengt zwei GLEICHZEITIGE Laeufe ab, gegen die
//      eine Vorab-Abfrage prinzipiell machtlos ist.
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import {
  bereitsZugestellt,
  protokolliereZustellung,
  type ZustellKanal,
  type ZustellKontext,
  type ZustellProvider,
} from '@/lib/notifications/delivery-log'

const log = logger.child('zustellung-retry')

/** Hoechstzahl an Versuchen pro (Vorgang, Kanal), danach bleibt es liegen. */
export const MAX_VERSUCHE = 5

/**
 * Wartezeit vor dem naechsten Versuch, in Minuten, nach Versuchsnummer.
 * Index 0 = nach dem 1. Fehlversuch. Der letzte Wert gilt fuer alles
 * darueber hinaus. Exponentiell, damit ein laengerer Provider-Ausfall
 * nicht zu Hunderten Versuchen fuehrt.
 */
const WARTEZEIT_MINUTEN = [5, 15, 60, 240] as const

export function wartezeitMinuten(bisherigeVersuche: number): number {
  if (bisherigeVersuche < 1) return 0
  const i = Math.min(bisherigeVersuche - 1, WARTEZEIT_MINUTEN.length - 1)
  return WARTEZEIT_MINUTEN[i]
}

export interface SendeErgebnis {
  ok: boolean
  /** Provider-seitige Nachrichten-ID, falls vorhanden. */
  providerMessageId?: string | null
  /**
   * true, wenn gar nicht versendet wurde, weil eine Voraussetzung fehlt
   * (kein API-Key, keine Adresse). Wird als 'skipped' protokolliert und
   * zaehlt NICHT gegen die Versuchsobergrenze.
   */
  uebersprungen?: boolean
  fehler?: unknown
}

export interface IdempotentParams {
  /** organizationId ist Pflicht, correlationId ebenfalls — sonst gibt es keine Idempotenz. */
  kontext: ZustellKontext & { correlationId: string }
  channel: ZustellKanal
  provider: ZustellProvider
  recipient: string
  /** Der eigentliche Versand. Wird nur aufgerufen, wenn keine Sperre greift. */
  senden: () => Promise<SendeErgebnis>
  /** Default: MAX_VERSUCHE. */
  maxVersuche?: number
  /** Wartezeiten ignorieren (manueller Nachversand durch die Verwaltung). */
  sofort?: boolean
  /** Eigener Client; sonst wird der Admin-Client geholt. */
  admin?: SupabaseClient
}

export type IdempotentStatus =
  | 'versendet'
  | 'uebersprungen'
  | 'fehlgeschlagen'
  | 'bereits_zugestellt'
  | 'wartet'
  | 'aufgegeben'

export interface IdempotentErgebnis {
  status: IdempotentStatus
  grund?: string
  providerMessageId?: string | null
  /** Nummer dieses Versuchs (1 = Erstversand). */
  versuch: number
}

interface VersuchsStand {
  versuche: number
  letzterVersuch: string | null
  lesbar: boolean
}

/**
 * Liest, wie oft dieser Vorgang auf diesem Kanal schon versucht wurde.
 *
 * `lesbar: false` bedeutet: Tabelle fehlt oder Abfrage kaputt. Der
 * Aufrufer behandelt das als "keine Historie" und laesst den Erstversand
 * durch — die harte Dublettensperre ist der Unique-Index, nicht diese
 * Zaehlung.
 */
async function leseVersuchsStand(
  client: SupabaseClient,
  correlationId: string,
  channel: ZustellKanal
): Promise<VersuchsStand> {
  try {
    const { data, error } = await client
      .from('notification_delivery_log')
      .select('attempt_count, attempted_at, created_at, status')
      .eq('correlation_id', correlationId)
      .eq('channel', channel)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error || !data) return { versuche: 0, letzterVersuch: null, lesbar: false }

    // 'skipped' zaehlt nicht als Versuch: da wurde nie etwas verschickt.
    const echte = data.filter(z => z.status !== 'skipped')
    const letzte = echte[0] as { attempted_at?: string | null; created_at?: string } | undefined
    return {
      versuche: echte.length,
      letzterVersuch: letzte?.attempted_at ?? letzte?.created_at ?? null,
      lesbar: true,
    }
  } catch {
    return { versuche: 0, letzterVersuch: null, lesbar: false }
  }
}

async function holeClient(admin?: SupabaseClient): Promise<SupabaseClient | null> {
  if (admin) return admin
  try {
    const mod = await import('@/lib/supabase/admin')
    return mod.createAdminClient()
  } catch {
    return null
  }
}

/**
 * Versendet genau einmal pro (Vorgang, Kanal).
 *
 * Der Erstversand geht denselben Weg wie die Wiederholung — dadurch gibt
 * es keine zweite Codebahn, die man vergessen kann abzusichern.
 */
export async function sendeIdempotent(params: IdempotentParams): Promise<IdempotentErgebnis> {
  const {
    kontext,
    channel,
    provider,
    recipient,
    senden,
    maxVersuche = MAX_VERSUCHE,
    sofort = false,
  } = params

  const client = await holeClient(params.admin)

  // ── Sperre 1: schon zugestellt? (fail-closed) ──
  const schonDa = await bereitsZugestellt(
    {
      correlationId: kontext.correlationId,
      channel,
      organizationId: kontext.organizationId,
    },
    client ?? undefined
  )
  if (schonDa) {
    return { status: 'bereits_zugestellt', versuch: 0, grund: 'Bereits erfolgreich zugestellt' }
  }

  // ── Sperre 2: Versuchsobergrenze und Wartezeit ──
  const stand = client
    ? await leseVersuchsStand(client, kontext.correlationId, channel)
    : { versuche: 0, letzterVersuch: null, lesbar: false }

  if (stand.lesbar) {
    if (stand.versuche >= maxVersuche) {
      log.warn('Zustellung aufgegeben — Versuchsobergrenze erreicht', {
        channel,
        correlationId: kontext.correlationId,
        versuche: stand.versuche,
      })
      return {
        status: 'aufgegeben',
        versuch: stand.versuche,
        grund: `Nach ${stand.versuche} Versuchen aufgegeben`,
      }
    }

    if (!sofort && stand.letzterVersuch && stand.versuche > 0) {
      const wartenBis =
        new Date(stand.letzterVersuch).getTime() + wartezeitMinuten(stand.versuche) * 60_000
      if (Number.isFinite(wartenBis) && Date.now() < wartenBis) {
        return {
          status: 'wartet',
          versuch: stand.versuche,
          grund: `Naechster Versuch fruehestens ${new Date(wartenBis).toISOString()}`,
        }
      }
    }
  }

  const versuch = stand.versuche + 1

  // ── Versand ──
  let ergebnis: SendeErgebnis
  try {
    ergebnis = await senden()
  } catch (err) {
    ergebnis = { ok: false, fehler: err }
  }

  if (ergebnis.uebersprungen) {
    await protokolliereZustellung(
      {
        ...kontext,
        channel,
        provider,
        recipient,
        status: 'skipped',
        fehler: ergebnis.fehler,
        // Uebersprungene Laeufe zaehlen nicht hoch — sonst waere die
        // Obergrenze schon erreicht, bevor je etwas gesendet wurde.
        attemptCount: Math.max(1, stand.versuche),
      },
      client ?? undefined
    )
    return { status: 'uebersprungen', versuch: stand.versuche, grund: 'Voraussetzung fehlt' }
  }

  if (!ergebnis.ok) {
    await protokolliereZustellung(
      {
        ...kontext,
        channel,
        provider,
        recipient,
        status: 'failed',
        fehler: ergebnis.fehler,
        attemptCount: versuch,
      },
      client ?? undefined
    )
    return { status: 'fehlgeschlagen', versuch, grund: 'Versand fehlgeschlagen' }
  }

  // ── Sperre 3: Unique-Index. Greift er, hat parallel jemand anderes
  //    denselben Vorgang zugestellt. Der Versand ist trotzdem raus —
  //    das Ergebnis wird ehrlich als Dublette gemeldet.
  const protokoll = await protokolliereZustellung(
    {
      ...kontext,
      channel,
      provider,
      recipient,
      status: 'sent',
      providerMessageId: ergebnis.providerMessageId ?? null,
      attemptCount: versuch,
    },
    client ?? undefined
  )

  if (protokoll.doppelt) {
    log.warn('Zustellung parallel doppelt ausgeloest', {
      channel,
      correlationId: kontext.correlationId,
    })
  }

  return {
    status: 'versendet',
    versuch,
    providerMessageId: ergebnis.providerMessageId ?? null,
  }
}

// ───────────────────────────────────────────────────────────────────────
// Auswertung fuer die Verwaltung
// ───────────────────────────────────────────────────────────────────────

export interface OffeneZustellung {
  id: string
  channel: ZustellKanal
  recipient: string
  correlationId: string | null
  notificationId: string | null
  attemptCount: number
  sanitizedError: string | null
  createdAt: string
  wiederholbarAb: string | null
  aufgegeben: boolean
}

/**
 * Alle Vorgaenge, die auf ihrem Kanal noch nicht zugestellt sind.
 *
 * Grundlage fuer die Betriebsansicht und fuer Wiederholungslaeufe: die
 * correlation_id sagt dem Aufrufer, welchen fachlichen Vorgang er erneut
 * anstossen muss.
 */
export async function offeneZustellungen(
  organizationId: string,
  optionen: { limit?: number; admin?: SupabaseClient } = {}
): Promise<OffeneZustellung[]> {
  const client = await holeClient(optionen.admin)
  if (!client) return []

  try {
    const { data, error } = await client
      .from('notification_delivery_log')
      .select(
        'id, channel, recipient, correlation_id, notification_id, attempt_count, sanitized_error, created_at, attempted_at, status'
      )
      .eq('organization_id', organizationId)
      .in('status', ['queued', 'failed'])
      .order('created_at', { ascending: false })
      .limit(optionen.limit ?? 200)

    if (error || !data) {
      if (error) {
        log.warn('Offene Zustellungen nicht lesbar', { errorMessage: error.message })
      }
      return []
    }

    // Ein Vorgang, der auf demselben Kanal spaeter doch geklappt hat, ist
    // nicht offen. Die Erfolgszeilen werden hier nachgeladen und die
    // betroffenen Schluessel herausgefiltert.
    const korrelationen = data
      .map(z => z.correlation_id as string | null)
      .filter((v): v is string => typeof v === 'string')

    const erledigt = new Set<string>()
    if (korrelationen.length > 0) {
      const { data: erfolge } = await client
        .from('notification_delivery_log')
        .select('correlation_id, channel')
        .eq('organization_id', organizationId)
        .in('status', ['sent', 'delivered'])
        .in('correlation_id', Array.from(new Set(korrelationen)))
      for (const e of erfolge ?? []) {
        erledigt.add(`${e.correlation_id}:${e.channel}`)
      }
    }

    return data
      .filter(z => !erledigt.has(`${z.correlation_id}:${z.channel}`))
      .map(z => {
        const versuche = (z.attempt_count as number) ?? 1
        const basis = (z.attempted_at as string | null) ?? (z.created_at as string)
        const wiederholbarAb = basis
          ? new Date(new Date(basis).getTime() + wartezeitMinuten(versuche) * 60_000).toISOString()
          : null
        return {
          id: z.id as string,
          channel: z.channel as ZustellKanal,
          recipient: z.recipient as string,
          correlationId: (z.correlation_id as string | null) ?? null,
          notificationId: (z.notification_id as string | null) ?? null,
          attemptCount: versuche,
          sanitizedError: (z.sanitized_error as string | null) ?? null,
          createdAt: z.created_at as string,
          wiederholbarAb,
          aufgegeben: versuche >= MAX_VERSUCHE,
        }
      })
  } catch (err) {
    log.errorWithException('offeneZustellungen', err)
    return []
  }
}
