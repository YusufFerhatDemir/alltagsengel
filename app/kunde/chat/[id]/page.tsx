'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import { IconWingsGold, IconTruck } from '@/components/Icons'
import { useChatPagination, useScrollToLoadOlder, type ChatMessage } from '@/lib/use-chat-pagination'

type ChatMode = 'booking' | 'ride' | null

// Pro Mode: Tabelle + Filter-Spalte
const MODE_CONFIG = {
  booking: { table: 'messages', filterColumn: 'booking_id' as const },
  ride: { table: 'chat_messages', filterColumn: 'ride_id' as const },
}

export default function ChatDetailPage() {
  const router = useRouter()
  const params = useParams()
  const chatId = params.id as string
  const [newMsg, setNewMsg] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [userId, setUserId] = useState('')
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [mode, setMode] = useState<ChatMode>(null)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const initialLoadDoneRef = useRef(false)

  // Hook braucht immer table/filterColumn/filterValue — bei mode=null ein "leerer" Filter
  // sodass init() nicht versehentlich greift. Wir rufen init() erst nach mode-Detection auf.
  const cfg = mode ? MODE_CONFIG[mode] : MODE_CONFIG.booking
  const {
    messages,
    loading: msgsLoading,
    loadingOlder,
    hasMore,
    error: paginationError,
    init: initMessages,
    loadOlder,
    appendMessage,
    replaceMessage,
    removeMessage,
  } = useChatPagination({
    table: cfg.table,
    filterColumn: cfg.filterColumn,
    filterValue: mode ? chatId : '__pending__',
    selectColumns: 'id, sender_id, content, created_at',
  })

  const { requestRestoreScroll } = useScrollToLoadOlder(
    messagesContainerRef,
    loadOlder,
    { enabled: !!mode && hasMore && !msgsLoading }
  )

  // ═══ 1. Mode-Detection + Partner-Info laden ═══
  useEffect(() => {
    let cancelled = false
    let channel: any = null

    async function detectChat() {
      setError('')
      try {
        const user = await requireUser(router, { redirectTo: `/kunde/chat/${chatId}` })
        if (!user || cancelled) return
        setUserId(user.id)

        const supabase = createClient()

        // 1a. Versuche Buchung (Engel-Chat)
        const { data: booking, error: bookingErr } = await supabase
          .from('bookings')
          .select('id, angel_id, customer_id, angels:angel_id(id, profiles(first_name, last_name))')
          .eq('id', chatId)
          .maybeSingle()
        if (cancelled) return
        if (bookingErr && bookingErr.code !== 'PGRST116') throw bookingErr

        if (booking) {
          const angel: any = booking.angels
          const prof = angel?.profiles
            ? (Array.isArray(angel.profiles) ? angel.profiles[0] : angel.profiles)
            : null
          const angelUserId = angel?.id || prof?.id || ''
          setPartnerId(angelUserId)
          setPartnerName(prof ? `${prof.first_name} ${prof.last_name?.[0] || ''}.` : 'Engel')
          setMode('booking')

          // Ungelesene markieren
          await supabase
            .from('messages')
            .update({ read: true })
            .eq('booking_id', chatId)
            .eq('receiver_id', user.id)
            .eq('read', false)

          // Realtime
          channel = supabase
            .channel(`booking-chat-${chatId}`)
            .on('postgres_changes', {
              event: 'INSERT', schema: 'public', table: 'messages',
              filter: `booking_id=eq.${chatId}`,
            }, (payload) => appendMessage(payload.new as ChatMessage))
            .subscribe()

          setLoadingMeta(false)
          return
        }

        // 1b. Versuche Krankenfahrt (Fahrer-Chat)
        const { data: ride, error: rideErr } = await supabase
          .from('krankenfahrten')
          .select('id, provider_id, krankenfahrt_providers(company_name, user_id)')
          .eq('id', chatId)
          .maybeSingle()
        if (cancelled) return
        if (rideErr && rideErr.code !== 'PGRST116') throw rideErr

        if (ride) {
          const provider: any = ride.krankenfahrt_providers
          if (provider?.user_id) {
            const { data: driverProfile } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', provider.user_id)
              .maybeSingle()
            setPartnerName(driverProfile ? `${driverProfile.first_name || ''} ${driverProfile.last_name?.[0] || ''}.` : provider.company_name || 'Fahrer')
            setPartnerId(provider.user_id)
          } else {
            setPartnerName(provider?.company_name || 'Fahrer')
          }
          setMode('ride')

          // Realtime
          channel = supabase
            .channel(`ride-chat-${chatId}`)
            .on('postgres_changes', {
              event: 'INSERT', schema: 'public', table: 'chat_messages',
              filter: `ride_id=eq.${chatId}`,
            }, (payload) => appendMessage(payload.new as ChatMessage))
            .subscribe()

          setLoadingMeta(false)
          return
        }

        if (!cancelled) {
          setError('Chat nicht gefunden')
          setPartnerName('Chat')
          setLoadingMeta(false)
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Ein Fehler beim Laden des Chats ist aufgetreten')
          setLoadingMeta(false)
        }
      }
    }

    detectChat()
    return () => {
      cancelled = true
      if (channel) {
        const supabase = createClient()
        supabase.removeChannel(channel)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId])

  // ═══ 2. Sobald mode gesetzt: Initial-Page laden ═══
  useEffect(() => {
    if (!mode) return
    initMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // ═══ 3. Scroll-Position erhalten beim Prepend ═══
  useEffect(() => {
    if (loadingOlder) return
    requestRestoreScroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, loadingOlder])

  // ═══ 4. Smart Scroll-to-bottom ═══
  useEffect(() => {
    if (msgsLoading || messages.length === 0) return
    if (!initialLoadDoneRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' })
      initialLoadDoneRef.current = true
      return
    }
    if (!loadingOlder) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, msgsLoading, loadingOlder])

  async function handleSend() {
    if (!newMsg.trim() || !userId || !mode) return
    const supabase = createClient()
    const content = newMsg.trim()
    setNewMsg('')

    const optimistic: ChatMessage = {
      id: `temp-${Date.now()}`,
      sender_id: userId,
      content,
      created_at: new Date().toISOString(),
    }
    appendMessage(optimistic)

    if (mode === 'booking') {
      const { data, error } = await supabase
        .from('messages')
        .insert({ booking_id: chatId, sender_id: userId, receiver_id: partnerId, content })
        .select('id, sender_id, content, created_at')
        .single()
      if (data) {
        replaceMessage(optimistic.id, data as ChatMessage)
      } else if (error) {
        console.error('[KundeChat:send] booking error:', error)
        removeMessage(optimistic.id)
      }
    } else {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({ ride_id: chatId, sender_id: userId, content })
        .select('id, sender_id, content, created_at')
        .single()
      if (data) {
        replaceMessage(optimistic.id, data as ChatMessage)
      } else if (error) {
        console.error('[KundeChat:send] ride error:', error)
        removeMessage(optimistic.id)
      }
    }
  }

  if (error) return (
    <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 24px',textAlign:'center'}}>
      <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
      <p style={{color:'var(--ink3)',fontSize:14,marginBottom:16}}>{error}</p>
      <button onClick={()=>{setError(''); window.location.reload()}} style={{padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold2))',color:'var(--coal)',fontSize:13,fontWeight:600,cursor:'pointer'}}>Erneut versuchen</button>
    </div>
  )

  const isEngel = mode === 'booking'
  const emptyText = isEngel
    ? `Schreiben Sie ${partnerName} eine Nachricht!`
    : 'Noch keine Nachrichten. Schreiben Sie dem Fahrer!'

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <button onClick={() => router.back()} className="back-btn" type="button">‹</button>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: isEngel ? 'var(--gold-pale)' : 'linear-gradient(135deg, var(--gold), var(--gold2))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isEngel ? <IconWingsGold size={18} /> : <IconTruck size={16} />}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{partnerName || 'Chat'}</div>
          <div style={{ fontSize: 11, color: 'var(--ink4)' }}>{isEngel ? 'Engel' : mode === 'ride' ? 'Fahrer' : ''}</div>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
        {(loadingMeta || msgsLoading) ? (
          <div style={{ textAlign: 'center', color: 'var(--ink4)', padding: '40px 0' }}>Laden...</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--ink4)', padding: '60px 0', fontSize: 13 }}>
            {emptyText}
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.sender_id === userId
            return (
              <div key={msg.id} style={{
                alignSelf: isMe ? 'flex-end' : 'flex-start',
                maxWidth: '75%',
                background: isMe ? 'linear-gradient(135deg, var(--gold), var(--gold2))' : 'var(--white)',
                color: isMe ? 'var(--bg)' : 'var(--ink)',
                padding: '10px 14px',
                borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                fontSize: 14, lineHeight: 1.5,
              }}>
                {msg.content}
                <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6, textAlign: 'right' }}>
                  {new Date(msg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 20px 28px', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8, flexShrink: 0,
      }}>
        <input
          value={newMsg}
          onChange={e => setNewMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Nachricht schreiben..."
          className="input"
          style={{ flex: 1, borderRadius: 24, padding: '12px 16px' }}
        />
        <button onClick={handleSend} style={{
          width: 44, height: 44, borderRadius: '50%',
          background: newMsg.trim() ? 'linear-gradient(135deg, var(--gold), var(--gold2))' : 'var(--white)',
          border: 'none', color: newMsg.trim() ? 'var(--bg)' : 'var(--ink4)',
          fontSize: 18, cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>➤</button>
      </div>
    </div>
  )
}
