'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate, statusMeta, daysUntil, PARTNER_TYPE,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger'
const log = logger.child('admin:partners')

interface Visit {
  id: string
  visit_date: string | null
  visited_by: string | null
  notes: string | null
  next_visit: string | null
}

interface PartnerRow {
  id: string
  name: string
  type: string
  city: string | null
  contact_person: string | null
  phone: string | null
  email: string | null
  last_visit: string | null
  next_visit: string | null
  status: string
  visits: Visit[]
  nextDays: number | null
}

export default function AdminPartnersPage() {
  const [rows, setRows] = useState<PartnerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const [pRes, vRes] = await Promise.all([
          supabase.from('cooperation_partners').select('*').order('name'),
          supabase.from('partner_visits').select('*').order('visit_date', { ascending: false }),
        ])
        const visitsByPartner = new Map<string, Visit[]>()
        ;(vRes.data || []).forEach((v: any) => {
          const arr = visitsByPartner.get(v.partner_id) || []
          arr.push({ id: v.id, visit_date: v.visit_date, visited_by: v.visited_by, notes: v.notes, next_visit: v.next_visit })
          visitsByPartner.set(v.partner_id, arr)
        })

        setRows((pRes.data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          type: p.type || 'sonstige',
          city: p.city,
          contact_person: p.contact_person,
          phone: p.phone,
          email: p.email,
          last_visit: p.last_visit,
          next_visit: p.next_visit,
          status: p.status || 'active',
          visits: visitsByPartner.get(p.id) || [],
          nextDays: daysUntil(p.next_visit),
        })))
      } catch (err) {
        log.errorWithException('Partners load error', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const dueSoon = useMemo(() => rows.filter(r => r.nextDays != null && r.nextDays >= 0 && r.nextDays <= 7), [rows])
  const overdue = useMemo(() => rows.filter(r => r.nextDays != null && r.nextDays < 0), [rows])

  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {}
    rows.forEach(r => { m[r.type] = (m[r.type] || 0) + 1 })
    return m
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q) || (r.city || '').toLowerCase().includes(q) || (r.contact_person || '').toLowerCase().includes(q)
    })
  }, [rows, typeFilter, search])

  const availableTypes = Object.keys(typeCounts)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Kooperationspartner</h1>
          <p className="admin-subtitle">{rows.length} Partner · {dueSoon.length} Besuche diese Woche fällig</p>
        </div>
      </div>

      {(overdue.length > 0 || dueSoon.length > 0) && (
        <Banner tone={overdue.length > 0 ? 'danger' : 'warn'}>
          {overdue.length > 0 && `❌ ${overdue.length} überfällige(r) Besuchstermin(e). `}
          {dueSoon.length > 0 && `📅 ${dueSoon.length} Besuch(e) in den nächsten 7 Tagen.`}
        </Banner>
      )}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Partner, Ort, Ansprechpartner…" />
      </div>

      <div className="admin-filters">
        <button className={`admin-filter-btn ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => setTypeFilter('all')}>
          Alle ({rows.length})
        </button>
        {availableTypes.map(t => (
          <button key={t} className={`admin-filter-btn ${typeFilter === t ? 'active' : ''}`} onClick={() => setTypeFilter(t)}>
            {statusMeta(PARTNER_TYPE, t).label} ({typeCounts[t]})
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Partner</th><th>Typ</th><th>Ort</th><th>Ansprechpartner</th>
                <th>Letzter Besuch</th><th>Nächster Termin</th><th>Besuche</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={7}>{search || typeFilter !== 'all' ? 'Keine Treffer' : 'Noch keine Partner erfasst'}</EmptyRow>
              ) : filtered.map(p => {
                const tm = statusMeta(PARTNER_TYPE, p.type)
                const isOpen = expanded === p.id
                const nextColor = p.nextDays == null ? 'var(--ink3)' : p.nextDays < 0 ? '#D04B3B' : p.nextDays <= 7 ? '#E8A000' : 'var(--ink2)'
                return (
                  <Fragment key={p.id}>
                    <tr onClick={() => setExpanded(isOpen ? null : p.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td><StatusBadge label={tm.label} color={tm.color} /></td>
                      <td style={{ fontSize: 13 }}>{p.city || '—'}</td>
                      <td style={{ fontSize: 13 }}>{p.contact_person || '—'}</td>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(p.last_visit)}</td>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap', color: nextColor, fontWeight: p.nextDays != null && p.nextDays <= 7 ? 600 : 400 }}>
                        {p.next_visit ? formatDate(p.next_visit) : '—'}
                        {p.nextDays != null && p.nextDays >= 0 && p.nextDays <= 7 && <span style={{ fontSize: 11 }}> · in {p.nextDays}T</span>}
                        {p.nextDays != null && p.nextDays < 0 && <span style={{ fontSize: 11 }}> · überfällig</span>}
                      </td>
                      <td style={{ fontSize: 13 }}>{p.visits.length}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--coal3)', padding: 16 }}>
                          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
                            {p.phone && <span style={{ color: 'var(--ink3)' }}>📞 {p.phone}</span>}
                            {p.email && <span style={{ color: 'var(--ink3)' }}>✉️ {p.email}</span>}
                          </div>
                          <strong style={{ fontSize: 13, color: 'var(--ink3)' }}>Besuchshistorie</strong>
                          {p.visits.length === 0 ? (
                            <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '8px 0 0' }}>Noch keine Besuche dokumentiert.</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                              {p.visits.map(v => (
                                <div key={v.id} style={{ fontSize: 13, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--gold2)' }}>{formatDate(v.visit_date)}</span>
                                    {v.visited_by && <span style={{ color: 'var(--ink4)' }}>durch {v.visited_by}</span>}
                                    {v.next_visit && <span style={{ color: 'var(--ink4)' }}>· nächster: {formatDate(v.next_visit)}</span>}
                                  </div>
                                  {v.notes && <div style={{ color: 'var(--ink2)', marginTop: 2 }}>{v.notes}</div>}
                                </div>
                              ))}
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
