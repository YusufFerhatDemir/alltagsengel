import Link from 'next/link'
import type { Metadata } from 'next'
import LeadForm from '@/components/LeadForm'

// ═══════════════════════════════════════════════════════════
// Pillar-Landing-Page Verhinderungspflege (§39 SGB XI)
// Seit 01.07.2025: gemeinsamer Jahresbetrag mit Kurzzeitpflege
// von 3.539 €/Jahr, ab Pflegegrad 2, ohne Vorpflegezeit.
// ═══════════════════════════════════════════════════════════

export const metadata: Metadata = {
  title: 'Verhinderungspflege: 3.539 €/Jahr nutzen',
  description:
    'Verhinderungspflege §39 SGB XI: 3.539 €/Jahr gemeinsamer Jahresbetrag (seit 01.07.2025), ab Pflegegrad 2, ohne Vorpflegezeit. Wir übernehmen die Ersatzpflege & Abrechnung.',
  keywords: [
    'Verhinderungspflege',
    'Verhinderungspflege 3539 Euro',
    '§39 SGB XI',
    'Ersatzpflege',
    'gemeinsamer Jahresbetrag',
    'Verhinderungspflege stundenweise',
    'Verhinderungspflege beantragen',
    'Kurzzeitpflege',
    'pflegende Angehörige Entlastung',
    'Verhinderungspflege Pflegegrad 2',
  ],
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Verhinderungspflege: 3.539 €/Jahr für Ihre Ersatzpflege',
    description:
      'Wenn pflegende Angehörige ausfallen oder Urlaub brauchen, zahlt die Pflegekasse die Ersatzpflege — bis zu 3.539 €/Jahr, ab Pflegegrad 2, sofort nutzbar.',
    url: 'https://alltagsengel.care/verhinderungspflege',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
  },
  alternates: { canonical: 'https://alltagsengel.care/verhinderungspflege' },
}

