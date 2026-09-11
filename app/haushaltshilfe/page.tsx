import Link from 'next/link'
import type { Metadata } from 'next'
import LeadForm from '@/components/LeadForm'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

// ═══════════════════════════════════════════════════════════════════════
// HAUSHALTSHILFE — Hauptseite
//
// Zugleich das Kanonisierungsziel von /haushaltshilfe/frankfurt (dieselbe
// Regel wie bei /hygienebox und /krankenfahrten): Hauptseite, Frankfurter
// Stadtseite und der Blogartikel `haushaltshilfe-frankfurt` würden sonst um
// dasselbe Keyword konkurrieren.
// ═══════════════════════════════════════════════════════════════════════

const HINWEIS_ANERKENNUNG =
  'Alltagsengel befindet sich aktuell im Anerkennungsverfahren nach § 45a SGB XI. '
  + 'Nach erfolgter Anerkennung können berechtigte Pflegebedürftige Leistungen über den '
  + 'Entlastungsbetrag nach § 45b SGB XI abrechnen.'

/** Städte mit eigener Seite — Reihenfolge wie in der Prioritätenliste. */
const STAEDTE = [
  { slug: 'frankfurt', name: 'Frankfurt am Main' },
  { slug: 'offenbach', name: 'Offenbach am Main' },
  { slug: 'hanau', name: 'Hanau' },
  { slug: 'maintal', name: 'Maintal' },
  { slug: 'bad-homburg', name: 'Bad Homburg' },
  { slug: 'neu-isenburg', name: 'Neu-Isenburg' },
  { slug: 'eschborn', name: 'Eschborn' },
  { slug: 'frankfurt-hoechst', name: 'Frankfurt-Höchst' },
  { slug: 'darmstadt', name: 'Darmstadt' },
  { slug: 'wiesbaden', name: 'Wiesbaden' },
  { slug: 'bad-vilbel', name: 'Bad Vilbel' },
  { slug: 'rodgau', name: 'Rodgau' },
  { slug: 'main-taunus', name: 'Main-Taunus-Kreis' },
  { slug: 'friedberg-wetterau', name: 'Friedberg (Wetterau)' },
  { slug: 'aschaffenburg', name: 'Aschaffenburg' },
  { slug: 'giessen', name: 'Gießen' },
  { slug: 'marburg', name: 'Marburg' },
  { slug: 'kassel', name: 'Kassel' },
  { slug: 'fulda', name: 'Fulda' },
  { slug: 'limburg', name: 'Limburg an der Lahn' },
  { slug: 'mainz', name: 'Mainz' },
  { slug: 'koeln', name: 'Köln' },
  { slug: 'duesseldorf', name: 'Düsseldorf' },
  { slug: 'essen', name: 'Essen' },
  { slug: 'dortmund', name: 'Dortmund' },
  { slug: 'bonn', name: 'Bonn' },
]

