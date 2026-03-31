import Link from 'next/link'

export default function ImpressumPage() {
  return (
    <div className="screen legal-screen">
      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Impressum</h1>
      </div>
      <div className="legal-body">
        <section className="legal-section">
          <h2>Angaben gemäß § 5 TMG</h2>
          <p>
            Alltagsengel UG (haftungsbeschränkt)<br/>
            Schillerstraße 31<br/>
            60313 Frankfurt am Main
          </p>
        </section>

        <section className="legal-section">
          <h2>Vertreten durch</h2>
          <p>Geschäftsführer: Yusuf Ferhat Demir</p>
        </section>

        <section className="legal-section">
          <h2>Registereintrag</h2>
          <p>
            Eintragung im Handelsregister<br/>
            Registergericht: Amtsgericht Frankfurt am Main<br/>
            Registernummer: HRB 140351
          </p>
        </section>

        <section className="legal-section">
          <h2>Kontakt</h2>
          <p>
            E-Mail: info@alltagsengel.care<br/>
            Telefon: +49 163 9558833
          </p>
        </section>

        <section className="legal-section">
          <h2>EU-Streitschlichtung</h2>
          <p>
            Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:
            <br/>
            <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer" className="legal-link">
              https://ec.europa.eu/consumers/odr/
            </a>
          </p>
          <p>Unsere E-Mail-Adresse finden Sie oben im Impressum.</p>
        </section>

        <section className="legal-section">
          <h2>Verbraucherstreitbeilegung / Universalschlichtungsstelle</h2>
          <p>
            Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
            Verbraucherschlichtungsstelle teilzunehmen.
          </p>
        </section>

        <section className="legal-section">
          <h2>Haftung für Inhalte</h2>
          <p>
            Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten nach den
            allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht
            unter bestimmten Umständen verpflichtet, übermittelte oder gespeicherte fremde Informationen zu
            überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
          </p>
          <p>
            Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen
            Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der
            Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden
            Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.
          </p>
        </section>

        <section className="legal-section">
          <h2>Haftung für Links</h2>
          <p>
            Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben.
            Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der
            verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.
          </p>
        </section>

        <section className="legal-section">
          <h2>Urheberrecht</h2>
          <p>
            Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen
            Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der
            Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
          </p>
        </section>

        <div className="legal-footer-nav">
          <Link href="/datenschutz">Datenschutzerklärung</Link>
          <Link href="/agb">AGB</Link>
        </div>
      </div>
    </div>
  )
}
