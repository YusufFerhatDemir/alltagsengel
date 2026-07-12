import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Was kostet Alltagsbegleitung? Preise & Finanzierung 2026',
  description: 'Alltagsbegleitung kostet 25–45 €/Stunde. Alle Finanzierungswege 2026: Entlastungsbetrag 131 €/Monat, Verhinderungspflege 3.539 €/Jahr, Steuerbonus §35a.',
  keywords: ['Alltagsbegleitung Kosten', 'was kostet Alltagsbegleitung', 'Alltagsbegleitung Preise', 'Alltagsbegleiter Stundensatz', 'Entlastungsbetrag Kosten', 'Alltagsbegleitung Finanzierung'],
  alternates: { canonical: 'https://alltagsengel.care/blog/alltagsbegleitung-kosten' },
  openGraph: {
    title: 'Was kostet Alltagsbegleitung? Preise & Finanzierung 2026',
    description: 'Stundensätze, Preisvergleich der Anbieter-Typen und alle Finanzierungswege — von Entlastungsbetrag bis Steuerbonus.',
    url: 'https://alltagsengel.care/blog/alltagsbegleitung-kosten',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}


const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Was kostet Alltagsbegleitung? Preise & Finanzierung 2026',
  description: 'Alltagsbegleitung kostet 25–45 €/Stunde. Alle Finanzierungswege 2026: Entlastungsbetrag 131 €/Monat, Verhinderungspflege 3.539 €/Jahr, Steuerbonus §35a.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-06-06',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/alltagsbegleitung-kosten',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

