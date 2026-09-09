import Link from 'next/link'
import type { Metadata } from 'next'
import WartelisteForm from '@/components/WartelisteForm'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import { WARTELISTE_LEISTUNGEN, WARTELISTE_REGIONEN } from '@/lib/warteliste/katalog'

// ═══════════════════════════════════════════════════════════════════════
// KUNDEN-WARTELISTE
//
// Diese Seite verspricht ausdruecklich KEINE Abrechnung ueber den
// Entlastungsbetrag. Die Anerkennung nach § 45a SGB XI steht aus; bis zum
// Bescheid ist eine Vormerkung das Einzige, was ehrlich angeboten werden
// kann. Der Anspruch auf 131 EUR/Monat besteht unabhaengig davon und wird
// deshalb genannt — mit dem Zusatz, was fuer seine Nutzung noetig ist.
// ═══════════════════════════════════════════════════════════════════════

const HINWEIS_ANERKENNUNG =
  'Alltagsengel befindet sich aktuell im Anerkennungsverfahren nach § 45a SGB XI. '
  + 'Nach erfolgter Anerkennung können berechtigte Pflegebedürftige Leistungen über den '
  + 'Entlastungsbetrag nach § 45b SGB XI abrechnen.'

export const metadata: Metadata = {
  title: 'Warteliste — Alltagsbegleitung im Rhein-Main-Gebiet',
  description:
    'Lassen Sie sich unverbindlich für Alltagsbegleitung in Frankfurt, Offenbach, Hanau und '
    + 'dem Rhein-Main-Gebiet vormerken. Kostenlos, jederzeit widerrufbar. '
    + 'Alltagsengel ist im Anerkennungsverfahren nach §45a SGB XI.',
  keywords: [
    'Alltagsbegleitung Warteliste', 'Alltagsbegleiter Frankfurt', 'Betreuung vormerken',
    'Entlastungsbetrag', '131 Euro Pflegekasse', 'Haushaltshilfe Rhein-Main',
  ],
  alternates: { canonical: 'https://alltagsengel.care/warteliste' },
  openGraph: {
    title: 'Warteliste — Alltagsbegleitung im Rhein-Main-Gebiet',
    description:
      'Unverbindlich vormerken lassen. Wir melden uns, sobald wir in Ihrer Region starten.',
    url: 'https://alltagsengel.care/warteliste',
    type: 'website',
  },
  robots: { index: true, follow: true },
}

const FAQ = [
  {
    frage: 'Was kostet die Vormerkung?',
    antwort:
      'Nichts. Die Vormerkung ist kostenlos und unverbindlich. Es entsteht kein Vertrag und '
      + 'keine Zahlungspflicht. Sie können sich jederzeit formlos wieder abmelden.',
  },
  {
    frage: 'Kann ich die Leistungen über die Pflegekasse abrechnen?',
    antwort: HINWEIS_ANERKENNUNG
      + ' Bis dahin können Sie unsere Leistungen als Selbstzahler in Anspruch nehmen. '
      + 'Wir beraten Sie kostenlos zu allen Finanzierungswegen.',
  },
  {
    frage: 'Was ist der Entlastungsbetrag?',
    antwort:
      'Pflegebedürftigen mit Pflegegrad steht nach § 45b SGB XI grundsätzlich ein monatlicher '
      + 'Entlastungsbetrag von 131 € zur Verfügung — bereits ab Pflegegrad 1. Nicht genutzte '
      + 'Beträge verfallen am 30. Juni des Folgejahres.',
  },
  {
    frage: 'Brauche ich einen Pflegegrad?',
    antwort:
      'Nein. Für die Vormerkung ist kein Pflegegrad nötig, und unsere Alltagsbegleitung steht '
      + 'auch Menschen ohne Pflegegrad offen. Die Angabe im Formular ist freiwillig und hilft '
      + 'uns nur, die Beratung vorzubereiten.',
  },
  {
    frage: 'Wann melden Sie sich?',
    antwort:
      'Sobald wir in Ihrer Region starten — und in jedem Fall, sobald der Bescheid zur '
      + 'Anerkennung nach § 45a SGB XI vorliegt. Bis dahin hören Sie von uns nur, wenn Sie '
      + 'eine konkrete Frage gestellt haben.',
  },
  {
    frage: 'Was passiert mit meinen Daten?',
    antwort:
      'Ihre Angaben werden ausschließlich zur Bearbeitung Ihrer Vormerkung gespeichert und '
      + 'nicht an Dritte weitergegeben. Sie können der Speicherung jederzeit widersprechen; '
      + 'Einzelheiten stehen in unseren Datenschutzhinweisen.',
  },
]

