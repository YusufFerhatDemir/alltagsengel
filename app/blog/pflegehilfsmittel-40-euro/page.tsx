import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Pflegehilfsmittel: 42€/Monat kostenlos',
  description: 'Pflegehilfsmittel kostenlos: Bis zu 42 € monatlich von der Pflegekasse (§40 SGB XI). Hygienebox mit Windeln & Bettschutz — jetzt bestellen.',
  keywords: ['Pflegehilfsmittel', 'Hygienebox', '§40 SGB XI', '42 Euro', 'Pflegekasse', 'Windeln', 'Bettschutz', 'kostenlos'],
  alternates: { canonical: 'https://alltagsengel.care/blog/pflegehilfsmittel-40-euro' },
  openGraph: {
    title: 'Pflegehilfsmittel: 42€/Monat kostenlos — Hygienebox',
    description: 'Bestellen Sie monatlich Pflegehilfsmittel kostenlos. Die Pflegekasse zahlt bis 42€.',
    url: 'https://alltagsengel.care/blog/pflegehilfsmittel-40-euro',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}


const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Pflegehilfsmittel: 42€/Monat kostenlos — Hygienebox bestellen',
  description: 'Pflegehilfsmittel kostenlos: Bis zu 42 € monatlich von der Pflegekasse (§40 SGB XI). Hygienebox mit Windeln & Bettschutz — jetzt bestellen.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-03-19',
  dateModified: '2026-03-19',
  mainEntityOfPage: 'https://alltagsengel.care/blog/pflegehilfsmittel-40-euro',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

