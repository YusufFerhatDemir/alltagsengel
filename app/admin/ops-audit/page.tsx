'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDate } from '@/lib/admin/ops'
import { StatusBadge, EmptyRow } from '@/components/admin/OpsUI'

interface UnifiedAuditEntry {
  id: string
  quelle: 'aufgaben' | 'abrechnung'
  entitaetTyp: string
  entitaetId: string
  aktion: string
  akteurId: string | null
  akteurName: string | null
  zeitpunkt: string
  vorher: Record<string, unknown> | null
  nachher: Record<string, unknown> | null
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal2)', color: 'var(--ink)', fontSize: 13,
  fontFamily: "'Jost',sans-serif", cursor: 'pointer',
}
const textInputStyle: React.CSSProperties = { ...selectStyle, cursor: 'text', minWidth: 160 }
const secondaryBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
}

const QUELLE_LABEL: Record<string, { label: string; color: string }> = {
  aufgaben: { label: 'Aufgaben/Kommunikation', color: '#2196F3' },
  abrechnung: { label: 'Abrechnung', color: '#9C27B0' },
}

function timeAgoLocal(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'gerade eben'
  if (mins < 60) return `vor ${mins} Min.`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `vor ${hrs} Std.`
  const days = Math.floor(hrs / 24)
  return `vor ${days} Tag${days > 1 ? 'en' : ''}`
}

export default function OpsAuditPage() {
  const [entries, setEntries] = useState<UnifiedAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [von, setVon] = useState('')
  const [bis, setBis] = useState('')
  const [akteur, setAkteur] = useState('')
  const [aktion, setAktion] = useState('all')
  const [quelle, setQuelle] = useState<'all' | 'aufgaben' | 'abrechnung'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '300' })
      if (von) params.set('von', von)
      if (bis) params.set('bis', bis)
      if (akteur.trim()) params.set('akteur', akteur.trim())
      if (aktion !== 'all') params.set('aktion', aktion)
      if (quelle !== 'all') params.set('quelle', quelle)
      const res = await fetch(`/api/admin/analytics/ops-audit?${params}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Unbekannter Fehler'); setEntries([]); return }
      setEntries(data)
    } catch (err: any) {
      setError(err.message || 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [von, bis, akteur, aktion, quelle])

  useEffect(() => { load() }, [load])

  const aktionen = useMemo(() => {
    const s = new Set<string>()
    entries.forEach(e => s.add(e.aktion))
    return Array.from(s).sort()
  }, [entries])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Ops-Audit</h1>
          <p className="admin-subtitle">Betriebs-Audit über alle Quellen — Aufgaben/Kommunikation & Abrechnung, {entries.length} Einträge</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink3)' }}>
          Von
          <input type="date" value={von} onChange={e => setVon(e.target.value)} style={textInputStyle} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink3)' }}>
          Bis
          <input type="date" value={bis} onChange={e => setBis(e.target.value)} style={textInputStyle} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink3)' }}>
          Akteur
          <input type="text" placeholder="Name…" value={akteur} onChange={e => setAkteur(e.target.value)} style={textInputStyle} />
        </label>
        <select value={quelle} onChange={e => setQuelle(e.target.value as typeof quelle)} style={selectStyle}>
          <option value="all">Alle Quellen</option>
          <option value="aufgaben">Aufgaben/Kommunikation</option>
          <option value="abrechnung">Abrechnung</option>
        </select>
        <select value={aktion} onChange={e => setAktion(e.target.value)} style={selectStyle}>
          <option value="all">Alle Aktionen</option>
          {aktionen.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={load} disabled={loading} style={secondaryBtn}>{loading ? 'Lädt…' : 'Aktualisieren'}</button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(208,75,59,0.1)', border: '1px solid rgba(208,75,59,0.3)', color: '#D04B3B', marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? <p>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Zeitpunkt</th>
                <th>Quelle</th>
                <th>Entität</th>
                <th>Aktion</th>
                <th>Akteur</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <EmptyRow colSpan={6}>Keine Einträge für die gewählten Filter</EmptyRow>
              ) : entries.map(e => {
                const isOpen = expanded === e.id
                const q = QUELLE_LABEL[e.quelle] || { label: e.quelle, color: '#999' }
                return (
                  <tr key={`${e.quelle}-${e.id}`}>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      <span title={formatDate(e.zeitpunkt)}>{timeAgoLocal(e.zeitpunkt)}</span>
                    </td>
                    <td><StatusBadge label={q.label} color={q.color} /></td>
                    <td style={{ fontSize: 13 }}>{e.entitaetTyp}</td>
                    <td style={{ fontSize: 13 }}>{e.aktion}</td>
                    <td style={{ fontSize: 13 }}>{e.akteurName || '—'}</td>
                    <td>
                      {(e.vorher || e.nachher) ? (
                        <div>
                          <button onClick={() => setExpanded(isOpen ? null : e.id)} style={{ ...secondaryBtn, fontSize: 12, padding: '3px 10px' }}>
                            {isOpen ? 'Einklappen' : 'Anzeigen'}
                          </button>
                          {isOpen && (
                            <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
                              {e.vorher && (
                                <div style={{ marginBottom: 6 }}>
                                  <strong style={{ color: 'var(--ink4)' }}>Vorher:</strong>
                                  <pre style={{ background: 'var(--coal3)', padding: 8, borderRadius: 6, overflow: 'auto', maxHeight: 200, fontSize: 11, color: 'var(--ink)', margin: '4px 0 0' }}>
                                    {JSON.stringify(e.vorher, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {e.nachher && (
                                <div>
                                  <strong style={{ color: 'var(--ink4)' }}>Nachher:</strong>
                                  <pre style={{ background: 'var(--coal3)', padding: 8, borderRadius: 6, overflow: 'auto', maxHeight: 200, fontSize: 11, color: 'var(--ink)', margin: '4px 0 0' }}>
                                    {JSON.stringify(e.nachher, null, 2)}
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
      )}
    </div>
  )
}
