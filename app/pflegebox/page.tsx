import Link from 'next/link'
import type { Metadata } from 'next'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import HowToSchema from '@/components/HowToSchema'
import SpeakableSchema from '@/components/SpeakableSchema'
import PflegeboxKonfigurator from '@/components/PflegeboxKonfigurator'

// ═══════════════════════════════════════════════════════════
// /pflegebox — transaktionale Bestell-Landingpage (Konfigurator).
// Abgrenzung zu /hygienebox (Info-Pillar): Diese Seite zielt auf
// Bestell-Keywords ("Pflegebox bestellen", "Pflegebox kostenlos",
// "Pflegebox Antrag") und führt direkt in den Konfigurator.
// ═══════════════════════════════════════════════════════════

export const metadata: Metadata = {
  title: 'Pflegebox bestellen — kostenlos ab Pflegegrad 1',
  description: 'Pflegebox in 2 Minuten bestellen: Box zusammenstellen, Pflegegrad angeben — wir übernehmen den Antrag bei der Pflegekasse. 42 €/Monat, 0 € Eigenanteil.',
  keywords: ['Pflegebox bestellen', 'Pflegebox kostenlos', 'Pflegebox Antrag', 'Pflegehilfsmittel 40 Euro', 'Pflegehilfsmittel 42 Euro', 'Pflegebox Pflegekasse', 'Pflegebox zusammenstellen', 'Pflegebox Pflegegrad 1', 'kostenlose Pflegebox beantragen'],
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Pflegebox bestellen — kostenlos ab Pflegegrad 1',
    description: 'Box zusammenstellen, Pflegegrad angeben, fertig. Antrag bei der Pflegekasse übernehmen wir — 0 € Eigenanteil, monatlich frei Haus.',
    url: 'https://alltagsengel.care/pflegebox',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
  },
  alternates: { canonical: 'https://alltagsengel.care/pflegebox' },
}

const productJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Pflegebox — Pflegehilfsmittel zum Verbrauch',
  description: 'Individuell zusammenstellbare Pflegebox nach §40 SGB XI: Einmalhandschuhe, Hände- und Flächendesinfektion, Bettschutzeinlagen, Mundschutz, Schutzschürzen. Monatliche Lieferung, 0 € Eigenanteil bei Pflegegrad 1–5.',
  image: [
    'https://alltagsengel.care/og-image.png',
    'https://alltagsengel.care/icon-512x512.png',
  ],
  brand: { '@type': 'Brand', name: 'Alltagsengel' },
  // sku: Pflicht-Identifier für Google Merchant Listings (gtin/mpn/sku)
  sku: 'AE-PFLEGEBOX-001',
  offers: {
    '@type': 'Offer',
    name: 'Individuelle Pflegebox (§40 SGB XI)',
    sku: 'AE-PFLEGEBOX-001',
    price: '0.00',
    priceCurrency: 'EUR',
    priceValidUntil: '2027-12-31',
    description: 'Bis 42 €/Monat übernimmt die Pflegekasse — 0 € Eigenanteil, versandkostenfrei',
    availability: 'https://schema.org/InStock',
    url: 'https://alltagsengel.care/pflegebox',
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'DE',
      // merchantReturnDays nur bei FiniteReturnWindow zulässig — bei
      // MerchantReturnNotPermitted weglassen (sonst ungültiger Wert).
      returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
    },
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: 'EUR' },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'DE' },
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' },
        transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 5, unitCode: 'DAY' },
      },
    },
  },
}

