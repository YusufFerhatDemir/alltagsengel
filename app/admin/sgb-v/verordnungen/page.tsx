'use client'
import { useEffect, useState } from 'react'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'

interface Verordnung {
  id: string
  client_id: string
  klient_name: string
  arzt_name: string | null
  diagnose: string | null
  ausstellungsdatum: string
  genehmigung_status: string
  aktuell_gueltig: boolean
  kostentraeger_name: string | null
}

const GENEHMIGUNG_FARBE: Record<string, string> = {
  ausstehend: '#94a3b8', beantragt: '#f59e0b', genehmigt: '#22c55e',
  abgelehnt: '#ef4444', abgelaufen: '#6b7280', widerspruch: '#f97316',
}

export default function VerordnungenPage() {
  const [liste, setListe] = useState<Verordnung[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ clientId: '', ausstellungsdatum: '', arztName: '', diagnose: '', kostentraegerIkNummer: '', kostentraegerName: '' })
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/sgb-v/verordnungen')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setListe(data.verordnungen)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function anlegen() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/sgb-v/verordnungen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setShowCreate(false)
      setForm({ clientId: '', ausstellungsdatum: '', arztName: '', diagnose: '', kostentraegerIkNummer: '', kostentraegerName: '' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-page">
      <h1>HKP-Verordnungen (§ 37 SGB V)</h1>
      {error && <Banner tone="danger">{error}</Banner>}

      <button className="admin-btn" onClick={() => setShowCreate(s => !s)} style={{ marginBottom: 16 }}>
        {showCreate ? 'Abbrechen' : '+ Neue Verordnung'}
      </button>

      {showCreate && (
        <div className="admin-card" style={{ marginBottom: 16, display: 'grid', gap: 8, maxWidth: 480 }}>
          <label>Klient-ID<input value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} /></label>
          <label>Ausstellungsdatum<input type="date" value={form.ausstellungsdatum} onChange={e => setForm({ ...form, ausstellungsdatum: e.target.value })} /></label>
          <label>Arzt (Pflicht — Muster 12)<input value={form.arztName} onChange={e => setForm({ ...form, arztName: e.target.value })} /></label>
          <label>Diagnose<input value={form.diagnose} onChange={e => setForm({ ...form, diagnose: e.target.value })} /></label>
          <label>Kostenträger-IK<input value={form.kostentraegerIkNummer} onChange={e => setForm({ ...form, kostentraegerIkNummer: e.target.value })} /></label>
          <label>Kostenträger-Name<input value={form.kostentraegerName} onChange={e => setForm({ ...form, kostentraegerName: e.target.value })} /></label>
          <button className="admin-btn" disabled={busy || !form.clientId || !form.ausstellungsdatum || !form.arztName} onClick={anlegen}>
            {busy ? 'Speichert…' : 'Anlegen'}
          </button>
        </div>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Klient</th><th>Arzt</th><th>Diagnose</th><th>Ausgestellt</th><th>Kasse</th><th>Genehmigung</th><th>Gültig</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <EmptyRow colSpan={7}>Lädt…</EmptyRow>
          ) : liste.length === 0 ? (
            <EmptyRow colSpan={7}>Keine HKP-Verordnungen vorhanden.</EmptyRow>
          ) : liste.map(v => (
            <tr key={v.id}>
              <td>{v.klient_name}</td>
              <td>{v.arzt_name ?? '—'}</td>
              <td>{v.diagnose ?? '—'}</td>
              <td>{v.ausstellungsdatum}</td>
              <td>{v.kostentraeger_name ?? '—'}</td>
              <td><StatusBadge label={v.genehmigung_status} color={GENEHMIGUNG_FARBE[v.genehmigung_status] ?? '#94a3b8'} /></td>
              <td>{v.aktuell_gueltig ? '✅' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