export const metadata: Metadata = {
  title: 'Haushaltshilfe im Rhein-Main-Gebiet — Reinigung, Wäsche, Einkauf',
  description:
    'Haushaltshilfe in Frankfurt, Offenbach, Hanau und dem Rhein-Main-Gebiet: Reinigung, '
    + 'Wäsche, Einkauf und Kochen durch geschulte Kräfte. Entlastungsbetrag 131 €/Monat '
    + 'nach §45b SGB XI. Jetzt unverbindlich vormerken.',
  keywords: [
    'Haushaltshilfe Frankfurt', 'Haushaltshilfe Rhein-Main', 'Haushaltshilfe Pflegegrad',
    'Putzhilfe Senioren', 'Reinigungshilfe', 'Einkaufshilfe', 'Entlastungsbetrag',
    '131 Euro Pflegekasse', '§45b SGB XI', 'haushaltsnahe Dienstleistungen §35a',
  ],
  alternates: { canonical: 'https://alltagsengel.care/haushaltshilfe' },
  openGraph: {
    title: 'Haushaltshilfe im Rhein-Main-Gebiet | Alltagsengel',
    description:
      'Reinigung, Wäsche, Einkauf und Kochen — feste Bezugsperson, versichert.',
    url: 'https://alltagsengel.care/haushaltshilfe',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

const FAQ = [
  {
    frage: 'Was macht eine Haushaltshilfe konkret?',
    antwort:
      'Reinigung der Wohnung, Wäsche waschen und bügeln, Einkaufen, Kochen, Spülen, Müll '
      + 'entsorgen und Botengänge wie Apotheke oder Post. Medizinische Leistungen gehören '
      + 'nicht dazu — dafür ist ein Pflegedienst zuständig.',
  },
  {
    frage: 'Was kostet eine Haushaltshilfe?',
    antwort:
      'Die Kosten richten sich nach Umfang und Art der Hilfe — Sie erhalten vorab ein individuelles Angebot. Pflegebedürftigen mit Pflegegrad steht nach § 45b SGB XI '
      + 'grundsätzlich ein monatlicher Entlastungsbetrag von 131 € zur Verfügung, bereits ab '
      + `Pflegegrad 1. ${HINWEIS_ANERKENNUNG}`,
  },
  {
    frage: 'Brauche ich einen Pflegegrad?',
    antwort:
      'Nein. Unsere Haushaltshilfe steht auch Menschen ohne Pflegegrad offen — dann als '
      + 'Selbstzahler. Ein Pflegegrad ist nur für die Nutzung des Entlastungsbetrags nötig.',
  },
  {
    frage: 'Ist das dasselbe wie Alltagsbegleitung?',
    antwort:
      'Nein. Die Haushaltshilfe kümmert sich um die Wohnung — putzen, waschen, einkaufen, '
      + 'kochen. Die Alltagsbegleitung kümmert sich um den Menschen — Begleitung zum Arzt, '
      + 'Spaziergänge, Gesellschaft. Beides lässt sich in einem Termin verbinden.',
  },
  {
    frage: 'Kann ich Haushaltshilfe steuerlich absetzen?',
    antwort:
      'Haushaltsnahe Dienstleistungen sind nach § 35a EStG mit 20 % der Arbeitskosten '
      + 'absetzbar, höchstens 4.000 € im Jahr. Voraussetzung sind eine Rechnung und die '
      + 'Zahlung per Überweisung. Verbindlich klärt das Ihr Steuerberater oder Finanzamt.',
  },
  {
    frage: 'Kommt immer dieselbe Person?',
    antwort:
      'Ja, das ist unser Anspruch. Sie erhalten eine feste Bezugsperson statt wechselnder '
      + 'Kräfte — wer regelmäßig in Ihre Wohnung kommt, soll ein bekanntes Gesicht sein.',
  },
]

export default function HaushaltshilfePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': 'https://alltagsengel.care/haushaltshilfe#service',
        name: 'Haushaltshilfe',
        serviceType: 'Haushaltshilfe',
        description:
          'Unterstützung im Haushalt: Reinigung, Wäsche, Einkauf, Kochen und Botengänge '
          + 'durch geschulte Kräfte im Rhein-Main-Gebiet.',
        provider: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
        areaServed: STAEDTE.map(s => ({ '@type': 'City', name: s.name })),
        offers: {
          '@type': 'Offer',
          priceCurrency: 'EUR',
          description: 'Haushaltshilfe — individuelle Preisgestaltung, Preis auf Anfrage',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://alltagsengel.care/haushaltshilfe#faq',
        mainEntity: FAQ.map(f => ({
          '@type': 'Question',
          name: f.frage,
          acceptedAnswer: { '@type': 'Answer', text: f.antwort },
        })),
      },
    ],
  }

  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BreadcrumbSchema items={[{ name: 'Haushaltshilfe' }]} />

      <div className="legal-header">
        <Link href="/" className="legal-back">&#8249;</Link>
        <h1 className="legal-title">Haushaltshilfe</h1>
      </div>

      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">💛</div>
          <h2 className="info-hero-title">Haushaltshilfe im Rhein-Main-Gebiet</h2>
          <p className="info-hero-sub">
            Reinigung, Wäsche, Einkauf und Kochen — versichert, zuverlässig und mit fester
            Bezugsperson
          </p>
        </div>

        <section className="info-card">
          <h3>Wenn der Haushalt zu viel wird</h3>
          <p>
            Es fängt selten mit einem großen Ereignis an. Der Wäschekorb bleibt stehen, der
            Einkauf wird zur Tagesaufgabe, das Bad wartet auf später. Eine Haushaltshilfe
            nimmt genau diese Dinge ab — damit die Kraft für das bleibt, was Freude macht.
          </p>
          <p style={{ marginTop: 8 }}>
            Unsere Kräfte sind geschult, versichert und kommen regelmäßig zur vereinbarten
            Zeit. Sie erhalten eine feste Bezugsperson, keine wechselnden Gesichter.
          </p>
        </section>

        <section className="info-card">
          <h3>Unsere Leistungen im Haushalt</h3>
          <ul className="info-list">
            <li><strong>Reinigung</strong> — Staubsaugen, Wischen, Bad und Küche, Fenster nach Absprache</li>
            <li><strong>Wäsche</strong> — Waschen, Trocknen, Bügeln, Bettwäsche wechseln</li>
            <li><strong>Einkauf</strong> — Wocheneinkauf, Getränkekisten, Verräumen in der Wohnung</li>
            <li><strong>Küche</strong> — Kochen nach Ihren Wünschen, Spülen, Vorräte im Blick behalten</li>
            <li><strong>Ordnung</strong> — Müll und Altpapier entsorgen, Post sortieren, Blumen gießen</li>
            <li><strong>Botengänge</strong> — Apotheke, Post, Reinigung, Rezept abholen</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Haushaltshilfe oder Alltagsbegleitung?</h3>
          <p>
            Die <strong>Haushaltshilfe</strong> kümmert sich um die Wohnung: putzen, waschen,
            einkaufen, kochen. Die{' '}
            <Link href="/alltagsbegleitung">Alltagsbegleitung</Link> kümmert sich um den
            Menschen: Begleitung zum Arzt, Spaziergänge, Gespräche, Gesellschaft.
          </p>
          <p style={{ marginTop: 8 }}>
            Beides steht unter demselben Entlastungsbetrag, und beides lässt sich in einem
            Termin verbinden. Was Sie brauchen, klären wir vorab in Ruhe — Sie müssen sich
            nicht vorher entscheiden.
          </p>
        </section>

        <section className="info-card">
          <h3>Kosten und Finanzierung</h3>
          <div className="info-price-row">
            <span className="info-price-label">Haushaltshilfe</span>
            <span className="info-price-val">auf Anfrage</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Entlastungsbetrag (§ 45b SGB XI)</span>
            <span className="info-price-val">131 €/Monat</span>
          </div>
          <p className="info-price-note">
            Pflegebedürftigen mit Pflegegrad steht der Entlastungsbetrag grundsätzlich zur
            Verfügung, bereits ab Pflegegrad 1. Nicht genutzte Beträge verfallen am 30. Juni
            des Folgejahres. <strong>{HINWEIS_ANERKENNUNG}</strong>
          </p>
          <p style={{ marginTop: 10 }}>
            Unabhängig davon sind haushaltsnahe Dienstleistungen nach § 35a EStG mit 20 % der
            Arbeitskosten absetzbar (höchstens 4.000 € im Jahr), sofern eine Rechnung vorliegt
            und per Überweisung gezahlt wird.
          </p>
        </section>

        <section className="info-card">
          <h3>Haushaltshilfe in Ihrer Stadt</h3>
          <p>Wir sind im Rhein-Main-Gebiet unterwegs — mit eigener Seite je Stadt:</p>
          <ul className="info-list">
            {STAEDTE.filter(s => s.slug !== 'frankfurt').map(s => (
              <li key={s.slug}>
                <Link href={`/haushaltshilfe/${s.slug}`}>Haushaltshilfe {s.name}</Link>
              </li>
            ))}
          </ul>
          <p style={{ marginTop: 10, fontSize: 14, color: 'var(--ink3)' }}>
            In Frankfurt am Main sind wir im gesamten Stadtgebiet im Einsatz — diese Seite
            gilt zugleich für Frankfurt.
          </p>
        </section>

        <section className="info-card" style={{ borderLeft: '3px solid #C9963C' }}>
          <h3>Jetzt unverbindlich vormerken</h3>
          <p>
            Wir bauen unser Angebot laufend aus. Lassen Sie sich kostenlos vormerken — wir
            melden uns, sobald wir in Ihrer Region starten können. Es entsteht kein Vertrag
            und keine Zahlungspflicht.
          </p>
          <div style={{ marginTop: 14 }}>
            <Link href="/warteliste" className="btn-gold" style={{ width: '100%' }}>
              JETZT UNVERBINDLICH VORMERKEN
            </Link>
          </div>
        </section>

        <section className="info-card">
          <h3>Rückruf vereinbaren</h3>
          <p style={{ marginBottom: 16 }}>
            Fragen zur Haushaltshilfe oder zum Entlastungsbetrag? Hinterlassen Sie Ihre
            Nummer — wir rufen zurück, kostenlos und unverbindlich.
          </p>
          <LeadForm defaultService="Haushaltshilfe" source="haushaltshilfe" />
        </section>

        <section className="info-card">
          <h3>Häufige Fragen zur Haushaltshilfe</h3>
          {FAQ.map(f => (
            <details className="info-faq" key={f.frage}>
              <summary>{f.frage}</summary>
              <p>{f.antwort}</p>
            </details>
          ))}
        </section>

        <section className="info-card">
          <h3>Als Haushaltshilfe arbeiten</h3>
          <p>
            Wir suchen laufend zuverlässige Menschen im Rhein-Main-Gebiet. Eine pflegerische
            Ausbildung ist nicht nötig — Sorgfalt und Verlässlichkeit zählen mehr. Du
            bestimmst selbst, wie viele Stunden du übernimmst.
          </p>
          <div style={{ marginTop: 14 }}>
            <Link href="/engel-werden" className="btn-ghost" style={{ width: '100%' }}>
              ALS ENGEL BEWERBEN
            </Link>
          </div>
        </section>

        <div className="legal-footer-nav">
          <Link href="/alltagsbegleitung">Alltagsbegleitung</Link>
          <Link href="/warteliste">Warteliste</Link>
          <Link href="/entlastungsbetrag">Entlastungsbetrag</Link>
          <Link href="/finanzierung">Finanzierung</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/kontakt">Kontakt</Link>
          <Link href="/impressum">Impressum</Link>
        </div>
      </div>
    </div>
  )
}
