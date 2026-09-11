import Link from 'next/link'
import type { Metadata } from 'next'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

// ═══════════════════════════════════════════════════════════════════════
// /leistungen — Übersicht aller Leistungen der Alltagsbegleitung
//
// Die Route gab bis 11.09.2026 einen 404 (SEO-Audit). Statt eines
// Redirects steht hier eine eigene Seite: „Leistungen" ist eine eigene
// Suchanfrage, und die Seite verteilt interne Links auf die
// Leistungsseiten, statt eine davon willkürlich zum Ziel zu machen.
//
// FINANZIERUNG — rechtlich vorsichtig formuliert: Der Entlastungsbetrag
// (131 €/Monat, § 45b SGB XI) kann erst nach der Anerkennung des Anbieters
// nach § 45a SGB XI eingesetzt werden; Alltagsengel befindet sich im
// Anerkennungsverfahren. Dieselbe Formulierung wie auf den Stadtseiten
// (Commit b6cb0776).
//
// Eine Quelle für sichtbaren Inhalt UND JSON-LD — Google verlangt, dass
// strukturierte Daten sichtbaren Inhalt beschreiben.
// ═══════════════════════════════════════════════════════════════════════

const BASE = 'https://alltagsengel.care'

export const metadata: Metadata = {
  title: 'Leistungen — Alltagsbegleitung, Haushaltshilfe & Entlastung',
  description: 'Alle Leistungen von Alltagsengel in Frankfurt & Rhein-Main: Alltagsbegleitung, Haushaltshilfe, Einkaufshilfe, Begleitung zu Terminen, Freizeitgestaltung und Entlastung pflegender Angehöriger.',
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Leistungen von Alltagsengel',
    description: 'Alltagsbegleitung, Haushaltshilfe, Einkaufshilfe, Terminbegleitung, Freizeit und Entlastung für Angehörige — in Frankfurt & Rhein-Main.',
    url: `${BASE}/leistungen`,
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
  },
  alternates: { canonical: `${BASE}/leistungen` },
}

interface Leistung {
  id: string
  icon: string
  titel: string
  text: string
  beispiele: string[]
  links: { href: string; label: string }[]
}

