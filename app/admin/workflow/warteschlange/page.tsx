'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { statusMeta, formatDate, WF_QUEUE_STATUS } from '@/lib/admin/ops'
import { StatusBadge, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface QueueRow {
  id: string
  status: string
  versuch: number
  max_versuche: number
  naechster_versuch: string | null
  fehler_nachricht: string | null
  prioritaet: number
  event_typ: string
  modul: string
  regel_name: string
  aktion_typ: string
  created_at: string
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit',
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal2)', color: 'var(--ink)', fontSize: 13, fontFamily: 'inherit',
}

export default function WorkflowWarteschlangePage() {
  const [rows, setRows] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState('all')

  async function load() {
    try {
      const params = new URLSearchParams()
      if (filterStatus !== 'all') params.set('status', filterStatus)
      const res = await fetch(`/api/ops/workflow/warteschlange?${params.toString()}`)
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setRows(data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { setLoading(true); load() }, [filterStatus])

  async function retry(id: string) {
    try {
      const res = await fetch(`/api/ops/workflow/warteschlange/${id}/retry`, { method: 'POST' })
      if (!res.ok) { setError('Fehler beim Wiederholen'); return }
      await load()
    } catch { setError('Netzwerkfehler') }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Warteschlange</h1>
          <p className="admin-subtitle">{rows.length} Einträge</p>
        </div>
        <Link href="/admin/workflow" style={{ fontSize: 13, color: 'var(--gold)' }}>← Dashboard</Link>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ marginBottom: 16 }}>
        <select style={selectStyle} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">Alle Status</option>
          {Object.entries(WF_QUEUE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? <p>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Regel</th><th>Aktion</th><th>Event-Typ</th><th>Status</th><th>Versuch</th><th>Nächster Versuch</th><th>Fehler</th><th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8}>Warteschlange ist leer</EmptyRow>
              ) : rows.map(q => {
                const st = statusMeta(WF_QUEUE_STATUS, q.status)
                const retryable = q.status === 'fehlgeschlagen' || q.status === 'dead_letter'
                return (
                  <tr key={q.id}>
                    <td style={{ fontWeight: 600 }}>{q.regel_name}</td>
                    <td style={{ fontSize: 13 }}>{q.aktion_typ}</td>
                    <td style={{ fontSize: 13, color: 'var(--ink4)' }}>{q.event_typ}</td>
                    <td><StatusBadge label={st.label} color={st.color} /></td>
                    <td style={{ textAlign: 'center' }}>{q.versuch}/{q.max_versuche}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink4)' }}>{formatDate(q.naechster_versuch)}</td>
                    <td style={{ fontSize: 12, color: '#D04B3B', maxWidth: 220 }}>{q.fehler_nachricht || '—'}</td>
                    <td>
                      {retryable && <button style={secondaryBtn} onClick={() => retry(q.id)}>Wiederholen</button>}
                    </td>
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
