'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import { useChatPagination, useScrollToLoadOlder, type ChatMessage } from '@/lib/use-chat-pagination'

export default function FahrerChatDetailPage() {
  const router = useRouter()
  const params = useParams()
  const rideId = params.id as string
  const [newMsg, setNewMsg] = useState('')
  const [partnerName, setPartnerName] = useState('Kunde')
  const [userId, setUserId] = useState('')
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const initialLoadDoneRef = useRef(false)

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
    table: 'chat_messages',
    filterColumn: 'ride_id',
    filterValue: rideId,
    selectColumns: '*',
  })

  const { requestRestoreScroll } = useScrollToLoadOlder(
    messagesContainerRef,
    loadOlder,
    { enabled: !loadingMeta && hasMore && !msgsLoading }
  )

  // ═══ 1. Meta laden (Partner-Info) + Realtime ═══
  useEffect(() => {
    let cancelled = false
    let channel: any = null

    async function load() {
      try {
        const user = await requireUser(router, { redirectTo: `/fahrer/chat/${rideId}` })
        if (!user || cancelled) return
        setUserId(user.id)

        const supabase = createClient()

        // Ride + Customer-Info
        const { data: ride, error: rideErr } = await supabase
          .from('krankenfahrten')
          .select('customer_id')
          .eq('id', rideId)
          .single()
        if (cancelled) return
        if (rideErr) {
          setError('Fahrt nicht gefunden')
          setLoadingMeta(false)
          return
        }

        if (ride?.customer_id) {
          const { data: customer } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', ride.customer_id)
            .maybeSingle()
          if (cancelled) return
          if (customer) setPartnerName(`${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Kunde')
        }

        // Initial-Page laden
        await initMessages()
        if (cancelled) return

        // Realtime
        channel = supabase
          .channel(`chat-${rideId}`)
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'chat_messages',
            filter: `ride_id=eq.${rideId}`,
          }, (payload) => appendMessage(payload.new as ChatMessage))
          .subscribe()

        setLoadingMeta(false)
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Fehler beim Laden des Chats')
          setLoadingMeta(false)
        }
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
  }, [rideId])

  // ═══ 2. Scroll-Position erhalten beim Prepend ═══
  useEffect(() => {
    if (loadingOlder) return
    requestRestoreScroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, loadingOlder])

  // ═══ 3. Smart Scroll-to-bottom ═══
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
    if (!newMsg.trim() || !userId) return
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

    const { data, error: insertErr } = await supabase
      .from('chat_messages')
      .insert({ ride_id: rideId, sender_id: userId, content })
      .select()
      .single()

    if (data) {
      replaceMessage(optimistic.id, data as ChatMessage)
    } else if (insertErr) {
      console.error('[FahrerChat:send] error:', insertErr)
      removeMessage(optimistic.id)
    }
  }

  if (error) return (
    <div className="phone">
      <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 24px',textAlign:'center',height:'100vh'}}>
        <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
        <p style={{color:'rgba(245,240,232,0.6)',fontSize:14,marginBottom:16}}>{error}</p>
        <button onClick={()=>window.location.reload()} style={{padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#C9963C,#DBA84A)',color:'#1A1612',fontSize:13,fontWeight:600,cursor:'pointer'}}>Erneut versuchen</button>
      </div>
    </div>
  )

  return (
    <div className="phone">
      <div className="screen" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Top Bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px',
          borderBottom: '1px solid rgba(201,150,60,0.1)', flexShrink: 0,
        }}>
          <button onClick={() => router.back()} style={{
            width: '38px', height: '38px', borderRadius: '12px',
            background: 'transparent', border: '1.5px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', fontSize: '20px',
          }}>←</button>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #C9963C, #DBA84A)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', fontWeight: '700', color: '#1A1612',
          }}>
            {partnerName.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <span style={{ fontSize: '16px', fontWeight: '600', color: '#F5F0E8' }}>{partnerName}</span>
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {hasMore && (
            <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, color: 'rgba(245,240,232,0.4)' }}>
              {loadingOlder ? 'Aeltere Nachrichten werden geladen...' : 'Nach oben scrollen fuer aeltere Nachrichten'}
            </div>
          )}
          {!hasMore && messages.length >= 30 && (
            <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, color: 'rgba(245,240,232,0.4)' }}>
              Anfang des Gespraechs
            </div>
          )}
          {paginationError && (
            <div style={{ textAlign: 'center', padding: '8px 12px', margin: '4px 8px', fontSize: 12, color: '#dc2626', background: 'rgba(220,38,38,0.08)', borderRadius: 8 }}>
              ⚠️ {paginationError}
              <button onClick={() => loadOlder()} style={{ marginLeft: 8, background: 'transparent', border: 'none', color: 'inherit', textDecoration: 'underline', fontSize: 11, cursor: 'pointer' }}>
                Erneut versuchen
              </button>
            </div>
          )}
          {(loadingMeta || msgsLoading) ? (
            <div style={{ textAlign: 'center', color: 'rgba(245,240,232,0.4)', padding: '40px 0' }}>Laden...</div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'rgba(245,240,232,0.3)', padding: '60px 0', fontSize: '13px' }}>
              Noch keine Nachrichten. Schreiben Sie dem Kunden!
            </div>
          ) : (
            messages.map(msg => {
              const isMe = msg.sender_id === userId
              return (
                <div key={msg.id} style={{
                  alignSelf: isMe ? 'flex-end' : 'flex-start',
                  maxWidth: '75%',
                  background: isMe ? 'linear-gradient(135deg, #C9963C, #DBA84A)' : '#252118',
                  color: isMe ? '#1A1612' : '#F5F0E8',
                  padding: '10px 14px',
                  borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  fontSize: '14px',
                  lineHeight: '1.5',
                }}>
                  {msg.content}
                  <div style={{
                    fontSize: '10px', marginTop: '4px',
                    opacity: 0.6, textAlign: 'right',
                  }}>
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
          padding: '12px 20px 28px', borderTop: '1px solid rgba(201,150,60,0.1)',
          display: 'flex', gap: '8px', flexShrink: 0,
        }}>
          <input
            value={newMsg}
            onChange={e => setNewMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Nachricht schreiben..."
            style={{
              flex: 1, padding: '12px 16px', background: '#252118',
              border: '1.5px solid rgba(201,150,60,0.2)', borderRadius: '24px',
              color: '#F5F0E8', fontSize: '14px', outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button onClick={handleSend} style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: newMsg.trim() ? 'linear-gradient(135deg, #C9963C, #DBA84A)' : '#252118',
            border: 'none', color: newMsg.trim() ? '#1A1612' : 'rgba(245,240,232,0.3)',
            fontSize: '18px', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>➤</button>
        </div>
      </div>
    </div>
  )
}
