'use client'
// ═══════════════════════════════════════════════════════════════
// Verlaufsdokumentation eines Kunden — pflege_verlauf (chronologisch)
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import {
  PFLEGE_SICHTBARKEIT, PFLEGE_VERLAUF_KATEGORIE, PFLEGE_VERLAUF_TYP, formatDate, statusMeta,
} from '@/lib/admin/ops'
import { Banner, StatusBadge } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, SchalterFeld, TextBereich, TextFeld,
  pflegeMiniBtn, pflegePrimaryBtn, pflegeSecondaryBtn,
} from '@/components/admin/PflegeUI'
import { gruppiereNachTag } from '@/lib/pflege/verlauf'
import type { PflegeUebersichtZeile, PflegeVerlaufEintrag } from '@/lib/pflege/types'

const LEER = {
  eintragTyp: 'verlauf', kategorie: 'allgemein', titel: '', inhalt: '',
  istDringend: false, sichtbarkeit: 'intern', eintragDatum: '',
}

export default function AdminVerlaufPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params)
  const [eintraege, setEintraege] = useState<PflegeVerlaufEintrag[]>([])
  const [kunde, setKunde] = useState<PflegeUebersichtZeile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(LEER)
  const [zeigeForm, setZeigeForm] = useState(false)
  const [typFilter, setTypFilter] = useState('all')
  const [nurDringende, setNurDringende] = useState(false)
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null)
  const [bearbeiteInhalt, setBearbeiteInhalt] = useState('')

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [vRes, kRes] = await Promise.all([
        fetch(`/api/pflege/verlauf?clientId=${clientId}`).then(r => r.json()),
        fetch(`/api/pflege/uebersicht?clientId=${clientId}`).then(r => r.json()),
      ])
      if (vRes.error) { setError(vRes.error); return }
      setEintraege(vRes.eintraege || [])
      setKunde((kRes.uebersicht || [])[0] ?? null)
    } catch {
      setError('Laden fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }

  async function anlegen() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/pflege/verlauf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId, ...form,
          eintragDatum: form.eintragDatum ? new Date(form.eintragDatum).toISOString() : undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Anlegen fehlgeschlagen.'); return }
      setForm(LEER)
      setZeigeForm(false)
      await load()
    } finally { setBusy(false) }
  }

  async function speichereBearbeitung(id: string) {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/pflege/verlauf/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inhalt: bearbeiteInhalt }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Speichern fehlgeschlagen.'); return }
      setEintraege(es => es.map(e => (e.id === id ? body.eintrag : e)))
      setBearbeiteId(null)
    } finally { setBusy(false) }
  }

  async function sichtbarkeitAendern(id: string, sichtbarkeit: string) {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/pflege/verlauf/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sichtbarkeit }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Ändern fehlgeschlagen.'); return }
      setEintraege(es => es.map(e => (e.id === id ? body.eintrag : e)))
    } finally { setBusy(false) }
  }

  const gefiltert = useMemo(() => eintraege.filter(e => {
    if (typFilter !== 'all' && e.eintrag_typ !== typFilter) return false
    if (nurDringende && !e.ist_dringend) return false
    return true
  }), [eintraege, typFilter, nurDringende])

  const tage = useMemo(() => gruppiereNachTag(gefiltert), [gefiltert])

  if (loading) return <div className="admin-page"><p style={{ color: 'var(--muted)' }}>Laden…</p></div>

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Verlaufsdokumentation</h1>
          <p className="admin-subtitle">
            {kunde ? `${kunde.first_name} ${kunde.last_name}` : 'Kunde'} · {eintraege.length} Einträge
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setZeigeForm(v => !v)} style={pflegePrimaryBtn}>+ Eintrag</button>
          <Link href={`/admin/pflegedoku/perioden/${clientId}`} style={pflegeSecondaryBtn}>Monatsabschlüsse</Link>
          <Link href="/admin/pflegedoku" style={pflegeSecondaryBtn}>← Übersicht</Link>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {zeigeForm && (
        <Karte titel="Neuer Verlaufseintrag">
          <FeldRaster>
            <AuswahlFeld label="Art des Eintrags" value={form.eintragTyp} onChange={v => setForm(f => ({ ...f, eintragTyp: v }))} optionen={PFLEGE_VERLAUF_TYP} />
            <AuswahlFeld label="Kategorie" value={form.kategorie} onChange={v => setForm(f => ({ ...f, kategorie: v }))} optionen={PFLEGE_VERLAUF_KATEGORIE} />
            <AuswahlFeld label="Sichtbarkeit" value={form.sichtbarkeit} onChange={v => setForm(f => ({ ...f, sichtbarkeit: v }))} optionen={PFLEGE_SICHTBARKEIT} />
            <TextFeld label="Zeitpunkt" type="datetime-local" value={form.eintragDatum} onChange={v => setForm(f => ({ ...f, eintragDatum: v }))} />
            <TextFeld label="Titel" value={form.titel} onChange={v => setForm(f => ({ ...f, titel: v }))} />
          </FeldRaster>
          <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
            <TextBereich label="Inhalt *" value={form.inhalt} onChange={v => setForm(f => ({ ...f, inhalt: v }))} rows={4} />
            <SchalterFeld label="Als dringend markieren" value={form.istDringend} onChange={v => setForm(f => ({ ...f, istDringend: v }))} />
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={anlegen} disabled={busy || !form.inhalt} style={pflegePrimaryBtn}>Speichern</button>
            <button onClick={() => setZeigeForm(false)} style={pflegeSecondaryBtn}>Abbrechen</button>
          </div>
        </Karte>
      )}

      <div className="admin-filters">
        <button className={`admin-filter-btn ${typFilter === 'all' ? 'active' : ''}`} onClick={() => setTypFilter('all')}>Alle</button>
        {Object.entries(PFLEGE_VERLAUF_TYP).map(([k, v]) => (
          <button key={k} className={`admin-filter-btn ${typFilter === k ? 'active' : ''}`} onClick={() => setTypFilter(k)}>{v.label}</button>
        ))}
        <span style={{ marginLeft: 8 }}>
          <SchalterFeld label="Nur dringende" value={nurDringende} onChange={setNurDringende} />
        </span>
      </div>

      {tage.length === 0 && <p style={{ color: 'var(--muted)', padding: 24, textAlign: 'center' }}>Keine Einträge</p>}

      {tage.map(({ tag, eintraege: liste }) => (
        <div key={tag} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--ink5)', marginBottom: 8 }}>
            {formatDate(tag)}
          </div>
          {liste.map(e => (
            <div
              key={e.id}
              style={{
                background: 'var(--coal2)',
                border: `1px solid ${e.ist_dringend ? 'rgba(208,75,59,.45)' : 'var(--border)'}`,
                borderRadius: 12, padding: 14, marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <StatusBadge label={statusMeta(PFLEGE_VERLAUF_TYP, e.eintrag_typ).label} color={statusMeta(PFLEGE_VERLAUF_TYP, e.eintrag_typ).color} />
                <StatusBadge label={statusMeta(PFLEGE_VERLAUF_KATEGORIE, e.kategorie).label} color={statusMeta(PFLEGE_VERLAUF_KATEGORIE, e.kategorie).color} />
                <StatusBadge label={statusMeta(PFLEGE_SICHTBARKEIT, e.sichtbarkeit).label} color={statusMeta(PFLEGE_SICHTBARKEIT, e.sichtbarkeit).color} />
                {e.ist_dringend && <span style={{ fontSize: 12, color: '#D04B3B', fontWeight: 700 }}>DRINGEND</span>}
                {e.gesperrt && <span style={{ fontSize: 12, color: 'var(--ink4)' }}>🔒 gesperrt</span>}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink4)' }}>
                  {new Date(e.eintrag_datum).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · {e.autor_name} ({e.autor_rolle})
                </span>
              </div>
              {e.titel && <div style={{ fontWeight: 600, marginBottom: 4 }}>{e.titel}</div>}
              {bearbeiteId === e.id
                ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <TextBereich label="Inhalt" value={bearbeiteInhalt} onChange={setBearbeiteInhalt} rows={4} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => speichereBearbeitung(e.id)} disabled={busy} style={pflegePrimaryBtn}>Speichern</button>
                      <button onClick={() => setBearbeiteId(null)} style={pflegeSecondaryBtn}>Abbrechen</button>
                    </div>
                  </div>
                )
                : <p style={{ fontSize: 14, color: 'var(--ink2)', whiteSpace: 'pre-wrap', margin: 0 }}>{e.inhalt}</p>}

              {!e.gesperrt && bearbeiteId !== e.id && (
                <div style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button onClick={() => { setBearbeiteId(e.id); setBearbeiteInhalt(e.inhalt) }} style={pflegeMiniBtn}>Bearbeiten</button>
                  <select
                    value={e.sichtbarkeit}
                    onChange={ev => sichtbarkeitAendern(e.id, ev.target.value)}
                    disabled={busy}
                    style={{ ...pflegeMiniBtn, padding: '4px 6px' }}
                  >
                    {Object.entries(PFLEGE_SICHTBARKEIT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
