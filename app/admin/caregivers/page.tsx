'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate, fullName, statusMeta, daysUntil,
  CAREGIVER_STATUS, QUALIFICATION_STATUS,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface Qualification {
  id: string
  qualification_type: string | null
  title: string | null
  issued_date: string | null
  valid_until: string | null
  ampel: 'valid' | 'expiring' | 'expired'
  daysLeft: number | null
}

interface CaregiverRow {
  id: string
  name: string
  initials: string | null
  phone: string | null
  email: string | null
  city: string | null
  has_drivers_license: boolean
  has_vehicle: boolean
  languages: string[]
  status: string
  emergency_pool: boolean
  qualifications: Qualification[]
  expiringCount: number
  expiredCount: number
}

function qualAmpel(validUntil: string | null): { ampel: Qualification['ampel']; daysLeft: number | null } {
  if (!validUntil) return { ampel: 'valid', daysLeft: null }
  const d = daysUntil(validUntil)
  if (d === null) return { ampel: 'valid', daysLeft: null }
  if (d < 0) return { ampel: 'expired', daysLeft: d }
  if (d <= 60) return { ampel: 'expiring', daysLeft: d }
  return { ampel: 'valid', daysLeft: d }
}

export default function AdminCaregiversPage() {
  const [rows, setRows] = useState<CaregiverRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const [cgRes, qualRes] = await Promise.all([
          supabase.from('caregivers').select('*').order('last_name'),
          supabase.from('caregiver_qualifications').select('*'),
        ])
        const qualsByCg = new Map<string, Qualification[]>()
        ;(qualRes.data || []).forEach((q: any) => {
          const { ampel, daysLeft } = qualAmpel(q.valid_until)
          const item: Qualification = {
            id: q.id, qualification_type: q.qualification_type, title: q.title,
            issued_date: q.issued_date, valid_until: q.valid_until, ampel, daysLeft,
          }
          const arr = qualsByCg.get(q.caregiver_id) || []
          arr.push(item)
          qualsByCg.set(q.caregiver_id, arr)
        })

        setRows((cgRes.data || []).map((c: any) => {
          const quals = (qualsByCg.get(c.id) || []).sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999))
          return {
            id: c.id,
            name: fullName(c),
            initials: c.initials,
            phone: c.phone,
            email: c.email,
            city: c.city,
            has_drivers_license: !!c.has_drivers_license,
            has_vehicle: !!c.has_vehicle,
            languages: Array.isArray(c.languages) ? c.languages : [],
            status: c.status || 'active',
            emergency_pool: !!c.emergency_pool,
            qualifications: quals,
            expiringCount: quals.filter(q => q.ampel === 'expiring').length,
            expiredCount: quals.filter(q => q.ampel === 'expired').length,
          }
        }))
      } catch (err) {
        console.error('Caregivers load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const totalExpiring = useMemo(() => rows.reduce((s, r) => s + r.expiringCount, 0), [rows])
  const totalExpired = useMemo(() => rows.reduce((s, r) => s + r.expiredCount, 0), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q) || (r.initials || '').toLowerCase().includes(q) ||
        r.languages.some(l => l.toLowerCase().includes(q)) || (r.city || '').toLowerCase().includes(q)
    })
  }, [rows, filter, search])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Betreuungskräfte</h1>
          <p className="admin-subtitle">{rows.length} Kräfte · {rows.filter(r => r.emergency_pool).length} im Notfall-Pool</p>
        </div>
      </div>

      {(totalExpired > 0 || totalExpiring > 0) && (
        <Banner tone={totalExpired > 0 ? 'danger' : 'warn'}>
          {totalExpired > 0 && `❌ ${totalExpired} Qualifikation(en) abgelaufen. `}
          {totalExpiring > 0 && `⏳ ${totalExpiring} Qualifikation(en) laufen in den nächsten 60 Tagen ab.`}
        </Banner>
      )}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Name, Handzeichen, Sprache, Ort…" />
      </div>

      <div className="admin-filters">
        {['all', 'active', 'available', 'busy', 'inactive', 'onboarding'].map(f => (
          <button key={f} className={`admin-filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Alle' : statusMeta(CAREGIVER_STATUS, f).label}
            {f !== 'all' && ` (${rows.filter(r => r.status === f).length})`}
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th><th>Handzeichen</th><th>Telefon</th><th>Ort</th>
                <th>Sprachen</th><th>Mobilität</th><th>Qualifikationen</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={8}>{search || filter !== 'all' ? 'Keine Treffer' : 'Noch keine Betreuungskräfte'}</EmptyRow>
              ) : filtered.map(c => {
                const sm = statusMeta(CAREGIVER_STATUS, c.status)
                const isOpen = expanded === c.id
                return (
                  <Fragment key={c.id}>
                    <tr onClick={() => setExpanded(isOpen ? null : c.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 600 }}>
                        {c.name}
                        {c.emergency_pool && <span title="Notfall-Pool" style={{ marginLeft: 6 }}>🚨</span>}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--gold2)', background: 'rgba(201,150,60,.1)', padding: '2px 8px', borderRadius: 6 }}>
                          {c.initials || '—'}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{c.phone || '—'}</td>
                      <td style={{ fontSize: 13 }}>{c.city || '—'}</td>
                      <td style={{ fontSize: 13 }}>{c.languages.length ? c.languages.join(', ') : '—'}</td>
                      <td style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
                        {c.has_drivers_license ? '🪪' : ''}{c.has_vehicle ? '🚗' : ''}{!c.has_drivers_license && !c.has_vehicle ? '—' : ''}
                      </td>
                      <td>
                        <span style={{ fontSize: 13 }}>{c.qualifications.length}</span>
                        {c.expiredCount > 0 && <span style={{ marginLeft: 6, color: '#D04B3B', fontSize: 12 }}>❌{c.expiredCount}</span>}
                        {c.expiringCount > 0 && <span style={{ marginLeft: 4, color: '#E8A000', fontSize: 12 }}>⏳{c.expiringCount}</span>}
                      </td>
                      <td><StatusBadge label={sm.label} color={sm.color} /></td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--coal3)', padding: 16 }}>
                          <strong style={{ fontSize: 13, color: 'var(--ink3)' }}>Qualifikationen</strong>
                          {c.qualifications.length === 0 ? (
                            <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '8px 0 0' }}>Keine Qualifikationen hinterlegt.</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                              {c.qualifications.map(q => {
                                const qm = statusMeta(QUALIFICATION_STATUS, q.ampel)
                                return (
                                  <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
                                    <StatusBadge label={qm.label} color={qm.color} />
                                    <span style={{ fontWeight: 600 }}>{q.title || q.qualification_type || 'Qualifikation'}</span>
                                    {q.valid_until && (
                                      <span style={{ color: 'var(--ink4)' }}>
                                        gültig bis {formatDate(q.valid_until)}
                                        {q.daysLeft != null && q.daysLeft >= 0 && q.daysLeft <= 60 && <span style={{ color: '#E8A000' }}> · noch {q.daysLeft} Tage</span>}
                                        {q.daysLeft != null && q.daysLeft < 0 && <span style={{ color: '#D04B3B' }}> · seit {Math.abs(q.daysLeft)} Tagen abgelaufen</span>}
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
