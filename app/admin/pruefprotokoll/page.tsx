'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate, fullName, statusMeta, REVIEW_SEVERITY, REVIEW_ERROR_TYPE,
} from '@/lib/admin/ops'
import { StatusBadge, EmptyRow } from '@/components/admin/OpsUI'

interface ErrorRow {
  id: string
  service_record_id: string
  error_type: string
  severity: string
  description: string
  resolved: boolean
  resolved_at: string | null
  client: string
  caregiver: string
  date: string | null
}

export default function AdminPruefprotokollPage() {
  const [rows, setRows] = useState<ErrorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [severityFilter, setSeverityFilter] = useState<'all' | 'info' | 'warning' | 'critical'>('all')
  const [resolvedFilter, setResolvedFilter] = useState<'open' | 'resolved' | 'all'>('open')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('review_errors')
        .select(`
          id, service_record_id, error_type, severity, description, resolved, resolved_at,
          service_record:service_records(date, client:clients(first_name, last_name), caregiver:caregivers(first_name, last_name))
        `)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) { console.error('Prüfprotokoll load error:', error); setLoading(false); return }
      setRows((data || []).map((e: any) => ({
        id: e.id,
        service_record_id: e.service_record_id,
        error_type: e.error_type,
        severity: e.severity,
        description: e.description,
        resolved: e.resolved,
        resolved_at: e.resolved_at,
        client: fullName(e.service_record?.client),
        caregiver: fullName(e.service_record?.caregiver),
        date: e.service_record?.date ?? null,
      })))
    } catch (err) {
      console.error('Prüfprotokoll page error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function resolve(id: string) {
    setBusyId(id)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('review_errors').update({
        resolved: true, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString(),
      }).eq('id', id)
      await load()
    } catch (err) {
      console.error('Resolve error:', err)
    } finally {
      setBusyId(null)
    }
  }

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (severityFilter !== 'all' && r.severity !== severityFilter) return false
      if (resolvedFilter === 'open' && r.resolved) return false
      if (resolvedFilter === 'resolved' && !r.resolved) return false
      return true
    })
  }, [rows, severityFilter, resolvedFilter])

  const stats = useMemo(() => ({
    openCritical: rows.filter(r => !r.resolved && r.severity === 'critical').length,
    openWarning: rows.filter(r => !r.resolved && r.severity === 'warning').length,
  }), [rows])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Prüfprotokoll</h1>
          <p className="admin-subtitle">KI-Leistungsnachweis-Prüfzentrale — {rows.length} Einträge</p>
        </div>
      </div>

      <div className="admin-stats-grid">
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #D04B3B' }}>
          <div className="admin-stat-value">{stats.openCritical}</div>
          <div className="admin-stat-label">🔴 Offen, kritisch</div>
        </div>
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #E8A000' }}>
          <div className="admin-stat-value">{stats.openWarning}</div>
          <div className="admin-stat-label">🟡 Offen, Warnung</div>
        </div>
      </div>

      <div className="admin-filters" style={{ marginTop: 20 }}>
        {(['all', 'critical', 'warning', 'info'] as const).map(f => (
          <button key={f} className={`admin-filter-btn ${severityFilter === f ? 'active' : ''}`} onClick={() => setSeverityFilter(f)}>
            {f === 'all' ? 'Alle Schweregrade' : statusMeta(REVIEW_SEVERITY, f).label}
          </button>
        ))}
      </div>
      <div className="admin-filters">
        {([
          { key: 'open', label: 'Offen' },
          { key: 'resolved', label: 'Gelöst' },
          { key: 'all', label: 'Alle' },
        ] as const).map(f => (
          <button key={f.key} className={`admin-filter-btn ${resolvedFilter === f.key ? 'active' : ''}`} onClick={() => setResolvedFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Schweregrad</th><th>Typ</th><th>Beschreibung</th><th>Klient</th>
                <th>Kraft</th><th>Datum</th><th>Status</th><th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={8}>Keine Einträge gefunden</EmptyRow>
              ) : filtered.map(r => {
                const sev = statusMeta(REVIEW_SEVERITY, r.severity)
                return (
                  <tr key={r.id}>
                    <td><StatusBadge label={sev.label} color={sev.color} /></td>
                    <td style={{ fontSize: 13 }}>{REVIEW_ERROR_TYPE[r.error_type] || r.error_type}</td>
                    <td style={{ fontSize: 13, maxWidth: 320 }}>{r.description}</td>
                    <td style={{ fontWeight: 600 }}>{r.client}</td>
                    <td>{r.caregiver}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{formatDate(r.date)}</td>
                    <td>
                      {r.resolved ? (
                        <span style={{ color: '#5CB882', fontSize: 12, fontWeight: 600 }}>✓ Gelöst</span>
                      ) : (
                        <span style={{ color: 'var(--ink4)', fontSize: 12 }}>Offen</span>
                      )}
                    </td>
                    <td>
                      {r.resolved ? (
                        <span style={{ color: 'var(--ink5)', fontSize: 12 }}>—</span>
                      ) : (
                        <button onClick={() => resolve(r.id)} disabled={busyId === r.id} style={actionBtn}>
                          {busyId === r.id ? 'Speichern…' : 'Als gelöst markieren'}
                        </button>
                      )}
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

const actionBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
