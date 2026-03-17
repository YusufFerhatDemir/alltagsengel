'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { IconChat, IconUser, IconWings } from '@/components/Icons'

interface ChatPartner {
  id: string
  name: string
  lastMessage: string
  lastTime: string
  unread: number
  bookingId: string
  isAngel: boolean
}

export default function KundeChatPage() {
  const [chats, setChats] = useState<ChatPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Nicht angemeldet')
        setLoading(false)
        return
      }

      const { data: bookings, error: bookingsErr } = await supabase
        .from('bookings')
        .select('id, angel_id, service, status, angels:angel_id(profiles(first_name, last_name))')
        .eq('customer_id', user.id)
        .in('status', ['pending', 'accepted', 'completed'])
        .order('created_at', { ascending: false })

      if (bookingsErr) throw new Error('Buchungen konnten nicht geladen werden')
      if (!bookings || bookings.length === 0) { 
        setLoading(false)
        return 
      }

      const chatList: ChatPartner[] = []
      for (const b of bookings) {
        const angel = b.angels as any
        const name = angel?.profiles ? `${angel.profiles.first_name} ${angel.profiles.last_name?.[0]}.` : 'Engel'

        const { data: msgs, error: msgsErr } = await supabase
          .from('messages')
          .select('content, created_at, read, sender_id')
          .eq('booking_id', b.id)
          .order('created_at', { ascending: false })
          .limit(1)

        if (msgsErr) throw new Error('Nachrichten konnten nicht geladen werden')

        const lastMsg = msgs?.[0]
        const { count, error: countErr } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('booking_id', b.id)
          .eq('receiver_id', user.id)
          .eq('read', false)

        if (countErr) throw new Error('Nachrichtenzähler konnte nicht geladen werden')

        chatList.push({
          id: b.angel_id!,
          name,
          lastMessage: lastMsg?.content || b.service,
          lastTime: lastMsg ? new Date(lastMsg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '',
          unread: count || 0,
          bookingId: b.id,
          isAngel: true,
        })
      }
      setChats(chatList)
      setLoading(false)
    } catch (err: any) {
      setError(err?.message || 'Ein Fehler beim Laden der Chats ist aufgetreten')
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (error) return (
    <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 24px',textAlign:'center'}}>
      <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
      <p style={{color:'var(--ink3)',fontSize:14,marginBottom:16}}>{error}</p>
      <button onClick={()=>{setError('');load()}} style={{padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold2))',color:'var(--coal)',fontSize:13,fontWeight:600,cursor:'pointer'}}>Erneut versuchen</button>
    </div>
  )

  return (
    <div className="screen" id="chatlist">
      <div className="topbar" style={{ paddingTop: 14 }}>
        <div className="topbar-title">Nachrichten</div>
      </div>

      <div className="chat-body">
        {loading ? (
          <div className="chat-empty">Laden...</div>
        ) : chats.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon"><IconChat size={40} /></div>
            <div className="chat-empty-title">Noch keine Nachrichten</div>
            <div className="chat-empty-sub">Buche einen Engel, um den Chat zu starten</div>
          </div>
        ) : (
          chats.map(chat => (
            <Link key={chat.bookingId} href={`/kunde/chat/${chat.bookingId}`} style={{ textDecoration: 'none' }}>
              <div className="chat-row">
                <div className="chat-avatar"><IconWings size={20} /></div>
                <div className="chat-info">
                  <div className="chat-name-row">
                    <div className="chat-name">{chat.name}</div>
                    <div className="chat-time">{chat.lastTime}</div>
                  </div>
                  <div className="chat-preview-row">
                    <div className="chat-preview">{chat.lastMessage}</div>
                    {chat.unread > 0 && <div className="chat-badge">{chat.unread}</div>}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
