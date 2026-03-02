'use client';

import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, StatBox, TableRow, Badge, C, GoldSep, SectionLabel } from '../docs/shared';

export default function ProdukttechnologiePage() {
  return (
    <DocPageLayout
      title="Produkt & Technologie"
      subtitle="Tech Stack, Architektur, Features & Roadmap"
      icon="⚙️"
      badge="Produkt"
      lang="de"
    >
      {/* Produktübersicht */}
      <SectionTitle>Produktübersicht</SectionTitle>
      <Card>
        <Paragraph>
          <strong>AlltagsEngel</strong> ist eine innovative Mobile-App für iOS und Android, die entwickelt wurde, um Alltag und Unterstützung für Familien, Senioren und Alltagsbegleiter zu verbessern. Die App verbindet Kunden mit qualifizierten Alltagsbegleitern basierend auf dem deutschen Regulierungsrahmen (§45b SGB XI).
        </Paragraph>
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(201, 150, 60, 0.2)' }}>
          <BulletItem>Plattform: iOS & Android</BulletItem>
          <BulletItem>Framework: React Native + Expo SDK 54</BulletItem>
          <BulletItem>Benutzerrollen: 2 Rollen (Kunden / Alltagsbegleiter "Engel")</BulletItem>
          <BulletItem>Status: MVP in Entwicklung (Q1-Q3 2025)</BulletItem>
        </div>
      </Card>

      <GoldSep />

      {/* Kernfunktionen */}
      <SectionTitle>Kernfunktionen</SectionTitle>
      <Card>
        <SectionLabel>Benutzererlebnis</SectionLabel>
        <div style={{ marginBottom: '16px' }}>
          <BulletItem>Splash Screen → Rollenauswahl → Registrierung</BulletItem>
          <BulletItem>Intuitive Onboarding Journey mit Dark Mode Design</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '16px' }}>Kundenfunktionen</SectionLabel>
        <div style={{ marginBottom: '16px' }}>
          <BulletItem>Engel suchen und filtern nach Verfügbarkeit</BulletItem>
          <BulletItem>Buchungsystem mit Echtzeit-Updates</BulletItem>
          <BulletItem>Chat & In-App Messaging mit Engeln</BulletItem>
          <BulletItem>Profilmanagement und Favoriten</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '16px' }}>Engel-Funktionen (Alltagsbegleiter)</SectionLabel>
        <div style={{ marginBottom: '16px' }}>
          <BulletItem>Job-Übersicht und -Akzeptanz mit Echtzeit-Benachrichtigungen</BulletItem>
          <BulletItem>Chat direkt mit Kunden</BulletItem>
          <BulletItem>Bewertungen und Ratings (5-Stern-System)</BulletItem>
          <BulletItem>Profilseite mit Qualifikationen</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '16px' }}>Plattformfeatures</SectionLabel>
        <div>
          <BulletItem>§45b SGB XI Compliance Integration</BulletItem>
          <BulletItem>5-Stern-Bewertungssystem für Vertrauensaufbau</BulletItem>
          <BulletItem>Push-Benachrichtigungen für Echtzeit-Engagement</BulletItem>
          <BulletItem>Verifiziertes Profil-System</BulletItem>
        </div>
      </Card>

      <GoldSep />

      {/* Technische Architektur */}
      <SectionTitle>Technische Architektur</SectionTitle>
      <Card>
        <SectionLabel>Backend-as-a-Service mit Supabase</SectionLabel>
        <Paragraph style={{ marginBottom: '16px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.8)' }}>
          Die App nutzt eine moderne BaaS-Architektur mit Supabase, um Skalierbarkeit, Sicherheit und Wartbarkeit zu gewährleisten.
        </Paragraph>

        <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Komponente</th>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Technologie</th>
              </tr>
            </thead>
            <tbody>
              <TableRow label="Frontend" value="React Native (Expo SDK 54)" />
              <TableRow label="Router" value="Expo Router" />
              <TableRow label="Backend" value="Supabase (PostgreSQL)" />
              <TableRow label="Authentifizierung" value="Supabase Auth + Expo Secure Store" />
              <TableRow label="Datenspeicher" value="Supabase Storage" />
              <TableRow label="Echtzeit-Daten" value="Supabase Realtime" />
              <TableRow label="Design System" value="Dark Mode + Gold Accents (#C9963C)" />
              <TableRow label="Schriftarten" value="Jost + Cormorant Garamond" />
              <TableRow label="Icons" value="Ionicons" />
              <TableRow label="Hosting" value="Supabase Cloud EU-Region" />
            </tbody>
          </table>
        </div>
      </Card>

      <GoldSep />

      {/* Sicherheit & Datenschutz */}
      <SectionTitle>Sicherheit & Datenschutz</SectionTitle>
      <Card>
        <SectionLabel>Datenschutz (DSGVO & SGB XI konform)</SectionLabel>
        <div style={{ marginBottom: '16px' }}>
          <BulletItem>DSGVO-konformitet mit externem Datenschutzbeauftragtem</BulletItem>
          <BulletItem>TLS 1.3 Verschlüsselung für alle Datenübertragungen</BulletItem>
          <BulletItem>AES-256 für sensitive Daten im Ruhezustand</BulletItem>
          <BulletItem>Row-Level Security (RLS) in PostgreSQL</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '16px' }}>Benutzer-Authentifizierung</SectionLabel>
        <div style={{ marginBottom: '16px' }}>
          <BulletItem>Expo Secure Store für sichere Token-Speicherung</BulletItem>
          <BulletItem>Keine Tracking oder Telemetrie ohne Zustimmung</BulletItem>
          <BulletItem>Sichere Logout und Session-Management</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '16px' }}>Compliance-Maßnahmen</SectionLabel>
        <div>
          <BulletItem>Art. 9 DSGVO Compliance (sensible Kategorien wie Gesundheit)</BulletItem>
          <BulletItem>Regelmäßige Sicherheitsaudits geplant</BulletItem>
          <BulletItem>EU-Hosting in Supabase Cloud (Datenschutz-konform)</BulletItem>
          <BulletItem>Datenverarbeitungsverzeichnis und AVVs dokumentiert</BulletItem>
        </div>
      </Card>

      <GoldSep />

      {/* Entwicklungs-Roadmap */}
      <SectionTitle>Entwicklungs-Roadmap</SectionTitle>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <StatBox label="MVP" value="Q1 2025" />
          <StatBox label="Beta Launch" value="Q2 2025" />
          <StatBox label="Produktstart" value="Q3 2025" />
          <StatBox label="Version 2.0" value="Q4 2025" />
        </div>

        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(201, 150, 60, 0.2)' }}>
          <SectionLabel>Meilensteine</SectionLabel>
          <div style={{ marginTop: '12px' }}>
            <BulletItem><strong>Q1 2025:</strong> MVP mit Kern-Features, User Testing Vorbereitung</BulletItem>
            <BulletItem><strong>Q2 2025:</strong> Beta mit echten Nutzern, Feedback Integration</BulletItem>
            <BulletItem><strong>Q3 2025:</strong> Öffentlicher Launch im Pilotmarkt Frankfurt</BulletItem>
            <BulletItem><strong>Q4 2025:</strong> Version 2.0 mit erweiterten Features, Payment Integration</BulletItem>
            <BulletItem><strong>2026:</strong> Skalierung auf weitere Bundesländer</BulletItem>
          </div>
        </div>
      </Card>

      <GoldSep />

      {/* Nächste Schritte */}
      <SectionTitle>Nächste Schritte</SectionTitle>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '6px' }}>User Testing</div>
            <Paragraph style={{ margin: 0, fontSize: '13px' }}>Erste Nutzer-Tests mit Kunden und Engeln durchführen</Paragraph>
          </div>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '6px' }}>Backend Integration</div>
            <Paragraph style={{ margin: 0, fontSize: '13px' }}>Vollständige Supabase-Integration mit Datenbank</Paragraph>
          </div>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '6px' }}>Compliance Dokumentation</div>
            <Paragraph style={{ margin: 0, fontSize: '13px' }}>DSGVO und §45b Dokumentation abschließen</Paragraph>
          </div>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '6px' }}>Marketing Strategie</div>
            <Paragraph style={{ margin: 0, fontSize: '13px' }}>Go-to-Market Kampagne für Launch vorbereiten</Paragraph>
          </div>
          <div style={{ padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '6px' }}>Partnerschaften</div>
            <Paragraph style={{ margin: 0, fontSize: '13px' }}>Lokalpartner in Frankfurt/Rhein-Main aktivieren</Paragraph>
          </div>
        </div>
      </Card>
    </DocPageLayout>
  );
}
