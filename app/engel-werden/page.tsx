import type { Metadata } from 'next'
import Link from 'next/link'
import CookieSettingsLink from '@/components/CookieSettingsLink'
import EngelBewerbungForm from '@/components/EngelBewerbungForm'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Alltagsbegleiter/in werden (m/w/d) — Nebenjob & Minijob | 20€/Std. Frankfurt',
  description: 'Stellenangebot: Alltagsbegleiter/in (m/w/d) in Frankfurt & Rhein-Main. 20€/Stunde, flexibler Nebenjob oder Minijob, keine Pflegeausbildung nötig, §45a-Qualifizierung möglich. Quereinsteiger willkommen. Jetzt bewerben!',
  keywords: [
    'alltagsbegleiter werden',
    'stellenangebot alltagsbegleitung frankfurt',
    'nebenjob pflege frankfurt',
    'betreuungskraft werden',
    'minijob seniorenbetreuung frankfurt',
    'alltagsbegleiter job rhein-main',
    '§45a betreuungskraft job',
    'nebenjob senioren frankfurt',
    'alltagsbegleiter minijob',
    '20 euro stunde nebenjob',
    'nebenjob mit sinn',
    'seniorenbetreuung nebenjob rhein-main',
    'quereinsteiger pflege job frankfurt',
    'flexible arbeit pflege',
    'job alltagsbegleitung rhein-main',
  ],
  openGraph: {
    title: 'Alltagsbegleiter/in werden — Nebenjob & Minijob | 20€/Stunde Frankfurt',
    description: 'Stellenangebot: 20€/Stunde als Alltagsbegleiter/in in Frankfurt & Rhein-Main. Flexibler Nebenjob, keine Pflegeausbildung, §45a-Qualifizierung möglich. Jetzt bewerben!',
    url: 'https://alltagsengel.care/engel-werden',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Alltagsengel — Stellenangebot Alltagsbegleiter/in Frankfurt',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Alltagsbegleiter/in werden — 20€/Stunde | Nebenjob Frankfurt',
    description: 'Flexibler Nebenjob als Alltagsbegleiter/in in Frankfurt & Rhein-Main. Keine Pflegeausbildung nötig. Jetzt bewerben!',
    images: ['/og-image.png'],
  },
  alternates: { canonical: 'https://alltagsengel.care/engel-werden' },
}

const FAQS = [
  {
    q: 'Brauche ich eine Pflegeausbildung?',
    a: 'Nein. Alltagsbegleitung ist keine medizinische Pflege. Sie helfen bei alltäglichen Aufgaben wie Einkaufen, Arztbegleitung oder Gesellschaft leisten. Empathie und Zuverlässigkeit sind wichtiger als Zertifikate.',
  },
  {
    q: 'Wie viel verdiene ich als Alltagsengel?',
    a: 'Sie erhalten 20 € pro Stunde. Die Abrechnung erfolgt transparent über die Alltagsengel-App. Sie bestimmen selbst, wie viele Stunden pro Woche Sie arbeiten möchten.',
  },
  {
    q: 'Kann ich mir die Zeiten selbst einteilen?',
    a: 'Ja, vollständig. Sie legen in der App fest, an welchen Tagen und zu welchen Uhrzeiten Sie verfügbar sind. Es gibt keine Mindestarbeitszeit und keine Schichtpflicht.',
  },
  {
    q: 'Ist das ein Minijob oder eine Festanstellung?',
    a: 'Beides ist möglich. Viele Engel starten als Minijobber (bis 538 €/Monat). Je nach Verfügbarkeit können Sie auch mehr Stunden übernehmen.',
  },
  {
    q: 'Was mache ich als Alltagsbegleiter genau?',
    a: 'Sie begleiten ältere Menschen bei Alltagsaufgaben: Einkaufen, Arztbesuche, Spaziergänge, Kochen, Gesellschaft leisten, Behördengänge. Keine medizinische Pflege, keine Körperpflege.',
  },
  {
    q: 'Wie läuft die Bewerbung ab?',
    a: 'Registrieren Sie sich über unsere App, füllen Sie Ihr Profil aus und reichen Sie ein Führungszeugnis ein. Nach einem kurzen Kennenlerngespräch können Sie direkt loslegen.',
  },
  {
    q: 'In welchem Gebiet kann ich arbeiten?',
    a: 'Aktuell in Frankfurt am Main und dem gesamten Rhein-Main-Gebiet. Sie erhalten Aufträge in Ihrer Nähe.',
  },
  {
    q: 'Bin ich versichert während der Einsätze?',
    a: 'Ja. Alle Einsätze über Alltagsengel sind haftpflichtversichert. Sie sind während Ihrer Tätigkeit abgesichert.',
  },
]

