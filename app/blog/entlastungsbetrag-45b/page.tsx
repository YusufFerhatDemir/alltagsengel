import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Entlastungsbetrag §45b SGB XI — 131€/Monat',
  description: 'Erfahren Sie wie Sie den Entlastungsbetrag nach §45b SGB XI nutzen können. 131€ monatlich für zertifizierte Alltagsbegleitung. Abrechnung mit der Pflegekasse.',
  keywords: ['Entlastungsbetrag', '§45b', '§45b SGB XI', 'Alltagsbegleitung', 'Pflegekasse', 'Pflegegrad', '131 Euro'],
  alternates: { canonical: 'https://alltagsengel.care/blog/entlastungsbetrag-45b' },
  openGraph: {
    title: 'Entlastungsbetrag §45b SGB XI — 131€/Monat',
    description: 'Nutzen Sie Ihren Entlastungsbetrag für zertifizierte Alltagsbegleitung',
    url: 'https://alltagsengel.care/blog/entlastungsbetrag-45b',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}


const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Entlastungsbetrag §45b SGB XI — 131€/Monat für Alltagsbegleitung',
  description: 'Erfahren Sie wie Sie den Entlastungsbetrag nach §45b SGB XI nutzen können. 131€ monatlich für zertifizierte Alltagsbegleitung. Abrechnung mit der Pflegekasse.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-03-19',
  dateModified: '2026-03-19',
  mainEntityOfPage: 'https://alltagsengel.care/blog/entlastungsbetrag-45b',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

