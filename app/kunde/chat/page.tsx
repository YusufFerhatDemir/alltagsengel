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

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, angel_id, service, status, angels:angel_id(profiles(first_name, last_name))')
        .eq('customer_id', user.id)
        .in('status', ['pending', 'accepted', 'completed'])
        .order('created_at', { ascending: false })

      if (!bookings || bookings.length === 0) { setLoading(false); return }

      const chatList: ChatPartner[] = []
      for (const b of bookings) {
        const angel = b.angels as any
        const name = angel?.profiles ? `${angel.profiles.first_name} ${angel.profiles.last_name}` : 'Engel'

        const { data: msgs } = await supabase
          .from('messages')
          .select('content, created_at, read, sender_id')
          .eq('booking_id', b.id)
          .order('created_at', { ascending: false })
          .limit(1)

        const lastMsg = msgs?.[0]
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('booking_id', b.id)
          .eq('receiver_id', user.id)
          .eq('read', false)

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
    }
    load()
  }, [])

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
