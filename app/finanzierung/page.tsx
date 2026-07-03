import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Finanzierung — Wer zahlt Alltagsbegleitung, Pflegebox & Krankenfahrt?',
  description:
    'Transparent erklärt: Entlastungsbetrag 131 €/Monat (1.572 €/Jahr, §45b SGB XI), gemeinsamer Jahresbetrag Verhinderungs-/Kurzzeitpflege 3.539 €/Jahr (ab 01.07.2025), steuerliche Absetzbarkeit haushaltsnaher Dienstleistungen und Erstattung über die Unfallversicherung — aufgeteilt nach Pflegegrad.',
  alternates: { canonical: 'https://alltagsengel.care/finanzierung' },
  openGraph: {
    title: 'Finanzierung — So bezahlen Sie Alltagsengel-Leistungen',
    description:
      'Entlastungsbetrag 131 €/Monat, Verhinderungspflege 3.539 €/Jahr, Steuervorteil und Unfallversicherung — klar nach Pflegegrad erklärt.',
    url: 'https://alltagsengel.care/finanzierung',
    type: 'website',
  },
}

const FAQS = [
  {
    q: 'Was ist der Entlastungsbetrag nach §45b SGB XI?',
    a: 'Der Entlastungsbetrag beträgt 131 € pro Monat (1.572 € pro Jahr) und steht jeder Person mit Pflegegrad 1 bis 5 zu. Er kann für anerkannte Angebote zur Unterstützung im Alltag — wie die Alltagsbegleitung von Alltagsengel — genutzt werden. Wir rechnen direkt mit der Pflegekasse ab, Ihr Eigenanteil liegt bei 0 €.',
  },
  {
    q: 'Wie hoch ist das Budget für die Verhinderungspflege?',
    a: 'Seit dem 01.07.2025 gibt es einen gemeinsamen Jahresbetrag für Verhinderungs- und Kurzzeitpflege von 3.539 € pro Jahr (ab Pflegegrad 2). Dieses Budget kann flexibel eingesetzt werden, wenn die reguläre Pflegeperson verhindert ist.',
  },
  {
    q: 'Kann ich die Kosten von der Steuer absetzen?',
    a: 'Ja. Haushaltsnahe Dienstleistungen sind nach §35a EStG mit 20 % der Kosten (bis 4.000 € pro Jahr) direkt von der Steuerschuld absetzbar. Das gilt für den Teil, den Sie selbst tragen. Heben Sie dafür Rechnungen und Kontoauszüge auf.',
  },
  {
    q: 'Wann zahlt die Unfallversicherung?',
    a: 'Ist der Unterstützungsbedarf Folge eines Unfalls, kann die gesetzliche oder private Unfallversicherung Kosten für Betreuung und Haushaltshilfe erstatten. Prüfen Sie Ihre Police oder sprechen Sie uns an — wir helfen bei der Einordnung.',
  },
]

const jsonLdFAQ = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 18,
  padding: 24,
  border: '1px solid rgba(255,255,255,0.06)',
}

// Bausteine der Finanzierung — als klare, zitierbare Fakten formuliert.
const BAUSTEINE = [
  {
    zahl: '131 € / Monat',
    titel: 'Entlastungsbetrag (§45b SGB XI)',
    text: '1.572 € pro Jahr für anerkannte Alltagsbegleitung — ab Pflegegrad 1. Direkt mit der Pflegekasse abgerechnet, 0 € Eigenanteil.',
  },
  {
    zahl: '3.539 € / Jahr',
    titel: 'Verhinderungspflege (gemeinsamer Jahresbetrag)',
    text: 'Seit 01.07.2025 gemeinsamer Betrag für Verhinderungs- und Kurzzeitpflege — ab Pflegegrad 2. Flexibel einsetzbar, wenn die Pflegeperson verhindert ist.',
  },
  {
    zahl: '20 %',
    titel: 'Steuerliche Entlastung (§35a EStG)',
    text: 'Haushaltsnahe Dienstleistungen zu 20 % (bis 4.000 €/Jahr) direkt von der Steuerschuld absetzbar — für selbst getragene Kosten.',
  },
  {
    zahl: 'Erstattung',
    titel: 'Unfallversicherung',
    text: 'Ist der Bedarf Folge eines Unfalls, kann die gesetzliche oder private Unfallversicherung Betreuungs- und Haushaltskosten übernehmen.',
  },
]

// Aufteilung nach Pflegegrad
const PFLEGEGRADE = [
  {
    label: 'Pflegegrad 1',
    farbe: '#7FB77E',
    punkte: [
      'Entlastungsbetrag 131 €/Monat (1.572 €/Jahr) für Alltagsbegleitung',
      'Pflegebox: Pflegehilfsmittel bis 42 €/Monat (§40 SGB XI)',
      'Steuerliche Absetzbarkeit haushaltsnaher Dienstleistungen',
    ],
  },
  {
    label: 'Pflegegrad 2–5',
    farbe: '#C9963C',
    punkte: [
      'Alles aus Pflegegrad 1 (Entlastungsbetrag 131 €/Monat, Pflegebox 42 €/Monat)',
      'Zusätzlich: gemeinsamer Jahresbetrag Verhinderungs-/Kurzzeitpflege 3.539 €/Jahr',
      'Krankenfahrten mit Verordnung über die Krankenkasse (§60 SGB V)',
      'Steuervorteil und ggf. Unfallversicherung',
    ],
  },
  {
    label: 'Selbstzahler',
    farbe: '#9AA0A6',
    punkte: [
      'Alle Leistungen ohne Pflegegrad direkt buchbar',
      'Transparente Stundensätze — keine versteckten Kosten',
      '20 % der Kosten über §35a EStG steuerlich absetzbar',
      'Krankenfahrten jederzeit als Selbstzahler möglich',
    ],
  },
]

