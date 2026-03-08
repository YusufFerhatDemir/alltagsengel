'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function FahrerChatPage() {
  const router = useRouter()
  const supabase = createClient()
  const [chats, setChats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadChats()
  }, [])

  async function loadChats() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    // Load rides assigned to this driver to find customer conversations
    const { data: providerData } = await supabase.from('krankenfahrt_providers').select('id').eq('user_id', user.id).single()
    if (providerData) {
      const { data: rides } = await supabase
        .from('krankenfahrten')
        .select('*, profiles!krankenfahrten_user_id_fkey(first_name, last_name, avatar_color)')
        .eq('provider_id', providerData.id)
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false })
      
      if (rides) {
        // Group by customer
        const customerMap = new Map()
        rides.forEach((ride: any) => {
          if (!customerMap.has(ride.user_id)) {
            customerMap.set(ride.user_id, {
              userId: ride.user_id,
              name: `${ride.profiles?.first_name || ''} ${ride.profiles?.last_name || ''}`.trim() || 'Kunde',
              avatarColor: ride.profiles?.avatar_color || '#C9963C',
              lastRide: ride,
              rideCount: 1,
            })
          } else {
            customerMap.get(ride.user_id).rideCount++
          }
        })
        setChats(Array.from(customerMap.values()))
      }
    }
    setLoading(false)
  }

  return (
    <div className="phone">
      <div className="screen" style={{ paddingBottom: '100px' }}>
        {/* Top Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px' }}>
          <button onClick={() => router.push('/fahrer/home')} style={{
            width: '38px', height: '38px', borderRadius: '12px',
            background: 'transparent', border: '1.5px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', fontSize: '20px',
          }}>←</button>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '22px', fontWeight: '600', color: '#F5F0E8' }}>Nachrichten</span>
        </div>

        <div style={{ padding: '0 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(245,240,232,0.4)' }}>Laden...</div>
          ) : chats.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '60px 20px',
              color: 'rgba(245,240,232,0.3)', fontSize: '14px',
            }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>💬</div>
              <div style={{ fontWeight: '600', marginBottom: '4px', color: 'rgba(245,240,232,0.5)' }}>Keine Nachrichten</div>
              Sobald Sie Aufträge annehmen, können Sie hier mit Kunden kommunizieren.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {chats.map(chat => (
                <button key={chat.userId} onClick={() => router.push(`/fahrer/chat/${chat.userId}`)} style={{
                  width: '100%', background: '#252118', border: '1px solid rgba(201,150,60,0.1)',
                  borderRadius: '14px', padding: '14px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left',
                }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '50%',
                    background: chat.avatarColor, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '16px', fontWeight: '700',
                    color: '#1A1612', flexShrink: 0,
                  }}>
                    {chat.name.split(' ').map((n: string) => n[0]).join('')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: '#F5F0E8' }}>{chat.name}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(245,240,232,0.4)', marginTop: '2px' }}>
                      {chat.rideCount} Fahrt{chat.rideCount !== 1 ? 'en' : ''} · Letzte: {new Date(chat.lastRide.datum).toLocaleDateString('de-DE')}
                    </div>
                  </div>
                  <span style={{ color: 'rgba(201,150,60,0.5)', fontSize: '18px' }}>›</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Nav */}
        <div style={{
          position: 'fixed', bottom: '0', left: '50%', transform: 'translateX(-50%)',
          width: '393px', maxWidth: '100%',
          background: 'linear-gradient(to top, #1A1612 60%, transparent)',
          padding: '12px 20px 28px', display: 'flex', justifyContent: 'space-around',
          zIndex: 50,
        }}>
          {[
            { icon: '🏠', label: 'Home', href: '/fahrer/home' },
            { icon: '📋', label: 'Aufträge', href: '/fahrer/auftraege' },
            { icon: '🚗', label: 'Fahrzeuge', href: '/fahrer/fahrzeuge' },
            { icon: '👤', label: 'Profil', href: '/fahrer/profil' },
          ].map(item => (
            <button key={item.href} onClick={() => router.push(item.href)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              color: 'rgba(245,240,232,0.35)', fontSize: '20px', padding: '4px 12px',
            }}>
              <span>{item.icon}</span>
              <span style={{ fontSize: '10px', fontWeight: '500' }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
