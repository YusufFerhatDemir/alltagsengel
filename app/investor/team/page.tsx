'use client';

import { Icons } from '../docs/shared';
import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, StatBox, TableRow, Badge, C, GoldSep, SectionLabel } from '../docs/shared';

export default function TeamPage() {
  return (
    <DocPageLayout
      title="Teamübersicht"
      subtitle="Mitarbeiterprofile, Qualifikationen & Gehaltsstruktur"
      icon={Icons.users(32)}
      badge="Team"
      lang="de"
    >
      {/* Organisationsstruktur */}
      <SectionTitle>Organisationsstruktur</SectionTitle>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <StatBox label="Mitarbeiter" value="5 Personen" />
          <StatBox label="Festangestellte" value="4 + 1 GF" />
          <StatBox label="Gründer/CEO" value="Yusuf Demir" />
          <StatBox label="Struktur" value="Lean & Agil" />
        </div>
        <Paragraph style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.8)' }}>
          AlltagsEngel arbeitet mit einem kompakten, hochmotivierten Team aus 5 Personen. Diese Struktur ermöglicht schnelle Entscheidungen und hohe Reaktionsfähigkeit. Das Team kombiniert technische Expertise, operatives Know-how und Marketing-Stärke.
        </Paragraph>
      </Card>

      <GoldSep />

      {/* Team Mitglieder */}
      <SectionTitle>Team Mitglieder</SectionTitle>

      {/* Yusuf Demir */}
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>Yusuf Ferhat Demir</div>
            <Badge>CEO & Gründer</Badge>
            <Paragraph style={{ margin: '12px 0 0 0', fontSize: '14px' }}>
              <strong>Gehalt:</strong> €8.000 netto/Monat
            </Paragraph>
          </div>
          <div>
            <div style={{ padding: '10px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '6px', fontSize: '13px' }}>
              <div style={{ color: '#C9963C', fontWeight: '600', marginBottom: '6px' }}>Sprachen</div>
              <div>TR / DE / EN</div>
            </div>
          </div>
        </div>
        <SectionLabel>Qualifikationen & Erfahrung</SectionLabel>
        <BulletItem>Strategische Planung und Geschäftsentwicklung</BulletItem>
        <BulletItem>Unternehmensleitung und Verwaltung</BulletItem>
        <BulletItem>Partnership & Stakeholder Management</BulletItem>
        <BulletItem>Erfahrung im Startup-Bereich</BulletItem>
      </Card>

      {/* Laura Leeman */}
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>Laura Leeman</div>
            <Badge>Teamleiterin & Projektmanagement</Badge>
            <Paragraph style={{ margin: '12px 0 0 0', fontSize: '14px' }}>
              <strong>Alter:</strong> 28 Jahre | <strong>Gehalt:</strong> €3.000 netto/Monat
            </Paragraph>
          </div>
          <div>
            <div style={{ padding: '10px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '6px', fontSize: '13px' }}>
              <div style={{ color: '#C9963C', fontWeight: '600', marginBottom: '6px' }}>Qualifikationen</div>
              <div>§53b Zertifikat (Alltagsbegleiter)</div>
              <div>Yoga-Ausbildung</div>
            </div>
          </div>
        </div>
        <SectionLabel>Schwerpunkte</SectionLabel>
        <BulletItem>Operatives Management und Prozessoptimierung</BulletItem>
        <BulletItem>Kundenerlebnis und Service Quality</BulletItem>
        <BulletItem>Team-Koordination und Engagement</BulletItem>
        <BulletItem>Alltagsbegleiter-Training und -Betreuung</BulletItem>
        <div style={{ padding: '10px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '6px', marginTop: '12px', fontSize: '13px' }}>
          <strong style={{ color: '#C9963C' }}>Sprachen:</strong> Deutsch / Englisch
        </div>
      </Card>

      {/* Mehmet Yilmaz */}
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>Mehmet Yilmaz</div>
            <Badge>CTO & Lead Developer</Badge>
            <Paragraph style={{ margin: '12px 0 0 0', fontSize: '14px' }}>
              <strong>Alter:</strong> 32 Jahre | <strong>Gehalt:</strong> €3.000 netto/Monat
            </Paragraph>
          </div>
          <div>
            <div style={{ padding: '10px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '6px', fontSize: '13px' }}>
              <div style={{ color: '#C9963C', fontWeight: '600', marginBottom: '6px' }}>Ausbildung</div>
              <div>TU Darmstadt</div>
              <div>B.Sc. Informatik</div>
            </div>
          </div>
        </div>
        <SectionLabel>Technische Expertise</SectionLabel>
        <BulletItem>React Native & Expo Mobile Development</BulletItem>
        <BulletItem>Supabase Backend & PostgreSQL</BulletItem>
        <BulletItem>Cloud Architecture & DevOps</BulletItem>
        <BulletItem>API Design und Integration</BulletItem>
        <BulletItem>Sicherheit & Performance Optimization</BulletItem>
        <div style={{ padding: '10px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '6px', marginTop: '12px', fontSize: '13px' }}>
          <strong style={{ color: '#C9963C' }}>Sprachen:</strong> Türkisch / Deutsch / Englisch
        </div>
      </Card>

      {/* Sophie Weber */}
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>Sophie Weber</div>
            <Badge>Marketing & Kommunikation</Badge>
            <Paragraph style={{ margin: '12px 0 0 0', fontSize: '14px' }}>
              <strong>Alter:</strong> 26 Jahre | <strong>Gehalt:</strong> €3.000 netto/Monat
            </Paragraph>
          </div>
          <div>
            <div style={{ padding: '10px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '6px', fontSize: '13px' }}>
              <div style={{ color: '#C9963C', fontWeight: '600', marginBottom: '6px' }}>Ausbildung</div>
              <div>Goethe-Universität Frankfurt</div>
              <div>B.A. Kommunikation</div>
            </div>
          </div>
        </div>
        <SectionLabel>Schwerpunkte</SectionLabel>
        <BulletItem>Social Media Strategy & Content Creation</BulletItem>
        <BulletItem>Digital Advertising (Google, Facebook, Instagram)</BulletItem>
        <BulletItem>Blog & Newsletter Management</BulletItem>
        <BulletItem>Brand Development & Corporate Identity</BulletItem>
        <BulletItem>Community Engagement & Influencer Relations</BulletItem>
        <div style={{ padding: '10px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '6px', marginTop: '12px', fontSize: '13px' }}>
          <strong style={{ color: '#C9963C' }}>Sprachen:</strong> Deutsch / Englisch / Französisch
        </div>
      </Card>

      {/* Anna Hoffmann */}
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>Anna Hoffmann</div>
            <Badge>Assistenz & Admin</Badge>
            <Paragraph style={{ margin: '12px 0 0 0', fontSize: '14px' }}>
              <strong>Alter:</strong> 24 Jahre | <strong>Gehalt:</strong> €3.000 netto/Monat
            </Paragraph>
          </div>
          <div>
            <div style={{ padding: '10px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '6px', fontSize: '13px' }}>
              <div style={{ color: '#C9963C', fontWeight: '600', marginBottom: '6px' }}>Ausbildung</div>
              <div>Bürokauffrau (IHK)</div>
              <div>Zusatzqualifikationen in Microsoft Office</div>
            </div>
          </div>
        </div>
        <SectionLabel>Schwerpunkte</SectionLabel>
        <BulletItem>Administrative Aufgaben & Office Management</BulletItem>
        <BulletItem>Buchhaltung & Rechnungswesen</BulletItem>
        <BulletItem>Personaladministration</BulletItem>
        <BulletItem>Kundenkommunikation via E-Mail & Telefon</BulletItem>
        <BulletItem>Kalender & Terminmanagement</BulletItem>
        <div style={{ padding: '10px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '6px', marginTop: '12px', fontSize: '13px' }}>
          <strong style={{ color: '#C9963C' }}>Sprachen:</strong> Deutsch / Englisch
        </div>
      </Card>

      <GoldSep />

      {/* Personalkosten */}
      <SectionTitle>Personalkosten</SectionTitle>
      <Card>
        <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Mitarbeiter</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', color: '#C9963C', fontWeight: '600' }}>Netto/Mo.</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', color: '#C9963C', fontWeight: '600' }}>Brutto/Mo.</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Yusuf Ferhat Demir (CEO)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€8.000</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€10.400</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Laura Leeman (Teamleiterin)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€3.000</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€4.200</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Mehmet Yilmaz (CTO)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€3.000</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€4.200</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Sophie Weber (Marketing)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€3.000</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€4.200</td>
              </tr>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Anna Hoffmann (Assistenz)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€3.000</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€4.200</td>
              </tr>
              <tr>
                <td style={{ padding: '10px 8px', fontWeight: '600', color: '#C9963C' }}>GESAMT</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700', color: '#C9963C', fontSize: '15px' }}>€20.000</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700', color: '#C9963C', fontSize: '15px' }}>€27.200</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Paragraph style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)' }}>
          <strong>Brutto beinhaltet:</strong> Lohnsteuer, Krankenversicherung, Rentenversicherung, Arbeitslosenversicherung, Pflegeversicherung + Arbeitgeberanteile
        </Paragraph>
      </Card>

      <GoldSep />

      {/* Betriebskosten */}
      <SectionTitle>Monatliche Betriebskosten</SectionTitle>
      <Card>
        <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Kostenbereich</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', color: '#C9963C', fontWeight: '600' }}>Monatlich</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Büroraum (Frankfurt)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€600</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Nebenkosten (Strom, Wasser, Gas)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€150</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Fahrzeugkosten (Leasing)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€1.000</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Software & Tools (SaaS)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€200</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Versicherungen (Betrieb, Haftung)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€300</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Büromaterial & Ausstattung</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€100</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Telefon & Internet</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€80</td>
              </tr>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Steuerberater & Buchhaltung</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€200</td>
              </tr>
              <tr>
                <td style={{ padding: '10px 8px', fontWeight: '600', color: '#C9963C' }}>BETRIEBSKOSTEN GESAMT</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700', color: '#C9963C', fontSize: '15px' }}>€2.630</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <GoldSep />

      {/* Gesamtbudget */}
      <SectionTitle>Monatliches Gesamtbudget</SectionTitle>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '4px solid #C9963C' }}>
            <div style={{ fontSize: '12px', color: '#C9963C', fontWeight: '600', marginBottom: '6px' }}>PERSONALKOSTEN</div>
            <div style={{ fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>€27.200</div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>Brutto (5 Mitarbeiter)</div>
          </div>
          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '4px solid #C9963C' }}>
            <div style={{ fontSize: '12px', color: '#C9963C', fontWeight: '600', marginBottom: '6px' }}>BETRIEBSKOSTEN</div>
            <div style={{ fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>€2.630</div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>Büro, Software, Versicherung</div>
          </div>
          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.12)', borderRadius: '8px', borderLeft: '4px solid #C9963C', gridColumn: 'auto / span 1' }}>
            <div style={{ fontSize: '12px', color: '#C9963C', fontWeight: '600', marginBottom: '6px' }}>GESAMT MONATLICH</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#C9963C', marginBottom: '4px' }}>€29.830</div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>+ Steuern & Sonstiges</div>
          </div>
        </div>

        <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', marginTop: '12px' }}>
          <SectionLabel>Jährliches Budget</SectionLabel>
          <Paragraph style={{ margin: '8px 0 0 0', fontSize: '14px', fontWeight: '600' }}>
            €29.830/Monat × 12 = <span style={{ color: '#C9963C', fontSize: '16px' }}>€357.960/Jahr</span>
          </Paragraph>
        </div>
      </Card>
    </DocPageLayout>
  );
}
