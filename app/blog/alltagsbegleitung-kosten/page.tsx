import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Was kostet Alltagsbegleitung? Preise 2026',
  description: 'Was kostet Alltagsbegleitung? Stundensätze von 25–45€, Finanzierung über den Entlastungsbetrag (131€/Monat) und Tipps zur Kostenübernahme. Jetzt informieren!',
  keywords: ['Alltagsbegleitung Kosten', 'was kostet Alltagsbegleitung', 'Alltagsbegleitung Preise', 'Alltagsbegleiter Stundensatz', 'Entlastungsbetrag Kosten'],
  alternates: { canonical: 'https://alltagsengel.care/blog/alltagsbegleitung-kosten' },
  openGraph: {
    title: 'Was kostet Alltagsbegleitung? Kosten, Finanzierung & Tipps',
    description: 'Stundensätze, Finanzierung über Entlastungsbetrag und praktische Tipps — alles zu den Kosten von Alltagsbegleitung.',
    url: 'https://alltagsengel.care/blog/alltagsbegleitung-kosten',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}


const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Was kostet Alltagsbegleitung? Kosten, Finanzierung & Tipps',
  description: 'Was kostet Alltagsbegleitung? Stundensätze von 25–45€, Finanzierung über den Entlastungsbetrag (131€/Monat) und Tipps zur Kostenübernahme. Jetzt informieren!',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-06-06',
  dateModified: '2026-06-06',
  mainEntityOfPage: 'https://alltagsengel.care/blog/alltagsbegleitung-kosten',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

