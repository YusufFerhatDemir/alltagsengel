'use client';

import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, StatBox, Badge, C, GoldSep, SectionLabel, Icons } from '../../docs/shared';

export default function FinancialProjectionsPage() {
  return (
    <DocPageLayout 
      title="Financial Projections"
      subtitle="5-Year Revenue Forecast & Key Metrics"
      icon={Icons.coins(32)}
      badge="Finance"
      lang="en"
    >
      {/* Overview */}
      <SectionLabel>Financial Overview</SectionLabel>
      <Card style={{ marginBottom: '40px' }}>
        <Paragraph>
          AlltagsEngel's financial model is based on conservative user adoption, 18% commission per booking, and €9.99/month premium subscriptions. We project break-even by Q4 2026 and profitability scaling through 2027-2028.
        </Paragraph>
      </Card>

      {/* Revenue Forecast */}
      <SectionTitle>Revenue Forecast (12 Months + Year 2-5)</SectionTitle>
      <GoldSep />
      <div style={{ overflowX: 'auto', marginBottom: '40px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #C9963C' }}>
              <th style={{ padding: '12px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Period</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Users</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Companions</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Monthly Bookings</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Commission Revenue</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Premium Subs</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA', fontSize: '11px' }}>M1 (April 2026)</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>150</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>50</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>60</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€432</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€150</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA', fontSize: '11px' }}>M3 (June 2026)</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>280</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>100</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>250</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€1,800</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€420</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA', fontSize: '11px' }}>M6 (Sept 2026)</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>500</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>180</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>800</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€5,760</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€1,200</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530', backgroundColor: 'rgba(201, 150, 60, 0.1)' }}>
              <td style={{ padding: '12px 8px', color: '#C9963C', fontWeight: 'bold' }}>Year 1 (Full)</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>500</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>200</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>1,500</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€10,800</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€8,200</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Year 2</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>3,500</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>800</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>15,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€108,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€35,700</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Year 3</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>10,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>1,800</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>45,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€324,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€120,000</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Year 4</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>35,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>3,500</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>180,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€1,296,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€420,000</td>
            </tr>
            <tr style={{ backgroundColor: 'rgba(201, 150, 60, 0.1)' }}>
              <td style={{ padding: '12px 8px', color: '#C9963C', fontWeight: 'bold' }}>Year 5</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>75,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>5,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>450,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€3,240,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€900,000</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Year 1 P&L */}
      <SectionTitle>Year 1 P&L Forecast</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px' }}>
          <div style={{ borderRight: '1px solid #3A3530', paddingRight: '16px' }}>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '12px' }}>Revenue</div>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', color: '#A0978A' }}>Commission (€10.8K)</div>
              <div style={{ fontSize: '13px', color: '#F7F2EA', marginTop: '2px' }}>€10,800</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#A0978A' }}>Premium Subscriptions (€8.2K)</div>
              <div style={{ fontSize: '13px', color: '#F7F2EA', marginTop: '2px' }}>€8,200</div>
            </div>
            <div style={{ borderTop: '1px solid #3A3530', marginTop: '12px', paddingTop: '8px' }}>
              <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '4px' }}>Total Revenue</div>
              <div style={{ fontSize: '16px', color: '#5CB882', fontWeight: 'bold' }}>€19,000</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '12px' }}>Costs</div>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', color: '#A0978A' }}>Personnel (€31.2K/mo)</div>
              <div style={{ fontSize: '13px', color: '#F7F2EA', marginTop: '2px' }}>€374,400</div>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', color: '#A0978A' }}>Office (€600/mo)</div>
              <div style={{ fontSize: '13px', color: '#F7F2EA', marginTop: '2px' }}>€7,200</div>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', color: '#A0978A' }}>Vehicle/Transport (€1K/mo)</div>
              <div style={{ fontSize: '13px', color: '#F7F2EA', marginTop: '2px' }}>€12,000</div>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', color: '#A0978A' }}>Software (€200/mo)</div>
              <div style={{ fontSize: '13px', color: '#F7F2EA', marginTop: '2px' }}>€2,400</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#A0978A' }}>Marketing (€850/mo)</div>
              <div style={{ fontSize: '13px', color: '#F7F2EA', marginTop: '2px' }}>€10,200</div>
            </div>
            <div style={{ borderTop: '1px solid #3A3530', marginTop: '12px', paddingTop: '8px' }}>
              <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '4px' }}>Total Costs</div>
              <div style={{ fontSize: '16px', color: '#D04B3B', fontWeight: 'bold' }}>€406,200</div>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '2px solid #3A3530', marginTop: '24px', paddingTop: '16px', backgroundColor: 'rgba(201, 150, 60, 0.05)', padding: '16px', borderRadius: '6px' }}>
          <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '4px' }}>Year 1 EBITDA</div>
          <div style={{ fontSize: '20px', color: '#D04B3B', fontWeight: 'bold' }}>-€387,200</div>
          <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Expected burn in MVP phase; focus on user acquisition and product validation</div>
        </div>
      </Card>

      {/* Break-even Analysis */}
      <SectionTitle>Path to Break-Even</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Monthly Burn (Year 1)</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>€33.5K</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Personnel €31.2K + Ops €2.3K</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Monthly Revenue Target</div>
            <div style={{ fontSize: '18px', color: '#5CB882', fontWeight: 'bold' }}>€33.5K</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>~3,500 active users at €9.50/month ARPU</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Estimated Break-Even</div>
            <div style={{ fontSize: '18px', color: '#5CB882', fontWeight: 'bold' }}>Q4 2026</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>9 months post-launch with network effects</div>
          </div>
        </div>
      </Card>

      {/* Key Assumptions */}
      <SectionTitle>Key Assumptions</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="📱">
          <strong>User Growth:</strong> 5-10% monthly growth Year 1 (Frankfurt pilot), 15-20% Year 2+ (multi-city expansion)
        </BulletItem>
        <BulletItem icon="💼">
          <strong>Companion Supply:</strong> 20-25% of user base becomes active companions; network effects accelerate supply growth
        </BulletItem>
        <BulletItem icon="📊">
          <strong>Average Booking Value:</strong> €40/hour is conservative; mix of companionship (€25-40/hr) and household help (€40-50/hr)
        </BulletItem>
        <BulletItem icon="📈">
          <strong>Booking Frequency:</strong> 2-3 bookings/month per user average; increases with time/retention
        </BulletItem>
        <BulletItem icon="⭐">
          <strong>Premium Adoption:</strong> 10-12% of users adopt €9.99/month premium; grows to 15% in Year 2+
        </BulletItem>
        <BulletItem icon="🔄">
          <strong>Retention:</strong> 85%+ monthly retention for users; 90%+ for active companions (network effects)
        </BulletItem>
      </Card>

      {/* Financial Highlights */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '40px', marginBottom: '40px' }}>
        <StatBox label="Year 1 Revenue" value="€19K" subLabel="Conservative pilot phase" />
        <StatBox label="Year 3 Revenue" value="€444K" subLabel="Post-break-even growth" />
        <StatBox label="Year 5 Revenue" value="€4.14M" subLabel="National scale, DACH expansion" />
        <StatBox label="CAC" value="€20" subLabel="Low-cost social + word-of-mouth" />
        <StatBox label="LTV" value="€500" subLabel="18-24 month customer lifecycle" />
        <StatBox label="Payback Period" value="6 months" subLabel="LTV/CAC ratio 25x" />
      </div>

      {/* Summary */}
      <Card style={{ backgroundColor: 'rgba(201, 150, 60, 0.1)', borderLeft: '4px solid #C9963C', padding: '24px' }}>
        <Paragraph style={{ margin: 0, color: '#F7F2EA' }}>
          <strong>AlltagsEngel's financial model demonstrates clear path to profitability with modest €500K investment.</strong> Conservative revenue assumptions show break-even by Q4 2026 and €4.14M revenue by Year 5. High LTV/CAC ratio (25x) and low burn rate (€33.5K/month) provide substantial runway and minimize downside risk. Success depends on user acquisition momentum in Frankfurt pilot and scaling across DACH region.
        </Paragraph>
      </Card>
    </DocPageLayout>
  );
}