// Eine Quelle für sichtbare FAQ UND FAQPage-JSON-LD (Google-Richtlinie:
// Structured-Data-FAQs müssen sichtbar auf der Seite stehen)
const faqs = [
  {
    frage: 'Wie hoch ist das Budget für die Verhinderungspflege?',
    antwort:
      'Seit dem 01.07.2025 gibt es einen gemeinsamen Jahresbetrag für Verhinderungs- und Kurzzeitpflege von bis zu 3.539 € pro Jahr — flexibel für beides einsetzbar, jeweils bis zu 8 Wochen pro Jahr, ab Pflegegrad 2.',
  },
  {
    frage: 'Wer hat Anspruch auf Verhinderungspflege?',
    antwort:
      'Pflegebedürftige ab Pflegegrad 2, die zu Hause von einer privaten Pflegeperson (z. B. Angehörigen) gepflegt werden. Die früher geforderte Vorpflegezeit von 6 Monaten ist seit dem 01.07.2025 entfallen — der Anspruch gilt sofort.',
  },
  {
    frage: 'Was ist stundenweise Verhinderungspflege?',
    antwort:
      'Dauert die Vertretung weniger als 8 Stunden am Tag, gilt sie als stundenweise Verhinderungspflege. Der Vorteil: Das Pflegegeld wird an diesen Tagen nicht gekürzt. Ideal, wenn die Pflegeperson nur einen Nachmittag frei braucht — z. B. für Arzttermine oder Erholung.',
  },
  {
    frage: 'Wer darf die Verhinderungspflege übernehmen?',
    antwort:
      'Professionelle Betreuungskräfte wie die Alltagsbegleiter von Alltagsengel, ambulante Dienste — oder auch Nachbarn und entfernte Verwandte. Bei nahen Angehörigen (bis 2. Grad) erstattet die Kasse nur den Aufwand in Höhe des 1,5-fachen Pflegegeldes.',
  },
  {
    frage: 'Muss ich Verhinderungspflege vorab beantragen?',
    antwort:
      'Nein, die Erstattung kann auch nachträglich beantragt werden. Wir empfehlen aber, die Pflegekasse vorab zu informieren — dann ist die Kostenübernahme gesichert. Alltagsengel unterstützt Sie bei den Formularen und der Abrechnung.',
  },
  {
    frage: 'Kann ich Verhinderungspflege mehrmals im Jahr nutzen?',
    antwort:
      'Ja, beliebig oft — solange der gemeinsame Jahresbetrag von 3.539 € (Verhinderungs- und Kurzzeitpflege zusammen) und die Höchstdauer von 8 Wochen pro Kalenderjahr nicht überschritten werden.',
  },
  {
    frage: 'Was ist der Unterschied zwischen Verhinderungspflege und Entlastungsbetrag?',
    antwort:
      'Zwei getrennte Töpfe: Die Verhinderungspflege (3.539 €/Jahr, ab Pflegegrad 2) bezahlt die Ersatzpflege, wenn Ihre Pflegeperson ausfällt. Der Entlastungsbetrag (131 €/Monat, ab Pflegegrad 1) ist für regelmäßige Alltagsunterstützung gedacht. Beide lassen sich parallel nutzen — zusammen bis zu 5.111 € pro Jahr.',
  },
  {
    frage: 'Wird das Pflegegeld während der Verhinderungspflege weitergezahlt?',
    antwort:
      'Bei stundenweiser Verhinderungspflege (unter 8 Stunden/Tag) läuft das Pflegegeld ungekürzt weiter. Bei tageweiser Vertretung wird es für den ersten und letzten Tag voll, dazwischen zur Hälfte gezahlt.',
  },
]

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Service',
      name: 'Verhinderungspflege / Ersatzpflege (§39 SGB XI)',
      description:
        'Stundenweise und tageweise Verhinderungspflege durch geprüfte Betreuungskräfte im Rhein-Main-Gebiet. Bis zu 3.539 €/Jahr über den gemeinsamen Jahresbetrag der Pflegekasse abrechenbar.',
      image: 'https://alltagsengel.care/og-image.png',
      provider: { '@id': 'https://alltagsengel.care/#localbusiness' },
      areaServed: { '@type': 'AdministrativeArea', name: 'Rhein-Main-Gebiet' },
      serviceType: 'Verhinderungspflege / Ersatzpflege',
      offers: {
        '@type': 'Offer',
        price: '0.00',
        priceCurrency: 'EUR',
        description:
          'Bis zu 3.539 €/Jahr übernimmt die Pflegekasse (gemeinsamer Jahresbetrag §39/§42 SGB XI)',
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
        { '@type': 'ListItem', position: 2, name: 'Verhinderungspflege', item: 'https://alltagsengel.care/verhinderungspflege' },
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

export default function VerhinderungspflegePage() {
  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="legal-header">
        <Link href="/" className="legal-back">&#8249;</Link>
        <h1 className="legal-title">Verhinderungspflege</h1>
      </div>
      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">🛟</div>
          <h2 className="info-hero-title">Verhinderungspflege: 3.539 €/Jahr für Ihre Ersatzpflege</h2>
          <p className="info-hero-sub">
            Wenn pflegende Angehörige Urlaub brauchen oder ausfallen, zahlt die Pflegekasse die Vertretung — ab Pflegegrad 2, sofort nutzbar
          </p>
        </div>

        <section className="info-card">
          <h3>Was ist Verhinderungspflege?</h3>
          <p>
            Verhinderungspflege (auch Ersatzpflege genannt, §39 SGB XI) springt ein, wenn Ihre private
            Pflegeperson — meist ein Familienmitglied — wegen Urlaub, Krankheit, eigener Termine oder
            schlicht Erschöpfung nicht pflegen kann. Die Pflegekasse übernimmt dann die Kosten für eine
            Vertretung: eine professionelle Betreuungskraft wie unsere Alltagsbegleiter, einen ambulanten
            Dienst oder auch Nachbarn und Bekannte.
          </p>
          <p style={{ marginTop: 8 }}>
            Seit dem <strong>01.07.2025</strong> gilt der gemeinsame Jahresbetrag: Verhinderungspflege und
            Kurzzeitpflege teilen sich ein flexibles Budget von <strong>bis zu 3.539 € pro Jahr</strong>.
            Die früher nötige Vorpflegezeit von sechs Monaten ist komplett entfallen — der Anspruch
            besteht ab Pflegegrad 2 sofort.
          </p>
        </section>

        <section className="info-card">
          <h3>Ihr Anspruch auf einen Blick</h3>
          <div className="info-price-row">
            <span className="info-price-label">Gemeinsamer Jahresbetrag</span>
            <span className="info-price-val">3.539 €/Jahr</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Rechnerisch pro Monat</span>
            <span className="info-price-val">rund 295 €</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Voraussetzung</span>
            <span className="info-price-val">Pflegegrad 2–5</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Höchstdauer</span>
            <span className="info-price-val">8 Wochen/Jahr</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Vorpflegezeit</span>
            <span className="info-price-val">entfallen</span>
          </div>
          <p className="info-price-note">
            Das Budget ist flexibel zwischen Verhinderungspflege und Kurzzeitpflege aufteilbar.
            Viele Familien schöpfen die 3.539 € nicht aus — verschenken Sie kein Geld.
          </p>
        </section>

        <section className="info-card">
          <h3>Stundenweise Verhinderungspflege — der Alltagsengel-Klassiker</h3>
          <p>
            Sie müssen nicht gleich eine Woche verreisen: Schon wenn Sie als pflegende Angehörige einen
            Nachmittag zum Arzt, zum Sport oder einfach zur Erholung brauchen, greift die
            <strong> stundenweise Verhinderungspflege</strong> (unter 8 Stunden am Tag). Der große
            Vorteil: Das Pflegegeld wird an diesen Tagen <strong>nicht gekürzt</strong>.
          </p>
          <p style={{ marginTop: 8 }}>
            Unsere geprüften und versicherten Alltagsbegleiter übernehmen währenddessen die Betreuung:
            Gesellschaft leisten, Spazierengehen, Kochen, Vorlesen, Sicherheit geben — genau so, wie es
            die Pflegeperson sonst tut.
          </p>
        </section>

        <section className="info-card">
          <h3>Das übernehmen unsere Betreuungskräfte</h3>
          <ul className="info-list">
            <li>Betreuung und Beaufsichtigung während der Abwesenheit der Pflegeperson</li>
            <li>Gesellschaft, Gespräche und geistige Aktivierung — auch bei Demenz</li>
            <li>Mahlzeiten zubereiten und gemeinsames Essen</li>
            <li>Spaziergänge und Begleitung außer Haus</li>
            <li>Unterstützung im Haushalt während des Einsatzes</li>
            <li>Hilfe bei der Tagesstrukturierung</li>
          </ul>
          <p className="info-price-note">
            Keine medizinische Behandlungspflege — dafür arbeiten wir mit ambulanten Diensten zusammen.
          </p>
        </section>

        <section className="info-card">
          <h3>So nutzen Sie die Verhinderungspflege — in 4 Schritten</h3>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-text">Kostenlos bei Alltagsengel registrieren und Bedarf angeben</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">Betreuungskraft in Ihrer Stadt wählen — stundenweise oder tageweise</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">Pflegekasse informieren — wir helfen mit den Formularen</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">4</div>
              <div className="info-step-text">Einsatz läuft — die Erstattung über §39 unterstützen wir komplett</div>
            </div>
          </div>
        </section>

        <section className="info-card">
          <h3>Typische Situationen aus der Praxis</h3>
          <p>
            <strong>Der Jahresurlaub:</strong> Eine Tochter pflegt ihre Mutter in Hanau und möchte
            zwei Wochen verreisen. Unsere Betreuungskraft kommt täglich mehrere Stunden, ein
            ambulanter Dienst übernimmt die Grundpflege — beides läuft über den gemeinsamen
            Jahresbetrag von 3.539 €.
          </p>
          <p style={{ marginTop: 8 }}>
            <strong>Der eigene Arzttermin:</strong> Ein Ehemann pflegt seine Frau in Darmstadt und
            braucht jede Woche einen halben Tag für Physiotherapie und Erledigungen. Die
            stundenweise Verhinderungspflege deckt genau das ab — und sein Pflegegeld bleibt
            ungekürzt.
          </p>
          <p style={{ marginTop: 8 }}>
            <strong>Der Krankheitsfall:</strong> Die pflegende Schwiegertochter fällt mit Grippe
            aus. Weil keine Vorpflegezeit mehr gilt, kann die Familie sofort eine Ersatzkraft über
            Alltagsengel buchen und die Kosten bei der Pflegekasse geltend machen — auch
            rückwirkend.
          </p>
        </section>

        <section className="info-card">
          <h3>Verhinderungspflege mit anderen Leistungen kombinieren</h3>
          <p>
            Die Verhinderungspflege ist ein eigener Topf — und lässt sich mit allen anderen
            Pflegekassen-Leistungen kombinieren:
          </p>
          <ul className="info-list">
            <li>
              <Link href="/entlastungsbetrag">Entlastungsbetrag</Link> — 131 €/Monat ab Pflegegrad 1
              für regelmäßige Alltagsbegleitung; zusammen bis zu 5.111 €/Jahr
            </li>
            <li>
              <Link href="/hygienebox">Pflegebox</Link> — kostenlose Pflegehilfsmittel für bis zu
              42 €/Monat nach §40 SGB XI
            </li>
            <li>
              <Link href="/krankenfahrten">Krankenfahrten</Link> — mit Verordnung zahlt die
              Krankenkasse (§60 SGB V)
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
            Sie planen Urlaub oder brauchen kurzfristig eine Vertretung? Hinterlassen Sie Ihre
            Nummer — wir rufen Sie zurück, kostenlos und unverbindlich.
          </p>
          <LeadForm defaultService="Alltagsbegleitung" source="verhinderungspflege" />
        </section>

        <div className="info-cta">
          <Link href="/choose" className="btn-gold" style={{ width: '100%' }}>JETZT ERSATZPFLEGE FINDEN</Link>
        </div>

        <section className="info-card">
          <h3>Häufige Fragen zur Verhinderungspflege</h3>
          {faqs.map((faq) => (
            <details className="info-faq" key={faq.frage}>
              <summary>{faq.frage}</summary>
              <p>{faq.antwort}</p>
            </details>
          ))}
        </section>

        <section className="info-card">
          <h3>Verhinderungspflege in Ihrer Stadt</h3>
          <p>Unsere Betreuungskräfte übernehmen die Ersatzpflege in diesen Städten:</p>
          <ul className="info-list">
            {cityLinks.map((c) => (
              <li key={c.slug}><Link href={`/alltagsbegleitung/${c.slug}`}>Alltagsbegleitung {c.name}</Link></li>
            ))}
          </ul>
        </section>

        <section className="info-card">
          <h3>Vertiefende Ratgeber</h3>
          <ul className="info-list">
            <li><Link href="/blog/verhinderungspflege-beantragen">Verhinderungspflege beantragen: Schritt für Schritt</Link></li>
            <li><Link href="/blog/entlastungsbetrag-45b">Entlastungsbetrag §45b richtig nutzen</Link></li>
            <li><Link href="/blog/pflegegrad-beantragen">Pflegegrad beantragen: So geht&apos;s</Link></li>
            <li><Link href="/blog/wer-zahlt-alltagsbegleitung">Wer zahlt die Alltagsbegleitung?</Link></li>
          </ul>
        </section>

        <div className="legal-footer-nav">
          <Link href="/alltagsbegleitung">Alltagsbegleitung</Link>
          <Link href="/entlastungsbetrag">Entlastungsbetrag</Link>
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
