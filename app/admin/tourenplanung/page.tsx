'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Banner } from '@/components/admin/OpsUI'

// ── Status ─────────────────────────────────────────────────────
const TOUR_STATUS: Record<string, { label: string; color: string }> = {
  GEPLANT:       { label: 'Geplant',       color: '#2196F3' },
  FREIGEGEBEN:   { label: 'Freigegeben',   color: '#00BCD4' },
  UNTERWEGS:     { label: 'Unterwegs',     color: '#FF9800' },
  ABGESCHLOSSEN: { label: 'Abgeschlossen', color: '#5CB882' },
  STORNIERT:     { label: 'Storniert',     color: '#9E9E9E' },
}
const STOP_STATUS: Record<string, { label: string; color: string }> = {
  GEPLANT:       { label: 'Geplant',       color: '#2196F3' },
  UNTERWEGS:     { label: 'Unterwegs',     color: '#FF9800' },
  BEIM_KLIENTEN: { label: 'Beim Klienten', color: '#C9963C' },
  ABGESCHLOSSEN: { label: 'Abgeschlossen', color: '#5CB882' },
  AUSGEFALLEN:   { label: 'Ausgefallen',   color: '#D04B3B' },
}
const STOP_FOLGE_STATUS: Record<string, string[]> = {
  GEPLANT: ['UNTERWEGS', 'AUSGEFALLEN'],
  UNTERWEGS: ['BEIM_KLIENTEN', 'AUSGEFALLEN'],
  BEIM_KLIENTEN: ['ABGESCHLOSSEN'],
  ABGESCHLOSSEN: [],
  AUSGEFALLEN: [],
}
const SERVICE_TYPES = [
  'Alltagsbegleitung', 'Haushaltshilfe', 'Einkaufshilfe', 'Arztbegleitung',
  'Betreuung/Gesellschaft', 'Spaziergang/Mobilität', 'Demenzbetreuung', 'Sonstige',
]

// ── Typen ──────────────────────────────────────────────────────
interface PersonRef { first_name: string | null; last_name: string | null; phone?: string | null }
interface StopRow {
  id: string
  assignment_id: string | null
  client_id: string | null
  position: number
  geplante_ankunft: string | null
  geplantes_ende: string | null
  fahrzeit_minuten: number | null
  distanz_km: number | null
  adresse: string | null
  plz: string | null
  status: string
  service_record_id: string | null
  notes: string | null
  clients: PersonRef | PersonRef[] | null
}
interface TourRow {
  id: string
  caregiver_id: string
  tour_date: string
  name: string | null
  status: string
  start_zeit: string | null
  ende_zeit: string | null
  gesamt_fahrzeit_minuten: number
  gesamt_distanz_km: number
  vertretung_fuer_caregiver_id: string | null
  vertretung_grund: string | null
  notes: string | null
  caregivers: (PersonRef & { zip_code?: string | null }) | PersonRef[] | null
  tour_stops: StopRow[]
}
interface Option { id: string; name: string }
interface Kandidat {
  caregiver_id: string
  name: string
  bevorzugt: boolean
  abwesend: boolean
  hat_fahrzeug: boolean
}
interface NeuerStop { client_id: string; geplante_ankunft: string; geplantes_ende: string; service_type: string }

// ── Helfer ─────────────────────────────────────────────────────
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function mondayOfWeek(base: Date): Date {
  const d = new Date(base)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function zeit(t: string | null): string {
  return t ? t.slice(0, 5) : '–'
}
function person(p: PersonRef | PersonRef[] | null): string {
  const e = Array.isArray(p) ? p[0] : p
  return e ? [e.first_name, e.last_name].filter(Boolean).join(' ') : '–'
}
function datumLang(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ── Styles ─────────────────────────────────────────────────────
const btn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8, border: '1px solid var(--line)',
  background: 'var(--coal3)', color: 'var(--ink2)', cursor: 'pointer', fontSize: 13,
}
const btnPrimary: React.CSSProperties = {
  ...btn, background: 'linear-gradient(135deg,var(--gold2),var(--gold))',
  color: 'var(--coal)', fontWeight: 700, border: 'none',
}
const input: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)',
  background: 'var(--coal3)', color: 'var(--ink2)', fontSize: 13,
}
const card: React.CSSProperties = {
  background: 'var(--coal2)', border: '1px solid var(--line)', borderRadius: 12, padding: 14,
}
const modalWrap: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto',
}
const modalBox: React.CSSProperties = {
  ...card, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
}

