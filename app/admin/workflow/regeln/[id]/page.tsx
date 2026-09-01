'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { WF_MODUL, WF_AKTION_TYP } from '@/lib/admin/ops'
import { StatusBadge, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface Bedingung { feld: string; operator: string; wert?: string }

interface RegelDetail {
  id: string
  bezeichnung: string
  beschreibung: string | null
  event_typ: string
  modul: string
  bedingungen: Bedingung[]
  aktiv: boolean
  prioritaet: number
  max_ausfuehrungen_pro_entity: number | null
  cooldown_minuten: number | null
  ist_system: boolean
}

interface AktionRow {
  id: string
  reihenfolge: number
  typ: string
  konfiguration: Record<string, unknown>
  aktiv: boolean
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
  textDecoration: 'none', display: 'inline-block',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal3)', color: 'var(--ink)', fontSize: 14,
  fontFamily: "'Jost',sans-serif", boxSizing: 'border-box',
}

const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--ink4)', display: 'block', marginBottom: 4 }
const fieldRow: React.CSSProperties = { marginBottom: 14 }

export default function WorkflowRegelDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [regel, setRegel] = useState<RegelDetail | null>(null)
  const [aktionen, setAktionen] = useState<AktionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState<Partial<RegelDetail>>({})
  const [showAktionForm, setShowAktionForm] = useState(false)

  async function load() {
    try {
      const [regelRes, aktionenRes] = await Promise.all([
        fetch(`/api/ops/workflow/regeln/${id}`),
        fetch(`/api/ops/workflow/regeln/${id}/aktionen`),
      ])
      if (regelRes.ok) setRegel(await regelRes.json())
      if (aktionenRes.ok) setAktionen(await aktionenRes.json())
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  function startEdit() {
    if (!regel) return
    setEditData({ bezeichnung: regel.bezeichnung, beschreibung: regel.beschreibung, prioritaet: regel.prioritaet, cooldown_minuten: regel.cooldown_minuten })
    setEditMode(true)
  }

  async function saveDetails() {
    try {
      const res = await fetch(`/api/ops/workflow/regeln/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSaveMsg(err.error || 'Fehler beim Speichern')
        return
      }
      setRegel(await res.json())
      setEditMode(false)
      setSaveMsg('Gespeichert')
      setTimeout(() => setSaveMsg(null), 3000)
    } catch {
      setSaveMsg('Netzwerkfehler')
    }
  }

  async function deleteAktion(aktionId: string) {
    if (!confirm('Aktion wirklich löschen?')) return
    try {
      const res = await fetch(`/api/ops/workflow/regeln/${id}/aktionen/${aktionId}`, { method: 'DELETE' })
      if (!res.ok) { setError('Fehler beim Löschen'); return }
      setAktionen(prev => prev.filter(a => a.id !== aktionId))
    } catch { setError('Netzwerkfehler') }
  }

  if (loading) return <div className="admin-page"><p>Laden...</p></div>
  if (!regel) return <div className="admin-page"><Banner tone="danger">Regel nicht gefunden</Banner></div>

  const mod = WF_MODUL[regel.modul] || { label: regel.modul, color: '#999' }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>{regel.bezeichnung}</h1>
          <p className="admin-subtitle"><StatusBadge label={mod.label} color={mod.color} /></p>
        </div>
        <Link href="/admin/workflow/regeln" style={secondaryBtn}>← Regeln</Link>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {saveMsg && <Banner tone={saveMsg === 'Gespeichert' ? 'success' : 'danger'}>{saveMsg}</Banner>}

      <div style={{ background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        {editMode ? (
          <>
            <div style={fieldRow}>
              <label htmlFor="regeln-bezeichnung" style={fieldLabel}>Bezeichnung</label>
              <input id="regeln-bezeichnung" style={inputStyle} value={editData.bezeichnung ?? ''} onChange={e => setEditData(p => ({ ...p, bezeichnung: e.target.value }))} />
            </div>
            <div style={fieldRow}>
              <label htmlFor="regeln-beschreibung" style={fieldLabel}>Beschreibung</label>
              <textarea id="regeln-beschreibung" style={{ ...inputStyle, minHeight: 70 }} value={editData.beschreibung ?? ''} onChange={e => setEditData(p => ({ ...p, beschreibung: e.target.value }))} />
            </div>
            <div style={fieldRow}>
              <label htmlFor="regeln-prioritaet" style={fieldLabel}>Priorität</label>
              <input id="regeln-prioritaet" type="number" style={inputStyle} value={editData.prioritaet ?? 100} onChange={e => setEditData(p => ({ ...p, prioritaet: parseInt(e.target.value) || 0 }))} />
            </div>
            <div style={fieldRow}>
              <label htmlFor="regeln-cooldown-minuten" style={fieldLabel}>Cooldown (Minuten)</label>
              <input id="regeln-cooldown-minuten" type="number" style={inputStyle} value={editData.cooldown_minuten ?? ''} onChange={e => setEditData(p => ({ ...p, cooldown_minuten: e.target.value ? parseInt(e.target.value) : null }))} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={primaryBtn} onClick={saveDetails}>Speichern</button>
              <button style={secondaryBtn} onClick={() => setEditMode(false)}>Abbrechen</button>
            </div>
          </>
        ) : (
          <>
            {regel.beschreibung && <p style={{ fontSize: 14, color: 'var(--ink3)', marginTop: 0 }}>{regel.beschreibung}</p>}
            <div style={{ fontSize: 14, fontFamily: 'monospace', color: 'var(--ink2)', lineHeight: 2, marginBottom: 16 }}>
              <div><strong style={{ color: 'var(--gold2)' }}>WHEN</strong> {regel.event_typ}</div>
              <div>
                <strong style={{ color: 'var(--gold2)' }}>IF</strong>{' '}
                {regel.bedingungen.length === 0 ? 'immer'
                  : regel.bedingungen.map((b, i) => (
                    <span key={i}>{i > 0 && ' UND '}{b.feld} {b.operator}{b.wert !== undefined && b.wert !== '' ? ` "${b.wert}"` : ''}</span>
                  ))}
              </div>
              <div><strong style={{ color: 'var(--gold2)' }}>THEN</strong> → {aktionen.length} Aktion(en)</div>
            </div>
            <div style={{ display: 'flex', gap: 24, fontSize: 13, color: 'var(--ink4)', marginBottom: 16 }}>
              <span>Priorität: {regel.prioritaet}</span>
              <span>Cooldown: {regel.cooldown_minuten ? `${regel.cooldown_minuten} Min.` : '—'}</span>
              <span>Max. Ausführungen/Entität: {regel.max_ausfuehrungen_pro_entity ?? '—'}</span>
            </div>
            {!regel.ist_system && <button style={secondaryBtn} onClick={startEdit}>Bearbeiten</button>}
          </>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Aktionen</h2>
        <button style={primaryBtn} onClick={() => setShowAktionForm(true)}>+ Aktion hinzufügen</button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Reihenfolge</th><th>Typ</th><th>Konfiguration</th><th>Aktion</th></tr></thead>
          <tbody>
            {aktionen.length === 0 ? (
              <EmptyRow colSpan={4}>Noch keine Aktionen</EmptyRow>
            ) : aktionen.sort((a, b) => a.reihenfolge - b.reihenfolge).map(a => {
              const typ = WF_AKTION_TYP[a.typ] || { label: a.typ, color: '#999' }
              return (
                <tr key={a.id}>
                  <td style={{ textAlign: 'center' }}>{a.reihenfolge}</td>
                  <td><StatusBadge label={typ.label} color={typ.color} /></td>
                  <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--ink4)', maxWidth: 320 }}>
                    {JSON.stringify(a.konfiguration)}
                  </td>
                  <td>
                    <button onClick={() => deleteAktion(a.id)} style={{ ...secondaryBtn, color: '#D04B3B' }}>Löschen</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showAktionForm && (
        <AktionModal
          regelId={id}
          naechsteReihenfolge={aktionen.length + 1}
          onClose={() => setShowAktionForm(false)}
          onSaved={() => { setShowAktionForm(false); load() }}
        />
      )}
    </div>
  )
}

function AktionModal({
  regelId, naechsteReihenfolge, onClose, onSaved,
}: {
  regelId: string
  naechsteReihenfolge: number
  onClose: () => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [typ, setTyp] = useState('aufgabe_erstellen')
  const [reihenfolge, setReihenfolge] = useState(naechsteReihenfolge.toString())
  const [konfigurationJson, setKonfigurationJson] = useState('{}')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    let konfiguration: Record<string, unknown>
    try {
      konfiguration = JSON.parse(konfigurationJson)
    } catch {
      setError('Konfiguration ist kein gültiges JSON')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/ops/workflow/regeln/${regelId}/aktionen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typ, reihenfolge: parseInt(reihenfolge) || 1, konfiguration, aktiv: true }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Fehler beim Erstellen')
        setSaving(false)
        return
      }
      onSaved()
    } catch {
      setError('Netzwerkfehler')
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--coal)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--border)' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Neue Aktion</h2>
        {error && <Banner tone="danger">{error}</Banner>}
        <form onSubmit={handleSubmit}>
          <div style={fieldRow}>
            <label htmlFor="regeln-typ" style={fieldLabel}>Typ</label>
            <select id="regeln-typ" style={inputStyle} value={typ} onChange={e => setTyp(e.target.value)}>
              {Object.entries(WF_AKTION_TYP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={fieldRow}>
            <label htmlFor="regeln-reihenfolge" style={fieldLabel}>Reihenfolge</label>
            <input id="regeln-reihenfolge" type="number" style={inputStyle} value={reihenfolge} onChange={e => setReihenfolge(e.target.value)} min="1" />
          </div>
          <div style={fieldRow}>
            <label htmlFor="regeln-konfiguration-json" style={fieldLabel}>Konfiguration (JSON)</label>
            <textarea id="regeln-konfiguration-json" style={{ ...inputStyle, minHeight: 120, fontFamily: 'monospace' }} value={konfigurationJson} onChange={e => setKonfigurationJson(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={secondaryBtn}>Abbrechen</button>
            <button type="submit" style={primaryBtn} disabled={saving}>{saving ? 'Speichere...' : 'Erstellen'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
