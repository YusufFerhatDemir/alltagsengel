'use client'
// ═══════════════════════════════════════════════════════════════
// Verordnungs-Verwaltung — ärztliche Verordnungen + Genehmigungen
// der Pflegekasse. Überwacht Ablaufdaten (30/14 Tage-Ampel) und
// steuert Neuanträge, damit kein Klient ohne gültige Genehmigung
// betreut (und damit unbezahlt gearbeitet) wird.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate, fullName, statusMeta, daysUntil,
  VERORDNUNG_TYPE, GENEHMIGUNG_STATUS,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface Verordnung {
  id: string
  client_id: string
  verordnung_type: string
  ausstellungsdatum: string
  arzt_name: string | null
  arzt_praxis: string | null
  diagnose: string | null
  leistung_beschreibung: string | null
  genehmigung_status: string
  genehmigung_datum: string | null
  genehmigung_bis: string | null
  genehmigung_aktenzeichen: string | null
  neuantrag_erforderlich: boolean
  neuantrag_gestellt_am: string | null
  notes: string | null
  clientName: string
}

interface ClientOption {
  id: string
  name: string
}

const EMPTY_FORM = {
  client_id: '',
  verordnung_type: 'entlastung_45b',
  ausstellungsdatum: '',
  arzt_name: '',
  arzt_praxis: '',
  diagnose: '',
  leistung_beschreibung: '',
  genehmigung_status: 'ausstehend',
  genehmigung_datum: '',
  genehmigung_bis: '',
  genehmigung_aktenzeichen: '',
  notes: '',
}

type FormState = typeof EMPTY_FORM

// Ablauf-Ampel: ≤14 Tage rot, ≤30 Tage gelb — nur bei genehmigten
function expiryTone(v: Verordnung): 'red' | 'yellow' | null {
  if (v.genehmigung_status !== 'genehmigt' || !v.genehmigung_bis) return null
  const d = daysUntil(v.genehmigung_bis)
  if (d === null) return null
  if (d <= 14) return 'red'
  if (d <= 30) return 'yellow'
  return null
}

