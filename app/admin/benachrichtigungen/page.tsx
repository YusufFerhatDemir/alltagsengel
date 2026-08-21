'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  statusMeta, timeAgo,
  BENACHRICHTIGUNG_TYP, BENACHRICHTIGUNG_KATEGORIE,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger'
import { klickbareZeile } from '@/lib/a11y'
const log = logger.child('admin:benachrichtigungen')

interface BenachrichtigungRow {
  id: string
  typ: string
  kategorie: string | null
  titel: string
  inhalt: string | null
  gelesen: boolean
  created_at: string | null
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal2)', color: 'var(--ink)', fontSize: 13,
  fontFamily: "'Jost',sans-serif", cursor: 'pointer',
}

export default function BenachrichtigungenPage() {
  const [rows, setRows] = useState<BenachrichtigungRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterKategorie, setFilterKategorie] = useState('all')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/ops/benachrichtigungen')
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setRows(data)
    } catch (err) {
      log.errorWithException('Fehler beim Laden der Admin-Benachrichtigungen', err)
      setError('Benachrichtigungen konnten nicht geladen werden.')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const unreadCount = rows.filter(r => !r.gelesen).length

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterKategorie !== 'all' && r.kategorie !== filterKategorie) return false
      return true
    })
  }, [rows, filterKategorie])

  async function markAsRead(id: string) {
    try {
      const res = await fetch('/api/ops/benachrichtigungen/gelesen', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      })
      if (!res.ok) return
      setRows(prev => prev.map(r => r.id === id ? { ...r, gelesen: true } : r))
    } catch (err) {
      log.errorWithException('Fehler in markAsRead (Admin-Benachrichtigungen)', err)
    }
  }

  async function markAllRead() {
    const unreadIds = rows.filter(r => !r.gelesen).map(r => r.id)
    if (unreadIds.length === 0) return
    try {
      const res = await fetch('/api/ops/benachrichtigungen/gelesen', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unreadIds }),
      })
      if (!res.ok) { setError('Fehler beim Markieren'); return }
      setRows(prev => prev.map(r => ({ ...r, gelesen: true })))
      setSuccess('Alle als gelesen markiert')
      setTimeout(() => setSuccess(null), 3000)
    } catch { setError('Netzwerkfehler') }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Benachrichtigungen</h1>
          <p className="admin-subtitle">
            {rows.length} Benachrichtigungen{unreadCount > 0 && <> &middot; <span style={{ color: '#D04B3B' }}>{unreadCount} ungelesen</span></>}
          </p>
        </div>
        {unreadCount > 0 && (
          <button style={primaryBtn} onClick={markAllRead}>Alle gelesen</button>
        )}
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={filterKategorie} onChange={e => setFilterKategorie(e.target.value)} style={selectStyle}>
          <option value="all">Alle Kategorien</option>
          {Object.entries(BENACHRICHTIGUNG_KATEGORIE).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {loading ? <p>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th>Typ</th>
                <th>Kategorie</th>
                <th>Titel</th>
                <th>Inhalt</th>
                <th>Datum</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={6}>
                  {filterKategorie !== 'all' ? 'Keine Treffer' : 'Keine Benachrichtigungen'}
                </EmptyRow>
              ) : filtered.map(r => {
                const typ = statusMeta(BENACHRICHTIGUNG_TYP, r.typ)
                const kat = statusMeta(BENACHRICHTIGUNG_KATEGORIE, r.kategorie)
                return (
                  <tr
                    key={r.id}
                    style={{ fontWeight: r.gelesen ? 400 : 600, cursor: r.gelesen ? 'default' : 'pointer' }}
                    {...(r.gelesen ? {} : klickbareZeile(() => markAsRead(r.id)))}
                  >
                    <td>
                      {!r.gelesen && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} />}
                    </td>
                    <td><StatusBadge label={typ.label} color={typ.color} /></td>
                    <td>
                      {r.kategorie
                        ? <StatusBadge label={kat.label} color={kat.color} />
                        : '—'}
                    </td>
                    <td style={{ fontWeight: r.gelesen ? 400 : 600 }}>{r.titel}</td>
                    <td style={{ fontSize: 13, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.inhalt || '—'}
                    </td>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{timeAgo(r.created_at)}</td>
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