export default function AlltagsbegleitungKostenPage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Alltagsbegleitung Kosten' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <article className="blog-article">
        <header className="blog-header">
          <h1>Was kostet Alltagsbegleitung? Kosten, Finanzierung & Tipps</h1>
          <p className="blog-meta">Veröffentlicht am 6. Juni 2026 | 8 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Wer für sich selbst oder einen Angehörigen eine <strong>Alltagsbegleitung</strong> sucht, stellt sich
            schnell die Frage: Was kostet das eigentlich? Die gute Nachricht: In vielen Fällen übernimmt die
            Pflegekasse einen Großteil der Kosten — über den sogenannten <strong>Entlastungsbetrag nach § 45b SGB XI</strong>.
            In diesem Artikel erfahren Sie, mit welchen Kosten Sie rechnen müssen, welche Finanzierungsmöglichkeiten
            es gibt und wie Sie Alltagsbegleitung möglichst günstig oder sogar kostenfrei erhalten.
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
            Schulung von mindestens 40 Stunden, haben ein polizeiliches Führungszeugnis und sind
            haftpflichtversichert. Die Qualifikation ist Voraussetzung dafür, dass die Pflegekasse
            die Kosten übernimmt.
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
            In Ballungsräumen wie Frankfurt, München oder Hamburg liegen die Preise tendenziell am
            oberen Ende. Auf dem Land sind die Kosten oft etwas niedriger. Der durchschnittliche
            Stundensatz für eine <strong>zertifizierte Alltagsbegleitung liegt bei etwa 32 €/Stunde</strong>.
          </p>

          <h3>Kostenbeispiel: So viel kostet Alltagsbegleitung im Monat</h3>
          <p>
            Um die monatlichen Kosten besser einschätzen zu können, hier einige typische Beispiele:
          </p>
          <ul className="blog-list">
            <li><strong>1 × pro Woche, 3 Stunden:</strong> ca. 96–120 €/Monat (4 Termine × 3h × 32 €)</li>
            <li><strong>2 × pro Woche, 2 Stunden:</strong> ca. 192–256 €/Monat</li>
            <li><strong>3 × pro Woche, 2 Stunden:</strong> ca. 288–384 €/Monat</li>
            <li><strong>Täglich, 1 Stunde:</strong> ca. 672–960 €/Monat</li>
          </ul>
          <p>
            Die meisten Familien entscheiden sich für <strong>1–2 Termine pro Woche</strong>, was
            gut zum Entlastungsbetrag passt.
          </p>

          <h2>Wie wird Alltagsbegleitung finanziert?</h2>
          <p>
            Es gibt mehrere Wege, die Kosten für Alltagsbegleitung zu finanzieren. Die wichtigste
            Quelle ist der <strong>Entlastungsbetrag nach § 45b SGB XI</strong>.
          </p>

          <h3>1. Entlastungsbetrag — 131 € monatlich von der Pflegekasse</h3>
          <p>
            Der <Link href="/blog/entlastungsbetrag-45b">Entlastungsbetrag</Link> steht allen
            Personen mit einem anerkannten <Link href="/blog/pflegegrad-beantragen">Pflegegrad</Link> (1–5)
            zu. Seit der <strong>Pflegereform 2025</strong> beträgt er <strong>131 € pro Monat</strong> —
            das sind <strong>1.572 € im Jahr</strong>.
          </p>
          <p>
            Der Betrag wird <strong>nicht automatisch ausgezahlt</strong>, sondern muss zweckgebunden
            für anerkannte Leistungen eingesetzt werden. Alltagsbegleitung durch zertifizierte
            Anbieter wie Alltagsengel gehört zu den anerkannten Leistungen. Das bedeutet: Sie
            buchen einen Alltagsbegleiter, reichen die Rechnung bei der Pflegekasse ein und
            bekommen die Kosten bis 131 € pro Monat erstattet.
          </p>
          <p>
            <strong>Wichtig:</strong> Nicht genutzte Beträge können unter bestimmten Bedingungen
            ins Folgejahr übertragen werden. Mehr dazu in unserem Artikel
            <Link href="/blog/entlastungsbetrag-nutzen"> Entlastungsbetrag richtig nutzen</Link>.
          </p>

          <h3>2. Verhinderungspflege — bis zu 1.612 € zusätzlich</h3>
          <p>
            Wenn Sie als pflegender Angehöriger verhindert sind (Urlaub, Krankheit, Auszeit), können
            Sie die <Link href="/blog/verhinderungspflege-beantragen">Verhinderungspflege</Link> nutzen.
            Diese umfasst bis zu <strong>1.612 € pro Jahr</strong> und kann auch für Alltagsbegleitung
            eingesetzt werden. In Kombination mit der Kurzzeitpflege sind sogar bis zu 2.418 € möglich.
          </p>

          <h3>3. Umwidmung der Kurzzeitpflege</h3>
          <p>
            Wer die Kurzzeitpflege nicht für einen stationären Aufenthalt nutzt, kann bis zu
            <strong> 806 € davon</strong> in die Verhinderungspflege umwidmen und so das Budget
            für Alltagsbegleitung vergrößern.
          </p>

          <h3>4. Selbstzahlung</h3>
          <p>
            Natürlich können Sie Alltagsbegleitung auch privat bezahlen. Das ist besonders dann relevant,
            wenn Sie noch keinen Pflegegrad haben oder der Entlastungsbetrag bereits aufgebraucht ist.
            Die Kosten sind steuerlich absetzbar: Haushaltsnahe Dienstleistungen können mit
            <strong> bis zu 4.000 €/Jahr</strong> in der Einkommensteuer geltend gemacht werden.
          </p>

          <h2>Vergleich: Selbstzahlung vs. Pflegekasse</h2>
          <p>
            Lohnt sich die Beantragung eines Pflegegrades? In den meisten Fällen lautet die Antwort: <strong>Ja</strong>.
          </p>
          <ul className="blog-list">
            <li><strong>Ohne Pflegegrad:</strong> Alle Kosten privat — ca. 130–400 €/Monat je nach Umfang</li>
            <li><strong>Mit Pflegegrad 1:</strong> 131 €/Monat über Entlastungsbetrag — das deckt ca. 4 Stunden Alltagsbegleitung</li>
            <li><strong>Mit Pflegegrad 2–5:</strong> Entlastungsbetrag + Verhinderungspflege + ggf. Sachleistungen — deutlich mehr Budget</li>
          </ul>
          <p>
            Bei einem Stundensatz von 32 € deckt der Entlastungsbetrag allein schon <strong>rund 4 Stunden
            Alltagsbegleitung pro Monat</strong> ab. In Kombination mit der Verhinderungspflege können
            Sie deutlich mehr Stunden finanzieren.
          </p>

          <h2>Versteckte Kosten und Fallstricke</h2>
          <p>Achten Sie bei der Auswahl eines Anbieters auf folgende Punkte:</p>
          <ul className="blog-list">
            <li><strong>Anfahrtskosten:</strong> Manche Anbieter berechnen Anfahrt extra. Bei Alltagsengel ist die Anfahrt im Stundensatz enthalten.</li>
            <li><strong>Mindestbuchungsdauer:</strong> Viele Dienste verlangen eine Mindestbuchung von 2–3 Stunden pro Termin.</li>
            <li><strong>Feiertagszuschläge:</strong> An Feiertagen und Wochenenden können Aufschläge von 25–50 % anfallen.</li>
            <li><strong>Vermittlungsgebühren:</strong> Einige Plattformen verlangen eine einmalige Vermittlungsgebühr. Alltagsengel berechnet keine Vermittlungsgebühr.</li>
            <li><strong>Kassenanerkennung:</strong> Nicht jeder Anbieter ist von der Pflegekasse anerkannt. Nur zertifizierte Dienste können über den Entlastungsbetrag abgerechnet werden.</li>
          </ul>

          <h2>Wie finde ich einen günstigen Alltagsbegleiter?</h2>
          <p>Die besten Tipps, um Alltagsbegleitung bezahlbar zu gestalten:</p>

          <h3>Tipp 1: Entlastungsbetrag voll ausschöpfen</h3>
          <p>
            Viele Pflegebedürftige nutzen den Entlastungsbetrag gar nicht — laut Studien verfallen
            jährlich <strong>mehrere Milliarden Euro</strong> ungenutzt. Lesen Sie unseren
            <Link href="/blog/entlastungsbetrag-nutzen"> Ratgeber zum Entlastungsbetrag</Link>,
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
            Vergleichen Sie die Stundensätze verschiedener Anbieter in Ihrer Region.
            Achten Sie dabei aber nicht nur auf den Preis — Qualifikation, Zuverlässigkeit
            und Kassenanerkennung sind mindestens genauso wichtig.
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
            <li><strong>Transparente Preise:</strong> Sie sehen die Stundensätze vor der Buchung — keine versteckten Kosten</li>
            <li><strong>Kassenabrechnung:</strong> Alle Alltagsengel-Begleiter sind nach § 45a zertifiziert und über den Entlastungsbetrag abrechenbar</li>
            <li><strong>Keine Vermittlungsgebühr:</strong> Die Registrierung und Vermittlung ist kostenlos</li>
            <li><strong>Flexible Buchung:</strong> Buchen Sie stundenweise, wöchentlich oder nach Bedarf</li>
            <li><strong>Regionale Verfügbarkeit:</strong> Besonders stark im <Link href="/blog/alltagsbegleitung-frankfurt">Rhein-Main-Gebiet</Link> und bundesweit wachsend</li>
          </ul>

          <h2>Häufige Fragen zu den Kosten von Alltagsbegleitung</h2>

          <h3>Ist Alltagsbegleitung steuerlich absetzbar?</h3>
          <p>
            Ja. Alltagsbegleitung zählt als haushaltsnahe Dienstleistung und kann mit
            <strong> 20 % der Kosten</strong> (maximal 4.000 €/Jahr) in der Einkommensteuer
            geltend gemacht werden. Das gilt auch, wenn die Pflegekasse einen Teil übernimmt —
            den Eigenanteil können Sie trotzdem absetzen.
          </p>

          <h3>Was passiert, wenn der Entlastungsbetrag nicht reicht?</h3>
          <p>
            Wenn die 131 € pro Monat nicht ausreichen, können Sie die Differenz privat bezahlen.
            Alternativ prüfen Sie, ob die <Link href="/blog/verhinderungspflege-beantragen">Verhinderungspflege</Link> als
            zusätzliche Finanzierungsquelle in Frage kommt.
          </p>

          <h3>Gibt es Alltagsbegleitung auch kostenlos?</h3>
          <p>
            Ehrenamtliche Besuchsdienste bieten eine kostenlose Grundversorgung an. Allerdings
            sind diese oft nicht regelmäßig verfügbar und nicht so flexibel wie professionelle
            Alltagsbegleitung. In der Kombination mit dem Entlastungsbetrag ist professionelle
            Alltagsbegleitung für Personen mit Pflegegrad <strong>de facto kostenfrei</strong>.
          </p>

          <h3>Kann ich den Alltagsbegleiter wechseln?</h3>
          <p>
            Ja, bei Alltagsengel können Sie jederzeit einen anderen Begleiter wählen, wenn
            die Chemie nicht stimmt. Es gibt keine Bindung oder Kündigungsfrist.
          </p>

          <h2>Fazit: Alltagsbegleitung ist oft günstiger als gedacht</h2>
          <p>
            Die Kosten für Alltagsbegleitung liegen bei <strong>25–45 € pro Stunde</strong>,
            werden aber in vielen Fällen vollständig oder teilweise von der Pflegekasse übernommen.
            Der <Link href="/blog/entlastungsbetrag-45b">Entlastungsbetrag von 131 €/Monat</Link> reicht
            für etwa 4 Stunden professionelle Begleitung pro Monat — und in Kombination mit
            der Verhinderungspflege ist noch deutlich mehr möglich.
          </p>
          <p>
            Wichtig ist, dass Sie einen <strong>zertifizierten Anbieter</strong> wählen, der von
            der Pflegekasse anerkannt ist. So stellen Sie sicher, dass die Kostenübernahme reibungslos
            funktioniert und Sie die maximale Unterstützung erhalten.
          </p>

          <div className="blog-cta">
            <h3>Jetzt Alltagsbegleitung finden — kostenlos & unverbindlich</h3>
            <p>
              Registrieren Sie sich kostenlos bei Alltagsengel und finden Sie zertifizierte
              Alltagsbegleiter in Ihrer Nähe. Transparente Preise, Kassenabrechnung und
              keine Vermittlungsgebühr.
            </p>
            <Link href="/auth/register" className="cta-button">
              Kostenlos registrieren →
            </Link>
            <p style={{ marginTop: 12 }}>
              <Link href="/kontakt" style={{ color: '#C9963C', textDecoration: 'underline' }}>
                Oder lassen Sie sich kostenlos beraten →
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
            <li><Link href="/blog/entlastungsbetrag-45b" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Entlastungsbetrag: 131 Euro/Monat verstehen</Link></li>
            <li><Link href="/hygienebox" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Pflegebox: Weitere kostenlose Leistung</Link></li>
          </ul>
        </section>
      </article>
    </main>
  )
}
