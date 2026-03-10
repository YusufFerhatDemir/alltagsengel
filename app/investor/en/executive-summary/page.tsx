'use client';

import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, StatBox, TableRow, Badge, C, GoldSep, SectionLabel, Icons } from '../../docs/shared';

export default function ExecutiveSummaryPage() {
  return (
    <DocPageLayout 
      title="Executive Summary"
      subtitle="Investment Opportunity at a Glance"
      icon={Icons.fileText(32)}
      badge="Overview"
      lang="en"
    >
      {/* Key Facts */}
      <SectionLabel>Key Facts at a Glance</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '40px' }}>
        <StatBox label="Market Size" value="€50B+" />
        <StatBox label="Care-Dependent" value="4.96M" />
        <StatBox label="Gross Margin" value="~50%" />
        <StatBox label="Company Status" value="HRB ✓" />
      </div>

      {/* The Opportunity Section */}
      <SectionTitle>The Opportunity</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="🇩🇪">
          <strong>Germany's Aging Population:</strong> 4.96 million care-dependent people with growing needs
        </BulletItem>
        <BulletItem icon="📋">
          <strong>§45b Framework:</strong> €131/month care relief benefit serves 2.98M people, but only ~40% fully utilize it
        </BulletItem>
        <BulletItem icon="💰">
          <strong>Market Opportunity:</strong> €7.79B annual benefit pool, mostly fragmented and offline
        </BulletItem>
        <BulletItem icon="📱">
          <strong>Digital Gap:</strong> No integrated digital-first platform exists for §45b hiring and direct Pflegekasse billing
        </BulletItem>
        <BulletItem icon="🚑">
          <strong>Second Vertical — Krankentransport:</strong> Patient transport mediation as additional revenue stream with similar marketplace dynamics
        </BulletItem>
        <BulletItem icon="🏢">
          <strong>Company Registered:</strong> AlltagsEngel UG (haftungsbeschränkt) officially registered, ready for operations
        </BulletItem>
      </Card>

      {/* Financial Projections */}
      <SectionTitle>Financial Projections (5-Year Forecast)</SectionTitle>
      <GoldSep />
      <div style={{ overflowX: 'auto', marginBottom: '40px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #C9963C' }}>
              <th style={{ padding: '12px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Metric</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Year 1</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Year 2</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Year 3</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Year 5</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Active Users</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>500</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>2,500</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>10,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>75,000</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Revenue (€)</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€390K</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€1.95M</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€7.8M</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€58.5M</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Net Profit (€)</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#D04B3B' }}>-€30K</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>+€990K</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>+€4.6M</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>+€39M</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Break-Even</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C' }}>Month 10–12</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>Profitable</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>Profitable</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>Profitable</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Core Advantages */}
      <SectionTitle>Core Competitive Advantages</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="✅">
          <strong>Direct Pflegekasse Billing:</strong> Platform bills Pflegekassen directly at ~€35–40/hr — no subscription fees for families
        </BulletItem>
        <BulletItem icon="💰">
          <strong>~50% Gross Margin:</strong> Pays helpers fixed €20/hr, keeps ~€20/hr margin per booking
        </BulletItem>
        <BulletItem icon="🛡️">
          <strong>100% Insured Companions:</strong> All caregivers covered by professional liability insurance
        </BulletItem>
        <BulletItem icon="✓">
          <strong>Verified & Certified:</strong> All companions screened, §53b qualified, background checked
        </BulletItem>
        <BulletItem icon="🔒">
          <strong>Anti-Bypass Design:</strong> Booking and payment only through platform; contact info shared only after confirmed booking
        </BulletItem>
        <BulletItem icon="📲">
          <strong>Digital-First Mobile App:</strong> Cross-platform React Native app for seamless experience
        </BulletItem>
        <BulletItem icon="🔗">
          <strong>Network Effects:</strong> Two-sided marketplace grows stronger with each user
        </BulletItem>
      </Card>

      {/* Business Model & Unit Economics */}
      <SectionTitle>Business Model & Unit Economics</SectionTitle>
      <GoldSep />
      <Card>
        <Paragraph>
          AlltagsEngel operates as a <strong>direct billing platform</strong>: we bill the Pflegekasse (care insurance) directly at ~€35–40/hr for each §45b service, pay our verified helpers a fixed €20/hr, and retain ~€20/hr as gross margin (~50%). Families pay nothing out of pocket — the entire flow is funded by existing §45b benefits.
        </Paragraph>
        <Paragraph>
          <strong>Second Vertical — Krankentransport:</strong> Patient transport mediation follows the same marketplace model, connecting patients with licensed transport providers and earning a mediation fee per ride.
        </Paragraph>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '40px', marginTop: '16px' }}>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', color: '#5CB882', fontWeight: 'bold' }}>€1,560</div>
          <div style={{ fontSize: '12px', color: '#A0978A', marginTop: '8px' }}>Customer LTV</div>
        </Card>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', color: '#5CB882', fontWeight: 'bold' }}>€35</div>
          <div style={{ fontSize: '12px', color: '#A0978A', marginTop: '8px' }}>CAC</div>
        </Card>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', color: '#5CB882', fontWeight: 'bold' }}>44x</div>
          <div style={{ fontSize: '12px', color: '#A0978A', marginTop: '8px' }}>LTV / CAC Ratio</div>
        </Card>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', color: '#5CB882', fontWeight: 'bold' }}>€65</div>
          <div style={{ fontSize: '12px', color: '#A0978A', marginTop: '8px' }}>Margin / Customer / Month</div>
        </Card>
      </div>

      {/* Investment Ask */}
      <SectionTitle>Investment Ask: €500K Seed Round</SectionTitle>
      <GoldSep />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '40px' }}>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', color: '#C9963C', fontWeight: 'bold' }}>€200K</div>
          <div style={{ fontSize: '12px', color: '#A0978A', marginTop: '8px' }}>Product Development (40%)</div>
        </Card>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', color: '#C9963C', fontWeight: 'bold' }}>€150K</div>
          <div style={{ fontSize: '12px', color: '#A0978A', marginTop: '8px' }}>Marketing & Growth (30%)</div>
        </Card>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', color: '#C9963C', fontWeight: 'bold' }}>€100K</div>
          <div style={{ fontSize: '12px', color: '#A0978A', marginTop: '8px' }}>Operations (20%)</div>
        </Card>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', color: '#C9963C', fontWeight: 'bold' }}>€50K</div>
          <div style={{ fontSize: '12px', color: '#A0978A', marginTop: '8px' }}>Legal & Compliance (10%)</div>
        </Card>
      </div>

      {/* Monthly Burn Rate */}
      <SectionTitle>Monthly Burn Rate & Runway</SectionTitle>
      <GoldSep />
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Personnel Costs</div>
            <div style={{ fontSize: '20px', color: '#C9963C', fontWeight: 'bold' }}>€31.2K/month</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>CEO, CTO, Team Lead, Marketing</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Operations & Tools</div>
            <div style={{ fontSize: '20px', color: '#C9963C', fontWeight: 'bold' }}>€2.3K/month</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Office, software, infrastructure</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Total Monthly Burn</div>
            <div style={{ fontSize: '20px', color: '#C9963C', fontWeight: 'bold' }}>€33.5K/month</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>15-month runway on €500K</div>
          </div>
        </div>
      </Card>

      {/* Call to Action */}
      <Card style={{ marginTop: '40px', backgroundColor: 'rgba(201, 150, 60, 0.1)', borderLeft: '4px solid #C9963C', padding: '24px' }}>
        <Paragraph style={{ margin: 0, color: '#F7F2EA' }}>
          <strong>AlltagsEngel is the first digital platform that bills Pflegekassen directly for §45b care relief services — with ~50% gross margin and zero cost to families.</strong> With an LTV/CAC ratio of 44x, break-even projected by month 10–12 of Year 1, and a second vertical in Krankentransport, we are positioned to capture a significant share of Germany's €7.79B underutilized care benefit market. The company is officially registered (HRB eingetragen) and ready to scale. We're seeking €500K to accelerate growth across the DACH region.
        </Paragraph>
      </Card>
    </DocPageLayout>
  );
}
