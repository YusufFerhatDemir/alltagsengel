import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Demenzbetreuung zu Hause — Unterstützung für Familien',
  description: 'Demenzbetreuung zu Hause: Wie Familien den Alltag mit Demenz meistern — Tipps zu Kommunikation, Alltagsstruktur und Finanzierung über 131 € Entlastungsbetrag.',
  keywords: ['Demenzbetreuung zu Hause', 'Demenz Betreuung', 'Demenz Angehörige', 'Demenz Pflege zu Hause', 'Betreuung Demenzkranke', 'Entlastungsbetrag Demenz', 'Alltagsbegleitung Demenz', 'stundenweise Betreuung Demenz'],
  alternates: { canonical: 'https://alltagsengel.care/blog/demenzbetreuung-zu-hause' },
  openGraph: {
    title: 'Demenzbetreuung zu Hause — Unterstützung für Familien',
    description: 'Demenzbetreuung zu Hause organisieren: Alltagsstruktur, Kommunikation, stundenweise Betreuung und Finanzierung über die Pflegekasse — verständlich erklärt.',
    url: 'https://alltagsengel.care/blog/demenzbetreuung-zu-hause',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Demenzbetreuung zu Hause — Unterstützung für Familien',
  description: 'Demenzbetreuung zu Hause: Wie Familien den Alltag mit Demenz meistern — Tipps zu Kommunikation, Alltagsstruktur und Finanzierung über 131 € Entlastungsbetrag.',
  author: { '@type': 'Organization', name: 'Alltagsengel' },
  publisher: {
    '@type': 'Organization',
    name: 'Alltagsengel',
    url: 'https://alltagsengel.care',
    logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' },
  },
  datePublished: '2026-07-12',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/demenzbetreuung-zu-hause',
}

const faqData = [
  { q: 'Kann man einen Menschen mit Demenz zu Hause betreuen?', a: 'Ja, in vielen Fällen ist das über lange Zeit möglich — besonders in frühen und mittleren Krankheitsphasen. Wichtig sind eine feste Tagesstruktur, eine sichere Wohnumgebung und regelmäßige Entlastung der pflegenden Angehörigen, etwa durch stundenweise Alltagsbegleitung oder Tagespflege. Entscheidend ist, dass die Betreuung zur jeweiligen Krankheitsphase passt und Angehörige nicht dauerhaft überlastet sind.' },
  { q: 'Welchen Pflegegrad bekommt man bei Demenz?', a: 'Das hängt vom Einzelfall ab. Seit der Pflegereform werden kognitive und kommunikative Fähigkeiten sowie Verhaltensweisen und psychische Problemlagen bei der Begutachtung ausdrücklich berücksichtigt. Menschen mit Demenz erhalten daher häufig schon früh einen Pflegegrad — oft Pflegegrad 2 oder höher, je nach Ausprägung. Bereits ab Pflegegrad 1 stehen 131 € Entlastungsbetrag pro Monat zur Verfügung.' },
  { q: 'Wer bezahlt die Demenzbetreuung zu Hause?', a: 'Die wichtigste Finanzierungsquelle ist der Entlastungsbetrag nach §45b SGB XI: 131 € pro Monat ab Pflegegrad 1, zweckgebunden für anerkannte Angebote zur Unterstützung im Alltag wie Alltagsbegleitung. Ab Pflegegrad 2 kommen Pflegegeld und der gemeinsame Jahresbetrag für Verhinderungs- und Kurzzeitpflege (3.539 € pro Jahr) hinzu. Alltagsengel rechnet den Entlastungsbetrag direkt mit der Pflegekasse ab.' },
  { q: 'Was ist stundenweise Demenzbetreuung?', a: 'Stundenweise Betreuung bedeutet, dass ein Alltagsbegleiter für einige Stunden pro Woche zu Ihnen nach Hause kommt: Er leistet Gesellschaft, beschäftigt den erkrankten Menschen, hilft im Haushalt oder begleitet bei Spaziergängen. In dieser Zeit können sich pflegende Angehörige erholen, eigene Termine wahrnehmen oder einfach durchatmen. Die Kosten sind über den Entlastungsbetrag von 131 € monatlich abrechenbar.' },
  { q: 'Ist Alltagsbegleitung bei Demenz medizinische Pflege?', a: 'Nein. Alltagsbegleitung ersetzt weder den Pflegedienst noch die ärztliche Behandlung. Sie umfasst Betreuung, Beschäftigung, Haushaltshilfe und Begleitung — also genau die Unterstützung, die den Alltag mit Demenz trägt. Körperbezogene Pflege wie Waschen oder Medikamentengabe bleibt Aufgabe von Pflegediensten und Angehörigen. Beides ergänzt sich und wird aus unterschiedlichen Töpfen finanziert.' },
  { q: 'Wann reicht die Betreuung zu Hause nicht mehr aus?', a: 'Warnzeichen sind unter anderem: nächtliche Unruhe mit Weglauftendenz, Selbst- oder Fremdgefährdung, starke Gewichtsabnahme sowie dauerhafte Erschöpfung der Angehörigen. Dann sollten Sie mit Hausarzt und Pflegeberatung über zusätzliche Bausteine sprechen — etwa Tagespflege, Kurzzeitpflege oder einen Pflegedienst. Ein Umzug ins Pflegeheim ist erst nötig, wenn auch diese Kombination nicht mehr trägt.' },
  { q: 'Kann ich Entlastungsbetrag und Verhinderungspflege für Demenzbetreuung kombinieren?', a: 'Ja, das sind zwei getrennte Ansprüche. Der Entlastungsbetrag (131 € pro Monat, ab Pflegegrad 1) und der gemeinsame Jahresbetrag für Verhinderungs- und Kurzzeitpflege (3.539 € pro Jahr, ab Pflegegrad 2) ergeben zusammen bis zu 5.111 € pro Jahr für Betreuung und Entlastung.' },
  { q: 'Wie schnell kann eine Demenzbetreuung durch Alltagsengel starten?', a: 'In der Regel innerhalb weniger Tage. Nach der kostenlosen Registrierung sehen Sie verfügbare Alltagsbegleiter in Ihrer Nähe und können direkt einen Kennenlerntermin buchen. Bewährt sich der Kontakt, kommt möglichst immer derselbe Engel — gerade bei Demenz ist eine feste Bezugsperson besonders wichtig.' },
]

