'use client';

import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, Badge, C, GoldSep, SectionLabel, Icons } from '../../docs/shared';

export default function GoToMarketPage() {
  return (
    <DocPageLayout 
      title="Go-to-Market Strategy"
      subtitle="Launch Campaign, Channels & Growth Plan"
      icon={Icons.rocket(32)}
      badge="Strategy"
      lang="en"
    >
      {/* Campaign Overview */}
      <SectionLabel>Launch Campaign: "Dein Engel für den Alltag"</SectionLabel>
      <Card style={{ marginBottom: '40px' }}>
        <Paragraph>
          Our 4-week Frankfurt pilot launch campaign positions AlltagsEngel as the trustworthy, digital-first solution for daily companionship. We're targeting families seeking care, seniors wanting independence, and verified companions eager to earn flexible income. Campaign theme: "Dein Engel für den Alltag" (Your Angel for Everyday Life) emphasizes warmth, trust, and accessibility.
        </Paragraph>
      </Card>

      {/* Target Audiences */}
      <SectionTitle>Target Audiences</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>👨‍👩‍👦 Families</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Adult children seeking companions for aging parents; seeking vetted, insured support; responsive to digital solutions</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>👴 Seniors (55+)</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Independent-minded older adults; value social connection; willing to use apps with support; benefit-eligible</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>💼 Companions (20-70)</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Flexible workers; caregivers; retirees; seeking side income; want verified, trustworthy platform</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>🎤 Multipliers</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Social workers, case managers, doctors; recommend AlltagsEngel to clients; B2B partnership opportunities</Paragraph>
          </div>
        </div>
      </Card>

      {/* Channel Strategy */}
      <SectionTitle>Channel Strategy & Tactics</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <BulletItem icon="📱">
          <strong>Instagram & TikTok:</strong> Short-form video content; user testimonials; behind-the-scenes companion stories; 3-4 posts/week; target 18-45 demographics for multipliers
        </BulletItem>
        <BulletItem icon="👥">
          <strong>Facebook & WhatsApp:</strong> Community groups for seniors and families; targeted ads to 45+ age group; FAQ chatbot; community management
        </BulletItem>
        <BulletItem icon="💼">
          <strong>LinkedIn:</strong> B2B partnerships with care agencies, health insurers, social workers; thought leadership articles; recruitment of companions
        </BulletItem>
        <BulletItem icon="📧">
          <strong>Email Newsletter:</strong> Weekly tips for families; companion success stories; exclusive offers; high-value content for retention
        </BulletItem>
        <BulletItem icon="📰">
          <strong>Blog & Content Marketing:</strong> SEO-optimized articles (elderly care, §45b guide, family caregiving); aim for organic search traffic
        </BulletItem>
        <BulletItem icon="🎙️">
          <strong>Podcast & Video:</strong> Guest appearances on German care & aging podcasts; YouTube video tutorials; long-form storytelling
        </BulletItem>
        <BulletItem icon="📰">
          <strong>Press & PR:</strong> Local Frankfurt news coverage; health tech publications; press releases for milestones (launch, funding, partnerships)
        </BulletItem>
        <BulletItem icon="🤝">
          <strong>Word-of-Mouth & Referrals:</strong> Referral program (€20 credit per new user); ask satisfied customers for reviews; incentivize companion referrals
        </BulletItem>
      </Card>

      {/* 4-Week Launch Plan */}
      <SectionTitle>4-Week Frankfurt Launch Plan</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          <div style={{ borderRight: '1px solid #3A3530', paddingRight: '16px' }}>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Week 1: Teaser & Community Build</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>
              • Soft launch Instagram/TikTok (@alltagesngel)
              • Companion recruitment & onboarding blitz
              • Early bird email list (target 500 signups)
              • Frankfurt community group setup (Facebook, WhatsApp)
            </Paragraph>
          </div>
          <div style={{ borderRight: '1px solid #3A3530', paddingRight: '16px' }}>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Week 2: Content & PR Push</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>
              • Blog launch: "Complete §45b Guide" (SEO optimized)
              • Press release to local Frankfurt media
              • LinkedIn partnerships with care agencies
              • 3 TikTok/Instagram videos per day
              • Podcast recording for future release
            </Paragraph>
          </div>
          <div style={{ borderRight: '1px solid #3A3530', paddingRight: '16px' }}>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Week 3: Beta Launch & Activation</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>
              • App launch for beta users (early bird list)
              • Daily support & onboarding calls
              • First bookings & success stories
              • Paid social ads ramp (€2K budget Week 3-4)
              • User testimonial video collection
            </Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Week 4: Public Launch & Growth</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>
              • Public app store release
              • Major social media push
              • Local media interviews & features
              • Launch event in Frankfurt (virtual or in-person)
              • Scale paid ads based on Week 3 performance
              • Target 1,500+ total signups by end of week
            </Paragraph>
          </div>
        </div>
      </Card>

      {/* Budget & Spend */}
      <SectionTitle>Marketing Budget (6 Months)</SectionTitle>
      <GoldSep />
      <div style={{ overflowX: 'auto', marginBottom: '40px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #C9963C' }}>
              <th style={{ padding: '12px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Channel</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Month 1</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Month 2-3</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Month 4-6</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Paid Social (Meta, TikTok)</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€500</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€1,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€1,500</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€3,000</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Content Creation & Design</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€1,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€400</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€200</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€1,600</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>PR & Media Outreach</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€300</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€200</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€100</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€600</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Community Management (Freelancer)</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€400</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€400</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€400</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€1,200</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Event & Activation</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€500</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€300</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€200</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€1,000</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Partner Incentives & Affiliate</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€200</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€300</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€500</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€1,000</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>SEO & SEM Tools</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€100</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€100</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€100</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€300</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Referral & User Incentives</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€200</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€300</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#A0978A' }}>€500</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>€1,000</td>
            </tr>
            <tr style={{ backgroundColor: 'rgba(201, 150, 60, 0.1)' }}>
              <td style={{ padding: '12px 8px', color: '#C9963C', fontWeight: 'bold' }}>Total</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€3,200</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€3,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€4,000</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: 'bold' }}>€10,200</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* KPIs & Success Metrics */}
      <SectionTitle>KPI Targets & Success Metrics</SectionTitle>
      <GoldSep />
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>User Acquisition</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>
              • 1,500+ app downloads Month 1
              • 500+ active users by end of Month 1
              • 2,500+ by Month 3
              • CAC &lt;€20
            </Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Engagement</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>
              • 60%+ weekly active users
              • 2-3 bookings per user per month
              • 85%+ retention at 30 days
              • 4.5+/5 star ratings
            </Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Supply Side</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>
              • 200+ companion registrations Month 1
              • 50%+ companion activation rate
              • 3-5 bookings per companion per month
              • 90%+ companion retention
            </Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Revenue</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>
              • €500+ commission revenue Month 1
              • €5,000+ by Month 6
              • 10%+ premium subscription adoption
              • €9.99/month ARPU
            </Paragraph>
          </div>
        </div>
      </Card>

      {/* Growth Strategy Beyond Month 4 */}
      <SectionTitle>Growth Strategy Beyond Month 4</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="🌍">
          <strong>Geographic Expansion:</strong> Berlin, Munich, Cologne by Month 6; full Germany by Month 12; leverage Frankfurt playbook
        </BulletItem>
        <BulletItem icon="🔗">
          <strong>Partnership Growth:</strong> B2B agreements with insurance providers, care agencies, social work organizations
        </BulletItem>
        <BulletItem icon="💰">
          <strong>Direct Billing:</strong> Push insurance integration to enable direct §45b billing (35% margins vs. 18% commission)
        </BulletItem>
        <BulletItem icon="📈">
          <strong>Content Marketing:</strong> Blog to become go-to resource for German elderly care; organic search traffic growth
        </BulletItem>
        <BulletItem icon="👥">
          <strong>Community Building:</strong> Facebook groups, local events, companion meetups; network effects accelerate growth
        </BulletItem>
        <BulletItem icon="🎁">
          <strong>Referral Program:</strong> €20-50 credit per referral; gamify companion earnings; viral loop
        </BulletItem>
      </Card>

      {/* Summary */}
      <Card style={{ marginTop: '40px', backgroundColor: 'rgba(201, 150, 60, 0.1)', borderLeft: '4px solid #C9963C', padding: '24px' }}>
        <Paragraph style={{ margin: 0, color: '#F7F2EA' }}>
          <strong>AlltagsEngel's go-to-market strategy combines digital marketing efficiency (€10.2K budget), authentic storytelling ("Dein Engel für den Alltag"), and rapid execution (4-week launch).</strong> We'll acquire users at low CAC (€20), drive engagement through network effects, and scale to 10,000+ users within 12 months. Clear KPI targets and channel focus ensure disciplined marketing spend.
        </Paragraph>
      </Card>
    </DocPageLayout>
  );
}
