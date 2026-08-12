'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, fullName, ABSENCE_TYPE, ABSENCE_STATUS } from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'

// ── Typen ──────────────────────────────────────────────────────
interface Abwesenheit {
  id: string
  caregiver_id: string
  mitarbeiter: string
  typ: string
  von: string
  bis: string
  status: string
  bemerkung: string | null
}

interface Tour {
  id: string
  tour_date: string
  status: string
  caregiver_id: string
  mitarbeiter: string
  stop_count: number
  vertretung_fuer_caregiver_id: string | null
  vertretung_grund: string | null
}

interface Kandidat {
  id: string
  name: string
  qualifikation: string | null
  entfernung_km: number | null
  verfuegbar: boolean
  grund?: string
}

// ── Haupt-Komponente ───────────────────────────────────────────
export default function AusfallmanagementPage() {
  const [abwesenheiten, setAbwesenheiten] = useState<Abwesenheit[]>([])
  const [touren, setTouren] = useState<Tour[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [zeitraum, setZeitraum] = useState<'heute' | 'woche' | 'alle'>('heute')

  // Vertretungs-Dialog
  const [vertretungTour, setVertretungTour] = useState<Tour | null>(null)
  const [kandidaten, setKandidaten] = useState<Kandidat[]>([])
  const [ladtKandidaten, setLadtKandidaten] = useState(false)

  // Krankmeldungs-Dialog
  const [showKrankmeldung, setShowKrankmeldung] = useState(false)

  const load = useCallback(async () => {
    try {
      const supabase = createClient()
      const heute = new Date().toISOString().slice(0, 10)
      const wochenende = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

      // Abwesenheiten laden (Tabelle heißt 'absences', Spalten: start_date/end_date/reason)
      let abwQuery = supabase
        .from('absences')
        .select('id, caregiver_id, absence_type, start_date, end_date, status, reason, caregiver:caregivers(first_name, last_name)')
        .in('status', ['beantragt', 'genehmigt'])
        .order('start_date', { ascending: true })

      if (zeitraum === 'heute') {
        abwQuery = abwQuery.lte('start_date', heute).gte('end_date', heute)
      } else if (zeitraum === 'woche') {
        abwQuery = abwQuery.lte('start_date', wochenende).gte('end_date', heute)
      }

      const { data: abwData } = await abwQuery
      setAbwesenheiten((abwData || []).map((a: any) => ({
        id: a.id,
        caregiver_id: a.caregiver_id,
        mitarbeiter: fullName(a.caregiver),
        typ: a.absence_type,
        von: a.start_date,
        bis: a.end_date,
        status: a.status,
        bemerkung: a.reason,
      })))

      // Heutige/betroffene Touren laden
      let tourQuery = supabase
        .from('tours')
        .select('id, tour_date, status, caregiver_id, vertretung_fuer_caregiver_id, vertretung_grund, caregiver:caregivers(first_name, last_name), tour_stops(id)')
        .in('status', ['GEPLANT', 'FREIGEGEBEN', 'UNTERWEGS'])
        .order('tour_date', { ascending: true })

      if (zeitraum === 'heute') {
        tourQuery = tourQuery.eq('tour_date', heute)
      } else if (zeitraum === 'woche') {
        tourQuery = tourQuery.gte('tour_date', heute).lte('tour_date', wochenende)
      }

      const { data: tourData } = await tourQuery
      setTouren((tourData || []).map((t: any) => ({
        id: t.id,
        tour_date: t.tour_date,
        status: t.status,
        caregiver_id: t.caregiver_id,
        mitarbeiter: fullName(t.caregiver),
        stop_count: (t.tour_stops || []).length,
        vertretung_fuer_caregiver_id: t.vertretung_fuer_caregiver_id,
        vertretung_grund: t.vertretung_grund,
      })))
    } catch (err) {
      console.error('Ausfallmanagement load error:', err)
    } finally {
      setLoading(false)
    }
  }, [zeitraum])

  useEffect(() => { load() }, [load])

  // Betroffene Touren = Touren, deren Caregiver heute abwesend ist
  const abwesendeCaregiverIds = useMemo(
    () => new Set(abwesenheiten.map(a => a.caregiver_id)),
    [abwesenheiten]
  )
  const betroffeneTouren = useMemo(
    () => touren.filter(t => abwesendeCaregiverIds.has(t.caregiver_id) && !t.vertretung_fuer_caregiver_id),
    [touren, abwesendeCaregiverIds]
  )
  const vertretungsTouren = useMemo(
    () => touren.filter(t => t.vertretung_fuer_caregiver_id),
    [touren]
  )

  // Suche
  const filteredAbwesenheiten = useMemo(() => {
    if (!search) return abwesenheiten
    const s = search.toLowerCase()
    return abwesenheiten.filter(a => a.mitarbeiter.toLowerCase().includes(s))
  }, [abwesenheiten, search])

  // Vertretung suchen
  async function ladeKandidaten(tour: Tour) {
    setVertretungTour(tour)
    setLadtKandidaten(true)
    setKandidaten([])
    try {
      const res = await fetch(`/api/tours/${tour.id}/vertretung`)
      if (res.ok) {
        const data = await res.json()
        setKandidaten(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      console.error('Kandidaten-Fehler:', err)
    } finally {
      setLadtKandidaten(false)
    }
  }

  // Vertretung zuweisen
  async function weiseVertretungZu(tourId: string, caregiverId: string, grund: string) {
    try {
      const res = await fetch(`/api/tours/${tourId}/vertretung`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neuer_caregiver_id: caregiverId, grund }),
      })
      if (res.ok) {
        setVertretungTour(null)
        load()
      } else {
        const err = await res.json()
        alert(err.error || 'Fehler bei Vertretungszuweisung')
      }
    } catch (err) {
      alert('Netzwerkfehler')
    }
  }

  const krankmeldungen = filteredAbwesenheiten.filter(a => a.typ === 'sick')
  const andereAbwesenheiten = filteredAbwesenheiten.filter(a => a.typ !== 'sick')

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Ausfallmanagement</h1>
          <p className="admin-subtitle">Krankmeldungen, Vertretungen und Notfall-Pool</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowKrankmeldung(true)} style={dangerBtn}>+ Krankmeldung</button>
        </div>
      </div>

      {/* Zeitraum-Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['heute', 'woche', 'alle'] as const).map(z => (
          <button
            key={z}
            onClick={() => setZeitraum(z)}
            style={{
              ...filterBtn,
              background: zeitraum === z ? 'rgba(201,150,60,0.15)' : 'transparent',
              borderColor: zeitraum === z ? 'var(--gold2)' : 'var(--border)',
              color: zeitraum === z ? 'var(--gold2)' : 'var(--ink3)',
            }}
          >
            {z === 'heute' ? 'Heute' : z === 'woche' ? 'Diese Woche' : 'Alle'}
          </button>
        ))}
      </div>

      {/* Warnbanner */}
      {betroffeneTouren.length > 0 && (
        <Banner tone="danger">
          ❗ {betroffeneTouren.length} Tour(en) ohne Vertretung — betroffene Klienten warten auf Umplanung.
        </Banner>
      )}

      {/* Statistik-Karten */}
      <div className="admin-stats-grid" style={{ marginBottom: 16 }}>
        <div className="admin-stat-card danger">
          <div className="admin-stat-value">{krankmeldungen.length}</div>
          <div className="admin-stat-label">Krankmeldungen</div>
        </div>
        <div className="admin-stat-card accent">
          <div className="admin-stat-value">{andereAbwesenheiten.length}</div>
          <div className="admin-stat-label">Sonstige Abwesenheiten</div>
        </div>
        <div className="admin-stat-card danger">
          <div className="admin-stat-value">{betroffeneTouren.length}</div>
          <div className="admin-stat-label">Unbesetzte Touren</div>
        </div>
        <div className="admin-stat-card success">
          <div className="admin-stat-value">{vertretungsTouren.length}</div>
          <div className="admin-stat-label">Vertretungen aktiv</div>
        </div>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Mitarbeiter suchen…" />

      {loading ? <p>Laden…</p> : (
        <>
          {/* ── Unbesetzte Touren (dringend) ─────────────────────── */}
          {betroffeneTouren.length > 0 && (
            <>
              <h2 style={sectionH2}>
                Unbesetzte Touren
                <span style={countBadge}>{betroffeneTouren.length}</span>
              </h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Datum</th><th>Mitarbeiter (fehlt)</th><th>Klienten</th><th>Status</th><th>Aktion</th></tr></thead>
                  <tbody>
                    {betroffeneTouren.map(t => (
                      <tr key={t.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{formatDate(t.tour_date)}</td>
                        <td style={{ fontWeight: 600, color: '#D04B3B' }}>{t.mitarbeiter}</td>
                        <td>{t.stop_count} Stopp(s)</td>
                        <td><StatusBadge label={t.status} color={t.status === 'GEPLANT' ? '#2196F3' : '#FF9800'} /></td>
                        <td>
                          <button onClick={() => ladeKandidaten(t)} style={actionBtn}>
                            Vertretung suchen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Aktive Krankmeldungen ────────────────────────────── */}
          <h2 style={sectionH2}>
            Krankmeldungen
            <span style={countBadge}>{krankmeldungen.length}</span>
          </h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Mitarbeiter</th><th>Von</th><th>Bis</th><th>Status</th><th>Bemerkung</th></tr></thead>
              <tbody>
                {krankmeldungen.length === 0 ? (
                  <EmptyRow colSpan={5}>Keine Krankmeldungen im Zeitraum</EmptyRow>
                ) : krankmeldungen.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.mitarbeiter}</td>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(a.von)}</td>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(a.bis)}</td>
                    <td><StatusBadge label={ABSENCE_STATUS[a.status]?.label || a.status} color={ABSENCE_STATUS[a.status]?.color || '#999'} /></td>
                    <td style={{ fontSize: 13 }}>{a.bemerkung || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Sonstige Abwesenheiten ──────────────────────────── */}
          {andereAbwesenheiten.length > 0 && (
            <>
              <h2 style={sectionH2}>
                Sonstige Abwesenheiten
                <span style={countBadge}>{andereAbwesenheiten.length}</span>
              </h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Mitarbeiter</th><th>Typ</th><th>Von</th><th>Bis</th><th>Status</th></tr></thead>
                  <tbody>
                    {andereAbwesenheiten.map(a => {
                      const at = ABSENCE_TYPE[a.typ] || { label: a.typ, color: '#999' }
                      return (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 600 }}>{a.mitarbeiter}</td>
                          <td><StatusBadge label={at.label} color={at.color} /></td>
                          <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(a.von)}</td>
                          <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(a.bis)}</td>
                          <td><StatusBadge label={ABSENCE_STATUS[a.status]?.label || a.status} color={ABSENCE_STATUS[a.status]?.color || '#999'} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Aktive Vertretungen ─────────────────────────────── */}
          {vertretungsTouren.length > 0 && (
            <>
              <h2 style={sectionH2}>
                Aktive Vertretungen
                <span style={countBadge}>{vertretungsTouren.length}</span>
              </h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Datum</th><th>Vertretung</th><th>Klienten</th><th>Grund</th><th>Status</th></tr></thead>
                  <tbody>
                    {vertretungsTouren.map(t => (
                      <tr key={t.id}>
                        <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(t.tour_date)}</td>
                        <td style={{ fontWeight: 600, color: '#5CB882' }}>{t.mitarbeiter}</td>
                        <td>{t.stop_count} Stopp(s)</td>
                        <td style={{ fontSize: 13 }}>{t.vertretung_grund || '—'}</td>
                        <td><StatusBadge label={t.status} color={t.status === 'GEPLANT' ? '#2196F3' : '#FF9800'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Vertretungs-Dialog ──────────────────────────────────── */}
      {vertretungTour && (
        <VertretungDialog
          tour={vertretungTour}
          kandidaten={kandidaten}
          loading={ladtKandidaten}
          onSelect={(cId) => weiseVertretungZu(vertretungTour.id, cId, 'Krankheit')}
          onClose={() => setVertretungTour(null)}
        />
      )}

      {/* ── Krankmeldungs-Dialog ───────────────────────────────── */}
      {showKrankmeldung && (
        <KrankmeldungDialog
          onClose={() => setShowKrankmeldung(false)}
          onSaved={() => { setShowKrankmeldung(false); load() }}
        />
      )}
    </div>
  )
}

// ── Vertretungs-Dialog ─────────────────────────────────────────
function VertretungDialog({ tour, kandidaten, loading, onSelect, onClose }: {
  tour: Tour
  kandidaten: Kandidat[]
  loading: boolean
  onSelect: (caregiverId: string) => void
  onClose: () => void
}) {
  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: 560, width: '94%' }} onClick={e => e.stopPropagation()}>
        <h3>Vertretung für {tour.mitarbeiter}</h3>
        <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '0 0 12px' }}>
          Tour am {formatDate(tour.tour_date)} — {tour.stop_count} Klienten-Stopps
        </p>

        {loading ? (
          <p style={{ padding: 16, textAlign: 'center', color: 'var(--ink4)' }}>Suche verfügbare Mitarbeiter…</p>
        ) : kandidaten.length === 0 ? (
          <Banner tone="danger">Keine verfügbaren Vertretungen gefunden. Bitte manuell planen.</Banner>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Mitarbeiter</th><th>Qualifikation</th><th>Entfernung</th><th>Verfügbar</th><th></th></tr></thead>
              <tbody>
                {kandidaten.map(k => (
                  <tr key={k.id} style={{ opacity: k.verfuegbar ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600 }}>{k.name}</td>
                    <td style={{ fontSize: 13 }}>{k.qualifikation || '—'}</td>
                    <td style={{ fontSize: 13 }}>{k.entfernung_km != null ? `${k.entfernung_km} km` : '—'}</td>
                    <td>
                      {k.verfuegbar
                        ? <span style={{ color: '#5CB882', fontWeight: 600 }}>✓ Ja</span>
                        : <span style={{ color: '#D04B3B', fontSize: 12 }}>{k.grund || 'Nicht verfügbar'}</span>}
                    </td>
                    <td>
                      {k.verfuegbar && (
                        <button onClick={() => onSelect(k.id)} style={actionBtn}>Zuweisen</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  )
}

// ── Krankmeldungs-Dialog ───────────────────────────────────────
function KrankmeldungDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [caregivers, setCaregivers] = useState<{ id: string; name: string }[]>([])
  const [caregiverId, setCaregiverId] = useState('')
  const [datumVon, setDatumVon] = useState(() => new Date().toISOString().slice(0, 10))
  const [datumBis, setDatumBis] = useState(() => new Date().toISOString().slice(0, 10))
  const [bemerkung, setBemerkung] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    async function loadCaregivers() {
      const supabase = createClient()
      const { data } = await supabase.from('caregivers').select('id, first_name, last_name, status').eq('status', 'active')
      setCaregivers((data || []).map((c: any) => ({ id: c.id, name: fullName(c) })))
    }
    loadCaregivers()
  }, [])

  async function save() {
    setErr(null)
    if (!caregiverId) { setErr('Bitte einen Mitarbeiter wählen.'); return }
    if (datumBis < datumVon) { setErr('Bis-Datum darf nicht vor Von-Datum liegen.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/personal/abwesenheiten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caregiverId,
          absenceType: 'sick',
          startDate: datumVon,
          endDate: datumBis,
          reason: bemerkung.trim() || null,
          status: 'genehmigt', // Krankmeldung sofort genehmigen
        }),
      })
      if (res.ok) { onSaved() }
      else {
        const data = await res.json()
        setErr(data.error || 'Fehler beim Speichern')
      }
    } catch {
      setErr('Netzwerkfehler')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: 440, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>Krankmeldung erfassen</h3>
        {err && <Banner tone="danger">{err}</Banner>}
        <Field label="Mitarbeiter *">
          <select value={caregiverId} onChange={e => setCaregiverId(e.target.value)} style={modalSelect}>
            <option value="">— wählen —</option>
            {caregivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Von *"><input type="date" value={datumVon} onChange={e => setDatumVon(e.target.value)} style={modalInput} /></Field>
          <Field label="Bis *"><input type="date" value={datumBis} onChange={e => setDatumBis(e.target.value)} style={modalInput} /></Field>
        </div>
        <Field label="Bemerkung"><input value={bemerkung} onChange={e => setBemerkung(e.target.value)} placeholder="z. B. Grippe, Arzt" style={modalInput} /></Field>
        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose}>Abbrechen</button>
          <button className="btn-confirm" onClick={save} disabled={saving}>{saving ? 'Speichern…' : 'Krankmeldung speichern'}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0, marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{label}</span>
      <div style={{ marginTop: 3 }}>{children}</div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────
const dangerBtn: React.CSSProperties = {
  fontSize: 14, color: '#fff', fontWeight: 600,
  background: '#D04B3B', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const actionBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const filterBtn: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, border: '1px solid var(--border)',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
  background: 'transparent',
}
const sectionH2: React.CSSProperties = {
  marginTop: 28, display: 'flex', alignItems: 'center', gap: 8,
}
const countBadge: React.CSSProperties = {
  fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit',
}
const modalInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box',
}
const modalSelect: React.CSSProperties = { ...modalInput }
