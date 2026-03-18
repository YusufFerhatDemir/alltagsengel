'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function StarRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
      <span style={{ fontSize: 14, color: 'var(--ink2)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5].map(star => (
          <button key={star} onClick={() => onChange(star)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 2,
            fontSize: 26, color: star <= value ? '#DBA84A' : 'rgba(255,255,255,.12)',
            transition: 'transform .12s',
          }}>★</button>
        ))}
      </div>
    </div>
  )
}

export default function BewertungPage() {
  const router = useRouter()
  const params = useParams()
  const bookingId = params.id as string

  const [booking, setBooking] = useState<any>(null)
  const [angel, setAngel] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [alreadyRated, setAlreadyRated] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [rating, setRating] = useState(0)
  const [punctuality, setPunctuality] = useState(0)
  const [friendliness, setFriendliness] = useState(0)
  const [reliability, setReliability] = useState(0)
  const [comment, setComment] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      // Load booking with angel info
      const { data: b, error: bErr } = await supabase
        .from('bookings')
        .select('*, angels:angel_id(id, rating, profiles:id(first_name, last_name, avatar_color))')
        .eq('id', bookingId)
        .single()

      if (bErr || !b) { setError('Buchung nicht gefunden'); setLoading(false); return }
      setBooking(b)

      const angelData = b.angels as any
      const prof = angelData?.profiles
        ? (Array.isArray(angelData.profiles) ? angelData.profiles[0] : angelData.profiles)
        : null
      setAngel({ ...angelData, profile: prof })

      // Check if already reviewed
      const { data: existing } = await supabase
        .from('angel_reviews')
        .select('id, rating, punctuality, friendliness, reliability, comment')
        .eq('booking_id', bookingId)
        .maybeSingle()

      if (existing) {
        setAlreadyRated(true)
        setRating(existing.rating)
        setPunctuality(existing.punctuality || 0)
        setFriendliness(existing.friendliness || 0)
        setReliability(existing.reliability || 0)
        setComment(existing.comment || '')
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden')
    }
    setLoading(false)
  }

  async function handleSubmit() {
    if (!rating) { setError('Bitte vergib mindestens eine Gesamtbewertung'); return }
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          angelId: (booking.angels as any)?.id || booking.angel_id,
          rating,
          punctuality: punctuality || null,
          friendliness: friendliness || null,
          reliability: reliability || null,
          comment,
        }),
      })

      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Fehler beim Speichern'); setSubmitting(false); return }

      setSuccess(true)
      setTimeout(() => router.push('/kunde/buchungen'), 2000)
    } catch {
      setError('Netzwerkfehler')
    }
    setSubmitting(false)
  }

  if (loading) return (
    <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: '3px solid rgba(201,150,60,.2)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error && !booking) return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <p style={{ color: 'var(--ink3)', fontSize: 14, marginBottom: 16 }}>{error}</p>
      <button onClick={() => router.push('/kunde/buchungen')} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,var(--gold),var(--gold2))', color: 'var(--coal)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Zurück</button>
    </div>
  )

  if (success) return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>⭐</div>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--gold)', marginBottom: 8 }}>Vielen Dank!</h2>
      <p style={{ fontSize: 14, color: 'var(--ink3)' }}>Deine Bewertung hilft anderen Kunden bei der Auswahl.</p>
    </div>
  )

  const angelName = angel?.profile?.first_name || 'Engel'

  return (
    <div className="screen" style={{ padding: '0 20px 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0 20px' }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: 22, cursor: 'pointer' }}>←</button>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>Bewertung</h1>
      </div>

      {/* Angel info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: angel?.profile?.avatar_color || 'var(--gold-pale)', fontSize: 26,
        }}>😇</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{angelName}</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
            {booking.service || 'Alltagsbegleitung'} • {new Date(booking.date).toLocaleDateString('de-DE')}
          </div>
        </div>
      </div>

      {alreadyRated && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--gold-pale)', marginBottom: 20 }}>
          <span style={{ fontSize: 13, color: 'var(--gold)' }}>✓ Du hast diese Buchung bereits bewertet</span>
        </div>
      )}

      {/* Gesamtbewertung */}
      <div className="form-card">
        <div className="form-card-h">Gesamtbewertung *</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '8px 0 4px' }}>
          {[1, 2, 3, 4, 5].map(star => (
            <button key={star} onClick={() => !alreadyRated && setRating(star)} style={{
              background: 'none', border: 'none', cursor: alreadyRated ? 'default' : 'pointer', padding: 4,
              fontSize: 38, color: star <= rating ? '#DBA84A' : 'rgba(255,255,255,.1)',
              transition: 'transform .15s, color .15s',
              transform: star <= rating ? 'scale(1.1)' : 'scale(1)',
            }}>★</button>
          ))}
        </div>
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink3)', marginTop: 4 }}>
          {rating === 0 ? 'Tippe auf die Sterne' : rating === 1 ? 'Mangelhaft' : rating === 2 ? 'Ausreichend' : rating === 3 ? 'Befriedigend' : rating === 4 ? 'Gut' : 'Ausgezeichnet'}
        </div>
      </div>

      {/* Detail-Bewertungen */}
      <div className="form-card">
        <div className="form-card-h">Detailbewertung (optional)</div>
        <StarRow label="Pünktlichkeit" value={punctuality} onChange={v => !alreadyRated && setPunctuality(v)} />
        <StarRow label="Freundlichkeit" value={friendliness} onChange={v => !alreadyRated && setFriendliness(v)} />
        <StarRow label="Zuverlässigkeit" value={reliability} onChange={v => !alreadyRated && setReliability(v)} />
      </div>

      {/* Kommentar */}
      <div className="form-card">
        <div className="form-card-h">Kommentar (optional)</div>
        <textarea
          value={comment}
          onChange={e => !alreadyRated && setComment(e.target.value)}
          placeholder="Erzähle anderen Kunden von deiner Erfahrung..."
          readOnly={alreadyRated}
          rows={4}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--border)',
            background: 'var(--cream)', color: 'var(--ink)', fontSize: 14, fontFamily: "'Jost', sans-serif",
            resize: 'vertical', outline: 'none',
          }}
        />
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(208,75,59,.12)', marginBottom: 14 }}>
          <span style={{ fontSize: 13, color: 'var(--red-w)' }}>{error}</span>
        </div>
      )}

      {/* Submit */}
      {!alreadyRated && (
        <button
          onClick={handleSubmit}
          disabled={submitting || rating === 0}
          style={{
            width: '100%', padding: '16px 0', borderRadius: 14, border: 'none',
            background: rating > 0 ? 'linear-gradient(135deg, var(--gold), var(--gold2))' : 'var(--coal3)',
            color: rating > 0 ? 'var(--coal)' : 'var(--ink5)',
            fontSize: 15, fontWeight: 600, cursor: rating > 0 ? 'pointer' : 'default',
            fontFamily: "'Jost', sans-serif", marginTop: 8,
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Wird gespeichert...' : 'Bewertung abgeben'}
        </button>
      )}
    </div>
  )
}
