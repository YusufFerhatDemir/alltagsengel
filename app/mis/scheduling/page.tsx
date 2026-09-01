'use client'
import { datumBerlin } from '@/lib/utils/timezone';
import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, MisButton, SearchInput, Badge, Tabs, EmptyState, Modal } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'
import { useMis } from '@/lib/mis/MisContext'
import { createShift, assignShift, updateShiftStatus, deleteShift, createAvailability, deleteAvailability } from './actions'
import { logger } from '@/lib/logger';
import { klickbar } from '@/lib/a11y'
const log = logger.child('mis:scheduling');

// ===== Typen & Konstanten =====
const SHIFT_TYPES: Record<string, { label: string; color: string; zeit: string }> = {
  vormittag:    { label: 'Vormittag',     color: '#3B82F6', zeit: '08:00–12:00' },
  nachmittag:   { label: 'Nachmittag',    color: '#8B5CF6', zeit: '13:00–17:00' },
  ganztag:      { label: 'Ganztag',       color: '#F59E0B', zeit: '08:00–17:00' },
  krankenfahrt: { label: 'Krankenfahrt',  color: '#EF4444', zeit: 'Flexibel' },
}

const SHIFT_STATUS: Record<string, { label: string; color: string }> = {
  offen:         { label: 'Offen',         color: '#F59E0B' },
  zugewiesen:    { label: 'Zugewiesen',    color: '#3B82F6' },
  abgeschlossen: { label: 'Abgeschlossen', color: '#22C55E' },
  storniert:     { label: 'Storniert',     color: '#6B7280' },
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const WEEKDAY_FULL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

interface Shift {
  id: string
  engel_id: string | null
  engel_name: string
  kunde_id: string | null
  kunde_name: string
  datum: string
  start_zeit: string
  end_zeit: string
  typ: string
  status: string
  notizen: string
  created_at: string
}

interface Availability {
  id: string
  engel_id: string
  engel_name: string
  wochentag: number
  von: string
  bis: string
  wiederholend: boolean
  gueltig_ab: string | null
  gueltig_bis: string | null
}

// ===== Hilfsfunktionen =====
function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.getFullYear(), d.getMonth(), diff)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function fmtDate(d: Date): string {
  return datumBerlin(d)
}

