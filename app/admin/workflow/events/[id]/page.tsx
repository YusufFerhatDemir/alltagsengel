'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { statusMeta, formatDate, WF_EVENT_STATUS, WF_MODUL, WF_EVENT_PRIORITAET, WF_AUSFUEHRUNG_STATUS } from '@/lib/admin/ops'
import { StatusBadge, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface EventDetail {
  id: string
  event_typ: string
  modul: string
  quell_tabelle: string
  quell_id: string | null
  payload: Record<string, unknown>
  status: string
  prioritaet: string
  retry_count: number
  max_retries: number
  ausgeloest_am: string | null
  verarbeitet_am: string | null
  fehler_nachricht: string | null
  created_at: string
}

interface AusfuehrungRow {
  id: string
  regel_id: string
  aktion_id: string | null
  status: string
  ergebnis: Record<string, unknown> | null
  fehler_nachricht: string | null
  erstellt_entity_typ: string | null
  erstellt_entity_id: string | null
  beendet_am: string | null
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
  textDecoration: 'none', display: 'inline-block',
}

const codeBlock: React.CSSProperties = {
  background: 'var(--coal3)', border: '1px solid var(--border)', borderRadius: 8,
  padding: 12, fontSize: 12, fontFamily: 'monospace', color: 'var(--ink2)',
  overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
}

const fieldLabel: React.CSSProperties = { fontSize: 12, color: 'var(--ink4)', marginBottom: 2 }
const fieldValue: React.CSSProperties = { fontSize: 14, color: 'var(--ink)', marginBottom: 14 }

export default function WorkflowEventDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [ausfuehrungen, setAusfuehrungen] = useState<AusfuehrungRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [eventRes, ausRes] = await Promise.all([
          fetch(`/api/ops/workflow/events/${id}`),
          fetch(`/api/ops/workflow/ausfuehrungen?event_id=${id}`),
        ])
        if (eventRes.ok) setEvent(await eventRes.json())
        if (ausRes.ok) setAusfuehrungen(await ausRes.json())
      } catch {
        setError('Netzwerkfehler')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) return <div className="admin-page"><p>Laden...</p></div>
  if (!event) return <div className="admin-page"><Banner tone="danger">Event nicht gefunden</Banner></div>

  const st = statusMeta(WF_EVENT_STATUS, event.status)
  const mod = statusMeta(WF_MODUL, event.modul)
  const prio = statusMeta(WF_EVENT_PRIORITAET, event.prioritaet)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>{event.event_typ}</h1>
          <p className="admin-subtitle">
            <StatusBadge label={mod.label} color={mod.color} /> &middot; <StatusBadge label={st.label} color={st.color} />
          </p>
        </div>
        <Link href="/admin/workflow/events" style={secondaryBtn}>← Events</Link>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {event.fehler_nachricht && <Banner tone="danger">{event.fehler_nachricht}</Banner>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={fieldLabel}>Priorität</div>
          <div style={fieldValue}><StatusBadge label={prio.label} color={prio.color} /></div>
        </div>
        <div>
          <div style={fieldLabel}>Quelltabelle</div>
          <div style={fieldValue}>{event.quell_tabelle}</div>
        </div>
        <div>
          <div style={fieldLabel}>Quell-ID</div>
          <div style={fieldValue}>{event.quell_id || '—'}</div>
        </div>
        <div>
          <div style={fieldLabel}>Retries</div>
          <div style={fieldValue}>{event.retry_count} / {event.max_retries}</div>
        </div>
        <div>
          <div style={fieldLabel}>Ausgelöst am</div>
          <div style={fieldValue}>{formatDate(event.ausgeloest_am)}</div>
        </div>
        <div>
          <div style={fieldLabel}>Verarbeitet am</div>
          <div style={fieldValue}>{formatDate(event.verarbeitet_am)}</div>
        </div>
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Payload</h2>
      <pre style={{ ...codeBlock, marginBottom: 24 }}>{JSON.stringify(event.payload, null, 2)}</pre>

      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Ausführungen</h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Regel-ID</th><th>Status</th><th>Erstellt</th><th>Fehler</th><th>Beendet</th></tr></thead>
          <tbody>
            {ausfuehrungen.length === 0 ? (
              <EmptyRow colSpan={5}>Noch keine Ausführungen</EmptyRow>
            ) : ausfuehrungen.map(a => {
              const ast = statusMeta(WF_AUSFUEHRUNG_STATUS, a.status)
              return (
                <tr key={a.id}>
                  <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{a.regel_id.slice(0, 8)}…</td>
                  <td><StatusBadge label={ast.label} color={ast.color} /></td>
                  <td style={{ fontSize: 13 }}>{a.erstellt_entity_typ ? `${a.erstellt_entity_typ} (${a.erstellt_entity_id?.slice(0, 8)}…)` : '—'}</td>
                  <td style={{ fontSize: 13, color: '#D04B3B' }}>{a.fehler_nachricht || '—'}</td>
                  <td style={{ fontSize: 13, color: 'var(--ink4)' }}>{formatDate(a.beendet_am)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