function Pille({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11,
      fontWeight: 600, color, background: `${color}22`, border: `1px solid ${color}55`,
    }}>{label}</span>
  )
}

// ═══════════════════════════════════════════════════════════════
export default function TourenplanungPage() {
  const [view, setView] = useState<'day' | 'week'>('week')
  const [baseDate, setBaseDate] = useState(() => new Date())
  const [touren, setTouren] = useState<TourRow[]>([])
  const [caregivers, setCaregivers] = useState<Option[]>([])
  const [clients, setClients] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [warnungen, setWarnungen] = useState<string[]>([])
  const [filterCaregiver, setFilterCaregiver] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [vertretungOpen, setVertretungOpen] = useState(false)

  const selected = useMemo(
    () => touren.find(t => t.id === selectedId) ?? null,
    [touren, selectedId]
  )

  const { rangeStart, rangeEnd, label } = useMemo(() => {
    if (view === 'day') {
      const ds = isoDate(baseDate)
      return { rangeStart: ds, rangeEnd: ds, label: datumLang(ds) }
    }
    const mon = mondayOfWeek(baseDate)
    const sun = addDays(mon, 6)
    return {
      rangeStart: isoDate(mon), rangeEnd: isoDate(sun),
      label: `${mon.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – ${sun.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    }
  }, [view, baseDate])

  const load = useCallback(async () => {
    setLoading(true)
    setFehler(null)
    try {
      const params = new URLSearchParams({ start: rangeStart, end: rangeEnd })
      if (filterCaregiver) params.set('caregiver_id', filterCaregiver)
      const res = await fetch(`/api/tours?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Touren konnten nicht geladen werden.')
      setTouren(data)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler.')
      setTouren([])
    } finally {
      setLoading(false)
    }
  }, [rangeStart, rangeEnd, filterCaregiver])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('caregivers').select('id, first_name, last_name').eq('status', 'active').order('last_name'),
      supabase.from('clients').select('id, first_name, last_name').order('last_name'),
    ]).then(([cg, cl]) => {
      setCaregivers((cg.data ?? []).map(c => ({ id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(' ') })))
      setClients((cl.data ?? []).map(c => ({ id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(' ') })))
    })
  }, [])

  const navigate = (dir: -1 | 0 | 1) => {
    if (dir === 0) { setBaseDate(new Date()); return }
    setBaseDate(d => addDays(d, dir * (view === 'day' ? 1 : 7)))
  }

  // ── API-Aktionen ─────────────────────────────────────────────
  const patchTour = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/tours/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { setFehler(data.error); return false }
    await load()
    return true
  }

  const patchStop = async (tourId: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/tours/${tourId}/stops`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { setFehler(data.error); return false }
    if (data.leistungsnachweis_fehler) setFehler(`Stop aktualisiert, aber Leistungsnachweis fehlgeschlagen: ${data.leistungsnachweis_fehler}`)
    await load()
    return true
  }

  const verschiebeStop = async (tour: TourRow, stopId: string, richtung: -1 | 1) => {
    const sortiert = [...tour.tour_stops].sort((a, b) => a.position - b.position)
    const idx = sortiert.findIndex(s => s.id === stopId)
    const ziel = idx + richtung
    if (idx < 0 || ziel < 0 || ziel >= sortiert.length) return
    const ids = sortiert.map(s => s.id)
    ;[ids[idx], ids[ziel]] = [ids[ziel], ids[idx]]
    await patchStop(tour.id, { reihenfolge: ids })
  }

  const entferneStop = async (tourId: string, stopId: string) => {
    if (!confirm('Stop wirklich aus der Tour entfernen?')) return
    const res = await fetch(`/api/tours/${tourId}/stops?stop_id=${stopId}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { setFehler(data.error); return }
    await load()
  }

  // ── Gruppierung für die Ansichten ────────────────────────────
  const tageDerWoche = useMemo(() => {
    const mon = mondayOfWeek(baseDate)
    return Array.from({ length: 7 }, (_, i) => isoDate(addDays(mon, i)))
  }, [baseDate])

  const tourenProTag = useMemo(() => {
    const map = new Map<string, TourRow[]>()
    for (const t of touren) {
      const liste = map.get(t.tour_date) ?? []
      liste.push(t)
      map.set(t.tour_date, liste)
    }
    return map
  }, [touren])

  return (
    <div>
      {/* Druck-Styles: nur der ausgewählte Tourenplan wird gedruckt */}
      <style>{`
        .tour-druckansicht { display: none; }
        @media print {
          body * { visibility: hidden; }
          .tour-druckansicht, .tour-druckansicht * { visibility: visible; }
          .tour-druckansicht {
            display: block; position: absolute; inset: 0;
            background: #fff; color: #000; padding: 24px; font-size: 12pt;
          }
          .tour-druckansicht table { width: 100%; border-collapse: collapse; }
          .tour-druckansicht th, .tour-druckansicht td {
            border: 1px solid #999; padding: 6px 8px; text-align: left; font-size: 10pt;
          }
        }
      `}</style>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Tourenplanung</h1>
      <p style={{ color: 'var(--ink4)', fontSize: 13, marginBottom: 16 }}>
        Tagestouren für Alltagsbegleiter: Reihenfolge, Fahrtzeiten, Vertretung und Status-Verfolgung.
      </p>

      {fehler && <div style={{ marginBottom: 12 }}><Banner tone="danger">{fehler}</Banner></div>}
      {warnungen.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Banner tone="warn">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {warnungen.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </Banner>
        </div>
      )}

      {/* Kopfleiste */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex' }}>
          {(['day', 'week'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              ...btn,
              background: view === v ? 'linear-gradient(135deg,var(--gold2),var(--gold))' : 'var(--coal3)',
              color: view === v ? 'var(--coal)' : 'var(--ink3)',
              fontWeight: view === v ? 700 : 400,
              borderRadius: v === 'day' ? '8px 0 0 8px' : '0 8px 8px 0',
            }}>{v === 'day' ? 'Tag' : 'Woche'}</button>
          ))}
        </div>
        <button onClick={() => navigate(-1)} style={btn}>&larr;</button>
        <button onClick={() => navigate(0)} style={btn}>Heute</button>
        <button onClick={() => navigate(1)} style={btn}>&rarr;</button>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink2)' }}>{label}</span>
        <span style={{ flex: 1 }} />
        <select value={filterCaregiver} onChange={e => setFilterCaregiver(e.target.value)} style={input}>
          <option value="">Alle Mitarbeiter</option>
          {caregivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => setCreateOpen(true)} style={btnPrimary}>+ Neue Tour</button>
      </div>

      {loading ? <p style={{ color: 'var(--ink4)' }}>Laden…</p> : (
        <>
          {/* Wochenansicht */}
          {view === 'week' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
              {tageDerWoche.map(tag => {
                const heute = tag === isoDate(new Date())
                return (
                  <div key={tag} style={{ ...card, padding: 8, minHeight: 140, borderColor: heute ? 'var(--gold)' : 'var(--line)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: heute ? 'var(--gold)' : 'var(--ink3)', marginBottom: 8 }}>
                      {new Date(tag + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                    </div>
                    {(tourenProTag.get(tag) ?? []).map(t => {
                      const st = TOUR_STATUS[t.status] ?? { label: t.status, color: '#666' }
                      return (
                        <button key={t.id} onClick={() => setSelectedId(t.id)} style={{
                          display: 'block', width: '100%', textAlign: 'left', marginBottom: 6,
                          padding: 8, borderRadius: 8, cursor: 'pointer',
                          background: 'var(--coal3)', border: `1px solid ${st.color}55`, borderLeft: `3px solid ${st.color}`,
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>{person(t.caregivers)}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink4)' }}>
                            {zeit(t.start_zeit)}–{zeit(t.ende_zeit)} · {t.tour_stops.length} Stops
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ink4)' }}>
                            🚗 {t.gesamt_fahrzeit_minuten} Min / {Number(t.gesamt_distanz_km).toFixed(1)} km
                          </div>
                          {t.vertretung_fuer_caregiver_id && (
                            <div style={{ fontSize: 10, color: '#FF9800' }}>Vertretung</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {/* Tagesansicht: Zeitslot-Raster */}
          {view === 'day' && (
            <TagesAnsicht
              touren={tourenProTag.get(rangeStart) ?? []}
              onSelect={setSelectedId}
            />
          )}
        </>
      )}

      {/* Tour-Detail */}
      {selected && (
        <TourDetail
          tour={selected}
          onClose={() => setSelectedId(null)}
          onPatchTour={patchTour}
          onPatchStop={patchStop}
          onVerschiebe={verschiebeStop}
          onEntferne={entferneStop}
          onVertretung={() => setVertretungOpen(true)}
          onReload={load}
          clients={clients}
        />
      )}

      {/* Vertretungs-Dialog */}
      {selected && vertretungOpen && (
        <VertretungsDialog
          tour={selected}
          onClose={() => setVertretungOpen(false)}
          onDone={(warn) => { setVertretungOpen(false); setWarnungen(warn); load() }}
          onFehler={setFehler}
        />
      )}

      {/* Anlage-Dialog */}
      {createOpen && (
        <NeueTourDialog
          caregivers={caregivers}
          clients={clients}
          defaultDate={view === 'day' ? rangeStart : isoDate(new Date())}
          onClose={() => setCreateOpen(false)}
          onDone={(warn) => { setCreateOpen(false); setWarnungen(warn); load() }}
        />
      )}

      {/* Druckansicht der ausgewählten Tour */}
      {selected && <TourDruck tour={selected} />}
    </div>
  )
}

// ── Tagesansicht ───────────────────────────────────────────────
const STUNDEN = Array.from({ length: 15 }, (_, i) => i + 6) // 06–20

function minutenSeit6(t: string | null): number | null {
  if (!t) return null
  const h = Number(t.slice(0, 2)), m = Number(t.slice(3, 5))
  return (h - 6) * 60 + m
}

function TagesAnsicht({ touren, onSelect }: { touren: TourRow[]; onSelect: (id: string) => void }) {
  if (touren.length === 0) {
    return <p style={{ color: 'var(--ink4)', padding: 24 }}>Keine Touren an diesem Tag.</p>
  }
  const gesamtMinuten = STUNDEN.length * 60
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 700 }}>
        {/* Stundenkopf */}
        <div style={{ display: 'flex', marginLeft: 180 }}>
          {STUNDEN.map(h => (
            <div key={h} style={{ flex: 1, fontSize: 10, color: 'var(--ink4)', borderLeft: '1px solid var(--line)', paddingLeft: 2 }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {touren.map(t => {
          const st = TOUR_STATUS[t.status] ?? { label: t.status, color: '#666' }
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'stretch', marginTop: 6 }}>
              <button onClick={() => onSelect(t.id)} style={{
                width: 180, flexShrink: 0, textAlign: 'left', padding: 8, cursor: 'pointer',
                background: 'var(--coal2)', border: '1px solid var(--line)', borderRadius: '8px 0 0 8px',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>{person(t.caregivers)}</div>
                <Pille label={st.label} color={st.color} />
              </button>
              <div style={{ flex: 1, position: 'relative', background: 'var(--coal2)', border: '1px solid var(--line)', borderLeft: 'none', borderRadius: '0 8px 8px 0', minHeight: 54 }}>
                {[...t.tour_stops].sort((a, b) => a.position - b.position).map(s => {
                  const start = minutenSeit6(s.geplante_ankunft)
                  const ende = minutenSeit6(s.geplantes_ende)
                  if (start === null || ende === null) return null
                  const links = Math.max(0, (start / gesamtMinuten) * 100)
                  const breite = Math.max(2, ((ende - start) / gesamtMinuten) * 100)
                  const farbe = (STOP_STATUS[s.status] ?? { color: '#666' }).color
                  return (
                    <div key={s.id} title={`${s.position}. ${person(s.clients)} ${zeit(s.geplante_ankunft)}–${zeit(s.geplantes_ende)}${s.fahrzeit_minuten ? ` · Anfahrt ${s.fahrzeit_minuten} Min` : ''}`}
                      style={{
                        position: 'absolute', top: 6, bottom: 6,
                        left: `${links}%`, width: `${breite}%`,
                        background: `${farbe}33`, border: `1px solid ${farbe}`,
                        borderRadius: 6, padding: '2px 4px', overflow: 'hidden',
                        fontSize: 10, color: 'var(--ink2)', whiteSpace: 'nowrap',
                      }}>
                      {s.position}. {person(s.clients)}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tour-Detail ────────────────────────────────────────────────
function TourDetail({ tour, onClose, onPatchTour, onPatchStop, onVerschiebe, onEntferne, onVertretung, onReload, clients }: {
  tour: TourRow
  onClose: () => void
  onPatchTour: (id: string, body: Record<string, unknown>) => Promise<boolean>
  onPatchStop: (tourId: string, body: Record<string, unknown>) => Promise<boolean>
  onVerschiebe: (tour: TourRow, stopId: string, richtung: -1 | 1) => void
  onEntferne: (tourId: string, stopId: string) => void
  onVertretung: () => void
  onReload: () => void
  clients: Option[]
}) {
  const [neuOpen, setNeuOpen] = useState(false)
  const [neu, setNeu] = useState<NeuerStop>({ client_id: '', geplante_ankunft: '', geplantes_ende: '', service_type: SERVICE_TYPES[0] })
  const st = TOUR_STATUS[tour.status] ?? { label: tour.status, color: '#666' }
  const stops = [...tour.tour_stops].sort((a, b) => a.position - b.position)
  const offen = !['ABGESCHLOSSEN', 'STORNIERT'].includes(tour.status)

  const stopAnlegen = async () => {
    if (!neu.client_id || !neu.geplante_ankunft || !neu.geplantes_ende) return
    const res = await fetch(`/api/tours/${tour.id}/stops`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(neu),
    })
    if (res.ok) {
      setNeuOpen(false)
      setNeu({ client_id: '', geplante_ankunft: '', geplantes_ende: '', service_type: SERVICE_TYPES[0] })
    }
    onReload()
  }

  return (
    <div style={modalWrap} onClick={onClose}>
      <div style={{ ...modalBox, maxWidth: 780 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
            {tour.name || `Tour ${person(tour.caregivers)}`}
          </h2>
          <Pille label={st.label} color={st.color} />
          <span style={{ flex: 1 }} />
          <button onClick={() => window.print()} style={btn}>🖨 Drucken</button>
          <button onClick={onClose} style={btn}>Schließen</button>
        </div>
        <p style={{ color: 'var(--ink4)', fontSize: 13, marginBottom: 10 }}>
          {datumLang(tour.tour_date)} · {person(tour.caregivers)} · {zeit(tour.start_zeit)}–{zeit(tour.ende_zeit)}
          {' '}· 🚗 {tour.gesamt_fahrzeit_minuten} Min / {Number(tour.gesamt_distanz_km).toFixed(1)} km Fahrt
        </p>
        {tour.vertretung_fuer_caregiver_id && (
          <div style={{ marginBottom: 10 }}>
            <Banner tone="info">Vertretungstour ({tour.vertretung_grund || 'ohne Grund'}).</Banner>
          </div>
        )}

        {/* Status-Aktionen */}
        {offen && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {tour.status === 'GEPLANT' && (
              <button style={btn} onClick={() => onPatchTour(tour.id, { status: 'FREIGEGEBEN' })}>Freigeben</button>
            )}
            {['GEPLANT', 'FREIGEGEBEN'].includes(tour.status) && (
              <button style={btn} onClick={() => onPatchTour(tour.id, { status: 'UNTERWEGS' })}>Tour starten</button>
            )}
            {tour.status === 'UNTERWEGS' && (
              <button style={btn} onClick={() => onPatchTour(tour.id, { status: 'ABGESCHLOSSEN' })}>Tour abschließen</button>
            )}
            <button style={btn} onClick={onVertretung}>Vertretung…</button>
            <button style={{ ...btn, color: '#D04B3B' }} onClick={() => {
              if (confirm('Tour wirklich stornieren?')) onPatchTour(tour.id, { status: 'STORNIERT' })
            }}>Stornieren</button>
          </div>
        )}

        {/* Stop-Liste */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: 'var(--ink4)', textAlign: 'left' }}>
              <th style={{ padding: 6 }}>#</th>
              <th style={{ padding: 6 }}>Klient</th>
              <th style={{ padding: 6 }}>Zeit</th>
              <th style={{ padding: 6 }}>Anfahrt</th>
              <th style={{ padding: 6 }}>Status</th>
              <th style={{ padding: 6 }}></th>
            </tr>
          </thead>
          <tbody>
            {stops.map((s, i) => {
              const sst = STOP_STATUS[s.status] ?? { label: s.status, color: '#666' }
              const folge = STOP_FOLGE_STATUS[s.status] ?? []
              return (
                <tr key={s.id} style={{ borderTop: '1px solid var(--line)', color: 'var(--ink2)' }}>
                  <td style={{ padding: 6 }}>{s.position}</td>
                  <td style={{ padding: 6 }}>
                    <div style={{ fontWeight: 600 }}>{person(s.clients)}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink4)' }}>{[s.adresse, s.plz].filter(Boolean).join(', ') || 'Adresse fehlt'}</div>
                  </td>
                  <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{zeit(s.geplante_ankunft)}–{zeit(s.geplantes_ende)}</td>
                  <td style={{ padding: 6, whiteSpace: 'nowrap', fontSize: 12, color: 'var(--ink4)' }}>
                    {s.fahrzeit_minuten != null ? `${s.fahrzeit_minuten} Min · ${Number(s.distanz_km ?? 0).toFixed(1)} km` : '–'}
                  </td>
                  <td style={{ padding: 6 }}>
                    <Pille label={sst.label} color={sst.color} />
                    {s.service_record_id && <div style={{ fontSize: 10, color: '#5CB882' }}>Nachweis ✓</div>}
                  </td>
                  <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                    {offen && (
                      <>
                        {folge.map(f => (
                          <button key={f} style={{ ...btn, padding: '3px 8px', fontSize: 11, marginRight: 4 }}
                            onClick={() => onPatchStop(tour.id, {
                              stop_id: s.id, status: f,
                              ...(f === 'ABGESCHLOSSEN' ? { leistungsnachweis_anlegen: true } : {}),
                            })}>
                            → {(STOP_STATUS[f] ?? { label: f }).label}
                          </button>
                        ))}
                        {s.status === 'GEPLANT' && (
                          <>
                            <button style={{ ...btn, padding: '3px 7px', fontSize: 11 }} disabled={i === 0}
                              onClick={() => onVerschiebe(tour, s.id, -1)}>↑</button>
                            <button style={{ ...btn, padding: '3px 7px', fontSize: 11, marginLeft: 2 }} disabled={i === stops.length - 1}
                              onClick={() => onVerschiebe(tour, s.id, 1)}>↓</button>
                            <button style={{ ...btn, padding: '3px 7px', fontSize: 11, marginLeft: 2, color: '#D04B3B' }}
                              onClick={() => onEntferne(tour.id, s.id)}>✕</button>
                          </>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Stop hinzufügen */}
        {offen && (
          neuOpen ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={neu.client_id} onChange={e => setNeu({ ...neu, client_id: e.target.value })} style={input}>
                <option value="">Klient wählen…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="time" value={neu.geplante_ankunft} onChange={e => setNeu({ ...neu, geplante_ankunft: e.target.value })} style={input} />
              <input type="time" value={neu.geplantes_ende} onChange={e => setNeu({ ...neu, geplantes_ende: e.target.value })} style={input} />
              <select value={neu.service_type} onChange={e => setNeu({ ...neu, service_type: e.target.value })} style={input}>
                {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button style={btnPrimary} onClick={stopAnlegen}>Hinzufügen</button>
              <button style={btn} onClick={() => setNeuOpen(false)}>Abbrechen</button>
            </div>
          ) : (
            <button style={{ ...btn, marginTop: 10 }} onClick={() => setNeuOpen(true)}>+ Stop hinzufügen</button>
          )
        )}
      </div>
    </div>
  )
}

// ── Vertretungs-Dialog ─────────────────────────────────────────
function VertretungsDialog({ tour, onClose, onDone, onFehler }: {
  tour: TourRow
  onClose: () => void
  onDone: (warnungen: string[]) => void
  onFehler: (f: string) => void
}) {
  const [kandidaten, setKandidaten] = useState<Kandidat[] | null>(null)
  const [auswahl, setAuswahl] = useState('')
  const [grund, setGrund] = useState('Krankheit')
  const [laeuft, setLaeuft] = useState(false)

  useEffect(() => {
    fetch(`/api/tours/${tour.id}/vertretung`)
      .then(r => r.json())
      .then(d => setKandidaten(Array.isArray(d) ? d : []))
      .catch(() => setKandidaten([]))
  }, [tour.id])

  const ausfuehren = async (force: boolean) => {
    if (!auswahl) return
    setLaeuft(true)
    try {
      const res = await fetch(`/api/tours/${tour.id}/vertretung`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neuer_caregiver_id: auswahl, grund, force_override: force }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 422 && data.hinweis && confirm(`${data.error}\n\nTrotzdem fortfahren?`)) {
          await ausfuehren(true)
          return
        }
        onFehler(data.error)
        return
      }
      onDone(data.warnungen ?? [])
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <div style={{ ...modalWrap, zIndex: 70 }} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
          Vertretung für {person(tour.caregivers)} am {datumLang(tour.tour_date)}
        </h3>
        {kandidaten === null ? <p style={{ color: 'var(--ink4)' }}>Suche Kandidaten…</p> : (
          <>
            <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 12 }}>
              {kandidaten.length === 0 && <p style={{ color: 'var(--ink4)' }}>Keine Kandidaten gefunden.</p>}
              {kandidaten.map(k => (
                <label key={k.caregiver_id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, cursor: 'pointer',
                  background: auswahl === k.caregiver_id ? 'var(--coal3)' : 'transparent',
                  opacity: k.abwesend ? 0.5 : 1,
                }}>
                  <input type="radio" name="vertretung" checked={auswahl === k.caregiver_id}
                    onChange={() => setAuswahl(k.caregiver_id)} />
                  <span style={{ color: 'var(--ink2)', fontSize: 13, fontWeight: 600 }}>{k.name}</span>
                  {k.bevorzugt && <Pille label="Bevorzugte Vertretung" color="#5CB882" />}
                  {k.hat_fahrzeug && <span title="Eigenes Fahrzeug" style={{ fontSize: 12 }}>🚗</span>}
                  {k.abwesend && <Pille label="Abwesend" color="#D04B3B" />}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={grund} onChange={e => setGrund(e.target.value)} style={input}>
                {['Krankheit', 'Urlaub', 'Fortbildung', 'Sonstiges'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <button style={btnPrimary} disabled={!auswahl || laeuft} onClick={() => ausfuehren(false)}>
                {laeuft ? 'Übertrage…' : 'Tour übertragen'}
              </button>
              <button style={btn} onClick={onClose}>Abbrechen</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Neue Tour ──────────────────────────────────────────────────
function NeueTourDialog({ caregivers, clients, defaultDate, onClose, onDone }: {
  caregivers: Option[]
  clients: Option[]
  defaultDate: string
  onClose: () => void
  onDone: (warnungen: string[]) => void
}) {
  const [caregiverId, setCaregiverId] = useState('')
  const [datum, setDatum] = useState(defaultDate)
  const [name, setName] = useState('')
  const [stops, setStops] = useState<NeuerStop[]>([
    { client_id: '', geplante_ankunft: '09:00', geplantes_ende: '10:00', service_type: SERVICE_TYPES[0] },
  ])
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  const speichern = async (force: boolean) => {
    if (!caregiverId || !datum) { setFehler('Mitarbeiter und Datum sind Pflicht.'); return }
    const gueltige = stops.filter(s => s.client_id && s.geplante_ankunft && s.geplantes_ende)
    if (gueltige.length === 0) { setFehler('Mindestens ein vollständiger Stop erforderlich.'); return }
    setLaeuft(true)
    setFehler(null)
    try {
      const res = await fetch('/api/tours', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caregiver_id: caregiverId, tour_date: datum, name: name || undefined,
          stops: gueltige, force_override: force,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 422 && data.hinweis && confirm(`${data.error}\n\nTrotzdem anlegen?`)) {
          await speichern(true)
          return
        }
        setFehler(data.error)
        return
      }
      onDone(data.warnungen ?? [])
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <div style={modalWrap} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Neue Tour anlegen</h3>
        {fehler && <div style={{ marginBottom: 10 }}><Banner tone="danger">{fehler}</Banner></div>}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <select value={caregiverId} onChange={e => setCaregiverId(e.target.value)} style={{ ...input, minWidth: 200 }}>
            <option value="">Mitarbeiter wählen…</option>
            {caregivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" value={datum} onChange={e => setDatum(e.target.value)} style={input} />
          <input placeholder="Tour-Name (optional)" value={name} onChange={e => setName(e.target.value)} style={{ ...input, flex: 1, minWidth: 160 }} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink3)', marginBottom: 6 }}>
          Stops (in Reihenfolge — Fahrtzeiten werden automatisch berechnet)
        </div>
        {stops.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: 'var(--ink4)', fontSize: 12, width: 16 }}>{i + 1}.</span>
            <select value={s.client_id} onChange={e => setStops(st => st.map((x, j) => j === i ? { ...x, client_id: e.target.value } : x))} style={{ ...input, minWidth: 180 }}>
              <option value="">Klient wählen…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="time" value={s.geplante_ankunft} onChange={e => setStops(st => st.map((x, j) => j === i ? { ...x, geplante_ankunft: e.target.value } : x))} style={input} />
            <input type="time" value={s.geplantes_ende} onChange={e => setStops(st => st.map((x, j) => j === i ? { ...x, geplantes_ende: e.target.value } : x))} style={input} />
            <select value={s.service_type} onChange={e => setStops(st => st.map((x, j) => j === i ? { ...x, service_type: e.target.value } : x))} style={input}>
              {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {stops.length > 1 && (
              <button style={{ ...btn, padding: '3px 8px', color: '#D04B3B' }} onClick={() => setStops(st => st.filter((_, j) => j !== i))}>✕</button>
            )}
          </div>
        ))}
        <button style={{ ...btn, marginBottom: 14 }} onClick={() => setStops(st => [...st, {
          client_id: '', geplante_ankunft: '', geplantes_ende: '', service_type: SERVICE_TYPES[0],
        }])}>+ weiterer Stop</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btnPrimary} disabled={laeuft} onClick={() => speichern(false)}>
            {laeuft ? 'Lege an…' : 'Tour anlegen'}
          </button>
          <button style={btn} onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  )
}

// ── Druckansicht ───────────────────────────────────────────────
function TourDruck({ tour }: { tour: TourRow }) {
  const stops = [...tour.tour_stops].sort((a, b) => a.position - b.position)
  return (
    <div className="tour-druckansicht">
      <h1 style={{ fontSize: '16pt', marginBottom: 4 }}>
        Tourenplan — {person(tour.caregivers)}
      </h1>
      <p style={{ marginBottom: 2 }}>{datumLang(tour.tour_date)}{tour.name ? ` · ${tour.name}` : ''}</p>
      <p style={{ marginBottom: 12 }}>
        Beginn {zeit(tour.start_zeit)} Uhr · Ende {zeit(tour.ende_zeit)} Uhr ·
        Fahrzeit gesamt {tour.gesamt_fahrzeit_minuten} Min ({Number(tour.gesamt_distanz_km).toFixed(1)} km)
        {tour.vertretung_fuer_caregiver_id ? ` · VERTRETUNGSTOUR (${tour.vertretung_grund || ''})` : ''}
      </p>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Zeit</th><th>Klient</th><th>Adresse</th><th>Telefon</th><th>Anfahrt</th><th>Hinweise</th>
          </tr>
        </thead>
        <tbody>
          {stops.map(s => {
            const c = Array.isArray(s.clients) ? s.clients[0] : s.clients
            return (
              <tr key={s.id}>
                <td>{s.position}</td>
                <td>{zeit(s.geplante_ankunft)}–{zeit(s.geplantes_ende)}</td>
                <td>{person(s.clients)}</td>
                <td>{[s.adresse, s.plz].filter(Boolean).join(', ')}</td>
                <td>{c?.phone || ''}</td>
                <td>{s.fahrzeit_minuten != null ? `${s.fahrzeit_minuten} Min` : ''}</td>
                <td>{s.status === 'AUSGEFALLEN' ? 'ENTFÄLLT' : (s.notes || '')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p style={{ marginTop: 16, fontSize: '9pt' }}>
        Alltagsengel · Tourenplan erstellt am {new Date().toLocaleDateString('de-DE')} · Änderungen vorbehalten
      </p>
    </div>
  )
}
