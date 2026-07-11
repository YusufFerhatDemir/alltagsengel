import Link from 'next/link'
import type { Metadata } from 'next'
import LeadForm from '@/components/LeadForm'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import HowToSchema from '@/components/HowToSchema'

export const metadata: Metadata = {
  title: 'Alltagsbegleitung — Frankfurt & Rhein-Main | Entlastungsbetrag',
  description: 'Was ist Alltagsbegleitung? Zertifizierte Begleiter nach §45a SGB XI in Frankfurt & Rhein-Main — 131€/Monat über den Entlastungsbetrag (§45b). Definition, Kosten, Ablauf & Kostenübernahme erklärt.',
  keywords: ['Alltagsbegleitung', 'Alltagsbegleitung Frankfurt', 'Alltagsbegleiter finden', 'Alltagsbegleitung Senioren', 'Alltagsbegleitung buchen', 'Entlastungsbetrag', '§45b SGB XI', 'Alltagsbegleiter', 'Pflegegrad', 'Haushaltshilfe', '131 Euro Pflegekasse', 'Was ist Alltagsbegleitung'],
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Alltagsbegleitung — 131€/Monat von der Pflegekasse',
    description: 'Professionelle Alltagsbegleitung in Frankfurt & Rhein-Main. Abrechnung direkt über den Entlastungsbetrag §45b. Versichert und zertifiziert.',
    url: 'https://alltagsengel.care/alltagsbegleitung',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
  },
  alternates: { canonical: 'https://alltagsengel.care/alltagsbegleitung' },
}

// Eine Quelle für sichtbare FAQ UND FAQPage-JSON-LD (Google-Richtlinie:
// Structured-Data-FAQs müssen sichtbar auf der Seite stehen)
const faqs: { frage: string; antwort: string }[] = [
  {
    frage: 'Was kostet Alltagsbegleitung?',
    antwort: 'Alltagsbegleitung kostet ab 32 € pro Stunde. Mit einem anerkannten Pflegegrad stehen Ihnen über den Entlastungsbetrag (§45b SGB XI) 131 € monatlich zu, die direkt mit der Pflegekasse abgerechnet werden — für Sie entsteht in diesem Rahmen kein Eigenanteil.',
  },
  {
    frage: 'Wer bezahlt die Alltagsbegleitung?',
    antwort: 'Die Alltagsbegleitung wird über den Entlastungsbetrag nach §45b SGB XI von der Pflegekasse bezahlt. Jede pflegebedürftige Person mit Pflegegrad 1 bis 5 hat Anspruch auf 131 € pro Monat. Wir rechnen direkt mit Ihrer Pflegekasse ab — Sie müssen nicht in Vorleistung gehen.',
  },
  {
    frage: 'Was macht ein Alltagsbegleiter?',
    antwort: 'Ein Alltagsbegleiter unterstützt Sie bei allem, was im Alltag anfällt: Einkaufen, Kochen, leichte Hausarbeit, Begleitung zu Arzt- und Behördenterminen, Spaziergänge, Gespräche und Gesellschaft. Es handelt sich nicht um medizinische Pflege, sondern um praktische Hilfe und psychosoziale Betreuung.',
  },
  {
    frage: 'Was ist der Unterschied zwischen Alltagsbegleitung und Pflege?',
    antwort: 'Pflege umfasst körperbezogene Maßnahmen wie Waschen, Anziehen oder das Verabreichen von Medikamenten und wird von einem Pflegedienst erbracht. Alltagsbegleitung übernimmt keine medizinischen Aufgaben, sondern unterstützt bei Haushalt, Besorgungen, Terminen und Gesellschaft. Beides ergänzt sich und wird aus unterschiedlichen Töpfen finanziert.',
  },
  {
    frage: 'Wie finde ich einen Alltagsbegleiter?',
    antwort: 'Über Alltagsengel finden Sie einen zertifizierten Alltagsbegleiter in Ihrer Nähe. Registrieren Sie sich kostenlos, geben Sie Ihren Pflegegrad an und wählen Sie einen geprüften und versicherten Engel aus. Die Terminbuchung und die Abrechnung mit der Pflegekasse übernehmen wir für Sie.',
  },
  {
    frage: 'Was ist der Entlastungsbetrag?',
    antwort: 'Der Entlastungsbetrag nach §45b SGB XI ist eine Leistung der Pflegeversicherung in Höhe von 131 € pro Monat. Er steht allen Menschen mit Pflegegrad 1 bis 5 zu und ist zweckgebunden — unter anderem für Alltagsbegleitung. Nicht genutzte Beträge können angespart und bis zum 30. Juni des Folgejahres verwendet werden, danach verfallen sie.',
  },
  {
    frage: 'Bekomme ich Alltagsbegleitung auch mit Pflegegrad 1?',
    antwort: 'Ja. Der Entlastungsbetrag von 131 € monatlich steht bereits ab Pflegegrad 1 zur Verfügung. Damit können Sie Alltagsbegleitung ohne eigene Zuzahlung nutzen. Auch ohne Pflegegrad ist eine Buchung als Selbstzahler möglich.',
  },
  {
    frage: 'Verfällt der Entlastungsbetrag, wenn ich ihn nicht nutze?',
    antwort: 'Nicht genutzte Entlastungsbeträge werden zunächst angespart. Beträge aus dem laufenden Jahr können noch bis zum 30. Juni des Folgejahres verwendet werden. Danach verfällt der Restbetrag. Es lohnt sich daher, die 131 € pro Monat regelmäßig für Alltagsbegleitung einzusetzen.',
  },
]

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Service',
      name: 'Alltagsbegleitung',
      description: 'Zertifizierte Alltagsbegleitung nach §45a SGB XI in Frankfurt und dem Rhein-Main-Gebiet. Haushaltshilfe, Arztbegleitung, Einkaufshilfe und psychosoziale Betreuung — abrechenbar über den Entlastungsbetrag §45b SGB XI.',
      image: 'https://alltagsengel.care/og-image.png',
      provider: { '@id': 'https://alltagsengel.care/#localbusiness' },
      areaServed: [
        { '@type': 'City', name: 'Frankfurt am Main' },
        { '@type': 'City', name: 'Offenbach am Main' },
        { '@type': 'City', name: 'Darmstadt' },
        { '@type': 'City', name: 'Wiesbaden' },
        { '@type': 'City', name: 'Mainz' },
        { '@type': 'City', name: 'Hanau' },
        { '@type': 'City', name: 'Bad Homburg' },
        { '@type': 'AdministrativeArea', name: 'Rhein-Main-Gebiet' },
      ],
      serviceType: 'Alltagsbegleitung',
      offers: {
        '@type': 'Offer',
        price: '32.00',
        priceCurrency: 'EUR',
        priceSpecification: { '@type': 'UnitPriceSpecification', price: '32.00', priceCurrency: 'EUR', unitText: 'Stunde' },
        description: '131€/Monat über Entlastungsbetrag §45b SGB XI abrechenbar',
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
  ],
}