// /jobs hat eine Festanstellungs-Ausschreibung; hier sind bewusst ANDERE Positionen
// (Nebenjob/Minijob/§45a) — keine Duplicate-Content-Verletzung.
const JOB_POSTINGS = [
  {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: 'Alltagsbegleiter / Alltagsbegleiterin (m/w/d) – Nebenjob Frankfurt',
    description:
      'Als Alltagsbegleiter/in (m/w/d) begleitest du ältere Menschen und Personen mit Pflegegrad in Frankfurt am Main bei alltäglichen Aufgaben: Einkaufen, Arztbesuche, Spaziergänge, Gesellschaft leisten, leichte Haushaltshilfe. Keine medizinische Pflege, keine Ausbildung nötig. Flexible Zeiteinteilung — du bestimmst selbst, wann du arbeitest. 20 € pro Stunde, ideal als Nebenjob oder Minijob (bis 538 €/Monat). Quereinsteiger herzlich willkommen!',
    identifier: { '@type': 'PropertyValue', name: 'Alltagsengel', value: 'ae-nebenjob-ffm-001' },
    datePosted: '2026-07-08',
    validThrough: '2026-12-31',
    employmentType: 'PART_TIME',
    hiringOrganization: {
      '@type': 'Organization',
      name: 'Alltagsengel',
      sameAs: 'https://alltagsengel.care',
      logo: 'https://alltagsengel.care/icon-512x512.png',
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Neue Mainzer Straße 66-68',
        postalCode: '60311',
        addressLocality: 'Frankfurt am Main',
        addressRegion: 'Hessen',
        addressCountry: 'DE',
      },
    },
    baseSalary: {
      '@type': 'MonetaryAmount',
      currency: 'EUR',
      value: { '@type': 'QuantitativeValue', value: 20, unitText: 'HOUR' },
    },
    directApply: true,
    experienceRequirements: { '@type': 'OccupationalExperienceRequirements', monthsOfExperience: 0 },
    educationRequirements: { '@type': 'EducationalOccupationalCredential', credentialCategory: 'no requirements' },
    qualifications: 'Keine Ausbildung erforderlich, Quereinsteiger willkommen. Empathie, Zuverlässigkeit, gute Deutschkenntnisse (mind. B2).',
    industry: 'Sozialwesen / Alltagsbegleitung',
    workHours: 'Flexibel, nach eigener Verfügbarkeit (Minijob bis 538 €/Monat möglich)',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: 'Alltagsbegleiter / Alltagsbegleiterin (m/w/d) – Nebenjob Rhein-Main-Gebiet',
    description:
      'Als Alltagsbegleiter/in (m/w/d) im Rhein-Main-Gebiet (Offenbach, Wiesbaden, Darmstadt, Hanau, Mainz, Bad Homburg u.v.m.) unterstützt du ältere Menschen und Personen mit Pflegegrad bei alltäglichen Aufgaben in ihrem Zuhause. Aufträge in deiner Nähe über die Alltagsengel-App. Keine Pflegeausbildung nötig. 20 € pro Stunde, flexibel wählbare Stunden, ideal als Nebenjob oder Minijob. Quereinsteiger willkommen!',
    identifier: { '@type': 'PropertyValue', name: 'Alltagsengel', value: 'ae-nebenjob-rheinmain-001' },
    datePosted: '2026-07-08',
    validThrough: '2026-12-31',
    employmentType: 'PART_TIME',
    hiringOrganization: {
      '@type': 'Organization',
      name: 'Alltagsengel',
      sameAs: 'https://alltagsengel.care',
      logo: 'https://alltagsengel.care/icon-512x512.png',
    },
    jobLocation: [
      {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Frankfurt am Main',
          postalCode: '60311',
          addressRegion: 'Hessen',
          addressCountry: 'DE',
        },
      },
      {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Offenbach am Main',
          postalCode: '63067',
          addressRegion: 'Hessen',
          addressCountry: 'DE',
        },
      },
      {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Wiesbaden',
          postalCode: '65183',
          addressRegion: 'Hessen',
          addressCountry: 'DE',
        },
      },
      {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Darmstadt',
          postalCode: '64283',
          addressRegion: 'Hessen',
          addressCountry: 'DE',
        },
      },
    ],
    baseSalary: {
      '@type': 'MonetaryAmount',
      currency: 'EUR',
      value: { '@type': 'QuantitativeValue', value: 20, unitText: 'HOUR' },
    },
    directApply: true,
    experienceRequirements: { '@type': 'OccupationalExperienceRequirements', monthsOfExperience: 0 },
    educationRequirements: { '@type': 'EducationalOccupationalCredential', credentialCategory: 'no requirements' },
    qualifications: 'Keine Ausbildung erforderlich, Quereinsteiger willkommen. Empathie, Zuverlässigkeit, gute Deutschkenntnisse (mind. B2).',
    industry: 'Sozialwesen / Alltagsbegleitung',
    workHours: 'Flexibel, nach eigener Verfügbarkeit (Minijob bis 538 €/Monat möglich)',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: 'Betreuungskraft nach §45a SGB XI (m/w/d) – Frankfurt & Rhein-Main',
    description:
      'Werde Betreuungskraft nach §45a SGB XI bei Alltagsengel in Frankfurt und dem Rhein-Main-Gebiet. Du begleitest Menschen mit Pflegegrad in deren Zuhause: alltagspraktische Hilfe, Gesellschaft, Spaziergänge, Arztbegleitung, kognitive Aktivierung. Wir unterstützen deine Qualifizierung zur anerkannten Betreuungskraft nach §45a/§53c SGB XI. 20 € pro Stunde, flexible Zeiteinteilung, Minijob oder Nebenjob möglich. Deine Einsätze sind über den gesetzlichen Entlastungsbetrag (131 €/Monat nach §45b SGB XI) abrechenbar — das macht unsere Dienstleistung für Klientinnen und Klienten besonders zugänglich.',
    identifier: { '@type': 'PropertyValue', name: 'Alltagsengel', value: 'ae-betreuungskraft-45a-001' },
    datePosted: '2026-07-08',
    validThrough: '2026-12-31',
    employmentType: 'PART_TIME',
    hiringOrganization: {
      '@type': 'Organization',
      name: 'Alltagsengel',
      sameAs: 'https://alltagsengel.care',
      logo: 'https://alltagsengel.care/icon-512x512.png',
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Neue Mainzer Straße 66-68',
        postalCode: '60311',
        addressLocality: 'Frankfurt am Main',
        addressRegion: 'Hessen',
        addressCountry: 'DE',
      },
    },
    baseSalary: {
      '@type': 'MonetaryAmount',
      currency: 'EUR',
      value: { '@type': 'QuantitativeValue', value: 20, unitText: 'HOUR' },
    },
    directApply: true,
    experienceRequirements: { '@type': 'OccupationalExperienceRequirements', monthsOfExperience: 0 },
    educationRequirements: {
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'professional certificate',
    },
    qualifications:
      'Qualifizierung zur Betreuungskraft nach §45a/§53c SGB XI wird unterstützt. Empathie, Zuverlässigkeit, gute Deutschkenntnisse (mind. B2). Erfahrung im Pflegebereich von Vorteil, aber nicht Voraussetzung.',
    industry: 'Sozialwesen / Betreuung / §45a SGB XI',
    workHours: 'Flexibel, nach eigener Verfügbarkeit',
  },
]

