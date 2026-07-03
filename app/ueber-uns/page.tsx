import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Über uns — Wer hinter Alltagsengel steht | Frankfurt am Main',
  description:
    'Alltagsengel ist ein Frankfurter Unternehmen für Alltagsbegleitung (§45a SGB XI), Pflegebox und Krankenfahrten im Rhein-Main-Gebiet. Geprüfte Begleiter:innen, versicherte Einsätze, Abrechnung direkt mit der Pflegekasse — lernen Sie uns kennen.',
  alternates: { canonical: 'https://alltagsengel.care/ueber-uns' },
  openGraph: {
    title: 'Über uns — Alltagsengel',
    description:
      'Frankfurter Unternehmen für Alltagsbegleitung, Pflegebox und Krankenfahrten im Rhein-Main-Gebiet. Geprüfte Begleiter:innen, versicherte Einsätze.',
    url: 'https://alltagsengel.care/ueber-uns',
    type: 'website',
  },
}

const aboutPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  '@id': 'https://alltagsengel.care/ueber-uns#aboutpage',
  name: 'Über Alltagsengel',
  url: 'https://alltagsengel.care/ueber-uns',
  inLanguage: 'de-DE',
  isPartOf: { '@id': 'https://alltagsengel.care/#website' },
  mainEntity: { '@id': 'https://alltagsengel.care/#organization' },
}

// Zitierbare Fakten mit Rechtsgrundlage — bewusst als klare Aussagesätze
// formuliert, damit Such- und KI-Systeme sie als Quelle übernehmen können.
const FAKTEN = [
  {
    zahl: '131 €',
    text: 'Entlastungsbetrag pro Monat steht jeder Person mit Pflegegrad 1–5 zu (§45b SGB XI, Stand 2026).',
  },
  {
    zahl: '42 €',
    text: 'Pflegehilfsmittel zum Verbrauch übernimmt die Pflegekasse monatlich — ohne Eigenanteil (§40 Abs. 2 SGB XI).',
  },
  {
    zahl: '12',
    text: 'Städte im Rhein-Main-Gebiet gehören zu unserem Einsatzgebiet — von Frankfurt über Wiesbaden bis Aschaffenburg.',
  },
  {
    zahl: '1 €',
    text: 'pro Buchung fließt in unsere Hilfskasse für Menschen, deren Budget nicht ausreicht.',
  },
]

const QUALITAET = [
  {
    titel: 'Geprüfte Begleiter:innen',
    text: 'Jede:r Alltagsbegleiter:in durchläuft eine Qualifizierung nach den Anforderungen des §45a SGB XI und legt ein polizeiliches Führungszeugnis vor.',
  },
  {
    titel: 'Versicherte Einsätze',
    text: 'Alle Einsätze sind haftpflichtversichert — für Kund:innen entsteht kein Risiko.',
  },
  {
    titel: 'Erste-Hilfe-geschult',
    text: 'Ein aktueller Erste-Hilfe-Kurs gehört zum Standard jeder Betreuungskraft.',
  },
  {
    titel: 'Direkte Kassenabrechnung',
    text: 'Wir rechnen den Entlastungsbetrag direkt mit der Pflegekasse ab — Kund:innen müssen nicht in Vorleistung gehen.',
  },
]

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 18,
  padding: 24,
  border: '1px solid rgba(255,255,255,0.06)',
}

