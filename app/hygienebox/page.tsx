import Link from 'next/link'
import type { Metadata } from 'next'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import HowToSchema from '@/components/HowToSchema'

export const metadata: Metadata = {
  title: 'Pflegebox Frankfurt — kostenlos, 42 €/Monat',
  description: 'Kostenlose Pflegebox nach §40 SGB XI: Handschuhe, Desinfektion, Bettschutz — monatlich geliefert, 0 € Zuzahlung bei Pflegegrad 1–5. Jetzt bestellen!',
  keywords: ['Pflegebox', 'Pflegehilfsmittel', 'Hygienebox', '§40 SGB XI', 'kostenlose Pflegehilfsmittel', 'Pflegebox bestellen', 'Pflegebox Frankfurt', '42 Euro Pflegekasse'],
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Kostenlose Pflegebox — Pflegehilfsmittel monatlich geliefert',
    description: 'Pflegebox mit Handschuhen, Desinfektionsmittel & mehr. Bis 42€/Monat von der Pflegekasse. 0€ Zuzahlung.',
    url: 'https://alltagsengel.care/hygienebox',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
  },
  alternates: { canonical: 'https://alltagsengel.care/hygienebox' },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Pflegebox / Hygienebox',
  description: 'Monatliche Pflegehilfsmittel-Box nach §40 SGB XI. Enthält Einmalhandschuhe, Desinfektionsmittel, Bettschutzeinlagen, Mundschutz und Schutzschürzen.',
  image: [
    'https://alltagsengel.care/og-image.png',
    'https://alltagsengel.care/icon-512x512.png',
  ],
  brand: { '@type': 'Brand', name: 'Alltagsengel' },
  offers: [
    {
      '@type': 'Offer',
      name: 'Basis-Box',
      price: '29.90',
      priceCurrency: 'EUR',
      description: 'Grundversorgung mit Pflegehilfsmitteln',
      availability: 'https://schema.org/InStock',
      url: 'https://alltagsengel.care/hygienebox',
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'DE',
        returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
        merchantReturnDays: 0,
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
    {
      '@type': 'Offer',
      name: 'Komfort-Box',
      price: '40.00',
      priceCurrency: 'EUR',
      description: 'Vollständige Versorgung — maximale Kassenerstattung',
      availability: 'https://schema.org/InStock',
      url: 'https://alltagsengel.care/hygienebox',
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'DE',
        returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
        merchantReturnDays: 0,
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
  ],
  areaServed: [
    { '@type': 'City', name: 'Frankfurt am Main' },
    { '@type': 'City', name: 'Offenbach am Main' },
    { '@type': 'City', name: 'Darmstadt' },
    { '@type': 'City', name: 'Wiesbaden' },
    { '@type': 'City', name: 'Mainz' },
    { '@type': 'City', name: 'Hanau' },
    { '@type': 'AdministrativeArea', name: 'Rhein-Main-Gebiet' },
    { '@type': 'Country', name: 'Deutschland' },
  ],
}

// Ein gemeinsames Array speist das sichtbare FAQ UND das FAQPage-JSON-LD
const faqItems = [
  {
    frage: 'Ist die Pflegebox wirklich kostenlos?',
    antwort: 'Ja. Nach §40 SGB XI übernimmt die Pflegekasse bis zu 42 € pro Monat für Pflegehilfsmittel zum Verbrauch. Alltagsengel rechnet direkt mit Ihrer Kasse ab — Ihr Eigenanteil beträgt 0 €.',
  },
  {
    frage: 'Wer hat Anspruch auf die Pflegebox?',
    antwort: 'Jede Person mit anerkanntem Pflegegrad (1–5), die zu Hause gepflegt wird — von Angehörigen, Freunden oder einem Pflegedienst. Ein Rezept ist nicht nötig.',
  },
  {
    frage: 'Wie oft wird die Pflegebox geliefert?',
    antwort: 'Die Pflegebox wird monatlich direkt zu Ihnen nach Hause geliefert — automatisch und versandkostenfrei.',
  },
  {
    frage: 'Kann ich die Pflegebox jederzeit kündigen?',
    antwort: 'Ja. Sie können die monatliche Lieferung jederzeit pausieren oder abbestellen — ohne Vertragsbindung und ohne Kündigungsfrist.',
  },
  {
    frage: 'Wie beantrage ich die Pflegebox?',
    antwort: 'Sie wählen Ihre Wunsch-Box aus, wir übernehmen den kompletten Antrag bei Ihrer Pflegekasse. Sie unterschreiben nur einmalig eine Vollmacht — den Rest erledigt Alltagsengel.',
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

export default function HygieneboxPage() {
  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <BreadcrumbSchema items={[{ name: 'Pflegebox' }]} />
      <HowToSchema
        name="Pflegebox kostenlos beantragen"
        description="So erhalten Sie eine kostenlose Pflegebox (Pflegehilfsmittel nach §40 SGB XI, bis 42€/Monat) über Alltagsengel — ohne Eigenanteil."
        totalTime="PT3M"
        steps={[
          { name: 'Wunsch-Box auswählen', text: 'Wählen Sie die Basis-Box oder Komfort-Box in der Alltagsengel-App aus. Inhalt: Handschuhe, Desinfektion, Bettschutz, Mundschutz, Schürzen.' },
          { name: 'Pflegegrad angeben', text: 'Geben Sie Ihren Pflegegrad (1–5) und Ihre Pflegekasse an. Wir kümmern uns um den Antrag.' },
          { name: 'Genehmigung abwarten', text: 'Alltagsengel übernimmt die Antragstellung und Kommunikation mit Ihrer Pflegekasse. Genehmigung dauert meist wenige Tage.' },
          { name: 'Monatliche Lieferung erhalten', text: 'Nach Genehmigung erhalten Sie Ihre Pflegebox jeden Monat automatisch nach Hause — 0€ Eigenanteil.' },
        ]}
      />
      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Hygienebox</h1>
      </div>
      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">📦</div>
          <h2 className="info-hero-title">Hygienebox für Pflegebedürftige</h2>
          <p className="info-hero-sub">Monatliche Lieferung von Pflegehilfsmitteln — bis zu 42 € von der Kasse erstattet</p>
        </div>

        <section className="info-card">
          <h3>Was ist die Hygienebox?</h3>
          <p>
            Die Hygienebox ist ein monatliches Paket mit Pflegehilfsmitteln zum Verbrauch. Pflegebedürftige
            Personen ab Pflegegrad 1 haben Anspruch auf bis zu 42 € monatlich für diese Hilfsmittel — die
            Kosten übernimmt Ihre Pflegekasse.
          </p>
        </section>

        <section className="info-card">
          <h3>Inhalt der Hygienebox</h3>
          <ul className="info-list">
            <li>Einmalhandschuhe (Latex oder Nitril)</li>
            <li>Händedesinfektionsmittel</li>
            <li>Flächendesinfektionsmittel</li>
            <li>Bettschutzeinlagen (Einweg)</li>
            <li>Mundschutz / FFP2-Masken</li>
            <li>Schutzschürzen (Einweg)</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Unsere Pakete</h3>
          <div className="info-price-box">
            <div className="info-price-box-title">Basis-Box</div>
            <div className="info-price-box-val">29,90 €<span>/Monat</span></div>
            <p>Grundversorgung mit den wichtigsten Pflegehilfsmitteln</p>
          </div>
          <div className="info-price-box featured">
            <div className="info-price-box-title">Komfort-Box</div>
            <div className="info-price-box-val">40,00 €<span>/Monat</span></div>
            <p>Vollständige Versorgung — maximale Kassenerstattung ausgeschöpft</p>
          </div>
          <p className="info-price-note">
            Bei Pflegegrad 1–5 werden bis zu 42 € monatlich von der Pflegekasse übernommen.
            Ihre Zuzahlung: 0 €.
          </p>
        </section>

        <section className="info-card">
          <h3>So funktioniert&apos;s</h3>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-text">Bestellen Sie Ihre Wunsch-Box bei Alltagsengel</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">Wir regeln die Genehmigung mit Ihrer Pflegekasse</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">Monatliche Lieferung direkt zu Ihnen nach Hause</div>
            </div>
          </div>
        </section>

        <div className="info-cta">
          <Link href="/choose" className="btn-gold" style={{ width: '100%' }}>HYGIENEBOX BESTELLEN</Link>
        </div>

        <section className="info-card">
          <h3>Häufige Fragen zur Pflegebox</h3>
          {faqItems.map((f) => (
            <details className="info-faq" key={f.frage}>
              <summary>{f.frage}</summary>
              <p>{f.antwort}</p>
            </details>
          ))}
        </section>

        <section className="info-card">
          <h3>Pflegebox in Ihrer Stadt</h3>
          <ul className="info-list">
            <li><Link href="/hygienebox/frankfurt">Pflegebox Frankfurt am Main</Link></li>
            <li><Link href="/hygienebox/offenbach">Pflegebox Offenbach am Main</Link></li>
            <li><Link href="/hygienebox/wiesbaden">Pflegebox Wiesbaden</Link></li>
            <li><Link href="/hygienebox/darmstadt">Pflegebox Darmstadt</Link></li>
            <li><Link href="/hygienebox/hanau">Pflegebox Hanau</Link></li>
            <li><Link href="/hygienebox/bad-homburg">Pflegebox Bad Homburg</Link></li>
            <li><Link href="/hygienebox/mainz">Pflegebox Mainz</Link></li>
            <li><Link href="/hygienebox/aschaffenburg">Pflegebox Aschaffenburg</Link></li>
            <li><Link href="/hygienebox/neu-isenburg">Pflegebox Neu-Isenburg</Link></li>
            <li><Link href="/hygienebox/friedberg-wetterau">Pflegebox Friedberg (Wetterau)</Link></li>
            <li><Link href="/hygienebox/rodgau">Pflegebox Rodgau</Link></li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Weitere Leistungen</h3>
          <ul className="info-list">
            <li><Link href="/alltagsbegleitung">Alltagsbegleitung — 131€/Monat über Entlastungsbetrag</Link></li>
            <li><Link href="/krankenfahrten">Krankenfahrten — mit Verordnung oder als Selbstzahler</Link></li>
            <li><Link href="/finanzierung">Finanzierung — bis zu 5.111 €/Jahr, nach Pflegegrad erklärt</Link></li>
            <li><Link href="/blog/pflegehilfsmittel-40-euro">Ratgeber: Pflegehilfsmittel §40 SGB XI erklärt</Link></li>
            <li><Link href="/faq">Häufige Fragen zu Pflegeleistungen</Link></li>
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