// Eine Quelle für sichtbare FAQ UND FAQPage-JSON-LD (Google-Richtlinie:
// Structured-Data-FAQs müssen sichtbar auf der Seite stehen)
const faqData = [
  {
    q: 'Wie viele Stunden Alltagsbegleitung sind mit dem Entlastungsbetrag drin?',
    a: 'Bei einem Stundensatz von 32 € deckt der Entlastungsbetrag von 131 € pro Monat rund 4 Stunden Alltagsbegleitung ab — genug für einen festen wöchentlichen Termin. Angesparte Restbeträge aus Vormonaten erhöhen das Budget zusätzlich.',
  },
  {
    q: 'Ist Alltagsbegleitung steuerlich absetzbar?',
    a: 'Ja. Alltagsbegleitung zählt als haushaltsnahe Dienstleistung nach §35a EStG. 20 % der selbst getragenen Kosten (bis 4.000 € pro Jahr) sind direkt von der Steuerschuld absetzbar. Das gilt auch für den Eigenanteil, wenn die Pflegekasse einen Teil übernimmt.',
  },
  {
    q: 'Was passiert, wenn der Entlastungsbetrag nicht reicht?',
    a: 'Ab Pflegegrad 2 können Sie zusätzlich die Verhinderungspflege nutzen: Seit dem 01.07.2025 steht dafür ein gemeinsamer Jahresbetrag von 3.539 € (Verhinderungs- plus Kurzzeitpflege) zur Verfügung. Die Differenz können Sie auch privat zahlen und steuerlich absetzen.',
  },
  {
    q: 'Gibt es Alltagsbegleitung auch kostenlos?',
    a: 'Ehrenamtliche Besuchsdienste sind kostenlos, aber selten regelmäßig verfügbar. Für Personen mit Pflegegrad ist professionelle Alltagsbegleitung über den Entlastungsbetrag von 131 € monatlich de facto kostenfrei — solange Sie im Budget bleiben, entsteht kein Eigenanteil.',
  },
  {
    q: 'Kann ich Alltagsbegleitung auch ohne Pflegegrad buchen?',
    a: 'Ja, als Selbstzahler. Die Kosten von etwa 25–45 € pro Stunde tragen Sie dann selbst, können aber 20 % über die Steuer zurückholen. Parallel lohnt es sich, einen Pflegegrad zu beantragen — schon Pflegegrad 1 bringt 131 € monatlich.',
  },
  {
    q: 'Kann ich das Pflegegeld für Alltagsbegleitung verwenden?',
    a: 'Ja. Das Pflegegeld (ab Pflegegrad 2: 347 € bis 990 € monatlich) wird zur freien Verfügung ausgezahlt. Viele Familien nutzen einen Teil davon, um zusätzliche Begleitstunden über den Entlastungsbetrag hinaus zu bezahlen.',
  },
  {
    q: 'Muss ich bei Alltagsengel in Vorleistung gehen?',
    a: 'Nein. Alltagsengel rechnet den Entlastungsbetrag direkt mit Ihrer Pflegekasse ab. Sie müssen weder Rechnungen vorstrecken noch Belege einreichen — im Rahmen der 131 € monatlich entsteht kein Eigenanteil.',
  },
  {
    q: 'Kann ich den Alltagsbegleiter wechseln, ohne dass Kosten entstehen?',
    a: 'Ja. Bei Alltagsengel wählen Sie Ihren Begleiter selbst aus und können jederzeit wechseln — ohne Begründung, ohne Kündigungsfrist und ohne zusätzliche Gebühren.',
  },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqData.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function AlltagsbegleitungKostenPage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Alltagsbegleitung Kosten' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <article className="blog-article">
        <header className="blog-header">
          <h1>Was kostet Alltagsbegleitung? Preise & Finanzierung 2026</h1>
          <p className="blog-meta">Veröffentlicht am 6. Juni 2026 | Aktualisiert am 12. Juli 2026 | 11 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Wer für sich selbst oder einen Angehörigen eine <strong>Alltagsbegleitung</strong> sucht, stellt sich
            schnell die Frage: Was kostet das eigentlich? Die gute Nachricht: In vielen Fällen übernimmt die
            Pflegekasse einen Großteil der Kosten — über den sogenannten <strong>Entlastungsbetrag nach § 45b SGB XI</strong>.
            In diesem Artikel erfahren Sie, mit welchen Stundensätzen Sie rechnen müssen, welche Preisfaktoren
            eine Rolle spielen, wie sich die Anbieter-Typen im Preis unterscheiden und über welche Wege Sie
            Alltagsbegleitung finanzieren — von der Pflegekasse über die Steuer bis zur Selbstzahlung.
          </p>

          <h2>Was ist Alltagsbegleitung — und was leistet sie?</h2>
          <p>
            Alltagsbegleitung ist eine <strong>niedrigschwellige Betreuungsleistung</strong> für Menschen mit
            Pflegegrad oder Unterstützungsbedarf. Sie unterscheidet sich deutlich von der klassischen Pflege:
            Es geht nicht um medizinische Versorgung, sondern um die Unterstützung im täglichen Leben.
          </p>
          <p>Typische Leistungen einer Alltagsbegleitung umfassen:</p>
          <ul className="blog-list">
            <li>Begleitung bei Einkäufen, Arztbesuchen und Behördengängen</li>
            <li>Gesellschaft leisten — Gespräche, Spaziergänge, gemeinsame Aktivitäten</li>
            <li>Unterstützung im Haushalt (Kochen, Aufräumen, Wäsche)</li>
            <li>Hilfe bei der Organisation des Alltags</li>
            <li>Entlastung pflegender Angehöriger</li>
            <li>Betreuung bei Demenz oder Einsamkeit</li>
          </ul>
          <p>
            Alltagsbegleiter sind nach <strong>§ 45a SGB XI</strong> qualifiziert. Sie durchlaufen eine
            Schulung nach den landesrechtlichen Vorgaben, haben ein polizeiliches Führungszeugnis und sind
            haftpflichtversichert. Die Anerkennung des Anbieters ist Voraussetzung dafür, dass die Pflegekasse
            die Kosten übernimmt. Was genau eine Alltagsbegleitung leistet und wie die Buchung abläuft,
            lesen Sie auf unserer Übersichtsseite <Link href="/alltagsbegleitung">Alltagsbegleitung</Link>.
          </p>

          <h2>Was kostet Alltagsbegleitung pro Stunde?</h2>
          <p>
            Die Kosten für Alltagsbegleitung variieren je nach Region, Anbieter und Qualifikation
            des Begleiters. Im Durchschnitt können Sie mit folgenden <strong>Stundensätzen</strong> rechnen:
          </p>
          <ul className="blog-list">
            <li><strong>Einfache Alltagsbegleitung:</strong> 25–35 €/Stunde</li>
            <li><strong>Qualifizierte Alltagsbegleitung (§ 45a):</strong> 30–40 €/Stunde</li>
            <li><strong>Spezialisierte Betreuung (z. B. Demenz):</strong> 35–45 €/Stunde</li>
          </ul>
          <p>
            Der durchschnittliche Stundensatz für eine <strong>zertifizierte Alltagsbegleitung liegt bei
            etwa 32 €/Stunde</strong> — das ist auch der Einstiegspreis bei Alltagsengel.
          </p>

          <h3>Die drei wichtigsten Preisfaktoren</h3>
          <p>
            Warum kostet dieselbe Leistung mal 25 € und mal 45 € pro Stunde? Drei Faktoren bestimmen
            den Preis:
          </p>
          <ul className="blog-list">
            <li>
              <strong>Region:</strong> In Ballungsräumen wie Frankfurt, München oder Hamburg liegen die
              Preise wegen höherer Lebenshaltungs- und Fahrtkosten tendenziell am oberen Ende. Auf dem
              Land sind die Stundensätze oft 5–10 € niedriger — dafür ist die Auswahl an anerkannten
              Anbietern dort kleiner.
            </li>
            <li>
              <strong>Qualifikation:</strong> Ein nach § 45a geschulter und anerkannter Begleiter kostet
              mehr als eine ungelernte Hilfe — nur mit ihm ist aber die Abrechnung über die Pflegekasse
              möglich. Spezialisierungen wie Demenzbetreuung oder Erfahrung mit bestimmten Krankheitsbildern
              schlagen mit weiteren 5–10 € pro Stunde zu Buche.
            </li>
            <li>
              <strong>Anbieter-Typ:</strong> Klassische Agenturen mit Büro und festangestelltem Personal
              haben höhere Fixkosten als Plattformen, die selbstständige Begleiter direkt vermitteln.
              Diese Struktur spiegelt sich unmittelbar im Stundensatz wider.
            </li>
          </ul>

          <h2>Preisvergleich: Agentur, selbstständige Begleiter oder Nachbarschaftshilfe?</h2>
          <p>
            Für die Kostenfrage entscheidend ist, <strong>bei wem</strong> Sie buchen. Drei Modelle
            stehen zur Wahl:
          </p>
          <ul className="blog-list">
            <li>
              <strong>Klassische Agentur / Betreuungsdienst (ca. 35–45 €/Stunde):</strong> Feste
              Mitarbeiter, planbare Vertretung bei Krankheit, aber die höchsten Preise — Verwaltung,
              Büro und Personalkosten zahlen Sie mit. Häufig gelten Mindestbuchungen von 2–3 Stunden
              und längere Vertragslaufzeiten.
            </li>
            <li>
              <strong>Selbstständige Alltagsbegleiter über eine Plattform (ca. 25–35 €/Stunde):</strong>
              Sie buchen direkt beim Begleiter, die Plattform übernimmt Prüfung, Versicherung und
              Kassenabrechnung. Meist das beste Preis-Leistungs-Verhältnis — wichtig ist, dass der
              Anbieter nach § 45a anerkannt ist, sonst zahlt die Pflegekasse nicht. Alltagsengel
              arbeitet nach diesem Modell.
            </li>
            <li>
              <strong>Nachbarschaftshilfe (ca. 8–15 €/Stunde Aufwandsentschädigung):</strong> In vielen
              Bundesländern können auch registrierte Einzelpersonen aus der Nachbarschaft über den
              Entlastungsbetrag abgerechnet werden. Der Preis ist unschlagbar, dafür gibt es keine
              professionelle Schulung, keine geregelte Vertretung und die Registrierungshürden
              unterscheiden sich je nach Bundesland erheblich.
            </li>
          </ul>
          <p>
            Faustregel: Je niedriger der Stundensatz, desto mehr Organisation bleibt bei Ihnen. Wer
            Verlässlichkeit, Versicherungsschutz und eine automatische Kassenabrechnung möchte, fährt
            mit einem anerkannten Plattform-Anbieter meist am besten.
          </p>

          <h3>Kostenbeispiel: So viel kostet Alltagsbegleitung im Monat</h3>
          <p>
            Um die monatlichen Kosten besser einschätzen zu können, hier einige typische Beispiele
            (gerechnet mit 32 €/Stunde):
          </p>
          <ul className="blog-list">
            <li><strong>1 × pro Woche, 1 Stunde:</strong> ca. 128 €/Monat — fast vollständig vom Entlastungsbetrag gedeckt</li>
            <li><strong>1 × pro Woche, 3 Stunden:</strong> ca. 384 €/Monat</li>
            <li><strong>2 × pro Woche, 2 Stunden:</strong> ca. 512 €/Monat</li>
            <li><strong>Täglich, 1 Stunde:</strong> ca. 960 €/Monat</li>
          </ul>
          <p>
            Die meisten Familien starten mit <strong>einem festen wöchentlichen Termin</strong> — das
            passt gut zum Entlastungsbetrag und schafft eine verlässliche Routine.
          </p>

          <h2>Wie wird Alltagsbegleitung finanziert? Alle Wege im Überblick</h2>
          <p>
            Es gibt mehrere Töpfe, aus denen Alltagsbegleitung bezahlt werden kann — und sie lassen
            sich kombinieren. Kombiniert stehen Ihnen ab Pflegegrad 2 <strong>bis zu 5.111 € pro Jahr</strong> zu.
            Eine ausführliche Übersicht aller Beträge nach Pflegegrad finden Sie auf unserer
            <Link href="/finanzierung"> Finanzierungsseite</Link> — oder Sie ermitteln Ihr persönliches
            Budget direkt mit dem <Link href="/budgetrechner">Budgetrechner</Link>.
          </p>

          <h3>1. Entlastungsbetrag — 131 € monatlich von der Pflegekasse</h3>
          <p>
            Der <Link href="/entlastungsbetrag">Entlastungsbetrag nach § 45b SGB XI</Link> steht allen
            Personen mit einem anerkannten <Link href="/blog/pflegegrad-beantragen">Pflegegrad</Link> (1–5)
            zu. Er beträgt <strong>131 € pro Monat</strong> — das sind <strong>1.572 € im Jahr</strong>.
          </p>
          <p>
            Der Betrag wird <strong>nicht bar ausgezahlt</strong>, sondern muss zweckgebunden
            für anerkannte Leistungen eingesetzt werden. Alltagsbegleitung durch anerkannte
            Anbieter wie Alltagsengel gehört dazu. Bei Alltagsengel läuft die Abrechnung direkt
            mit der Pflegekasse — Sie müssen weder in Vorleistung gehen noch Belege einreichen.
          </p>
          <p>
            <strong>Wichtig:</strong> Nicht genutzte Beträge werden angespart und bleiben bis zum
            30. Juni des Folgejahres nutzbar — danach verfallen sie. Mehr dazu in unserem Artikel
            <Link href="/blog/entlastungsbetrag-nutzen"> Entlastungsbetrag richtig nutzen</Link>.
          </p>

          <h3>2. Verhinderungspflege — gemeinsamer Jahresbetrag von 3.539 €</h3>
          <p>
            Wenn Sie als pflegender Angehöriger verhindert sind (Urlaub, Krankheit, Auszeit), greift
            die <Link href="/blog/verhinderungspflege-beantragen">Verhinderungspflege</Link>. Seit dem
            <strong> 01.07.2025</strong> sind Verhinderungs- und Kurzzeitpflege zu einem
            <strong> gemeinsamen Jahresbetrag von 3.539 €</strong> zusammengelegt (ab Pflegegrad 2),
            der flexibel für beides eingesetzt werden kann — auch für stundenweise Alltagsbegleitung.
            Die frühere Vorpflegezeit von sechs Monaten ist komplett entfallen: Der Anspruch gilt sofort.
          </p>

          <h3>3. Umwandlung von Pflegesachleistungen</h3>
          <p>
            Wer die ambulanten Pflegesachleistungen (§ 36 SGB XI) nicht voll ausschöpft, kann bis zu
            <strong> 40 % davon</strong> zusätzlich in Betreuungs- und Entlastungsleistungen umwandeln —
            und damit das Budget für Alltagsbegleitung weiter vergrößern. Das lohnt sich vor allem,
            wenn kein oder nur wenig ambulanter Pflegedienst im Einsatz ist.
          </p>

          <h3>4. Pflegegeld — frei verwendbar</h3>
          <p>
            Das Pflegegeld (§ 37 SGB XI) beträgt je nach Pflegegrad <strong>347 € bis 990 € pro
            Monat</strong> (ab Pflegegrad 2) und wird zur freien Verfügung ausgezahlt. Es ist zwar
            für die Pflege durch Angehörige gedacht, kann aber ohne Zweckbindung eingesetzt werden —
            viele Familien finanzieren daraus zusätzliche Begleitstunden, wenn der Entlastungsbetrag
            ausgeschöpft ist. Wer welche Leistung bezahlt, schlüsseln wir im Ratgeber
            <Link href="/blog/wer-zahlt-alltagsbegleitung"> Wer zahlt Alltagsbegleitung?</Link> im Detail auf.
          </p>

          <h3>5. Steuerbonus für haushaltsnahe Dienstleistungen (§ 35a EStG)</h3>
          <p>
            Selbst getragene Kosten für Alltagsbegleitung sind als haushaltsnahe Dienstleistung
            steuerlich begünstigt: <strong>20 % der Kosten, bis zu 4.000 € pro Jahr</strong>, werden
            direkt von der Steuerschuld abgezogen — nicht nur vom zu versteuernden Einkommen.
            Voraussetzung: Rechnung und unbare Zahlung (Überweisung). Heben Sie Rechnungen und
            Kontoauszüge für die Steuererklärung auf.
          </p>

          <h3>6. Selbstzahlung</h3>
          <p>
            Ohne Pflegegrad — oder wenn alle Töpfe ausgeschöpft sind — zahlen Sie die Alltagsbegleitung
            privat. Dank des Steuerbonus reduziert sich der effektive Stundensatz dann um ein Fünftel:
            Aus 32 € werden effektiv 25,60 €. Parallel lohnt sich fast immer der Antrag auf einen
            Pflegegrad, denn schon Pflegegrad 1 bringt die vollen 131 € monatlich.
          </p>

          <h2>Beispielrechnungen: Wie viele Stunden sind mit 131 € drin?</h2>
          <p>
            Die wichtigste Rechnung für die Praxis: Wie viel Begleitung bekommen Sie für den
            Entlastungsbetrag? Das hängt vom Stundensatz ab:
          </p>
          <ul className="blog-list">
            <li><strong>25 €/Stunde (günstiger Anbieter, ländliche Region):</strong> ca. 5,2 Stunden pro Monat</li>
            <li><strong>32 €/Stunde (Durchschnitt, z. B. Alltagsengel):</strong> ca. 4 Stunden pro Monat — ein fester wöchentlicher Termin</li>
            <li><strong>40 €/Stunde (Agentur im Ballungsraum):</strong> ca. 3,3 Stunden pro Monat</li>
            <li><strong>45 €/Stunde (spezialisierte Demenzbetreuung):</strong> ca. 2,9 Stunden pro Monat</li>
          </ul>
          <p>
            Dazu zwei Rechenbeispiele für den Jahresblick: Wer den Entlastungsbetrag ein halbes Jahr
            nicht genutzt hat, verfügt über <strong>786 € Ansparguthaben</strong> — bei 32 €/Stunde
            sind das fast 25 zusätzliche Begleitstunden, etwa für eine intensivere Betreuung nach
            einem Krankenhausaufenthalt. Und wer ab Pflegegrad 2 den Entlastungsbetrag (1.572 €/Jahr)
            mit dem Verhinderungspflege-Budget (3.539 €/Jahr) kombiniert, kommt auf
            <strong> 5.111 € pro Jahr</strong> — das entspricht bei 32 €/Stunde rund
            <strong> 160 Begleitstunden</strong>, also gut 3 Stunden pro Woche, komplett von der
            Pflegekasse finanziert.
          </p>

          <h2>Vergleich: Selbstzahlung vs. Pflegekasse</h2>
          <p>
            Lohnt sich die Beantragung eines Pflegegrades? In den meisten Fällen lautet die Antwort: <strong>Ja</strong>.
          </p>
          <ul className="blog-list">
            <li><strong>Ohne Pflegegrad:</strong> Alle Kosten privat — ca. 130–500 €/Monat je nach Umfang, abzüglich 20 % Steuerbonus</li>
            <li><strong>Mit Pflegegrad 1:</strong> 131 €/Monat über den Entlastungsbetrag — das deckt ca. 4 Stunden Alltagsbegleitung</li>
            <li><strong>Mit Pflegegrad 2–5:</strong> Entlastungsbetrag + Verhinderungspflege + ggf. umgewandelte Sachleistungen — bis zu 5.111 €/Jahr und mehr</li>
          </ul>
          <p>
            Bei einem Stundensatz von 32 € deckt der Entlastungsbetrag allein schon <strong>rund 4 Stunden
            Alltagsbegleitung pro Monat</strong> ab. In Kombination mit der Verhinderungspflege können
            Sie ein Vielfaches finanzieren.
          </p>

          <h2>Versteckte Kosten und Vertragsfallen</h2>
          <p>Achten Sie bei der Auswahl eines Anbieters auf folgende Punkte:</p>
          <ul className="blog-list">
            <li><strong>Anfahrtskosten:</strong> Manche Anbieter berechnen Anfahrt extra. Bei Alltagsengel ist die Anfahrt im Stundensatz enthalten.</li>
            <li><strong>Mindestbuchungsdauer:</strong> Viele Dienste verlangen eine Mindestbuchung von 2–3 Stunden pro Termin — bei nur einer benötigten Stunde verdoppeln sich so die Kosten.</li>
            <li><strong>Feiertags- und Wochenendzuschläge:</strong> An Feiertagen und Wochenenden können Aufschläge von 25–50 % anfallen. Fragen Sie vorab nach der Zuschlagsliste.</li>
            <li><strong>Vermittlungsgebühren:</strong> Einige Plattformen verlangen eine einmalige Vermittlungsgebühr oder monatliche Grundpauschalen. Alltagsengel berechnet keine Vermittlungsgebühr.</li>
            <li><strong>Mindestlaufzeiten und Kündigungsfristen:</strong> Verträge mit 6 oder 12 Monaten Laufzeit binden Sie auch dann, wenn die Chemie nicht stimmt. Seriöse Anbieter arbeiten ohne Mindestlaufzeit.</li>
            <li><strong>Kassenanerkennung:</strong> Nicht jeder Anbieter ist nach § 45a anerkannt. Nur anerkannte Dienste können über den Entlastungsbetrag abgerechnet werden — sonst bleiben Sie auf den Kosten sitzen.</li>
            <li><strong>Stornobedingungen:</strong> Prüfen Sie, bis wann Termine kostenfrei abgesagt werden können. Kurzfristige Absagen wegen Arztterminen oder Krankheit kommen im Pflegealltag häufig vor.</li>
          </ul>

          <h2>Wie finde ich einen günstigen Alltagsbegleiter?</h2>
          <p>Die besten Tipps, um Alltagsbegleitung bezahlbar zu gestalten:</p>

          <h3>Tipp 1: Entlastungsbetrag voll ausschöpfen</h3>
          <p>
            Viele Pflegebedürftige nutzen den Entlastungsbetrag gar nicht — laut Studien verfallen
            jährlich <strong>mehrere Milliarden Euro</strong> ungenutzt. Lesen Sie unseren
            <Link href="/blog/entlastungsbetrag-45b"> Ratgeber zum Entlastungsbetrag</Link>,
            um die 131 € monatlich sinnvoll einzusetzen.
          </p>

          <h3>Tipp 2: Pflegegrad beantragen</h3>
          <p>
            Schon ab <strong>Pflegegrad 1</strong> haben Sie Anspruch auf den Entlastungsbetrag.
            Die Beantragung ist unkompliziert. In unserem Artikel
            <Link href="/blog/pflegegrad-beantragen"> Pflegegrad beantragen</Link> erklären wir
            den Prozess Schritt für Schritt.
          </p>

          <h3>Tipp 3: Anbieter vergleichen</h3>
          <p>
            Vergleichen Sie die Stundensätze verschiedener Anbieter in Ihrer Region — inklusive
            Anfahrt, Zuschlägen und Mindestbuchung. Achten Sie dabei aber nicht nur auf den Preis:
            Qualifikation, Zuverlässigkeit und Kassenanerkennung sind mindestens genauso wichtig.
          </p>

          <h3>Tipp 4: Regelmäßige Termine buchen</h3>
          <p>
            Viele Anbieter bieten <strong>günstigere Stundensätze</strong> bei regelmäßigen
            wöchentlichen Terminen. Das ist auch für den Pflegebedürftigen besser, weil sich
            eine vertraute Beziehung zum Begleiter aufbaut.
          </p>

          <h2>Was macht Alltagsengel anders?</h2>
          <p>
            Alltagsengel ist eine digitale Plattform, die Pflegebedürftige und Angehörige
            direkt mit <strong>zertifizierten Alltagsbegleitern</strong> in ihrer Nähe verbindet.
            Das bedeutet konkret:
          </p>
          <ul className="blog-list">
            <li><strong>Transparente Preise:</strong> Stundensatz ab 32 € — Sie sehen die Preise vor der Buchung, keine versteckten Kosten</li>
            <li><strong>Direkte Kassenabrechnung:</strong> Alle Alltagsengel-Begleiter sind nach § 45a zertifiziert; die 131 € Entlastungsbetrag rechnen wir direkt mit Ihrer Pflegekasse ab</li>
            <li><strong>Keine Vermittlungsgebühr:</strong> Registrierung und Vermittlung sind kostenlos, keine Mindestlaufzeit</li>
            <li><strong>Flexible Buchung:</strong> Buchen Sie stundenweise, wöchentlich oder nach Bedarf — ein <Link href="/termin">Termin</Link> ist in wenigen Minuten vereinbart</li>
            <li><strong>Regionale Verfügbarkeit:</strong> Besonders stark im <Link href="/blog/alltagsbegleitung-frankfurt">Rhein-Main-Gebiet</Link> und bundesweit wachsend</li>
          </ul>

          <h2>Häufige Fragen zu den Kosten von Alltagsbegleitung</h2>
          <div className="blog-faq">
            {faqData.map((f, i) => (
              <details key={i} className="lp-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>

          <h2>Fazit: Alltagsbegleitung ist oft günstiger als gedacht</h2>
          <p>
            Die Kosten für Alltagsbegleitung liegen bei <strong>25–45 € pro Stunde</strong>,
            werden aber in vielen Fällen vollständig oder teilweise von der Pflegekasse übernommen.
            Der <Link href="/blog/entlastungsbetrag-45b">Entlastungsbetrag von 131 €/Monat</Link> reicht
            für etwa 4 Stunden professionelle Begleitung pro Monat — und in Kombination mit dem
            Verhinderungspflege-Budget von 3.539 €/Jahr sind ab Pflegegrad 2 bis zu 5.111 € jährlich
            für Ihre Betreuung finanzierbar.
          </p>
          <p>
            Wichtig ist, dass Sie einen <strong>nach § 45a anerkannten Anbieter</strong> wählen und
            auf versteckte Kosten wie Anfahrtspauschalen, Zuschläge und Mindestlaufzeiten achten.
            So stellen Sie sicher, dass die Kostenübernahme reibungslos funktioniert und Sie die
            maximale Unterstützung erhalten.
          </p>

          <div className="blog-cta">
            <h3>Jetzt Alltagsbegleitung finden — kostenlos & unverbindlich</h3>
            <p>
              Registrieren Sie sich kostenlos bei Alltagsengel und finden Sie zertifizierte
              Alltagsbegleiter in Ihrer Nähe. Transparente Preise, direkte Kassenabrechnung und
              keine Vermittlungsgebühr.
            </p>
            <Link href="/auth/register" className="cta-button">
              Kostenlos registrieren →
            </Link>
            <p style={{ marginTop: 12 }}>
              <Link href="/termin" style={{ color: '#C9963C', textDecoration: 'underline' }}>
                Oder direkt einen Beratungstermin vereinbaren →
              </Link>
            </p>
          </div>
        </div>

        <RelatedPosts slug="alltagsbegleitung-kosten" />

        <footer className="blog-footer">
          <Link href="/blog" className="blog-back">← Zurück zum Ratgeber</Link>
        </footer>

        <section className="blog-related" style={{ marginTop: 40, padding: '24px 20px', background: 'rgba(201,150,60,0.06)', borderRadius: 12, border: '1px solid rgba(201,150,60,0.15)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#C9963C' }}>Weiterführende Informationen</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li><Link href="/alltagsbegleitung" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Alltagsbegleitung buchen</Link></li>
            <li><Link href="/entlastungsbetrag" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Entlastungsbetrag: 131 Euro/Monat verstehen</Link></li>
            <li><Link href="/finanzierung" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Finanzierung: bis zu 5.111 €/Jahr nach Pflegegrad</Link></li>
            <li><Link href="/budgetrechner" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Budgetrechner: Ihr persönliches Pflegebudget</Link></li>
            <li><Link href="/blog/wer-zahlt-alltagsbegleitung" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Wer zahlt Alltagsbegleitung? Alle Kostenträger</Link></li>
          </ul>
        </section>
      </article>
    </main>
  )
}
