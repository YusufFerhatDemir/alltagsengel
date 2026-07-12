import Link from 'next/link'
import type { Metadata } from 'next'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import HowToSchema from '@/components/HowToSchema'
import SpeakableSchema from '@/components/SpeakableSchema'

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
  // KEIN areaServed hier: ist keine gültige Product-Property (nur
  // Organization/Service/Offer) — Liefergebiet steht an den Offers + im Text.
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
  {
    frage: 'Was ist der Unterschied zwischen Pflegebox und technischen Hilfsmitteln?',
    antwort: 'Die Pflegebox enthält Verbrauchsprodukte (Handschuhe, Desinfektion, Bettschutz), die über die 42-€-Pauschale nach §40 SGB XI laufen. Technische Hilfsmittel wie Pflegebetten oder Hausnotruf werden separat beantragt und mindern die Pauschale nicht — beides ist parallel nutzbar.',
  },
  {
    frage: 'Mindert die Pflegebox mein Pflegegeld oder den Entlastungsbetrag?',
    antwort: 'Nein. Die 42 € für Pflegehilfsmittel sind ein eigener Anspruch nach §40 SGB XI und werden auf keine andere Leistung angerechnet — weder auf das Pflegegeld noch auf den Entlastungsbetrag von 131 €/Monat.',
  },
  {
    frage: 'Kann ich die Zusammenstellung der Pflegebox ändern?',
    antwort: 'Ja, jederzeit. Sie können Produkte tauschen, Mengen anpassen oder Größen ändern — zum Beispiel mehr Bettschutzeinlagen und weniger Handschuhe. Die Anpassung gilt ab der nächsten Monatslieferung.',
  },
  {
    frage: 'Brauche ich ein Rezept vom Arzt für die Pflegebox?',
    antwort: 'Nein. Anders als bei Medikamenten oder technischen Hilfsmitteln genügt für Pflegehilfsmittel zum Verbrauch der anerkannte Pflegegrad. Der Antrag geht direkt an die Pflegekasse — ohne Arztbesuch.',
  },
  {
    frage: 'Was passiert bei einem Krankenkassen- oder Pflegekassenwechsel?',
    antwort: 'Die Genehmigung muss bei der neuen Pflegekasse neu beantragt werden. Alltagsengel übernimmt das für Sie — die Lieferung läuft in der Regel ohne Unterbrechung weiter.',
  },
  {
    frage: 'Gilt der Anspruch auch bei privater Pflegeversicherung?',
    antwort: 'Ja. Privat Pflegeversicherte haben denselben Anspruch auf Pflegehilfsmittel zum Verbrauch. Die Abwicklung läuft je nach Versicherer über Kostenerstattung — wir stellen die nötigen Unterlagen bereit.',
  },
  {
    frage: 'Kann ich nicht genutzte Monatsbeträge ansparen?',
    antwort: 'Nein. Die 42 € sind eine Monatspauschale und verfallen am Monatsende — anders als der Entlastungsbetrag, der bis zum 30. Juni des Folgejahres angespart werden kann. Eine laufende monatliche Lieferung schöpft das Budget deshalb am besten aus.',
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
      <SpeakableSchema url="/hygienebox" />
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
          <h3>Was ist die Hygienebox (Pflegebox)?</h3>
          <p>
            Die Hygienebox — oft auch Pflegebox genannt — ist ein monatliches Paket mit
            <strong> Pflegehilfsmitteln zum Verbrauch</strong> nach <strong>§40 SGB XI</strong>:
            Einmalhandschuhe, Desinfektionsmittel, Bettschutzeinlagen, Mundschutz und
            Schutzschürzen. Diese Produkte schützen Pflegebedürftige und pflegende Angehörige
            gleichermaßen vor Infektionen und erleichtern die tägliche Pflege zu Hause.
          </p>
          <p style={{ marginTop: 12 }}>
            Das Beste daran: Die Pflegekasse übernimmt die Kosten bis zu <strong>42 € pro
            Monat</strong> — das sind bis zu <strong>504 € pro Jahr</strong>, die vielen
            Pflegehaushalten entgehen, weil der Anspruch schlicht unbekannt ist. Ein Rezept ist
            nicht nötig, eine Zuzahlung fällt nicht an. Alltagsengel übernimmt den Antrag bei
            Ihrer Pflegekasse und liefert die Box monatlich versandkostenfrei nach Hause.
          </p>
        </section>

        <section className="info-card">
          <h3>Wer hat Anspruch auf die kostenlose Pflegebox?</h3>
          <p>
            Der Anspruch nach §40 SGB XI ist an drei Bedingungen geknüpft — alle drei sind
            bewusst niedrigschwellig:
          </p>
          <ul className="info-list" style={{ marginTop: 12 }}>
            <li>Ein anerkannter <strong>Pflegegrad 1 bis 5</strong> — schon der niedrigste
              Pflegegrad genügt</li>
            <li>Pflege in <strong>häuslicher Umgebung</strong> — zu Hause, bei Angehörigen oder
              in einer Wohngemeinschaft (nicht im Pflegeheim)</li>
            <li>Pflege durch <strong>Angehörige, Freunde, Nachbarn oder einen ambulanten
              Dienst</strong> — mindestens teilweise nicht-professionell</li>
          </ul>
          <p style={{ marginTop: 12 }}>
            Damit steht die Pflegebox praktisch jedem Pflegehaushalt zu — auch bei
            <strong> Pflegegrad 1</strong>, bei dem es weder Pflegegeld noch Pflegesachleistungen
            gibt. Zusammen mit dem <Link href="/entlastungsbetrag">Entlastungsbetrag
            (131 €/Monat)</Link> ist sie eine der beiden Leistungen, die ab dem ersten Pflegegrad
            voll ausgeschöpft werden können. Mehr dazu im Ratgeber
            <Link href="/blog/pflegegrad-1-leistungen"> Pflegegrad 1: Diese Leistungen stehen
            Ihnen zu</Link>.
          </p>
        </section>

        <section className="info-card">
          <h3>Pflegehilfsmittel zum Verbrauch vs. technische Hilfsmittel</h3>
          <p>
            §40 SGB XI unterscheidet zwei Arten von Pflegehilfsmitteln. Die
            <strong> Hilfsmittel zum Verbrauch</strong> (Handschuhe, Desinfektion, Bettschutz …)
            deckt die monatliche Pauschale von 42 € ab — sie werden verbraucht und jeden Monat
            neu geliefert. Davon zu unterscheiden sind <strong>technische Pflegehilfsmittel</strong>
            wie Pflegebetten, Hausnotruf oder Toilettensitzerhöhungen: Diese werden separat
            beantragt, meist leihweise gestellt und mindern Ihre 42-€-Pauschale <em>nicht</em>.
            Sie können also beides parallel nutzen.
          </p>
          <p style={{ marginTop: 12 }}>
            Die Pauschale wurde zum 01.01.2025 von 40 € auf 42 € erhöht. Was im Detail
            erstattungsfähig ist, erklärt der Ratgeber
            <Link href="/blog/pflegehilfsmittel-40-euro"> Pflegehilfsmittel nach §40 SGB XI</Link>.
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
          <h3>Wofür Sie die einzelnen Produkte brauchen</h3>
          <p>
            <strong>Einmalhandschuhe</strong> sind das meistgebrauchte Hilfsmittel in der häuslichen
            Pflege: bei der Körperpflege, beim Wechseln von Inkontinenzmaterial, beim Umgang mit
            Wunden oder Salben. Sie schützen beide Seiten — die pflegende und die gepflegte Person —
            vor Keimübertragung. Je nach Pflegeintensität werden schnell 100 bis 200 Handschuhe im
            Monat verbraucht.
          </p>
          <p style={{ marginTop: 12 }}>
            <strong>Händedesinfektionsmittel</strong> gehört vor und nach jeder pflegerischen
            Tätigkeit auf die Hände; <strong>Flächendesinfektionsmittel</strong> hält Pflegebett,
            Nachttisch, Toilettensitz und Türgriffe keimarm — gerade bei immungeschwächten Menschen
            ein wirksamer Schutz vor Infekten, die schnell zu Krankenhausaufenthalten führen können.
          </p>
          <p style={{ marginTop: 12 }}>
            <strong>Bettschutzeinlagen</strong> halten Matratze und Bettwäsche bei Inkontinenz
            trocken und ersparen tägliches Großwaschen. <strong>Mundschutz und FFP2-Masken</strong>
            schützen in Erkältungs- und Grippezeiten, <strong>Schutzschürzen</strong> die Kleidung
            der Pflegeperson bei der Körperpflege. Alle Produkte sind als Verbrauchsmaterial
            konzipiert — die Box stellt sicher, dass nie etwas ausgeht.
          </p>
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
          <h3>Rechtsgrundlage: §40 SGB XI verständlich erklärt</h3>
          <p>
            Der Anspruch auf Pflegehilfsmittel steht in §40 Absatz 2 SGB XI: Pflegebedürftige
            haben Anspruch auf „zum Verbrauch bestimmte Pflegehilfsmittel", wenn diese die Pflege
            erleichtern, Beschwerden lindern oder eine selbstständigere Lebensführung ermöglichen.
            Die Pflegekasse übernimmt die Kosten bis zur monatlichen Höchstgrenze — seit dem
            01.01.2025 sind das 42 €.
          </p>
          <p style={{ marginTop: 12 }}>
            Welche Produkte konkret erstattungsfähig sind, regelt das Pflegehilfsmittelverzeichnis
            der Pflegekassen (Produktgruppe 54): saugende Bettschutzeinlagen zum Einmalgebrauch,
            Fingerlinge, Einmalhandschuhe, Mundschutz, Schutzschürzen sowie Hände- und
            Flächendesinfektionsmittel. Alltagsengel stellt die Boxen ausschließlich aus gelisteten
            Produkten zusammen — so ist die Erstattung gesichert und es entsteht nie ein
            Eigenanteil.
          </p>
          <p style={{ marginTop: 12 }}>
            Wichtig für die Praxis: Der Anspruch ist eine <strong>Monatspauschale</strong>. Nicht
            genutzte Beträge lassen sich — anders als beim
            <Link href="/entlastungsbetrag"> Entlastungsbetrag</Link> — nicht ins Folgejahr
            übertragen. Umso wichtiger ist eine laufende monatliche Lieferung, die das Budget
            automatisch ausschöpft.
          </p>
        </section>

        <section className="info-card">
          <h3>Tipps für Angehörige: Größen, Mengen, Lagerung</h3>
          <ul className="info-list">
            <li><strong>Handschuhgröße richtig wählen:</strong> Zu große Handschuhe rutschen, zu
              kleine reißen. Messen Sie die Handbreite der pflegenden Person — meist passt S/M
              für Frauen, M/L für Männer. Bei Latexallergie: Nitril wählen.</li>
            <li><strong>Bettschutz nach Bedarf dosieren:</strong> Bei leichter Inkontinenz genügen
              wenige Einlagen pro Woche, bei stärkerer lohnt der tägliche Wechsel — passen Sie
              die Boxmenge entsprechend an.</li>
            <li><strong>Desinfektionsmittel griffbereit platzieren:</strong> Ein Spender am
              Pflegebett und einer im Bad senken die Hürde, ihn wirklich zu benutzen.</li>
            <li><strong>Kühl und trocken lagern:</strong> Desinfektionsmittel und Handschuhe
              halten sich am besten außerhalb des Badezimmers — Hitze und Feuchtigkeit lassen
              Material altern.</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Warum Hygiene in der häuslichen Pflege entscheidend ist</h3>
          <p>
            Rund vier von fünf Pflegebedürftigen in Deutschland werden zu Hause versorgt — meist
            von Angehörigen ohne pflegerische Ausbildung. Anders als im Krankenhaus gibt es dort
            keine Hygienestandards, die automatisch eingehalten werden. Dabei ist das
            Infektionsrisiko hoch: Ältere und pflegebedürftige Menschen haben oft ein geschwächtes
            Immunsystem, Harnwegsinfekte, Atemwegsinfekte oder infizierte Hautstellen können bei
            ihnen schnell schwerwiegend verlaufen.
          </p>
          <p style={{ marginTop: 12 }}>
            Konsequente Händehygiene, Einmalhandschuhe und desinfizierte Kontaktflächen senken
            dieses Risiko messbar — und schützen zugleich die pflegenden Angehörigen selbst.
            Genau deshalb hat der Gesetzgeber den Anspruch auf Pflegehilfsmittel zum Verbrauch
            geschaffen: Hygiene in der häuslichen Pflege soll nicht am Geld scheitern. Die
            monatliche Box stellt sicher, dass das Material immer griffbereit ist, bevor es
            ausgeht.
          </p>
        </section>

        <section className="info-card">
          <h3>Antrag und Genehmigung im Detail</h3>
          <p>
            Pflegehilfsmittel zum Verbrauch müssen einmalig bei der Pflegekasse beantragt werden.
            Der Antrag besteht aus einem kurzen Formular mit Ihren Versichertendaten, dem
            Pflegegrad und der gewünschten Produktzusammenstellung. Ein ärztliches Rezept ist
            <strong> nicht</strong> erforderlich — der Pflegegrad genügt als Nachweis.
          </p>
          <p style={{ marginTop: 12 }}>
            Bei Alltagsengel unterschreiben Sie dafür nur eine einmalige Vollmacht: Wir füllen den
            Antrag aus, reichen ihn bei Ihrer Pflegekasse ein und übernehmen die gesamte
            Kommunikation. Die Genehmigung dauert in der Regel wenige Tage bis zwei Wochen und
            gilt dauerhaft — solange der Pflegegrad besteht, läuft die monatliche Lieferung
            automatisch weiter. Auch bei einem Kassenwechsel kümmern wir uns um die Umstellung.
          </p>
          <p style={{ marginTop: 12 }}>
            Gut zu wissen: Die Zusammenstellung Ihrer Box können Sie jederzeit anpassen — mehr
            Bettschutzeinlagen, weniger Handschuhe, andere Größen. So schöpfen Sie die
            42-€-Pauschale jeden Monat optimal aus, ohne Produkte zu horten, die Sie nicht
            brauchen.
          </p>
        </section>

        <section className="info-card">
          <h3>Pflegebox mit anderen Leistungen kombinieren</h3>
          <p>
            Die 42 € für Pflegehilfsmittel sind ein eigenständiger Anspruch — er wird auf keine
            andere Leistung angerechnet. Ein typischer Pflegehaushalt kombiniert deshalb:
          </p>
          <ul className="info-list" style={{ marginTop: 12 }}>
            <li><Link href="/entlastungsbetrag">Entlastungsbetrag (§45b)</Link> — 131 €/Monat für
              Alltagsbegleitung und Haushaltshilfe, schon ab Pflegegrad 1</li>
            <li><Link href="/verhinderungspflege">Verhinderungspflege (§39)</Link> — bis zu
              3.539 €/Jahr für Ersatzpflege, ab Pflegegrad 2</li>
            <li><Link href="/krankenfahrten">Krankenfahrten (§60 SGB V)</Link> — mit ärztlicher
              Verordnung zahlt die Krankenkasse</li>
            <li>Pflegegeld bzw. Pflegesachleistungen — je nach Pflegegrad und Versorgungsform</li>
          </ul>
          <p style={{ marginTop: 12 }}>
            Zusammen mit Pflegebox und Entlastungsbetrag stehen so selbst bei Pflegegrad 1 schon
            <strong> 173 € pro Monat</strong> an konkreten Leistungen bereit. Welche Budgets Ihnen
            insgesamt zustehen, zeigt die <Link href="/finanzierung">Finanzierungs-Übersicht</Link>{' '}
            oder unser <Link href="/budgetrechner">Budgetrechner</Link>.
          </p>
        </section>

        <section className="info-card">
          <h3>Warum die Pflegebox statt Einzelkauf in Apotheke oder Drogerie?</h3>
          <p>
            Handschuhe und Desinfektionsmittel gibt es natürlich auch einzeln zu kaufen — aber
            dann zahlen Sie selbst, obwohl Ihnen die Kasse 42 € monatlich erstattet. Die
            Kostenerstattung für Einzelkäufe ist zwar theoretisch möglich, scheitert in der
            Praxis aber oft: Jede Quittung muss eingereicht werden, nicht gelistete Produkte
            werden abgelehnt, und wer einen Monat vergisst, verliert die Pauschale ersatzlos.
          </p>
          <p style={{ marginTop: 12 }}>
            Die Pflegebox löst alle drei Probleme auf einmal: Es kommen ausschließlich
            erstattungsfähige Produkte aus dem Hilfsmittelverzeichnis, die Abrechnung läuft
            direkt zwischen Alltagsengel und Ihrer Pflegekasse, und die monatliche Lieferung
            stellt sicher, dass kein Anspruch verfällt. Dazu kommt der praktische Vorteil:
            keine schweren Einkäufe, kein Vergessen, kein Vergleichen von Packungsgrößen —
            das Material ist einfach da, wenn es gebraucht wird.
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
            <li><Link href="/hygienebox/frankfurt-hoechst">Pflegebox Frankfurt-Höchst</Link></li>
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
            <li><Link href="/entlastungsbetrag">Entlastungsbetrag — 131 €/Monat ab Pflegegrad 1 (§45b)</Link></li>
            <li><Link href="/verhinderungspflege">Verhinderungspflege — Ersatzpflege bis 3.539 €/Jahr (§39)</Link></li>
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
