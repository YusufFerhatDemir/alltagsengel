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
          AlltagsEngel's financial model is based on direct billing with Pflegekassen at ~€40/hr under §45b SGB XI. Helpers receive a fixed €20/hr, and the platform retains ~€20/hr (~50% gross margin). With an average of 3 hours/customer/month and €65 margin per customer, we project break-even by Month 10-12 and aggressive profitability scaling from Year 2 onward. An additional B2B revenue stream from Krankentransport subscriptions further diversifies income.
        </Paragraph>
      </Card>

      {/* Revenue Forecast */}
      <SectionTitle>5-Year Financial Overview</SectionTitle>
      <GoldSep />
      <div style={{ overflowX: 'auto', marginBottom: '40px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #C9963C' }}>
              <th style={{ padding: '12px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Period</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Customers</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Revenue</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Costs</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Net Profit</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Margin</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #3A3530', backgroundColor: 'rgba(201, 150, 60, 0.1)' }}>
              <td style={{ padding: '12px 8px', color: '#C9963C', fontWeight: 'bold' }}>Year 1</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>500</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€390K</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€420K</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#D04B3B', fontWeight: 'bold' }}>-€30K</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#D04B3B', fontWeight: 'bold' }}>-7.7%</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Year 2</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>2,500</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€1.95M</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#F7F2EA' }}>€960K</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€990K</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>50.8%</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Year 3</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>10,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€7.8M</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#F7F2EA' }}>€3.2M</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€4.6M</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>59.0%</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Year 4</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>36,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€28M</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#F7F2EA' }}>€9.8M</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€18.2M</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>65.0%</td>
            </tr>
            <tr style={{ backgroundColor: 'rgba(201, 150, 60, 0.1)' }}>
              <td style={{ padding: '12px 8px', color: '#C9963C', fontWeight: 'bold' }}>Year 5</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>75,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€58.5M</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€19.5M</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€39M</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>66.7%</td>
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
              <div style={{ fontSize: '12px', color: '#A0978A' }}>Platform Margin (Pflegekasse billing)</div>
              <div style={{ fontSize: '13px', color: '#F7F2EA', marginTop: '2px' }}>€375,000</div>
              <div style={{ fontSize: '10px', color: '#7A7570', marginTop: '2px' }}>~500 customers x €65/mo x avg 11.5 months</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#A0978A' }}>Krankentransport B2B Subs</div>
              <div style={{ fontSize: '13px', color: '#F7F2EA', marginTop: '2px' }}>€15,000</div>
              <div style={{ fontSize: '10px', color: '#7A7570', marginTop: '2px' }}>Early pilot: ~10-15 transport companies</div>
            </div>
            <div style={{ borderTop: '1px solid #3A3530', marginTop: '12px', paddingTop: '8px' }}>
              <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '4px' }}>Total Revenue</div>
              <div style={{ fontSize: '16px', color: '#5CB882', fontWeight: 'bold' }}>€390,000</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '12px' }}>Costs</div>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', color: '#A0978A' }}>Personnel (€25K/mo)</div>
              <div style={{ fontSize: '13px', color: '#F7F2EA', marginTop: '2px' }}>€300,000</div>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', color: '#A0978A' }}>Office & Operations (€2K/mo)</div>
              <div style={{ fontSize: '13px', color: '#F7F2EA', marginTop: '2px' }}>€24,000</div>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', color: '#A0978A' }}>Software & Infrastructure (€1.5K/mo)</div>
              <div style={{ fontSize: '13px', color: '#F7F2EA', marginTop: '2px' }}>€18,000</div>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', color: '#A0978A' }}>Marketing & Customer Acquisition (€5K/mo)</div>
              <div style={{ fontSize: '13px', color: '#F7F2EA', marginTop: '2px' }}>€60,000</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#A0978A' }}>Insurance & Compliance (€1.5K/mo)</div>
              <div style={{ fontSize: '13px', color: '#F7F2EA', marginTop: '2px' }}>€18,000</div>
            </div>
            <div style={{ borderTop: '1px solid #3A3530', marginTop: '12px', paddingTop: '8px' }}>
              <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '4px' }}>Total Costs</div>
              <div style={{ fontSize: '16px', color: '#D04B3B', fontWeight: 'bold' }}>€420,000</div>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '2px solid #3A3530', marginTop: '24px', paddingTop: '16px', backgroundColor: 'rgba(201, 150, 60, 0.05)', padding: '16px', borderRadius: '6px' }}>
          <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '4px' }}>Year 1 EBITDA</div>
          <div style={{ fontSize: '20px', color: '#D04B3B', fontWeight: 'bold' }}>-€30,000</div>
          <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Near break-even in Year 1; platform becomes profitable around Month 10-12 with ~540 active customers</div>
        </div>
      </Card>

      {/* Break-even Analysis */}
      <SectionTitle>Path to Break-Even</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Monthly Burn (Year 1)</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>€35K</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Personnel €25K + Ops €5K + Marketing €5K</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Customers Needed for Break-Even</div>
            <div style={{ fontSize: '18px', color: '#5CB882', fontWeight: 'bold' }}>~540</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>540 x €65/mo margin = €35.1K monthly revenue</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Estimated Break-Even</div>
            <div style={{ fontSize: '18px', color: '#5CB882', fontWeight: 'bold' }}>Month 10-12</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Year 1 ramp-up; profitable from Year 2 onward</div>
          </div>
        </div>
      </Card>

      {/* Unit Economics */}
      <SectionTitle>Unit Economics</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Billing Rate (Pflegekasse)</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>~€40/hr</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Direct billing under §45b SGB XI</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Helper Compensation</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>€20/hr</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Fixed rate; attractive above market avg</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Platform Margin</div>
            <div style={{ fontSize: '18px', color: '#5CB882', fontWeight: 'bold' }}>~€20/hr (~50%)</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Covers ops, tech, compliance, profit</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Monthly Margin per Customer</div>
            <div style={{ fontSize: '18px', color: '#5CB882', fontWeight: 'bold' }}>€65</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>3 hrs avg/month x ~€20 platform margin + scheduling overhead</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>§45b Monthly Budget</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>€125/month</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Government-funded; no out-of-pocket for users</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Customer Lifetime Value</div>
            <div style={{ fontSize: '18px', color: '#5CB882', fontWeight: 'bold' }}>€1,560</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>24 months avg retention x €65/mo</div>
          </div>
        </div>
      </Card>

      {/* Krankentransport Revenue Stream */}
      <SectionTitle>Krankentransport B2B Revenue Stream</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <Paragraph>
          Additional revenue stream through B2B SaaS subscriptions for Krankentransport (medical transport) companies. Platform provides dispatch optimization, compliance tracking, and patient management tools.
        </Paragraph>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginTop: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Subscription Tiers</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>€99-199/mo</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Per transport company; tiered by fleet size</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Commission per Ride</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>Small fee</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Additional per-ride commission on dispatched trips</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Target Year 2+</div>
            <div style={{ fontSize: '18px', color: '#5CB882', fontWeight: 'bold' }}>50-200 companies</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Scaling across DACH region</div>
          </div>
        </div>
      </Card>

      {/* Key Assumptions */}
      <SectionTitle>Key Assumptions</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="📱">
          <strong>Customer Growth:</strong> 5-10% monthly growth Year 1 (Frankfurt pilot), 15-20% Year 2+ (multi-city expansion via Pflegekassen partnerships)
        </BulletItem>
        <BulletItem icon="💼">
          <strong>Helper Supply:</strong> Recruiting trained §45b-qualified helpers; €20/hr fixed rate is above typical care-sector wages, ensuring supply
        </BulletItem>
        <BulletItem icon="📊">
          <strong>Billing Rate:</strong> ~€40/hr direct billing to Pflegekassen under §45b SGB XI; platform retains ~€20/hr (~50% gross margin)
        </BulletItem>
        <BulletItem icon="📈">
          <strong>Usage Frequency:</strong> 3 hours/customer/month average; within the €125/month §45b budget cap
        </BulletItem>
        <BulletItem icon="⭐">
          <strong>CAC & LTV:</strong> CAC €35 (digital + Pflegekassen referrals), LTV €1,560 (24 months x €65/mo), LTV/CAC ratio 44x
        </BulletItem>
        <BulletItem icon="🔄">
          <strong>Retention:</strong> 85%+ monthly retention; government-funded service with no user cost creates strong retention dynamics
        </BulletItem>
      </Card>

      {/* Sensitivity Analysis */}
      <SectionTitle>Sensitivity Analysis</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <Paragraph>
          Key margin drivers and their impact on profitability under the direct-billing model:
        </Paragraph>
        <div style={{ overflowX: 'auto', marginTop: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #C9963C' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Scenario</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Margin/Customer</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Year 3 Profit</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Year 5 Profit</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #3A3530' }}>
                <td style={{ padding: '10px 8px', color: '#D04B3B' }}>Bear Case (40% margin)</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#F7F2EA' }}>€48/mo</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#D04B3B' }}>€2.5M</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#D04B3B' }}>€25M</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #3A3530', backgroundColor: 'rgba(201, 150, 60, 0.1)' }}>
                <td style={{ padding: '10px 8px', color: '#C9963C', fontWeight: 'bold' }}>Base Case (50% margin)</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€65/mo</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€4.6M</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€39M</td>
              </tr>
              <tr>
                <td style={{ padding: '10px 8px', color: '#5CB882' }}>Bull Case (55% margin)</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#F7F2EA' }}>€75/mo</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#5CB882' }}>€5.8M</td>
                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#5CB882' }}>€48M</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '12px' }}>
          Bear case assumes higher helper costs (€24/hr) or lower billing rates. Bull case assumes operational efficiencies and premium service tiers.
        </div>
      </Card>

      {/* Financial Highlights */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '40px', marginBottom: '40px' }}>
        <StatBox label="Year 1 Revenue" value="€390K" subLabel="Near break-even pilot phase" />
        <StatBox label="Year 3 Revenue" value="€7.8M" subLabel="Multi-city scaling" />
        <StatBox label="Year 5 Revenue" value="€58.5M" subLabel="National scale, DACH expansion" />
        <StatBox label="CAC" value="€35" subLabel="Digital + Pflegekassen referrals" />
        <StatBox label="LTV" value="€1,560" subLabel="24-month avg retention" />
        <StatBox label="LTV/CAC" value="44x" subLabel="Best-in-class payback ratio" />
      </div>

      {/* Summary */}
      <Card style={{ backgroundColor: 'rgba(201, 150, 60, 0.1)', borderLeft: '4px solid #C9963C', padding: '24px' }}>
        <Paragraph style={{ margin: 0, color: '#F7F2EA' }}>
          <strong>AlltagsEngel's margin-based model delivers near break-even in Year 1 and strong profitability from Year 2.</strong> Direct Pflegekassen billing at ~€40/hr with fixed €20/hr helper compensation creates a sustainable ~50% gross margin. With €65/customer/month, break-even requires only ~540 customers (Month 10-12). LTV/CAC ratio of 44x (€1,560 LTV vs €35 CAC) is best-in-class. Year 5 projects €58.5M revenue and €39M profit across DACH region, supplemented by Krankentransport B2B subscriptions.
        </Paragraph>
      </Card>
    </DocPageLayout>
  );
}
