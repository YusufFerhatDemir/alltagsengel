'use client'
import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import {
  euro, formatDate, summarizeBudget, AMPEL_META,
  ENTLASTUNGSBETRAG_MONAT, type Ampel,
} from '@/lib/admin/ops'
import { BUDGET_TYPE_SHORT, MONTH_NAMES } from '@/lib/kunde/leistungen'

interface BudgetRow {
  client_id: string
  year: number
  monthly_amount: number | null
  annual_amount: number | null
  carryover_amount: number | null
  carryover_expires: string | null
  used_amount: number | null
  used_from_carryover: number | null
  private_amount: number | null
  combined_annual_amount: number | null
  combined_used_amount: number | null
  combined_type: string | null
}

interface RecordRow {
  date: string
  amount: number | null
  budget_type: string | null
  status: string
}

// Ampel nach Admin-Logik: 🟢 < 70 % verbraucht · 🟡 70–95 % · 🔴 > 95 %
function ampelFromUsage(used: number, available: number): Ampel {
  if (available <= 0) return 'gruen'
  const pct = (used / available) * 100
  if (pct > 95 || available - used < 0) return 'rot'
  if (pct >= 70) return 'gelb'
  return 'gruen'
}

function ProgressBar({ used, available, ampel }: { used: number; available: number; ampel: Ampel }) {
  const pct = available > 0 ? Math.min(100, Math.round((used / available) * 100)) : 0
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 4,
          background: AMPEL_META[ampel].color, transition: 'width .3s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--ink4)' }}>
        <span>{euro(used)} verbraucht</span>
        <span style={{ color: AMPEL_META[ampel].color, fontWeight: 600 }}>{pct}%</span>
      </div>
    </div>
  )
}

function AmpelBadge({ ampel }: { ampel: Ampel }) {
  const meta = AMPEL_META[ampel]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
      borderRadius: 20, fontSize: 11, fontWeight: 600,
      color: meta.color, background: `${meta.color}1A`, border: `1px solid ${meta.color}40`,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
      {meta.label}
    </span>
  )
}

