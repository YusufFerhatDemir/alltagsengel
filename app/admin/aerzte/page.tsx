'use client'
// ═══════════════════════════════════════════════════════════════
// Aerzte & Praxen — Stammdatenverwaltung fuer Aerzte, Praxen
// und Ueberweiser mit LANR/BSNR fuer HKP und 302 SGB V.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface Arzt {
  id: string
  anrede: string | null
  titel: string | null
  vorname: string
  nachname: string
  fachrichtung: string | null
  lanr: string | null
  bsnr: string | null
  praxis_name: string | null
  strasse: string | null
  plz: string | null
  ort: string | null
  telefon: string | null
  fax: string | null
  email: string | null
  mobiltelefon: string | null
  notizen: string | null
  aktiv: boolean
}

const FACHRICHTUNGEN: Record<string, string> = {
  allgemeinmedizin: 'Allgemeinmedizin',
  innere_medizin: 'Innere Medizin',
  neurologie: 'Neurologie',
  psychiatrie: 'Psychiatrie',
  orthopaedie: 'Orthopaedie',
  chirurgie: 'Chirurgie',
  urologie: 'Urologie',
  gynaekologie: 'Gynaekologie',
  dermatologie: 'Dermatologie',
  hno: 'HNO',
  augenheilkunde: 'Augenheilkunde',
  kardiologie: 'Kardiologie',
  pneumologie: 'Pneumologie',
  gastroenterologie: 'Gastroenterologie',
  onkologie: 'Onkologie',
  palliativmedizin: 'Palliativmedizin',
  geriatrie: 'Geriatrie',
  zahnmedizin: 'Zahnmedizin',
  sonstige: 'Sonstige',
}

const ANREDEN = ['', 'Dr.', 'Prof. Dr.', 'PD Dr.', 'Dr. med.', 'Prof. Dr. med.']

const EMPTY_FORM = {
  anrede: '',
  titel: '',
  vorname: '',
  nachname: '',
  fachrichtung: '',
  lanr: '',
  bsnr: '',
  praxis_name: '',
  strasse: '',
  plz: '',
  ort: '',
  telefon: '',
  fax: '',
  email: '',
  mobiltelefon: '',
  notizen: '',
}
type FormState = typeof EMPTY_FORM

function arztAnzeigeName(a: Arzt): string {
  const teile: string[] = []
  if (a.anrede) teile.push(a.anrede)
  if (a.titel) teile.push(a.titel)
  teile.push(a.vorname, a.nachname)
  return teile.join(' ')
}

