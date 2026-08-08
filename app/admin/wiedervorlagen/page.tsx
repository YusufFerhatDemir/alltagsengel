'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  statusMeta, formatDate,
  WIEDERVORLAGE_STATUS, WIEDERVORLAGE_DRINGLICHKEIT,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface WiedervorlageRow {
  id: string
  titel: string
  beschreibung: string | null
  entitaet_typ: string | null
  entitaet_id: string | null
  faellig_am: string | null
  empfaenger_name: string | null
  status: string
  dringlichkeit: string | null
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

export default function WiedervorlagenPage() {
  const [rows, setRows] = useState<WiedervorlageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/ops/wiedervorlagen')
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setRows(data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false
      if (!q) return true
      return r.titel.toLowerCase().includes(q) ||
        (r.beschreibung || '').toLowerCase().includes(q) ||
        (r.empfaenger_name || '').toLowerCase().includes(q)
    })
  }, [rows, filterStatus, search])

  async function updateStatus(id: string, status: string) {
    try {
      const res = await fetch(`/api/ops/wiedervorlagen/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) { setError('Fehler beim Aktualisieren'); return }
      setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r))
      setSuccess(`Status auf "${statusMeta(WIEDERVORLAGE_STATUS, status).label}" gesetzt`)
      setTimeout(() => setSuccess(null), 3000)
    } catch { setError('Netzwerkfehler') }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Wiedervorlagen</h1>
          <p className="admin-subtitle">
            {rows.length} Wiedervorlagen &middot; {rows.filter(r => r.status === 'aktiv').length} aktiv
          </p>
        </div>
        <button style={primaryBtn} onClick={() => setShowCreate(true)}>+ Neue Wiedervorlage</button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Titel, Beschreibung, Empfänger..." />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="all">Alle Status</option>
          {Object.entries(WIEDERVORLAGE_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {loading ? <p>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Dringlichkeit</th>
                <th>Titel</th>
                <th>Beschreibung</th>
                <th>Entität-Typ</th>
                <th>Fällig am</th>
                <th>Empfänger</th>
                <th>Status</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={8}>
                  {search || filterStatus !== 'all' ? 'Keine Treffer' : 'Keine Wiedervorlagen'}
                </EmptyRow>
              ) : filtered.map(r => {
                const dring = statusMeta(WIEDERVORLAGE_DRINGLICHKEIT, r.dringlichkeit)
                const st = statusMeta(WIEDERVORLAGE_STATUS, r.status)
                return (
                  <tr key={r.id}>
                    <td>
                      {r.dringlichkeit
                        ? <StatusBadge label={dring.label} color={dring.color} />
                        : '—'}
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.titel}</td>
                    <td style={{ fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.beschreibung || '—'}
                    </td>
                    <td style={{ fontSize: 13 }}>{r.entitaet_typ || '—'}</td>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(r.faellig_am)}</td>
                    <td style={{ fontSize: 13 }}>{r.empfaenger_name || '—'}</td>
                    <td><StatusBadge label={st.label} color={st.color} /></td>
                    <td>
                      {r.status === 'aktiv' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => updateStatus(r.id, 'erledigt')} style={secondaryBtn}>Erledigen</button>
                          <button onClick={() => updateStatus(r.id, 'storniert')} style={{ ...secondaryBtn, color: '#D04B3B' }}>Stornieren</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateWiedervorlageModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}

function CreateWiedervorlageModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    titel: '',
    beschreibung: '',
    entitaet_typ: '',
    entitaet_id: '',
    faellig_am: '',
    empfaenger_id: '',
  })

  function upd(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titel.trim()) { setError('Titel ist erforderlich'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/ops/wiedervorlagen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titel: form.titel.trim(),
          beschreibung: form.beschreibung.trim() || null,
          entitaet_typ: form.entitaet_typ.trim() || null,
          entitaet_id: form.entitaet_id.trim() || null,
          faellig_am: form.faellig_am || null,
          empfaenger_id: form.empfaenger_id.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Fehler beim Erstellen')
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
        <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Neue Wiedervorlage</h2>
        {error && <Banner tone="danger">{error}</Banner>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink4)', display: 'block', marginBottom: 4 }}>Titel *</label>
              <input style={inputStyle} value={form.titel} onChange={e => upd('titel', e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink4)', display: 'block', marginBottom: 4 }}>Beschreibung</label>
              <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.beschreibung} onChange={e => upd('beschreibung', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink4)', display: 'block', marginBottom: 4 }}>Entität-Typ</label>
              <input style={inputStyle} value={form.entitaet_typ} onChange={e => upd('entitaet_typ', e.target.value)} placeholder="z.B. aufgabe, kunde, einsatz" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink4)', display: 'block', marginBottom: 4 }}>Entität-ID</label>
              <input style={inputStyle} value={form.entitaet_id} onChange={e => upd('entitaet_id', e.target.value)} placeholder="UUID" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink4)', display: 'block', marginBottom: 4 }}>Fällig am</label>
              <input type="date" style={inputStyle} value={form.faellig_am} onChange={e => upd('faellig_am', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink4)', display: 'block', marginBottom: 4 }}>Empfänger-ID</label>
              <input style={inputStyle} value={form.empfaenger_id} onChange={e => upd('empfaenger_id', e.target.value)} placeholder="UUID des Empfängers" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={secondaryBtn}>Abbrechen</button>
            <button type="submit" style={primaryBtn} disabled={saving}>
              {saving ? 'Erstelle...' : 'Erstellen'}
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
