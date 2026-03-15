'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Icon3D from '@/components/Icon3D'
import { useUserLocation } from '@/hooks/useUserLocation'

interface Ride {
  id: string
  abholadresse: string
  zieladresse: string
  datum: string
  uhrzeit: string
  rueckfahrt: boolean
  rollstuhl_benoetig: boolean
  tragestuhl_benoetig: boolean
  total_amount: number
  status: string
  provider_id: string | null
  customer_id: string
}

export default function FahrerHomePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [provider, setProvider] = useState<any>(null)
  const [stats, setStats] = useState({ avg: null as number | null, count: 0, total: 0, monthEarnings: 0 })
  const [openRides, setOpenRides] = useState<Ride[]>([])
  const [todayRides, setTodayRides] = useState<Ride[]>([])
  const [activeRide, setActiveRide] = useState<Ride | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const userLocation = useUserLocation()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/auth/login')
      return
    }
    setUser(user)

    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (profileData) setProfile(profileData)

    const { data: providerData } = await supabase.from('krankenfahrt_providers').select('*').eq('user_id', user.id).single()
    if (!providerData) {
      setLoading(false)
      return
    }
    setProvider(providerData)

    // Stats: reviews + rides
    const [reviewsRes, completedRes, allRidesRes] = await Promise.all([
      supabase.from('krankenfahrt_reviews').select('rating').eq('provider_id', providerData.id),
      supabase.from('krankenfahrten').select('id, total_amount, datum', { count: 'exact' }).eq('provider_id', providerData.id).eq('status', 'completed'),
      supabase.from('krankenfahrten').select('*').order('datum', { ascending: true }).order('uhrzeit', { ascending: true }),
    ])

    const reviews = reviewsRes.data || []
    const completed = completedRes.data || []
    const allRides = (allRidesRes.data || []) as Ride[]
    const totalRides = completedRes.count || 0

    const avg = reviews.length > 0
      ? Math.round(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length * 10) / 10
      : null

    // Month earnings
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const monthEarnings = completed
      .filter(r => r.datum >= monthStart)
      .reduce((sum, r) => sum + (r.total_amount || 0), 0)

    setStats({ avg, count: reviews.length, total: totalRides, monthEarnings })

    // Open rides (no provider, pending)
    setOpenRides(allRides.filter(r => r.status === 'pending' && !r.provider_id).slice(0, 5))

    // Today's rides for this provider
    const today = new Date().toISOString().split('T')[0]
    setTodayRides(allRides.filter(r => r.datum === today && r.provider_id === providerData.id && r.status !== 'completed'))

    // Active ride (in_progress)
    const active = allRides.find(r => r.provider_id === providerData.id && r.status === 'in_progress')
    setActiveRide(active || null)

    setLoading(false)
  }

  // Standort in DB aktualisieren
  useEffect(() => {
    if (!userLocation.loading && userLocation.city && provider) {
      const supabase = createClient()
      supabase.from('krankenfahrt_providers').update({ city: userLocation.city }).eq('id', provider.id)
    }
  }, [userLocation.loading, userLocation.city, provider])

  async function handleClaimRide(rideId: string) {
    if (!provider) return
    setActionInProgress(rideId)
    try {
      const supabase = createClient()
      await supabase.from('krankenfahrten').update({ provider_id: provider.id, status: 'confirmed' }).eq('id', rideId)
      await loadData()
    } catch (err) {
      console.error(err)
    } finally {
      setActionInProgress(null)
    }
  }

  async function handleStartRide(rideId: string) {
    setActionInProgress(rideId)
    try {
      const supabase = createClient()
      await supabase.from('krankenfahrten').update({ status: 'in_progress' }).eq('id', rideId)
      await loadData()
    } catch (err) {
      console.error(err)
    } finally {
      setActionInProgress(null)
    }
  }

  async function handleCompleteRide(rideId: string) {
    setActionInProgress(rideId)
    try {
      const supabase = createClient()
      await supabase.from('krankenfahrten').update({ status: 'completed' }).eq('id', rideId)
      await loadData()
    } catch (err) {
      console.error(err)
    } finally {
      setActionInProgress(null)
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  if (loading) {
    return (
      <div className="screen" style={{ backgroundColor: '#1A1612', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#F5F0E8', fontSize: 16 }}>Wird geladen...</div>
      </div>
    )
  }

  const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Fahrer'

  return (
    <div className="screen" style={{ backgroundColor: '#1A1612' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px 20px',
        background: 'linear-gradient(180deg, rgba(201,150,60,0.08) 0%, transparent 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon3D size={28} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#C9963C', letterSpacing: 2, textTransform: 'uppercase' }}>Fahrer</span>
          </div>
          <div style={{
            padding: '4px 12px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            background: provider?.is_verified ? 'rgba(76,175,80,0.15)' : 'rgba(255,152,0,0.15)',
            color: provider?.is_verified ? '#4CAF50' : '#FF9800',
            border: `1px solid ${provider?.is_verified ? 'rgba(76,175,80,0.3)' : 'rgba(255,152,0,0.3)'}`,
          }}>
            {provider?.is_verified ? '✓ Verifiziert' : '⏳ Prüfung'}
          </div>
        </div>

        <div style={{ fontSize: 14, color: 'rgba(245,240,232,0.5)', marginBottom: 2 }}>Willkommen zurück</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#F5F0E8', marginBottom: 4 }}>{name}</div>
        {!userLocation.loading && userLocation.source !== 'fallback' && (
          <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.4)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10 }}>📍</span> {userLocation.city}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, background: '#252118', border: '1px solid rgba(201,150,60,0.15)', borderRadius: 14, padding: '14px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#C9963C' }}>{stats.monthEarnings.toFixed(0)}€</div>
            <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.5)', marginTop: 2 }}>Diesen Monat</div>
          </div>
          <div style={{ flex: 1, background: '#252118', border: '1px solid rgba(201,150,60,0.15)', borderRadius: 14, padding: '14px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#F5F0E8' }}>{stats.total}</div>
            <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.5)', marginTop: 2 }}>Fahrten</div>
          </div>
          <div style={{ flex: 1, background: '#252118', border: '1px solid rgba(201,150,60,0.15)', borderRadius: 14, padding: '14px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#F5F0E8' }}>{stats.avg !== null ? `${stats.avg}` : '–'}</div>
            <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.5)', marginTop: 2 }}>{stats.avg !== null ? '⭐ Bewertung' : 'Bewertung'}</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 100px' }}>

        {/* Active Ride Banner */}
        {activeRide && (
          <div style={{
            background: 'rgba(201,150,60,0.12)',
            border: '1.5px solid rgba(201,150,60,0.4)',
            borderRadius: 14,
            padding: 14,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#DBA84A', marginBottom: 8 }}>
              🚗 Aktive Fahrt
            </div>
            <RideAddresses pickup={activeRide.abholadresse} dest={activeRide.zieladresse} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#DBA84A' }}>{activeRide.total_amount?.toFixed(2)}€</span>
              <button
                onClick={() => handleCompleteRide(activeRide.id)}
                disabled={actionInProgress === activeRide.id}
                style={{
                  background: '#4CAF50', color: '#fff', border: 'none', padding: '8px 20px',
                  borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  opacity: actionInProgress === activeRide.id ? 0.6 : 1,
                }}
              >
                {actionInProgress === activeRide.id ? '...' : 'Abschließen'}
              </button>
            </div>
          </div>
        )}

        {/* Today's Rides */}
        <SectionLabel text="Heutige Fahrten" count={todayRides.length} />
        {todayRides.length === 0 ? (
          <EmptyBox text="Keine Fahrten für heute" />
        ) : (
          todayRides.map(ride => (
            <RideCard
              key={ride.id}
              ride={ride}
              actionInProgress={actionInProgress}
              onStart={() => handleStartRide(ride.id)}
              onComplete={() => handleCompleteRide(ride.id)}
              onChat={() => router.push(`/fahrer/chat/${ride.id}`)}
            />
          ))
        )}

        {/* Open Rides */}
        <SectionLabel text="Verfügbare Aufträge" count={openRides.length} />
        {openRides.length === 0 ? (
          <EmptyBox text="Keine offenen Aufträge verfügbar" />
        ) : (
          <>
            {openRides.map(ride => (
              <div key={ride.id} style={{
                background: '#252118',
                border: '1px solid rgba(201,150,60,0.12)',
                borderRadius: 14,
                padding: 14,
                marginBottom: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)' }}>{formatDate(ride.datum)} · {ride.uhrzeit}</span>
                  <RideBadges ride={ride} />
                </div>
                <RideAddresses pickup={ride.abholadresse} dest={ride.zieladresse} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#DBA84A' }}>{ride.total_amount?.toFixed(2)}€</span>
                  <button
                    onClick={() => handleClaimRide(ride.id)}
                    disabled={actionInProgress === ride.id}
                    style={{
                      background: '#C9963C', color: '#fff', border: 'none', padding: '8px 20px',
                      borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      opacity: actionInProgress === ride.id ? 0.6 : 1,
                    }}
                  >
                    {actionInProgress === ride.id ? 'Wird angenommen...' : 'Annehmen'}
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => router.push('/fahrer/auftraege')}
              style={{
                width: '100%', padding: '12px', borderRadius: 12,
                background: 'transparent', border: '1px solid rgba(201,150,60,0.2)',
                color: '#C9963C', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                marginBottom: 16,
              }}
            >
              Alle Aufträge anzeigen →
            </button>
          </>
        )}

        {/* Quick Actions */}
        <SectionLabel text="Schnellzugriff" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          <QuickAction label="Aufträge" emoji="📋" onClick={() => router.push('/fahrer/auftraege')} />
          <QuickAction label="Chat" emoji="💬" onClick={() => router.push('/fahrer/chat')} />
          <QuickAction label="Fahrzeuge" emoji="🚗" onClick={() => router.push('/fahrer/fahrzeuge')} />
          <QuickAction label="Profil" emoji="👤" onClick={() => router.push('/fahrer/profil')} />
        </div>

        {/* Provider Info */}
        {provider && (
          <div style={{
            background: 'rgba(201,150,60,0.06)',
            border: '1px solid rgba(201,150,60,0.12)',
            borderRadius: 12,
            padding: 12,
          }}>
            <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.4)', marginBottom: 4 }}>Dienstleister</div>
            <div style={{ fontSize: 14, color: '#F5F0E8', fontWeight: 600 }}>{provider.company_name || '–'}</div>
            <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.4)', marginTop: 4 }}>Lizenz: {provider.license_number || '–'}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──

function SectionLabel({ text, count }: { text: string; count?: number }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 700, color: '#C9963C', marginBottom: 10, marginTop: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
      {text}
      {count !== undefined && count > 0 && (
        <span style={{ background: 'rgba(201,150,60,0.2)', color: '#DBA84A', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{count}</span>
      )}
    </div>
  )
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div style={{ padding: '24px 16px', textAlign: 'center', color: 'rgba(245,240,232,0.3)', fontSize: 13, background: '#252118', borderRadius: 12, marginBottom: 10 }}>
      {text}
    </div>
  )
}

function RideAddresses({ pickup, dest }: { pickup: string; dest: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 2 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#C9963C' }} />
        <div style={{ width: 2, height: 24, background: 'rgba(201,150,60,0.3)', margin: '3px 0' }} />
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#DBA84A' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#DBA84A', fontWeight: 500, marginBottom: 6, wordBreak: 'break-word' }}>{pickup}</div>
        <div style={{ fontSize: 12, color: '#F5F0E8', wordBreak: 'break-word' }}>{dest}</div>
      </div>
    </div>
  )
}

function RideBadges({ ride }: { ride: Ride }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {ride.rollstuhl_benoetig && <span style={{ fontSize: 14 }} title="Rollstuhl">🦽</span>}
      {ride.tragestuhl_benoetig && <span style={{ fontSize: 14 }} title="Tragestuhl">🪑</span>}
      {ride.rueckfahrt && (
        <span style={{ fontSize: 10, background: 'rgba(201,150,60,0.2)', color: '#DBA84A', padding: '2px 6px', borderRadius: 6 }}>↩</span>
      )}
    </div>
  )
}

function RideCard({ ride, actionInProgress, onStart, onComplete, onChat }: {
  ride: Ride; actionInProgress: string | null
  onStart: () => void; onComplete: () => void; onChat: () => void
}) {
  const statusColors: Record<string, string> = {
    confirmed: '#2196F3',
    in_progress: '#FF9800',
  }
  const statusLabels: Record<string, string> = {
    confirmed: 'Bestätigt',
    in_progress: 'Im Gange',
  }

  return (
    <div style={{
      background: '#252118',
      border: '1px solid rgba(201,150,60,0.12)',
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)' }}>{ride.uhrzeit}</span>
        <span style={{
          background: statusColors[ride.status] || '#999',
          color: '#fff', padding: '3px 10px', borderRadius: 10, fontSize: 10, fontWeight: 600,
        }}>
          {statusLabels[ride.status] || ride.status}
        </span>
      </div>
      <RideAddresses pickup={ride.abholadresse} dest={ride.zieladresse} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#DBA84A' }}>{ride.total_amount?.toFixed(2)}€</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onChat} style={{
            background: 'rgba(201,150,60,0.12)', border: '1px solid rgba(201,150,60,0.2)',
            color: '#DBA84A', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
          }}>💬</button>
          {ride.status === 'confirmed' && (
            <button onClick={onStart} disabled={actionInProgress === ride.id} style={{
              background: '#DBA84A', color: '#1A1612', border: 'none', padding: '6px 16px',
              borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              opacity: actionInProgress === ride.id ? 0.6 : 1,
            }}>Starten</button>
          )}
          {ride.status === 'in_progress' && (
            <button onClick={onComplete} disabled={actionInProgress === ride.id} style={{
              background: '#4CAF50', color: '#fff', border: 'none', padding: '6px 16px',
              borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              opacity: actionInProgress === ride.id ? 0.6 : 1,
            }}>Fertig</button>
          )}
        </div>
      </div>
    </div>
  )
}

function QuickAction({ label, emoji, onClick }: { label: string; emoji: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: '#252118', border: '1px solid rgba(201,150,60,0.12)', borderRadius: 14,
      padding: '16px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
      color: '#F5F0E8', fontSize: 13, fontWeight: 500, textAlign: 'left',
    }}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      {label}
    </button>
  )
}
