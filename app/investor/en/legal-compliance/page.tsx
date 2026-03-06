'use client';

import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, Badge, C, GoldSep, SectionLabel, Icons } from '../../docs/shared';

export default function LegalCompliancePage() {
  return (
    <DocPageLayout 
      title="Legal & Compliance"
      subtitle="SGB XI, Data Privacy, Insurance & IP"
      icon={Icons.shield(32)}
      badge="Legal"
      lang="en"
    >
      {/* Company Structure */}
      <SectionLabel>Company Legal Structure</SectionLabel>
      <Card style={{ marginBottom: '40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Legal Form</div>
            <div style={{ fontSize: '16px', color: '#C9963C', fontWeight: 'bold' }}>UG (limited liability)</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>UG haftungsbeschränkt (ähnlich LLC)</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Registered Office</div>
            <div style={{ fontSize: '16px', color: '#C9963C', fontWeight: 'bold' }}>Frankfurt am Main</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Hessen, Germany</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Registration</div>
            <div style={{ fontSize: '16px', color: '#C9963C', fontWeight: 'bold' }}>Frankfurt Handelsregister</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Local chamber of commerce</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px' }}>Tax Status</div>
            <div style={{ fontSize: '16px', color: '#C9963C', fontWeight: 'bold' }}>USt-ID + Income Tax</div>
            <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Registered with Bundeszentralamt für Steuern</div>
          </div>
        </div>
      </Card>

      {/* Regulatory Framework */}
      <SectionTitle>Regulatory Framework (German Law)</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <BulletItem icon="📋">
          <strong>§45b SGB XI:</strong> Care relief benefit regulation. AlltagsEngel facilitates legal §45b benefit utilization by connecting families with companions. Users receive €131/month for approved activities (companionship, household, transportation).
        </BulletItem>
        <BulletItem icon="✅">
          <strong>§53b SGB XI (Companion Qualifications):</strong> Companions must meet €53b criteria for care relief billing eligibility. Requirements: Specific training (24-hour course), background check clearance, ongoing education. AlltagsEngel enforces §53b verification in platform.
        </BulletItem>
        <BulletItem icon="🏛️">
          <strong>Hessen State Law:</strong> AlltagsEngel subject to Hessen employment, consumer protection, and health regulations. Regular compliance audits conducted. Registered with Hessen social ministry for care marketplace operations.
        </BulletItem>
        <BulletItem icon="💼">
          <strong>Professional Liability:</strong> Companions classified as independent contractors/freelancers for §45b purposes. AlltagsEngel holds professional liability insurance (€2M+ coverage) protecting customers against companion negligence.
        </BulletItem>
        <BulletItem icon="📊">
          <strong>Data Protection Officer (DPO):</strong> Planned hire by Month 6. Required for processing sensitive health/care data. Will oversee GDPR compliance, employee training, data audits.
        </BulletItem>
      </Card>

      {/* Data Protection & GDPR */}
      <SectionTitle>Data Protection & GDPR Compliance</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <BulletItem icon="📋">
          <strong>Privacy Policy & Terms:</strong> Comprehensive, compliant privacy notice (German & English). Clear data collection consent; transparent use cases; user rights explained.
        </BulletItem>
        <BulletItem icon="🔐">
          <strong>Data Processing:</strong> Only collects necessary data (name, email, phone, location, verification docs). Zero third-party data sharing without consent. Data retention: 3 years post-account deletion (legal requirement); then deletion.
        </BulletItem>
        <BulletItem icon="🤝">
          <strong>Data Processing Agreements (DPAs):</strong> Signed with all sub-processors (Supabase, Stripe, Firebase, Sendgrid, Twilio, Sentry). GDPR-compliant DPA terms; EU/EEA data residency guaranteed.
        </BulletItem>
        <BulletItem icon="📊">
          <strong>Data Protection Impact Assessment (DPIA):</strong> Completed for high-risk processing (background checks, health data, §45b benefit details). Results: Medium risk with mitigations (encryption, RLS, DPO).
        </BulletItem>
        <BulletItem icon="✍️">
          <strong>Record of Processing:</strong> Maintained per GDPR Article 30. Logs all data processing activities, purposes, recipients, retention, security measures. Updated quarterly; available for regulatory inspection.
        </BulletItem>
        <BulletItem icon="💬">
          <strong>User Rights:</strong> Platform enables easy data export (GDPR Article 20), deletion (Article 17), and consent withdrawal. Response time &lt;30 days for all requests.
        </BulletItem>
        <BulletItem icon="🚨">
          <strong>Breach Response:</strong> Security incident protocol in place. 72-hour notification to DPA/users for breaches; detailed logs of all incidents.
        </BulletItem>
      </Card>

      {/* Insurance & Liability */}
      <SectionTitle>Insurance & Risk Management</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <BulletItem icon="🏢">
          <strong>Business Liability Insurance:</strong> €2M+ coverage protecting AlltagsEngel against third-party claims (injuries, damages from platform operations)
        </BulletItem>
        <BulletItem icon="👔">
          <strong>Professional Liability (Companion):</strong> All companions required to carry professional liability insurance (€1M+) before approval. AlltagsEngel maintains master policy covering companions in network. Families protected 100%.
        </BulletItem>
        <BulletItem icon="💻">
          <strong>Cyber Insurance:</strong> Planned for Year 1; covers data breach costs, liability, notification expenses, business interruption
        </BulletItem>
        <BulletItem icon="👨‍💼">
          <strong>Employee Insurance:</strong> All staff covered by standard German employment insurance (health, social, unemployment)
        </BulletItem>
        <BulletItem icon="⚖️">
          <strong>Escrow & Payment Protection:</strong> Stripe handles payment processing with PCI-DSS compliance; escrow system protects both customers and companions
        </BulletItem>
      </Card>

      {/* Employment & Contractor Relationship */}
      <SectionTitle>Employment & Contractor Relationship</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <BulletItem icon="📝">
          <strong>Companions as Freelancers/Solo-Entrepreneurs:</strong> Independent contractor relationship; not employees of AlltagsEngel. Companions issue invoices for services; responsible for own taxes, insurance, benefits.
        </BulletItem>
        <BulletItem icon="⏰">
          <strong>Flexible Work Model:</strong> Companions set own availability, working hours, rates (within AlltagsEngel pricing structure). No minimum booking requirements. Full autonomy over client selection.
        </BulletItem>
        <BulletItem icon="📊">
          <strong>Independent Contractor Compliance:</strong> Relationship complies with German tax law (§34 EStDV); proper 1099-style reporting; companions manage own social contributions.
        </BulletItem>
        <BulletItem icon="👥">
          <strong>Full-Time Staff:</strong> CEO, CTO, Team Lead, Marketing specialist are W-2 employees with full benefits, social security, health insurance coverage.
        </BulletItem>
        <BulletItem icon="⚖️">
          <strong>Dispute Resolution:</strong> Clear terms & conditions for contractor disputes; binding arbitration option; mediation first approach
        </BulletItem>
      </Card>

      {/* Intellectual Property */}
      <SectionTitle>Intellectual Property & Assets</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <BulletItem icon="📌">
          <strong>Trademark Protection:</strong> "AlltagsEngel" word mark filing planned Q2 2026 (German Patent & Trade Mark Office); design registration for logo planned
        </BulletItem>
        <BulletItem icon="🌐">
          <strong>Domain & Web Assets:</strong> alltagesngel.de, alltagesngel.app secured; registered in company name; privacy locked
        </BulletItem>
        <BulletItem icon="💻">
          <strong>Software & Code Ownership:</strong> All code, architecture, databases owned 100% by AlltagsEngel. Employee/contractor agreements include IP assignment clauses.
        </BulletItem>
        <BulletItem icon="🎨">
          <strong>Design & Brand Assets:</strong> Logo, color palette, typography, design system owned by AlltagsEngel. Vendor contracts (designers, agencies) include IP transfer clauses.
        </BulletItem>
        <BulletItem icon="📚">
          <strong>Content & Documentation:</strong> Blog posts, customer guides, educational materials owned by AlltagsEngel. User-generated content (reviews, photos) licensed to AlltagsEngel with full promotional rights.
        </BulletItem>
      </Card>

      {/* Key Contracts */}
      <SectionTitle>Key Contracts & Documentation</SectionTitle>
      <GoldSep />
      <div style={{ overflowX: 'auto', marginBottom: '40px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #C9963C' }}>
              <th style={{ padding: '12px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Document</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', color: '#C9963C', fontWeight: '600' }}>Description</th>
              <th style={{ padding: '12px 8px', textAlign: 'center', color: '#C9963C', fontWeight: '600' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Terms of Service</td>
              <td style={{ padding: '12px 8px', color: '#A0978A' }}>User agreements for customers & companions; dispute resolution; liability limits</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>✓ Final</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Privacy Policy</td>
              <td style={{ padding: '12px 8px', color: '#A0978A' }}>GDPR-compliant data handling; opt-out mechanisms; data rights</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>✓ Final</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Companion Agreement</td>
              <td style={{ padding: '12px 8px', color: '#A0978A' }}>Independent contractor terms; §53b verification requirements; payment terms; background check consent</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>✓ Final</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Customer Terms</td>
              <td style={{ padding: '12px 8px', color: '#A0978A' }}>Booking terms; cancellation policy; §45b benefit documentation; insurance coverage</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>✓ Final</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Data Processing Agreements (DPAs)</td>
              <td style={{ padding: '12px 8px', color: '#A0978A' }}>Sub-processor contracts with Supabase, Stripe, Firebase, Sendgrid, Twilio, Sentry</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>✓ Final</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Companion Verification SLA</td>
              <td style={{ padding: '12px 8px', color: '#A0978A' }}>Background check partner agreements; timeline & scope of verification</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>✓ Final</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Insurance Partnerships</td>
              <td style={{ padding: '12px 8px', color: '#A0978A' }}>Agreements with insurers for §45b billing integration; claim procedures</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#D04B3B' }}>⏳ In Progress</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #3A3530' }}>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Employee Contracts</td>
              <td style={{ padding: '12px 8px', color: '#A0978A' }}>Contracts for CEO, CTO, Team Lead, Marketing; IP assignment; confidentiality</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#5CB882' }}>✓ Final</td>
            </tr>
            <tr>
              <td style={{ padding: '12px 8px', color: '#F7F2EA' }}>Investor Agreement</td>
              <td style={{ padding: '12px 8px', color: '#A0978A' }}>SAFE/KISS agreement for €500K seed round; equity terms; investor rights</td>
              <td style={{ padding: '12px 8px', textAlign: 'center', color: '#D04B3B' }}>⏳ Ready Soon</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Compliance Roadmap */}
      <SectionTitle>Compliance Roadmap (12 Months)</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="📅">
          <strong>Month 1-2:</strong> Data Protection Officer hiring; DPA finalization with all sub-processors; DPIA completion; insurance broker engagement
        </BulletItem>
        <BulletItem icon="📅">
          <strong>Month 3:</strong> Trademark filing (AlltagsEngel word mark); Hessen social ministry registration; initial security audit (SOC 2 Type 1 planning)
        </BulletItem>
        <BulletItem icon="📅">
          <strong>Month 4-6:</strong> §45b billing integration testing with insurance partners; SOC 2 Type 1 certification; cyber insurance activation
        </BulletItem>
        <BulletItem icon="📅">
          <strong>Month 6-12:</strong> Annual GDPR audit; employee compliance training; contractor compliance checks; trademark approval; consider ISO 27001 certification
        </BulletItem>
      </Card>

      {/* Risk Mitigation */}
      <SectionTitle>Key Risks & Mitigation</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="⚠️">
          <strong>Regulatory Changes:</strong> §45b rules could be revised. Mitigation: Monitor legislative updates; maintain insurance partnerships flexibility; diversify revenue beyond §45b.
        </BulletItem>
        <BulletItem icon="⚠️">
          <strong>Companion Misconduct:</strong> Background check failure or misconduct post-hiring. Mitigation: Comprehensive vetting; ongoing training; insurance coverage; quick removal process; customer support.
        </BulletItem>
        <BulletItem icon="⚠️">
          <strong>Data Breach:</strong> Cybersecurity incident compromising user data. Mitigation: Encryption (TLS 1.3, AES-256); RLS; regular security audits; cyber insurance; incident response plan.
        </BulletItem>
        <BulletItem icon="⚠️">
          <strong>Liability Claims:</strong> Customer injured during companionship; claims against platform. Mitigation: Liability insurance (€2M+); clear liability disclaimers; companion insurance requirement; dispute resolution.
        </BulletItem>
        <BulletItem icon="⚠️">
          <strong>Payment Disputes:</strong> Chargebacks, refund conflicts between customers and companions. Mitigation: Clear booking terms; escrow system; dispute resolution panel; transparent fees.
        </BulletItem>
      </Card>

      {/* Summary */}
      <Card style={{ marginTop: '40px', backgroundColor: 'rgba(201, 150, 60, 0.1)', borderLeft: '4px solid #C9963C', padding: '24px' }}>
        <Paragraph style={{ margin: 0, color: '#F7F2EA' }}>
          <strong>AlltagsEngel is structured as a compliant, fully insured care marketplace with comprehensive GDPR protections, §45b legal authority, and clear liability management.</strong> Our legal framework (UG haftungsbeschränkt), regulatory partnerships (insurance, background check), and data governance (DPO, DPA, encryption) provide investors with confidence in sustainable, long-term business operations. 12-month compliance roadmap ensures proactive risk management.
        </Paragraph>
      </Card>
    </DocPageLayout>
  );
}
