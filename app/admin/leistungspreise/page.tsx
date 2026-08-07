'use client'
// ═══════════════════════════════════════════════════════════════
// Leistungspreise — Preisliste je Bundesland + Leistungsart, mit
// Gültigkeitszeitraum. Wird für den SOLL/IST-Abgleich in der
// Abrechnung (Verordnungen · Tab 4) herangezogen.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, centToEuro, euroToCent, BUNDESLAND_LABELS, LEISTUNGSART_LABELS, statusMeta } from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { useBundeslandFilter } from '@/components/admin/BundeslandContext'

interface Preis {
  id: string
  bundesland: string
  leistungsart: string
  preis_cent: number
  gueltig_ab: string
  gueltig_bis: string | null
}

const EMPTY_FORM = {
  bundesland: 'hessen',
  leistungsart: '',
  preis: '',
  gueltig_ab: new Date().toISOString().slice(0, 10),
  gueltig_bis: '',
}
type FormState = typeof EMPTY_FORM

export default function AdminLeistungspreisePage() {
  const [preise, setPreise] = useState<Preis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [bundeslandFilter, setBundeslandFilter] = useState('all')
  // Der globale Umschalter aus der Seitenleiste hat Vorrang vor dem
  // Auswahlfeld dieser Seite — sonst zeigt die Seite Preise eines
  // Bundeslands, das oben gar nicht ausgewaehlt ist.
  const { aktiv: globalesLand, alle: alleLaender, label: landLabel } = useBundeslandFilter()
  const wirksamesLand = alleLaender ? bundeslandFilter : globalesLand
  const [leistungsartFilter, setLeistungsartFilter] = useState('all')
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
        .from('leistungspreise')
        .select('id, bundesland, leistungsart, preis_cent, gueltig_ab, gueltig_bis')
        .order('bundesland')
        .order('leistungsart')
        .order('gueltig_ab', { ascending: false })
      if (e) { setError(e.message); setLoading(false); return }
      setPreise((data || []) as Preis[])
    } catch (err: any) {
      setError('Unerwarteter Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return preise.filter(p => {
      if (wirksamesLand !== 'all' && p.bundesland !== wirksamesLand) return false
      if (leistungsartFilter !== 'all' && p.leistungsart !== leistungsartFilter) return false
      if (!q) return true
      return (BUNDESLAND_LABELS[p.bundesland] || p.bundesland).toLowerCase().includes(q)
        || statusMeta(LEISTUNGSART_LABELS, p.leistungsart).label.toLowerCase().includes(q)
    })
  }, [preise, search, wirksamesLand, leistungsartFilter])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(p: Preis) {
    setEditingId(p.id)
    setForm({
      bundesland: p.bundesland,
      leistungsart: p.leistungsart,
      preis: String(p.preis_cent / 100),
      gueltig_ab: p.gueltig_ab,
      gueltig_bis: p.gueltig_bis || '',
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.leistungsart || !form.preis) {
      setError('Leistungsart und Preis sind Pflichtfelder.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const payload = {
        bundesland: form.bundesland,
        leistungsart: form.leistungsart,
        preis_cent: euroToCent(form.preis) ?? 0,
        gueltig_ab: form.gueltig_ab,
        gueltig_bis: form.gueltig_bis || null,
      }
      const { error: e } = editingId
        ? await supabase.from('leistungspreise').update(payload).eq('id', editingId)
        : await supabase.from('leistungspreise').insert(payload)
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
    if (!window.confirm('Preis wirklich löschen?')) return
    setBusyId(id)
    try {
      const supabase = createClient()
      const { error: e } = await supabase.from('leistungspreise').delete().eq('id', id)
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
          <h1>Leistungspreise</h1>
          <p className="admin-subtitle">{preise.length} Preise · nach Bundesland und Leistungsart</p>
        </div>
        <button onClick={openCreate} style={primaryBtn}>+ Neuer Preis</button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Bundesland, Leistungsart…" />
      </div>

      <div className="admin-filters">
        {alleLaender ? (
          <select value={bundeslandFilter} onChange={e => setBundeslandFilter(e.target.value)} style={input}>
            <option value="all">Alle Bundesländer</option>
            {Object.entries(BUNDESLAND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        ) : (
          <span
            title="Vorgegeben durch den Bundesland-Umschalter in der Seitenleiste"
            style={{
              ...input, display: 'inline-flex', alignItems: 'center', gap: 6,
              color: 'var(--gold2)', fontWeight: 600, cursor: 'default',
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} />
            {landLabel}
          </span>
        )}
        <select value={leistungsartFilter} onChange={e => setLeistungsartFilter(e.target.value)} style={input}>
          <option value="all">Alle Leistungsarten</option>
          {Object.entries(LEISTUNGSART_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {showForm && (
        <div style={formCard}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>{editingId ? 'Preis bearbeiten' : 'Neuen Preis anlegen'}</h3>
          <div style={formGrid}>
            <label style={fieldLabel}>
              Bundesland
              <select value={form.bundesland} onChange={e => setForm({ ...form, bundesland: e.target.value })} style={input}>
                {Object.entries(BUNDESLAND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Leistungsart *
              <select value={form.leistungsart} onChange={e => setForm({ ...form, leistungsart: e.target.value })} style={input}>
                <option value="">— wählen —</option>
                {Object.entries(LEISTUNGSART_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Preis (€) *
              <input type="number" min="0" step="0.01" value={form.preis} onChange={e => setForm({ ...form, preis: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Gültig ab
              <input type="date" value={form.gueltig_ab} onChange={e => setForm({ ...form, gueltig_ab: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Gültig bis
              <input type="date" value={form.gueltig_bis} onChange={e => setForm({ ...form, gueltig_bis: e.target.value })} style={input} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={save} disabled={saving} style={primaryBtn}>
              {saving ? 'Speichern…' : (editingId ? 'Änderungen speichern' : 'Preis anlegen')}
            </button>
            <button onClick={() => setShowForm(false)} style={secondaryBtn}>Abbrechen</button>
          </div>
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Bundesland</th><th>Leistungsart</th><th>Preis</th><th>Gültig von</th><th>Gültig bis</th><th>Aktionen</th></tr>
          </thead>
          <tbody>
            {loading
              ? <EmptyRow colSpan={6}>Laden…</EmptyRow>
              : filtered.length === 0
                ? <EmptyRow colSpan={6}>{search || bundeslandFilter !== 'all' || leistungsartFilter !== 'all' ? 'Keine Treffer' : 'Noch keine Preise erfasst'}</EmptyRow>
                : filtered.map(p => (
                  <tr key={p.id}>
                    <td>{BUNDESLAND_LABELS[p.bundesland] || p.bundesland}</td>
                    <td><StatusBadge label={statusMeta(LEISTUNGSART_LABELS, p.leistungsart).label} color={statusMeta(LEISTUNGSART_LABELS, p.leistungsart).color} /></td>
                    <td style={{ fontWeight: 600 }}>{centToEuro(p.preis_cent)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(p.gueltig_ab)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.gueltig_bis ? formatDate(p.gueltig_bis) : 'unbegrenzt'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(p)} style={miniBtn}>Bearbeiten</button>
                      <button onClick={() => remove(p.id)} disabled={busyId === p.id} style={{ ...miniBtn, color: '#D04B3B' }}>Löschen</button>
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