export default function AdminAerztePage() {
  const [aerzte, setAerzte] = useState<Arzt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [fachFilter, setFachFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'aktiv' | 'inaktiv'>('aktiv')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/aerzte')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || `Fehler ${res.status}`)
        setLoading(false)
        return
      }
      const body = await res.json()
      setAerzte((body.aerzte || []) as Arzt[])
    } catch {
      setError('Unerwarteter Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return aerzte.filter(a => {
      if (statusFilter === 'aktiv' && !a.aktiv) return false
      if (statusFilter === 'inaktiv' && a.aktiv) return false
      if (fachFilter !== 'all' && a.fachrichtung !== fachFilter) return false
      if (!q) return true
      const name = arztAnzeigeName(a).toLowerCase()
      return name.includes(q)
        || (a.praxis_name || '').toLowerCase().includes(q)
        || (a.lanr || '').includes(q)
        || (a.bsnr || '').includes(q)
        || (a.ort || '').toLowerCase().includes(q)
        || (a.email || '').toLowerCase().includes(q)
    })
  }, [aerzte, search, fachFilter, statusFilter])

  // Statistiken
  const statsAktiv = aerzte.filter(a => a.aktiv).length
  const statsInaktiv = aerzte.filter(a => !a.aktiv).length
  const statsMitLanr = aerzte.filter(a => a.aktiv && a.lanr).length

  // Fachrichtungen die tatsaechlich vorkommen
  const vorkommendeFachrichtungen = useMemo(() => {
    const set = new Set<string>()
    aerzte.forEach(a => { if (a.fachrichtung) set.add(a.fachrichtung) })
    return Array.from(set).sort()
  }, [aerzte])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(a: Arzt) {
    setEditingId(a.id)
    setForm({
      anrede: a.anrede || '',
      titel: a.titel || '',
      vorname: a.vorname,
      nachname: a.nachname,
      fachrichtung: a.fachrichtung || '',
      lanr: a.lanr || '',
      bsnr: a.bsnr || '',
      praxis_name: a.praxis_name || '',
      strasse: a.strasse || '',
      plz: a.plz || '',
      ort: a.ort || '',
      telefon: a.telefon || '',
      fax: a.fax || '',
      email: a.email || '',
      mobiltelefon: a.mobiltelefon || '',
      notizen: a.notizen || '',
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.vorname.trim() || !form.nachname.trim()) {
      setError('Vorname und Nachname sind Pflichtfelder.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        anrede: form.anrede || null,
        titel: form.titel || null,
        vorname: form.vorname.trim(),
        nachname: form.nachname.trim(),
        fachrichtung: form.fachrichtung || null,
        lanr: form.lanr || null,
        bsnr: form.bsnr || null,
        praxis_name: form.praxis_name || null,
        strasse: form.strasse || null,
        plz: form.plz || null,
        ort: form.ort || null,
        telefon: form.telefon || null,
        fax: form.fax || null,
        email: form.email || null,
        mobiltelefon: form.mobiltelefon || null,
        notizen: form.notizen || null,
      }

      const url = editingId ? `/api/admin/aerzte/${editingId}` : '/api/admin/aerzte'
      const method = editingId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || `Speichern fehlgeschlagen (${res.status})`)
        setSaving(false)
        return
      }

      setShowForm(false)
      await load()
    } catch (err: any) {
      setError(`Unerwarteter Fehler: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(id: string) {
    if (!window.confirm('Arzt wirklich deaktivieren?')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/aerzte/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || `Deaktivieren fehlgeschlagen (${res.status})`)
        return
      }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function reactivate(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/aerzte/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktiv: true }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || `Reaktivieren fehlgeschlagen (${res.status})`)
        return
      }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Aerzte &amp; Praxen</h1>
          <p className="admin-subtitle">Stammdatenverwaltung fuer Aerzte, Praxen und Ueberweiser</p>
        </div>
        <button onClick={openCreate} style={primaryBtn}>+ Neuer Arzt</button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--gold)' }}>{statsAktiv}</div>
          <div style={{ fontSize: 12, color: 'var(--ink4)' }}>Aktive Aerzte</div>
        </div>
        <div className="admin-stat-card">
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink4)' }}>{statsInaktiv}</div>
          <div style={{ fontSize: 12, color: 'var(--ink4)' }}>Inaktiv</div>
        </div>
        <div className="admin-stat-card">
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--gold)' }}>{statsMitLanr}</div>
          <div style={{ fontSize: 12, color: 'var(--ink4)' }}>Mit LANR</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Name, Praxis, LANR, BSNR, Ort, E-Mail..." />
      </div>

      <div className="admin-filters">
        <button className={`admin-filter-btn ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>Alle</button>
        <button className={`admin-filter-btn ${statusFilter === 'aktiv' ? 'active' : ''}`} onClick={() => setStatusFilter('aktiv')}>Aktiv</button>
        <button className={`admin-filter-btn ${statusFilter === 'inaktiv' ? 'active' : ''}`} onClick={() => setStatusFilter('inaktiv')}>Inaktiv</button>

        <select value={fachFilter} onChange={e => setFachFilter(e.target.value)} style={{ ...input, marginLeft: 8 }}>
          <option value="all">Alle Fachrichtungen</option>
          {vorkommendeFachrichtungen.map(f => (
            <option key={f} value={f}>{FACHRICHTUNGEN[f] || f}</option>
          ))}
        </select>
      </div>

      {showForm && (
        <div style={formCard}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>{editingId ? 'Arzt bearbeiten' : 'Neuen Arzt anlegen'}</h3>
          <div style={formGrid}>
            <label style={fieldLabel}>
              Anrede
              <select value={form.anrede} onChange={e => setForm({ ...form, anrede: e.target.value })} style={input}>
                <option value="">-- keine --</option>
                {ANREDEN.filter(Boolean).map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Titel
              <input value={form.titel} onChange={e => setForm({ ...form, titel: e.target.value })} style={input} placeholder="z. B. med., phil." />
            </label>
            <label style={fieldLabel}>
              Vorname *
              <input value={form.vorname} onChange={e => setForm({ ...form, vorname: e.target.value })} style={input} placeholder="Vorname" />
            </label>
            <label style={fieldLabel}>
              Nachname *
              <input value={form.nachname} onChange={e => setForm({ ...form, nachname: e.target.value })} style={input} placeholder="Nachname" />
            </label>
            <label style={fieldLabel}>
              Fachrichtung
              <select value={form.fachrichtung} onChange={e => setForm({ ...form, fachrichtung: e.target.value })} style={input}>
                <option value="">-- keine --</option>
                {Object.entries(FACHRICHTUNGEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Praxisname
              <input value={form.praxis_name} onChange={e => setForm({ ...form, praxis_name: e.target.value })} style={input} placeholder="z. B. Gemeinschaftspraxis am Markt" />
            </label>
            <label style={fieldLabel}>
              LANR (9-stellig)
              <input value={form.lanr} onChange={e => setForm({ ...form, lanr: e.target.value })} style={input} placeholder="123456789" maxLength={9} />
            </label>
            <label style={fieldLabel}>
              BSNR (9-stellig)
              <input value={form.bsnr} onChange={e => setForm({ ...form, bsnr: e.target.value })} style={input} placeholder="123456789" maxLength={9} />
            </label>
            <label style={fieldLabel}>
              Strasse
              <input value={form.strasse} onChange={e => setForm({ ...form, strasse: e.target.value })} style={input} placeholder="Musterstr. 1" />
            </label>
            <label style={fieldLabel}>
              PLZ
              <input value={form.plz} onChange={e => setForm({ ...form, plz: e.target.value })} style={input} placeholder="60311" maxLength={5} />
            </label>
            <label style={fieldLabel}>
              Ort
              <input value={form.ort} onChange={e => setForm({ ...form, ort: e.target.value })} style={input} placeholder="Frankfurt am Main" />
            </label>
            <label style={fieldLabel}>
              Telefon
              <input value={form.telefon} onChange={e => setForm({ ...form, telefon: e.target.value })} style={input} placeholder="069 12345678" />
            </label>
            <label style={fieldLabel}>
              Fax
              <input value={form.fax} onChange={e => setForm({ ...form, fax: e.target.value })} style={input} placeholder="069 12345679" />
            </label>
            <label style={fieldLabel}>
              E-Mail
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={input} placeholder="praxis@beispiel.de" />
            </label>
            <label style={fieldLabel}>
              Mobiltelefon
              <input value={form.mobiltelefon} onChange={e => setForm({ ...form, mobiltelefon: e.target.value })} style={input} placeholder="0170 1234567" />
            </label>
            <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>
              Notizen
              <textarea value={form.notizen} onChange={e => setForm({ ...form, notizen: e.target.value })} style={{ ...input, minHeight: 50, resize: 'vertical' }} placeholder="Interne Notizen, Besonderheiten..." />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={save} disabled={saving} style={primaryBtn}>
              {saving ? 'Speichern...' : (editingId ? 'Aenderungen speichern' : 'Arzt anlegen')}
            </button>
            <button onClick={() => setShowForm(false)} style={secondaryBtn}>Abbrechen</button>
          </div>
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Fachrichtung</th>
              <th>Praxis</th>
              <th>LANR</th>
              <th>BSNR</th>
              <th>Telefon</th>
              <th>E-Mail</th>
              <th>Status</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <EmptyRow colSpan={9}>Laden...</EmptyRow>
              : filtered.length === 0
                ? <EmptyRow colSpan={9}>{search || fachFilter !== 'all' ? 'Keine Treffer' : 'Noch keine Aerzte erfasst'}</EmptyRow>
                : filtered.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{arztAnzeigeName(a)}</td>
                    <td style={{ fontSize: 13 }}>{a.fachrichtung ? (FACHRICHTUNGEN[a.fachrichtung] || a.fachrichtung) : '—'}</td>
                    <td style={{ fontSize: 13 }}>{a.praxis_name || '—'}</td>
                    <td style={{ fontSize: 13, fontFamily: 'monospace' }}>{a.lanr || '—'}</td>
                    <td style={{ fontSize: 13, fontFamily: 'monospace' }}>{a.bsnr || '—'}</td>
                    <td style={{ fontSize: 13 }}>{a.telefon || '—'}</td>
                    <td style={{ fontSize: 13 }}>{a.email || '—'}</td>
                    <td>
                      <StatusBadge
                        label={a.aktiv ? 'Aktiv' : 'Inaktiv'}
                        color={a.aktiv ? 'green' : 'gray'}
                      />
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(a)} style={miniBtn}>Bearbeiten</button>
                      {a.aktiv ? (
                        <button onClick={() => deactivate(a.id)} disabled={busyId === a.id} style={{ ...miniBtn, color: '#D04B3B' }}>Deaktivieren</button>
                      ) : (
                        <button onClick={() => reactivate(a.id)} disabled={busyId === a.id} style={{ ...miniBtn, color: 'var(--gold)' }}>Reaktivieren</button>
                      )}
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
