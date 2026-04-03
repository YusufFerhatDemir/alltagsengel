import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pflegebox Frankfurt | Kostenlose Pflegehilfsmittel — 42€/Monat von der Kasse',
  description: 'Kostenlose Pflegebox mit Pflegehilfsmitteln nach §40 SGB XI. Handschuhe, Desinfektionsmittel, Bettschutz — monatlich geliefert. 0€ Zuzahlung bei Pflegegrad 1-5.',
  keywords: ['Pflegebox', 'Pflegehilfsmittel', 'Hygienebox', '§40 SGB XI', 'kostenlose Pflegehilfsmittel', 'Pflegebox bestellen', 'Pflegebox Frankfurt', '42 Euro Pflegekasse'],
  openGraph: {
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
  brand: { '@type': 'Brand', name: 'Alltagsengel' },
  offers: [
    { '@type': 'Offer', name: 'Basis-Box', price: '29.90', priceCurrency: 'EUR', description: 'Grundversorgung mit Pflegehilfsmitteln', availability: 'https://schema.org/InStock' },
    { '@type': 'Offer', name: 'Komfort-Box', price: '40.00', priceCurrency: 'EUR', description: 'Vollständige Versorgung — maximale Kassenerstattung', availability: 'https://schema.org/InStock' },
  ],
  areaServed: { '@type': 'City', name: 'Frankfurt am Main' },
}

export default function HygieneboxPage() {
  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Hygienebox</h1>
      </div>
      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">📦</div>
          <h2 className="info-hero-title">Hygienebox für Pflegebedürftige</h2>
          <p className="info-hero-sub">Monatliche Lieferung von Pflegehilfsmitteln — bis zu 40 € von der Kasse erstattet</p>
        </div>

        <section className="info-card">
          <h3>Was ist die Hygienebox?</h3>
          <p>
            Die Hygienebox ist ein monatliches Paket mit Pflegehilfsmitteln zum Verbrauch. Pflegebedürftige
            Personen ab Pflegegrad 1 haben Anspruch auf bis zu 40 € monatlich für diese Hilfsmittel — die
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
            Bei Pflegegrad 1–5 werden bis zu 40 € monatlich von der Pflegekasse übernommen.
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
          <Link href="/choose">
            <button className="btn-gold" style={{ width: '100%' }}>HYGIENEBOX BESTELLEN</button>
          </Link>
        </div>

        <div className="legal-footer-nav">
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/agb">AGB</Link>
        </div>
      </div>
    </div>
  )
}
