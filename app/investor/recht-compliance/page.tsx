'use client';

import { Icons } from '../docs/shared';
import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, StatBox, TableRow, Badge, C, GoldSep, SectionLabel } from '../docs/shared';

export default function RechtCompliancePage() {
  return (
    <DocPageLayout
      title="Recht & Compliance"
      subtitle="SGB XI, Datenschutz, Versicherung & Regulatorik"
      icon={Icons.shield(32)}
      badge="Legal"
      lang="de"
    >
      {/* Unternehmensstruktur */}
      <SectionTitle>Unternehmensstruktur</SectionTitle>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '16px', marginBottom: '16px' }}>
          <StatBox label="Rechtsform" value="UG (haftungsbeschränkt)" />
          <StatBox label="Sitz" value="Frankfurt am Main" />
          <StatBox label="Stammkapital" value="€1.000" />
          <StatBox label="Handelsregister" value="Geplant 2025" />
        </div>
        <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
          <SectionLabel>Geschäftsführer</SectionLabel>
          <Paragraph style={{ margin: '8px 0 0 0', fontSize: '14px' }}>
            <strong>Yusuf Ferhat Demir</strong> (alleiniger Geschäftsführer)
          </Paragraph>
        </div>
      </Card>

      <GoldSep />

      {/* Regulatorischer Rahmen */}
      <SectionTitle>Regulatorischer Rahmen</SectionTitle>
      <Card>
        <SectionLabel>§45b SGB XI - Förderung von Alltagsbegleitern</SectionLabel>
        <div style={{ marginBottom: '16px' }}>
          <Paragraph style={{ marginBottom: '12px', fontSize: '14px' }}>
            Die App basiert auf dem deutschen Regulierungsrahmen für Alltagsbegleiter gemäß <strong>§45b SGB XI</strong> (Elftes Buch Sozialgesetzbuch).
          </Paragraph>
          <BulletItem><strong>Förderung:</strong> €131/Monat von Pflegekassen für Nutzer mit Pflegegrad</BulletItem>
          <BulletItem><strong>Geltungsbereich:</strong> Bundesland Hessen (erweiterbar)</BulletItem>
          <BulletItem><strong>Anforderung:</strong> §53b Kompetenzschulung (160-Stunden-Kurs) für Engel</BulletItem>
          <BulletItem><strong>Zertifizierung:</strong> Durch Hessisches Ministerium für Soziales und Integration</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '16px' }}>Relevante Gesetze & Verordnungen</SectionLabel>
        <div>
          <BulletItem><strong>Datenschutz-Grundverordnung (DSGVO):</strong> EU-weit gültig, Basis für Datenschutz</BulletItem>
          <BulletItem><strong>Bundesdatenschutzgesetz (BDSG):</strong> Deutsche Konkretisierung der DSGVO</BulletItem>
          <BulletItem><strong>Pflegeleistungs-Ergänzungsverordnung:</strong> Details zu §45b SGB XI</BulletItem>
          <BulletItem><strong>SGB V (Krankenversicherung) & SGB XI (Pflegeversicherung):</strong> Grundlagen Pflegesystem</BulletItem>
          <BulletItem><strong>AGB-Gesetze (BGB §307ff):</strong> Allgemeine Geschäftsbedingungen</BulletItem>
        </div>
      </Card>

      <GoldSep />

      {/* Datenschutz & DSGVO */}
      <SectionTitle>Datenschutz & DSGVO Compliance</SectionTitle>
      <Card>
        <SectionLabel>Datenschutzverwaltung</SectionLabel>
        <div style={{ marginBottom: '16px' }}>
          <BulletItem><strong>Datenschutzbeauftragter (DSB):</strong> Externer DSB geplant für 2025</BulletItem>
          <BulletItem><strong>Verarbeitungsverzeichnis (Art. 30 DSGVO):</strong> Dokumentiert alle Datenverarbeitungen</BulletItem>
          <BulletItem><strong>Auftragsverarbeitungsverträge (AVV):</strong> Mit Supabase, Expo, und anderen Diensten</BulletItem>
          <BulletItem><strong>Datenschutzrichtlinien:</strong> Veröffentlicht auf der App und Website</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '16px' }}>Datenkategorien (Art. 9 DSGVO - Besondere Kategorien)</SectionLabel>
        <div style={{ marginBottom: '16px' }}>
          <BulletItem><strong>Gesundheitsdaten:</strong> Pfleggrad, medizinische Einschränkungen (Art. 9 DSGVO)</BulletItem>
          <BulletItem><strong>Biometrische Daten:</strong> Ggf. für Authentifizierung (besondere Kategorie)</BulletItem>
          <BulletItem><strong>Standortdaten:</strong> Für Engel-Matching (Standort teilen optional)</BulletItem>
          <BulletItem><strong>Zahlungsdaten:</strong> Für Buchungen (PCI-DSS relevant)</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '16px' }}>Datensicherheit & -schutz</SectionLabel>
        <div>
          <BulletItem><strong>Verschlüsselung:</strong> TLS 1.3 in Transit, AES-256 im Ruhezustand</BulletItem>
          <BulletItem><strong>Datenminimierung:</strong> Nur notwendige Daten erhoben und verarbeitet</BulletItem>
          <BulletItem><strong>Datenlöschung:</strong> Automatische Löschung nach 3 Jahren Inaktivität</BulletItem>
          <BulletItem><strong>Datenträger-Sicherheit:</strong> Expo Secure Store für lokale Token</BulletItem>
          <BulletItem><strong>Datenschutz-Folgenabschätzung (DSFA):</strong> Geplant für Art. 35 DSGVO</BulletItem>
        </div>
      </Card>

      <GoldSep />

      {/* Versicherungen */}
      <SectionTitle>Versicherungen & Haftung</SectionTitle>
      <Card>
        <SectionLabel>Erforderliche Versicherungen</SectionLabel>
        <div style={{ marginBottom: '16px' }}>
          <BulletItem><strong>Betriebshaftpflichtversicherung:</strong> Für AlltagsEngel UG (in Verhandlung)</BulletItem>
          <BulletItem><strong>Berufshaftpflichtversicherung für Engel:</strong> Deckung für Schäden durch Engel-Tätigkeiten</BulletItem>
          <BulletItem><strong>Plattformhaftung:</strong> Abgedeckt durch AGB und Versicherung</BulletItem>
          <BulletItem><strong>Unfallversicherung:</strong> Für Engel während Einsätze (geplant)</BulletItem>
          <BulletItem><strong>Cyber-Versicherung:</strong> Schutz vor Datenleaks und IT-Sicherheitsvorfällen</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '16px' }}>Haftungsregelung</SectionLabel>
        <div>
          <BulletItem><strong>Plattformhaftung:</strong> AlltagsEngel haftet nicht für Engel-Fehlverhalten (in AGB definiert)</BulletItem>
          <BulletItem><strong>Engel-Haftung:</strong> Engel haften für eigene Fehler und Schäden</BulletItem>
          <BulletItem><strong>Kunden-Pflicht:</strong> Korrektur von Fehlangaben liegt bei Kunden</BulletItem>
          <BulletItem><strong>AGB-Bedingungen:</strong> Vollständige Haftungsregelung in Nutzer- und Engel-AGB</BulletItem>
        </div>
      </Card>

      <GoldSep />

      {/* Arbeitsrechtliches */}
      <SectionTitle>Arbeitsrechtliches & Beschäftigungsmodelle</SectionTitle>
      <Card>
        <SectionLabel>Engel - Beschäftigungsmodell</SectionLabel>
        <div style={{ marginBottom: '16px' }}>
          <BulletItem><strong>Status:</strong> Freie Mitarbeiter (§7 SGB IV)</BulletItem>
          <BulletItem><strong>Begründung:</strong> Zeitliche und sachliche Flexibilität, eigenverantwortliche Tätigkeit</BulletItem>
          <BulletItem><strong>Vergütung:</strong> Pro abgeschlossene Buchung (provisionsbasiert)</BulletItem>
          <BulletItem><strong>Sozialversicherung:</strong> Keine Beitragspflicht von AlltagsEngel (Engel selbstverantwortlich)</BulletItem>
          <BulletItem><strong>Versicherung:</strong> Berufshaftpflicht liegt in Verantwortung des Engel</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '16px' }}>Festangestellte Mitarbeiter</SectionLabel>
        <div>
          <BulletItem><strong>Anzahl:</strong> 4 Festangestellte (CEO, Teamleiterin, CTO, Marketing)</BulletItem>
          <BulletItem><strong>Verträge:</strong> Schriftliche Arbeitsverträge mit Datenschutzklauseln</BulletItem>
          <BulletItem><strong>Sozialversicherung:</strong> Vollständig durch AlltagsEngel abgedeckt</BulletItem>
          <BulletItem><strong>Tarifwerk:</strong> Über Allgemeine Gewerbliche Arbeitsbedingungen</BulletItem>
          <BulletItem><strong>Betriebsrat:</strong> Nicht erforderlich (Mitarbeiterzahl &lt;5 betroffene Stellen)</BulletItem>
        </div>
      </Card>

      <GoldSep />

      {/* Geistiges Eigentum */}
      <SectionTitle>Geistiges Eigentum & Markenrechte</SectionTitle>
      <Card>
        <SectionLabel>Marke & Branding</SectionLabel>
        <div style={{ marginBottom: '16px' }}>
          <BulletItem><strong>Marke "AlltagsEngel":</strong> Anmeldung beim DPMA geplant (Q1 2025)</BulletItem>
          <BulletItem><strong>Domain:</strong> alltagsengel.care gesichert</BulletItem>
          <BulletItem><strong>Slogan:</strong> "Mit Herz für dich da" (Marke geplant)</BulletItem>
          <BulletItem><strong>Logo & Design:</strong> Eigenentwicklung, volle Nutzungsrechte bei UG</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '16px' }}>Software & Code</SectionLabel>
        <div>
          <BulletItem><strong>App-Code:</strong> 100% Eigentum AlltagsEngel UG</BulletItem>
          <BulletItem><strong>Open-Source Lizenzen:</strong> Korrekt dokumentiert (MIT, Apache 2.0, etc.)</BulletItem>
          <BulletItem><strong>Brand Assets:</strong> Alle Grafiken, Videos, Texte sind Eigentum</BulletItem>
          <BulletItem><strong>Datenbank-Schema:</strong> Proprietary, geschützt durch Supabase-Verträge</BulletItem>
        </div>
      </Card>

      <GoldSep />

      {/* Wesentliche Verträge */}
      <SectionTitle>Wesentliche Rechtliche Verträge</SectionTitle>
      <Card>
        <div style={{ overflowX: 'auto', marginBottom: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Vertrag</th>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Status</th>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Beschreibung</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>AGB Nutzer (Kunden)</td>
                <td style={{ padding: '10px 8px', color: 'rgba(201, 150, 60, 0.9)' }}>Entwurf</td>
                <td style={{ padding: '10px 8px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Rechtsbeziehung zwischen Kunde und Plattform</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>AGB Engel (Alltagsbegleiter)</td>
                <td style={{ padding: '10px 8px', color: 'rgba(201, 150, 60, 0.9)' }}>Entwurf</td>
                <td style={{ padding: '10px 8px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Bedingungen für Engel (freie Mitarbeiter)</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Datenschutzerklärung</td>
                <td style={{ padding: '10px 8px', color: 'rgba(201, 150, 60, 0.9)' }}>Entwurf</td>
                <td style={{ padding: '10px 8px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>DSGVO-konforme Datenschutzrichtlinie</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>AVV Supabase</td>
                <td style={{ padding: '10px 8px', color: '#4ade80' }}>Abgeschlossen</td>
                <td style={{ padding: '10px 8px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Auftragsverarbeitung mit Supabase</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Mietvertrag (Büro)</td>
                <td style={{ padding: '10px 8px', color: '#4ade80' }}>Aktiv</td>
                <td style={{ padding: '10px 8px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Büroraum Frankfurt</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Arbeitsverträge (4x)</td>
                <td style={{ padding: '10px 8px', color: '#4ade80' }}>Aktiv</td>
                <td style={{ padding: '10px 8px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Für Festangestellte Mitarbeiter</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Versicherungsvertrag</td>
                <td style={{ padding: '10px 8px', color: 'rgba(201, 150, 60, 0.9)' }}>Verhandlung</td>
                <td style={{ padding: '10px 8px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Betriebshaftpflicht (aktuell in Verhandlung)</td>
              </tr>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>§45b Zertifizierung</td>
                <td style={{ padding: '10px 8px', color: 'rgba(201, 150, 60, 0.9)' }}>Geplant</td>
                <td style={{ padding: '10px 8px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Antrag bei Hessisches Ministerium Q2 2025</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <GoldSep />

      {/* Compliance-Fahrplan */}
      <SectionTitle>Compliance-Fahrplan</SectionTitle>
      <Card>
        <SectionLabel>Pre-Launch Phase (Q1 2025)</SectionLabel>
        <div style={{ marginBottom: '14px' }}>
          <BulletItem>AGB und Datenschutzerklärung finalisieren</BulletItem>
          <BulletItem>Marke beim DPMA anmelden</BulletItem>
          <BulletItem>Datenschutzbeauftragten beauftragen</BulletItem>
          <BulletItem>Erste Sicherheitsaudits durchführen</BulletItem>
          <BulletItem>Versicherungsverträge abschließen</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '14px' }}>Launch Phase (Q2-Q3 2025)</SectionLabel>
        <div style={{ marginBottom: '14px' }}>
          <BulletItem>§45b Antrag bei Hessischem Ministerium einreichen</BulletItem>
          <BulletItem>Engel-Schulungen durchführen (§53b)</BulletItem>
          <BulletItem>Beta-Testing mit Compliance-Fokus</BulletItem>
          <BulletItem>Handelsregister-Eintrag aktualisieren</BulletItem>
          <BulletItem>Datenschutz-Folgenabschätzung (DSFA) durchführen</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '14px' }}>Wachstums Phase (Q4 2025)</SectionLabel>
        <div style={{ marginBottom: '14px' }}>
          <BulletItem>Regelmäßige Compliance-Audits starten</BulletItem>
          <BulletItem>Schulungsprogramme für Engel expandieren</BulletItem>
          <BulletItem>Datenschutz-Dokumentation kontinuierlich aktualisieren</BulletItem>
          <BulletItem>Erweiterung auf weitere Bundesländer vorbereiten</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '14px' }}>Skalierungs Phase (2026+)</SectionLabel>
        <div>
          <BulletItem>Bundesweit Lizenzen einholen (wenn erforderlich)</BulletItem>
          <BulletItem>Interne Compliance-Abteilung etablieren</BulletItem>
          <BulletItem>Versicherungsschutz erweitern</BulletItem>
          <BulletItem>Internationale Expansion vorbereiten (evtl.)</BulletItem>
        </div>
      </Card>

      <GoldSep />

      {/* Risikominimierung */}
      <SectionTitle>Risikominimierung & Best Practices</SectionTitle>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: '12px' }}>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '6px', fontSize: '13px' }}>Rechtsberatung</div>
            <Paragraph style={{ margin: '0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Externe Anwälte für komplexe Fragen</Paragraph>
          </div>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '6px', fontSize: '13px' }}>Regelmäßige Audits</div>
            <Paragraph style={{ margin: '0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Quartalweise Compliance-Überprüfungen</Paragraph>
          </div>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '6px', fontSize: '13px' }}>Versicherungsschutz</div>
            <Paragraph style={{ margin: '0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Umfassende Haftungsdeckung</Paragraph>
          </div>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '6px', fontSize: '13px' }}>Schulungen</div>
            <Paragraph style={{ margin: '0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Team und Engel Compliance-Training</Paragraph>
          </div>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '6px', fontSize: '13px' }}>Dokumentation</div>
            <Paragraph style={{ margin: '0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Alle Compliance-Dokumente archiviert</Paragraph>
          </div>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '6px', fontSize: '13px' }}>Incident Response</div>
            <Paragraph style={{ margin: '0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>Krisenkommunikationsplan etabliert</Paragraph>
          </div>
        </div>
      </Card>
    </DocPageLayout>
  );
}
