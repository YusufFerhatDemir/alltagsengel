import Link from 'next/link'
import type { Metadata } from 'next'
import LeadForm from '@/components/LeadForm'

// ═══════════════════════════════════════════════════════════
// Pillar-Landing-Page Entlastungsbetrag (§45b SGB XI)
// Transaktionale Intent-Seite — die Blog-Ratgeber (informational)
// verlinken hierher, diese Seite konvertiert.
// ═══════════════════════════════════════════════════════════

export const metadata: Metadata = {
  title: 'Entlastungsbetrag 131 € nutzen — §45b SGB XI',
  description:
    'Entlastungsbetrag §45b SGB XI: 131 €/Monat für Alltagsbegleitung & Haushaltshilfe — ab Pflegegrad 1, 0 € Eigenanteil. Wir rechnen direkt mit der Pflegekasse ab.',
  keywords: [
    'Entlastungsbetrag',
    'Entlastungsbetrag 131 Euro',
    '§45b SGB XI',
    'Entlastungsbetrag nutzen',
    'Entlastungsbetrag Pflegegrad 1',
    'Entlastungsbetrag Alltagsbegleitung',
    'Entlastungsbetrag Haushaltshilfe',
    'Entlastungsbetrag beantragen',
    'Entlastungsbetrag verfällt',
    'Angebote zur Unterstützung im Alltag',
  ],
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Entlastungsbetrag: 131 €/Monat von der Pflegekasse nutzen',
    description:
      'Jede Person mit Pflegegrad 1–5 hat Anspruch auf 131 €/Monat nach §45b SGB XI. Alltagsengel rechnet direkt mit der Kasse ab — 0 € Eigenanteil.',
    url: 'https://alltagsengel.care/entlastungsbetrag',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
  },
  alternates: { canonical: 'https://alltagsengel.care/entlastungsbetrag' },
}

