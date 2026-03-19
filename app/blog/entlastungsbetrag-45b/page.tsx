import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Entlastungsbetrag §45b SGB XI — 131€/Monat für Alltagsbegleitung',
  description: 'Erfahren Sie wie Sie den Entlastungsbetrag nach §45b SGB XI nutzen können. 131€ monatlich für zertifizierte Alltagsbegleitung. Abrechnung mit der Pflegekasse.',
  keywords: ['Entlastungsbetrag', '§45b', '§45b SGB XI', 'Alltagsbegleitung', 'Pflegekasse', 'Pflegegrad', '131 Euro'],
  openGraph: {
    title: 'Entlastungsbetrag §45b SGB XI — 131€/Monat',
    description: 'Nutzen Sie Ihren Entlastungsbetrag für zertifizierte Alltagsbegleitung',
    url: 'https://alltagsengel.care/blog/entlastungsbetrag-45b',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

export default function EntlastungsbetragPage() {
  return (
    <main className="blog-container">
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
            <li>✓ <strong>Vertrauenswürdigkeit:</strong> 500+ Begleiter, 4,9★ Bewertung</li>
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
            <Link href="https://alltagsengel.care/choose" className="cta-button">
              Jetzt Engel finden →
            </Link>
          </div>
        </div>

        <footer className="blog-footer">
          <Link href="/" className="blog-back">← Zurück zur Startseite</Link>
          <div className="blog-share">
            <p>Teilen Sie diesen Artikel:</p>
            <div className="share-links">
              <a href="#" className="share-btn">Facebook</a>
              <a href="#" className="share-btn">Twitter</a>
              <a href="#" className="share-btn">WhatsApp</a>
            </div>
          </div>
        </footer>
      </article>
    </main>
  )
}
