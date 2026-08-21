'use client'
import { datumBerlin, heuteBerlin } from '@/lib/utils/timezone';
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate, formatTime, fullName, euro,
  summarizeBudget, AMPEL_META, type Ampel, type BudgetSummary,
} from '@/lib/admin/ops'
import { StatusBadge, Banner, EmptyRow } from '@/components/admin/OpsUI'

// -- Typen -------------------------------------------------------------------

interface Assignment {
  id: string
  client_id: string
  caregiver_id: string
  assignment_date: string | null
  start_time: string
  end_time: string
  service_type: string
  status: string
}

interface ServiceRecord {
  id: string
  client_id: string
  caregiver_id: string
  date: string
  start_time: string
  end_time: string
  duration_minutes: number | null
  service_type: string
  budget_type: string
  billing_type: string | null
  billing_status: string | null
  amount: number | null
  proof_status: string | null
  is_locked: boolean
  assignment_id: string | null
}

interface ClientBudget {
  id: string
  client_id: string
  annual_amount: number
  monthly_amount: number
  carryover_amount: number
  carryover_expires: string | null
  used_amount: number
  used_from_carryover: number
  private_amount: number
}

interface Person { first_name: string | null; last_name: string | null }

// -- Konstanten --------------------------------------------------------------

const MONTH_NAMES = [
  'Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]
// Korrektur fuer Umlaut (display only)
const MONTH_DISPLAY = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

const BILLING_TYPE_LABELS: Record<string, string> = {
  PRIVAT: 'Privat',
  '§45b': '§ 45b SGB XI',
  '§39': '§ 39 SGB XI',
  '§36': '§ 36 SGB XI',
  '§37': '§ 37 SGB XI',
  '§42': '§ 42 SGB XI',
  SONSTIGE: 'Sonstige',
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
  textDecoration: 'none', display: 'inline-block',
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink2)', background: 'var(--coal3)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit',
  textDecoration: 'none', display: 'inline-block',
}

// -- Hilfsfunktionen ---------------------------------------------------------

function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = datumBerlin(new Date(year, month, 0))
  return { start, end }
}

function budgetAmpel(pct: number): Ampel {
  if (pct > 95) return 'rot'
  if (pct >= 70) return 'gelb'
  return 'gruen'
}

// -- Komponente --------------------------------------------------------------