const LEISTUNGEN: Leistung[] = [
  {
    id: 'alltagsbegleitung',
    icon: '💛',
    titel: 'Alltagsbegleitung',
    text: 'Unterstützung dort, wo der Alltag allein schwer wird — praktisch, verlässlich und mit Zeit für ein Gespräch. Unsere Engel sind geschult, geprüft und über die Plattform haftpflichtversichert.',
    beispiele: ['Gesellschaft und Gespräche', 'Hilfe bei Post und Formularen', 'Orientierung im Tagesablauf'],
    links: [{ href: '/alltagsbegleitung', label: 'Mehr zur Alltagsbegleitung' }],
  },
  {
    id: 'haushaltshilfe',
    icon: '🏠',
    titel: 'Haushaltshilfe',
    text: 'Leichte Hausarbeit, damit die eigene Wohnung ein Zuhause bleibt — ohne dass Kraft und Gesundheit darunter leiden.',
    beispiele: ['Aufräumen und leichte Reinigung', 'Wäsche waschen und legen', 'Gemeinsam kochen'],
    links: [{ href: '/haushaltshilfe', label: 'Mehr zur Haushaltshilfe' }],
  },
  {
    id: 'einkaufshilfe',
    icon: '🛒',
    titel: 'Einkaufshilfe',
    text: 'Gemeinsam einkaufen oder den Einkauf erledigen lassen — mit Einkaufsliste, Apotheke und den kleinen Besorgungen dazwischen.',
    beispiele: ['Wocheneinkauf', 'Apotheke und Drogerie', 'Besorgungen und Botengänge'],
    links: [{ href: '/blog/einkaufshilfe-senioren', label: 'Ratgeber Einkaufshilfe' }],
  },
  {
    id: 'terminbegleitung',
    icon: '🩺',
    titel: 'Begleitung zu Terminen',
    text: 'Niemand muss allein zum Arzt, zur Behörde oder zur Bank. Der Engel begleitet zu Fuß, mit Bus und Bahn oder im Auto und hilft, das Gesagte festzuhalten.',
    beispiele: ['Arzt- und Therapietermine', 'Behörden und Bank', 'Wege mit ÖPNV'],
    links: [
      { href: '/blog/arztbegleitung-senioren', label: 'Ratgeber Arztbegleitung' },
      { href: '/krankenfahrten', label: 'Krankenfahrten mit Verordnung' },
    ],
  },
  {
    id: 'freizeitgestaltung',
    icon: '🌳',
    titel: 'Freizeitgestaltung',
    text: 'Soziale Teilhabe ist kein Luxus. Ein Spaziergang, ein Café-Besuch oder ein Spielenachmittag hält Körper und Kopf in Bewegung und wirkt gegen Einsamkeit.',
    beispiele: ['Spaziergänge', 'Gedächtnistraining und Spiele', 'Ausflüge und Veranstaltungen'],
    links: [{ href: '/blog/einsamkeit-im-alter', label: 'Ratgeber Einsamkeit im Alter' }],
  },
  {
    id: 'entlastung-angehoerige',
    icon: '🤝',
    titel: 'Entlastung pflegender Angehöriger',
    text: 'Wer einen Menschen pflegt, braucht selbst Pausen. Während der Engel da ist, haben Angehörige Zeit für Beruf, Erholung oder eigene Termine.',
    beispiele: ['Stundenweise Betreuung', 'Feste wöchentliche Termine', 'Vertretung bei Verhinderung'],
    links: [
      { href: '/blog/tipps-fuer-pflegende-angehoerige', label: 'Tipps für pflegende Angehörige' },
      { href: '/verhinderungspflege', label: 'Verhinderungspflege (§ 39 SGB XI)' },
    ],
  },
]

const FAQS: { frage: string; antwort: string }[] = [
  {
    frage: 'Welche Leistungen bietet Alltagsengel an?',
    antwort: 'Alltagsbegleitung, Haushaltshilfe, Einkaufshilfe, Begleitung zu Terminen, Freizeitgestaltung und die Entlastung pflegender Angehöriger — in Frankfurt am Main und im Rhein-Main-Gebiet. Dazu kommen die Pflegebox (§ 40 SGB XI) und die Vermittlung von Krankenfahrten.',
  },
  {
    frage: 'Ist das medizinische Pflege?',
    antwort: 'Nein. Unsere Engel übernehmen keine körperbezogene oder medizinische Pflege wie Waschen oder Medikamentengabe. Alltagsbegleitung ergänzt einen Pflegedienst um praktische Hilfe und Gesellschaft.',
  },
  {
    frage: 'Wie werden die Leistungen finanziert?',
    antwort: 'Pflegebedürftigen mit Pflegegrad 1 bis 5 steht nach § 45b SGB XI grundsätzlich ein Entlastungsbetrag von 131 € monatlich zu. Ob er für ein konkretes Angebot eingesetzt werden kann, setzt die Anerkennung des Anbieters nach § 45a SGB XI voraus — Alltagsengel befindet sich derzeit im Anerkennungsverfahren. Bis dahin sind alle Leistungen als Selbstzahler buchbar; zu Ihren Finanzierungswegen beraten wir Sie vorab kostenlos.',
  },
  {
    frage: 'Kann ich mehrere Leistungen kombinieren?',
    antwort: 'Ja. Die meisten Einsätze verbinden mehrere Leistungen — zum Beispiel Einkauf, gemeinsames Kochen und ein Spaziergang in einem Termin. Umfang und Rhythmus bestimmen Sie selbst.',
  },
]

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'OfferCatalog',
      '@id': `${BASE}/leistungen#katalog`,
      name: 'Leistungen von Alltagsengel',
      itemListElement: LEISTUNGEN.map((l, i) => ({
        '@type': 'Offer',
        position: i + 1,
        itemOffered: {
          '@type': 'Service',
          '@id': `${BASE}/leistungen#${l.id}`,
          name: l.titel,
          description: l.text,
          serviceType: l.titel,
          provider: { '@id': `${BASE}/#organization` },
          areaServed: [
            { '@type': 'City', name: 'Frankfurt am Main' },
            { '@type': 'AdministrativeArea', name: 'Rhein-Main-Gebiet' },
          ],
          url: `${BASE}/leistungen#${l.id}`,
        },
      })),
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQS.map(f => ({
        '@type': 'Question',
        name: f.frage,
        acceptedAnswer: { '@type': 'Answer', text: f.antwort },
      })),
    },
  ],
}