// Eine Quelle für sichtbare FAQ UND FAQPage-JSON-LD (Google-Richtlinie:
// Structured-Data-FAQs müssen sichtbar auf der Seite stehen)
const faqs = [
  {
    frage: 'Wie hoch ist der Entlastungsbetrag 2026?',
    antwort:
      'Der Entlastungsbetrag beträgt 131 € pro Monat (1.572 € pro Jahr) nach §45b SGB XI. Er steht jeder Person mit anerkanntem Pflegegrad 1 bis 5 zu, die zu Hause gepflegt wird — unabhängig vom Einkommen.',
  },
  {
    frage: 'Wer hat Anspruch auf den Entlastungsbetrag?',
    antwort:
      'Alle Pflegebedürftigen der Pflegegrade 1–5, die zu Hause leben. Besonders wichtig: Auch mit Pflegegrad 1 — bei dem es kein Pflegegeld gibt — haben Sie vollen Anspruch auf die 131 € monatlich.',
  },
  {
    frage: 'Wofür darf ich den Entlastungsbetrag verwenden?',
    antwort:
      'Für anerkannte Angebote zur Unterstützung im Alltag (z. B. Alltagsbegleitung und Haushaltshilfe von Alltagsengel), Tages- und Nachtpflege, Kurzzeitpflege sowie — ab Pflegegrad 2 — anteilig für Leistungen ambulanter Pflegedienste. Nicht erlaubt ist die Verwendung für Verhinderungspflege.',
  },
  {
    frage: 'Muss ich den Entlastungsbetrag beantragen?',
    antwort:
      'Nein, ein formeller Antrag ist nicht nötig — der Anspruch besteht automatisch mit dem Pflegegrad. Sie reichen lediglich die Rechnungen des anerkannten Anbieters bei der Pflegekasse ein. Bei Alltagsengel entfällt sogar das: Wir rechnen per Abtretungserklärung direkt mit Ihrer Kasse ab.',
  },
  {
    frage: 'Verfällt der Entlastungsbetrag, wenn ich ihn nicht nutze?',
    antwort:
      'Nicht sofort: Ungenutzte Beträge sammeln sich im laufenden Kalenderjahr an und können bis zum 30. Juni des Folgejahres verwendet werden. Danach verfallen sie ersatzlos. Wer den Betrag nicht regelmäßig nutzt, verschenkt bis zu 1.572 € pro Jahr.',
  },
  {
    frage: 'Kann ich den Entlastungsbetrag rückwirkend nutzen?',
    antwort:
      'Ja. Angesparte Beträge aus dem Vorjahr können bis zum 30. Juni des Folgejahres eingesetzt werden. Wer z. B. seit Monaten einen Pflegegrad hat und den Betrag nie genutzt hat, kann das aufgelaufene Budget für Alltagsbegleitung einsetzen.',
  },
  {
    frage: 'Kann ich Entlastungsbetrag und Verhinderungspflege kombinieren?',
    antwort:
      'Ja — es sind zwei getrennte Töpfe. Der Entlastungsbetrag (1.572 €/Jahr, ab Pflegegrad 1) und der gemeinsame Jahresbetrag für Verhinderungs- und Kurzzeitpflege (3.539 €/Jahr, ab Pflegegrad 2) ergeben zusammen bis zu 5.111 € pro Jahr.',
  },
  {
    frage: 'Wie nutze ich den Entlastungsbetrag bei Alltagsengel?',
    antwort:
      'Registrieren Sie sich kostenlos, wählen Sie einen Alltagsbegleiter (Engel) in Ihrer Stadt und buchen Sie Termine. Die Abrechnung über §45b übernehmen wir komplett — Ihr Eigenanteil: 0 €.',
  },
]

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Service',
      name: 'Alltagsbegleitung über den Entlastungsbetrag (§45b SGB XI)',
      description:
        'Anerkannte Angebote zur Unterstützung im Alltag: Alltagsbegleitung, Haushaltshilfe und Betreuung — finanziert über den Entlastungsbetrag von 131 €/Monat, abgerechnet direkt mit der Pflegekasse.',
      image: 'https://alltagsengel.care/og-image.png',
      provider: { '@id': 'https://alltagsengel.care/#localbusiness' },
      areaServed: { '@type': 'AdministrativeArea', name: 'Rhein-Main-Gebiet' },
      serviceType: 'Alltagsbegleitung / Entlastungsleistungen §45b SGB XI',
      offers: {
        '@type': 'Offer',
        price: '0.00',
        priceCurrency: 'EUR',
        description:
          '131 €/Monat übernimmt die Pflegekasse (§45b SGB XI) — 0 € Eigenanteil bei Direktabrechnung',
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.frage,
        acceptedAnswer: { '@type': 'Answer', text: faq.antwort },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Startseite', item: 'https://alltagsengel.care' },
        { '@type': 'ListItem', position: 2, name: 'Entlastungsbetrag', item: 'https://alltagsengel.care/entlastungsbetrag' },
      ],
    },
  ],
}

const cityLinks = [
  { slug: 'frankfurt', name: 'Frankfurt am Main' },
  { slug: 'offenbach', name: 'Offenbach am Main' },
  { slug: 'wiesbaden', name: 'Wiesbaden' },
  { slug: 'darmstadt', name: 'Darmstadt' },
  { slug: 'hanau', name: 'Hanau' },
  { slug: 'bad-homburg', name: 'Bad Homburg' },
  { slug: 'mainz', name: 'Mainz' },
  { slug: 'aschaffenburg', name: 'Aschaffenburg' },
  { slug: 'frankfurt-hoechst', name: 'Frankfurt-Höchst' },
  { slug: 'neu-isenburg', name: 'Neu-Isenburg' },
  { slug: 'friedberg-wetterau', name: 'Friedberg (Wetterau)' },
  { slug: 'rodgau', name: 'Rodgau' },
]

