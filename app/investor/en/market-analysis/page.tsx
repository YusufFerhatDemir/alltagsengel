'use client';

import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, StatBox, Badge, C, GoldSep, SectionLabel } from '../../docs/shared';

export default function MarketAnalysisPage() {
  return (
    <DocPageLayout 
      title="Market Analysis"
      subtitle="TAM/SAM/SOM, Competition & Business Model"
      icon="📈"
      badge="Market"
      lang="en"
    >
      {/* Market Overview */}
      <SectionLabel>German Care Market Overview</SectionLabel>
      <Card style={{ marginBottom: '40px' }}>
        <BulletItem icon="👴">
          <strong>4.96 Million Care-Dependent People:</strong> Current population requiring daily support or companionship
        </BulletItem>
        <BulletItem icon="📈">
          <strong>3-5% Annual Growth:</strong> Aging population drives consistent demand increase
        </BulletItem>
        <BulletItem icon="🔮">
          <strong>Projected 6M+ by 2030:</strong> 20% increase in care-dependent population over 4 years
        </BulletItem>
        <BulletItem icon="💶">
          <strong>€50B+ Total Market Size:</strong> German care market spans nursing, assistance, companionship, and related services
        </BulletItem>
      </Card>

      {/* §45b Benefit */}
      <SectionTitle>§45b Care Relief Benefit</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <BulletItem icon="📋">
          <strong>Benefit Amount:</strong> €125/month per care-dependent person (€1,500/year)
        </BulletItem>
        <BulletItem icon="💰">
          <strong>Total Annual Pool:</strong> €7.44B (4.96M beneficiaries × €125/month × 12 months)
        </BulletItem>
        <BulletItem icon="📊">
          <strong>Utilization Rate:</strong> Only ~40% currently utilized; €4.46B in benefits go unused annually
        </BulletItem>
        <BulletItem icon="✅">
          <strong>Eligible Activities:</strong> Companionship, household help, transportation, hobbies, social activities
        </BulletItem>
        <BulletItem icon="🔗">
          <strong>Payment Method:</strong> Direct §45b billing integration or reimbursement through insurance
        </BulletItem>
      </Card>

      {/* TAM / SAM / SOM */}
      <SectionTitle>Market Sizing (TAM / SAM / SOM)</SectionTitle>
      <GoldSep />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '40px' }}>
        <StatBox 
          label="TAM (Total Addressable)" 
          value="€50B+" 
          subLabel="Entire German care & elderly support market"
        />
        <StatBox 
          label="SAM (Serviceable)" 
          value="€8-12B" 
          subLabel="§45b care relief benefit market (€7.44B utilized)"
        />
        <StatBox 
          label="SOM (Obtainable)" 
          value="€200-400M" 
          subLabel="AlltagsEngel target (5-8% market capture in 5 years)"
        />
      </div>

      {/* Competitive Analysis */}
      <SectionTitle>Competitive Landscape</SectionTitle>
      <GoldSep />
      <div style={{ overflowX: 'auto', marginBottom: '40px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #C9963C' }}>
              <th style={{ padding: '12px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Competitor</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>§45b Integration</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Insurance</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Mobile App</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Model</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Pflegehelden</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#D04B3B' }}>✗</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#D04B3B' }}>✗</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#D04B3B' }}>✗</td>
              <td style={{ padding: '12px 8px', color: '#A0978A' }}>Local agency network</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Careship</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#D04B3B' }}>✗</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#D04B3B' }}>✗</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>✓</td>
              <td style={{ padding: '12px 8px', color: '#A0978A' }}>Caregiver booking platform</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Local Providers</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>✓ (Manual)</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>✓ (Local)</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#D04B3B' }}>✗</td>
              <td style={{ padding: '12px 8px', color: '#A0978A' }}>Offline, regional</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Private Agencies</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#D04B3B' }}>✗</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>✓</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#D04B3B' }}>✗</td>
              <td style={{ padding: '12px 8px', color: '#A0978A' }}>Phone/website-based</td>
            </tr>
            <tr style={{ backgroundColor: 'rgba(201, 150, 60, 0.1)' }}>
              <td style={{ padding: '12px 8px', color: '#C9963C', fontWeight: 'bold' }}>AlltagsEngel</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882', fontWeight: 'bold' }}>✓ Auto</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882', fontWeight: 'bold' }}>✓ Full</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882', fontWeight: 'bold' }}>✓ Premium</td>
              <td style={{ padding: '12px 8px', color: '#C9963C', fontWeight: 'bold' }}>Digital marketplace</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Business Model Deep Dive */}
      <SectionTitle>Revenue Model & Unit Economics</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '24px' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Commission Model</div>
          <Paragraph style={{ fontSize: '13px', margin: '0' }}>
            18% commission on every booking. Typical €40/hour booking generates €7.20 revenue. Scales with volume without additional cost per transaction.
          </Paragraph>
        </div>
        <div style={{ marginBottom: '24px', borderTop: '1px solid #3A3530', paddingTop: '16px' }}>
          <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Premium Subscription</div>
          <Paragraph style={{ fontSize: '13px', margin: '0' }}>
            €9.99/month optional premium for priority matching, unlimited support, and advanced features. Estimated 10-15% adoption rate.
          </Paragraph>
        </div>
        <div style={{ borderTop: '1px solid #3A3530', paddingTop: '16px' }}>
          <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Direct Billing (Future)</div>
          <Paragraph style={{ fontSize: '13px', margin: '0' }}>
            Once insurance partnerships mature, direct §45b billing increases margin to ~35%. Estimated timeline: Year 2-3.
          </Paragraph>
        </div>
      </Card>

      {/* Unit Economics */}
      <SectionTitle>Unit Economics & Metrics</SectionTitle>
      <GoldSep />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>€20</div>
          <div style={{ fontSize: '12px', color: '#A0978A' }}>CAC (Customer Acquisition Cost)</div>
          <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '8px' }}>Social media & word-of-mouth focused; low-cost customer acquisition</div>
        </Card>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>€500</div>
          <div style={{ fontSize: '12px', color: '#A0978A' }}>LTV (Lifetime Value)</div>
          <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '8px' }}>18-24 month average customer lifetime; repeat bookings compound revenue</div>
        </Card>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', color: '#5CB882', fontWeight: 'bold', marginBottom: '8px' }}>25x</div>
          <div style={{ fontSize: '12px', color: '#A0978A' }}>LTV/CAC Ratio</div>
          <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '8px' }}>Exceptional unit economics; every €1 spent on acquisition returns €25 lifetime value</div>
        </Card>
      </div>

      {/* Scaling Strategy */}
      <SectionTitle>Scaling Strategy (5-Phase Rollout)</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <BulletItem icon="1️⃣">
          <strong>Phase 1 (Q1-Q2 2026):</strong> Frankfurt pilot launch. 500 users, 200 companions, refine product & operations
        </BulletItem>
        <BulletItem icon="2️⃣">
          <strong>Phase 2 (Q3-Q4 2026):</strong> Expand to major German cities (Berlin, Munich, Cologne). 5,000 users, network effects accelerate
        </BulletItem>
        <BulletItem icon="3️⃣">
          <strong>Phase 3 (2027):</strong> Full German coverage. 25,000 users, break-even or better. Series A fundraising
        </BulletItem>
        <BulletItem icon="4️⃣">
          <strong>Phase 4 (2027-2028):</strong> Expand to Austria & Switzerland (DACH). 50,000 users, profitability
        </BulletItem>
        <BulletItem icon="5️⃣">
          <strong>Phase 5 (2028+):</strong> EU expansion. Benelux, France, Nordics. 100K+ users, category leader in digital care
        </BulletItem>
      </Card>

      {/* Market Risks */}
      <SectionTitle>Market Risks & Mitigation</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="⚠️">
          <strong>Regulatory Risk:</strong> §45b rules could change. Mitigation: Diversify revenue (commission + premium + B2B licensing); stay compliant; engage insurance partners early.
        </BulletItem>
        <BulletItem icon="⚠️">
          <strong>Competitor Risk:</strong> Established players might build §45b integration. Mitigation: Move fast; lock in insurance partnerships; network effects & brand loyalty.
        </BulletItem>
        <BulletItem icon="⚠️">
          <strong>Adoption Risk:</strong> Older demographics slower to adopt apps. Mitigation: Accessible design; phone support; family/caregiver handles onboarding.
        </BulletItem>
        <BulletItem icon="⚠️">
          <strong>Supply Risk:</strong> Finding qualified §53b companions. Mitigation: Fast companion onboarding; premium companion earnings; referral incentives.
        </BulletItem>
        <BulletItem icon="⚠️">
          <strong>Insurance Risk:</strong> Partners might not offer full coverage. Mitigation: Multi-partner approach; own white-label insurance product research.
        </BulletItem>
      </Card>

      {/* Market Opportunity Summary */}
      <Card style={{ marginTop: '40px', backgroundColor: 'rgba(201, 150, 60, 0.1)', borderLeft: '4px solid #C9963C', padding: '24px' }}>
        <Paragraph style={{ margin: 0, color: '#F7F2EA' }}>
          <strong>Germany's care market is massive (€50B+), with €7.44B in underutilized §45b benefits and 4.96M care-dependent people.</strong> AlltagsEngel's first-mover advantage in automated §45b integration positions us to capture €200-400M in revenue within 5 years. Unit economics are exceptional (25x LTV/CAC), and the digital gap is real—competitors still operate offline or without insurance integration.
        </Paragraph>
      </Card>
    </DocPageLayout>
  );
}
