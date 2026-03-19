import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Alltagsbegleitung in Frankfurt — Zertifizierte Alltagsbegleiter finden',
  description: 'Finden Sie zertifizierte Alltagsbegleiter in Frankfurt. §45a qualifiziert, versichert & abrechenbar über §45b. Schnell, diskret, professionell.',
  keywords: ['Alltagsbegleitung Frankfurt', 'Alltagsbegleiter', 'Seniorenbetreuung Frankfurt', 'Pflege Frankfurt', 'Altenbetreuung', '§45a'],
  openGraph: {
    title: 'Alltagsbegleitung in Frankfurt — Zertifizierte Begleiter',
    description: 'Professionelle Alltagsbegleitung für Senioren in Frankfurt',
    url: 'https://alltagsengel.care/blog/alltagsbegleitung-frankfurt',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

export default function AlltagsbegleitungFrankfurtPage() {
  return (
    <main className="blog-container">
      <article className="blog-article">
        <header className="blog-header">
          <h1>Alltagsbegleitung in Frankfurt — Zertifizierte Alltagsbegleiter finden</h1>
          <p className="blog-meta">Veröffentlicht am 19. März 2026 | 7 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Frankfurt am Main ist lebendig und dynamisch — aber nicht immer einfach für ältere Menschen, 
            die zusätzliche Unterstützung brauchen. Mit <strong>Alltagsengel finden Sie schnell einen zertifizierten 
            Alltagsbegleiter</strong> in Ihrem Stadtteil. Professionell, versichert und direkt über Ihre Pflegekasse abrechenbar.
          </p>

          <h2>Warum Alltagsbegleitung in Frankfurt?</h2>
          <p>
            Frankfurt wächst schnell — das bedeutet auch, dass viele Senioren weit weg von ihrer Familie leben. 
            Kinder und Enkel helfen gerne, sind aber oft beruflich eingespannt. Für diese Fälle ist eine 
            <strong>professionelle Alltagsbegleitung</strong> nicht nur sinnvoll, sondern oft auch notwendig.
          </p>
          <p>
            Alltagsbegleiter helfen bei:
          </p>
          <ul className="blog-list">
            <li>Einkäufen und Besorgungen</li>
            <li>Arztfahrten und Besuchen</li>
            <li>Gesellschaftliche Aktivitäten (Spaziergang, Museum, Konzert)</li>
            <li>Haushaltsnahe Hilfen (Putzen, Wäsche, Kochen)</li>
            <li>Psychosoziale Betreuung bei Trauer oder Einsamkeit</li>
          </ul>

          <h2>Wer kann Alltagsbegleiter werden?</h2>
          <p>
            In Frankfurt arbeiten mit Alltagsengel über <strong>150 zertifizierte Begleiter</strong>. 
            Alle erfüllen die strengen Anforderungen nach <strong>§45a SGB XI</strong>:
          </p>
          <ul className="blog-list">
            <li>✓ Mindestens 40 Stunden Schulungsschulung</li>
            <li>✓ Polizeiliches Führungszeugnis ohne Einträge</li>
            <li>✓ Erste-Hilfe-Kurs</li>
            <li>✓ Grundkenntnisse in Pflege und Betreuung</li>
            <li>✓ Haftpflichtversicherung</li>
            <li>✓ Regelmäßige Fortbildungen</li>
          </ul>

          <h2>Alltagsbegleiter in verschiedenen Frankfurter Stadtteilen</h2>
          <p>
            Alltagsengel ist in ganz Frankfurt präsent. Egal ob Sie in Sachsenhausen, Höchst, 
            der Innenstadt oder in Nieder-Eschbach leben — wir haben Begleiter in Ihrer Nähe.
          </p>
          <p>
            <strong>Die beliebtesten Stadtteile für Alltagsbegleitung:</strong>
          </p>
          <ul className="blog-list">
            <li>Sachsenhausen (Altstadt mit reiferer Bevölkerung)</li>
            <li>Innenstadt (zentrale Lage, gute Anbindung)</li>
            <li>Westend (wohlhabendes Viertel)</li>
            <li>Bornheim (studentisch, aber viele ältere Einwohner)</li>
            <li>Höchst (industrielle Tradition, viele Rentner)</li>
          </ul>

          <h2>Kosten & Abrechnung in Frankfurt</h2>
          <p>
            Die Stundensätze für Alltagsbegleitungen liegen bundesweit bei etwa <strong>32€/Stunde</strong>. 
            In Frankfurt können je nach Qualifikation und Zusatzleistungen auch höhere Sätze gelten.
          </p>
          <p>
            <strong>Wichtig:</strong> Viele Frankfurter Senioren zahlen über den 
            <Link href="/blog/entlastungsbetrag-45b"> Entlastungsbetrag §45b</Link> — das sind <strong>131€ monatlich</strong>, 
            die die Pflegekasse automatisch bezahlt.
          </p>

          <h2>Beispiel: So funktioniert's in Frankfurt</h2>
          <p>
            <strong>Erika, 78, lebt in Frankfurt-Sachsenhausen:</strong> Sie ist mobil, 
            aber das Einkaufen und Arztfahrten werden immer anstrengender. Ihre Tochter wohnt in Berlin und kann nicht ständig helfen.
          </p>
          <p>
            Sie registriert sich bei Alltagsengel, gibt ihren Stadtteil ein, und findet <strong>5 verfügbare Begleiter in ihrer Nähe</strong>. 
            Sie wählt Christine, eine 54-jährige Rentnerin, die selbst eine Mutter betreut und sehr einfühlsam mit älteren Menschen umgeht.
          </p>
          <p>
            Christine kommt nun <strong>1 × die Woche für 4 Stunden</strong> — 128€/Monat. 
            Das zahlt Erikas Pflegekasse über den Entlastungsbetrag. Erikas Tochter ist beruhigt, 
            und Erika fühlt sich endlich wieder sicherer im Alltag.
          </p>

          <h2>Die Vorteile von Alltagsengel in Frankfurt</h2>
          <ul className="blog-list">
            <li><strong>Lokal & schnell:</strong> Begleiter in Ihrer Nähe, oft innerhalb von 48h buchbar</li>
            <li><strong>Sicher:</strong> Alle Engel sind versichert, geprüft und zertifiziert</li>
            <li><strong>Diskret:</strong> Wir respektieren Ihre Privatsphäre vollständig</li>
            <li><strong>Digital:</strong> Einfache Buchung über App oder Webseite</li>
            <li><strong>Zuverlässig:</strong> 24/7 Support für Notfälle oder Fragen</li>
            <li><strong>Transparent:</strong> Keine versteckten Gebühren, feste Preise</li>
          </ul>

          <h2>Häufige Fragen zu Alltagsbegleitung in Frankfurt</h2>
          <p>
            <strong>Wie schnell kann ich einen Engel buchen?</strong><br />
            Das hängt von der Verfügbarkeit ab. Bei beliebten Uhrzeiten (morgens, nachmittags) 
            können Sie oft schon für nächste Woche buchen.
          </p>
          <p>
            <strong>Was ist wenn ich mit einem Begleiter nicht zufrieden bin?</strong><br />
            Sie können jederzeit einen anderen Engel wählen. Kundenzufriedenheit ist unser höchstes Gut — 
            wir haben 4,9 Sterne Bewertung, weil unsere Engel echte Profis sind.
          </p>
          <p>
            <strong>Gibt es auch Begleiter für Menschen mit Demenz?</strong><br />
            Ja, viele unsere Engel haben Spezialisierungen für Demenzbetreuung. Das ist oft besonders wichtig in Frankfurt.
          </p>
          <p>
            <strong>Kann ich auch spontan buchen?</strong><br />
            Bei verfügbaren Engeln ja — wir haben auch Same-Day-Buchungen möglich. Probieren Sie es aus!
          </p>

          <h2>Frankfurt verdient bessere Unterstützung</h2>
          <p>
            Senioren in Frankfurt haben eine lebenswerte Stadt — aber auch den Anspruch auf würdevolle Unterstützung. 
            Mit Alltagsengel bekommen Sie genau das: professionelle, versicherte, jederzeit buchbare Begleitung.
          </p>
          <p>
            Ob Sie in Sachsenhausen, Höchst oder der Innenstadt leben — wir sind für Sie da.
          </p>

          <div className="blog-cta">
            <h3>Finden Sie einen Engel in Frankfurt</h3>
            <p>
              Registrieren Sie sich kostenlos und entdecken Sie 150+ zertifizierte Begleiter in Ihrer Nähe. 
              Buchen Sie schnell, diskret und transparent.
            </p>
            <Link href="https://alltagsengel.care/choose" className="cta-button">
              Engel finden in Frankfurt →
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
