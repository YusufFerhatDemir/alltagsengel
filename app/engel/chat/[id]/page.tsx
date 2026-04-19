'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import { isValidUUID, logError } from '@/lib/safe-query'
import { NotFoundState, ErrorState, LoadingState } from '@/components/UIStates'
import { IconUser } from '@/components/Icons'
import { useChatPagination, useScrollToLoadOlder } from '@/lib/use-chat-pagination'

export default function EngelChatConversationPage() {
  const params = useParams()
  const router = useRouter()
  const bookingId = params.id as string
  const [newMsg, setNewMsg] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [partner, setPartner] = useState<string>('Kunde')
  const [sending, setSending] = useState(false)
  const [pageStatus, setPageStatus] = useState<'loading' | 'ok' | 'not_found' | 'error'>('loading')
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const initialLoadDoneRef = useRef(false)

  // Pagination-Hook (cursor-based, lade neuste 30, scroll-up fuer aeltere)
  const {
    messages,
    loading: msgsLoading,
    loadingOlder,
    hasMore,
    error: paginationError,
    init: initMessages,
    loadOlder,
    appendMessage,
  } = useChatPagination({
    table: 'messages',
    filterColumn: 'booking_id',
    filterValue: bookingId,
    selectColumns: '*',
  })

  // Scroll-up Detector — laedt automatisch aeltere Nachrichten
  const { requestRestoreScroll } = useScrollToLoadOlder(
    messagesContainerRef,
    loadOlder,
    { enabled: pageStatus === 'ok' && hasMore && !msgsLoading }
  )

  useEffect(() => {
    if (!isValidUUID(bookingId)) { setPageStatus('not_found'); return }
    let channel: any = null
    let cancelled = false

    async function load() {
      try {
        // Robust gegen Auth-Race (Bug #1)
        const user = await requireUser(router, { redirectTo: `/engel/chat/${bookingId}` })
        if (!user || cancelled) return
        setUserId(user.id)

        const supabase = createClient()
        const { data: booking, error: bookErr } = await supabase
          .from('bookings')
          .select('customer_id, profiles:customer_id(first_name, last_name)')
          .eq('id', bookingId)
          .maybeSingle()

        if (cancelled) return

        if (bookErr) {
          logError('EngelChat:load', bookErr.message)
          setError('Fehler beim Laden der Buchung. Bitte versuche es spaeter erneut.')
          setPageStatus('error')
          return
        }

        if (!booking) {
          setPageStatus('not_found')
          return
        }

        const customer = booking.profiles as any
        setPartner(customer ? `${customer.first_name} ${customer.last_name?.[0] || ''}.` : 'Kunde')

        // Initial-Page laden (juengste 30 Nachrichten)
        await initMessages()
        if (cancelled) return

        // Ungelesene markieren
        const { error: updateErr } = await supabase
          .from('messages')
          .update({ read: true })
          .eq('booking_id', bookingId)
          .eq('receiver_id', user.id)
        if (updateErr) logError('EngelChat:markRead', updateErr.message)

        // Realtime-Subscription
        channel = supabase
          .channel(`chat-${bookingId}`)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `booking_id=eq.${bookingId}`,
          }, (payload) => {
            appendMessage(payload.new as any)
          })
          .subscribe()

        setPageStatus('ok')
      } catch (err) {
        logError('EngelChat:load', err)
        if (!cancelled) setPageStatus('error')
      }
    }

    load()
    return () => {
      cancelled = true
      if (channel) {
        const supabase = createClient()
        supabase.removeChannel(channel)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId])

  // Scroll-Position nach Load aelterer Nachrichten erhalten
  useEffect(() => {
    if (loadingOlder) return
    requestRestoreScroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, loadingOlder])

  // Initial: zum unteren Ende scrollen. Bei spaeteren Updates auch, AUSSER
  // wenn gerade aeltere Nachrichten geprependet wurden (sonst springt's hoch).
  useEffect(() => {
    if (msgsLoading || messages.length === 0) return
    if (!initialLoadDoneRef.current) {
      // Erste Anzeige: ohne Animation direkt nach unten
      bottomRef.current?.scrollIntoView({ behavior: 'auto' })
      initialLoadDoneRef.current = true
      return
    }
    // Spaeter: nur smooth-scrollen wenn keine aelteren Nachrichten geladen wurden
    // (loadingOlder ist beim Realtime-Append false → ok)
    if (!loadingOlder) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, msgsLoading, loadingOlder])

  async function handleSend() {
    if (!newMsg.trim() || !userId || sending) return
    setSending(true)
    try {
      const supabase = createClient()
      const { data: booking } = await supabase
        .from('bookings')
        .select('angel_id, customer_id, angels:angel_id(id)')
        .eq('id', bookingId)
        .single()

      if (!booking) { setSending(false); return }

      const angelUserId = (booking.angels as any)?.id || booking.angel_id
      const receiverId = userId === angelUserId ? booking.customer_id : angelUserId

      await supabase.from('messages').insert({
        booking_id: bookingId,
        sender_id: userId,
        receiver_id: receiverId,
        content: newMsg.trim(),
      })

      setNewMsg('')
    } catch (err) {
      logError('EngelChat:send', err)
    } finally {
      setSending(false)
    }
  }

  if (pageStatus === 'loading') return <LoadingState />
  if (pageStatus === 'not_found') return <NotFoundState title="Chat nicht gefunden" subtitle="Diese Buchung existiert nicht." homeHref="/engel/home" />
  if (pageStatus === 'error' || error) return (
    <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 24px',textAlign:'center'}}>
      <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
      <p style={{color:'var(--ink3)',fontSize:14,marginBottom:16}}>{error || 'Fehler beim Laden des Chats. Bitte versuche es spaeter erneut.'}</p>
      <button onClick={() => window.location.reload()} style={{padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold2))',color:'var(--coal)',fontSize:13,fontWeight:600,cursor:'pointer'}}>Erneut versuchen</button>
    </div>
  )

  return (
    <div className="screen" id="chatconv">
      <div className="topbar">
        <button className="back-btn" onClick={() => router.back()} type="button">‹</button>
        <div className="chat-conv-header">
          <div className="chat-conv-avatar" style={{ background: 'var(--green-pale)' }}><IconUser size={16} /></div>
          <div className="topbar-title">{partner}</div>
        </div>
      </div>

      <div className="chat-messages" ref={messagesContainerRef}>
        {hasMore && (
          <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, color: 'var(--ink4)' }}>
            {loadingOlder ? 'Aeltere Nachrichten werden geladen...' : 'Nach oben scrollen fuer aeltere Nachrichten'}
          </div>
        )}
        {!hasMore && messages.length >= 30 && (
          <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, color: 'var(--ink4)' }}>
            Anfang des Gespraechs
          </div>
        )}
        {paginationError && (
          <div style={{ textAlign: 'center', padding: '8px 12px', margin: '4px 8px', fontSize: 12, color: 'var(--red-w, #dc2626)', background: 'rgba(220,38,38,0.08)', borderRadius: 8 }}>
            ⚠️ {paginationError}
            <button onClick={() => loadOlder()} style={{ marginLeft: 8, background: 'transparent', border: 'none', color: 'inherit', textDecoration: 'underline', fontSize: 11, cursor: 'pointer' }}>
              Erneut versuchen
            </button>
          </div>
        )}
        {messages.length === 0 && !msgsLoading && (
          <div className="chat-start-hint">Schreibe die erste Nachricht...</div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`chat-msg ${msg.sender_id === userId ? 'sent' : 'received'}`}>
            <div className="chat-bubble">{msg.content}</div>
            <div className="chat-msg-time">
              {new Date(msg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
        <div ref={bottomRef}></div>
      </div>

      <div className="chat-input-bar">
        <input
          className="chat-input"
          type="text"
          placeholder="Nachricht schreiben..."
          value={newMsg}
          onChange={e => setNewMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button className="chat-send" onClick={handleSend} disabled={sending || !newMsg.trim()}>
          Senden
        </button>
      </div>
    </div>
  )
}
