'use client'
import { useEffect, useState } from 'react'
import { Banner, EmptyRow } from '@/components/admin/OpsUI'

const LEISTUNGSARTEN = [
  'behandlungspflege', 'medikamentengabe', 'injektionen', 'wundversorgung',
  'kompressionsstruempfe', 'blutzuckermessung', 'katheter', 'stomaversorgung',
] as const

interface Leistung {
  id: string
  client_id: string
  verordnung_id: string
  date: string
  service_type: string
  amount: number
  proof_status: string
}

function euro(n: number) {
  return Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export default function LeistungsnachweisePage() {
  const [liste, setListe] = useState<Leistung[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    clientId: '', verordnungId: '', caregiverId: '', date: '', startTime: '', endTime: '',
    leistungsart: LEISTUNGSARTEN[0] as string, amount: '',
  })

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/sgb-v/leistungsnachweise')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setListe(data.leistungsnachweise)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function erfassen() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/sgb-v/leistungsnachweise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setShowCreate(false)
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-page">
      <h1>Leistungsnachweise (§ 37 SGB V)</h1>
      {error && <Banner tone="danger">{error}</Banner>}

      <button className="admin-btn" onClick={() => setShowCreate(s => !s)} style={{ marginBottom: 16 }}>
        {showCreate ? 'Abbrechen' : '+ Leistung erfassen'}
      </button>

      {showCreate && (
        <div className="admin-card" style={{ marginBottom: 16, display: 'grid', gap: 8, maxWidth: 480 }}>
          <label>Klient-ID<input value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} /></label>
          <label>Verordnung-ID<input value={form.verordnungId} onChange={e => setForm({ ...form, verordnungId: e.target.value })} /></label>
          <label>Engel-ID<input value={form.caregiverId} onChange={e => setForm({ ...form, caregiverId: e.target.value })} /></label>
          <label>Datum<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
          <label>Start<input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} /></label>
          <label>Ende<input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} /></label>
          <label>Leistungsart
            <select value={form.leistungsart} onChange={e => setForm({ ...form, leistungsart: e.target.value })}>
              {LEISTUNGSARTEN.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label>Betrag (EUR)<input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>
          <button
            className="admin-btn"
            disabled={busy || !form.clientId || !form.verordnungId || !form.caregiverId || !form.date}
            onClick={erfassen}
          >
            {busy ? 'Speichert…' : 'Erfassen'}
          </button>
        </div>
      )}

      <table className="admin-table">
        <thead><tr><th>Datum</th><th>Leistungsart</th><th>Betrag</th><th>Status</th></tr></thead>
        <tbody>
          {loading ? (
            <EmptyRow colSpan={4}>Lädt…</EmptyRow>
          ) : liste.length === 0 ? (
            <EmptyRow colSpan={4}>Keine Leistungsnachweise erfasst.</EmptyRow>
          ) : liste.map(l => (
            <tr key={l.id}>
              <td>{l.date}</td>
              <td>{l.service_type}</td>
              <td>{euro(l.amount)}</td>
              <td>{l.proof_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
