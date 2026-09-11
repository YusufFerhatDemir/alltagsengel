import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Haushaltshilfe Frankfurt: Leistungen & Kosten',
  description: 'Haushaltshilfe in Frankfurt am Main und Rhein-Main-Gebiet: Einkaufen, Kochen, Putzen, Begleitung. §45a-Anerkennung im Verfahren. Jetzt buchen.',
  keywords: ['Haushaltshilfe Frankfurt', 'Haushaltshilfe Rhein-Main', 'Alltagshilfe Frankfurt', 'Haushaltshilfe Pflegekasse', 'Entlastungsleistung Frankfurt', 'Alltagsbegleitung Frankfurt'],
  alternates: { canonical: 'https://alltagsengel.care/blog/haushaltshilfe-frankfurt' },
  openGraph: {
    title: 'Haushaltshilfe Frankfurt — Jetzt buchen',
    description: 'Professionelle Haushaltshilfe in Frankfurt & Rhein-Main. §45a-Anerkennung im Verfahren, Buchung als Selbstzahler möglich.',
    url: 'https://alltagsengel.care/blog/haushaltshilfe-frankfurt',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Haushaltshilfe Frankfurt — Jetzt buchen',
  description: 'Haushaltshilfe in Frankfurt am Main und Rhein-Main-Gebiet: Einkaufen, Kochen, Putzen, Begleitung. §45a-Anerkennung im Verfahren. Jetzt buchen.',
  author: { '@type': 'Organization', name: 'Alltagsengel' },
  publisher: {
    '@type': 'Organization',
    name: 'Alltagsengel',
    url: 'https://alltagsengel.care',
    logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' },
  },
  datePublished: '2026-06-04',
  dateModified: '2026-06-04',
  mainEntityOfPage: 'https://alltagsengel.care/blog/haushaltshilfe-frankfurt',
}

