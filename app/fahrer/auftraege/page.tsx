'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type TabType = 'alle' | 'offen' | 'heute' | 'abgeschlossen'
type RideStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed'

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
  status: RideStatus
  provider_id: string | null
  customer_id: string
}

export default function AuftraegePage() {
  const router = useRouter()
  const [rides, setRides] = useState<Ride[]>([])
  const [filteredRides, setFilteredRides] = useState<Ride[]>([])
  const [activeTab, setActiveTab] = useState<TabType>('alle')
  const [providerId, setProviderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/auth/login')
          return
        }

        // Get provider_id from krankenfahrt_providers
        const { data: provider } = await supabase
          .from('krankenfahrt_providers')
          .select('id')
          .eq('user_id', user.id)
          .single()

        if (provider) {
          setProviderId(provider.id)

          // Load all rides
          const { data: allRides, error: ridesError } = await supabase
            .from('krankenfahrten')
            .select('*')
            .order('datum', { ascending: false })
            .order('uhrzeit', { ascending: false })

          if (ridesError) {
            setError('Fehler beim Laden der Aufträge')
            setLoading(false)
            return
          }

          setRides(allRides || [])
        } else {
          setError('Sie sind nicht als Fahrer registriert')
        }
      } catch (err) {
        setError('Ein unerwarteter Fehler ist aufgetreten')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [router])

  // Filter rides based on active tab
  useEffect(() => {
    let filtered = rides

    if (activeTab === 'offen') {
      // Available to claim: status='pending' and no provider assigned
      filtered = rides.filter(r => r.status === 'pending' && !r.provider_id)
    } else if (activeTab === 'heute') {
      // Today's rides for current provider
      const today = new Date().toISOString().split('T')[0]
      filtered = rides.filter(r => r.datum === today && r.provider_id === providerId)
    } else if (activeTab === 'abgeschlossen') {
      // Completed rides for current provider
      filtered = rides.filter(r => r.status === 'completed' && r.provider_id === providerId)
    } else {
      // 'alle': all rides assigned to current provider
      filtered = rides.filter(r => r.provider_id === providerId)
    }

    setFilteredRides(filtered)
  }, [rides, activeTab, providerId])

  const handleClaimRide = async (rideId: string) => {
    if (!providerId) return

    setActionInProgress(rideId)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('krankenfahrten')
        .update({
          provider_id: providerId,
          status: 'confirmed',
        })
        .eq('id', rideId)

      if (updateError) {
        setError('Fehler beim Annehmen des Auftrags')
      } else {
        // Update local state
        setRides(rides.map(r =>
          r.id === rideId ? { ...r, provider_id: providerId, status: 'confirmed' } : r
        ))
      }
    } catch (err) {
      setError('Ein unerwarteter Fehler ist aufgetreten')
    } finally {
      setActionInProgress(null)
    }
  }

  const handleStartRide = async (rideId: string) => {
    setActionInProgress(rideId)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('krankenfahrten')
        .update({ status: 'in_progress' })
        .eq('id', rideId)

      if (updateError) {
        setError('Fehler beim Starten der Fahrt')
      } else {
        setRides(rides.map(r =>
          r.id === rideId ? { ...r, status: 'in_progress' } : r
        ))
      }
    } catch (err) {
      setError('Ein unerwarteter Fehler ist aufgetreten')
    } finally {
      setActionInProgress(null)
    }
  }

  const handleCompleteRide = async (rideId: string) => {
    setActionInProgress(rideId)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('krankenfahrten')
        .update({ status: 'completed' })
        .eq('id', rideId)

      if (updateError) {
        setError('Fehler beim Abschließen der Fahrt')
      } else {
        setRides(rides.map(r =>
          r.id === rideId ? { ...r, status: 'completed' } : r
        ))
      }
    } catch (err) {
      setError('Ein unerwarteter Fehler ist aufgetreten')
    } finally {
      setActionInProgress(null)
    }
  }

  const getStatusBadgeColor = (status: RideStatus): string => {
    switch (status) {
      case 'pending':
        return '#FF9800' // Orange
      case 'confirmed':
        return '#2196F3' // Blue
      case 'in_progress':
        return '#FFA726' // Orange
      case 'completed':
        return '#4CAF50' // Green
      default:
        return '#999'
    }
  }

  const getStatusLabel = (status: RideStatus): string => {
    switch (status) {
      case 'pending':
        return 'Verfügbar'
      case 'confirmed':
        return 'Bestätigt'
      case 'in_progress':
        return 'Im Gange'
      case 'completed':
        return 'Abgeschlossen'
      default:
        return status
    }
  }

  return (
    <div className="phone">
      <div className="screen" style={{ backgroundColor: '#1A1612', color: '#F5F0E8' }}>
        {/* Header */}
        <div style={{
          padding: '16px',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <Link href="/fahrer/home">
            <button style={{
              background: 'none',
              border: 'none',
              color: '#C9963C',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px 8px',
            }}>
              ‹
            </button>
          </Link>
          <div style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#F5F0E8',
          }}>
            Aufträge
          </div>
        </div>

        {/* Tab Filter */}
        <div style={{
          display: 'flex',
          gap: '8px',
          padding: '12px 16px',
          borderBottom: '1px solid #333',
          overflowX: 'auto',
          scrollBehavior: 'smooth',
        }}>
          {(['alle', 'offen', 'heute', 'abgeschlossen'] as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px',
                border: '1px solid',
                borderColor: activeTab === tab ? '#C9963C' : '#555',
                background: activeTab === tab ? 'rgba(201, 150, 60, 0.15)' : 'transparent',
                color: activeTab === tab ? '#DBA84A' : '#999',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.3s ease',
              }}
            >
              {tab === 'alle' && 'Alle'}
              {tab === 'offen' && 'Offen'}
              {tab === 'heute' && 'Heute'}
              {tab === 'abgeschlossen' && 'Abgeschlossen'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          paddingBottom: '80px',
        }}>
          {error && (
            <div style={{
              background: 'rgba(244, 67, 54, 0.1)',
              border: '1px solid rgba(244, 67, 54, 0.3)',
              borderRadius: '8px',
              padding: '12px 14px',
              marginBottom: '16px',
              color: '#C62828',
              fontSize: '14px',
            }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{
              textAlign: 'center',
              padding: '32px 16px',
              color: '#999',
              fontSize: '14px',
            }}>
              Laden...
            </div>
          ) : filteredRides.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '32px 16px',
              color: '#999',
              fontSize: '14px',
            }}>
              {activeTab === 'offen' ? 'Keine verfügbaren Aufträge' : 'Keine Aufträge'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredRides.map(ride => (
                <div
                  key={ride.id}
                  style={{
                    background: '#2A2420',
                    border: '1px solid #444',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {/* Date and Time */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div style={{ fontSize: '13px', color: '#999' }}>
                      {new Date(ride.datum).toLocaleDateString('de-DE', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })} · {ride.uhrzeit}
                    </div>
                    <div
                      style={{
                        background: getStatusBadgeColor(ride.status),
                        color: '#fff',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                      }}
                    >
                      {getStatusLabel(ride.status)}
                    </div>
                  </div>

                  {/* Addresses */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                  }}>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      marginTop: '2px',
                    }}>
                      <div style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: '#C9963C',
                      }}></div>
                      <div style={{
                        width: '2px',
                        height: '30px',
                        background: '#555',
                        margin: '4px 0',
                      }}></div>
                      <div style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: '#DBA84A',
                      }}></div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '13px',
                        color: '#DBA84A',
                        fontWeight: '500',
                        marginBottom: '4px',
                        wordBreak: 'break-word',
                      }}>
                        {ride.abholadresse}
                      </div>
                      <div style={{
                        fontSize: '13px',
                        color: '#F5F0E8',
                        wordBreak: 'break-word',
                      }}>
                        {ride.zieladresse}
                      </div>
                    </div>
                  </div>

                  {/* Icons and Badges */}
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}>
                    {ride.rollstuhl_benoetig && (
                      <span style={{
                        fontSize: '18px',
                        title: 'Rollstuhl',
                      }}>
                        🦽
                      </span>
                    )}
                    {ride.tragestuhl_benoetig && (
                      <span style={{
                        fontSize: '18px',
                        title: 'Tragestuhl',
                      }}>
                        🪑
                      </span>
                    )}
                    {ride.rueckfahrt && (
                      <div style={{
                        background: 'rgba(201, 150, 60, 0.2)',
                        border: '1px solid #C9963C',
                        color: '#DBA84A',
                        padding: '2px 8px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: '500',
                      }}>
                        Rückfahrt
                      </div>
                    )}
                  </div>

                  {/* Amount */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '8px',
                    borderTop: '1px solid #444',
                  }}>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '700',
                      color: '#DBA84A',
                    }}>
                      {ride.total_amount.toFixed(2)}€
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {activeTab === 'offen' && (
                        <button
                          onClick={() => handleClaimRide(ride.id)}
                          disabled={actionInProgress === ride.id}
                          style={{
                            background: '#C9963C',
                            color: '#fff',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: actionInProgress === ride.id ? 'not-allowed' : 'pointer',
                            opacity: actionInProgress === ride.id ? 0.6 : 1,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {actionInProgress === ride.id ? 'Wird angenommen...' : 'Annehmen'}
                        </button>
                      )}

                      {activeTab !== 'offen' && ride.status === 'confirmed' && (
                        <>
                          <button
                            onClick={() => handleStartRide(ride.id)}
                            disabled={actionInProgress === ride.id}
                            style={{
                              background: '#DBA84A',
                              color: '#1A1612',
                              border: 'none',
                              padding: '8px 16px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: actionInProgress === ride.id ? 'not-allowed' : 'pointer',
                              opacity: actionInProgress === ride.id ? 0.6 : 1,
                              transition: 'all 0.2s ease',
                            }}
                          >
                            {actionInProgress === ride.id ? 'Wird gestartet...' : 'Starten'}
                          </button>
                        </>
                      )}

                      {activeTab !== 'offen' && ride.status === 'in_progress' && (
                        <>
                          <button
                            onClick={() => handleCompleteRide(ride.id)}
                            disabled={actionInProgress === ride.id}
                            style={{
                              background: '#4CAF50',
                              color: '#fff',
                              border: 'none',
                              padding: '8px 16px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: actionInProgress === ride.id ? 'not-allowed' : 'pointer',
                              opacity: actionInProgress === ride.id ? 0.6 : 1,
                              transition: 'all 0.2s ease',
                            }}
                          >
                            {actionInProgress === ride.id ? 'Wird abgeschlossen...' : 'Abschließen'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
