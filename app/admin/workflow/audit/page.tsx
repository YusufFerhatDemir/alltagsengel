'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { statusMeta, formatDate, WF_AUDIT_TYP } from '@/lib/admin/ops'
import { StatusBadge, EmptyRow } from '@/components/admin/OpsUI'

interface AuditRow {
  id: string
  typ: string
  entitaet_typ: string
  entitaet_id: string | null
  aktion: string
  details: Record<string, unknown>
  akteur_id: string | null
  created_at: string
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal2)', color: 'var(--ink)', fontSize: 13, fontFamily: 'inherit',
}

export default function WorkflowAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTyp, setFilterTyp] = useState('all')

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams({ limit: '100' })
        if (filterTyp !== 'all') params.set('typ', filterTyp)
        const res = await fetch(`/api/ops/workflow/audit?${params.toString()}`)
        if (!res.ok) { setLoading(false); return }
        const data = await res.json()
        setRows(data)
      } catch { /* ignore */ } finally { setLoading(false) }
    }
    setLoading(true)
    load()
  }, [filterTyp])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Workflow-Audit-Log</h1>
          <p className="admin-subtitle">{rows.length} Einträge &middot; unveränderlich</p>
        </div>
        <Link href="/admin/workflow" style={{ fontSize: 13, color: 'var(--gold)' }}>← Dashboard</Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <select style={selectStyle} value={filterTyp} onChange={e => setFilterTyp(e.target.value)}>
          <option value="all">Alle Typen</option>
          {Object.entries(WF_AUDIT_TYP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? <p>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Typ</th><th>Entität</th><th>Aktion</th><th>Details</th><th>Zeitpunkt</th></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={5}>Keine Audit-Einträge</EmptyRow>
              ) : rows.map(a => {
                const typ = statusMeta(WF_AUDIT_TYP, a.typ)
                return (
                  <tr key={a.id}>
                    <td><StatusBadge label={typ.label} color={typ.color} /></td>
                    <td style={{ fontSize: 13 }}>{a.entitaet_typ}{a.entitaet_id ? ` (${a.entitaet_id.slice(0, 8)}…)` : ''}</td>
                    <td style={{ fontSize: 13 }}>{a.aktion}</td>
                    <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--ink4)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {JSON.stringify(a.details)}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink4)' }}>{formatDate(a.created_at)}</td>
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
