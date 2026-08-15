'use client'
import { useEffect, useState } from 'react'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'

const TYPEN = ['quittung', 'annahmebestaetigung', 'fehlermeldung', 'abrechnungsergebnis', 'zahlungsavis', 'sonstige']

interface Ruecklaeufer {
  id: string
  sgb_v_lauf_id: string
  ruecklaeufer_typ: string
  status: string
  fehler_code: string | null
  fehler_text: string | null
  created_at: string
}

export default function RuecklaeuferPage() {
  const [liste, setListe] = useState<Ruecklaeufer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ sgbVLaufId: '', ruecklaeuferTyp: 'fehlermeldung', originalMeldung: '', fehlerCode: '', fehlerText: '' })

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/sgb-v/ruecklaeufer')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setListe(data.ruecklaeufer)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function importieren() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/sgb-v/ruecklaeufer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setShowImport(false)
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-page">
      <h1>§ 302-Rückläufer</h1>
      {error && <Banner tone="danger">{error}</Banner>}

      <button className="admin-btn" onClick={() => setShowImport(s => !s)} style={{ marginBottom: 16 }}>
        {showImport ? 'Abbrechen' : '+ Rückmeldung importieren'}
      </button>

      {showImport && (
        <div className="admin-card" style={{ marginBottom: 16, display: 'grid', gap: 8, maxWidth: 480 }}>
          <label>§ 302-Lauf-ID<input value={form.sgbVLaufId} onChange={e => setForm({ ...form, sgbVLaufId: e.target.value })} /></label>
          <label>Typ
            <select value={form.ruecklaeuferTyp} onChange={e => setForm({ ...form, ruecklaeuferTyp: e.target.value })}>
              {TYPEN.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>Original-Meldung (Pflicht, wird unverändert gespeichert)
            <textarea value={form.originalMeldung} onChange={e => setForm({ ...form, originalMeldung: e.target.value })} rows={4} />
          </label>
          <label>Fehlercode<input value={form.fehlerCode} onChange={e => setForm({ ...form, fehlerCode: e.target.value })} /></label>
          <label>Fehlertext<input value={form.fehlerText} onChange={e => setForm({ ...form, fehlerText: e.target.value })} /></label>
          <button className="admin-btn" disabled={busy || !form.sgbVLaufId || !form.originalMeldung} onClick={importieren}>
            {busy ? 'Importiert…' : 'Importieren'}
          </button>
        </div>
      )}

      <table className="admin-table">
        <thead><tr><th>Lauf</th><th>Typ</th><th>Status</th><th>Fehlercode</th><th>Eingegangen</th></tr></thead>
        <tbody>
          {loading ? (
            <EmptyRow colSpan={5}>Lädt…</EmptyRow>
          ) : liste.length === 0 ? (
            <EmptyRow colSpan={5}>Keine Rückläufer vorhanden.</EmptyRow>
          ) : liste.map(r => (
            <tr key={r.id}>
              <td><a href={`/admin/sgb-v/laeufe/${r.sgb_v_lauf_id}`}>{r.sgb_v_lauf_id.slice(0, 8)}…</a></td>
              <td>{r.ruecklaeufer_typ}</td>
              <td><StatusBadge label={r.status} color="#94a3b8" /></td>
              <td>{r.fehler_code ?? '—'}</td>
              <td>{new Date(r.created_at).toLocaleDateString('de-DE')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
