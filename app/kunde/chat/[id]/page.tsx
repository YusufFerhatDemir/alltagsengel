'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { IconWingsGold, IconTruck } from '@/components/Icons'

interface Message {
  id: string
  sender_id: string
  content: string
  created_at: string
}

type ChatMode = 'booking' | 'ride' | null

export default function ChatDetailPage() {
  const router = useRouter()
  const params = useParams()
  const chatId = params.id as string
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<ChatMode>(null)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadChat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime subscription
  useEffect(() => {
    if (!chatId || !mode) return

    if (mode === 'booking') {
      const channel = supabase
        .channel(`booking-chat-${chatId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `booking_id=eq.${chatId}` },
          (payload) => {
            const msg = payload.new as Message
            setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
          }
        )
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    }

    if (mode === 'ride') {
      const channel = supabase
        .channel(`ride-chat-${chatId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `ride_id=eq.${chatId}` },
          (payload) => {
            const msg = payload.new as Message
            setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
          }
        )
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    }
  }, [chatId, mode, supabase])

  async function loadChat() {
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserId(user.id)

      // 1. Versuche Buchung zu finden (Engel-Chat)
      const { data: booking, error: bookingErr } = await supabase
        .from('bookings')
        .select('id, angel_id, customer_id, angels:angel_id(id, profiles(first_name, last_name))')
        .eq('id', chatId)
        .maybeSingle()

      if (bookingErr && bookingErr.code !== 'PGRST116') throw bookingErr

      if (booking) {
        setMode('booking')
        const angel: any = booking.angels
        const prof = angel?.profiles
          ? (Array.isArray(angel.profiles) ? angel.profiles[0] : angel.profiles)
          : null
        const angelUserId = angel?.id || prof?.id || ''
        setPartnerId(angelUserId)
        setPartnerName(prof ? `${prof.first_name} ${prof.last_name?.[0] || ''}.` : 'Engel')

        // Nachrichten laden
        const { data: msgs, error: msgsErr } = await supabase
          .from('messages')
          .select('id, sender_id, content, created_at')
          .eq('booking_id', chatId)
          .order('created_at', { ascending: true })
        if (msgsErr) throw msgsErr
        setMessages(msgs || [])

        // Ungelesene markieren
        const { error: updateErr } = await supabase
          .from('messages')
          .update({ read: true })
          .eq('booking_id', chatId)
          .eq('receiver_id', user.id)
          .eq('read', false)
        if (updateErr) throw updateErr

        setLoading(false)
        return
      }

      // 2. Versuche Krankenfahrt zu finden (Fahrer-Chat)
      const { data: ride, error: rideErr } = await supabase
        .from('krankenfahrten')
        .select('id, provider_id, krankenfahrt_providers(company_name, user_id)')
        .eq('id', chatId)
        .maybeSingle()

      if (rideErr && rideErr.code !== 'PGRST116') throw rideErr

      if (ride) {
        setMode('ride')
        const provider: any = ride.krankenfahrt_providers
        if (provider?.user_id) {
          const { data: driverProfile, error: driverErr } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', provider.user_id)
            .maybeSingle()
          if (driverErr && driverErr.code !== 'PGRST116') throw driverErr
          setPartnerName(driverProfile ? `${driverProfile.first_name || ''} ${driverProfile.last_name?.[0] || ''}.` : provider.company_name || 'Fahrer')
          setPartnerId(provider.user_id)
        } else {
          setPartnerName(provider?.company_name || 'Fahrer')
        }

        const { data: msgs, error: rideMessagesErr } = await supabase
          .from('chat_messages')
          .select('id, sender_id, content, created_at')
          .eq('ride_id', chatId)
          .order('created_at', { ascending: true })
        if (rideMessagesErr) throw rideMessagesErr
        setMessages(msgs || [])
        setLoading(false)
        return
      }

      // Nichts gefunden
      setError('Chat nicht gefunden')
      setPartnerName('Chat')
      setLoading(false)
    } catch (err: any) {
      setError(err?.message || 'Ein Fehler beim Laden des Chats ist aufgetreten')
      setLoading(false)
    }
  }

  async function handleSend() {
    if (!newMsg.trim() || !userId || !mode) return

    const content = newMsg.trim()
    setNewMsg('')

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      sender_id: userId,
      content,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])

    if (mode === 'booking') {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          booking_id: chatId,
          sender_id: userId,
          receiver_id: partnerId,
          content,
        })
        .select('id, sender_id, content, created_at')
        .single()

      if (data) {
        setMessages(prev => prev.map(m => m.id === optimistic.id ? data : m))
      } else if (error) {
        console.error('Send error:', error)
        setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      }
    } else if (mode === 'ride') {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({ ride_id: chatId, sender_id: userId, content })
        .select('id, sender_id, content, created_at')
        .single()

      if (data) {
        setMessages(prev => prev.map(m => m.id === optimistic.id ? data : m))
      } else if (error) {
        console.error('Send error:', error)
        setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      }
    }
  }

  if (error) return (
    <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 24px',textAlign:'center'}}>
      <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
      <p style={{color:'var(--ink3)',fontSize:14,marginBottom:16}}>{error}</p>
      <button onClick={()=>{setError('');loadChat()}} style={{padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold2))',color:'var(--coal)',fontSize:13,fontWeight:600,cursor:'pointer'}}>Erneut versuchen</button>
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
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
