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
          AlltagsEngel projiziert exponentielles Wachstum basierend auf Direktabrechnung mit Pflegekassen und einer konservativen Marktpenetration. Der folgende Plan zeigt eine realistische 5-Jahres-Prognose mit Key Milestones. Helfer erhalten eine feste Vergütung von €20/Std., die Plattform-Marge beträgt ~€15–20/Std. (~50%).
        </Paragraph>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
          <StatBox value="Jahr 1" label="MVP Launch & lokales Growth (Frankfurt)" />
          <StatBox value="Jahr 2" label="Regionale Expansion (Rhein-Main)" />
          <StatBox value="Jahr 3" label="Nationale Skalierung (Deutschland)" />
          <StatBox value="Jahr 5" label="75K Nutzer, €4,9M MRR" />
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
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Marge/Kunde/Mo</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>MRR</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 1 (Q1–Q4)</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>50</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€65</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€32.500</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 2</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>2.500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>150</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€65</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€162.500</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 3</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>10.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€65</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€650.000</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 4</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>36.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>2.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€65</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€2.340.000</td>
              </tr>
              <tr>
                <td style={{ padding: '0.75rem' }}>Jahr 5</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>75.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>5.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€65</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€4.875.000</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Paragraph style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#B0B0B0' }}>
          MRR = Monthly Recurring Revenue. Plattform-Marge aus Direktabrechnung mit Pflegekassen (~€40/Std.) abzgl. fester Engel-Vergütung (€20/Std.) = ~€65 Marge/Kunde/Monat
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
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€32.500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€35.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#FF6B6B' }}>-€2.500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#FF6B6B', fontWeight: '600' }}>-€30.000</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 2</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€162.500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€80.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80' }}>€82.500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80', fontWeight: '600' }}>€990.000</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 3</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€650.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€267.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80' }}>€383.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80', fontWeight: '600' }}>€4.596.000</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 4</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€2.340.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€817.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80' }}>€1.523.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80', fontWeight: '600' }}>€18.276.000</td>
              </tr>
              <tr>
                <td style={{ padding: '0.75rem' }}>Jahr 5</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€4.875.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€1.625.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80' }}>€3.250.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80', fontWeight: '600' }}>€39.000.000</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Liquiditätsplanung */}
      <Card>
        <SectionTitle>Liquiditätsplanung & Runway</SectionTitle>
        <Paragraph>
          Mit einer Seed-Finanzierung von €500.000 und monatlichen Kosten von €35.000 beträgt die Runway:
        </Paragraph>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
          <StatBox value="€500.000" label="Seed-Kapital" />
          <StatBox value="€35.000" label="Monatliche Kosten (M1)" />
          <StatBox value="14,3 Monate" label="Runway bis Erschöpfung" />
          <StatBox value="12 Monate" label="Realistisches Break-Even" />
        </div>
        <Paragraph style={{ fontSize: '0.9rem', color: '#B0B0B0' }}>
          Nach ~12 Monaten wird AlltagsEngel Break-Even erreichen, wenn die Wachstumsziele erfüllt werden. Eine Series A würde dann für die aggressive Skalierung benötigt.
        </Paragraph>
      </Card>

      {/* Break-Even Analyse */}
      <Card>
        <SectionTitle>Break-Even Analyse</SectionTitle>
        <SectionLabel>Berechnung der Profitabilität</SectionLabel>
        <div style={{ marginBottom: '1.5rem' }}>
          <BulletItem><strong>Monatliche Kosten:</strong> €35.000 (frühe Phase)</BulletItem>
          <BulletItem><strong>Marge pro Kunde:</strong> €65/Monat (Direktabrechnung mit Pflegekassen ~€40/Std. abzgl. €20/Std. Engel-Vergütung)</BulletItem>
          <BulletItem><strong>Benötigte aktive Kunden:</strong> 35.000 / 65 = ~540 Kunden für Break-Even</BulletItem>
        </div>

        <Paragraph>
          <strong style={{color:'#C9963C'}}>Mit ~540 aktiven Kunden wird Break-Even erreicht.</strong> Ab Jahr 2: Zusätzlicher Umsatz durch Krankentransport-Vermittlung (B2B-Abo + Vermittlungsgebühr).
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
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>€325.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#FF6B6B' }}>M24</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}><strong style={{color:'#C9963C'}}>Konservativ</strong> (-25%)</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>7.500</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>€487.500</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#C9963C' }}>M16</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}><strong style={{color: '#D4AF37'}}>Baseline</strong> (Plan)</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>10.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>€650.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#D4AF37' }}>M12</td>
              </tr>
              <tr>
                <td style={{ padding: '0.75rem' }}><strong style={{color: '#4ade80'}}>Optimistisch</strong> (+25%)</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>12.500</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>€812.500</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#4ade80' }}>M8</td>
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
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0', marginTop: '0.5rem' }}>Für MVP Entwicklung, Launch, erste 12 Monate Betrieb inkl. Pflegekassen-Zulassung</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '4px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Series A (Q1 2026)</div>
            <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>€3–5 Millionen</div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0', marginTop: '0.5rem' }}>Für nationale Skalierung (Deutschland) mit Fokus auf Nutzer-Akquisition + Krankentransport-Launch</div>
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
