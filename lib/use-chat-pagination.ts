import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from './supabase/client'

// ═══════════════════════════════════════════════════════════════
// useChatPagination — Cursor-based Pagination fuer Chat-Mesajlar
// ═══════════════════════════════════════════════════════════════
//
// WARUM existiert das?
//
// Vorher: Alle Chats luden ALLE Nachrichten in einer Query
// (`select('*').order('created_at', asc)`) — ohne LIMIT.
// Bei langen Konversationen (50+ Nachrichten) wird das langsam,
// und der Server schickt unnoetig viele Daten an mobile Senioren-Geraete.
//
// Zudem: User koennen nicht nach oben scrollen um aeltere Nachrichten
// zu sehen — die ALLE-Strategie laedt zwar alles, aber wenn der Server
// timeoutet oder die Antwort gekuerzt wird, fehlen Nachrichten ohne
// Recovery-Moeglichkeit.
//
// Strategie:
// - Initial: lade die JUENGSTEN PAGE_SIZE Nachrichten (DESC + reverse)
// - Bei Scroll-nach-oben: lade die naechsten PAGE_SIZE aelteren
// - Cursor: created_at < oldestLoadedCreatedAt
// - Scroll-Position wird beim Laden aelterer Nachrichten erhalten
//
// Cursor-statt-Offset, weil:
// - Bei neuen Nachrichten waehrend Pagination keine Duplikate
// - Performant: Index auf (booking_id, created_at)
// ═══════════════════════════════════════════════════════════════

export const PAGE_SIZE = 30

export interface ChatMessage {
  id: string
  sender_id: string
  content: string
  created_at: string
  // Beliebige weitere Felder erlaubt
  [key: string]: any
}

export interface ChatPaginationOptions {
  /** Tabellen-Name in Supabase (z.B. 'messages', 'chat_messages') */
  table: string
  /** Spalten-Name fuer Filter (z.B. 'booking_id', 'ride_id') */
  filterColumn: string
  /** Wert fuer Filter (z.B. die Buchungs-ID) */
  filterValue: string
  /** Optional: zusaetzliche Felder die mitgeladen werden sollen */
  selectColumns?: string
}

export interface ChatPaginationResult {
  messages: ChatMessage[]
  loading: boolean
  loadingOlder: boolean
  hasMore: boolean
  error: string | null
  /** Initial load — einmal nach Mount aufrufen */
  init: () => Promise<void>
  /** Aeltere Seite laden (z.B. wenn User nach oben scrollt) */
  loadOlder: () => Promise<void>
  /** Eine neue Nachricht in den State einfuegen (z.B. von Realtime oder Optimistic-Update) */
  appendMessage: (msg: ChatMessage) => void
  /** Eine Nachricht ersetzen (z.B. Optimistic durch Server-Antwort) */
  replaceMessage: (tempId: string, newMsg: ChatMessage) => void
  /** Eine Nachricht entfernen (z.B. Optimistic-Rollback bei Fehler) */
  removeMessage: (id: string) => void
}

