'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  euro, formatDate, statusMeta, summarizeBudget, CLIENT_STATUS, type BudgetSummary,
} from '@/lib/admin/ops'
import { AmpelDot, BudgetBar, StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { useBundeslandFilter } from '@/components/admin/BundeslandContext'
import BundeslandFilterHinweis from '@/components/admin/BundeslandFilterHinweis'

interface ClientRow {
  id: string
  customer_number: string | null
  first_name: string
  last_name: string
  city: string | null
  zip_code: string | null
  phone: string | null
  care_level: number | null
  insurance_name: string | null
  status: string
  budget: BudgetSummary | null
}

const EMPTY_FORM = {
  first_name: '', last_name: '', date_of_birth: '', phone: '', email: '',
  address: '', zip_code: '', city: '', care_level: '',
  insurance_name: '', insurance_number: '', versichertennummer: '',
  pflegekasse_name: '', pflegekasse_ik: '',
  emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '',
  hausarzt_name: '', hausarzt_phone: '', notes: '',
}

export default function AdminClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function load() {
    try {
      const supabase = createClient()
      const year = new Date().getFullYear()
      const [clientsRes, budgetsRes] = await Promise.all([
        supabase.from('clients').select('*').order('last_name', { ascending: true }),
        supabase.from('client_budgets').select('*').eq('year', year),
      ])

      const budgetMap = new Map<string, any>()
      ;(budgetsRes.data || []).forEach((b: any) => budgetMap.set(b.client_id, b))

      const rows: ClientRow[] = (clientsRes.data || []).map((c: any) => {
        const b = budgetMap.get(c.id)
        return {
          id: c.id,
          customer_number: c.customer_number,
          first_name: c.first_name || '',
          last_name: c.last_name || '',
          city: c.city,
          zip_code: c.zip_code,
          phone: c.phone,
          care_level: c.care_level,
          insurance_name: c.insurance_name,
          status: c.status || 'active',
          budget: b ? summarizeBudget(b) : null,
        }
      })
      setClients(rows)
    } catch (err) {
      console.error('Clients load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const { passtZuFilter, alle: alleLaender } = useBundeslandFilter()

  const imBundesland = useMemo(
    () => clients.filter(c => passtZuFilter(c.zip_code)),
    [clients, passtZuFilter]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return imBundesland.filter(c => {
      if (filter !== 'all' && c.status !== filter) return false
      if (!q) return true
      return (
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
        (c.customer_number || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        (c.zip_code || '').includes(q) ||
        (c.insurance_name || '').toLowerCase().includes(q)
      )
    })
  }, [imBundesland, search, filter])

  async function handleCreate() {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('Vor- und Nachname sind Pflichtfelder.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(form)) {
        if (v.trim()) payload[k] = v.trim()
      }
      if (payload.care_level) payload.care_level = Number(payload.care_level)

      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Fehler beim Anlegen.'); return }

      setSuccess(`Klient ${form.first_name} ${form.last_name} angelegt.`)
      setShowForm(false)
      setForm(EMPTY_FORM)
      await load()
      setTimeout(() => setSuccess(''), 5000)
    } catch {
      setError('Netzwerkfehler beim Anlegen.')
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle: React.CSSProperties = {
    padding: '8px 12px', border: '1px solid var(--ink2)', borderRadius: 6,
    fontSize: 14, width: '100%', background: 'var(--bg)', color: 'var(--ink)',
  }
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block', color: 'var(--ink7)' }
  const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }
  const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--ink5)', marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }

  function F({ label, field, type = 'text', placeholder = '' }: { label: string; field: keyof typeof form; type?: string; placeholder?: string }) {
    return (
      <div>
        <label style={labelStyle}>{label}</label>
        <input
          type={type}
          style={fieldStyle}
          value={form[field]}
          onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
          placeholder={placeholder}
        />
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Klienten</h1>
          <p className="admin-subtitle">
            {alleLaender
              ? `${clients.length} Klienten insgesamt`
              : `${imBundesland.length} von ${clients.length} Klienten in diesem Bundesland`}
          </p>
        </div>
        <button
          className="btn-confirm"
          onClick={() => { setShowForm(!showForm); setError(''); setSuccess('') }}
          style={{ padding: '8px 20px', fontWeight: 600 }}
        >
          {showForm ? 'Abbrechen' : '+ Neuen Klienten anlegen'}
        </button>
      </div>

      {success && <Banner tone="info">{success}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      {showForm && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--ink2)', borderRadius: 8, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Neuen Klienten aufnehmen</h3>

          <div style={sectionTitle}>Stammdaten</div>
          <div style={gridStyle}>
            <F label="Vorname *" field="first_name" placeholder="Max" />
            <F label="Nachname *" field="last_name" placeholder="Mustermann" />
            <F label="Geburtsdatum" field="date_of_birth" type="date" />
            <F label="Telefon" field="phone" placeholder="0151 12345678" />
            <F label="E-Mail" field="email" type="email" placeholder="max@beispiel.de" />
          </div>

          <div style={sectionTitle}>Adresse</div>
          <div style={gridStyle}>
            <F label="Straße + Hausnr." field="address" placeholder="Musterstraße 1" />
            <F label="PLZ" field="zip_code" placeholder="60311" />
            <F label="Ort" field="city" placeholder="Frankfurt" />
          </div>

          <div style={sectionTitle}>Pflegedaten</div>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Pflegegrad</label>
              <select
                style={fieldStyle}
                value={form.care_level}
                onChange={e => setForm(f => ({ ...f, care_level: e.target.value }))}
              >
                <option value="">— Auswählen —</option>
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>Pflegegrad {n}</option>)}
              </select>
            </div>
            <F label="Pflegekasse" field="pflegekasse_name" placeholder="AOK Hessen" />
            <F label="Pflegekasse IK" field="pflegekasse_ik" placeholder="109519005" />
            <F label="Versichertennummer" field="versichertennummer" placeholder="A123456789" />
            <F label="Krankenkasse" field="insurance_name" placeholder="AOK Hessen" />
            <F label="Versicherungsnr." field="insurance_number" placeholder="1234567890" />
          </div>

          <div style={sectionTitle}>Notfallkontakt</div>
          <div style={gridStyle}>
            <F label="Name" field="emergency_contact_name" placeholder="Anna Mustermann" />
            <F label="Telefon" field="emergency_contact_phone" placeholder="0151 98765432" />
            <F label="Beziehung" field="emergency_contact_relationship" placeholder="Tochter" />
          </div>

          <div style={sectionTitle}>Hausarzt</div>
          <div style={gridStyle}>
            <F label="Name" field="hausarzt_name" placeholder="Dr. Müller" />
            <F label="Telefon" field="hausarzt_phone" placeholder="069 12345678" />
          </div>

          <div style={{ marginTop: 8 }}>
            <label style={labelStyle}>Anmerkungen</label>
            <textarea
              style={{ ...fieldStyle, minHeight: 60, resize: 'vertical' }}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Interne Notizen zur Aufnahme…"
            />
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <button className="btn-confirm" onClick={handleCreate} disabled={saving} style={{ padding: '8px 24px' }}>
              {saving ? 'Anlegen…' : 'Klient anlegen'}
            </button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setError('') }} style={{ padding: '8px 16px', cursor: 'pointer' }}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <BundeslandFilterHinweis gesamt={clients.length} sichtbar={imBundesland.length} />

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Name, Kundennr., Ort, Kasse…" />
      </div>

      <div className="admin-filters">
        {['all', 'active', 'new', 'paused', 'inactive'].map(f => (
          <button key={f} className={`admin-filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Alle' : statusMeta(CLIENT_STATUS, f).label}
            {f !== 'all' && ` (${clients.filter(c => c.status === f).length})`}
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Klient</th>
                <th>Kundennr.</th>
                <th>Pflegegrad</th>
                <th>Kasse</th>
                <th>Ort</th>
                <th>Status</th>
                <th>Budget</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={7}>{search || filter !== 'all' ? 'Keine Treffer' : 'Noch keine Klienten angelegt'}</EmptyRow>
              ) : filtered.map(c => {
                const sm = statusMeta(CLIENT_STATUS, c.status)
                return (
                  <tr key={c.id} onClick={() => router.push(`/admin/clients/${c.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}>{c.first_name} {c.last_name}</td>
                    <td style={{ fontSize: 13 }}>{c.customer_number || '—'}</td>
                    <td>{c.care_level ? `PG ${c.care_level}` : '—'}</td>
                    <td style={{ fontSize: 13 }}>{c.insurance_name || '—'}</td>
                    <td style={{ fontSize: 13 }}>{c.zip_code ? `${c.zip_code} ` : ''}{c.city || '—'}</td>
                    <td><StatusBadge label={sm.label} color={sm.color} /></td>
                    <td>
                      {c.budget ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <AmpelDot ampel={c.budget.ampel} />
                          <BudgetBar summary={c.budget} compact />
                        </div>
                      ) : <span style={{ color: 'var(--ink5)', fontSize: 12 }}>kein Budget</span>}
                    </td>
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
