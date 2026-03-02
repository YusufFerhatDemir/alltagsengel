'use client';

import { Icons } from '../docs/shared';
import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, StatBox, TableRow, Badge, C, GoldSep, SectionLabel } from '../docs/shared';

export default function BetriebskostenPage() {
  return (
    <DocPageLayout
      title="Betriebskosten"
      subtitle="Personal-, Büro- & Gesamtkostenübersicht"
      icon={Icons.clipboard(32)}
      badge="Finanzen"
      lang="de"
    >
      {/* Zusammenfassung */}
      <SectionTitle>Kostenübersicht</SectionTitle>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <StatBox label="Personalkosten" value="€27.200" />
          <StatBox label="Betriebskosten" value="€2.630" />
          <StatBox label="Gesamt monatlich" value="€29.830" />
          <StatBox label="Gesamt jährlich" value="€357.960" />
        </div>
        <Paragraph style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.8)' }}>
          Diese Übersicht zeigt die vollständigen monatlichen und jährlichen Betriebskosten für AlltagsEngel. Die Kostenstruktur wurde optimiert für Lean Operations bei maximaler Qualität.
        </Paragraph>
      </Card>

      <GoldSep />

      {/* Personalkosten detailliert */}
      <SectionTitle>Detaillierte Personalkosten</SectionTitle>
      <Card>
        <SectionLabel>Monatliche Personalausgaben (5 Mitarbeiter)</SectionLabel>
        <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Mitarbeiter</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', color: '#C9963C', fontWeight: '600' }}>Netto</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', color: '#C9963C', fontWeight: '600' }}>Brutto</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', color: '#C9963C', fontWeight: '600' }}>Jährlich</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Yusuf Ferhat Demir</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€8.000</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€10.400</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€124.800</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Laura Leeman</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€3.000</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€4.200</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€50.400</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Mehmet Yilmaz (CTO)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€3.000</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€4.200</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€50.400</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Sophie Weber (Marketing)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€3.000</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€4.200</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€50.400</td>
              </tr>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Anna Hoffmann (Assistenz)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€3.000</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€4.200</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€50.400</td>
              </tr>
              <tr>
                <td style={{ padding: '10px 8px', fontWeight: '600', color: '#C9963C' }}>GESAMT</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700', color: '#C9963C', fontSize: '15px' }}>€20.000</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700', color: '#C9963C', fontSize: '15px' }}>€27.200</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700', color: '#C9963C', fontSize: '15px' }}>€326.400</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', marginTop: '12px' }}>
          <Paragraph style={{ margin: '0', fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>
            <strong>Netto-Gehälter:</strong> €20.000/Monat | <strong>Brutto-Kosten:</strong> €27.200/Monat (inkl. Arbeitgeber-Sozialversicherungsbeiträge, Steuern, Versicherungen)
          </Paragraph>
        </div>
      </Card>

      <GoldSep />

      {/* Betriebskosten detailliert */}
      <SectionTitle>Detaillierte Betriebskosten</SectionTitle>
      <Card>
        <SectionLabel>Monatliche Betriebsausgaben</SectionLabel>
        <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Kostenbereich</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', color: '#C9963C', fontWeight: '600' }}>Monatlich</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', color: '#C9963C', fontWeight: '600' }}>Jährlich</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>
                  <strong>BÜRO & INFRASTRUKTUR</strong>
                </td>
                <td colSpan={2} style={{ padding: '10px 8px', color: 'rgba(201, 150, 60, 0.8)', fontStyle: 'italic', fontSize: '12px' }}>
                  Büroraum und Betriebsmittel
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.15)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '24px' }}>Büroraum (Frankfurt, 50m²)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€600</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€7.200</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.15)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '24px' }}>Nebenkosten (Strom, Wasser, Gas)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€150</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€1.800</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>
                  <strong>MOBILITÄT</strong>
                </td>
                <td colSpan={2} style={{ padding: '10px 8px', color: 'rgba(201, 150, 60, 0.8)', fontStyle: 'italic', fontSize: '12px' }}>
                  Fahrzeug für Engel-Trainings und Meetings
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.15)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '24px' }}>Fahrzeugleasing (VW, Diesel)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€900</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€10.800</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.15)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '24px' }}>Fuel, Wartung, Reparaturen</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€100</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€1.200</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>
                  <strong>TECHNOLOGIE & SOFTWARE</strong>
                </td>
                <td colSpan={2} style={{ padding: '10px 8px', color: 'rgba(201, 150, 60, 0.8)', fontStyle: 'italic', fontSize: '12px' }}>
                  Cloud, Tools, Lizenzen
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.15)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '24px' }}>Supabase, Cloud Hosting, CDN</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€100</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€1.200</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.15)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '24px' }}>Microsoft 365, Google Workspace, Tools</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€50</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€600</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.15)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '24px' }}>Monitoring, Analytics, Sicherheit</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€50</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€600</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>
                  <strong>VERSICHERUNGEN</strong>
                </td>
                <td colSpan={2} style={{ padding: '10px 8px', color: 'rgba(201, 150, 60, 0.8)', fontStyle: 'italic', fontSize: '12px' }}>
                  Schutz vor Haftungsrisiken
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.15)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '24px' }}>Betriebshaftpflichtversicherung</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€150</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€1.800</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.15)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '24px' }}>Kfz-Versicherung (Fahrzeug)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€100</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€1.200</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.15)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '24px' }}>Cyber-Versicherung</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€50</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€600</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>
                  <strong>SONSTIGES</strong>
                </td>
                <td colSpan={2} style={{ padding: '10px 8px', color: 'rgba(201, 150, 60, 0.8)', fontStyle: 'italic', fontSize: '12px' }}>
                  Büromaterial und Betrieb
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.15)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '24px' }}>Büromaterial & Ausstattung</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€100</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€1.200</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.15)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '24px' }}>Telefon & Internet (Business)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€80</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€960</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.15)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '24px' }}>Steuerberater & Buchhaltung</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€200</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€2.400</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.15)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '24px' }}>Fortbildung & Schulung</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€50</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€600</td>
              </tr>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '24px' }}>Sonstige Ausgaben & Rücklagen</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€30</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€360</td>
              </tr>
              <tr>
                <td style={{ padding: '10px 8px', fontWeight: '600', color: '#C9963C' }}>BETRIEBSKOSTEN GESAMT</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700', color: '#C9963C', fontSize: '15px' }}>€2.630</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700', color: '#C9963C', fontSize: '15px' }}>€31.560</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <GoldSep />

      {/* Gesamtbudget */}
      <SectionTitle>Gesamtbudget & Finanzübersicht</SectionTitle>
      <Card>
        <SectionLabel>Monatliches Budget</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderTop: '3px solid #C9963C' }}>
            <div style={{ fontSize: '12px', color: '#C9963C', fontWeight: '600', marginBottom: '6px' }}>PERSONALKOSTEN</div>
            <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>€27.200</div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>5 Mitarbeiter (Brutto)</div>
          </div>
          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderTop: '3px solid #C9963C' }}>
            <div style={{ fontSize: '12px', color: '#C9963C', fontWeight: '600', marginBottom: '6px' }}>BETRIEBSKOSTEN</div>
            <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>€2.630</div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>Büro, IT, Versicherung</div>
          </div>
          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.12)', borderRadius: '8px', borderTop: '4px solid #C9963C' }}>
            <div style={{ fontSize: '12px', color: '#C9963C', fontWeight: '600', marginBottom: '6px' }}>GESAMT/MONAT</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#C9963C', marginBottom: '4px' }}>€29.830</div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>Ohne Steuern</div>
          </div>
        </div>

        <SectionLabel style={{ marginTop: '16px' }}>Jährliches Budget</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px' }}>
            <Paragraph style={{ margin: '0', fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>
              <strong>Personalkosten:</strong><br />€326.400/Jahr
            </Paragraph>
          </div>
          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px' }}>
            <Paragraph style={{ margin: '0', fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>
              <strong>Betriebskosten:</strong><br />€31.560/Jahr
            </Paragraph>
          </div>
          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.12)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <Paragraph style={{ margin: '0', fontSize: '13px', color: 'rgba(255, 255, 255, 0.9)', fontWeight: '600' }}>
              <strong style={{ fontSize: '16px', color: '#C9963C' }}>€357.960</strong><br />Gesamt/Jahr
            </Paragraph>
          </div>
        </div>
      </Card>

      <GoldSep />

      {/* Break-Even Analyse */}
      <SectionTitle>Break-Even Analyse</SectionTitle>
      <Card>
        <SectionLabel>Berechnung der Profitabilität</SectionLabel>
        <div style={{ marginBottom: '16px' }}>
          <BulletItem><strong>Durchschnittliche Buchungsgröße:</strong> €40 pro Einsatz</BulletItem>
          <BulletItem><strong>Provisions-Model:</strong> 18% des Buchungspreises = €7.20 pro Buchung</BulletItem>
          <BulletItem><strong>Monatliche Mindestumsätze:</strong> €29.830 / €7.20 = ~4.143 Buchungen</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '16px' }}>Break-Even Punkt (monatlich)</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontSize: '12px', color: '#C9963C', fontWeight: '600', marginBottom: '6px' }}>KOSTEN</div>
            <div style={{ fontSize: '18px', fontWeight: '700' }}>€29.830</div>
          </div>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontSize: '12px', color: '#C9963C', fontWeight: '600', marginBottom: '6px' }}>PROVISION/BUCHUNG</div>
            <div style={{ fontSize: '18px', fontWeight: '700' }}>€7.20</div>
          </div>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.12)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontSize: '12px', color: '#C9963C', fontWeight: '600', marginBottom: '6px' }}>NÖTIGE BUCHUNGEN</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#C9963C' }}>~4.143</div>
          </div>
        </div>

        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px' }}>
          <Paragraph style={{ margin: '0', fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>
            <strong>Monatliches Break-Even Ziel:</strong> <span style={{ color: '#C9963C', fontWeight: '600' }}>4.143 Buchungen</span>
            <br />
            <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>Bei 500 aktiven Nutzern im Pilotmarkt sind ~8 Buchungen pro Nutzer/Monat nötig</span>
          </Paragraph>
        </div>
      </Card>

      <GoldSep />

      {/* Skalierungsszenarien */}
      <SectionTitle>Skalierungsszenarien</SectionTitle>
      <Card>
        <SectionLabel>Kostensteigerung bei Wachstum</SectionLabel>
        <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Szenario</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Aktive Nutzer</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Buchungen/Mo.</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', color: '#C9963C', fontWeight: '600' }}>Kosten</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Q1 2025 (MVP)</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>50</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>100</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€29.830</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Q3 2025 (Launch)</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>500</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>1.500</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€32.000</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Q1 2026 (Wachstum)</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>2.000</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>6.000</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€37.000</td>
              </tr>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>2026+ (Skalierung)</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>10.000+</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>30.000+</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500', color: '#C9963C' }}>€50.000+</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Paragraph style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', marginTop: '12px' }}>
          <strong>Annahme:</strong> Die Kostenstruktur wächst unterproportional (Skalierungseffekte bei IT, Overhead kann verteilt werden). Eine Erhöhung auf 10-20% mehr wird durch höhere Provisionsvolumina kompensiert.
        </Paragraph>
      </Card>

      <GoldSep />

      {/* Optimierungspotentiale */}
      <SectionTitle>Kostenoptimierungspotentiale</SectionTitle>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '6px', fontSize: '13px' }}>Home Office</div>
            <Paragraph style={{ margin: '0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Reduzierung Bürokosten um 30% möglich</Paragraph>
          </div>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '6px', fontSize: '13px' }}>Freelancer</div>
            <Paragraph style={{ margin: '0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Externe Support statt Vollzeit Assistenz</Paragraph>
          </div>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '6px', fontSize: '13px' }}>Fahrzeug</div>
            <Paragraph style={{ margin: '0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Carsharing statt Leasing möglich</Paragraph>
          </div>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '6px', fontSize: '13px' }}>Cloud-Kosten</div>
            <Paragraph style={{ margin: '0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Optimierung mit Wachstum möglich</Paragraph>
          </div>
        </div>
      </Card>
    </DocPageLayout>
  );
}
