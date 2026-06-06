import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Pflegegrad 1 Leistungen 2026: Was steht Ihnen zu? (Komplette Übersicht)',
  description: 'Alle Leistungen bei Pflegegrad 1: Entlastungsbetrag 131€, Pflegehilfsmittel 42€, Wohnraumanpassung, Beratung. Was die Pflegekasse wirklich zahlt.',
  keywords: [
    'Pflegegrad 1 Leistungen',
    'Pflegegrad 1 was steht mir zu',
    'Pflegegrad 1 Geld',
    'Pflegegrad 1 Entlastungsbetrag',
    'Pflegegrad 1 Leistungen 2026',
    'Pflegegrad 1 Pflegebox',
    'Pflegegrad 1 Pflegehilfsmittel',
    'Pflegegrad 1 Alltagsbegleitung',
    'Pflegegrad 1 Rechte',
    'geringe Beeinträchtigung Leistungen',
  ],
  alternates: { canonical: 'https://alltagsengel.care/blog/pflegegrad-1-leistungen' },
  openGraph: {
    title: 'Pflegegrad 1 — alle Leistungen 2026 im Überblick',
    description: 'Entlastungsbetrag, Pflegehilfsmittel, Wohnraumanpassung: Ihre Rechte bei Pflegegrad 1 erklärt.',
    url: 'https://alltagsengel.care/blog/pflegegrad-1-leistungen',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'article',
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Pflegegrad 1 Leistungen 2026: Was steht Ihnen zu? (Komplette Übersicht)',
  description: 'Alle Leistungen bei Pflegegrad 1: Entlastungsbetrag, Pflegehilfsmittel, Wohnraumanpassung, Beratung.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-06-06',
  dateModified: '2026-06-06',
  mainEntityOfPage: 'https://alltagsengel.care/blog/pflegegrad-1-leistungen',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Bekomme ich mit Pflegegrad 1 Pflegegeld?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Nein, Pflegegeld gibt es erst ab Pflegegrad 2. Bei Pflegegrad 1 erhalten Sie aber den Entlastungsbetrag von 131€/Monat, Pflegehilfsmittel (42€/Monat), Pflegeberatung und Wohnraumanpassung (bis 4.000€).',
      },
    },
    {
      '@type': 'Question',
      name: 'Was bekomme ich mit Pflegegrad 1 monatlich?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Mit Pflegegrad 1 erhalten Sie monatlich: 131€ Entlastungsbetrag (§45b) für Alltagsbegleitung/Haushaltshilfe und bis zu 42€ für Pflegehilfsmittel zum Verbrauch (§40). Zusammen bis zu 173€ monatlich.',
      },
    },
    {
      '@type': 'Question',
      name: 'Kann ich mit Pflegegrad 1 Alltagsbegleitung buchen?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Ja! Der Entlastungsbetrag von 131€/Monat kann für Alltagsbegleitung, Haushaltshilfe oder Betreuung bei einem anerkannten Anbieter wie Alltagsengel genutzt werden.',
      },
    },
    {
      '@type': 'Question',
      name: 'Welche Pflegehilfsmittel stehen mir bei Pflegegrad 1 zu?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Bei Pflegegrad 1 haben Sie Anspruch auf Pflegehilfsmittel zum Verbrauch im Wert von bis zu 42€/Monat: Einmalhandschuhe, Desinfektionsmittel, Bettschutzeinlagen, Mundschutz und Schutzschürzen.',
      },
    },
  ],
}

