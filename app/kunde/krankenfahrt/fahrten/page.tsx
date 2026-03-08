'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Ausstehend', color: '#DBA84A', bg: 'rgba(201,150,60,0.15)' },
  confirmed: { label: 'Bestätigt', color: '#4CAF50', bg: 'rgba(76,175,80,0.15)' },
  in_progress: { label: 'Unterwegs', color: '#2196F3', bg: 'rgba(33,150,243,0.15)' },
  completed: { label: 'Abgeschlossen', color: '#9E9E9E', bg: 'rgba(158,158,158,0.15)' },
  cancelled: { label: 'Storniert', color: '#ff5050', bg: 'rgba(255,80,80,0.15)' },
}

export default function KundeFahrtenPage() {
  const router = useRouter()
  const supabase = createClient()
  const [rides, setRides] = useState<any[]>([])
  const [reviews, setReviews] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: ridesData } = await supabase
      .from('krankenfahrten')
      .select('*, krankenfahrt_providers(company_name)')
      .eq('customer_id', user.id)
      .order('datum', { ascending: false })

    setRides(ridesData || [])

    // Check which rides have been reviewed
    const { data: reviewsData } = await supabase
      .from('krankenfahrt_reviews')
      .select('krankenfahrt_id')
      .eq('customer_id', user.id)

    if (reviewsData) {
      setReviews(new Set(reviewsData.map(r => r.krankenfahrt_id)))
    }
    setLoading(false)
  }

  return (
    <div className="phone">
      <div className="screen" style={{ paddingBottom: '100px' }}>
        {/* Top Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px' }}>
          <button onClick={() => router.push('/kunde/home')} style={{
            width: '38px', height: '38px', borderRadius: '12px',
            background: 'transparent', border: '1.5px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', fontSize: '20px',
          }}>←</button>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '22px', fontWeight: '600', color: '#F5F0E8' }}>Meine Fahrten</span>
        </div>

        <div style={{ padding: '0 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(245,240,232,0.4)' }}>Laden...</div>
          ) : rides.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(245,240,232,0.3)' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🚗</div>
              <div style={{ fontWeight: '600', color: 'rgba(245,240,232,0.5)', marginBottom: '4px' }}>Keine Fahrten</div>
              <div style={{ fontSize: '13px' }}>Buchen Sie Ihre erste Krankenfahrt!</div>
              <button onClick={() => router.push('/kunde/krankenfahrt')} style={{
                marginTop: '16px', padding: '12px 24px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #C9963C, #DBA84A)',
                border: 'none', color: '#1A1612', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
              }}>Fahrt buchen</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {rides.map(ride => {
                const status = statusConfig[ride.status] || statusConfig.pending
                const isCompleted = ride.status === 'completed'
                const isRated = reviews.has(ride.id)

                return (
                  <div key={ride.id} style={{
                    background: '#252118', borderRadius: '16px', padding: '16px',
                    border: '1px solid rgba(201,150,60,0.1)',
                  }}>
                    {/* Date & Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ fontSize: '13px', color: 'rgba(245,240,232,0.5)' }}>
                        {ride.datum ? new Date(ride.datum).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} · {ride.uhrzeit?.slice(0, 5)}
                      </div>
                      <span style={{
                        fontSize: '11px', fontWeight: '600', padding: '3px 10px',
                        borderRadius: '8px', background: status.bg, color: status.color,
                      }}>{status.label}</span>
                    </div>

                    {/* Addresses */}
                    <div style={{ fontSize: '14px', color: '#F5F0E8', marginBottom: '4px' }}>
                      📍 {ride.abholadresse}
                    </div>
                    <div style={{ fontSize: '14px', color: '#F5F0E8', marginBottom: '8px' }}>
                      🏁 {ride.zieladresse}
                    </div>

                    {/* Provider & Extras */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
                      {ride.krankenfahrt_providers?.company_name && (
                        <span style={{ fontSize: '12px', color: '#DBA84A' }}>🚗 {ride.krankenfahrt_providers.company_name}</span>
                      )}
                      {ride.rollstuhl_benoetig && <span title="Rollstuhl" style={{ fontSize: '16px' }}>🦽</span>}
                      {ride.tragestuhl_benoetig && <span title="Tragestuhl" style={{ fontSize: '16px' }}>🪑</span>}
                      {ride.rueckfahrt && (
                        <span style={{ fontSize: '11px', background: 'rgba(201,150,60,0.15)', color: '#DBA84A', padding: '2px 8px', borderRadius: '6px' }}>Hin & Rück</span>
                      )}
                    </div>

                    {/* Amount */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '16px', fontWeight: '700', color: '#DBA84A' }}>
                        {ride.total_amount ? `€${Number(ride.total_amount).toFixed(2)}` : '—'}
                      </span>

                      {isCompleted && !isRated && (
                        <button onClick={() => router.push(`/kunde/krankenfahrt/bewertung/${ride.id}`)} style={{
                          padding: '8px 16px', borderRadius: '10px',
                          background: 'linear-gradient(135deg, #C9963C, #DBA84A)',
                          border: 'none', color: '#1A1612', fontSize: '13px',
                          fontWeight: '600', cursor: 'pointer',
                        }}>⭐ Bewerten</button>
                      )}
                      {isCompleted && isRated && (
                        <span style={{ fontSize: '12px', color: '#4CAF50', fontWeight: '500' }}>✓ Bewertet</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
