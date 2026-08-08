'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  statusMeta, formatDate, timeAgo,
  NACHRICHTEN_KATEGORIE, NACHRICHTEN_PRIORITAET,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface NachrichtRow {
  id: string
  betreff: string
  inhalt: string | null
  absender_name: string | null
  kategorie: string | null
  prioritaet: string
  gelesen: boolean
  antworten_anzahl: number
  created_at: string | null
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal3)', color: 'var(--ink)', fontSize: 14,
  fontFamily: "'Jost',sans-serif", boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal2)', color: 'var(--ink)', fontSize: 13,
  fontFamily: "'Jost',sans-serif", cursor: 'pointer',
}

export default function NachrichtenPage() {
  const [rows, setRows] = useState<NachrichtRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterKategorie, setFilterKategorie] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/ops/nachrichten')
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setRows(data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const unreadCount = rows.filter(r => !r.gelesen).length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filterKategorie !== 'all' && r.kategorie !== filterKategorie) return false
      if (!q) return true
      return r.betreff.toLowerCase().includes(q) ||
        (r.absender_name || '').toLowerCase().includes(q) ||
        (r.inhalt || '').toLowerCase().includes(q)
    })
  }, [rows, filterKategorie, search])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Nachrichten</h1>
          <p className="admin-subtitle">
            {rows.length} Nachrichten{unreadCount > 0 && <> &middot; <span style={{ color: '#D04B3B' }}>{unreadCount} ungelesen</span></>}
          </p>
        </div>
        <button style={primaryBtn} onClick={() => setShowCreate(true)}>+ Neue Nachricht</button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Betreff, Absender..." />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={filterKategorie} onChange={e => setFilterKategorie(e.target.value)} style={selectStyle}>
          <option value="all">Alle Kategorien</option>
          {Object.entries(NACHRICHTEN_KATEGORIE).map(([k, v]) => (
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
                <th>Betreff</th>
                <th>Absender</th>
                <th>Kategorie</th>
                <th>Priorität</th>
                <th>Datum</th>
                <th>Antworten</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={7}>
                  {search || filterKategorie !== 'all' ? 'Keine Treffer' : 'Keine Nachrichten'}
                </EmptyRow>
              ) : filtered.map(r => {
                const kat = statusMeta(NACHRICHTEN_KATEGORIE, r.kategorie)
                const prio = statusMeta(NACHRICHTEN_PRIORITAET, r.prioritaet)
                return (
                  <tr key={r.id} style={{ fontWeight: r.gelesen ? 400 : 600 }}>
                    <td>
                      {!r.gelesen && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} />}
                    </td>
                    <td>
                      <Link href={`/admin/nachrichten/${r.id}`} style={{ color: 'var(--gold)', textDecoration: 'none', fontWeight: r.gelesen ? 400 : 600 }}>
                        {r.betreff}
                      </Link>
                    </td>
                    <td style={{ fontSize: 13 }}>{r.absender_name || '—'}</td>
                    <td>
                      {r.kategorie
                        ? <StatusBadge label={kat.label} color={kat.color} />
                        : '—'}
                    </td>
                    <td><StatusBadge label={prio.label} color={prio.color} /></td>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{timeAgo(r.created_at)}</td>
                    <td style={{ fontSize: 13, textAlign: 'center' }}>{r.antworten_anzahl || 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateNachrichtModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}

function CreateNachrichtModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    betreff: '',
    inhalt: '',
    empfaenger_ids: '',
    kategorie: 'allgemein',
    prioritaet: 'normal',
  })

  function upd(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.betreff.trim()) { setError('Betreff ist erforderlich'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/ops/nachrichten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          betreff: form.betreff.trim(),
          inhalt: form.inhalt.trim() || null,
          empfaenger_ids: form.empfaenger_ids ? form.empfaenger_ids.split(',').map(s => s.trim()).filter(Boolean) : [],
          kategorie: form.kategorie,
          prioritaet: form.prioritaet,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Fehler beim Senden')
        setSaving(false)
        return
      }
      onCreated()
    } catch {
      setError('Netzwerkfehler')
      setSaving(false)
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Neue Nachricht</h2>
        {error && <Banner tone="danger">{error}</Banner>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink4)', display: 'block', marginBottom: 4 }}>Betreff *</label>
              <input style={inputStyle} value={form.betreff} onChange={e => upd('betreff', e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink4)', display: 'block', marginBottom: 4 }}>Inhalt</label>
              <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} value={form.inhalt} onChange={e => upd('inhalt', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink4)', display: 'block', marginBottom: 4 }}>Empfänger-IDs</label>
              <input style={inputStyle} value={form.empfaenger_ids} onChange={e => upd('empfaenger_ids', e.target.value)} placeholder="Kommagetrennte UUIDs" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink4)', display: 'block', marginBottom: 4 }}>Kategorie</label>
              <select style={inputStyle} value={form.kategorie} onChange={e => upd('kategorie', e.target.value)}>
                {Object.entries(NACHRICHTEN_KATEGORIE).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink4)', display: 'block', marginBottom: 4 }}>Priorität</label>
              <select style={inputStyle} value={form.prioritaet} onChange={e => upd('prioritaet', e.target.value)}>
                {Object.entries(NACHRICHTEN_PRIORITAET).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={secondaryBtn}>Abbrechen</button>
            <button type="submit" style={primaryBtn} disabled={saving}>
              {saving ? 'Sende...' : 'Senden'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}

const modalStyle: React.CSSProperties = {
  background: 'var(--coal)', borderRadius: 16, padding: 24,
  width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto',
  border: '1px solid var(--border)',
}
