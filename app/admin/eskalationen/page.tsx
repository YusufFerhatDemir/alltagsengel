'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  statusMeta,
  AUFGABEN_KATEGORIE, AUFGABEN_PRIORITAET, ESKALATION_AN_ROLLE,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface EskalationsregelRow {
  id: string
  name: string
  aufgaben_kategorie: string | null
  aufgaben_prioritaet: string | null
  ueberfaellig_stunden: number | null
  eskalationsstufe: number
  eskalation_an_rolle: string | null
  aktiv: boolean
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

export default function EskalationenPage() {
  const [rows, setRows] = useState<EskalationsregelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editRow, setEditRow] = useState<EskalationsregelRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/ops/eskalationsregeln')
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setRows(data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.name.toLowerCase().includes(q))
  }, [rows, search])

  async function toggleAktiv(r: EskalationsregelRow) {
    try {
      const res = await fetch(`/api/ops/eskalationsregeln/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktiv: !r.aktiv }),
      })
      if (!res.ok) { setError('Fehler beim Aktualisieren'); return }
      setRows(prev => prev.map(x => x.id === r.id ? { ...x, aktiv: !x.aktiv } : x))
    } catch { setError('Netzwerkfehler') }
  }

  async function deleteRule(id: string) {
    if (!confirm('Regel wirklich löschen?')) return
    try {
      const res = await fetch(`/api/ops/eskalationsregeln/${id}`, { method: 'DELETE' })
      if (!res.ok) { setError('Fehler beim Löschen'); return }
      setRows(prev => prev.filter(x => x.id !== id))
      setSuccess('Regel gelöscht')
      setTimeout(() => setSuccess(null), 3000)
    } catch { setError('Netzwerkfehler') }
  }

  function openEdit(r: EskalationsregelRow) {
    setEditRow(r)
    setShowModal(true)
  }

  function openCreate() {
    setEditRow(null)
    setShowModal(true)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Eskalationsregeln</h1>
          <p className="admin-subtitle">
            {rows.length} Regeln &middot; {rows.filter(r => r.aktiv).length} aktiv
          </p>
        </div>
        <button style={primaryBtn} onClick={openCreate}>+ Neue Regel</button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Regelname..." />
      </div>

      {loading ? <p>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kategorie-Filter</th>
                <th>Priorität-Filter</th>
                <th>Überfällig (Std.)</th>
                <th>Stufe</th>
                <th>Rolle</th>
                <th>Aktiv</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={8}>
                  {search ? 'Keine Treffer' : 'Keine Eskalationsregeln'}
                </EmptyRow>
              ) : filtered.map(r => {
                const kat = r.aufgaben_kategorie ? statusMeta(AUFGABEN_KATEGORIE, r.aufgaben_kategorie) : null
                const prio = r.aufgaben_prioritaet ? statusMeta(AUFGABEN_PRIORITAET, r.aufgaben_prioritaet) : null
                const rolle = statusMeta(ESKALATION_AN_ROLLE, r.eskalation_an_rolle)
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td>{kat ? <StatusBadge label={kat.label} color={kat.color} /> : 'Alle'}</td>
                    <td>{prio ? <StatusBadge label={prio.label} color={prio.color} /> : 'Alle'}</td>
                    <td style={{ fontSize: 13, textAlign: 'center' }}>{r.ueberfaellig_stunden ?? '—'}</td>
                    <td style={{ fontSize: 13, textAlign: 'center' }}>{r.eskalationsstufe}</td>
                    <td><StatusBadge label={rolle.label} color={rolle.color} /></td>
                    <td>
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
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEdit(r)} style={secondaryBtn}>Bearbeiten</button>
                        <button onClick={() => deleteRule(r.id)} style={{ ...secondaryBtn, color: '#D04B3B' }}>Löschen</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <EskalationsregelModal
          initial={editRow}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

function EskalationsregelModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: EskalationsregelRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!initial
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: initial?.name || '',
    aufgaben_kategorie: initial?.aufgaben_kategorie || '',
    aufgaben_prioritaet: initial?.aufgaben_prioritaet || '',
    ueberfaellig_stunden: initial?.ueberfaellig_stunden?.toString() || '',
    eskalationsstufe: initial?.eskalationsstufe?.toString() || '1',
    eskalation_an_rolle: initial?.eskalation_an_rolle || 'admin',
    aktiv: initial?.aktiv ?? true,
  })

  function upd(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name ist erforderlich'); return }
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        aufgaben_kategorie: form.aufgaben_kategorie || null,
        aufgaben_prioritaet: form.aufgaben_prioritaet || null,
        ueberfaellig_stunden: form.ueberfaellig_stunden ? parseInt(form.ueberfaellig_stunden) : null,
        eskalationsstufe: parseInt(form.eskalationsstufe) || 1,
        eskalation_an_rolle: form.eskalation_an_rolle,
        aktiv: form.aktiv,
      }
      const url = isEdit ? `/api/ops/eskalationsregeln/${initial.id}` : '/api/ops/eskalationsregeln'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Fehler beim Speichern')
        setSaving(false)
        return
      }
      onSaved()
    } catch {
      setError('Netzwerkfehler')
      setSaving(false)
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>
          {isEdit ? 'Regel bearbeiten' : 'Neue Eskalationsregel'}
        </h2>
        {error && <Banner tone="danger">{error}</Banner>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input style={inputStyle} value={form.name} onChange={e => upd('name', e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Kategorie-Filter</label>
              <select style={inputStyle} value={form.aufgaben_kategorie} onChange={e => upd('aufgaben_kategorie', e.target.value)}>
                <option value="">Alle Kategorien</option>
                {Object.entries(AUFGABEN_KATEGORIE).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priorität-Filter</label>
              <select style={inputStyle} value={form.aufgaben_prioritaet} onChange={e => upd('aufgaben_prioritaet', e.target.value)}>
                <option value="">Alle Prioritäten</option>
                {Object.entries(AUFGABEN_PRIORITAET).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Überfällig nach (Stunden)</label>
              <input type="number" style={inputStyle} value={form.ueberfaellig_stunden} onChange={e => upd('ueberfaellig_stunden', e.target.value)} min="1" />
            </div>
            <div>
              <label style={labelStyle}>Stufe</label>
              <input type="number" style={inputStyle} value={form.eskalationsstufe} onChange={e => upd('eskalationsstufe', e.target.value)} min="1" max="5" />
            </div>
            <div>
              <label style={labelStyle}>Eskalation an Rolle</label>
              <select style={inputStyle} value={form.eskalation_an_rolle} onChange={e => upd('eskalation_an_rolle', e.target.value)}>
                {Object.entries(ESKALATION_AN_ROLLE).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" checked={form.aktiv as boolean} onChange={e => upd('aktiv', e.target.checked)} />
              <label style={{ fontSize: 13, color: 'var(--ink4)' }}>Regel ist aktiv</label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={secondaryBtn}>Abbrechen</button>
            <button type="submit" style={primaryBtn} disabled={saving}>
              {saving ? 'Speichere...' : isEdit ? 'Speichern' : 'Erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--ink4)', display: 'block', marginBottom: 4,
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
