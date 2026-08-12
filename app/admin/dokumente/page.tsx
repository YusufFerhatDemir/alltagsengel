'use client'
// ═══════════════════════════════════════════════════════════════
// Dokumentenübersicht — zentrale Sicht auf akten_dokumente
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AKTEN_DOKUMENT_TYP, AKTEN_KATEGORIE, AKTEN_SICHTBARKEIT, AKTEN_STATUS, formatDate, statusMeta } from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import AktenUpload from '@/components/admin/AktenUpload'
import type { AktenDokument } from '@/lib/akten/types'

export default function AdminDokumentePage() {
  const [dokumente, setDokumente] = useState<AktenDokument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [typFilter, setTypFilter] = useState('all')
  const [kategorieFilter, setKategorieFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showUpload, setShowUpload] = useState(false)
  const [zuordnungClientId, setZuordnungClientId] = useState('')
  const [zuordnungCaregiverId, setZuordnungCaregiverId] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (search) params.set('suche', search)
      if (typFilter !== 'all') params.set('dokumentTyp', typFilter)
      if (kategorieFilter !== 'all') params.set('kategorie', kategorieFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/akten/dokumente?${params.toString()}`)
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Laden fehlgeschlagen.'); setLoading(false); return }
      setDokumente(body.dokumente || [])
    } catch {
      setError('Unerwarteter Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [search, typFilter, kategorieFilter, statusFilter])

  async function handleDownload(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/akten/dokumente/${id}/download`)
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Download fehlgeschlagen.'); return }
      window.open(body.url, '_blank')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleSperre(dok: AktenDokument) {
    if (!dok.gesperrt) {
      const grund = window.prompt('Sperrgrund:')
      if (!grund) return
      setBusyId(dok.id)
      try {
        const res = await fetch(`/api/akten/dokumente/${dok.id}/sperren`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gesperrt: true, grund }),
        })
        const body = await res.json()
        if (!res.ok) { setError(body.error || 'Sperren fehlgeschlagen.'); return }
        await load()
      } finally { setBusyId(null) }
    } else {
      setBusyId(dok.id)
      try {
        const res = await fetch(`/api/akten/dokumente/${dok.id}/sperren`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gesperrt: false }),
        })
        const body = await res.json()
        if (!res.ok) { setError(body.error || 'Entsperren fehlgeschlagen.'); return }
        await load()
      } finally { setBusyId(null) }
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Dokument wirklich löschen (Soft-Delete)?')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/akten/dokumente/${id}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Löschen fehlgeschlagen.'); return }
      await load()
    } finally { setBusyId(null) }
  }

  const zuordnungLabel = (d: AktenDokument) => d.client_id ? 'Kunde' : d.caregiver_id ? 'Mitarbeiter' : 'Organisation'

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Dokumente</h1>
          <p className="admin-subtitle">{dokumente.length} Dokumente · Zentrales Dokumentenmanagement</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/dokumente/ablauf" style={secondaryBtn}>Ablaufwarnungen</Link>
          <button onClick={() => setShowUpload(v => !v)} style={primaryBtn}>+ Dokument hochladen</button>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {showUpload && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            <label style={fieldLabel}>
              Kunde-ID (optional)
              <input value={zuordnungClientId} onChange={e => { setZuordnungClientId(e.target.value); setZuordnungCaregiverId('') }} style={input} placeholder="UUID des Kunden" />
            </label>
            <label style={fieldLabel}>
              Mitarbeiter-ID (optional)
              <input value={zuordnungCaregiverId} onChange={e => { setZuordnungCaregiverId(e.target.value); setZuordnungClientId('') }} style={input} placeholder="UUID des Mitarbeiters" />
            </label>
          </div>
          <AktenUpload
            clientId={zuordnungClientId || null}
            caregiverId={zuordnungCaregiverId || null}
            onUploaded={() => { setShowUpload(false); setZuordnungClientId(''); setZuordnungCaregiverId(''); load() }}
            onCancel={() => setShowUpload(false)}
          />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Titel, Dateiname…" />
      </div>

      <div className="admin-filters">
        <button className={`admin-filter-btn ${typFilter === 'all' ? 'active' : ''}`} onClick={() => setTypFilter('all')}>Alle Typen</button>
        {Object.entries(AKTEN_DOKUMENT_TYP).slice(0, 8).map(([k, v]) => (
          <button key={k} className={`admin-filter-btn ${typFilter === k ? 'active' : ''}`} onClick={() => setTypFilter(k)}>{v.label}</button>
        ))}
        <select value={typFilter} onChange={e => setTypFilter(e.target.value)} style={{ ...input, marginLeft: 8 }}>
          <option value="all">— weitere Typen —</option>
          {Object.entries(AKTEN_DOKUMENT_TYP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={kategorieFilter} onChange={e => setKategorieFilter(e.target.value)} style={input}>
          <option value="all">Alle Kategorien</option>
          {Object.entries(AKTEN_KATEGORIE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={input}>
          <option value="all">Alle Status</option>
          {Object.entries(AKTEN_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Titel</th><th>Typ</th><th>Zuordnung</th><th>Status</th><th>Sichtbarkeit</th>
              <th>Ablauf</th><th>Version</th><th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <EmptyRow colSpan={8}>Laden…</EmptyRow>
              : dokumente.length === 0
                ? <EmptyRow colSpan={8}>Keine Dokumente gefunden</EmptyRow>
                : dokumente.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.titel}{d.gesperrt && ' 🔒'}</td>
                    <td><StatusBadge label={statusMeta(AKTEN_DOKUMENT_TYP, d.dokument_typ).label} color={statusMeta(AKTEN_DOKUMENT_TYP, d.dokument_typ).color} /></td>
                    <td style={{ fontSize: 13 }}>{zuordnungLabel(d)}</td>
                    <td><StatusBadge label={statusMeta(AKTEN_STATUS, d.status).label} color={statusMeta(AKTEN_STATUS, d.status).color} /></td>
                    <td><StatusBadge label={statusMeta(AKTEN_SICHTBARKEIT, d.sichtbarkeit).label} color={statusMeta(AKTEN_SICHTBARKEIT, d.sichtbarkeit).color} /></td>
                    <td style={{ fontSize: 13 }}>{d.ablaufdatum ? formatDate(d.ablaufdatum) : '—'}</td>
                    <td style={{ fontSize: 13 }}>v{d.aktuelle_version}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button onClick={() => handleDownload(d.id)} disabled={busyId === d.id} style={miniBtn}>Download</button>
                      <button onClick={() => toggleSperre(d)} disabled={busyId === d.id} style={miniBtn}>{d.gesperrt ? 'Entsperren' : 'Sperren'}</button>
                      <button onClick={() => remove(d.id)} disabled={busyId === d.id || d.gesperrt} style={{ ...miniBtn, color: '#D04B3B' }}>Löschen</button>
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
  textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
}
const miniBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--ink)',
  background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit',
  marginRight: 6,
}
const fieldLabel: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12,
  color: 'var(--ink4)', fontWeight: 600, flex: 1,
}
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 14, background: 'var(--coal2)', color: 'var(--ink)',
  fontFamily: 'inherit', outline: 'none',
}
