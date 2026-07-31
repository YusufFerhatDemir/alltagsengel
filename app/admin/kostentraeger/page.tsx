'use client'
// ═══════════════════════════════════════════════════════════════
// Kostenträger-Kontakte — Kassen-/Sozialamt-/BG-Kontaktdatenbank
// für die Kassengenehmigung (Verordnungen · Tab 2) und den
// Rechnungsversand (Abrechnung).
// ═══════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BUNDESLAND_LABELS, KOSTENTRAEGER_TYP, statusMeta } from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface Kontakt {
  id: string
  name: string
  typ: string
  ik_nummer: string | null
  email: string | null
  post_adresse: string | null
  telefon: string | null
  fax: string | null
  bundesland: string | null
  elektronisch_abrechenbar: boolean
  notes: string | null
}

// Für die Kontaktdatenbank sind nur Kassen, Sozialämter und BGen relevant
// (kein "privat" — das ist kein Kontakt-Kostenträger).
const KONTAKT_TYPEN = Object.fromEntries(
  Object.entries(KOSTENTRAEGER_TYP).filter(([k]) => k !== 'privat')
)

const EMPTY_FORM = {
  name: '',
  typ: 'krankenkasse',
  ik_nummer: '',
  email: '',
  post_adresse: '',
  telefon: '',
  fax: '',
  bundesland: '',
  elektronisch_abrechenbar: false,
  notes: '',
}
type FormState = typeof EMPTY_FORM

