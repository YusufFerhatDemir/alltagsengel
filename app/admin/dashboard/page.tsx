'use client'
import { heuteBerlin } from '@/lib/utils/timezone';
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  euro, formatDate, fullName, summarizeBudget, statusMeta,
  ABSENCE_TYPE, type Ampel,
} from '@/lib/admin/ops'
import { AmpelDot, StatusBadge, Banner } from '@/components/admin/OpsUI'

interface DashStats {
  newClients: number
  activeClients: number
  freeCaregivers: number
  sickToday: number
  shortNotice: number
  openRecords: number
  openInvoices: number
  revenueToday: number
  revenueMonth: number
}

interface BudgetWarning {
  client_id: string
  name: string
  ampel: Ampel
  pct: number
  remaining: number
}

interface AbsenceItem {
  id: string
  type: string
  caregiver: string
  start_date: string
  end_date: string | null
  reason: string | null
}

function todayISO(): string {
  return heuteBerlin()
}
function monthStartISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState<DashStats | null>(null)
  const [warnings, setWarnings] = useState<BudgetWarning[]>([])
  const [absences, setAbsences] = useState<AbsenceItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const today = todayISO()
        const monthStart = monthStartISO()

        const [
          clientsRes, caregiversRes, absencesRes, recordsRes,
          invoicesRes, budgetsRes, revTodayRes, revMonthRes,
        ] = await Promise.all([
          supabase.from('clients').select('id, status'),
          supabase.from('caregivers').select('id, status'),
          supabase.from('absences').select('id, absence_type, start_date, end_date, reason, caregiver:caregivers(first_name, last_name)')
            .gte('end_date', today).order('start_date', { ascending: true }),
          supabase.from('service_records').select('id, status'),
          supabase.from('invoices').select('id, status'),
          supabase.from('client_budgets').select('client_id, annual_amount, carryover_amount, carryover_expires, used_amount, client:clients(first_name, last_name)'),
          supabase.from('service_records').select('amount').eq('date', today),
          supabase.from('service_records').select('amount').gte('date', monthStart),
        ])

        const clients = clientsRes.data || []
        const caregivers = caregiversRes.data || []
        const records = recordsRes.data || []
        const invoices = invoicesRes.data || []

        const openRecordStatuses = ['draft', 'incomplete', 'complete', 'signed']
        const openInvoiceStatuses = ['draft', 'sent', 'partial', 'disputed']

        setStats({
          newClients: clients.filter(c => c.status === 'new').length,
          activeClients: clients.filter(c => c.status === 'active').length,
          freeCaregivers: caregivers.filter(c => c.status === 'available' || c.status === 'active').length,
          sickToday: (absencesRes.data || []).filter((a: any) => a.absence_type === 'sick').length,
          shortNotice: (absencesRes.data || []).filter((a: any) => a.absence_type === 'short_notice').length,
          openRecords: records.filter(r => openRecordStatuses.includes(r.status)).length,
          openInvoices: invoices.filter(i => openInvoiceStatuses.includes(i.status)).length,
          revenueToday: (revTodayRes.data || []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0),
          revenueMonth: (revMonthRes.data || []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0),
        })

        // Budget-Warnungen (gelb + rot)
        const warns: BudgetWarning[] = (budgetsRes.data || [])
          .map((b: any) => {
            const sum = summarizeBudget(b)
            return {
              client_id: b.client_id,
              name: fullName(b.client),
              ampel: sum.ampel,
              pct: sum.pct,
              remaining: sum.remaining,
            }
          })
          .filter(w => w.ampel !== 'gruen')
          .sort((a, b) => b.pct - a.pct)
        setWarnings(warns)

        setAbsences((absencesRes.data || []).map((a: any) => ({
          id: a.id,
          type: a.absence_type,
          caregiver: fullName(a.caregiver),
          start_date: a.start_date,
          end_date: a.end_date,
          reason: a.reason,
        })))
      } catch (err) {
        console.error('Dashboard load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div className="admin-page"><h1>Übersicht</h1><p>Laden…</p></div>

  return (
    <div className="admin-page">
      <h1>Übersicht</h1>
      <p className="admin-subtitle">Betriebssystem — heute, {formatDate(todayISO())}</p>

      {/* Operative Kennzahlen */}
      <div className="admin-stats-grid">
        <button className="admin-stat-card" onClick={() => router.push('/admin/clients')} style={cardBtn}>
          <div className="admin-stat-value">{stats?.newClients}</div>
          <div className="admin-stat-label">Neue Klienten</div>
        </button>
        <button className="admin-stat-card success" onClick={() => router.push('/admin/clients')} style={cardBtn}>
          <div className="admin-stat-value">{stats?.activeClients}</div>
          <div className="admin-stat-label">Aktive Klienten</div>
        </button>
        <button className="admin-stat-card" onClick={() => router.push('/admin/caregivers')} style={{ ...cardBtn, borderLeft: '3px solid #2196F3' }}>
          <div className="admin-stat-value">{stats?.freeCaregivers}</div>
          <div className="admin-stat-label">Freie Betreuungskräfte</div>
        </button>
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #D04B3B' }}>
          <div className="admin-stat-value">{stats?.sickToday}</div>
          <div className="admin-stat-label">Krankmeldungen</div>
        </div>
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #FF7043' }}>
          <div className="admin-stat-value">{stats?.shortNotice}</div>
          <div className="admin-stat-label">Kurzfristige Absagen</div>
        </div>
        <button className="admin-stat-card accent" onClick={() => router.push('/admin/records')} style={cardBtn}>
          <div className="admin-stat-value">{stats?.openRecords}</div>
          <div className="admin-stat-label">Offene Leistungsnachweise</div>
        </button>
        <button className="admin-stat-card" onClick={() => router.push('/admin/invoices')} style={{ ...cardBtn, borderLeft: '3px solid #9C27B0' }}>
          <div className="admin-stat-value">{stats?.openInvoices}</div>
          <div className="admin-stat-label">Offene Rechnungen</div>
        </button>
      </div>

      {/* Umsatz */}
      <h2 style={{ marginTop: 32 }}>Umsatz</h2>
      <div className="admin-stats-grid">
        <div className="admin-stat-card wide">
          <div className="admin-stat-value">{euro(stats?.revenueToday)}</div>
          <div className="admin-stat-label">Heute (geleistet)</div>
        </div>
        <div className="admin-stat-card wide gold">
          <div className="admin-stat-value">{euro(stats?.revenueMonth)}</div>
          <div className="admin-stat-label">Diesen Monat (geleistet)</div>
        </div>
      </div>

      {/* Budgetwarnungen */}
      <h2 style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
        Budgetwarnungen
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>
          ({warnings.length})
        </span>
        <button onClick={() => router.push('/admin/budgets')} style={linkBtn}>Alle Budgets →</button>
      </h2>
      {warnings.length === 0 ? (
        <Banner tone="info">Alle Klienten-Budgets im grünen Bereich 🟢</Banner>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Ampel</th><th>Klient</th><th>Auslastung</th><th>Verbleibend</th></tr>
            </thead>
            <tbody>
              {warnings.map(w => (
                <tr key={w.client_id} onClick={() => router.push(`/admin/clients/${w.client_id}`)} style={{ cursor: 'pointer' }}>
                  <td><AmpelDot ampel={w.ampel} withLabel /></td>
                  <td style={{ fontWeight: 600 }}>{w.name}</td>
                  <td>{w.pct}%</td>
                  <td style={{ color: w.remaining < 0 ? '#D04B3B' : 'var(--ink2)' }}>{euro(w.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ausfälle / Absenzen */}
      <h2 style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
        Aktuelle Ausfälle
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>
          ({absences.length})
        </span>
      </h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Art</th><th>Betreuungskraft</th><th>Von</th><th>Bis</th><th>Grund</th></tr>
          </thead>
          <tbody>
            {absences.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>Keine aktuellen Ausfälle 🎉</td></tr>
            ) : absences.map(a => {
              const m = statusMeta(ABSENCE_TYPE, a.type)
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
    </div>
  )
}

const cardBtn: React.CSSProperties = {
  textAlign: 'left', cursor: 'pointer', font: 'inherit', display: 'block', width: '100%',
}
const linkBtn: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 13, color: 'var(--gold2)',
  background: 'rgba(201,150,60,0.1)', border: '1px solid rgba(201,150,60,0.3)',
  borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit',
}
