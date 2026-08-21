'use client'
import { datumBerlin } from '@/lib/utils/timezone';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isValidUUID } from '@/lib/safe-query'
import {
  euro, formatDate, formatTime, fullName, statusMeta, summarizeBudget,
  CLOSING_STATUS, RECORD_STATUS, REVIEW_SEVERITY, REVIEW_ERROR_TYPE,
  type Ampel, type BudgetSummary,
} from '@/lib/admin/ops'
import { AmpelDot, BudgetBar, StatusBadge, Banner, EmptyRow } from '@/components/admin/OpsUI'
import { closeMonthAction } from './actions'

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

interface ReviewErrorRow {
  id: string
  error_type: string
  severity: string
  description: string
  resolved: boolean
}

interface RecordRow {
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  service_type: string | null
  amount: number | null
  status: string
  caregiver: string
  errors: ReviewErrorRow[]
}

interface Closing {
  id: string
  status: string
  ampel: Ampel
  closed_at: string | null
  notes: string
}

function MonatsabschlussDetailInner() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const clientId = String(params?.clientId || '')
  const now = new Date()
  const year = Number(searchParams.get('year')) || now.getFullYear()
  const month = Number(searchParams.get('month')) || now.getMonth() + 1

  const [clientName, setClientName] = useState('')
  const [records, setRecords] = useState<RecordRow[]>([])
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null)
  const [closing, setClosing] = useState<Closing | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [closingBusy, setClosingBusy] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isValidUUID(clientId)) { setNotFound(true); setLoading(false); return }
    setLoading(true)
    try {
      const supabase = createClient()
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
      const monthEnd = datumBerlin(new Date(year, month, 0))

      const [clientRes, recordsRes, budgetRes, closingRes] = await Promise.all([
        supabase.from('clients').select('id, first_name, last_name').eq('id', clientId).single(),
        supabase.from('service_records')
          .select('id, date, start_time, end_time, service_type, amount, status, caregiver:caregivers(first_name, last_name)')
          .eq('client_id', clientId).gte('date', monthStart).lte('date', monthEnd).order('date'),
        supabase.from('client_budgets').select('*').eq('client_id', clientId).eq('year', year).maybeSingle(),
        supabase.from('monthly_closings').select('*').eq('client_id', clientId).eq('year', year).eq('month', month).maybeSingle(),
      ])

      if (clientRes.error || !clientRes.data) { setNotFound(true); setLoading(false); return }
      setClientName(fullName(clientRes.data))
      setBudgetSummary(budgetRes.data ? summarizeBudget(budgetRes.data) : null)
      setClosing(closingRes.data ? {
        id: closingRes.data.id, status: closingRes.data.status, ampel: closingRes.data.ampel,
        closed_at: closingRes.data.closed_at, notes: closingRes.data.notes || '',
      } : null)

      const recs = (recordsRes.data || [])
      const recordIds = recs.map(r => r.id)
      const errorsByRecord = new Map<string, ReviewErrorRow[]>()
      if (recordIds.length > 0) {
        const { data: errs } = await supabase
          .from('review_errors')
          .select('id, service_record_id, error_type, severity, description, resolved')
          .in('service_record_id', recordIds)
        for (const e of errs || []) {
          const arr = errorsByRecord.get(e.service_record_id) || []
          arr.push({ id: e.id, error_type: e.error_type, severity: e.severity, description: e.description, resolved: e.resolved })
          errorsByRecord.set(e.service_record_id, arr)
        }
      }

      setRecords(recs.map(r => ({
        id: r.id, date: r.date, start_time: r.start_time, end_time: r.end_time,
        service_type: r.service_type, amount: r.amount, status: r.status,
        caregiver: fullName(r.caregiver), errors: errorsByRecord.get(r.id) || [],
      })))
    } catch (err) {
      console.error('Monatsabschluss-Detail load error:', err)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [clientId, year, month])

  useEffect(() => { load() }, [load])

  // Ampel berechnen — identisch zur Übersichtsseite, außer wenn bereits ein
  // Monatsabschluss existiert, dessen gespeicherte Ampel maßgeblich ist.
  const ampel: Ampel = useMemo(() => {
    if (closing) return closing.ampel
    const hasCritical = records.some(r => r.errors.some(e => !e.resolved && e.severity === 'critical'))
    const hasWarning = records.some(r => r.errors.some(e => !e.resolved && e.severity === 'warning'))
    const hasIncomplete = records.some(r => r.status === 'incomplete' || r.status === 'draft')
    const budgetExceeded = budgetSummary ? budgetSummary.remaining < 0 : false
    if (hasCritical || budgetExceeded) return 'rot'
    if (hasWarning || hasIncomplete) return 'gelb'
    return 'gruen'
  }, [closing, records, budgetSummary])

  const totalAmount = records.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  async function closeMonth() {
    setCloseError(null)
    if (ampel === 'rot') return // Button ist ohnehin deaktiviert
    if (ampel === 'gelb') {
      const ok = window.confirm('Es gibt noch offene Warnungen oder unvollständige Nachweise für diesen Monat. Trotzdem abschließen?')
      if (!ok) return
    }
    setClosingBusy(true)
    try {
      await closeMonthAction({
        clientId,
        year,
        month,
        ampel,
        totalRecords: records.length,
        totalAmount,
        budgetUsed: budgetSummary?.used ?? null,
        budgetAvailable: budgetSummary?.available ?? null,
      })
      await load()
    } catch (err: any) {
      setCloseError(err?.message || 'Unerwarteter Fehler beim Abschließen.')
    } finally {
      setClosingBusy(false)
    }
  }

  if (loading) return <div className="admin-page"><p>Laden…</p></div>
  if (notFound) return (
    <div className="admin-page">
      <button onClick={() => router.push('/admin/monatsabschluss')} style={backBtn}>← Monatsabschluss</button>
      <h1>Klient nicht gefunden</h1>
    </div>
  )

  const alreadyClosed = closing?.status === 'closed' || closing?.status === 'sent'
  const sm = statusMeta(CLOSING_STATUS, closing?.status || 'open')

  return (
    <div className="admin-page">
      <button onClick={() => router.push('/admin/monatsabschluss')} style={backBtn}>← Monatsabschluss</button>

      <div className="admin-page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {clientName}
            <AmpelDot ampel={ampel} withLabel />
          </h1>
          <p className="admin-subtitle">
            {MONTH_NAMES[month - 1]} {year} · {records.length} Einsätze · {euro(totalAmount)}
            {' · '}<StatusBadge label={sm.label} color={sm.color} />
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          {alreadyClosed ? (
            <p style={{ fontSize: 13, color: 'var(--ink4)', margin: 0 }}>
              Abgeschlossen am {formatDate(closing?.closed_at)}
            </p>
          ) : (
            <button
              onClick={closeMonth}
              disabled={ampel === 'rot' || closingBusy}
              style={ampel === 'rot' ? disabledBtn : primaryBtn}
              title={ampel === 'rot' ? 'Kritische Probleme müssen zuerst gelöst werden.' : undefined}
            >
              {closingBusy ? 'Wird abgeschlossen…' : 'Monat abschließen'}
            </button>
          )}
        </div>
      </div>

      {closeError && <Banner tone="danger">{closeError}</Banner>}
      {ampel === 'rot' && !alreadyClosed && (
        <Banner tone="danger">🔴 Kritische Prüf-Fehler oder Budgetüberschreitung — Abschluss ist blockiert, bis diese gelöst sind.</Banner>
      )}
      {ampel === 'gelb' && !alreadyClosed && (
        <Banner tone="warn">🟡 Es gibt offene Warnungen oder unvollständige Nachweise — bitte vor Abschluss prüfen.</Banner>
      )}

      {budgetSummary && (
        <div className="admin-stat-card" style={{ padding: 20, marginBottom: 20 }}>
          <h2 style={{ marginBottom: 12 }}>Budget {year}</h2>
          <BudgetBar summary={budgetSummary} />
        </div>
      )}

      <h2 style={{ marginTop: 8 }}>Leistungsnachweise</h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Datum</th><th>Zeit</th><th>Leistung</th><th>Kraft</th><th>Betrag</th><th>Status</th><th>Prüfhinweise</th></tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <EmptyRow colSpan={7}>Keine Leistungsnachweise in diesem Monat</EmptyRow>
            ) : records.map(r => {
              const rm = statusMeta(RECORD_STATUS, r.status)
              const openErrors = r.errors.filter(e => !e.resolved)
              return (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{formatTime(r.start_time)}–{formatTime(r.end_time)}</td>
                  <td>{r.service_type || '—'}</td>
                  <td>{r.caregiver}</td>
                  <td>{euro(r.amount)}</td>
                  <td><StatusBadge label={rm.label} color={rm.color} /></td>
                  <td style={{ fontSize: 12, maxWidth: 260 }}>
                    {openErrors.length === 0 ? (
                      r.errors.length > 0 ? <span style={{ color: 'var(--ink5)' }}>alle gelöst</span> : '—'
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {openErrors.map(e => {
                          const sev = statusMeta(REVIEW_SEVERITY, e.severity)
                          return (
                            <span key={e.id} style={{ color: sev.color }}>
                              {sev.label}: {REVIEW_ERROR_TYPE[e.error_type] || e.error_type} — {e.description}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function MonatsabschlussDetailPage() {
  return (
    <Suspense fallback={<div className="admin-page"><p>Laden…</p></div>}>
      <MonatsabschlussDetailInner />
    </Suspense>
  )
}

const backBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--gold2)', cursor: 'pointer',
  fontSize: 14, padding: 0, marginBottom: 12, fontFamily: 'inherit',
}
const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontFamily: 'inherit',
}
const disabledBtn: React.CSSProperties = {
  ...primaryBtn, background: 'var(--coal3)', color: 'var(--ink5)', cursor: 'not-allowed',
}
