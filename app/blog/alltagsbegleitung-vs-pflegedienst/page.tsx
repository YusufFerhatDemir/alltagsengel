import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import HowToSchema from '@/components/HowToSchema'
import SpeakableSchema from '@/components/SpeakableSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Alltagsbegleitung vs. Pflegedienst — der Unterschied',
  description: 'Alltagsbegleitung oder Pflegedienst? Aufgaben, Kosten und Finanzierung im Vergleich — wann Sie was brauchen und wie sich beide Leistungen kombinieren lassen.',
  keywords: ['Alltagsbegleitung vs Pflegedienst', 'Unterschied Alltagsbegleitung Pflegedienst', 'Alltagsbegleitung oder Pflegedienst', 'ambulanter Pflegedienst', 'Betreuungsdienst Unterschied', 'Entlastungsbetrag', 'Pflegesachleistungen', 'Grundpflege Behandlungspflege'],
  alternates: { canonical: 'https://alltagsengel.care/blog/alltagsbegleitung-vs-pflegedienst' },
  openGraph: {
    title: 'Alltagsbegleitung vs. Pflegedienst — der Unterschied',
    description: 'Aufgaben, Kosten und Finanzierung im Vergleich: Was Alltagsbegleitung leistet, was der Pflegedienst übernimmt — und wie sich beides kombinieren lässt.',
    url: 'https://alltagsengel.care/blog/alltagsbegleitung-vs-pflegedienst',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Alltagsbegleitung vs. Pflegedienst — Was ist der Unterschied?',
  description: 'Alltagsbegleitung oder Pflegedienst? Aufgaben, Kosten und Finanzierung im Vergleich — wann Sie was brauchen und wie sich beide Leistungen kombinieren lassen.',
  author: { '@type': 'Organization', name: 'Alltagsengel' },
  publisher: {
    '@type': 'Organization',
    name: 'Alltagsengel',
    url: 'https://alltagsengel.care',
    logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' },
  },
  datePublished: '2026-07-12',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/alltagsbegleitung-vs-pflegedienst',
}