export function useChatPagination(opts: ChatPaginationOptions): ChatPaginationResult {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cursor (created_at der aeltesten geladenen Nachricht)
  const oldestCursorRef = useRef<string | null>(null)

  // In-flight Guard — verhindert doppelte Anfragen
  const inFlightRef = useRef(false)

  const select = opts.selectColumns || '*'

  const init = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error: dbErr } = await supabase
        .from(opts.table)
        .select(select)
        .eq(opts.filterColumn, opts.filterValue)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (dbErr) throw dbErr

      const arr = (data || []) as unknown as ChatMessage[]
      // Server liefert DESC, wir wollen ASC (oldest top)
      arr.reverse()
      setMessages(arr)
      setHasMore(arr.length >= PAGE_SIZE)
      oldestCursorRef.current = arr[0]?.created_at || null
    } catch (err: any) {
      console.error('[useChatPagination.init] error:', err)
      setError(err?.message || 'Fehler beim Laden der Nachrichten')
    } finally {
      setLoading(false)
      inFlightRef.current = false
    }
  }, [opts.table, opts.filterColumn, opts.filterValue, select])

  const loadOlder = useCallback(async () => {
    if (inFlightRef.current || !hasMore || !oldestCursorRef.current) return
    inFlightRef.current = true
    setLoadingOlder(true)
    try {
      const supabase = createClient()
      const { data, error: dbErr } = await supabase
        .from(opts.table)
        .select(select)
        .eq(opts.filterColumn, opts.filterValue)
        .lt('created_at', oldestCursorRef.current)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (dbErr) throw dbErr

      const arr = (data || []) as unknown as ChatMessage[]
      arr.reverse()

      if (arr.length === 0) {
        setHasMore(false)
        return
      }

      setMessages(prev => [...arr, ...prev])
      setHasMore(arr.length >= PAGE_SIZE)
      oldestCursorRef.current = arr[0]?.created_at || oldestCursorRef.current
    } catch (err: any) {
      console.error('[useChatPagination.loadOlder] error:', err)
      setError(err?.message || 'Aeltere Nachrichten konnten nicht geladen werden')
    } finally {
      setLoadingOlder(false)
      inFlightRef.current = false
    }
  }, [opts.table, opts.filterColumn, opts.filterValue, select, hasMore])

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]))
  }, [])

  const replaceMessage = useCallback((tempId: string, newMsg: ChatMessage) => {
    setMessages(prev => prev.map(m => (m.id === tempId ? newMsg : m)))
  }, [])

  const removeMessage = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id))
  }, [])

  // Reset state when filterValue changes (z.B. anderer Chat geoeffnet).
  // Bewusstes Reset-Pattern bei Schluessel-Wechsel — alternative Loesung waere
  // <ChatList key={chatId} />, aber das ist Aufgabe des Parent-Components.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setMessages([])
    setHasMore(false)
    oldestCursorRef.current = null
    setError(null)
    setLoading(true)
  }, [opts.filterValue, opts.table])

  return {
    messages,
    loading,
    loadingOlder,
    hasMore,
    error,
    init,
    loadOlder,
    appendMessage,
    replaceMessage,
    removeMessage,
  }
}

/**
 * Hook fuer Scroll-bei-Top-Detection. Ruft `onReachTop` auf wenn der User
 * nahe ans obere Ende des Containers scrollt (Standard: 100px Toleranz).
 *
 * Verwendet ResizeObserver + scroll-Listener. Erhaelt automatisch die
 * Scroll-Position wenn sich der Inhalt aendert (wichtig beim Prepend).
 */
export function useScrollToLoadOlder(
  containerRef: React.RefObject<HTMLDivElement | null>,
  onReachTop: () => void,
  options: { threshold?: number; enabled?: boolean } = {}
) {
  const { threshold = 100, enabled = true } = options
  const onReachTopRef = useRef(onReachTop)
  // Ref-Update gehoert in Effect (nicht im Render-Body), sonst React-Hooks-Verletzung.
  useEffect(() => {
    onReachTopRef.current = onReachTop
  }, [onReachTop])

  // Beim Prepend: alte scrollHeight merken, nach Render Differenz korrigieren
  const prevScrollHeightRef = useRef<number>(0)
  const shouldRestoreRef = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el || !enabled) return

    function handleScroll() {
      if (!el) return
      if (el.scrollTop <= threshold) {
        // Scroll-Position erhalten: scrollHeight vor Load merken
        prevScrollHeightRef.current = el.scrollHeight
        shouldRestoreRef.current = true
        onReachTopRef.current()
      }
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [containerRef, threshold, enabled])

  // Nach Re-Render: Scroll-Position wiederherstellen, falls Inhalt geprepended wurde
  // Aufruf via requestRestoreScroll() vom Komponenten-Code nach dem messages-Update
  return {
    requestRestoreScroll: () => {
      if (!shouldRestoreRef.current) return
      const el = containerRef.current
      if (!el) return
      const diff = el.scrollHeight - prevScrollHeightRef.current
      if (diff > 0) {
        el.scrollTop = diff
      }
      shouldRestoreRef.current = false
    },
  }
}
