'use client'
import { datumBerlin, heuteBerlin } from '@/lib/utils/timezone';
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate, formatTime, fullName, statusMeta, daysUntil,
  ABSENCE_TYPE, SUBSTITUTION_STATUS, ESCALATION_LEVELS, WEEKDAYS, normalizeWeekday,
} from '@/lib/admin/ops'
import { StatusBadge, Banner, EmptyRow } from '@/components/admin/OpsUI'

// ── Datums-Helfer für die laufende Woche ────────────────────────
function mondayOfWeek(base: Date): Date {
  const d = new Date(base)
  const day = d.getDay() // 0=So..6=Sa
  const diff = day === 0 ? -6 : 1 - day // zurück zum Montag
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}
function isoDate(d: Date): string { return datumBerlin(d) }
// Datum eines Wochentags (JS-Konvention 0=So) in der angegebenen Woche
function dateForWeekday(monday: Date, weekday: number): Date {
  const offset = weekday === 0 ? 6 : weekday - 1 // Mo=0 … So=6
  const d = new Date(monday)
  d.setDate(d.getDate() + offset)
  return d
}

interface Caregiver {
  id: string; name: string; city: string | null; languages: string[]
  status: string; emergency_pool: boolean; has_vehicle: boolean
}
interface Client { id: string; name: string; city: string | null }
interface Assignment {
  id: string; client_id: string; caregiver_id: string; weekday: number | null
  start_time: string | null; end_time: string | null; service_type: string | null; status: string
}
interface Absence {
  id: string; caregiver_id: string; caregiver: string; absence_type: string
  start_date: string; end_date: string | null; reason: string | null
}
interface SubRequest {
  id: string; client_id: string; client: string; original_caregiver_id: string | null
  original: string; substitute_caregiver_id: string | null; substitute: string | null
  date: string; start_time: string | null; end_time: string | null; service_type: string | null
  status: string; escalation_level: number; client_notified: boolean; notes: string | null
}

