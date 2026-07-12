import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import HowToSchema from '@/components/HowToSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Pflegebox bestellen — Komplettanleitung 2026',
  description: 'Pflegebox bestellen in 5 Schritten: Anspruch prüfen, Anbieter wählen, Antrag stellen, Genehmigung, Lieferung. Mit Checkliste, Fristen und typischen Fehlern.',
  keywords: ['Pflegebox bestellen', 'Pflegebox Antrag', 'Pflegebox beantragen', 'Pflegehilfsmittel beantragen', 'Pflegebox Anleitung', 'Pflegebox Pflegekasse Antrag', 'Pflegebox Anbieter wechseln', 'Pflegebox kostenlos'],
  alternates: { canonical: 'https://alltagsengel.care/blog/pflegebox-bestellen-anleitung' },
  openGraph: {
    title: 'Pflegebox bestellen — Komplettanleitung 2026',
    description: 'Von der Anspruchsprüfung bis zur ersten Lieferung: die komplette Anleitung zum Pflegebox-Antrag — mit Checkliste und typischen Fehlern.',
    url: 'https://alltagsengel.care/blog/pflegebox-bestellen-anleitung',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Pflegebox bestellen — Komplettanleitung 2026',
  description: 'Pflegebox bestellen in 5 Schritten: Anspruch prüfen, Anbieter wählen, Antrag stellen, Genehmigung, Lieferung. Mit Checkliste, Fristen und typischen Fehlern.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: {
    '@type': 'Organization',
    name: 'Alltagsengel',
    url: 'https://alltagsengel.care',
    logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' },
  },
  datePublished: '2026-07-12',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/pflegebox-bestellen-anleitung',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

