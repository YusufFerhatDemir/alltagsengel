const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, AlignmentType, BorderStyle, WidthType } = require('docx');

// Gold color for headers
const GOLD = 'C9963C';

function createDocument() {
  // Helper function for gold header
  function goldHeader(text, level = 1) {
    const fontSize = level === 1 ? 28 : level === 2 ? 22 : 16;
    const spacing = level === 1 ? { before: 240, after: 120 } : { before: 200, after: 100 };
    
    return new Paragraph({
      text: text,
      heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
      spacing: spacing,
      border: level === 1 ? {
        bottom: {
          color: GOLD,
          space: 1,
          style: BorderStyle.SINGLE,
          size: 12
        }
      } : {},
      children: [new TextRun({
        text: text,
        color: GOLD,
        bold: true,
        size: fontSize * 2
      })]
    });
  }

  function regularText(text, isBold = false, isItalic = false) {
    return new Paragraph({
      text: text,
      spacing: { after: 100 },
      children: [new TextRun({
        text: text,
        bold: isBold,
        italic: isItalic,
        size: 22
      })]
    });
  }

  function bulletPoint(text) {
    return new Paragraph({
      text: text,
      bullet: {
        level: 0
      },
      spacing: { after: 80 },
      children: [new TextRun({
        text: text,
        size: 22
      })]
    });
  }

  const sections = [];

  // Cover page section
  sections.push({
    children: [
      new Paragraph({
        text: '',
        spacing: { after: 400 }
      }),
      new Paragraph({
        text: '',
        spacing: { after: 400 }
      }),
      new Paragraph({
        text: '',
        spacing: { after: 400 }
      }),
      new Paragraph({
        text: 'LEGAL & COMPLIANCE SUMMARY',
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new TextRun({
          text: 'LEGAL & COMPLIANCE SUMMARY',
          color: GOLD,
          bold: true,
          size: 56
        })]
      }),
      new Paragraph({
        text: '',
        spacing: { after: 200 }
      }),
      new Paragraph({
        text: 'AlltagsEngel',
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new TextRun({
          text: 'AlltagsEngel',
          color: GOLD,
          bold: true,
          size: 40
        })]
      }),
      new Paragraph({
        text: '',
        spacing: { after: 300 }
      }),
      new Paragraph({
        text: 'Mobile Platform for Elderly Care Companionship',
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({
          text: 'Mobile Platform for Elderly Care Companionship',
          size: 24
        })]
      }),
      new Paragraph({
        text: '',
        spacing: { after: 500 }
      }),
      new Paragraph({
        text: 'CONFIDENTIAL',
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new TextRun({
          text: 'CONFIDENTIAL',
          bold: true,
          color: GOLD,
          size: 24
        })]
      }),
      new Paragraph({
        text: '',
        spacing: { after: 400 }
      }),
      new Paragraph({
        text: 'March 2025',
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new TextRun({
          text: 'March 2025',
          size: 22
        })]
      })
    ]
  });

  // Table of Contents
  sections.push({
    children: [
      new Paragraph({
        text: '',
        pageBreakBefore: true,
        spacing: { after: 200 }
      }),
      goldHeader('TABLE OF CONTENTS', 2),
      bulletPoint('Corporate Structure'),
      bulletPoint('Regulatory Framework'),
      bulletPoint('Data Protection & Privacy'),
      bulletPoint('Insurance & Liability'),
      bulletPoint('Employment Law Considerations'),
      bulletPoint('Intellectual Property'),
      bulletPoint('Key Contracts & Agreements'),
      bulletPoint('Compliance Roadmap'),
      bulletPoint('Risk Mitigation')
    ]
  });

  // 1. Corporate Structure
  sections.push({
    children: [
      new Paragraph({
        text: '',
        pageBreakBefore: true,
        spacing: { after: 200 }
      }),
      goldHeader('1. CORPORATE STRUCTURE', 2),
      regularText('AlltagsEngel is structured as a German limited liability company, positioned to serve the growing elderly care companionship market in Germany.'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Company Formation', 3),
      bulletPoint('Legal Entity: AlltagsEngel UG (planned incorporation)'),
      bulletPoint('Registered Office: Germany (to be finalized upon incorporation)'),
      bulletPoint('Business Purpose: Provision of companion services for elderly care under German social care regulations'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Capital Structure', 3),
      bulletPoint('Share Capital: €25,000 (standard minimum for GmbH formation)'),
      bulletPoint('Founders: 3 co-founders (equity distribution pending finalization)'),
      bulletPoint('Share Register: To be maintained by registered office'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Governance', 3),
      bulletPoint('Management Board: To be appointed upon incorporation'),
      bulletPoint('Shareholder Meetings: To be held in accordance with German GmbH law (GmbHG)'),
      bulletPoint('Articles of Association: To be drafted and executed'),
      bulletPoint('Compliance Officer: To be appointed during growth phase')
    ]
  });

  // 2. Regulatory Framework
  sections.push({
    children: [
      new Paragraph({
        text: '',
        pageBreakBefore: true,
        spacing: { after: 200 }
      }),
      goldHeader('2. REGULATORY FRAMEWORK', 2),
      regularText('AlltagsEngel operates under a comprehensive regulatory framework governing elderly care services in Germany. The platform is designed to comply with federal and state-level regulations.'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('§45b SGB XI - Entlastungsleistungen (Relief Services)', 3),
      bulletPoint('Statutory Funding: €125 per month per care-dependent person for relief services'),
      bulletPoint('Service Provider Recognition: AlltagsEngel must obtain "Anerkennung" (formal recognition) from competent state authorities'),
      bulletPoint('Scope: Services must be approved activities under the social care code'),
      bulletPoint('Implementation Timeline: Recognition applications planned for pilot state prior to full market launch'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('§53b SGB XI - Companion Qualification Requirements', 3),
      bulletPoint('Minimum Training: All Alltagsbegleiter (companions) must meet certification requirements'),
      bulletPoint('Training Standards: Varies by state; typically includes 40+ hours in social care and communication'),
      bulletPoint('Verification Process: AlltagsEngel to implement certification verification system'),
      bulletPoint('Ongoing Compliance: Regular credential monitoring and renewal tracking'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Landesrecht (State-Level Regulations)', 3),
      bulletPoint('Jurisdictional Variation: Regulations vary significantly by Bundesland'),
      bulletPoint('State-Specific Approval: §45b recognition must be obtained from each state where services are offered'),
      bulletPoint('Regulatory Liaison: AlltagsEngel to establish relationships with state health and social authorities'),
      bulletPoint('Multi-State Roadmap: Phased expansion across federal states as approvals are secured')
    ]
  });

  // 3. Data Protection & Privacy
  sections.push({
    children: [
      new Paragraph({
        text: '',
        pageBreakBefore: true,
        spacing: { after: 200 }
      }),
      goldHeader('3. DATA PROTECTION & PRIVACY', 2),
      regularText('AlltagsEngel processes health and personal data requiring strict compliance with GDPR and German data protection laws (DSGVO).'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('GDPR/DSGVO Compliance Framework', 3),
      bulletPoint('Data Processing Agreements: Required for all third-party processors (cloud providers, analytics platforms)'),
      bulletPoint('Privacy by Design: Data protection principles integrated into all platform features'),
      bulletPoint('User Consent Management: Explicit consent collection and management system for data processing'),
      bulletPoint('Data Retention Policies: Clear retention schedules aligned with legal requirements and service needs'),
      bulletPoint('Right to Erasure: Technical and organizational measures to enable user data deletion ("right to be forgotten")'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Health Data Handling (Article 9 GDPR Special Category Data)', 3),
      bulletPoint('Heightened Protection: Health information classified as special category data requiring enhanced safeguards'),
      bulletPoint('Legitimate Basis: Service delivery under legal obligations (care-related information must be processed)'),
      bulletPoint('Access Controls: Strict role-based access for personnel handling health information'),
      bulletPoint('Encryption: Health data encrypted at rest and in transit'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Data Protection Impact Assessment (DPIA)', 3),
      bulletPoint('Planned Completion: Prior to full service launch'),
      bulletPoint('Scope: Assessment of high-risk processing activities (health data, location tracking if applicable)'),
      bulletPoint('Mitigation Measures: Documentation of controls to address identified risks'),
      bulletPoint('Regulatory Notification: Results available for competent data protection authorities upon request')
    ]
  });

  // 4. Insurance & Liability
  sections.push({
    children: [
      new Paragraph({
        text: '',
        pageBreakBefore: true,
        spacing: { after: 200 }
      }),
      goldHeader('4. INSURANCE & LIABILITY', 2),
      regularText('Comprehensive insurance coverage protects all stakeholders and manages liability risks inherent in elderly care services.'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Companion Liability Insurance (Haftpflichtversicherung)', 3),
      bulletPoint('Mandatory Coverage: All active companions required to maintain liability insurance'),
      bulletPoint('Provision by Platform: AlltagsEngel negotiating insurance framework covering all companions'),
      bulletPoint('Coverage Scope: Personal injury, property damage, and professional negligence claims'),
      bulletPoint('Minimum Limits: To be finalized during insurance negotiations (typical: €5-10 million per incident)'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Platform Liability Considerations', 3),
      bulletPoint('General Liability: Platform provider liability for platform-related incidents'),
      bulletPoint('Technology Liability: Coverage for system failures or data breaches'),
      bulletPoint('Professional Indemnity: Protection for business-related claims'),
      bulletPoint('Cyber Insurance: Coverage for data breach response and notification costs'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Professional Indemnity Coverage', 3),
      bulletPoint('Scope: Claims arising from advice or services provided through the platform'),
      bulletPoint('Premium Allocation: To be reviewed following service launch and incident history'),
      bulletPoint('Claims Management: Dedicated process for incident reporting and claims handling'),
      bulletPoint('Insurance Review Cycle: Annual assessment of coverage adequacy based on operational experience')
    ]
  });

  // 5. Employment Law Considerations
  sections.push({
    children: [
      new Paragraph({
        text: '',
        pageBreakBefore: true,
        spacing: { after: 200 }
      }),
      goldHeader('5. EMPLOYMENT LAW CONSIDERATIONS', 2),
      regularText('AlltagsEngel classifies companions as independent contractors rather than employees, subject to compliance with German labor law requirements.'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Independent Contractor Model', 3),
      bulletPoint('Legal Classification: Companions are self-employed service providers (Auftragnehmer)'),
      bulletPoint('Framework Agreements: Comprehensive terms of service establishing contractor relationship'),
      bulletPoint('Scheinselbständigkeit Avoidance: Structural safeguards ensuring genuine independent contractor status'),
      bulletPoint('Control Limitations: Platform provides tools but does not dictate working methods or schedules'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Criteria for Self-Employment Status', 3),
      bulletPoint('Service Delivery: Companions determine their own working hours and service delivery methods'),
      bulletPoint('Client Relationships: Companions build direct relationships with clients outside platform control'),
      bulletPoint('Income Generation: Companions compensated per service delivery with potential for multiple income sources'),
      bulletPoint('Risk Allocation: Companions bear business risks including liability insurance and tax obligations'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Social Security & Tax Implications', 3),
      bulletPoint('Self-Employment Registration: Each companion responsible for registering with tax authorities'),
      bulletPoint('Social Insurance: Companions must secure their own social insurance (via Krankenkasse or Berufsgenossenschaft)'),
      bulletPoint('Kleinunternehmerregelung: Companions earning below €22,500 annually may qualify for small business exemption'),
      bulletPoint('Tax Deductions: Companions entitled to deduct business expenses from income'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Platform Compliance Obligations', 3),
      bulletPoint('Contractor Verification: Documentation of self-employment status and qualifications'),
      bulletPoint('Payment Reporting: 1099-equivalent documentation (or German equivalent) for tax purposes'),
      bulletPoint('Insurance Verification: Confirmation of companion liability insurance before service activation'),
      bulletPoint('No Employee Benefits: Explicit exclusion of employment benefits (health insurance, vacation, pension)')
    ]
  });

  // 6. Intellectual Property
  sections.push({
    children: [
      new Paragraph({
        text: '',
        pageBreakBefore: true,
        spacing: { after: 200 }
      }),
      goldHeader('6. INTELLECTUAL PROPERTY', 2),
      regularText('AlltagsEngel protects its brand, technology, and intellectual property assets essential to business value.'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Trademark Protection', 3),
      bulletPoint('Mark: "AlltagsEngel"'),
      bulletPoint('Status: Registration planned with EUIPO (European Union Intellectual Property Office)'),
      bulletPoint('Scope: Technology, healthcare services, and related goods/services'),
      bulletPoint('Classes: International Classification system coverage for platform services'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Software & Codebase Ownership', 3),
      bulletPoint('Ownership: All software code exclusively owned by AlltagsEngel UG'),
      bulletPoint('Development Documentation: IP assignment agreements with all developers and contractors'),
      bulletPoint('Third-Party Libraries: Proper licensing compliance for open-source components'),
      bulletPoint('Security: Source code protected with appropriate access controls and confidentiality measures'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Brand Identity Assets', 3),
      bulletPoint('Logo & Design: Professional brand identity assets registered and protected'),
      bulletPoint('Usage Guidelines: Brand standards documented for consistent application'),
      bulletPoint('Marketing Materials: All marketing content subject to AlltagsEngel trademark and copyright'),
      bulletPoint('Partner Requirements: Partners required to comply with brand usage terms'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Domain Names & Digital Assets', 3),
      bulletPoint('Primary Domain: Secured and registered under company control'),
      bulletPoint('Subsidiary Domains: Reserved for market expansion and services'),
      bulletPoint('Social Media Accounts: Owned and controlled by AlltagsEngel'),
      bulletPoint('Content Rights: All platform content proprietary to company or properly licensed')
    ]
  });

  // 7. Key Contracts & Agreements
  sections.push({
    children: [
      new Paragraph({
        text: '',
        pageBreakBefore: true,
        spacing: { after: 200 }
      }),
      goldHeader('7. KEY CONTRACTS & AGREEMENTS', 2),
      regularText('The following contracts establish legal relationships and govern platform operations:'),
      new Paragraph({ text: '', spacing: { after: 200 } }),
      
      new Table({
        width: {
          size: 100,
          type: WidthType.PERCENTAGE
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({
                  text: 'Document',
                  children: [new TextRun({ text: 'Document', bold: true, color: GOLD, size: 22 })]
                })],
                width: { size: 25, type: WidthType.PERCENTAGE },
                shading: { fill: 'F0F0F0' }
              }),
              new TableCell({
                children: [new Paragraph({
                  text: 'Status',
                  children: [new TextRun({ text: 'Status', bold: true, color: GOLD, size: 22 })]
                })],
                width: { size: 20, type: WidthType.PERCENTAGE },
                shading: { fill: 'F0F0F0' }
              }),
              new TableCell({
                children: [new Paragraph({
                  text: 'Description',
                  children: [new TextRun({ text: 'Description', bold: true, color: GOLD, size: 22 })]
                })],
                width: { size: 55, type: WidthType.PERCENTAGE },
                shading: { fill: 'F0F0F0' }
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({
                  text: 'Terms of Service (User)',
                  children: [new TextRun({ text: 'Terms of Service (User)', size: 22 })]
                })],
                width: { size: 25, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({
                  text: 'Draft',
                  children: [new TextRun({ text: 'Draft', size: 22 })]
                })],
                width: { size: 20, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({
                  text: 'Defines terms of platform access for elderly users and family members',
                  children: [new TextRun({ text: 'Defines terms of platform access for elderly users and family members', size: 22 })]
                })],
                width: { size: 55, type: WidthType.PERCENTAGE }
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({
                  text: 'Terms of Service (Companion)',
                  children: [new TextRun({ text: 'Terms of Service (Companion)', size: 22 })]
                })],
                width: { size: 25, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({
                  text: 'Draft',
                  children: [new TextRun({ text: 'Draft', size: 22 })]
                })],
                width: { size: 20, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({
                  text: 'Establishes independent contractor relationship and service provider obligations',
                  children: [new TextRun({ text: 'Establishes independent contractor relationship and service provider obligations', size: 22 })]
                })],
                width: { size: 55, type: WidthType.PERCENTAGE }
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({
                  text: 'Privacy Policy',
                  children: [new TextRun({ text: 'Privacy Policy', size: 22 })]
                })],
                width: { size: 25, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({
                  text: 'Draft',
                  children: [new TextRun({ text: 'Draft', size: 22 })]
                })],
                width: { size: 20, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({
                  text: 'GDPR-compliant notice of data processing practices and user rights',
                  children: [new TextRun({ text: 'GDPR-compliant notice of data processing practices and user rights', size: 22 })]
                })],
                width: { size: 55, type: WidthType.PERCENTAGE }
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({
                  text: 'Data Processing Agreement',
                  children: [new TextRun({ text: 'Data Processing Agreement', size: 22 })]
                })],
                width: { size: 25, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({
                  text: 'Planned',
                  children: [new TextRun({ text: 'Planned', size: 22 })]
                })],
                width: { size: 20, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({
                  text: 'Establishes data processor obligations with third-party service providers',
                  children: [new TextRun({ text: 'Establishes data processor obligations with third-party service providers', size: 22 })]
                })],
                width: { size: 55, type: WidthType.PERCENTAGE }
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({
                  text: 'Insurance Framework',
                  children: [new TextRun({ text: 'Insurance Framework', size: 22 })]
                })],
                width: { size: 25, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({
                  text: 'In Negotiation',
                  children: [new TextRun({ text: 'In Negotiation', size: 22 })]
                })],
                width: { size: 20, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({
                  text: 'Master agreement for companion liability insurance program',
                  children: [new TextRun({ text: 'Master agreement for companion liability insurance program', size: 22 })]
                })],
                width: { size: 55, type: WidthType.PERCENTAGE }
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({
                  text: '§45b Recognition Application',
                  children: [new TextRun({ text: '§45b Recognition Application', size: 22 })]
                })],
                width: { size: 25, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({
                  text: 'Planned',
                  children: [new TextRun({ text: 'Planned', size: 22 })]
                })],
                width: { size: 20, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({
                  text: 'Applications to state authorities for relief services recognition',
                  children: [new TextRun({ text: 'Applications to state authorities for relief services recognition', size: 22 })]
                })],
                width: { size: 55, type: WidthType.PERCENTAGE }
              })
            ]
          })
        ]
      }),
      new Paragraph({ text: '', spacing: { after: 100 } })
    ]
  });

  // 8. Compliance Roadmap
  sections.push({
    children: [
      new Paragraph({
        text: '',
        pageBreakBefore: true,
        spacing: { after: 200 }
      }),
      goldHeader('8. COMPLIANCE ROADMAP', 2),
      regularText('AlltagsEngel follows a phased approach to establish and maintain regulatory compliance across all jurisdictions.'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Pre-Launch Phase (Q1-Q2 2025)', 3),
      bulletPoint('GmbH Incorporation: Complete entity formation with €25,000 share capital'),
      bulletPoint('Trademark Filing: Submit "AlltagsEngel" trademark application to EUIPO'),
      bulletPoint('Insurance Setup: Finalize insurance agreements with provider for companion coverage'),
      bulletPoint('Legal Documentation: Finalize Terms of Service, Privacy Policy, and Data Processing Agreements'),
      bulletPoint('Regulatory Liaison: Establish contacts with pilot state health and social authorities'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Launch Phase (Q3 2025)', 3),
      bulletPoint('Terms of Service Finalization: Legal review and execution of user and companion ToS'),
      bulletPoint('Privacy Compliance: Complete DPIA and finalize GDPR-compliant privacy controls'),
      bulletPoint('Pilot State Recognition: Submit §45b recognition application to pilot state authority'),
      bulletPoint('Insurance Activation: Activate companion liability insurance program at service launch'),
      bulletPoint('Compliance Monitoring: Implement initial compliance monitoring and incident reporting'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Growth Phase (Q4 2025 - Q2 2026)', 3),
      bulletPoint('Multi-State Expansion: Obtain §45b recognition in additional federal states'),
      bulletPoint('Compliance System: Establish dedicated compliance monitoring system'),
      bulletPoint('Certification Tracking: Implement automated companion certification verification'),
      bulletPoint('Regulatory Relationships: Build ongoing engagement with state regulatory bodies'),
      bulletPoint('Incident Management: Establish formal incident reporting and management processes'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Scale Phase (2026+)', 3),
      bulletPoint('Annual Audits: Conduct annual internal and external compliance audits'),
      bulletPoint('Regulatory Review: Maintain compliance with evolving regulatory landscape'),
      bulletPoint('Coverage Expansion: Expand to all states requiring formal recognition'),
      bulletPoint('Governance Enhancement: Strengthen governance structure as organization grows'),
      bulletPoint('Best Practices: Implement industry best practices in compliance management')
    ]
  });

  // 9. Risk Mitigation
  sections.push({
    children: [
      new Paragraph({
        text: '',
        pageBreakBefore: true,
        spacing: { after: 200 }
      }),
      goldHeader('9. RISK MITIGATION', 2),
      regularText('AlltagsEngel implements proactive measures to identify, monitor, and mitigate legal and compliance risks.'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Regulatory Change Monitoring', 3),
      bulletPoint('Regulatory Scanning: Continuous monitoring of German federal and state regulatory changes'),
      bulletPoint('Industry Groups: Participation in elderly care and digital health industry associations'),
      bulletPoint('Government Relations: Proactive engagement with regulatory authorities'),
      bulletPoint('Legal Alerts: Subscription to regulatory update services for timely notification'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Legal Counsel Engagement', 3),
      bulletPoint('External Counsel: Retained counsel specializing in German healthcare and social care law'),
      bulletPoint('Regulatory Expert: Legal advisor with expertise in SGB XI and state-level regulations'),
      bulletPoint('Data Protection: GDPR specialist for privacy and data protection advice'),
      bulletPoint('Advisory Board: Quarterly legal review of compliance posture'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Compliance Officer Appointment', 3),
      bulletPoint('Role: Dedicated compliance officer to oversee regulatory adherence'),
      bulletPoint('Timeline: Appointment planned during growth phase (Q4 2025)'),
      bulletPoint('Responsibilities: Regulatory monitoring, policy development, and incident management'),
      bulletPoint('Reporting: Direct reporting to management and board regarding compliance status'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Annual Compliance Review Process', 3),
      bulletPoint('Audit Cycle: Comprehensive annual compliance audit by external auditors'),
      bulletPoint('Policy Review: Annual review and update of all compliance policies'),
      bulletPoint('Training: Annual compliance training for all employees and contractors'),
      bulletPoint('Incident Analysis: Review of all incidents and implementation of corrective measures'),
      bulletPoint('Regulatory Alignment: Assessment of compliance with new and updated regulations'),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      
      goldHeader('Quality Assurance Measures', 3),
      bulletPoint('Companion Vetting: Thorough vetting process including qualification verification'),
      bulletPoint('User Feedback: Regular collection and review of user feedback and complaints'),
      bulletPoint('Service Monitoring: Periodic assessment of companion service quality and compliance'),
      bulletPoint('Documentation: Comprehensive records management for all regulatory compliance activities')
    ]
  });

  // Conclusion
  sections.push({
    children: [
      new Paragraph({
        text: '',
        pageBreakBefore: true,
        spacing: { after: 400 }
      }),
      goldHeader('CONCLUSION', 2),
      regularText('AlltagsEngel is committed to operating as a fully compliant, trustworthy platform serving elderly care in Germany. Through comprehensive legal structure, regulatory engagement, data protection, insurance coverage, and continuous compliance monitoring, the company mitigates risks while building a sustainable business serving a critical social need.'),
      new Paragraph({ text: '', spacing: { after: 200 } }),
      regularText('This Legal & Compliance Summary demonstrates AlltagsEngel\'s commitment to regulatory excellence and investor confidence. Regular updates to this document will reflect evolving regulatory requirements and operational experience.'),
      new Paragraph({ text: '', spacing: { after: 400 } }),
      regularText('---', true),
      new Paragraph({ text: '', spacing: { after: 100 } }),
      regularText('Document Version: 1.0', false, true),
      regularText('Date: March 2, 2025', false, true),
      regularText('Classification: Confidential - Investor Use Only', false, true)
    ]
  });

  return new Document({
    sections: sections
  });
}

async function main() {
  const doc = createDocument();
  const buffer = await Packer.toBuffer(doc);
  
  const fs = require('fs');
  const outputPath = '/sessions/festive-intelligent-rubin/mnt/alltagsengel-app/data-room/08-legal-compliance/AlltagsEngel-Legal-Compliance-Summary.docx';
  
  fs.writeFileSync(outputPath, buffer);
  console.log('Document created successfully at:', outputPath);
}

main().catch(console.error);
