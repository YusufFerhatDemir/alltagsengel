'use client'
// ═══════════════════════════════════════════════════════════════
// Vertragsübersicht — akten_vertraege
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { VERTRAGS_STATUS, VERTRAGS_TYP, formatDate, statusMeta } from '@/lib/admin/ops'
import { StatusBadge, EmptyRow, Banner } from '@/components/admin/OpsUI'
import type { AktenVertrag } from '@/lib/akten/types'

const EMPTY_FORM = {
  titel: '', vertragstyp: 'dienstleistungsvertrag', clientId: '', caregiverId: '',
  vertragsbeginn: '', vertragsende: '', kuendigungsfristTage: '',
}

export default function AdminVertraegePage() {
  const [vertraege, setVertraege] = useState<AktenVertrag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typFilter, setTypFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (typFilter !== 'all') params.set('vertragstyp', typFilter)
      const res = await fetch(`/api/akten/vertraege?${params.toString()}`)
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Laden fehlgeschlagen.'); return }
      setVertraege(body.vertraege || [])
    } catch {
      setError('Unerwarteter Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter, typFilter])

  async function create() {
    if (!form.titel || (!form.clientId && !form.caregiverId)) {
      setError('Titel und entweder Kunde- oder Mitarbeiter-ID sind Pflichtfelder.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/akten/vertraege', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titel: form.titel, vertragstyp: form.vertragstyp,
          clientId: form.clientId || undefined, caregiverId: form.caregiverId || undefined,
          vertragsbeginn: form.vertragsbeginn || undefined, vertragsende: form.vertragsende || undefined,
          kuendigungsfristTage: form.kuendigungsfristTage ? Number(form.kuendigungsfristTage) : undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Speichern fehlgeschlagen.'); return }
      setShowForm(false)
      setForm(EMPTY_FORM)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function statusChange(v: AktenVertrag, status: string) {
    setBusyId(v.id)
    try {
      const res = await fetch(`/api/akten/vertraege/${v.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Statuswechsel fehlgeschlagen.'); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function unterschreiben(v: AktenVertrag) {
    const unterschriebenVon = window.prompt('Name der unterschreibenden Person:')
    if (!unterschriebenVon) return
    setBusyId(v.id)
    try {
      const res = await fetch(`/api/akten/vertraege/${v.id}/unterschreiben`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unterschriebenVon, signaturTyp: 'digital' }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Unterschrift fehlgeschlagen.'); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Verträge</h1>
          <p className="admin-subtitle">{vertraege.length} Verträge · Kunden, Mitarbeiter, Kooperationen</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} style={primaryBtn}>+ Neuer Vertrag</button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {showForm && (
        <div style={formCard}>
          <div style={formGrid}>
            <label style={fieldLabel}>Titel *<input value={form.titel} onChange={e => setForm({ ...form, titel: e.target.value })} style={input} /></label>
            <label style={fieldLabel}>
              Vertragstyp
              <select value={form.vertragstyp} onChange={e => setForm({ ...form, vertragstyp: e.target.value })} style={input}>
                {Object.entries(VERTRAGS_TYP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>Kunde-ID<input value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value, caregiverId: '' })} style={input} placeholder="UUID" /></label>
            <label style={fieldLabel}>Mitarbeiter-ID<input value={form.caregiverId} onChange={e => setForm({ ...form, caregiverId: e.target.value, clientId: '' })} style={input} placeholder="UUID" /></label>
            <label style={fieldLabel}>Vertragsbeginn<input type="date" value={form.vertragsbeginn} onChange={e => setForm({ ...form, vertragsbeginn: e.target.value })} style={input} /></label>
            <label style={fieldLabel}>Vertragsende<input type="date" value={form.vertragsende} onChange={e => setForm({ ...form, vertragsende: e.target.value })} style={input} /></label>
            <label style={fieldLabel}>Kündigungsfrist (Tage)<input type="number" value={form.kuendigungsfristTage} onChange={e => setForm({ ...form, kuendigungsfristTage: e.target.value })} style={input} /></label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={create} disabled={saving} style={primaryBtn}>{saving ? 'Speichern…' : 'Vertrag anlegen'}</button>
            <button onClick={() => setShowForm(false)} style={secondaryBtn}>Abbrechen</button>
          </div>
        </div>
      )}

      <div className="admin-filters">
        <button className={`admin-filter-btn ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>Alle Status</button>
        {Object.entries(VERTRAGS_STATUS).map(([k, v]) => (
          <button key={k} className={`admin-filter-btn ${statusFilter === k ? 'active' : ''}`} onClick={() => setStatusFilter(k)}>{v.label}</button>
        ))}
        <select value={typFilter} onChange={e => setTypFilter(e.target.value)} style={{ ...input, marginLeft: 8 }}>
          <option value="all">Alle Typen</option>
          {Object.entries(VERTRAGS_TYP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Titel</th><th>Typ</th><th>Zuordnung</th><th>Status</th><th>Beginn</th><th>Ende</th><th>Aktionen</th></tr></thead>
          <tbody>
            {loading
              ? <EmptyRow colSpan={7}>Laden…</EmptyRow>
              : vertraege.length === 0
                ? <EmptyRow colSpan={7}>Keine Verträge gefunden</EmptyRow>
                : vertraege.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.titel}{v.gesperrt && ' 🔒'}</td>
                    <td><StatusBadge label={statusMeta(VERTRAGS_TYP, v.vertragstyp).label} color={statusMeta(VERTRAGS_TYP, v.vertragstyp).color} /></td>
                    <td style={{ fontSize: 13 }}>
                      {v.client_id
                        ? <Link href={`/admin/kundenakte/${v.client_id}`} style={{ color: 'var(--gold2)' }}>Kunde</Link>
                        : v.caregiver_id
                          ? <Link href={`/admin/mitarbeiterakte/${v.caregiver_id}`} style={{ color: 'var(--gold2)' }}>Mitarbeiter</Link>
                          : '—'}
                    </td>
                    <td><StatusBadge label={statusMeta(VERTRAGS_STATUS, v.status).label} color={statusMeta(VERTRAGS_STATUS, v.status).color} /></td>
                    <td style={{ fontSize: 13 }}>{formatDate(v.vertragsbeginn)}</td>
                    <td style={{ fontSize: 13 }}>{formatDate(v.vertragsende)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {v.status === 'entwurf' && <button onClick={() => statusChange(v, 'versendet')} disabled={busyId === v.id} style={miniBtn}>Versenden</button>}
                      {v.status === 'versendet' && <button onClick={() => unterschreiben(v)} disabled={busyId === v.id} style={miniBtn}>Unterschreiben</button>}
                      {v.status === 'unterschrieben' && <button onClick={() => statusChange(v, 'aktiv')} disabled={busyId === v.id} style={miniBtn}>Aktivieren</button>}
                      {v.status === 'aktiv' && <button onClick={() => statusChange(v, 'gekuendigt')} disabled={busyId === v.id} style={miniBtn}>Kündigen</button>}
                      {v.status === 'gekuendigt' && <button onClick={() => statusChange(v, 'beendet')} disabled={busyId === v.id} style={miniBtn}>Beenden</button>}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
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
const formCard: React.CSSProperties = { background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 20 }
const formGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }
const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink4)', fontWeight: 600 }
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 14, background: 'var(--coal)', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none',
}
