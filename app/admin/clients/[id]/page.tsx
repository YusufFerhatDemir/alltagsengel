'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isValidUUID } from '@/lib/safe-query'
import {
  euro, formatDate, formatTime, fullName, statusMeta, summarizeBudget,
  CLIENT_STATUS, RECORD_STATUS, BUDGET_TYPE, type BudgetSummary,
} from '@/lib/admin/ops'
import { AmpelDot, BudgetBar, StatusBadge, Banner, EmptyRow } from '@/components/admin/OpsUI'

interface ClientDetail {
  id: string
  customer_number: string | null
  first_name: string
  last_name: string
  date_of_birth: string | null
  address: string | null
  city: string | null
  zip_code: string | null
  phone: string | null
  email: string | null
  care_level: number | null
  care_level_since: string | null
  insurance_name: string | null
  insurance_number: string | null
  notes: string | null
  status: string
}

interface RecordRow {
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  service_type: string | null
  budget_type: string | null
  amount: number | null
  status: string
  caregiver: string
}

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id || '')
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [budget, setBudget] = useState<any>(null)
  const [summary, setSummary] = useState<BudgetSummary | null>(null)
  const [records, setRecords] = useState<RecordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      if (!isValidUUID(id)) { setNotFound(true); setLoading(false); return }
      try {
        const supabase = createClient()
        const year = new Date().getFullYear()
        const [clientRes, budgetRes, recordsRes] = await Promise.all([
          supabase.from('clients').select('*').eq('id', id).single(),
          supabase.from('client_budgets').select('*').eq('client_id', id).eq('year', year).maybeSingle(),
          supabase.from('service_records')
            .select('id, date, start_time, end_time, duration_minutes, service_type, budget_type, amount, status, caregiver:caregivers(first_name, last_name)')
            .eq('client_id', id).order('date', { ascending: false }).limit(100),
        ])

        if (clientRes.error || !clientRes.data) { setNotFound(true); setLoading(false); return }
        setClient(clientRes.data as ClientDetail)
        setBudget(budgetRes.data)
        setSummary(budgetRes.data ? summarizeBudget(budgetRes.data) : null)
        setRecords((recordsRes.data || []).map((r: any) => ({
          id: r.id,
          date: r.date,
          start_time: r.start_time,
          end_time: r.end_time,
          duration_minutes: r.duration_minutes,
          service_type: r.service_type,
          budget_type: r.budget_type,
          amount: r.amount,
          status: r.status,
          caregiver: fullName(r.caregiver),
        })))
      } catch (err) {
        console.error('Client detail load error:', err)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) return <div className="admin-page"><p>Laden…</p></div>
  if (notFound || !client) return (
    <div className="admin-page">
      <button onClick={() => router.push('/admin/clients')} style={backBtn}>← Klienten</button>
      <h1>Klient nicht gefunden</h1>
    </div>
  )

  const sm = statusMeta(CLIENT_STATUS, client.status)

  return (
    <div className="admin-page">
      <button onClick={() => router.push('/admin/clients')} style={backBtn}>← Klienten</button>

      <div className="admin-page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {client.first_name} {client.last_name}
            <StatusBadge label={sm.label} color={sm.color} />
          </h1>
          <p className="admin-subtitle">
            {client.customer_number ? `Kundennr. ${client.customer_number} · ` : ''}
            {client.care_level ? `Pflegegrad ${client.care_level}` : 'Kein Pflegegrad'}
          </p>
        </div>
      </div>

      {/* Stammdaten + Budget nebeneinander */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }} className="client-detail-grid">
        {/* Stammdaten */}
        <div className="admin-stat-card" style={{ padding: 20 }}>
          <h2 style={{ marginBottom: 12 }}>Stammdaten</h2>
          <InfoRow label="Geburtsdatum" value={formatDate(client.date_of_birth)} />
          <InfoRow label="Adresse" value={[client.address, [client.zip_code, client.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'} />
          <InfoRow label="Telefon" value={client.phone || '—'} />
          <InfoRow label="E-Mail" value={client.email || '—'} />
          <InfoRow label="Pflegekasse" value={client.insurance_name || '—'} />
          <InfoRow label="Versichertennr." value={client.insurance_number || '—'} />
          <InfoRow label="Pflegegrad seit" value={formatDate(client.care_level_since)} />
          {client.notes && <InfoRow label="Notizen" value={client.notes} />}
        </div>

        {/* Budget */}
        <div className="admin-stat-card" style={{ padding: 20 }}>
          <h2 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            Budget {new Date().getFullYear()}
            {summary && <AmpelDot ampel={summary.ampel} withLabel />}
          </h2>
          {!summary ? (
            <p style={{ color: 'var(--ink4)' }}>Für dieses Jahr ist noch kein Budget hinterlegt.</p>
          ) : (
            <>
              {summary.carryoverExpiresSoon && (
                <Banner tone="warn">
                  ⏳ Vorjahresübertrag {euro(summary.carryover)} verfällt am {formatDate(budget.carryover_expires)} — zuerst verbrauchen!
                </Banner>
              )}
              {summary.carryoverExpired && (
                <Banner tone="danger">
                  ❌ Vorjahresübertrag ist am {formatDate(budget.carryover_expires)} verfallen.
                </Banner>
              )}
              <div style={{ margin: '12px 0' }}>
                <BudgetBar summary={summary} />
              </div>
              <InfoRow label="Jahresbudget (§45b)" value={euro(budget.annual_amount)} />
              <InfoRow label="Vorjahresübertrag" value={euro(budget.carryover_amount)} />
              <InfoRow label="Verbraucht" value={euro(summary.used)} />
              <InfoRow label="aus Übertrag" value={euro(budget.used_from_carryover)} />
              <InfoRow label="Privat gezahlt" value={euro(budget.private_amount)} />
              <InfoRow label="Verfügbar gesamt" value={euro(summary.available)} strong />
              <InfoRow label="Verbleibend" value={euro(summary.remaining)} strong
                color={summary.remaining < 0 ? '#D04B3B' : '#5CB882'} />
            </>
          )}
        </div>
      </div>

      {/* Leistungshistorie */}
      <h2 style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
        Leistungshistorie
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>({records.length})</span>
        <button onClick={() => router.push(`/admin/records/new?client=${client.id}`)} style={addBtn}>+ Nachweis</button>
      </h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Datum</th><th>Zeit</th><th>Leistung</th><th>Kraft</th><th>Budget</th><th>Betrag</th><th>Status</th></tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <EmptyRow colSpan={7}>Noch keine Leistungen erfasst</EmptyRow>
            ) : records.map(r => {
              const rm = statusMeta(RECORD_STATUS, r.status)
              return (
                <tr key={r.id} onClick={() => router.push(`/admin/records?focus=${r.id}`)} style={{ cursor: 'pointer' }}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{formatTime(r.start_time)}–{formatTime(r.end_time)}</td>
                  <td>{r.service_type || '—'}</td>
                  <td>{r.caregiver}</td>
                  <td style={{ fontSize: 13 }}>{r.budget_type ? (BUDGET_TYPE[r.budget_type] || r.budget_type) : '—'}</td>
                  <td>{euro(r.amount)}</td>
                  <td><StatusBadge label={rm.label} color={rm.color} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function InfoRow({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
      <span style={{ color: 'var(--ink4)' }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 500, color: color || 'var(--ink2)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

const backBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--gold2)', cursor: 'pointer',
  fontSize: 14, padding: 0, marginBottom: 12, fontFamily: 'inherit',
}
const addBtn: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 13, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit',
}
