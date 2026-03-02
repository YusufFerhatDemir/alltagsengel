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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Company Name</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>AlltagsEngel</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Legal Form</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>UG haftungsbeschränkt</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Headquarters</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>Frankfurt, Germany</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Founded</div>
            <div style={{ fontSize: '18px', color: '#C9963C', fontWeight: 'bold' }}>2026</div>
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
          <strong>Underutilized §45b Benefit:</strong> €7.44B annual care relief budget sits unused; only 40% of eligible people utilize it
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
        <BulletItem icon="🔗">
          <strong>§45b Integration:</strong> Automated billing integration with care relief benefit system—no paperwork for families
        </BulletItem>
        <BulletItem icon="✅">
          <strong>Verified & Insured Companions:</strong> All caregivers are §53b qualified, background-checked, and professionally insured
        </BulletItem>
        <BulletItem icon="🛡️">
          <strong>Two-Sided Marketplace:</strong> Kunden (families/seniors) match with Engel (verified companions); earn commission on bookings
        </BulletItem>
        <BulletItem icon="🌍">
          <strong>Digital-First Design:</strong> Seamless experience for families and companions; premium dark theme with accessibility focus
        </BulletItem>
      </Card>

      {/* Market Opportunity */}
      <SectionTitle>Market Opportunity (TAM / SAM / SOM)</SectionTitle>
      <GoldSep />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '40px' }}>
        <StatBox label="TAM (Total)" value="€50B+" subLabel="Entire German care market" />
        <StatBox label="SAM (Serviceable)" value="€8-12B" subLabel="§45b care relief benefit" />
        <StatBox label="SOM (Obtainable)" value="€200-400M" subLabel="5-year target (5-8% share)" />
      </div>

      {/* Business Model */}
      <SectionTitle>Business Model</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="💳">
          <strong>Commission Model (18%):</strong> €18 commission on €100 booking (€7.20 on typical €40/hour booking)
        </BulletItem>
        <BulletItem icon="⭐">
          <strong>Premium Subscription:</strong> €9.99/month optional premium for unlimited customer support & priority matching
        </BulletItem>
        <BulletItem icon="🏥">
          <strong>Direct Billing (Future):</strong> Direct insurance reimbursement for §45b bookings; increases margin to ~35%
        </BulletItem>
        <BulletItem icon="📊">
          <strong>Unit Economics:</strong> CAC €15-25, LTV €400-600, LTV/CAC ratio 16-40x
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '40px' }}>
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
          <strong>AlltagsEngel combines a massive market opportunity (€7.44B underutilized), first-mover advantage (only §45b digital platform), proven team expertise, and clear unit economics.</strong> With €500K seed funding, we'll dominate the digital care marketplace in Germany and expand across DACH.
        </Paragraph>
      </Card>
    </DocPageLayout>
  );
}
