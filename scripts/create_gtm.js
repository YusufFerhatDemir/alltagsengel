const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, BorderStyle, PageBreak, HeadingLevel, AlignmentType, ShadingType, convertInchesToTwip } = require('docx');
const fs = require('fs');
const path = require('path');

// Colors
const GOLD = 'C9963C';
const DARK_TEXT = '2F2F2F';
const LIGHT_GRAY = 'F5F5F5';

// Helper function to create table cells
function createTableCell(text, isBold = false, isHeader = false) {
  return new TableCell({
    children: [
      new Paragraph({
        text: text,
        bold: isBold || isHeader,
        color: isHeader ? 'FFFFFF' : DARK_TEXT,
        alignment: AlignmentType.LEFT,
        spacing: { line: 280 },
      })
    ],
    shading: {
      type: ShadingType.CLEAR,
      color: isHeader ? GOLD : LIGHT_GRAY,
    },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' },
      left: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' },
      right: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' },
    },
    margins: {
      top: 100,
      bottom: 100,
      left: 100,
      right: 100,
    }
  });
}

// 1. COVER PAGE
const coverPage = [
  new Paragraph({
    text: '',
    spacing: { before: 2000 }
  }),
  new Paragraph({
    text: 'Go-to-Market Strategy',
    alignment: AlignmentType.CENTER,
    spacing: { before: 1000, after: 400 },
    run: {
      color: GOLD,
      bold: true,
      size: 60,
    }
  }),
  new Paragraph({
    text: 'AlltagsEngel',
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 200 },
    run: {
      color: DARK_TEXT,
      bold: true,
      size: 32,
    }
  }),
  new Paragraph({
    text: 'Dein Engel für den Alltag',
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 1200 },
    run: {
      color: DARK_TEXT,
      italic: true,
      size: 24,
    }
  }),
  new Paragraph({
    text: 'CONFIDENTIAL',
    alignment: AlignmentType.CENTER,
    spacing: { before: 800, after: 200 },
    run: {
      color: GOLD,
      bold: true,
      size: 24,
    }
  }),
  new Paragraph({
    text: 'Investor Data Room',
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    run: {
      color: DARK_TEXT,
      size: 20,
    }
  }),
  new Paragraph({
    text: 'March 2026',
    alignment: AlignmentType.CENTER,
    spacing: { before: 1200 },
    run: {
      color: DARK_TEXT,
      size: 20,
    }
  }),
];

