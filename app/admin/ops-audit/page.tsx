'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  statusMeta, timeAgo, formatDate,
  AKTIVITAETSLOG_AKTION,
} from '@/lib/admin/ops'
import { StatusBadge, EmptyRow } from '@/components/admin/OpsUI'

interface AuditRow {
  id: string
  entitaet_typ: string | null
  entitaet_id: string | null
  aktion: string
  akteur_name: string | null
  vorher: Record<string, unknown> | null
  nachher: Record<string, unknown> | null
  created_at: string | null
}

const PAGE_SIZE = 50

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal2)', color: 'var(--ink)', fontSize: 13,
  fontFamily: "'Jost',sans-serif", cursor: 'pointer',
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
}

export default function OpsAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTyp, setFilterTyp] = useState('all')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async (newOffset: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE.toString(),
        offset: newOffset.toString(),
      })
      if (filterTyp !== 'all') params.set('entitaet_typ', filterTyp)
      const res = await fetch(`/api/ops/aktivitaetslog?${params}`)
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setRows(data)
      setHasMore(data.length === PAGE_SIZE)
      setOffset(newOffset)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [filterTyp])

  useEffect(() => { load(0) }, [load])

  const entitaetTypen = useMemo(() => {
    const s = new Set<string>()
    rows.forEach(r => { if (r.entitaet_typ) s.add(r.entitaet_typ) })
    return Array.from(s).sort()
  }, [rows])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Aktivitätslog</h1>
          <p className="admin-subtitle">Ops-Audit-Trail aller Aktionen</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={filterTyp} onChange={e => { setFilterTyp(e.target.value) }} style={selectStyle}>
          <option value="all">Alle Entitäts-Typen</option>
          {entitaetTypen.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {loading ? <p>Laden...</p> : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Entität-Typ</th>
                  <th>Aktion</th>
                  <th>Akteur</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <EmptyRow colSpan={5}>Keine Einträge</EmptyRow>
                ) : rows.map(r => {
                  const ak = statusMeta(AKTIVITAETSLOG_AKTION, r.aktion)
                  const isOpen = expanded === r.id
                  return (
                    <tr key={r.id}>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                        <span title={formatDate(r.created_at)}>{timeAgo(r.created_at)}</span>
                      </td>
                      <td style={{ fontSize: 13 }}>{r.entitaet_typ || '—'}</td>
                      <td><StatusBadge label={ak.label} color={ak.color} /></td>
                      <td style={{ fontSize: 13 }}>{r.akteur_name || '—'}</td>
                      <td>
                        {(r.vorher || r.nachher) ? (
                          <div>
                            <button
                              onClick={() => setExpanded(isOpen ? null : r.id)}
                              style={{ ...secondaryBtn, fontSize: 12, padding: '3px 10px' }}
                            >
                              {isOpen ? 'Einklappen' : 'Anzeigen'}
                            </button>
                            {isOpen && (
                              <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
                                {r.vorher && (
                                  <div style={{ marginBottom: 6 }}>
                                    <strong style={{ color: 'var(--ink4)' }}>Vorher:</strong>
                                    <pre style={{
                                      background: 'var(--coal3)', padding: 8, borderRadius: 6,
                                      overflow: 'auto', maxHeight: 200, fontSize: 11,
                                      color: 'var(--ink)', margin: '4px 0 0',
                                    }}>
                                      {JSON.stringify(r.vorher, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {r.nachher && (
                                  <div>
                                    <strong style={{ color: 'var(--ink4)' }}>Nachher:</strong>
                                    <pre style={{
                                      background: 'var(--coal3)', padding: 8, borderRadius: 6,
                                      overflow: 'auto', maxHeight: 200, fontSize: 11,
                                      color: 'var(--ink)', margin: '4px 0 0',
                                    }}>
                                      {JSON.stringify(r.nachher, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button
              onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              style={{ ...secondaryBtn, opacity: offset === 0 ? 0.4 : 1 }}
            >
              Zurück
            </button>
            <span style={{ fontSize: 13, color: 'var(--ink4)', alignSelf: 'center' }}>
              Einträge {offset + 1}–{offset + rows.length}
            </span>
            <button
              onClick={() => load(offset + PAGE_SIZE)}
              disabled={!hasMore}
              style={{ ...secondaryBtn, opacity: !hasMore ? 0.4 : 1 }}
            >
              Weiter
            </button>
          </div>
        </>
      )}
    </div>
  )
}
