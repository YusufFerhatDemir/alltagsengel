import Link from 'next/link'
import type { Metadata } from 'next'
import GoogleReviews from '@/components/GoogleReviews'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Bewertungen & Erfahrungen — Das sagen Familien über uns',
  description: 'Google-Bewertungen und Erfahrungen mit Alltagsengel: Alltagsbegleitung nach §45b SGB XI in Frankfurt am Main und Umgebung. Transparent, geprüft, ohne Eigenanteil über den Entlastungsbetrag (131 €/Monat).',
  keywords: ['Alltagsengel Bewertungen', 'Alltagsengel Erfahrungen', 'Alltagsbegleitung Frankfurt Bewertung', 'Betreuungsdienst Frankfurt Erfahrungen'],
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Bewertungen — Das sagen Familien über Alltagsengel',
    description: 'Echte Google-Bewertungen und Erfahrungen mit unserer Alltagsbegleitung in Frankfurt und Rhein-Main.',
    url: 'https://alltagsengel.care/bewertungen',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
  },
  alternates: { canonical: 'https://alltagsengel.care/bewertungen' },
}

// Hinweis: AggregateRating-JSON-LD rendert die GoogleReviews-Komponente
// selbst — und nur mit echten Google-Daten. Erfundene Bewertungen oder
// Fake-Ratings verstoßen gegen die Google-Richtlinien für strukturierte
// Daten und riskieren eine Abstrafung.

const VERSPRECHEN = [
  {
    titel: 'Geprüfte Alltagsengel',
    text: 'Jeder Engel durchläuft ein persönliches Auswahlgespräch, Führungszeugnis-Check und Schulung — bevor er zum ersten Mal zu Ihnen kommt.',
  },
  {
    titel: 'Feste Bezugsperson',
    text: 'Kein ständiger Wechsel: Sie bekommen einen festen Alltagsengel, der Ihre Gewohnheiten und Wünsche kennt.',
  },
  {
    titel: '0 € Eigenanteil möglich',
    text: 'Wir rechnen direkt über den Entlastungsbetrag (131 €/Monat, §45b SGB XI) mit Ihrer Pflegekasse ab — inklusive Abtretungserklärung, ohne Papierkram für Sie.',
  },
  {
    titel: 'Ehrliche Bewertungen',
    text: 'Wir kaufen keine Rezensionen und erfinden keine Testimonials. Was Sie hier sehen, sind echte Google-Bewertungen echter Kunden.',
  },
]

export default function BewertungenPage() {
  return (
    <div className="screen info-screen">
      <BreadcrumbSchema items={[{ name: 'Bewertungen' }]} />

      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Bewertungen</h1>
      </div>

      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">⭐</div>
          <h2 className="info-hero-title">Das sagen Familien über uns</h2>
          <p className="info-hero-sub">
            Vertrauen entsteht durch Ehrlichkeit: Hier sehen Sie unsere echten
            Google-Bewertungen — ungefiltert und transparent.
          </p>
        </div>

        <section className="info-card">
          <GoogleReviews />
        </section>

        <section className="info-card" style={{ marginTop: 18 }}>
          <h3>Wofür wir jeden Tag arbeiten</h3>
          <div style={{ display: 'grid', gap: 14, marginTop: 4 }}>
            {VERSPRECHEN.map(v => (
              <div key={v.titel} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ color: '#E8C87E', fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>{v.titel}</div>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>{v.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="info-card" style={{ textAlign: 'center' }}>
          <h3>Überzeugen Sie sich selbst</h3>
          <p style={{ marginBottom: 16 }}>
            Die beste Bewertung ist Ihre eigene Erfahrung: Lernen Sie Ihren Alltagsengel
            in einem kostenlosen, unverbindlichen Erstgespräch kennen.
          </p>
          <Link href="/termin" className="btn-gold" style={{ fontSize: 15, padding: '13px 26px' }}>Jetzt Alltagsbegleitung anfragen</Link>
          <p style={{ color: '#8A8279', fontSize: 12.5, marginTop: 12 }}>
            Oder rufen Sie uns an: <a href="tel:+491783382825" style={{ color: '#C9963C', textDecoration: 'none' }}>+49 178 338 28 25</a> — wir beraten Sie gern zu Entlastungsbetrag, Pflegegrad und Ablauf.
          </p>
        </section>

        <section className="info-card">
          <h3>Mehr zum Thema</h3>
          <ul className="info-list">
            <li><Link href="/einzugsgebiet">Einzugsgebiet: Sind wir bei Ihnen verfügbar?</Link></li>
            <li><Link href="/budgetrechner">Budgetrechner: Ihr Entlastungsbetrag (131 €/Monat)</Link></li>
            <li><Link href="/ueber-uns">Über uns: Wer hinter Alltagsengel steht</Link></li>
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
