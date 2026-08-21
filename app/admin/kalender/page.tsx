'use client'
import { datumBerlin, heuteBerlin } from '@/lib/utils/timezone';
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatTime, fullName, WEEKDAYS, BUNDESLAND_LABELS } from '@/lib/admin/ops'
import { StatusBadge, Banner, EmptyRow } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger';
import DialogOverlay from '@/components/DialogOverlay'
import { klickbar } from '@/lib/a11y'
const log = logger.child('admin:kalender');

// ── Status-Farben ──────────────────────────────────────────────
const STATUS_COLORS: Record<string, { label: string; color: string }> = {
  GEPLANT:    { label: 'Geplant',    color: '#2196F3' },
  BESTAETIGT: { label: 'Bestätigt',  color: '#00BCD4' },
  UNTERWEGS:  { label: 'Unterwegs',  color: '#FF9800' },
  GESTARTET:  { label: 'Gestartet',  color: '#4CAF50' },
  BEENDET:    { label: 'Beendet',    color: '#5CB882' },
  STORNIERT:  { label: 'Storniert',  color: '#9E9E9E' },
  NO_SHOW:    { label: 'No-Show',    color: '#D04B3B' },
  active:     { label: 'Aktiv',      color: '#5CB882' },
  cancelled:  { label: 'Abgesagt',   color: '#9E9E9E' },
}
function statusOf(s: string) {
  return STATUS_COLORS[s] || { label: s, color: '#666' }
}

const ALL_STATUSES = Object.keys(STATUS_COLORS)
const SERVICE_TYPES = [
  'Alltagsbegleitung', 'Haushaltshilfe', 'Einkaufshilfe', 'Arztbegleitung',
  'Betreuung/Gesellschaft', 'Spaziergang/Mobilität', 'Demenzbetreuung', 'Sonstige',
]

// ── Datums-Helfer ──────────────────────────────────────────────
function isoDate(d: Date): string { return datumBerlin(d) }

