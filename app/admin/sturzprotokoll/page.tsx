'use client'
// ═══════════════════════════════════════════════════════════════
// Sturzprotokoll — strukturierte Sturz-/Unfalldokumentation
// Erstellt pflege_verlauf-Eintraege mit eintrag_typ = 'sturz'
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { formatDate } from '@/lib/admin/ops'
import { Banner, EmptyRow, SearchInput } from '@/components/admin/OpsUI'
import {
  FeldRaster, Karte, SchalterFeld, TextBereich, TextFeld,
  pflegeInput, pflegePrimaryBtn, pflegeSecondaryBtn,
} from '@/components/admin/PflegeUI'
import type { PflegeVerlaufEintrag } from '@/lib/pflege/types'

type Protokoll = PflegeVerlaufEintrag & { kunde_name: string }
type Kunde = { id: string; first_name: string; last_name: string }

const STURZ_ORTE = [
  ['Zimmer', 'Zimmer'],
  ['Bad', 'Bad'],
  ['Flur', 'Flur'],
  ['Kueche', 'Kueche'],
  ['Aussenbereich', 'Aussenbereich'],
  ['Treppe', 'Treppe'],
  ['Sonstiges', 'Sonstiges'],
] as const

const VERLETZUNGS_ARTEN: Array<{ key: string; label: string }> = [
  { key: 'keine', label: 'Keine Verletzungen' },
  { key: 'prellungen', label: 'Prellungen' },
  { key: 'schuerfen', label: 'Schuerfwunden' },
  { key: 'platzwunde', label: 'Platzwunde' },
  { key: 'frakturverdacht', label: 'Frakturverdacht' },
  { key: 'kopfverletzung', label: 'Kopfverletzung' },
  { key: 'sonstiges', label: 'Sonstige Verletzung' },
]

const RISIKO_FAKTOREN: Array<{ key: string; label: string }> = [
  { key: 'medikamente', label: 'Medikamente (z.B. Sedativa, Diuretika)' },
  { key: 'schwindel', label: 'Schwindel' },
  { key: 'sehstoerung', label: 'Sehstoerung' },
  { key: 'gehunsicherheit', label: 'Gehunsicherheit' },
  { key: 'verwirrtheit', label: 'Verwirrtheit / Desorientiertheit' },
  { key: 'umgebung', label: 'Umgebungsfaktoren (Beleuchtung, Stolperfallen)' },
  { key: 'schuhe', label: 'Ungeeignetes Schuhwerk' },
  { key: 'sonstiges', label: 'Sonstige Faktoren' },
]

const LEER_FORM = {
  sturzDatum: '',
  sturzUhrzeit: '',
  sturzOrt: 'Zimmer',
  sturzHergang: '',
  zeugen: '',
  verletzungen: [] as string[],
  verletzungBeschreibung: '',
  sofortmassnahmen: '',
  arztBenachrichtigt: false,
  arztName: '',
  angehoerigeBenachrichtigt: false,
  rettungsdienstGerufen: false,
  krankenhausEinweisung: false,
  sturzrisikoFaktoren: [] as string[],
  praeventionsmassnahmen: '',
}

