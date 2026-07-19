'use client'
import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import { euro, formatDate, formatTime, fullName } from '@/lib/admin/ops'
import { budgetTypeLabel, serviceTypeLabel, fmtDuration, MONTH_NAMES } from '@/lib/kunde/leistungen'

interface RecordRow {
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  service_type: string | null
  budget_type: string | null
  amount: number | null
  status: string
  caregiver_initials: string | null
  client_signature: string | null
  caregiver: { first_name?: string | null; last_name?: string | null } | null
}

function isSigned(r: RecordRow): boolean {
  return !!r.client_signature || r.status === 'signed' || r.status === 'invoiced'
}

function caregiverLabel(r: RecordRow): string {
  // Caregiver-Join kann durch RLS leer sein → Kürzel als Fallback
  const name = fullName(r.caregiver)
  if (name !== '—') return name
  if (r.caregiver_initials) return `Betreuungskraft ${r.caregiver_initials}`
  return 'Betreuungskraft'
}

export default function KundeLeistungsnachweisPage() {
  const router = useRouter()
  const [records, setRecords] = useState<RecordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState<number | 'all'>(now.getMonth()) // 0-basiert

  const load = async () => {
    setError('')
    setLoading(true)
    try {
      const user = await requireUser(router, { redirectTo: '/kunde/leistungsnachweis' })
      if (!user) return
      const supabase = createClient()

      // RLS liefert nur die eigenen Einsätze (clients.user_id = auth.uid()).
      // Entwürfe der Betreuungskraft werden nicht angezeigt.
      const { data, error: recErr } = await supabase
        .from('service_records')
        .select('id, date, start_time, end_time, duration_minutes, service_type, budget_type, amount, status, caregiver_initials, client_signature, caregiver:caregivers(first_name, last_name)')
        .neq('status', 'draft')
        .order('date', { ascending: false })
        .limit(500)

      if (recErr) throw new Error('Leistungsnachweise konnten nicht geladen werden')
      setRecords((data || []).map((r: any) => ({
        ...r,
        caregiver: Array.isArray(r.caregiver) ? r.caregiver[0] || null : r.caregiver,
      })))
    } catch (err: any) {
      setError(err?.message || 'Ein Fehler beim Laden der Leistungsnachweise ist aufgetreten')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Verfügbare Jahre aus den Daten (aktuelles Jahr immer wählbar)
  const years = useMemo(() => {
    const set = new Set<number>([now.getFullYear()])
    for (const r of records) set.add(new Date(r.date).getFullYear())
    return Array.from(set).sort((a, b) => b - a)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records])

  // Nach Jahr/Monat filtern und je Monat gruppieren
  const grouped = useMemo(() => {
    const filtered = records.filter(r => {
      const d = new Date(r.date)
      if (d.getFullYear() !== year) return false
      if (month !== 'all' && d.getMonth() !== month) return false
      return true
    })
    const map = new Map<number, RecordRow[]>()
    for (const r of filtered) {
      const m = new Date(r.date).getMonth()
      if (!map.has(m)) map.set(m, [])
      map.get(m)!.push(r)
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]) // neuester Monat zuerst
  }, [records, year, month])

  if (error && !loading) return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <p style={{ color: 'var(--ink3)', fontSize: 14, marginBottom: 16 }}>{error}</p>
      <button onClick={() => { setError(''); load() }} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,var(--gold),var(--gold2))', color: 'var(--coal)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Erneut versuchen</button>
    </div>
  )

  const selectStyle: CSSProperties = {
    padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
    background: 'var(--white)', color: 'var(--ink)', fontSize: 13, outline: 'none',
  }

  return (
    <div className="screen" id="kunde-leistungsnachweis">
      <div className="topbar" style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/kunde/home" className="back-btn" style={{ textDecoration: 'none' }}>‹</Link>
        <div className="topbar-title">Leistungsnachweis</div>
      </div>

      <div style={{ padding: '0 20px' }}>
        {/* Filter Monat/Jahr */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <select value={month === 'all' ? 'all' : String(month)} onChange={e => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))} style={{ ...selectStyle, flex: 1 }}>
            <option value="all">Alle Monate</option>
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>
          <select value={year} onChange={e => { setYear(Number(e.target.value)) }} style={selectStyle}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="chat-empty">Laden...</div>
        ) : grouped.length === 0 ? (
          <div className="chat-empty" style={{ paddingTop: 50 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
            <div className="chat-empty-title">Keine Einsätze</div>
            <div className="chat-empty-sub">
              {month === 'all'
                ? `Für ${year} liegen noch keine Leistungsnachweise vor.`
                : `Für ${MONTH_NAMES[month as number]} ${year} liegen keine Leistungsnachweise vor.`}
            </div>
          </div>
        ) : (
          grouped.map(([m, monthRecords]) => {
            // Monatssummen je Budgettopf
            const totals = new Map<string, { amount: number; minutes: number }>()
            for (const r of monthRecords) {
              const key = r.budget_type || 'private'
              const t = totals.get(key) || { amount: 0, minutes: 0 }
              t.amount += Number(r.amount) || 0
              t.minutes += r.duration_minutes || 0
              totals.set(key, t)
            }
            const monthTotal = monthRecords.reduce((s, r) => s + (Number(r.amount) || 0), 0)

            return (
              <div key={m} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, padding: '0 2px' }}>
                  <div className="section-label" style={{ margin: 0 }}>{MONTH_NAMES[m]} {year}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink4)' }}>{monthRecords.length} Einsätze · <span style={{ color: 'var(--gold2)', fontWeight: 700 }}>{euro(monthTotal)}</span></div>
                </div>

                {monthRecords.map(r => {
                  const signed = isSigned(r)
                  return (
                    <div key={r.id} style={{
                      background: 'var(--white)', borderRadius: 14, padding: 14,
                      border: '1px solid var(--border)', marginBottom: 8,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                            {serviceTypeLabel(r.service_type)}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 3 }}>
                            {formatDate(r.date)}
                            {r.start_time && ` · ${formatTime(r.start_time)}–${formatTime(r.end_time)} Uhr`}
                            {r.duration_minutes ? ` · ${fmtDuration(r.duration_minutes)}` : ''}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 2 }}>
                            {caregiverLabel(r)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{euro(Number(r.amount) || 0)}</div>
                          <span style={{
                            display: 'inline-block', marginTop: 6, padding: '2px 8px',
                            borderRadius: 20, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                            color: signed ? 'var(--green)' : '#E8A000',
                            background: signed ? 'rgba(92,184,130,.12)' : 'rgba(232,160,0,.12)',
                            border: signed ? '1px solid rgba(92,184,130,.3)' : '1px solid rgba(232,160,0,.3)',
                          }}>
                            {signed ? '✓ Unterschrieben' : 'Ohne Unterschrift'}
                          </span>
                        </div>
                      </div>
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--gold2)' }}>
                        {budgetTypeLabel(r.budget_type)}
                      </div>
                    </div>
                  )
                })}

                {/* Monatssummen je Budgettopf */}
                <div style={{
                  background: 'var(--gold-pale)', borderRadius: 12, padding: '10px 14px',
                  border: '1px solid rgba(201,150,60,.2)',
                }}>
                  {Array.from(totals.entries()).map(([type, t]) => (
                    <div key={type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                      <span style={{ color: 'var(--ink3)' }}>{budgetTypeLabel(type)}{t.minutes > 0 ? ` (${fmtDuration(t.minutes)})` : ''}</span>
                      <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{euro(t.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
        <div style={{ height: 90 }}></div>
      </div>
    </div>
  )
}
