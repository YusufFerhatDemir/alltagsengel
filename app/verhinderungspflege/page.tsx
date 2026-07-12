import Link from 'next/link'
import type { Metadata } from 'next'
import LeadForm from '@/components/LeadForm'
import HowToSchema from '@/components/HowToSchema'
import SpeakableSchema from '@/components/SpeakableSchema'

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
  {
    frage: 'Gilt Verhinderungspflege auch abends und am Wochenende?',
    antwort:
      'Ja. Die Verhinderungspflege ist nicht an Werktage oder Tageszeiten gebunden — auch ein Abendeinsatz, damit die Pflegeperson ins Theater kann, oder eine Wochenendbetreuung sind erstattungsfähig.',
  },
  {
    frage: 'Kann ich Verhinderungspflege rückwirkend abrechnen?',
    antwort:
      'Ja. Wenn die Voraussetzungen erfüllt waren und Belege vorliegen, erstattet die Pflegekasse auch nachträglich — Ansprüche verjähren erst nach vier Jahren. Prüfen Sie also alte Rechnungen für Ersatzpflege-Einsätze.',
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
      <SpeakableSchema url="/verhinderungspflege" />
      <HowToSchema
        name="Verhinderungspflege beantragen"
        description="So beantragen Sie Verhinderungspflege nach §39 SGB XI (gemeinsamer Jahresbetrag 3.539 €/Jahr) — von der Voraussetzungsprüfung bis zur Erstattung durch die Pflegekasse."
        totalTime="PT15M"
        steps={[
          { name: 'Voraussetzungen prüfen', text: 'Sie benötigen Pflegegrad 2–5 und eine private Pflegeperson, die vorübergehend verhindert ist. Eine Vorpflegezeit ist seit dem 01.07.2025 nicht mehr erforderlich.' },
          { name: 'Ersatzpflege organisieren', text: 'Wählen Sie eine geprüfte Betreuungskraft — stundenweise (unter 8 Stunden/Tag, ohne Pflegegeld-Kürzung) oder tageweise. Alltagsengel vermittelt versicherte Betreuungskräfte im Rhein-Main-Gebiet.', url: '/choose' },
          { name: 'Pflegekasse informieren', text: 'Melden Sie den Einsatz idealerweise vorab formlos bei Ihrer Pflegekasse an — das sichert die Kostenübernahme. Eine nachträgliche Beantragung ist ebenfalls möglich.' },
          { name: 'Antrag und Nachweise einreichen', text: 'Reichen Sie das Antragsformular Ihrer Kasse mit den Einsatz-Nachweisen ein. Die Kasse erstattet bis zu 3.539 € pro Jahr aus dem gemeinsamen Jahresbetrag. Alltagsengel hilft bei Formularen und Abrechnung.' },
        ]}
      />
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
          <h3>Tageweise Verhinderungspflege: Das passiert mit dem Pflegegeld</h3>
          <p>
            Dauert die Vertretung <strong>8 Stunden oder länger</strong> am Tag, gilt sie als
            tageweise Verhinderungspflege. Das Pflegegeld wird dann für den ersten und letzten
            Tag in voller Höhe gezahlt, für die Tage dazwischen zur Hälfte — seit der Reform
            2025 für <strong>bis zu 8 Wochen pro Kalenderjahr</strong>. Wer die Kürzung vermeiden
            will, plant Einsätze unter 8 Stunden: Bei der stundenweisen Variante läuft das
            Pflegegeld ungekürzt weiter, und die Höchstdauer wird nicht angerechnet.
          </p>
          <p style={{ marginTop: 8 }}>
            Übrigens: Aus demselben gemeinsamen Jahresbetrag wird auch die
            <strong> Kurzzeitpflege</strong> (§42 SGB XI) bezahlt — die vorübergehende
            vollstationäre Unterbringung, etwa nach einem Krankenhausaufenthalt. Sie entscheiden
            flexibel, wie Sie die 3.539 € zwischen beiden Leistungen aufteilen.
          </p>
        </section>

        <section className="info-card">
          <h3>Wer darf die Ersatzpflege übernehmen?</h3>
          <p>
            Grundsätzlich sind Sie frei in der Wahl: professionelle Betreuungskräfte, ambulante
            Pflegedienste, Nachbarn, Freunde oder Verwandte. Es gibt aber einen wichtigen
            Unterschied bei der Erstattung:
          </p>
          <ul className="info-list" style={{ marginTop: 12 }}>
            <li><strong>Professionelle Kräfte & nicht verwandte Personen:</strong> Erstattung
              der tatsächlichen Kosten bis zum vollen Jahresbetrag von 3.539 €.</li>
            <li><strong>Nahe Angehörige (bis 2. Grad) und Personen im selben Haushalt:</strong>
              Erstattung begrenzt auf das 1,5-fache des monatlichen Pflegegeldes; nachgewiesene
              Aufwendungen wie Fahrtkosten oder Verdienstausfall können zusätzlich bis zum
              Jahresbetrag geltend gemacht werden.</li>
          </ul>
          <p style={{ marginTop: 8 }}>
            Mit einer professionellen Betreuungskraft von Alltagsengel schöpfen Sie das Budget
            also ohne Deckelung aus — und die Einsätze sind versichert und dokumentiert.
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
          <h3>Verhinderungspflege oder Kurzzeitpflege — was passt wann?</h3>
          <p>
            Beide Leistungen teilen sich seit dem 01.07.2025 den gemeinsamen Jahresbetrag von
            3.539 € — sie lösen aber unterschiedliche Situationen:
          </p>
          <ul className="info-list" style={{ marginTop: 12 }}>
            <li><strong>Verhinderungspflege (§39):</strong> Die Ersatzpflege kommt <em>nach
              Hause</em> — die pflegebedürftige Person bleibt in ihrer gewohnten Umgebung.
              Ideal bei Urlaub, Krankheit oder regelmäßigen Auszeiten der Pflegeperson.</li>
            <li><strong>Kurzzeitpflege (§42):</strong> Die pflegebedürftige Person zieht
              <em> vorübergehend in eine stationäre Einrichtung</em> — typisch nach einem
              Krankenhausaufenthalt, wenn die Versorgung zu Hause noch nicht wieder steht,
              oder wenn rund um die Uhr Betreuung nötig ist.</li>
          </ul>
          <p style={{ marginTop: 12 }}>
            Die Flexibilisierung bedeutet: Sie müssen sich nicht mehr im Voraus festlegen, wie
            viel Budget in welchen Topf fließt. Eine Familie kann im Frühjahr zwei Wochen
            Kurzzeitpflege nutzen und im Sommer den Rest für stundenweise Verhinderungspflege
            einsetzen — solange die Summe 3.539 € nicht übersteigt.
          </p>
        </section>

        <section className="info-card">
          <h3>Beispielrechnung: So weit reicht das Budget</h3>
          <p>
            <strong>Szenario 1 — regelmäßige Auszeit:</strong> Eine Betreuungskraft kommt jeden
            Freitag für 4 Stunden (stundenweise Verhinderungspflege). Bei rund 35 € pro Stunde
            sind das etwa 140 € pro Woche bzw. 560–600 € im Monat. Das Jahresbudget von 3.539 €
            trägt damit rund ein halbes Jahr wöchentlicher Entlastung — und weil zusätzlich der
            <Link href="/entlastungsbetrag"> Entlastungsbetrag (131 €/Monat)</Link> für
            Alltagsbegleitung genutzt werden kann, lässt sich die Betreuung ganzjährig
            durchfinanzieren.
          </p>
          <p style={{ marginTop: 12 }}>
            <strong>Szenario 2 — zwei Wochen Urlaub:</strong> Während der Reise der Pflegeperson
            kommt die Ersatzkraft täglich 5 Stunden. 14 Tage × 5 Stunden × 35 € ergeben 2.450 € —
            das Budget deckt den kompletten Urlaub, und es bleiben noch über 1.000 € für den Rest
            des Jahres. Das Pflegegeld läuft während der stundenweisen Einsätze in voller Höhe
            weiter.
          </p>
          <p style={{ marginTop: 12 }}>
            Wie viel Budget in Ihrer Konstellation verfügbar ist, rechnet der
            <Link href="/budgetrechner"> Budgetrechner</Link> in zwei Minuten aus.
          </p>
        </section>

        <section className="info-card">
          <h3>Warum Pausen für pflegende Angehörige so wichtig sind</h3>
          <p>
            Wer einen Menschen pflegt, arbeitet oft sieben Tage die Woche — ohne Urlaub, ohne
            Feierabend, häufig neben Beruf und Familie. Studien zeigen, dass pflegende Angehörige
            überdurchschnittlich oft an Erschöpfung, Rückenleiden und depressiven Verstimmungen
            erkranken. Wer sich keine Auszeiten nimmt, riskiert den eigenen Zusammenbruch — und
            damit auch die Versorgung des pflegebedürftigen Menschen.
          </p>
          <p style={{ marginTop: 8 }}>
            Genau dafür hat der Gesetzgeber die Verhinderungspflege geschaffen: Sie ist kein
            Luxus, sondern eine Vorsorgeleistung. Regelmäßige stundenweise Entlastung — ein freier
            Nachmittag pro Woche, ein Wochenende im Monat — wirkt nachweislich besser als eine
            einzige lange Pause im Jahr. Nutzen Sie das Budget, es ist für Sie da.
          </p>
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
          <h3>Sonderfälle und Kombinationen</h3>
          <ul className="info-list">
            <li><strong>Tagespflege parallel:</strong> Besucht die pflegebedürftige Person
              tagsüber eine Tagespflege-Einrichtung, bleibt der Anspruch auf Verhinderungspflege
              unberührt — beide Leistungen haben eigene Budgets.</li>
            <li><strong>Mehrere Pflegepersonen:</strong> Teilen sich z. B. zwei Geschwister die
              Pflege, greift die Verhinderungspflege, sobald eine der Pflegepersonen ausfällt —
              es muss nicht die „Hauptpflegeperson" sein.</li>
            <li><strong>Verhinderungspflege im Ausland:</strong> Innerhalb der EU kann die
              Ersatzpflege sogar während eines gemeinsamen Urlaubs erbracht werden — etwa wenn
              die Betreuungskraft mitreist.</li>
            <li><strong>Kein Pflegegeld-Antrag nötig:</strong> Verhinderungspflege setzt nicht
              voraus, dass Pflegegeld bezogen wird — entscheidend sind Pflegegrad 2–5 und die
              häusliche Pflege durch eine Privatperson.</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Checkliste: Verhinderungspflege gut vorbereiten</h3>
          <ul className="info-list">
            <li><strong>Budget prüfen:</strong> Fragen Sie bei der Pflegekasse nach, wie viel vom
              gemeinsamen Jahresbetrag noch verfügbar ist — besonders, wenn im Jahr schon
              Kurzzeitpflege genutzt wurde.</li>
            <li><strong>Frühzeitig planen:</strong> Für geplante Auszeiten (Urlaub, Kur) die
              Ersatzpflege 4–6 Wochen vorher organisieren und die Kasse formlos informieren.</li>
            <li><strong>Übergabe vorbereiten:</strong> Ein kurzer Zettel mit Tagesablauf,
              Medikamentenzeiten (Erinnerung, keine Gabe), Vorlieben und Notfallnummern hilft der
              Ersatzkraft enorm — und beruhigt alle Beteiligten.</li>
            <li><strong>Kennenlerntermin einplanen:</strong> Ein erster gemeinsamer Termin, bei dem
              die Pflegeperson noch dabei ist, schafft Vertrauen — gerade bei Demenz wichtig.</li>
            <li><strong>Belege sammeln:</strong> Einsatznachweise und Rechnungen aufbewahren; bei
              Alltagsengel sind alle Einsätze automatisch in der App dokumentiert.</li>
          </ul>
          <p style={{ marginTop: 12 }}>
            Übrigens: Ansprüche verjähren erst nach vier Jahren. Wer in den vergangenen Jahren
            Ersatzpflege aus eigener Tasche bezahlt hat und die Belege noch besitzt, kann die
            Erstattung auch <strong>rückwirkend</strong> bei der Pflegekasse beantragen. Wie das
            geht, zeigt der Ratgeber
            <Link href="/blog/verhinderungspflege-beantragen"> Verhinderungspflege beantragen</Link>.
          </p>
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
