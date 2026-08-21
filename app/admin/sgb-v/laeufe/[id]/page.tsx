'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Banner, StatusBadge } from '@/components/admin/OpsUI'

function euro(cents: number) {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export default function SgbVLaufDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [stornoGrund, setStornoGrund] = useState('')
  const [adapterTyp, setAdapterTyp] = useState('mock')

  async function load() {
    const res = await fetch(`/api/billing/sgb-v/laeufe/${id}`)
    const d = await res.json()
    if (d.error) { setError(d.error); return }
    setData(d)
  }

  useEffect(() => { load() }, [id])

  async function exportieren(format: 'json' | 'csv') {
    setBusy(true)
    try {
      const res = await fetch(`/api/billing/sgb-v/laeufe/${id}/export?format=${format}`, { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setError(d.error); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sgb-v-pruefexport_${id}.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setBusy(false)
    }
  }

  async function einreihen() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/billing/sgb-v/laeufe/${id}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapterTyp }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error); return }
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function stornieren() {
    if (!stornoGrund.trim()) { setError('Grund ist Pflicht.'); return }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/billing/sgb-v/laeufe/${id}/storno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ korrekturTyp: 'storno', grund: stornoGrund }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error); return }
      setStornoGrund('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (error && !data) return <div className="admin-page"><Banner tone="danger">{error}</Banner></div>
  if (!data) return <div className="admin-page">Lädt…</div>

  const { lauf, ruecklaeufer, queue, korrekturHistorie } = data

  return (
    <div className="admin-page">
      <h1>§ 302-Lauf {lauf.abrechnungsmonat} — {lauf.kostentraeger_name ?? lauf.kostentraeger_ik ?? 'Sammellauf'}</h1>
      {error && <Banner tone="danger">{error}</Banner>}

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <p><StatusBadge label={lauf.status} color="#8b5cf6" /></p>
        {lauf.sperr_grund && <p style={{ color: '#f97316' }}>Gesperrt: {lauf.sperr_grund}</p>}
        <p>Fälle: {lauf.anzahl_faelle} · Positionen: {lauf.anzahl_positionen} · Betrag: {euro(lauf.gesamtbetrag_cent)}</p>
      </div>

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <h2>Aktionen</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <button className="admin-btn" disabled={busy} onClick={() => exportieren('json')}>Prüf-Export (JSON)</button>
          <button className="admin-btn" disabled={busy} onClick={() => exportieren('csv')}>Prüf-Export (CSV)</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <select value={adapterTyp} onChange={e => setAdapterTyp(e.target.value)}>
            <option value="mock">Mock (Test)</option>
            <option value="file_export">Datei-Export</option>
            <option value="dakota">DAKOTA (gesperrt)</option>
            <option value="kim">KIM (gesperrt)</option>
          </select>
          <button className="admin-btn" disabled={busy} onClick={einreihen}>In Warteschlange einreihen</button>
        </div>
        {!['storniert', 'abgeschlossen'].includes(lauf.status) && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input aria-label="Storno-Grund (Pflicht)" placeholder="Storno-Grund (Pflicht)" value={stornoGrund} onChange={e => setStornoGrund(e.target.value)} style={{ minWidth: 260 }} />
            <button className="admin-btn" disabled={busy} onClick={stornieren}>Stornieren</button>
          </div>
        )}
      </div>

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <h2>Übertragungs-Warteschlange</h2>
        {queue.length === 0 ? <p style={{ color: 'var(--ink4)' }}>Noch nichts eingereiht.</p> : (
          <table className="admin-table">
            <thead><tr><th>Adapter</th><th>Status</th><th>Versuche</th><th>Fehler</th></tr></thead>
            <tbody>
              {queue.map((q: any) => (
                <tr key={q.id}>
                  <td>{q.adapter_typ}</td>
                  <td>{q.status}</td>
                  <td>{q.versuch_zaehler}</td>
                  <td style={{ color: '#ef4444' }}>{q.letzter_fehler ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <h2>Rückläufer</h2>
        {ruecklaeufer.length === 0 ? <p style={{ color: 'var(--ink4)' }}>Keine Rückmeldungen.</p> : (
          <table className="admin-table">
            <thead><tr><th>Typ</th><th>Status</th><th>Fehlercode</th></tr></thead>
            <tbody>
              {ruecklaeufer.map((r: any) => (
                <tr key={r.id}><td>{r.ruecklaeufer_typ}</td><td>{r.status}</td><td>{r.fehler_code ?? '—'}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {korrekturHistorie.length > 0 && (
        <div className="admin-card">
          <h2>Korrekturhistorie</h2>
          <table className="admin-table">
            <thead><tr><th>Typ</th><th>Grund</th><th>Status</th></tr></thead>
            <tbody>
              {korrekturHistorie.map((k: any) => (
                <tr key={k.id}><td>{k.korrektur_typ}</td><td>{k.korrektur_grund}</td><td>{k.status}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
