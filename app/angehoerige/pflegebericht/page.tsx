'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { requireUser } from '@/lib/supabase/require-session'
import { IconClipboard, IconClock, IconShield } from '@/components/Icons'

interface Bericht {
  id: string
  client_id: string
  client_name: string
  date: string
  start_time: string
  end_time: string
  duration_minutes: number
  service_type: string
  budget_type: string
  /** Nur gefüllt, wenn der Bereich „Pflegeberichte" freigegeben ist. */
  notes: string | null
  /** Server-Auskunft, ob der Freitext freigegeben ist. */
  bericht_freigegeben: boolean
  status: string
  created_at: string
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'Entwurf', color: 'var(--ink4)' },
  signed: { label: 'Unterschrieben', color: 'var(--green)' },
  completed: { label: 'Abgeschlossen', color: 'var(--green)' },
  submitted: { label: 'Eingereicht', color: 'var(--gold2)' },
  billed: { label: 'Abgerechnet', color: 'var(--green)' },
}

const BUDGET_LABEL: Record<string, string> = {
  'entlastung': 'Entlastungsbetrag (§45b)',
  'verhinderungspflege': 'Verhinderungspflege (§39)',
  'privat': 'Privatrechnung',
  'sachleistung': 'Sachleistung (§36)',
}

export default function PflegeberichtPage() {
  const router = useRouter()
  const [berichte, setBerichte] = useState<Bericht[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function load() {
    setError('')
    setLoading(true)
    try {
      const user = await requireUser(router, { redirectTo: '/angehoerige/pflegebericht' })
      if (!user) return

      const res = await fetch('/api/angehoerige/portal/pflegebericht')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Berichte konnten nicht geladen werden.')
      }
      const data = await res.json()
      setBerichte(data.berichte ?? [])
    } catch (err: any) {
      setError(err?.message || 'Ein Fehler ist aufgetreten.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="gold-spinner" />
          <p style={{ color: 'var(--ink4)', fontSize: 13, marginTop: 16 }}>Berichte werden geladen...</p>
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

  // Nach Monat gruppieren
  const grouped = berichte.reduce<Record<string, Bericht[]>>((acc, b) => {
    const d = new Date(b.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!acc[key]) acc[key] = []
    acc[key].push(b)
    return acc
  }, {})

  const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="screen">
      <div style={{ padding: '24px 20px 16px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Pflegeberichte</h1>
        <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '4px 0 0' }}>
          Leistungsnachweise und Dokumentation
        </p>
      </div>

      <div style={{ padding: '0 20px 100px' }}>
        {berichte.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <IconClipboard size={48} color="var(--ink4)" />
            <p style={{ color: 'var(--ink4)', fontSize: 14, marginTop: 12 }}>
              Noch keine Berichte vorhanden.
            </p>
          </div>
        ) : (
          months.map(month => {
            const [y, m] = month.split('-')
            const monthLabel = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
            const items = grouped[month]
            const totalMinutes = items.reduce((sum, b) => sum + (b.duration_minutes || 0), 0)
            const totalHours = Math.floor(totalMinutes / 60)
            const restMinutes = totalMinutes % 60

            return (
              <div key={month} style={{ marginBottom: 24 }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 12,
                }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                    {monthLabel}
                  </h3>
                  <span style={{ fontSize: 12, color: 'var(--ink4)' }}>
                    {items.length} Einträge • {totalHours}h {restMinutes > 0 ? `${restMinutes}min` : ''}
                  </span>
                </div>

                {items.map(bericht => {
                  const s = STATUS_MAP[bericht.status] || { label: bericht.status || 'Offen', color: 'var(--ink4)' }
                  const isExpanded = expandedId === bericht.id

                  return (
                    <div role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (() => setExpandedId(isExpanded ? null : bericht.id))() } }}
                      key={bericht.id}
                      className="portal-list-item"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedId(isExpanded ? null : bericht.id)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                            {bericht.service_type || 'Leistung'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 2 }}>
                            {bericht.client_name} • {new Date(bericht.date).toLocaleDateString('de-DE')}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 11, padding: '3px 8px', borderRadius: 6,
                          background: `${s.color}18`, color: s.color, fontWeight: 600,
                        }}>
                          {s.label}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--ink3)', marginTop: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <IconClock size={12} />
                          {bericht.start_time?.slice(0, 5)} – {bericht.end_time?.slice(0, 5)}
                        </span>
                        <span>{bericht.duration_minutes} Min.</span>
                        {bericht.budget_type && (
                          <span>{BUDGET_LABEL[bericht.budget_type] || bericht.budget_type}</span>
                        )}
                      </div>

                      {isExpanded && bericht.notes && (
                        <div style={{
                          marginTop: 12, padding: 12, borderRadius: 8,
                          background: 'rgba(255,255,255,0.03)', fontSize: 13,
                          color: 'var(--ink3)', lineHeight: 1.6,
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink4)', marginBottom: 4 }}>Anmerkungen:</div>
                          {bericht.notes}
                        </div>
                      )}

                      {isExpanded && !bericht.bericht_freigegeben && (
                        <div style={{
                          marginTop: 12, padding: 12, borderRadius: 8,
                          background: 'rgba(255,255,255,0.03)', fontSize: 12,
                          color: 'var(--ink4)', lineHeight: 1.6,
                        }}>
                          Für diesen Eintrag ist der Pflegebericht nicht freigegeben.
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