export default function AdminVerordnungenPage() {
  const [verordnungen, setVerordnungen] = useState<Verordnung[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
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
      const [vRes, cRes] = await Promise.all([
        supabase
          .from('verordnungen')
          .select('id, client_id, verordnung_type, ausstellungsdatum, arzt_name, arzt_praxis, diagnose, leistung_beschreibung, genehmigung_status, genehmigung_datum, genehmigung_bis, genehmigung_aktenzeichen, neuantrag_erforderlich, neuantrag_gestellt_am, notes, client:clients(first_name, last_name)')
          .order('genehmigung_bis', { ascending: true, nullsFirst: false }),
        supabase
          .from('clients')
          .select('id, first_name, last_name')
          .order('last_name', { ascending: true }),
      ])
      if (vRes.error) { setError(vRes.error.message); setLoading(false); return }
      setVerordnungen((vRes.data || []).map((v: any) => ({
        ...v,
        clientName: fullName(v.client),
      })))
      setClients((cRes.data || []).map((c: any) => ({ id: c.id, name: fullName(c) })))
    } catch (err: any) {
      console.error('Verordnungen Ladefehler:', err)
      setError('Unerwarteter Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return verordnungen.filter(v => {
      if (filter === 'expiring') {
        if (!expiryTone(v)) return false
      } else if (filter === 'neuantrag') {
        if (!v.neuantrag_erforderlich) return false
      } else if (filter !== 'all' && v.genehmigung_status !== filter) {
        return false
      }
      if (!q) return true
      return v.clientName.toLowerCase().includes(q)
        || (v.arzt_name || '').toLowerCase().includes(q)
        || (v.genehmigung_aktenzeichen || '').toLowerCase().includes(q)
    })
  }, [verordnungen, filter, search])

  // Gruppierung nach Klient
  const grouped = useMemo(() => {
    const map = new Map<string, { clientName: string; items: Verordnung[] }>()
    for (const v of filtered) {
      if (!map.has(v.client_id)) map.set(v.client_id, { clientName: v.clientName, items: [] })
      map.get(v.client_id)!.items.push(v)
    }
    return Array.from(map.entries())
      .map(([client_id, g]) => ({ client_id, ...g }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName))
  }, [filtered])

  const expiringCount = useMemo(() => verordnungen.filter(v => expiryTone(v)).length, [verordnungen])
  const neuantragCount = useMemo(() => verordnungen.filter(v => v.neuantrag_erforderlich).length, [verordnungen])

  function openCreate() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, ausstellungsdatum: new Date().toISOString().slice(0, 10) })
    setShowForm(true)
  }

  function openEdit(v: Verordnung) {
    setEditingId(v.id)
    setForm({
      client_id: v.client_id,
      verordnung_type: v.verordnung_type,
      ausstellungsdatum: v.ausstellungsdatum || '',
      arzt_name: v.arzt_name || '',
      arzt_praxis: v.arzt_praxis || '',
      diagnose: v.diagnose || '',
      leistung_beschreibung: v.leistung_beschreibung || '',
      genehmigung_status: v.genehmigung_status,
      genehmigung_datum: v.genehmigung_datum || '',
      genehmigung_bis: v.genehmigung_bis || '',
      genehmigung_aktenzeichen: v.genehmigung_aktenzeichen || '',
      notes: v.notes || '',
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.client_id || !form.ausstellungsdatum) {
      setError('Klient und Ausstellungsdatum sind Pflichtfelder.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const payload = {
        client_id: form.client_id,
        verordnung_type: form.verordnung_type,
        ausstellungsdatum: form.ausstellungsdatum,
        arzt_name: form.arzt_name || null,
        arzt_praxis: form.arzt_praxis || null,
        diagnose: form.diagnose || null,
        leistung_beschreibung: form.leistung_beschreibung || null,
        genehmigung_status: form.genehmigung_status,
        genehmigung_datum: form.genehmigung_datum || null,
        genehmigung_bis: form.genehmigung_bis || null,
        genehmigung_aktenzeichen: form.genehmigung_aktenzeichen || null,
        notes: form.notes || null,
      }
      const { error: e } = editingId
        ? await supabase.from('verordnungen').update(payload).eq('id', editingId)
        : await supabase.from('verordnungen').insert(payload)
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
    if (!window.confirm('Verordnung wirklich löschen?')) return
    setBusyId(id)
    try {
      const supabase = createClient()
      const { error: e } = await supabase.from('verordnungen').delete().eq('id', id)
      if (e) { setError(`Löschen fehlgeschlagen: ${e.message}`); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function markNeuantrag(v: Verordnung) {
    setBusyId(v.id)
    try {
      const supabase = createClient()
      const { error: e } = await supabase
        .from('verordnungen')
        .update({ neuantrag_erforderlich: !v.neuantrag_erforderlich })
        .eq('id', v.id)
      if (e) { setError(`Update fehlgeschlagen: ${e.message}`); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Verordnungen</h1>
          <p className="admin-subtitle">
            {verordnungen.length} Verordnungen · {expiringCount} laufen bald ab · {neuantragCount} Neuanträge offen
          </p>
        </div>
        <button onClick={openCreate} style={primaryBtn}>+ Neue Verordnung</button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {expiringCount > 0 && (
        <Banner tone="warn">
          ⏳ {expiringCount} Genehmigung{expiringCount > 1 ? 'en laufen' : ' läuft'} innerhalb der nächsten 30 Tage ab — Neuantrag rechtzeitig stellen!
        </Banner>
      )}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Klient, Arzt, Aktenzeichen…" />
      </div>

      <div className="admin-filters">
        <button className={`admin-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          Alle
        </button>
        <button className={`admin-filter-btn ${filter === 'expiring' ? 'active' : ''}`} onClick={() => setFilter('expiring')}>
          Läuft ab ({expiringCount})
        </button>
        <button className={`admin-filter-btn ${filter === 'neuantrag' ? 'active' : ''}`} onClick={() => setFilter('neuantrag')}>
          Neuantrag ({neuantragCount})
        </button>
        {Object.keys(GENEHMIGUNG_STATUS).map(s => (
          <button key={s} className={`admin-filter-btn ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            {GENEHMIGUNG_STATUS[s].label} ({verordnungen.filter(v => v.genehmigung_status === s).length})
          </button>
        ))}
      </div>

      {showForm && (
        <div style={formCard}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>
            {editingId ? 'Verordnung bearbeiten' : 'Neue Verordnung erfassen'}
          </h3>
          <div style={formGrid}>
            <label style={fieldLabel}>
              Klient *
              <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} style={input} disabled={!!editingId}>
                <option value="">— wählen —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Verordnungstyp
              <select value={form.verordnung_type} onChange={e => setForm({ ...form, verordnung_type: e.target.value })} style={input}>
                {Object.entries(VERORDNUNG_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Ausstellungsdatum *
              <input type="date" value={form.ausstellungsdatum} onChange={e => setForm({ ...form, ausstellungsdatum: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Arzt
              <input value={form.arzt_name} onChange={e => setForm({ ...form, arzt_name: e.target.value })} style={input} placeholder="Dr. …" />
            </label>
            <label style={fieldLabel}>
              Praxis
              <input value={form.arzt_praxis} onChange={e => setForm({ ...form, arzt_praxis: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Diagnose
              <input value={form.diagnose} onChange={e => setForm({ ...form, diagnose: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Verordnete Leistung
              <input value={form.leistung_beschreibung} onChange={e => setForm({ ...form, leistung_beschreibung: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Genehmigungsstatus
              <select value={form.genehmigung_status} onChange={e => setForm({ ...form, genehmigung_status: e.target.value })} style={input}>
                {Object.entries(GENEHMIGUNG_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Genehmigt am
              <input type="date" value={form.genehmigung_datum} onChange={e => setForm({ ...form, genehmigung_datum: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Genehmigt bis
              <input type="date" value={form.genehmigung_bis} onChange={e => setForm({ ...form, genehmigung_bis: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Aktenzeichen
              <input value={form.genehmigung_aktenzeichen} onChange={e => setForm({ ...form, genehmigung_aktenzeichen: e.target.value })} style={input} />
            </label>
            <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>
              Notizen
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...input, minHeight: 60, resize: 'vertical' }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={save} disabled={saving} style={primaryBtn}>
              {saving ? 'Speichern…' : (editingId ? 'Änderungen speichern' : 'Verordnung anlegen')}
            </button>
            <button onClick={() => setShowForm(false)} style={secondaryBtn}>Abbrechen</button>
          </div>
        </div>
      )}

      {loading ? <p>Laden…</p> : grouped.length === 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <tbody>
              <EmptyRow colSpan={8}>
                {search || filter !== 'all' ? 'Keine Treffer' : 'Noch keine Verordnungen erfasst'}
              </EmptyRow>
            </tbody>
          </table>
        </div>
      ) : grouped.map(group => (
        <div key={group.client_id} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, margin: '0 0 8px', color: 'var(--ink)' }}>
            {group.clientName}
            <span style={{ fontWeight: 400, color: 'var(--ink4)', fontSize: 13 }}> · {group.items.length} Verordnung{group.items.length > 1 ? 'en' : ''}</span>
          </h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Typ</th><th>Ausgestellt</th><th>Arzt</th><th>Status</th>
                  <th>Gültig bis</th><th>Aktenzeichen</th><th>Neuantrag</th><th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map(v => {
                  const tm = statusMeta(VERORDNUNG_TYPE, v.verordnung_type)
                  const gm = statusMeta(GENEHMIGUNG_STATUS, v.genehmigung_status)
                  const tone = expiryTone(v)
                  const days = daysUntil(v.genehmigung_bis)
                  const rowBg = tone === 'red'
                    ? 'rgba(208,75,59,.12)'
                    : tone === 'yellow'
                      ? 'rgba(232,160,0,.10)'
                      : undefined
                  return (
                    <tr key={v.id} style={rowBg ? { background: rowBg } : undefined}>
                      <td><StatusBadge label={tm.label} color={tm.color} /></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(v.ausstellungsdatum)}</td>
                      <td>{v.arzt_name || '—'}{v.arzt_praxis ? ` (${v.arzt_praxis})` : ''}</td>
                      <td><StatusBadge label={gm.label} color={gm.color} /></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {formatDate(v.genehmigung_bis)}
                        {tone && days !== null && (
                          <span style={{
                            marginLeft: 6, fontSize: 12, fontWeight: 700,
                            color: tone === 'red' ? '#D04B3B' : '#E8A000',
                          }}>
                            {days < 0 ? 'abgelaufen!' : `noch ${days} Tg`}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>{v.genehmigung_aktenzeichen || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        {v.neuantrag_erforderlich
                          ? <span style={{ color: '#D04B3B', fontWeight: 700, fontSize: 13 }}>⚠ erforderlich</span>
                          : v.neuantrag_gestellt_am
                            ? <span style={{ color: '#5CB882', fontSize: 13 }}>gestellt {formatDate(v.neuantrag_gestellt_am)}</span>
                            : '—'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button onClick={() => openEdit(v)} style={miniBtn}>Bearbeiten</button>
                        <button
                          onClick={() => markNeuantrag(v)}
                          disabled={busyId === v.id}
                          style={{ ...miniBtn, color: v.neuantrag_erforderlich ? '#5CB882' : '#E8A000' }}
                          title={v.neuantrag_erforderlich ? 'Markierung aufheben' : 'Als "Neuantrag erforderlich" markieren'}
                        >
                          {v.neuantrag_erforderlich ? 'Neuantrag ✓' : 'Neuantrag nötig'}
                        </button>
                        <button onClick={() => remove(v.id)} disabled={busyId === v.id} style={{ ...miniBtn, color: '#D04B3B' }}>
                          Löschen
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

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