export default function SturzprotokollPage() {
  const [protokolle, setProtokolle] = useState<Protokoll[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selectedClient, setSelectedClient] = useState('')
  const [search, setSearch] = useState('')
  const [zeigeForm, setZeigeForm] = useState(false)
  const [viewId, setViewId] = useState<string | null>(null)
  const [form, setForm] = useState(LEER_FORM)

  useEffect(() => { loadKunden() }, [])
  useEffect(() => { if (selectedClient) loadProtokolle() }, [selectedClient])

  async function loadKunden() {
    try {
      const res = await fetch('/api/pflege/uebersicht')
      const body = await res.json()
      if (body.error) { setError(body.error); return }
      const liste: Kunde[] = (body.uebersicht || []).map((z: { client_id: string; first_name: string; last_name: string }) => ({
        id: z.client_id, first_name: z.first_name, last_name: z.last_name,
      }))
      setKunden(liste)
      if (liste.length > 0 && !selectedClient) setSelectedClient(liste[0].id)
    } catch {
      setError('Kunden konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  async function loadProtokolle() {
    setLoading(true); setError('')
    try {
      const url = selectedClient
        ? `/api/pflege/sturzprotokoll?clientId=${selectedClient}`
        : '/api/pflege/sturzprotokoll'
      const res = await fetch(url)
      const body = await res.json()
      if (body.error) { setError(body.error); return }
      setProtokolle(body.protokolle || [])
    } catch {
      setError('Sturzprotokolle konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  async function speichern() {
    setBusy(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/pflege/sturzprotokoll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClient, ...form }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Anlegen fehlgeschlagen.'); return }
      setSuccess('Sturzprotokoll wurde erfolgreich angelegt.')
      setForm(LEER_FORM)
      setZeigeForm(false)
      await loadProtokolle()
    } finally { setBusy(false) }
  }

  function toggleCheckbox(feld: 'verletzungen' | 'sturzrisikoFaktoren', key: string) {
    setForm(f => {
      const liste = f[feld].includes(key)
        ? f[feld].filter(v => v !== key)
        : [...f[feld], key]
      return { ...f, [feld]: liste }
    })
  }

  const gefiltert = useMemo(() => {
    const suche = search.trim().toLowerCase()
    return protokolle.filter(p => {
      if (suche && !p.inhalt.toLowerCase().includes(suche) && !p.kunde_name.toLowerCase().includes(suche)) return false
      return true
    })
  }, [protokolle, search])

  const viewProtokoll = viewId ? protokolle.find(p => p.id === viewId) : null

  const formValid = form.sturzDatum && form.sturzUhrzeit && form.sturzOrt
    && form.sturzHergang.trim() && form.sofortmassnahmen.trim() && selectedClient

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Sturzprotokoll</h1>
          <p className="admin-subtitle">Strukturierte Sturz- und Unfalldokumentation</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!zeigeForm && !viewId && (
            <button onClick={() => { setZeigeForm(true); setViewId(null) }} style={pflegePrimaryBtn} disabled={!selectedClient}>
              Neues Sturzprotokoll
            </button>
          )}
          <Link href="/admin/pflegedoku" style={pflegeSecondaryBtn}>Pflegedoku</Link>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      {/* Kundenauswahl */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink4)' }}>Kunde</span>
          <select
            value={selectedClient}
            onChange={e => { setSelectedClient(e.target.value); setViewId(null); setZeigeForm(false) }}
            style={{ ...pflegeInput, maxWidth: 400 }}
          >
            <option value="">Kunde waehlen...</option>
            {kunden.map(k => (
              <option key={k.id} value={k.id}>{k.first_name} {k.last_name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Ansicht: Einzelnes Protokoll (read-only) */}
      {viewProtokoll && (
        <Karte titel={`Sturzprotokoll vom ${formatDate(viewProtokoll.eintrag_datum)}`} aktion={
          <button onClick={() => setViewId(null)} style={pflegeSecondaryBtn}>Zurueck zur Liste</button>
        }>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--ink4)' }}>
              Erstellt von {viewProtokoll.autor_name} ({viewProtokoll.autor_rolle})
              am {new Date(viewProtokoll.created_at).toLocaleString('de-DE')}
            </span>
          </div>
          <pre style={{
            fontSize: 14, color: 'var(--ink2)', whiteSpace: 'pre-wrap', margin: 0,
            fontFamily: 'inherit', lineHeight: 1.6,
          }}>
            {viewProtokoll.inhalt}
          </pre>
        </Karte>
      )}

      {/* Formular: Neues Sturzprotokoll */}
      {zeigeForm && !viewId && (
        <>
          {/* Sektion 1: Sturzdaten */}
          <Karte titel="1. Sturzdaten">
            <FeldRaster>
              <TextFeld label="Datum des Sturzes *" type="date" value={form.sturzDatum}
                onChange={v => setForm(f => ({ ...f, sturzDatum: v }))} />
              <TextFeld label="Uhrzeit *" type="text" value={form.sturzUhrzeit} placeholder="z.B. 14:30"
                onChange={v => setForm(f => ({ ...f, sturzUhrzeit: v }))} />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink4)' }}>Sturzort *</span>
                <select value={form.sturzOrt} onChange={e => setForm(f => ({ ...f, sturzOrt: e.target.value }))}
                  style={pflegeInput}>
                  {STURZ_ORTE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
            </FeldRaster>
          </Karte>

          {/* Sektion 2: Hergang */}
          <Karte titel="2. Hergang">
            <TextBereich label="Beschreibung des Sturzhergangs *" value={form.sturzHergang}
              onChange={v => setForm(f => ({ ...f, sturzHergang: v }))} rows={4}
              placeholder="Was ist passiert? Wie wurde der Sturz bemerkt?" />
            <div style={{ marginTop: 12 }}>
              <TextFeld label="Zeugen" value={form.zeugen}
                onChange={v => setForm(f => ({ ...f, zeugen: v }))} placeholder="Name(n) der Zeugen" />
            </div>
          </Karte>

          {/* Sektion 3: Verletzungen */}
          <Karte titel="3. Verletzungen">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8, marginBottom: 12 }}>
              {VERLETZUNGS_ARTEN.map(v => (
                <label key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink3)' }}>
                  <input type="checkbox" checked={form.verletzungen.includes(v.key)}
                    onChange={() => toggleCheckbox('verletzungen', v.key)} />
                  {v.label}
                </label>
              ))}
            </div>
            <TextBereich label="Verletzungsbeschreibung" value={form.verletzungBeschreibung}
              onChange={v => setForm(f => ({ ...f, verletzungBeschreibung: v }))} rows={2}
              placeholder="Genauere Beschreibung der Verletzungen..." />
          </Karte>

          {/* Sektion 4: Sofortmassnahmen */}
          <Karte titel="4. Sofortmassnahmen">
            <TextBereich label="Getroffene Sofortmassnahmen *" value={form.sofortmassnahmen}
              onChange={v => setForm(f => ({ ...f, sofortmassnahmen: v }))} rows={3}
              placeholder="Welche Massnahmen wurden unmittelbar ergriffen?" />
          </Karte>

          {/* Sektion 5: Benachrichtigungen */}
          <Karte titel="5. Benachrichtigungen">
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <SchalterFeld label="Arzt benachrichtigt" value={form.arztBenachrichtigt}
                  onChange={v => setForm(f => ({ ...f, arztBenachrichtigt: v }))} />
                {form.arztBenachrichtigt && (
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <TextFeld label="Name des Arztes" value={form.arztName}
                      onChange={v => setForm(f => ({ ...f, arztName: v }))} />
                  </div>
                )}
              </div>
              <SchalterFeld label="Angehoerige benachrichtigt" value={form.angehoerigeBenachrichtigt}
                onChange={v => setForm(f => ({ ...f, angehoerigeBenachrichtigt: v }))} />
              <SchalterFeld label="Rettungsdienst gerufen" value={form.rettungsdienstGerufen}
                onChange={v => setForm(f => ({ ...f, rettungsdienstGerufen: v }))} />
              <SchalterFeld label="Krankenhaus-Einweisung" value={form.krankenhausEinweisung}
                onChange={v => setForm(f => ({ ...f, krankenhausEinweisung: v }))} />
            </div>
          </Karte>

          {/* Sektion 6: Risikofaktoren */}
          <Karte titel="6. Sturzrisikofaktoren">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
              {RISIKO_FAKTOREN.map(r => (
                <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink3)' }}>
                  <input type="checkbox" checked={form.sturzrisikoFaktoren.includes(r.key)}
                    onChange={() => toggleCheckbox('sturzrisikoFaktoren', r.key)} />
                  {r.label}
                </label>
              ))}
            </div>
          </Karte>

          {/* Sektion 7: Praevention */}
          <Karte titel="7. Praeventionsmassnahmen">
            <TextBereich label="Geplante Massnahmen zur Sturzpraevention" value={form.praeventionsmassnahmen}
              onChange={v => setForm(f => ({ ...f, praeventionsmassnahmen: v }))} rows={3}
              placeholder="Welche Massnahmen werden ergriffen, um kuenftige Stuerze zu vermeiden?" />
          </Karte>

          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <button onClick={speichern} disabled={busy || !formValid} style={{
              ...pflegePrimaryBtn, opacity: (!formValid || busy) ? 0.5 : 1,
            }}>
              {busy ? 'Wird gespeichert...' : 'Sturzprotokoll speichern'}
            </button>
            <button onClick={() => { setZeigeForm(false); setForm(LEER_FORM) }} style={pflegeSecondaryBtn}>
              Abbrechen
            </button>
          </div>
        </>
      )}

      {/* Liste bestehender Sturzprotokolle */}
      {!zeigeForm && !viewId && selectedClient && (
        <>
          <div style={{ marginBottom: 16 }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Protokolle durchsuchen..." />
          </div>

          {/* Zusammenfassung */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 12, marginBottom: 20,
          }}>
            <StatCard label="Sturzprotokolle gesamt" value={protokolle.length} />
            <StatCard label="Letzter Sturz"
              value={protokolle.length > 0 ? formatDate(protokolle[0].eintrag_datum) : 'Kein Sturz erfasst'} />
            <StatCard label="Mit Krankenhauseinweisung"
              value={protokolle.filter(p => p.inhalt.includes('Krankenhaus-Einweisung: Ja')).length} />
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Uhrzeit</th>
                  <th>Ort</th>
                  <th>Erstellt von</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? <EmptyRow colSpan={5}>Laden...</EmptyRow>
                  : gefiltert.length === 0
                    ? <EmptyRow colSpan={5}>Keine Sturzprotokolle vorhanden</EmptyRow>
                    : gefiltert.map(p => {
                      const ortMatch = p.titel?.match(/Sturzprotokoll — (.+)/)
                      const ort = ortMatch ? ortMatch[1] : '—'
                      return (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{formatDate(p.eintrag_datum)}</td>
                          <td>{new Date(p.eintrag_datum).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</td>
                          <td>{ort}</td>
                          <td style={{ fontSize: 13 }}>{p.autor_name}</td>
                          <td>
                            <button onClick={() => setViewId(p.id)} style={viewBtn}>Ansehen</button>
                          </td>
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      textAlign: 'center', padding: '12px 8px', borderRadius: 12,
      background: 'var(--coal2)', border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--ink4)' }}>{label}</div>
    </div>
  )
}

const viewBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', fontWeight: 600,
  background: 'none', border: 'none', cursor: 'pointer',
  fontFamily: 'inherit', padding: 0,
}