// Ein gemeinsames Array speist das sichtbare FAQ UND das FAQPage-JSON-LD.
// Bewusst Bestell-/Antragsfragen — die Grundsatzfragen beantwortet /hygienebox.
const faqItems = [
  {
    frage: 'Wie schnell kommt meine erste Pflegebox?',
    antwort: 'Nach Ihrer Bestellung melden wir uns innerhalb von 24 Stunden, bestätigen die Zusammenstellung und reichen den Antrag bei Ihrer Pflegekasse ein. Nach der Genehmigung — meist wenige Tage bis zwei Wochen — kommt die erste Box innerhalb von 3–5 Werktagen.',
  },
  {
    frage: 'Muss ich den Antrag bei der Pflegekasse selbst stellen?',
    antwort: 'Nein. Sie unterschreiben nur einmalig eine Vollmacht, alles Weitere übernimmt Alltagsengel: Antrag ausfüllen, einreichen, Rückfragen der Kasse beantworten und monatlich direkt abrechnen.',
  },
  {
    frage: 'Was kostet mich die Pflegebox wirklich?',
    antwort: '0 €. Die Pflegekasse übernimmt nach §40 SGB XI bis zu 42 € pro Monat für Pflegehilfsmittel zum Verbrauch. Wir stellen die Box nur aus erstattungsfähigen Produkten zusammen — deshalb entsteht nie ein Eigenanteil, auch der Versand ist frei.',
  },
  {
    frage: 'Welchen Pflegegrad brauche ich zum Bestellen?',
    antwort: 'Pflegegrad 1 genügt bereits — der Anspruch gilt für alle Pflegegrade 1 bis 5, sofern die Pflege zu Hause stattfindet. Ist der Pflegegrad erst beantragt, können Sie trotzdem schon bestellen: Wir reichen den Antrag ein, sobald der Bescheid da ist.',
  },
  {
    frage: 'Kann ich die Pflegebox für meine Eltern oder Angehörige bestellen?',
    antwort: 'Ja — die meisten Bestellungen kommen von Angehörigen. Geben Sie einfach Ihre eigene Telefonnummer an; Lieferadresse und Versichertendaten der pflegebedürftigen Person klären wir im Bestätigungsgespräch.',
  },
  {
    frage: 'Kann ich die Zusammenstellung später ändern oder kündigen?',
    antwort: 'Jederzeit. Sie können Produkte, Mengen und Größen monatlich anpassen, die Lieferung pausieren oder ganz kündigen — ohne Vertragsbindung und ohne Frist.',
  },
  {
    frage: 'Brauche ich ein Rezept für die Pflegebox?',
    antwort: 'Nein. Für Pflegehilfsmittel zum Verbrauch genügt der anerkannte Pflegegrad — ein Arztbesuch oder Rezept ist nicht nötig.',
  },
  {
    frage: 'Geht die Bestellung auch bei privater Pflegeversicherung?',
    antwort: 'Ja. Privat Versicherte haben denselben Anspruch. Die Abwicklung läuft je nach Versicherer über Kostenerstattung — die nötigen Unterlagen stellen wir Ihnen fertig zu.',
  },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((f) => ({
    '@type': 'Question',
    name: f.frage,
    acceptedAnswer: { '@type': 'Answer', text: f.antwort },
  })),
}

const TRUST_CHIPS = [
  '✓ 0 € Eigenanteil',
  '✓ Kostenlos ab Pflegegrad 1',
  '✓ Antrag übernehmen wir',
  '✓ Jederzeit kündbar',
]

