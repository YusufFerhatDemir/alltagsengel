// PflegeCoach — Allgemeine Geschäftsbedingungen.
//
// Der Text steht NICHT hier, sondern in lib/coach/rechtstexte.ts: Er wird
// zusätzlich in der Bestellbestätigung verlinkt und bei jeder Bestellung
// mit seiner Fassung protokolliert. Läge er als JSX in dieser Datei,
// gäbe es keine Fassung, auf die sich eine Bestellung berufen könnte.
//
// VORLAGE, NICHT GEPRÜFT: Der Hinweis oben auf der Seite ist kein
// Formalismus — solange die Fassung nicht juristisch gegengelesen ist,
// muss das für Leserinnen und Leser sichtbar sein.

import Link from 'next/link'
import { AGB, AGB_VERSION, RECHTSTEXTE_STAND } from '@/lib/coach/rechtstexte'
import { COACH_SUPPORT_EMAIL } from '@/lib/coach/version'

// noindex, aber follow: Rechtstexte gehören nicht in den Suchindex —
// ihre Verweise auf Impressum und Datenschutz sollen aber zählen. Ohne
// eigenes robots-Feld erbte die Seite das follow:false des Produkt-Layouts.
export const metadata = {
  title: 'AGB — Digitaler PflegeCoach',
  robots: { index: false, follow: true },
}

export default function CoachAgb() {
  return (
    <>
      <h1 className="pc-h1">Allgemeine Geschäftsbedingungen</h1>
      <p className="pc-lead">
        für die Nutzung des Digitalen PflegeCoach der Alltagsengel UG (haftungsbeschränkt)
      </p>

      <p className="pc-feedback pc-feedback--info">
        <strong>Der PflegeCoach ist derzeit kostenlos.</strong> Ein kostenpflichtiger Bestellweg
        ist aktuell nicht verfügbar. Die folgenden Regelungen zu Bestellung, Preisen und
        Kündigung (§§ 3–6) sind ein <strong>Entwurf</strong> für den Fall, dass ein solcher
        Bestellweg künftig freigeschaltet wird, und werden vor einem etwaigen Verkaufsstart
        juristisch geprüft und finalisiert. Fassung {AGB_VERSION}, Stand {RECHTSTEXTE_STAND}.
      </p>

      {AGB.map(abschnitt => (
        <section className="pc-card" key={abschnitt.nummer} aria-labelledby={`agb-${abschnitt.nummer.replace(/\W/g, '')}`}>
          <h2 id={`agb-${abschnitt.nummer.replace(/\W/g, '')}`}>
            {abschnitt.nummer} {abschnitt.titel}
          </h2>
          {/* Nummerierte Absätze: In AGB wird auf „§ 5 Abs. 2" verwiesen,
              das muss ohne Zählen am Bildschirm auffindbar sein. */}
          <ol style={{ paddingLeft: 20 }}>
            {abschnitt.absaetze.map((text, i) => (
              <li key={i} style={{ marginBottom: 10 }}>{text}</li>
            ))}
          </ol>
        </section>
      ))}

      <section className="pc-card" aria-labelledby="agb-weiteres">
        <h2 id="agb-weiteres">Weitere Unterlagen</h2>
        <p>
          <Link href="/pflegecoach/widerruf">Widerrufsbelehrung und Muster-Widerrufsformular</Link>
          {' · '}
          <Link href="/pflegecoach/datenschutz">Datenschutzhinweise</Link>
          {' · '}
          <Link href="/impressum">Impressum</Link>
        </p>
        <p>
          Fragen zu diesen Bedingungen beantworten wir unter{' '}
          <a href={`mailto:${COACH_SUPPORT_EMAIL}`}>{COACH_SUPPORT_EMAIL}</a>.
        </p>
      </section>
    </>
  )
}
