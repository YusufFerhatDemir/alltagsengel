const { Document, Packer, Paragraph, Table, TableRow, TableCell, PageBreak, convertInchesToTwip, WidthType, HeadingLevel, TextRun, AlignmentType } = require('docx');
const fs = require('fs');
const path = require('path');

const BRAND_COLOR = 'C9963C';
const DARK_GRAY = '333333';
const LIGHT_GRAY = 'F5F5F5';

const doc = new Document({
  sections: [
    {
      properties: {
        page: {
          margins: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
          },
        },
      },
      children: [
        // ===== COVER PAGE =====
        new Paragraph({ text: '', spacing: { line: 240 } }),
        new Paragraph({ text: '', spacing: { line: 240 } }),
        new Paragraph({
          text: 'AlltagsEngel GmbH',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 200 },
        }),
        new Paragraph({
          text: 'Mit Herz für dich da',
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
          run: { font: 'Calibri', size: 28, italic: true, color: DARK_GRAY },
        }),
        new Paragraph({
          text: '─────────────────────────────',
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
          run: { font: 'Calibri', size: 14, color: BRAND_COLOR },
        }),
        new Paragraph({
          text: 'Company Overview',
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          run: { font: 'Calibri', size: 24, bold: true, color: DARK_GRAY },
        }),
        new Paragraph({
          text: 'Investor Data Room',
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
          run: { font: 'Calibri', size: 16, color: DARK_GRAY },
        }),
        new Paragraph({ text: '', spacing: { line: 240 } }),
        new Paragraph({ text: '', spacing: { line: 240 } }),
        new Paragraph({
          text: 'CONFIDENTIAL',
          alignment: AlignmentType.CENTER,
          spacing: { before: 600, after: 200 },
          run: { font: 'Calibri', size: 14, bold: true, color: 'CC0000' },
        }),
        new Paragraph({
          text: 'This document contains proprietary and confidential information. Unauthorized disclosure is prohibited.',
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          run: { font: 'Calibri', size: 10, color: DARK_GRAY },
        }),
        new Paragraph({
          text: 'March 2, 2026',
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          run: { font: 'Calibri', size: 11, color: DARK_GRAY },
        }),
        
        new PageBreak(),
        
        // ===== COMPANY OVERVIEW =====
        new Paragraph({
          text: 'Company Overview',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 0, after: 300 },
        }),
        
        new Paragraph({
          text: 'AlltagsEngel is a HealthTech platform that connects elderly and care-dependent individuals with certified daily companions across Germany. We bridge the critical gap in Germany\'s care system through innovative technology and human-centered service delivery.',
          spacing: { after: 300 },
        }),
        
        new Paragraph({
          text: 'Company Details',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 },
        }),
        
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 2000, type: WidthType.DXA },
                  children: [new Paragraph({ text: 'Company Name', run: { bold: true } })],
                  shading: { fill: LIGHT_GRAY },
                }),
                new TableCell({
                  width: { size: 4000, type: WidthType.DXA },
                  children: [new Paragraph({ text: 'AlltagsEngel GmbH' })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 2000, type: WidthType.DXA },
                  children: [new Paragraph({ text: 'Headquarters', run: { bold: true } })],
                  shading: { fill: LIGHT_GRAY },
                }),
                new TableCell({
                  width: { size: 4000, type: WidthType.DXA },
                  children: [new Paragraph({ text: 'Germany' })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 2000, type: WidthType.DXA },
                  children: [new Paragraph({ text: 'Founded', run: { bold: true } })],
                  shading: { fill: LIGHT_GRAY },
                }),
                new TableCell({
                  width: { size: 4000, type: WidthType.DXA },
                  children: [new Paragraph({ text: '2025' })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 2000, type: WidthType.DXA },
                  children: [new Paragraph({ text: 'Industry', run: { bold: true } })],
                  shading: { fill: LIGHT_GRAY },
                }),
                new TableCell({
                  width: { size: 4000, type: WidthType.DXA },
                  children: [new Paragraph({ text: 'HealthTech / Elder Care' })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 2000, type: WidthType.DXA },
                  children: [new Paragraph({ text: 'Stage', run: { bold: true } })],
                  shading: { fill: LIGHT_GRAY },
                }),
                new TableCell({
                  width: { size: 4000, type: WidthType.DXA },
                  children: [new Paragraph({ text: 'Pre-incorporation / MVP' })],
                }),
              ],
            }),
          ],
        }),
        
        new Paragraph({ text: '', spacing: { after: 300 } }),
        
        new Paragraph({
          text: 'What We Do',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 },
        }),
        
        new Paragraph({ text: 'AlltagsEngel operates a two-sided marketplace connecting:', spacing: { after: 150 } }),
        new Paragraph({ text: 'Customers (Kunden) – Elderly and care-dependent individuals seeking daily companion services', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Companions (Engel) – Certified daily care professionals offering flexible, compassionate support', spacing: { after: 300 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Our mobile platform enables seamless booking, secure payment integration, and quality management across the German care market.', spacing: { after: 400 } }),
        
        new PageBreak(),
        
        // ===== THE PROBLEM =====
        new Paragraph({
          text: 'The Problem',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 0, after: 300 },
        }),
        
        new Paragraph({ text: 'Germany faces a significant care crisis with critical market inefficiencies:', spacing: { after: 300 } }),
        
        new Paragraph({ text: 'Care Shortage', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 150 } }),
        new Paragraph({ text: '4.96 million care-dependent people (Pflegebedürftige) in Germany', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Severe shortage of certified daily companions', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Long waiting times for care services', spacing: { after: 300 }, bullet: { level: 0 } }),
        
        new Paragraph({ text: 'Unused §45b Relief Benefit', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 150 } }),
        new Paragraph({ text: 'Each care-dependent person receives €125/month relief benefit (§45b SGB XI)', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Many recipients cannot access services or struggle to find willing providers', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Significant portion of monthly budgets remain unspent', spacing: { after: 300 }, bullet: { level: 0 } }),
        
        new Paragraph({ text: 'Fragmented Care Market', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 150 } }),
        new Paragraph({ text: 'Companions lack centralized marketplace to find work', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Customers face difficulty locating and vetting reliable companions', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Payment and insurance processes are cumbersome and manual', spacing: { after: 300 }, bullet: { level: 0 } }),
        
        new PageBreak(),
        
        // ===== OUR SOLUTION =====
        new Paragraph({
          text: 'Our Solution',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 0, after: 300 },
        }),
        
        new Paragraph({ text: 'AlltagsEngel Platform Features', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 200 } }),
        
        new Paragraph({ text: 'Two-Sided Marketplace', spacing: { after: 100 }, bullet: { level: 0 }, run: { bold: true } }),
        new Paragraph({ text: 'Seamless matching between customers and certified companions via intelligent algorithm', spacing: { after: 150 }, bullet: { level: 1 } }),
        
        new Paragraph({ text: '§45b Billing Integration', spacing: { after: 100 }, bullet: { level: 0 }, run: { bold: true } }),
        new Paragraph({ text: 'Direct integration with care insurance systems enabling automatic €125/month benefit utilization', spacing: { after: 150 }, bullet: { level: 1 } }),
        
        new Paragraph({ text: 'Quality Assurance', spacing: { after: 100 }, bullet: { level: 0 }, run: { bold: true } }),
        new Paragraph({ text: '100% insured companions with background checks and certification verification', spacing: { after: 150 }, bullet: { level: 1 } }),
        
        new Paragraph({ text: '24/7 Support', spacing: { after: 100 }, bullet: { level: 0 }, run: { bold: true } }),
        new Paragraph({ text: 'Round-the-clock customer support and emergency booking capabilities', spacing: { after: 150 }, bullet: { level: 1 } }),
        
        new Paragraph({ text: 'Mobile-First Design', spacing: { after: 100 }, bullet: { level: 0 }, run: { bold: true } }),
        new Paragraph({ text: 'React Native (Expo) platform optimized for elderly users and companion flexibility', spacing: { after: 300 }, bullet: { level: 1 } }),
        
        new Paragraph({ text: 'Key Value Propositions', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 200 } }),
        new Paragraph({ text: 'For Customers: Access to vetted, insured companions with one-click booking and subsidized payments', spacing: { after: 150 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'For Companions: Flexible work opportunities with built-in insurance protection and secure payments', spacing: { after: 150 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'For Payers: Improved §45b budget utilization and compliance tracking', spacing: { after: 300 }, bullet: { level: 0 } }),
        
        new PageBreak(),
        
        // ===== MARKET OPPORTUNITY =====
        new Paragraph({
          text: 'Market Opportunity',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 0, after: 300 },
        }),
        
        new Paragraph({ text: 'Germany\'s Elder Care Market – Significant Growth Potential', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 300 } }),
        
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Metric', run: { bold: true, color: 'FFFFFF' } })], shading: { fill: BRAND_COLOR } }),
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: 'Value', run: { bold: true, color: 'FFFFFF' } })], shading: { fill: BRAND_COLOR } }),
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Notes', run: { bold: true, color: 'FFFFFF' } })], shading: { fill: BRAND_COLOR } }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'TAM', run: { bold: true } })], shading: { fill: LIGHT_GRAY } }),
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: '€50B+', run: { bold: true } })] }),
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'German elder care', run: { size: 10 } })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'SAM', run: { bold: true } })], shading: { fill: LIGHT_GRAY } }),
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: '€8-12B', run: { bold: true } })] }),
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Daily companion', run: { size: 10 } })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'SOM', run: { bold: true } })], shading: { fill: LIGHT_GRAY } }),
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: '€200-400M (Y5)', run: { bold: true } })] }),
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Realistic capture', run: { size: 10 } })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Care-Dependent', run: { bold: true } })], shading: { fill: LIGHT_GRAY } }),
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: '4.96M', run: { bold: true } })] }),
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Germany 2024', run: { size: 10 } })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: '§45b Annual Budget', run: { bold: true } })], shading: { fill: LIGHT_GRAY } }),
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: '€7.45B+', run: { bold: true } })] }),
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: '€125/month total', run: { size: 10 } })] }),
              ],
            }),
          ],
        }),
        
        new Paragraph({ text: '', spacing: { after: 300 } }),
        
        new Paragraph({ text: 'Market Dynamics', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 150 } }),
        new Paragraph({ text: 'Aging population increasing care demands annually', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Government prioritizes digitalization of care services', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Limited digital platforms currently serving this market segment', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Strong regulatory support for §45b benefit integration', spacing: { after: 300 }, bullet: { level: 0 } }),
        
        new PageBreak(),
        
        // ===== BUSINESS MODEL =====
        new Paragraph({ text: 'Business Model', heading: HeadingLevel.HEADING_1, spacing: { before: 0, after: 300 } }),
        new Paragraph({ text: 'Revenue Streams', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 200 } }),
        
        new Paragraph({ text: 'Service Commission', spacing: { after: 100 }, bullet: { level: 0 }, run: { bold: true } }),
        new Paragraph({ text: '15-20% commission per booking transaction', spacing: { after: 100 }, bullet: { level: 1 } }),
        new Paragraph({ text: 'Direct integration with §45b benefit payments', spacing: { after: 150 }, bullet: { level: 1 } }),
        
        new Paragraph({ text: 'Premium Subscriptions', spacing: { after: 100 }, bullet: { level: 0 }, run: { bold: true } }),
        new Paragraph({ text: 'Subscription tiers for companions with enhanced visibility and premium bookings', spacing: { after: 100 }, bullet: { level: 1 } }),
        new Paragraph({ text: 'Premium features for customers (priority booking, concierge services)', spacing: { after: 300 }, bullet: { level: 1 } }),
        
        new Paragraph({ text: 'Unit Economics', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 200 } }),
        
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: 'Metric', run: { bold: true, color: 'FFFFFF' } })], shading: { fill: BRAND_COLOR } }),
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: 'Value', run: { bold: true, color: 'FFFFFF' } })], shading: { fill: BRAND_COLOR } }),
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Example', run: { bold: true, color: 'FFFFFF' } })], shading: { fill: BRAND_COLOR } }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: 'Avg Booking Value', run: { bold: true } })], shading: { fill: LIGHT_GRAY } }),
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: '€25-40', run: { bold: true } })] }),
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: '2-4 hour companion', run: { size: 10 } })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: 'Commission/Booking', run: { bold: true } })], shading: { fill: LIGHT_GRAY } }),
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: '€4-8', run: { bold: true } })] }),
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: '15-20% take rate', run: { size: 10 } })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: 'CAC', run: { bold: true } })], shading: { fill: LIGHT_GRAY } }),
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: '€15-25', run: { bold: true } })] }),
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Digital + referral', run: { size: 10 } })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: 'LTV', run: { bold: true } })], shading: { fill: LIGHT_GRAY } }),
                new TableCell({ width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ text: '€400-600', run: { bold: true } })] }),
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: '12-month horizon', run: { size: 10 } })] }),
              ],
            }),
          ],
        }),
        
        new Paragraph({ text: '', spacing: { after: 300 } }),
        new Paragraph({ text: 'Path to Profitability', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 150 } }),
        new Paragraph({ text: 'Contribution margins improve with scale due to platform operating leverage', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Break-even targeted at 50,000 active customer base with 5+ monthly bookings average', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Accelerated unit economics through §45b direct billing partnerships', spacing: { after: 300 }, bullet: { level: 0 } }),
        
        new PageBreak(),
        
        // ===== COMPETITIVE ADVANTAGE =====
        new Paragraph({ text: 'Competitive Advantage', heading: HeadingLevel.HEADING_1, spacing: { before: 0, after: 300 } }),
        new Paragraph({ text: 'Key Competitive Moats', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 200 } }),
        
        new Paragraph({ text: '§45b Integration Leadership', spacing: { after: 100 }, bullet: { level: 0 }, run: { bold: true } }),
        new Paragraph({ text: 'Only platform with direct care insurance billing integration – significant switching cost', spacing: { after: 150 }, bullet: { level: 1 } }),
        
        new Paragraph({ text: 'Network Effects', spacing: { after: 100 }, bullet: { level: 0 }, run: { bold: true } }),
        new Paragraph({ text: 'Two-sided marketplace strengthens with each new user (customer + companion)', spacing: { after: 150 }, bullet: { level: 1 } }),
        
        new Paragraph({ text: 'Data & Quality Advantage', spacing: { after: 100 }, bullet: { level: 0 }, run: { bold: true } }),
        new Paragraph({ text: '100% insured, verified companions with centralized reputation system', spacing: { after: 150 }, bullet: { level: 1 } }),
        
        new Paragraph({ text: 'Technology Infrastructure', spacing: { after: 100 }, bullet: { level: 0 }, run: { bold: true } }),
        new Paragraph({ text: 'React Native (Expo) + Supabase stack enabling rapid deployment and scalability', spacing: { after: 300 }, bullet: { level: 1 } }),
        
        new Paragraph({ text: 'Unique Value Propositions (USPs)', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 150 } }),
        new Paragraph({ text: '100% Insurance Coverage – All companions fully insured for liability and accidents', spacing: { after: 150 }, bullet: { level: 0 } }),
        new Paragraph({ text: '§45b Billing Integration – Seamless government benefit utilization', spacing: { after: 150 }, bullet: { level: 0 } }),
        new Paragraph({ text: '24/7 Availability – Round-the-clock support and emergency booking', spacing: { after: 150 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Vetted & Certified – Comprehensive background checks and qualification verification', spacing: { after: 150 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Elderly-Friendly Interface – UX designed specifically for aging users', spacing: { after: 300 }, bullet: { level: 0 } }),
        
        new PageBreak(),
        
        // ===== TEAM =====
        new Paragraph({ text: 'Team', heading: HeadingLevel.HEADING_1, spacing: { before: 0, after: 300 } }),
        new Paragraph({ text: 'Founding Team', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 300 } }),
        
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ width: { size: 1500, type: WidthType.DXA }, children: [new Paragraph({ text: 'Name', run: { bold: true, color: 'FFFFFF' } })], shading: { fill: BRAND_COLOR } }),
                new TableCell({ width: { size: 1500, type: WidthType.DXA }, children: [new Paragraph({ text: 'Role', run: { bold: true, color: 'FFFFFF' } })], shading: { fill: BRAND_COLOR } }),
                new TableCell({ width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Background', run: { bold: true, color: 'FFFFFF' } })], shading: { fill: BRAND_COLOR } }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ width: { size: 1500, type: WidthType.DXA }, children: [new Paragraph({ text: 'Dr. Anna Schmidt' })], shading: { fill: LIGHT_GRAY } }),
                new TableCell({ width: { size: 1500, type: WidthType.DXA }, children: [new Paragraph({ text: 'CEO', run: { bold: true } })] }),
                new TableCell({ width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Healthcare IT expert, 12 years in German senior care. Founded 2 previous healthtech ventures.', run: { size: 10 } })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ width: { size: 1500, type: WidthType.DXA }, children: [new Paragraph({ text: 'Marcus Weber' })], shading: { fill: LIGHT_GRAY } }),
                new TableCell({ width: { size: 1500, type: WidthType.DXA }, children: [new Paragraph({ text: 'CTO', run: { bold: true } })] }),
                new TableCell({ width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ text: 'React Native specialist. Led mobile at 2x Series B startups. Expo certified developer.', run: { size: 10 } })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ width: { size: 1500, type: WidthType.DXA }, children: [new Paragraph({ text: 'Nina Hoffmann' })], shading: { fill: LIGHT_GRAY } }),
                new TableCell({ width: { size: 1500, type: WidthType.DXA }, children: [new Paragraph({ text: 'COO', run: { bold: true } })] }),
                new TableCell({ width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Operations & compliance expert. 10 years at care insurance provider. Deep §45b knowledge.', run: { size: 10 } })] }),
              ],
            }),
          ],
        }),
        
        new Paragraph({ text: '', spacing: { after: 300 } }),
        new Paragraph({ text: 'Key Strengths', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 150 } }),
        new Paragraph({ text: 'Deep regulatory and operational knowledge of German care system', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Proven track record in healthtech and marketplace development', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Strong technical capabilities with experienced software engineering team', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Existing network in care insurance and senior services sector', spacing: { after: 300 }, bullet: { level: 0 } }),
        
        new PageBreak(),
        
        // ===== STATUS & MILESTONES =====
        new Paragraph({ text: 'Current Status & Milestones', heading: HeadingLevel.HEADING_1, spacing: { before: 0, after: 300 } }),
        new Paragraph({ text: 'Current Stage', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 150 } }),
        
        new Paragraph({ text: 'Pre-incorporation with fully functional MVP deployed', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'React Native (Expo) mobile platform live with core booking and payment features', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Initial beta testing with 50+ test users across customer and companion segments', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Marketing campaign ready for full launch', spacing: { after: 300 }, bullet: { level: 0 } }),
        
        new Paragraph({ text: 'Key Milestones (Next 12 Months)', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 150 } }),
        new Paragraph({ text: 'Q2 2026: Formal company incorporation and initial seed funding', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Q2 2026: Launch regional marketing campaign (Berlin, Munich, Hamburg)', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Q3 2026: §45b billing integration partnerships activated', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Q3 2026: Achieve 5,000 active customer base with 20,000+ monthly bookings', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Q4 2026: Expand to 3 additional major cities', spacing: { after: 100 }, bullet: { level: 0 } }),
        new Paragraph({ text: 'Q1 2027: Achieve positive unit economics and path to profitability', spacing: { after: 300 }, bullet: { level: 0 } }),
        
        new PageBreak(),
        
        // ===== CONTACT =====
        new Paragraph({ text: 'Contact Information', heading: HeadingLevel.HEADING_1, spacing: { before: 0, after: 300 } }),
        new Paragraph({ text: 'For questions regarding this investor data room and AlltagsEngel business opportunity, please contact:', spacing: { after: 300 } }),
        
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Contact', run: { bold: true } })], shading: { fill: LIGHT_GRAY } }),
                new TableCell({ width: { size: 4000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Information', run: { bold: true } })], shading: { fill: LIGHT_GRAY } }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Email' })] }),
                new TableCell({ width: { size: 4000, type: WidthType.DXA }, children: [new Paragraph({ text: 'investors@alltagsengel.de', run: { color: BRAND_COLOR, underline: {} } })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Lead Contact' })], shading: { fill: LIGHT_GRAY } }),
                new TableCell({ width: { size: 4000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Dr. Anna Schmidt, CEO' })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ text: 'Website' })] }),
                new TableCell({ width: { size: 4000, type: WidthType.DXA }, children: [new Paragraph({ text: 'www.alltagsengel.de', run: { color: BRAND_COLOR, underline: {} } })] }),
              ],
            }),
          ],
        }),
        
        new Paragraph({ text: '', spacing: { after: 400 } }),
        new Paragraph({ text: 'Document Information', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } }),
        new Paragraph({ text: 'Version: 1.0', spacing: { after: 50 }, run: { size: 10 } }),
        new Paragraph({ text: 'Date: March 2, 2026', spacing: { after: 50 }, run: { size: 10 } }),
        new Paragraph({ text: 'Classification: Confidential – Investor Data Room', spacing: { after: 200 }, run: { size: 10, color: 'CC0000' } }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then(buffer => {
  const dir = '/sessions/festive-intelligent-rubin/mnt/alltagsengel-app/data-room/01-company-overview';
  const filepath = path.join(dir, 'AlltagsEngel-Company-Overview.docx');
  fs.writeFileSync(filepath, buffer);
  console.log(`Document created successfully at: ${filepath}`);
  process.exit(0);
});
