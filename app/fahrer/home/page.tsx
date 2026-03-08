'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function FahrerHomePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [provider, setProvider] = useState<any>(null)
  const [stats, setStats] = useState({
    openOrders: 0,
    todayPlanned: 0,
    vehicles: 0,
    rating: 0
  })
  const [recentRides, setRecentRides] = useState<any[]>([])

  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        // Load profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        setProfile(profileData)

        // Load provider info
        const { data: providerData } = await supabase
          .from('krankenfahrt_providers')
          .select('*')
          .eq('user_id', user.id)
          .single()
        setProvider(providerData)

        if (providerData) {
          // Load open orders
          const { data: openData } = await supabase
            .from('krankenfahrten')
            .select('*')
            .eq('provider_id', providerData.id)
            .in('status', ['pending', 'assigned'])
          
          // Load today planned
          const today = new Date().toISOString().split('T')[0]
          const { data: todayData } = await supabase
            .from('krankenfahrten')
            .select('*')
            .eq('provider_id', providerData.id)
            .gte('date', today)
            .lt('date', new Date(Date.now() + 86400000).toISOString().split('T')[0])
            .eq('status', 'confirmed')

          // Load vehicle count
          const { data: vehicleData } = await supabase
            .from('fahrzeuge')
            .select('id')
            .eq('provider_id', providerData.id)

          // Load recent rides
          const { data: ridesData } = await supabase
            .from('krankenfahrten')
            .select('*')
            .eq('provider_id', providerData.id)
            .order('date', { ascending: false })
            .limit(5)

          setStats({
            openOrders: openData?.length || 0,
            todayPlanned: todayData?.length || 0,
            vehicles: vehicleData?.length || 0,
            rating: providerData?.rating || 0
          })
          setRecentRides(ridesData || [])
        }
      } catch (err) {
        console.error('Fahrer home load error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FFB74D'
      case 'assigned': return '#81C784'
      case 'confirmed': return '#64B5F6'
      case 'in_progress': return '#7E57C2'
      case 'completed': return '#4CAF50'
      case 'cancelled': return '#E57373'
      default: return '#C9963C'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Angeboten'
      case 'assigned': return 'Zugewiesen'
      case 'confirmed': return 'Bestätigt'
      case 'in_progress': return 'In Bearbeitung'
      case 'completed': return 'Abgeschlossen'
      case 'cancelled': return 'Storniert'
      default: return status
    }
  }

  const name = profile ? `${profile.first_name}` : '...'

  if (loading) {
    return (
      <div className="phone">
        <div className="screen" style={{ background: '#1A1612', color: '#F5F0E8' }}>
          <div style={{ padding: '20px', textAlign: 'center' }}>Laden...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="phone">
      <div className="screen" style={{ background: '#1A1612', color: '#F5F0E8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          padding: '24px 20px',
          borderBottom: '1px solid rgba(201, 150, 60, 0.2)',
          background: 'linear-gradient(180deg, rgba(201, 150, 60, 0.08) 0%, rgba(37, 33, 24, 0.4) 100%)'
        }}>
          {/* Branding */}
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#C9963C',
            letterSpacing: '0.8px',
            marginBottom: '16px',
            textTransform: 'uppercase'
          }}>
            ALLTAGSENGEL
          </div>

          {/* Greeting */}
          <div style={{
            fontSize: '14px',
            color: 'rgba(245, 240, 232, 0.6)',
            marginBottom: '4px'
          }}>
            Hallo,
          </div>
          <div style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#F5F0E8',
            marginBottom: '24px'
          }}>
            {name}
          </div>

          {/* Stats Cards Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px'
          }}>
            {/* Offene Aufträge */}
            <div style={{
              background: 'linear-gradient(135deg, #C9963C 0%, #DBA84A 100%)',
              borderRadius: '12px',
              padding: '16px',
              color: '#1A1612'
            }}>
              <div style={{ fontSize: '12px', fontWeight: '500', opacity: 0.7, marginBottom: '8px' }}>
                Offene Aufträge
              </div>
              <div style={{ fontSize: '32px', fontWeight: '700' }}>
                {stats.openOrders}
              </div>
            </div>

            {/* Heute geplant */}
            <div style={{
              background: 'linear-gradient(135deg, #C9963C 0%, #DBA84A 100%)',
              borderRadius: '12px',
              padding: '16px',
              color: '#1A1612'
            }}>
              <div style={{ fontSize: '12px', fontWeight: '500', opacity: 0.7, marginBottom: '8px' }}>
                Heute geplant
              </div>
              <div style={{ fontSize: '32px', fontWeight: '700' }}>
                {stats.todayPlanned}
              </div>
            </div>

            {/* Fahrzeuge */}
            <div style={{
              background: 'linear-gradient(135deg, #C9963C 0%, #DBA84A 100%)',
              borderRadius: '12px',
              padding: '16px',
              color: '#1A1612'
            }}>
              <div style={{ fontSize: '12px', fontWeight: '500', opacity: 0.7, marginBottom: '8px' }}>
                Fahrzeuge
              </div>
              <div style={{ fontSize: '32px', fontWeight: '700' }}>
                {stats.vehicles}
              </div>
            </div>

            {/* Bewertung */}
            <div style={{
              background: 'linear-gradient(135deg, #C9963C 0%, #DBA84A 100%)',
              borderRadius: '12px',
              padding: '16px',
              color: '#1A1612'
            }}>
              <div style={{ fontSize: '12px', fontWeight: '500', opacity: 0.7, marginBottom: '8px' }}>
                Bewertung
              </div>
              <div style={{ fontSize: '32px', fontWeight: '700' }}>
                {stats.rating.toFixed(1)}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{
          padding: '20px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          borderBottom: '1px solid rgba(201, 150, 60, 0.1)'
        }}>
          <button
            onClick={() => router.push('/fahrer/fahrzeuge')}
            style={{
              background: 'rgba(201, 150, 60, 0.15)',
              border: '1px solid rgba(201, 150, 60, 0.3)',
              borderRadius: '10px',
              padding: '14px 16px',
              color: '#DBA84A',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textAlign: 'center'
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.background = 'rgba(201, 150, 60, 0.25)'
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.background = 'rgba(201, 150, 60, 0.15)'
            }}
          >
            + Neues Fahrzeug
          </button>
          <button
            onClick={() => router.push('/fahrer/auftraege')}
            style={{
              background: 'rgba(201, 150, 60, 0.15)',
              border: '1px solid rgba(201, 150, 60, 0.3)',
              borderRadius: '10px',
              padding: '14px 16px',
              color: '#DBA84A',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textAlign: 'center'
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.background = 'rgba(201, 150, 60, 0.25)'
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.background = 'rgba(201, 150, 60, 0.15)'
            }}
          >
            → Aufträge
          </button>
        </div>

        {/* Recent Rides List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px'
        }}>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: 'rgba(245, 240, 232, 0.5)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '16px'
          }}>
            Letzte Fahrten
          </div>

          {recentRides.length === 0 ? (
            <div style={{
              textAlign: 'center',
              color: 'rgba(245, 240, 232, 0.4)',
              padding: '40px 20px',
              fontSize: '14px'
            }}>
              Keine Fahrten vorhanden
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recentRides.map((ride) => (
                <div
                  key={ride.id}
                  style={{
                    background: '#252118',
                    border: '1px solid rgba(201, 150, 60, 0.1)',
                    borderRadius: '10px',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    borderLeft: `4px solid ${getStatusColor(ride.status)}`
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = '#332E24'
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(201, 150, 60, 0.2)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = '#252118'
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(201, 150, 60, 0.1)'
                  }}
                >
                  {/* Date */}
                  <div style={{
                    fontSize: '12px',
                    color: 'rgba(245, 240, 232, 0.5)',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px'
                  }}>
                    {new Date(ride.date).toLocaleDateString('de-DE', {
                      weekday: 'short',
                      year: '2-digit',
                      month: '2-digit',
                      day: '2-digit'
                    })}
                  </div>

                  {/* Locations */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#F5F0E8',
                      marginBottom: '4px'
                    }}>
                      {ride.pickup_address || 'Abholort'}
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: '#C9963C',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      ↓
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: 'rgba(245, 240, 232, 0.8)',
                      marginTop: '4px'
                    }}>
                      {ride.destination_address || 'Zielort'}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div style={{
                    display: 'inline-block',
                    background: getStatusColor(ride.status),
                    color: ride.status === 'cancelled' || ride.status === 'completed' ? '#1A1612' : '#1A1612',
                    fontSize: '11px',
                    fontWeight: '600',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px'
                  }}>
                    {getStatusText(ride.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Navigation */}
        <div style={{
          borderTop: '1px solid rgba(201, 150, 60, 0.2)',
          background: '#252118',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: 0,
          padding: '8px 0'
        }}>
          <button
            onClick={() => router.push('/fahrer/home')}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#C9963C',
              padding: '12px 8px',
              textAlign: 'center',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.3px'
            }}
          >
            <span style={{ fontSize: '20px' }}>🏠</span>
            Home
          </button>
          <button
            onClick={() => router.push('/fahrer/auftraege')}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'rgba(245, 240, 232, 0.6)',
              padding: '12px 8px',
              textAlign: 'center',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.color = 'rgba(245, 240, 232, 0.8)'
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.color = 'rgba(245, 240, 232, 0.6)'
            }}
          >
            <span style={{ fontSize: '20px' }}>📋</span>
            Aufträge
          </button>
          <button
            onClick={() => router.push('/fahrer/fahrzeuge')}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'rgba(245, 240, 232, 0.6)',
              padding: '12px 8px',
              textAlign: 'center',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.color = 'rgba(245, 240, 232, 0.8)'
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.color = 'rgba(245, 240, 232, 0.6)'
            }}
          >
            <span style={{ fontSize: '20px' }}>🚗</span>
            Fahrzeuge
          </button>
          <button
            onClick={() => router.push('/fahrer/profil')}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'rgba(245, 240, 232, 0.6)',
              padding: '12px 8px',
              textAlign: 'center',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.color = 'rgba(245, 240, 232, 0.8)'
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.color = 'rgba(245, 240, 232, 0.6)'
            }}
          >
            <span style={{ fontSize: '20px' }}>👤</span>
            Profil
          </button>
        </div>
      </div>
    </div>
  )
}
