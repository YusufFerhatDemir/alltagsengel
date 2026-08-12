'use client'
import { useCallback, useEffect, useState } from 'react'
import { Banner } from '@/components/admin/OpsUI'

const secondaryBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
}

interface SyncStatusProOrg {
  organizationId: string
  offeneVorgaenge: number
  fehler24h: number
  konflikte: number
}

interface SyncStatusUebersicht {
  offeneKonflikte: number
  offeneSyncVorgaenge: number
  fehler24h: number
  erfolg24h: number
  proOrganisation: SyncStatusProOrg[]
}

export default function SyncStatusPage() {
  const [data, setData] = useState<SyncStatusUebersicht | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/sync-status')
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Unbekannter Fehler'); return }
      setData(json)
    } catch (err: any) {
      setError(err.message || 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Sync-Status</h1>
          <p className="admin-subtitle">
            Offline-First (Block 20) — Übersicht über Sync-Vorgänge aus lib/offline/,
            gespeist aus sync_audit_log &amp; sync_konflikte.
          </p>
        </div>
        <button style={secondaryBtn} onClick={load} disabled={loading}>
          {loading ? 'Lädt…' : 'Aktualisieren'}
        </button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {!error && data && (
        <>
          <div className="admin-stats-grid" style={{ marginBottom: 24 }}>
            <div className="admin-stat-card" style={{ borderLeft: data.offeneKonflikte > 0 ? '3px solid #D04B3B' : undefined }}>
              <div className="admin-stat-value">{data.offeneKonflikte}</div>
              <div className="admin-stat-label">Offene Konflikte</div>
            </div>
            <div className="admin-stat-card" style={{ borderLeft: data.offeneSyncVorgaenge > 0 ? '3px solid #E8A000' : undefined }}>
              <div className="admin-stat-value">{data.offeneSyncVorgaenge}</div>
              <div className="admin-stat-label">Offene Sync-Vorgänge</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-value">{data.fehler24h}</div>
              <div className="admin-stat-label">Sync-Fehler (24 Std.)</div>
            </div>
            <div className="admin-stat-card success">
              <div className="admin-stat-value">{data.erfolg24h}</div>
              <div className="admin-stat-label">Erfolgreich synchronisiert (24 Std.)</div>
            </div>
          </div>

          {data.offeneKonflikte > 0 && (
            <Banner tone="warn">
              {data.offeneKonflikte} offene{data.offeneKonflikte === 1 ? 'r' : ''} Konflikt{data.offeneKonflikte === 1 ? '' : 'e'} wartet auf manuelle Auflösung — siehe{' '}
              <a href="/admin/sync-konflikte" style={{ color: 'inherit', fontWeight: 600 }}>Sync-Konflikte</a>.
            </Banner>
          )}

          <h2 style={{ fontSize: 16, margin: '24px 0 12px' }}>Nach Organisation</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Organisation</th>
                  <th>Offene Vorgänge</th>
                  <th>Fehler (24 Std.)</th>
                  <th>Konflikte</th>
                </tr>
              </thead>
              <tbody>
                {data.proOrganisation.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>Keine Sync-Aktivität in den letzten 24 Stunden.</td></tr>
                )}
                {data.proOrganisation.map(zeile => (
                  <tr key={zeile.organizationId}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{zeile.organizationId}</td>
                    <td>{zeile.offeneVorgaenge}</td>
                    <td>{zeile.fehler24h}</td>
                    <td>{zeile.konflikte}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