function fmtDateDE(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtTime(t: string): string {
  return t?.slice(0, 5) || ''
}

function shiftHours(s: Shift): number {
  const [sh, sm] = s.start_zeit.split(':').map(Number)
  const [eh, em] = s.end_zeit.split(':').map(Number)
  return Math.max(0, (eh + em / 60) - (sh + sm / 60))
}

// ===== Konflikt-Erkennung =====
function detectConflicts(shifts: Shift[]): { id: string; type: string; message: string }[] {
  const conflicts: { id: string; type: string; message: string }[] = []
  const byEngel: Record<string, Shift[]> = {}

  shifts.filter(s => s.status !== 'storniert' && s.engel_name).forEach(s => {
    const key = s.engel_name
    if (!byEngel[key]) byEngel[key] = []
    byEngel[key].push(s)
  })

  for (const [engel, engelShifts] of Object.entries(byEngel)) {
    // Doppelbuchungen: gleicher Tag, überlappende Zeiten
    const byDate: Record<string, Shift[]> = {}
    engelShifts.forEach(s => {
      if (!byDate[s.datum]) byDate[s.datum] = []
      byDate[s.datum].push(s)
    })
    for (const [datum, dayShifts] of Object.entries(byDate)) {
      for (let i = 0; i < dayShifts.length; i++) {
        for (let j = i + 1; j < dayShifts.length; j++) {
          const a = dayShifts[i], b = dayShifts[j]
          if (a.start_zeit < b.end_zeit && b.start_zeit < a.end_zeit) {
            conflicts.push({
              id: a.id,
              type: 'doppelbuchung',
              message: `${engel}: Doppelbuchung am ${fmtDateDE(datum)} (${fmtTime(a.start_zeit)}–${fmtTime(a.end_zeit)} / ${fmtTime(b.start_zeit)}–${fmtTime(b.end_zeit)})`,
            })
          }
        }
      }
    }

    // Überstunden: > 40 Std/Woche
    const weekHours: Record<string, number> = {}
    engelShifts.forEach(s => {
      const mon = fmtDate(getMonday(new Date(s.datum)))
      weekHours[mon] = (weekHours[mon] || 0) + shiftHours(s)
    })
    for (const [week, hours] of Object.entries(weekHours)) {
      if (hours > 40) {
        conflicts.push({
          id: `overtime-${engel}-${week}`,
          type: 'ueberstunden',
          message: `${engel}: ${hours.toFixed(1)} Std in KW ${week} (> 40 Std)`,
        })
      }
    }
  }

  return conflicts
}

// ===== SCHICHTPLANUNG =====
export default function SchedulingPage() {
  const { isMobile } = useMis()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [availability, setAvailability] = useState<Availability[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('wochenplan')
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [search, setSearch] = useState('')

  // Modals
  const [createOpen, setCreateOpen] = useState(false)
  const [detailShift, setDetailShift] = useState<Shift | null>(null)
  const [assignOpen, setAssignOpen] = useState<Shift | null>(null)
  const [availForm, setAvailForm] = useState(false)

  // Formulare
  const [form, setForm] = useState({
    engel_name: '', kunde_name: '', datum: fmtDate(new Date()),
    start_zeit: '08:00', end_zeit: '12:00', typ: 'vormittag', notizen: '',
  })
  const [assignName, setAssignName] = useState('')
  const [availData, setAvailData] = useState({
    engel_name: '', wochentag: 1, von: '08:00', bis: '17:00', wiederholend: true,
  })

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const [shiftsRes, availRes] = await Promise.all([
        supabase.from('mis_shifts').select('*').order('datum', { ascending: true }),
        supabase.from('mis_availability').select('*').order('engel_name'),
      ])
      setShifts((shiftsRes.data as Shift[]) || [])
      setAvailability((availRes.data as Availability[]) || [])
    } catch (err) {
      log.errorWithException('Scheduling load error', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Typ ändert automatisch Zeiten
  function handleTypChange(typ: string) {
    const times: Record<string, [string, string]> = {
      vormittag: ['08:00', '12:00'],
      nachmittag: ['13:00', '17:00'],
      ganztag: ['08:00', '17:00'],
      krankenfahrt: ['09:00', '11:00'],
    }
    const [s, e] = times[typ] || ['08:00', '12:00']
    setForm(f => ({ ...f, typ, start_zeit: s, end_zeit: e }))
  }

  // CRUD
  async function handleCreate() {
    const result = await createShift({
      engel_name: form.engel_name || '',
      kunde_name: form.kunde_name,
      datum: form.datum,
      start_zeit: form.start_zeit,
      end_zeit: form.end_zeit,
      typ: form.typ,
      notizen: form.notizen,
    })
    if (result.ok) {
      setCreateOpen(false)
      setForm({ engel_name: '', kunde_name: '', datum: fmtDate(new Date()), start_zeit: '08:00', end_zeit: '12:00', typ: 'vormittag', notizen: '' })
      loadData()
    } else alert('Fehler: ' + result.error)
  }

  async function handleAssign() {
    if (!assignOpen) return
    await assignShift(assignOpen.id, assignName)
    setAssignOpen(null)
    setAssignName('')
    loadData()
  }

  async function handleStatusUpdate(id: string, status: string) {
    await updateShiftStatus(id, status)
    setDetailShift(null)
    loadData()
  }

  async function handleDeleteShift(id: string) {
    if (!confirm('Schicht wirklich löschen?')) return
    await deleteShift(id)
    setDetailShift(null)
    loadData()
  }

  async function handleCreateAvail() {
    const result = await createAvailability({
      engel_name: availData.engel_name,
      wochentag: availData.wochentag,
      von: availData.von,
      bis: availData.bis,
      wiederholend: availData.wiederholend,
    })
    if (result.ok) {
      setAvailForm(false)
      setAvailData({ engel_name: '', wochentag: 1, von: '08:00', bis: '17:00', wiederholend: true })
      loadData()
    } else alert('Fehler: ' + result.error)
  }

  async function handleDeleteAvail(id: string) {
    await deleteAvailability(id)
    loadData()
  }

  // Wochentage berechnen
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekShifts = shifts.filter(s => {
    const d = new Date(s.datum)
    return d >= weekStart && d < addDays(weekStart, 7)
  })

  // Einzigartige Engel für die Woche
  const weekEngel = [...new Set(weekShifts.map(s => s.engel_name).filter(Boolean))]
  if (weekEngel.length === 0) weekEngel.push('—')

  // Konflikte
  const conflicts = detectConflicts(shifts)

  // KPIs
  const thisWeekShifts = weekShifts.filter(s => s.status !== 'storniert')
  const offeneSchichten = thisWeekShifts.filter(s => s.status === 'offen').length
  const geplanteEinsaetze = thisWeekShifts.filter(s => s.status === 'zugewiesen' || s.status === 'abgeschlossen').length
  const totalHours = thisWeekShifts.reduce((sum, s) => sum + shiftHours(s), 0)
  const maxHours = weekEngel.filter(e => e !== '—').length * 40 || 1
  const auslastung = Math.min(100, Math.round((totalHours / maxHours) * 100))
  const ueberstunden = conflicts.filter(c => c.type === 'ueberstunden').length

  // Filter für Historie
  const filteredHistory = shifts.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.engel_name.toLowerCase().includes(q) || s.kunde_name.toLowerCase().includes(q) || s.typ.toLowerCase().includes(q)
  })

  // Tabs
  const tabs = [
    { id: 'wochenplan', label: 'Wochenplan' },
    { id: 'verfuegbarkeit', label: 'Engel-Verfügbarkeit' },
    { id: 'historie', label: 'Einsatzhistorie' },
  ]

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${BRAND.border}`,
    background: BRAND.light, color: BRAND.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionHeader
        title="Schichtplanung"
        subtitle="Einsätze planen, Verfügbarkeiten verwalten und Konflikte erkennen"
        icon="calendar"
        actions={
          <MisButton icon="plus" onClick={() => setCreateOpen(true)}>
            Neue Schicht
          </MisButton>
        }
      />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16 }}>
        {[
          { label: 'Geplante Einsätze', value: geplanteEinsaetze, icon: 'check', color: BRAND.success },
          { label: 'Unbesetzte Schichten', value: offeneSchichten, icon: 'clock', color: BRAND.warning },
          { label: 'Auslastung', value: `${auslastung}%`, icon: 'activity', color: BRAND.info },
          { label: 'Überstunden-Warnungen', value: ueberstunden, icon: 'alert', color: BRAND.error },
        ].map((kpi, i) => (
          <Card key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${kpi.color}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: kpi.color,
              }}>
                <MIcon name={kpi.icon} size={18} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: BRAND.text }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: BRAND.muted }}>{kpi.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Konflikte */}
      {conflicts.length > 0 && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ color: BRAND.error }}><MIcon name="alert" size={18} /></span>
            <span style={{ fontWeight: 700, color: BRAND.error, fontSize: 14 }}>
              {conflicts.length} Konflikt{conflicts.length > 1 ? 'e' : ''} erkannt
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {conflicts.slice(0, 5).map((c, i) => (
              <div key={i} style={{
                padding: '8px 12px', borderRadius: 8,
                background: `${BRAND.error}10`, border: `1px solid ${BRAND.error}30`,
                fontSize: 12, color: BRAND.text,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Badge label={c.type === 'doppelbuchung' ? 'Doppelbuchung' : 'Überstunden'} color={BRAND.error} />
                <span>{c.message}</span>
              </div>
            ))}
            {conflicts.length > 5 && (
              <div style={{ fontSize: 12, color: BRAND.muted, paddingLeft: 4 }}>
                … und {conflicts.length - 5} weitere
              </div>
            )}
          </div>
        </Card>
      )}

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {loading ? (
        <Card><div style={{ textAlign: 'center', padding: 40, color: BRAND.muted }}>Lade Schichtplan...</div></Card>
      ) : (
        <>
          {/* ===== TAB: WOCHENPLAN ===== */}
          {activeTab === 'wochenplan' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Wochennavigation */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <MisButton variant="secondary" icon="chevronRight" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                  <span style={{ transform: 'scaleX(-1)', display: 'inline-block' }}>←</span> Vorherige
                </MisButton>
                <span style={{ fontSize: 15, fontWeight: 700, color: BRAND.text }}>
                  {weekDays[0].toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: 'short' })} — {weekDays[6].toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <MisButton variant="secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                  Nächste →
                </MisButton>
              </div>

              {/* Kalenderraster */}
              {isMobile ? (
                // Mobile: Tages-Liste
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {weekDays.map((day, di) => {
                    const dayStr = fmtDate(day)
                    const dayShifts = weekShifts.filter(s => s.datum === dayStr)
                    const isToday = dayStr === fmtDate(new Date())
                    return (
                      <Card key={di}>
                        <div style={{
                          fontWeight: 700, fontSize: 13, color: isToday ? BRAND.gold : BRAND.text,
                          marginBottom: 8, display: 'flex', justifyContent: 'space-between',
                        }}>
                          <span>{WEEKDAYS[day.getDay()]} {day.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })}</span>
                          {isToday && <Badge label="Heute" color={BRAND.gold} />}
                        </div>
                        {dayShifts.length === 0 ? (
                          <div style={{ fontSize: 12, color: BRAND.muted, fontStyle: 'italic' }}>Keine Schichten</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {dayShifts.map(s => (
                              <ShiftBlock key={s.id} shift={s} onClick={() => setDetailShift(s)} onAssign={() => { setAssignOpen(s); setAssignName('') }} />
                            ))}
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              ) : (
                // Desktop: Kalenderraster
                <Card noPad>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                      <thead>
                        <tr>
                          <th style={{ ...thStyle, width: 120 }}>Engel</th>
                          {weekDays.map((day, i) => {
                            const isToday = fmtDate(day) === fmtDate(new Date())
                            return (
                              <th key={i} style={{
                                ...thStyle,
                                background: isToday ? `${BRAND.gold}15` : 'transparent',
                                color: isToday ? BRAND.gold : BRAND.muted,
                              }}>
                                <div>{WEEKDAYS[day.getDay()]}</div>
                                <div style={{ fontSize: 11, fontWeight: 400 }}>
                                  {day.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })}
                                </div>
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Offene Schichten Zeile */}
                        <tr>
                          <td style={{ ...tdStyle, fontWeight: 600, fontSize: 12, color: BRAND.warning }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <MIcon name="clock" size={14} /> Offen
                            </div>
                          </td>
                          {weekDays.map((day, di) => {
                            const dayStr = fmtDate(day)
                            const openShifts = weekShifts.filter(s => s.datum === dayStr && s.status === 'offen')
                            return (
                              <td key={di} style={tdStyle}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {openShifts.map(s => (
                                    <ShiftBlock key={s.id} shift={s} compact onClick={() => setDetailShift(s)} onAssign={() => { setAssignOpen(s); setAssignName('') }} />
                                  ))}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                        {/* Pro Engel eine Zeile */}
                        {weekEngel.filter(e => e !== '—').map(engel => (
                          <tr key={engel}>
                            <td style={{ ...tdStyle, fontWeight: 600, fontSize: 12, color: BRAND.text }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <MIcon name="users" size={14} /> {engel}
                              </div>
                            </td>
                            {weekDays.map((day, di) => {
                              const dayStr = fmtDate(day)
                              const engelShifts = weekShifts.filter(s => s.datum === dayStr && s.engel_name === engel && s.status !== 'offen')
                              return (
                                <td key={di} style={tdStyle}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {engelShifts.map(s => (
                                      <ShiftBlock key={s.id} shift={s} compact onClick={() => setDetailShift(s)} />
                                    ))}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                        {weekEngel.filter(e => e !== '—').length === 0 && weekShifts.filter(s => s.status === 'offen').length === 0 && (
                          <tr>
                            <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: BRAND.muted, padding: 30, fontSize: 13 }}>
                              Keine Schichten in dieser Woche
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ===== TAB: VERFÜGBARKEIT ===== */}
          {activeTab === 'verfuegbarkeit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <MisButton icon="plus" onClick={() => setAvailForm(true)}>Verfügbarkeit eintragen</MisButton>
              </div>

              {availability.length === 0 ? (
                <EmptyState icon="calendar" title="Keine Verfügbarkeiten" description="Tragen Sie die Verfügbarkeiten der Engel ein, um die Schichtplanung zu optimieren." />
              ) : (
                <Card noPad>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Engel</th>
                          <th style={thStyle}>Wochentag</th>
                          <th style={thStyle}>Von</th>
                          <th style={thStyle}>Bis</th>
                          <th style={thStyle}>Wiederholend</th>
                          <th style={{ ...thStyle, width: 60 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {availability.map(a => (
                          <tr key={a.id} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                            <td style={tdStyle}>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{a.engel_name}</span>
                            </td>
                            <td style={tdStyle}>{WEEKDAY_FULL[a.wochentag]}</td>
                            <td style={tdStyle}>{fmtTime(a.von)}</td>
                            <td style={tdStyle}>{fmtTime(a.bis)}</td>
                            <td style={tdStyle}>
                              <Badge label={a.wiederholend ? 'Ja' : 'Nein'} color={a.wiederholend ? BRAND.success : BRAND.muted} />
                            </td>
                            <td style={tdStyle}>
                              <MisButton variant="danger" icon="trash" onClick={() => handleDeleteAvail(a.id)}>{''}</MisButton>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ===== TAB: EINSATZHISTORIE ===== */}
          {activeTab === 'historie' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SearchInput value={search} onChange={setSearch} placeholder="Engel, Kunde oder Typ suchen..." />

              {filteredHistory.length === 0 ? (
                <EmptyState icon="calendar" title="Keine Einsätze" description="Es wurden noch keine Schichten angelegt." />
              ) : (
                <Card noPad>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Datum</th>
                          <th style={thStyle}>Engel</th>
                          <th style={thStyle}>Kunde</th>
                          <th style={thStyle}>Typ</th>
                          <th style={thStyle}>Zeit</th>
                          <th style={thStyle}>Status</th>
                          <th style={{ ...thStyle, width: 80 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistory.slice(0, 50).map(s => (
                          <tr key={s.id} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                            <td style={tdStyle}>{fmtDateDE(s.datum)}</td>
                            <td style={{ ...tdStyle, fontWeight: 600 }}>{s.engel_name || '—'}</td>
                            <td style={tdStyle}>{s.kunde_name || '—'}</td>
                            <td style={tdStyle}>
                              <Badge label={SHIFT_TYPES[s.typ]?.label || s.typ} color={SHIFT_TYPES[s.typ]?.color || BRAND.muted} />
                            </td>
                            <td style={tdStyle}>{fmtTime(s.start_zeit)}–{fmtTime(s.end_zeit)}</td>
                            <td style={tdStyle}>
                              <Badge label={SHIFT_STATUS[s.status]?.label || s.status} color={SHIFT_STATUS[s.status]?.color || BRAND.muted} />
                            </td>
                            <td style={tdStyle}>
                              <MisButton variant="secondary" icon="eye" onClick={() => setDetailShift(s)}>{''}</MisButton>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {/* ===== MODAL: Neue Schicht ===== */}
      {createOpen && (
        <Modal open title="Neue Schicht anlegen" onClose={() => setCreateOpen(false)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="scheduling-schichttyp" style={labelStyle}>Schichttyp *</label>
              <select id="scheduling-schichttyp" style={inputStyle} value={form.typ} onChange={e => handleTypChange(e.target.value)}>
                {Object.entries(SHIFT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label} ({v.zeit})</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="scheduling-kunde-einsatzort" style={labelStyle}>Kunde / Einsatzort *</label>
                <input id="scheduling-kunde-einsatzort" style={inputStyle} value={form.kunde_name} onChange={e => setForm({ ...form, kunde_name: e.target.value })} placeholder="z.B. Frau Müller" />
              </div>
              <div>
                <label htmlFor="scheduling-engel-optional" style={labelStyle}>Engel (optional)</label>
                <input id="scheduling-engel-optional" style={inputStyle} value={form.engel_name} onChange={e => setForm({ ...form, engel_name: e.target.value })} placeholder="Leer = offene Schicht" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="scheduling-datum" style={labelStyle}>Datum *</label>
                <input id="scheduling-datum" style={inputStyle} type="date" value={form.datum} onChange={e => setForm({ ...form, datum: e.target.value })} />
              </div>
              <div>
                <label htmlFor="scheduling-von" style={labelStyle}>Von</label>
                <input id="scheduling-von" style={inputStyle} type="time" value={form.start_zeit} onChange={e => setForm({ ...form, start_zeit: e.target.value })} />
              </div>
              <div>
                <label htmlFor="scheduling-bis" style={labelStyle}>Bis</label>
                <input id="scheduling-bis" style={inputStyle} type="time" value={form.end_zeit} onChange={e => setForm({ ...form, end_zeit: e.target.value })} />
              </div>
            </div>
            <div>
              <label htmlFor="scheduling-notizen" style={labelStyle}>Notizen</label>
              <textarea id="scheduling-notizen" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.notizen} onChange={e => setForm({ ...form, notizen: e.target.value })} placeholder="Besonderheiten..." />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setCreateOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="plus" onClick={handleCreate} disabled={!form.kunde_name || !form.datum}>Schicht anlegen</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== MODAL: Schicht-Details ===== */}
      {detailShift && (
        <Modal open title={`Schicht: ${SHIFT_TYPES[detailShift.typ]?.label || detailShift.typ}`} onClose={() => setDetailShift(null)} width={500}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Kunde</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>{detailShift.kunde_name || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Engel</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: detailShift.engel_name ? BRAND.text : BRAND.warning }}>
                  {detailShift.engel_name || 'Nicht zugewiesen'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Datum</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{fmtDateDE(detailShift.datum)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Zeit</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{fmtTime(detailShift.start_zeit)} – {fmtTime(detailShift.end_zeit)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Typ</div>
                <Badge label={SHIFT_TYPES[detailShift.typ]?.label || detailShift.typ} color={SHIFT_TYPES[detailShift.typ]?.color || BRAND.muted} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Status</div>
                <Badge label={SHIFT_STATUS[detailShift.status]?.label || detailShift.status} color={SHIFT_STATUS[detailShift.status]?.color || BRAND.muted} />
              </div>
            </div>
            {detailShift.notizen && (
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Notizen</div>
                <div style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.6, padding: 12, background: BRAND.light, borderRadius: 8 }}>{detailShift.notizen}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {detailShift.status === 'offen' && (
                  <MisButton icon="users" onClick={() => { setAssignOpen(detailShift); setAssignName(''); setDetailShift(null) }}>Zuweisen</MisButton>
                )}
                {detailShift.status === 'zugewiesen' && (
                  <MisButton icon="check" onClick={() => handleStatusUpdate(detailShift.id, 'abgeschlossen')}>Abschließen</MisButton>
                )}
                {(detailShift.status === 'offen' || detailShift.status === 'zugewiesen') && (
                  <MisButton variant="secondary" icon="x" onClick={() => handleStatusUpdate(detailShift.id, 'storniert')}>Stornieren</MisButton>
                )}
              </div>
              <MisButton variant="danger" icon="trash" onClick={() => handleDeleteShift(detailShift.id)}>Löschen</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== MODAL: Quick-Assign ===== */}
      {assignOpen && (
        <Modal open title="Engel zuweisen" onClose={() => setAssignOpen(null)} width={400}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13, color: BRAND.muted }}>
              Schicht: <strong style={{ color: BRAND.text }}>{SHIFT_TYPES[assignOpen.typ]?.label}</strong> am{' '}
              <strong style={{ color: BRAND.text }}>{fmtDateDE(assignOpen.datum)}</strong> für{' '}
              <strong style={{ color: BRAND.text }}>{assignOpen.kunde_name}</strong>
            </div>

            {/* Verfügbare Engel für diesen Tag */}
            {(() => {
              const dayOfWeek = new Date(assignOpen.datum).getDay()
              const availableEngel = availability.filter(a => a.wochentag === dayOfWeek)
              if (availableEngel.length > 0) {
                return (
                  <div>
                    <div id="scheduling-verfuegbare-engel-label" style={labelStyle}>Verfügbare Engel an diesem Tag</div>
                    <div role="group" aria-labelledby="scheduling-verfuegbare-engel-label" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {availableEngel.map(a => {
                        const alreadyAssigned = shifts.some(s =>
                          s.datum === assignOpen.datum && s.engel_name === a.engel_name && s.status !== 'storniert' && s.id !== assignOpen.id
                        )
                        return (
                          <div role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (() => !alreadyAssigned && setAssignName(a.engel_name))() } }}
                            key={a.id}
                            onClick={() => !alreadyAssigned && setAssignName(a.engel_name)}
                            style={{
                              padding: '8px 12px', borderRadius: 8, cursor: alreadyAssigned ? 'not-allowed' : 'pointer',
                              border: `1px solid ${assignName === a.engel_name ? BRAND.gold : BRAND.border}`,
                              background: assignName === a.engel_name ? `${BRAND.gold}15` : alreadyAssigned ? `${BRAND.error}08` : 'transparent',
                              opacity: alreadyAssigned ? 0.5 : 1,
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}
                          >
                            <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>{a.engel_name}</span>
                            <span style={{ fontSize: 11, color: BRAND.muted }}>
                              {alreadyAssigned ? 'Bereits eingeteilt' : `${fmtTime(a.von)}–${fmtTime(a.bis)}`}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              }
              return null
            })()}

            <div>
              <label style={labelStyle}>Engel-Name {availability.length > 0 ? '(oder manuell eingeben)' : '*'}</label>
              <input style={inputStyle} value={assignName} onChange={e => setAssignName(e.target.value)} placeholder="Name des Engel" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setAssignOpen(null)}>Abbrechen</MisButton>
              <MisButton icon="check" onClick={handleAssign} disabled={!assignName}>Zuweisen</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== MODAL: Verfügbarkeit eintragen ===== */}
      {availForm && (
        <Modal open title="Verfügbarkeit eintragen" onClose={() => setAvailForm(false)} width={440}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="scheduling-engel-name" style={labelStyle}>Engel-Name *</label>
              <input id="scheduling-engel-name" style={inputStyle} value={availData.engel_name} onChange={e => setAvailData({ ...availData, engel_name: e.target.value })} placeholder="Name des Engel" />
            </div>
            <div>
              <label htmlFor="scheduling-wochentag" style={labelStyle}>Wochentag *</label>
              <select id="scheduling-wochentag" style={inputStyle} value={availData.wochentag} onChange={e => setAvailData({ ...availData, wochentag: parseInt(e.target.value) })}>
                {WEEKDAY_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="scheduling-von-2" style={labelStyle}>Von</label>
                <input id="scheduling-von-2" style={inputStyle} type="time" value={availData.von} onChange={e => setAvailData({ ...availData, von: e.target.value })} />
              </div>
              <div>
                <label htmlFor="scheduling-bis-2" style={labelStyle}>Bis</label>
                <input id="scheduling-bis-2" style={inputStyle} type="time" value={availData.bis} onChange={e => setAvailData({ ...availData, bis: e.target.value })} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={availData.wiederholend} onChange={e => setAvailData({ ...availData, wiederholend: e.target.checked })} />
              <span style={{ fontSize: 13, color: BRAND.text }}>Wöchentlich wiederholen</span>
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setAvailForm(false)}>Abbrechen</MisButton>
              <MisButton icon="plus" onClick={handleCreateAvail} disabled={!availData.engel_name}>Speichern</MisButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ===== Schicht-Block Komponente =====
function ShiftBlock({ shift, compact, onClick, onAssign }: {
  shift: Shift; compact?: boolean; onClick?: () => void; onAssign?: () => void
}) {
  const type = SHIFT_TYPES[shift.typ]
  const isOpen = shift.status === 'offen'
  return (
    <div
      {...(onClick ? { ...klickbar(onClick), 'aria-label': `Schicht ${fmtTime(shift.start_zeit)} bis ${fmtTime(shift.end_zeit)}` } : {})}
      style={{
        padding: compact ? '4px 6px' : '6px 10px',
        borderRadius: 6,
        background: `${type?.color || BRAND.muted}18`,
        borderLeft: `3px solid ${type?.color || BRAND.muted}`,
        cursor: 'pointer',
        fontSize: compact ? 11 : 12,
        color: BRAND.text,
        transition: 'all 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: compact ? 10 : 12 }}>
          {fmtTime(shift.start_zeit)}–{fmtTime(shift.end_zeit)}
        </span>
        {isOpen && onAssign && (
          <span
            {...klickbar(onAssign)}
            aria-label="Schicht zuweisen"
            onClick={e => { e.stopPropagation(); onAssign() }}
            style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 4,
              background: `${BRAND.gold}30`, color: BRAND.gold,
              cursor: 'pointer', fontWeight: 700,
            }}
          >
            Zuweisen
          </span>
        )}
      </div>
      <div style={{ fontSize: compact ? 10 : 11, color: BRAND.muted }}>
        {shift.kunde_name || type?.label}
      </div>
      {!compact && shift.engel_name && (
        <div style={{ fontSize: 11, color: BRAND.text, fontWeight: 500 }}>
          → {shift.engel_name}
        </div>
      )}
    </div>
  )
}

// ===== Shared Styles =====
const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  color: BRAND.muted, borderBottom: `1px solid ${BRAND.border}`,
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 13, color: BRAND.text,
  verticalAlign: 'top',
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block',
}
