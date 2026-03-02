'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { IconWings, IconUser } from '@/components/Icons'

export default function ChatConversationPage() {
  const params = useParams()
  const router = useRouter()
  const bookingId = params.id as string
  const [messages, setMessages] = useState<any[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [partner, setPartner] = useState<string>('Engel')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: booking } = await supabase
        .from('bookings')
        .select('customer_id, angel_id, angels:angel_id(profiles(first_name, last_name))')
        .eq('id', bookingId)
        .single()

      if (!booking || (booking.customer_id !== user.id && booking.angel_id !== user.id)) {
        router.back()
        return
      }

      const angel = booking.angels as any
      setPartner(angel?.profiles ? `${angel.profiles.first_name} ${angel.profiles.last_name}` : 'Engel')

      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true })
      setMessages(msgs || [])

      await supabase
        .from('messages')
        .update({ read: true })
        .eq('booking_id', bookingId)
        .eq('receiver_id', user.id)

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

      return () => { supabase.removeChannel(channel) }
    }
    load()
  }, [bookingId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!newMsg.trim() || !userId || sending) return
    setSending(true)
    const supabase = createClient()

    const { data: booking } = await supabase
      .from('bookings')
      .select('angel_id, customer_id')
      .eq('id', bookingId)
      .single()

    if (!booking) { setSending(false); return }

    const receiverId = userId === booking.customer_id ? booking.angel_id : booking.customer_id

    await supabase.from('messages').insert({
      booking_id: bookingId,
      sender_id: userId,
      receiver_id: receiverId,
      content: newMsg.trim(),
    })

    setNewMsg('')
    setSending(false)
  }

  return (
    <div className="screen" id="chatconv">
      <div className="topbar">
        <button className="back-btn" onClick={() => router.back()} type="button">‹</button>
        <div className="chat-conv-header">
          <div className="chat-conv-avatar"><IconWings size={16} /></div>
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
