import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Haushaltshilfe Frankfurt — Jetzt über die Pflegekasse buchen',
  description: 'Haushaltshilfe in Frankfurt am Main und Rhein-Main-Gebiet: Einkaufen, Kochen, Putzen, Begleitung. Kostenübernahme über Pflegekasse möglich. Jetzt buchen.',
  keywords: ['Haushaltshilfe Frankfurt', 'Haushaltshilfe Rhein-Main', 'Alltagshilfe Frankfurt', 'Haushaltshilfe Pflegekasse', 'Entlastungsleistung Frankfurt', 'Alltagsbegleitung Frankfurt'],
  alternates: { canonical: 'https://alltagsengel.care/blog/haushaltshilfe-frankfurt' },
  openGraph: {
    title: 'Haushaltshilfe Frankfurt — Jetzt buchen',
    description: 'Professionelle Haushaltshilfe in Frankfurt & Rhein-Main. Kostenübernahme durch die Pflegekasse möglich.',
    url: 'https://alltagsengel.care/blog/haushaltshilfe-frankfurt',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Haushaltshilfe Frankfurt — Jetzt über die Pflegekasse buchen',
  description: 'Haushaltshilfe in Frankfurt am Main: Einkaufen, Kochen, Putzen, Begleitung. Kostenübernahme über Pflegekasse möglich.',
  author: { '@type': 'Organization', name: 'Alltagsengel' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  datePublished: '2026-06-04',
  mainEntityOfPage: 'https://alltagsengel.care/blog/haushaltshilfe-frankfurt',
}

const faqData = [
  { q: 'Was kostet eine Haushaltshilfe in Frankfurt?', a: 'Mit anerkanntem Pflegegrad übernimmt die Pflegekasse bis zu 131 € monatlich über den Entlastungsbetrag nach §45b SGB XI. Ohne Pflegegrad buchen Sie als Selbstzahler — die Preise sehen Sie transparent in der App.' },
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
          <h1>Haushaltshilfe Frankfurt — Jetzt über die Pflegekasse buchen</h1>
          <p className="blog-meta">Veröffentlicht am 4. Juni 2026 | 6 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Sie suchen eine <strong>Haushaltshilfe in Frankfurt am Main</strong> oder im Rhein-Main-Gebiet?
            Alltagsengel vermittelt zuverlässige Alltagsbegleiter, die Sie im Haushalt unterstützen —
            und das Beste: Bei anerkanntem Pflegegrad zahlt die <strong>Pflegekasse bis zu 131 € monatlich</strong>.
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

          <h2>Kostenübernahme durch die Pflegekasse</h2>
          <p>
            Bei Pflegegrad 1–5 steht Ihnen der <strong>Entlastungsbetrag nach §45b SGB XI</strong> zu:
            <strong> 131 € monatlich</strong>. Dieses Geld können Sie direkt für eine Haushaltshilfe über
            Alltagsengel einsetzen. Der Betrag ist zweckgebunden und verfällt, wenn er nicht genutzt wird —
            also nutzen Sie ihn!
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
            Die Abrechnung mit der Pflegekasse übernehmen wir. Sie müssen nichts vorstrecken.
          </p>

          <h2>Frankfurt & Rhein-Main: Unser Einsatzgebiet</h2>
          <p>
            Wir vermitteln Haushaltshilfen in Frankfurt am Main und dem gesamten Rhein-Main-Gebiet,
            darunter Offenbach, Darmstadt, Wiesbaden, Mainz, Hanau, Bad Homburg, Friedberg,
            Oberursel und alle umliegenden Gemeinden im Umkreis von ca. 40 km. Alle Details zu
            Leistungen, Ablauf und Kostenübernahme vor Ort finden Sie auf unserer Seite{' '}
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
            <Link href="/choose" className="btn-gold">KOSTENLOS REGISTRIEREN</Link>
          </div>
        </div>
      </article>
    </main>
  )
}
