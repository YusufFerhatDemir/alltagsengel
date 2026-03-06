'use client'

import { Icons } from '../docs/shared'
import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, StatBox, TableRow, Badge, C, GoldSep, SectionLabel } from '../docs/shared'

export default function ZusammenfassungPage() {
  return (
    <DocPageLayout
      title="Executive Summary"
      subtitle="Investitionsmöglichkeit auf einen Blick"
      icon={Icons.fileText(32)}
      badge="Übersicht"
      lang="de"
    >
      {/* Key Facts */}
      <Card>
        <SectionTitle>Schlüsselfakten</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatBox value="€50+ Mrd" label="Marktgröße (TAM)" />
          <StatBox value="4,96 Mio" label="Pflegebedürftige" />
          <StatBox value="€500K" label="Seed-Finanzierung gesucht" />
          <StatBox value="~50%" label="Bruttomarge" />
        </div>
      </Card>

      {/* Die Chance */}
      <Card>
        <SectionTitle>Die Chance</SectionTitle>
        <Paragraph>
          Deutschland erlebt eine der größten demografischen Verschiebungen seiner Geschichte. Die alternde Bevölkerung führt zu wachsender Nachfrage nach Alltagsbegleitung – und der Staat hat bereits die Lösung finanziert.
        </Paragraph>
        <BulletItem><strong style={{color:'#C9963C'}}>§45b-Rahmen:</strong> €131/Monat pro Pflegebedürftiger – 4,96 Mio Menschen × €131 = €7,79 Mrd/Jahr</BulletItem>
        <BulletItem><strong style={{color:'#C9963C'}}>Eingebauter Finanzierungsmechanismus:</strong> Krankenkassen zahlen direkt – kein Zahlungsausfallrisiko</BulletItem>
        <BulletItem><strong style={{color:'#C9963C'}}>Fragmentierter Markt:</strong> Keine digitale Lösung dominiert – First-Mover-Vorteil</BulletItem>
        <BulletItem><strong style={{color:'#C9963C'}}>AlltagsEngel digitalisiert diese Ineffizienz</strong> – und schafft einen profitablen Zweiseitenmarkt</BulletItem>
      </Card>

      {/* Finanzprognose */}
      <Card>
        <SectionTitle>Finanzprognose 5 Jahre</SectionTitle>
        <div style={{ overflowX: 'auto', marginTop: '1.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #D4AF37' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: '#D4AF37', fontWeight: '600' }}>Zeitraum</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Aktive Nutzer</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Registrierte Engel</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Monatl. Umsatz</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Jahresumsatz</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Gewinn</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 1</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>50</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>~€32,5K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€390K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#ff6b6b' }}>-€30K</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 2</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>2.500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>150</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>~€162,5K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€1,95M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80' }}>€990K</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 3</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>10.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>500</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>~€650K</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€7,8M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80' }}>€4,6M</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Jahr 4</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>35.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>2.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>~€2,3M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€27,3M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80' }}>€18,2M</td>
              </tr>
              <tr>
                <td style={{ padding: '0.75rem' }}>Jahr 5</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>75.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>5.000</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>~€4,9M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€58,5M</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ade80' }}>€39M</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Paragraph style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#B0B0B0' }}>
          Annahmen: Festmarge-Modell (~€65/Kunde/Monat), Direktabrechnung mit Pflegekassen, Engel erhalten €20/Std fest, exponentielles Wachstum in den ersten 3 Jahren
        </Paragraph>
      </Card>

      {/* Kernvorteile */}
      <Card>
        <SectionTitle>Kernvorteile</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>1. Market Fit</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>§45b schafft deterministische Nachfrage für 4,96 Mio Menschen</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>2. Sicherheit</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>100% Versicherung + §53b Verifikation = Marktdifferentiator</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>3. Netzwerkeffekte</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>Zweiseitenmarkt mit exponentieller Wachstumsdynamik</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>4. First-Mover</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>Keine etablierte digitale Konkurrenz mit §45b-Lösung</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>5. Skalierbar</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>Von Frankfurt zu DACH – deutsches Modell replizierbar</div>
          </div>
        </div>
      </Card>

      {/* Investitionsanfrage */}
      <Card>
        <SectionTitle>Investitionsanfrage</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatBox value="€500K" label="Seed-Finanzierung" />
        </div>
        <SectionLabel>Verwendung der Mittel:</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Produkt & Tech</div>
            <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>40% (€200K)</div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>MVP-Fertigstellung, iOS/Android-Apps, Backend</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Marketing & Growth</div>
            <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>30% (€150K)</div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>User Acquisition, Brand-Building, Launch-Events</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Operationen</div>
            <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>20% (€100K)</div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>Büro, Versicherungen, Compliance, HR</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Legal & Admin</div>
            <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>10% (€50K)</div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0' }}>Rechtliche Struktur, Regulierung, Steuer</div>
          </div>
        </div>
      </Card>

      {/* Monatliche Kosten */}
      <Card>
        <SectionTitle>Betriebsbudget (monatlich)</SectionTitle>
        <div style={{ overflowX: 'auto', marginTop: '1.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #D4AF37' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: '#D4AF37', fontWeight: '600' }}>Kostenkategorie</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#D4AF37', fontWeight: '600' }}>Betrag</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Personal (4 FTE)</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€31.200</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Büro & Infrastruktur</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€1.200</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Software & Tools</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€500</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Marketing</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>€600</td>
              </tr>
              <tr style={{ borderBottom: '2px solid #D4AF37' }}>
                <td style={{ padding: '0.75rem', fontWeight: '600', color: '#D4AF37' }}>GESAMT</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', color: '#D4AF37' }}>€33.500</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Paragraph style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#B0B0B0' }}>
          Runway mit €500K: ~15 Monate bis Break-Even (mit prognostiziertem Umsatz)
        </Paragraph>
      </Card>

      {/* Data Room */}
      <Card>
        <SectionTitle>Data Room Inhalte</SectionTitle>
        <div style={{ columns: 2, columnGap: '2rem' }}>
          <BulletItem>Gründer CVs & Background Checks</BulletItem>
          <BulletItem>MVP Demo & Produktvideo</BulletItem>
          <BulletItem>Finanzielle Modelle (3-Jahres-Projektion)</BulletItem>
          <BulletItem>Marktforschung & Konkurrenzbericht</BulletItem>
          <BulletItem>Geschäftsplan (ausführlich)</BulletItem>
          <BulletItem>Versicherungs- & Compliance-Dokumentation</BulletItem>
          <BulletItem>§45b & §53b Rechtsanalyse</BulletItem>
          <BulletItem>Kundeninterviews & Feedback</BulletItem>
          <BulletItem>Gesellschaftliche Unterlagen</BulletItem>
          <BulletItem>IP-Dokumentation & Schutzmaßnahmen</BulletItem>
        </div>
      </Card>

      {/* Nächste Schritte */}
      <Card>
        <SectionTitle>Nächste Schritte</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>1. Gespräch</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>30-Minuten Intro Call zur Mission & Strategie</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>2. Product Demo</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>Live MVP-Demonstration & Q&A</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>3. Data Room Access</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>Zugang zu vollständigen Investorendokumenten</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>4. Due Diligence</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>Technische, rechtliche & finanzielle Prüfung</div>
          </div>
        </div>
      </Card>
    </DocPageLayout>
  )
}
