'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { requireUser } from '@/lib/supabase/require-session'
import { IconCalendar, IconClock, IconShield } from '@/components/Icons'

interface Termin {
  id: string
  service: string
  date: string
  time: string
  duration_hours: number
  status: string
  notes: string
  client_name: string
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ausstehend', color: 'var(--gold2)' },
  accepted: { label: 'Bestätigt', color: 'var(--green)' },
  completed: { label: 'Abgeschlossen', color: 'var(--ink4)' },
  cancelled: { label: 'Storniert', color: 'var(--red-w)' },
  declined: { label: 'Abgelehnt', color: 'var(--red-w)' },
}

export default function TerminePage() {
  const router = useRouter()
  const [termine, setTermine] = useState<Termin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'alle' | 'kommend' | 'vergangen'>('kommend')

  async function load() {
    setError('')
    setLoading(true)
    try {
      const user = await requireUser(router, { redirectTo: '/angehoerige/termine' })
      if (!user) return

      const res = await fetch('/api/angehoerige/portal/termine')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Termine konnten nicht geladen werden.')
      }
      const data = await res.json()
      setTermine(data.termine ?? [])
    } catch (err: any) {
      setError(err?.message || 'Ein Fehler ist aufgetreten.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const today = new Date().toISOString().split('T')[0]
  const filtered = termine.filter(t => {
    if (filter === 'kommend') return t.date >= today
    if (filter === 'vergangen') return t.date < today
    return true
  })

  if (loading) {
    return (
      <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="gold-spinner" />
          <p style={{ color: 'var(--ink4)', fontSize: 13, marginTop: 16 }}>Termine werden geladen...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
        <IconShield size={48} color="var(--gold)" />
        <p style={{ color: 'var(--ink4)', fontSize: 14, marginTop: 12 }}>{error}</p>
        <button
          onClick={() => { setError(''); load() }}
          style={{ marginTop: 16, padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,var(--gold),var(--gold2))', color: 'var(--coal)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Erneut versuchen
        </button>
      </div>
    )
  }

  return (
    <div className="screen">
      <div style={{ padding: '24px 20px 16px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Termine</h1>
        <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '4px 0 0' }}>
          Termine und Buchungen Ihrer Angehörigen
        </p>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, padding: '0 20px 16px' }}>
        {(['kommend', 'vergangen', 'alle'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: 8, border: 'none',
              background: filter === f ? 'linear-gradient(135deg,var(--gold),var(--gold2))' : 'rgba(255,255,255,0.06)',
              color: filter === f ? 'var(--coal)' : 'var(--ink3)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {f === 'kommend' ? 'Kommend' : f === 'vergangen' ? 'Vergangen' : 'Alle'}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 20px 100px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <IconCalendar size={48} color="var(--ink4)" />
            <p style={{ color: 'var(--ink4)', fontSize: 14, marginTop: 12 }}>
              {filter === 'kommend' ? 'Keine kommenden Termine vorhanden.' :
                filter === 'vergangen' ? 'Keine vergangenen Termine vorhanden.' :
                  'Keine Termine vorhanden.'}
            </p>
          </div>
        ) : (
          filtered.map(termin => {
            const s = STATUS_MAP[termin.status] || { label: termin.status, color: 'var(--ink4)' }
            return (
              <div key={termin.id} className="portal-list-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                      {termin.service || 'Alltagsbegleitung'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 2 }}>
                      {termin.client_name}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 6,
                    background: `${s.color}18`, color: s.color, fontWeight: 600,
                  }}>
                    {s.label}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--ink3)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <IconCalendar size={14} />
                    {new Date(termin.date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <IconClock size={14} />
                    {termin.time?.slice(0, 5)} Uhr
                    {termin.duration_hours ? ` (${termin.duration_hours} Std.)` : ''}
                  </span>
                </div>

                {termin.notes && (
                  <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 8, fontStyle: 'italic' }}>
                    {termin.notes}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
