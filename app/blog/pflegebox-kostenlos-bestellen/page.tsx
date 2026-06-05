import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Pflegebox kostenlos bestellen — 42€/Monat von der Pflegekasse',
  description: 'Pflegebox kostenlos bestellen: Bis zu 42€ monatlich für Pflegehilfsmittel von der Pflegekasse. Handschuhe, Desinfektion, Bettschutz — alles in einer Box. Jetzt bestellen.',
  keywords: ['Pflegebox bestellen', 'Pflegebox kostenlos', 'Pflegehilfsmittel bestellen', 'Pflegebox Pflegekasse', 'Pflegebox 42 Euro', 'Hygienebox bestellen', 'Pflegehilfsmittel kostenlos'],
  alternates: { canonical: 'https://alltagsengel.care/blog/pflegebox-kostenlos-bestellen' },
  openGraph: {
    title: 'Pflegebox kostenlos bestellen — 42€/Monat',
    description: 'Pflegehilfsmittel kostenlos von der Pflegekasse. Bis zu 42€ monatlich. Jetzt Pflegebox bestellen.',
    url: 'https://alltagsengel.care/blog/pflegebox-kostenlos-bestellen',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Pflegebox kostenlos bestellen — 42€/Monat von der Pflegekasse',
  description: 'Pflegebox kostenlos bestellen: Pflegehilfsmittel von der Pflegekasse.',
  author: { '@type': 'Organization', name: 'Alltagsengel' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  datePublished: '2026-06-04',
  mainEntityOfPage: 'https://alltagsengel.care/blog/pflegebox-kostenlos-bestellen',
}

const faqData = [
  { q: 'Ist die Pflegebox wirklich kostenlos?', a: 'Ja. Bei anerkanntem Pflegegrad (1–5) übernimmt die Pflegekasse nach §40 SGB XI bis zu 42 € monatlich für Pflegehilfsmittel zum Verbrauch. Ihr Eigenanteil beträgt 0 €.' },
  { q: 'Was ist in der Pflegebox enthalten?', a: 'Einmalhandschuhe, Händedesinfektion, Flächendesinfektion, Bettschutzeinlagen, Mund-Nasen-Schutz und Schutzschürzen. Den Inhalt können Sie in der App individuell anpassen.' },
  { q: 'Wie bestelle ich die Pflegebox?', a: 'Registrieren Sie sich kostenlos bei Alltagsengel, geben Sie Ihren Pflegegrad an, und wir kümmern uns um den Antrag bei Ihrer Pflegekasse. Die erste Box kommt innerhalb weniger Werktage.' },
  { q: 'Muss ich einen Antrag bei der Pflegekasse stellen?', a: 'Nein — wir übernehmen die komplette Antragstellung und Abrechnung mit Ihrer Pflegekasse. Sie müssen sich um nichts kümmern.' },
  { q: 'Wie oft wird die Pflegebox geliefert?', a: 'Monatlich, automatisch und direkt zu Ihnen nach Hause. Ohne dass Sie sich jeden Monat neu darum kümmern müssen.' },
  { q: 'Kann ich die Pflegebox jederzeit kündigen?', a: 'Ja. Keine Bindung, keine Mindestlaufzeit. Sie können jederzeit kündigen oder pausieren.' },
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

export default function PflegeboxBestellenPage() {
  return (
    <main className="blog-container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }} />

      <article className="blog-article">
        <header className="blog-header">
          <h1>Pflegebox kostenlos bestellen — 42€/Monat von der Pflegekasse</h1>
          <p className="blog-meta">Veröffentlicht am 4. Juni 2026 | 4 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Sie pflegen einen Angehörigen und brauchen regelmäßig Handschuhe, Desinfektion und Bettschutz?
            Mit der <strong>Pflegebox von Alltagsengel</strong> erhalten Sie jeden Monat Pflegehilfsmittel
            im Wert von bis zu <strong>42 €</strong> — komplett kostenlos, bezahlt von der Pflegekasse.
          </p>

          <h2>42 € monatlich — Ihr Anspruch nach §40 SGB XI</h2>
          <p>
            Das Sozialgesetzbuch garantiert jedem Menschen mit Pflegegrad 1–5 einen monatlichen Anspruch
            auf Pflegehilfsmittel zum Verbrauch. Die Pflegekasse zahlt bis zu <strong>42 € pro Monat</strong>.
            Ihr Eigenanteil: <strong>0 €</strong>.
          </p>
          <p>
            Trotzdem nutzen Millionen Pflegebedürftige diese Leistung nicht — weil sie davon nicht wissen
            oder den Antrag scheuen. Mit Alltagsengel ist beides kein Problem mehr.
          </p>

          <h2>Das ist in der Pflegebox</h2>
          <ul className="blog-list">
            <li><strong>Einmalhandschuhe</strong> — Latex-frei, in verschiedenen Größen</li>
            <li><strong>Händedesinfektion</strong> — für die tägliche Hygiene</li>
            <li><strong>Flächendesinfektion</strong> — für Oberflächen und Hilfsmittel</li>
            <li><strong>Bettschutzeinlagen</strong> — saugstark und hautfreundlich</li>
            <li><strong>Mund-Nasen-Schutz</strong> — Schutz bei der Pflege</li>
            <li><strong>Schutzschürzen</strong> — Einmalschürzen für den Pflegealltag</li>
          </ul>
          <p>
            Den Inhalt passen Sie in der App an Ihren Bedarf an. Mehr Handschuhe, weniger Schürzen?
            Kein Problem.
          </p>

          <h2>So bestellen Sie in 3 Schritten</h2>
          <ol className="blog-list">
            <li><strong>Registrieren:</strong> Kostenlos auf alltagsengel.care — dauert 2 Minuten</li>
            <li><strong>Pflegegrad angeben:</strong> Wir prüfen Ihren Anspruch und stellen den Antrag</li>
            <li><strong>Box erhalten:</strong> Monatlich automatisch zu Ihnen nach Hause</li>
          </ol>

          <h2>Warum Alltagsengel statt andere Anbieter?</h2>
          <ul className="blog-list">
            <li><strong>Alles digital:</strong> Kein Papierkram, alles in der App</li>
            <li><strong>Antrag inklusive:</strong> Wir kümmern uns um die Pflegekasse</li>
            <li><strong>Flexibel:</strong> Inhalt anpassbar, jederzeit kündbar</li>
            <li><strong>Regional:</strong> Sitz in Frankfurt, Lieferung deutschlandweit</li>
            <li><strong>Sozial:</strong> 1 € jeder Bestellung geht an Kinder und Familien in Not</li>
          </ul>

          <h2>Häufige Fragen zur Pflegebox</h2>
          <div className="blog-faq">
            {faqData.map((f, i) => (
              <details key={i} className="lp-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>

          <div className="blog-cta">
            <h2>Pflegebox jetzt kostenlos bestellen</h2>
            <p>0 € Eigenanteil. Keine Bindung. Monatlich automatisch geliefert.</p>
            <Link href="/choose"><button className="btn-gold">JETZT BESTELLEN</button></Link>
          </div>
        </div>
      </article>
    </main>
  )
}
