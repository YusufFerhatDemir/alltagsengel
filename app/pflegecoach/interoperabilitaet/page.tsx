// PflegeCoach — Veröffentlichung der Interoperabilitäts-Standards.
//
// Pflichtseite nach Anlage 2 DiPAV, Themenfeld I Nr. 4: die genutzten
// Standards müssen „vollständig veröffentlicht, auf der Anwendungswebseite
// verlinkt" sein und diskriminierungsfrei nutzbar sein. Die Inhalte kommen
// aus lib/coach/interop.ts, damit Veröffentlichung und Code nicht
// auseinanderlaufen können (Gegenprobe in lib/coach/interop.test.ts).
//
// Öffentlich erreichbar ohne Anmeldung — eine Veröffentlichung hinter
// einem Login wäre keine.

import {
  DISKRIMINIERUNGSFREI_ZUSAGE, EIGENSCHEMA, FHIR_BASIS_URL, FHIR_RESSOURCEN,
  INTEROP_STANDARDS, NICHT_ZUTREFFEND,
} from '@/lib/coach/interop'

export const metadata = {
  title: 'Interoperabilität und Datenexport — Digitaler PflegeCoach',
  description:
    'Welche offenen Standards der Digitale PflegeCoach für den Datenexport verwendet und wie ' +
    'Dritte sie nutzen können.',
}

export default function CoachInteroperabilitaet() {
  return (
    <>
      <h1 className="pc-h1">Interoperabilität und Datenexport</h1>
      <p>
        Ihre im PflegeCoach erfassten Daten gehören Ihnen. Damit Sie sie an eine andere
        Anwendung, an Ihre Pflegeeinrichtung oder an Ihre Ärztin weitergeben können, exportiert
        der PflegeCoach sie in offenen, öffentlich dokumentierten Formaten. Auf dieser Seite
        steht vollständig, welche das sind.
      </p>

      <section className="pc-card">
        <h2>Verwendete Standards</h2>
        <ul style={{ paddingLeft: 20 }}>
          {INTEROP_STANDARDS.map(s => (
            <li key={s.name} style={{ marginBottom: 12 }}>
              <strong>
                {s.name} {s.fassung}
              </strong>{' '}
              ({s.herausgeber})
              <br />
              {s.verwendung}
              <br />
              Spezifikation:{' '}
              <a href={s.url} rel="noopener noreferrer" target="_blank">
                {s.url}
              </a>
              <br />
              Nutzungsbedingungen des Standards: {s.lizenz}
            </li>
          ))}
        </ul>
        <p>{DISKRIMINIERUNGSFREI_ZUSAGE}</p>
      </section>

      <section className="pc-card">
        <h2>Was der FHIR-Export enthält</h2>
        <p>
          Der Export nutzt unveränderte Basisressourcen aus HL7 FHIR R4. Es sind keine eigenen
          Profile und keine eigenen Terminologien im Spiel — wer den Export einliest, braucht
          dafür nichts von uns.
        </p>
        <ul style={{ paddingLeft: 20 }}>
          {FHIR_RESSOURCEN.map(r => (
            <li key={r.typ}>
              <strong>{r.typ}</strong> — {r.inhalt}
            </li>
          ))}
        </ul>
        <p>
          Die von uns vergebenen Bezeichner (zum Beispiel für die beiden Fragebögen) beginnen
          alle mit <code>{FHIR_BASIS_URL}</code>. Sie dienen nur der eindeutigen Benennung.
        </p>
      </section>

      <section className="pc-card">
        <h2>Zweiter Exportweg: das dokumentierte Eigenformat</h2>
        <p>
          Neben dem FHIR-Weg gibt es einen vollständigen Selbstexport im Format{' '}
          <code>{EIGENSCHEMA.kennung}</code> in der Fassung {EIGENSCHEMA.fassung}.{' '}
          {EIGENSCHEMA.zweck}
        </p>
        <p>
          Die formale Beschreibung liegt als JSON Schema im Quellbestand des Produkts unter{' '}
          <code>{EIGENSCHEMA.datei}</code>.
        </p>
      </section>

      <section className="pc-card">
        <h2>Was der PflegeCoach ausdrücklich nicht kann</h2>
        <p>
          Vollständigkeit gehört zu einer belastbaren Veröffentlichung. Diese Punkte treffen auf
          den PflegeCoach nicht zu:
        </p>
        <ul style={{ paddingLeft: 20 }}>
          {NICHT_ZUTREFFEND.map(n => (
            <li key={n.punkt} style={{ marginBottom: 8 }}>
              <strong>{n.punkt}:</strong> {n.begruendung}
            </li>
          ))}
        </ul>
      </section>

      <section className="pc-card">
        <h2>Wie Sie exportieren</h2>
        <p>
          Beide Exportwege stehen Ihnen jederzeit in den{' '}
          <a href="/pflegecoach/einstellungen">Einstellungen</a> zur Verfügung — ohne Frist, ohne
          Rückfrage und ohne Kosten. Einen menschenlesbaren, ausdruckbaren Bericht zur Weitergabe
          finden Sie unter <a href="/pflegecoach/bericht">Bericht</a>.
        </p>
      </section>
    </>
  )
}