export default function EntlastungsbetragPage() {
  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="legal-header">
        <Link href="/" className="legal-back">&#8249;</Link>
        <h1 className="legal-title">Entlastungsbetrag §45b</h1>
      </div>
      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">💶</div>
          <h2 className="info-hero-title">Entlastungsbetrag: 131 €/Monat von der Pflegekasse</h2>
          <p className="info-hero-sub">
            Jede Person mit Pflegegrad 1–5 hat Anspruch — wir rechnen direkt mit der Kasse ab, Ihr Eigenanteil: 0 €
          </p>
        </div>

        <section className="info-card">
          <h3>Was ist der Entlastungsbetrag?</h3>
          <p>
            Der Entlastungsbetrag nach §45b SGB XI ist eine zweckgebundene Leistung der Pflegeversicherung
            in Höhe von <strong>131 € pro Monat</strong> (1.572 € pro Jahr). Er soll pflegende Angehörige
            entlasten und Pflegebedürftigen helfen, möglichst lange selbstständig zu Hause zu leben.
            Anders als das Pflegegeld wird er nicht ausgezahlt, sondern gegen Rechnung eines anerkannten
            Anbieters mit der Pflegekasse abgerechnet — zum Beispiel für die Alltagsbegleitung und
            Haushaltshilfe von Alltagsengel.
          </p>
          <p style={{ marginTop: 8 }}>
            Das Beste: Der Anspruch besteht <strong>ab Pflegegrad 1</strong> — also auch dann, wenn Sie
            noch kein Pflegegeld erhalten. Gerade Menschen mit Pflegegrad 1 verschenken diese Leistung
            besonders häufig, weil sie schlicht nicht davon wissen.
          </p>
        </section>

        <section className="info-card">
          <h3>Ihr Anspruch auf einen Blick</h3>
          <div className="info-price-row">
            <span className="info-price-label">Entlastungsbetrag (§45b SGB XI)</span>
            <span className="info-price-val">131 €/Monat</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Pro Jahr</span>
            <span className="info-price-val">1.572 €</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Voraussetzung</span>
            <span className="info-price-val">Pflegegrad 1–5</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Ihr Eigenanteil bei Alltagsengel</span>
            <span className="info-price-val">0 €</span>
          </div>
          <p className="info-price-note">
            Nicht genutzte Beträge sammeln sich an und bleiben bis zum 30. Juni des Folgejahres
            nutzbar — danach verfallen sie. Die Abrechnung mit Ihrer Pflegekasse übernehmen wir
            komplett für Sie.
          </p>
        </section>

        <section className="info-card">
          <h3>Wofür können Sie die 131 € einsetzen?</h3>
          <ul className="info-list">
            <li>Alltagsbegleitung: Einkäufe, Arztbegleitung, Behördengänge, Gesellschaft</li>
            <li>Haushaltsnahe Hilfen: Kochen, Putzen, Wäsche, Aufräumen</li>
            <li>Betreuung und Tagesstrukturierung — auch bei Demenz</li>
            <li>Spaziergänge, Freizeitgestaltung und geistige Aktivierung</li>
            <li>Tages- und Nachtpflege sowie Kurzzeitpflege (Eigenanteile)</li>
            <li>Ab Pflegegrad 2: anteilig Leistungen ambulanter Pflegedienste</li>
          </ul>
          <p className="info-price-note">
            Wichtig: Für die Verhinderungspflege darf der Entlastungsbetrag nicht eingesetzt werden —
            dafür gibt es ein <Link href="/verhinderungspflege">eigenes Budget von 3.539 €/Jahr</Link>.
          </p>
        </section>

        <section className="info-card">
          <h3>So nutzen Sie den Entlastungsbetrag — in 3 Schritten</h3>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-text">Kostenlos bei Alltagsengel registrieren — kein Antrag bei der Kasse nötig</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">Engel in Ihrer Stadt wählen und Termine buchen</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">Wir rechnen direkt mit Ihrer Pflegekasse ab — Sie zahlen 0 €</div>
            </div>
          </div>
        </section>

        <section className="info-card">
          <h3>Typische Beispiele aus der Praxis</h3>
          <p>
            <strong>Frau K., Pflegegrad 1, Frankfurt-Bornheim:</strong> Nutzt die 131 € für eine
            wöchentliche Einkaufsbegleitung und Hilfe im Haushalt. Eigenanteil: 0 €, Aufwand: keiner —
            die Rechnung geht direkt an die Pflegekasse.
          </p>
          <p style={{ marginTop: 8 }}>
            <strong>Familie M., Pflegegrad 3, Offenbach:</strong> Der Vater wird von der Tochter
            gepflegt. Der Entlastungsbetrag finanziert zwei Nachmittage Betreuung pro Monat, damit
            die Tochter eigene Termine wahrnehmen kann. Für ihren Jahresurlaub nutzt die Familie
            zusätzlich die Verhinderungspflege.
          </p>
          <p style={{ marginTop: 8 }}>
            <strong>Herr S., Pflegegrad 2, Wiesbaden:</strong> Hatte den Betrag zwei Jahre lang nie
            genutzt. Durch die Übertragungsregel konnte er das angesparte Budget aus dem Vorjahr
            noch bis zum 30. Juni einsetzen — über 1.500 € für regelmäßige Arztbegleitungen und
            Spaziergänge, die sonst verfallen wären.
          </p>
        </section>

        <section className="info-card">
          <h3>Entlastungsbetrag mit anderen Leistungen kombinieren</h3>
          <p>
            Der Entlastungsbetrag ist nur einer von mehreren Töpfen der Pflegekasse — und er lässt sich
            mit allen anderen kombinieren:
          </p>
          <ul className="info-list">
            <li>
              <Link href="/verhinderungspflege">Verhinderungspflege</Link> — gemeinsamer Jahresbetrag
              von 3.539 €/Jahr (ab Pflegegrad 2), zusammen bis zu 5.111 €/Jahr
            </li>
            <li>
              <Link href="/hygienebox">Pflegebox</Link> — kostenlose Pflegehilfsmittel für bis zu
              42 €/Monat nach §40 SGB XI, zusätzlich zum Entlastungsbetrag
            </li>
            <li>
              <Link href="/krankenfahrten">Krankenfahrten</Link> — mit ärztlicher Verordnung zahlt
              die Krankenkasse nach §60 SGB V
            </li>
            <li>
              <Link href="/finanzierung">Finanzierungs-Überblick</Link> — alle Budgets nach
              Pflegegrad erklärt, inkl. <Link href="/budgetrechner">Budgetrechner</Link>
            </li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Kostenlose Beratung anfragen</h3>
          <p style={{ marginBottom: 16 }}>
            Unsicher, wie viel Budget Ihnen zusteht oder wie die Abrechnung funktioniert?
            Hinterlassen Sie Ihre Nummer — wir rufen Sie zurück, kostenlos und unverbindlich.
          </p>
          <LeadForm defaultService="Alltagsbegleitung" source="entlastungsbetrag" />
        </section>

        <div className="info-cta">
          <Link href="/choose" className="btn-gold" style={{ width: '100%' }}>JETZT 131 € MONATLICH NUTZEN</Link>
        </div>

        <section className="info-card">
          <h3>Häufige Fragen zum Entlastungsbetrag</h3>
          {faqs.map((faq) => (
            <details className="info-faq" key={faq.frage}>
              <summary>{faq.frage}</summary>
              <p>{faq.antwort}</p>
            </details>
          ))}
        </section>

        <section className="info-card">
          <h3>Entlastungsbetrag in Ihrer Stadt nutzen</h3>
          <p>Unsere Alltagsbegleiter rechnen den Entlastungsbetrag in diesen Städten direkt mit der Pflegekasse ab:</p>
          <ul className="info-list">
            {cityLinks.map((c) => (
              <li key={c.slug}><Link href={`/alltagsbegleitung/${c.slug}`}>Alltagsbegleitung {c.name}</Link></li>
            ))}
          </ul>
        </section>

        <section className="info-card">
          <h3>Vertiefende Ratgeber</h3>
          <ul className="info-list">
            <li><Link href="/blog/entlastungsbetrag-45b">Entlastungsbetrag §45b richtig nutzen</Link></li>
            <li><Link href="/blog/entlastungsbetrag-beantragen">Entlastungsbetrag „beantragen": So funktioniert die Abrechnung</Link></li>
            <li><Link href="/blog/entlastungsbetrag-rueckwirkend">Entlastungsbetrag rückwirkend einsetzen</Link></li>
            <li><Link href="/blog/entlastungsbetrag-nutzen">Praxisbeispiele: So nutzen Familien die 131 €</Link></li>
            <li><Link href="/blog/pflegegrad-1-leistungen">Pflegegrad 1: Diese Leistungen stehen Ihnen zu</Link></li>
          </ul>
        </section>

        <div className="legal-footer-nav">
          <Link href="/alltagsbegleitung">Alltagsbegleitung</Link>
          <Link href="/verhinderungspflege">Verhinderungspflege</Link>
          <Link href="/krankenfahrten">Krankenfahrten</Link>
          <Link href="/hygienebox">Pflegebox</Link>
          <Link href="/finanzierung">Finanzierung</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutz</Link>
        </div>
      </div>
    </div>
  )
}
