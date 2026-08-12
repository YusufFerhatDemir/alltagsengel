'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { statusMeta, WF_MODUL, WF_BEDINGUNG_OPERATOR } from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface Bedingung { feld: string; operator: string; wert?: string }

interface RegelRow {
  id: string
  bezeichnung: string
  beschreibung: string | null
  event_typ: string
  modul: string
  bedingungen: Bedingung[]
  aktiv: boolean
  prioritaet: number
  ist_system: boolean
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
  textDecoration: 'none', display: 'inline-block',
}

export default function WorkflowRegelnPage() {
  const [rows, setRows] = useState<RegelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/ops/workflow/regeln')
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setRows(data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.bezeichnung.toLowerCase().includes(q) || r.event_typ.toLowerCase().includes(q))
  }, [rows, search])

  async function toggleAktiv(r: RegelRow) {
    try {
      const res = await fetch(`/api/ops/workflow/regeln/${r.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktiv: !r.aktiv }),
      })
      if (!res.ok) { setError('Fehler beim Aktualisieren'); return }
      setRows(prev => prev.map(x => x.id === r.id ? { ...x, aktiv: !x.aktiv } : x))
    } catch { setError('Netzwerkfehler') }
  }

  async function deleteRegel(id: string) {
    if (!confirm('Regel wirklich löschen?')) return
    try {
      const res = await fetch(`/api/ops/workflow/regeln/${id}`, { method: 'DELETE' })
      if (!res.ok) { setError('Fehler beim Löschen'); return }
      setRows(prev => prev.filter(x => x.id !== id))
    } catch { setError('Netzwerkfehler') }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Workflow-Regeln</h1>
          <p className="admin-subtitle">{rows.length} Regeln &middot; {rows.filter(r => r.aktiv).length} aktiv</p>
        </div>
        <Link href="/admin/workflow/regeln/neu" style={primaryBtn}>+ Neue Regel</Link>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Bezeichnung, Event-Typ..." />
      </div>

      {loading ? <p>Laden...</p> : filtered.length === 0 ? (
        <EmptyRow colSpan={1}>{search ? 'Keine Treffer' : 'Noch keine Workflow-Regeln'}</EmptyRow>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(r => {
            const mod = statusMeta(WF_MODUL, r.modul)
            return (
              <div key={r.id} style={{
                background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12,
                padding: 16, opacity: r.aktiv ? 1 : 0.55,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Link href={`/admin/workflow/regeln/${r.id}`} style={{ color: 'var(--gold)', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
                        {r.bezeichnung}
                      </Link>
                      <StatusBadge label={mod.label} color={mod.color} />
                      {r.ist_system && <StatusBadge label="System" color="#7E57C2" />}
                    </div>
                    {r.beschreibung && <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '4px 0 0' }}>{r.beschreibung}</p>}
                    <div style={{ marginTop: 10, fontSize: 13, fontFamily: 'monospace', color: 'var(--ink2)', lineHeight: 1.8 }}>
                      <div><strong style={{ color: 'var(--gold2)' }}>WHEN</strong> {r.event_typ}</div>
                      <div>
                        <strong style={{ color: 'var(--gold2)' }}>IF</strong>{' '}
                        {r.bedingungen.length === 0 ? 'immer'
                          : r.bedingungen.map((b, i) => (
                            <span key={i}>{i > 0 && ' UND '}{b.feld} {WF_BEDINGUNG_OPERATOR[b.operator] || b.operator}{b.wert !== undefined && b.wert !== '' ? ` "${b.wert}"` : ''}</span>
                          ))}
                      </div>
                      <div><strong style={{ color: 'var(--gold2)' }}>THEN</strong> → Aktionen ausführen (Priorität {r.prioritaet})</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => toggleAktiv(r)}
                      style={{
                        fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none',
                        cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                        background: r.aktiv ? 'rgba(92,184,130,.15)' : 'rgba(153,153,153,.15)',
                        color: r.aktiv ? '#5CB882' : '#999',
                      }}
                    >
                      {r.aktiv ? 'Aktiv' : 'Inaktiv'}
                    </button>
                    {!r.ist_system && (
                      <button onClick={() => deleteRegel(r.id)} style={{
                        fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
                        cursor: 'pointer', fontFamily: 'inherit', background: 'var(--coal3)', color: '#D04B3B',
                      }}>Löschen</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