export default function LeistungenPage() {
  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BreadcrumbSchema items={[{ name: 'Leistungen' }]} />
      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Leistungen</h1>
      </div>
      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">✨</div>
          <h2 className="info-hero-title">Unsere Leistungen im Überblick</h2>
          <p className="info-hero-sub">
            Alltagsbegleitung für Senioren und pflegebedürftige Menschen in Frankfurt am Main und im Rhein-Main-Gebiet
          </p>
        </div>

        {LEISTUNGEN.map(l => (
          <section className="info-card" id={l.id} key={l.id}>
            <h3>{l.icon} {l.titel}</h3>
            <p>{l.text}</p>
            <ul className="info-list">
              {l.beispiele.map(b => <li key={b}>{b}</li>)}
            </ul>
            <p style={{ marginTop: 10 }}>
              {l.links.map((lk, i) => (
                <span key={lk.href}>
                  {i > 0 && ' · '}
                  <Link href={lk.href}>{lk.label} →</Link>
                </span>
              ))}
            </p>
          </section>
        ))}

        <section className="info-card">
          <h3>Finanzierung</h3>
          <p>
            Pflegebedürftigen mit Pflegegrad 1 bis 5 steht nach <strong>§ 45b SGB XI</strong> grundsätzlich
            ein Entlastungsbetrag von <strong>131 € pro Monat</strong> zur Verfügung. Ob er für ein konkretes
            Angebot eingesetzt werden kann, setzt die Anerkennung des Anbieters nach <strong>§ 45a SGB XI</strong> voraus
            — Alltagsengel befindet sich derzeit im Anerkennungsverfahren. Bis dahin sind alle Leistungen als
            Selbstzahler buchbar.
          </p>
          <p style={{ marginTop: 10 }}>
            <Link href="/entlastungsbetrag">Entlastungsbetrag erklärt →</Link>
            {' · '}
            <Link href="/finanzierung">Alle Finanzierungswege →</Link>
            {' · '}
            <Link href="/warteliste">Auf die Warteliste setzen →</Link>
          </p>
        </section>

        <div className="info-cta">
          <Link href="/choose" className="btn-gold" style={{ width: '100%' }}>JETZT ENGEL FINDEN</Link>
        </div>

        <section className="info-card">
          <h3>Häufige Fragen</h3>
          {FAQS.map(f => (
            <details className="info-faq" key={f.frage}>
              <summary>{f.frage}</summary>
              <p>{f.antwort}</p>
            </details>
          ))}
        </section>

        <section className="info-card">
          <h3>Weitere Angebote</h3>
          <ul className="info-list">
            <li><Link href="/hygienebox">Pflegebox — Pflegehilfsmittel bis 42 €/Monat (§ 40 SGB XI)</Link></li>
            <li><Link href="/krankenfahrten">Krankenfahrten — sicher zum Arzt (§ 60 SGB V)</Link></li>
            <li><Link href="/einzugsgebiet">Einzugsgebiet — wo wir unterwegs sind</Link></li>
          </ul>
        </section>

        <div className="legal-footer-nav">
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/agb">AGB</Link>
        </div>
      </div>
    </div>
  )
}
