'use client'
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND, FINANCIAL_PROJECTIONS, UNIT_ECONOMICS } from '@/lib/mis/constants'
import { SectionHeader, Card, KpiCard, MiniBarChart, DataTable, StatRow, ProgressBar, Tabs, MisButton, Badge } from '@/components/mis/MisComponents'
import { useMis } from '@/lib/mis/MisContext'
import type { BudgetItem } from '@/lib/mis/types'

export default function FinancePage() {
  const { isMobile } = useMis()
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([])
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    const supabase = createClient()
    supabase.from('mis_budget_items').select('*').order('category').then(({ data }) => {
      setBudgetItems(data as BudgetItem[] || [])
    })
  }, [])

  const FP = FINANCIAL_PROJECTIONS
  const UE = UNIT_ECONOMICS

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader title="Finanzen" subtitle="Prognosen, Budget-Tracking und Finanzberichte" icon="banknote" />

      <Tabs tabs={[
        { id: 'overview', label: 'Übersicht', icon: 'gauge' },
        { id: 'projections', label: '5-Jahres-Prognose', icon: 'trending' },
        { id: 'budget', label: 'Budget', icon: 'banknote' },
        { id: 'unit-economics', label: 'Unit Economics', icon: 'pieChart' },
      ]} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16 }}>
            <KpiCard title="Seed-Runde" value="€500K" icon="target" color={BRAND.gold} />
            <KpiCard title="Bewertung" value="€2,5M" icon="trending" trend="up" />
            <KpiCard title="Burn Rate" value="€12K" unit="/Monat" icon="activity" color={BRAND.warning} />
            <KpiCard title="Runway" value="~42" unit="Monate" icon="clock" color={BRAND.success} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 12 : 20 }}>
            <Card title="Umsatzentwicklung" icon="chart">
              <MiniBarChart data={FP.revenue} labels={FP.years} height={150} />
            </Card>
            <Card title="Gewinn/Verlust" icon="trending">
              <MiniBarChart data={FP.profit.map(v => Math.abs(v))} labels={FP.years} color={BRAND.success} height={150} />
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: BRAND.muted, flexWrap: 'wrap' }}>
                {FP.years.map((y, i) => (
                  <span key={y} style={{ color: FP.profit[i] >= 0 ? BRAND.success : BRAND.error }}>
                    {y}: {FP.profit[i] >= 0 ? '+' : ''}{(FP.profit[i]/1e6).toFixed(1)}M
                  </span>
                ))}
              </div>
            </Card>
          </div>
          <Card title="Mittelverwendung (Seed €500K)" icon="pieChart">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ProgressBar value={40} label="Produktentwicklung (€200K)" color={BRAND.gold} />
              <ProgressBar value={30} label="Marketing & Vertrieb (€150K)" color={BRAND.info} />
              <ProgressBar value={20} label="Teamaufbau (€100K)" color={BRAND.success} />
              <ProgressBar value={10} label="Reserve & Betrieb (€50K)" color={BRAND.muted} />
            </div>
          </Card>
        </>
      )}

      {activeTab === 'projections' && (
        <Card title="5-Jahres-Finanzprognose" icon="trending" noPad>
          <DataTable
            columns={[
              { key: 'year', label: 'Jahr' },
              { key: 'revenue', label: 'Umsatz', render: (r) => `€${(Number(r.revenue)/1e3).toLocaleString('de-DE')}K` },
              { key: 'costs', label: 'Kosten', render: (r) => `€${(Number(r.costs)/1e3).toLocaleString('de-DE')}K` },
              { key: 'profit', label: 'Gewinn', render: (r) => {
                const p = Number(r.profit)
                return <span style={{ color: p >= 0 ? BRAND.success : BRAND.error, fontWeight: 600 }}>{p >= 0 ? '+' : ''}{(p/1e3).toLocaleString('de-DE')}K</span>
              }},
              { key: 'users', label: 'Nutzer', render: (r) => Number(r.users).toLocaleString('de-DE') },
              { key: 'bookings', label: 'Buchungen', render: (r) => Number(r.bookings).toLocaleString('de-DE') },
              { key: 'margin', label: 'Marge', render: (r) => {
                const m = ((Number(r.profit) / Number(r.revenue)) * 100).toFixed(0)
                return <Badge label={`${m}%`} color={Number(m) >= 0 ? BRAND.success : BRAND.error} size="sm" />
              }},
            ]}
            data={FP.years.map((year, i) => ({
              year, revenue: FP.revenue[i], costs: FP.costs[i], profit: FP.profit[i],
              users: FP.users[i], bookings: FP.bookings[i],
            }))}
          />
        </Card>
      )}

      {activeTab === 'budget' && (
        <>
          {budgetItems.length === 0 ? (
            <Card>
              <div style={{ padding: 40, textAlign: 'center', color: BRAND.muted }}>
                <p>Noch keine Budget-Einträge vorhanden.</p>
                <MisButton icon="plus" variant="secondary">Budget-Eintrag hinzufügen</MisButton>
              </div>
            </Card>
          ) : (
            <Card title="Budget-Tracking" icon="banknote" noPad>
              <DataTable
                columns={[
                  { key: 'category', label: 'Kategorie' },
                  { key: 'period', label: 'Zeitraum' },
                  { key: 'planned_amount', label: 'Geplant', render: (r) => `€${Number(r.planned_amount).toLocaleString('de-DE')}` },
                  { key: 'actual_amount', label: 'Tatsächlich', render: (r) => `€${Number(r.actual_amount).toLocaleString('de-DE')}` },
                  { key: 'variance', label: 'Abweichung', render: (r) => {
                    const diff = Number(r.actual_amount) - Number(r.planned_amount)
                    return <span style={{ color: diff <= 0 ? BRAND.success : BRAND.error, fontWeight: 600 }}>{diff <= 0 ? '' : '+'}{diff.toLocaleString('de-DE')} €</span>
                  }},
                ]}
                data={budgetItems as unknown as Record<string,unknown>[]}
              />
            </Card>
          )}
        </>
      )}

      {activeTab === 'unit-economics' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 12 : 20 }}>
          <Card title="Einheitsökonomie" icon="pieChart">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <StatRow label="Abrechnungssatz (Pflegekasse)" value={`€${UE.billingRatePerHour}/Std.`} />
              <StatRow label="Engel-Vergütung (fest)" value={`€${UE.helperPayPerHour}/Std.`} />
              <StatRow label="Plattform-Marge/Std." value={`€${UE.marginPerHour}`} />
              <StatRow label="Bruttomarge" value={`${(UE.marginPercent * 100).toFixed(0)}%`} />
              <StatRow label="Ø Stunden/Kunde/Monat" value={`${UE.avgHoursPerCustomerMonth}`} />
              <StatRow label="Marge/Kunde/Monat" value={`€${UE.marginPerCustomerMonth}`} />
              <StatRow label="Kundenakquisekosten (CAC)" value={`€${UE.cac}`} />
              <StatRow label="Lifetime Value (LTV)" value={`€${UE.ltv.toLocaleString('de-DE')}`} />
              <StatRow label="LTV / CAC Ratio" value={`${UE.ltvCacRatio}x`} subValue="(Ziel: >3x)" />
              <StatRow label="Payback Period" value={`${UE.paybackMonths} Monate`} />
              <StatRow label="Monatliche Churn Rate" value={`${(UE.monthlyChurn * 100).toFixed(1)}%`} />
            </div>
          </Card>
          <Card title="Entlastungsbetrag §45b" icon="banknote">
            <div style={{ padding: 20, textAlign: 'center', background: `${BRAND.gold}10`, borderRadius: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 42, fontWeight: 700, color: BRAND.gold, fontFamily: 'var(--font-cormorant), serif' }}>€{UE.entlastungsbetrag}</div>
              <div style={{ fontSize: 13, color: BRAND.muted }}>pro Monat / pro Person (seit 2026)</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <StatRow label="Jährlich pro Person" value={`€${(UE.entlastungsbetrag * 12).toLocaleString('de-DE')}`} />
              <StatRow label="Anspruchsberechtigte" value="4,96 Mio." />
              <StatRow label="Gesamtvolumen/Jahr" value="€7,84 Mrd." />
              <StatRow label="Davon ungenutzt (60%)" value="€4,46 Mrd." />
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
