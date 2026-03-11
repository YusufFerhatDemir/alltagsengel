'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Message {
  id: string
  sender_id: string
  content: string
  created_at: string
}

export default function FahrerChatDetailPage() {
  const router = useRouter()
  const params = useParams()
  const rideId = params.id as string
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [partnerName, setPartnerName] = useState('Kunde')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
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
    if (!rideId) return

    const channel = supabase
      .channel(`chat-${rideId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `ride_id=eq.${rideId}` },
        (payload) => {
          const newMessage = payload.new as Message
          setMessages(prev => {
            // Avoid duplicate
            if (prev.some(m => m.id === newMessage.id)) return prev
            return [...prev, newMessage]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [rideId, supabase])

  async function loadChat() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }
    setUserId(user.id)

    // Get ride info to find customer name
    const { data: ride } = await supabase
      .from('krankenfahrten')
      .select('customer_id')
      .eq('id', rideId)
      .single()

    if (ride) {
      const { data: customer } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', ride.customer_id)
        .single()
      if (customer) setPartnerName(`${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Kunde')
    }

    // Load messages
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('ride_id', rideId)
      .order('created_at', { ascending: true })

    setMessages(msgs || [])
    setLoading(false)
  }

  async function handleSend() {
    if (!newMsg.trim() || !userId) return

    const content = newMsg.trim()
    setNewMsg('')

    // Optimistic: add locally
    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      sender_id: userId,
      content,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])

    // Persist to DB
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ ride_id: rideId, sender_id: userId, content })
      .select()
      .single()

    if (data) {
      // Replace optimistic with real
      setMessages(prev => prev.map(m => m.id === optimistic.id ? data : m))
    } else if (error) {
      // Remove optimistic on error
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
    }
  }

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
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {loading ? (
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
