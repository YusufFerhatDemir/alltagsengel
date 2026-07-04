import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Finanzierung — bis zu 5.111 €/Jahr für Ihre Alltagsbegleitung',
  description:
    'Transparent erklärt: Entlastungsbetrag 131 €/Monat (1.572 €/Jahr, §45b SGB XI) plus gemeinsamer Jahresbetrag Verhinderungs-/Kurzzeitpflege 3.539 €/Jahr (ab 01.07.2025) = bis zu 5.111 €/Jahr kombinierbar. Dazu steuerliche Absetzbarkeit haushaltsnaher Dienstleistungen und Erstattung über die Unfallversicherung — aufgeteilt nach Pflegegrad.',
  alternates: { canonical: 'https://alltagsengel.care/finanzierung' },
  openGraph: {
    title: 'Finanzierung — bis zu 5.111 €/Jahr für Alltagsengel-Leistungen',
    description:
      'Entlastungsbetrag 131 €/Monat plus Verhinderungs-/Kurzzeitpflege 3.539 €/Jahr = bis zu 5.111 €/Jahr kombinierbar. Steuervorteil und Unfallversicherung — klar nach Pflegegrad erklärt.',
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
    q: 'Was ist die Kurzzeitpflege und wie hängt sie mit der Verhinderungspflege zusammen?',
    a: 'Seit dem 01.07.2025 sind Verhinderungspflege und Kurzzeitpflege zu einem gemeinsamen Jahresbetrag von 3.539 € zusammengelegt. Sie können dieses Budget flexibel für beides einsetzen — jeweils bis zu 8 Wochen pro Jahr, ab Pflegegrad 2. Die frühere Vorpflegezeit (sechs Monate häusliche Pflege vor der ersten Verhinderungspflege) ist komplett entfallen. Sie können das Budget also sofort nutzen.',
  },
  {
    q: 'Wie viel Geld steht mir insgesamt pro Jahr zu?',
    a: 'Sie können mehrere Töpfe gleichzeitig nutzen: Entlastungsbetrag 1.572 €/Jahr (§45b, ab PG1) plus gemeinsamer Jahresbetrag Verhinderungs-/Kurzzeitpflege 3.539 €/Jahr (ab PG2) ergeben zusammen bis zu 5.111 € pro Jahr. Dazu kommen die steuerliche Absetzbarkeit haushaltsnaher Dienstleistungen und ggf. eine Erstattung der Unfallversicherung.',
  },
  {
    q: 'Verfällt der Entlastungsbetrag, wenn ich ihn nicht nutze?',
    a: 'Nein. Nicht verbrauchte Entlastungsbeträge (§45b) können ins Folgejahr übertragen werden. Restbeträge eines Kalenderjahres bleiben grundsätzlich bis zum 30. Juni des Folgejahres nutzbar. Es lohnt sich also, den Anspruch rechtzeitig einzusetzen — wir helfen bei der Planung.',
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

// Gesamt-Budget: die beiden großen Pflegekassen-Töpfe, die sich kombinieren lassen.
const BUDGET_TOEPFE = [
  {
    titel: 'Entlastungsbetrag §45b',
    betrag: 1572,
    zusatz: '131 €/Monat · ab Pflegegrad 1',
    farbe: '#E0B860',
  },
  {
    titel: 'Verhinderungs- + Kurzzeitpflege',
    betrag: 3539,
    zusatz: 'gemeinsamer Jahresbetrag · ab Pflegegrad 2',
    farbe: '#C9963C',
  },
]
const BUDGET_GESAMT = BUDGET_TOEPFE.reduce((s, t) => s + t.betrag, 0) // 5.111 €

// „Wussten Sie schon?" — Punkte, die viele Familien nicht auf dem Schirm haben.
const WUSSTEN_SIE = [
  {
    titel: 'Sie dürfen mehrere Töpfe gleichzeitig nutzen',
    text: 'Entlastungsbetrag und Verhinderungs-/Kurzzeitpflege schließen sich nicht aus — kombiniert stehen Ihnen bis zu 5.111 € pro Jahr zur Verfügung.',
  },
  {
    titel: 'Die Vorpflegezeit ist weggefallen',
    text: 'Seit 01.07.2025 müssen Sie nicht mehr sechs Monate häuslich gepflegt haben, bevor die Verhinderungspflege startet. Der Anspruch gilt sofort.',
  },
  {
    titel: 'Nicht genutzte Beträge verfallen nicht sofort',
    text: 'Restbeträge des Entlastungsbetrags (§45b) können ins Folgejahr übertragen werden — bis zum 30. Juni bleiben sie nutzbar.',
  },
  {
    titel: 'Alltagsbegleitung aus dem Verhinderungspflege-Budget',
    text: 'Ist die Hauptpflegeperson verhindert, kann unsere Alltagsbegleitung aus dem gemeinsamen Jahresbetrag von 3.539 € bezahlt werden.',
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

        {/* Gesamt-Budget — der Wow-Effekt: bis zu 5.111 €/Jahr */}
        <section style={{
          ...cardStyle,
          background: 'linear-gradient(150deg, rgba(201,150,60,0.16) 0%, rgba(201,150,60,0.05) 100%)',
          border: '1px solid rgba(201,150,60,0.3)',
          textAlign: 'center',
        }}>
          <div style={{ color: '#B8B0A4', fontSize: 14, fontWeight: 600, letterSpacing: 0.3, marginBottom: 4 }}>
            Ihnen stehen zusammen zu
          </div>
          <div style={{ color: '#E0B860', fontSize: 'clamp(44px, 11vw, 64px)', fontWeight: 800, lineHeight: 1.05 }}>
            bis zu 5.111 €
          </div>
          <div style={{ color: '#F5F0E8', fontSize: 16, fontWeight: 600, marginBottom: 22 }}>
            pro Jahr für Ihre Alltagsbegleitung <span style={{ color: '#B8B0A4', fontWeight: 400 }}>(bei Pflegegrad 2–5)</span>
          </div>

          {/* Gestapelter Balken: zwei kombinierbare Töpfe */}
          <div style={{ display: 'flex', height: 46, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
            {BUDGET_TOEPFE.map(t => (
              <div key={t.titel} style={{
                flexGrow: t.betrag,
                flexBasis: 0,
                background: t.farbe,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1A1612',
                fontSize: 'clamp(12px, 3.2vw, 15px)',
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}>
                {t.betrag.toLocaleString('de-DE')} €
              </div>
            ))}
          </div>

          {/* Legende zu den Töpfen */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16, textAlign: 'left' }}>
            {BUDGET_TOEPFE.map(t => (
              <div key={t.titel} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: t.farbe, flexShrink: 0 }} />
                <span style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 600 }}>{t.titel}</span>
                <span style={{ color: '#B8B0A4', fontSize: 13 }}>· {t.zusatz}</span>
                <span style={{ color: '#E0B860', fontSize: 14, fontWeight: 700, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  {t.betrag.toLocaleString('de-DE')} €
                </span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 4, paddingTop: 10, display: 'flex', alignItems: 'center' }}>
              <span style={{ color: '#F5F0E8', fontSize: 15, fontWeight: 700 }}>Gesamt pro Jahr</span>
              <span style={{ color: '#E0B860', fontSize: 18, fontWeight: 800, marginLeft: 'auto' }}>
                {BUDGET_GESAMT.toLocaleString('de-DE')} €
              </span>
            </div>
          </div>

          <p style={{ color: '#B8B0A4', fontSize: 13, lineHeight: 1.6, marginTop: 16, marginBottom: 0 }}>
            Beide Töpfe lassen sich kombinieren — plus Steuervorteil und ggf. Unfallversicherung.
            Wir rechnen direkt mit Ihrer Pflegekasse ab.
          </p>
        </section>

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

        {/* Kurzzeitpflege — eigener Abschnitt */}
        <section style={cardStyle}>
          <h2 style={{ color: '#C9963C', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
            Kurzzeitpflege — flexibel mit der Verhinderungspflege
          </h2>
          <p style={{ color: '#D8D0C4', fontSize: 15, lineHeight: 1.7, marginTop: 0, marginBottom: 14 }}>
            Seit dem <strong style={{ color: '#F5F0E8' }}>01.07.2025</strong> sind Verhinderungs- und
            Kurzzeitpflege zu einem <strong style={{ color: '#F5F0E8' }}>gemeinsamen Jahresbetrag von 3.539 €</strong> zusammengelegt.
            Sie entscheiden, wofür Sie das Budget einsetzen — beides ist aus demselben Topf finanzierbar.
          </p>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Ein gemeinsames Budget von 3.539 €/Jahr — flexibel für Verhinderungs- oder Kurzzeitpflege',
              'Jeweils bis zu 8 Wochen pro Jahr möglich',
              'Ab Pflegegrad 2',
              'Vorpflegezeit komplett entfallen — der Anspruch gilt sofort, ohne Wartezeit',
            ].map((p, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#D8D0C4', fontSize: 14, lineHeight: 1.55 }}>
                <span style={{ color: '#C9963C', flexShrink: 0, fontWeight: 700 }}>✓</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Wussten Sie schon? */}
        <section>
          <h2 style={{ color: '#F5F0E8', fontSize: 22, fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>
            Wussten Sie schon?
          </h2>
          <p style={{ color: '#B8B0A4', fontSize: 14, lineHeight: 1.6, textAlign: 'center', marginBottom: 18 }}>
            Vier Punkte, die viele Familien Geld liegen lassen — dabei stehen sie Ihnen zu:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14 }}>
            {WUSSTEN_SIE.map(w => (
              <div key={w.titel} style={{ ...cardStyle, padding: '18px 20px' }}>
                <div style={{ color: '#E0B860', fontSize: 15, fontWeight: 700, marginBottom: 6, lineHeight: 1.4 }}>{w.titel}</div>
                <div style={{ color: '#D8D0C4', fontSize: 13.5, lineHeight: 1.6 }}>{w.text}</div>
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

        {/* Beratungskompetenz — Vertrauen, ohne persönliche Namen */}
        <section style={{
          ...cardStyle,
          background: 'linear-gradient(150deg, rgba(224,184,96,0.1) 0%, rgba(201,150,60,0.04) 100%)',
          border: '1px solid rgba(201,150,60,0.22)',
        }}>
          <h2 style={{ color: '#C9963C', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
            Warum unsere Beratung den Unterschied macht
          </h2>
          <p style={{ color: '#D8D0C4', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
            Unser Beratungsteam verfügt über <strong style={{ color: '#F5F0E8' }}>25 Jahre Branchenerfahrung</strong> in
            der Alltagsbegleitung und hat den Aufbau von Unternehmen mit <strong style={{ color: '#F5F0E8' }}>über 1.000 Mitarbeitern</strong> begleitet.
            Diese Erfahrung nutzen wir für Sie: Wir kennen jeden Finanzierungstopf, wissen genau,
            welche Leistungen sich kombinieren lassen, und holen für Sie das Maximum heraus — verständlich erklärt und ohne Fachchinesisch.
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