const faqData = [
  { q: 'Was kostet eine Haushaltshilfe in Frankfurt?', a: 'Mit anerkanntem Pflegegrad steht Ihnen der Entlastungsbetrag nach §45b SGB XI von 131 € monatlich zu. Ob er für ein konkretes Angebot eingesetzt werden kann, setzt die Anerkennung des Anbieters nach § 45a SGB XI voraus — Alltagsengel befindet sich derzeit im Anerkennungsverfahren. Bis dahin buchen Sie als Selbstzahler (ab 32 € pro Stunde) — die Preise sehen Sie transparent in der App.' },
  { q: 'Wer hat Anspruch auf eine Haushaltshilfe?', a: 'Jeder mit Pflegegrad 1–5 hat Anspruch auf den Entlastungsbetrag (131 €/Monat). Dieser kann für Haushaltshilfe, Begleitung und Alltagsunterstützung eingesetzt werden.' },
  { q: 'Wie schnell bekomme ich eine Haushaltshilfe?', a: 'Nach der Registrierung bei Alltagsengel können Sie innerhalb weniger Tage eine Alltagsbegleitung buchen. Die Vermittlung läuft über unsere App.' },
  { q: 'Welche Aufgaben übernimmt die Haushaltshilfe?', a: 'Einkaufen, Kochen, leichte Reinigung, Wäsche, Begleitung zum Arzt, Spaziergänge, Behördengänge, Gesellschaft leisten — alles was den Alltag erleichtert.' },
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

export default function HaushaltshilfeFrankfurtPage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Haushaltshilfe Frankfurt' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }} />

      <article className="blog-article">
        <header className="blog-header">
          <h1>Haushaltshilfe Frankfurt — Jetzt buchen</h1>
          <p className="blog-meta">Veröffentlicht am 4. Juni 2026 | 6 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Sie suchen eine <strong>Haushaltshilfe in Frankfurt am Main</strong> oder im Rhein-Main-Gebiet?
            Alltagsengel vermittelt zuverlässige Alltagsbegleiter, die Sie im Haushalt unterstützen.
            Zu Ihren Finanzierungswegen beraten wir Sie vorab kostenlos.
          </p>

          <h2>Diese Aufgaben übernimmt unsere Haushaltshilfe</h2>
          <p>
            Unsere Alltagsbegleiter sind keine Pflegekräfte — sie sind Ihre Unterstützung im Alltag.
            Das umfasst:
          </p>
          <ul className="blog-list">
            <li>Einkaufen und Besorgungen erledigen</li>
            <li>Leichte Haushaltsarbeiten (Reinigung, Wäsche, Aufräumen)</li>
            <li>Mahlzeiten zubereiten</li>
            <li>Begleitung zum Arzt, zur Apotheke oder zu Behörden</li>
            <li>Spaziergänge und Gesellschaft leisten</li>
            <li>Post und Schriftverkehr sortieren</li>
            <li>Termine koordinieren</li>
          </ul>

          <h2>Entlastungsbetrag der Pflegekasse</h2>
          <p>
            Bei Pflegegrad 1–5 steht Ihnen der <strong>Entlastungsbetrag nach §45b SGB XI</strong> zu:
            <strong> 131 € monatlich</strong>. Der Betrag ist zweckgebunden und verfällt, wenn er nicht genutzt wird.
            Ob der Entlastungsbetrag für ein konkretes Angebot eingesetzt werden kann, setzt die Anerkennung
            des Anbieters nach § 45a SGB XI voraus — Alltagsengel befindet sich derzeit im Anerkennungsverfahren.
            Bis dahin ist die Buchung als Selbstzahler möglich.
          </p>
          <p>
            <strong>Wichtig:</strong> Nicht genutzte Beträge können bis zu 18 Monate rückwirkend abgerufen werden.
            Viele Familien wissen das nicht und lassen Tausende Euro verfallen.
          </p>

          <h2>Warum Alltagsengel?</h2>
          <ul className="blog-list">
            <li><strong>Regional:</strong> Sitz in Frankfurt am Main, aktiv im gesamten Rhein-Main-Gebiet</li>
            <li><strong>Digital:</strong> Buchung, Kommunikation und Abrechnung laufen über unsere App</li>
            <li><strong>Transparent:</strong> Keine versteckten Kosten, keine Bindung</li>
            <li><strong>Sozial:</strong> 1 € jeder Buchung geht an Kinder und Familien in Not</li>
          </ul>

          <h2>So buchen Sie Ihre Haushaltshilfe</h2>
          <ol className="blog-list">
            <li>Kostenlos registrieren auf alltagsengel.care</li>
            <li>Pflegegrad und Bedarf angeben</li>
            <li>Passenden Alltagsbegleiter auswählen</li>
            <li>Termin buchen — fertig</li>
          </ol>
          <p>
            Zu Ihren Finanzierungswegen beraten wir Sie vorab kostenlos.
          </p>

          <h2>Frankfurt & Rhein-Main: Unser Einsatzgebiet</h2>
          <p>
            Wir vermitteln Haushaltshilfen in Frankfurt am Main und dem gesamten Rhein-Main-Gebiet,
            darunter Offenbach, Darmstadt, Wiesbaden, Mainz, Hanau, Bad Homburg, Friedberg,
            Oberursel und alle umliegenden Gemeinden im Umkreis von ca. 40 km. Alle Details zu
            Leistungen, Ablauf und Kosten vor Ort finden Sie auf unserer Seite{' '}
            <Link href="/alltagsbegleitung/frankfurt">Alltagsbegleitung Frankfurt</Link>.
          </p>

          <h2>Häufige Fragen zur Haushaltshilfe</h2>
          <div className="blog-faq">
            {faqData.map((f, i) => (
              <details key={i} className="lp-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>

          <div className="blog-cta">
            <h2>Jetzt Haushaltshilfe buchen</h2>
            <p>Registrierung kostenlos, keine Vorauszahlung, keine Bindung.</p>
            <Link href="/termin" className="btn-gold">KOSTENLOS REGISTRIEREN</Link>
          </div>
        </div>

        <RelatedPosts slug="haushaltshilfe-frankfurt" />
      </article>
    </main>
  )
}
