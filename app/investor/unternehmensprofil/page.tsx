'use client'

import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, StatBox, TableRow, Badge, C, GoldSep, SectionLabel } from '../docs/shared'

export default function UnternehmensprofiltPage() {
  return (
    <DocPageLayout
      title="Unternehmensprofil"
      subtitle="Firmenprofil, Gründerteam & Vision"
      icon="🏢"
      badge="Unternehmen"
      lang="de"
    >
      {/* Unternehmensübersicht */}
      <Card>
        <SectionTitle>Unternehmensübersicht</SectionTitle>
        <Paragraph>
          <C>AlltagsEngel</C> ist eine digitale Plattform, die Pflegebedürftige mit zertifizierten Alltagsbegleitern verbindet. Als Two-Sided Marketplace transformieren wir die fragmentierte Pflege- und Begleitlandschaft in Deutschland.
        </Paragraph>
        <Paragraph>
          <C>Mission:</C> Alltagsbegleitung in Deutschland zugänglicher, sicherer und menschlicher zu machen.
        </Paragraph>
      </Card>

      {/* Das Problem */}
      <Card>
        <SectionTitle>Das Problem</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatBox value="4,96 Mio" label="Pflegebedürftige in Deutschland" />
          <StatBox value="€125/Monat" label="§45b Entlastungsbetrag pro Person" />
          <StatBox value="€7,44 Mrd" label="Jährliches Gesamtbudget" />
          <StatBox value="Nur 40%" label="Aktuell genutzter Budget-Anteil" />
        </div>
        <BulletItem>Fragmentierter Markt mit vielen ungleichen Anbietern</BulletItem>
        <BulletItem>Schwierige Vermittlung zwischen Pflegebedürftigen und Begleitern</BulletItem>
        <BulletItem>Fehlende digitale §45b-Lösungen</BulletItem>
        <BulletItem>Sicherheit und Verifikation nicht standardisiert</BulletItem>
      </Card>

      {/* Unsere Lösung */}
      <Card>
        <SectionTitle>Unsere Lösung</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <Badge>Mobile App iOS/Android</Badge>
          <Badge>§45b Integration</Badge>
          <Badge>100% Versicherte Begleiter</Badge>
          <Badge>Verifizierte Engel §53b</Badge>
          <Badge>Chat & Buchung & Bewertungen</Badge>
          <Badge>Transparente Preise</Badge>
        </div>
        <Paragraph>
          AlltagsEngel stellt eine vollständig integrierte Mobile-First-Lösung bereit, die:
        </Paragraph>
        <BulletItem>Nahtlose §45b-Abrechnung ermöglicht</BulletItem>
        <BulletItem>Alle Begleiter zu 100% versichert sind</BulletItem>
        <BulletItem>Engel gemäß §53b verifiziert sind</BulletItem>
        <BulletItem>Echtzeit-Chat, flexible Buchung und Bewertungssystem bietet</BulletItem>
      </Card>

      {/* Marktchance */}
      <Card>
        <SectionTitle>Marktchance</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatBox value="€50+ Mrd" label="TAM (Gesamt adressierbarer Markt)" />
          <StatBox value="€8–12 Mrd" label="SAM (Servicierbarer Markt)" />
          <StatBox value="€200–400 Mio" label="SOM (Erreichbarer Markt, 5 Jahre)" />
        </div>
        <Paragraph>
          Der deutsche Markt für Alltagsbegleitung wächst mit 3–5% pro Jahr. Die §45b-Entlastungsleistung schafft einen eingebauten Finanzierungsmechanismus für 4,96 Mio Pflegebedürftige.
        </Paragraph>
      </Card>

      {/* Geschäftsmodell */}
      <Card>
        <SectionTitle>Geschäftsmodell</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatBox value="18%" label="Plattform-Provision pro Buchung" />
          <StatBox value="€9,99" label="Premium-Abo pro Monat" />
          <StatBox value="Geplant" label="Direktabrechnung mit Krankenkassen" />
        </div>
        <Paragraph>
          Unser Geschäftsmodell kombiniert Provisionsgebühren, Premium-Features und zukünftige B2B-Partnerschaften.
        </Paragraph>
      </Card>

      {/* Wettbewerbsvorteil */}
      <Card>
        <SectionTitle>Wettbewerbsvorteil</SectionTitle>
        <BulletItem><C>Erste digitale §45b-Plattform:</C> Keine etablierten Konkurrenten mit vollständiger Lösung</BulletItem>
        <BulletItem><C>Vollversicherung:</C> 100% der Begleiter versichert – Wettbewerbern fehlt dies</BulletItem>
        <BulletItem><C>Digital-First:</C> Native Mobile Apps mit modernem UX/UI</BulletItem>
        <BulletItem><C>Netzwerkeffekte:</C> Zwei-Seiten-Marktplatz mit exponentieller Wachstumsdynamik</BulletItem>
      </Card>

      {/* Team */}
      <Card>
        <SectionTitle>Gründerteam</SectionTitle>
        <div style={{ overflowX: 'auto', marginTop: '1.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #D4AF37' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: '#D4AF37', fontWeight: '600' }}>Name</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: '#D4AF37', fontWeight: '600' }}>Position</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: '#D4AF37', fontWeight: '600' }}>Fokus</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Yusuf</td>
                <td style={{ padding: '0.75rem' }}>CEO & Gründer</td>
                <td style={{ padding: '0.75rem' }}>Strategie, Fundraising</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Laura</td>
                <td style={{ padding: '0.75rem' }}>Teamleiterin & Co-Gründerin</td>
                <td style={{ padding: '0.75rem' }}>Operationen, HR</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}>Mehmet</td>
                <td style={{ padding: '0.75rem' }}>CTO & Co-Gründer</td>
                <td style={{ padding: '0.75rem' }}>Entwicklung, Tech-Strategie</td>
              </tr>
              <tr>
                <td style={{ padding: '0.75rem' }}>Sophie</td>
                <td style={{ padding: '0.75rem' }}>Marketing & Growth</td>
                <td style={{ padding: '0.75rem' }}>User Acquisition, Brand</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Aktuelle Phase */}
      <Card>
        <SectionTitle>Aktuelle Phase</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatBox value="MVP" label="Entwicklung in Fortschritt" />
          <StatBox value="4 Wochen" label="Marketing-Plan läuft" />
          <StatBox value="Frankfurt" label="Bürostandort" />
          <StatBox value="4 Team" label="Vollzeit-Mitglieder" />
        </div>
        <Paragraph>
          <C>Seed-Finanzierungsziel: €500.000</C>
        </Paragraph>
        <Paragraph>
          Wir befinden uns in einer kritischen Wachstumsphase mit MVP-Fertigstellung, Launch-Vorbereitung und Seedfinanzierung für Marktexpansion.
        </Paragraph>
      </Card>
    </DocPageLayout>
  )
}