export default function KundeBudgetPage() {
  const router = useRouter()
  const [budget, setBudget] = useState<BudgetRow | null>(null)
  const [records, setRecords] = useState<RecordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const now = new Date()
  const year = now.getFullYear()
  const currentMonth = now.getMonth() // 0-basiert

  const load = async () => {
    setError('')
    setLoading(true)
    try {
      const user = await requireUser(router, { redirectTo: '/kunde/budget' })
      if (!user) return
      const supabase = createClient()

      // RLS filtert automatisch auf den eigenen Klienten (clients.user_id = auth.uid())
      const [budgetRes, recordsRes] = await Promise.all([
        supabase
          .from('client_budgets')
          .select('client_id, year, monthly_amount, annual_amount, carryover_amount, carryover_expires, used_amount, used_from_carryover, private_amount, combined_annual_amount, combined_used_amount, combined_type')
          .eq('year', year)
          .limit(1),
        supabase
          .from('service_records')
          .select('date, amount, budget_type, status')
          .gte('date', `${year}-01-01`)
          .lte('date', `${year}-12-31`)
          .neq('status', 'draft')
          .order('date', { ascending: true }),
      ])

      if (budgetRes.error) throw new Error('Budget konnte nicht geladen werden')
      if (recordsRes.error) throw new Error('Leistungen konnten nicht geladen werden')

      setBudget((budgetRes.data && budgetRes.data[0]) || null)
      setRecords(recordsRes.data || [])
    } catch (err: any) {
      setError(err?.message || 'Ein Fehler beim Laden des Budgets ist aufgetreten')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
     
  }, [])

  // ── Monatsaufstellung: Summe je Monat und Budgettopf ──
  const monthly = useMemo(() => {
    const rows: { month: number; entlastung: number; verhinderung: number; carryover: number; privat: number; total: number }[] = []
    for (let m = 0; m <= currentMonth; m++) {
      rows.push({ month: m, entlastung: 0, verhinderung: 0, carryover: 0, privat: 0, total: 0 })
    }
    for (const r of records) {
      const m = new Date(r.date).getMonth()
      const row = rows[m]
      if (!row) continue
      const amt = Number(r.amount) || 0
      if (r.budget_type === 'entlastung') row.entlastung += amt
      else if (r.budget_type === 'verhinderung') row.verhinderung += amt
      else if (r.budget_type === 'carryover') row.carryover += amt
      else row.privat += amt
      row.total += amt
    }
    return rows.reverse() // neuester Monat zuerst
  }, [records, currentMonth])

  // ── Aktueller Monat: Entlastungsbetrag ──
  const monthlyAmount = Number(budget?.monthly_amount) || ENTLASTUNGSBETRAG_MONAT
  const usedThisMonth = useMemo(() => {
    return records
      .filter(r => r.budget_type === 'entlastung' && new Date(r.date).getMonth() === currentMonth)
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  }, [records, currentMonth])
  const remainingThisMonth = monthlyAmount - usedThisMonth
  const monthAmpel = ampelFromUsage(usedThisMonth, monthlyAmount)

  // ── Jahres-Übersicht (wie Admin-Ampel) ──
  const summary = summarizeBudget(budget)

  // ── Verhinderungspflege §39 (kombinierter Topf §42a) ──
  const combinedAmount = Number(budget?.combined_annual_amount) || 0
  const combinedUsed = Number(budget?.combined_used_amount) || 0
  const combinedRemaining = combinedAmount - combinedUsed
  const combinedAmpel = ampelFromUsage(combinedUsed, combinedAmount)

  // ── Vorjahresübertrag ──
  const carryover = Number(budget?.carryover_amount) || 0
  const usedFromCarryover = Number(budget?.used_from_carryover) || 0

  const cardStyle: CSSProperties = {
    background: 'var(--white)', borderRadius: 16, padding: 16,
    border: '1px solid var(--border)', marginBottom: 12,
  }

  if (error && !loading) return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <p style={{ color: 'var(--ink3)', fontSize: 14, marginBottom: 16 }}>{error}</p>
      <button onClick={() => { setError(''); load() }} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,var(--gold),var(--gold2))', color: 'var(--coal)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Erneut versuchen</button>
    </div>
  )

  return (
    <div className="screen" id="kunde-budget">
      <div className="topbar" style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/kunde/home" className="back-btn" style={{ textDecoration: 'none' }}>‹</Link>
        <div className="topbar-title">Mein Budget</div>
      </div>

      <div style={{ padding: '0 20px' }}>
        {loading ? (
          <div className="chat-empty">Laden...</div>
        ) : !budget ? (
          <div className="chat-empty" style={{ paddingTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>💶</div>
            <div className="chat-empty-title">Noch kein Budget hinterlegt</div>
            <div className="chat-empty-sub">
              Sobald Ihre Betreuung eingerichtet ist, sehen Sie hier Ihren
              Entlastungsbetrag nach §45b SGB XI ({euro(ENTLASTUNGSBETRAG_MONAT)}/Monat).
            </div>
          </div>
        ) : (
          <>
            {/* ── Entlastungsbetrag — aktueller Monat ── */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Entlastungsbetrag §45b SGB XI</div>
                  <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 2 }}>
                    {MONTH_NAMES[currentMonth]} {year} · {euro(monthlyAmount)}/Monat
                  </div>
                </div>
                <AmpelBadge ampel={monthAmpel} />
              </div>
              <ProgressBar used={usedThisMonth} available={monthlyAmount} ampel={monthAmpel} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink4)' }}>Verbraucht</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{euro(usedThisMonth)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink4)' }}>Verbleibend im Monat</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: remainingThisMonth < 0 ? 'var(--red-w)' : 'var(--green)' }}>
                    {euro(remainingThisMonth)}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Entlastungsbetrag — Jahresübersicht ── */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Jahresbudget {year}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 2 }}>
                    {euro(Number(budget.annual_amount) || 0)} Jahresbetrag
                    {summary.carryover > 0 && ` + ${euro(summary.carryover)} Übertrag`}
                  </div>
                </div>
                <AmpelBadge ampel={summary.ampel} />
              </div>
              <ProgressBar used={summary.used} available={summary.available} ampel={summary.ampel} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink4)' }}>Verfügbar gesamt</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{euro(summary.available)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink4)' }}>Verbleibend im Jahr</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: summary.remaining < 0 ? 'var(--red-w)' : 'var(--green)' }}>
                    {euro(summary.remaining)}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Vorjahresübertrag ── */}
            {carryover > 0 && (
              <div style={{
                ...cardStyle,
                border: summary.carryoverExpiresSoon ? '1px solid rgba(232,160,0,.4)' : summary.carryoverExpired ? '1px solid rgba(208,75,59,.4)' : '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Übertrag aus dem Vorjahr</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--ink4)' }}>Übertragen</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{euro(carryover)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--ink4)' }}>Davon verbraucht</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{euro(usedFromCarryover)}</div>
                  </div>
                </div>
                {budget.carryover_expires && (
                  <div style={{
                    marginTop: 10, padding: '8px 10px', borderRadius: 10, fontSize: 12,
                    background: summary.carryoverExpired ? 'rgba(208,75,59,.12)' : 'rgba(232,160,0,.12)',
                    color: summary.carryoverExpired ? 'var(--red-w)' : '#E8A000',
                  }}>
                    {summary.carryoverExpired
                      ? `⚠️ Übertrag ist am ${formatDate(budget.carryover_expires)} verfallen`
                      : `⏳ Übertrag verfällt am ${formatDate(budget.carryover_expires)} — bitte zuerst verbrauchen`}
                  </div>
                )}
              </div>
            )}

            {/* ── Verhinderungspflege §39 ── */}
            {combinedAmount > 0 && (
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Verhinderungspflege §39 SGB XI</div>
                    <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 2 }}>
                      Gemeinsamer Jahresbetrag (§42a) · {euro(combinedAmount)}
                    </div>
                  </div>
                  <AmpelBadge ampel={combinedAmpel} />
                </div>
                <ProgressBar used={combinedUsed} available={combinedAmount} ampel={combinedAmpel} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--ink4)' }}>Verbraucht</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{euro(combinedUsed)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--ink4)' }}>Verbleibend</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: combinedRemaining < 0 ? 'var(--red-w)' : 'var(--green)' }}>
                      {euro(combinedRemaining)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Monatsaufstellung ── */}
            <div className="section-label" style={{ marginTop: 8 }}>Monatsaufstellung {year}</div>
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--ink4)', fontWeight: 600 }}>Monat</th>
                    <th style={{ textAlign: 'right', padding: '10px 6px', color: 'var(--ink4)', fontWeight: 600 }}>{BUDGET_TYPE_SHORT.entlastung}</th>
                    <th style={{ textAlign: 'right', padding: '10px 6px', color: 'var(--ink4)', fontWeight: 600 }}>{BUDGET_TYPE_SHORT.verhinderung}</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--ink4)', fontWeight: 600 }}>Gesamt</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.every(m => m.total === 0) ? (
                    <tr>
                      <td colSpan={4} style={{ padding: '18px 12px', textAlign: 'center', color: 'var(--ink4)' }}>
                        Noch keine Leistungen in {year}
                      </td>
                    </tr>
                  ) : monthly.map(m => (
                    <tr key={m.month} style={{ borderBottom: '1px solid var(--border)', background: m.month === currentMonth ? 'var(--gold-pale)' : 'transparent' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--ink)', fontWeight: m.month === currentMonth ? 700 : 500 }}>
                        {MONTH_NAMES[m.month]}
                      </td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--ink2, var(--ink))' }}>
                        {m.entlastung + m.carryover > 0 ? euro(m.entlastung + m.carryover) : '—'}
                      </td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--ink2, var(--ink))' }}>
                        {m.verhinderung > 0 ? euro(m.verhinderung) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--ink)' }}>
                        {m.total > 0 ? euro(m.total) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p style={{ fontSize: 11, color: 'var(--ink5)', lineHeight: 1.5, margin: '4px 2px 0' }}>
              Der Entlastungsbetrag nach §45b SGB XI beträgt {euro(ENTLASTUNGSBETRAG_MONAT)} pro Monat.
              Nicht genutzte Beträge werden ins Folgejahr übertragen und verfallen dort zum 30. Juni.
            </p>
          </>
        )}
        <div style={{ height: 90 }}></div>
      </div>
    </div>
  )
}
