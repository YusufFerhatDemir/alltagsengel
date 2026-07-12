import type { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import HowToSchema from '@/components/HowToSchema'
import SpeakableSchema from '@/components/SpeakableSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Was ist Alltagsbegleitung? Der komplette Guide 2026',
  description: 'Was ist Alltagsbegleitung? Definition, Aufgaben, Kosten & Anspruch einfach erklärt. Plus: Alltagsbegleitung beantragen und über 131 €/Monat (§45b) finanzieren.',
  keywords: 'Was ist Alltagsbegleitung, Alltagsbegleitung Definition, Alltagsbegleitung beantragen, Alltagsbegleiter finden, Alltagsbegleitung Kosten, Alltagsbegleitung Aufgaben, §45a SGB XI, Entlastungsbetrag',
  alternates: { canonical: 'https://alltagsengel.care/blog/was-ist-alltagsbegleitung' },
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Was ist Alltagsbegleitung? Der komplette Guide 2026',
    description: 'Definition, Aufgaben, Anspruch, Kosten und Beantragung der Alltagsbegleitung — verständlich erklärt, mit allen Finanzierungswegen.',
  },
};

// Ein gemeinsames Array speist das sichtbare FAQ UND das FAQPage-JSON-LD
// (Google-Richtlinie: FAQ-Markup muss sichtbarem Seiteninhalt entsprechen).
const faqItems = [
  {
    frage: 'Was ist Alltagsbegleitung einfach erklärt?',
    antwort:
      'Alltagsbegleitung ist praktische und soziale Unterstützung im eigenen Zuhause: Einkaufen, Kochen, leichte Hausarbeit, Begleitung zu Terminen und Gesellschaft. Sie ist keine medizinische Pflege, sondern hilft dabei, den Alltag selbstständig zu bewältigen.',
  },
  {
    frage: 'Wer darf Alltagsbegleitung anbieten?',
    antwort:
      'Anbieter müssen nach Landesrecht als „Angebot zur Unterstützung im Alltag" gemäß §45a SGB XI anerkannt sein, damit die Abrechnung über den Entlastungsbetrag möglich ist. Die Alltagsbegleiter durchlaufen dafür eine Basisqualifizierung und werden geprüft.',
  },
  {
    frage: 'Was kostet Alltagsbegleitung pro Stunde?',
    antwort:
      'Je nach Region und Anbieter kostet Alltagsbegleitung etwa 25 bis 45 € pro Stunde. Bei Alltagsengel starten die Stundensätze ab 32 €. Mit Pflegegrad übernimmt die Pflegekasse über den Entlastungsbetrag 131 € pro Monat — in diesem Rahmen zahlen Sie nichts dazu.',
  },
  {
    frage: 'Wer hat Anspruch auf Alltagsbegleitung?',
    antwort:
      'Jede Person mit Pflegegrad 1 bis 5 kann den Entlastungsbetrag von 131 € monatlich für anerkannte Alltagsbegleitung einsetzen — bereits ab Pflegegrad 1. Ohne Pflegegrad ist die Buchung als Selbstzahler möglich.',
  },
  {
    frage: 'Wie beantrage ich Alltagsbegleitung?',
    antwort:
      'Ein separater Antrag ist meist nicht nötig: Mit anerkanntem Pflegegrad steht der Entlastungsbetrag automatisch zu. Sie wählen einen anerkannten Anbieter, dieser rechnet direkt mit der Pflegekasse ab. Ohne Pflegegrad stellen Sie zuerst einen Antrag auf Pflegegrad bei Ihrer Pflegekasse.',
  },
  {
    frage: 'Wie finde ich einen guten Alltagsbegleiter?',
    antwort:
      'Achten Sie auf die Anerkennung nach §45a SGB XI, geprüfte Begleiter mit Führungszeugnis, Versicherungsschutz und die Möglichkeit, die Person vorab kennenzulernen. Über Alltagsengel wählen Sie Ihren Engel selbst aus und können jederzeit wechseln.',
  },
  {
    frage: 'Übernimmt die Krankenkasse die Alltagsbegleitung?',
    antwort:
      'Nein — zuständig ist die Pflegekasse, nicht die Krankenkasse. Die wichtigste Finanzierungsquelle ist der Entlastungsbetrag nach §45b SGB XI (131 €/Monat). Zusätzlich können Verhinderungspflege und umgewandelte Pflegesachleistungen genutzt werden.',
  },
  {
    frage: 'Ist Alltagsbegleitung dasselbe wie Seniorenbetreuung?',
    antwort:
      'Die Begriffe überschneiden sich stark. „Seniorenbetreuung" ist der Oberbegriff für Betreuungsangebote im Alter, „Alltagsbegleitung" bezeichnet die stundenweise Unterstützung im Alltag — oft auch für jüngere Menschen mit Erkrankung oder Behinderung.',
  },
  {
    frage: 'Wie schnell kann Alltagsbegleitung starten?',
    antwort:
      'In der Regel innerhalb weniger Tage. Nach der kostenlosen Registrierung bei Alltagsengel sehen Sie verfügbare Engel in Ihrer Nähe und buchen direkt den ersten Termin — auch kurzfristige Einsätze sind je nach Verfügbarkeit möglich.',
  },
  {
    frage: 'Kann Alltagsbegleitung mit einem Pflegedienst kombiniert werden?',
    antwort:
      'Ja, beides ergänzt sich ideal: Der Pflegedienst übernimmt die körperbezogene Pflege, die Alltagsbegleitung Haushalt, Begleitung und Gesellschaft. Beide Leistungen werden aus unterschiedlichen Budgets der Pflegeversicherung finanziert.',
  },
]

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Was ist Alltagsbegleitung? Der komplette Guide 2026',
  description: 'Was ist Alltagsbegleitung? Definition, Aufgaben, Kosten & Anspruch einfach erklärt. Plus: Alltagsbegleitung beantragen und über 131 €/Monat (§45b) finanzieren.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-07-12',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/was-ist-alltagsbegleitung',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((f) => ({
    '@type': 'Question',
    name: f.frage,
    acceptedAnswer: { '@type': 'Answer', text: f.antwort },
  })),
}

