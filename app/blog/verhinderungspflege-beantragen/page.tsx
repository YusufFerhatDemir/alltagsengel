import type { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: "Verhinderungspflege beantragen: So geht's richtig",
  description: 'Verhinderungspflege beantragen: Formular, Nachweise, Fristen und Beispielrechnung. Schritt für Schritt zur Erstattung – bis zu 3.539 € pro Jahr sichern.',
  keywords: 'Verhinderungspflege, Verhinderungspflege beantragen, Antrag Verhinderungspflege, 3539 Euro, gemeinsamer Jahresbetrag, Pflegegeld, Ersatzpflege, Widerspruch Pflegekasse',
  alternates: { canonical: 'https://alltagsengel.care/blog/verhinderungspflege-beantragen' },
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: "Verhinderungspflege beantragen: So geht's richtig",
    description: 'Vollständiger Antrags-Leitfaden: Formular, Nachweise, Fristen, Stundenlohn-Angabe, Widerspruch – Schritt für Schritt zu bis zu 3.539 € pro Jahr.',
    type: 'article',
    publishedTime: '2026-03-15',
  },
};

// Eine Quelle für sichtbare FAQ UND FAQPage-JSON-LD (Google-Richtlinie:
// Structured-Data-FAQs müssen sichtbar auf der Seite stehen)
const faqData = [
  {
    frage: 'Kann ich Verhinderungspflege mehrmals im Jahr nutzen?',
    antwort:
      'Ja, beliebig oft — solange der gemeinsame Jahresbetrag von 3.539 € (Verhinderungs- und Kurzzeitpflege zusammen) und bei tageweiser Vertretung die Höchstdauer von 8 Wochen pro Kalenderjahr nicht überschritten werden. Stundenweise Einsätze unter 8 Stunden am Tag werden auf die Höchstdauer nicht angerechnet.',
  },
  {
    frage: 'Wie lange dauert die Bearbeitung des Antrags bei der Pflegekasse?',
    antwort:
      'Bei vollständigen Unterlagen erstatten die meisten Pflegekassen innerhalb weniger Wochen. Wer den Einsatz vorab formlos ankündigt und Rechnungen sowie Einsatznachweise direkt mitschickt, vermeidet Rückfragen und beschleunigt die Auszahlung deutlich.',
  },
  {
    frage: 'Kann ich Verhinderungspflege rückwirkend beantragen?',
    antwort:
      'Ja. Wenn die Voraussetzungen im Einsatzzeitraum erfüllt waren und Belege vorliegen, erstattet die Pflegekasse auch nachträglich — Ansprüche verjähren erst nach vier Jahren. Prüfen Sie also alte Rechnungen für Ersatzpflege-Einsätze, die Sie aus eigener Tasche bezahlt haben.',
  },
  {
    frage: 'Was passiert mit ungenutztem Budget am Jahresende?',
    antwort:
      'Der gemeinsame Jahresbetrag von 3.539 € gilt pro Kalenderjahr und verfällt am 31. Dezember — eine Übertragung ins Folgejahr ist nicht möglich. Am 1. Januar steht das volle Budget wieder neu zur Verfügung.',
  },
  {
    frage: 'Wird das Pflegegeld während der Verhinderungspflege weitergezahlt?',
    antwort:
      'Bei stundenweiser Verhinderungspflege (unter 8 Stunden pro Tag) läuft das Pflegegeld ungekürzt weiter. Bei tageweiser Vertretung wird es für den ersten und letzten Tag in voller Höhe gezahlt, für die Tage dazwischen zur Hälfte.',
  },
  {
    frage: 'Muss die Ersatzpflegeperson eine Pflegeausbildung haben?',
    antwort:
      'Nein. Die Ersatzpflege dürfen professionelle Betreuungskräfte, ambulante Dienste, aber auch Nachbarn, Freunde und Verwandte übernehmen. Wichtig für die Erstattungshöhe: Bei nahen Angehörigen bis zum 2. Grad und Personen im selben Haushalt ist die Erstattung auf das 1,5-fache des monatlichen Pflegegeldes begrenzt.',
  },
  {
    frage: 'Brauche ich für jeden Einsatz einen neuen Antrag?',
    antwort:
      'In der Regel nein. Bei den meisten Pflegekassen genügt ein Antrag pro Kalenderjahr; die einzelnen Einsätze weisen Sie anschließend gesammelt mit Rechnungen und Einsatzbestätigungen nach. Fragen Sie bei Ihrer Kasse nach, wie sie die Abrechnung bevorzugt.',
  },
  {
    frage: 'Kann ich Verhinderungspflege und Entlastungsbetrag gleichzeitig nutzen?',
    antwort:
      'Ja, das sind zwei getrennte Töpfe: Die Verhinderungspflege (3.539 €/Jahr, ab Pflegegrad 2) bezahlt die Ersatzpflege, der Entlastungsbetrag (131 €/Monat, ab Pflegegrad 1) die regelmäßige Alltagsunterstützung. Zusammen sind das bis zu 5.111 € pro Jahr.',
  },
]

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: "Verhinderungspflege beantragen: So geht's richtig",
  description: 'Verhinderungspflege beantragen: Formular, Nachweise, Fristen und Beispielrechnung. Schritt für Schritt zur Erstattung – bis zu 3.539 € pro Jahr sichern.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-03-15',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/verhinderungspflege-beantragen',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqData.map((faq) => ({
    '@type': 'Question',
    name: faq.frage,
    acceptedAnswer: { '@type': 'Answer', text: faq.antwort },
  })),
}

