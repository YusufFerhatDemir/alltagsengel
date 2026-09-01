'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AUFGABEN_KATEGORIE, AUFGABEN_PRIORITAET, AUFGABEN_STATUS, WIEDERHOLUNG_INTERVALL,
} from '@/lib/admin/ops'
import { Banner } from '@/components/admin/OpsUI'

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

const fieldRow: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, alignItems: 'center',
  padding: '8px 0', borderBottom: '1px solid var(--border)',
}

const fieldLabel: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--ink4)',
}

export default function NeueAufgabePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    titel: '',
    beschreibung: '',
    kategorie: 'allgemein',
    prioritaet: 'mittel',
    status: 'offen',
    verantwortlich_id: '',
    stellvertreter_id: '',
    faellig_am: '',
    client_id: '',
    caregiver_id: '',
    ist_wiederkehrend: false,
    wiederholung_intervall: '',
    wiederholung_ende: '',
    tags: '',
  })

  function upd(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titel.trim()) { setError('Titel ist erforderlich'); return }
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        titel: form.titel.trim(),
        beschreibung: form.beschreibung.trim() || null,
        kategorie: form.kategorie,
        prioritaet: form.prioritaet,
        status: form.status,
        verantwortlich_id: form.verantwortlich_id.trim() || null,
        stellvertreter_id: form.stellvertreter_id.trim() || null,
        faellig_am: form.faellig_am || null,
        client_id: form.client_id.trim() || null,
        caregiver_id: form.caregiver_id.trim() || null,
        ist_wiederkehrend: form.ist_wiederkehrend,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      }
      if (form.ist_wiederkehrend && form.wiederholung_intervall) {
        body.wiederholung_intervall = form.wiederholung_intervall
        body.wiederholung_ende = form.wiederholung_ende || null
      }
      const res = await fetch('/api/ops/aufgaben', {
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
      router.push(`/admin/aufgaben/${created.id}`)
    } catch {
      setError('Netzwerkfehler')
      setSaving(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Neue Aufgabe</h1>
          <p className="admin-subtitle">Aufgabe erstellen und zuweisen</p>
        </div>
        <Link href="/admin/aufgaben" style={secondaryBtn}>Zurück</Link>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <form onSubmit={handleSubmit}>
        <div style={{ maxWidth: 700 }}>
          <div style={fieldRow}>
            <label htmlFor="neu-titel" style={fieldLabel}>Titel *</label>
            <input id="neu-titel" style={inputStyle} value={form.titel} onChange={e => upd('titel', e.target.value)} required />
          </div>

          <div style={fieldRow}>
            <label htmlFor="neu-beschreibung" style={fieldLabel}>Beschreibung</label>
            <textarea
              id="neu-beschreibung"
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
              value={form.beschreibung}
              onChange={e => upd('beschreibung', e.target.value)}
            />
          </div>

          <div style={fieldRow}>
            <label htmlFor="neu-kategorie" style={fieldLabel}>Kategorie</label>
            <select id="neu-kategorie" style={inputStyle} value={form.kategorie} onChange={e => upd('kategorie', e.target.value)}>
              {Object.entries(AUFGABEN_KATEGORIE).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          <div style={fieldRow}>
            <label htmlFor="neu-prioritaet" style={fieldLabel}>Priorität</label>
            <select id="neu-prioritaet" style={inputStyle} value={form.prioritaet} onChange={e => upd('prioritaet', e.target.value)}>
              {Object.entries(AUFGABEN_PRIORITAET).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          <div style={fieldRow}>
            <label htmlFor="neu-status" style={fieldLabel}>Status</label>
            <select id="neu-status" style={inputStyle} value={form.status} onChange={e => upd('status', e.target.value)}>
              {Object.entries(AUFGABEN_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          <div style={fieldRow}>
            <label htmlFor="neu-verantwortlich-id" style={fieldLabel}>Verantwortlich (ID)</label>
            <input id="neu-verantwortlich-id" style={inputStyle} value={form.verantwortlich_id} onChange={e => upd('verantwortlich_id', e.target.value)} placeholder="UUID des Verantwortlichen" />
          </div>

          <div style={fieldRow}>
            <label htmlFor="neu-stellvertreter-id" style={fieldLabel}>Stellvertreter (ID)</label>
            <input id="neu-stellvertreter-id" style={inputStyle} value={form.stellvertreter_id} onChange={e => upd('stellvertreter_id', e.target.value)} placeholder="UUID des Stellvertreters" />
          </div>

          <div style={fieldRow}>
            <label htmlFor="neu-faellig-am" style={fieldLabel}>Fällig am</label>
            <input id="neu-faellig-am" type="date" style={inputStyle} value={form.faellig_am} onChange={e => upd('faellig_am', e.target.value)} />
          </div>

          <div style={fieldRow}>
            <label htmlFor="neu-klient-id" style={fieldLabel}>Klient (ID)</label>
            <input id="neu-klient-id" style={inputStyle} value={form.client_id} onChange={e => upd('client_id', e.target.value)} placeholder="UUID des Klienten (optional)" />
          </div>

          <div style={fieldRow}>
            <label htmlFor="neu-betreuungskraft-id" style={fieldLabel}>Betreuungskraft (ID)</label>
            <input id="neu-betreuungskraft-id" style={inputStyle} value={form.caregiver_id} onChange={e => upd('caregiver_id', e.target.value)} placeholder="UUID der Betreuungskraft (optional)" />
          </div>

          <div style={fieldRow}>
            <label htmlFor="neu-tags" style={fieldLabel}>Tags</label>
            <input id="neu-tags" style={inputStyle} value={form.tags} onChange={e => upd('tags', e.target.value)} placeholder="Kommagetrennt, z.B. dringend, kasse" />
          </div>

          <div style={{ ...fieldRow, borderBottom: 'none' }}>
            <label htmlFor="neu-wiederkehrend" style={fieldLabel}>Wiederkehrend</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                id="neu-wiederkehrend"
                type="checkbox"
                checked={form.ist_wiederkehrend}
                onChange={e => upd('ist_wiederkehrend', e.target.checked)}
              />
              <span style={{ fontSize: 13, color: 'var(--ink4)' }}>Aufgabe wiederholt sich</span>
            </div>
          </div>

          {form.ist_wiederkehrend && (
            <>
              <div style={fieldRow}>
                <label htmlFor="neu-intervall" style={fieldLabel}>Intervall</label>
                <select id="neu-intervall" style={inputStyle} value={form.wiederholung_intervall} onChange={e => upd('wiederholung_intervall', e.target.value)}>
                  <option value="">Bitte wählen</option>
                  {Object.entries(WIEDERHOLUNG_INTERVALL).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              <div style={fieldRow}>
                <label htmlFor="neu-wiederholung-bis" style={fieldLabel}>Wiederholung bis</label>
                <input id="neu-wiederholung-bis" type="date" style={inputStyle} value={form.wiederholung_ende} onChange={e => upd('wiederholung_ende', e.target.value)} />
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button type="submit" style={primaryBtn} disabled={saving}>
            {saving ? 'Erstelle...' : 'Aufgabe erstellen'}
          </button>
          <Link href="/admin/aufgaben" style={secondaryBtn}>Abbrechen</Link>
        </div>
      </form>
    </div>
  )
}
