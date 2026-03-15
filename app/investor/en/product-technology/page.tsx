'use client';

import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, Badge, C, GoldSep, SectionLabel, Icons } from '../../docs/shared';

export default function ProductTechnologyPage() {
  return (
    <DocPageLayout 
      title="Product & Technology"
      subtitle="Tech Stack, Architecture & Roadmap"
      icon={Icons.cog(32)}
      badge="Product"
      lang="en"
    >
      {/* Product Overview */}
      <SectionLabel>Product Overview</SectionLabel>
      <Card style={{ marginBottom: '40px' }}>
        <Paragraph>
          AlltagsEngel is a cross-platform mobile application built with React Native + Expo, delivering a seamless experience for two user types: <strong>Kunden</strong> (families/seniors seeking companionship) and <strong>Engel</strong> (verified companions offering services). The platform handles <strong>direct Pflegekasse billing</strong> for §45b relief services (€131/month budget per person), pays helpers a fixed <strong>€20/hr</strong>, and retains <strong>~50% gross margin</strong> through direct billing to care insurance funds. All bookings, payments, and accounting flow exclusively through the platform.
        </Paragraph>
      </Card>

      {/* Core Features */}
      <SectionTitle>Core Product Features</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>📱 Mobile App (iOS & Android)</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Cross-platform native experience; offline support; push notifications; accessible design for older users</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>🔍 Smart Matching Algorithm</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Location-based, preference-driven companion matching; availability scheduling; ML-optimized suggestions over time</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>💳 Direct Pflegekasse Billing</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Platform bills Pflegekassen directly for §45b services; automated invoice generation; full accounting handled by platform; ~50% gross margin</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>📊 §45b Budget Tracking</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Tracks each user's €131/month Entlastungsleistung budget; shows remaining balance; automatic rollover management; transparent usage history</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>💰 Fixed Helper Payments</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Helpers receive fixed €20/hr; platform handles all billing and payouts; no subscription fees for helpers; Stripe-powered disbursements</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>🛡️ Verification & Quality Assurance</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Background checks, §53b qualifications, references; real-time identity verification; ratings & reviews; insurance coverage through platform only</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>📞 Customer Support</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>In-app chat; phone support; dispute resolution system; dedicated support for Pflegekasse billing questions</Paragraph>
          </div>
        </div>
      </Card>

      {/* Anti-Bypass Mechanisms */}
      <SectionTitle>Anti-Bypass Mechanisms</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <Paragraph style={{ marginBottom: '16px' }}>
          To protect platform revenue and ensure quality/safety standards, AlltagsEngel enforces strict anti-bypass measures that keep all transactions within the ecosystem:
        </Paragraph>
        <BulletItem icon="🔒">
          <strong>Mandatory Platform Bookings:</strong> All bookings must be created and confirmed through the platform; direct arrangements outside the app are contractually prohibited
        </BulletItem>
        <BulletItem icon="💳">
          <strong>Exclusive Payment Processing:</strong> All payments and Pflegekasse billing flow exclusively through the platform; helpers cannot invoice clients or insurers directly
        </BulletItem>
        <BulletItem icon="📱">
          <strong>Controlled Contact Sharing:</strong> Contact information (phone, email, address) is only shared after a booking is confirmed and paid; no pre-booking contact exchange
        </BulletItem>
        <BulletItem icon="🛡️">
          <strong>Platform-Only Insurance & Ratings:</strong> Liability insurance coverage and verified ratings/reviews are only valid for bookings made through AlltagsEngel; off-platform work has no coverage or reputation benefit
        </BulletItem>
        <BulletItem icon="📊">
          <strong>Usage Monitoring:</strong> Algorithmic detection of unusual patterns (e.g., repeated cancellations after contact sharing) to identify potential bypass attempts
        </BulletItem>
      </Card>

      {/* Krankentransport Module */}
      <SectionTitle>Krankentransport Module (Patient Transport)</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <Paragraph style={{ marginBottom: '16px' }}>
          A dedicated B2B module for mediating non-emergency patient transport (Krankentransport), connecting transport companies with booking demand through the AlltagsEngel ecosystem:
        </Paragraph>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: '20px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>🚑 Patient Transport Mediation</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Platform mediates non-emergency patient transport requests; connects patients/families with licensed transport providers</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>🏢 B2B Portal for Transport Companies</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Subscription-based portal (€99–199/month) for transport companies to receive ride requests, manage fleet, and handle dispatching</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>🤖 Ride Matching Algorithm</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Intelligent matching of transport requests to available vehicles based on location, vehicle type, patient needs, and availability windows</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>📍 Real-Time Tracking</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Live GPS tracking for patients and families; ETA updates; driver status; pick-up/drop-off confirmation with timestamps</Paragraph>
          </div>
        </div>
      </Card>

      {/* Tech Stack */}
      <SectionTitle>Technology Stack</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '12px' }}>Frontend</div>
          <BulletItem icon="⚛️">
            <strong>React Native + Expo 54:</strong> Single codebase for iOS & Android; rapid prototyping; native performance
          </BulletItem>
          <BulletItem icon="📦">
            <strong>State Management:</strong> Redux Toolkit + Redux Thunk for predictable state management
          </BulletItem>
          <BulletItem icon="🎨">
            <strong>UI Components:</strong> Custom component library with accessibility focus; premium dark theme
          </BulletItem>
          <BulletItem icon="🗺️">
            <strong>Location Services:</strong> React Native Maps; Google Maps API for matching and directions
          </BulletItem>
        </div>

        <div style={{ borderTop: '1px solid #3A3530', paddingTop: '16px', marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '12px' }}>Backend</div>
          <BulletItem icon="🔧">
            <strong>Supabase:</strong> PostgreSQL database + auto-generated REST/GraphQL APIs; built-in auth & RLS
          </BulletItem>
          <BulletItem icon="🔐">
            <strong>Authentication:</strong> Supabase Auth (email/password, phone OTP); JWT tokens; secure session management
          </BulletItem>
          <BulletItem icon="📊">
            <strong>Real-Time:</strong> Supabase Realtime for live notifications, chat, and matching updates
          </BulletItem>
          <BulletItem icon="💾">
            <strong>Storage:</strong> Supabase Storage for profile pictures, documents, and identity verification
          </BulletItem>
        </div>

        <div style={{ borderTop: '1px solid #3A3530', paddingTop: '16px', marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '12px' }}>Infrastructure & APIs</div>
          <BulletItem icon="💳">
            <strong>Payments & Billing:</strong> Stripe for helper payouts; direct Pflegekasse billing engine for §45b claims; automated invoice generation and reconciliation
          </BulletItem>
          <BulletItem icon="📧">
            <strong>Email:</strong> Sendgrid or Mailgun for transactional emails and marketing
          </BulletItem>
          <BulletItem icon="📲">
            <strong>Push Notifications:</strong> Firebase Cloud Messaging (FCM) and Apple Push Notification service (APNs)
          </BulletItem>
          <BulletItem icon="🤖">
            <strong>Matching AI:</strong> Custom ML pipeline for companion-customer matching; trained on booking history and ratings
          </BulletItem>
        </div>

        <div style={{ borderTop: '1px solid #3A3530', paddingTop: '16px' }}>
          <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '12px' }}>Third-Party Integrations</div>
          <BulletItem icon="🏥">
            <strong>Pflegekasse Billing APIs:</strong> Direct integration with German Pflegekassen for §45b Entlastungsleistung claims; automated billing, reconciliation, and budget tracking
          </BulletItem>
          <BulletItem icon="📋">
            <strong>Background Check:</strong> Integration with German criminal database and verification services
          </BulletItem>
          <BulletItem icon="📞">
            <strong>Twilio:</strong> SMS for OTP, reminders, and notifications
          </BulletItem>
        </div>
      </Card>

      {/* Security & Compliance */}
      <SectionTitle>Security & Data Protection</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <BulletItem icon="🔐">
          <strong>GDPR Compliant:</strong> Data processing agreements (DPAs); transparent privacy policies; user data export & deletion on demand
        </BulletItem>
        <BulletItem icon="🛡️">
          <strong>Encryption:</strong> TLS 1.3 for all data in transit; AES-256 encryption for sensitive data at rest
        </BulletItem>
        <BulletItem icon="🔑">
          <strong>Authentication:</strong> OAuth 2.0 + JWT; multi-factor authentication (MFA) option; secure password storage with bcrypt
        </BulletItem>
        <BulletItem icon="📋">
          <strong>Row-Level Security (RLS):</strong> Database-level access control; users can only access their own data
        </BulletItem>
        <BulletItem icon="🌍">
          <strong>EU Hosting:</strong> All data stored in EU datacenters (Supabase Frankfurt region); compliant with German data residency requirements
        </BulletItem>
        <BulletItem icon="📊">
          <strong>Audit Logging:</strong> Comprehensive activity logs for compliance audits and security investigations
        </BulletItem>
        <BulletItem icon="👨‍⚖️">
          <strong>Data Protection Officer (DPO):</strong> Planned hire in Year 1; DPIA (Data Protection Impact Assessment) completed for high-risk processing
        </BulletItem>
      </Card>

      {/* Product Roadmap */}
      <SectionTitle>Product Roadmap</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="🎯">
          <strong>MVP (Q1 2026):</strong> Core matching, booking, direct Pflegekasse billing, §45b budget tracking; fixed €20/hr helper payments; beta testing with 200+ companions; Frankfurt pilot launch
        </BulletItem>
        <BulletItem icon="📱">
          <strong>Beta (Q2 2026):</strong> Refine matching algorithm; add ratings & reviews; anti-bypass monitoring; improve accessibility; expand to 1,000 companions
        </BulletItem>
        <BulletItem icon="🚀">
          <strong>v1.0 Launch (Q3 2026):</strong> Public release; marketing campaign; full Pflegekasse billing automation; expand nationwide across Germany
        </BulletItem>
        <BulletItem icon="🚑">
          <strong>Krankentransport Module (Q4 2026):</strong> B2B portal for transport companies (€99–199/month); ride matching algorithm; real-time tracking; patient transport mediation
        </BulletItem>
        <BulletItem icon="✨">
          <strong>v2.0 (Q4 2026):</strong> Video profiles for companions; real-time availability calendar; advanced filters; group bookings; referral system
        </BulletItem>
        <BulletItem icon="🌍">
          <strong>Scale (2027+):</strong> White-label B2B platform for care providers; expand Krankentransport nationally; DACH region expansion; AI-powered scheduling
        </BulletItem>
      </Card>

      {/* Architecture Diagram (Simplified) */}
      <SectionTitle>System Architecture</SectionTitle>
      <GoldSep />
      <Card style={{ backgroundColor: 'rgba(201, 150, 60, 0.05)', padding: '24px', marginBottom: '40px', fontFamily: 'monospace', fontSize: '12px', color: '#A0978A', whiteSpace: 'pre-wrap', overflow: 'auto' }}>
{`┌─────────────────────────────────────────────────────┐
│         Mobile App (React Native + Expo)           │
│  • iOS & Android • Offline Support • Push Notifs   │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS/TLS 1.3
┌────────────────────▼────────────────────────────────┐
│      API Gateway & Authentication Layer            │
│  • JWT Validation • Rate Limiting • Anti-Bypass    │
└────────────────────┬────────────────────────────────┘
                     │
    ┌────────┬───────┼───────┬────────────┐
    │        │       │       │            │
┌───▼─────┐ ┌▼─────────┐ ┌─▼──────┐ ┌───▼──────────┐
│Supabase │ │Pflegekasse│ │ Stripe │ │Firebase/FCM  │
│PostgreSQL│ │ Billing  │ │Payouts │ │ Push Notifs  │
│Storage  │ │ Engine   │ │& Disb. │ │              │
│Auth/RLS │ │ §45b API │ │        │ │              │
└─────────┘ └──────────┘ └────────┘ └──────────────┘

┌────────────────────────────────────────────────────┐
│      External Services & Integrations             │
│  • Pflegekasse APIs • Background Checks • Maps   │
│  • SMS (Twilio) • Email (Sendgrid)               │
│  • Krankentransport B2B Portal & Ride Matching   │
└────────────────────────────────────────────────────┘`}
      </Card>

      {/* Performance Metrics */}
      <SectionTitle>Performance & Scalability</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="⚡">
          <strong>App Load Time:</strong> &lt;2 seconds on 4G; offline-first architecture for instant interactions
        </BulletItem>
        <BulletItem icon="📈">
          <strong>Database Performance:</strong> Supabase auto-scales; query optimization with indexes; caching layer for frequently accessed data
        </BulletItem>
        <BulletItem icon="🔄">
          <strong>Real-Time Sync:</strong> WebSocket-based Realtime subscriptions for live updates; minimal latency
        </BulletItem>
        <BulletItem icon="📊">
          <strong>Analytics:</strong> Posthog or Mixpanel for product analytics; Sentry for error tracking and performance monitoring
        </BulletItem>
        <BulletItem icon="🌐">
          <strong>CDN:</strong> Cloudflare for static asset delivery and DDoS protection
        </BulletItem>
      </Card>

      {/* Summary */}
      <Card style={{ marginTop: '40px', backgroundColor: 'rgba(201, 150, 60, 0.1)', borderLeft: '4px solid #C9963C', padding: '24px' }}>
        <Paragraph style={{ margin: 0, color: '#F7F2EA' }}>
          <strong>AlltagsEngel's tech stack combines best-in-class tools (React Native, Supabase, Stripe) with a proprietary Pflegekasse direct-billing engine for ~50% gross margin.</strong> Our architecture prioritizes security (GDPR, EU hosting, encryption), platform lock-in (anti-bypass mechanisms, controlled contact sharing), and scalability (offline-first, real-time sync). With direct billing, fixed helper payments, the Krankentransport B2B module, and robust anti-bypass measures, we scale from MVP to national care platform efficiently.
        </Paragraph>
      </Card>
    </DocPageLayout>
  );
}