// 2. GTM OVERVIEW
const gtmOverview = [
  new Paragraph({ text: '', spacing: { before: 400 } }),
  new Paragraph({
    text: 'Go-to-Market Overview',
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 300 },
    run: { color: GOLD, bold: true, size: 32 }
  }),
  new Paragraph({
    text: 'AlltagsEngel enters the market with a strategic, phase-based approach designed to build trust, establish market presence, and achieve sustainable growth in the care companion ecosystem.',
    spacing: { line: 360, after: 300 },
    alignment: AlignmentType.LEFT,
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Launch Phases',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 200 },
    run: { color: GOLD, bold: true, size: 28 }
  }),
  new Paragraph({
    text: 'Soft Launch (Week 1-2): Focus on brand awareness and early adopter engagement through owned and earned channels',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Regional Launch (Week 3-4): Expand reach to secondary target segments with partnership activation',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'National Expansion (Month 2+): Scale across Germany with paid media and strategic partnerships',
    spacing: { line: 280, after: 300, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'First Month Targets',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 200 },
    run: { color: GOLD, bold: true, size: 28 }
  }),
  new Paragraph({
    text: '500+ App Downloads',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: '50+ Companion Registrations',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: '200+ Newsletter Subscribers',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: '10+ Press Mentions',
    spacing: { line: 280, after: 300, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
];

// 3. TARGET AUDIENCE
const targetAudience = [
  new Paragraph({ text: '', spacing: { before: 400 } }),
  new Paragraph({
    text: 'Target Audience',
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 300 },
    run: { color: GOLD, bold: true, size: 32 }
  }),
  new Paragraph({
    text: 'Primary: Families of Care-Dependent Elderly',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 200 },
    run: { color: GOLD, bold: true, size: 28 }
  }),
  new Paragraph({
    text: 'Decision-makers and primary caregivers managing elderly care needs',
    spacing: { line: 360, after: 200 },
    alignment: AlignmentType.LEFT,
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Age: 35-55 years old',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Digital-savvy professionals with limited time for in-person care coordination',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Seeking flexible, trustworthy companion services for aging parents',
    spacing: { line: 280, after: 300, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Secondary: Care-Dependent Individuals',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 200 },
    run: { color: GOLD, bold: true, size: 28 }
  }),
  new Paragraph({
    text: 'Elderly individuals requiring companion support and social engagement',
    spacing: { line: 360, after: 200 },
    alignment: AlignmentType.LEFT,
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Age: 65+ years old',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Often reached through family members and care networks',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Value consistency, reliability, and emotional connection in caregiving',
    spacing: { line: 280, after: 300, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Supply Side: Certified Alltagsbegleiter',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 200 },
    run: { color: GOLD, bold: true, size: 28 }
  }),
  new Paragraph({
    text: 'Professionals certified under §53b seeking flexible work opportunities',
    spacing: { line: 360, after: 200 },
    alignment: AlignmentType.LEFT,
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Certified Alltagsbegleiter (§53b certification)',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Looking for flexible, autonomous work arrangements',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Interested in building sustainable income through quality placements',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
];

// 4. LAUNCH STRATEGY
const launchStrategy = [
  new Paragraph({ text: '', spacing: { before: 400 } }),
  new Paragraph({
    text: 'Launch Strategy: "Dein Engel für den Alltag"',
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 300 },
    run: { color: GOLD, bold: true, size: 32 }
  }),
  new Paragraph({
    text: 'A carefully orchestrated 4-week campaign introducing AlltagsEngel across multiple channels with messaging tailored to build trust and drive adoption.',
    spacing: { line: 360, after: 300 },
    alignment: AlignmentType.LEFT,
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Campaign Timeline',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 200 },
    run: { color: GOLD, bold: true, size: 28 }
  }),
  new Paragraph({
    text: 'Week 1: "Introduction"',
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 150 },
    run: { color: DARK_TEXT, bold: true, size: 24 }
  }),
  new Paragraph({
    text: 'Launch & brand awareness - Introduce AlltagsEngel as the trusted solution for everyday care companionship across social media and press channels',
    spacing: { line: 280, after: 200, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Week 2: "Our Angels"',
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 150 },
    run: { color: DARK_TEXT, bold: true, size: 24 }
  }),
  new Paragraph({
    text: 'Trust & quality messaging - Highlight Alltagsbegleiter profiles, certifications, and stories of quality companion matches',
    spacing: { line: 280, after: 200, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Week 3: "Everyday Stories"',
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 150 },
    run: { color: DARK_TEXT, bold: true, size: 24 }
  }),
  new Paragraph({
    text: 'Emotional connection through user stories - Share real experiences and testimonials showing the impact of companion care',
    spacing: { line: 280, after: 200, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Week 4: "Get Started"',
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 150 },
    run: { color: DARK_TEXT, bold: true, size: 24 }
  }),
  new Paragraph({
    text: 'Conversion focus - Drive app downloads and registrations with clear CTAs and limited-time incentives',
    spacing: { line: 280, after: 300, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
];

// 5. CHANNEL STRATEGY
const channelStrategy = [
  new Paragraph({ text: '', spacing: { before: 400 } }),
  new Paragraph({
    text: 'Channel Strategy',
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 300 },
    run: { color: GOLD, bold: true, size: 32 }
  }),
  new Paragraph({
    text: 'Multi-channel approach leveraging owned, earned, and social media channels to reach target audiences across their preferred platforms.',
    spacing: { line: 360, after: 300 },
    alignment: AlignmentType.LEFT,
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({ text: '', spacing: { before: 200, after: 200 } }),
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          createTableCell('Channel', true, true),
          createTableCell('Target Audience', true, true),
          createTableCell('Content Frequency', true, true),
          createTableCell('KPI Targets', true, true),
        ],
      }),
      new TableRow({
        children: [
          createTableCell('LinkedIn'),
          createTableCell('Care industry professionals, B2B partnerships'),
          createTableCell('3 posts/week'),
          createTableCell('300+ followers'),
        ],
      }),
      new TableRow({
        children: [
          createTableCell('Instagram'),
          createTableCell('Families, caregivers, companions'),
          createTableCell('4 posts/week'),
          createTableCell('1,000+ followers'),
        ],
      }),
      new TableRow({
        children: [
          createTableCell('TikTok'),
          createTableCell('Younger relatives, secondary audience'),
          createTableCell('3 videos/week'),
          createTableCell('500+ followers'),
        ],
      }),
      new TableRow({
        children: [
          createTableCell('Newsletter'),
          createTableCell('All subscribers, nurture funnel'),
          createTableCell('Weekly digest'),
          createTableCell('200+ subscribers'),
        ],
      }),
      new TableRow({
        children: [
          createTableCell('Blog'),
          createTableCell('SEO organic traffic, education'),
          createTableCell('1 article/week'),
          createTableCell('2,000+ monthly visitors'),
        ],
      }),
      new TableRow({
        children: [
          createTableCell('Podcast'),
          createTableCell('In-depth listener engagement'),
          createTableCell('Weekly episodes'),
          createTableCell('100+ downloads/episode'),
        ],
      }),
      new TableRow({
        children: [
          createTableCell('Press Releases'),
          createTableCell('Care media, industry publications'),
          createTableCell('Monthly'),
          createTableCell('3+ monthly mentions'),
        ],
      }),
    ],
  }),
];

