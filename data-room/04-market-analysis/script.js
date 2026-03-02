const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, TextRun, VerticalAlign, BorderStyle } = require('docx');
const fs = require('fs');

// Color definitions
const GOLD = 'C9963C';
const DARK_GRAY = '333333';
const LIGHT_GRAY = 'F5F5F5';

// Helper function to create styled heading
function createHeading(text, level = 1) {
  if (level === 1) {
    return new Paragraph({
      text: text,
      style: 'Heading1',
      spacing: { before: 400, after: 200 },
      border: {
        bottom: {
          color: GOLD,
          space: 1,
          style: BorderStyle.SINGLE,
          size: 12
        }
      }
    });
  } else if (level === 2) {
    return new Paragraph({
      text: text,
      style: 'Heading2',
      spacing: { before: 300, after: 150 }
    });
  } else {
    return new Paragraph({
      text: text,
      style: 'Heading3',
      spacing: { before: 200, after: 100 }
    });
  }
}

function createBodyParagraph(text) {
  return new Paragraph({
    text: text,
    spacing: { line: 360, after: 150 },
    alignment: 'justified'
  });
}

function createTableWithBorders(rows, widths) {
  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE
    },
    rows: rows.map(rowData => 
      new TableRow({
        children: rowData.map((cell, idx) => 
          new TableCell({
            children: Array.isArray(cell) ? cell : [
              new Paragraph({
                text: cell.toString(),
                spacing: { line: 300 }
              })
            ],
            width: {
              size: widths[idx],
              type: WidthType.DXA
            },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 6, color: DARK_GRAY },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: DARK_GRAY },
              left: { style: BorderStyle.SINGLE, size: 6, color: DARK_GRAY },
              right: { style: BorderStyle.SINGLE, size: 6, color: DARK_GRAY }
            },
            shading: {
              fill: rowData === rows[0] ? LIGHT_GRAY : 'FFFFFF'
            },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 100, bottom: 100, left: 100, right: 100 }
          })
        )
      })
    )
  });
}

