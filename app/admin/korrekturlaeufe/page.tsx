'use client'
import { useEffect, useState } from 'react'
import { StatusBadge, EmptyRow, Banner } from '@/components/admin/OpsUI'
import Link from 'next/link'

function euro(cents: number) {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  angelegt: { label: 'Angelegt', color: '#3b82f6' },
  in_bearbeitung: { label: 'In Bearbeitung', color: '#f59e0b' },
  validiert: { label: 'Validiert', color: '#06b6d4' },
  freigegeben: { label: 'Freigegeben', color: '#8b5cf6' },
  exportiert: { label: 'Exportiert', color: '#0ea5e9' },
  uebermittelt: { label: 'Übermittelt', color: '#8b5cf6' },
  abgeschlossen: { label: 'Abgeschlossen', color: '#22c55e' },
  abgebrochen: { label: 'Abgebrochen', color: '#9ca3af' },
}

const TYP_LABELS: Record<string, string> = {
  korrekturabrechnung: 'Korrekturabrechnung',
  nachberechnung: 'Nachberechnung',
  storno: 'Storno',
  teilstorno: 'Teilstorno',
  gutschrift: 'Gutschrift',
}

interface Korrektur {
  id: string
  original_lauf_id: string
  korrektur_lauf_id: string | null
  korrektur_typ: string
  korrektur_grund: string
  betroffene_rechnungen: number
  differenz_cent: number
  status: string
  created_at: string
  original_lauf: {
    id: string
    abrechnungsmonat: string
    kostentraeger_name: string
    status: string
  } | null
}

export default function KorrekturlaeufePage() {
  const [korrekturen, setKorrekturen] = useState<Korrektur[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/dta/korrektur')
      const data = await res.json()
      setKorrekturen(Array.isArray(data) ? data : [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function ausfuehren(korrekturId: string) {
    setActionBusy(korrekturId)
    setError(null)
    try {
      const res = await fetch('/api/billing/dta/korrektur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ausfuehren', korrekturId }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error)
      else await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setActionBusy(null)
    }
  }

  const offen = korrekturen.filter(k => ['angelegt', 'in_bearbeitung'].includes(k.status)).length

  return (
    <div className="admin-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1>Korrekturläufe</h1>
        <button className="admin-btn primary" onClick={() => setShowCreate(!showCreate)}>
          + Neue Korrektur
        </button>
      </div>

      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
        Korrekturabrechnungen, Nachberechnungen, Stornos und Gutschriften.
      </p>

      {offen > 0 && <Banner tone="info">{offen} Korrektur(en) offen.</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}

      {showCreate && <CreateKorrekturForm onClose={() => { setShowCreate(false); load() }} />}

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Typ</th>
              <th>Original-Lauf</th>
              <th>Grund</th>
              <th>Rechnungen</th>
              <th style={{ textAlign: 'right' }}>Differenz</th>
              <th>Status</th>
              <th>Korrektur-Lauf</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9}>Lade…</td></tr>
            ) : korrekturen.length === 0 ? (
              <EmptyRow colSpan={9}>Keine Korrekturläufe vorhanden.</EmptyRow>
            ) : korrekturen.map(k => {
              const sm = STATUS_META[k.status] || { label: k.status, color: '#94a3b8' }
              return (
                <tr key={k.id}>
                  <td>{new Date(k.created_at).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}</td>
                  <td>{TYP_LABELS[k.korrektur_typ] || k.korrektur_typ}</td>
                  <td>
                    <Link href={`/admin/dta/laeufe/${k.original_lauf_id}`}>
                      {k.original_lauf?.abrechnungsmonat || '→'} — {k.original_lauf?.kostentraeger_name || ''}
                    </Link>
                  </td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={k.korrektur_grund}>{k.korrektur_grund}</td>
                  <td>{k.betroffene_rechnungen}</td>
                  <td style={{ textAlign: 'right' }}>{euro(k.differenz_cent)}</td>
                  <td><StatusBadge label={sm.label} color={sm.color} /></td>
                  <td>
                    {k.korrektur_lauf_id ? (
                      <Link href={`/admin/dta/laeufe/${k.korrektur_lauf_id}`} className="admin-btn small">
                        Lauf →
                      </Link>
                    ) : '—'}
                  </td>
                  <td>
                    {k.status === 'angelegt' && (
                      <button className="admin-btn small primary" disabled={actionBusy === k.id}
                        onClick={() => ausfuehren(k.id)}>
                        {actionBusy === k.id ? '…' : 'Ausführen'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CreateKorrekturForm({ onClose }: { onClose: () => void }) {
  const [originalLaufId, setOriginalLaufId] = useState('')
  const [korrekturTyp, setKorrekturTyp] = useState('korrekturabrechnung')
  const [korrekturGrund, setKorrekturGrund] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)

  async function submit() {
    if (!originalLaufId || !korrekturGrund) {
      setErr('Alle Felder ausfüllen')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/billing/dta/korrektur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalLaufId, korrekturTyp, korrekturGrund }),
      })
      const data = await res.json()
      if (!res.ok) setErr(data.error)
      else setResult(data)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <div className="admin-card" style={{ marginBottom: 24, padding: 20 }}>
        <Banner tone="success">Korrekturlauf erstellt. {result.betroffeneRechnungen} Rechnungen betroffen.</Banner>
        <button className="admin-btn" onClick={onClose} style={{ marginTop: 12 }}>Schließen</button>
      </div>
    )
  }

  return (
    <div className="admin-card" style={{ marginBottom: 24, padding: 20 }}>
      <h3>Neuen Korrekturlauf erstellen</h3>
      {err && <Banner tone="danger">{err}</Banner>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
        <label>
          <span style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Original-Lauf-ID</span>
          <input type="text" value={originalLaufId} onChange={e => setOriginalLaufId(e.target.value)}
            placeholder="UUID des Original-Laufs" className="admin-input" style={{ width: 300 }} />
        </label>
        <label>
          <span style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Typ</span>
          <select value={korrekturTyp} onChange={e => setKorrekturTyp(e.target.value)} className="admin-select">
            <option value="korrekturabrechnung">Korrekturabrechnung</option>
            <option value="nachberechnung">Nachberechnung</option>
            <option value="storno">Storno</option>
            <option value="teilstorno">Teilstorno</option>
            <option value="gutschrift">Gutschrift</option>
          </select>
        </label>
        <label>
          <span style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Grund</span>
          <input type="text" value={korrekturGrund} onChange={e => setKorrekturGrund(e.target.value)}
            placeholder="Korrekturgrund" className="admin-input" style={{ width: 300 }} />
        </label>
        <button className="admin-btn primary" onClick={submit} disabled={busy}>
          {busy ? 'Erstelle…' : 'Erstellen'}
        </button>
        <button className="admin-btn" onClick={onClose}>Abbrechen</button>
      </div>
    </div>
  )
}
