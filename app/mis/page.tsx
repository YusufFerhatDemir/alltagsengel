'use client'
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND, FINANCIAL_PROJECTIONS, UNIT_ECONOMICS, MARKET_DATA } from '@/lib/mis/constants'
import { useMis } from '@/lib/mis/MisContext'
import { KpiCard, SectionHeader, Card, MiniBarChart, ProgressBar, ActivityItem, StatRow, MisButton, Badge, DataTable } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'

// ===== DASHBOARD: Control Pilot View =====
export default function DashboardPage() {
  const [stats, setStats] = useState({ users: 0, bookings: 0, angels: 0, revenue: 0 })
  const [recentBookings, setRecentBookings] = useState<Record<string,unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const { isMobile } = useMis()

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    const supabase = createClient()
    try {
      const [{ count: userCount }, { count: bookingCount }, { count: angelCount }, { data: bookings }] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('bookings').select('*', { count: 'exact', head: true }),
        supabase.from('angels').select('*', { count: 'exact', head: true }),
        supabase.from('bookings').select('*, customer:profiles!customer_id(first_name,last_name), angel:profiles!angel_id(first_name,last_name)').order('created_at', { ascending: false }).limit(5),
      ])
      setStats({
        users: userCount || 0,
        bookings: bookingCount || 0,
        angels: angelCount || 0,
        revenue: (bookingCount || 0) * UNIT_ECONOMICS.billingRatePerHour,
      })
      setRecentBookings(bookings || [])
    } catch (e) {
      console.error('Dashboard load error:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionHeader
        title="Kontrollzentrum"
        subtitle="Echtzeit-Übersicht aller Geschäftskennzahlen"
        icon="gauge"
        actions={
          <MisButton icon={loading ? 'clock' : 'refresh'} variant="secondary" onClick={async () => {
            setLoading(true)
            await loadDashboardData()
          }} disabled={loading}>
            {loading ? 'Lädt...' : 'Aktualisieren'}
          </MisButton>
        }
      />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: isMobile ? 10 : 16 }}>
        <KpiCard title="Benutzer" value={stats.users} icon="users" trend="up" />
        <KpiCard title="Buchungen" value={stats.bookings} icon="calendar" trend="up" />
        <KpiCard title="Engel" value={stats.angels} icon="wings" trend="up" color={BRAND.success} />
        <KpiCard title="Umsatz" value={`€${stats.revenue.toLocaleString('de-DE')}`} icon="banknote" trend="up" color={BRAND.gold} />
      </div>

      {/* Market Opportunity */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: isMobile ? 10 : 16 }}>
        <KpiCard title="TAM" value="50" unit="Mrd. €" icon="globe" trend="up" />
        <KpiCard title="SAM" value="7,80" unit="Mrd. €" icon="target" trend="up" />
        <KpiCard title="Ungenutzt" value="4,68" unit="Mrd. €" icon="zap" trend="up" color={BRAND.error} />
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: isMobile ? 14 : 20 }}>
        {/* Revenue Projection */}
        <Card title="5-Jahres-Umsatzprognose" icon="chart" >
          <MiniBarChart
            data={FINANCIAL_PROJECTIONS.revenue}
            labels={FINANCIAL_PROJECTIONS.years}
            height={160}
          />
          <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
            <StatRow label="Break-Even" value="~Monat 10-12" />
            <StatRow label="Jahr-5 Umsatz" value="€58,5M" />
            <StatRow label="Bruttomarge" value="~50%" />
          </div>
        </Card>

        {/* Unit Economics */}
        <Card title="Einheitsökonomie" icon="pieChart" >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <StatRow label="Abrechnungssatz" value={`€${UNIT_ECONOMICS.billingRatePerHour}/Std.`} />
            <StatRow label="Engel-Vergütung" value={`€${UNIT_ECONOMICS.helperPayPerHour}/Std.`} />
            <StatRow label="Bruttomarge" value={`${(UNIT_ECONOMICS.marginPercent * 100).toFixed(0)}%`} />
            <StatRow label="Marge/Kunde/Mon." value={`€${UNIT_ECONOMICS.marginPerCustomerMonth}`} />
            <StatRow label="CAC" value={`€${UNIT_ECONOMICS.cac}`} />
            <StatRow label="LTV" value={`€${UNIT_ECONOMICS.ltv}`} />
            <StatRow label="LTV/CAC" value={`${UNIT_ECONOMICS.ltvCacRatio}x`} />
            <StatRow label="Payback" value={`${UNIT_ECONOMICS.paybackMonths} Mon.`} />
            <StatRow label="Entlastungsbetrag" value={`€${UNIT_ECONOMICS.entlastungsbetrag}/Mon.`} />
          </div>
        </Card>
      </div>

      {/* Second Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: isMobile ? 14 : 20 }}>
        {/* Quick Actions */}
        <Card title="Schnellaktionen" icon="zap" >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { icon: 'upload', label: 'Dokument hochladen', href: '/mis/documents' },
              { icon: 'chart', label: 'Finanzbericht erstellen', href: '/mis/finance' },
              { icon: 'shield', label: 'Audit planen', href: '/mis/quality' },
              { icon: 'users', label: 'Teammitglied hinzufügen', href: '/mis/team' },
              { icon: 'sparkles', label: 'KI-Analyse starten', href: '/mis/ai-assistant' },
            ].map((action, i) => (
              <a key={i} href={action.href} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 8, textDecoration: 'none', color: BRAND.text,
                border: `1px solid ${BRAND.border}`, fontSize: 13, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = BRAND.light; e.currentTarget.style.borderColor = BRAND.gold }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = BRAND.border }}
              >
                <span style={{ color: BRAND.gold }}><MIcon name={action.icon} size={16} /></span>
                {action.label}
              </a>
            ))}
          </div>
        </Card>

        {/* System Health */}
        <Card title="Systemstatus" icon="activity" >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ProgressBar value={95} label="API-Verfügbarkeit" color={BRAND.success} />
            <ProgressBar value={42} label="Speicherauslastung" color={BRAND.gold} />
            <ProgressBar value={78} label="ISO 9001 Compliance" color={BRAND.info} />
            <ProgressBar value={65} label="Dokumentation vollständig" color={BRAND.warning} />
            <ProgressBar value={30} label="Seed-Runde Fortschritt" color={BRAND.gold} />
          </div>
        </Card>

        {/* Recent Activity */}
        <Card title="Letzte Aktivitäten" icon="clock" >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <ActivityItem icon="files" title="Pitch Deck v2 hochgeladen" time="vor 2 Stunden" />
            <ActivityItem icon="shield" title="QP-002 Audit abgeschlossen" time="vor 5 Stunden" color={BRAND.success} />
            <ActivityItem icon="users" title="Neuer Engel registriert" time="vor 1 Tag" color={BRAND.info} />
            <ActivityItem icon="banknote" title="Finanzprognose aktualisiert" time="vor 2 Tagen" color={BRAND.gold} />
            <ActivityItem icon="truck" title="Lieferant bewertet" time="vor 3 Tagen" />
          </div>
        </Card>
      </div>

      {/* User Growth Chart */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: isMobile ? 14 : 20 }}>
        <Card title="Nutzerwachstum (5 Jahre)" icon="trending">
          <MiniBarChart
            data={FINANCIAL_PROJECTIONS.users}
            labels={FINANCIAL_PROJECTIONS.years}
            color={BRAND.info}
            height={140}
          />
        </Card>
        <Card title="Buchungen (5 Jahre)" icon="calendar">
          <MiniBarChart
            data={FINANCIAL_PROJECTIONS.bookings}
            labels={FINANCIAL_PROJECTIONS.years}
            color={BRAND.success}
            height={140}
          />
        </Card>
      </div>

      {/* Recent Bookings Table */}
      {recentBookings.length > 0 && (
        <Card title="Letzte Buchungen" icon="calendar" noPad>
          <DataTable
            columns={[
              { key: 'service', label: 'Service' },
              { key: 'customer', label: 'Kunde', render: (r: Record<string,unknown>) => {
                const c = r.customer as Record<string,unknown> | null
                return c ? `${c.first_name} ${((c.last_name as string) || '').charAt(0)}.` : '—'
              }},
              { key: 'status', label: 'Status', render: (r: Record<string,unknown>) => (
                <Badge label={String(r.status)} color={r.status === 'completed' ? BRAND.success : r.status === 'pending' ? BRAND.warning : BRAND.info} />
              )},
              { key: 'total_amount', label: 'Betrag', render: (r: Record<string,unknown>) => `€${Number(r.total_amount || 0).toFixed(2)}` },
            ]}
            data={recentBookings}
          />
        </Card>
      )}

      {/* Seed Round Info */}
      <Card style={{ background: `linear-gradient(135deg, ${BRAND.coal}, #2D2820)`, border: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <h3 style={{ fontSize: 22, fontWeight: 700, color: BRAND.cream, fontFamily: 'var(--font-cormorant), serif', margin: '0 0 6px' }}>
              Seed-Runde: €500.000
            </h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
              Pre-Money Bewertung: €2,5M — Ziel: Marktvalidierung, Teamaufbau, Skalierung
            </p>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: BRAND.gold, fontFamily: 'var(--font-cormorant), serif' }}>40%</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Produkt</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: BRAND.gold, fontFamily: 'var(--font-cormorant), serif' }}>30%</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Marketing</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: BRAND.gold, fontFamily: 'var(--font-cormorant), serif' }}>20%</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Team</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: BRAND.gold, fontFamily: 'var(--font-cormorant), serif' }}>10%</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Reserve</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
