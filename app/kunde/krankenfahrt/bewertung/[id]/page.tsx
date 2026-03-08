'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function StarRating({ value, onChange, size = 32 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {[1, 2, 3, 4, 5].map(star => (
        <button key={star} onClick={() => onChange(star)} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
          fontSize: `${size}px`, color: star <= value ? '#DBA84A' : 'rgba(245,240,232,0.15)',
          transition: 'transform 0.15s',
        }}>★</button>
      ))}
    </div>
  )
}

export default function BewertungPage() {
  const router = useRouter()
  const params = useParams()
  const rideId = params.id as string
  const supabase = createClient()
  
  const [ride, setRide] = useState<any>(null)
  const [rating, setRating] = useState(0)
  const [puenktlichkeit, setPuenktlichkeit] = useState(0)
  const [freundlichkeit, setFreundlichkeit] = useState(0)
  const [fahrzeugZustand, setFahrzeugZustand] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [alreadyRated, setAlreadyRated] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadRide()
  }, [])

  async function loadRide() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: rideData } = await supabase
      .from('krankenfahrten')
      .select('*, krankenfahrt_providers(company_name)')
      .eq('id', rideId)
      .eq('customer_id', user.id)
      .single()

    if (!rideData) { router.push('/kunde/home'); return }
    setRide(rideData)

    // Check if already rated
    const { data: existingReview } = await supabase
      .from('krankenfahrt_reviews')
      .select('id')
      .eq('krankenfahrt_id', rideId)
      .single()

    if (existingReview) setAlreadyRated(true)
    setLoading(false)
  }

  async function handleSubmit() {
    if (rating === 0) { setError('Bitte geben Sie eine Gesamtbewertung ab'); return }
    setSubmitting(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: insertError } = await supabase
      .from('krankenfahrt_reviews')
      .insert({
        krankenfahrt_id: rideId,
        customer_id: user.id,
        provider_id: ride.provider_id,
        rating,
        puenktlichkeit: puenktlichkeit || null,
        freundlichkeit: freundlichkeit || null,
        fahrzeug_zustand: fahrzeugZustand || null,
        comment: comment.trim() || null,
      })

    if (insertError) {
      setError('Bewertung konnte nicht gespeichert werden')
      setSubmitting(false)
      return
    }

    setSuccess(true)
    setTimeout(() => router.push('/kunde/home'), 2000)
  }

  if (loading) return (
    <div className="phone"><div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ color: '#DBA84A' }}>Laden...</div>
    </div></div>
  )

  if (success) return (
    <div className="phone"><div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '16px', padding: '40px' }}>
      <div style={{ fontSize: '60px' }}>⭐</div>
      <div style={{ fontSize: '22px', fontWeight: '700', color: '#F5F0E8', textAlign: 'center' }}>Vielen Dank!</div>
      <div style={{ fontSize: '14px', color: 'rgba(245,240,232,0.5)', textAlign: 'center' }}>Ihre Bewertung hilft uns, den Service zu verbessern.</div>
    </div></div>
  )

  const subRatingStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 0', borderBottom: '1px solid rgba(201,150,60,0.08)',
  }

  return (
    <div className="phone">
      <div className="screen" style={{ paddingBottom: '40px' }}>
        {/* Top Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px' }}>
          <button onClick={() => router.back()} style={{
            width: '38px', height: '38px', borderRadius: '12px',
            background: 'transparent', border: '1.5px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', fontSize: '20px',
          }}>←</button>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '22px', fontWeight: '600', color: '#F5F0E8' }}>Fahrt bewerten</span>
        </div>

        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Ride Info Card */}
          <div style={{
            background: '#252118', borderRadius: '16px', padding: '16px',
            border: '1px solid rgba(201,150,60,0.12)',
          }}>
            <div style={{ fontSize: '13px', color: 'rgba(245,240,232,0.4)', marginBottom: '8px' }}>
              {ride?.datum ? new Date(ride.datum).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }) : ''} · {ride?.uhrzeit?.slice(0, 5)}
            </div>
            <div style={{ fontSize: '14px', color: '#F5F0E8', marginBottom: '4px' }}>
              📍 {ride?.abholadresse}
            </div>
            <div style={{ fontSize: '14px', color: '#F5F0E8' }}>
              🏁 {ride?.zieladresse}
            </div>
            {ride?.krankenfahrt_providers?.company_name && (
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#DBA84A' }}>
                🚗 {ride.krankenfahrt_providers.company_name}
              </div>
            )}
          </div>

          {alreadyRated ? (
            <div style={{
              background: 'rgba(76,175,80,0.1)', border: '1px solid rgba(76,175,80,0.2)',
              borderRadius: '14px', padding: '20px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '14px', color: '#4CAF50', fontWeight: '600' }}>✓ Sie haben diese Fahrt bereits bewertet</div>
            </div>
          ) : (
            <>
              {/* Overall Rating */}
              <div style={{
                background: '#252118', borderRadius: '16px', padding: '24px',
                border: '1px solid rgba(201,150,60,0.12)', textAlign: 'center',
              }}>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#DBA84A', marginBottom: '16px' }}>Gesamtbewertung</div>
                <StarRating value={rating} onChange={setRating} size={40} />
                <div style={{ fontSize: '12px', color: 'rgba(245,240,232,0.3)', marginTop: '8px' }}>
                  {rating === 0 ? 'Tippen Sie auf die Sterne' : ['', 'Schlecht', 'Geht so', 'Gut', 'Sehr gut', 'Ausgezeichnet'][rating]}
                </div>
              </div>

              {/* Sub Ratings */}
              <div style={{
                background: '#252118', borderRadius: '16px', padding: '20px',
                border: '1px solid rgba(201,150,60,0.12)',
              }}>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#DBA84A', marginBottom: '12px' }}>Details (optional)</div>
                
                <div style={subRatingStyle}>
                  <span style={{ fontSize: '14px', color: '#F5F0E8' }}>⏰ Pünktlichkeit</span>
                  <StarRating value={puenktlichkeit} onChange={setPuenktlichkeit} size={22} />
                </div>
                <div style={subRatingStyle}>
                  <span style={{ fontSize: '14px', color: '#F5F0E8' }}>😊 Freundlichkeit</span>
                  <StarRating value={freundlichkeit} onChange={setFreundlichkeit} size={22} />
                </div>
                <div style={{ ...subRatingStyle, borderBottom: 'none' }}>
                  <span style={{ fontSize: '14px', color: '#F5F0E8' }}>🚗 Fahrzeug</span>
                  <StarRating value={fahrzeugZustand} onChange={setFahrzeugZustand} size={22} />
                </div>
              </div>

              {/* Comment */}
              <div style={{
                background: '#252118', borderRadius: '16px', padding: '20px',
                border: '1px solid rgba(201,150,60,0.12)',
              }}>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#DBA84A', marginBottom: '12px' }}>Kommentar (optional)</div>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Beschreiben Sie Ihre Erfahrung..."
                  rows={3}
                  style={{
                    width: '100%', padding: '14px', background: '#1A1612',
                    border: '1.5px solid rgba(201,150,60,0.15)', borderRadius: '12px',
                    color: '#F5F0E8', fontSize: '14px', outline: 'none',
                    fontFamily: 'inherit', resize: 'none',
                  }}
                />
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.2)',
                  borderRadius: '12px', padding: '12px', color: '#ff5050',
                  fontSize: '13px', textAlign: 'center',
                }}>{error}</div>
              )}

              {/* Submit */}
              <button onClick={handleSubmit} disabled={submitting || rating === 0} style={{
                width: '100%', padding: '16px', borderRadius: '14px',
                background: rating > 0 ? 'linear-gradient(135deg, #C9963C, #DBA84A)' : '#252118',
                border: 'none', color: rating > 0 ? '#1A1612' : 'rgba(245,240,232,0.3)',
                fontSize: '16px', fontWeight: '700', cursor: rating > 0 ? 'pointer' : 'default',
                opacity: submitting ? 0.6 : 1,
              }}>
                {submitting ? 'Wird gesendet...' : 'Bewertung abgeben'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
