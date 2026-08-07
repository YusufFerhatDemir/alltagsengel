'use client'
import { useEffect, useMemo, useState } from 'react'
import { statusMeta, formatTime, DIENSTPLAN_STATUS, DIENSTPLAN_TYP, WEEKDAYS } from '@/lib/admin/ops'
import { StatusBadge, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface Eintrag {
  id: string
  datum: string
  caregiver_name: string
  caregiver_id: string
  beginn: string
  ende: string
  status: string
  typ: string
  schicht_farbe: string | null
  konflikt: boolean
  kunde_name: string | null
  bemerkung: string | null
}

interface CreateForm {
  datum: string
  caregiver_id: string
  beginn: string
  ende: string
  typ: string
  bemerkung: string
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatISO(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export default function DienstplanPage() {
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()))
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<CreateForm>({
    datum: '', caregiver_id: '', beginn: '08:00', ende: '16:00', typ: 'regulaer', bemerkung: '',
  })

  const weekEnd = addDays(weekStart, 6)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const von = formatISO(weekStart)
        const bis = formatISO(weekEnd)
        const res = await fetch(`/api/personal/dienstplan/eintraege?datumVon=${von}&datumBis=${bis}`)
        if (!res.ok) { console.error('Dienstplan laden fehlgeschlagen'); setLoading(false); return }
        const data = await res.json()
        setEintraege((data.eintraege || data || []).map((r: any) => ({
          id: r.id,
          datum: r.datum || r.date,
          caregiver_name: r.caregiver_name || r.mitarbeiter || '—',
          caregiver_id: r.caregiver_id,
          beginn: r.beginn || r.start_time || '',
          ende: r.ende || r.end_time || '',
          status: r.status || 'geplant',
          typ: r.typ || r.type || 'regulaer',
          schicht_farbe: r.schicht_farbe || r.shift_color || null,
          konflikt: r.konflikt ?? r.conflict ?? false,
          kunde_name: r.kunde_name || r.client_name || null,
          bemerkung: r.bemerkung || r.notes || null,
        })))
      } catch (err) {
        console.error('Dienstplan laden fehlgeschlagen', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [weekStart])

  // Group entries by date
  const days = useMemo(() => {
    const map = new Map<string, Eintrag[]>()
    for (let i = 0; i < 7; i++) {
      const d = formatISO(addDays(weekStart, i))
      map.set(d, [])
    }
    for (const e of eintraege) {
      const existing = map.get(e.datum)
      if (existing) existing.push(e)
    }
    return map
  }, [eintraege, weekStart])

  const conflicts = eintraege.filter(e => e.konflikt)

  async function createEintrag() {
    if (!form.datum || !form.beginn || !form.ende) return
    setCreating(true)
    try {
      const res = await fetch('/api/personal/dienstplan/eintraege', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setShowCreate(false)
        setForm({ datum: '', caregiver_id: '', beginn: '08:00', ende: '16:00', typ: 'regulaer', bemerkung: '' })
        // Reload
        const von = formatISO(weekStart)
        const bis = formatISO(weekEnd)
        const reload = await fetch(`/api/personal/dienstplan/eintraege?datumVon=${von}&datumBis=${bis}`)
        if (reload.ok) {
          const data = await reload.json()
          setEintraege((data.eintraege || data || []).map((r: any) => ({
            id: r.id, datum: r.datum || r.date,
            caregiver_name: r.caregiver_name || r.mitarbeiter || '—',
            caregiver_id: r.caregiver_id,
            beginn: r.beginn || r.start_time || '',
            ende: r.ende || r.end_time || '',
            status: r.status || 'geplant', typ: r.typ || r.type || 'regulaer',
            schicht_farbe: r.schicht_farbe || r.shift_color || null,
            konflikt: r.konflikt ?? r.conflict ?? false,
            kunde_name: r.kunde_name || r.client_name || null,
            bemerkung: r.bemerkung || r.notes || null,
          })))
        }
      }
    } catch (err) {
      console.error('Eintrag erstellen fehlgeschlagen', err)
    } finally {
      setCreating(false)
    }
  }

  const weekLabel = `${weekStart.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} – ${weekEnd.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Dienstplan</h1>
          <p className="admin-subtitle">Wochenansicht — {eintraege.length} Eintr&auml;ge</p>
        </div>
        <button style={primaryBtn} onClick={() => setShowCreate(!showCreate)}>
          + Neuer Eintrag
        </button>
      </div>

      {conflicts.length > 0 && (
        <Banner tone="danger">
          <strong>{conflicts.length} Konflikte</strong> in dieser Woche erkannt.
        </Banner>
      )}

      {/* Week navigation */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
      }}>
        <button style={secondaryBtn} onClick={() => setWeekStart(addDays(weekStart, -7))}>
          &larr; Vorherige
        </button>
        <span style={{ fontWeight: 600, fontSize: 15, minWidth: 200, textAlign: 'center' }}>
          KW {getISOWeek(weekStart)} — {weekLabel}
        </span>
        <button style={secondaryBtn} onClick={() => setWeekStart(addDays(weekStart, 7))}>
          N&auml;chste &rarr;
        </button>
        <button style={{ ...secondaryBtn, marginLeft: 8 }} onClick={() => setWeekStart(getMondayOfWeek(new Date()))}>
          Heute
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{
          background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 16, marginBottom: 16,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Neuer Dienstplan-Eintrag</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ fontSize: 13 }}>
              Datum<br />
              <input type="date" value={form.datum} onChange={e => setForm({ ...form, datum: e.target.value })}
                style={inputStyle} />
            </label>
            <label style={{ fontSize: 13 }}>
              Mitarbeiter-ID<br />
              <input type="text" value={form.caregiver_id} onChange={e => setForm({ ...form, caregiver_id: e.target.value })}
                placeholder="UUID" style={inputStyle} />
            </label>
            <label style={{ fontSize: 13 }}>
              Beginn<br />
              <input type="time" value={form.beginn} onChange={e => setForm({ ...form, beginn: e.target.value })}
                style={inputStyle} />
            </label>
            <label style={{ fontSize: 13 }}>
              Ende<br />
              <input type="time" value={form.ende} onChange={e => setForm({ ...form, ende: e.target.value })}
                style={inputStyle} />
            </label>
            <label style={{ fontSize: 13 }}>
              Typ<br />
              <select value={form.typ} onChange={e => setForm({ ...form, typ: e.target.value })} style={inputStyle}>
                {Object.entries(DIENSTPLAN_TYP).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              Bemerkung<br />
              <input type="text" value={form.bemerkung} onChange={e => setForm({ ...form, bemerkung: e.target.value })}
                placeholder="Optional" style={inputStyle} />
            </label>
            <button style={primaryBtn} onClick={createEintrag} disabled={creating}>
              {creating ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </div>
      )}

      {/* 7-column grid */}
      {loading ? <p>Laden...</p> : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8,
          minHeight: 400,
        }}>
          {Array.from(days.entries()).map(([date, entries], i) => {
            const wd = WEEKDAYS[i]
            const isToday = date === formatISO(new Date())
            return (
              <div key={date} style={{
                background: isToday ? 'rgba(201,150,60,.08)' : 'var(--coal2)',
                border: isToday ? '2px solid var(--gold)' : '1px solid var(--border)',
                borderRadius: 12, padding: 8, minHeight: 120,
              }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.05em', color: isToday ? 'var(--gold)' : 'var(--ink4)',
                  marginBottom: 8, textAlign: 'center',
                }}>
                  {wd.short} {new Date(date + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                </div>
                {entries.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--ink4)', textAlign: 'center', padding: 8 }}>—</div>
                ) : entries.map(e => {
                  const sm = statusMeta(DIENSTPLAN_STATUS, e.status)
                  return (
                    <div key={e.id} style={{
                      background: e.konflikt
                        ? 'rgba(208,75,59,.12)'
                        : e.schicht_farbe
                          ? `${e.schicht_farbe}22`
                          : 'var(--coal3)',
                      border: e.konflikt ? '1px solid rgba(208,75,59,.4)' : '1px solid transparent',
                      borderRadius: 8, padding: '6px 8px', marginBottom: 6, fontSize: 12,
                      borderLeft: e.schicht_farbe ? `3px solid ${e.schicht_farbe}` : undefined,
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{e.caregiver_name}</div>
                      <div style={{ color: 'var(--ink4)' }}>
                        {formatTime(e.beginn)} – {formatTime(e.ende)}
                      </div>
                      {e.kunde_name && (
                        <div style={{ color: 'var(--ink4)', fontSize: 11 }}>{e.kunde_name}</div>
                      )}
                      <div style={{ marginTop: 4 }}>
                        <StatusBadge label={sm.label} color={sm.color} />
                      </div>
                      {e.konflikt && (
                        <div style={{ color: '#D04B3B', fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                          Konflikt
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal3)', color: 'var(--ink)', fontSize: 14,
  fontFamily: "'Jost',sans-serif", marginTop: 4,
}

function getISOWeek(d: Date): number {
  const date = new Date(d.getTime())
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
  const week1 = new Date(date.getFullYear(), 0, 4)
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}
