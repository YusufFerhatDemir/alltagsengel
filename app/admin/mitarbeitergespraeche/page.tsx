'use client'
// ═══════════════════════════════════════════════════════════════
// Mitarbeitergespräche — Jahres-, Probezeit-, Feedback-, Ziel- und
// Konfliktgespräche mit Wiedervorlage.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { Banner, EmptyRow, SearchInput, StatusBadge } from '@/components/admin/OpsUI'
import { AuswahlFeld, FeldRaster, Karte, SchalterFeld, TextBereich, TextFeld, pflegeInput, pflegePrimaryBtn, pflegeSecondaryBtn } from '@/components/admin/PflegeUI'

interface Gespraech {
  id: string
  caregiver_id: string
  gespraechsart: string
  datum: string
  teilnehmer: string | null
  themen: string | null
  ziele_vereinbart: string | null
  massnahmen: string | null
  naechstes_gespraech_geplant_am: string | null
  status: 'geplant' | 'durchgefuehrt' | 'abgesagt' | 'archiviert'
  vertraulich: boolean
  caregivers: { first_name: string; last_name: string } | null
}

type Mitarbeiter = { id: string; first_name: string; last_name: string }

const ARTEN: Record<string, string> = {
  jahresgespraech: 'Jahresgespräch',
  probezeitgespraech: 'Probezeitgespräch',
  feedbackgespraech: 'Feedbackgespräch',
  zielvereinbarung: 'Zielvereinbarung',
  konfliktgespraech: 'Konfliktgespräch',
  austrittsgespraech: 'Austrittsgespräch',
  sonstiges: 'Sonstiges',
}

const LEER_FORM = {
  caregiverId: '',
  gespraechsart: 'jahresgespraech',
  datum: new Date().toISOString().slice(0, 10),
  teilnehmer: '',
  themen: '',
  zieleVereinbart: '',
  massnahmen: '',
  naechstesGeplantAm: '',
  vertraulich: true,
}

