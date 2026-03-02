'use client'

import { Icons } from '../docs/shared'
import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, StatBox, TableRow, Badge, C, GoldSep, SectionLabel } from '../docs/shared'

export default function FinanzplanPage() {
  return (
    <DocPageLayout
      title="Finanzplan"
      subtitle="5-Jahres-Umsatzprognose & Kennzahlen"
      icon={Icons.coins(32)}
      badge="Finanzen"
      lang="de"
    >
      {/* Überblick */}
      <Card>
        <SectionTitle>Finanzprognose – Überblick</SectionTitle>
        <Paragraph>
          AlltagsEngel projiziert exponentielles Wachstum basierend auf einer konservativen Marktpenetration und bewährten Unit Economics aus Beta-Tests. Der folgende Plan zeigt eine realistische 5-Jahres-Prognose mit Key Milestones.
        </Paragraph>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
          <StatBox value="Jahr 1" label="MVP Launch & lokales Growth (Frankfurt)" />
          <StatBox value="Jahr 2" label="Regionale Expansion (Rhein-Main)" />
          <StatBox value="Jahr 3" label="Nationale Skalierung (Deutschland)" />
          <StatBox value="Jahr 5" label="75K Nutzer, €2,5M MRR" />
        </div>
      </Card>

      {/* Revenue Tabelle */}
      <Card>
        <SectionTitle>Umsatzprognose & Kennzahlen</SectionTitle>
        <div style={{ overflowX: 'auto', marginTop: '1.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #D4AF37' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: '#D4AF37', fontWeight: '600' }}>Zeitraum</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Aktive Nutzer</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Reg. Engel</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Buchungen/Mo</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>MRR</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 1 (Q1–Q4)</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>50</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>1.500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€10.800</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 2</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>2.500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>150</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>6.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€43.200</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 3</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>10.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>24.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€172.800</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 4</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>35.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>2.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>84.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€604.800</td>
              </tr>
              <tr>
                <td style={{ padding: '0.75rem' }}>Jahr 5</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>75.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>5.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>180.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€1.296.000</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Paragraph style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#B0B0B0' }}>
          MRR = Monthly Recurring Revenue (18% Provision auf Buchungswert €40 = €7,20 pro Transaktion)
        </Paragraph>
      </Card>

      {/* Kostenstruktur */}
      <Card>
        <SectionTitle>Kostenstruktur & Profitabilität</SectionTitle>
        <div style={{ overflowX: 'auto', marginTop: '1.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #D4AF37' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: '#D4AF37', fontWeight: '600' }}>Jahr</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>MRR</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Kosten/Mo</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Profit/Mo</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Jahresgewinn</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 1</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€10.800</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€30.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#FF6B6B' }}>-€19.200</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#FF6B6B', fontWeight: '600' }}>-€230.400</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 2</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€43.200</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€32.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80' }}>€11.200</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80', fontWeight: '600' }}>€134.400</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 3</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€172.800</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€37.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80' }}>€135.800</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80', fontWeight: '600' }}>€1.629.600</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 4</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€604.800</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€45.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80' }}>€559.800</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80', fontWeight: '600' }}>€6.717.600</td>
              </tr>
              <tr>
                <td style={{ padding: '0.75rem' }}>Jahr 5</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€1.296.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€55.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80' }}>€1.241.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80', fontWeight: '600' }}>€14.892.000</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Liquiditätsplanung */}
      <Card>
        <SectionTitle>Liquiditätsplanung & Runway</SectionTitle>
        <Paragraph>
          Mit einer Seed-Finanzierung von €500.000 und monatlichen Kosten von €30.000–€35.000 beträgt die Runway:
        </Paragraph>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
          <StatBox value="€500.000" label="Seed-Kapital" />
          <StatBox value="€30.000" label="Monatliche Kosten (M1)" />
          <StatBox value="16,7 Monate" label="Runway bis Erschöpfung" />
          <StatBox value="15 Monate" label="Realistisches Break-Even" />
        </div>
        <Paragraph style={{ fontSize: '0.9rem', color: '#B0B0B0' }}>
          Nach ~15 Monaten wird AlltagsEngel Break-Even erreichen, wenn die Wachstumsziele erfüllt werden. Eine Series A würde dann für die aggressive Skalierung benötigt.
        </Paragraph>
      </Card>

      {/* Break-Even Analyse */}
      <Card>
        <SectionTitle>Break-Even Analyse</SectionTitle>
        <SectionLabel>Berechnung der Profitabilität</SectionLabel>
        <div style={{ marginBottom: '1.5rem' }}>
          <BulletItem><strong>Monatliche Kosten:</strong> €30.000 (frühe Phase)</BulletItem>
          <BulletItem><strong>Provision pro Buchung:</strong> €7.20 (18% von €40)</BulletItem>
          <BulletItem><strong>Nötige Buchungen für Break-Even:</strong> 30.000 / 7.20 = 4.167 Buchungen/Monat</BulletItem>
        </div>

        <Paragraph>
          <strong style={{color:'#C9963C'}}>Bei 500 aktiven Nutzern sind durchschnittlich 8–10 Buchungen pro Nutzer/Monat nötig für Break-Even.</strong> Dies ist konservativ, da Premium-Abos und B2B-Partnerschaften zusätzliche Revenue generieren.
        </Paragraph>
      </Card>

      {/* Sensitivitätsanalyse */}
      <Card>
        <SectionTitle>Sensitivitätsanalyse</SectionTitle>
        <SectionLabel>Auswirkung von Variationen im Wachstum</SectionLabel>
        <div style={{ overflowX: 'auto', marginTop: '1.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #D4AF37' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: '#D4AF37', fontWeight: '600' }}>Szenario</th>
                <th style={{ padding: '0.75rem', textAlign: 'center', color: '#D4AF37', fontWeight: '600' }}>Nutzer J3</th>
                <th style={{ padding: '0.75rem', textAlign: 'center', color: '#D4AF37', fontWeight: '600' }}>MRR J3</th>
                <th style={{ padding: '0.75rem', textAlign: 'center', color: '#D4AF37', fontWeight: '600' }}>Break-Even</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}><strong style={{color:'#FF6B6B'}}>Pessimistisch</strong> (-50%)</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>5.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>€86.400</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#FF6B6B' }}>Never</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}><strong style={{color:'#C9963C'}}>Konservativ</strong> (-25%)</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>7.500</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>€129.600</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#C9963C' }}>M28</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}><strong style={{color: '#D4AF37'}}>Baseline</strong> (Plan)</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>10.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>€172.800</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#D4AF37' }}>M18</td>
              </tr>
              <tr>
                <td style={{ padding: '0.75rem' }}><strong style={{color: '#4ade80'}}>Optimistisch</strong> (+25%)</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>12.500</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>€216.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#4ade80' }}>M12</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Fundraising Roadmap */}
      <Card>
        <SectionTitle>Fundraising-Roadmap</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '4px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Seed Round (Q1 2025)</div>
            <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>€500.000</div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0', marginTop: '0.5rem' }}>Für MVP Entwicklung, Launch, erste 15 Monate Betrieb</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '4px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Series A (Q1 2026)</div>
            <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>€3–5 Millionen</div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0', marginTop: '0.5rem' }}>Für nationale Skalierung (Deutschland) mit Fokus auf Nutzer-Akquisition</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '4px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Series B (2027)</div>
            <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>€10–20 Millionen</div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0', marginTop: '0.5rem' }}>DACH-Expansion und erweiterte Produktfeatures</div>
          </div>
        </div>
      </Card>
    </DocPageLayout>
  )
}
