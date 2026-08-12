'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { statusMeta, formatDate, WF_EVENT_STATUS, WF_MODUL, WF_EVENT_PRIORITAET } from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow } from '@/components/admin/OpsUI'

interface EventRow {
  id: string
  event_typ: string
  modul: string
  quell_tabelle: string
  status: string
  prioritaet: string
  retry_count: number
  ausgeloest_am: string | null
  fehler_nachricht: string | null
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal2)', color: 'var(--ink)', fontSize: 13, fontFamily: 'inherit',
}

export default function WorkflowEventsPage() {
  const [rows, setRows] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterModul, setFilterModul] = useState('all')

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams()
        if (filterStatus !== 'all') params.set('status', filterStatus)
        if (filterModul !== 'all') params.set('modul', filterModul)
        const res = await fetch(`/api/ops/workflow/events?${params.toString()}`)
        if (!res.ok) { setLoading(false); return }
        const data = await res.json()
        setRows(data)
      } catch { /* ignore */ } finally { setLoading(false) }
    }
    setLoading(true)
    load()
  }, [filterStatus, filterModul])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.event_typ.toLowerCase().includes(q) || r.quell_tabelle.toLowerCase().includes(q))
  }, [rows, search])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Workflow-Events</h1>
          <p className="admin-subtitle">{rows.length} Events</p>
        </div>
        <Link href="/admin/workflow" style={{ fontSize: 13, color: 'var(--gold)' }}>← Dashboard</Link>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Event-Typ, Quelltabelle..." />
        <select style={selectStyle} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">Alle Status</option>
          {Object.entries(WF_EVENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select style={selectStyle} value={filterModul} onChange={e => setFilterModul(e.target.value)}>
          <option value="all">Alle Module</option>
          {Object.entries(WF_MODUL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? <p>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Event-Typ</th><th>Modul</th><th>Quelle</th><th>Status</th><th>Priorität</th><th>Retries</th><th>Ausgelöst</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={7}>Keine Events</EmptyRow>
              ) : filtered.map(e => {
                const st = statusMeta(WF_EVENT_STATUS, e.status)
                const mod = statusMeta(WF_MODUL, e.modul)
                const prio = statusMeta(WF_EVENT_PRIORITAET, e.prioritaet)
                return (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/admin/workflow/events/${e.id}`} style={{ color: 'var(--gold)', fontWeight: 600, textDecoration: 'none' }}>
                        {e.event_typ}
                      </Link>
                    </td>
                    <td><StatusBadge label={mod.label} color={mod.color} /></td>
                    <td style={{ fontSize: 13, color: 'var(--ink4)' }}>{e.quell_tabelle}</td>
                    <td><StatusBadge label={st.label} color={st.color} /></td>
                    <td><StatusBadge label={prio.label} color={prio.color} /></td>
                    <td style={{ textAlign: 'center' }}>{e.retry_count}</td>
                    <td style={{ fontSize: 13, color: 'var(--ink4)' }}>{formatDate(e.ausgeloest_am)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