const faqData = [
  { q: 'Wie lange dauert es von der Bestellung bis zur ersten Pflegebox?', a: 'In der Regel 1–3 Wochen: Der Antrag ist in wenigen Minuten gestellt, die Pflegekasse genehmigt meist innerhalb weniger Tage bis zwei Wochen, danach kommt die erste Box innerhalb von 3–5 Werktagen.' },
  { q: 'Kann ich die Pflegebox rückwirkend beantragen?', a: 'Nein. Die 42-€-Pauschale nach §40 SGB XI ist eine Monatspauschale und verfällt am Monatsende. Verpasste Monate lassen sich nicht nachholen — deshalb lohnt es sich, sofort zu bestellen.' },
  { q: 'Was brauche ich für den Pflegebox-Antrag?', a: 'Nur drei Angaben: den anerkannten Pflegegrad (1–5), die Pflegekasse und die Versichertennummer. Ein ärztliches Rezept ist nicht nötig. Bei Alltagsengel unterschreiben Sie zusätzlich einmalig eine Vollmacht, damit wir den Antrag übernehmen dürfen.' },
  { q: 'Kann die Pflegekasse den Antrag ablehnen?', a: 'Nur in Ausnahmefällen — etwa wenn kein Pflegegrad vorliegt, die Person im Pflegeheim versorgt wird oder bereits ein anderer Anbieter die Pauschale abrechnet. Bei einer Ablehnung lohnt der Widerspruch, wir unterstützen dabei.' },
  { q: 'Kann ich den Pflegebox-Anbieter wechseln?', a: 'Ja, jederzeit. Kündigen Sie beim alten Anbieter (formlos, meist ohne Frist) und bestellen Sie beim neuen — dieser stellt einen neuen Antrag bei der Pflegekasse. Wichtig: Es kann immer nur ein Anbieter pro Monat abrechnen.' },
  { q: 'Bekomme ich die Pflegebox auch mit Pflegegrad 1?', a: 'Ja. Die Pflegebox und der Entlastungsbetrag (131 €/Monat) sind die beiden Leistungen, die schon ab Pflegegrad 1 in voller Höhe zustehen — zusammen 173 € pro Monat.' },
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

export default function PflegeboxAnleitungPage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Pflegebox bestellen — Komplettanleitung' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <HowToSchema
        name="Pflegebox bestellen — Schritt für Schritt"
        description="So bestellen Sie eine kostenlose Pflegebox nach §40 SGB XI: Anspruch prüfen, Box zusammenstellen, Antrag stellen, Genehmigung abwarten, monatliche Lieferung erhalten."
        totalTime="PT5M"
        steps={[
          { name: 'Anspruch prüfen', text: 'Anerkannter Pflegegrad 1–5, Pflege zu Hause, mindestens teilweise durch Angehörige oder Ehrenamtliche — alle drei Bedingungen erfüllt? Dann besteht der Anspruch auf 42 €/Monat.' },
          { name: 'Box zusammenstellen', text: 'Wählen Sie die Pflegehilfsmittel, die Sie wirklich brauchen: Handschuhe, Hände- und Flächendesinfektion, Bettschutzeinlagen, Mundschutz, Schutzschürzen.', url: '/pflegebox' },
          { name: 'Antrag stellen', text: 'Mit Pflegegrad, Pflegekasse und Versichertennummer wird der Antrag gestellt. Über einen Anbieter wie Alltagsengel genügt eine einmalige Vollmacht — den Rest übernimmt der Anbieter.' },
          { name: 'Genehmigung abwarten', text: 'Die Pflegekasse genehmigt in der Regel innerhalb weniger Tage bis zwei Wochen. Die Genehmigung gilt dauerhaft, solange der Pflegegrad besteht.' },
          { name: 'Monatliche Lieferung erhalten', text: 'Die Box kommt jeden Monat automatisch und versandkostenfrei nach Hause. Zusammenstellung jederzeit anpassbar, kündbar ohne Frist.' },
        ]}
      />

      <article className="blog-article">
        <header className="blog-header">
          <h1>Pflegebox bestellen — Komplettanleitung 2026</h1>
          <p className="blog-meta">Veröffentlicht am 12. Juli 2026 | 9 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Jeder Pflegehaushalt mit Pflegegrad hat Anspruch auf eine <strong>kostenlose
            Pflegebox</strong> im Wert von bis zu <strong>42 € pro Monat</strong> — trotzdem
            bleibt die Leistung in Millionen Haushalten ungenutzt. Diese Anleitung führt Sie
            in fünf Schritten von der Anspruchsprüfung bis zur ersten Lieferung: mit
            Checkliste, realistischen Fristen und den Fehlern, die Sie vermeiden sollten.
          </p>

          <h2>Schritt 1: Anspruch prüfen — drei Bedingungen genügen</h2>
          <p>
            Rechtsgrundlage ist <strong>§40 Absatz 2 SGB XI</strong>: Pflegebedürftige haben
            Anspruch auf „zum Verbrauch bestimmte Pflegehilfsmittel" bis zu einer Monatspauschale
            von 42 € (seit 01.01.2025, vorher 40 €). Der Anspruch besteht, wenn alle drei Punkte
            zutreffen:
          </p>
          <ul className="blog-list">
            <li><strong>Anerkannter Pflegegrad 1–5</strong> — schon Pflegegrad 1 genügt</li>
            <li><strong>Pflege zu Hause</strong> — in der eigenen Wohnung, bei Angehörigen oder
              in einer Wohngemeinschaft (nicht im Pflegeheim)</li>
            <li><strong>Pflege mindestens teilweise nicht-professionell</strong> — durch
              Angehörige, Freunde, Nachbarn oder ergänzend zum Pflegedienst</li>
          </ul>
          <p>
            Noch kein Pflegegrad? Dann zuerst den{' '}
            <Link href="/pflegegrad-check">kostenlosen Pflegegrad-Check</Link> machen und den{' '}
            <Link href="/blog/pflegegrad-beantragen">Pflegegrad beantragen</Link> — der
            Pflegebox-Anspruch beginnt mit dem Monat der Anerkennung.
          </p>

          <h2>Schritt 2: Box zusammenstellen — was hinein darf</h2>
          <p>
            Erstattungsfähig sind ausschließlich Produkte aus dem Pflegehilfsmittelverzeichnis
            (Produktgruppe 54):
          </p>
          <ul className="blog-list">
            <li>Einmalhandschuhe (Nitril oder Latex)</li>
            <li>Händedesinfektionsmittel</li>
            <li>Flächendesinfektionsmittel</li>
            <li>Saugende Bettschutzeinlagen zum Einmalgebrauch</li>
            <li>Mundschutz / FFP2-Masken</li>
            <li>Schutzschürzen (Einweg) und Fingerlinge</li>
          </ul>
          <p>
            Stellen Sie die Box nach realem Verbrauch zusammen: Wer täglich bei der Körperpflege
            hilft, braucht schnell 100–200 Handschuhe im Monat; bei Inkontinenz sind
            Bettschutzeinlagen wichtiger als Masken. Im{' '}
            <Link href="/pflegebox">Pflegebox-Konfigurator</Link> wählen Sie die Produkte in
            2 Minuten aus — welche Hilfsmittel Ihnen darüber hinaus zustehen, erklärt der
            Ratgeber <Link href="/blog/welche-pflegehilfsmittel-stehen-mir-zu">Welche
            Pflegehilfsmittel stehen mir zu?</Link>
          </p>

          <h2>Schritt 3: Antrag stellen — selbst oder über den Anbieter</h2>
          <p>
            Für den Antrag gibt es zwei Wege:
          </p>
          <ul className="blog-list">
            <li><strong>Selbst beantragen:</strong> Formular „Antrag auf Pflegehilfsmittel zum
              Verbrauch" bei der Pflegekasse anfordern, ausfüllen, einreichen — und danach jeden
              Monat Quittungen einreichen oder einen Versorgungsvertrag nachweisen. Machbar, aber
              laufender Aufwand.</li>
            <li><strong>Über einen Anbieter (empfohlen):</strong> Sie unterschreiben einmalig
              eine Vollmacht, der Anbieter füllt den Antrag aus, reicht ihn ein, beantwortet
              Rückfragen der Kasse und rechnet monatlich direkt ab. Bei Alltagsengel ist das
              komplett kostenlos — Sie geben nur Pflegegrad, Kasse und Versichertennummer an.</li>
          </ul>
          <p>
            Ein <strong>ärztliches Rezept ist nicht nötig</strong> — der anerkannte Pflegegrad
            ist der einzige Nachweis. Das unterscheidet die Pflegebox von technischen
            Hilfsmitteln wie Pflegebetten, die separat beantragt werden.
          </p>

          <h2>Schritt 4: Genehmigung — was die Kasse prüft und wie lange es dauert</h2>
          <p>
            Die Pflegekasse prüft nur die drei Anspruchsbedingungen aus Schritt 1. Die
            Genehmigung kommt in der Regel <strong>innerhalb weniger Tage bis zwei
            Wochen</strong> und gilt dauerhaft — solange der Pflegegrad besteht, muss nichts
            erneuert werden. Nur bei einem Kassenwechsel ist ein neuer Antrag nötig; auch den
            übernimmt Alltagsengel automatisch.
          </p>
          <p>
            Eine Ablehnung ist selten und betrifft fast immer einen dieser Fälle: kein
            anerkannter Pflegegrad, Versorgung im Pflegeheim, oder ein anderer Anbieter rechnet
            die Pauschale bereits ab. Im letzten Fall genügt die Kündigung beim alten Anbieter
            (Schritt 5).
          </p>

          <h2>Schritt 5: Lieferung — und was Sie danach noch anpassen können</h2>
          <p>
            Nach der Genehmigung kommt die erste Box innerhalb von 3–5 Werktagen, danach
            monatlich automatisch und versandkostenfrei. Wichtig zu wissen:
          </p>
          <ul className="blog-list">
            <li><strong>Zusammenstellung monatlich anpassbar</strong> — mehr Bettschutz, andere
              Handschuhgröße, weniger Masken</li>
            <li><strong>Pausieren möglich</strong> — etwa bei Krankenhaus- oder
              Kurzzeitpflege-Aufenthalt</li>
            <li><strong>Kündbar ohne Frist</strong> — keine Vertragsbindung, keine
              Mindestlaufzeit</li>
          </ul>

          <h2>Die 4 häufigsten Fehler beim Pflegebox-Bestellen</h2>
          <ul className="blog-list">
            <li><strong>Warten statt bestellen:</strong> Die Pauschale verfällt monatlich und
              ist nicht rückwirkend abrufbar — jeder Monat ohne Box sind bis zu 42 € verloren.</li>
            <li><strong>Einzelkauf in der Drogerie:</strong> Wer Handschuhe und Desinfektion
              selbst kauft, zahlt aus eigener Tasche, obwohl die Kasse die Kosten übernehmen
              würde. Die Kostenerstattung per Quittung ist möglich, scheitert aber oft an
              nicht gelisteten Produkten.</li>
            <li><strong>Doppelte Anbieter:</strong> Nur ein Anbieter kann pro Monat abrechnen.
              Beim Wechsel zuerst kündigen, dann neu bestellen.</li>
            <li><strong>Pauschale mit anderen Leistungen verwechseln:</strong> Die 42 € sind
              ein eigener Topf — sie mindern weder das Pflegegeld noch den{' '}
              <Link href="/entlastungsbetrag">Entlastungsbetrag von 131 €/Monat</Link>.</li>
          </ul>

          <h2>Checkliste: Das brauchen Sie für die Bestellung</h2>
          <ol className="blog-list">
            <li>Pflegegrad-Bescheid (Pflegegrad 1–5)</li>
            <li>Name der Pflegekasse (z. B. AOK, TK, Barmer)</li>
            <li>Versichertennummer der pflegebedürftigen Person</li>
            <li>Lieferadresse und Telefonnummer für Rückfragen</li>
            <li>2 Minuten Zeit für den <Link href="/pflegebox">Konfigurator</Link></li>
          </ol>

          <h2>Häufige Fragen zur Pflegebox-Bestellung</h2>
          <div className="blog-faq">
            {faqData.map((f, i) => (
              <details key={i} className="lp-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>

          <div className="blog-cta">
            <h2>Pflegebox jetzt in 2 Minuten bestellen</h2>
            <p>Box zusammenstellen, Pflegegrad angeben — den Antrag bei Ihrer Pflegekasse übernehmen wir. 0 € Eigenanteil.</p>
            <Link href="/pflegebox" className="btn-gold">ZUM PFLEGEBOX-KONFIGURATOR</Link>
          </div>

          <RelatedPosts slug="pflegebox-bestellen-anleitung" />
        </div>
      </article>
    </main>
  )
}
