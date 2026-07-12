import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Welche Pflegehilfsmittel stehen mir zu?',
  description: 'Pflegehilfsmittel im Überblick: 42 €/Monat zum Verbrauch (§40 SGB XI), technische Hilfsmittel wie Pflegebett & Hausnotruf, Zuständigkeit Pflegekasse vs. Krankenkasse.',
  keywords: ['Pflegehilfsmittel Anspruch', 'welche Pflegehilfsmittel stehen mir zu', 'Pflegehilfsmittel 42 Euro', 'Pflegehilfsmittel 40 Euro', 'Pflegehilfsmittel Liste', 'technische Pflegehilfsmittel', 'Pflegehilfsmittel Pflegegrad 1', 'Pflegehilfsmittelverzeichnis'],
  alternates: { canonical: 'https://alltagsengel.care/blog/welche-pflegehilfsmittel-stehen-mir-zu' },
  openGraph: {
    title: 'Welche Pflegehilfsmittel stehen mir zu?',
    description: 'Von der 42-€-Pauschale bis zum Pflegebett: alle Pflegehilfsmittel-Ansprüche im Überblick — wer zahlt was, und wie Sie jede Leistung bekommen.',
    url: 'https://alltagsengel.care/blog/welche-pflegehilfsmittel-stehen-mir-zu',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Welche Pflegehilfsmittel stehen mir zu?',
  description: 'Pflegehilfsmittel im Überblick: 42 €/Monat zum Verbrauch (§40 SGB XI), technische Hilfsmittel wie Pflegebett & Hausnotruf, Zuständigkeit Pflegekasse vs. Krankenkasse.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: {
    '@type': 'Organization',
    name: 'Alltagsengel',
    url: 'https://alltagsengel.care',
    logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' },
  },
  datePublished: '2026-07-12',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/welche-pflegehilfsmittel-stehen-mir-zu',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

