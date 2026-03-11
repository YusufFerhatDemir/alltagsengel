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

export default function KundeChatPage() {
  const router = useRouter()
  const params = useParams()
  const rideId = params.id as string
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [partnerName, setPartnerName] = useState('Fahrer')
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

    // Get ride info to find provider/driver name
    const { data: ride } = await supabase
      .from('krankenfahrten')
      .select('provider_id, krankenfahrt_providers(company_name, user_id)')
      .eq('id', rideId)
      .single()

    if (ride?.krankenfahrt_providers) {
      const provider = ride.krankenfahrt_providers as any
      if (provider.user_id) {
        const { data: driverProfile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', provider.user_id)
          .single()
        if (driverProfile) {
          setPartnerName(`${driverProfile.first_name || ''} ${driverProfile.last_name || ''}`.trim() || provider.company_name || 'Fahrer')
        } else {
          setPartnerName(provider.company_name || 'Fahrer')
        }
      } else {
        setPartnerName(provider.company_name || 'Fahrer')
      }
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

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      sender_id: userId,
      content,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ ride_id: rideId, sender_id: userId, content })
      .select()
      .single()

    if (data) {
      setMessages(prev => prev.map(m => m.id === optimistic.id ? data : m))
    } else if (error) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
    }
  }

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <button onClick={() => router.back()} className="back-btn" type="button">‹</button>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--gold), var(--gold2))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14px', fontWeight: '700', color: 'var(--bg)',
        }}>
          {partnerName.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)' }}>{partnerName}</span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--ink4)', padding: '40px 0' }}>Laden...</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--ink4)', padding: '60px 0', fontSize: '13px' }}>
            Noch keine Nachrichten. Schreiben Sie dem Fahrer!
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.sender_id === userId
            return (
              <div key={msg.id} style={{
                alignSelf: isMe ? 'flex-end' : 'flex-start',
                maxWidth: '75%',
                background: isMe ? 'linear-gradient(135deg, var(--gold), var(--gold2))' : 'var(--card)',
                color: isMe ? 'var(--bg)' : 'var(--text)',
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
        padding: '12px 20px 28px', borderTop: '1px solid var(--border)',
        display: 'flex', gap: '8px', flexShrink: 0,
      }}>
        <input
          value={newMsg}
          onChange={e => setNewMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Nachricht schreiben..."
          className="input"
          style={{
            flex: 1, borderRadius: '24px', padding: '12px 16px',
          }}
        />
        <button onClick={handleSend} style={{
          width: '44px', height: '44px', borderRadius: '50%',
          background: newMsg.trim() ? 'linear-gradient(135deg, var(--gold), var(--gold2))' : 'var(--card)',
          border: 'none', color: newMsg.trim() ? 'var(--bg)' : 'var(--ink4)',
          fontSize: '18px', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>➤</button>
      </div>
    </div>
  )
}