// 6. PARTNERSHIP STRATEGY
const partnershipStrategy = [
  new Paragraph({ text: '', spacing: { before: 400 } }),
  new Paragraph({
    text: 'Partnership Strategy',
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 300 },
    run: { color: GOLD, bold: true, size: 32 }
  }),
  new Paragraph({
    text: 'Strategic partnerships extend reach and credibility within the care ecosystem, providing trusted channels to access target customers.',
    spacing: { line: 360, after: 300 },
    alignment: AlignmentType.LEFT,
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Care Insurance Companies (Pflegekassen)',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 200 },
    run: { color: GOLD, bold: true, size: 28 }
  }),
  new Paragraph({
    text: 'Co-marketing opportunities for eligible members',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Potential referral partnerships for covered companion services',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Integration with care coordination platforms',
    spacing: { line: 280, after: 300, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Municipal Care Advisory Offices (Pflegestützpunkte)',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 200 },
    run: { color: GOLD, bold: true, size: 28 }
  }),
  new Paragraph({
    text: 'Local government partner endorsements',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Placement of resources in local care information centers',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Joint information sessions and webinars',
    spacing: { line: 280, after: 300, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Physician Networks & Hospitals',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 200 },
    run: { color: GOLD, bold: true, size: 28 }
  }),
  new Paragraph({
    text: 'Physician referral programs for post-care companion services',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Hospital discharge planning partnerships',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Patient education resources distribution',
    spacing: { line: 280, after: 300, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Companion Training Organizations',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 200 },
    run: { color: GOLD, bold: true, size: 28 }
  }),
  new Paragraph({
    text: 'Recruitment partnership for newly certified Alltagsbegleiter',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Cross-promotion to training program graduates',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Continuing education and skill development collaboration',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
];

// 7. USER ACQUISITION FUNNEL
const userAcquisitionFunnel = [
  new Paragraph({ text: '', spacing: { before: 400 } }),
  new Paragraph({
    text: 'User Acquisition Funnel',
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 300 },
    run: { color: GOLD, bold: true, size: 32 }
  }),
  new Paragraph({
    text: 'Strategic progression from awareness through conversion and retention, optimizing for cost-effective customer acquisition and lifetime value.',
    spacing: { line: 360, after: 300 },
    alignment: AlignmentType.LEFT,
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Funnel Stages',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 200 },
    run: { color: GOLD, bold: true, size: 28 }
  }),
  new Paragraph({
    text: 'Awareness - Social media, PR, content, partnerships reach target audiences',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Interest - Educational content, testimonials, and brand storytelling engage consideration',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Download - Conversion optimization and clear CTAs drive app installations',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Registration - Onboarding flow and value demonstration',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'First Booking - Quality matching and seamless experience drive first transaction',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Retention - Consistent quality, communication, and loyalty programs drive repeat bookings',
    spacing: { line: 280, after: 300, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Customer Acquisition Cost (CAC)',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 200 },
    run: { color: GOLD, bold: true, size: 28 }
  }),
  new Paragraph({
    text: 'Initial Phase: €15-25 per user',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Scale Phase: €8-12 per user',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Optimization through partner referrals and organic growth',
    spacing: { line: 280, after: 300, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Retention Strategy',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 200 },
    run: { color: GOLD, bold: true, size: 28 }
  }),
  new Paragraph({
    text: 'Quality Matching - Sophisticated algorithm ensuring compatible companion and user pairings',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'In-App Communication - Direct messaging and feedback channels for continuous improvement',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Loyalty Program - Rewards for consistent bookings and referrals',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
];

// 8. KPIs & SUCCESS METRICS
const kpisMetrics = [
  new Paragraph({ text: '', spacing: { before: 400 } }),
  new Paragraph({
    text: 'KPIs & Success Metrics',
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 300 },
    run: { color: GOLD, bold: true, size: 32 }
  }),
  new Paragraph({
    text: 'Comprehensive metrics tracking market penetration, user engagement, and business health across key performance indicators.',
    spacing: { line: 360, after: 300 },
    alignment: AlignmentType.LEFT,
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({ text: '', spacing: { before: 200, after: 200 } }),
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          createTableCell('Metric', true, true),
          createTableCell('Month 1 Target', true, true),
          createTableCell('Month 6 Target', true, true),
          createTableCell('Year 1 Target', true, true),
        ],
      }),
      new TableRow({
        children: [
          createTableCell('App Downloads'),
          createTableCell('500+'),
          createTableCell('5,000+'),
          createTableCell('25,000+'),
        ],
      }),
      new TableRow({
        children: [
          createTableCell('Active Users (MAU)'),
          createTableCell('300+'),
          createTableCell('3,000+'),
          createTableCell('12,000+'),
        ],
      }),
      new TableRow({
        children: [
          createTableCell('Companion Registrations'),
          createTableCell('50+'),
          createTableCell('400+'),
          createTableCell('1,500+'),
        ],
      }),
      new TableRow({
        children: [
          createTableCell('Bookings Completed'),
          createTableCell('20+'),
          createTableCell('500+'),
          createTableCell('4,000+'),
        ],
      }),
      new TableRow({
        children: [
          createTableCell('Net Promoter Score (NPS)'),
          createTableCell('50+'),
          createTableCell('60+'),
          createTableCell('65+'),
        ],
      }),
      new TableRow({
        children: [
          createTableCell('User Retention (30-day)'),
          createTableCell('60%'),
          createTableCell('70%'),
          createTableCell('75%'),
        ],
      }),
      new TableRow({
        children: [
          createTableCell('Booking Frequency (Avg)'),
          createTableCell('1.2x/month'),
          createTableCell('2.0x/month'),
          createTableCell('3.5x/month'),
        ],
      }),
    ],
  }),
];

// 9. BUDGET ALLOCATION
const budgetAllocation = [
  new Paragraph({ text: '', spacing: { before: 400 } }),
  new Paragraph({
    text: 'Budget Allocation',
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 300 },
    run: { color: GOLD, bold: true, size: 32 }
  }),
  new Paragraph({
    text: 'First 12 months marketing budget strategically distributed across channels and initiatives to maximize ROI and market penetration.',
    spacing: { line: 360, after: 300 },
    alignment: AlignmentType.LEFT,
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Marketing Budget Breakdown',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 200 },
    run: { color: GOLD, bold: true, size: 28 }
  }),
  new Paragraph({
    text: 'Digital Advertising: 40%',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Paid social media campaigns (LinkedIn, Instagram, TikTok), Google Ads, and retargeting',
    spacing: { line: 260, after: 150, before: 50 },
    bullet: { level: 1 },
    run: { color: DARK_TEXT, size: 18 }
  }),
  new Paragraph({
    text: 'Content Creation: 25%',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Video production, photography, copywriting, blog articles, podcast production, and translation services',
    spacing: { line: 260, after: 150, before: 50 },
    bullet: { level: 1 },
    run: { color: DARK_TEXT, size: 18 }
  }),
  new Paragraph({
    text: 'PR & Events: 15%',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Press releases, media relations, industry events, webinars, and launch events',
    spacing: { line: 260, after: 150, before: 50 },
    bullet: { level: 1 },
    run: { color: DARK_TEXT, size: 18 }
  }),
  new Paragraph({
    text: 'Partnerships: 10%',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Co-marketing programs, referral incentives, and partner enablement',
    spacing: { line: 260, after: 150, before: 50 },
    bullet: { level: 1 },
    run: { color: DARK_TEXT, size: 18 }
  }),
  new Paragraph({
    text: 'Tools & Technology: 10%',
    spacing: { line: 280, after: 150, before: 100 },
    bullet: { level: 0 },
    run: { color: DARK_TEXT, size: 20 }
  }),
  new Paragraph({
    text: 'Marketing automation, analytics platforms, design tools, and CRM systems',
    spacing: { line: 260, after: 150, before: 50 },
    bullet: { level: 1 },
    run: { color: DARK_TEXT, size: 18 }
  }),
];

// Footer
const footer = [
  new Paragraph({ text: '', spacing: { before: 800 } }),
  new Paragraph({
    text: 'This document is confidential and intended for use by AlltagsEngel investors and authorized personnel only.',
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 },
    run: {
      color: DARK_TEXT,
      italic: true,
      size: 18,
    }
  }),
  new Paragraph({
    text: 'Prepared: March 2026',
    alignment: AlignmentType.CENTER,
    spacing: { before: 100 },
    run: {
      color: DARK_TEXT,
      size: 18,
    }
  }),
];