export default function AdminKostentraegerPage() {
  const [kontakte, setKontakte] = useState<Kontakt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typFilter, setTypFilter] = useState('all')
  const [bundeslandFilter, setBundeslandFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error: e } = await supabase
        .from('kostentraeger_kontakte')
        .select('id, name, typ, ik_nummer, email, post_adresse, telefon, fax, bundesland, elektronisch_abrechenbar, notes')
        .order('name')
      if (e) { setError(e.message); setLoading(false); return }
      setKontakte((data || []) as Kontakt[])
    } catch (err: any) {
      setError('Unerwarteter Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return kontakte.filter(k => {
      if (typFilter !== 'all' && k.typ !== typFilter) return false
      if (bundeslandFilter !== 'all' && k.bundesland !== bundeslandFilter) return false
      if (!q) return true
      return k.name.toLowerCase().includes(q)
        || (k.ik_nummer || '').toLowerCase().includes(q)
        || (k.email || '').toLowerCase().includes(q)
    })
  }, [kontakte, search, typFilter, bundeslandFilter])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(k: Kontakt) {
    setEditingId(k.id)
    setForm({
      name: k.name,
      typ: k.typ,
      ik_nummer: k.ik_nummer || '',
      email: k.email || '',
      post_adresse: k.post_adresse || '',
      telefon: k.telefon || '',
      fax: k.fax || '',
      bundesland: k.bundesland || '',
      elektronisch_abrechenbar: k.elektronisch_abrechenbar,
      notes: k.notes || '',
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.name) {
      setError('Name ist Pflichtfeld.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const payload = {
        name: form.name,
        typ: form.typ,
        ik_nummer: form.ik_nummer || null,
        email: form.email || null,
        post_adresse: form.post_adresse || null,
        telefon: form.telefon || null,
        fax: form.fax || null,
        bundesland: form.bundesland || null,
        elektronisch_abrechenbar: form.elektronisch_abrechenbar,
        notes: form.notes || null,
      }
      const { error: e } = editingId
        ? await supabase.from('kostentraeger_kontakte').update(payload).eq('id', editingId)
        : await supabase.from('kostentraeger_kontakte').insert(payload)
      if (e) { setError(`Speichern fehlgeschlagen: ${e.message}`); setSaving(false); return }
      setShowForm(false)
      await load()
    } catch (err: any) {
      setError(`Unerwarteter Fehler: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Kontakt wirklich löschen?')) return
    setBusyId(id)
    try {
      const supabase = createClient()
      const { error: e } = await supabase.from('kostentraeger_kontakte').delete().eq('id', id)
      if (e) { setError(`Löschen fehlgeschlagen: ${e.message}`); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Kostenträger</h1>
          <p className="admin-subtitle">{kontakte.length} Kontakte · Kassen, Sozialämter, Berufsgenossenschaften</p>
        </div>
        <button onClick={openCreate} style={primaryBtn}>+ Neuer Kontakt</button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Name, IK-Nummer, E-Mail…" />
      </div>

      <div className="admin-filters">
        <button className={`admin-filter-btn ${typFilter === 'all' ? 'active' : ''}`} onClick={() => setTypFilter('all')}>Alle</button>
        {Object.entries(KONTAKT_TYPEN).map(([k, v]) => (
          <button key={k} className={`admin-filter-btn ${typFilter === k ? 'active' : ''}`} onClick={() => setTypFilter(k)}>{v.label}</button>
        ))}
        <select value={bundeslandFilter} onChange={e => setBundeslandFilter(e.target.value)} style={{ ...input, marginLeft: 8 }}>
          <option value="all">Alle Bundesländer</option>
          {Object.entries(BUNDESLAND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {showForm && (
        <div style={formCard}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>{editingId ? 'Kontakt bearbeiten' : 'Neuen Kontakt anlegen'}</h3>
          <div style={formGrid}>
            <label style={fieldLabel}>
              Name *
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={input} placeholder="z. B. AOK Hessen" />
            </label>
            <label style={fieldLabel}>
              Typ
              <select value={form.typ} onChange={e => setForm({ ...form, typ: e.target.value })} style={input}>
                {Object.entries(KONTAKT_TYPEN).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              IK-Nummer
              <input value={form.ik_nummer} onChange={e => setForm({ ...form, ik_nummer: e.target.value })} style={input} placeholder="Institutionskennzeichen" />
            </label>
            <label style={fieldLabel}>
              Bundesland
              <select value={form.bundesland} onChange={e => setForm({ ...form, bundesland: e.target.value })} style={input}>
                <option value="">— bundesweit / unbekannt —</option>
                {Object.entries(BUNDESLAND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              E-Mail
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Telefon
              <input value={form.telefon} onChange={e => setForm({ ...form, telefon: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Fax
              <input value={form.fax} onChange={e => setForm({ ...form, fax: e.target.value })} style={input} />
            </label>
            <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>
              Post-Adresse
              <textarea value={form.post_adresse} onChange={e => setForm({ ...form, post_adresse: e.target.value })} style={{ ...input, minHeight: 50, resize: 'vertical' }} />
            </label>
            <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.elektronisch_abrechenbar} onChange={e => setForm({ ...form, elektronisch_abrechenbar: e.target.checked })} />
              Elektronisch abrechenbar
            </label>
            <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>
              Notizen
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...input, minHeight: 50, resize: 'vertical' }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={save} disabled={saving} style={primaryBtn}>
              {saving ? 'Speichern…' : (editingId ? 'Änderungen speichern' : 'Kontakt anlegen')}
            </button>
            <button onClick={() => setShowForm(false)} style={secondaryBtn}>Abbrechen</button>
          </div>
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th><th>Typ</th><th>IK-Nummer</th><th>Bundesland</th>
              <th>E-Mail</th><th>Telefon</th><th>Elektr.</th><th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <EmptyRow colSpan={8}>Laden…</EmptyRow>
              : filtered.length === 0
                ? <EmptyRow colSpan={8}>{search || typFilter !== 'all' || bundeslandFilter !== 'all' ? 'Keine Treffer' : 'Noch keine Kontakte erfasst'}</EmptyRow>
                : filtered.map(k => (
                  <tr key={k.id}>
                    <td style={{ fontWeight: 600 }}>{k.name}</td>
                    <td><StatusBadge label={statusMeta(KOSTENTRAEGER_TYP, k.typ).label} color={statusMeta(KOSTENTRAEGER_TYP, k.typ).color} /></td>
                    <td style={{ fontSize: 13 }}>{k.ik_nummer || '—'}</td>
                    <td style={{ fontSize: 13 }}>{k.bundesland ? (BUNDESLAND_LABELS[k.bundesland] || k.bundesland) : 'bundesweit'}</td>
                    <td style={{ fontSize: 13 }}>{k.email || '—'}</td>
                    <td style={{ fontSize: 13 }}>{k.telefon || '—'}</td>
                    <td>{k.elektronisch_abrechenbar ? '✓' : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(k)} style={miniBtn}>Bearbeiten</button>
                      <button onClick={() => remove(k.id)} disabled={busyId === k.id} style={{ ...miniBtn, color: '#D04B3B' }}>Löschen</button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────
const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--ink)', fontWeight: 600,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const miniBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--ink)',
  background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit',
  marginRight: 6,
}

const formCard: React.CSSProperties = {
  background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12,
  padding: 18, marginBottom: 20,
}

const formGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12,
}

const fieldLabel: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12,
  color: 'var(--ink4)', fontWeight: 600,
}

const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 14, background: 'var(--coal)', color: 'var(--ink)',
  fontFamily: 'inherit', outline: 'none',
}
