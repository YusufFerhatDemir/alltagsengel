import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Krankenfahrt Verordnung: Wer bekommt sie & wie beantragen? (2026)',
  description: 'Wie Sie eine Verordnung für Krankenfahrten erhalten: Voraussetzungen (Pflegegrad, Merkzeichen), Arztgespräch, Genehmigung durch die Krankenkasse. Schritt-für-Schritt erklärt.',
  keywords: [
    'Krankenfahrt Verordnung',
    'Verordnung Krankenfahrt bekommen',
    'Krankenfahrt Krankenkasse genehmigung',
    'Krankenfahrt Rezept',
    '§60 SGB V',
    'Krankenfahrt Pflegegrad',
    'Dialysefahrt Verordnung',
    'Krankenfahrt beantragen',
    'Krankenfahrt ohne Eigenanteil',
    'Patientenfahrdienst Verordnung',
  ],
  alternates: { canonical: 'https://alltagsengel.care/blog/krankenfahrt-verordnung-erhalten' },
  openGraph: {
    title: 'Krankenfahrt Verordnung — wer hat Anspruch & wie beantragen?',
    description: 'Alles zur Verordnung für Krankenfahrten: Voraussetzungen, Antrag beim Arzt, Genehmigung der Kasse. Inkl. Muster-Formulierung.',
    url: 'https://alltagsengel.care/blog/krankenfahrt-verordnung-erhalten',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'article',
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Krankenfahrt Verordnung: Wer bekommt sie & wie beantragen? (2026)',
  description: 'Wie Sie eine Verordnung für Krankenfahrten erhalten: Voraussetzungen, Arztgespräch, Genehmigung durch die Krankenkasse.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-06-06',
  dateModified: '2026-06-06',
  mainEntityOfPage: 'https://alltagsengel.care/blog/krankenfahrt-verordnung-erhalten',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Wer hat Anspruch auf eine Verordnung für Krankenfahrten?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Personen mit Pflegegrad 4 oder 5 erhalten die Verordnung generell. Pflegegrad 3 bei Serienbehandlung (Dialyse, Chemotherapie, Bestrahlung) ebenfalls. Schwerbehinderte mit Merkzeichen aG, Bl oder H haben grundsätzlich Anspruch.',
      },
    },
    {
      '@type': 'Question',
      name: 'Kann der Arzt die Verordnung ablehnen?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Ja, der Arzt kann die Verordnung ablehnen, wenn die medizinischen Voraussetzungen nicht gegeben sind. In diesem Fall können Sie einen anderen Arzt aufsuchen oder Widerspruch bei der Kasse einlegen.',
      },
    },
    {
      '@type': 'Question',
      name: 'Wie hoch ist die Zuzahlung bei Krankenfahrten?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Die gesetzliche Zuzahlung beträgt 10% der Fahrtkosten, mindestens 5€ und maximal 10€ pro Fahrt. Von der Zuzahlung befreit sind Personen mit Befreiungsausweis (Belastungsgrenze erreicht).',
      },
    },
    {
      '@type': 'Question',
      name: 'Muss die Krankenkasse die Verordnung genehmigen?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Bei Pflegegrad 4/5 und Schwerbehinderten (aG, Bl, H) gilt die Genehmigung als erteilt. Bei Pflegegrad 3 mit Serienbehandlung muss die Kasse vorab genehmigen — dies dauert meist 3-5 Werktage.',
      },
    },
  ],
}

