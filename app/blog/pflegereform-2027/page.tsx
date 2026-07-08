import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Pflegereform 2027: Was sich ändert (PNOG)',
  description: 'Pflegereform 2027 (PNOG): Was für Entlastungsbetrag und Alltagsbegleitung geplant ist — und was Angehörige jetzt tun sollten. Verständlich erklärt.',
  keywords: ['Pflegereform 2027', 'Pflegereform 2027 Änderungen', 'PNOG', 'Pflegeneuordnungsgesetz', 'Entlastungsbetrag 2027', 'gemeinsamer Jahresbetrag', 'Pflege Reform Alltagsbegleitung'],
  alternates: { canonical: 'https://alltagsengel.care/blog/pflegereform-2027' },
  openGraph: {
    title: 'Pflegereform 2027: Was ändert sich für Alltagsbegleitung?',
    description: 'Was die geplante Pflegereform 2027 (PNOG) für Entlastungsbetrag und Alltagsbegleitung bedeutet — verständlich erklärt.',
    url: 'https://alltagsengel.care/blog/pflegereform-2027',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Pflegereform 2027: Was sich für Alltagsbegleitung & Entlastungsbetrag ändert',
  description: 'Pflegereform 2027 (PNOG): Was für Entlastungsbetrag und Alltagsbegleitung geplant ist — und was Angehörige jetzt tun sollten. Verständlich erklärt.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-07-02',
  dateModified: '2026-07-02',
  mainEntityOfPage: 'https://alltagsengel.care/blog/pflegereform-2027',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

export default function Pflegereform2027Page() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Pflegereform 2027' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <article className="blog-article">
        <header className="blog-header">
          <h1>Pflegereform 2027: Was sich für Alltagsbegleitung &amp; Entlastungsbetrag ändert</h1>
          <p className="blog-meta">Veröffentlicht am 2. Juli 2026 | 8 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Die Pflegeversicherung steht vor der nächsten großen Reform. Mit dem geplanten
            <strong> Pflegeneuordnungsgesetz (PNOG)</strong> will die Bundesregierung die Pflege ab 2027 neu
            aufstellen. Für pflegende Angehörige und Menschen mit Pflegegrad stellt sich die Frage: Was ändert
            sich konkret — und was bedeutet das für die <Link href="/alltagsbegleitung">Alltagsbegleitung</Link> und
            den Entlastungsbetrag? In diesem Ratgeber trennen wir das, was bereits gilt, von dem, was noch
            geplant ist.
          </p>

          <div style={{ background: 'rgba(201,150,60,0.08)', border: '1px solid rgba(201,150,60,0.25)', borderRadius: 12, padding: '16px 18px', margin: '24px 0' }}>
            <strong style={{ color: '#C9963C' }}>Wichtiger Hinweis:</strong> Das PNOG liegt aktuell als
            Referentenentwurf vor und ist noch nicht beschlossen. Einzelne Regelungen können sich im
            Gesetzgebungsverfahren noch ändern. Dieser Artikel gibt den bekannten Stand wieder und wird
            aktualisiert, sobald das Gesetz verabschiedet ist.
          </div>

          <h2>Was heute schon gilt (Stand 2025/2026)</h2>
          <p>
            Bevor wir auf die Reform blicken, lohnt sich der Blick auf den aktuellen Stand — denn viele
            Leistungen werden bereits heute zu wenig genutzt:
          </p>
          <ul className="blog-list">
            <li><strong>Entlastungsbetrag: 131 € pro Monat</strong> nach §45b SGB XI, ab Pflegegrad 1. Das sind
              1.572 € im Jahr, die zweckgebunden u. a. für Alltagsbegleitung eingesetzt werden können.</li>
            <li><strong>Gemeinsamer Jahresbetrag:</strong> Seit Juli 2025 sind Verhinderungspflege und
              Kurzzeitpflege zu einem gemeinsamen Entlastungsbudget zusammengefasst — flexibler nutzbar als zuvor.</li>
            <li><strong>Pflegehilfsmittel: bis 42 € pro Monat</strong> nach §40 SGB XI — die kostenlose
              <Link href="/hygienebox"> Pflegebox</Link>.</li>
          </ul>
          <p>
            Schon diese Leistungen decken einen großen Teil der Alltagsunterstützung ab. Der häufigste Fehler:
            Sie verfallen ungenutzt, weil viele Familien sie nicht kennen.
          </p>

          <h2>Die Ziele der Pflegereform 2027</h2>
          <p>
            Hintergrund der Reform ist die angespannte Finanzlage der Pflegeversicherung bei gleichzeitig
            steigender Zahl pflegebedürftiger Menschen. Das PNOG verfolgt im Kern mehrere Ziele:
          </p>
          <ul className="blog-list">
            <li><strong>Finanzierung stabilisieren</strong> — die Pflegeversicherung soll langfristig
              tragfähig bleiben.</li>
            <li><strong>Leistungen entbürokratisieren</strong> — Anträge und Nachweise sollen einfacher werden.</li>
            <li><strong>Häusliche Pflege stärken</strong> — die überwiegende Mehrheit der Pflegebedürftigen wird
              zu Hause versorgt; ambulante Angebote sollen gestärkt werden.</li>
            <li><strong>Pflegende Angehörige entlasten</strong> — mehr Flexibilität und Unterstützung im Alltag.</li>
          </ul>

          <h2>Was das für Alltagsbegleitung bedeuten könnte</h2>
          <p>
            Für niedrigschwellige Angebote wie die Alltagsbegleitung ist die Stoßrichtung grundsätzlich positiv:
            Wenn die häusliche Versorgung gestärkt und Bürokratie abgebaut wird, profitieren genau die Leistungen,
            die pflegende Angehörige direkt entlasten. Wahrscheinlich bleibt der Entlastungsbetrag das zentrale
            Instrument, um Alltagsbegleitung zu finanzieren.
          </p>
          <p>
            Unser Rat: <strong>Warten Sie mit der Nutzung nicht auf 2027.</strong> Die heute geltenden 131 €
            monatlich stehen Ihnen bereits zu. Wer sie jetzt regelmäßig einsetzt, baut eine vertraute Betreuung
            auf — unabhängig davon, wie die Reform im Detail ausfällt.
          </p>

          <h2>Was Angehörige jetzt tun sollten</h2>
          <ol className="blog-list">
            <li><strong>Pflegegrad prüfen oder beantragen.</strong> Schon ab Pflegegrad 1 gibt es den
              Entlastungsbetrag. Wie das geht, erklären wir im Ratgeber
              <Link href="/blog/pflegegrad-beantragen"> Pflegegrad beantragen</Link>.</li>
            <li><strong>Entlastungsbetrag aktiv nutzen.</strong> Nicht genutzte Beträge verfallen am 30. Juni des
              Folgejahres — siehe <Link href="/blog/entlastungsbetrag-nutzen">Entlastungsbetrag richtig nutzen</Link>.</li>
            <li><strong>Kostenlose Pflegebox beantragen.</strong> 42 € monatlich für Pflegehilfsmittel, 0 €
              Eigenanteil.</li>
            <li><strong>Informiert bleiben.</strong> Sobald das PNOG beschlossen ist, aktualisieren wir diesen
              Ratgeber mit den konkreten Zahlen.</li>
          </ol>

          <h2>Häufige Fragen zur Pflegereform 2027</h2>

          <h3>Ist die Pflegereform 2027 schon beschlossen?</h3>
          <p>
            Nein. Das Pflegeneuordnungsgesetz liegt als Referentenentwurf vor und durchläuft noch das
            Gesetzgebungsverfahren. Konkrete Beträge und Termine stehen erst mit der Verabschiedung endgültig fest.
          </p>

          <h3>Ändert sich der Entlastungsbetrag von 131 €?</h3>
          <p>
            Aktuell beträgt der Entlastungsbetrag 131 € pro Monat. Ob und wie er sich mit der Reform verändert,
            ist noch offen. Bis dahin gilt der bestehende Betrag — und den sollten Sie nutzen.
          </p>

          <h3>Muss ich als Angehöriger jetzt etwas beantragen?</h3>
          <p>
            Für die heute geltenden Leistungen ja: Pflegegrad, Entlastungsbetrag und Pflegebox müssen aktiv
            in Anspruch genommen werden. Alltagsengel unterstützt Sie dabei und übernimmt die Abrechnung mit
            der Pflegekasse.
          </p>

          <div className="blog-cta">
            <h3>Entlastungsbetrag schon heute nutzen</h3>
            <p>
              Warten Sie nicht auf 2027: Registrieren Sie sich kostenlos bei Alltagsengel und setzen Sie die
              131 €/Monat für zertifizierte Alltagsbegleitung ein. Wir übernehmen die komplette Abrechnung
              mit der Pflegekasse.
            </p>
            <Link href="/auth/register" className="cta-button">
              Kostenlos registrieren →
            </Link>
            <p style={{ marginTop: 12 }}>
              <Link href="/kontakt" style={{ color: '#C9963C', textDecoration: 'underline' }}>
                Oder lassen Sie sich kostenlos beraten →
              </Link>
            </p>
          </div>
        </div>

        <RelatedPosts slug="pflegereform-2027" />

        <footer className="blog-footer">
          <Link href="/blog" className="blog-back">← Zurück zum Ratgeber</Link>
        </footer>
      </article>
    </main>
  )
}
