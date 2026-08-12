'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { WF_MODUL, WF_BEDINGUNG_OPERATOR } from '@/lib/admin/ops'
import { Banner } from '@/components/admin/OpsUI'

interface BedingungForm { feld: string; operator: string; wert: string }

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

export default function NeueWorkflowRegelPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    bezeichnung: '', beschreibung: '', event_typ: '', modul: 'system',
    prioritaet: '100', cooldown_minuten: '', max_ausfuehrungen_pro_entity: '', aktiv: true,
  })
  const [bedingungen, setBedingungen] = useState<BedingungForm[]>([])

  function upd(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function addBedingung() {
    setBedingungen(prev => [...prev, { feld: '', operator: '=', wert: '' }])
  }

  function updBedingung(i: number, patch: Partial<BedingungForm>) {
    setBedingungen(prev => prev.map((b, idx) => idx === i ? { ...b, ...patch } : b))
  }

  function removeBedingung(i: number) {
    setBedingungen(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.bezeichnung.trim()) { setError('Bezeichnung ist erforderlich'); return }
    if (!form.event_typ.trim()) { setError('Event-Typ ist erforderlich'); return }
    setSaving(true)
    setError(null)
    try {
      const body = {
        bezeichnung: form.bezeichnung.trim(),
        beschreibung: form.beschreibung.trim() || null,
        event_typ: form.event_typ.trim(),
        modul: form.modul,
        bedingungen: bedingungen.filter(b => b.feld.trim()).map(b => ({
          feld: b.feld.trim(), operator: b.operator, wert: b.wert,
        })),
        aktiv: form.aktiv,
        prioritaet: parseInt(form.prioritaet) || 100,
        cooldown_minuten: form.cooldown_minuten ? parseInt(form.cooldown_minuten) : null,
        max_ausfuehrungen_pro_entity: form.max_ausfuehrungen_pro_entity ? parseInt(form.max_ausfuehrungen_pro_entity) : null,
      }
      const res = await fetch('/api/ops/workflow/regeln', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Fehler beim Erstellen')
        setSaving(false)
        return
      }
      const created = await res.json()
      router.push(`/admin/workflow/regeln/${created.id}`)
    } catch {
      setError('Netzwerkfehler')
      setSaving(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Neue Workflow-Regel</h1>
          <p className="admin-subtitle">WHEN (Event) → IF (Bedingungen) → THEN (Aktionen später hinzufügen)</p>
        </div>
        <Link href="/admin/workflow/regeln" style={secondaryBtn}>Zurück</Link>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <form onSubmit={handleSubmit}>
        <div style={{ maxWidth: 700 }}>
          <div style={fieldRow}>
            <label style={fieldLabel}>Bezeichnung *</label>
            <input style={inputStyle} value={form.bezeichnung} onChange={e => upd('bezeichnung', e.target.value)} required />
          </div>
          <div style={fieldRow}>
            <label style={fieldLabel}>Beschreibung</label>
            <textarea style={{ ...inputStyle, minHeight: 70 }} value={form.beschreibung} onChange={e => upd('beschreibung', e.target.value)} />
          </div>
          <div style={fieldRow}>
            <label style={fieldLabel}>WHEN — Event-Typ *</label>
            <input style={inputStyle} value={form.event_typ} onChange={e => upd('event_typ', e.target.value)} placeholder="z.B. rechnung_ueberfaellig" required />
          </div>
          <div style={fieldRow}>
            <label style={fieldLabel}>Modul</label>
            <select style={inputStyle} value={form.modul} onChange={e => upd('modul', e.target.value)}>
              {Object.entries(WF_MODUL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          <div style={fieldRow}>
            <label style={fieldLabel}>IF — Bedingungen (optional, alle müssen erfüllt sein)</label>
            {bedingungen.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input style={{ ...inputStyle, flex: 2 }} placeholder="Feld (payload-Key)" value={b.feld} onChange={e => updBedingung(i, { feld: e.target.value })} />
                <select style={{ ...inputStyle, flex: 1 }} value={b.operator} onChange={e => updBedingung(i, { operator: e.target.value })}>
                  {Object.entries(WF_BEDINGUNG_OPERATOR).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <input style={{ ...inputStyle, flex: 2 }} placeholder="Wert" value={b.wert} onChange={e => updBedingung(i, { wert: e.target.value })} />
                <button type="button" onClick={() => removeBedingung(i)} style={{ ...secondaryBtn, color: '#D04B3B' }}>✕</button>
              </div>
            ))}
            <button type="button" onClick={addBedingung} style={secondaryBtn}>+ Bedingung hinzufügen</button>
          </div>

          <div style={fieldRow}>
            <label style={fieldLabel}>Priorität (höher = zuerst geprüft)</label>
            <input type="number" style={inputStyle} value={form.prioritaet} onChange={e => upd('prioritaet', e.target.value)} />
          </div>
          <div style={fieldRow}>
            <label style={fieldLabel}>Cooldown (Minuten, optional)</label>
            <input type="number" style={inputStyle} value={form.cooldown_minuten} onChange={e => upd('cooldown_minuten', e.target.value)} />
          </div>
          <div style={fieldRow}>
            <label style={fieldLabel}>Max. Ausführungen pro Entität (optional)</label>
            <input type="number" style={inputStyle} value={form.max_ausfuehrungen_pro_entity} onChange={e => upd('max_ausfuehrungen_pro_entity', e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <input type="checkbox" checked={form.aktiv} onChange={e => upd('aktiv', e.target.checked)} />
            <label style={{ fontSize: 13, color: 'var(--ink4)' }}>Regel ist aktiv</label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button type="submit" style={primaryBtn} disabled={saving}>{saving ? 'Erstelle...' : 'Regel erstellen'}</button>
          <Link href="/admin/workflow/regeln" style={secondaryBtn}>Abbrechen</Link>
        </div>
      </form>
    </div>
  )
}
