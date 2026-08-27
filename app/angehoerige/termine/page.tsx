'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { requireUser } from '@/lib/supabase/require-session'
import { IconCalendar, IconClock, IconShield } from '@/components/Icons'

// Die Termine kommen aus den Einsätzen (assignments), nicht mehr aus
// `bookings` — Begründung in lib/angehoerige/termine.ts. Deshalb hier
// die Feldnamen und Statuswerte der Einsatzplanung.
interface Termin {
  id: string
  client_id: string
  client_name: string
  datum: string | null
  von: string | null
  bis: string | null
  leistungsart: string | null
  status: string | null
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: 'Geplant', color: 'var(--gold2)' },
  GEPLANT: { label: 'Geplant', color: 'var(--gold2)' },
  BESTAETIGT: { label: 'Bestätigt', color: 'var(--green)' },
  UNTERWEGS: { label: 'Unterwegs', color: 'var(--green)' },
  GESTARTET: { label: 'Läuft', color: 'var(--green)' },
  BEENDET: { label: 'Abgeschlossen', color: 'var(--ink4)' },
  STORNIERT: { label: 'Storniert', color: 'var(--red-w)' },
  cancelled: { label: 'Storniert', color: 'var(--red-w)' },
  NO_SHOW: { label: 'Nicht angetroffen', color: 'var(--red-w)' },
}

/** Dauer in Minuten aus zwei Uhrzeiten — über Mitternacht hinaus. */
function dauerMinuten(von: string | null, bis: string | null): number | null {
  const zuMinuten = (t: string | null) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '')
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  const a = zuMinuten(von)
  const b = zuMinuten(bis)
  if (a === null || b === null) return null
  return b > a ? b - a : b + 24 * 60 - a
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
    // Ohne Datum lässt sich nicht einordnen, ob der Termin ansteht —
    // er erscheint deshalb nur unter „Alle" statt in einem der beiden
    // Zeitfilter zu verschwinden.
    if (!t.datum) return filter === 'alle'
    if (filter === 'kommend') return t.datum >= today
    if (filter === 'vergangen') return t.datum < today
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
            const s = STATUS_MAP[termin.status ?? ''] || { label: termin.status ?? 'Unbekannt', color: 'var(--ink4)' }
            const dauer = dauerMinuten(termin.von, termin.bis)
            return (
              <div key={termin.id} className="portal-list-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                      {termin.leistungsart || 'Einsatz'}
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
                    {termin.datum
                      ? new Date(termin.datum).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
                      : 'Ohne Datum'}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <IconClock size={14} />
                    {termin.von ? `${termin.von.slice(0, 5)} Uhr` : 'Zeit offen'}
                    {dauer !== null ? ` (${Math.floor(dauer / 60)}:${String(dauer % 60).padStart(2, '0')} Std.)` : ''}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