export default function AdminSchedulePage() {
  const [caregivers, setCaregivers] = useState<Caregiver[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [absences, setAbsences] = useState<Absence[]>([])
  const [requests, setRequests] = useState<SubRequest[]>([])
  const [preferred, setPreferred] = useState<{ client_id: string; caregiver_id: string; priority: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [reportAbsence, setReportAbsence] = useState(false)
  const [createSub, setCreateSub] = useState(false)
  const [createAssignment, setCreateAssignment] = useState(false)
  const [suggestFor, setSuggestFor] = useState<SubRequest | null>(null)

  const monday = useMemo(() => {
    const m = mondayOfWeek(new Date())
    m.setDate(m.getDate() + weekOffset * 7)
    return m
  }, [weekOffset])

  const load = useCallback(async () => {
    try {
      const supabase = createClient()
      const today = isoDate(new Date())
      const [cgRes, clRes, asRes, abRes, srRes, prRes] = await Promise.all([
        supabase.from('caregivers').select('id, first_name, last_name, city, languages, status, emergency_pool, has_vehicle'),
        supabase.from('clients').select('id, first_name, last_name, city'),
        supabase.from('assignments').select('*'),
        supabase.from('absences').select('id, caregiver_id, absence_type, start_date, end_date, reason, caregiver:caregivers(first_name, last_name)').gte('end_date', today).order('start_date'),
        supabase.from('substitution_requests').select('id, client_id, original_caregiver_id, substitute_caregiver_id, date, start_time, end_time, service_type, status, escalation_level, client_notified, notes, client:clients(first_name, last_name)').order('date', { ascending: false }),
        supabase.from('client_preferred_substitutes').select('client_id, caregiver_id, priority'),
      ])
      const cgNameMap = new Map<string, string>()
      ;(cgRes.data || []).forEach((c: any) => cgNameMap.set(c.id, fullName(c)))
      setCaregivers((cgRes.data || []).map((c: any) => ({
        id: c.id, name: fullName(c), city: c.city, languages: Array.isArray(c.languages) ? c.languages : [],
        status: c.status || 'active', emergency_pool: !!c.emergency_pool, has_vehicle: !!c.has_vehicle,
      })))
      setClients((clRes.data || []).map((c: any) => ({ id: c.id, name: fullName(c), city: c.city })))
      setAssignments((asRes.data || []) as Assignment[])
      setAbsences((abRes.data || []).map((a: any) => ({
        id: a.id, caregiver_id: a.caregiver_id, caregiver: fullName(a.caregiver), absence_type: a.absence_type,
        start_date: a.start_date, end_date: a.end_date, reason: a.reason,
      })))
      setRequests((srRes.data || []).map((s: any) => ({
        id: s.id, client_id: s.client_id, client: fullName(s.client), original_caregiver_id: s.original_caregiver_id,
        original: s.original_caregiver_id ? (cgNameMap.get(s.original_caregiver_id) || '—') : '—',
        substitute_caregiver_id: s.substitute_caregiver_id, substitute: s.substitute_caregiver_id ? (cgNameMap.get(s.substitute_caregiver_id) || '—') : null,
        date: s.date, start_time: s.start_time, end_time: s.end_time, service_type: s.service_type,
        status: s.status || 'open', escalation_level: s.escalation_level ?? 0, client_notified: !!s.client_notified, notes: s.notes,
      })))
      setPreferred((prRes.data || []) as any)
    } catch (err) {
      console.error('Schedule load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Ist eine Kraft an einem Datum abwesend?
  const isAbsent = useCallback((caregiverId: string, dateStr: string) => {
    return absences.some(a => a.caregiver_id === caregiverId && a.start_date <= dateStr && (a.end_date ?? a.start_date) >= dateStr)
  }, [absences])

  const cgById = useMemo(() => new Map(caregivers.map(c => [c.id, c])), [caregivers])
  const clById = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])

  // Wochenübersicht: Einsätze pro Wochentag
  const board = useMemo(() => {
    return WEEKDAYS.map(wd => {
      const date = dateForWeekday(monday, wd.n)
      const dateStr = isoDate(date)
      const items = assignments
        .filter(a => normalizeWeekday(a.weekday) === wd.n && a.status !== 'cancelled')
        .map(a => ({
          ...a,
          caregiver: cgById.get(a.caregiver_id)?.name || '—',
          client: clById.get(a.client_id)?.name || '—',
          absent: isAbsent(a.caregiver_id, dateStr),
        }))
        .sort((x, y) => (x.start_time || '').localeCompare(y.start_time || ''))
      return { wd, date, dateStr, items }
    })
  }, [assignments, monday, cgById, clById, isAbsent])

  // Statistiken
  const stats = useMemo(() => {
    const sick = absences.filter(a => a.absence_type === 'sick').length
    const vacation = absences.filter(a => a.absence_type === 'vacation').length
    const openReq = requests.filter(r => ['open', 'searching', 'escalated', 'proposed'].includes(r.status)).length
    const resolved = requests.filter(r => ['filled', 'external'].includes(r.status)).length
    const failed = requests.filter(r => r.status === 'failed').length
    const totalClosed = resolved + failed
    const successRate = totalClosed > 0 ? Math.round((resolved / totalClosed) * 100) : null
    const poolSize = caregivers.filter(c => c.emergency_pool).length
    return { sick, vacation, openReq, resolved, failed, successRate, poolSize }
  }, [absences, requests, caregivers])

  // Notfall-Pool: heute verfügbar?
  const pool = useMemo(() => {
    const today = isoDate(new Date())
    return caregivers.filter(c => c.emergency_pool).map(c => ({ ...c, availableToday: !isAbsent(c.id, today) }))
  }, [caregivers, isAbsent])

  async function escalate(req: SubRequest) {
    const supabase = createClient()
    const newLevel = Math.min((req.escalation_level ?? 0) + 1, 2)
    const newStatus = newLevel >= 2 ? 'external' : 'escalated'
    await supabase.from('substitution_requests').update({ escalation_level: newLevel, status: newStatus }).eq('id', req.id)
    load()
  }
  async function markFailed(req: SubRequest) {
    const supabase = createClient()
    await supabase.from('substitution_requests').update({ status: 'failed' }).eq('id', req.id)
    load()
  }
  async function notifyClient(req: SubRequest) {
    const supabase = createClient()
    await supabase.from('substitution_requests').update({ client_notified: !req.client_notified }).eq('id', req.id)
    load()
  }

  const weekLabel = `${formatDate(isoDate(monday))} – ${formatDate(isoDate(dateForWeekday(monday, 0)))}`

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Einsatzplanung & Ausfallmanagement</h1>
          <p className="admin-subtitle">Wochenübersicht, Ausfälle und Vertretungssuche</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setCreateAssignment(true)} style={primaryBtn}>+ Einsatz anlegen</button>
          <button onClick={() => setReportAbsence(true)} style={secondaryBtn}>+ Ausfall melden</button>
          <button onClick={() => setCreateSub(true)} style={secondaryBtn}>+ Vertretung anlegen</button>
        </div>
      </div>

      {/* Statistiken */}
      <div className="admin-stats-grid" style={{ marginBottom: 8 }}>
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #D04B3B' }}>
          <div className="admin-stat-value">{stats.sick}</div>
          <div className="admin-stat-label">Krankmeldungen</div>
        </div>
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #2196F3' }}>
          <div className="admin-stat-value">{stats.vacation}</div>
          <div className="admin-stat-label">Im Urlaub</div>
        </div>
        <div className="admin-stat-card accent">
          <div className="admin-stat-value">{stats.openReq}</div>
          <div className="admin-stat-label">Offene Vertretungen</div>
        </div>
        <div className="admin-stat-card success">
          <div className="admin-stat-value">{stats.successRate != null ? `${stats.successRate}%` : '—'}</div>
          <div className="admin-stat-label">Erfolgreich besetzt</div>
        </div>
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #FF7043' }}>
          <div className="admin-stat-value">{stats.poolSize}</div>
          <div className="admin-stat-label">Notfall-Pool</div>
        </div>
      </div>

      {loading ? <p>Laden…</p> : (
        <>
          {/* Wochenübersicht */}
          <h2 style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
            Wochenübersicht
            <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>{weekLabel}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={() => setWeekOffset(w => w - 1)} style={navBtn}>←</button>
              <button onClick={() => setWeekOffset(0)} style={navBtn}>Heute</button>
              <button onClick={() => setWeekOffset(w => w + 1)} style={navBtn}>→</button>
            </span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(150px, 1fr))', gap: 10, overflowX: 'auto' }}>
            {board.map(col => {
              const isToday = col.dateStr === isoDate(new Date())
              return (
                <div key={col.wd.n} style={{
                  background: 'var(--coal2)', border: `1px solid ${isToday ? 'var(--gold2)' : 'var(--border)'}`,
                  borderRadius: 12, padding: 10, minHeight: 120,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isToday ? 'var(--gold2)' : 'var(--ink3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                    {col.wd.short} · {col.date.getDate()}.{col.date.getMonth() + 1}.
                  </div>
                  {col.items.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--ink5)' }}>—</div>
                  ) : col.items.map(it => (
                    <div key={it.id} style={{
                      background: it.absent ? 'rgba(208,75,59,.12)' : 'var(--coal3)',
                      border: `1px solid ${it.absent ? 'rgba(208,75,59,.4)' : 'var(--border)'}`,
                      borderRadius: 8, padding: '6px 8px', marginBottom: 6, fontSize: 12,
                    }}>
                      <div style={{ fontWeight: 600, color: it.absent ? '#D04B3B' : 'var(--ink2)' }}>
                        {formatTime(it.start_time)}–{formatTime(it.end_time)}
                        {it.absent && <span title="Kraft fällt aus" style={{ marginLeft: 4 }}>⚠️</span>}
                      </div>
                      <div style={{ color: 'var(--gold2)' }}>{it.caregiver}</div>
                      <div style={{ color: 'var(--ink4)' }}>→ {it.client}</div>
                      {it.service_type && <div style={{ color: 'var(--ink5)', fontSize: 11 }}>{it.service_type}</div>}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {/* Ausfälle */}
          <h2 style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
            Aktuelle & kommende Ausfälle
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>({absences.length})</span>
          </h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Art</th><th>Betreuungskraft</th><th>Von</th><th>Bis</th><th>Grund</th></tr></thead>
              <tbody>
                {absences.length === 0 ? <EmptyRow colSpan={5}>Keine Ausfälle 🎉</EmptyRow> : absences.map(a => {
                  const m = statusMeta(ABSENCE_TYPE, a.absence_type)
                  return (
                    <tr key={a.id}>
                      <td><StatusBadge label={m.label} color={m.color} /></td>
                      <td style={{ fontWeight: 600 }}>{a.caregiver}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(a.start_date)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(a.end_date)}</td>
                      <td style={{ fontSize: 13 }}>{a.reason || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Vertretungsanfragen */}
          <h2 style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
            Vertretungsanfragen
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>({requests.length})</span>
          </h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Datum</th><th>Klient</th><th>Ausgefallen</th><th>Vertretung</th><th>Eskalation</th><th>Status</th><th>Aktion</th></tr></thead>
              <tbody>
                {requests.length === 0 ? <EmptyRow colSpan={7}>Keine Vertretungsanfragen</EmptyRow> : requests.map(r => {
                  const sm = statusMeta(SUBSTITUTION_STATUS, r.status)
                  const esc = ESCALATION_LEVELS[r.escalation_level] || ESCALATION_LEVELS[0]
                  const closed = ['filled', 'external', 'cancelled', 'failed'].includes(r.status)
                  return (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                        {formatDate(r.date)}<br /><span style={{ color: 'var(--ink5)', fontSize: 11 }}>{formatTime(r.start_time)}–{formatTime(r.end_time)}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{r.client}</td>
                      <td style={{ fontSize: 13 }}>{r.original || '—'}</td>
                      <td style={{ fontSize: 13, color: r.substitute ? '#5CB882' : 'var(--ink5)' }}>{r.substitute || '—'}</td>
                      <td><span title={esc.label} style={{ fontSize: 12, color: esc.color }}>{esc.emoji} {esc.label}</span></td>
                      <td>
                        <StatusBadge label={sm.label} color={sm.color} />
                        {r.client_notified && <span title="Klient informiert" style={{ marginLeft: 4 }}>📞</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {!closed && <button onClick={() => setSuggestFor(r)} style={actionBtn}>Vertretung suchen</button>}
                          {!closed && r.escalation_level < 2 && <button onClick={() => escalate(r)} style={escBtn}>Eskalieren</button>}
                          {!closed && <button onClick={() => notifyClient(r)} style={subtleBtn}>{r.client_notified ? 'Info ✓' : 'Klient info'}</button>}
                          {!closed && <button onClick={() => markFailed(r)} style={rejectBtn}>Nicht besetzbar</button>}
                          {closed && <span style={{ color: 'var(--ink5)', fontSize: 12 }}>—</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Notfall-Pool */}
          <h2 style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
            Notfall-Pool <span style={{ fontSize: 18 }}>🚨</span>
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>({pool.length})</span>
          </h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Betreuungskraft</th><th>Ort</th><th>Sprachen</th><th>Fahrzeug</th><th>Heute</th></tr></thead>
              <tbody>
                {pool.length === 0 ? <EmptyRow colSpan={5}>Niemand im Notfall-Pool hinterlegt</EmptyRow> : pool.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td style={{ fontSize: 13 }}>{c.city || '—'}</td>
                    <td style={{ fontSize: 13 }}>{c.languages.length ? c.languages.join(', ') : '—'}</td>
                    <td style={{ fontSize: 16 }}>{c.has_vehicle ? '🚗' : '—'}</td>
                    <td>{c.availableToday ? <StatusBadge label="Verfügbar" color="#5CB882" /> : <StatusBadge label="Ausgefallen" color="#D04B3B" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {createAssignment && <CreateAssignmentModal clients={clients} caregivers={caregivers} onClose={() => setCreateAssignment(false)} onSaved={() => { setCreateAssignment(false); load() }} />}
      {reportAbsence && <ReportAbsenceModal caregivers={caregivers} onClose={() => setReportAbsence(false)} onSaved={() => { setReportAbsence(false); load() }} />}
      {createSub && <CreateSubModal clients={clients} caregivers={caregivers} onClose={() => setCreateSub(false)} onSaved={() => { setCreateSub(false); load() }} />}
      {suggestFor && (
        <SuggestModal
          request={suggestFor}
          caregivers={caregivers}
          client={clById.get(suggestFor.client_id) || null}
          preferred={preferred.filter(p => p.client_id === suggestFor.client_id)}
          isAbsent={isAbsent}
          onClose={() => setSuggestFor(null)}
          onAssigned={() => { setSuggestFor(null); load() }}
        />
      )}
    </div>
  )
}

// ═══ Vertretungssuche mit automatischen Vorschlägen ═══
function SuggestModal({ request, caregivers, client, preferred, isAbsent, onClose, onAssigned }: {
  request: SubRequest; caregivers: Caregiver[]; client: Client | null
  preferred: { client_id: string; caregiver_id: string; priority: number }[]
  isAbsent: (cgId: string, date: string) => boolean
  onClose: () => void; onAssigned: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const prefMap = useMemo(() => new Map(preferred.map(p => [p.caregiver_id, p.priority])), [preferred])

  // Scoring: Wunschvertretung, Wohnort, Notfall-Pool, Verfügbarkeit, Fahrzeug
  const ranked = useMemo(() => {
    return caregivers
      .filter(c => c.id !== request.original_caregiver_id)
      .map(c => {
        const reasons: string[] = []
        let score = 0
        const absent = isAbsent(c.id, request.date)
        const pref = prefMap.get(c.id)
        if (pref != null) { score += 100 - pref; reasons.push(`Wunschvertretung (Prio ${pref})`) }
        if (client?.city && c.city && client.city.toLowerCase() === c.city.toLowerCase()) { score += 30; reasons.push('gleicher Ort') }
        if (c.emergency_pool) { score += 20; reasons.push('Notfall-Pool') }
        if (c.status === 'available') { score += 10; reasons.push('verfügbar') }
        else if (c.status === 'active') { score += 5 }
        if (c.has_vehicle) { score += 5; reasons.push('Fahrzeug') }
        return { c, score, reasons, absent }
      })
      .filter(x => x.score > 0 || !x.absent)
      .sort((a, b) => {
        if (a.absent !== b.absent) return a.absent ? 1 : -1
        return b.score - a.score
      })
      .slice(0, 12)
  }, [caregivers, request, client, prefMap, isAbsent])

  async function assign(caregiverId: string) {
    setErr(null); setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('substitution_requests')
      .update({ substitute_caregiver_id: caregiverId, status: 'filled', resolved_at: new Date().toISOString() })
      .eq('id', request.id)
    if (error) { setErr(error.message); setSaving(false); return }
    onAssigned()
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: 560, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>Vertretung suchen — {request.client}</h3>
        <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '0 0 12px' }}>
          {formatDate(request.date)} · {formatTime(request.start_time)}–{formatTime(request.end_time)}
          {client?.city && <> · Klient in {client.city}</>}
        </p>
        {err && <Banner tone="danger">{err}</Banner>}
        <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ranked.length === 0 ? <Banner tone="info">Keine passenden Kräfte gefunden.</Banner> : ranked.map(({ c, reasons, absent, score }) => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              border: '1px solid var(--border)', borderRadius: 10,
              background: absent ? 'rgba(208,75,59,.08)' : 'var(--coal3)', opacity: absent ? 0.7 : 1,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.name} {c.emergency_pool && <span title="Notfall-Pool">🚨</span>}
                  <span style={{ fontSize: 11, color: 'var(--gold2)', fontWeight: 700 }}>{score} Pkt</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 2 }}>
                  {absent ? <span style={{ color: '#D04B3B' }}>⚠️ an diesem Tag abwesend</span> : (reasons.length ? reasons.join(' · ') : 'keine besonderen Kriterien')}
                </div>
                {c.languages.length > 0 && <div style={{ fontSize: 11, color: 'var(--ink5)' }}>{c.languages.join(', ')}</div>}
              </div>
              <button onClick={() => assign(c.id)} disabled={saving} style={{ ...actionBtn, opacity: saving ? 0.5 : 1 }}>
                Zuweisen
              </button>
            </div>
          ))}
        </div>
        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  )
}

// ═══ Einsatz anlegen ═══
function CreateAssignmentModal({ clients, caregivers, onClose, onSaved }: {
  clients: Client[]; caregivers: Caregiver[]; onClose: () => void; onSaved: () => void
}) {
  const [clientId, setClientId] = useState('')
  const [caregiverId, setCaregiverId] = useState('')
  const [date, setDate] = useState(() => heuteBerlin())
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('11:00')
  const [serviceType, setServiceType] = useState('Alltagsbegleitung')
  const [isRecurring, setIsRecurring] = useState(false)
  const [weekday, setWeekday] = useState<number | null>(null)
  const [validUntil, setValidUntil] = useState('')
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
      start_time: startTime,
      end_time: endTime,
      service_type: serviceType,
      is_recurring: isRecurring,
      status: 'GEPLANT',
    }
    if (isRecurring && weekday != null) {
      body.weekday = weekday
      if (validUntil) body.valid_until = validUntil
    } else {
      body.assignment_date = date
    }
    if (address) body.address = address
    if (zipCode) body.zip_code = zipCode
    if (notes) body.notes = notes

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
  }

  const SERVICE_TYPES = ['Alltagsbegleitung', 'Haushaltshilfe', 'Einkaufshilfe', 'Arztbegleitung', 'Betreuung/Gesellschaft', 'Spaziergang/Mobilität', 'Demenzbetreuung', 'Sonstige']

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: 520, width: '92%' }} onClick={e => e.stopPropagation()}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <label style={{ fontSize: 13, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
            Wiederkehrend (Serieneinsatz)
          </label>
        </div>
        {isRecurring ? (
          <>
            <Field label="Wochentag *">
              <select value={weekday ?? ''} onChange={e => setWeekday(e.target.value ? Number(e.target.value) : null)} style={modalSelect}>
                <option value="">— wählen —</option>
                <option value="1">Montag</option>
                <option value="2">Dienstag</option>
                <option value="3">Mittwoch</option>
                <option value="4">Donnerstag</option>
                <option value="5">Freitag</option>
                <option value="6">Samstag</option>
                <option value="0">Sonntag</option>
              </select>
            </Field>
            <Field label="Gültig bis (optional)">
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={modalInput} />
            </Field>
          </>
        ) : (
          <Field label="Datum *">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={modalInput} />
          </Field>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Von *"><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={modalInput} /></Field>
          <Field label="Bis *"><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={modalInput} /></Field>
        </div>
        <Field label="Adresse (optional)">
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Musterstr. 1, Frankfurt" style={modalInput} />
        </Field>
        <Field label="PLZ (optional — Bundesland wird automatisch erkannt)">
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
    </div>
  )
}

// ═══ Ausfall melden ═══
function ReportAbsenceModal({ caregivers, onClose, onSaved }: { caregivers: Caregiver[]; onClose: () => void; onSaved: () => void }) {
  const [caregiverId, setCaregiverId] = useState('')
  const [type, setType] = useState('sick')
  const [start, setStart] = useState(() => heuteBerlin())
  const [end, setEnd] = useState(() => heuteBerlin())
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null)
    if (!caregiverId) { setErr('Bitte eine Betreuungskraft wählen.'); return }
    if (end < start) { setErr('Enddatum liegt vor dem Startdatum.'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('absences').insert({
      caregiver_id: caregiverId, absence_type: type, start_date: start, end_date: end,
      reason: reason.trim() || null, reported_at: new Date().toISOString(),
    })
    if (error) { setErr(error.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: 460, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>Ausfall melden</h3>
        {err && <Banner tone="danger">{err}</Banner>}
        <Field label="Betreuungskraft *">
          <select value={caregiverId} onChange={e => setCaregiverId(e.target.value)} style={modalSelect}>
            <option value="">— wählen —</option>
            {caregivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Art">
          <select value={type} onChange={e => setType(e.target.value)} style={modalSelect}>
            {Object.entries(ABSENCE_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Von *"><input type="date" value={start} onChange={e => setStart(e.target.value)} style={modalInput} /></Field>
          <Field label="Bis *"><input type="date" value={end} onChange={e => setEnd(e.target.value)} style={modalInput} /></Field>
        </div>
        <Field label="Grund (optional)"><input value={reason} onChange={e => setReason(e.target.value)} style={modalInput} /></Field>
        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose}>Abbrechen</button>
          <button className="btn-confirm" onClick={save} disabled={saving}>{saving ? 'Speichern…' : 'Ausfall speichern'}</button>
        </div>
      </div>
    </div>
  )
}

// ═══ Vertretung manuell anlegen ═══
function CreateSubModal({ clients, caregivers, onClose, onSaved }: { clients: Client[]; caregivers: Caregiver[]; onClose: () => void; onSaved: () => void }) {
  const [clientId, setClientId] = useState('')
  const [originalId, setOriginalId] = useState('')
  const [date, setDate] = useState(() => heuteBerlin())
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [service, setService] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null)
    if (!clientId || !date) { setErr('Bitte Klient und Datum angeben.'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('substitution_requests').insert({
      client_id: clientId, original_caregiver_id: originalId || null, date,
      start_time: startTime || null, end_time: endTime || null, service_type: service.trim() || null,
      status: 'open', escalation_level: 0, client_notified: false,
    })
    if (error) { setErr(error.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: 460, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>Vertretung anlegen</h3>
        {err && <Banner tone="danger">{err}</Banner>}
        <Field label="Klient *">
          <select value={clientId} onChange={e => setClientId(e.target.value)} style={modalSelect}>
            <option value="">— wählen —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Ausgefallene Kraft (optional)">
          <select value={originalId} onChange={e => setOriginalId(e.target.value)} style={modalSelect}>
            <option value="">— unbekannt —</option>
            {caregivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Datum *"><input type="date" value={date} onChange={e => setDate(e.target.value)} style={modalInput} /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Von"><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={modalInput} /></Field>
          <Field label="Bis"><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={modalInput} /></Field>
        </div>
        <Field label="Leistungsart (optional)"><input value={service} onChange={e => setService(e.target.value)} placeholder="z. B. Alltagsbegleitung" style={modalInput} /></Field>
        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose}>Abbrechen</button>
          <button className="btn-confirm" onClick={save} disabled={saving}>{saving ? 'Speichern…' : 'Anfrage erstellen'}</button>
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

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const secondaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--ink2)', background: 'var(--coal3)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit',
}
const navBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--ink3)', background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit',
}
const actionBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const escBtn: React.CSSProperties = {
  fontSize: 12, color: '#FF7043', background: 'rgba(255,112,67,0.1)',
  border: '1px solid rgba(255,112,67,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const subtleBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--ink3)', background: 'var(--coal3)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const rejectBtn: React.CSSProperties = {
  fontSize: 12, color: '#D04B3B', background: 'rgba(208,75,59,0.1)',
  border: '1px solid rgba(208,75,59,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const modalInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box', marginBottom: 0,
}
const modalSelect: React.CSSProperties = { ...modalInput }