export default function Pflegegrad1Leistungen() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Pflegegrad 1 Leistungen 2026' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <article className="blog-article">
        <div className="blog-header">
          <h1>Pflegegrad 1 Leistungen 2026: Was steht Ihnen zu?</h1>
          <div className="blog-meta">
            <span className="blog-date">6. Juni 2026</span>
            <span className="blog-reading-time">8 Min. Lesezeit</span>
          </div>
        </div>

        <div className="blog-intro">
          <p>
            Pflegegrad 1 — „geringe Beeinträchtigung der Selbstständigkeit". Viele denken, bei
            Pflegegrad 1 bekommt man kaum Leistungen. Falsch! Auch mit dem niedrigsten Pflegegrad
            stehen Ihnen wertvolle Hilfen zu: 131 €/Monat Entlastungsbetrag, kostenlose
            Pflegehilfsmittel und mehr. Dieser Artikel zeigt alle Leistungen im Überblick.
          </p>
        </div>

        <div className="blog-content">
          <h2>Übersicht: Alle Leistungen bei Pflegegrad 1</h2>

          <h3>1. Entlastungsbetrag — 131 €/Monat</h3>
          <p>
            Die wichtigste Leistung bei Pflegegrad 1: Der <strong>Entlastungsbetrag nach § 45b
            SGB XI</strong> in Höhe von 131 € monatlich (seit 2025). Damit können Sie:
          </p>
          <ul>
            <li>Alltagsbegleitung buchen (Einkaufen, Arztbegleitung, Gesellschaft)</li>
            <li>Haushaltshilfe nutzen (Putzen, Kochen, Wäsche)</li>
            <li>Tagesbetreuung in Anspruch nehmen</li>
            <li>Betreuungsgruppen besuchen</li>
          </ul>
          <p>
            Das Geld wird nicht ausgezahlt, sondern direkt mit einem anerkannten Anbieter (wie
            Alltagsengel) verrechnet. Nicht genutzte Beträge können bis zum 30. Juni des
            Folgejahres angespart werden.
          </p>

          <h3>2. Pflegehilfsmittel — 42 €/Monat</h3>
          <p>
            Ebenfalls ab Pflegegrad 1 steht Ihnen die monatliche <strong>Pflegebox</strong> zu:
            Pflegehilfsmittel zum Verbrauch nach § 40 SGB XI, bis zu 42 € pro Monat. Darin
            enthalten:
          </p>
          <ul>
            <li>Einmalhandschuhe</li>
            <li>Händedesinfektionsmittel</li>
            <li>Flächendesinfektion</li>
            <li>Bettschutzeinlagen</li>
            <li>Mundschutz</li>
            <li>Schutzschürzen</li>
          </ul>
          <p>
            Die Pflegekasse übernimmt die Kosten komplett — Sie zahlen 0 € Eigenanteil. Alltagsengel
            liefert die Box monatlich direkt zu Ihnen nach Hause.
          </p>

          <h3>3. Pflegeberatung — kostenlos</h3>
          <p>
            Sie haben Anspruch auf eine <strong>kostenlose Pflegeberatung</strong> nach § 7a SGB XI.
            Ein Berater Ihrer Pflegekasse kommt zu Ihnen nach Hause und informiert über alle
            verfügbaren Leistungen, Hilfsmittel und Unterstützungsmöglichkeiten. Diese Beratung
            können Sie einmal halbjährlich in Anspruch nehmen.
          </p>

          <h3>4. Wohnraumanpassung — bis 4.000 €</h3>
          <p>
            Für den barrierefreien Umbau Ihrer Wohnung stellt die Pflegekasse bis zu
            <strong> 4.000 € pro Maßnahme</strong> zur Verfügung (§ 40 Abs. 4 SGB XI). Beispiele:
          </p>
          <ul>
            <li>Türverbreiterungen</li>
            <li>Ebenerdige Dusche (Badumbau)</li>
            <li>Treppenlift oder Rampe</li>
            <li>Haltegriffe und Handläufe</li>
            <li>Rutschfeste Bodenbeläge</li>
          </ul>

          <h3>5. Hausnotruf — Zuschuss 25,50 €/Monat</h3>
          <p>
            Die Pflegekasse bezuschusst einen Hausnotruf-Dienst mit <strong>25,50 € monatlich</strong>.
            Auf Knopfdruck wird eine Notrufzentrale alarmiert — wichtig für alleinlebende
            Pflegebedürftige.
          </p>

          <h3>6. Wohngruppenzuschlag — 214 €/Monat</h3>
          <p>
            Leben Sie in einer ambulant betreuten Wohngruppe (Pflege-WG), erhalten Sie einen
            Zuschlag von <strong>214 € monatlich</strong> plus einmalig 2.500 € für die
            Einrichtung. Gilt auch bei Pflegegrad 1.
          </p>

          <h2>Was bekommt man bei Pflegegrad 1 NICHT?</h2>
          <p>
            Einige Leistungen stehen erst ab Pflegegrad 2 zu:
          </p>
          <ul>
            <li><strong>Pflegegeld</strong> — erst ab Pflegegrad 2 (332 €/Monat)</li>
            <li><strong>Pflegesachleistungen</strong> — erst ab Pflegegrad 2</li>
            <li><strong>Verhinderungspflege</strong> — erst ab Pflegegrad 2</li>
            <li><strong>Kurzzeitpflege</strong> — erst ab Pflegegrad 2</li>
          </ul>
          <p>
            Dafür lohnt es sich, über eine <Link href="/blog/pflegegrad-beantragen">Höherstufung
            nachzudenken</Link>, wenn sich Ihr Zustand verschlechtert hat.
          </p>

          <h2>Zusammenfassung: Pflegegrad 1 — monatlich bis zu 173 €</h2>
          <p>
            Addieren wir die monatlichen Leistungen:
          </p>
          <ul>
            <li>Entlastungsbetrag: 131 €/Monat</li>
            <li>Pflegehilfsmittel: 42 €/Monat</li>
            <li><strong>Gesamt: 173 €/Monat</strong> (= 2.076 € pro Jahr)</li>
          </ul>
          <p>
            Dazu kommen einmalige Zuschüsse wie Wohnraumanpassung (4.000 €) und der optionale
            Hausnotruf-Zuschuss. Insgesamt eine spürbare Unterstützung — die leider viel zu
            selten abgerufen wird.
          </p>

          <h2>So nutzen Sie die Leistungen mit Alltagsengel</h2>
          <p>
            Bei Alltagsengel können Sie zwei Leistungen bei Pflegegrad 1 sofort nutzen:
          </p>
          <ul>
            <li>
              <strong><Link href="/alltagsbegleitung">Alltagsbegleitung</Link></strong> — über den
              Entlastungsbetrag (131 €/Monat). Wir rechnen direkt mit Ihrer Kasse ab.
            </li>
            <li>
              <strong><Link href="/hygienebox">Pflegebox</Link></strong> — Pflegehilfsmittel
              monatlich geliefert (42 €/Monat). 0 € Eigenanteil.
            </li>
          </ul>
          <p>
            Registrieren Sie sich kostenlos, und wir kümmern uns um alles — von der Antragstellung
            bis zur monatlichen Abrechnung.
          </p>
        </div>

        <div className="blog-cta">
          <h3>Pflegegrad 1? Leistungen jetzt nutzen!</h3>
          <p>Entlastungsbetrag + Pflegebox = 173 €/Monat. Registrieren Sie sich kostenlos.</p>
          <Link href="/alltagsbegleitung" className="btn-gold">Alltagsbegleitung buchen</Link>
        </div>

        <div className="blog-related">
          <h3>Weiterlesen</h3>
          <ul>
            <li><Link href="/blog/pflegegrad-beantragen">Pflegegrad beantragen — Schritt für Schritt</Link></li>
            <li><Link href="/blog/entlastungsbetrag-beantragen">Entlastungsbetrag beantragen</Link></li>
            <li><Link href="/blog/entlastungsbetrag-rueckwirkend">Entlastungsbetrag rückwirkend nutzen</Link></li>
            <li><Link href="/blog/pflegehilfsmittel-40-euro">Pflegehilfsmittel §40 erklärt</Link></li>
            <li><Link href="/blog/pflegebox-kostenlos-bestellen">Pflegebox kostenlos bestellen</Link></li>
          </ul>
        </div>
      </article>
    </main>
  )
}