export default function EntlastungsbetragPage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Entlastungsbetrag §45b SGB XI' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <article className="blog-article">
        <header className="blog-header">
          <h1>Entlastungsbetrag §45b SGB XI — 131€/Monat für Alltagsbegleitung</h1>
          <p className="blog-meta">Veröffentlicht am 19. März 2026 | 6 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Der Entlastungsbetrag nach <strong>§45b SGB XI</strong> ist eine staatliche Leistung für alle Menschen mit anerkanntem Pflegegrad. 
            Monatlich stehen Ihnen <strong>131 Euro</strong> zur Verfügung, um sich im Alltag professionell unterstützen zu lassen — völlig unbürokratisch 
            und ohne Eigenanteil. Alltagsengel ermöglicht die einfache Abrechnung dieses Budgets.
          </p>

          <h2>Was ist der Entlastungsbetrag?</h2>
          <p>
            Der Entlastungsbetrag ist eine finanzielle Leistung der Pflegekasse für Personen mit Pflegegrad 1 bis 5. 
            Dieses Geld darf gezielt für <strong>anerkannte Entlastungsangebote</strong> ausgegeben werden — darunter fallen vor allem 
            Alltagsbegleiter nach §45a SGB XI.
          </p>
          <p>
            <strong>Wichtig:</strong> Das Budget verfällt am 30. Juni des Folgejahres. 
            Ungenutztes Geld können Sie nicht ins nächste Jahr mitnehmen. Deshalb lohnt sich eine Planung im ersten Halbjahr.
          </p>

          <h2>131 Euro monatlich — Was ist möglich?</h2>
          <p>
            Mit 131 Euro pro Monat haben Sie vielfältige Möglichkeiten:
          </p>
          <ul className="blog-list">
            <li><strong>4 Stunden Alltagsbegleitung</strong> bei 32€/Stunde</li>
            <li><strong>Regelmäßige Arztbesuche</strong> mit zertifiziertem Begleiter</li>
            <li><strong>Einkaufshilfe &amp; Besorgungen</strong> wöchentlich</li>
            <li><strong>Gesellschaftliche Teilhabe:</strong> Spaziergang, Museumsbesuch, kulturelle Veranstaltungen</li>
            <li><strong>Psychosoziale Betreuung</strong> bei Einsamkeit oder Trauer</li>
          </ul>

          <h2>Wer bekommt den Entlastungsbetrag?</h2>
          <p>
            Anspruch auf den Entlastungsbetrag haben alle Personen mit:
          </p>
          <ul className="blog-list">
            <li>Anerkanntem <strong>Pflegegrad 1, 2, 3, 4 oder 5</strong></li>
            <li>Gültigem Pflegeversicherungsschutz</li>
            <li>Kein Mindesterwerbstätigkeitsmerkmal erforderlich</li>
          </ul>
          <p>
            Sie müssen <strong>nicht zuhause pflegebedürftig</strong> sein — auch Senioren, Menschen mit psychischen Erkrankungen 
            oder körperlichen Einschränkungen haben Anspruch.
          </p>

          <h2>Wie funktioniert die Abrechnung mit Alltagsengel?</h2>
          <p>
            Das Schöne an Alltagsengel: <strong>Wir kümmern uns um die komplette Abrechnung.</strong> So funktioniert es:
          </p>
          <ol className="blog-list">
            <li>Sie registrieren sich kostenlos bei Alltagsengel.care</li>
            <li>Sie buchen einen Engel für Ihr gewünschtes Anliegen</li>
            <li>Nach dem Einsatz erstellen wir eine Rechnung</li>
            <li>Wir reichen die Rechnung direkt bei Ihrer Pflegekasse ein</li>
            <li>Die Pflegekasse überweist den Betrag — <strong>für Sie kostenlos</strong></li>
          </ol>
          <p>
            <strong>Keine Vorauszahlung, keine versteckten Kosten.</strong> Sie zahlen nur, wenn überhaupt noch Budget offen ist.
          </p>

          <h2>Warum Alltagsengel wählen?</h2>
          <ul className="blog-list">
            <li>✓ <strong>100% Versichert:</strong> Jeder Einsatz ist haftpflichtversichert</li>
            <li>✓ <strong>§45a zertifiziert:</strong> Alle Begleiter erfüllen die hohen Anforderungen</li>
            <li>✓ <strong>Sofort buchbar:</strong> Engel in Ihrer Nähe finden, Termin wählen, fertig</li>
            <li>✓ <strong>Transparente Abrechnung:</strong> Wir übernehmen alles — Sie zahlen nichts</li>
          </ul>

          <h2>Beispiel: So sieht der Ablauf aus</h2>
          <p>
            <strong>Szenario:</strong> Maria, 72 Jahre alt, hat Pflegegrad 2. Sie lebt allein und möchte gerne zweimal die Woche 
            zur Physiotherapie gehen, schafft aber die Fahrt nicht allein.
          </p>
          <p>
            Sie bucht über Alltagsengel einen Begleiter für <strong>2 × 2 Stunden/Woche = 4 Std./Woche = 16 Std./Monat</strong>. 
            Bei 32€/Stunde = 512€/Monat. Davon zahlt sie <strong>131€ aus dem Entlastungsbetrag</strong>. Den Rest (381€) 
            zahlt sie als Selbstzahler oder nutzt weitere Leistungen.
          </p>
          <p>
            Ohne Alltagsengel hätte Maria keine praktikable Lösung. Mit Alltagsengel bekommt sie professionelle, versicherte 
            Unterstützung — und spart durch den Entlastungsbetrag massiv.
          </p>

          <h2>Häufige Fragen</h2>
          <p>
            <strong>Kann ich den Entlastungsbetrag auch sparen?</strong><br />
            Nein. Das Geld muss innerhalb des Jahres verwendet werden. Am 30. Juni des Folgejahres verfällt ungenutztes Budget.
          </p>
          <p>
            <strong>Kann ich den Betrag auch für andere Leistungen nutzen?</strong><br />
            Ja! Nicht nur Alltagsbegleitung — auch Pflegekurse, Krisenintervention oder zugelassene Tagespflegezentren 
            können über §45b abgerechnet werden.
          </p>
          <p>
            <strong>Muss ich die Rechnung selbst bei der Kasse einreichen?</strong><br />
            Nein, Alltagsengel macht das für Sie. Sie erhalten nur eine Kopie zur Information.
          </p>

          <div className="blog-cta">
            <h3>Nutzen Sie Ihren Entlastungsbetrag jetzt!</h3>
            <p>
              Finden Sie noch heute einen zertifizierten Alltagsbegleiter und nehmen Sie sich die Unterstützung, 
              die Sie verdienen. Kostenlose Registrierung, sofort buchbar.
            </p>
            <Link href="/termin" className="cta-button">
              Jetzt Engel finden →
            </Link>
          </div>
        </div>

        <p style={{ marginTop: 32, fontSize: 15 }}>
          <strong>Alles Wichtige auf einen Blick:</strong>{' '}
          <Link href="/entlastungsbetrag">Zum großen Entlastungsbetrag-Ratgeber — 131 €/Monat nutzen</Link>
        </p>

        <RelatedPosts slug="entlastungsbetrag-45b" />

        <footer className="blog-footer">
          <Link href="/" className="blog-back">← Zurück zur Startseite</Link>
        </footer>
      
        <section className="blog-related" style={{ marginTop: 40, padding: '24px 20px', background: 'rgba(201,150,60,0.06)', borderRadius: 12, border: '1px solid rgba(201,150,60,0.15)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#C9963C' }}>Weiterführende Informationen</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li><Link href="/alltagsbegleitung" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Alltagsbegleitung buchen — 131 Euro/Monat nutzen</Link></li>
            <li><Link href="/hygienebox" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Pflegebox bestellen — 42 Euro/Monat von der Kasse</Link></li>
            <li><Link href="/blog/entlastungsbetrag-beantragen" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Entlastungsbetrag beantragen: Anleitung</Link></li>
          </ul>
        </section>
      </article>
    </main>
  )
}
