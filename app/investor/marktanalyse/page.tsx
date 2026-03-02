'use client'

import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, StatBox, TableRow, Badge, C, GoldSep, SectionLabel } from '../docs/shared'

export default function MarktanalysePage() {
  return (
    <DocPageLayout
      title="Marktanalyse"
      subtitle="TAM/SAM/SOM, Wettbewerb & Geschäftsmodell"
      icon="📈"
      badge="Markt"
      lang="de"
    >
      {/* Pflegebedarf */}
      <Card>
        <SectionTitle>Pflegebedarf in Deutschland</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatBox value="4,96 Mio" label="Pflegebedürftige (aktuell)" />
          <StatBox value="6+ Mio" label="Prognose bis 2030" />
          <StatBox value="3–5%" label="Jährliches Wachstum" />
          <StatBox value="€50+ Mrd" label="Gesamtmarkt" />
        </div>
        <Paragraph>
          Die deutsche Bevölkerung altert rapide. Nach Prognosen des Statistischen Bundesamtes wird die Zahl der Pflegebedürftigen von 4,96 Millionen (2023) auf über 6 Millionen (2030) anwachsen – ein Plus von über 20% in 7 Jahren.
        </Paragraph>
        <Paragraph>
          Der Markt für Alltagsbegleitung und Pflegedienstleistungen wächst damit jährlich um 3–5%, was eine der stabilsten und am wenigsten zyklischen Branchen darstellt.
        </Paragraph>
      </Card>

      {/* §45b Entlastungsbetrag */}
      <Card>
        <SectionTitle>§45b Entlastungsbetrag – Der Katalysator</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatBox value="€125" label="Pro Pflegebedürftiger/Monat" />
          <StatBox value="€1.500" label="Pro Pflegebedürftiger/Jahr" />
          <StatBox value="€7,44 Mrd" label="Gesamtbudget/Jahr" />
          <StatBox value="Nur 40%" label="Aktuell genutzter Anteil" />
        </div>
        <Paragraph>
          Der §45b Entlastungsbetrag ist ein Regelwerk des Sozialgesetzbuches (SGB XI), das Pflegebedürftigen monatlich €125 für Alltagsbegleitung zur Verfügung stellt. Dies gilt für Versicherte mit anerkanntem Pflegegrad.
        </Paragraph>
        <Paragraph>
          <strong style={{color:'#C9963C'}}>Die entscheidende Erkenntnis:</strong> Diese €125/Monat sind bereits von den Krankenkassen budgetiert und fließen automatisch – es ist keine private Zahlung. Das Geld wird nur nicht genutzt, weil der Markt fragmentiert ist.
        </Paragraph>
        <BulletItem>Gesamtbudget pro Jahr: 4,96 Mio Menschen × €125 × 12 = €7,44 Mrd</BulletItem>
        <BulletItem>Aktuell genutzter Anteil: ~40% = €2,98 Mrd/Jahr</BulletItem>
        <BulletItem>Ungenutztes Potenzial: €4,46 Mrd/Jahr (60%)</BulletItem>
        <BulletItem>AlltagsEngel adressiert diesen Markt mit digitaler Effizienz</BulletItem>
      </Card>

      {/* TAM SAM SOM */}
      <Card>
        <SectionTitle>TAM / SAM / SOM Analyse</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatBox value="€50+ Mrd" label="TAM (Gesamt adressierbarer Markt)" />
          <StatBox value="€8–12 Mrd" label="SAM (Servicierbarer Markt)" />
          <StatBox value="€200–400 Mio" label="SOM (Erreichbarer Markt, 5J)" />
        </div>
        <SectionLabel>TAM - Total Addressable Market:</SectionLabel>
        <Paragraph>
          Der gesamte Markt für Alltagsbegleitung, Pflege und Haushalthilfen in Deutschland. Dieser umfasst alle €125-Entlastungen, private Ausgaben, Krankenkassen-Leistungen und Sozialetat insgesamt.
        </Paragraph>
        <SectionLabel style={{ marginTop: '1.5rem' }}>SAM - Serviceable Available Market:</SectionLabel>
        <Paragraph>
          Der Anteil des TAM, den wir mit unserem digitalen Marketplace realistische adressieren können – fokussiert auf §45b-gebundene Entlastungen, die durch unsere Plattform digitalisierbar sind.
        </Paragraph>
        <SectionLabel style={{ marginTop: '1.5rem' }}>SOM - Serviceable Obtainable Market:</SectionLabel>
        <Paragraph>
          Unser realistisches Ziel für die nächsten 5 Jahre mit aggressivem Growth-Plan. Basierend auf TAM/SAM-Penetration von 2–5%.
        </Paragraph>
      </Card>

      {/* Wettbewerbsanalyse */}
      <Card>
        <SectionTitle>Wettbewerbslandschaft</SectionTitle>
        <Paragraph style={{ marginBottom: '1.5rem' }}>
          Der Markt ist fragmentiert. Es gibt keine etablierte digitale Lösung mit vollständiger §45b-Integration und Zwei-Seiten-Marktplatz.
        </Paragraph>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #D4AF37' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: '#D4AF37', fontWeight: '600' }}>Anbieter</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: '#D4AF37', fontWeight: '600' }}>Modell</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: '#D4AF37', fontWeight: '600' }}>Stärken</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: '#D4AF37', fontWeight: '600' }}>Schwächen</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}><strong style={{color:'#C9963C'}}>Pflegehelden.de</strong></td>
                <td style={{ padding: '0.75rem' }}>Vermittlungsportal</td>
                <td style={{ padding: '0.75rem' }}>Große Datenbank</td>
                <td style={{ padding: '0.75rem' }}>Keine App, keine §45b, keine Versicherung, legacy tech</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}><strong style={{color:'#C9963C'}}>Careship</strong></td>
                <td style={{ padding: '0.75rem' }}>Care-Management</td>
                <td style={{ padding: '0.75rem' }}>B2B2C-Netzwerk</td>
                <td style={{ padding: '0.75rem' }}>Fokus auf Medizin, keine Alltagsbegleitung, teuer</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}><strong style={{color:'#C9963C'}}>Lokale Sozialstationen</strong></td>
                <td style={{ padding: '0.75rem' }}>Traditional offline</td>
                <td style={{ padding: '0.75rem' }}>Beziehungen, lokales Vertrauen</td>
                <td style={{ padding: '0.75rem' }}>Keine digitale Plattform, regionale Silos, hohe Ausfallquote</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '0.75rem' }}><strong style={{color:'#C9963C'}}>Private Vermittler</strong></td>
                <td style={{ padding: '0.75rem' }}>1:1 Coaching</td>
                <td style={{ padding: '0.75rem' }}>Personalisiert</td>
                <td style={{ padding: '0.75rem' }}>Nicht skalierbar, keine Standardisierung, unsicher</td>
              </tr>
              <tr style={{ backgroundColor: '#0d1117' }}>
                <td style={{ padding: '0.75rem', color: '#D4AF37', fontWeight: '600' }}><strong style={{color:'#C9963C'}}>AlltagsEngel</strong></td>
                <td style={{ padding: '0.75rem', color: '#D4AF37', fontWeight: '600' }}>Digital-First Marketplace</td>
                <td style={{ padding: '0.75rem', color: '#D4AF37', fontWeight: '600' }}>Vollversicherung, §45b, App, Chat, sichere Zahlungen</td>
                <td style={{ padding: '0.75rem', color: '#D4AF37', fontWeight: '600' }}>—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Geschäftsmodell */}
      <Card>
        <SectionTitle>Geschäftsmodell</SectionTitle>
        <SectionLabel>Revenue Streams:</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Plattform-Provision</div>
            <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>18% pro Buchung</div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0', marginTop: '0.5rem' }}>Bei Ø €40 Buchungswert = €7,20 pro Transaktion</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Premium-Abo</div>
            <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>€9,99/Monat</div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0', marginTop: '0.5rem' }}>Für Nutzer mit Lieblingsbegleiter (Prioritätsbuchung, Rabatte)</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>B2B Partnerschaften</div>
            <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>Geplant: Jahr 2+</div>
            <div style={{ fontSize: '0.85rem', color: '#B0B0B0', marginTop: '0.5rem' }}>Direkte Krankenkassen-Abrechnung, Seniorenresidenzen</div>
          </div>
        </div>
        <Paragraph>
          <strong style={{color:'#C9963C'}}>Unit Economics (bei stabiler Nutzung):</strong>
        </Paragraph>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <StatBox value="€40" label="Ø Buchungswert (Betrag für Begleiter)" />
          <StatBox value="€7,20" label="Plattform-Provision (18%)" />
          <StatBox value="25–40x" label="LTV/CAC Verhältnis" />
        </div>
      </Card>

      {/* Unit Economics */}
      <Card>
        <SectionTitle>Unit Economics in Detail</SectionTitle>
        <SectionLabel>Customer Lifetime Value (LTV):</SectionLabel>
        <Paragraph style={{ marginBottom: '1rem' }}>
          Ein durchschnittlicher Nutzer bucht ~10 Stunden/Monat à €40 = €400 Umsatz/Monat.
          Mit 18% Provision = €72 Profit/Monat.
          Bei durchschnittlicher Nutzungsdauer von 24 Monaten = LTV €1.728.
        </Paragraph>
        <SectionLabel>Customer Acquisition Cost (CAC):</SectionLabel>
        <Paragraph style={{ marginBottom: '1rem' }}>
          Akquisitionsbudget: €50 pro Nutzer (Digital Marketing, Ads).
          Break-Even nach ~3 Monaten.
        </Paragraph>
        <Paragraph>
          <strong style={{color:'#C9963C'}}>LTV/CAC Ratio: 1.728 / 50 = 34,5x</strong> – Industriestandard ist 3x. Dies ist ein sehr starkes Verhältnis.
        </Paragraph>
      </Card>

      {/* Skalierungsstrategie */}
      <Card>
        <SectionTitle>Skalierungsstrategie (5 Phasen)</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
          <div style={{ padding: '1.25rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '4px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Phase 1: Frankfurt (M1–M6)</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>MVP Launch, lokales Marketing, 500 aktive Nutzer, 50 Engel</div>
          </div>
          <div style={{ padding: '1.25rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '4px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Phase 2: Rhein-Main Region (M6–M12)</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>Expansion auf 5 Städte, 2.500 Nutzer, 150 Engel</div>
          </div>
          <div style={{ padding: '1.25rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '4px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Phase 3: Deutschland (Jahr 2)</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>Nationale Skalierung, 10.000 Nutzer, 500 Engel</div>
          </div>
          <div style={{ padding: '1.25rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '4px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Phase 4: DACH-Region (Jahr 3–4)</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>Österreich & Schweiz, 35.000+ Nutzer, 2.000 Engel</div>
          </div>
          <div style={{ padding: '1.25rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '4px solid #D4AF37' }}>
            <div style={{ color: '#D4AF37', fontWeight: '600', marginBottom: '0.5rem' }}>Phase 5: Europa (Jahr 5+)</div>
            <div style={{ fontSize: '0.9rem', color: '#E0E0E0' }}>Skalierung auf weitere europäische Märkte mit ähnlichen Modellen</div>
          </div>
        </div>
      </Card>

      {/* Risiken und Gegenmaßnahmen */}
      <Card>
        <SectionTitle>Risiken & Gegenmaßnahmen</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #FF6B6B' }}>
            <div style={{ color: '#FF6B6B', fontWeight: '600', marginBottom: '0.5rem' }}>Regulatorisches Risiko</div>
            <div style={{ fontSize: '0.85rem', color: '#E0E0E0', marginBottom: '0.75rem' }}>Neue Gesetze für Pflege-Apps könnten Geschäftsmodell beeinflussen</div>
            <div style={{ color: '#D4AF37', fontSize: '0.8rem', fontWeight: '500' }}>Gegenmaßnahme: Enge Kooperation mit Branchenverbänden, frühe Regelabstimmung</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #FF6B6B' }}>
            <div style={{ color: '#FF6B6B', fontWeight: '600', marginBottom: '0.5rem' }}>Wettbewerb</div>
            <div style={{ fontSize: '0.85rem', color: '#E0E0E0', marginBottom: '0.75rem' }}>Gut finanzierte Startup-Konkurrenz oder etablierte Pflegeanbieter</div>
            <div style={{ color: '#D4AF37', fontSize: '0.8rem', fontWeight: '500' }}>Gegenmaßnahme: First-Mover-Vorteil, Netzwerkeffekte, IP-Schutz</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #FF6B6B' }}>
            <div style={{ color: '#FF6B6B', fontWeight: '600', marginBottom: '0.5rem' }}>Vertrauen & Sicherheit</div>
            <div style={{ fontSize: '0.85rem', color: '#E0E0E0', marginBottom: '0.75rem' }}>Negative PR durch Vorfall mit Begleiter könnte Vertrauen schädigen</div>
            <div style={{ color: '#D4AF37', fontSize: '0.8rem', fontWeight: '500' }}>Gegenmaßnahme: 100% Versicherung, §53b Verifikation, Bewertungssystem</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #FF6B6B' }}>
            <div style={{ color: '#FF6B6B', fontWeight: '600', marginBottom: '0.5rem' }}>Nutzer-Akquisition</div>
            <div style={{ fontSize: '0.85rem', color: '#E0E0E0', marginBottom: '0.75rem' }}>Zielgruppe (60+) hat geringe digitale Adoption</div>
            <div style={{ color: '#D4AF37', fontSize: '0.8rem', fontWeight: '500' }}>Gegenmaßnahme: Desktop-freundliches UI, Telefon-Support, Angehörigen-Integration</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #FF6B6B' }}>
            <div style={{ color: '#FF6B6B', fontWeight: '600', marginBottom: '0.5rem' }}>Betriebliche Skalierung</div>
            <div style={{ fontSize: '0.85rem', color: '#E0E0E0', marginBottom: '0.75rem' }}>Schnelle Expansion erfordert operative Exzellenz</div>
            <div style={{ color: '#D4AF37', fontSize: '0.8rem', fontWeight: '500' }}>Gegenmaßnahme: Starkes Operationsteam, dokumentierte Prozesse, Franchise-Modell</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '0.5rem', borderLeft: '3px solid #FF6B6B' }}>
            <div style={{ color: '#FF6B6B', fontWeight: '600', marginBottom: '0.5rem' }}>Finanzierung & Runway</div>
            <div style={{ fontSize: '0.85rem', color: '#E0E0E0', marginBottom: '0.75rem' }}>€500K Seed reicht für ~15 Monate; A-Runde notwendig</div>
            <div style={{ color: '#D4AF37', fontSize: '0.8rem', fontWeight: '500' }}>Gegenmaßnahme: Aggressive Umsatzerzielung, KPI-fokussierter Growth, Early KPI-Milestones</div>
          </div>
        </div>
      </Card>

      {/* Fazit */}
      <Card>
        <SectionTitle>Marktfazit</SectionTitle>
        <Paragraph>
          Der Markt für Alltagsbegleitung in Deutschland ist:
        </Paragraph>
        <BulletItem><strong style={{color:'#C9963C'}}>Groß:</strong> €50+ Mrd TAM mit 4,96 Mio potenziellen Kunden</BulletItem>
        <BulletItem><strong style={{color:'#C9963C'}}>Staatlich finanziert:</strong> €7,44 Mrd/Jahr durch §45b, 60% ungenutztes Potenzial</BulletItem>
        <BulletItem><strong style={{color:'#C9963C'}}>Wachsend:</strong> 3–5% jährlich durch demografische Verschiebung</BulletItem>
        <BulletItem><strong style={{color:'#C9963C'}}>Fragmentiert:</strong> Keine etablierte digitale Lösung</BulletItem>
        <BulletItem><strong style={{color:'#C9963C'}}>Erste-Mover-Chance:</strong> AlltagsEngel kann den Markt mit digitalem Marketplace transformieren</BulletItem>
      </Card>
    </DocPageLayout>
  )
}
