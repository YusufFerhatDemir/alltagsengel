'use client'
import { useEffect, useState } from 'react'
import { Banner, EmptyRow } from '@/components/admin/OpsUI'

interface OffenerPosten {
  laufId: string
  abrechnungsmonat: string
  kostentraegerIk: string | null
  gesamtbetragCent: number
  zugeordnetCent: number
  offenCent: number
  status: string
}

function euro(cents: number) {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export default function ZahlungenPage() {
  const [liste, setListe] = useState<OffenerPosten[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/sgb-v/zahlungen')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setListe(data.offenePosten)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function abgleichen() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/sgb-v/zahlungen', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-page">
      <h1>§ 302 — Offene Posten &amp; Zahlungsabgleich</h1>
      {error && <Banner tone="danger">{error}</Banner>}

      <button className="admin-btn" disabled={busy} onClick={abgleichen} style={{ marginBottom: 16 }}>
        {busy ? 'Gleicht ab…' : 'Automatischen Zahlungsabgleich anstossen'}
      </button>

      <table className="admin-table">
        <thead><tr><th>Monat</th><th>Kasse-IK</th><th>Status</th><th>Betrag</th><th>Zugeordnet</th><th>Offen</th></tr></thead>
        <tbody>
          {loading ? (
            <EmptyRow colSpan={6}>Lädt…</EmptyRow>
          ) : liste.length === 0 ? (
            <EmptyRow colSpan={6}>Keine offenen Posten.</EmptyRow>
          ) : liste.map(p => (
            <tr key={p.laufId}>
              <td>{p.abrechnungsmonat}</td>
              <td>{p.kostentraegerIk ?? '—'}</td>
              <td>{p.status}</td>
              <td>{euro(p.gesamtbetragCent)}</td>
              <td>{euro(p.zugeordnetCent)}</td>
              <td style={{ color: p.offenCent > 0 ? '#ef4444' : '#22c55e' }}>{euro(p.offenCent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
