'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDate, WF_MODUL } from '@/lib/admin/ops'
import { StatusBadge, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface DeadLetterRow {
  id: string
  fehler_nachricht: string | null
  versuche: number | null
  manuell_wiederholt: boolean
  wiederholt_am: string | null
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

export default function WorkflowDeadLetterPage() {
  const [rows, setRows] = useState<DeadLetterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/ops/workflow/dead-letter')
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setRows(data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function retry(id: string) {
    try {
      const res = await fetch(`/api/ops/workflow/dead-letter/${id}/retry`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Fehler beim Wiederholen')
        return
      }
      setSuccess('Neuer Versuch ausgelöst')
      setTimeout(() => setSuccess(null), 3000)
      await load()
    } catch { setError('Netzwerkfehler') }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Dead-Letter-Queue</h1>
          <p className="admin-subtitle">{rows.length} Einträge &middot; {rows.filter(r => !r.manuell_wiederholt).length} offen</p>
        </div>
        <Link href="/admin/workflow" style={{ fontSize: 13, color: 'var(--gold)' }}>← Dashboard</Link>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      {loading ? <p>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Regel</th><th>Aktion</th><th>Modul</th><th>Versuche</th><th>Fehler</th><th>Status</th><th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={7}>Keine Dead-Letter-Einträge</EmptyRow>
              ) : rows.map(d => {
                const mod = WF_MODUL[d.modul] || { label: d.modul, color: '#999' }
                return (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.regel_name}</td>
                    <td style={{ fontSize: 13 }}>{d.aktion_typ}</td>
                    <td><StatusBadge label={mod.label} color={mod.color} /></td>
                    <td style={{ textAlign: 'center' }}>{d.versuche ?? '—'}</td>
                    <td style={{ fontSize: 12, color: '#D04B3B', maxWidth: 260 }}>{d.fehler_nachricht || '—'}</td>
                    <td>
                      {d.manuell_wiederholt
                        ? <StatusBadge label={`Wiederholt am ${formatDate(d.wiederholt_am)}`} color="#5CB882" />
                        : <StatusBadge label="Offen" color="#D04B3B" />}
                    </td>
                    <td>
                      {!d.manuell_wiederholt && <button style={secondaryBtn} onClick={() => retry(d.id)}>Manuell wiederholen</button>}
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
