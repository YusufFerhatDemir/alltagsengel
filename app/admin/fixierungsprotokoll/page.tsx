'use client'
// ═══════════════════════════════════════════════════════════════
// Fixierungsprotokoll — freiheitsentziehende Maßnahmen (§1831 BGB)
// mit Überwachungsprotokoll während der Maßnahme.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { Banner, EmptyRow, SearchInput, StatusBadge } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, SchalterFeld, TextBereich, TextFeld,
  pflegeInput, pflegeMiniBtn, pflegePrimaryBtn, pflegeSecondaryBtn,
} from '@/components/admin/PflegeUI'

interface Massnahme {
  id: string
  client_id: string
  art: string
  grund: string
  beginn_am: string
  ende_am: string | null
  richterlich_genehmigt: boolean
  genehmigung_aktenzeichen: string | null
  genehmigung_gueltig_bis: string | null
  eilfall: boolean
  einwilligung_betreuer: boolean
  betreuer_name: string | null
  arzt_informiert: boolean
  ueberwachungsintervall_minuten: number
  status: 'aktiv' | 'beendet'
  beendigungsgrund: string | null
  bemerkung: string | null
  created_at: string
  clients: { first_name: string; last_name: string } | null
}

interface Ueberwachung {
  id: string
  kontrolliert_am: string
  zustand_klient: string | null
  verletzungen: boolean
  verletzungen_beschreibung: string | null
  massnahme_weiterhin_erforderlich: boolean
  bemerkung: string | null
}

type Kunde = { id: string; first_name: string; last_name: string }

const ARTEN: Record<string, string> = {
  bettgitter: 'Bettgitter',
  gurtfixierung: 'Gurtfixierung',
  fixierweste: 'Fixierweste',
  sedierende_medikation: 'Sedierende Medikation',
  bewegungseinschraenkender_stuhl: 'Bewegungseinschränkender Stuhl',
  einschliessung: 'Einschließung',
  sonstige: 'Sonstige',
}

const LEER_FORM = {
  clientId: '',
  art: 'bettgitter',
  grund: '',
  richterlichGenehmigt: false,
  genehmigungAktenzeichen: '',
  genehmigungGueltigBis: '',
  eilfall: false,
  einwilligungBetreuer: false,
  betreuerName: '',
  arztInformiert: false,
  ueberwachungsintervallMinuten: '30',
  bemerkung: '',
}

const LEER_UEBERWACHUNG = {
  zustandKlient: '',
  verletzungen: false,
  verletzungenBeschreibung: '',
  massnahmeWeiterhinErforderlich: true,
  bemerkung: '',
}

