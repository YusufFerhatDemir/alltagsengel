'use client';

import { DocPageLayout, Card, SectionTitle, Paragraph, BulletItem, Badge, C, GoldSep, SectionLabel, Icons } from '../../docs/shared';

export default function BrandIdentityPage() {
  return (
    <DocPageLayout 
      title="Brand Identity"
      subtitle="Logo, Colors, Typography & Design Guidelines"
      icon={Icons.palette(32)}
      badge="Brand"
      lang="en"
    >
      {/* Brand Core */}
      <SectionLabel>Brand Core</SectionLabel>
      <Card style={{ marginBottom: '40px' }}>
        <BulletItem icon="🎯">
          <strong>Mission:</strong> Make daily companionship and care support more accessible, affordable, and dignified for Germany's aging population
        </BulletItem>
        <BulletItem icon="🔮">
          <strong>Vision:</strong> Become the digital-first care marketplace connecting millions of families with verified, insured companions across Europe
        </BulletItem>
        <BulletItem icon="💎">
          <strong>Core Values:</strong> Empathy, Safety, Dignity, Innovation, Trust, Inclusion
        </BulletItem>
      </Card>

      {/* Color Palette */}
      <SectionTitle>Color Palette</SectionTitle>
      <GoldSep />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: '24px', marginBottom: '40px' }}>
        <Card style={{ border: '2px solid #C9963C' }}>
          <div style={{ width: '100%', height: '60px', backgroundColor: '#C9963C', borderRadius: '6px', marginBottom: '12px' }} />
          <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold' }}>Gold</div>
          <div style={{ fontSize: '12px', color: '#A0978A', marginTop: '4px' }}>#C9963C</div>
          <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Primary, accents, interactive elements</div>
        </Card>
        <Card style={{ border: '2px solid #1A1612' }}>
          <div style={{ width: '100%', height: '60px', backgroundColor: '#1A1612', borderRadius: '6px', marginBottom: '12px' }} />
          <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold' }}>Coal</div>
          <div style={{ fontSize: '12px', color: '#A0978A', marginTop: '4px' }}>#1A1612</div>
          <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Background, depth, primary text</div>
        </Card>
        <Card style={{ border: '2px solid #F7F2EA' }}>
          <div style={{ width: '100%', height: '60px', backgroundColor: '#F7F2EA', borderRadius: '6px', marginBottom: '12px', border: '1px solid #3A3530' }} />
          <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold' }}>Ink</div>
          <div style={{ fontSize: '12px', color: '#A0978A', marginTop: '4px' }}>#F7F2EA</div>
          <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Text, light elements, contrast</div>
        </Card>
        <Card style={{ border: '2px solid #5CB882' }}>
          <div style={{ width: '100%', height: '60px', backgroundColor: '#5CB882', borderRadius: '6px', marginBottom: '12px' }} />
          <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold' }}>Green</div>
          <div style={{ fontSize: '12px', color: '#A0978A', marginTop: '4px' }}>#5CB882</div>
          <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Success, positive actions, growth</div>
        </Card>
        <Card style={{ border: '2px solid #D04B3B' }}>
          <div style={{ width: '100%', height: '60px', backgroundColor: '#D04B3B', borderRadius: '6px', marginBottom: '12px' }} />
          <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold' }}>Red</div>
          <div style={{ fontSize: '12px', color: '#A0978A', marginTop: '4px' }}>#D04B3B</div>
          <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Alerts, errors, warnings</div>
        </Card>
        <Card style={{ border: '2px solid #A0978A' }}>
          <div style={{ width: '100%', height: '60px', backgroundColor: '#A0978A', borderRadius: '6px', marginBottom: '12px' }} />
          <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold' }}>Stone</div>
          <div style={{ fontSize: '12px', color: '#A0978A', marginTop: '4px' }}>#A0978A</div>
          <div style={{ fontSize: '11px', color: '#7A7570', marginTop: '4px' }}>Secondary text, borders, subtle</div>
        </Card>
      </div>

      {/* Typography */}
      <SectionTitle>Typography</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Primary Font</div>
          <div style={{ fontSize: '32px', fontFamily: 'Jost, sans-serif', color: '#C9963C', fontWeight: '600', marginBottom: '4px' }}>Jost</div>
          <Paragraph style={{ fontSize: '13px', margin: '0' }}>Modern, clean sans-serif for headlines, buttons, and UI text. Excellent readability and contemporary feel. Used for all interface elements and body text.</Paragraph>
        </div>

        <div style={{ borderTop: '1px solid #3A3530', paddingTop: '24px', marginTop: '24px' }}>
          <div style={{ fontSize: '12px', color: '#A0978A', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Display Font</div>
          <div style={{ fontSize: '32px', fontFamily: 'Cormorant Garamond, serif', color: '#C9963C', fontWeight: '400', marginBottom: '4px' }}>Cormorant Garamond</div>
          <Paragraph style={{ fontSize: '13px', margin: '0' }}>Elegant serif font for special displays, premium messaging, and brand statements. Creates warmth and trustworthiness.</Paragraph>
        </div>
      </Card>

      {/* Logo */}
      <SectionTitle>Logo & Wordmark</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <BulletItem icon="🏷️">
          <strong>Logo Design:</strong> AlltagsEngel wordmark with golden wing element symbolizing care, protection, and daily support
        </BulletItem>
        <BulletItem icon="📐">
          <strong>Clear Space:</strong> Minimum clear space around logo is 20px; never crowd with other elements
        </BulletItem>
        <BulletItem icon="📏">
          <strong>Minimum Size:</strong> Logo should never be smaller than 120px in width on digital; 25mm in print
        </BulletItem>
        <BulletItem icon="✅">
          <strong>Usage Guidelines:</strong> Use on premium dark background (#1A1612) with gold accent or on light backgrounds with coal version
        </BulletItem>
        <BulletItem icon="❌">
          <strong>Never:</strong> Stretch, rotate, change colors, add shadows, or modify proportions
        </BulletItem>
      </Card>

      {/* Tone of Voice */}
      <SectionTitle>Tone of Voice</SectionTitle>
      <GoldSep />
      <Card style={{ marginBottom: '40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Warm</div>
            <Paragraph style={{ fontSize: '13px', margin: '0', color: '#A0978A' }}>Personal, approachable, friendly. We care about you and your loved ones. Always human, never corporate.</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Professional</div>
            <Paragraph style={{ fontSize: '13px', margin: '0', color: '#A0978A' }}>Knowledgeable, competent, reliable. Expertise in care and technology. Trustworthy authority in our field.</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Empathetic</div>
            <Paragraph style={{ fontSize: '13px', margin: '0', color: '#A0978A' }}>Understanding, respectful, dignified. We recognize the challenges of aging and care. Never condescending.</Paragraph>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#C9963C', fontWeight: 'bold', marginBottom: '8px' }}>Inclusive</div>
            <Paragraph style={{ fontSize: '13px', margin: '0', color: '#A0978A' }}>Accessible to all ages, cultures, abilities. Clear language, thoughtful design, diverse representation.</Paragraph>
          </div>
        </div>
      </Card>

      {/* Brand Slogan */}
      <SectionTitle>Brand Slogan & Messaging</SectionTitle>
      <GoldSep />
      <Card style={{ backgroundColor: 'rgba(201, 150, 60, 0.1)', borderLeft: '4px solid #C9963C', padding: '24px', marginBottom: '40px' }}>
        <div style={{ fontSize: '28px', fontFamily: 'Cormorant Garamond, serif', color: '#C9963C', fontWeight: '400', marginBottom: '16px' }}>Mit Herz für dich da</div>
        <Paragraph style={{ fontSize: '13px', margin: '0', color: '#F7F2EA' }}>
          "Mit Herz für dich da" (With heart for you) captures our brand essence: we provide care with genuine compassion, not just transaction. Every interaction should feel personal, warm, and trustworthy.
        </Paragraph>
      </Card>

      {/* Design Principles */}
      <SectionTitle>Design Principles</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="🎨">
          <strong>Premium Dark Aesthetic:</strong> Coal background with gold accents creates luxury and accessibility (better for older eyes, WCAG compliant)
        </BulletItem>
        <BulletItem icon="📱">
          <strong>Mobile-First:</strong> Design optimized for touch, readable fonts (18px+ minimum), large tap targets (44px minimum)
        </BulletItem>
        <BulletItem icon="♿">
          <strong>Accessibility:</strong> WCAG AA minimum; high contrast ratios, keyboard navigation, screen reader support
        </BulletItem>
        <BulletItem icon="🧮">
          <strong>Grid & Spacing:</strong> Consistent 8px grid system; generous whitespace (breathing room) for clarity
        </BulletItem>
        <BulletItem icon="⚡">
          <strong>Micro-interactions:</strong> Subtle animations, hover states, loading indicators create polished feel without distraction
        </BulletItem>
      </Card>

      {/* Photography Style */}
      <SectionTitle>Photography & Imagery</SectionTitle>
      <GoldSep />
      <Card>
        <BulletItem icon="📸">
          <strong>Photography Style:</strong> Warm, authentic, real people (not stock photos). Diverse age groups, ethnicities, abilities. Candid moments of genuine connection.
        </BulletItem>
        <BulletItem icon="🖼️">
          <strong>Image Treatment:</strong> Warm color cast; subtle grain; slightly desaturated for premium feel. Never overly bright or clinical.
        </BulletItem>
        <BulletItem icon="🎬">
          <strong>Video:</strong> Testimonials, tutorials, brand films with warm lighting. Authentic voices and stories. 16:9 for desktop, vertical for mobile.
        </BulletItem>
        <BulletItem icon="✨">
          <strong>Iconography:</strong> Simple, recognizable icons with consistent stroke weight and rounded corners. Gold on coal or coal on light backgrounds.
        </BulletItem>
      </Card>

      {/* Brand Promise */}
      <Card style={{ marginTop: '40px', backgroundColor: 'rgba(201, 150, 60, 0.1)', borderLeft: '4px solid #C9963C', padding: '24px' }}>
        <Paragraph style={{ margin: 0, color: '#F7F2EA' }}>
          <strong>AlltagsEngel's brand promise is simple: trustworthy companionship, verified professionals, and seamless technology—all designed with genuine care and warmth for families and seniors.</strong>
        </Paragraph>
      </Card>
    </DocPageLayout>
  );
}
