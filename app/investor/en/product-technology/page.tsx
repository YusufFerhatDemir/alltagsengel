'use client';

import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, Badge, C, GoldSep, SectionLabel } from '../../docs/shared';

export default function ProductTechnologyPage() {
  return (
    <DocPageLayout 
      title="Product & Technology"
      subtitle="Tech Stack, Architecture & Roadmap"
      icon="⚙️"
      badge="Product"
      lang="en"
    >
      {/* Product Overview */}
      <SectionLabel>Product Overview</SectionLabel>
      <Card style={{ marginBottom: '40px' }}>
        <Paragraph>
          AlltagsEngel is a cross-platform mobile application built with React Native + Expo, delivering a seamless experience for two user types: <strong>Kunden</strong> (families/seniors seeking companionship) and <strong>Engel</strong> (verified companions offering services). The platform integrates §45b care relief billing, real-time matching, secure payments, and comprehensive companion verification.
        </Paragraph>
      </Card>

      {/* Core Features */}
      <SectionTitle>Core Product Features</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>📱 Mobile App (iOS & Android)</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Cross-platform native experience; offline support; push notifications; accessible design for older users</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>🔍 Smart Matching Engine</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Location-based, preference-driven companion matching; machine learning improves suggestions over time</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>💳 §45b Integration</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Direct billing to care relief benefit; automated invoice generation; compliance with insurance requirements</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>🛡️ Verification System</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Background checks, §53b qualifications, references; real-time identity verification; insurance coverage display</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>💰 Secure Payments</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>Stripe integration; escrow system; instant payouts to companions; transparent fee breakdown</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>📞 Customer Support</div>
            <Paragraph style={{ fontSize: '13px', margin: '0' }}>In-app chat; phone support; premium tier gets priority; dispute resolution system</Paragraph>
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
            <strong>Payments:</strong> Stripe for payment processing, escrow, and payouts
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
            <strong>Insurance APIs:</strong> Planned integration with major German health insurance providers for §45b claims
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
          <strong>MVP (Q1 2026):</strong> Core matching, booking, payments, §45b integration; beta testing with 200+ companions; Frankfurt pilot launch
        </BulletItem>
        <BulletItem icon="📱">
          <strong>Beta (Q2 2026):</strong> Refine matching algorithm; add ratings & reviews; improve accessibility; expand to 1,000 companions
        </BulletItem>
        <BulletItem icon="🚀">
          <strong>v1.0 Launch (Q3 2026):</strong> Public release; marketing campaign; expand to Berlin, Munich, Cologne
        </BulletItem>
        <BulletItem icon="✨">
          <strong>v2.0 (Q4 2026):</strong> Video profiles for companions; real-time availability calendar; advanced filters; group bookings; referral system
        </BulletItem>
        <BulletItem icon="🌍">
          <strong>Scale (2026+):</strong> Direct insurance billing integration; white-label B2B platform; expand to DACH region; AI-powered scheduling
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
│  • JWT Validation • Rate Limiting • Request Logging│
└────────────────────┬────────────────────────────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
┌───▼────────┐  ┌──▼──────────┐  ┌──▼──────────────┐
│  Supabase  │  │   Stripe    │  │  Firebase/FCM   │
│ PostgreSQL │  │  Payments   │  │   Push Notifs   │
│ Storage    │  │  & Escrow   │  │                 │
│ Auth/RLS   │  │             │  │                 │
└────────────┘  └─────────────┘  └─────────────────┘

┌────────────────────────────────────────────────────┐
│      External Services & Integrations             │
│  • Insurance APIs • Background Checks • Maps     │
│  • SMS (Twilio) • Email (Sendgrid)               │
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
          <strong>AlltagsEngel's tech stack combines best-in-class tools (React Native, Supabase, Stripe) with custom features for care marketplace excellence.</strong> Our architecture prioritizes security (GDPR, EU hosting, encryption), accessibility (dark theme, 44px+ tap targets), and performance (offline-first, real-time sync). With clear product roadmap, we'll scale from MVP to national platform efficiently.
        </Paragraph>
      </Card>
    </DocPageLayout>
  );
}