// Combine all sections with page breaks
const sections = [
  ...coverPage,
  new PageBreak(),
  ...gtmOverview,
  new PageBreak(),
  ...targetAudience,
  new PageBreak(),
  ...launchStrategy,
  new PageBreak(),
  ...channelStrategy,
  new PageBreak(),
  ...partnershipStrategy,
  new PageBreak(),
  ...userAcquisitionFunnel,
  new PageBreak(),
  ...kpisMetrics,
  new PageBreak(),
  ...budgetAllocation,
  new PageBreak(),
  ...footer,
];

const doc = new Document({
  sections: [{
    children: sections,
    margins: {
      top: convertInchesToTwip(0.75),
      right: convertInchesToTwip(0.75),
      bottom: convertInchesToTwip(0.75),
      left: convertInchesToTwip(0.75),
    }
  }]
});

// Create directory if it doesn't exist
const outputDir = '/sessions/festive-intelligent-rubin/mnt/alltagsengel-app/data-room/07-go-to-market';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Save document
Packer.toBuffer(doc).then(buffer => {
  const outputPath = `${outputDir}/AlltagsEngel-Go-To-Market-Strategy.docx`;
  fs.writeFileSync(outputPath, buffer);
  console.log(`Document successfully created at: ${outputPath}`);
  process.exit(0);
});