export default function PflegeboxBestellenPage() {
  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <BreadcrumbSchema items={[{ name: 'Pflegebox', url: '/hygienebox' }, { name: 'Pflegebox bestellen' }]} />
      <SpeakableSchema url="/pflegebox" />
      <HowToSchema
        name="Pflegebox kostenlos bestellen"
        description="So bestellen Sie Ihre kostenlose Pflegebox (§40 SGB XI, bis 42 €/Monat) in 2 Minuten — den Antrag bei der Pflegekasse übernimmt Alltagsengel."
        totalTime="PT2M"
        steps={[
          { name: 'Box zusammenstellen', text: 'Wählen Sie im Konfigurator die Pflegehilfsmittel aus, die Sie brauchen: Handschuhe, Desinfektion, Bettschutz, Mundschutz, Schürzen.', url: '/pflegebox' },
          { name: 'Pflegegrad angeben', text: 'Geben Sie den Pflegegrad (1–5) an — schon Pflegegrad 1 genügt. Auch möglich, wenn der Pflegegrad erst beantragt ist.' },
          { name: 'Kontaktdaten senden', text: 'Name, Telefonnummer und PLZ genügen. Wir rufen innerhalb von 24 Stunden zurück und bestätigen die Zusammenstellung.' },
          { name: 'Antrag & Lieferung abwarten', text: 'Alltagsengel reicht den Antrag bei der Pflegekasse ein und rechnet direkt ab. Nach Genehmigung kommt die Box jeden Monat frei Haus — 0 € Eigenanteil.' },
        ]}
      />

      <div className="legal-header">
        <Link href="/hygienebox" className="legal-back">‹</Link>
        <h1 className="legal-title">Pflegebox bestellen</h1>
      </div>

      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">📦</div>
          <h2 className="info-hero-title">Ihre Pflegebox — in 2 Minuten bestellt</h2>
          <p className="info-hero-sub">
            Box zusammenstellen, Pflegegrad angeben, fertig. Den Antrag bei Ihrer
            Pflegekasse übernehmen wir — bis 42 €/Monat, 0 € Eigenanteil.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 14 }}>
            {TRUST_CHIPS.map((chip) => (
              <span
                key={chip}
                style={{
                  fontSize: 12, fontWeight: 600, color: '#E8C87E',
                  background: 'rgba(201,150,60,.1)', border: '1px solid rgba(201,150,60,.25)',
                  borderRadius: 999, padding: '6px 12px',
                }}
              >
                {chip}
              </span>
            ))}
          </div>
        </div>

        <section className="info-card" id="konfigurator">
          <h3>Pflegebox zusammenstellen &amp; kostenlos bestellen</h3>
          <p style={{ marginBottom: 16 }}>
            Wählen Sie aus, was Ihre Box enthalten soll. Alle Produkte stammen aus dem
            Pflegehilfsmittelverzeichnis (Produktgruppe 54) und sind damit voll
            erstattungsfähig — Ihr Eigenanteil bleibt garantiert bei 0&nbsp;€.
          </p>
          <PflegeboxKonfigurator />
        </section>

        <section className="info-card">
          <h3>So einfach funktioniert die Bestellung</h3>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-text">Box im Konfigurator zusammenstellen — dauert 2 Minuten</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">Wir rufen zurück, bestätigen Größen &amp; Mengen und Sie unterschreiben einmalig die Vollmacht</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">Alltagsengel stellt den Antrag bei Ihrer Pflegekasse — Genehmigung meist in wenigen Tagen</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">4</div>
              <div className="info-step-text">Ihre Pflegebox kommt jeden Monat automatisch frei Haus — 0 € Eigenanteil</div>
            </div>
          </div>
        </section>

        <section className="info-card">
          <h3>Warum ist die Pflegebox kostenlos?</h3>
          <p>
            Jede Person mit anerkanntem <strong>Pflegegrad 1–5</strong>, die zu Hause gepflegt
            wird, hat nach <strong>§40 SGB XI</strong> Anspruch auf Pflegehilfsmittel zum
            Verbrauch — seit dem 01.01.2025 bis zu <strong>42 € pro Monat</strong> (vorher
            40 €). Das sind bis zu <strong>504 € im Jahr</strong>, die ohne Bestellung einfach
            verfallen: Die Pauschale lässt sich nicht ansparen.
          </p>
          <p style={{ marginTop: 12 }}>
            Alltagsengel rechnet direkt mit Ihrer Pflegekasse ab. Weil die Box ausschließlich
            gelistete, erstattungsfähige Produkte enthält, zahlen Sie weder Zuzahlung noch
            Versand. Alle Details zu Anspruch, Rechtsgrundlage und Inhalt finden Sie auf der{' '}
            <Link href="/hygienebox">Pflegebox-Infoseite</Link> und im Ratgeber{' '}
            <Link href="/blog/welche-pflegehilfsmittel-stehen-mir-zu">Welche Pflegehilfsmittel
            stehen mir zu?</Link>
          </p>
        </section>

        <section className="info-card">
          <h3>Darauf können Sie sich verlassen</h3>
          <ul className="info-list">
            <li><strong>0 € Eigenanteil, garantiert:</strong> Nur erstattungsfähige Produkte aus
              dem Hilfsmittelverzeichnis — die Abrechnung läuft direkt mit der Kasse</li>
            <li><strong>Antrag komplett inklusive:</strong> Formular, Einreichung, Rückfragen —
              Sie unterschreiben nur einmal eine Vollmacht</li>
            <li><strong>Keine Vertragsbindung:</strong> Monatlich anpassen, pausieren oder
              kündigen — ohne Frist</li>
            <li><strong>Regional verwurzelt:</strong> Sitz in Frankfurt, persönlich erreichbar —
              kein anonymes Callcenter</li>
            <li><strong>Ehrliche Bewertungen:</strong> Was Familien über uns sagen, lesen Sie
              ungefiltert unter <Link href="/bewertungen">Bewertungen &amp; Erfahrungen</Link></li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Häufige Fragen zur Bestellung</h3>
          {faqItems.map((f) => (
            <details className="info-faq" key={f.frage}>
              <summary>{f.frage}</summary>
              <p>{f.antwort}</p>
            </details>
          ))}
        </section>

        <div className="info-cta">
          <a href="#konfigurator" className="btn-gold" style={{ width: '100%' }}>JETZT PFLEGEBOX ZUSAMMENSTELLEN</a>
        </div>

        <section className="info-card">
          <h3>Mehr zum Thema Pflegebox</h3>
          <ul className="info-list">
            <li><Link href="/hygienebox">Pflegebox / Hygienebox — Anspruch, Inhalt &amp; §40 SGB XI erklärt</Link></li>
            <li><Link href="/blog/pflegebox-bestellen-anleitung">Ratgeber: Pflegebox bestellen — Komplettanleitung 2026</Link></li>
            <li><Link href="/blog/welche-pflegehilfsmittel-stehen-mir-zu">Ratgeber: Welche Pflegehilfsmittel stehen mir zu?</Link></li>
            <li><Link href="/blog/pflegehilfsmittel-40-euro">Ratgeber: Pflegehilfsmittel nach §40 SGB XI</Link></li>
            <li><Link href="/blog/pflegegrad-1-leistungen">Pflegegrad 1: Diese Leistungen stehen Ihnen zu</Link></li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Weitere Leistungen von Alltagsengel</h3>
          <ul className="info-list">
            <li><Link href="/alltagsbegleitung">Alltagsbegleitung — 131 €/Monat über den Entlastungsbetrag</Link></li>
            <li><Link href="/entlastungsbetrag">Entlastungsbetrag — 131 €/Monat ab Pflegegrad 1 (§45b)</Link></li>
            <li><Link href="/verhinderungspflege">Verhinderungspflege — Ersatzpflege bis 3.539 €/Jahr (§39)</Link></li>
            <li><Link href="/krankenfahrten">Krankenfahrten — mit Verordnung zahlt die Kasse (§60 SGB V)</Link></li>
            <li><Link href="/budgetrechner">Budgetrechner — alle Pflegekassen-Budgets auf einen Blick</Link></li>
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