const jsonLdFAQ = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function EngelWerdenPage() {
  return (
    <div className="screen" id="engel-werden">
      {JOB_POSTINGS.map((jp) => (
        <script
          key={jp.identifier.value}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jp) }}
        />
      ))}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }}
      />
      <BreadcrumbSchema items={[{ name: 'Engel werden' }]} />

      {/* ── Sticky CTA Bar ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
        background: 'linear-gradient(180deg, transparent 0%, rgba(20,18,16,0.95) 30%, #141210 100%)',
        padding: '20px 16px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, color: '#C9963C', fontWeight: 600, marginBottom: 8 }}>
          20 €/Stunde · Flexible Zeiten · Sinnvolle Arbeit
        </div>
        <Link href="/engel/register" className="btn-gold" style={{ width: '100%', maxWidth: 340, fontSize: 16, padding: '14px 0' }}>
          JETZT BEWERBEN
        </Link>
      </div>

      {/* ── HERO ── */}
      <div className="sp-glow"></div>
      <div className="sp-inner">
        <div style={{ marginBottom: 20 }}>
          <div style={{
            width: 100, height: 100, borderRadius: '50%', margin: '0 auto',
            background: 'linear-gradient(135deg, rgba(201,150,60,0.15), rgba(201,150,60,0.05))',
            border: '2px solid rgba(201,150,60,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 48,
          }}>
            <svg viewBox="0 0 48 48" width="48" height="48" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <circle cx="24" cy="14" r="8" />
              <path d="M8 42c0-8.8 7.2-16 16-16s16 7.2 16 16" />
              <path d="M24 30v6M21 33h6" />
            </svg>
          </div>
        </div>
        <h1 className="sp-word" style={{ fontSize: 22, letterSpacing: '.06em' }}>WERDE ALLTAGSENGEL</h1>
        <p className="sp-tag">Flexibler Nebenjob mit Sinn</p>
        <p className="sp-ug">Frankfurt · Rhein-Main · 20 €/Stunde</p>
        <div className="gold-div"></div>
        <div className="sp-btns">
          <Link href="/engel/register" className="btn-gold">JETZT BEWERBEN</Link>
          <Link href="/blog/alltagsbegleiter-werden" className="btn-ghost">Mehr erfahren</Link>
        </div>
      </div>

      {/* ── Trust Row ── */}
      <div className="sp-trust">
        <div className="trust-row">
          <div className="trust-item"><div className="trust-val">20 €</div><div className="trust-lbl">pro Stunde</div></div>
          <div className="trust-sep"></div>
          <div className="trust-item"><div className="trust-val">Flexibel</div><div className="trust-lbl">Zeiteinteilung</div></div>
          <div className="trust-sep"></div>
          <div className="trust-item"><div className="trust-val">Rhein-Main</div><div className="trust-lbl">Region</div></div>
        </div>
      </div>

      {/* ── Content Sections ── */}
      <div className="lp-sections">

        {/* ─── Was ist Alltagsbegleitung? ─── */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <div className="lp-badge">Dein Job als Alltagsengel</div>
          <h2 className="lp-h2">Menschen helfen. Flexibel verdienen.</h2>
          <p className="lp-text">
            Als Alltagsengel begleitest du ältere Menschen bei alltäglichen Aufgaben:
            Einkaufen, Arztbesuche, Spaziergänge, Kochen oder einfach Gesellschaft leisten.
            Keine medizinische Pflege — sondern menschliche Nähe und praktische Hilfe.
            Du bestimmst selbst, wann und wie oft du arbeitest.
          </p>
        </section>

        {/* ─── Benefits ─── */}
        <section className="lp-section">
          <div className="lp-badge">Deine Vorteile</div>
          <h2 className="lp-h2">Warum Alltagsengel?</h2>
          <div className="lp-values">
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <circle cx="20" cy="20" r="14" />
                  <path d="M20 12v8l5 5" />
                </svg>
              </div>
              <h4>Flexible Zeiteinteilung</h4>
              <p>Du bestimmst selbst, an welchen Tagen und zu welchen Zeiten du arbeitest. Kein Schichtplan, keine Mindestarbeitszeit.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <circle cx="20" cy="20" r="14" />
                  <path d="M14 20h12M20 14v12" />
                </svg>
              </div>
              <h4>20 € pro Stunde</h4>
              <p>Fairer, transparenter Stundenlohn. Abrechnung direkt über die App, pünktliche Auszahlung.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M20 35s-13-8-13-18a7 7 0 0 1 13-4 7 7 0 0 1 13 4c0 10-13 18-13 18z" />
                </svg>
              </div>
              <h4>Sinnvolle Arbeit</h4>
              <p>Du machst einen echten Unterschied im Alltag älterer Menschen. Deine Hilfe zählt.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <rect x="6" y="6" width="28" height="28" rx="4" />
                  <path d="M14 20l4 4 8-8" />
                </svg>
              </div>
              <h4>Keine Pflegeausbildung nötig</h4>
              <p>Alltagsbegleitung ist keine medizinische Pflege. Du brauchst Empathie und Zuverlässigkeit — kein Zertifikat.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <rect x="8" y="4" width="24" height="32" rx="4" />
                  <circle cx="20" cy="30" r="2" />
                  <path d="M14 8h12" />
                </svg>
              </div>
              <h4>Eigene App</h4>
              <p>Aufträge annehmen, Zeiten erfassen, Verdienst im Blick — alles bequem in der Alltagsengel-App.</p>
            </div>
          </div>
        </section>

        {/* ─── Anforderungen ─── */}
        <section className="lp-section">
          <div className="lp-badge">Was wir erwarten</div>
          <h2 className="lp-h2">Das bringst du mit</h2>
          <div className="lp-values">
            <div className="lp-value-item" style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
              <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: 'rgba(201,150,60,0.1)', border: '1px solid rgba(201,150,60,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </div>
              <div>
                <h4 style={{ marginBottom: 2 }}>Zuverlässigkeit</h4>
                <p>Pünktlichkeit und Verlässlichkeit sind das Wichtigste für unsere Klienten.</p>
              </div>
            </div>
            <div className="lp-value-item" style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
              <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: 'rgba(201,150,60,0.1)', border: '1px solid rgba(201,150,60,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </div>
              <div>
                <h4 style={{ marginBottom: 2 }}>Empathie</h4>
                <p>Einfühlungsvermögen und Freude am Umgang mit älteren Menschen.</p>
              </div>
            </div>
            <div className="lp-value-item" style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
              <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: 'rgba(201,150,60,0.1)', border: '1px solid rgba(201,150,60,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </div>
              <div>
                <h4 style={{ marginBottom: 2 }}>Deutschkenntnisse (mind. B2)</h4>
                <p>Du musst dich sicher auf Deutsch verständigen können.</p>
              </div>
            </div>
            <div className="lp-value-item" style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
              <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: 'rgba(201,150,60,0.1)', border: '1px solid rgba(201,150,60,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </div>
              <div>
                <h4 style={{ marginBottom: 2 }}>Führungszeugnis</h4>
                <p>Ein aktuelles erweitertes Führungszeugnis ist erforderlich (kann nach der Bewerbung eingereicht werden).</p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── So funktioniert's: 3 Schritte ─── */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <div className="lp-badge">In 3 Schritten zum Engel</div>
          <h2 className="lp-h2">So einfach geht&apos;s</h2>
          <div className="lp-steps">
            <div className="lp-step">
              <div className="lp-step-num">1</div>
              <div className="lp-step-text"><strong>Bewerben</strong><br />Profil in der App anlegen</div>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">2</div>
              <div className="lp-step-text"><strong>Kennenlernen</strong><br />Kurzes Gespräch mit uns</div>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">3</div>
              <div className="lp-step-text"><strong>Loslegen</strong><br />Aufträge annehmen &amp; verdienen</div>
            </div>
          </div>
        </section>

        {/* ─── Deine Aufgaben ─── */}
        <section className="lp-section">
          <div className="lp-badge">Deine Aufgaben</div>
          <h2 className="lp-h2">Was du als Alltagsengel machst</h2>
          <div className="lp-values">
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M8 32h24M12 28v4M28 28v4" />
                  <rect x="10" y="12" width="20" height="16" rx="2" />
                  <path d="M16 12V8a4 4 0 0 1 8 0v4" />
                </svg>
              </div>
              <h4>Einkaufen &amp; Besorgungen</h4>
              <p>Gemeinsam einkaufen oder Besorgungen für Klienten erledigen.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <rect x="4" y="12" width="32" height="16" rx="2" />
                  <path d="M8 28v3c0 1 .5 2 2 2h2c1.5 0 2-1 2-2v-3m12 3v3c0 1 .5 2 2 2h2c1.5 0 2-1 2-2v-3M4 18h32" />
                </svg>
              </div>
              <h4>Arztbegleitung</h4>
              <p>Begleitung zu Arztbesuchen, Therapien und Behördengängen.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M20 8c-5 0-10 4-10 10 0 8 10 18 10 18s10-10 10-18c0-6-5-10-10-10z" />
                  <circle cx="20" cy="18" r="4" />
                </svg>
              </div>
              <h4>Spaziergänge &amp; Freizeit</h4>
              <p>Spaziergänge, Ausflüge und gemeinsame Aktivitäten gestalten.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M6 8h28v24H6z" />
                  <path d="M6 14h28M14 8v6" />
                  <path d="M18 20h8M18 26h5" />
                </svg>
              </div>
              <h4>Haushalt &amp; Gesellschaft</h4>
              <p>Leichte Haushaltshilfe, Kochen, Vorlesen oder einfach Gesellschaft leisten.</p>
            </div>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section className="lp-section">
          <div className="lp-badge">Häufige Fragen</div>
          <h2 className="lp-h2">Antworten für Bewerber</h2>
          <div className="lp-faq">
            {FAQS.map((f, i) => (
              <details key={i} className="lp-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ─── Schnell-Bewerbung ─── */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <div className="lp-badge">Kein Login nötig</div>
          <h2 className="lp-h2">Interesse? Melde dich unverbindlich.</h2>
          <p className="lp-text" style={{ marginBottom: 24 }}>
            Hinterlasse deine Kontaktdaten — wir rufen dich an und besprechen alles Weitere.
            Kein Account nötig, keine Verpflichtung.
          </p>
          <EngelBewerbungForm />
        </section>

        {/* ─── CTA ─── */}
        <section className="lp-section lp-cta-section">
          <h2 className="lp-h2">Bereit, Alltagsengel zu werden?</h2>
          <p className="lp-text">
            Registrierung kostenlos und unverbindlich. Bewirb dich jetzt und starte
            als Alltagsbegleiter in Frankfurt und dem Rhein-Main-Gebiet.
          </p>
          <div className="sp-btns" style={{ marginTop: 20 }}>
            <Link href="/engel/register" className="btn-gold">JETZT BEWERBEN</Link>
          </div>
        </section>

        {/* ─── Ratgeber ─── */}
        <section className="lp-section">
          <div className="lp-badge">Weiterlesen</div>
          <h2 className="lp-h2">Ratgeber für Bewerber</h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
            gap: 16,
            marginTop: 20,
          }}>
            {[
              { slug: 'alltagsbegleiter-werden', title: 'Alltagsbegleiter werden: Verdienst & Voraussetzungen', cat: 'Karriere' },
              { slug: 'nebenjob-pflege', title: 'Nebenjob in der Pflege: 20€/Stunde', cat: 'Karriere' },
            ].map(a => (
              <Link key={a.slug} href={`/blog/${a.slug}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 14,
                  padding: '18px 20px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  transition: 'border-color 0.3s',
                }}>
                  <div style={{ color: '#C9963C', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    {a.cat}
                  </div>
                  <div style={{ color: '#F5F0E8', fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
                    {a.title}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Spacer for sticky CTA bar */}
        <div style={{ height: 100 }} />

        {/* ─── Footer ─── */}
        {/* Footer kommt global aus components/SiteFooter.tsx (LayoutWrapper) */}
      </div>
    </div>
  )
}
