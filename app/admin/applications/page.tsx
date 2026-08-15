'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate, timeAgo, statusMeta,
  APPLICATION_STATUS, APPLICATION_FLOW, APPLICATION_SOURCE,
} from '@/lib/admin/ops'
import { updateApplicationStatus, createApplication } from './actions'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface AppRow {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  source: string | null
  referred_by_caregiver_id: string | null
  referredBy: string | null
  position: string | null
  status: string
  notes: string | null
  interview_date: string | null
  created_at: string | null
}

export default function AdminApplicationsPage() {
  const [rows, setRows] = useState<AppRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  async function load() {
    try {
      const supabase = createClient()
      const [appRes, cgRes] = await Promise.all([
        supabase.from('applications').select('*').order('created_at', { ascending: false }),
        supabase.from('caregivers').select('id, first_name, last_name'),
      ])
      if (appRes.error) { setError(appRes.error.message); setLoading(false); return }
      const cgMap = new Map<string, string>()
      ;(cgRes.data || []).forEach((c: any) => cgMap.set(c.id, `${c.first_name} ${c.last_name}`.trim()))
      setRows((appRes.data || []).map((a: any) => ({
        id: a.id, first_name: a.first_name, last_name: a.last_name, email: a.email, phone: a.phone,
        source: a.source, referred_by_caregiver_id: a.referred_by_caregiver_id,
        referredBy: a.referred_by_caregiver_id ? (cgMap.get(a.referred_by_caregiver_id) || 'Mitarbeiter') : null,
        position: a.position, status: a.status || 'new', notes: a.notes,
        interview_date: a.interview_date, created_at: a.created_at,
      })))
    } catch (err) {
      console.error('Applications load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function setStatus(app: AppRow, status: string) {
    const result = await updateApplicationStatus(app.id, status)
    if (!result.ok) { setError(result.error); return }
    setRows(prev => prev.map(r => r.id === app.id ? { ...r, status } : r))
  }

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    rows.forEach(r => { m[r.status] = (m[r.status] || 0) + 1 })
    return m
  }, [rows])

  const referralCount = useMemo(() => rows.filter(r => r.referred_by_caregiver_id).length, [rows])
  const openCount = useMemo(() => rows.filter(r => !['accepted', 'rejected'].includes(r.status)).length, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false
      if (!q) return true
      return `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) || (r.position || '').toLowerCase().includes(q)
    })
  }, [rows, filter, search])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Bewerbungen</h1>
          <p className="admin-subtitle">{rows.length} Bewerbungen · {openCount} offen · {referralCount} per Empfehlung</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={primaryBtn}>+ Bewerbung erfassen</button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Name, E-Mail, Position…" />
      </div>

      <div className="admin-filters">
        <button className={`admin-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          Alle ({rows.length})
        </button>
        {APPLICATION_FLOW.map(f => (
          <button key={f} className={`admin-filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {statusMeta(APPLICATION_STATUS, f).label} ({counts[f] || 0})
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Name</th><th>Position</th><th>Quelle</th><th>Eingegangen</th><th>Status</th><th>Aktion</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={6}>{search || filter !== 'all' ? 'Keine Treffer' : 'Noch keine Bewerbungen'}</EmptyRow>
              ) : filtered.map(a => {
                const sm = statusMeta(APPLICATION_STATUS, a.status)
                const src = a.source ? (APPLICATION_SOURCE[a.source] || APPLICATION_SOURCE.sonstige) : null
                const isOpen = expanded === a.id
                const idx = APPLICATION_FLOW.indexOf(a.status)
                const next = idx >= 0 && idx < 4 ? APPLICATION_FLOW[idx + 1] : null
                return (
                  <Fragment key={a.id}>
                    <tr onClick={() => setExpanded(isOpen ? null : a.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 600 }}>
                        {a.first_name} {a.last_name}
                        {a.referred_by_caregiver_id && <span title={`Empfohlen von ${a.referredBy}`} style={{ marginLeft: 6 }}>🤝</span>}
                      </td>
                      <td style={{ fontSize: 13 }}>{a.position || '—'}</td>
                      <td style={{ fontSize: 13 }}>{src ? `${src.emoji} ${src.label}` : '—'}</td>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{timeAgo(a.created_at)}</td>
                      <td><StatusBadge label={sm.label} color={sm.color} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {next && (
                            <button onClick={() => setStatus(a, next)} style={actionBtn}>
                              → {statusMeta(APPLICATION_STATUS, next).label}
                            </button>
                          )}
                          {a.status !== 'rejected' && a.status !== 'accepted' && (
                            <button onClick={() => setStatus(a, 'rejected')} style={rejectBtn}>Ablehnen</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--coal3)', padding: 16 }}>
                          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, marginBottom: a.notes ? 10 : 0 }}>
                            {a.email && <span style={{ color: 'var(--ink3)' }}>✉️ {a.email}</span>}
                            {a.phone && <span style={{ color: 'var(--ink3)' }}>📞 {a.phone}</span>}
                            {a.referredBy && <span style={{ color: 'var(--ink3)' }}>🤝 Empfohlen von {a.referredBy}</span>}
                            {a.interview_date && <span style={{ color: 'var(--ink3)' }}>📅 Gespräch: {formatDate(a.interview_date)}</span>}
                            <span style={{ color: 'var(--ink5)' }}>Eingegangen: {formatDate(a.created_at)}</span>
                          </div>
                          {a.notes && <div style={{ fontSize: 13, color: 'var(--ink2)' }}>{a.notes}</div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateAppModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load() }} />}
    </div>
  )
}

function CreateAppModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [caregivers, setCaregivers] = useState<{ id: string; label: string }[]>([])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [position, setPosition] = useState('')
  const [source, setSource] = useState('indeed')
  const [referredBy, setReferredBy] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase.from('caregivers').select('id, first_name, last_name').order('last_name')
      setCaregivers((data || []).map((c: any) => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim() })))
    }
    load()
  }, [])

  async function save() {
    setErr(null)
    if (!firstName.trim() || !lastName.trim()) { setErr('Bitte Vor- und Nachname angeben.'); return }
    setSaving(true)
    const result = await createApplication({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      position: position.trim() || null,
      source,
      referred_by_caregiver_id: source === 'empfehlung' && referredBy ? referredBy : null,
      notes: notes.trim() || null,
    })
    if (!result.ok) { setErr(result.error); setSaving(false); return }
    onCreated()
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: 500, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>Neue Bewerbung erfassen</h3>
        {err && <Banner tone="danger">{err}</Banner>}
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Vorname *"><input value={firstName} onChange={e => setFirstName(e.target.value)} style={modalInput} /></Field>
          <Field label="Nachname *"><input value={lastName} onChange={e => setLastName(e.target.value)} style={modalInput} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="E-Mail"><input value={email} onChange={e => setEmail(e.target.value)} style={modalInput} /></Field>
          <Field label="Telefon"><input value={phone} onChange={e => setPhone(e.target.value)} style={modalInput} /></Field>
        </div>
        <Field label="Position"><input value={position} onChange={e => setPosition(e.target.value)} placeholder="z. B. Alltagsbegleitung (Minijob)" style={modalInput} /></Field>
        <Field label="Quelle">
          <select value={source} onChange={e => setSource(e.target.value)} style={modalSelect}>
            {Object.entries(APPLICATION_SOURCE).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
        {source === 'empfehlung' && (
          <Field label="Empfohlen von (Mitarbeiter-werben-Mitarbeiter)">
            <select value={referredBy} onChange={e => setReferredBy(e.target.value)} style={modalSelect}>
              <option value="">— wählen —</option>
              {caregivers.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Notiz"><input value={notes} onChange={e => setNotes(e.target.value)} style={modalInput} /></Field>
        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose}>Abbrechen</button>
          <button className="btn-confirm" onClick={save} disabled={saving}>{saving ? 'Speichern…' : 'Bewerbung anlegen'}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0, marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{label}</span>
      <div style={{ marginTop: 3 }}>{children}</div>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const actionBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const rejectBtn: React.CSSProperties = {
  fontSize: 12, color: '#D04B3B', background: 'rgba(208,75,59,0.1)',
  border: '1px solid rgba(208,75,59,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const modalInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box', marginBottom: 0,
}
const modalSelect: React.CSSProperties = { ...modalInput }
