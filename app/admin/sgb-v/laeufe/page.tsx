'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'

interface Lauf {
  id: string
  abrechnungsmonat: string
  kostentraeger_ik: string | null
  kostentraeger_name: string | null
  status: string
  sperr_grund: string | null
  anzahl_faelle: number
  gesamtbetrag_cent: number
  erstellt_am: string
  korrektur_von: string | null
}

const STATUS_FARBE: Record<string, string> = {
  erstellt: '#94a3b8', validierung_fehlgeschlagen: '#ef4444', gesperrt_extern: '#f97316',
  geprueft: '#3b82f6', freigegeben: '#8b5cf6', uebermittelt: '#8b5cf6', quittiert: '#a855f7',
  angenommen: '#22c55e', teilweise_abgelehnt: '#f97316', abgelehnt: '#ef4444',
  korrektur_erforderlich: '#f97316', korrigiert: '#06b6d4', abgeschlossen: '#6b7280', storniert: '#9ca3af',
}

function euro(cents: number) {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export default function SgbVLaeufePage() {
  const [laeufe, setLaeufe] = useState<Lauf[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monat, setMonat] = useState(new Date().toISOString().slice(0, 7))
  const [kostentraegerIk, setKostentraegerIk] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/sgb-v/laeufe')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setLaeufe(data.laeufe)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function starten() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/sgb-v/laeufe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abrechnungsmonat: monat, kostentraegerIk: kostentraegerIk || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-page">
      <h1>§ 302-Abrechnungsläufe</h1>
      {error && <Banner tone="danger">{error}</Banner>}

      <div className="admin-card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <label>Abrechnungsmonat<input type="month" value={monat} onChange={e => setMonat(e.target.value)} /></label>
        <label>Kostenträger-IK (optional)<input value={kostentraegerIk} onChange={e => setKostentraegerIk(e.target.value)} placeholder="Sammellauf ohne Angabe" /></label>
        <button className="admin-btn" disabled={busy} onClick={starten}>{busy ? 'Startet…' : 'Lauf starten'}</button>
      </div>

      <table className="admin-table">
        <thead><tr><th>Monat</th><th>Kasse</th><th>Status</th><th>Fälle</th><th>Betrag</th><th>Erstellt</th><th></th></tr></thead>
        <tbody>
          {loading ? (
            <EmptyRow colSpan={7}>Lädt…</EmptyRow>
          ) : laeufe.length === 0 ? (
            <EmptyRow colSpan={7}>Keine Läufe vorhanden.</EmptyRow>
          ) : laeufe.map(l => (
            <tr key={l.id}>
              <td>{l.abrechnungsmonat}</td>
              <td>{l.kostentraeger_name ?? l.kostentraeger_ik ?? 'Sammellauf'}</td>
              <td>
                <StatusBadge label={l.status} color={STATUS_FARBE[l.status] ?? '#94a3b8'} />
                {l.korrektur_von && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--ink4)' }}>Korrektur</span>}
              </td>
              <td>{l.anzahl_faelle}</td>
              <td>{euro(l.gesamtbetrag_cent)}</td>
              <td>{new Date(l.erstellt_am).toLocaleDateString('de-DE')}</td>
              <td><Link href={`/admin/sgb-v/laeufe/${l.id}`}>Details →</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