export default function VerhinderungspflegePage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Verhinderungspflege beantragen' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <article className="blog-article">
        <header className="blog-header">
          <h1>Verhinderungspflege beantragen: So geht&apos;s richtig</h1>
          <div className="blog-meta">
            <span className="date">15. März 2026</span>
            <span className="date">Aktualisiert am 12. Juli 2026</span>
            <span className="reading-time">10 Min. Lesezeit</span>
          </div>
        </header>

        <div className="blog-intro">
          <p>
            Pflegende Angehörige brauchen Pausen. Genau dafür gibt es Verhinderungspflege – eine Leistung der Pflegekasse, für die seit dem 01.07.2025 ein gemeinsamer Jahresbetrag mit der Kurzzeitpflege von bis zu 3.539 € pro Jahr bereitsteht. Doch viele Pflegefamilien wissen gar nicht, dass sie Anspruch darauf haben – oder scheitern am Antrag, weil Nachweise fehlen oder Formulare falsch ausgefüllt sind. Dieser Leitfaden führt Sie Schritt für Schritt durch den Antragsprozess: vom Formular über die richtige Stundenlohn-Angabe bis zum Widerspruch bei einer Ablehnung.
          </p>
        </div>

        <div className="blog-content">
          <h2>Was ist Verhinderungspflege?</h2>
          <p>
            Verhinderungspflege (auch Ersatzpflege genannt, §39 SGB XI) ist eine Leistung der Pflegekasse für Menschen mit Pflegebedarf ab Pflegegrad 2. Wenn Ihre private Pflegeperson – zum Beispiel ein Familienmitglied – wegen Urlaub, Krankheit, eigener Termine oder Erschöpfung nicht pflegen kann, übernimmt die Pflegekasse die Kosten für eine Vertretung. So entlastet die Verhinderungspflege pflegende Angehörige und sichert gleichzeitig die Betreuung des Pflegebedürftigen. Alle Details zur Leistung selbst finden Sie im großen <Link href="/verhinderungspflege">Verhinderungspflege-Ratgeber</Link> – hier konzentrieren wir uns auf den Antrag.
          </p>

          <h2>Voraussetzungen: Wer hat Anspruch?</h2>
          <p>
            Bevor Sie den Antrag stellen, prüfen Sie diese drei Voraussetzungen – sie sind die häufigste Ursache für Ablehnungen:
          </p>
          <ul>
            <li><strong>Pflegegrad 2 bis 5:</strong> Bei Pflegegrad 1 besteht kein Anspruch auf Verhinderungspflege – dort hilft aber der <Link href="/entlastungsbetrag">Entlastungsbetrag von 131 € pro Monat</Link>.</li>
            <li><strong>Häusliche Pflege durch eine Privatperson:</strong> Die pflegebedürftige Person wird zu Hause von einem Angehörigen, Nachbarn oder Freund gepflegt – nicht ausschließlich von einem Pflegedienst.</li>
            <li><strong>Die Pflegeperson ist zeitweilig verhindert:</strong> Urlaub, Krankheit, eigene Arzttermine oder schlicht Erholungsbedarf – der Grund muss nicht dramatisch sein.</li>
          </ul>
          <p>
            Gut zu wissen: Die früher geforderte Vorpflegezeit von 6 Monaten ist seit dem 01.07.2025 komplett entfallen – Verhinderungspflege kann sofort ab Anerkennung von Pflegegrad 2 genutzt werden. Auch der Bezug von Pflegegeld ist keine Voraussetzung: Entscheidend sind Pflegegrad 2–5 und die häusliche Pflege durch eine Privatperson.
          </p>

          <h2>Wie viel Geld gibt es?</h2>
          <p>
            Seit dem 01.07.2025 gibt es einen <strong>gemeinsamen Jahresbetrag für Verhinderungs- und Kurzzeitpflege von bis zu 3.539 € pro Jahr</strong> – rechnerisch rund 295 € pro Monat. Das Budget ist flexibel zwischen beiden Leistungen aufteilbar, jeweils für bis zu 8 Wochen pro Kalenderjahr. Sie müssen sich nicht im Voraus festlegen: Eine Familie kann im Frühjahr Kurzzeitpflege nutzen und den Rest im Sommer für stundenweise Verhinderungspflege einsetzen. Wie beide Leistungen zusammenspielen, erklärt der Ratgeber <Link href="/blog/kurzzeitpflege-verhinderungspflege-kombinieren">Kurzzeitpflege und Verhinderungspflege kombinieren</Link>. Wie viel Budget in Ihrer Konstellation verfügbar ist, rechnet der <Link href="/budgetrechner">Budgetrechner</Link> in zwei Minuten aus.
          </p>

          <h2>Antrag Schritt für Schritt: So gehen Sie vor</h2>
          <p>
            <strong>Schritt 1: Formular bei der Pflegekasse anfordern</strong>
            <br />
            Jede Pflegekasse hat ein eigenes Formular „Antrag auf Verhinderungspflege&quot; – als Download auf der Website, per Post oder im Online-Portal. Ein formloses Schreiben genügt zwar rechtlich, das offizielle Formular beschleunigt aber die Bearbeitung, weil alle nötigen Angaben abgefragt werden. Rufen Sie im Zweifel die Servicenummer Ihrer Kasse an – die Mitarbeiter schicken das Formular meist noch am selben Tag.
          </p>
          <p>
            <strong>Schritt 2: Angaben zur Verhinderung ausfüllen</strong>
            <br />
            Das Formular fragt typischerweise ab: Name und Versichertennummer der pflegebedürftigen Person, den Pflegegrad, den Zeitraum der Verhinderung, den Grund (Urlaub, Krankheit, sonstige Verhinderung) sowie Angaben zur regulären Pflegeperson. Tragen Sie außerdem ein, ob die Vertretung stundenweise (unter 8 Stunden am Tag) oder tageweise erfolgt – das hat Folgen für Ihr Pflegegeld (mehr dazu unten).
          </p>
          <p>
            <strong>Schritt 3: Angaben zur Ersatzpflegeperson machen</strong>
            <br />
            Hier wird es entscheidend: Die Kasse fragt nach Name und Anschrift der Ersatzpflegeperson, nach dem Verwandtschaftsverhältnis zur pflegebedürftigen Person und danach, ob sie im selben Haushalt lebt. Diese Angaben bestimmen die Erstattungshöhe. Bei einem professionellen Dienstleister wie Alltagsengel genügen Name und Anschrift des Anbieters – abgerechnet wird dann über dessen Rechnung.
          </p>
          <p>
            <strong>Schritt 4: Kosten und Stundenlohn angeben</strong>
            <br />
            Übernimmt eine <strong>Privatperson</strong> (Nachbarin, Freund, entfernte Verwandte) die Ersatzpflege, müssen Sie den vereinbarten Stundenlohn angeben. Die Kassen erwarten eine angemessene Vergütung – orientieren Sie sich am Mindestlohn bis hin zu ortsüblichen Sätzen für Betreuungsleistungen und dokumentieren Sie die geleisteten Stunden schriftlich mit Datum, Uhrzeit und Unterschrift beider Seiten. Bei einem <strong>Dienstleister</strong> entfällt das: Hier reichen Sie einfach die Rechnung des Anbieters ein, aus der Einsatzzeiten und Stundensätze hervorgehen.
          </p>
          <p>
            <strong>Schritt 5: Nachweise einreichen und Erstattung erhalten</strong>
            <br />
            Nach dem Einsatz schicken Sie die Belege an die Kasse: Rechnungen des Dienstleisters oder die Stundenaufstellung der Privatperson, bei Angehörigen zusätzlich Nachweise über Fahrtkosten oder Verdienstausfall. Die Kasse prüft und überweist die Erstattung – bei vollständigen Unterlagen meist innerhalb weniger Wochen. Bewahren Sie Kopien aller Unterlagen auf.
          </p>

          <h2>Vor oder nach der Pflege beantragen?</h2>
          <p>
            Die gute Nachricht: Verhinderungspflege muss <strong>nicht zwingend vorab</strong> beantragt werden. Die Erstattung kann auch nachträglich erfolgen – Ansprüche verjähren erst nach <strong>vier Jahren</strong>. Wer also in den vergangenen Jahren eine Ersatzpflege aus eigener Tasche bezahlt hat und die Belege noch besitzt, kann das Geld auch rückwirkend bei der Pflegekasse geltend machen.
          </p>
          <p>
            Trotzdem empfehlen wir, die Pflegekasse <strong>vorab formlos zu informieren</strong> – ein kurzer Anruf oder eine E-Mail genügt. Der Vorteil: Die Kostenübernahme ist dann gesichert, die Kasse kann keine Einwände mehr gegen den Zeitraum erheben, und die spätere Auszahlung geht schneller. Für geplante Auszeiten wie Urlaub oder Kur gilt als Faustregel: Ersatzpflege 4 bis 6 Wochen vorher organisieren und die Kasse gleich mit informieren. Bei ungeplanten Ausfällen – etwa wenn die Pflegeperson plötzlich erkrankt – können Sie sofort eine Ersatzkraft buchen und den Antrag nachreichen.
          </p>

          <h2>Stundenweise oder tageweise: Das passiert mit dem Pflegegeld</h2>
          <p>
            Bei der Antragstellung müssen Sie angeben, ob die Vertretung stundenweise oder tageweise erfolgt – und dieser Haken hat finanzielle Folgen:
          </p>
          <ul>
            <li><strong>Stundenweise Verhinderungspflege (unter 8 Stunden am Tag):</strong> Das Pflegegeld läuft an diesen Tagen <strong>ungekürzt</strong> weiter, und die Einsätze werden nicht auf die Höchstdauer von 8 Wochen angerechnet. Ideal für den wöchentlichen freien Nachmittag, Arzttermine oder Sport.</li>
            <li><strong>Tageweise Verhinderungspflege (8 Stunden oder länger):</strong> Das Pflegegeld wird für den ersten und letzten Tag in voller Höhe gezahlt, für die Tage dazwischen zur Hälfte – für bis zu 8 Wochen pro Kalenderjahr.</li>
          </ul>
          <p>
            Praxis-Tipp: Wer die Pflegegeld-Kürzung vermeiden will, plant Einsätze bewusst unter 8 Stunden. Zwei Vormittage à 4 Stunden sind pflegegeld-neutral – ein durchgehender 9-Stunden-Tag nicht. Geben Sie die Einsatzart im Antrag korrekt an, denn die Kasse gleicht die Angaben mit den eingereichten Stundennachweisen ab.
          </p>

          <h2>Wer darf die Ersatzpflege übernehmen – und was wird erstattet?</h2>
          <p>
            Grundsätzlich sind Sie frei in der Wahl: professionelle Betreuungskräfte, ambulante Pflegedienste, Nachbarn, Freunde oder Verwandte. Für die Erstattungshöhe macht die Pflegekasse aber einen wichtigen Unterschied:
          </p>
          <ul>
            <li><strong>Professionelle Kräfte und nicht verwandte Personen:</strong> Erstattung der tatsächlichen Kosten bis zum vollen Jahresbetrag von 3.539 €.</li>
            <li><strong>Nahe Angehörige (bis 2. Grad) und Personen im selben Haushalt:</strong> Erstattung begrenzt auf das 1,5-fache des monatlichen Pflegegeldes. Nachgewiesene Aufwendungen wie Fahrtkosten oder Verdienstausfall können zusätzlich bis zum Jahresbetrag geltend gemacht werden – dafür braucht die Kasse Belege.</li>
          </ul>
          <p>
            Zum 2. Verwandtschaftsgrad zählen Eltern, Kinder, Großeltern, Enkel und Geschwister. Die Nichte, der Cousin oder die Nachbarin fallen nicht darunter – hier gilt die volle Erstattung. Mit einer professionellen Betreuungskraft von Alltagsengel schöpfen Sie das Budget ohne Deckelung aus, und alle Einsätze sind versichert und dokumentiert – das erleichtert den Nachweis gegenüber der Kasse erheblich.
          </p>

          <h2>Häufige Ablehnungsgründe – und wie Sie Widerspruch einlegen</h2>
          <p>
            Wird ein Antrag abgelehnt, liegt es fast immer an einem dieser Punkte:
          </p>
          <ul>
            <li><strong>Pflegegrad 1:</strong> Verhinderungspflege setzt Pflegegrad 2 voraus – prüfen Sie, ob eine Höherstufung angezeigt ist.</li>
            <li><strong>Keine private Pflegeperson:</strong> Wird ausschließlich ein Pflegedienst tätig, fehlt die verhinderte Privatperson – die Kernvoraussetzung der Leistung.</li>
            <li><strong>Budget ausgeschöpft:</strong> Der gemeinsame Jahresbetrag wurde bereits durch Kurzzeitpflege oder frühere Einsätze verbraucht. Fragen Sie vor größeren Einsätzen den Reststand ab.</li>
            <li><strong>Fehlende oder unplausible Nachweise:</strong> Stundenaufstellungen ohne Datum und Unterschrift, fehlende Rechnungen oder ein unrealistisch hoher Stundenlohn bei Privatpersonen führen zu Rückfragen oder Kürzungen.</li>
            <li><strong>Deckelung bei Angehörigen übersehen:</strong> Wer für die pflegende Tochter mehr als das 1,5-fache Pflegegeld abrechnet, ohne Aufwendungen zu belegen, bekommt die Differenz gestrichen.</li>
          </ul>
          <p>
            <strong>So legen Sie Widerspruch ein:</strong> Gegen einen Ablehnungsbescheid können Sie innerhalb <strong>eines Monats</strong> nach Zugang schriftlich Widerspruch einlegen – die Frist steht in der Rechtsbehelfsbelehrung des Bescheids. Ein kurzes Schreiben genügt zunächst („Hiermit lege ich Widerspruch gegen Ihren Bescheid vom … ein.&quot;), die Begründung dürfen Sie nachreichen. Fordern Sie die Begründung der Ablehnung an, reichen Sie fehlende Nachweise nach und verweisen Sie auf die seit 01.07.2025 geltende Rechtslage (gemeinsamer Jahresbetrag, keine Vorpflegezeit). Viele Ablehnungen beruhen schlicht auf veralteten Prüfroutinen und werden im Widerspruchsverfahren korrigiert. Hilft das nicht, bleibt die Klage vor dem Sozialgericht – für Versicherte gerichtskostenfrei.
          </p>

          <h2>Beispielrechnung: So weit reicht das Budget</h2>
          <p>
            <strong>Szenario 1 – regelmäßige Auszeit:</strong> Eine Betreuungskraft kommt jeden Freitag für 4 Stunden (stundenweise Verhinderungspflege). Bei rund 35 € pro Stunde sind das etwa 140 € pro Woche bzw. 560–600 € im Monat. Das Jahresbudget von 3.539 € trägt damit rund ein halbes Jahr wöchentlicher Entlastung – und weil zusätzlich der Entlastungsbetrag von 131 € pro Monat für Alltagsbegleitung genutzt werden kann, lässt sich die Betreuung ganzjährig durchfinanzieren. Das Pflegegeld bleibt dabei ungekürzt.
          </p>
          <p>
            <strong>Szenario 2 – zwei Wochen Urlaub:</strong> Während der Reise der Pflegeperson kommt die Ersatzkraft täglich 5 Stunden. 14 Tage × 5 Stunden × 35 € ergeben 2.450 € – das Budget deckt den kompletten Urlaub, und es bleiben noch über 1.000 € für den Rest des Jahres. Da jeder Einsatz unter 8 Stunden bleibt, läuft auch hier das Pflegegeld in voller Höhe weiter.
          </p>
          <p>
            Einen Überblick über alle Pflegekassen-Budgets nach Pflegegrad – von der Verhinderungspflege über den Entlastungsbetrag bis zur Pflegebox – gibt die Seite <Link href="/finanzierung">Finanzierung</Link>.
          </p>

          <h2>Verhinderungspflege und §45b – zwei getrennte Töpfe</h2>
          <p>
            Wichtig zu wissen: Verhinderungspflege und der <strong>Entlastungsbetrag nach §45b</strong> (131 € pro Monat) sind getrennte Budgets mit getrennten Zwecken. Die Verhinderungspflege bezahlt die Ersatzpflege, wenn Ihre Pflegeperson ausfällt. Der §45b-Entlastungsbetrag ist zweckgebunden für anerkannte Angebote zur Unterstützung im Alltag (z. B. Alltagsbegleitung oder Haushaltshilfe) sowie Tages-, Nacht- und Kurzzeitpflege – für Verhinderungspflege darf er <strong>nicht</strong> eingesetzt werden.
          </p>
          <p>
            Praktisch bedeutet das: Sie können beide Töpfe parallel nutzen – die Verhinderungspflege (3.539 € pro Jahr, gemeinsamer Jahresbetrag mit der Kurzzeitpflege) für die Vertretung Ihrer Pflegeperson und zusätzlich jeden Monat den §45b-Entlastungsbetrag für Alltagsunterstützung. Zusammen sind das bis zu 5.111 € pro Jahr.
          </p>

          <h2>Tipps für die Praxis</h2>
          <ul>
            <li><strong>Planen Sie rechtzeitig:</strong> Für geplante Auszeiten die Ersatzpflege 4–6 Wochen vorher organisieren und die Kasse formlos informieren.</li>
            <li><strong>Budget-Reststand abfragen:</strong> Besonders wenn im Jahr schon Kurzzeitpflege genutzt wurde, vor größeren Einsätzen bei der Kasse nachfragen, wie viel vom gemeinsamen Jahresbetrag übrig ist.</li>
            <li><strong>Nutzen Sie Ihre Ansprüche:</strong> Viele Pflegefamilien schöpfen ihre 3.539 € nicht aus – das Budget verfällt am Jahresende. Verschenken Sie kein Geld!</li>
            <li><strong>Alles dokumentieren:</strong> Stundenzettel mit Datum, Uhrzeit und Unterschriften, Rechnungen und Belege für Fahrtkosten aufbewahren – vier Jahre lang.</li>
            <li><strong>Digitale Lösungen nutzen:</strong> Bei Alltagsengel sind alle Einsätze automatisch in der App dokumentiert – die Nachweise für die Kasse entstehen nebenbei.</li>
          </ul>

          <h2>Häufige Fragen zum Antrag</h2>
          {faqData.map((faq) => (
            <p key={faq.frage}>
              <strong>{faq.frage}</strong>
              <br />
              {faq.antwort}
            </p>
          ))}

          <div className="blog-cta">
            <h3>Jetzt Alltagsengel testen</h3>
            <p>Vereinbaren Sie einen kostenlosen Beratungstermin – wir helfen bei Antrag, Formularen und Abrechnung und finden sofort Unterstützung in Ihrer Region.</p>
            <Link href="/termin" className="btn-gold">Jetzt Termin vereinbaren</Link>
          </div>
        </div>

        <section className="blog-related" style={{ marginTop: 40, padding: '24px 20px', background: 'rgba(201,150,60,0.06)', borderRadius: 12, border: '1px solid rgba(201,150,60,0.15)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#C9963C' }}>Weiterführende Informationen</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li><Link href="/blog/kurzzeitpflege-verhinderungspflege-kombinieren" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Kurzzeitpflege und Verhinderungspflege kombinieren</Link></li>
            <li><Link href="/alltagsbegleitung" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Alltagsbegleitung als Entlastung buchen</Link></li>
            <li><Link href="/blog/entlastungsbetrag-45b" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Entlastungsbetrag 45b parallel nutzen</Link></li>
            <li><Link href="/blog/pflegegrad-beantragen" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Pflegegrad beantragen</Link></li>
          </ul>
        </section>

        <p style={{ marginTop: 32, fontSize: 15 }}>
          <strong>Alles Wichtige auf einen Blick:</strong>{' '}
          <Link href="/verhinderungspflege">Zum großen Verhinderungspflege-Ratgeber — 3.539 €/Jahr nutzen</Link>
        </p>

        <RelatedPosts slug="verhinderungspflege-beantragen" />
      </article>
    </main>
  );
}
