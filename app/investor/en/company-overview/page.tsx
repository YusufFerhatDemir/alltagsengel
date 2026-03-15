'use client';

import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, StatBox, Badge, C, GoldSep, SectionLabel, Icons } from '../../docs/shared';

export default function CompanyOverviewPage() {
  return (
    <DocPageLayout 
      title="Company Overview"
      subtitle="Profile, Team & Vision"
      icon={Icons.building(32)}
      badge="Company"
      lang="en"
    >
      {/* Company Profile */}
      <SectionLabel>Company Profile</SectionLabel>
      <Card style={{ marginBottom: '40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '24px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Company Name</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>AlltagsEngel UG</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Legal Form</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>UG (haftungsbeschränkt)</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Headquarters</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>Frankfurt, Germany</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Founded</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>2026</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Domain</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>alltagsengel.care</div>
          </div>
        </div>
      </Card>

      {/* The Problem */}
      <SectionTitle>The Problem</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="📊">
          <strong>4.96 Million Care-Dependent People:</strong> Germany's aging society creates explosive demand for daily companionship and care support
        </BulletItem>
        <BulletItem icon="💼">
          <strong>Fragmented Market:</strong> Caregivers scattered across local agencies, freelancers, and informal networks—no central platform
        </BulletItem>
        <BulletItem icon="📋">
          <strong>Underutilized §45b Benefit:</strong> €7.79B annual care relief budget sits unused; only 40% of eligible people utilize it
        </BulletItem>
        <BulletItem icon="⚠️">
          <strong>Trust & Safety Issues:</strong> Families struggle to find verified, insured, background-checked companions
        </BulletItem>
        <BulletItem icon="📱">
          <strong>No Digital Solution:</strong> Billing and matching remain manual, offline, and inefficient
        </BulletItem>
      </Card>

      {/* Our Solution */}
      <SectionTitle>Our Solution</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="📲">
          <strong>Mobile-First App:</strong> Cross-platform React Native application on iOS & Android for easy booking and management
        </BulletItem>
        <BulletItem icon="🏥">
          <strong>Direct Pflegekasse Billing:</strong> Platform bills care insurance directly at §45b rates—no paperwork for families, no commission model
        </BulletItem>
        <BulletItem icon="✅">
          <strong>Verified & Insured Companions:</strong> All caregivers are §53b qualified, background-checked, and professionally insured through the platform
        </BulletItem>
        <BulletItem icon="🚑">
          <strong>Two Verticals:</strong> Alltagsbegleitung (care companionship) and Krankentransport (patient transport mediation)—synergistic services on one platform
        </BulletItem>
        <BulletItem icon="🌍">
          <strong>Digital-First Design:</strong> Seamless experience for families and companions; premium dark theme with accessibility focus
        </BulletItem>
      </Card>

      {/* Anti-Bypass Mechanisms */}
      <SectionTitle>Platform Lock-In & Anti-Bypass</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="🔒">
          <strong>Booking Only Through Platform:</strong> All appointments must be scheduled via the app—no off-platform arrangements possible
        </BulletItem>
        <BulletItem icon="📞">
          <strong>Contact Info After Booking:</strong> Helper contact details (phone, address) are only shared after a confirmed and paid booking
        </BulletItem>
        <BulletItem icon="💳">
          <strong>Payment Only Through Platform:</strong> All payments processed via AlltagsEngel; direct Pflegekasse billing ensures revenue stays on-platform
        </BulletItem>
        <BulletItem icon="🛡️">
          <strong>Insurance & Ratings On-Platform:</strong> Liability insurance coverage and verified ratings/reviews only apply to bookings made through AlltagsEngel
        </BulletItem>
        <BulletItem icon="📜">
          <strong>Contractual Protection:</strong> Terms of service prohibit off-platform arrangements; helpers agree to exclusivity clauses for platform-sourced clients
        </BulletItem>
      </Card>

      {/* Market Opportunity */}
      <SectionTitle>Market Opportunity (TAM / SAM / SOM)</SectionTitle>
      <GoldSep />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '16px', marginBottom: '40px' }}>
        <StatBox label="TAM (Total)" value="€50B+" subLabel="Entire German care market" />
        <StatBox label="SAM (Serviceable)" value="€8-12B" subLabel="§45b care relief benefit" />
        <StatBox label="SOM (Obtainable)" value="€200-400M" subLabel="5-year target (5-8% share)" />
      </div>

      {/* Business Model */}
      <SectionTitle>Business Model</SectionTitle>
      <GoldSep />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: '16px', marginBottom: '24px' }}>
        <StatBox label="Gross Margin" value="~50%" subLabel="Direct Pflegekasse billing" />
        <StatBox label="Helper Payment" value="€20/hr" subLabel="Fixed, transparent rate" />
        <StatBox label="Billing Rate" value="€35-40/hr" subLabel="Billed to Pflegekassen" />
        <StatBox label="Monthly Margin" value="€65" subLabel="Per active customer" />
      </div>

      <SectionLabel>Vertical 1: Alltagsbegleitung (Care Companionship)</SectionLabel>
      <Card>
        <BulletItem icon="🏥">
          <strong>Direct Pflegekasse Billing:</strong> Platform bills Pflegekassen (care insurance) directly at ~€35-40/hr for §45b services—no intermediary, no family paperwork
        </BulletItem>
        <BulletItem icon="💰">
          <strong>~50% Gross Margin:</strong> Alltagsbegleiter receive a fixed €20/hr; AlltagsEngel retains ~€15-20/hr margin per booking
        </BulletItem>
        <BulletItem icon="📊">
          <strong>Unit Economics:</strong> ~€65 margin per active customer per month; CAC €15-25, LTV €600+, LTV/CAC ratio 24x+
        </BulletItem>
        <BulletItem icon="✅">
          <strong>Transparent Pricing:</strong> Helpers know their fixed €20/hr rate upfront—no hidden fees, no commission surprises
        </BulletItem>
      </Card>

      <SectionLabel>Vertical 2: Krankentransport (Patient Transport Mediation)</SectionLabel>
      <Card>
        <BulletItem icon="🚑">
          <strong>Transport Mediation Platform:</strong> AlltagsEngel connects patients with licensed Krankentransport companies—digital booking, real-time tracking, automated dispatch
        </BulletItem>
        <BulletItem icon="💼">
          <strong>B2B Subscription Model:</strong> Transport companies pay €99-199/month for platform access, lead generation, and digital dispatch tools
        </BulletItem>
        <BulletItem icon="📋">
          <strong>Per-Ride Commission:</strong> Small commission per mediated ride on top of subscription—scalable revenue as ride volume grows
        </BulletItem>
        <BulletItem icon="🔗">
          <strong>Synergy with Care Vertical:</strong> Care customers often need medical transport; cross-selling between verticals increases LTV and platform stickiness
        </BulletItem>
      </Card>

      {/* Competitive Advantage */}
      <SectionTitle>Competitive Advantage</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="🚀">
          <strong>First §45b Digital Platform:</strong> No competitor has automated §45b benefit integration
        </BulletItem>
        <BulletItem icon="🛡️">
          <strong>Full Insurance Coverage:</strong> All companions covered; families have guaranteed liability protection
        </BulletItem>
        <BulletItem icon="📱">
          <strong>Digital-First Approach:</strong> Mobile app with modern UX vs. competitors' fragmented websites
        </BulletItem>
        <BulletItem icon="🔗">
          <strong>Network Effects:</strong> Two-sided marketplace grows stronger; more users → more companions → better matches → more users
        </BulletItem>
        <BulletItem icon="⚡">
          <strong>Fast Scaling Potential:</strong> SaaS-like unit economics; low cost of customer acquisition
        </BulletItem>
      </Card>

      {/* Team */}
      <SectionTitle>Team</SectionTitle>
      <GoldSep />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: '24px', marginBottom: '40px' }}>
        <Card>
          <div style={{ fontSize: '16px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Yusuf • CEO</div>
          <Paragraph style={{ fontSize: '13px', margin: '0' }}>Founder & strategic vision. Healthcare background, 5+ years startup experience. Passion for solving elderly care challenges.</Paragraph>
        </Card>
        <Card>
          <div style={{ fontSize: '16px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Laura • Team Lead</div>
          <Paragraph style={{ fontSize: '13px', margin: '0' }}>Operations & companion network. Manages onboarding, verification, and day-to-day operations. Deep care sector knowledge.</Paragraph>
        </Card>
        <Card>
          <div style={{ fontSize: '16px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Mehmet • CTO</div>
          <Paragraph style={{ fontSize: '13px', margin: '0' }}>Full-stack engineer. React Native, Supabase, backend architecture. Built previous fintech & healthcare platforms.</Paragraph>
        </Card>
        <Card>
          <div style={{ fontSize: '16px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Sophie • Marketing</div>
          <Paragraph style={{ fontSize: '13px', margin: '0' }}>Growth & brand strategy. Social media, content, partnerships. Background in B2C digital marketing for health startups.</Paragraph>
        </Card>
      </div>

      {/* Current Phase & Roadmap */}
      <SectionTitle>Current Phase & Roadmap</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="🔨">
          <strong>MVP Development:</strong> Core app features in beta testing (booking, matching, §45b integration)
        </BulletItem>
        <BulletItem icon="📅">
          <strong>4-Week Launch Plan:</strong> Frankfurt pilot launch April 2026 with 500+ companions and families
        </BulletItem>
        <BulletItem icon="🎯">
          <strong>€500K Seed Target:</strong> Product scaling, marketing launch, legal compliance, and team expansion
        </BulletItem>
        <BulletItem icon="📈">
          <strong>Year 1 Goals:</strong> 500 active users, €19K revenue, break-even by Q4 2026
        </BulletItem>
        <BulletItem icon="🌍">
          <strong>Expansion Vision:</strong> Frankfurt → DACH region → EU; target €2.5M revenue by Year 5
        </BulletItem>
      </Card>

      {/* Investment Highlights */}
      <Card style={{ marginTop: '40px', backgroundColor: 'rgba(201, 150, 60, 0.1)', borderLeft: '4px solid #C9963C', padding: '24px' }}>
        <Paragraph style={{ margin: 0, color: '#F7F2EA' }}>
          <strong>AlltagsEngel UG (HRB registered) combines a massive market opportunity (€7.79B underutilized §45b budget), ~50% gross margin through direct Pflegekasse billing, two revenue verticals (Alltagsbegleitung + Krankentransport), strong anti-bypass mechanisms, and first-mover advantage as the only §45b digital platform.</strong> With €500K seed funding, we will dominate the digital care marketplace in Germany and expand across DACH.
        </Paragraph>
      </Card>
    </DocPageLayout>
  );
}
