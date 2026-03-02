'use client'

import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, StatBox, TableRow, Badge, C, GoldSep, SectionLabel } from '../docs/shared'

export default function FinanzplanPage() {
  return (
    <DocPageLayout
      title="Finanzplan"
      subtitle="5-Jahres-Umsatzprognose & Kennzahlen"
      icon="💰"
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
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Buchungen/Monat</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Monatl. Umsatz</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Jahresumsatz</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Monat 1–3</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>150</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>20</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€3,6K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>—</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Monat 4–6</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>300</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>35</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>1.200</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€8,6K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>—</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Monat 7–12</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>50</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>2.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€14,4K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€80K (geschätzt)</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333', backgroundColor: '#0d1117' }}>
                <td style={{ padding: '0.75rem', color: '#D4AF37', fontWeight: '600' }}>Jahr 1 (Ø)</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>300</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>35</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>1.230</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>€8,8K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>€80K</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 2</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>2.500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>150</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>8.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€57,6K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€580K</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 3</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>10.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>30.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€216K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€2,2M</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 4</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>35.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>2.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>140.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€1,0M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€12M</td>
              </tr>
              <tr>
                <td style={{ padding: '0.75rem' }}>Jahr 5</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>75.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>5.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>450.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€2,5M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€30M</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Paragraph style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#B0B0B0' }}>
          <strong style={{color:'#C9963C'}}>Annahmen:</strong> Durchschnittlicher Buchungswert: €40 | Plattform-Provision: 18% (€7,20 pro Buchung) | Organisches Wachstum mit gezieltem Marketing
        </Paragraph>
      </Card>

      {/* Kosten Struktur Jahr 1 */}
      <Card>
        <SectionTitle>Kostenstruktur – Jahr 1 (detailliert)</SectionTitle>
        <SectionLabel>Personal:</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: '#1a1a1a', borderRadius: '0.25rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>CEO/Gründer (50%)</div>
            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>€8.000</div>
          </div>
          <div style={{ padding: '0.75rem', backgroundColor: '#1a1a1a', borderRadius: '0.25rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>CTO/Tech-Lead</div>
            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>€9.000</div>
          </div>
          <div style={{ padding: '0.75rem', backgroundColor: '#1a1a1a', borderRadius: '0.25rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>Operations Manager</div>
            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>€6.000</div>
          </div>
          <div style={{ padding: '0.75rem', backgroundColor: '#1a1a1a', borderRadius: '0.25rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>Marketing Specialist</div>
            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>€5.500</div>
          </div>
          <div style={{ padding: '0.75rem', backgroundColor: '#1a1a1a', borderRadius: '0.25rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>Support/Admin (0,5 FTE)</div>
            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>€2.700</div>
          </div>
          <div style={{ padding: '0.75rem', backgroundColor: '#1a1a1a', borderRadius: '0.25rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ fontSize: '0.85rem', color: '#D4AF37' }}>Personal gesamt</div>
            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#D4AF37' }}>€31.200/Monat</div>
          </div>
        </div>

        <SectionLabel style={{ marginTop: '1rem' }}>Betriebsausgaben:</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: '#1a1a1a', borderRadius: '0.25rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>Büro & Nebenkosten</div>
            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>€600</div>
          </div>
          <div style={{ padding: '0.75rem', backgroundColor: '#1a1a1a', borderRadius: '0.25rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>Software & Tools (Jira, AWS, etc.)</div>
            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>€200</div>
          </div>
          <div style={{ padding: '0.75rem', backgroundColor: '#1a1a1a', borderRadius: '0.25rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>Versicherungen (Haftung, Betrieb)</div>
            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>€300</div>
          </div>
          <div style={{ padding: '0.75rem', backgroundColor: '#1a1a1a', borderRadius: '0.25rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>Buchhaltung & Steuerberatung</div>
            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>€400</div>
          </div>
          <div style={{ padding: '0.75rem', backgroundColor: '#1a1a1a', borderRadius: '0.25rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>Marketing & Werbung</div>
            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>€600</div>
          </div>
          <div style={{ padding: '0.75rem', backgroundColor: '#1a1a1a', borderRadius: '0.25rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>Sonstiges (Reisen, Events, etc.)</div>
            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>€200</div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginTop: '1rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #D4AF37' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: '#D4AF37', fontWeight: '600' }}>Kategorie</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Monatlich</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Jährlich</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Personal</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€31.200</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€374.400</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Büro & Infrastruktur</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€600</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€7.200</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Fahrzeug (Dienstauto)</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€1.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€12.000</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Software & Tools</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€200</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€2.400</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Marketing & Werbung</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€850</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€10.200</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Versicherungen</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€300</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€3.600</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Steuerberater & Legal</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€400</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€4.800</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Sonstige</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€250</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€3.000</td>
              </tr>
              <tr style={{ backgroundColor: '#0d1117' }}>
                <td style={{ padding: '0.75rem', color: '#D4AF37', fontWeight: '600' }}>GESAMT</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>€34.800</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>€417.600</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Paragraph style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#B0B0B0' }}>
          <strong style={{color:'#C9963C'}}>Hinweis:</strong> Jahr 1 wird ein Verlust von ~€337K produzieren (€417K Kosten - €80K Umsatz). Dies ist erwartet und durch die Seed-Runde gedeckt.
        </Paragraph>
      </Card>

      {/* P&L Prognose */}
      <Card>
        <SectionTitle>Gewinn & Verlust (P&L) – 5 Jahre</SectionTitle>
        <div style={{ overflowX: 'auto', marginTop: '1.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #D4AF37' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: '#D4AF37', fontWeight: '600' }}>Position</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Jahr 1</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Jahr 2</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Jahr 3</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Jahr 4</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Jahr 5</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Brutto-Umsatz</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€80K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€580K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€2,2M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€12M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€30M</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Personal-Kosten</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>-€374K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>-€480K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>-€800K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>-€2M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>-€5M</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Betriebsausgaben</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>-€44K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>-€100K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>-€300K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>-€1M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>-€3M</td>
              </tr>
              <tr style={{ borderBottom: '2px solid #D4AF37', backgroundColor: '#0d1117' }}>
                <td style={{ padding: '0.75rem', color: '#D4AF37', fontWeight: '600' }}>EBITDA</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>-€338K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>€0K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>€1,1M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>€9M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>€22M</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Depreciation & Amortization</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>-€20K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>-€30K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>-€50K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>-€80K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>-€100K</td>
              </tr>
              <tr style={{ backgroundColor: '#0d1117' }}>
                <td style={{ padding: '0.75rem', color: '#FFB800', fontWeight: '600' }}>Netto-Gewinn</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#FFB800', fontWeight: '600' }}>-€358K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#FFB800', fontWeight: '600' }}>-€30K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#FFB800', fontWeight: '600' }}>€1,05M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#FFB800', fontWeight: '600' }}>€8,92M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#FFB800', fontWeight: '600' }}>€21,9M</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Paragraph style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#B0B0B0' }}>
          <strong style={{color:'#C9963C'}}>Break-Even-Punkt:</strong> End of Jahr 2 (M20–M24 von Gründung)
        </Paragraph>
      </Card>

      {/* Kennzahlen */}
      <Card>
        <SectionTitle>Schlüsselkennzahlen (KPIs)</SectionTitle>
        <SectionLabel>Customer Acquisition Cost (CAC):</SectionLabel>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0', marginBottom: '0.5rem' }}>CAC = Gesamte Marketing-Ausgaben / Neue Kunden akquiriert</div>
            <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#D4AF37' }}>€20 pro Nutzer</div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0', marginTop: '0.5rem' }}>Basierend auf €10K/Monat Marketing für ~500 neue Nutzer/Monat in Jahr 1</div>
          </div>
        </div>

        <SectionLabel>Customer Lifetime Value (LTV):</SectionLabel>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0', marginBottom: '0.5rem' }}>
              LTV = (Ø monatl. Umsatz pro Nutzer) × (durchschnittliche Nutzungsdauer in Monaten)
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#D4AF37' }}>€500–€1.000+</div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0', marginTop: '0.5rem' }}>
              Konservativ: €40 Buchungswert × 18% Provision × 10 Buchungen/Monat × 24 Monate = €1.728
            </div>
          </div>
        </div>

        <SectionLabel>LTV/CAC Ratio:</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatBox value="25–40x" label="Industrie-Standard: 3x" />
          <StatBox value="€1.728" label="LTV bei 24-Monat Retention" />
          <StatBox value="€20" label="CAC mit effizientem Marketing" />
        </div>
        <Paragraph>
          <strong style={{color:'#C9963C'}}>Interpretation:</strong> Ein LTV/CAC von 25–40x ist extrem stark und deutet auf ein sehr profitables Unit-Modell hin. Dies ist typisch für Plattformen mit Netzwerkeffekten und hoher Retention.
        </Paragraph>

        <SectionLabel style={{ marginTop: '1.5rem' }}>Churn Rate:</SectionLabel>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0', marginBottom: '0.5rem' }}>Prozentanteil von Nutzern, die plattform jeden Monat verlassen</div>
            <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#D4AF37' }}>3–5% pro Monat</div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0', marginTop: '0.5rem' }}>
              Begründet durch Netzwerk-Effekte und hohe Switching Costs (etablierte Beziehung zu Begleiter)
            </div>
          </div>
        </div>

        <SectionLabel>Retention & Engagement:</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatBox value="70–80%" label="Month 6 Retention (konservativ)" />
          <StatBox value="10 Std/Monat" label="Ø Buchungsvolumen pro Nutzer" />
          <StatBox value="85%+" label="NPS Score (angestrebt)" />
        </div>
      </Card>

      {/* Sensitivitätsanalyse */}
      <Card>
        <SectionTitle>Sensitivitätsanalyse – Jahr 5 Umsatzszenarien</SectionTitle>
        <Paragraph style={{ marginBottom: '1.5rem' }}>
          Abhängig von Marktdurchdringung, CAC-Effizienz und Retention zeigen sich folgende Szenarien:
        </Paragraph>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '4px solid #FF6B6B' }}>
            <div style={{ color: '#FF6B6B', fontWeight: '600', marginBottom: '0.5rem' }}>Conservative Case</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0', marginBottom: '0.75rem' }}>
              Langsamer Growth, höhere CAC, 50K Nutzer
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#D4AF37' }}>€15M/Jahr</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '4px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Base Case (Plan)</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0', marginBottom: '0.75rem' }}>
              Erwarteter Growth, optimales CAC, 75K Nutzer
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#D4AF37' }}>€30M/Jahr</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '4px solid #00FF88' }}>
            <div style={{ color: '#00FF88', fontWeight: '600', marginBottom: '0.5rem' }}>Bull Case</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0', marginBottom: '0.75rem' }}>
              Schneller Viral-Growth, niedrige CAC, 150K Nutzer
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#D4AF37' }}>€60M/Jahr</div>
          </div>
        </div>
      </Card>

      {/* Finanzierungsstrategie */}
      <Card>
        <SectionTitle>Finanzierungsstrategie</SectionTitle>
        <SectionLabel>Seed (Heute):</SectionLabel>
        <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', marginBottom: '1rem', borderLeft: '3px solid #D4AF37' }}>
          <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>€500K</div>
          <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>
            Fokus: MVP Launch, Team-Aufbau, lokales Growth (Frankfurt/Rhein-Main)
          </div>
        </div>

        <SectionLabel>Series A (Jahr 2):</SectionLabel>
        <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', marginBottom: '1rem', borderLeft: '3px solid #D4AF37' }}>
          <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>€2–3M (angestrebt)</div>
          <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>
            Fokus: Nationale Expansion, Produktverbesserung, Sales-Team-Aufbau
          </div>
        </div>

        <SectionLabel>Series B (Jahr 3–4):</SectionLabel>
        <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', marginBottom: '1rem', borderLeft: '3px solid #D4AF37' }}>
          <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>€5–10M (angestrebt)</div>
          <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>
            Fokus: DACH-Expansion, Internationale Präsenz, Zusätzliche Services
          </div>
        </div>

        <Paragraph style={{ marginTop: '1.5rem' }}>
          Mit starken Unit Economics (LTV/CAC 25–40x), profitablem Break-Even in Jahr 2 und vorhersehbarem Markt sollte die Fundraising-Laufbahn gut finanzierbar sein.
        </Paragraph>
      </Card>

      {/* Exit-Szenarien */}
      <Card>
        <SectionTitle>Potenzielle Exit-Szenarien (Jahr 5–7)</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Strategic Acquisition</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0', marginBottom: '0.75rem' }}>
              Krankenkassen, Pflegekassen, große Gesundheitskonzerne interessiert an Marktplatz
            </div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>Bewertung: €200M–€500M+</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>IPO</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0', marginBottom: '0.75rem' }}>
              Bei €30M+ jährliche Umsätze und Profitabilität: Listing auf Xetra/Frankfurt
            </div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>Bewertung: €1B+</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>European Roll-Up</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0', marginBottom: '0.75rem' }}>
              Zusammenschluss mit europäischen Pflege-Plattformen zu supranationaler Lösung
            </div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>Bewertung: €300M–€700M</div>
          </div>
        </div>
      </Card>

      {/* Zusammenfassung */}
      <Card>
        <SectionTitle>Finanzielle Zusammenfassung</SectionTitle>
        <BulletItem><strong style={{color:'#C9963C'}}>Starke Unit Economics:</strong> LTV/CAC 25–40x (Benchmark: 3x)</BulletItem>
        <BulletItem><strong style={{color:'#C9963C'}}>Break-Even:</strong> Ende Jahr 2 (M20–24), dann rapide Profitabilität</BulletItem>
        <BulletItem><strong style={{color:'#C9963C'}}>Year 5 Revenue:</strong> €30M+ (Base Case), mit Bull-Case €60M+</BulletItem>
        <BulletItem><strong style={{color:'#C9963C'}}>Finanzierungsbedarf:</strong> €500K Seed für MVP & lokales Launch, €2–3M Series A für Nationale Expansion</BulletItem>
        <BulletItem><strong style={{color:'#C9963C'}}>Exit-Potenzial:</strong> Strategic Acquisition (€200M–€500M+) oder IPO (€1B+) Jahr 5–7</BulletItem>
      </Card>
    </DocPageLayout>
  )
}
