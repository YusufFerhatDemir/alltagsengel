'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { IconChat, IconUser } from '@/components/Icons'

export default function EngelChatPage() {
  const [chats, setChats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: bookings, error: bookingsErr } = await supabase
        .from('bookings')
        .select('id, customer_id, service, status, profiles:customer_id(first_name, last_name)')
        .eq('angel_id', user.id)
        .in('status', ['pending', 'accepted', 'completed'])
        .order('created_at', { ascending: false })

      if (bookingsErr) throw bookingsErr
      if (!bookings || bookings.length === 0) { setLoading(false); return }

      const chatList: any[] = []
      for (const b of bookings) {
        const customer = b.profiles as any
        const name = customer ? `${customer.first_name} ${customer.last_name?.[0] || ''}.` : 'Kunde'

        const { data: msgs, error: msgsErr } = await supabase
          .from('messages')
          .select('content, created_at, read, sender_id')
          .eq('booking_id', b.id)
          .order('created_at', { ascending: false })
          .limit(1)

        if (msgsErr) throw msgsErr
        const lastMsg = msgs?.[0]
        const { count, error: countErr } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('booking_id', b.id)
          .eq('receiver_id', user.id)
          .eq('read', false)

        if (countErr) throw countErr
        chatList.push({
          id: b.customer_id,
          name,
          lastMessage: lastMsg?.content || b.service,
          lastTime: lastMsg ? new Date(lastMsg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '',
          unread: count || 0,
          bookingId: b.id,
        })
      }
      setChats(chatList)
    } catch (err) {
      console.error('Engel chat load error:', err)
      setError('Fehler beim Laden der Nachrichten. Bitte versuche es später erneut.')
    } finally {
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
      <button onClick={load} style={{padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold2))',color:'var(--coal)',fontSize:13,fontWeight:600,cursor:'pointer'}}>Erneut versuchen</button>
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
            <div className="chat-empty-sub">Nachrichten erscheinen hier, sobald du einen Auftrag annimmst</div>
          </div>
        ) : (
          chats.map(chat => (
            <Link key={chat.bookingId} href={`/engel/chat/${chat.bookingId}`} style={{ textDecoration: 'none' }}>
              <div className="chat-row">
                <div className="chat-avatar" style={{ background: 'var(--green-pale)' }}><IconUser size={20} /></div>
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