const faqData = [
  { q: 'Ersetzt Alltagsbegleitung den Pflegedienst?', a: 'Nein. Alltagsbegleitung übernimmt keine Grundpflege und keine medizinischen Aufgaben. Wer Hilfe beim Waschen, Anziehen oder bei der Medikamentengabe braucht, benötigt weiterhin einen ambulanten Pflegedienst. Alltagsbegleitung ergänzt die Pflege um Haushalt, Begleitung und Gesellschaft.' },
  { q: 'Darf ein Alltagsbegleiter Medikamente geben?', a: 'Nein. Das Verabreichen von Medikamenten ist Behandlungspflege und bleibt ausgebildeten Pflegekräften vorbehalten. Ein Alltagsbegleiter kann aber daran erinnern, dass es Zeit für die Tablette ist, oder zur Apotheke begleiten.' },
  { q: 'Kann ich Alltagsbegleitung und Pflegedienst gleichzeitig nutzen?', a: 'Ja, das ist sogar der Regelfall. Beide Leistungen werden aus unterschiedlichen Budgets der Pflegeversicherung bezahlt: der Pflegedienst über die Pflegesachleistungen (§36 SGB XI), die Alltagsbegleitung über den Entlastungsbetrag von 131 € pro Monat (§45b SGB XI). Das eine schmälert das andere nicht.' },
  { q: 'Was kostet Alltagsbegleitung im Vergleich zum Pflegedienst?', a: 'Alltagsbegleitung kostet bei Alltagsengel ab 32 € pro Stunde und wird über den Entlastungsbetrag von 131 € monatlich abgerechnet — in diesem Rahmen ohne Eigenanteil. Ein Pflegedienst rechnet nach Leistungskomplexen über die Pflegesachleistungen ab; deren Höhe richtet sich nach dem Pflegegrad.' },
  { q: 'Bekomme ich Alltagsbegleitung schon mit Pflegegrad 1?', a: 'Ja. Der Entlastungsbetrag von 131 € monatlich steht bereits ab Pflegegrad 1 zu — anders als die Pflegesachleistungen für den Pflegedienst, die erst ab Pflegegrad 2 gezahlt werden. Für viele Menschen mit Pflegegrad 1 ist die Alltagsbegleitung deshalb die erste finanzierte Unterstützung überhaupt.' },
  { q: 'Wer bezahlt die Alltagsbegleitung?', a: 'Die Pflegekasse — über den Entlastungsbetrag nach §45b SGB XI in Höhe von 131 € pro Monat, der allen Menschen mit Pflegegrad 1 bis 5 zusteht. Alltagsengel rechnet direkt mit Ihrer Pflegekasse ab, Sie müssen nicht in Vorleistung gehen.' },
  { q: 'Verfällt der Entlastungsbetrag, wenn ich ihn nicht nutze?', a: 'Nicht sofort. Nicht genutzte Beträge werden angespart und können noch bis zum 30. Juni des Folgejahres eingesetzt werden. Danach verfällt der Restbetrag — es lohnt sich also, die 131 € pro Monat regelmäßig zu verwenden.' },
  { q: 'Woran erkenne ich, dass ein Pflegedienst nötig ist und Alltagsbegleitung nicht mehr reicht?', a: 'Sobald körperbezogene Hilfe gebraucht wird — beim Waschen, Anziehen, Toilettengang — oder ärztlich verordnete Leistungen wie Wundversorgung, Injektionen oder Medikamentengabe anstehen, ist ein Pflegedienst erforderlich. Die Alltagsbegleitung kann dann parallel weiterlaufen und Haushalt, Termine und Gesellschaft abdecken.' },
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

export default function AlltagsbegleitungVsPflegedienstPage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Alltagsbegleitung vs. Pflegedienst' }]} />
      <SpeakableSchema url="/blog/alltagsbegleitung-vs-pflegedienst" cssSelectors={['.blog-header h1', '.blog-intro']} />
      <HowToSchema
        name="So starten Sie mit Alltagsbegleitung"
        description="In vier Schritten von der Anspruchsprüfung zur laufenden Alltagsbegleitung — finanziert über den Entlastungsbetrag (131 €/Monat, §45b SGB XI)."
        totalTime="P7D"
        steps={[
          { name: 'Anspruch prüfen', text: 'Mit Pflegegrad 1–5 stehen Ihnen 131 €/Monat Entlastungsbetrag zu — der Budgetrechner zeigt Ihr gesamtes Budget.', url: '/budgetrechner' },
          { name: 'Beraten lassen', text: 'Vereinbaren Sie einen kostenlosen Beratungstermin — wir klären, welche Kombination aus Begleitung und Pflege zu Ihrer Situation passt.', url: '/termin' },
          { name: 'Engel auswählen', text: 'Sie wählen einen geprüften, versicherten Alltagsbegleiter in Ihrer Nähe und behalten ihn als feste Bezugsperson.' },
          { name: 'Entspannt starten', text: 'Die Abrechnung mit der Pflegekasse übernimmt Alltagsengel vollständig — ohne Vorleistung, ohne Papierkram.' },
        ]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }} />

      <article className="blog-article">
        <header className="blog-header">
          <h1>Alltagsbegleitung vs. Pflegedienst — Was ist der Unterschied?</h1>
          <p className="blog-meta">Veröffentlicht am 12. Juli 2026 | 8 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Wenn ein Angehöriger zu Hause Unterstützung braucht, fällt schnell der Satz: „Da muss
            ein Pflegedienst her." Doch oft ist gar keine Pflege im engeren Sinn gefragt, sondern
            Hilfe beim Einkaufen, im Haushalt, bei Terminen — und Gesellschaft. Genau dafür gibt es
            die <strong>Alltagsbegleitung</strong>. In diesem Ratgeber erklären wir, worin sich
            Alltagsbegleitung und ambulanter Pflegedienst unterscheiden, wer was bezahlt, was beide
            Leistungen kosten und warum die Kombination aus beidem häufig die beste Lösung ist.
          </p>

          <h2>Was macht die Alltagsbegleitung?</h2>
          <p>
            <Link href="/alltagsbegleitung">Alltagsbegleitung</Link> ist die praktische und soziale
            Unterstützung pflegebedürftiger Menschen in ihrem eigenen Zuhause. Rechtlich ist sie in
            <strong> §45a SGB XI</strong> als „Angebot zur Unterstützung im Alltag" verankert.
            Anbieter und Begleiter müssen nach den Vorgaben des jeweiligen Bundeslandes anerkannt
            und qualifiziert sein — bei Alltagsengel sind alle Begleiter, unsere „Engel", geschult,
            geprüft und während der Einsätze haftpflichtversichert.
          </p>
          <p>
            Der Aufgabenbereich umfasst all das, was den Alltag ausmacht, aber mit zunehmendem
            Alter, nach einer Erkrankung oder bei eingeschränkter Mobilität nicht mehr allein zu
            bewältigen ist:
          </p>
          <ul className="blog-list">
            <li><strong>Haushaltsnahe Hilfen:</strong> Einkaufen, Kochen, leichte Hausarbeit, Wäsche</li>
            <li><strong>Begleitung:</strong> zu Arztterminen, zur Apotheke, zur Bank oder zu Behörden</li>
            <li><strong>Soziale Teilhabe:</strong> Spaziergänge, Gespräche, gemeinsame Aktivitäten</li>
            <li><strong>Betreuung:</strong> psychosoziale Unterstützung, Tagesstruktur, Aktivierung — auch bei Demenz</li>
            <li><strong>Organisatorisches:</strong> Post erledigen, Antragshilfen bei Pflegekasse und Behörden</li>
          </ul>
          <p>
            Ebenso wichtig ist, was die Alltagsbegleitung bewusst <em>nicht</em> übernimmt: keine
            Körperpflege, keine Medikamentengabe, keine Wundversorgung — also keinerlei
            grundpflegerische oder medizinische Aufgaben. Das ist keine Lücke, sondern eine klare
            gesetzliche Abgrenzung: Diese Tätigkeiten sind ausgebildeten Pflegekräften vorbehalten.
          </p>

          <h2>Was macht der ambulante Pflegedienst?</h2>
          <p>
            Ein ambulanter Pflegedienst kommt mit examinierten Pflegefachkräften und
            Pflegehilfskräften ins Haus und erbringt zwei Arten von Leistungen. Die
            <strong> Grundpflege</strong> umfasst alle körperbezogenen Maßnahmen: Hilfe beim
            Waschen und Duschen, beim An- und Auskleiden, beim Toilettengang, bei der
            Nahrungsaufnahme oder beim Umlagern und Mobilisieren. Sie wird über die
            <strong> Pflegesachleistungen nach §36 SGB XI</strong> mit der Pflegekasse abgerechnet.
          </p>
          <p>
            Die <strong>Behandlungspflege</strong> umfasst medizinische Leistungen, die der Arzt
            verordnet: Medikamente stellen und verabreichen, Injektionen, Blutdruck- und
            Blutzuckermessung, Wundversorgung, Verbandswechsel oder Kompressionsstrümpfe anziehen.
            Diese häusliche Krankenpflege wird nach <strong>§37 SGB V</strong> über die
            Krankenkasse finanziert und darf ausschließlich von entsprechend ausgebildetem
            Personal durchgeführt werden.
          </p>
          <p>
            Der Pflegedienst arbeitet dabei in der Regel nach sogenannten Leistungskomplexen: fest
            definierte Pakete wie „kleine Körperpflege" oder „Medikamentengabe", die in kurzen,
            effizient getakteten Einsätzen erbracht werden. Für ausgedehnte Spaziergänge,
            stundenlange Gesellschaft oder den Wocheneinkauf ist im klassischen Pflegedienst-Modell
            meist weder Zeit noch Budget vorgesehen — genau hier setzt die Alltagsbegleitung an.
          </p>

          <h2>Der direkte Vergleich: Aufgaben, Personal, Rechtsgrundlage</h2>
          <p>Die wichtigsten Unterschiede auf einen Blick:</p>
          <ul className="blog-list">
            <li><strong>Aufgaben — Alltagsbegleitung:</strong> Haushalt, Einkaufen, Kochen, Begleitung zu Terminen, Spaziergänge, Gespräche, Betreuung und Tagesstruktur. Keine Körperpflege, keine Medizin.</li>
            <li><strong>Aufgaben — Pflegedienst:</strong> Grundpflege (Waschen, Anziehen, Toilettengang) und Behandlungspflege (Medikamente, Injektionen, Wundversorgung) — körperbezogen und medizinisch.</li>
            <li><strong>Personal — Alltagsbegleitung:</strong> geschulte und nach Landesrecht anerkannte Alltagsbegleiter (§45a SGB XI), bei Alltagsengel zusätzlich geprüft und versichert.</li>
            <li><strong>Personal — Pflegedienst:</strong> examinierte Pflegefachkräfte und Pflegehilfskräfte mit pflegerischer Ausbildung.</li>
            <li><strong>Rechtsgrundlage — Alltagsbegleitung:</strong> §45a SGB XI (Angebote zur Unterstützung im Alltag), finanziert über den Entlastungsbetrag nach §45b SGB XI.</li>
            <li><strong>Rechtsgrundlage — Pflegedienst:</strong> Pflegesachleistungen nach §36 SGB XI (Pflegekasse) und häusliche Krankenpflege nach §37 SGB V (Krankenkasse).</li>
            <li><strong>Ab welchem Pflegegrad — Alltagsbegleitung:</strong> ab Pflegegrad 1, da der Entlastungsbetrag allen Pflegegraden zusteht.</li>
            <li><strong>Ab welchem Pflegegrad — Pflegedienst:</strong> Pflegesachleistungen gibt es erst ab Pflegegrad 2.</li>
            <li><strong>Einsatzcharakter — Alltagsbegleitung:</strong> längere, flexible Einsätze mit fester Bezugsperson, oft im wöchentlichen Rhythmus.</li>
            <li><strong>Einsatzcharakter — Pflegedienst:</strong> kurze, getaktete Einsätze zu festen Tageszeiten, häufig mit wechselndem Personal.</li>
          </ul>

          <h2>Finanzierung: Zwei getrennte Töpfe der Pflegeversicherung</h2>
          <p>
            Der vielleicht wichtigste Punkt für Familien: Alltagsbegleitung und Pflegedienst werden
            aus <strong>unterschiedlichen Budgets</strong> bezahlt. Sie müssen sich also nicht
            zwischen beiden entscheiden — das eine Budget schmälert das andere nicht.
          </p>
          <p>
            Die <strong>Alltagsbegleitung</strong> wird über den
            <Link href="/entlastungsbetrag"> Entlastungsbetrag nach §45b SGB XI</Link> finanziert:
            <strong> 131 € pro Monat</strong>, die jedem Menschen mit Pflegegrad 1 bis 5
            zweckgebunden zustehen. Der Betrag wird nicht bar ausgezahlt, sondern mit einem
            anerkannten Anbieter verrechnet — bei Alltagsengel übernehmen wir die komplette
            Abrechnung mit der Pflegekasse, Sie gehen nicht in Vorleistung und reichen keine Belege
            ein. Nicht genutzte Beträge werden angespart und bleiben bis zum 30. Juni des
            Folgejahres nutzbar, danach verfallen sie. Wer bezahlt in welchem Fall was — das haben
            wir im Ratgeber <Link href="/blog/wer-zahlt-alltagsbegleitung">Wer zahlt die
            Alltagsbegleitung?</Link> im Detail aufgeschlüsselt.
          </p>
          <p>
            Der <strong>Pflegedienst</strong> wird dagegen über die
            <strong> Pflegesachleistungen nach §36 SGB XI</strong> abgerechnet. Deren Höhe steigt
            mit dem Pflegegrad und steht erst ab Pflegegrad 2 zur Verfügung. Verordnete
            Behandlungspflege — etwa Medikamentengabe oder Wundversorgung — läuft zusätzlich über
            die Krankenkasse und belastet das Pflegebudget gar nicht.
          </p>
          <p>
            Interessant für alle, die mehr Betreuung brauchen: Bis zu <strong>40 % der ambulanten
            Pflegesachleistungen</strong> lassen sich in Betreuungs- und Entlastungsleistungen
            umwandeln und zusätzlich für Alltagsbegleitung einsetzen. Auch die Verhinderungspflege
            nach §39 SGB XI kann für stundenweise Begleitung genutzt werden. Wie viel Budget Ihnen
            insgesamt zusteht, zeigt Ihnen unser <Link href="/budgetrechner">Budgetrechner</Link> in
            wenigen Minuten.
          </p>

          <h2>Kosten im Vergleich</h2>
          <p>
            Bei Alltagsengel kostet die Alltagsbegleitung <strong>ab 32 € pro Stunde</strong> —
            inklusive Versicherungsschutz und Abrechnung. Mit dem Entlastungsbetrag von 131 €
            monatlich sind damit etwa vier Begleitstunden pro Monat dauerhaft finanziert, ohne dass
            für Sie ein Eigenanteil entsteht — genug für einen festen wöchentlichen Besuch. Eine
            ausführliche Beispielrechnung finden Sie im Ratgeber
            <Link href="/blog/alltagsbegleitung-kosten"> Was kostet Alltagsbegleitung?</Link>
          </p>
          <p>
            Ein ambulanter Pflegedienst rechnet nicht pro Stunde, sondern nach Leistungskomplexen
            ab, deren Preise je nach Bundesland und Anbieter variieren. Reichen die
            Pflegesachleistungen des jeweiligen Pflegegrads nicht aus, entsteht ein Eigenanteil.
            Für einen reinen Kostenvergleich gilt als Faustregel: Für hauswirtschaftliche und
            betreuende Tätigkeiten ist die Alltagsbegleitung meist die wirtschaftlichere Wahl —
            das teurer vergütete Fachpersonal des Pflegedienstes sollte dort eingesetzt werden, wo
            seine Qualifikation wirklich gebraucht wird: bei Grund- und Behandlungspflege.
          </p>

          <h2>Wann ist was das Richtige?</h2>
          <p>
            <strong>Alltagsbegleitung reicht aus,</strong> wenn keine körperbezogene Hilfe gebraucht
            wird: Ihr Angehöriger kommt beim Waschen und Anziehen allein zurecht, aber Einkaufen,
            Kochen, Haushalt oder Wege außer Haus werden zur Last — oder die Einsamkeit wiegt
            schwerer als jede körperliche Einschränkung. Auch bei Pflegegrad 1, wo
            Pflegesachleistungen noch gar nicht greifen, ist die Alltagsbegleitung über den
            Entlastungsbetrag oft die erste finanzierte Unterstützung überhaupt.
          </p>
          <p>
            <strong>Ein Pflegedienst ist nötig,</strong> sobald Grundpflege oder medizinische
            Leistungen anstehen: Hilfe bei der Körperpflege, beim Toilettengang, ärztlich
            verordnete Medikamentengabe, Injektionen oder Wundversorgung. Diese Aufgaben darf und
            soll keine Alltagsbegleitung übernehmen.
          </p>
          <p>
            <strong>Die Kombination ist ideal,</strong> wenn beides zutrifft — und das ist in der
            Praxis der häufigste Fall: Der Pflegedienst kommt morgens zur Körperpflege und
            Medikamentengabe, der Alltagsbegleiter übernimmt am Nachmittag Einkauf, Haushalt,
            Arztbegleitung und Gesellschaft. Beide Leistungen laufen über getrennte Budgets, sodass
            die volle Unterstützung ohne doppelte Belastung möglich ist. Für pflegende Angehörige
            bedeutet diese Arbeitsteilung spürbare Entlastung: Die Pflege ist professionell
            abgesichert, und die zeitintensiven Alltagsaufgaben hängen nicht mehr allein an der
            Familie.
          </p>

          <h2>So starten Sie mit Alltagsbegleitung</h2>
          <ol className="blog-list">
            <li><strong>Anspruch prüfen:</strong> Mit Pflegegrad 1–5 stehen Ihnen 131 €/Monat Entlastungsbetrag zu — unser <Link href="/budgetrechner">Budgetrechner</Link> zeigt Ihr gesamtes Budget</li>
            <li><strong>Beraten lassen:</strong> Vereinbaren Sie einen kostenlosen <Link href="/termin">Beratungstermin</Link> — wir klären, welche Kombination aus Begleitung und Pflege zu Ihrer Situation passt</li>
            <li><strong>Engel auswählen:</strong> Sie wählen einen geprüften, versicherten Alltagsbegleiter in Ihrer Nähe und behalten ihn als feste Bezugsperson</li>
            <li><strong>Entspannt starten:</strong> Die Abrechnung mit der Pflegekasse übernehmen wir vollständig — ohne Vorleistung, ohne Papierkram</li>
          </ol>

          <h2>Häufige Fragen zu Alltagsbegleitung und Pflegedienst</h2>
          <div className="blog-faq">
            {faqData.map((f, i) => (
              <details key={i} className="lp-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>

          <div className="blog-cta">
            <h2>Alltagsbegleitung jetzt kennenlernen</h2>
            <p>131 €/Monat von der Pflegekasse. Direkte Abrechnung. Feste Bezugsperson.</p>
            <Link href="/alltagsbegleitung" className="btn-gold">MEHR ZUR ALLTAGSBEGLEITUNG</Link>
          </div>

          <RelatedPosts slug="alltagsbegleitung-vs-pflegedienst" />
        </div>
      </article>
    </main>
  )
}
