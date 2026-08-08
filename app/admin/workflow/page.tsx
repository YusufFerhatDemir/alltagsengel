'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { statusMeta, timeAgo, WF_EVENT_STATUS, WF_MODUL, WF_QUEUE_STATUS } from '@/lib/admin/ops'
import { StatusBadge, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface Statistik {
  total_events: number
  offene_events: number
  verarbeitete_events: number
  fehlerhafte_events: number
  queue_wartend: number
  dead_letter_offen: number
  aktive_regeln: number
  erfolgreiche_ausfuehrungen: number
}

interface EventRow {
  id: string
  event_typ: string
  modul: string
  status: string
  prioritaet: string
  ausgeloest_am: string | null
  fehler_nachricht: string | null
}

interface QueueRow {
  id: string
  status: string
  event_typ: string
  regel_name: string
  aktion_typ: string
  versuch: number
  max_versuche: number
  created_at: string
}

interface Dashboard {
  statistik: Statistik | null
  letzteEvents: EventRow[]
  queueStatus: QueueRow[]
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
  textDecoration: 'none', display: 'inline-block',
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
  textDecoration: 'none', display: 'inline-block',
}

const statCard: React.CSSProperties = {
  background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12,
  padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 4,
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={statCard}>
      <span style={{ fontSize: 12, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</span>
      <span style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--ink)' }}>{value}</span>
    </div>
  )
}

export default function WorkflowDashboardPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/ops/workflow/dashboard')
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setDashboard(data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function trigger(action: 'process_pending' | 'check_fristen') {
    setProcessing(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/ops/workflow/processing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Fehler bei der Verarbeitung')
        setProcessing(false)
        return
      }
      const result = await res.json()
      setMessage(action === 'check_fristen'
        ? `Fristenprüfung abgeschlossen: ${result.neue_events} neue Events`
        : `Verarbeitung abgeschlossen: ${result.queue_verarbeitet} Warteschlangen-Einträge (${result.erfolgreich} erfolgreich, ${result.fehlgeschlagen} fehlgeschlagen)`)
      await load()
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setProcessing(false)
    }
  }

  const s = dashboard?.statistik

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Workflow-Engine</h1>
          <p className="admin-subtitle">Event-getriebene Automatisierung — WHEN → IF → THEN</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={secondaryBtn} onClick={() => trigger('check_fristen')} disabled={processing}>
            Fristen prüfen
          </button>
          <button style={primaryBtn} onClick={() => trigger('process_pending')} disabled={processing}>
            {processing ? 'Verarbeite...' : 'Warteschlange verarbeiten'}
          </button>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {message && <Banner tone="success">{message}</Banner>}

      {loading ? <p>Laden...</p> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard label="Events gesamt" value={s?.total_events ?? 0} />
            <StatCard label="Offene Events" value={s?.offene_events ?? 0} color="#E8A000" />
            <StatCard label="Verarbeitete Events" value={s?.verarbeitete_events ?? 0} color="#5CB882" />
            <StatCard label="Fehlerhafte Events" value={s?.fehlerhafte_events ?? 0} color="#D04B3B" />
            <StatCard label="Warteschlange" value={s?.queue_wartend ?? 0} color="#2196F3" />
            <StatCard label="Dead-Letter offen" value={s?.dead_letter_offen ?? 0} color="#D04B3B" />
            <StatCard label="Aktive Regeln" value={s?.aktive_regeln ?? 0} />
            <StatCard label="Erfolgr. Ausführungen" value={s?.erfolgreiche_ausfuehrungen ?? 0} color="#5CB882" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h2 style={{ fontSize: 16, margin: 0 }}>Letzte Events</h2>
                <Link href="/admin/workflow/events" style={{ fontSize: 13, color: 'var(--gold)' }}>Alle anzeigen →</Link>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Event-Typ</th><th>Modul</th><th>Status</th><th>Zeit</th></tr></thead>
                  <tbody>
                    {(dashboard?.letzteEvents ?? []).length === 0
                      ? <EmptyRow colSpan={4}>Keine Events</EmptyRow>
                      : dashboard!.letzteEvents.map(e => {
                        const st = statusMeta(WF_EVENT_STATUS, e.status)
                        const mod = statusMeta(WF_MODUL, e.modul)
                        return (
                          <tr key={e.id}>
                            <td><Link href={`/admin/workflow/events/${e.id}`} style={{ color: 'var(--gold)', textDecoration: 'none' }}>{e.event_typ}</Link></td>
                            <td><StatusBadge label={mod.label} color={mod.color} /></td>
                            <td><StatusBadge label={st.label} color={st.color} /></td>
                            <td style={{ fontSize: 12, color: 'var(--ink4)' }}>{timeAgo(e.ausgeloest_am)}</td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h2 style={{ fontSize: 16, margin: 0 }}>Warteschlange</h2>
                <Link href="/admin/workflow/warteschlange" style={{ fontSize: 13, color: 'var(--gold)' }}>Alle anzeigen →</Link>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Regel</th><th>Aktion</th><th>Status</th><th>Versuch</th></tr></thead>
                  <tbody>
                    {(dashboard?.queueStatus ?? []).length === 0
                      ? <EmptyRow colSpan={4}>Warteschlange leer</EmptyRow>
                      : dashboard!.queueStatus.map(q => {
                        const st = statusMeta(WF_QUEUE_STATUS, q.status)
                        return (
                          <tr key={q.id}>
                            <td>{q.regel_name}</td>
                            <td style={{ fontSize: 13 }}>{q.aktion_typ}</td>
                            <td><StatusBadge label={st.label} color={st.color} /></td>
                            <td style={{ fontSize: 13, textAlign: 'center' }}>{q.versuch}/{q.max_versuche}</td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