const jsonLdFAQ = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqData.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function DemenzbetreuungZuHausePage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Demenzbetreuung zu Hause' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }} />

      <article className="blog-article">
        <header className="blog-header">
          <h1>Demenzbetreuung zu Hause — Unterstützung für Familien</h1>
          <p className="blog-meta">Veröffentlicht am 12. Juli 2026 | 10 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Wenn ein Elternteil oder Partner an Demenz erkrankt, verändert sich das Leben der ganzen
            Familie. Die meisten Menschen mit Demenz werden zu Hause betreut — von Angehörigen, die
            diese Aufgabe mit großer Hingabe übernehmen und dabei oft an ihre Grenzen kommen. Dieser
            Ratgeber zeigt, wie Demenzbetreuung zu Hause gelingen kann: mit Alltagsstruktur, guter
            Kommunikation, stundenweiser Entlastung durch <Link href="/alltagsbegleitung">Alltagsbegleitung</Link> und
            einer Finanzierung, die die Pflegekasse trägt.
          </p>

          <h2>Die Herausforderung: Demenz-Pflege verändert den Familienalltag</h2>
          <p>
            Demenz ist keine gewöhnliche Alterserscheinung, sondern eine fortschreitende Erkrankung
            des Gehirns. Sie beginnt oft schleichend: Termine werden vergessen, vertraute Wege
            plötzlich unsicher, Gespräche wiederholen sich. Mit der Zeit kommen Orientierungsprobleme,
            veränderte Verhaltensweisen und ein wachsender Unterstützungsbedarf hinzu.
          </p>
          <p>
            Für Angehörige bedeutet das eine doppelte Belastung. Da ist zum einen die praktische
            Aufgabe: Der erkrankte Mensch braucht Begleitung beim Einkaufen, Erinnerung an Mahlzeiten
            und Medikamente, später Hilfe bei fast allen Verrichtungen des Tages. Zum anderen ist da
            die emotionale Seite — der schmerzhafte Prozess, einen geliebten Menschen Stück für Stück
            zu verlieren, während er körperlich anwesend bleibt. Viele pflegende Angehörige berichten
            von Schuldgefühlen, Erschöpfung und dem Gefühl, mit allem allein zu sein.
          </p>
          <p>
            Genau deshalb ist es so wichtig, die Betreuung von Anfang an auf mehrere Schultern zu
            verteilen. Niemand kann eine Demenz-Pflege über Jahre allein tragen — und niemand muss das.
            Die Pflegeversicherung stellt dafür Leistungen bereit, die viele Familien gar nicht oder
            nur teilweise nutzen.
          </p>

          <h2>Warum die vertraute Umgebung so wertvoll ist</h2>
          <p>
            Menschen mit Demenz verlieren zuerst das Kurzzeitgedächtnis — das Langzeitgedächtnis und
            eingeübte Gewohnheiten bleiben dagegen oft erstaunlich lange erhalten. Die eigene Wohnung
            ist deshalb mehr als nur ein Ort: Der Griff zur Kaffeetasse im immer gleichen Schrank, der
            Blick aus dem vertrauten Fenster, der bekannte Weg zur Toilette — all das gibt Halt, wenn
            das Gedächtnis unzuverlässig wird.
          </p>
          <p>
            Ein Umgebungswechsel kann Menschen mit Demenz dagegen stark verunsichern. In fremder
            Umgebung fehlen die vertrauten Anker, Orientierungslosigkeit und Unruhe nehmen häufig zu.
            Solange es die Situation erlaubt, ist das Zuhause deshalb in der Regel der beste Ort für
            die Betreuung. Das bestätigt auch der Wunsch der allermeisten Betroffenen selbst: zu Hause
            bleiben, so lange es geht. Wie häusliche Betreuung ganz grundsätzlich organisiert werden
            kann, lesen Sie auch in unserem Ratgeber zur{' '}
            <Link href="/blog/seniorenbetreuung-zu-hause">Seniorenbetreuung zu Hause</Link>.
          </p>
          <p>
            Damit das Zuhause sicher bleibt, lohnen sich einige Anpassungen: gute Beleuchtung auch
            nachts, rutschfeste Böden ohne Stolperfallen, klare Beschriftungen an Schranktüren, ein
            Herd mit Abschaltautomatik. Kleine Veränderungen, große Wirkung — ohne dass die Wohnung
            ihren vertrauten Charakter verliert.
          </p>

          <h2>Alltagsstruktur: Der Tag braucht ein Geländer</h2>
          <p>
            Ein verlässlicher Tagesablauf ist eine der wirksamsten nicht-medikamentösen Hilfen bei
            Demenz. Feste Zeiten für Aufstehen, Mahlzeiten, Aktivitäten und Ruhephasen geben
            Orientierung, wo das Zeitgefühl nachlässt. Wiederkehrende Rituale — der Morgenkaffee am
            Küchentisch, der Spaziergang nach dem Mittagessen, das Abendlied — wirken wie ein Geländer
            durch den Tag.
          </p>
          <ul className="blog-list">
            <li><strong>Feste Zeiten:</strong> Mahlzeiten, Körperpflege und Schlafenszeiten möglichst jeden Tag zur gleichen Uhrzeit</li>
            <li><strong>Vertraute Aufgaben:</strong> Wäsche zusammenlegen, Gemüse schneiden, Blumen gießen — Tätigkeiten, die noch gelingen, stärken das Selbstwertgefühl</li>
            <li><strong>Bewegung und Tageslicht:</strong> Ein täglicher Spaziergang fördert den Schlaf und beugt Unruhe am Abend vor</li>
            <li><strong>Reize dosieren:</strong> Weder Reizüberflutung (lauter Fernseher, viele Besucher gleichzeitig) noch Monotonie — ein ausgewogener Wechsel aus Aktivität und Ruhe</li>
            <li><strong>Erinnerungsanker:</strong> Ein gut sichtbarer Kalender, eine große Uhr, Fotos mit Namen — kleine Hilfen für die Orientierung</li>
          </ul>

          <h2>Kommunikation bei Demenz: Verstehen statt korrigieren</h2>
          <p>
            Mit fortschreitender Demenz verändert sich die Sprache: Worte gehen verloren, Sätze
            bleiben unvollendet, Gesagtes wird schnell vergessen. Für Angehörige ist das oft schwer
            auszuhalten — und doch bleibt Kommunikation bis zuletzt möglich, wenn sie sich anpasst.
          </p>
          <ul className="blog-list">
            <li><strong>Kurze, einfache Sätze:</strong> Eine Information pro Satz, keine Entweder-oder-Fragen, sondern konkrete Vorschläge</li>
            <li><strong>Nicht korrigieren, nicht diskutieren:</strong> Wer eine demenzkranke Person auf Fehler hinweist oder mit ihr über Fakten streitet, erzeugt Scham und Abwehr — besser die Gefühlsebene aufgreifen</li>
            <li><strong>In der Welt des Erkrankten bleiben:</strong> Wenn die 85-jährige Mutter nach ihrer eigenen Mutter fragt, hilft kein Hinweis auf deren Tod — sondern die Frage, was sie an ihr besonders mochte</li>
            <li><strong>Blickkontakt und Berührung:</strong> Zugewandte Körpersprache, eine ruhige Stimme und eine Hand auf dem Arm sagen oft mehr als Worte</li>
            <li><strong>Zeit lassen:</strong> Menschen mit Demenz brauchen länger, um zu antworten — Pausen aushalten, nicht vorschnell einspringen</li>
          </ul>
          <p>
            Diese Haltung — ernst nehmen statt richtigstellen — entlastet beide Seiten. Sie nimmt den
            Druck aus Gesprächen und bewahrt die Würde des erkrankten Menschen.
          </p>

          <h2>Stundenweise Betreuung: Entlastung durch Alltagsbegleitung</h2>
          <p>
            Der wichtigste Baustein für eine tragfähige Demenzbetreuung zu Hause ist regelmäßige
            Entlastung der Angehörigen. Hier setzt die{' '}
            <Link href="/alltagsbegleitung">Alltagsbegleitung</Link> an: Ein geschulter Begleiter —
            bei Alltagsengel liebevoll „Engel" genannt — kommt stundenweise ins Haus, leistet
            Gesellschaft, beschäftigt den erkrankten Menschen mit vertrauten Aktivitäten, hilft im
            Haushalt oder begleitet bei Spaziergängen und Terminen.
          </p>
          <p>
            Für den Menschen mit Demenz bedeutet das Abwechslung, Ansprache und Aktivierung — ein
            Gegengewicht zur sozialen Isolation, die bei Demenz besonders schnell entsteht. Warum
            soziale Kontakte im Alter so wichtig sind, beleuchtet unser Beitrag über{' '}
            <Link href="/blog/einsamkeit-im-alter">Einsamkeit im Alter</Link>. Für die Angehörigen
            bedeuten dieselben Stunden: Zeit für eigene Termine, für Erholung, für das eigene Leben —
            in dem guten Gefühl, dass zu Hause jemand Verlässliches da ist.
          </p>
          <p>
            Wichtig zu wissen: Alltagsbegleitung ist keine medizinische Pflege. Sie ergänzt die
            Versorgung durch Angehörige und gegebenenfalls einen Pflegedienst um genau die Betreuungs-
            und Unterstützungsleistungen, die den Alltag mit Demenz tragen. Gerade bei Demenz zahlt
            sich dabei Kontinuität aus: Möglichst immer dieselbe Bezugsperson, die die Gewohnheiten,
            Vorlieben und die Lebensgeschichte kennt. Einen ersten Kennenlerntermin können Sie bei
            Alltagsengel unkompliziert online über die <Link href="/termin">Terminbuchung</Link> vereinbaren.
          </p>

          <h2>Finanzierung: Diese Leistungen der Pflegekasse stehen Ihnen zu</h2>
          <p>
            Demenzbetreuung zu Hause muss keine Frage des Geldbeutels sein. Die Pflegeversicherung
            stellt mehrere Leistungen bereit, die sich kombinieren lassen:
          </p>
          <ul className="blog-list">
            <li>
              <strong>Entlastungsbetrag (§45b SGB XI):</strong> <strong>131 € pro Monat</strong> —
              bereits ab Pflegegrad 1, unabhängig vom Einkommen. Der Betrag ist zweckgebunden für
              anerkannte Angebote zur Unterstützung im Alltag, also genau für Leistungen wie
              Alltagsbegleitung und Haushaltshilfe. Ungenutzte Beträge sammeln sich an und können
              noch bis zum 30. Juni des Folgejahres verwendet werden. Alle Details finden Sie auf
              unserer Seite zum <Link href="/entlastungsbetrag">Entlastungsbetrag</Link>.
            </li>
            <li>
              <strong>Verhinderungspflege (§39 SGB XI):</strong> Wenn die pflegende Person Urlaub
              braucht oder krank wird, springt die Verhinderungspflege ein. Ab Pflegegrad 2 steht
              dafür ein gemeinsamer Jahresbetrag mit der Kurzzeitpflege von 3.539 € pro Jahr zur
              Verfügung — auch stundenweise nutzbar. Mehr dazu auf unserer Seite zur{' '}
              <Link href="/verhinderungspflege">Verhinderungspflege</Link>.
            </li>
            <li>
              <strong>Pflegegeld:</strong> Ab Pflegegrad 2 erhalten Pflegebedürftige, die zu Hause
              von Angehörigen versorgt werden, monatlich Pflegegeld zur freien Verfügung — es wird
              zusätzlich zum Entlastungsbetrag gezahlt und nicht mit ihm verrechnet.
            </li>
          </ul>
          <p>
            Entlastungsbetrag und Verhinderungspflege zusammen ergeben bis zu 5.111 € pro Jahr für
            Betreuung und Entlastung — Geld, das vielen Familien zusteht und dennoch häufig ungenutzt
            verfällt. Bei Alltagsengel übernehmen wir die Abrechnung des Entlastungsbetrags direkt mit
            Ihrer Pflegekasse: Sie müssen nicht in Vorleistung gehen und keine Belege einreichen.
          </p>

          <h2>Pflegegrad bei Demenz: Kognition und Verhalten zählen</h2>
          <p>
            Voraussetzung für die Leistungen der Pflegekasse ist ein anerkannter Pflegegrad. Für
            Familien mit Demenz gibt es dabei eine gute Nachricht: Seit der Pflegereform wird
            Pflegebedürftigkeit nicht mehr nur an körperlichen Einschränkungen gemessen. Die
            Begutachtung umfasst sechs Module — und zwei davon betreffen unmittelbar die Demenz:
            das Modul „Kognitive und kommunikative Fähigkeiten" (örtliche und zeitliche Orientierung,
            Erinnern, Verstehen, Entscheidungen im Alltag) und das Modul „Verhaltensweisen und
            psychische Problemlagen" (etwa nächtliche Unruhe, Ängste, Abwehr bei der Pflege).
          </p>
          <p>
            Das bedeutet: Auch wer körperlich noch mobil ist, kann aufgrund kognitiver
            Einschränkungen einen Pflegegrad erhalten — oft früher und höher, als Angehörige
            vermuten. Wichtig für die Begutachtung ist, dass Sie den tatsächlichen Alltag ehrlich
            schildern, am besten anhand eines über ein bis zwei Wochen geführten Pflegetagebuchs.
            Ein guter Tag sollte die Einschätzung nicht verzerren. Ob sich ein Antrag lohnt und
            welcher Pflegegrad realistisch ist, können Sie unverbindlich mit unserem{' '}
            <Link href="/pflegegrad-check">Pflegegrad-Check</Link> einschätzen.
          </p>

          <h2>Wann zusätzliche professionelle Hilfe nötig wird</h2>
          <p>
            Demenz verläuft fortschreitend — was heute gut funktioniert, kann in einem Jahr nicht
            mehr ausreichen. Es ist ein Zeichen von Stärke, nicht von Versagen, die Betreuung
            rechtzeitig um weitere Bausteine zu ergänzen. Anzeichen dafür, dass die häusliche
            Betreuung allein an ihre Grenzen kommt, sind zum Beispiel:
          </p>
          <ul className="blog-list">
            <li>Nächtliche Unruhe oder Weglauftendenz, die den Schlaf der ganzen Familie raubt</li>
            <li>Situationen, in denen sich der erkrankte Mensch selbst gefährdet — etwa am Herd oder im Straßenverkehr</li>
            <li>Zunehmende Probleme bei Körperpflege und Ernährung, deutlicher Gewichtsverlust</li>
            <li>Aggressives oder stark abwehrendes Verhalten, das Angehörige überfordert</li>
            <li>Dauerhafte Erschöpfung, Schlafstörungen oder gesundheitliche Probleme der Pflegeperson selbst</li>
          </ul>
          <p>
            In solchen Fällen lohnt das Gespräch mit dem Hausarzt und der Pflegeberatung. Häufig lässt
            sich die häusliche Betreuung mit einer Tagespflege kombinieren: Der erkrankte Mensch
            verbringt einzelne Wochentage in einer betreuten Gruppe mit demenzgerechtem Programm und
            kehrt abends nach Hause zurück. Auch ein ambulanter Pflegedienst für die Körperpflege oder
            eine Kurzzeitpflege zur Überbrückung können sinnvolle Ergänzungen sein. Ein Umzug in eine
            stationäre Einrichtung ist erst dann der richtige Schritt, wenn all diese Bausteine
            zusammen nicht mehr ausreichen — und auch dann ist er kein Scheitern, sondern manchmal die
            fürsorglichste Entscheidung.
          </p>

          <h2>Selbstfürsorge: Wer pflegt, braucht selbst Kraftquellen</h2>
          <p>
            Pflegende Angehörige von Menschen mit Demenz tragen ein deutlich erhöhtes Risiko, selbst
            zu erkranken — körperlich wie seelisch. Selbstfürsorge ist deshalb keine Nebensache,
            sondern die Voraussetzung dafür, dass die Betreuung überhaupt gelingen kann. Drei Dinge
            haben sich bewährt:
          </p>
          <ul className="blog-list">
            <li><strong>Feste freie Zeiten:</strong> Mindestens ein halber Tag pro Woche, der verlässlich Ihnen gehört — abgesichert durch Alltagsbegleitung, Tagespflege oder andere Familienmitglieder</li>
            <li><strong>Austausch:</strong> Angehörigengruppen und Pflegekurse (die Pflegekassen bieten sie kostenfrei an) vermitteln Wissen und das befreiende Gefühl, nicht allein zu sein</li>
            <li><strong>Eigene Gesundheit ernst nehmen:</strong> Vorsorgetermine wahrnehmen, auf Warnsignale wie anhaltende Schlafstörungen oder Gereiztheit achten und rechtzeitig Hilfe holen</li>
          </ul>
          <p>
            Erlauben Sie sich auch schwierige Gefühle: Trauer, Wut und Ungeduld gehören zur
            Demenz-Pflege dazu und machen Sie nicht zu einem schlechten Menschen. Wer gut für sich
            selbst sorgt, sorgt zugleich für den erkrankten Menschen — denn Ihre Kraft ist seine
            wichtigste Ressource.
          </p>

          <h2>Häufige Fragen zur Demenzbetreuung zu Hause</h2>
          <div className="blog-faq">
            {faqData.map((f, i) => (
              <details key={i} className="lp-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>

          <div className="blog-cta">
            <h2>Entlastung für Ihre Familie — mit Alltagsengel</h2>
            <p>Stundenweise Betreuung durch feste Bezugspersonen, abgerechnet über den Entlastungsbetrag (131 €/Monat). 0 € Eigenanteil im Rahmen des Budgets.</p>
            <Link href="/termin" className="btn-gold">KOSTENLOSES ERSTGESPRÄCH BUCHEN</Link>
          </div>

          <RelatedPosts slug="demenzbetreuung-zu-hause" />
        </div>
      </article>
    </main>
  )
}
