'use client';

import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, StatBox, TableRow, Badge, C, GoldSep, SectionLabel } from '../../docs/shared';

export default function ExecutiveSummaryPage() {
  return (
    <DocPageLayout 
      title="Executive Summary"
      subtitle="Investment Opportunity at a Glance"
      icon="📄"
      badge="Overview"
      lang="en"
    >
      {/* Key Facts */}
      <SectionLabel>Key Facts at a Glance</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '40px' }}>
        <StatBox label="Market Size" value="€50B+" />
        <StatBox label="Care-Dependent" value="4.96M" />
        <StatBox label="Seed Round Target" value="€500K" />
        <StatBox label="Commission Rate" value="18%" />
      </div>

      {/* The Opportunity Section */}
      <SectionTitle>The Opportunity</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="🇩🇪">
          <strong>Germany's Aging Population:</strong> 4.96 million care-dependent people with growing needs
        </BulletItem>
        <BulletItem icon="📋">
          <strong>§45b Framework:</strong> €125/month care relief benefit serves 2.98M people, but only ~40% fully utilize it
        </BulletItem>
        <BulletItem icon="💰">
          <strong>Market Opportunity:</strong> €7.44B annual benefit pool, mostly fragmented and offline
        </BulletItem>
        <BulletItem icon="📱">
          <strong>Digital Gap:</strong> No integrated digital-first platform exists for §45b hiring and payment
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
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Year 3</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Year 5</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Active Users</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>500</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>10,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>75,000</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Revenue (€)</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€19K</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€370K</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€2.5M</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>EBITDA (€)</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#D04B3B' }}>-€46K</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>+€85K</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>+€900K</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Core Advantages */}
      <SectionTitle>Core Competitive Advantages</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="✅">
          <strong>§45b Billing Integration:</strong> Only platform with automated §45b benefit integration
        </BulletItem>
        <BulletItem icon="🛡️">
          <strong>100% Insured Companions:</strong> All caregivers covered by professional liability insurance
        </BulletItem>
        <BulletItem icon="✓">
          <strong>Verified & Certified:</strong> All companions screened, §53b qualified, background checked
        </BulletItem>
        <BulletItem icon="📲">
          <strong>Digital-First Mobile App:</strong> Cross-platform React Native app for seamless experience
        </BulletItem>
        <BulletItem icon="🔗">
          <strong>Network Effects:</strong> Two-sided marketplace grows stronger with each user
        </BulletItem>
      </Card>

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
          <strong>AlltagsEngel is the first digital platform integrating §45b care relief benefits with verified, insured companions.</strong> We're positioned to capture €200-400M of Germany's €7.44B underutilized care benefit market. With proven product-market fit signals and a clear path to profitability, we're seeking €500K to scale rapidly across the DACH region.
        </Paragraph>
      </Card>
    </DocPageLayout>
  );
}