function mondayOfWeek(base: Date): Date {
  const d = new Date(base)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function kwNumber(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function germanMonthLong(d: Date): string {
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', month: 'long', year: 'numeric' })
}

function germanDateShort(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}.`
}

// Determine effective date for an assignment: assignment_date for single, or
// map weekday-based recurring assignments onto a specific date in the range
function effectiveDate(a: AssignmentRow, rangeStart: string, rangeEnd: string): string | null {
  if (a.assignment_date) return a.assignment_date
  if (a.weekday == null) return null
  // find date matching weekday within range
  const start = new Date(rangeStart)
  const end = new Date(rangeEnd)
  for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
    const jsDay = cur.getDay() === 0 ? 0 : cur.getDay()
    const normWd = a.weekday === 7 ? 0 : a.weekday
    if (jsDay === normWd) {
      const ds = isoDate(cur)
      if ((!a.valid_from || ds >= a.valid_from) && (!a.valid_until || ds <= a.valid_until)) {
        return ds
      }
    }
  }
  return null
}

// HOURS shown in day view
const DAY_HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 06..22

// ── Schnittstellen ─────────────────────────────────────────────
interface AssignmentRow {
  id: string
  client_id: string
  caregiver_id: string
  weekday: number | null
  start_time: string | null
  end_time: string | null
  service_type: string | null
  status: string
  assignment_date: string | null
  is_recurring: boolean
  valid_from: string | null
  valid_until: string | null
  address: string | null
  zip_code: string | null
  bundesland: string | null
  notes: string | null
  client: { first_name: string | null; last_name: string | null; zip_code?: string | null } | null
  caregiver: { first_name: string | null; last_name: string | null } | null
}
interface AbsenceRow {
  id: string
  caregiver_id: string
  absence_type: string
  start_date: string
  end_date: string | null
}
interface StateRow {
  bundesland: string
}
interface CaregiverOption { id: string; name: string }
interface ClientOption { id: string; name: string }

type ViewMode = 'day' | 'week' | 'month'

// ── Hauptkomponente ────────────────────────────────────────────
export default function AdminKalenderPage() {
  const [view, setView] = useState<ViewMode>('week')
  const [baseDate, setBaseDate] = useState(() => new Date())
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [absences, setAbsences] = useState<AbsenceRow[]>([])
  const [bundeslaender, setBundeslaender] = useState<string[]>([])
  const [caregiverOptions, setCaregiverOptions] = useState<CaregiverOption[]>([])
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)

  // Filter state
  const [filterBundesland, setFilterBundesland] = useState('')
  const [filterCaregiver, setFilterCaregiver] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterService, setFilterService] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [hideAbgeschlossen, setHideAbgeschlossen] = useState(true)

  // Detail + create modals
  const [selected, setSelected] = useState<AssignmentRow | null>(null)
  const [createModal, setCreateModal] = useState(false)
  const [createDate, setCreateDate] = useState<string | null>(null)

  // ── Computed date range ──────────────────────────────────────
  const { rangeStart, rangeEnd, label } = useMemo(() => {
    if (view === 'day') {
      const ds = isoDate(baseDate)
      const dayLabel = baseDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'long', year: 'numeric' })
      return { rangeStart: ds, rangeEnd: ds, label: dayLabel }
    }
    if (view === 'week') {
      const mon = mondayOfWeek(baseDate)
      const sun = addDays(mon, 6)
      const kw = kwNumber(mon)
      const wLabel = `KW ${kw} · ${germanDateShort(mon)}–${germanDateShort(sun)} ${sun.getFullYear()}`
      return { rangeStart: isoDate(mon), rangeEnd: isoDate(sun), label: wLabel }
    }
    // month
    const ms = startOfMonth(baseDate)
    const me = endOfMonth(baseDate)
    return { rangeStart: isoDate(ms), rangeEnd: isoDate(me), label: germanMonthLong(baseDate) }
  }, [view, baseDate])

  // ── Data loading ─────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const supabase = createClient()

      // Build assignment query with date range
      let q = supabase
        .from('assignments')
        .select('*, client:clients(first_name, last_name, zip_code), caregiver:caregivers(first_name, last_name)')

      // For date-based assignments, filter by assignment_date in range
      // For recurring (weekday-based), we fetch all active ones and filter client-side
      // Use .or() to get both kinds
      q = q.or(`and(assignment_date.gte.${rangeStart},assignment_date.lte.${rangeEnd}),and(assignment_date.is.null,is_recurring.eq.true)`)

      if (filterBundesland) q = q.eq('bundesland', filterBundesland)
      if (filterCaregiver) q = q.eq('caregiver_id', filterCaregiver)
      if (filterClient) q = q.eq('client_id', filterClient)
      if (filterService) q = q.eq('service_type', filterService)
      if (filterStatus) q = q.eq('status', filterStatus)

      const [aRes, abRes, stRes, cgRes, clRes] = await Promise.all([
        q,
        supabase.from('absences').select('id, caregiver_id, absence_type, start_date, end_date')
          .lte('start_date', rangeEnd).gte('end_date', rangeStart),
        supabase.from('state_settings').select('bundesland'),
        supabase.from('caregivers').select('id, first_name, last_name').eq('status', 'active'),
        supabase.from('clients').select('id, first_name, last_name'),
      ])
      setAssignments((aRes.data || []) as AssignmentRow[])
      setAbsences((abRes.data || []) as AbsenceRow[])
      setBundeslaender(Array.from(new Set((stRes.data || []).map((s: StateRow) => s.bundesland))).sort())
      setCaregiverOptions((cgRes.data || []).map((c: any) => ({ id: c.id, name: fullName(c) })))
      setClientOptions((clRes.data || []).map((c: any) => ({ id: c.id, name: fullName(c) })))
    } catch (err) {
      log.errorWithException('Kalender load error', err)
    } finally {
      setLoading(false)
    }
  }, [rangeStart, rangeEnd, filterBundesland, filterCaregiver, filterClient, filterService, filterStatus])

  useEffect(() => { load() }, [load])

  // ── Absent check ─────────────────────────────────────────────
  const isAbsent = useCallback((caregiverId: string, dateStr: string) => {
    return absences.some(a =>
      a.caregiver_id === caregiverId &&
      a.start_date <= dateStr &&
      (a.end_date ?? a.start_date) >= dateStr
    )
  }, [absences])

  // ── Expand recurring assignments into date-keyed entries ────
  const mapped = useMemo(() => {
    const abgeschlosseneStatus = ['BEENDET', 'STORNIERT', 'NO_SHOW', 'cancelled']
    const result: (AssignmentRow & { effectiveDay: string })[] = []
    for (const a of assignments) {
      if (hideAbgeschlossen && abgeschlosseneStatus.includes(a.status)) continue
      const ed = effectiveDate(a, rangeStart, rangeEnd)
      if (ed) result.push({ ...a, effectiveDay: ed })
    }
    return result
  }, [assignments, rangeStart, rangeEnd, hideAbgeschlossen])

  // ── Stats ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const today = isoDate(new Date())
    const planned = mapped.filter(a => ['GEPLANT', 'BESTAETIGT', 'active'].includes(a.status)).length
    const done = mapped.filter(a => a.status === 'BEENDET').length
    const todayAbsences = absences.filter(a => a.start_date <= today && (a.end_date ?? a.start_date) >= today).length
    // open substitutions: assignments where caregiver is absent today
    const openSubs = mapped.filter(a =>
      a.effectiveDay === today &&
      !['STORNIERT', 'cancelled', 'BEENDET', 'NO_SHOW'].includes(a.status) &&
      isAbsent(a.caregiver_id, today)
    ).length
    return { planned, done, todayAbsences, openSubs }
  }, [mapped, absences, isAbsent])

  // ── Navigation ───────────────────────────────────────────────
  function navigate(dir: -1 | 0 | 1) {
    if (dir === 0) { setBaseDate(new Date()); return }
    setBaseDate(prev => {
      const d = new Date(prev)
      if (view === 'day') d.setDate(d.getDate() + dir)
      else if (view === 'week') d.setDate(d.getDate() + dir * 7)
      else d.setMonth(d.getMonth() + dir)
      return d
    })
  }

  function goToDay(dateStr: string) {
    setBaseDate(new Date(dateStr + 'T00:00:00'))
    setView('day')
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Kalender</h1>
          <p className="admin-subtitle">Einsatzplanung im Kalender-Format</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => { setCreateDate(null); setCreateModal(true) }} style={primaryBtn}>+ Neuer Einsatz</button>
        </div>
      </div>

      {/* Statistiken */}
      <div className="admin-stats-grid" style={{ marginBottom: 8 }}>
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #2196F3' }}>
          <div className="admin-stat-value">{stats.planned}</div>
          <div className="admin-stat-label">Geplante Einsätze</div>
        </div>
        <div className="admin-stat-card success">
          <div className="admin-stat-value">{stats.done}</div>
          <div className="admin-stat-label">Abgeschlossene Einsätze</div>
        </div>
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #D04B3B' }}>
          <div className="admin-stat-value">{stats.todayAbsences}</div>
          <div className="admin-stat-label">Ausfälle heute</div>
        </div>
        <div className="admin-stat-card accent">
          <div className="admin-stat-value">{stats.openSubs}</div>
          <div className="admin-stat-label">Offene Vertretungen</div>
        </div>
      </div>

      {/* Ansichts-Umschalter + Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {(['day', 'week', 'month'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                ...viewToggleBtn,
                background: view === v ? 'linear-gradient(135deg,var(--gold2),var(--gold))' : 'var(--coal3)',
                color: view === v ? 'var(--coal)' : 'var(--ink3)',
                fontWeight: view === v ? 700 : 400,
                borderRadius: v === 'day' ? '8px 0 0 8px' : v === 'month' ? '0 8px 8px 0' : 0,
              }}
            >
              {v === 'day' ? 'Tag' : v === 'week' ? 'Woche' : 'Monat'}
            </button>
          ))}
        </div>
        <button onClick={() => navigate(-1)} style={navBtn}>&larr;</button>
        <button onClick={() => navigate(0)} style={navBtn}>Heute</button>
        <button onClick={() => navigate(1)} style={navBtn}>&rarr;</button>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink2)', marginLeft: 4 }}>{label}</span>
      </div>

      {/* Filter-Leiste */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filterBundesland} onChange={e => setFilterBundesland(e.target.value)} style={filterSelect}>
          <option value="">Alle Bundesländer</option>
          {bundeslaender.map(bl => (
            <option key={bl} value={bl}>{BUNDESLAND_LABELS[bl] || bl}</option>
          ))}
        </select>
        <select value={filterCaregiver} onChange={e => setFilterCaregiver(e.target.value)} style={filterSelect}>
          <option value="">Alle Mitarbeiter</option>
          {caregiverOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={filterSelect}>
          <option value="">Alle Kunden</option>
          {clientOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterService} onChange={e => setFilterService(e.target.value)} style={filterSelect}>
          <option value="">Alle Leistungsarten</option>
          {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={filterSelect}>
          <option value="">Alle Status</option>
          {ALL_STATUSES.map(s => {
            const m = statusOf(s)
            return <option key={s} value={s}>{m.label}</option>
          })}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink3)', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={hideAbgeschlossen}
            onChange={e => setHideAbgeschlossen(e.target.checked)}
            style={{ accentColor: 'var(--gold2)' }}
          />
          Abgeschlossene ausblenden
        </label>
      </div>

      {loading ? <p style={{ color: 'var(--ink4)' }}>Laden…</p> : (
        <>
          {view === 'day' && (
            <DayView
              date={isoDate(baseDate)}
              assignments={mapped}
              isAbsent={isAbsent}
              onSelect={setSelected}
              onCreateSlot={(hour) => { setCreateDate(isoDate(baseDate)); setCreateModal(true) }}
            />
          )}
          {view === 'week' && (
            <WeekView
              monday={mondayOfWeek(baseDate)}
              assignments={mapped}
              isAbsent={isAbsent}
              onSelect={setSelected}
              onDayClick={goToDay}
            />
          )}
          {view === 'month' && (
            <MonthView
              baseDate={baseDate}
              assignments={mapped}
              onDayClick={goToDay}
            />
          )}
        </>
      )}

      {/* Detail-Ansicht */}
      {selected && (
        <DialogOverlay onClose={() => setSelected(null)}>
          <div role="dialog" aria-label="Einsatz-Details" aria-modal="true" className="admin-modal" style={{ maxWidth: 480, width: '92%' }} onClick={e => e.stopPropagation()}>
            <h3>Einsatz-Details</h3>
            <DetailRow label="Klient">{fullName(selected.client)}</DetailRow>
            <DetailRow label="Betreuungskraft">{fullName(selected.caregiver)}</DetailRow>
            <DetailRow label="Datum">{selected.assignment_date ? formatDate(selected.assignment_date) : (selected.weekday != null ? WEEKDAYS.find(w => w.n === (selected.weekday === 7 ? 0 : selected.weekday))?.long || '---' : '---')}</DetailRow>
            <DetailRow label="Uhrzeit">{formatTime(selected.start_time)} – {formatTime(selected.end_time)}</DetailRow>
            <DetailRow label="Leistungsart">{selected.service_type || '—'}</DetailRow>
            <DetailRow label="Status">
              <StatusBadge label={statusOf(selected.status).label} color={statusOf(selected.status).color} />
            </DetailRow>
            {selected.address && <DetailRow label="Adresse">{selected.address}</DetailRow>}
            {selected.zip_code && <DetailRow label="PLZ">{selected.zip_code}</DetailRow>}
            {selected.bundesland && <DetailRow label="Bundesland">{BUNDESLAND_LABELS[selected.bundesland] || selected.bundesland}</DetailRow>}
            {selected.notes && <DetailRow label="Notizen">{selected.notes}</DetailRow>}
            <DetailRow label="Wiederkehrend">{selected.is_recurring ? 'Ja' : 'Nein'}</DetailRow>
            <div className="admin-modal-btns" style={{ marginTop: 14 }}>
              <button className="btn-cancel" onClick={() => setSelected(null)}>Schließen</button>
              {!['STORNIERT', 'cancelled', 'BEENDET'].includes(selected.status) && (
                <button className="btn-confirm" style={{ background: '#9E9E9E' }} onClick={async () => {
                  await fetch('/api/einsatzplanung', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: selected.id, status: 'STORNIERT' }),
                  })
                  setSelected(null)
                  load()
                }}>Stornieren</button>
              )}
            </div>
          </div>
        </DialogOverlay>
      )}

      {/* Neuer Einsatz */}
      {createModal && (
        <CreateAssignmentModal
          clients={clientOptions}
          caregivers={caregiverOptions}
          initialDate={createDate}
          onClose={() => setCreateModal(false)}
          onSaved={() => { setCreateModal(false); load() }}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Tagesansicht (vertical timeline 06:00 - 22:00)
// ═══════════════════════════════════════════════════════════════
function DayView({ date, assignments, isAbsent, onSelect, onCreateSlot }: {
  date: string
  assignments: (AssignmentRow & { effectiveDay: string })[]
  isAbsent: (cgId: string, dateStr: string) => boolean
  onSelect: (a: AssignmentRow) => void
  onCreateSlot: (hour: number) => void
}) {
  const items = assignments.filter(a => a.effectiveDay === date)
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))

  // Calculate position: each hour = 60px
  function timeToOffset(t: string | null): number {
    if (!t) return 0
    const [h, m] = t.split(':').map(Number)
    return ((h - 6) * 60 + (m || 0))
  }
  function timeToHeight(start: string | null, end: string | null): number {
    if (!start || !end) return 60
    const s = timeToOffset(start)
    const e = timeToOffset(end)
    return Math.max(e - s, 24)
  }

  return (
    <div style={{ position: 'relative', background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Hour grid lines */}
      {DAY_HOURS.map(h => (
        <div role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (() => onCreateSlot(h))() } }}
          key={h}
          onClick={() => onCreateSlot(h)}
          style={{
            height: 60, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start',
            cursor: 'pointer', position: 'relative',
          }}
        >
          <div style={{ width: 56, fontSize: 11, color: 'var(--ink5)', padding: '4px 8px', textAlign: 'right', flexShrink: 0 }}>
            {String(h).padStart(2, '0')}:00
          </div>
          <div style={{ flex: 1, borderLeft: '1px solid var(--border)', height: '100%' }} />
        </div>
      ))}

      {/* Assignment blocks */}
      {items.map(a => {
        const top = Math.max(timeToOffset(a.start_time), 0)
        const height = timeToHeight(a.start_time, a.end_time)
        const absent = isAbsent(a.caregiver_id, date)
        const sm = statusOf(a.status)
        return (
          <div
            key={a.id}
            {...klickbar(() => onSelect(a))}
            aria-label={`Einsatz ${fullName(a.client)}, Details öffnen`}
            onClick={(e) => { e.stopPropagation(); onSelect(a) }}
            style={{
              position: 'absolute', top, left: 64, right: 8, height, minHeight: 24,
              background: absent ? 'rgba(208,75,59,.15)' : `${sm.color}18`,
              border: `1px solid ${absent ? 'rgba(208,75,59,.5)' : sm.color + '55'}`,
              borderLeft: `3px solid ${absent ? '#D04B3B' : sm.color}`,
              borderRadius: 6, padding: '3px 8px', cursor: 'pointer', overflow: 'hidden',
              fontSize: 12, zIndex: 2,
            }}
          >
            <div style={{ fontWeight: 600, color: absent ? '#D04B3B' : 'var(--ink)' }}>
              {formatTime(a.start_time)}–{formatTime(a.end_time)}
              {absent && <span title="Kraft abwesend" style={{ marginLeft: 4 }}>{'⚠️'}</span>}
            </div>
            <div style={{ color: 'var(--gold2)', fontSize: 11 }}>{fullName(a.caregiver)}</div>
            <div style={{ color: 'var(--ink4)', fontSize: 11 }}>{fullName(a.client)}</div>
            {height > 48 && a.service_type && <div style={{ color: 'var(--ink5)', fontSize: 10 }}>{a.service_type}</div>}
            {height > 60 && <div style={{ marginTop: 2 }}><StatusBadge label={sm.label} color={sm.color} /></div>}
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Wochenansicht (7 Spalten Mo-So)
// ═══════════════════════════════════════════════════════════════
function WeekView({ monday, assignments, isAbsent, onSelect, onDayClick }: {
  monday: Date
  assignments: (AssignmentRow & { effectiveDay: string })[]
  isAbsent: (cgId: string, dateStr: string) => boolean
  onSelect: (a: AssignmentRow) => void
  onDayClick: (dateStr: string) => void
}) {
  const todayStr = isoDate(new Date())

  const columns = WEEKDAYS.map((wd, idx) => {
    const date = addDays(monday, idx)
    const dateStr = isoDate(date)
    const items = assignments
      .filter(a => a.effectiveDay === dateStr)
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
    return { wd, date, dateStr, items }
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(150px, 1fr))', gap: 10, overflowX: 'auto' }}>
      {columns.map(col => {
        const isToday = col.dateStr === todayStr
        return (
          <div key={col.wd.n} style={{
            background: 'var(--coal2)', border: `1px solid ${isToday ? 'var(--gold2)' : 'var(--border)'}`,
            borderRadius: 12, padding: 10, minHeight: 120,
          }}>
            <div role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (() => onDayClick(col.dateStr))() } }}
              onClick={() => onDayClick(col.dateStr)}
              style={{
                fontSize: 12, fontWeight: 700, color: isToday ? 'var(--gold2)' : 'var(--ink3)',
                marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.5px', cursor: 'pointer',
              }}
            >
              {col.wd.short} &middot; {col.date.getDate()}.{col.date.getMonth() + 1}.
            </div>
            {col.items.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--ink5)' }}>&mdash;</div>
            ) : col.items.map(it => {
              const absent = isAbsent(it.caregiver_id, col.dateStr)
              return (
                <div role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (() => onSelect(it))() } }}
                  key={it.id}
                  onClick={() => onSelect(it)}
                  style={{
                    background: absent ? 'rgba(208,75,59,.12)' : 'var(--coal3)',
                    border: `1px solid ${absent ? 'rgba(208,75,59,.4)' : 'var(--border)'}`,
                    borderRadius: 8, padding: '6px 8px', marginBottom: 6, fontSize: 12, cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 600, color: absent ? '#D04B3B' : 'var(--ink2)' }}>
                    {formatTime(it.start_time)}&ndash;{formatTime(it.end_time)}
                    {absent && <span title="Kraft fällt aus" style={{ marginLeft: 4 }}>{'⚠️'}</span>}
                  </div>
                  <div style={{ color: 'var(--gold2)' }}>{fullName(it.caregiver)}</div>
                  <div style={{ color: 'var(--ink4)' }}>&rarr; {fullName(it.client)}</div>
                  {it.service_type && <div style={{ color: 'var(--ink5)', fontSize: 11 }}>{it.service_type}</div>}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Monatsansicht (6x7 Grid)
// ═══════════════════════════════════════════════════════════════
function MonthView({ baseDate, assignments, onDayClick }: {
  baseDate: Date
  assignments: (AssignmentRow & { effectiveDay: string })[]
  onDayClick: (dateStr: string) => void
}) {
  const todayStr = isoDate(new Date())
  const year = baseDate.getFullYear()
  const month = baseDate.getMonth()
  const firstDay = new Date(year, month, 1)
  // Monday-start offset: getDay() returns 0=Sun, we want 0=Mon
  const startOffset = (firstDay.getDay() + 6) % 7
  const gridStart = addDays(firstDay, -startOffset)
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  // Pre-compute counts per day
  const countByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of assignments) {
      m.set(a.effectiveDay, (m.get(a.effectiveDay) || 0) + 1)
    }
    return m
  }, [assignments])

  return (
    <div style={{ background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header row: weekday names */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
        {WEEKDAYS.map(wd => (
          <div key={wd.n} style={{
            padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 700,
            color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px',
            background: 'var(--coal3)',
          }}>
            {wd.short}
          </div>
        ))}
      </div>

      {/* Day cells: 6 rows x 7 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((d, idx) => {
          const ds = isoDate(d)
          const isCurrentMonth = d.getMonth() === month
          const isToday = ds === todayStr
          const count = countByDay.get(ds) || 0
          return (
            <div role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (() => onDayClick(ds))() } }}
              key={idx}
              onClick={() => onDayClick(ds)}
              style={{
                minHeight: 72, padding: 6, borderBottom: '1px solid var(--border)',
                borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--border)' : undefined,
                cursor: 'pointer', opacity: isCurrentMonth ? 1 : 0.35,
                background: isToday ? 'rgba(201,150,60,.08)' : 'transparent',
              }}
            >
              <div style={{
                fontSize: 13, fontWeight: isToday ? 700 : 400,
                color: isToday ? 'var(--gold2)' : 'var(--ink3)',
                width: 26, height: 26, lineHeight: '26px', textAlign: 'center',
                borderRadius: '50%',
                background: isToday ? 'linear-gradient(135deg,var(--gold2),var(--gold))' : 'transparent',
                ...(isToday ? { color: 'var(--coal)' } : {}),
              }}>
                {d.getDate()}
              </div>
              {count > 0 && (
                <div style={{
                  marginTop: 4, fontSize: 11, color: 'var(--gold2)', fontWeight: 600,
                  background: 'rgba(201,150,60,.1)', borderRadius: 4, padding: '2px 6px',
                  display: 'inline-block',
                }}>
                  {count} {count === 1 ? 'Einsatz' : 'Einsätze'}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Detail-Zeile (Key-Value fuer Modal)
// ═══════════════════════════════════════════════════════════════
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 13 }}>
      <span style={{ color: 'var(--ink4)', minWidth: 120, fontWeight: 600 }}>{label}</span>
      <span style={{ color: 'var(--ink)', flex: 1 }}>{children}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Neuer-Einsatz-Modal (POST /api/einsatzplanung)
// ═══════════════════════════════════════════════════════════════
function CreateAssignmentModal({ clients, caregivers, initialDate, onClose, onSaved }: {
  clients: ClientOption[]
  caregivers: CaregiverOption[]
  initialDate: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [clientId, setClientId] = useState('')
  const [caregiverId, setCaregiverId] = useState('')
  const [date, setDate] = useState(initialDate || heuteBerlin())
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('11:00')
  const [serviceType, setServiceType] = useState('Alltagsbegleitung')
  const [address, setAddress] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null)
    if (!clientId) { setErr('Bitte einen Klienten wählen.'); return }
    if (!caregiverId) { setErr('Bitte eine Betreuungskraft wählen.'); return }
    if (!startTime || !endTime) { setErr('Start- und Endzeit erforderlich.'); return }
    if (endTime <= startTime) { setErr('Endzeit muss nach Startzeit liegen.'); return }
    setSaving(true)

    const body: Record<string, unknown> = {
      client_id: clientId,
      caregiver_id: caregiverId,
      assignment_date: date,
      start_time: startTime,
      end_time: endTime,
      service_type: serviceType,
      is_recurring: false,
      status: 'GEPLANT',
    }
    if (address) body.address = address
    if (zipCode) body.zip_code = zipCode
    if (notes) body.notes = notes

    try {
      const res = await fetch('/api/einsatzplanung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json()
      if (!res.ok) {
        setErr(result.error || 'Fehler beim Speichern')
        setSaving(false)
        return
      }
      onSaved()
    } catch {
      setErr('Netzwerkfehler')
      setSaving(false)
    }
  }

  return (
    <DialogOverlay onClose={onClose}>
      <div role="dialog" aria-label="Neuen Einsatz anlegen" aria-modal="true" className="admin-modal" style={{ maxWidth: 520, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>Neuen Einsatz anlegen</h3>
        {err && <Banner tone="danger">{err}</Banner>}
        <Field label="Klient *">
          <select value={clientId} onChange={e => setClientId(e.target.value)} style={modalSelect}>
            <option value="">— wählen —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Betreuungskraft *">
          <select value={caregiverId} onChange={e => setCaregiverId(e.target.value)} style={modalSelect}>
            <option value="">— wählen —</option>
            {caregivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Leistungsart">
          <select value={serviceType} onChange={e => setServiceType(e.target.value)} style={modalSelect}>
            {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Datum *">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={modalInput} />
        </Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Von *"><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={modalInput} /></Field>
          <Field label="Bis *"><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={modalInput} /></Field>
        </div>
        <Field label="Adresse (optional)">
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Musterstr. 1, Frankfurt" style={modalInput} />
        </Field>
        <Field label="PLZ (optional)">
          <input value={zipCode} onChange={e => setZipCode(e.target.value)} placeholder="60311" maxLength={5} style={modalInput} />
        </Field>
        <Field label="Notizen (optional)">
          <input value={notes} onChange={e => setNotes(e.target.value)} style={modalInput} />
        </Field>
        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose}>Abbrechen</button>
          <button className="btn-confirm" onClick={save} disabled={saving}>{saving ? 'Speichern…' : 'Einsatz anlegen'}</button>
        </div>
      </div>
    </DialogOverlay>
  )
}

// ═══════════════════════════════════════════════════════════════
// Formular-Feld Wrapper (gleich wie schedule page)
// ═══════════════════════════════════════════════════════════════
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', flex: 1, minWidth: 0, marginBottom: 10}}>
      <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{label}</span>
      <div style={{ marginTop: 3 }}>{children}</div>
    </label>
  )
}

// ═══════════════════════════════════════════════════════════════
// Inline-Styles (identisch mit schedule page)
// ═══════════════════════════════════════════════════════════════
const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const navBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--ink3)', background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit',
}
const viewToggleBtn: React.CSSProperties = {
  fontSize: 13, border: '1px solid var(--border)', padding: '6px 14px',
  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
}
const filterSelect: React.CSSProperties = {
  padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 13, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', cursor: 'pointer',
}
const modalInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box', marginBottom: 0,
}
const modalSelect: React.CSSProperties = { ...modalInput }