export default function WartelistePage() {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(f => ({
      '@type': 'Question',
      name: f.frage,
      acceptedAnswer: { '@type': 'Answer', text: f.antwort },
    })),
  }

  return (
    <div className="screen info-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <BreadcrumbSchema items={[{ name: 'Warteliste' }]} />

      <div className="legal-header">
        <Link href="/" className="legal-back">&#8249;</Link>
        <h1 className="legal-title">Warteliste</h1>
      </div>

      <div className="info-body">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <div className="info-hero">
          <div className="info-hero-icon">💛</div>
          <h2 className="info-hero-title">Warteliste für Alltagsbegleitung</h2>
          <p className="info-hero-sub">
            Wir bauen unser Angebot im Rhein-Main-Gebiet auf. Lassen Sie sich unverbindlich
            vormerken — kostenlos und jederzeit widerrufbar.
          </p>
        </div>

        {/* ── Statushinweis ────────────────────────────────────────── */}
        <section className="info-card" style={{ borderLeft: '3px solid #C9963C' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
            Wo wir gerade stehen
          </h2>
          <p style={{ margin: 0 }}>
            <strong>{HINWEIS_ANERKENNUNG}</strong>
          </p>
          <p style={{ marginTop: 10 }}>
            Solange der Bescheid aussteht, sagen wir Ihnen keine Kostenübernahme zu — das
            wäre ein Versprechen, das wir heute nicht halten könnten. Was wir zusagen können:
            Sie stehen auf der Liste, und Sie hören von uns, sobald es losgeht.
          </p>
        </section>

        {/* ── Was ist Alltagsbegleitung ────────────────────────────── */}
        <section className="info-card">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
            Was ist Alltagsbegleitung?
          </h2>
          <p>
            Alltagsbegleitung ist Unterstützung bei den Dingen, die den Tag ausmachen: der
            Einkauf, der Weg zum Arzt, der Haushalt, ein Gespräch am Nachmittag. Sie ist keine
            medizinische Pflege und ersetzt keinen Pflegedienst — sie setzt daneben an, dort wo
            Selbstständigkeit erhalten bleiben soll.
          </p>
          <p style={{ marginTop: 8 }}>
            Gedacht ist sie für Seniorinnen und Senioren, die zu Hause leben möchten, für
            Menschen mit beginnender Demenz, und für pflegende Angehörige, die regelmäßige
            Entlastung brauchen, um selbst gesund zu bleiben. Sie erhalten eine feste
            Bezugsperson statt wechselnder Kräfte.
          </p>
        </section>

        {/* ── Leistungen ───────────────────────────────────────────── */}
        <section className="info-card">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
            Unsere Leistungen im Überblick
          </h2>
          <ul className="info-list">
            {WARTELISTE_LEISTUNGEN.map(l => <li key={l.key}>{l.label}</li>)}
          </ul>
          <p style={{ marginTop: 10, fontSize: 14, color: 'var(--ink3)' }}>
            Im Formular können Sie angeben, woran Sie Interesse haben — das hilft uns, die
            Beratung vorzubereiten. Eine Festlegung ist es nicht.
          </p>
        </section>

        {/* ── Regionen ─────────────────────────────────────────────── */}
        <section className="info-card">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
            Regionen, in denen wir aufbauen
          </h2>
          <p>
            Unser Schwerpunkt liegt im Rhein-Main-Gebiet. Steht Ihr Ort nicht in der Liste,
            wählen Sie im Formular „Anderer Ort im Rhein-Main-Gebiet“ — auch das ist für uns
            eine wichtige Information.
          </p>
          <ul className="info-list" style={{ marginTop: 10 }}>
            {WARTELISTE_REGIONEN.filter(r => r.key !== 'umland').map(r => (
              <li key={r.key}>{r.label}</li>
            ))}
          </ul>
        </section>

        {/* ── Entlastungsbetrag ────────────────────────────────────── */}
        <section className="info-card">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
            Der Entlastungsbetrag — 131 € im Monat
          </h2>
          <div className="info-price-row">
            <span className="info-price-label">Entlastungsbetrag (§ 45b SGB XI)</span>
            <span className="info-price-val">131 €/Monat</span>
          </div>
          <p className="info-price-note">
            Pflegebedürftigen mit Pflegegrad steht dieser Betrag grundsätzlich zur Verfügung,
            bereits ab Pflegegrad 1. Nicht genutzte Beträge verfallen am 30. Juni des
            Folgejahres. {HINWEIS_ANERKENNUNG}
          </p>
          <p style={{ marginTop: 10, fontSize: 14 }}>
            Mehr dazu auf unserer Seite zum{' '}
            <Link href="/entlastungsbetrag">Entlastungsbetrag</Link> und im{' '}
            <Link href="/budgetrechner">Budgetrechner</Link>.
          </p>
        </section>

        {/* ── Formular ─────────────────────────────────────────────── */}
        <section id="formular" style={{ marginTop: 24 }}>
          <WartelisteForm />
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <section className="info-card" style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>Häufige Fragen</h2>
          {FAQ.map(f => (
            <details className="info-faq" key={f.frage}>
              <summary>{f.frage}</summary>
              <p>{f.antwort}</p>
            </details>
          ))}
        </section>

        {/* ── Für Bewerber ─────────────────────────────────────────── */}
        <section className="info-card">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
            Sie möchten als Alltagsbegleiter arbeiten?
          </h2>
          <p>
            Wir suchen laufend Menschen, die Zeit und Geduld mitbringen. Eine pflegerische
            Ausbildung ist nicht nötig.
          </p>
          <div style={{ marginTop: 14 }}>
            <Link href="/engel-werden" className="btn-ghost" style={{ width: '100%' }}>
              ZUR BEWERBUNG
            </Link>
          </div>
        </section>

        <div className="legal-footer-nav">
          <Link href="/alltagsbegleitung">Alltagsbegleitung</Link>
          <Link href="/entlastungsbetrag">Entlastungsbetrag</Link>
          <Link href="/finanzierung">Finanzierung</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/kontakt">Kontakt</Link>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/impressum">Impressum</Link>
        </div>
      </div>
    </div>
  )
}
