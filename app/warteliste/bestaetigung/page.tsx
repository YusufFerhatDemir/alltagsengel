import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Vormerkung eingegangen',
  description: 'Ihre Vormerkung für die Warteliste ist bei uns eingegangen.',
  // Bestätigungsseiten gehören nicht in den Index: sie sind ohne den
  // vorausgehenden Schritt sinnlos und würden das Formular kannibalisieren.
  robots: { index: false, follow: false },
}

export default async function WartelisteBestaetigungPage({
  searchParams,
}: {
  searchParams: Promise<{ bereits?: string }>
}) {
  const { bereits } = await searchParams
  const schonVorgemerkt = bereits === '1'

  return (
    <div className="screen info-screen">
      <div className="legal-header">
        <Link href="/" className="legal-back">&#8249;</Link>
        <h1 className="legal-title">Vormerkung eingegangen</h1>
      </div>

      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">💛</div>
          <h2 className="info-hero-title">
            {schonVorgemerkt ? 'Sie stehen bereits auf der Liste' : 'Vielen Dank — Sie sind vorgemerkt'}
          </h2>
          <p className="info-hero-sub">
            {schonVorgemerkt
              ? 'Unter diesen Kontaktdaten liegt uns schon eine Vormerkung vor. Sie müssen nichts weiter tun.'
              : 'Ihre Vormerkung ist bei uns eingegangen. Sie müssen nichts weiter tun.'}
          </p>
        </div>

        <section className="info-card">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>Wie es weitergeht</h2>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-text">
                Wir prüfen, wann wir in Ihrer Region starten können.
              </div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">
                Sie hören von uns, sobald es losgeht — per E-Mail oder telefonisch.
              </div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">
                Danach besprechen wir in Ruhe, was Sie brauchen. Erst dann entscheiden Sie.
              </div>
            </div>
          </div>
          <p style={{ marginTop: 14, fontSize: 14, color: 'var(--ink3)' }}>
            Es ist kein Vertrag entstanden und keine Zahlungspflicht. Sie können sich
            jederzeit formlos wieder abmelden — eine kurze Nachricht über{' '}
            <Link href="/kontakt">unser Kontaktformular</Link> genügt.
          </p>
        </section>

        <section className="info-card">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
            Zum Stand des Anerkennungsverfahrens
          </h2>
          <p>
            <strong>
              Alltagsengel befindet sich aktuell im Anerkennungsverfahren nach § 45a SGB XI.
              Nach erfolgter Anerkennung können berechtigte Pflegebedürftige Leistungen über
              den Entlastungsbetrag nach § 45b SGB XI abrechnen.
            </strong>
          </p>
          <p style={{ marginTop: 10 }}>
            Der Anspruch auf den Entlastungsbetrag von 131 € monatlich besteht unabhängig
            davon — er richtet sich nach Ihrem Pflegegrad, nicht nach uns. Trägerneutrale
            und kostenlose Beratung dazu erhalten Sie bei Ihrem Pflegestützpunkt und bei
            Ihrer Pflegekasse.
          </p>
        </section>

        <section className="info-card">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
            Bis dahin vielleicht nützlich
          </h2>
          <ul className="info-list">
            <li><Link href="/entlastungsbetrag">Entlastungsbetrag</Link> — 131 €/Monat ab Pflegegrad 1</li>
            <li><Link href="/pflegegrad-check">Pflegegrad-Check</Link> — welcher Grad kommt infrage?</li>
            <li><Link href="/budgetrechner">Budgetrechner</Link> — was steht Ihnen zu?</li>
            <li><Link href="/verhinderungspflege">Verhinderungspflege</Link> — bis 3.539 €/Jahr ab Pflegegrad 2</li>
            <li><Link href="/blog">Ratgeber</Link> — Artikel für pflegende Angehörige</li>
          </ul>
        </section>

        <div className="info-cta">
          <Link href="/" className="btn-gold" style={{ width: '100%' }}>ZUR STARTSEITE</Link>
        </div>

        <div className="legal-footer-nav">
          <Link href="/warteliste">Warteliste</Link>
          <Link href="/kontakt">Kontakt</Link>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/impressum">Impressum</Link>
        </div>
      </div>
    </div>
  )
}
