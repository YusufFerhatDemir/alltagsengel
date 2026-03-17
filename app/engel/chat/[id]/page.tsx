'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isValidUUID, logError } from '@/lib/safe-query'
import { NotFoundState, ErrorState, LoadingState } from '@/components/UIStates'
import { IconUser } from '@/components/Icons'

export default function EngelChatConversationPage() {
  const params = useParams()
  const router = useRouter()
  const bookingId = params.id as string
  const [messages, setMessages] = useState<any[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [partner, setPartner] = useState<string>('Kunde')
  const [sending, setSending] = useState(false)
  const [pageStatus, setPageStatus] = useState<'loading' | 'ok' | 'not_found' | 'error'>('loading')
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isValidUUID(bookingId)) { setPageStatus('not_found'); return }
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setPageStatus('error'); return }
        setUserId(user.id)

        const { data: booking, error: bookErr } = await supabase
          .from('bookings')
          .select('customer_id, profiles:customer_id(first_name, last_name)')
          .eq('id', bookingId)
          .maybeSingle()

        if (bookErr) {
          logError('EngelChat:load', bookErr.message)
          setError('Fehler beim Laden der Buchung. Bitte versuche es später erneut.')
          setPageStatus('error')
          return
        }

        if (!booking) {
          setPageStatus('not_found')
          return
        }

        const customer = booking.profiles as any
        setPartner(customer ? `${customer.first_name} ${customer.last_name?.[0] || ''}.` : 'Kunde')

        const { data: msgs, error: msgsErr } = await supabase
          .from('messages')
          .select('*')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: true })
        if (msgsErr) throw msgsErr
        setMessages(msgs || [])

        const { error: updateErr } = await supabase
          .from('messages')
          .update({ read: true })
          .eq('booking_id', bookingId)
          .eq('receiver_id', user.id)
        if (updateErr) throw updateErr

        const channel = supabase
          .channel(`chat-${bookingId}`)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `booking_id=eq.${bookingId}`,
          }, (payload) => {
            setMessages(prev => [...prev, payload.new])
          })
          .subscribe()

        setPageStatus('ok')
        return () => { supabase.removeChannel(channel) }
      } catch (err) {
        logError('EngelChat:load', err)
        setPageStatus('error')
      }
    }
    load()
  }, [bookingId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!newMsg.trim() || !userId || sending) return
    setSending(true)
    try {
      const supabase = createClient()
      const { data: booking } = await supabase
        .from('bookings')
        .select('angel_id, customer_id, angels:angel_id(user_id)')
        .eq('id', bookingId)
        .single()

      if (!booking) { setSending(false); return }

      // angel_id ist die angels-Tabelle ID, nicht user_id — prüfe beides
      const angelUserId = (booking.angels as any)?.user_id || booking.angel_id
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
      <p style={{color:'var(--ink3)',fontSize:14,marginBottom:16}}>{error || 'Fehler beim Laden des Chats. Bitte versuche es später erneut.'}</p>
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

      <div className="chat-messages">
        {messages.length === 0 && (
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
