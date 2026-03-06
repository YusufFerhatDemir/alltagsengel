import Link from 'next/link'

export default function AGBPage() {
  return (
    <div className="screen legal-screen">
      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">AGB</h1>
      </div>
      <div className="legal-body">
        <section className="legal-section">
          <h2>§ 1 Geltungsbereich</h2>
          <p>
            Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die Nutzung der Plattform „Alltagsengel"
            (alltagsengel.care), betrieben von der Alltagsengel UG (haftungsbeschränkt), Schillerstraße 31,
            60313 Frankfurt am Main (nachfolgend „Betreiber").
          </p>
          <p>
            Die Plattform vermittelt Leistungen zur Unterstützung im Alltag gemäß § 45a SGB XI zwischen
            hilfesuchenden Personen (nachfolgend „Kunden") und zertifizierten Alltagsbegleitern (nachfolgend „Engel").
          </p>
        </section>

        <section className="legal-section">
          <h2>§ 2 Leistungsbeschreibung</h2>
          <p>
            Alltagsengel ist eine Vermittlungsplattform, die Kunden mit qualifizierten Alltagsbegleitern verbindet.
            Der Betreiber erbringt selbst keine Pflegeleistungen, sondern stellt die technische Infrastruktur für
            die Vermittlung zur Verfügung.
          </p>
          <p>Die Plattform umfasst insbesondere:</p>
          <ul>
            <li>Vermittlung von Alltagsbegleitern (§ 45a SGB XI)</li>
            <li>Buchungssystem für Termine</li>
            <li>Chat-Kommunikation zwischen Kunden und Engeln</li>
            <li>Abrechnung über § 45b Entlastungsbetrag</li>
            <li>Vermittlung von Krankenfahrten</li>
            <li>Vertrieb von Hygieneboxen</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>§ 3 Registrierung und Nutzerkonto</h2>
          <p>
            Die Nutzung der Plattform erfordert eine Registrierung. Der Nutzer ist verpflichtet, wahrheitsgemäße
            Angaben zu machen und diese aktuell zu halten. Jeder Nutzer darf nur ein Konto führen.
          </p>
          <p>
            Der Betreiber behält sich vor, Nutzerkonten bei Verstößen gegen diese AGB zu sperren oder zu löschen.
          </p>
        </section>

        <section className="legal-section">
          <h2>§ 4 Pflichten der Kunden</h2>
          <p>Kunden verpflichten sich:</p>
          <ul>
            <li>Nur wahrheitsgemäße Angaben zu ihrem Pflegebedarf zu machen</li>
            <li>Vereinbarte Termine einzuhalten oder rechtzeitig (mind. 24 Stunden) abzusagen</li>
            <li>Die gebuchten Alltagsbegleiter respektvoll zu behandeln</li>
            <li>Fällige Vergütungen fristgerecht zu zahlen</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>§ 5 Pflichten der Engel (Alltagsbegleiter)</h2>
          <p>Alltagsbegleiter verpflichten sich:</p>
          <ul>
            <li>Über gültige Qualifikationen gemäß § 45a SGB XI zu verfügen</li>
            <li>Vereinbarte Termine zuverlässig einzuhalten</li>
            <li>Vertrauliche Informationen der Kunden zu schützen</li>
            <li>Die Leistungen fachgerecht und mit Sorgfalt zu erbringen</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>§ 6 Preise und Abrechnung</h2>
          <p>
            Die aktuellen Preise der vermittelten Leistungen sind auf der Plattform einsehbar. Der Betreiber
            erhält eine Vermittlungsgebühr, die in den angezeigten Preisen enthalten ist.
          </p>
          <p>
            Die Abrechnung über den Entlastungsbetrag gemäß § 45b SGB XI erfolgt direkt mit der zuständigen
            Pflegekasse, sofern der Kunde die entsprechenden Voraussetzungen erfüllt.
          </p>
        </section>

        <section className="legal-section">
          <h2>§ 7 Versicherungsschutz</h2>
          <p>
            Alle über die Plattform vermittelten Einsätze sind durch eine Haftpflichtversicherung abgesichert.
            Der Versicherungsschutz besteht während der vereinbarten Einsatzzeiten.
          </p>
        </section>

        <section className="legal-section">
          <h2>§ 8 Haftung</h2>
          <p>
            Der Betreiber haftet nur für Schäden, die auf vorsätzlichem oder grob fahrlässigem Verhalten beruhen.
            Für die Qualität der durch die Alltagsbegleiter erbrachten Leistungen haftet der Betreiber nicht,
            da er lediglich als Vermittler fungiert.
          </p>
        </section>

        <section className="legal-section">
          <h2>§ 9 Kündigung</h2>
          <p>
            Beide Parteien können das Nutzungsverhältnis jederzeit ohne Angabe von Gründen kündigen. Bereits
            gebuchte und bestätigte Termine bleiben von der Kündigung unberührt.
          </p>
        </section>

        <section className="legal-section">
          <h2>§ 10 Schlussbestimmungen</h2>
          <p>
            Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist Frankfurt am Main, sofern der
            Nutzer Kaufmann ist oder keinen allgemeinen Gerichtsstand in Deutschland hat.
          </p>
          <p>
            Sollten einzelne Bestimmungen dieser AGB unwirksam sein oder werden, bleibt die Wirksamkeit der
            übrigen Bestimmungen unberührt.
          </p>
        </section>

        <p className="legal-date">Stand: März 2026</p>

        <div className="legal-footer-nav">
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutzerklärung</Link>
        </div>
      </div>
    </div>
  )
}