export default function FinanzierungPage() {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #1A1612 0%, #2A2420 100%)',
      padding: '0 16px 60px',
    }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }} />
      <BreadcrumbSchema items={[{ name: 'Finanzierung' }]} />

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '36px 0 28px', maxWidth: 660, margin: '0 auto' }}>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 38px)', fontWeight: 700, color: '#F5F0E8', marginBottom: 12, lineHeight: 1.2 }}>
          Wer zahlt Ihre Betreuung?
        </h1>
        <p style={{ color: '#B8B0A4', fontSize: 16, lineHeight: 1.6 }}>
          Alltagsbegleitung, Pflegebox und Krankenfahrten müssen Sie in den meisten Fällen nicht
          selbst bezahlen. Hier sehen Sie transparent, welche Töpfe Ihnen zustehen — klar
          aufgeteilt nach Pflegegrad.
        </p>
      </section>

      <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Bausteine der Finanzierung */}
        <section style={cardStyle}>
          <h2 style={{ color: '#C9963C', fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Ihre Finanzierungs-Bausteine</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14 }}>
            {BAUSTEINE.map(b => (
              <div key={b.titel} style={{ background: 'rgba(201,150,60,0.08)', borderRadius: 12, padding: '16px 18px', border: '1px solid rgba(201,150,60,0.18)' }}>
                <div style={{ color: '#C9963C', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{b.zahl}</div>
                <div style={{ color: '#F5F0E8', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{b.titel}</div>
                <div style={{ color: '#D8D0C4', fontSize: 13.5, lineHeight: 1.55 }}>{b.text}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Aufteilung nach Pflegegrad */}
        <section>
          <h2 style={{ color: '#F5F0E8', fontSize: 22, fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>
            Was steht Ihnen zu?
          </h2>
          <p style={{ color: '#B8B0A4', fontSize: 14, lineHeight: 1.6, textAlign: 'center', marginBottom: 18 }}>
            Ihre Ansprüche hängen vom Pflegegrad ab. So sieht es konkret aus:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {PFLEGEGRADE.map(pg => (
              <div key={pg.label} style={{ ...cardStyle, borderLeft: `4px solid ${pg.farbe}` }}>
                <h3 style={{ color: pg.farbe, fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{pg.label}</h3>
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pg.punkte.map((p, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#D8D0C4', fontSize: 14, lineHeight: 1.55 }}>
                      <span style={{ color: pg.farbe, flexShrink: 0, fontWeight: 700 }}>✓</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Hinweis 0 € Eigenanteil */}
        <section style={{ ...cardStyle, background: 'rgba(127,183,126,0.08)', border: '1px solid rgba(127,183,126,0.2)' }}>
          <h2 style={{ color: '#7FB77E', fontSize: 20, fontWeight: 700, marginBottom: 10 }}>0 € Eigenanteil in den meisten Fällen</h2>
          <p style={{ color: '#D8D0C4', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
            Bei anerkanntem Pflegegrad rechnen wir Entlastungsbetrag und Pflegebox direkt mit Ihrer
            Pflegekasse ab. Sie müssen nicht in Vorleistung gehen und tragen keinen Eigenanteil.
            Noch keinen Pflegegrad? Wir zeigen Ihnen den Weg zum Antrag.
          </p>
        </section>

        {/* FAQ */}
        <section style={cardStyle}>
          <h2 style={{ color: '#C9963C', fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Häufige Fragen zur Finanzierung</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FAQS.map((f, i) => (
              <div key={i}>
                <div style={{ color: '#F5F0E8', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{f.q}</div>
                <p style={{ color: '#B8B0A4', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{f.a}</p>
              </div>
            ))}
          </div>
          <p style={{ color: '#6A6259', fontSize: 12, lineHeight: 1.6, marginTop: 16, marginBottom: 0 }}>
            Angaben nach bestem Wissen, Stand 2026. Sie ersetzen keine individuelle Beratung durch
            Pflegekasse oder Steuerberatung.
          </p>
        </section>

        {/* CTA */}
        <section style={{ ...cardStyle, textAlign: 'center' }}>
          <h2 style={{ color: '#F5F0E8', fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Wir rechnen das gemeinsam durch</h2>
          <p style={{ color: '#B8B0A4', fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
            In einer kostenlosen Beratung klären wir, welche Leistungen Ihnen zustehen und wie viel
            Sie sparen. Unverbindlich — telefonisch, per WhatsApp oder Formular.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/kontakt" style={{ background: '#C9963C', color: '#1A1612', padding: '12px 26px', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              Kostenlose Beratung
            </Link>
            <Link href="/budgetrechner" style={{ border: '1px solid rgba(201,150,60,0.5)', color: '#C9963C', padding: '12px 26px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              Budget berechnen
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
