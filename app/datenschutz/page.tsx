import Link from 'next/link'

export default function DatenschutzPage() {
  return (
    <div className="screen legal-screen">
      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Datenschutzerklärung</h1>
      </div>
      <div className="legal-body">
        <section className="legal-section">
          <h2>1. Datenschutz auf einen Blick</h2>
          <h3>Allgemeine Hinweise</h3>
          <p>
            Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren personenbezogenen Daten
            passiert, wenn Sie diese Website besuchen. Personenbezogene Daten sind alle Daten, mit denen Sie
            persönlich identifiziert werden können.
          </p>
          <h3>Datenerfassung auf dieser Website</h3>
          <p>
            <strong>Wer ist verantwortlich für die Datenerfassung auf dieser Website?</strong><br/>
            Die Datenverarbeitung auf dieser Website erfolgt durch den Websitebetreiber:<br/><br/>
            Alltagsengel UG (haftungsbeschränkt)<br/>
            Schillerstraße 31<br/>
            60313 Frankfurt am Main<br/>
            Geschäftsführer: Yusuf Ferhat Demir<br/>
            E-Mail: info@alltagsengel.care
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Hosting</h2>
          <p>
            Diese Website wird bei einem externen Dienstleister gehostet (Hoster). Die personenbezogenen Daten, die
            auf dieser Website erfasst werden, werden auf den Servern des Hosters gespeichert. Hierbei kann es sich
            v. a. um IP-Adressen, Kontaktanfragen, Meta- und Kommunikationsdaten, Vertragsdaten, Kontaktdaten,
            Namen, Websitezugriffe und sonstige Daten, die über eine Website generiert werden, handeln.
          </p>
          <p>
            Unser Hoster ist Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA. Die Datenverarbeitung
            erfolgt auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Allgemeine Hinweise und Pflichtinformationen</h2>
          <h3>Datenschutz</h3>
          <p>
            Die Betreiber dieser Seiten nehmen den Schutz Ihrer persönlichen Daten sehr ernst. Wir behandeln Ihre
            personenbezogenen Daten vertraulich und entsprechend der gesetzlichen Datenschutzvorschriften sowie
            dieser Datenschutzerklärung.
          </p>
          <h3>Hinweis zur verantwortlichen Stelle</h3>
          <p>
            Verantwortliche Stelle ist die natürliche oder juristische Person, die allein oder gemeinsam mit anderen
            über die Zwecke und Mittel der Verarbeitung personenbezogener Daten entscheidet.
          </p>
          <h3>Speicherdauer</h3>
          <p>
            Soweit innerhalb dieser Datenschutzerklärung keine speziellere Speicherdauer genannt wurde, verbleiben
            Ihre personenbezogenen Daten bei uns, bis der Zweck für die Datenverarbeitung entfällt. Wenn Sie ein
            berechtigtes Löschersuchen geltend machen oder eine Einwilligung zur Datenverarbeitung widerrufen,
            werden Ihre Daten gelöscht, sofern wir keine anderen rechtlich zulässigen Gründe für die Speicherung
            Ihrer personenbezogenen Daten haben.
          </p>
          <h3>Widerruf Ihrer Einwilligung zur Datenverarbeitung</h3>
          <p>
            Viele Datenverarbeitungsvorgänge sind nur mit Ihrer ausdrücklichen Einwilligung möglich. Sie können eine
            bereits erteilte Einwilligung jederzeit widerrufen. Die Rechtmäßigkeit der bis zum Widerruf erfolgten
            Datenverarbeitung bleibt vom Widerruf unberührt.
          </p>
          <h3>Recht auf Datenübertragbarkeit</h3>
          <p>
            Sie haben das Recht, Daten, die wir auf Grundlage Ihrer Einwilligung oder in Erfüllung eines Vertrags
            automatisiert verarbeiten, an sich oder an einen Dritten in einem gängigen, maschinenlesbaren Format
            aushändigen zu lassen.
          </p>
          <h3>Auskunft, Löschung und Berichtigung</h3>
          <p>
            Sie haben im Rahmen der geltenden gesetzlichen Bestimmungen jederzeit das Recht auf unentgeltliche
            Auskunft über Ihre gespeicherten personenbezogenen Daten, deren Herkunft und Empfänger und den Zweck
            der Datenverarbeitung und ggf. ein Recht auf Berichtigung oder Löschung dieser Daten.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Datenerfassung auf dieser Website</h2>
          <h3>Registrierung auf dieser Website</h3>
          <p>
            Sie können sich auf dieser Website registrieren, um zusätzliche Funktionen auf der Seite zu nutzen. Die
            dazu eingegebenen Daten verwenden wir nur zum Zwecke der Nutzung des jeweiligen Angebotes oder Dienstes,
            für den Sie sich registriert haben. Die bei der Registrierung abgefragten Pflichtangaben müssen
            vollständig angegeben werden. Anderenfalls werden wir die Registrierung ablehnen.
          </p>
          <p>
            Wir speichern: Name, E-Mail-Adresse, Postleitzahl, Stadt und ggf. Ihre Rolle (Kunde oder Alltagsbegleiter).
          </p>
          <h3>Anfrage per E-Mail</h3>
          <p>
            Wenn Sie uns per E-Mail kontaktieren, wird Ihre Anfrage inklusive aller daraus hervorgehenden
            personenbezogenen Daten zum Zwecke der Bearbeitung bei uns gespeichert.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Dienste von Drittanbietern</h2>
          <h3>Supabase</h3>
          <p>
            Für die Authentifizierung und Datenspeicherung nutzen wir Supabase (Supabase Inc.). Supabase verarbeitet
            die Daten in sicheren Rechenzentren. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
          </p>
          <h3>Vercel</h3>
          <p>
            Für das Hosting nutzen wir Vercel Inc. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse
            an einer zuverlässigen Darstellung unserer Website).
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Kontakt zum Datenschutz</h2>
          <p>
            Wenn Sie Fragen zum Datenschutz haben, schreiben Sie uns bitte eine E-Mail an:<br/>
            <strong>info@alltagsengel.care</strong>
          </p>
        </section>

        <p className="legal-date">Stand: März 2026</p>

        <div className="legal-footer-nav">
          <Link href="/impressum">Impressum</Link>
          <Link href="/agb">AGB</Link>
        </div>
      </div>
    </div>
  )
}