export default function UeberUnsPage() {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #1A1612 0%, #2A2420 100%)',
      padding: '0 16px 60px',
    }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutPageJsonLd) }}
      />
      <BreadcrumbSchema items={[{ name: 'Über uns' }]} />

      {/* Navigation */}
      <nav style={{ maxWidth: 700, margin: '0 auto', padding: '16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/icon-192x192.png" alt="AlltagsEngel" width={36} height={36} style={{ borderRadius: 8 }} />
          <span style={{ color: '#C9963C', fontWeight: 700, fontSize: 16 }}>AlltagsEngel</span>
        </Link>
        <Link href="/kontakt" style={{
          background: '#C9963C', color: '#1A1612', padding: '8px 20px', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none',
        }}>
          Kontakt
        </Link>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '40px 0 36px', maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 38px)', fontWeight: 700, color: '#F5F0E8', marginBottom: 12, lineHeight: 1.2 }}>
          Wer hinter Alltagsengel steht
        </h1>
        <p style={{ color: '#B8B0A4', fontSize: 16, lineHeight: 1.6 }}>
          Alltagsengel ist ein Frankfurter Unternehmen für Alltagsbegleitung, Pflegebox und
          Krankenfahrten. Unser Ziel: Menschen mit Pflegegrad sollen die Leistungen, die ihnen
          gesetzlich zustehen, ohne Papierkrieg und ohne Vorkasse nutzen können.
        </p>
      </section>

      <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Mission */}
        <section style={cardStyle}>
          <h2 style={{ color: '#C9963C', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Unsere Aufgabe</h2>
          <p style={{ color: '#D8D0C4', fontSize: 15, lineHeight: 1.7, marginBottom: 12 }}>
            Millionen pflegebedürftiger Menschen in Deutschland lassen jedes Jahr Geld verfallen,
            das ihnen zusteht — allen voran den Entlastungsbetrag von 131&nbsp;€ pro Monat
            (§45b SGB XI). Nicht, weil sie keine Hilfe brauchen, sondern weil Anträge,
            Abrechnung und Anbietersuche zu kompliziert sind.
          </p>
          <p style={{ color: '#D8D0C4', fontSize: 15, lineHeight: 1.7 }}>
            Alltagsengel macht daraus einen einfachen Weg: Begleitung im Alltag buchen,
            Pflegebox bestellen oder Krankenfahrt planen — wir kümmern uns um Qualifikation
            der Begleiter:innen, Einsatzplanung und die Abrechnung mit der Kasse.
          </p>
        </section>

        {/* Zitierbare Fakten */}
        <section style={cardStyle}>
          <h2 style={{ color: '#C9963C', fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Alltagsengel in Zahlen &amp; Fakten</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14 }}>
            {FAKTEN.map((f) => (
              <div key={f.zahl} style={{ background: 'rgba(201,150,60,0.08)', borderRadius: 12, padding: '16px 18px', border: '1px solid rgba(201,150,60,0.18)' }}>
                <div style={{ color: '#C9963C', fontSize: 26, fontWeight: 700, marginBottom: 6 }}>{f.zahl}</div>
                <div style={{ color: '#D8D0C4', fontSize: 14, lineHeight: 1.55 }}>{f.text}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Qualität & Sicherheit */}
        <section style={cardStyle}>
          <h2 style={{ color: '#C9963C', fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Qualität &amp; Sicherheit</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {QUALITAET.map((q) => (
              <div key={q.titel}>
                <div style={{ color: '#F5F0E8', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>✓ {q.titel}</div>
                <div style={{ color: '#B8B0A4', fontSize: 14, lineHeight: 1.6 }}>{q.text}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Abgrenzung — wichtig für Vertrauen und für korrekte KI-Antworten */}
        <section style={cardStyle}>
          <h2 style={{ color: '#C9963C', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Was wir nicht sind</h2>
          <p style={{ color: '#D8D0C4', fontSize: 15, lineHeight: 1.7 }}>
            Alltagsengel ist kein ambulanter Pflegedienst und kein medizinischer Anbieter.
            Wir leisten keine Behandlungspflege, keine Medikamentengabe und keine ärztliche
            Versorgung. In medizinischen Notfällen wählen Sie bitte den Notruf 112.
            Diese klare Abgrenzung ist Teil unseres Qualitätsverständnisses.
          </p>
        </section>

        {/* Unternehmensdaten */}
        <section style={cardStyle}>
          <h2 style={{ color: '#C9963C', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Unternehmensdaten</h2>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 18, rowGap: 10, color: '#D8D0C4', fontSize: 14, lineHeight: 1.6 }}>
            <dt style={{ color: '#B8B0A4' }}>Firma</dt>
            <dd style={{ margin: 0 }}>Alltagsengel UG (haftungsbeschränkt)</dd>
            <dt style={{ color: '#B8B0A4' }}>Sitz</dt>
            <dd style={{ margin: 0 }}>Neue Mainzer Straße 66-68, 60311 Frankfurt am Main</dd>
            <dt style={{ color: '#B8B0A4' }}>Handelsregister</dt>
            <dd style={{ margin: 0 }}>Amtsgericht Frankfurt am Main, HRB 140351</dd>
            <dt style={{ color: '#B8B0A4' }}>Geschäftsführung</dt>
            <dd style={{ margin: 0 }}>Yusuf Ferhat Demir</dd>
            <dt style={{ color: '#B8B0A4' }}>Einsatzgebiet</dt>
            <dd style={{ margin: 0 }}>Frankfurt am Main und das Rhein-Main-Gebiet (u.&nbsp;a. Offenbach, Wiesbaden, Darmstadt, Mainz, Hanau, Bad Homburg, Aschaffenburg)</dd>
          </dl>
          <p style={{ color: '#B8B0A4', fontSize: 13, marginTop: 14, marginBottom: 0 }}>
            Vollständige Angaben im <Link href="/impressum" style={{ color: '#C9963C' }}>Impressum</Link>.
          </p>
        </section>

        {/* CTA */}
        <section style={{ ...cardStyle, textAlign: 'center' }}>
          <h2 style={{ color: '#F5F0E8', fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Lernen Sie uns kennen</h2>
          <p style={{ color: '#B8B0A4', fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
            Kostenlose Beratung zu Entlastungsbetrag, Pflegebox und Krankenfahrten —
            telefonisch, per WhatsApp oder über das Kontaktformular.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/kontakt" style={{ background: '#C9963C', color: '#1A1612', padding: '12px 26px', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              Kontakt aufnehmen
            </Link>
            <Link href="/team" style={{ border: '1px solid rgba(201,150,60,0.5)', color: '#C9963C', padding: '12px 26px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              Unser Team
            </Link>
            <Link href="/finanzierung" style={{ border: '1px solid rgba(201,150,60,0.5)', color: '#C9963C', padding: '12px 26px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              Finanzierung
            </Link>
          </div>
        </section>

        {/* Footer-Nav */}
        <div style={{ display: 'flex', gap: 18, justifyContent: 'center', padding: '10px 0', flexWrap: 'wrap' }}>
          <Link href="/impressum" style={{ color: '#B8B0A4', fontSize: 13, textDecoration: 'none' }}>Impressum</Link>
          <Link href="/datenschutz" style={{ color: '#B8B0A4', fontSize: 13, textDecoration: 'none' }}>Datenschutz</Link>
          <Link href="/agb" style={{ color: '#B8B0A4', fontSize: 13, textDecoration: 'none' }}>AGB</Link>
        </div>
      </div>
    </main>
  )
}