export default function WasIstAlltagsbegleitungPage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Was ist Alltagsbegleitung?' }]} />
      <SpeakableSchema url="/blog/was-ist-alltagsbegleitung" cssSelectors={['.blog-header h1', '.blog-intro p']} />
      <HowToSchema
        name="Alltagsbegleitung beantragen und starten"
        description="So beantragen und starten Sie Alltagsbegleitung über den Entlastungsbetrag (§45b SGB XI, 131 €/Monat) — in vier Schritten."
        totalTime="P7D"
        steps={[
          { name: 'Pflegegrad prüfen oder beantragen', text: 'Mit Pflegegrad 1–5 steht Ihnen der Entlastungsbetrag automatisch zu. Ohne Pflegegrad stellen Sie zunächst einen formlosen Antrag bei der Pflegekasse Ihrer Krankenkasse.', url: '/pflegegrad-check' },
          { name: 'Anerkannten Anbieter wählen', text: 'Wählen Sie ein nach §45a SGB XI anerkanntes Angebot zur Unterstützung im Alltag — nur dann ist die Abrechnung über den Entlastungsbetrag möglich.' },
          { name: 'Alltagsbegleiter kennenlernen', text: 'Registrieren Sie sich kostenlos bei Alltagsengel, wählen Sie einen geprüften Engel in Ihrer Nähe aus und vereinbaren Sie ein erstes Kennenlernen.', url: '/auth/register' },
          { name: 'Termine buchen — Abrechnung läuft automatisch', text: 'Buchen Sie Termine flexibel in der App. Alltagsengel rechnet direkt mit Ihrer Pflegekasse ab — Sie gehen nicht in Vorleistung und reichen keine Belege ein.' },
        ]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <article className="blog-article">
        <div className="blog-header">
          <h1>Was ist Alltagsbegleitung? Der komplette Guide 2026</h1>
          <div className="blog-meta">
            <span className="blog-date">12. Juli 2026</span>
            <span className="blog-reading-time">12 Min. Lesezeit</span>
          </div>
        </div>

        <div className="blog-intro">
          <p>Alltagsbegleitung ist die praktische und soziale Unterstützung pflegebedürftiger Menschen im eigenen Zuhause — vom Einkauf über die Arztbegleitung bis zum gemeinsamen Spaziergang. Sie ist keine medizinische Pflege, sondern Hilfe bei allem, was den Alltag ausmacht. Das Beste: Ab Pflegegrad 1 zahlt die Pflegekasse über den Entlastungsbetrag (§45b SGB XI) 131 € pro Monat dafür. Dieser Guide erklärt Definition, Aufgaben, Anspruch, Kosten und wie Sie Alltagsbegleitung beantragen.</p>
        </div>

        <div className="blog-content">
          <h2>Alltagsbegleitung: Definition und rechtliche Grundlage</h2>
          <p>Der Begriff „Alltagsbegleitung" beschreibt die stundenweise Unterstützung von Menschen, die ihren Alltag krankheits-, alters- oder behinderungsbedingt nicht mehr vollständig allein bewältigen können. Rechtlich verankert ist sie im Elften Sozialgesetzbuch: <strong>§45a SGB XI</strong> fasst Alltagsbegleitung unter den „Angeboten zur Unterstützung im Alltag" zusammen. Dazu zählen drei Bereiche:</p>
          <ul>
            <li><strong>Betreuungsangebote:</strong> Beaufsichtigung, Begleitung und soziale Aktivierung — etwa Gespräche, Spaziergänge, Gedächtnistraining oder gemeinsame Freizeitgestaltung.</li>
            <li><strong>Angebote zur Entlastung von Pflegenden:</strong> Stundenweise Übernahme von Aufgaben, damit pflegende Angehörige Freiräume bekommen.</li>
            <li><strong>Angebote zur Entlastung im Alltag:</strong> Hauswirtschaftliche Hilfen wie Einkaufen, Kochen, Aufräumen oder Wäsche sowie Unterstützung bei Behördengängen.</li>
          </ul>
          <p>Damit ein Anbieter über die Pflegekasse abrechnen darf, muss er nach den Vorgaben des jeweiligen Bundeslandes <strong>anerkannt</strong> sein. Die eingesetzten Alltagsbegleiter absolvieren dafür eine Basisqualifizierung, werden geprüft und sind im Einsatz versichert. Bei Alltagsengel heißen die geprüften Alltagsbegleiter „Engel" — sie durchlaufen Identitätsprüfung, Führungszeugnis-Check und Schulung nach den landesrechtlichen Vorgaben.</p>

          <h2>Welche Aufgaben übernimmt ein Alltagsbegleiter?</h2>
          <p>Die Aufgaben richten sich nach dem individuellen Bedarf — kein Einsatz gleicht dem anderen. Typische Leistungen sind:</p>
          <ul>
            <li><strong>Einkaufen und Besorgungen:</strong> Gemeinsam oder stellvertretend — inklusive Apotheke, Post und Reinigung. Mehr dazu im Ratgeber <Link href="/blog/einkaufshilfe-senioren">Einkaufshilfe für Senioren</Link>.</li>
            <li><strong>Hauswirtschaftliche Unterstützung:</strong> Kochen, Aufräumen, leichte Reinigungsarbeiten, Wäsche, Blumen gießen.</li>
            <li><strong>Begleitung zu Terminen:</strong> Arzt, Physiotherapie, Friseur, Bank oder Behörde — zu Fuß, mit dem ÖPNV oder im Auto. Details im Ratgeber <Link href="/blog/arztbegleitung-senioren">Arztbegleitung für Senioren</Link>.</li>
            <li><strong>Gesellschaft und Aktivierung:</strong> Gespräche, Vorlesen, Spiele, Spaziergänge, gemeinsames Kochen — soziale Teilhabe ist ein Kernbestandteil und wirkt nachweislich gegen <Link href="/blog/einsamkeit-im-alter">Einsamkeit im Alter</Link>.</li>
            <li><strong>Tagesstruktur:</strong> Feste Besuchsrhythmen geben Halt — besonders wertvoll bei <Link href="/blog/alltagsbegleitung-demenz">Demenz</Link> oder <Link href="/blog/alltagsbegleitung-psychische-erkrankungen">psychischen Erkrankungen</Link>.</li>
            <li><strong>Unterstützung bei Anträgen:</strong> Hilfe beim Papierkram mit Pflegekasse und Behörden.</li>
          </ul>
          <p><strong>Was Alltagsbegleitung nicht ist:</strong> Sie umfasst keine körperbezogene Pflege (Waschen, Anziehen, Toilettengang) und keine medizinischen Leistungen (Medikamentengabe, Wundversorgung). Diese Aufgaben gehören zum Pflegedienst — die Unterschiede erklärt ausführlich unser Ratgeber <Link href="/blog/alltagsbegleitung-vs-pflegedienst">Alltagsbegleitung vs. Pflegedienst</Link>.</p>

          <h2>Für wen eignet sich Alltagsbegleitung?</h2>
          <p>Alltagsbegleitung ist nicht nur etwas für hochbetagte Menschen. Sie hilft in ganz unterschiedlichen Lebenslagen:</p>
          <ul>
            <li><strong>Alleinlebende Seniorinnen und Senioren,</strong> die mit etwas Unterstützung selbstständig zu Hause bleiben möchten — statt in eine stationäre Einrichtung zu ziehen.</li>
            <li><strong>Menschen mit Demenz,</strong> die von vertrauten Bezugspersonen, fester Tagesstruktur und geduldiger Aktivierung profitieren.</li>
            <li><strong>Menschen mit psychischen Erkrankungen</strong> wie Depression oder Angststörung, denen der Alltag über den Kopf wächst.</li>
            <li><strong>Menschen nach Operation oder Krankenhausaufenthalt,</strong> die vorübergehend Hilfe brauchen.</li>
            <li><strong>Pflegende Angehörige,</strong> die regelmäßige Entlastung brauchen, um selbst gesund zu bleiben.</li>
            <li><strong>Menschen mit Behinderung oder chronischer Erkrankung,</strong> die punktuell praktische Unterstützung wünschen.</li>
          </ul>

          <h2>Was kostet Alltagsbegleitung?</h2>
          <p>Die Stundensätze für Alltagsbegleitung liegen in Deutschland je nach Region und Anbieter zwischen <strong>25 und 45 € pro Stunde</strong>. Bei Alltagsengel starten die Preise ab <strong>32 € pro Stunde</strong> — inklusive Versicherungsschutz, geprüfter Begleiter und kompletter Abrechnung mit der Pflegekasse.</p>
          <p>Entscheidend ist aber nicht der Stundensatz allein, sondern die Finanzierung: Mit einem anerkannten Pflegegrad zahlt die Pflegekasse über den <strong>Entlastungsbetrag nach §45b SGB XI</strong> monatlich <strong>131 €</strong> — das entspricht etwa vier Begleitstunden pro Monat, also einem festen wöchentlichen Besuch, <strong>ohne Eigenanteil</strong>. Eine detaillierte Kostenaufstellung mit Rechenbeispielen finden Sie im Ratgeber <Link href="/blog/alltagsbegleitung-kosten">Was kostet Alltagsbegleitung?</Link></p>

          <h2>Wer zahlt? Alle Finanzierungswege im Überblick</h2>
          <p>Für die Finanzierung der Alltagsbegleitung gibt es mehrere Töpfe, die sich kombinieren lassen:</p>
          <ul>
            <li><strong>Entlastungsbetrag (§45b SGB XI):</strong> 131 € pro Monat, ab Pflegegrad 1, zweckgebunden für anerkannte Angebote zur Unterstützung im Alltag. Nicht genutzte Beträge werden angespart und bleiben bis zum 30. Juni des Folgejahres nutzbar. Alles Wichtige auf unserer Seite zum <Link href="/entlastungsbetrag">Entlastungsbetrag</Link>.</li>
            <li><strong>Umwandlungsanspruch (§45a Abs. 4 SGB XI):</strong> Ab Pflegegrad 2 können bis zu 40 % der ambulanten Pflegesachleistungen zusätzlich für Alltagsbegleitung umgewidmet werden — je nach Pflegegrad mehrere hundert Euro monatlich.</li>
            <li><strong>Verhinderungspflege (§39 SGB XI):</strong> Wenn eine private Pflegeperson ausfällt oder eine Auszeit braucht, stehen bis zu 3.539 € pro Jahr für Ersatzbetreuung zur Verfügung. Details auf der Seite <Link href="/verhinderungspflege">Verhinderungspflege</Link>.</li>
            <li><strong>Sozialamt (Hilfe zur Pflege):</strong> Bei geringem Einkommen kann das Sozialamt einspringen.</li>
            <li><strong>Private Selbstzahlung:</strong> Ohne Pflegegrad oder über die Budgets hinaus jederzeit möglich; haushaltsnahe Dienstleistungen sind steuerlich absetzbar (§35a EStG).</li>
          </ul>
          <p>Welche Kombination in Ihrem Fall am meisten herausholt, zeigt der <Link href="/budgetrechner">Budgetrechner</Link> oder unsere Übersicht <Link href="/blog/wer-zahlt-alltagsbegleitung">Wer zahlt die Alltagsbegleitung?</Link></p>

          <h2>Alltagsbegleitung beantragen: Schritt für Schritt</h2>
          <p>Die gute Nachricht vorweg: Einen komplizierten Antrag auf „Alltagsbegleitung" gibt es nicht. So gehen Sie vor:</p>
          <h3>Schritt 1: Pflegegrad prüfen oder beantragen</h3>
          <p>Mit Pflegegrad 1 bis 5 steht Ihnen der Entlastungsbetrag automatisch zu — Sie müssen ihn nicht gesondert beantragen. Haben Sie noch keinen Pflegegrad, stellen Sie einen formlosen Antrag bei der Pflegekasse (bei Ihrer Krankenkasse angesiedelt). Wie das geht, erklärt der Ratgeber <Link href="/blog/pflegegrad-beantragen">Pflegegrad beantragen</Link>. Eine erste Einschätzung liefert unser kostenloser <Link href="/pflegegrad-check">Pflegegrad-Check</Link>.</p>
          <h3>Schritt 2: Anerkannten Anbieter wählen</h3>
          <p>Nur bei einem nach Landesrecht anerkannten Angebot zur Unterstützung im Alltag (§45a SGB XI) kann die Pflegekasse den Entlastungsbetrag verrechnen. Fragen Sie gezielt nach der Anerkennung — oder wählen Sie direkt einen anerkannten Anbieter wie Alltagsengel.</p>
          <h3>Schritt 3: Alltagsbegleiter kennenlernen</h3>
          <p>Vertrauen ist alles, wenn jemand ins eigene Zuhause kommt. Planen Sie den ersten Termin bewusst als Kennenlernen — idealerweise mit einem Angehörigen dabei. Bei Alltagsengel wählen Sie Ihren Engel selbst aus und können jederzeit ohne Begründung wechseln.</p>
          <h3>Schritt 4: Termine buchen — die Abrechnung läuft automatisch</h3>
          <p>Sie buchen Termine flexibel per App oder Website, die geleisteten Stunden werden dokumentiert und direkt mit der Pflegekasse abgerechnet. Sie gehen nicht in Vorleistung und reichen keine Belege ein.</p>

          <h2>Alltagsbegleiter finden: Darauf sollten Sie achten</h2>
          <p>Ob über eine Plattform, einen lokalen Verein oder eine Empfehlung — prüfen Sie bei der Auswahl fünf Punkte:</p>
          <ul>
            <li><strong>Anerkennung nach §45a SGB XI:</strong> Ohne sie keine Abrechnung über den Entlastungsbetrag.</li>
            <li><strong>Geprüfte Begleiter:</strong> Identitätsprüfung, polizeiliches Führungszeugnis und Qualifizierung sollten Standard sein.</li>
            <li><strong>Versicherungsschutz:</strong> Der Begleiter sollte während der Einsätze haftpflichtversichert sein.</li>
            <li><strong>Feste Bezugsperson:</strong> Es sollte möglichst immer dieselbe Person kommen — mit Wechselrecht, falls die Chemie nicht stimmt.</li>
            <li><strong>Transparente Abrechnung:</strong> Direkte Abrechnung mit der Pflegekasse, dokumentierte Einsätze, keine Vorkasse.</li>
          </ul>
          <p>Bei Alltagsengel sind alle fünf Punkte erfüllt: Sie sehen verfügbare Engel in Ihrer Nähe, wählen selbst aus und behalten Ihre feste Bezugsperson. In Frankfurt und dem gesamten Rhein-Main-Gebiet — von <Link href="/alltagsbegleitung/frankfurt">Frankfurt</Link> über <Link href="/alltagsbegleitung/offenbach">Offenbach</Link> und <Link href="/alltagsbegleitung/wiesbaden">Wiesbaden</Link> bis <Link href="/alltagsbegleitung/darmstadt">Darmstadt</Link> — sind unsere Engel für Sie im Einsatz.</p>

          <h2>Alltagsbegleitung vs. verwandte Begriffe</h2>
          <p>Rund um die Betreuung zu Hause kursieren viele Begriffe. So ordnen Sie sie ein:</p>
          <ul>
            <li><strong>Seniorenbetreuung:</strong> Oberbegriff für alle Betreuungsformen im Alter — die Alltagsbegleitung ist die häufigste ambulante Variante. Überblick: <Link href="/blog/seniorenbetreuung-zu-hause">Seniorenbetreuung zu Hause</Link>.</li>
            <li><strong>Haushaltshilfe:</strong> Fokus auf hauswirtschaftliche Arbeiten; Alltagsbegleitung umfasst zusätzlich Begleitung und soziale Betreuung.</li>
            <li><strong>Betreuungskraft (§53b SGB XI):</strong> Zusätzliche Betreuungskräfte in stationären Pflegeeinrichtungen — nicht zu verwechseln mit ambulanter Alltagsbegleitung.</li>
            <li><strong>Pflegedienst:</strong> Körperbezogene Pflege und medizinische Behandlungspflege durch Pflegefachkräfte — die Abgrenzung erklärt unser <Link href="/blog/alltagsbegleitung-vs-pflegedienst">Vergleichs-Ratgeber</Link>.</li>
            <li><strong>24-Stunden-Betreuung:</strong> Eine im Haushalt lebende Betreuungskraft — deutlich teurer; Alltagsbegleitung ist die flexible, stundenweise Alternative.</li>
          </ul>

          <h2>Häufige Fragen zur Alltagsbegleitung</h2>
          {faqItems.map((f) => (
            <div key={f.frage}>
              <h3>{f.frage}</h3>
              <p>{f.antwort}</p>
            </div>
          ))}

          <h2>Fazit: Alltagsbegleitung ist die zugänglichste Pflegeleistung</h2>
          <p>Alltagsbegleitung ist der einfachste Weg, Unterstützung ins eigene Zuhause zu holen: kein komplizierter Antrag, ab Pflegegrad 1 verfügbar und über den Entlastungsbetrag von 131 € monatlich ohne Eigenanteil finanzierbar. Sie erhält Selbstständigkeit, wirkt gegen Einsamkeit und entlastet Angehörige — und lässt sich mit Pflegedienst, Verhinderungspflege und weiteren Leistungen kombinieren.</p>
        </div>

        <div className="blog-cta">
          <h3>Alltagsbegleitung unverbindlich kennenlernen</h3>
          <p>Registrieren Sie sich kostenlos, wählen Sie einen geprüften Engel in Ihrer Nähe und nutzen Sie Ihre 131 €/Monat von der Pflegekasse — wir übernehmen die komplette Abrechnung.</p>
          <Link href="/alltagsbegleitung" className="btn-gold">Mehr zur Alltagsbegleitung</Link>
        </div>

        <RelatedPosts slug="was-ist-alltagsbegleitung" />
      </article>
    </main>
  );
}