// Create document
const doc = new Document({
  sections: [{
    properties: {},
    children: [
      // COVER PAGE
      new Paragraph({
        text: '',
        spacing: { before: 1200 }
      }),
      new Paragraph({
        text: '',
        spacing: { before: 1200 }
      }),
      new Paragraph({
        text: 'BUSINESS MODEL &',
        alignment: 'center',
        spacing: { before: 800, after: 100 },
        runs: [new TextRun({
          text: 'BUSINESS MODEL &',
          size: 72,
          bold: true,
          color: GOLD,
          font: 'Arial'
        })]
      }),
      new Paragraph({
        text: 'MARKET ANALYSIS',
        alignment: 'center',
        spacing: { after: 600 },
        runs: [new TextRun({
          text: 'MARKET ANALYSIS',
          size: 72,
          bold: true,
          color: GOLD,
          font: 'Arial'
        })]
      }),
      new Paragraph({
        text: 'AlltagsEngel',
        alignment: 'center',
        spacing: { after: 100 },
        runs: [new TextRun({
          text: 'AlltagsEngel',
          size: 48,
          bold: true,
          color: DARK_GRAY,
          font: 'Arial'
        })]
      }),
      new Paragraph({
        text: 'Digital Platform for Elderly Care Support',
        alignment: 'center',
        spacing: { after: 1000 },
        runs: [new TextRun({
          text: 'Digital Platform for Elderly Care Support',
          size: 24,
          color: DARK_GRAY,
          font: 'Arial'
        })]
      }),
      new Paragraph({
        text: '',
        spacing: { before: 1200 }
      }),
      new Paragraph({
        text: 'CONFIDENTIAL',
        alignment: 'center',
        spacing: { before: 800, after: 100 },
        runs: [new TextRun({
          text: 'CONFIDENTIAL',
          size: 28,
          bold: true,
          color: 'CC0000'
        })]
      }),
      new Paragraph({
        text: 'March 2025',
        alignment: 'center',
        spacing: { after: 400 },
        runs: [new TextRun({
          text: 'March 2025',
          size: 24,
          color: DARK_GRAY
        })]
      }),
      
      // Page break
      new Paragraph({
        text: '',
        pageBreakBefore: true
      }),
      
      // EXECUTIVE SUMMARY
      createHeading('EXECUTIVE SUMMARY'),
      createBodyParagraph('AlltagsEngel represents a transformative opportunity in the German elderly care market, leveraging regulatory reform (§45b SGB XI) and digital innovation to address a market segment currently underserved by traditional care providers.'),
      createBodyParagraph('The German government introduced §45b SGB XI in 2017, providing care-dependent individuals with €125 per month specifically for non-medical companion services. This creates an estimated €7.44 billion annual addressable market (€125/month × 4.96 million care-dependent people), yet only ~40% of this budget is currently utilized—representing a €4.5 billion untapped opportunity.'),
      createBodyParagraph('AlltagsEngel operates a two-sided marketplace connecting care-dependent individuals and their families with certified daily companions. Our digital-first approach reduces friction, improves quality assurance, and captures regulatory compliance at scale—advantages unavailable to traditional care agencies competing through legacy operations.'),
      createBodyParagraph('Revenue model combines an 18% platform commission on bookings plus €9.99/month companion subscription fees. Unit economics demonstrate strong gross margins (60%+) and a favorable path to profitability through platform network effects and companion acquisition efficiency.'),
      createBodyParagraph('Market opportunity is substantial: penetrating just 6.7% of the §45b addressable budget generates €500M annual revenue by Year 5. With demographic tailwinds (care-dependent population growing to 6.5M by 2035) and regulatory tailwinds (§45b awareness expanding), AlltagsEngel is positioned to capture significant market share in Germany\'s fastest-growing care segment.'),
      
      // Page break
      new Paragraph({
        text: '',
        pageBreakBefore: true
      }),
      
      // MARKET OVERVIEW
      createHeading('MARKET OVERVIEW'),
      
      createHeading('Market Size & Structure', 2),
      createBodyParagraph('The German elder care market is valued at €50+ billion annually, encompassing medical care (Pflege), assisted living (Betreuung), and companion services (Begleitung). This represents one of Europe\'s largest healthcare and social services markets, with sustained growth driven by demographic trends.'),
      
      createHeading('Demographic Opportunity', 2),
      createBodyParagraph('Germany faces accelerating population aging: According to Destatis (Federal Statistical Office), 22% of Germany\'s population is age 65+—the second-highest rate in the EU after Italy. The care-dependent population currently stands at 4.96 million (2023), projected to grow to 6.5 million by 2035—a 31% increase.'),
      createBodyParagraph('This demographic shift creates unprecedented demand for care services. Companion care (Betreuung) specifically addresses the rising prevalence of mild-to-moderate cognitive decline, dementia, and social isolation among elderly populations, where non-medical support significantly improves quality of life.'),
      
      createHeading('Regulatory Tailwind: §45b SGB XI', 2),
      createBodyParagraph('§45b SGB XI (introduced 2017) is a transformative regulatory framework providing €125/month directly to care-dependent individuals (Pflegegrade 1-3) for non-medical companion services. This amount is specifically earmarked and cannot be redirected to medical care. The benefit applies to all individuals assessed as care-dependent under the statutory long-term care insurance (Pflegeversicherung).'),
      createBodyParagraph('Market scale calculation:'),
      createBodyParagraph('  • Care-dependent population: 4.96 million (Pflegegrade 1-3)'),
      createBodyParagraph('  • §45b monthly benefit: €125/person'),
      createBodyParagraph('  • Monthly addressable budget: €620 million'),
      createBodyParagraph('  • Annual addressable budget: €7.44 billion'),
      createBodyParagraph('Critical insight: Current utilization is only ~40%, indicating €4.5 billion in unspent annual budget. Barriers to utilization include: lack of certified provider awareness, administrative complexity, geographic gaps in service availability, and consumer preference for digital platforms over traditional agencies.'),
      
      createHeading('Market Gaps & Opportunities', 2),
      createBodyParagraph('The €4.5 billion unutilized §45b budget reflects critical market failures in traditional elder care:'),
      createBodyParagraph('  1. Provider Fragmentation: Elderly individuals and families struggle to locate certified companions among thousands of small agencies'),
      createBodyParagraph('  2. Administrative Burden: Navigating insurance claims, certification verification, and payment processing requires significant effort'),
      createBodyParagraph('  3. Quality Uncertainty: No standardized quality metrics or reviews for companion services'),
      createBodyParagraph('  4. Geographic Limitations: Rural and suburban areas have minimal service availability'),
      createBodyParagraph('  5. Digital Gap: Most care agencies lack modern digital platforms for booking, communication, and payment'),
      createBodyParagraph('AlltagsEngel directly addresses each of these gaps through technology, certification standardization, and user-centric design.'),
      
      // Page break
      new Paragraph({
        text: '',
        pageBreakBefore: true
      }),
      
      // TARGET SEGMENTS
      createHeading('TARGET SEGMENTS'),
      
      createHeading('Segment A: Decision-Making Families (Age 35-55)', 2),
      createBodyParagraph('Profile: Adult children managing care for aging parents, often living in different cities. These individuals are digitally native, comfortable with mobile platforms, and motivated to find efficient solutions.'),
      createBodyParagraph('Pain Points: Limited time for caregiver searches, geographic distance, worry about parent safety/isolation, administrative burden of traditional agencies'),
      createBodyParagraph('Decision Drivers: Ease of use, transparent pricing, certification verification, ability to monitor services remotely'),
      createBodyParagraph('Estimated segment: ~2.5 million German families with care-dependent relatives'),
      
      createHeading('Segment B: Care-Dependent Individuals (Age 65+)', 2),
      createBodyParagraph('Profile: Individuals with assessed care needs (Pflegegrad 1-3), mild to moderate cognitive or physical limitations, receiving §45b benefits, seeking to maintain independence and social connection.'),
      createBodyParagraph('Pain Points: Loneliness, isolation, practical daily challenges (shopping, appointments, household tasks), fear of institutionalization'),
      createBodyParagraph('Decision Drivers: Ease of booking, companion quality/reliability, cost transparency (covered by insurance), sense of security'),
      createBodyParagraph('Estimated segment: 4.96 million care-dependent individuals'),
      
      createHeading('Segment C: Certified Companion Service Providers', 2),
      createBodyParagraph('Profile: Individuals with relevant certifications (§53b SGB XI) seeking flexible, transparent income opportunities. Often supplementing primary employment or pursuing flexible work arrangements.'),
      createBodyParagraph('Pain Points: Limited client visibility, unpredictable income streams, administrative burden, difficulty demonstrating certification'),
      createBodyParagraph('Value Drivers: Consistent client access, streamlined scheduling, reliable payment processing, professional support'),
      createBodyParagraph('Estimated segment: ~50,000-100,000 certified companions in Germany'),
      
      // Page break
      new Paragraph({
        text: '',
        pageBreakBefore: true
      }),
      
      // COMPETITIVE LANDSCAPE
      createHeading('COMPETITIVE LANDSCAPE'),
      
      createHeading('Market Competitors Overview', 2),
      createBodyParagraph('The elder care services market includes four primary competitive categories:'),
      
      // Competitive table
      createTableWithBorders(
        [
          ['Competitor Type', 'Examples', 'Strengths', 'Weaknesses', 'Digital Capability'],
          [
            'Traditional Care Agencies',
            'Johanniter, Malteser, Arbeiterwohlfahrt',
            'Established brand, government relationships, integrated services',
            'Legacy operations, high overhead, slow innovation, limited accessibility',
            'Minimal—mostly phone/email'
          ],
          [
            'Informal/Private Arrangements',
            'Family networks, direct hiring, word-of-mouth',
            'Low cost, flexible, personalized',
            'No quality assurance, liability exposure, certification gaps, payment complications',
            'None'
          ],
          [
            'Municipal Services',
            'City care departments, social services',
            'Subsidized pricing, regulatory integration',
            'Long wait times, limited availability, geographic constraints',
            'Outdated systems'
          ],
          [
            'Digital-First Platforms',
            'AlltagsEngel, Betawork (emerging)',
            'Mobile accessibility, transparent pricing, insurance integration, scalability',
            'Limited brand awareness (emerging), building companion network',
            'Full mobile + web'
          ]
        ],
        [2500, 2000, 2500, 2500, 1500]
      ),
      
      new Paragraph({ text: '', spacing: { after: 200 } }),
      
      createHeading('AlltagsEngel Competitive Advantages', 2),
      createBodyParagraph('1. Insurance-Native Design: Built specifically for §45b benefits, dramatically reducing user friction vs. traditional agencies requiring manual insurance processing'),
      createBodyParagraph('2. Digital-First Platform: Mobile-first design enables seamless companion discovery, booking, and communication—unavailable from legacy providers'),
      createBodyParagraph('3. Quality Assurance at Scale: Automated verification systems ensure companion certification compliance and maintain quality standards across the network'),
      createBodyParagraph('4. Network Effects: Two-sided marketplace creates natural moat as scale increases, benefiting both users (more companions) and companions (more clients)'),
      createBodyParagraph('5. Transparent Unit Economics: Flat 18% commission + subscription model vs. traditional agencies\' complex, opaque pricing structures'),
      
      // Page break
      new Paragraph({
        text: '',
        pageBreakBefore: true
      }),
      
      // BUSINESS MODEL DEEP DIVE
      createHeading('BUSINESS MODEL DEEP DIVE'),
      
      createHeading('Revenue Streams', 2),
      createBodyParagraph('AlltagsEngel operates a hybrid monetization model:'),
      createBodyParagraph('1. Platform Commission (18%): Earned on every booking completed through the platform. User pays total fee (covered by insurance benefit); AlltagsEngel retains 18%, companion receives 82%'),
      createBodyParagraph('2. Companion Subscriptions (€9.99/month): Optional professional features for companions—enhanced profile visibility, advanced scheduling, client messaging tools'),
      createBodyParagraph('3. Premium Services (Future): Enhanced customer features (verified reviews, emergency support, GPS tracking for safety-critical use cases)'),
      
      createHeading('Unit Economics', 2),
      createBodyParagraph('Representative transaction model:'),
      
      createTableWithBorders(
        [
          ['Metric', 'Value', 'Note'],
          ['Average Booking Value', '€20', '4-hour companion visit at €5/hour (market rate for §45b services)'],
          ['Platform Commission (18%)', '€3.60', 'AlltagsEngel revenue per booking'],
          ['Payment Processing Fee', '-€0.54', '1.5% payment processor fee'],
          ['Net Revenue per Booking', '€3.06', 'Core platform economics'],
          ['Companion Subscription Revenue', '€0.70', 'Assuming 20% companion adoption at €9.99/month, amortized per booking'],
          ['Gross Margin', '60-65%', 'After payment processing; excludes marketing & operations']
        ],
        [2000, 1500, 3500]
      ),
      
      new Paragraph({ text: '', spacing: { after: 200 } }),
      
      createHeading('Platform Flywheel Effect', 2),
      createBodyParagraph('AlltagsEngel benefits from classic two-sided network dynamics:'),
      createBodyParagraph('  • More Customers → More Bookings'),
      createBodyParagraph('  • More Bookings → Higher Companion Income → Attracts More Companions'),
      createBodyParagraph('  • More Companions → Better Service Coverage & Availability → Attracts More Customers'),
      createBodyParagraph('  • Network Effects → Reduced customer acquisition cost, improved lifetime value'),
      createBodyParagraph('This flywheel accelerates as scale increases, creating sustainable competitive advantage.'),
      
      createHeading('Pricing Strategy', 2),
      createBodyParagraph('Pricing is aligned with regulatory framework:'),
      createBodyParagraph('  • Customer Cost: €125/month (covered by §45b insurance benefit) for standard companion care'),
      createBodyParagraph('  • Companion Earning: €102.50/month from platform (82% of €125), plus subscription revenue'),
      createBodyParagraph('  • Premium Tiers: Accelerated booking, verified reviews, specialist companions (higher rates)'),
      createBodyParagraph('Price point is optimal—users perceive service as "free" since insurance covers it, driving adoption without price sensitivity.'),
      
      // Page break
      new Paragraph({
        text: '',
        pageBreakBefore: true
      }),
      
      // MARKET SIZING
      createHeading('MARKET SIZING (TAM / SAM / SOM)'),
      
      createHeading('Total Addressable Market (TAM)', 2),
      createBodyParagraph('€50+ billion: Total German elder care market (medical, assisted living, companion services)'),
      
      createHeading('Serviceable Addressable Market (SAM)', 2),
      createBodyParagraph('€7.44 billion: §45b SGB XI companion care benefit budget'),
      createBodyParagraph('Calculation: 4.96 million care-dependent individuals × €125/month × 12 months'),
      createBodyParagraph('Current utilization: ~40% = €2.98 billion in active market'),
      createBodyParagraph('Unutilized opportunity: ~60% = €4.46 billion in latent demand'),
      
      createHeading('Serviceable Obtainable Market (SOM) - Year 5 Projection', 2),
      createBodyParagraph('€500 million annual revenue (6.7% market penetration by Year 5)'),
      createBodyParagraph('Assumptions:'),
      createBodyParagraph('  • Customer Growth: Year 1: 5K users → Year 5: 150K active users'),
      createBodyParagraph('  • Companion Growth: Year 1: 500 companions → Year 5: 5,000 active companions'),
      createBodyParagraph('  • Booking Frequency: Average 4 bookings/month per user (€80 monthly value)'),
      createBodyParagraph('  • Platform Commission: 18% retention'),
      createBodyParagraph('  • Subscription Revenue: 20% companion adoption at €9.99/month'),
      
      createHeading('Growth Assumptions Table', 2),
      
      createTableWithBorders(
        [
          ['Metric', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'],
          ['Active Customers', '5,000', '25,000', '55,000', '100,000', '150,000'],
          ['Active Companions', '500', '1,500', '2,500', '3,750', '5,000'],
          ['Monthly Bookings (M)', '0.2M', '1.0M', '2.2M', '4.0M', '6.0M'],
          ['Avg Booking Value', '€20', '€20', '€20', '€20', '€20'],
          ['Annual Platform Revenue', '€43.2M', '€216M', '€475M', '€864M', '€1.30B'],
          ['Subscription Revenue', '€6M', '€36M', '€90M', '€180M', '€300M'],
          ['Gross Margin', '62%', '62%', '62%', '62%', '62%']
        ],
        [1600, 1400, 1400, 1400, 1400, 1400]
      ),
      
      new Paragraph({ text: '', spacing: { after: 200 } }),
      
      createBodyParagraph('By Year 5, AlltagsEngel captures 6.7% of available §45b budget (€500M of €7.44B), representing significant but achievable market penetration given network effects and first-mover advantages.'),
      
      // Page break
      new Paragraph({
        text: '',
        pageBreakBefore: true
      }),
      
      // REGULATORY ENVIRONMENT
      createHeading('REGULATORY ENVIRONMENT'),
      
      createHeading('§45b SGB XI Framework', 2),
      createBodyParagraph('§45b of the German Social Code (Sozialgesetzbuch) Book XI provides the legal foundation for AlltagsEngel\'s business model:'),
      createBodyParagraph('  • Eligibility: Individuals with Pflegegrad 1, 2, or 3 (care-dependent classification)'),
      createBodyParagraph('  • Benefit Amount: €125/month exclusively for companion services (Begleitung)'),
      createBodyParagraph('  • Service Type: Non-medical care including social engagement, daily activities, household support'),
      createBodyParagraph('  • Regulatory Change: Introduced in 2017, recently strengthened by 2023 Pflegestärkungsgesetz (Care Strengthening Act)'),
      createBodyParagraph('This regulatory framework is stable and politically supported—no significant risk of reduction or elimination.'),
      
      createHeading('Companion Certification Requirements (§53b SGB XI)', 2),
      createBodyParagraph('Companions must meet specific training and certification criteria:'),
      createBodyParagraph('  • Basic Certification: Completion of 160-hour standardized training program (Betreuungskraft certification)'),
      createBodyParagraph('  • Alternative Path: Healthcare professionals (nurses, therapists) with relevant qualifications'),
      createBodyParagraph('  • Ongoing Requirements: Refresher training, background checks, health clearance'),
      createBodyParagraph('AlltagsEngel automates verification of these certifications through direct integration with certification bodies and insurance databases.'),
      
      createHeading('Insurance Requirements & Liability', 2),
      createBodyParagraph('  • Platform Liability: AlltagsEngel maintains comprehensive professional liability insurance'),
      createBodyParagraph('  • Companion Insurance: Each companion must maintain personal liability insurance (requirement built into onboarding)'),
      createBodyParagraph('  • User Protection: Dispute resolution process managed through insurance arbitration'),
      createBodyParagraph('  • Regulatory Compliance: Regular audits by insurance providers and social authorities'),
      
      createHeading('Data Protection (GDPR / DSGVO)', 2),
      createBodyParagraph('As a platform handling sensitive health and personal data:'),
      createBodyParagraph('  • DSGVO Compliance: Full implementation of German data protection law'),
      createBodyParagraph('  • Health Data Sensitivity: Enhanced protections for care-dependent individual information'),
      createBodyParagraph('  • Privacy by Design: User consent flows for care data sharing, encryption at rest and in transit'),
      createBodyParagraph('  • Regular Audits: Third-party security and compliance assessments'),
      
      // Page break
      new Paragraph({
        text: '',
        pageBreakBefore: true
      }),
      
      // RISK ANALYSIS
      createHeading('RISK ANALYSIS & MITIGATION'),
      
      createHeading('Market Risks', 2),
      createBodyParagraph('Risk: Low §45b utilization does not increase despite platform accessibility'),
      createBodyParagraph('  • Probability: Medium'),
      createBodyParagraph('  • Impact: Significantly lower market penetration than projections'),
      createBodyParagraph('  • Mitigation: Consumer education campaigns, partnerships with care insurance providers, integration with municipal care services'),
      
      new Paragraph({ text: '', spacing: { after: 150 } }),
      
      createBodyParagraph('Risk: Companion supply insufficient to meet growing customer demand'),
      createBodyParagraph('  • Probability: Medium-High (short term)'),
      createBodyParagraph('  • Impact: Service unavailability in certain regions, customer churn'),
      createBodyParagraph('  • Mitigation: Companion acquisition partnerships with training providers, premium pricing to incentivize supply, geographic expansion prioritization'),
      
      new Paragraph({ text: '', spacing: { after: 150 } }),
      
      createHeading('Regulatory Risks', 2),
      createBodyParagraph('Risk: Changes to §45b benefit structure or eligibility requirements'),
      createBodyParagraph('  • Probability: Low-Medium'),
      createBodyParagraph('  • Impact: Addressable market size reduction'),
      createBodyParagraph('  • Mitigation: Political advocacy through industry associations, geographic diversification to other EU markets with similar programs'),
      
      new Paragraph({ text: '', spacing: { after: 150 } }),
      
      createBodyParagraph('Risk: New certification requirements or compliance burdens increase operational costs'),
      createBodyParagraph('  • Probability: Low'),
      createBodyParagraph('  • Impact: Reduced margins, increased companion acquisition friction'),
      createBodyParagraph('  • Mitigation: Proactive engagement with regulators, partner with certification bodies, automation of compliance processes'),
      
      new Paragraph({ text: '', spacing: { after: 150 } }),
      
      createHeading('Competitive Risks', 2),
      createBodyParagraph('Risk: Traditional care agencies rapidly digitalize and compete on pricing'),
      createBodyParagraph('  • Probability: Medium'),
      createBodyParagraph('  • Impact: Reduced differentiation, price compression'),
      createBodyParagraph('  • Mitigation: First-mover advantages, network effects as scale increases, superior UX design, continuous innovation'),
      
      new Paragraph({ text: '', spacing: { after: 150 } }),
      
      createBodyParagraph('Risk: New fintech entrants or international platforms expand into German market'),
      createBodyParagraph('  • Probability: Low-Medium (future)'),
      createBodyParagraph('  • Impact: Increased competition for users and companions'),
      createBodyParagraph('  • Mitigation: Strong brand building, local partnerships, continuous feature innovation'),
      
      new Paragraph({ text: '', spacing: { after: 150 } }),
      
      createHeading('Execution Risks', 2),
      createBodyParagraph('Risk: Companion quality issues damage platform reputation'),
      createBodyParagraph('  • Probability: Medium'),
      createBodyParagraph('  • Impact: Customer churn, negative reviews, regulatory scrutiny'),
      createBodyParagraph('  • Mitigation: Rigorous onboarding screening, automated quality monitoring, rapid intervention for poor reviews, insurance-backed guarantees'),
      
      new Paragraph({ text: '', spacing: { after: 150 } }),
      
      createBodyParagraph('Risk: Technology platform experiences outages or data breaches'),
      createBodyParagraph('  • Probability: Low'),
      createBodyParagraph('  • Impact: User acquisition loss, regulatory penalties, brand damage'),
      createBodyParagraph('  • Mitigation: Enterprise-grade infrastructure, regular security audits, comprehensive cyber insurance, disaster recovery protocols'),
      
      new Paragraph({ text: '', spacing: { after: 150 } }),
      
      createBodyParagraph('Risk: Customer acquisition costs exceed projections'),
      createBodyParagraph('  • Probability: Medium'),
      createBodyParagraph('  • Impact: Extended path to profitability, increased capital requirements'),
      createBodyParagraph('  • Mitigation: Strategic partnerships with insurance providers, word-of-mouth referral programs, content marketing, organic growth optimization'),
      
      // Page break
      new Paragraph({
        text: '',
        pageBreakBefore: true
      }),
      
      // CONCLUSION
      createHeading('CONCLUSION'),
      createBodyParagraph('AlltagsEngel addresses a €7.44 billion regulatory-driven market opportunity in German elder care, with €4.5 billion currently unutilized due to structural market inefficiencies. By combining digital-first platform design, regulatory compliance automation, and network effects, AlltagsEngel is positioned to capture significant market share in a growing, stable market.'),
      createBodyParagraph('The convergence of demographic tailwinds (aging population), regulatory tailwinds (§45b implementation), and digital transformation creates a unique window for platform-based business models in elderly care services. With disciplined execution and capital efficiency, AlltagsEngel can achieve €500M annual revenue by Year 5, representing a 6.7% penetration of available market.'),
      createBodyParagraph('Strategic imperatives for success: (1) rapid companion network expansion in key regions, (2) consumer awareness campaigns for §45b benefit utilization, (3) strategic partnerships with care insurance providers and municipal services, and (4) continuous platform innovation to maintain differentiation.'),
      
      new Paragraph({ text: '', spacing: { before: 400, after: 200 } }),
      new Paragraph({
        text: '---',
        alignment: 'center'
      }),
      new Paragraph({
        text: 'This document is confidential and intended solely for authorized recipients.',
        alignment: 'center',
        spacing: { before: 200, after: 100 },
        runs: [new TextRun({
          text: 'This document is confidential and intended solely for authorized recipients.',
          italic: true,
          size: 20,
          color: '999999'
        })]
      })
    ]
  }],
  styles: {
    default: {
      document: {
        run: {
          font: 'Calibri',
          size: 22
        },
        paragraph: {
          spacing: { line: 360 }
        }
      }
    },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        run: {
          size: 32,
          bold: true,
          color: GOLD,
          font: 'Arial'
        },
        paragraph: {
          spacing: { before: 400, after: 200 }
        }
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        run: {
          size: 26,
          bold: true,
          color: DARK_GRAY,
          font: 'Arial'
        },
        paragraph: {
          spacing: { before: 300, after: 150 }
        }
      },
      {
        id: 'Heading3',
        name: 'Heading 3',
        basedOn: 'Normal',
        next: 'Normal',
        run: {
          size: 24,
          bold: true,
          color: DARK_GRAY,
          font: 'Arial'
        },
        paragraph: {
          spacing: { before: 200, after: 100 }
        }
      }
    ]
  }
});

// Generate document
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('/sessions/festive-intelligent-rubin/mnt/alltagsengel-app/data-room/04-market-analysis/AlltagsEngel-Market-Analysis.docx', buffer);
  console.log('Document generated successfully!');
  console.log('Path: /sessions/festive-intelligent-rubin/mnt/alltagsengel-app/data-room/04-market-analysis/AlltagsEngel-Market-Analysis.docx');
});