export default function MonatsabschlussVorbereitungPage() {
  const router = useRouter()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [loading, setLoading] = useState(true)

  // Rohdaten
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [records, setRecords] = useState<ServiceRecord[]>([])
  const [budgets, setBudgets] = useState<ClientBudget[]>([])
  const [clientMap, setClientMap] = useState<Map<string, Person>>(new Map())
  const [caregiverMap, setCaregiverMap] = useState<Map<string, Person>>(new Map())

  // Monat wechseln
  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  // Daten laden
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const supabase = createClient()
        const { start, end } = monthRange(year, month)

        const [assignRes, recordRes, budgetRes, clientRes, caregiverRes] = await Promise.all([
          supabase.from('assignments').select('id, client_id, caregiver_id, assignment_date, start_time, end_time, service_type, status')
            .gte('assignment_date', start).lte('assignment_date', end),
          supabase.from('service_records').select('id, client_id, caregiver_id, date, start_time, end_time, duration_minutes, service_type, budget_type, billing_type, billing_status, amount, proof_status, is_locked, assignment_id')
            .gte('date', start).lte('date', end),
          supabase.from('client_budgets').select('id, client_id, annual_amount, monthly_amount, carryover_amount, carryover_expires, used_amount, used_from_carryover, private_amount')
            .eq('year', year).eq('status', 'active'),
          supabase.from('clients').select('id, first_name, last_name').limit(500),
          supabase.from('caregivers').select('id, first_name, last_name').limit(500),
        ])

        if (cancelled) return

        setAssignments(assignRes.data || [])
        setRecords(recordRes.data || [])
        setBudgets(budgetRes.data || [])

        const cm = new Map<string, Person>()
        for (const c of (clientRes.data || [])) cm.set(c.id, c)
        setClientMap(cm)

        const cg = new Map<string, Person>()
        for (const c of (caregiverRes.data || [])) cg.set(c.id, c)
        setCaregiverMap(cg)
      } catch (err) {
        console.error('Monatsabschluss-Vorbereitung Ladefehler:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [year, month])

  // -- Abgeleitete Daten -----------------------------------------------------

  // Nur aktive Einsaetze (nicht storniert)
  const activeAssignments = useMemo(
    () => assignments.filter(a => !['STORNIERT', 'cancelled'].includes(a.status)),
    [assignments],
  )

  // Einsatz-IDs, die schon einen service_record haben
  const recordedAssignmentIds = useMemo(() => {
    const set = new Set<string>()
    for (const r of records) { if (r.assignment_id) set.add(r.assignment_id) }
    return set
  }, [records])

  // Stats
  const stats = useMemo(() => {
    const total = activeAssignments.length
    const completed = activeAssignments.filter(a => a.status === 'BEENDET').length
    const completedWithoutRecord = activeAssignments.filter(
      a => a.status === 'BEENDET' && !recordedAssignmentIds.has(a.id),
    ).length
    const unsigned = records.filter(
      r => ['ENTWURF', 'ABGESCHLOSSEN'].includes(r.proof_status || '') && !r.is_locked,
    ).length
    const locked = records.filter(r => r.is_locked).length
    const billed = records.filter(r => r.billing_status === 'ABGERECHNET').length
    const open = activeAssignments.filter(a => ['GEPLANT', 'BESTAETIGT'].includes(a.status)).length
    const noShow = assignments.filter(a => a.status === 'NO_SHOW').length
    const budgetWarnings = budgets.filter(b => {
      if (!b.annual_amount || b.annual_amount === 0) return false
      return (b.used_amount / b.annual_amount) > 0.9
    }).length

    return { total, completed, completedWithoutRecord, unsigned, locked, billed, open, noShow, budgetWarnings }
  }, [activeAssignments, assignments, records, recordedAssignmentIds, budgets])

  // Tabelle 1: Fehlende Leistungsnachweise
  const missingRecords = useMemo(
    () => activeAssignments.filter(a => a.status === 'BEENDET' && !recordedAssignmentIds.has(a.id)),
    [activeAssignments, recordedAssignmentIds],
  )

  // Tabelle 2: Fehlende Unterschriften
  const unsignedRecords = useMemo(
    () => records.filter(r => ['ENTWURF', 'ABGESCHLOSSEN'].includes(r.proof_status || '')),
    [records],
  )

  // Tabelle 3: Nicht bestaetigte Einsaetze (in der Vergangenheit)
  const unconfirmed = useMemo(() => {
    const today = heuteBerlin()
    return activeAssignments.filter(
      a => ['GEPLANT', 'BESTAETIGT'].includes(a.status) && a.assignment_date && a.assignment_date < today,
    )
  }, [activeAssignments])

  // Tabelle 4: Budgetwarnungen
  const budgetWarningRows = useMemo(() => {
    return budgets
      .map(b => {
        const summary = summarizeBudget(b)
        return { ...b, summary }
      })
      .filter(b => b.summary.pct >= 90)
      .sort((a, b) => b.summary.pct - a.summary.pct)
  }, [budgets])

  // Tabelle 5: Abrechnungsuebersicht nach billing_type
  const billingBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; sum: number }>()
    for (const r of records) {
      const bt = r.billing_type || 'PRIVAT'
      const existing = map.get(bt) || { count: 0, sum: 0 }
      existing.count++
      existing.sum += r.amount || 0
      map.set(bt, existing)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count)
  }, [records])

  const kassenNichtFreiCount = useMemo(
    () => records.filter(r => r.billing_status === 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET').length,
    [records],
  )

  // -- Stat-Card Konfiguration ------------------------------------------------

  const statCards: { label: string; value: number; color: string }[] = [
    { label: 'Einsätze gesamt', value: stats.total, color: '#2196F3' },
    { label: 'Abgeschlossen', value: stats.completed, color: '#5CB882' },
    { label: 'Fehlende Nachweise', value: stats.completedWithoutRecord, color: '#FF9800' },
    { label: 'Ohne Unterschrift', value: stats.unsigned, color: '#E8A000' },
    { label: 'Gesperrt/Signiert', value: stats.locked, color: '#5CB882' },
    { label: 'Abgerechnet', value: stats.billed, color: '#9C27B0' },
    { label: 'Offene Einsätze', value: stats.open, color: '#2196F3' },
    { label: 'No-Show', value: stats.noShow, color: '#D04B3B' },
    { label: 'Budgetwarnungen', value: stats.budgetWarnings, color: '#D04B3B' },
  ]

  // -- Render -----------------------------------------------------------------

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <h1>Monatsabschluss-Vorbereitung</h1>
          <p className="admin-subtitle">
            Checkliste und Statusübersicht für den monatlichen Abschluss
          </p>
        </div>
      </div>

      {/* Monatswahl */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, margin: '20px 0',
        background: 'var(--coal2)', borderRadius: 10, padding: '12px 20px',
        border: '1px solid var(--border)',
      }}>
        <button onClick={prevMonth} style={secondaryBtn} aria-label="Vorheriger Monat">&larr;</button>
        <h2 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: 'var(--ink)', flex: 1, textAlign: 'center' }}>
          {MONTH_DISPLAY[month - 1]} {year}
        </h2>
        <button onClick={nextMonth} style={secondaryBtn} aria-label="Nächster Monat">&rarr;</button>
      </div>

      {/* Lade-Indikator */}
      {loading && <p style={{ color: 'var(--ink3)', padding: '20px 0' }}>Daten werden geladen…</p>}

      {!loading && (
        <>
          {/* Stats Grid */}
          <div className="admin-stats-grid">
            {statCards.map(sc => (
              <div key={sc.label} className="admin-stat-card" style={{ borderLeft: `3px solid ${sc.color}` }}>
                <div className="admin-stat-value" style={{ color: sc.value > 0 ? sc.color : undefined }}>
                  {sc.value}
                </div>
                <div className="admin-stat-label">{sc.label}</div>
              </div>
            ))}
          </div>

          {/* Kassenabrechnung Warnung */}
          {kassenNichtFreiCount > 0 && (
            <Banner tone="warn">
              {kassenNichtFreiCount} Leistungsnachweis(e) mit Status
              &quot;Kassenabrechnung noch nicht freigeschaltet&quot; &mdash; Kassenzulassung prüfen!
            </Banner>
          )}

          {/* ── Tabelle 1: Fehlende Leistungsnachweise ── */}
          <SectionHeader title="Fehlende Leistungsnachweise" count={missingRecords.length} color="#FF9800" />
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Klient</th>
                  <th>Betreuungskraft</th>
                  <th>Uhrzeit</th>
                  <th>Leistungsart</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {missingRecords.length === 0 ? (
                  <EmptyRow colSpan={6}>Keine fehlenden Nachweise</EmptyRow>
                ) : (
                  missingRecords.map(a => (
                    <tr key={a.id}>
                      <td>{formatDate(a.assignment_date)}</td>
                      <td style={{ fontWeight: 600 }}>{fullName(clientMap.get(a.client_id))}</td>
                      <td>{fullName(caregiverMap.get(a.caregiver_id))}</td>
                      <td>{formatTime(a.start_time)} &ndash; {formatTime(a.end_time)}</td>
                      <td>{a.service_type}</td>
                      <td>
                        <button
                          style={primaryBtn}
                          onClick={() => router.push('/admin/leistungsnachweis-digital')}
                        >
                          Nachweis erstellen
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Tabelle 2: Fehlende Unterschriften ── */}
          <SectionHeader title="Fehlende Unterschriften" count={unsignedRecords.length} color="#E8A000" />
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Klient</th>
                  <th>Betreuungskraft</th>
                  <th>Status</th>
                  <th>Dauer</th>
                  <th>Betrag</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {unsignedRecords.length === 0 ? (
                  <EmptyRow colSpan={7}>Alle Nachweise unterschrieben</EmptyRow>
                ) : (
                  unsignedRecords.map(r => (
                    <tr key={r.id}>
                      <td>{formatDate(r.date)}</td>
                      <td style={{ fontWeight: 600 }}>{fullName(clientMap.get(r.client_id))}</td>
                      <td>{fullName(caregiverMap.get(r.caregiver_id))}</td>
                      <td>
                        <StatusBadge
                          label={r.proof_status === 'ENTWURF' ? 'Entwurf' : 'Abgeschlossen'}
                          color={r.proof_status === 'ENTWURF' ? '#999' : '#E8A000'}
                        />
                      </td>
                      <td>{r.duration_minutes ? `${r.duration_minutes} Min.` : '—'}</td>
                      <td>{euro(r.amount)}</td>
                      <td>
                        <button
                          style={primaryBtn}
                          onClick={() => router.push(`/admin/leistungsnachweis-digital?id=${r.id}`)}
                        >
                          Zur Unterschrift
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Tabelle 3: Nicht bestaetigte Einsaetze ── */}
          <SectionHeader title="Nicht bestätigte Einsätze" count={unconfirmed.length} color="#FF9800" />
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Klient</th>
                  <th>Betreuungskraft</th>
                  <th>Status</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {unconfirmed.length === 0 ? (
                  <EmptyRow colSpan={5}>Keine offenen Einsätze in der Vergangenheit</EmptyRow>
                ) : (
                  unconfirmed.map(a => (
                    <tr key={a.id}>
                      <td>{formatDate(a.assignment_date)}</td>
                      <td style={{ fontWeight: 600 }}>{fullName(clientMap.get(a.client_id))}</td>
                      <td>{fullName(caregiverMap.get(a.caregiver_id))}</td>
                      <td>
                        <StatusBadge
                          label={a.status === 'GEPLANT' ? 'Geplant' : 'Bestätigt'}
                          color={a.status === 'GEPLANT' ? '#999' : '#2196F3'}
                        />
                      </td>
                      <td>
                        <button
                          style={primaryBtn}
                          onClick={() => router.push(`/admin/kalender?date=${a.assignment_date}`)}
                        >
                          Status aktualisieren
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Tabelle 4: Budgetwarnungen ── */}
          <SectionHeader title="Budgetwarnungen" count={budgetWarningRows.length} color="#D04B3B" />
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Klient</th>
                  <th>Budget</th>
                  <th>Verbraucht</th>
                  <th>Verfügbar</th>
                  <th>%</th>
                  <th>Ampel</th>
                </tr>
              </thead>
              <tbody>
                {budgetWarningRows.length === 0 ? (
                  <EmptyRow colSpan={6}>Keine Budgetwarnungen</EmptyRow>
                ) : (
                  budgetWarningRows.map(b => {
                    const ampel = budgetAmpel(b.summary.pct)
                    return (
                      <tr key={b.id} onClick={() => router.push(`/admin/clients/${b.client_id}`)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: 600 }}>{fullName(clientMap.get(b.client_id))}</td>
                        <td>{euro(b.annual_amount)}</td>
                        <td>{euro(b.used_amount)}</td>
                        <td style={{
                          color: b.summary.remaining < 0 ? '#D04B3B' : 'var(--ink2)',
                          fontWeight: 600,
                        }}>
                          {euro(b.summary.remaining)}
                        </td>
                        <td style={{ fontWeight: 600, color: AMPEL_META[ampel].color }}>
                          {b.summary.pct}%
                        </td>
                        <td>
                          <StatusBadge
                            label={AMPEL_META[ampel].label}
                            color={AMPEL_META[ampel].color}
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Tabelle 5: Abrechnungsuebersicht ── */}
          <SectionHeader title="Abrechnungsübersicht" count={records.length} color="#9C27B0" />
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Abrechnungstyp</th>
                  <th>Anzahl</th>
                  <th>Summe</th>
                </tr>
              </thead>
              <tbody>
                {billingBreakdown.length === 0 ? (
                  <EmptyRow colSpan={3}>Keine Leistungsnachweise in diesem Monat</EmptyRow>
                ) : (
                  billingBreakdown.map(([bt, data]) => (
                    <tr key={bt}>
                      <td style={{ fontWeight: 600 }}>{BILLING_TYPE_LABELS[bt] || bt}</td>
                      <td>{data.count}</td>
                      <td>{euro(data.sum)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {kassenNichtFreiCount > 0 && (
            <div style={{
              marginTop: 16, padding: '14px 20px', borderRadius: 10,
              background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.25)',
              color: '#E8A000', fontWeight: 600, fontSize: 14,
            }}>
              {kassenNichtFreiCount} Nachweis(e) &quot;Kassenabrechnung noch nicht freigeschaltet&quot;
              &mdash; diese können erst nach Kassenzulassung abgerechnet werden.
            </div>
          )}
        </>
      )}
    </div>
  )
}

// -- Hilfskomponente: Sektions-Header ----------------------------------------

function SectionHeader({ title, count, color }: { title: string; count: number; color: string }) {
  return (
    <h2 style={{
      marginTop: 32, marginBottom: 12, fontSize: 18,
      fontFamily: "'Cormorant Garamond', serif",
      color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 10,
    }}>
      {title}
      <span style={{
        fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
        background: count > 0 ? color : 'var(--coal3)',
        color: count > 0 ? '#fff' : 'var(--ink3)',
        borderRadius: 12, padding: '2px 10px',
      }}>
        {count}
      </span>
    </h2>
  )
}