export default function MitarbeitergespraechePage() {
  const [gespraeche, setGespraeche] = useState<Gespraech[]>([])
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [zeigeForm, setZeigeForm] = useState(false)
  const [form, setForm] = useState(LEER_FORM)

  async function loadMitarbeiter() {
    try {
      const res = await fetch('/api/personal/stammdaten')
      const body = await res.json()
      const liste = Array.isArray(body) ? body : []
      setMitarbeiter(liste.map((m: any) => ({ id: m.id, first_name: m.first_name, last_name: m.last_name })))
    } catch { /* optional */ }
  }

  async function load() {
    setLoading(true); setError('')
    try {
      const url = showArchived
        ? '/api/admin/mitarbeitergespraeche?showArchived=true'
        : '/api/admin/mitarbeitergespraeche'
      const res = await fetch(url)
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Fehler beim Laden'); return }
      setGespraeche(body.gespraeche || [])
    } catch {
      setError('Gespräche konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(); loadMitarbeiter() }, [showArchived])

  async function speichern() {
    if (!form.caregiverId) { setError('Bitte Mitarbeiter wählen.'); return }
    setBusy(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/admin/mitarbeitergespraeche', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caregiver_id: form.caregiverId,
          gespraechsart: form.gespraechsart,
          datum: form.datum,
          teilnehmer: form.teilnehmer || null,
          themen: form.themen || null,
          ziele_vereinbart: form.zieleVereinbart || null,
          massnahmen: form.massnahmen || null,
          naechstes_gespraech_geplant_am: form.naechstesGeplantAm || null,
          vertraulich: form.vertraulich,
          status: 'durchgefuehrt',
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Anlegen fehlgeschlagen.'); return }
      setSuccess('Gespräch protokolliert.')
      setForm(LEER_FORM)
      setZeigeForm(false)
      await load()
    } finally { setBusy(false) }
  }

  const gefiltert = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return gespraeche
    return gespraeche.filter(g => `${g.caregivers?.first_name || ''} ${g.caregivers?.last_name || ''}`.toLowerCase().includes(q))
  }, [gespraeche, search])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Mitarbeitergespräche</h1>
          <p className="admin-subtitle">Jahres-, Probezeit-, Feedback-, Ziel- und Konfliktgespräche</p>
        </div>
        {!zeigeForm && <button onClick={() => setZeigeForm(true)} style={pflegePrimaryBtn}>+ Neues Gespräch</button>}
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      {zeigeForm && (
        <Karte titel="Neues Mitarbeitergespräch" aktion={<button onClick={() => setZeigeForm(false)} style={pflegeSecondaryBtn}>Abbrechen</button>}>
          <FeldRaster>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink4)' }}>Mitarbeiter *</span>
              <select value={form.caregiverId} onChange={e => setForm(f => ({ ...f, caregiverId: e.target.value }))} style={pflegeInput}>
                <option value="">-- Mitarbeiter wählen --</option>
                {mitarbeiter.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
              </select>
            </label>
            <AuswahlFeld label="Gesprächsart" value={form.gespraechsart} onChange={v => setForm(f => ({ ...f, gespraechsart: v }))} optionen={Object.entries(ARTEN)} />
            <TextFeld label="Datum" type="date" value={form.datum} onChange={v => setForm(f => ({ ...f, datum: v }))} />
            <TextFeld label="Teilnehmer" value={form.teilnehmer} onChange={v => setForm(f => ({ ...f, teilnehmer: v }))} />
            <TextFeld label="Nächstes Gespräch geplant" type="date" value={form.naechstesGeplantAm} onChange={v => setForm(f => ({ ...f, naechstesGeplantAm: v }))} />
          </FeldRaster>
          <div style={{ marginTop: 12 }}>
            <TextBereich label="Themen" value={form.themen} onChange={v => setForm(f => ({ ...f, themen: v }))} rows={3} />
          </div>
          <div style={{ marginTop: 8 }}>
            <TextBereich label="Vereinbarte Ziele" value={form.zieleVereinbart} onChange={v => setForm(f => ({ ...f, zieleVereinbart: v }))} rows={2} />
          </div>
          <div style={{ marginTop: 8 }}>
            <TextBereich label="Maßnahmen" value={form.massnahmen} onChange={v => setForm(f => ({ ...f, massnahmen: v }))} rows={2} />
          </div>
          <div style={{ marginTop: 8 }}>
            <SchalterFeld label="Vertraulich" value={form.vertraulich} onChange={v => setForm(f => ({ ...f, vertraulich: v }))} />
          </div>
          <button onClick={speichern} disabled={busy} style={{ ...pflegePrimaryBtn, marginTop: 14 }}>
            {busy ? 'Speichern...' : 'Protokollieren'}
          </button>
        </Karte>
      )}

      {!zeigeForm && (
        <>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Mitarbeiter..." />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink4)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
              Archivierte anzeigen
            </label>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Mitarbeiter</th><th>Art</th><th>Datum</th><th>Nächstes geplant</th><th>Status</th><th>Aktionen</th></tr>
              </thead>
              <tbody>
                {loading
                  ? <EmptyRow colSpan={6}>Laden...</EmptyRow>
                  : gefiltert.length === 0
                    ? <EmptyRow colSpan={6}>Noch keine Gespräche erfasst</EmptyRow>
                    : gefiltert.map(g => (
                      <tr key={g.id}>
                        <td style={{ fontWeight: 600 }}>{g.caregivers?.first_name} {g.caregivers?.last_name}</td>
                        <td>{ARTEN[g.gespraechsart] || g.gespraechsart}</td>
                        <td style={{ fontSize: 13 }}>{g.datum}</td>
                        <td style={{ fontSize: 13 }}>{g.naechstes_gespraech_geplant_am || '—'}</td>
                        <td><StatusBadge label={g.status === 'archiviert' ? 'Archiviert' : g.status} color={g.status === 'durchgefuehrt' ? 'green' : g.status === 'archiviert' ? '#9E9E9E' : 'gray'} /></td>
                        <td>
                          {g.status !== 'archiviert' && (
                            <button
                              onClick={async () => {
                                await fetch(`/api/admin/mitarbeitergespraeche/${g.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ status: 'archiviert' }),
                                })
                                load()
                              }}
                              style={{ fontSize: 12, color: '#9E9E9E', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                            >Archivieren</button>
                          )}
                        </td>
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