export default function KrankenfahrtVerordnung() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Krankenfahrt Verordnung erhalten' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <article className="blog-article">
        <div className="blog-header">
          <h1>Krankenfahrt Verordnung: Wer bekommt sie &amp; wie beantragen?</h1>
          <div className="blog-meta">
            <span className="blog-date">6. Juni 2026</span>
            <span className="blog-reading-time">7 Min. Lesezeit</span>
          </div>
        </div>

        <div className="blog-intro">
          <p>
            Eine Verordnung für Krankenfahrten bedeutet: Die Krankenkasse übernimmt die Fahrtkosten
            zum Arzt, zur Dialyse oder ins Krankenhaus. Doch wer bekommt diese Verordnung? Und wie
            sprechen Sie Ihren Arzt am besten darauf an? Dieser Ratgeber erklärt alles Schritt für
            Schritt — mit den aktuellen Regelungen für 2026.
          </p>
        </div>

        <div className="blog-content">
          <h2>Was ist eine Verordnung für Krankenfahrten?</h2>
          <p>
            Eine Verordnung (auch „Transportschein" oder „Krankenfahrt-Rezept") ist ein ärztliches
            Dokument, das bestätigt, dass Sie aus medizinischen Gründen einen Fahrdienst zum Arzt
            oder zur Behandlung benötigen. Rechtsgrundlage ist <strong>§ 60 SGB V</strong>.
          </p>
          <p>
            Mit dieser Verordnung rechnet der Fahrdienst direkt mit Ihrer Krankenkasse ab. Sie zahlen
            nur die gesetzliche Zuzahlung von maximal 10 € pro Fahrt — oder gar nichts, wenn Sie von
            Zuzahlungen befreit sind.
          </p>

          <h2>Wer hat Anspruch? Die 4 wichtigsten Fälle</h2>

          <h3>1. Pflegegrad 4 oder 5</h3>
          <p>
            Versicherte mit Pflegegrad 4 oder 5 erhalten die Verordnung für <em>alle</em> medizinisch
            notwendigen Fahrten — ohne vorherige Genehmigung durch die Kasse. Der Arzt stellt die
            Verordnung aus, der Fahrdienst rechnet direkt ab.
          </p>

          <h3>2. Pflegegrad 3 bei Serienbehandlung</h3>
          <p>
            Bei Pflegegrad 3 gilt: Wenn Sie regelmäßig zur selben Behandlung müssen (z.B. Dialyse
            3x pro Woche, Chemotherapie, Bestrahlung), genehmigt die Kasse in der Regel die
            Fahrtkostenübernahme. Hier ist eine <strong>vorherige Genehmigung</strong> nötig.
          </p>

          <h3>3. Schwerbehinderte (Merkzeichen aG, Bl, H)</h3>
          <p>
            Menschen mit den Merkzeichen <strong>aG</strong> (außergewöhnlich gehbehindert),
            <strong> Bl</strong> (blind) oder <strong>H</strong> (hilflos) im Schwerbehindertenausweis
            haben grundsätzlich Anspruch auf Krankenfahrten — unabhängig vom Pflegegrad.
          </p>

          <h3>4. Stationäre Behandlung &amp; Notfälle</h3>
          <p>
            Fahrten zur stationären Aufnahme, Entlassung und bei Notfällen werden generell übernommen.
            Auch ambulante Operationen und vor-/nachstationäre Behandlungen sind abgedeckt.
          </p>

          <h2>So erhalten Sie die Verordnung: Schritt für Schritt</h2>

          <h3>Schritt 1: Arzt ansprechen</h3>
          <p>
            Sprechen Sie Ihren behandelnden Arzt (Hausarzt oder Facharzt) direkt auf die Verordnung
            an. Erklären Sie, warum Sie nicht eigenständig zur Behandlung kommen können. Hilfreiche
            Argumente: Gehbehinderung, Pflegegrad, regelmäßige Fahrten, kein eigenes Auto, kein
            Angehöriger verfügbar.
          </p>

          <h3>Schritt 2: Verordnungsformular (Muster 4)</h3>
          <p>
            Der Arzt füllt das <strong>Verordnungsformular Muster 4</strong> aus. Darauf stehen:
            Diagnose, Behandlungsort, Behandlungszeitraum, Fahrtart (sitzend, Rollstuhl, liegend)
            und ob eine Begleitperson nötig ist.
          </p>

          <h3>Schritt 3: Bei der Kasse einreichen (falls nötig)</h3>
          <p>
            Bei Pflegegrad 4/5 und Schwerbehinderten (aG, Bl, H) gilt die Genehmigung als erteilt —
            Sie können sofort fahren. Bei Pflegegrad 3 mit Serienbehandlung muss die Verordnung
            <strong> vor der ersten Fahrt</strong> bei der Kasse genehmigt werden (dauert 3–5 Werktage).
          </p>

          <h3>Schritt 4: Fahrdienst buchen</h3>
          <p>
            Mit der genehmigten Verordnung buchen Sie einen Fahrdienst wie Alltagsengel. Wir rechnen
            direkt mit Ihrer Kasse ab — Sie zahlen nur die Zuzahlung (max. 10 €) oder gar nichts
            bei Befreiung.
          </p>

          <h2>Zuzahlung: Was kostet mich die Krankenfahrt?</h2>
          <p>
            Die gesetzliche Zuzahlung beträgt <strong>10 % der Fahrtkosten</strong>, mindestens 5 €
            und maximal 10 € pro Fahrt. Wenn Sie von Zuzahlungen befreit sind (Belastungsgrenze
            erreicht), zahlen Sie nichts.
          </p>
          <p>
            Beispiel: Eine Fahrt kostet 45 €. Ihre Zuzahlung: 4,50 € → aufgerundet auf 5 € (Minimum).
            Bei einer Fahrt für 120 €: 12 € → gedeckelt auf 10 € (Maximum).
          </p>

          <h2>Was tun, wenn der Arzt ablehnt?</h2>
          <p>
            Manchmal lehnen Ärzte die Verordnung ab — oft aus Unsicherheit über die Regeln. In
            diesem Fall können Sie:
          </p>
          <ul>
            <li>Den Arzt auf § 60 SGB V und die Krankentransport-Richtlinie hinweisen</li>
            <li>Ihren Pflegegrad-Bescheid oder Schwerbehindertenausweis vorlegen</li>
            <li>Einen anderen Arzt (z.B. Facharzt der Behandlung) um die Verordnung bitten</li>
            <li>Bei der Krankenkasse direkt nachfragen — diese kann den Arzt informieren</li>
          </ul>

          <h2>Serienverordnung: Für regelmäßige Fahrten</h2>
          <p>
            Bei wiederkehrenden Terminen (Dialyse, Bestrahlung, Physiotherapie-Serien) kann der Arzt
            eine <strong>Serienverordnung</strong> ausstellen. Diese gilt für einen bestimmten
            Zeitraum (z.B. 3 Monate) und alle Fahrten darin — Sie brauchen nicht für jede
            einzelne Fahrt ein neues Rezept.
          </p>

          <h2>Fazit: Krankenfahrt-Verordnung sichern</h2>
          <p>
            Wenn Sie pflegebedürftig, schwerbehindert oder chronisch krank sind, haben Sie sehr
            wahrscheinlich Anspruch auf eine Krankenfahrt-Verordnung. Scheuen Sie sich nicht, Ihren
            Arzt darauf anzusprechen — es ist Ihr gutes Recht nach § 60 SGB V.
          </p>
          <p>
            Bei Alltagsengel helfen wir Ihnen gerne weiter: Wir erklären Ihnen Ihre Optionen und
            übernehmen die komplette Abrechnung mit Ihrer Krankenkasse.
          </p>
        </div>

        <div className="blog-cta">
          <h3>Krankenfahrt buchen?</h3>
          <p>Registrieren Sie sich kostenlos und buchen Sie Ihre nächste Krankenfahrt — mit oder ohne Verordnung.</p>
          <Link href="/krankenfahrten" className="btn-gold">Krankenfahrten ansehen</Link>
        </div>

        <div className="blog-related">
          <h3>Weiterlesen</h3>
          <ul>
            <li><Link href="/blog/krankenfahrt-kostenuebernahme">Krankenfahrt: Wann zahlt die Krankenkasse?</Link></li>
            <li><Link href="/blog/krankenfahrt-buchen-frankfurt">Krankenfahrt buchen in Frankfurt</Link></li>
            <li><Link href="/blog/pflegegrad-beantragen">Pflegegrad beantragen — Schritt für Schritt</Link></li>
            <li><Link href="/krankenfahrten">Unsere Krankenfahrten-Vermittlung</Link></li>
          </ul>
        </div>
      </article>
    </main>
  )
}