export default function PflegehilfsmittelPage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Pflegehilfsmittel kostenlos' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <article className="blog-article">
        <header className="blog-header">
          <h1>Pflegehilfsmittel: 42€/Monat kostenlos — Hygienebox bestellen</h1>
          <p className="blog-meta">Veröffentlicht am 19. März 2026 | 5 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Wussten Sie, dass Ihnen monatlich <strong>bis zu 42 Euro</strong> für Pflegehilfsmittel zustehen? 
            Diese Leistung nach <strong>§40 SGB XI</strong> wird oft übersehen — dabei können Sie sich damit 
            Windeln, Bettschutz, Einmalhandschuhe und vieles mehr <strong>komplett kostenlos</strong> von der Pflegekasse holen.
          </p>

          <h2>42 Euro monatlich — Das ist in der Hygienebox enthalten</h2>
          <p>
            Mit der Alltagsengel Hygienebox erhalten Sie jeden Monat:
          </p>
          <ul className="blog-list">
            <li>✓ Windeln (verschiedene Größen)</li>
            <li>✓ Bettschutzeinlagen</li>
            <li>✓ Einmalhandschuhe (Latex-frei)</li>
            <li>✓ Desinfektionstücher</li>
            <li>✓ Waschhandschuhe</li>
            <li>✓ Zahnpflegesticks</li>
            <li>✓ Feuchttücher für Hygiene</li>
            <li>✓ Spuckbeutel</li>
          </ul>
          <p>
            Die Box wird <strong>monatlich zu Ihnen nach Hause geliefert</strong> — kostenlos und diskret verpackt.
          </p>

          <h2>Wer bekommt Pflegehilfsmittel?</h2>
          <p>
            Anspruch auf die kostenlose Hygienebox haben alle Personen mit:
          </p>
          <ul className="blog-list">
            <li>Pflegegrad 1, 2, 3, 4 oder 5</li>
            <li>Gültigem Versicherungsschutz</li>
            <li>Notwendigkeit für Inkontinenzversorgung oder persönliche Hygiene</li>
          </ul>
          <p>
            Sie müssen <strong>keinen extra Antrag stellen</strong> — wir kümmern uns darum!
          </p>

          <h2>§40 SGB XI — Das ist Ihre Leistung</h2>
          <p>
            Die Leistung für Pflegehilfsmittel ist im <strong>Sozialgesetzbuch XI (Pflegeversicherungsgesetz)</strong> verankert.
            Jede Pflegekasse muss diese Leistung uneingeschränkt erbringen.
          </p>
          <p>
            <strong>Das Wichtigste:</strong> Sie zahlen keinen Eigenanteil. Die kompletten 42€ bezahlt die Pflegekasse. 
            Sie müssen nur registriert sein — mehr nicht.
          </p>

          <h2>So funktioniert die Bestellung bei Alltagsengel</h2>
          <ol className="blog-list">
            <li>Registrieren Sie sich kostenlos auf alltagsengel.care</li>
            <li>Geben Sie Ihren Pflegegrad und Ihre Adresse an</li>
            <li>Wir kümmern uns um den Antrag bei Ihrer Pflegekasse</li>
            <li>Sie erhalten die Hygienebox jeden Monat automatisch</li>
            <li>Das war es — <strong>Keine Kosten für Sie</strong></li>
          </ol>

          <h2>Beispiel: So sparen Sie jährlich über 400€</h2>
          <p>
            <strong>Hans, 76 Jahre alt:</strong> Er hat Pflegegrad 2 und benötigt täglich Windeln und Bettschutz. 
            Ohne die Hygienebox würde er im Drogeriemarkt oder in der Apotheke monatlich etwa 50-60€ ausgeben.
          </p>
          <p>
            Mit Alltagsengel bekommt er die Box kostenlos — und spart damit <strong>jährlich 600-720€</strong>. 
            Geld, das er für andere wichtige Dinge braucht.
          </p>

          <h2>Häufig gestellte Fragen</h2>
          <p>
            <strong>Kann ich selbst aussuchen, was in der Box ist?</strong><br />
            Ja! Sie können die Zusammensetzung anpassen. Nicht alle Windeln passen — wir berücksichtigen Ihre Größe und Vorlieben.
          </p>
          <p>
            <strong>Ist die Lieferung wirklich kostenlos?</strong><br />
            Absolut. Die Pflegekasse bezahlt 100%. Sie zahlen 0€.
          </p>
          <p>
            <strong>Kommt die Box auch in die Schweiz oder nach Österreich?</strong><br />
            Derzeit nur in Deutschland. Wir planen aber eine Expansion.
          </p>
          <p>
            <strong>Was passiert mit ungenutztem Budget?</strong><br />
            Der Betrag gilt <strong>pro Monat</strong>: Nicht genutztes Budget wird nicht in den Folgemonat übertragen.
            Deshalb lohnt sich die regelmäßige monatliche Lieferung.
          </p>

          <h2>Weitere Pflegehilfsmittel — Das sollten Sie kennen</h2>
          <p>
            Neben der Hygienebox gibt es noch andere Pflegehilfsmittel, für die Sie sich registrieren können:
          </p>
          <ul className="blog-list">
            <li><strong>Kanülenbox:</strong> Für Menschen mit Stoma oder Katheter</li>
            <li><strong>Spezialwindeln:</strong> Höhere Leistung in begründeten Fällen</li>
            <li><strong>Dekubitusprophylaxe:</strong> Anti-Druckgeschwür-Materialien</li>
            <li><strong>Zahnpflege-Sets:</strong> Speziell für bettlägerige Menschen</li>
          </ul>

          <h2>Worauf Sie achten sollten</h2>
          <p>
            <strong>Vergessen Sie nicht:</strong> Der Leistungsanspruch für Pflegehilfsmittel gilt das <strong>ganze Jahr</strong>.
            Viele Menschen verschenken ihr Jahresbudget von 504€, weil sie nicht wissen, dass sie automatisch Anspruch haben.
          </p>
          <p>
            Melden Sie sich noch heute an und sichern Sie sich die kostenlose monatliche Lieferung!
          </p>

          <div className="blog-cta">
            <h3>Jetzt kostenlose Hygienebox bestellen</h3>
            <p>
              Registrieren Sie sich jetzt und erhalten Sie jeden Monat bis zu 42€ an Pflegehilfsmitteln —
              kostenlos direkt nach Hause geliefert.
            </p>
            <Link href="/pflegebox" className="cta-button">
              Hygienebox bestellen →
            </Link>
          </div>
        </div>

        <RelatedPosts slug="pflegehilfsmittel-40-euro" />

        <footer className="blog-footer">
          <Link href="/" className="blog-back">← Zurück zur Startseite</Link>
        </footer>
      </article>
    </main>
  )
}
