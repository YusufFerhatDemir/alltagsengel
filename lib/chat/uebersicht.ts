/**
 * Letzte Nachricht und Ungelesen-Zähler für eine Chatübersicht.
 *
 * ── DER BEFUND VOM 13.09.2026 ─────────────────────────────────────────
 * `app/kunde/chat` und `app/engel/chat` haben je Buchung ZWEI Abfragen
 * abgesetzt — die letzte Nachricht und den Ungelesen-Zähler — und zwar
 * nacheinander in einer `for`-Schleife. Bei zwanzig Buchungen sind das
 * vierzig serialisierte Rundreisen, bevor die Liste erscheint. Beide
 * Seiten hatten denselben Code zweimal.
 *
 * Hier stehen es **zwei** Abfragen insgesamt, unabhängig von der Zahl der
 * Buchungen. Das Zusammenfassen passiert im Speicher.
 *
 * ── WARUM NICHT IM SQL GRUPPIERT ──────────────────────────────────────
 * PostgREST kann kein `GROUP BY` über die REST-Schnittstelle. Die
 * Alternative wäre eine Datenbankfunktion — DDL, und die ist aus der
 * Agentensitzung nicht möglich (42501). Zwei Abfragen plus Auswertung im
 * Speicher lösen dasselbe Problem ohne Migration.
 *
 * ── GRENZE ────────────────────────────────────────────────────────────
 * Für die ungelesenen Nachrichten werden nur die IDs geholt, nicht die
 * Inhalte. Bei sehr vielen ungelesenen Nachrichten bleibt das eine
 * überschaubare Liste; für die letzte Nachricht je Buchung begrenzt
 * `NACHRICHTEN_OBERGRENZE` die Menge.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Wie viele Nachrichten höchstens geladen werden, um die jeweils letzte
 * je Buchung zu bestimmen.
 *
 * Absteigend sortiert: die erste je Buchung ist die neueste. Die Grenze
 * schützt vor einer Übersicht, die versehentlich den ganzen
 * Nachrichtenbestand zieht.
 */
export const NACHRICHTEN_OBERGRENZE = 500

export interface LetzteNachricht {
  content: string
  created_at: string
}

export interface ChatZusammenfassung {
  /** Letzte Nachricht je `booking_id` — fehlt, wenn noch keine da ist. */
  letzte: Map<string, LetzteNachricht>
  /** Ungelesene je `booking_id`, nur für den angegebenen Empfänger. */
  ungelesen: Map<string, number>
}

/**
 * Holt beides in zwei Abfragen — nicht in zwei je Buchung.
 *
 * @param bookingIds Buchungen der Übersicht. Leer ⇒ keine Abfrage.
 * @param empfaengerId Wessen ungelesene Nachrichten gezählt werden.
 */
export async function chatZusammenfassung(
  supabase: SupabaseClient,
  bookingIds: readonly string[],
  empfaengerId: string,
): Promise<ChatZusammenfassung> {
  const leer: ChatZusammenfassung = { letzte: new Map(), ungelesen: new Map() }
  if (bookingIds.length === 0) return leer

  const ids = [...new Set(bookingIds)]

  const [nachrichten, offene] = await Promise.all([
    supabase
      .from('messages')
      .select('booking_id, content, created_at')
      .in('booking_id', ids)
      .order('created_at', { ascending: false })
      .limit(NACHRICHTEN_OBERGRENZE),
    supabase
      .from('messages')
      .select('booking_id')
      .in('booking_id', ids)
      .eq('receiver_id', empfaengerId)
      .eq('read', false),
  ])

  if (nachrichten.error) {
    throw new Error(`Nachrichten konnten nicht geladen werden: ${nachrichten.error.message}`)
  }
  if (offene.error) {
    throw new Error(`Nachrichtenzähler konnte nicht geladen werden: ${offene.error.message}`)
  }

  const letzte = new Map<string, LetzteNachricht>()
  for (const n of nachrichten.data ?? []) {
    const id = (n as { booking_id?: string }).booking_id
    if (!id || letzte.has(id)) continue      // absteigend sortiert: die erste ist die neueste
    letzte.set(id, { content: (n as any).content, created_at: (n as any).created_at })
  }

  const ungelesen = new Map<string, number>()
  for (const o of offene.data ?? []) {
    const id = (o as { booking_id?: string }).booking_id
    if (!id) continue
    ungelesen.set(id, (ungelesen.get(id) ?? 0) + 1)
  }

  return { letzte, ungelesen }
}

/** Uhrzeit einer Nachricht, wie die Übersicht sie zeigt. */
export function uhrzeit(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}
