import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Krankenfahrt buchen Frankfurt — Fahrt zum Arzt über die Krankenkasse',
  description: 'Krankenfahrt in Frankfurt buchen: Fahrten zu Arzt, Klinik, Dialyse und Therapie. Mit Verordnung über die Krankenkasse abrechenbar. Jetzt in der App buchen.',
  keywords: ['Krankenfahrt Frankfurt', 'Krankenfahrt buchen', 'Patientenfahrdienst Frankfurt', 'Krankenfahrt Krankenkasse', 'Fahrt zum Arzt Frankfurt', 'Krankentransport Frankfurt'],
  alternates: { canonical: 'https://alltagsengel.care/blog/krankenfahrt-buchen-frankfurt' },
  openGraph: {
    title: 'Krankenfahrt buchen Frankfurt',
    description: 'Krankenfahrt in Frankfurt & Rhein-Main buchen. Kostenübernahme durch die Krankenkasse möglich.',
    url: 'https://alltagsengel.care/blog/krankenfahrt-buchen-frankfurt',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Krankenfahrt buchen Frankfurt — Fahrt zum Arzt über die Krankenkasse',
  description: 'Krankenfahrt in Frankfurt buchen: zu Arzt, Klinik, Dialyse. Kostenübernahme möglich.',
  author: { '@type': 'Organization', name: 'Alltagsengel' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  datePublished: '2026-06-04',
  mainEntityOfPage: 'https://alltagsengel.care/blog/krankenfahrt-buchen-frankfurt',
}

const faqData = [
  { q: 'Was kostet eine Krankenfahrt in Frankfurt?', a: 'Mit ärztlicher Verordnung übernimmt die Krankenkasse nach §60 SGB V die Kosten. Es kann eine gesetzliche Zuzahlung von 10 % anfallen (mindestens 5 €, höchstens 10 € pro Fahrt). Ohne Verordnung zahlen Sie als Selbstzahler — den Preis sehen Sie vor der Buchung in der App.' },
  { q: 'Brauche ich eine Verordnung für die Krankenfahrt?', a: 'Für die Kostenübernahme durch die Krankenkasse ja. Ohne Verordnung können Sie die Fahrt als Selbstzahler buchen. Beides geht direkt in der App.' },
  { q: 'Wohin kann ich eine Krankenfahrt buchen?', a: 'Zu jedem medizinischen Termin: Hausarzt, Facharzt, Klinik, Krankenhaus, Dialyse, Chemotherapie, Physiotherapie, Reha und mehr.' },
  { q: 'Wie schnell kann ich eine Krankenfahrt bekommen?', a: 'Je nach Verfügbarkeit auch kurzfristig innerhalb von 24 Stunden. Planen Sie reguläre Termine am besten einige Tage im Voraus.' },
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

export default function KrankenfahrtFrankfurtPage() {
  return (
    <main className="blog-container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }} />

      <article className="blog-article">
        <header className="blog-header">
          <h1>Krankenfahrt buchen Frankfurt — Fahrt zum Arzt über die Krankenkasse</h1>
          <p className="blog-meta">Veröffentlicht am 4. Juni 2026 | 5 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Sie brauchen eine <strong>Krankenfahrt in Frankfurt am Main</strong>? Alltagsengel vermittelt
            sichere Fahrten zu Arzt, Klinik, Dialyse und Therapie — bequem über die App buchbar.
            Mit ärztlicher Verordnung zahlt die <strong>Krankenkasse</strong>.
          </p>

          <h2>Wann wird eine Krankenfahrt von der Kasse bezahlt?</h2>
          <p>
            Nach <strong>§60 SGB V</strong> übernimmt die Krankenkasse die Kosten für Krankenfahrten, wenn:
          </p>
          <ul className="blog-list">
            <li>Eine ärztliche Verordnung vorliegt</li>
            <li>Der Patient aus medizinischen Gründen nicht selbst fahren kann</li>
            <li>Kein öffentliches Verkehrsmittel genutzt werden kann</li>
          </ul>
          <p>
            Typische Fahrten: Dialyse, Chemotherapie, Strahlentherapie, stationäre Aufnahme/Entlassung,
            Fahrten mit Rollstuhl oder bei Pflegegrad 3–5.
          </p>

          <h2>So buchen Sie in 3 Schritten</h2>
          <ol className="blog-list">
            <li><strong>App öffnen:</strong> Datum, Uhrzeit und Ziel eingeben</li>
            <li><strong>Verordnung hochladen:</strong> Als Foto oder PDF direkt in der App</li>
            <li><strong>Abgeholt werden:</strong> Fahrer kommt pünktlich zu Ihnen</li>
          </ol>
          <p>
            Keine Verordnung? Kein Problem — Sie können auch als <strong>Selbstzahler</strong> buchen.
            Den Preis sehen Sie transparent vor der Buchung.
          </p>

          <h2>Unser Einsatzgebiet</h2>
          <p>
            Wir vermitteln Krankenfahrten in <strong>Frankfurt am Main</strong> und dem gesamten
            <strong> Rhein-Main-Gebiet</strong>: Offenbach, Darmstadt, Wiesbaden, Mainz, Hanau,
            Bad Homburg, Oberursel, Friedberg und alle Gemeinden im Umkreis.
          </p>

          <h2>Warum Krankenfahrt über Alltagsengel?</h2>
          <ul className="blog-list">
            <li><strong>App-basiert:</strong> Kein Telefon, keine Wartezeit — direkt buchen</li>
            <li><strong>Verordnung digital:</strong> Foto hochladen statt Papierkram</li>
            <li><strong>Abrechnung inklusive:</strong> Wir rechnen direkt mit der Kasse ab</li>
            <li><strong>Qualifizierte Fahrer:</strong> Geschultes Partnernetz in Frankfurt</li>
            <li><strong>Sozial:</strong> 1 € jeder Fahrt geht an Kinder und Familien in Not</li>
          </ul>

          <h2>Häufige Fragen zur Krankenfahrt</h2>
          <div className="blog-faq">
            {faqData.map((f, i) => (
              <details key={i} className="lp-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>

          <div className="blog-cta">
            <h2>Krankenfahrt jetzt buchen</h2>
            <p>Kostenlos registrieren. Mit oder ohne Verordnung.</p>
            <Link href="/choose"><button className="btn-gold">JETZT BUCHEN</button></Link>
          </div>
        </div>
      </article>
    </main>
  )
}
