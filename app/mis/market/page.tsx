'use client'
import React from 'react'
import { BRAND, MARKET_DATA } from '@/lib/mis/constants'
import { SectionHeader, Card, KpiCard, StatRow, MiniBarChart, Badge, DataTable } from '@/components/mis/MisComponents'
import { useMis } from '@/lib/mis/MisContext'

const COMPETITORS = [
  { name: 'Careship', segment: 'Plattform', price: 'Ab €29/h', strengths: 'Bekannte Marke, breiteres Angebot', weakness: 'Keine §45b-Integration', threat: 'medium' },
  { name: 'Pflege.de', segment: 'Vermittlung', price: 'Kostenlos', strengths: 'Großes Netzwerk, SEO-stark', weakness: 'Nur Vermittlung, keine Buchung', threat: 'low' },
  { name: 'Home Instead', segment: 'Premium', price: 'Ab €35/h', strengths: 'Franchise-Modell, hohe Qualität', weakness: 'Teuer, wenig digital', threat: 'medium' },
  { name: 'Lokale Anbieter', segment: 'Traditionell', price: 'Variiert', strengths: 'Lokales Vertrauen', weakness: 'Keine Tech, keine Skalierung', threat: 'low' },
]

const DEMOGRAPHICS = [
  { year: '2020', count: 4.1 },
  { year: '2025', count: 4.96 },
  { year: '2030', count: 5.6 },
  { year: '2035', count: 6.2 },
  { year: '2040', count: 6.9 },
]

export default function MarketPage() {
  const { isMobile } = useMis()
  const M = MARKET_DATA

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader title="Marktanalyse" subtitle="TAM/SAM/SOM, Wettbewerb und demografische Entwicklung" icon="trending" />

      {/* TAM SAM SOM */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: isMobile ? 10 : 16 }}>
        <KpiCard title="TAM" value="€24,6 Mrd." icon="globe" trend="up" />
        <KpiCard title="SAM" value="€7,80 Mrd." icon="target" trend="up" />
        <KpiCard title="SOM (Jahr 5)" value="€52 Mio." icon="zap" trend="up" color={BRAND.success} />
        <KpiCard title="Entlastungsbetrag" value={`€${M.entlastungsbetrag}`} unit="/Monat" icon="banknote" color={BRAND.gold} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: isMobile ? 12 : 20 }}>
        {/* Market Size */}
        <Card title="Marktchance" icon="pieChart">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <StatRow label="Pflegebedürftige (PG 1-5)" value="4,96 Mio." />
            <StatRow label="§45b Entlastungsbetrag" value={`€${M.entlastungsbetrag}/Monat`} />
            <StatRow label={`SAM = 4,96M × €${M.entlastungsbetrag} × 12`} value={`€${(M.sam / 1e9).toFixed(2)} Mrd.`} />
            <StatRow label="Ungenutzte Rate" value={`${(M.unusedRate * 100).toFixed(0)}%`} />
            <StatRow label="Ungenutztes Volumen" value={`€${(M.unusedVolume / 1e9).toFixed(2)} Mrd.`} />
          </div>
          <div style={{
            marginTop: 16, padding: 16, background: `${BRAND.gold}10`, borderRadius: 10,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: BRAND.muted }}>Das Problem</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: BRAND.error, fontFamily: 'var(--font-cormorant), serif' }}>
              €4,7 Mrd. jährlich ungenutzt
            </div>
            <div style={{ fontSize: 12, color: BRAND.muted }}>60% der Anspruchsberechtigten nutzen den Entlastungsbetrag nicht</div>
          </div>
        </Card>

        {/* Demographics */}
        <Card title="Demografische Entwicklung" icon="users">
          <MiniBarChart
            data={DEMOGRAPHICS.map(d => d.count)}
            labels={DEMOGRAPHICS.map(d => d.year)}
            color={BRAND.info}
            height={140}
          />
          <p style={{ fontSize: 12, color: BRAND.muted, marginTop: 12, textAlign: 'center' }}>
            Pflegebedürftige in Deutschland (Millionen) — Quelle: Statistisches Bundesamt
          </p>
        </Card>
      </div>

      {/* Competition */}
      <Card title="Wettbewerbslandschaft" icon="target" noPad>
        <DataTable
          columns={[
            { key: 'name', label: 'Wettbewerber', render: (r) => <span style={{ fontWeight: 600 }}>{r.name as string}</span> },
            { key: 'segment', label: 'Segment', render: (r) => <Badge label={r.segment as string} color={BRAND.info} size="sm" /> },
            { key: 'price', label: 'Preismodell' },
            { key: 'strengths', label: 'Stärken' },
            { key: 'weakness', label: 'Schwächen' },
            { key: 'threat', label: 'Bedrohung', render: (r) => (
              <Badge label={r.threat === 'high' ? 'Hoch' : r.threat === 'medium' ? 'Mittel' : 'Niedrig'}
                color={r.threat === 'high' ? BRAND.error : r.threat === 'medium' ? BRAND.warning : BRAND.success} size="sm" />
            )},
          ]}
          data={COMPETITORS as unknown as Record<string,unknown>[]}
        />
      </Card>

      {/* Competitive Advantage */}
      <Card title="Unser Wettbewerbsvorteil" icon="zap" style={{ background: `linear-gradient(135deg, ${BRAND.coal}, #2D2820)`, border: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: isMobile ? 10 : 16 }}>
          {[
            { title: '§45b Integration', desc: 'Einzige Plattform mit direkter Abrechnung über den Entlastungsbetrag' },
            { title: 'Zweisei­tiger Marktplatz', desc: 'Matching-Algorithmus verbindet Kunden und zertifizierte Engel' },
            { title: 'Volldigital', desc: 'Mobile-First App mit Echtzeit-Buchung, Bewertung und Zahlung' },
          ].map((item, i) => (
            <div key={i} style={{ padding: 16, background: 'rgba(255,255,255,0.06)', borderRadius: 10, border: `1px solid rgba(255,255,255,0.1)` }}>
              <h4 style={{ fontSize: 14, color: BRAND.gold, fontWeight: 700, margin: '0 0 6px' }}>{item.title}</h4>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
