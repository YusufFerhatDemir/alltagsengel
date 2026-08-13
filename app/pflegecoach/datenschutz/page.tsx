// PflegeCoach — produktspezifische Datenschutzhinweise.
// ENTWURF: Vor Pilotstart juristisch prüfen lassen (siehe
// audit/dipa/dipav_gap_liste.md). Keine Tracker auf dieser Seite.

export const metadata = { title: 'Datenschutz — Digitaler PflegeCoach' }

export default function CoachDatenschutz() {
  return (
    <>
      <h1 className="pc-h1">Datenschutzhinweise — Digitaler PflegeCoach</h1>
      <p className="pc-feedback pc-feedback--info">
        <strong>Entwurf.</strong> Diese produktspezifischen Datenschutzhinweise werden vor dem
        Pilotbetrieb juristisch geprüft und finalisiert.
      </p>

      <section className="pc-card">
        <h2>Verantwortlicher</h2>
        <p>
          Alltagsengel UG (haftungsbeschränkt), Neue Mainzer Straße 66-68, 60311 Frankfurt am Main.
          Kontaktdaten und Vertretung: siehe <a href="/impressum">Impressum</a>.
        </p>
      </section>

      <section className="pc-card">
        <h2>Welche Daten der PflegeCoach verarbeitet</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li>Profilangaben (Rolle, optional Anzeigename, Pflegegrad, Geburtsjahr)</li>
          <li>Ihre Selbsteinschätzungen (Assessment, Belastungs-Check), Ziele, geplante Aktivitäten und Erledigungen</li>
          <li>Von Ihnen erstellte Berichte und Exporte</li>
          <li>Einwilligungs-Protokoll (Zeitpunkt, Textversion, Erteilung/Widerruf)</li>
        </ul>
        <p>
          Diese Daten sind Gesundheitsdaten im Sinne von Art. 9 DSGVO. Rechtsgrundlage der
          Verarbeitung ist Ihre ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a DSGVO), die Sie
          jederzeit in den <a href="/pflegecoach/einstellungen">Einstellungen</a> widerrufen können.
        </p>
        <p>
          <strong>Was der Widerruf bewirkt:</strong> Ab dem Widerruf können Sie keine neuen
          Einträge mehr anlegen — der PflegeCoach nimmt dann keine Assessments, Ziele,
          Aktivitäten oder Messungen mehr entgegen. Ihre bisherigen Daten bleiben für Sie
          einsehbar und exportierbar; die Rechtmäßigkeit der Verarbeitung bis zum Widerruf
          bleibt unberührt (Art. 7 Abs. 3 DSGVO). Gelöscht werden Ihre Daten erst, wenn Sie
          die Löschung ausdrücklich veranlassen.
        </p>
      </section>

      <section className="pc-card">
        <h2>Was der PflegeCoach NICHT tut</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li>Keine Werbung, keine Werbe-Tracker, keine Marketing-Pixel im PflegeCoach-Bereich</li>
          <li>Keine Nutzung Ihrer PflegeCoach-Daten für Werbung oder für Angebote anderer Alltagsengel-Dienstleistungen</li>
          <li>Keine Weitergabe an Dritte ohne Ihre gesonderte Einwilligung</li>
          <li>Kein Zugriff des Alltagsengel-Betriebspersonals auf Ihre PflegeCoach-Inhalte im Regelbetrieb (technische Trennung über eigene Zugriffsregeln)</li>
        </ul>
      </section>

      <section className="pc-card">
        <h2>Speicherung, Export, Löschung</h2>
        <p>
          Ihre Daten werden bei unserem Auftragsverarbeiter (Datenbank-Hosting) gespeichert.
          Sie können Ihre Daten jederzeit selbst exportieren
          (<a href="/pflegecoach/einstellungen">Einstellungen → Daten exportieren</a>).
        </p>
        <p>
          Löschen können Sie Ihre PflegeCoach-Daten ebenfalls selbst und vollständig
          (<a href="/pflegecoach/loeschung">Daten löschen</a>, Art. 17 DSGVO) — Ihr
          Alltagsengel-Konto bleibt dabei bestehen. Umgekehrt werden mit der Löschung Ihres
          Kontos auch Ihre PflegeCoach-Daten gelöscht. Nach der Löschung bleibt allein ein
          Protokolleintrag über den Löschvorgang selbst bestehen, ohne Ihre Inhalte.
        </p>
      </section>

      <section className="pc-card">
        <h2>Ihre Rechte</h2>
        <p>
          Sie haben die Rechte auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
          Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerruf erteilter
          Einwilligungen (Art. 7 Abs. 3 DSGVO) sowie das Beschwerderecht bei einer
          Datenschutz-Aufsichtsbehörde.
        </p>
      </section>
    </>
  )
}