export default function AlltagsbegleitungPage() {
  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BreadcrumbSchema items={[{ name: 'Alltagsbegleitung' }]} />
      <HowToSchema
        name="Alltagsbegleitung über Alltagsengel buchen"
        description="So buchen Sie eine zertifizierte Alltagsbegleitung über den Entlastungsbetrag (§45b SGB XI, 131€/Monat) bei Alltagsengel in Frankfurt & Rhein-Main."
        totalTime="PT5M"
        steps={[
          { name: 'Kostenlos registrieren', text: 'Erstellen Sie ein kostenloses Konto bei Alltagsengel — in der App oder auf alltagsengel.care.', url: '/auth/register' },
          { name: 'Pflegegrad angeben', text: 'Geben Sie Ihren Pflegegrad (1–5) an. Mit Pflegegrad stehen Ihnen 131€/Monat Entlastungsbetrag zu.' },
          { name: 'Engel in Ihrer Nähe finden', text: 'Wählen Sie einen zertifizierten Alltagsbegleiter in Ihrer Nähe aus. Alle Engel sind versichert und geprüft.' },
          { name: 'Termin buchen', text: 'Buchen Sie einen Termin — die Abrechnung erfolgt direkt über den Entlastungsbetrag §45b mit Ihrer Pflegekasse.' },
        ]}
      />
      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Alltagsbegleitung</h1>
      </div>
      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">💛</div>
          <h2 className="info-hero-title">Alltagsbegleitung nach § 45a SGB XI</h2>
          <p className="info-hero-sub">Zertifizierte Begleiter für Ihren Alltag — versichert und über den Entlastungsbetrag abrechenbar</p>
        </div>

        <section className="info-card">
          <h3>Was ist Alltagsbegleitung?</h3>
          <p>
            Alltagsbegleitung ist die praktische und soziale Unterstützung pflegebedürftiger Menschen
            in ihrem eigenen Zuhause. Sie umfasst all jene Tätigkeiten, die den Alltag ausmachen, aber
            mit zunehmendem Alter, nach einer Erkrankung oder bei eingeschränkter Mobilität nicht mehr
            allein zu bewältigen sind: den Einkauf erledigen, eine warme Mahlzeit zubereiten, die Wohnung
            in Ordnung halten, zum Arzt oder zur Behörde begleiten — und, mindestens ebenso wichtig,
            einfach da sein und Gesellschaft leisten.
          </p>
          <p style={{ marginTop: 12 }}>
            Rechtlich ist die Alltagsbegleitung in <strong>§45a SGB XI</strong> verankert. Der Gesetzgeber
            fasst sie unter den „Angeboten zur Unterstützung im Alltag" zusammen. Anbieter und einzelne
            Alltagsbegleiter müssen dafür nach den Vorgaben des jeweiligen Bundeslandes anerkannt und
            qualifiziert sein. Unsere Alltagsbegleiter — bei Alltagsengel „Engel" genannt — sind
            entsprechend geschult, geprüft und über unsere Plattform haftpflichtversichert.
          </p>
          <p style={{ marginTop: 12 }}>
            Der große Vorteil: Für Menschen mit einem anerkannten Pflegegrad wird die Alltagsbegleitung
            über den <strong>Entlastungsbetrag nach §45b SGB XI</strong> finanziert. Das sind
            <strong> 131 € pro Monat</strong>, die die Pflegekasse zweckgebunden bereitstellt. In diesem
            Rahmen entsteht für Sie kein Eigenanteil — die Betreuung ist also faktisch kostenlos, solange
            Sie innerhalb des monatlichen Budgets bleiben.
          </p>
        </section>

        <section className="info-card">
          <h3>Alltagsbegleitung oder Pflege — wo liegt der Unterschied?</h3>
          <p>
            Alltagsbegleitung und Pflege werden häufig verwechselt, sind aber zwei klar getrennte
            Leistungen. Die <strong>Pflege</strong> — erbracht durch einen ambulanten Pflegedienst —
            umfasst körperbezogene Maßnahmen: Waschen, Anziehen, Hilfe beim Toilettengang, die Gabe
            von Medikamenten, Wundversorgung oder das Anlegen von Verbänden. Diese sogenannte
            Behandlungs- und Grundpflege darf nur von entsprechend ausgebildeten Pflegekräften
            durchgeführt und wird über die Pflegesachleistungen (§36 SGB XI) oder die häusliche
            Krankenpflege (§37 SGB V) abgerechnet.
          </p>
          <p style={{ marginTop: 12 }}>
            Die <strong>Alltagsbegleitung</strong> übernimmt bewusst <em>keine</em> medizinischen oder
            pflegerischen Aufgaben. Ihr Schwerpunkt liegt auf hauswirtschaftlicher Unterstützung,
            Begleitung, Betreuung und sozialer Teilhabe. Beide Leistungen schließen sich nicht aus,
            sondern ergänzen einander: Während der Pflegedienst morgens bei der Körperpflege hilft,
            sorgt der Alltagsbegleiter am Nachmittag dafür, dass der Kühlschrank gefüllt ist, Post
            erledigt wird und der Spaziergang nicht ausfällt. Wichtig zu wissen: Beide werden aus
            <strong> unterschiedlichen Budgets</strong> der Pflegeversicherung bezahlt — Sie müssen
            sich also nicht zwischen Pflege und Alltagsbegleitung entscheiden.
          </p>
        </section>

        <section className="info-card">
          <h3>Unsere Leistungen</h3>
          <ul className="info-list">
            <li>Haushaltsnahe Hilfen (Einkaufen, Kochen, Putzen)</li>
            <li>Begleitung zu Arztterminen und Behörden</li>
            <li>Spaziergänge und Freizeitgestaltung</li>
            <li>Psychosoziale Betreuung und Gespräche</li>
            <li>Antragshilfen bei Pflegekasse und Behörden</li>
            <li>Unterstützung bei der Tagesstrukturierung</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Preise</h3>
          <div className="info-price-row">
            <span className="info-price-label">Stundensatz</span>
            <span className="info-price-val">ab 32,00 €</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Entlastungsbetrag (§ 45b)</span>
            <span className="info-price-val">131 €/Monat</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Versicherungsschutz</span>
            <span className="info-price-val">inklusive</span>
          </div>
          <p className="info-price-note">
            Mit dem Entlastungsbetrag (§ 45b SGB XI) stehen Ihnen 131 € monatlich zu, die direkt
            mit der Pflegekasse abgerechnet werden. Nicht genutzte Beträge verfallen am 30. Juni
            des Folgejahres.
          </p>
        </section>

        <section className="info-card">
          <h3>Wer hat Anspruch?</h3>
          <p>
            Jede Person mit anerkanntem Pflegegrad (1–5) hat Anspruch auf den Entlastungsbetrag
            von 131 € monatlich. Damit können Sie Alltagsbegleitung über Alltagsengel buchen —
            ohne eigene Zuzahlung. Auch mit dem niedrigsten Pflegegrad 1, bei dem viele andere
            Leistungen der Pflegeversicherung noch nicht greifen, steht Ihnen der Entlastungsbetrag
            bereits in voller Höhe zu. Wer noch keinen Pflegegrad hat, kann die Alltagsbegleitung
            als Selbstzahler nutzen — und wir unterstützen Sie gerne bei der Antragstellung.
          </p>
        </section>

        <section className="info-card">
          <h3>So läuft eine Alltagsbegleitung typischerweise ab</h3>
          <p>
            Jede Begleitung richtet sich nach Ihren individuellen Bedürfnissen — kein Tag gleicht
            dem anderen. Ein typischer Ablauf sieht jedoch oft so aus:
          </p>
          <ul className="info-list" style={{ marginTop: 12 }}>
            <li><strong>Ankunft & kurze Absprache:</strong> Der Engel kommt zum vereinbarten Termin
              zu Ihnen nach Hause und bespricht mit Ihnen, was heute ansteht.</li>
            <li><strong>Besorgungen & Haushalt:</strong> Gemeinsam oder stellvertretend werden
              Einkäufe erledigt, eine Mahlzeit gekocht, die Wohnung aufgeräumt oder Wäsche versorgt.</li>
            <li><strong>Termine & Wege:</strong> Bei Bedarf begleitet Sie der Engel zum Arzt, zur
              Apotheke, zur Bank oder zu einem Behördentermin — zu Fuß, mit dem ÖPNV oder im Auto.</li>
            <li><strong>Gesellschaft & Aktivierung:</strong> Ein Spaziergang, ein Gespräch, ein
              Spielenachmittag oder gemeinsames Gedächtnistraining — soziale Teilhabe ist ein
              Kernbestandteil der Alltagsbegleitung.</li>
            <li><strong>Dokumentation & Abrechnung:</strong> Die geleisteten Stunden werden in der
              App erfasst und automatisch über den Entlastungsbetrag mit der Pflegekasse abgerechnet.</li>
          </ul>
          <p style={{ marginTop: 12 }}>
            Sie bestimmen Rhythmus und Umfang selbst: Manche Menschen buchen eine feste wöchentliche
            Begleitung, andere nur punktuell bei einem anstehenden Arzttermin. Über die Alltagsengel-App
            können Sie Termine flexibel planen, verschieben oder absagen.
          </p>
        </section>

        <section className="info-card">
          <h3>Kostenübernahme im Detail</h3>
          <p>
            Die Finanzierung der Alltagsbegleitung erfolgt in der Regel über den <strong>Entlastungsbetrag
            nach §45b SGB XI</strong>. Dieser beträgt seit der Pflegereform <strong>131 € pro Monat</strong>
            und steht allen Versicherten mit Pflegegrad 1 bis 5 zu. Der Betrag ist zweckgebunden und darf
            unter anderem für anerkannte Angebote zur Unterstützung im Alltag — also für Alltagsbegleitung —
            eingesetzt werden.
          </p>
          <p style={{ marginTop: 12 }}>
            Wichtig sind zwei Regeln: Erstens wird der Entlastungsbetrag <strong>nicht bar ausgezahlt</strong>,
            sondern im Wege der Kostenerstattung bzw. Direktabrechnung mit einem anerkannten Anbieter
            verrechnet. Bei Alltagsengel übernehmen wir diese Abrechnung vollständig für Sie — Sie müssen
            weder in Vorleistung gehen noch Belege einreichen. Zweitens wird ein nicht ausgeschöpfter Betrag
            <strong> angespart</strong>: Guthaben aus dem laufenden Kalenderjahr bleibt noch bis zum
            <strong> 30. Juni des Folgejahres</strong> nutzbar und verfällt erst danach.
          </p>
          <p style={{ marginTop: 12 }}>
            Reicht der Entlastungsbetrag nicht aus, lassen sich weitere Töpfe kombinieren: So können
            bis zu 40 % der ambulanten Pflegesachleistungen (§36 SGB XI) zusätzlich in Betreuungs- und
            Entlastungsleistungen umgewandelt werden. Auch die Verhinderungspflege (§39 SGB XI) lässt sich
            für Alltagsbegleitung einsetzen. Welche Kombination in Ihrem Fall sinnvoll ist, erklären wir
            Ihnen gerne in einer kostenlosen Beratung. Einen Überblick über alle Ansprüche nach Pflegegrad
            finden Sie außerdem auf unserer <Link href="/finanzierung">Finanzierungsseite</Link>.
          </p>
        </section>

        <section className="info-card">
          <h3>So funktioniert&apos;s</h3>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-text">Registrieren Sie sich kostenlos bei Alltagsengel</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">Wählen Sie einen Engel in Ihrer Nähe aus</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">Buchen Sie Termine — Abrechnung über § 45b</div>
            </div>
          </div>
        </section>

        <section className="info-card">
          <h3>Für Alltagsbegleiter (Engel)</h3>
          <p>
            Sie möchten als Alltagsbegleiter tätig werden? Bei Alltagsengel arbeiten Sie selbstständig,
            erhalten bundesweit Aufträge und sind über unsere Plattform versichert.
          </p>
          <div style={{ marginTop: 16 }}>
            <Link href="/auth/register?role=engel" className="btn-ghost" style={{ width: '100%' }}>ALS ENGEL REGISTRIEREN</Link>
          </div>
        </section>

        <section className="info-card">
          <h3>Kostenlose Beratung anfragen</h3>
          <p style={{ marginBottom: 16 }}>
            Sie haben Fragen zur Alltagsbegleitung oder zum Entlastungsbetrag?
            Hinterlassen Sie Ihre Nummer — wir rufen Sie zurück, kostenlos und unverbindlich.
          </p>
          <LeadForm defaultService="Alltagsbegleitung" source="alltagsbegleitung" />
        </section>

        <div className="info-cta">
          <Link href="/choose" className="btn-gold" style={{ width: '100%' }}>JETZT ENGEL FINDEN</Link>
        </div>

        <section className="info-card">
          <h3>Häufige Fragen zur Alltagsbegleitung</h3>
          {faqs.map((faq) => (
            <details className="info-faq" key={faq.frage}>
              <summary>{faq.frage}</summary>
              <p>{faq.antwort}</p>
            </details>
          ))}
        </section>

        <section className="info-card">
          <h3>Alltagsbegleitung in Ihrer Stadt</h3>
          <ul className="info-list">
            <li><Link href="/alltagsbegleitung/frankfurt">Alltagsbegleitung Frankfurt am Main</Link></li>
            <li><Link href="/alltagsbegleitung/offenbach">Alltagsbegleitung Offenbach am Main</Link></li>
            <li><Link href="/alltagsbegleitung/wiesbaden">Alltagsbegleitung Wiesbaden</Link></li>
            <li><Link href="/alltagsbegleitung/darmstadt">Alltagsbegleitung Darmstadt</Link></li>
            <li><Link href="/alltagsbegleitung/hanau">Alltagsbegleitung Hanau</Link></li>
            <li><Link href="/alltagsbegleitung/bad-homburg">Alltagsbegleitung Bad Homburg</Link></li>
            <li><Link href="/alltagsbegleitung/mainz">Alltagsbegleitung Mainz</Link></li>
            <li><Link href="/alltagsbegleitung/aschaffenburg">Alltagsbegleitung Aschaffenburg</Link></li>
            <li><Link href="/alltagsbegleitung/frankfurt-hoechst">Alltagsbegleitung Frankfurt-Höchst</Link></li>
            <li><Link href="/alltagsbegleitung/neu-isenburg">Alltagsbegleitung Neu-Isenburg</Link></li>
            <li><Link href="/alltagsbegleitung/friedberg-wetterau">Alltagsbegleitung Friedberg (Wetterau)</Link></li>
            <li><Link href="/alltagsbegleitung/rodgau">Alltagsbegleitung Rodgau</Link></li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Weitere Leistungen</h3>
          <ul className="info-list">
            <li><Link href="/hygienebox">Pflegebox — kostenlose Pflegehilfsmittel (42€/Monat)</Link></li>
            <li><Link href="/krankenfahrten">Krankenfahrten — sicher zum Arzt (§60 SGB V)</Link></li>
            <li><Link href="/finanzierung">Finanzierung — bis zu 5.111 €/Jahr, nach Pflegegrad erklärt</Link></li>
            <li><Link href="/blog/entlastungsbetrag-45b">Ratgeber: Entlastungsbetrag §45b richtig nutzen</Link></li>
            <li><Link href="/jobs">Jobs — Teil des Alltagsengel-Teams werden</Link></li>
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
