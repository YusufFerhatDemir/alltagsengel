import Link from 'next/link'
import type { Metadata } from 'next'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'AGB — Allgemeine Geschäftsbedingungen',
  description: 'Allgemeine Geschäftsbedingungen der Alltagsengel UG (haftungsbeschränkt) für die Nutzung der Plattform alltagsengel.care.',
  alternates: { canonical: 'https://alltagsengel.care/agb' },
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'AGB — Alltagsengel',
    description: 'Allgemeine Geschäftsbedingungen der Alltagsengel UG (haftungsbeschränkt).',
    url: 'https://alltagsengel.care/agb',
  },
}

export default function AGBPage() {
  return (
    <div className="screen legal-screen">
      <BreadcrumbSchema items={[{ name: 'AGB' }]} />
      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">AGB</h1>
      </div>
      <div className="legal-body">
        <section className="legal-section">
          <h2>§ 1 Geltungsbereich</h2>
          <p>
            Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die Nutzung der Plattform „Alltagsengel"
            (alltagsengel.care), betrieben von der Alltagsengel UG (haftungsbeschränkt), Neue Mainzer Straße 66-68,
            60311 Frankfurt am Main (nachfolgend „Betreiber").
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
            <li>Abrechnung über § 45b Entlastungsbetrag (131 €/Monat)</li>
            <li>Vermittlung von Krankenfahrten und Patiententransporten</li>
            <li>Vermittlung von Pflegeboxen (zum Verbrauch bestimmte Pflegehilfsmittel gemäß § 40 Abs. 2 SGB XI)</li>
            <li>Vermittlung von Hausnotrufsystemen</li>
            <li>Vermittlung von Pflegehilfsmitteln (z. B. Pflegebetten, Rollstühle)</li>
            <li>Weitere Pflege- und Gesundheitsdienstleistungen, die der Betreiber künftig in sein Angebot aufnimmt</li>
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
          <h2>§ 6 Vermittlung von Partnerleistungen und Direktkontaktverbot</h2>
          <p>
            Alltagsengel vermittelt Kunden bei Bedarf ergänzende Leistungen über qualifizierte
            Kooperationspartner, insbesondere Krankenfahrten, Pflegeboxen (zum Verbrauch bestimmte
            Pflegehilfsmittel gemäß § 40 Abs. 2 SGB XI), Hausnotruf, Pflegebetten und weitere
            Pflegeleistungen.
          </p>
          <p>
            <strong>Für Kunden:</strong> Der Kunde verpflichtet sich, Kooperationspartner, die durch
            Alltagsengel vermittelt wurden, nicht direkt und unter Umgehung von Alltagsengel zu
            beauftragen. Dies gilt während der Vertragslaufzeit und für 12 Monate nach Vertragsende.
            Bei Verstoß behält sich Alltagsengel das Recht auf fristlose Kündigung und Schadensersatz vor.
          </p>
          <p>
            <strong>Für Alltagsbegleiter und Dienstleister (Engel, Fahrer):</strong> Der Dienstleister
            verpflichtet sich, durch Alltagsengel vermittelte Kunden nicht direkt oder unter Umgehung von
            Alltagsengel zu betreuen, zu kontaktieren oder ihnen Leistungen anzubieten. Das Wettbewerbsverbot
            gilt während der Zusammenarbeit und 12 Monate nach deren Beendigung.
          </p>
        </section>

        <section className="legal-section">
          <h2>§ 7 Vertragsstrafe bei Verstößen</h2>
          <p>
            Bei einem erstmaligen Verstoß gegen das Direktkontaktverbot oder Wettbewerbsverbot
            gemäß § 6 wird eine Vertragsstrafe in Höhe von <strong>5.000,00 €</strong> je Einzelfall fällig.
            Bei wiederholtem Verstoß erhöht sich die Vertragsstrafe auf <strong>10.000,00 €</strong> je
            weiterem Einzelfall.
          </p>
          <p>
            Die Geltendmachung eines darüber hinausgehenden Schadensersatzanspruchs bleibt
            ausdrücklich vorbehalten. Die Vertragsstrafe setzt voraus, dass der Verstoß vorsätzlich
            oder fahrlässig begangen wurde.
          </p>
        </section>

        <section className="legal-section">
          <h2>§ 8 Vertraulichkeit</h2>
          <p>
            Alle Nutzer verpflichten sich, sämtliche im Rahmen der Plattformnutzung erlangten
            Informationen vertraulich zu behandeln. Als vertraulich gelten insbesondere:
            Kundendaten und Kontaktinformationen, Preis- und Konditionslisten, Vertragsinhalte,
            interne Prozesse und CRM-Daten. Die Vertraulichkeitspflicht gilt unbefristet über
            das Vertragsende hinaus.
          </p>
        </section>

        <section className="legal-section">
          <h2>§ 9 Preise und Abrechnung</h2>
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
          <h2>§ 10 Versicherungsschutz</h2>
          <p>
            Alle über die Plattform vermittelten Einsätze sind durch eine Haftpflichtversicherung abgesichert.
            Der Versicherungsschutz besteht während der vereinbarten Einsatzzeiten.
          </p>
        </section>

        <section className="legal-section">
          <h2>§ 11 Haftung</h2>
          <p>
            Der Betreiber haftet nur für Schäden, die auf vorsätzlichem oder grob fahrlässigem Verhalten beruhen.
            Für die Qualität der durch die Alltagsbegleiter erbrachten Leistungen haftet der Betreiber nicht,
            da er lediglich als Vermittler fungiert.
          </p>
        </section>

        <section className="legal-section">
          <h2>§ 12 Widerrufsrecht für Verbraucher</h2>
          <p>
            Verbrauchern (§ 13 BGB) steht bei Verträgen im Fernabsatz ein Widerrufsrecht nach §§ 312g, 355 BGB zu.
          </p>
          <p>
            <strong>Widerrufsbelehrung:</strong> Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen
            diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsschlusses.
          </p>
          <p>
            Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (Alltagsengel UG (haftungsbeschränkt),
            Neue Mainzer Straße 66-68, 60311 Frankfurt am Main, info@alltagsengel.care, +49 178 3382825) mittels einer
            eindeutigen Erklärung (z.B. ein mit der Post versandter Brief, Telefax oder E-Mail) über Ihren
            Entschluss, diesen Vertrag zu widerrufen, informieren.
          </p>
          <p>
            <strong>Vorzeitiges Erlöschen des Widerrufsrechts:</strong> Das Widerrufsrecht erlischt vorzeitig, wenn
            wir mit der Ausführung der Dienstleistung mit Ihrer ausdrücklichen Zustimmung vor Ende der Widerrufsfrist
            begonnen haben und Sie bestätigt haben, dass Ihnen bekannt ist, dass Sie bei vollständiger Vertragserfüllung
            durch uns Ihr Widerrufsrecht verlieren (§ 356 Abs. 4 BGB).
          </p>
          <p>
            <strong>Widerrufsfolgen:</strong> Haben Sie verlangt, dass die Dienstleistung während der Widerrufsfrist
            beginnen soll, haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zum Zeitpunkt
            des Widerrufs bereits erbrachten Dienstleistungen entspricht.
          </p>
        </section>

        <section className="legal-section">
          <h2>§ 13 Kündigung</h2>
          <p>
            Beide Parteien können das Nutzungsverhältnis jederzeit ohne Angabe von Gründen kündigen. Bereits
            gebuchte und bestätigte Termine bleiben von der Kündigung unberührt.
          </p>
          <p>
            Die Kündigung des Nutzungsverhältnisses kann über die Funktion „Konto und Daten löschen" im
            Nutzerprofil, per E-Mail an info@alltagsengel.care oder in Textform erfolgen. Nach Kündigung werden
            alle personenbezogenen Daten gemäß unserer Datenschutzerklärung gelöscht oder gesperrt, soweit
            keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
          </p>
        </section>

        <section className="legal-section">
          <h2>§ 14 Abgrenzung der Leistungen</h2>
          <p>
            Die über die Plattform vermittelten Alltagsbegleiter erbringen ausschließlich Leistungen zur Unterstützung
            im Alltag gemäß § 45a SGB XI. <strong>Ausdrücklich nicht</strong> umfasst sind:
          </p>
          <ul>
            <li>Medizinische Behandlungspflege nach § 37 SGB V (z.B. Injektionen, Wundversorgung, Medikamentengabe aus Originalpackung)</li>
            <li>Körpernahe Pflege im Sinne der Grundpflege nach SGB XI (z.B. Waschen, Anziehen, Toilettengang)</li>
            <li>Hauswirtschaftliche Versorgung als eigenständige Leistung nach § 36 SGB XI</li>
            <li>Fahrdienste außerhalb des vermittelten Krankenfahrten-Moduls</li>
          </ul>
          <p>
            Kunden, die solche Leistungen benötigen, sind verpflichtet, sich an einen zugelassenen ambulanten
            Pflegedienst zu wenden. Der Betreiber übernimmt keine Haftung für Schäden, die durch unzulässige
            Leistungsausdehnung entstehen.
          </p>
        </section>

        <section className="legal-section">
          <h2>§ 15 Datenschutz und Auftragsverarbeitung</h2>
          <p>
            Die Verarbeitung personenbezogener Daten erfolgt nach den Vorgaben der DSGVO und des BDSG. Details
            zur Verarbeitung finden Sie in unserer <Link href="/datenschutz" className="legal-link">Datenschutzerklärung</Link>.
          </p>
          <p>
            Zwischen Betreiber und Alltagsbegleitern besteht ein Auftragsverarbeitungsverhältnis im Sinne
            des Art. 28 DSGVO, soweit Alltagsbegleiter Zugriff auf Kundendaten erhalten. Die technischen und
            organisatorischen Maßnahmen (TOMs) sind dokumentiert und werden jährlich überprüft.
          </p>
        </section>

        <section className="legal-section">
          <h2>§ 16 Schlussbestimmungen</h2>
          <p>
            Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Die gesetzlichen
            Vorschriften zur Beschränkung der Rechtswahl und zur Anwendbarkeit zwingender Vorschriften, insbesondere
            des Staates, in dem der Kunde als Verbraucher seinen gewöhnlichen Aufenthalt hat, bleiben unberührt.
          </p>
          <p>
            Gerichtsstand ist Frankfurt am Main, sofern der Nutzer Kaufmann, juristische Person des öffentlichen
            Rechts oder öffentlich-rechtliches Sondervermögen ist oder keinen allgemeinen Gerichtsstand in
            Deutschland hat.
          </p>
          <p>
            Sollten einzelne Bestimmungen dieser AGB unwirksam sein oder werden, bleibt die Wirksamkeit der
            übrigen Bestimmungen unberührt.
          </p>
          <p>
            <strong>Online-Streitbeilegung:</strong> Die EU-Kommission stellt eine Plattform zur Online-Streit&shy;beilegung
            (OS) bereit: <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer" className="legal-link">https://ec.europa.eu/consumers/odr/</a>.
            Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
            Verbraucherschlichtungsstelle teilzunehmen.
          </p>
        </section>

        <p className="legal-date">Stand: 17. Juli 2026 (Version 3.0)</p>

        <div className="legal-footer-nav">
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutzerklärung</Link>
        </div>
      </div>
    </div>
  )
}
