'use client';

import { Icons } from '../docs/shared';
import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, StatBox, TableRow, Badge, C, GoldSep, SectionLabel } from '../docs/shared';

export default function GoToMarketPage() {
  return (
    <DocPageLayout
      title="Go-to-Market Strategie"
      subtitle="Launchkampagne, Kanäle & Wachstumsplan"
      icon={Icons.rocket(32)}
      badge="Strategie"
      lang="de"
    >
      {/* Zusammenfassung */}
      <SectionTitle>Launchkampagne Zusammenfassung</SectionTitle>
      <Card>
        <Paragraph>
          Die <strong>"Dein Engel für den Alltag"</strong> Launchkampagne wurde strategisch für eine 4-wöchige intensive Periode konzipiert. Der Fokus liegt auf dem Pilotmarkt <strong>Frankfurt/Rhein-Main</strong>, mit einer dualen Zielgruppen-Ansprache für Kunden (Familien & Senioren) und Anbieter (Alltagsbegleiter).
        </Paragraph>
        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '3px solid #C9963C' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#C9963C', fontWeight: '600', marginBottom: '4px' }}>KAMPAGNEN-DAUER</div>
              <div style={{ fontSize: '16px', fontWeight: '600' }}>4 Wochen</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#C9963C', fontWeight: '600', marginBottom: '4px' }}>PILOTMARKT</div>
              <div style={{ fontSize: '16px', fontWeight: '600' }}>Frankfurt/Rhein-Main</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#C9963C', fontWeight: '600', marginBottom: '4px' }}>ZIELGRUPPEN</div>
              <div style={{ fontSize: '16px', fontWeight: '600' }}>2 Segmente</div>
            </div>
          </div>
        </div>
      </Card>

      <GoldSep />

      {/* Zielgruppenanalyse */}
      <SectionTitle>Zielgruppenanalyse</SectionTitle>
      <Card>
        <div style={{ overflowX: 'auto', marginBottom: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Segment</th>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Profil</th>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Primäre Kanäle</th>
              </tr>
            </thead>
            <tbody>
              <TableRow cells={["Familien", "35-65 Jahre, Betreuungsbedarf", "Facebook, Instagram, Lokal"]} />
              <TableRow cells={["Senioren", "65+ Jahre, Unterstützungsbedarf", "Print, Arztpraxen, Offline"]} />
              <TableRow cells={["Alltagsbegleiter", "25-55 Jahre, Jobsuchend", "LinkedIn, Indeed, Facebook"]} />
              <TableRow cells={["Multiplikatoren", "Ärzte, Pflegeberater, Sozialarbeiter", "LinkedIn, E-Mail, Direct"]} />
            </tbody>
          </table>
        </div>
      </Card>

      <GoldSep />

      {/* Kanalstrategie */}
      <SectionTitle>Kanalstrategie & Content-Plan</SectionTitle>
      <Card>
        <SectionLabel>Digitale Kanäle</SectionLabel>
        <div style={{ marginBottom: '16px' }}>
          <BulletItem><strong>Instagram:</strong> 4 Posts pro Woche (Carousel, Stories, Reels)</BulletItem>
          <BulletItem><strong>Facebook:</strong> 3 Posts pro Woche (Zielgruppe 45+, Community Building)</BulletItem>
          <BulletItem><strong>LinkedIn:</strong> 3 Posts pro Woche (B2B, Partnerships, Recruitement)</BulletItem>
          <BulletItem><strong>TikTok:</strong> 3 Videos pro Woche (Jüngere Zielgruppe, Authentizität)</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '16px' }}>Content & Newsletter</SectionLabel>
        <div style={{ marginBottom: '16px' }}>
          <BulletItem><strong>Newsletter:</strong> Wöchentlich (Kundenseite + Engel-Seite)</BulletItem>
          <BulletItem><strong>Blog:</strong> 1-2 Artikel pro Woche (SEO, Thought Leadership)</BulletItem>
          <BulletItem><strong>Podcast "Engel im Alltag":</strong> Wöchentlich (Geschichten, Interviews)</BulletItem>
        </div>

        <SectionLabel style={{ marginTop: '16px' }}>Offline & PR</SectionLabel>
        <div>
          <BulletItem><strong>Pressearbeit:</strong> Monatliche Pressemitteilungen und Journalistenoutreach</BulletItem>
          <BulletItem><strong>Lokale Events:</strong> Launch-Party und Community Events</BulletItem>
          <BulletItem><strong>Print-Flyer:</strong> In Arztpraxen, Apotheken, Pflegestützpunkten</BulletItem>
        </div>
      </Card>

      <GoldSep />

      {/* 4-Wochen Launch-Plan */}
      <SectionTitle>4-Wochen Launch-Plan</SectionTitle>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '4px solid #C9963C' }}>
            <div style={{ color: '#C9963C', fontWeight: '600', marginBottom: '8px', fontSize: '14px' }}>WOCHE 1: "Wir stellen vor"</div>
            <Paragraph style={{ margin: '6px 0', fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>
              <strong>Fokus:</strong> Awareness & Launch-Ankündigung
            </Paragraph>
            <BulletItem style={{ fontSize: '13px' }}>App-Launch-Ankündigung auf allen Kanälen</BulletItem>
            <BulletItem style={{ fontSize: '13px' }}>Teaser-Videos und Visuals</BulletItem>
            <BulletItem style={{ fontSize: '13px' }}>Gründer-Story und Vision</BulletItem>
            <BulletItem style={{ fontSize: '13px' }}>Erste Pressemitteilung (regionale Medien)</BulletItem>
          </div>

          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '4px solid #C9963C' }}>
            <div style={{ color: '#C9963C', fontWeight: '600', marginBottom: '8px', fontSize: '14px' }}>WOCHE 2: "Unsere Engel"</div>
            <Paragraph style={{ margin: '6px 0', fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>
              <strong>Fokus:</strong> Trust & Social Proof
            </Paragraph>
            <BulletItem style={{ fontSize: '13px' }}>Testimonials von Beta-Testern</BulletItem>
            <BulletItem style={{ fontSize: '13px' }}>Engel-Profile vorstellen (Qualifikationen)</BulletItem>
            <BulletItem style={{ fontSize: '13px' }}>Sicherheit & DSGVO Highlights</BulletItem>
            <BulletItem style={{ fontSize: '13px' }}>Community-Engagement fördern</BulletItem>
          </div>

          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '4px solid #C9963C' }}>
            <div style={{ color: '#C9963C', fontWeight: '600', marginBottom: '8px', fontSize: '14px' }}>WOCHE 3: "Geschichten aus dem Alltag"</div>
            <Paragraph style={{ margin: '6px 0', fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>
              <strong>Fokus:</strong> Emotionale Verbindung
            </Paragraph>
            <BulletItem style={{ fontSize: '13px' }}>Case Studies & Erfolgsgeschichten</BulletItem>
            <BulletItem style={{ fontSize: '13px' }}>User-Generated Content (UGC)</BulletItem>
            <BulletItem style={{ fontSize: '13px' }}>Podcast-Episoden mit Nutzern</BulletItem>
            <BulletItem style={{ fontSize: '13px' }}>Community-Building Events</BulletItem>
          </div>

          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderLeft: '4px solid #C9963C' }}>
            <div style={{ color: '#C9963C', fontWeight: '600', marginBottom: '8px', fontSize: '14px' }}>WOCHE 4: "Jetzt starten"</div>
            <Paragraph style={{ margin: '6px 0', fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>
              <strong>Fokus:</strong> Conversion & Sign-ups
            </Paragraph>
            <BulletItem style={{ fontSize: '13px' }}>Expliziter Call-to-Action auf allen Kanälen</BulletItem>
            <BulletItem style={{ fontSize: '13px' }}>Limited-Time Offers & Anreize</BulletItem>
            <BulletItem style={{ fontSize: '13px' }}>Retargeting auf warm leads</BulletItem>
            <BulletItem style={{ fontSize: '13px' }}>Launch-Event und Feiern</BulletItem>
          </div>
        </div>
      </Card>

      <GoldSep />

      {/* Lokale Partnerschaften */}
      <SectionTitle>Lokale Partnerschaften</SectionTitle>
      <Card>
        <SectionLabel>Strategische Partner im Rhein-Main Gebiet</SectionLabel>
        <div style={{ marginTop: '12px' }}>
          <BulletItem><strong>Pflegestützpunkte:</strong> Beratung, Flyer-Verteiler, Multiplikatoren</BulletItem>
          <BulletItem><strong>Seniorenbeiräte:</strong> Direkter Zugang zu Zielgruppe, Veranstaltungen</BulletItem>
          <BulletItem><strong>Arztpraxen & Apotheken:</strong> Print-Materialien, Mundpropaganda</BulletItem>
          <BulletItem><strong>Kirchengemeinden:</strong> Senioren-Netzwerke, Glaubwürdigkeit</BulletItem>
          <BulletItem><strong>Krankenkassen (AOK, Barmer, TK):</strong> Empfehlungen, Kooperationen</BulletItem>
          <BulletItem><strong>Lokale Medien:</strong> Frankfurter Rundschau, Main-Echo, Radio</BulletItem>
          <BulletItem><strong>LinkedIn-Netzwerk:</strong> Recruitement für Engel</BulletItem>
        </div>
      </Card>

      <GoldSep />

      {/* Budget */}
      <SectionTitle>Marketing-Budget (6 Monate)</SectionTitle>
      <Card>
        <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Kanal / Bereich</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', color: '#C9963C', fontWeight: '600' }}>Budget</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Social Media Ads (Facebook, Instagram)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€3.000</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Google Ads (Suchmaschine & Display)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€1.800</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Flyer & Print-Materialien</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€1.200</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>PR & Pressework</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€1.200</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Content Creation (Video, Design, Copywriting)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€1.800</td>
              </tr>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Events & Launch Party</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '500' }}>€1.200</td>
              </tr>
              <tr>
                <td style={{ padding: '10px 8px', fontWeight: '600', color: '#C9963C' }}>GESAMT (6 Monate)</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700', color: '#C9963C', fontSize: '15px' }}>€10.200</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Paragraph style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', marginTop: '12px' }}>
          Budget kann flexibel umgeschichtet werden basierend auf Performance-Daten und KPI-Erreichung.
        </Paragraph>
      </Card>

      <GoldSep />

      {/* KPIs */}
      <SectionTitle>Key Performance Indicators (KPIs)</SectionTitle>
      <Card>
        <div style={{ overflowX: 'auto', marginBottom: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>KPI</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Start</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Ziel (6 Mo.)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>App Downloads</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>200</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500', color: '#C9963C' }}>2.500</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Aktive Nutzer</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>50</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500', color: '#C9963C' }}>500</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Registrierte Engel</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>20</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500', color: '#C9963C' }}>100</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Abgeschlossene Buchungen</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>30</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500', color: '#C9963C' }}>500</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(201, 150, 60, 0.2)' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Instagram Follower</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>500</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500', color: '#C9963C' }}>3.000</td>
              </tr>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <td style={{ padding: '10px 8px', color: 'rgba(255, 255, 255, 0.9)' }}>Newsletter Abonnenten</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>100</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500', color: '#C9963C' }}>1.000</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <GoldSep />

      {/* Marketing Team */}
      <SectionTitle>Marketing Team & Verantwortlichkeiten</SectionTitle>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderTop: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '8px' }}>Sophie Weber</div>
            <Paragraph style={{ margin: '0 0 8px 0', fontSize: '13px' }}>Content & Social Media</Paragraph>
            <BulletItem style={{ fontSize: '12px' }}>Social Posts & Ads</BulletItem>
            <BulletItem style={{ fontSize: '12px' }}>Blog & Newsletter</BulletItem>
            <BulletItem style={{ fontSize: '12px' }}>Video Content</BulletItem>
          </div>
          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderTop: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '8px' }}>Laura Leeman</div>
            <Paragraph style={{ margin: '0 0 8px 0', fontSize: '13px' }}>Community & Partnerships</Paragraph>
            <BulletItem style={{ fontSize: '12px' }}>Lokale Partner</BulletItem>
            <BulletItem style={{ fontSize: '12px' }}>Events & Aktionen</BulletItem>
            <BulletItem style={{ fontSize: '12px' }}>Community Engagement</BulletItem>
          </div>
          <div style={{ padding: '14px', backgroundColor: 'rgba(201, 150, 60, 0.08)', borderRadius: '8px', borderTop: '3px solid #C9963C' }}>
            <div style={{ fontWeight: '600', color: '#C9963C', marginBottom: '8px' }}>Yusuf Demir</div>
            <Paragraph style={{ margin: '0 0 8px 0', fontSize: '13px' }}>Partnerships & B2B</Paragraph>
            <BulletItem style={{ fontSize: '12px' }}>Krankenkassen</BulletItem>
            <BulletItem style={{ fontSize: '12px' }}>Medienpartnerschaften</BulletItem>
            <BulletItem style={{ fontSize: '12px' }}>Strategische Allianzen</BulletItem>
          </div>
        </div>
      </Card>
    </DocPageLayout>
  );
}