export default function FixierungsprotokollPage() {
  const [massnahmen, setMassnahmen] = useState<Massnahme[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'aktiv' | 'beendet' | 'all'>('aktiv')
  const [zeigeForm, setZeigeForm] = useState(false)
  const [form, setForm] = useState(LEER_FORM)
  const [viewId, setViewId] = useState<string | null>(null)
  const [ueberwachungen, setUeberwachungen] = useState<Ueberwachung[]>([])
  const [uForm, setUForm] = useState(LEER_UEBERWACHUNG)

  async function loadKunden() {
    try {
      const res = await fetch('/api/pflege/uebersicht')
      const body = await res.json()
      const liste: Kunde[] = (body.uebersicht || []).map((z: { client_id: string; first_name: string; last_name: string }) => ({
        id: z.client_id, first_name: z.first_name, last_name: z.last_name,
      }))
      setKunden(liste)
    } catch { /* Klientenliste optional für Formular */ }
  }

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/fixierungen')
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Fehler beim Laden'); return }
      setMassnahmen(body.massnahmen || [])
    } catch {
      setError('Maßnahmen konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  async function loadUeberwachungen(id: string) {
    try {
      const res = await fetch(`/api/admin/fixierungen/${id}/ueberwachung`)
      const body = await res.json()
      setUeberwachungen(body.ueberwachungen || [])
    } catch { /* nicht kritisch */ }
  }

  useEffect(() => { load(); loadKunden() }, [])
  useEffect(() => { if (viewId) loadUeberwachungen(viewId) }, [viewId])

  async function speichern() {
    if (!form.clientId || !form.grund.trim()) {
      setError('Klient und Grund sind Pflichtfelder.')
      return
    }
    if (!form.richterlichGenehmigt && !form.eilfall) {
      setError('Ohne richterliche Genehmigung muss "Eilfall" markiert werden (nachträgliche Genehmigung erforderlich).')
      return
    }
    setBusy(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/admin/fixierungen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: form.clientId,
          art: form.art,
          grund: form.grund.trim(),
          richterlich_genehmigt: form.richterlichGenehmigt,
          genehmigung_aktenzeichen: form.genehmigungAktenzeichen || null,
          genehmigung_gueltig_bis: form.genehmigungGueltigBis || null,
          eilfall: form.eilfall,
          einwilligung_betreuer: form.einwilligungBetreuer,
          betreuer_name: form.betreuerName || null,
          arzt_informiert: form.arztInformiert,
          ueberwachungsintervall_minuten: Number(form.ueberwachungsintervallMinuten) || 30,
          bemerkung: form.bemerkung || null,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Anlegen fehlgeschlagen.'); return }
      setSuccess('Maßnahme wurde angelegt.')
      setForm(LEER_FORM)
      setZeigeForm(false)
      await load()
    } finally { setBusy(false) }
  }

  async function archivieren(m: Massnahme) {
    if (!confirm('Maßnahme wirklich archivieren? Sie wird aus der Liste entfernt.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/fixierungen/${m.id}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Archivierung fehlgeschlagen.'); return }
      setSuccess('Maßnahme wurde archiviert.')
      await load()
    } finally { setBusy(false) }
  }

  async function beenden(m: Massnahme) {
    const grund = window.prompt('Beendigungsgrund (z. B. "Maßnahme nicht mehr erforderlich"):')
    if (grund === null) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/fixierungen/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'beendet', beendigungsgrund: grund || 'Nicht angegeben' }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Beenden fehlgeschlagen.'); return }
      await load()
    } finally { setBusy(false) }
  }

  async function ueberwachungSpeichern() {
    if (!viewId) return
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/admin/fixierungen/${viewId}/ueberwachung`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uForm),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Speichern fehlgeschlagen.'); return }
      setUForm(LEER_UEBERWACHUNG)
      await loadUeberwachungen(viewId)
    } finally { setBusy(false) }
  }

  const gefiltert = useMemo(() => {
    const q = search.trim().toLowerCase()
    return massnahmen.filter(m => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false
      if (!q) return true
      const name = `${m.clients?.first_name || ''} ${m.clients?.last_name || ''}`.toLowerCase()
      return name.includes(q) || m.grund.toLowerCase().includes(q) || (ARTEN[m.art] || m.art).toLowerCase().includes(q)
    })
  }, [massnahmen, search, statusFilter])

  const viewMassnahme = viewId ? massnahmen.find(m => m.id === viewId) : null
  const statsAktiv = massnahmen.filter(m => m.status === 'aktiv').length
  const statsOhneGenehmigung = massnahmen.filter(m => m.status === 'aktiv' && !m.richterlich_genehmigt).length

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Fixierungsprotokoll</h1>
          <p className="admin-subtitle">Freiheitsentziehende Maßnahmen (§1831 BGB) — Genehmigung, Grund, Überwachung</p>
        </div>
        {!zeigeForm && !viewId && (
          <button onClick={() => setZeigeForm(true)} style={pflegePrimaryBtn}>+ Neue Maßnahme</button>
        )}
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--gold)' }}>{statsAktiv}</div>
          <div style={{ fontSize: 12, color: 'var(--ink4)' }}>Aktive Maßnahmen</div>
        </div>
        <div className="admin-stat-card">
          <div style={{ fontSize: 24, fontWeight: 700, color: statsOhneGenehmigung > 0 ? '#D04B3B' : 'var(--ink4)' }}>{statsOhneGenehmigung}</div>
          <div style={{ fontSize: 12, color: 'var(--ink4)' }}>Ohne richterliche Genehmigung (Eilfall)</div>
        </div>
      </div>

      {viewMassnahme && (
        <Karte
          titel={`${ARTEN[viewMassnahme.art] || viewMassnahme.art} — ${viewMassnahme.clients?.first_name} ${viewMassnahme.clients?.last_name}`}
          aktion={<button onClick={() => setViewId(null)} style={pflegeSecondaryBtn}>Zurück zur Liste</button>}
        >
          <FeldRaster>
            <div><span style={{ fontSize: 12, color: 'var(--ink4)' }}>Beginn</span><div>{new Date(viewMassnahme.beginn_am).toLocaleString('de-DE')}</div></div>
            <div><span style={{ fontSize: 12, color: 'var(--ink4)' }}>Status</span><div><StatusBadge label={viewMassnahme.status === 'aktiv' ? 'Aktiv' : 'Beendet'} color={viewMassnahme.status === 'aktiv' ? 'green' : 'gray'} /></div></div>
            <div><span style={{ fontSize: 12, color: 'var(--ink4)' }}>Richterlich genehmigt</span><div>{viewMassnahme.richterlich_genehmigt ? `Ja (${viewMassnahme.genehmigung_aktenzeichen || 'kein Az.'})` : (viewMassnahme.eilfall ? 'Nein — Eilfall' : 'Nein')}</div></div>
            <div><span style={{ fontSize: 12, color: 'var(--ink4)' }}>Überwachungsintervall</span><div>{viewMassnahme.ueberwachungsintervall_minuten} Min.</div></div>
          </FeldRaster>
          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--ink4)' }}>Grund</span>
            <p style={{ margin: '4px 0 0', fontSize: 14 }}>{viewMassnahme.grund}</p>
          </div>
          {viewMassnahme.status === 'aktiv' && (
            <div style={{ marginTop: 14 }}>
              <button onClick={() => beenden(viewMassnahme)} disabled={busy} style={{ ...pflegeSecondaryBtn, color: '#D04B3B' }}>
                Maßnahme beenden
              </button>
            </div>
          )}

          <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>Überwachungsprotokoll</h3>
            {viewMassnahme.status === 'aktiv' && (
              <div style={{ marginBottom: 16, background: 'var(--coal)', borderRadius: 10, padding: 12 }}>
                <FeldRaster>
                  <TextFeld label="Zustand des Klienten" value={uForm.zustandKlient}
                    onChange={v => setUForm(f => ({ ...f, zustandKlient: v }))} placeholder="z. B. ruhig, schläft" />
                </FeldRaster>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                  <SchalterFeld label="Verletzungen festgestellt" value={uForm.verletzungen}
                    onChange={v => setUForm(f => ({ ...f, verletzungen: v }))} />
                  <SchalterFeld label="Maßnahme weiterhin erforderlich" value={uForm.massnahmeWeiterhinErforderlich}
                    onChange={v => setUForm(f => ({ ...f, massnahmeWeiterhinErforderlich: v }))} />
                </div>
                {uForm.verletzungen && (
                  <div style={{ marginTop: 8 }}>
                    <TextBereich label="Verletzungsbeschreibung" value={uForm.verletzungenBeschreibung} rows={2}
                      onChange={v => setUForm(f => ({ ...f, verletzungenBeschreibung: v }))} />
                  </div>
                )}
                <div style={{ marginTop: 8 }}>
                  <TextBereich label="Bemerkung" value={uForm.bemerkung} rows={2}
                    onChange={v => setUForm(f => ({ ...f, bemerkung: v }))} />
                </div>
                <button onClick={ueberwachungSpeichern} disabled={busy} style={{ ...pflegePrimaryBtn, marginTop: 10 }}>
                  Kontrolle protokollieren
                </button>
              </div>
            )}
            {ueberwachungen.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--ink4)' }}>Noch keine Kontrollen protokolliert.</p>
              : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {ueberwachungen.map(u => (
                    <div key={u.id} style={{ background: 'var(--coal)', borderRadius: 8, padding: 10, fontSize: 13 }}>
                      <div style={{ fontWeight: 600 }}>{new Date(u.kontrolliert_am).toLocaleString('de-DE')}</div>
                      {u.zustand_klient && <div>Zustand: {u.zustand_klient}</div>}
                      {u.verletzungen && <div style={{ color: '#D04B3B' }}>Verletzungen: {u.verletzungen_beschreibung || 'ja'}</div>}
                      <div>Weiterhin erforderlich: {u.massnahme_weiterhin_erforderlich ? 'Ja' : 'Nein'}</div>
                      {u.bemerkung && <div style={{ color: 'var(--ink4)' }}>{u.bemerkung}</div>}
                    </div>
                  ))}
                </div>
              )}
          </div>
        </Karte>
      )}

      {zeigeForm && !viewId && (
        <Karte titel="Neue freiheitsentziehende Maßnahme" aktion={
          <button onClick={() => setZeigeForm(false)} style={pflegeSecondaryBtn}>Abbrechen</button>
        }>
          <FeldRaster>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink4)' }}>Klient *</span>
              <select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} style={pflegeInput}>
                <option value="">-- Klient wählen --</option>
                {kunden.map(k => <option key={k.id} value={k.id}>{k.first_name} {k.last_name}</option>)}
              </select>
            </label>
            <AuswahlFeld label="Art der Maßnahme" value={form.art}
              onChange={v => setForm(f => ({ ...f, art: v }))}
              optionen={Object.entries(ARTEN)} />
            <TextFeld label="Genehmigungsaktenzeichen" value={form.genehmigungAktenzeichen}
              onChange={v => setForm(f => ({ ...f, genehmigungAktenzeichen: v }))} />
            <TextFeld label="Genehmigung gültig bis" type="date" value={form.genehmigungGueltigBis}
              onChange={v => setForm(f => ({ ...f, genehmigungGueltigBis: v }))} />
            <TextFeld label="Betreuer/Bevollmächtigter" value={form.betreuerName}
              onChange={v => setForm(f => ({ ...f, betreuerName: v }))} />
            <TextFeld label="Überwachungsintervall (Min.)" type="number" value={form.ueberwachungsintervallMinuten}
              onChange={v => setForm(f => ({ ...f, ueberwachungsintervallMinuten: v }))} />
          </FeldRaster>
          <div style={{ marginTop: 12 }}>
            <TextBereich label="Grund der Maßnahme *" value={form.grund} rows={3}
              onChange={v => setForm(f => ({ ...f, grund: v }))}
              placeholder="Medizinische/pflegerische Begründung, Eigen-/Fremdgefährdung..." />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            <SchalterFeld label="Richterlich genehmigt" value={form.richterlichGenehmigt}
              onChange={v => setForm(f => ({ ...f, richterlichGenehmigt: v }))} />
            <SchalterFeld label="Eilfall (nachträgliche Genehmigung folgt)" value={form.eilfall}
              onChange={v => setForm(f => ({ ...f, eilfall: v }))} />
            <SchalterFeld label="Einwilligung Betreuer liegt vor" value={form.einwilligungBetreuer}
              onChange={v => setForm(f => ({ ...f, einwilligungBetreuer: v }))} />
            <SchalterFeld label="Arzt informiert" value={form.arztInformiert}
              onChange={v => setForm(f => ({ ...f, arztInformiert: v }))} />
          </div>
          <div style={{ marginTop: 12 }}>
            <TextBereich label="Bemerkung" value={form.bemerkung} rows={2}
              onChange={v => setForm(f => ({ ...f, bemerkung: v }))} />
          </div>
          <button onClick={speichern} disabled={busy} style={{ ...pflegePrimaryBtn, marginTop: 14 }}>
            {busy ? 'Speichern...' : 'Maßnahme anlegen'}
          </button>
        </Karte>
      )}

      {!zeigeForm && !viewId && (
        <>
          <div style={{ marginBottom: 16 }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Klient, Art, Grund..." />
          </div>
          <div className="admin-filters">
            <button className={`admin-filter-btn ${statusFilter === 'aktiv' ? 'active' : ''}`} onClick={() => setStatusFilter('aktiv')}>Aktiv</button>
            <button className={`admin-filter-btn ${statusFilter === 'beendet' ? 'active' : ''}`} onClick={() => setStatusFilter('beendet')}>Beendet</button>
            <button className={`admin-filter-btn ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>Alle</button>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Klient</th><th>Art</th><th>Beginn</th><th>Genehmigung</th><th>Status</th><th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? <EmptyRow colSpan={6}>Laden...</EmptyRow>
                  : gefiltert.length === 0
                    ? <EmptyRow colSpan={6}>Keine Maßnahmen erfasst</EmptyRow>
                    : gefiltert.map(m => (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 600 }}>{m.clients?.first_name} {m.clients?.last_name}</td>
                        <td>{ARTEN[m.art] || m.art}</td>
                        <td style={{ fontSize: 13 }}>{new Date(m.beginn_am).toLocaleString('de-DE')}</td>
                        <td style={{ fontSize: 13 }}>{m.richterlich_genehmigt ? 'Ja' : (m.eilfall ? 'Eilfall' : '—')}</td>
                        <td><StatusBadge label={m.status === 'aktiv' ? 'Aktiv' : 'Beendet'} color={m.status === 'aktiv' ? 'green' : 'gray'} /></td>
                        <td><button onClick={() => setViewId(m.id)} style={pflegeMiniBtn}>Details</button><button onClick={() => archivieren(m)} style={{ ...pflegeMiniBtn, color: 'var(--ink4)', marginLeft: 4 }}>Archivieren</button></td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