const faqData = [
  { q: 'Welche Pflegehilfsmittel bekomme ich kostenlos?', a: 'Mit Pflegegrad 1–5 und Pflege zu Hause: Verbrauchshilfsmittel bis 42 €/Monat (Handschuhe, Desinfektion, Bettschutz, Mundschutz, Schürzen) ohne Zuzahlung. Technische Pflegehilfsmittel wie Pflegebett oder Hausnotruf werden separat genehmigt — meist leihweise mit höchstens 25 € Eigenanteil (max. 10 % pro Hilfsmittel).' },
  { q: 'Mindern Pflegehilfsmittel mein Pflegegeld?', a: 'Nein. Die 42-€-Pauschale und technische Hilfsmittel sind eigene Ansprüche nach §40 SGB XI. Sie werden weder auf das Pflegegeld noch auf den Entlastungsbetrag (131 €/Monat) angerechnet.' },
  { q: 'Wer zahlt: Pflegekasse oder Krankenkasse?', a: 'Faustregel: Dient das Hilfsmittel der Pflege (Pflegebett, Bettschutz, Handschuhe), zahlt die Pflegekasse. Gleicht es eine Krankheit oder Behinderung aus (Rollator, Hörgerät, Inkontinenzmaterial bei diagnostizierter Inkontinenz), zahlt die Krankenkasse — dann mit ärztlichem Rezept.' },
  { q: 'Bekomme ich Pflegehilfsmittel schon mit Pflegegrad 1?', a: 'Ja. Sowohl die 42-€-Pauschale für Verbrauchshilfsmittel als auch technische Pflegehilfsmittel und der Wohnumfeld-Zuschuss (bis 4.180 € pro Maßnahme) stehen ab Pflegegrad 1 in voller Höhe zu.' },
  { q: 'Was zählt NICHT als Pflegehilfsmittel?', a: 'Windeln und Inkontinenzeinlagen laufen nicht über die 42-€-Pauschale, sondern als Krankenkassen-Leistung mit Rezept bei diagnostizierter Inkontinenz. Auch normale Hygieneartikel wie Shampoo oder Feuchttücher sind nicht erstattungsfähig.' },
  { q: 'Kann ich die 42 € ansparen, wenn ich einen Monat nichts brauche?', a: 'Nein, die Pauschale verfällt am Monatsende. Anders der Entlastungsbetrag: Der kann bis zum 30. Juni des Folgejahres angespart werden. Deshalb lohnt bei den Verbrauchshilfsmitteln eine laufende monatliche Lieferung.' },
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

export default function PflegehilfsmittelAnspruchPage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Welche Pflegehilfsmittel stehen mir zu?' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <article className="blog-article">
        <header className="blog-header">
          <h1>Welche Pflegehilfsmittel stehen mir zu?</h1>
          <p className="blog-meta">Veröffentlicht am 12. Juli 2026 | 8 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            „Pflegehilfsmittel" ist ein Sammelbegriff für sehr unterschiedliche Leistungen —
            von der monatlichen <strong>42-€-Pauschale</strong> für Handschuhe und Desinfektion
            bis zum leihweisen <strong>Pflegebett</strong>. Wer was bezahlt, hängt von der Art
            des Hilfsmittels ab. Dieser Überblick zeigt alle Ansprüche, die Zuständigkeiten
            und den schnellsten Weg zu jeder Leistung.
          </p>

          <h2>Die zwei Arten von Pflegehilfsmitteln nach §40 SGB XI</h2>
          <p>
            Das Gesetz unterscheidet <strong>zum Verbrauch bestimmte</strong> und{' '}
            <strong>technische</strong> Pflegehilfsmittel. Beide stehen jedem Menschen mit
            anerkanntem Pflegegrad (1–5) zu, der zu Hause gepflegt wird — und beide Ansprüche
            bestehen <strong>parallel</strong>, ohne sich gegenseitig zu mindern.
          </p>

          <h2>1. Verbrauchshilfsmittel: 42 € jeden Monat (Produktgruppe 54)</h2>
          <p>
            Die Pflegekasse übernimmt bis zu <strong>42 € pro Monat</strong> (seit 01.01.2025,
            vorher 40 €) für Produkte, die bei der Pflege verbraucht werden:
          </p>
          <ul className="blog-list">
            <li><strong>Einmalhandschuhe</strong> — das meistgebrauchte Hilfsmittel: Körperpflege, Wundversorgung, Inkontinenzwechsel</li>
            <li><strong>Händedesinfektionsmittel</strong> — vor und nach jeder Pflegetätigkeit</li>
            <li><strong>Flächendesinfektionsmittel</strong> — Pflegebett, Nachttisch, Griffe</li>
            <li><strong>Saugende Bettschutzeinlagen</strong> (Einmalgebrauch) — schützen Matratze und Bettwäsche</li>
            <li><strong>Mundschutz / FFP2-Masken</strong> — Infektionsschutz in beide Richtungen</li>
            <li><strong>Schutzschürzen und Fingerlinge</strong> — für die Körperpflege</li>
          </ul>
          <p>
            Kein Rezept nötig, keine Zuzahlung — nur ein einmaliger Antrag bei der Pflegekasse.
            Am einfachsten als monatliche Box: Im{' '}
            <Link href="/pflegebox">Pflegebox-Konfigurator</Link> stellen Sie die Produkte in
            2 Minuten zusammen, den Antrag übernimmt Alltagsengel. Die komplette
            Schritt-für-Schritt-Anleitung finden Sie im Ratgeber{' '}
            <Link href="/blog/pflegebox-bestellen-anleitung">Pflegebox bestellen —
            Komplettanleitung 2026</Link>.
          </p>
          <p>
            <strong>Wichtig:</strong> Die Pauschale verfällt am Monatsende und lässt sich nicht
            ansparen. Bis zu <strong>504 € im Jahr</strong> gehen verloren, wenn Sie die
            Leistung nicht abrufen.
          </p>

          <h2>2. Technische Pflegehilfsmittel: Pflegebett, Hausnotruf &amp; Co.</h2>
          <p>
            Technische Pflegehilfsmittel erleichtern die Pflege dauerhaft und werden separat
            beantragt — meist stellt die Pflegekasse sie <strong>leihweise</strong> zur
            Verfügung. Bei Kauf beträgt die Zuzahlung höchstens 10 %, maximal 25 € pro
            Hilfsmittel. Typische Beispiele:
          </p>
          <ul className="blog-list">
            <li><strong>Pflegebett</strong> mit verstellbarer Liegefläche und Seitengittern</li>
            <li><strong>Hausnotruf</strong> — Zuschuss von 25,50 €/Monat für den Basisdienst</li>
            <li><strong>Toilettensitzerhöhung, Duschhocker, Badewannenlifter</strong></li>
            <li><strong>Lagerungshilfen</strong> gegen Druckgeschwüre</li>
            <li><strong>Notrufsysteme und Sturzsensoren</strong></li>
          </ul>
          <p>
            Der Antrag läuft ebenfalls über die Pflegekasse; oft genügt die Empfehlung aus der
            Pflegeberatung oder dem MD-Gutachten. Diese Hilfsmittel mindern die 42-€-Pauschale{' '}
            <em>nicht</em> — Sie können beides gleichzeitig nutzen.
          </p>

          <h2>Abgrenzung: Was zahlt die Krankenkasse statt der Pflegekasse?</h2>
          <p>
            Die Faustregel: <strong>Pflegekasse</strong> zahlt, was der Pflege dient —{' '}
            <strong>Krankenkasse</strong> zahlt, was eine Krankheit oder Behinderung ausgleicht.
            Praktisch wichtig:
          </p>
          <ul className="blog-list">
            <li><strong>Windeln und Inkontinenzmaterial</strong> — bei ärztlich diagnostizierter
              Inkontinenz Krankenkassen-Leistung mit Rezept, zusätzlich zur 42-€-Pauschale</li>
            <li><strong>Rollator, Rollstuhl, Gehstock</strong> — Krankenkasse, per Rezept</li>
            <li><strong>Kompressionsstrümpfe, Hörgerät, Brille</strong> — Krankenkasse</li>
            <li><strong>Bettschutzeinlagen, Handschuhe, Desinfektion</strong> — Pflegekasse
              (42-€-Pauschale)</li>
          </ul>
          <p>
            Wer beides braucht, kombiniert die Töpfe: Rezept-Leistungen über die Krankenkasse{' '}
            <em>plus</em> die volle Pflegebox über die Pflegekasse.
          </p>

          <h2>Darüber hinaus: Wohnumfeld &amp; digitale Helfer</h2>
          <ul className="blog-list">
            <li><strong>Wohnumfeldverbessernde Maßnahmen:</strong> bis zu 4.180 € Zuschuss pro
              Maßnahme — etwa für Badumbau, Treppenlift oder Türverbreiterung (ab Pflegegrad 1)</li>
            <li><strong>Digitale Pflegeanwendungen (DiPA):</strong> bis zu 53 €/Monat für
              geprüfte Apps, die die häusliche Pflege unterstützen</li>
          </ul>

          <h2>Alle Ansprüche auf einen Blick</h2>
          <ul className="blog-list">
            <li><strong>42 €/Monat</strong> — Verbrauchshilfsmittel (Pflegebox), ab Pflegegrad 1, ohne Rezept</li>
            <li><strong>Leihweise / max. 25 € Zuzahlung</strong> — technische Pflegehilfsmittel, ab Pflegegrad 1</li>
            <li><strong>25,50 €/Monat</strong> — Hausnotruf-Zuschuss</li>
            <li><strong>4.180 € pro Maßnahme</strong> — Wohnumfeldverbesserung</li>
            <li><strong>131 €/Monat</strong> — <Link href="/entlastungsbetrag">Entlastungsbetrag</Link> für
              Alltagsbegleitung und Haushaltshilfe (kein Hilfsmittel, aber oft übersehen)</li>
          </ul>
          <p>
            Welche Budgets Ihnen insgesamt zustehen, rechnet der{' '}
            <Link href="/budgetrechner">Budgetrechner</Link> aus — alle Leistungen ab Pflegegrad 1
            erklärt auch der Ratgeber{' '}
            <Link href="/blog/pflegegrad-1-leistungen">Pflegegrad 1: Diese Leistungen stehen
            Ihnen zu</Link>.
          </p>

          <h2>Häufige Fragen zu Pflegehilfsmitteln</h2>
          <div className="blog-faq">
            {faqData.map((f, i) => (
              <details key={i} className="lp-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>

          <div className="blog-cta">
            <h2>Ihre 42 € jeden Monat abrufen — mit der Pflegebox</h2>
            <p>Handschuhe, Desinfektion, Bettschutz: monatlich frei Haus, 0 € Eigenanteil. Den Antrag übernehmen wir.</p>
            <Link href="/pflegebox" className="btn-gold">PFLEGEBOX KOSTENLOS BESTELLEN</Link>
          </div>

          <RelatedPosts slug="welche-pflegehilfsmittel-stehen-mir-zu" />
        </div>
      </article>
    </main>
  )
}
