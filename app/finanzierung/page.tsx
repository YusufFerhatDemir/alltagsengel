import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Finanzierung: Alltagsbegleitung bis 5.111 €/Jahr',
  description:
    'Entlastungsbetrag 131 €/Monat plus Verhinderungs-/Kurzzeitpflege 3.539 €/Jahr — bis zu 5.111 €/Jahr für Ihre Alltagsbegleitung. Jetzt kostenlos beraten lassen!',
  alternates: { canonical: 'https://alltagsengel.care/finanzierung' },
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
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

// Vollständige Leistungs-Übersicht nach Pflegegrad — Beträge 2026.
// `relevant: true` markiert die Töpfe, über die Alltagsengel abrechnet.
const GRADE = ['PG 1', 'PG 2', 'PG 3', 'PG 4', 'PG 5']

const LEISTUNGEN = [
  {
    name: 'Entlastungsbetrag',
    detail: '§45b SGB XI · pro Monat',
    werte: ['131 €', '131 €', '131 €', '131 €', '131 €'],
    relevant: true,
  },
  {
    name: 'Verhinderungs- + Kurzzeitpflege',
    detail: 'gemeinsamer Jahresbetrag · pro Jahr',
    werte: ['—', '3.539 €', '3.539 €', '3.539 €', '3.539 €'],
    relevant: true,
  },
  {
    name: 'Pflegegeld',
    detail: '§37 SGB XI · pro Monat',
    werte: ['—', '347 €', '599 €', '800 €', '990 €'],
    relevant: false,
  },
  {
    name: 'Pflegesachleistungen',
    detail: '§36 SGB XI · pro Monat',
    werte: ['—', '796 €', '1.497 €', '1.859 €', '2.299 €'],
    relevant: false,
  },
  {
    name: 'Tages- / Nachtpflege',
    detail: '§41 SGB XI · pro Monat',
    werte: ['—', '721 €', '1.357 €', '1.685 €', '2.085 €'],
    relevant: false,
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

        {/* Vollständige Beträge nach Pflegegrad — Tabelle 2026 */}
        <section>
          <h2 style={{ color: '#F5F0E8', fontSize: 22, fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>
            Was steht Ihnen zu? — Beträge 2026 nach Pflegegrad
          </h2>
          <p style={{ color: '#B8B0A4', fontSize: 14, lineHeight: 1.6, textAlign: 'center', marginBottom: 18, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
            Diese gesetzlichen Leistungen stehen Ihnen je nach Pflegegrad zu.
            <strong style={{ color: '#E0B860' }}> Golden hervorgehoben</strong> sind die Töpfe, über die Alltagsengel Ihre Alltagsbegleitung abrechnet.
          </p>

          <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 580 }}>
              <thead>
                <tr>
                  <th style={{
                    textAlign: 'left', padding: '14px 16px', color: '#B8B0A4', fontSize: 12.5,
                    fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap',
                  }}>
                    Leistung
                  </th>
                  {GRADE.map(g => (
                    <th key={g} style={{
                      textAlign: 'center', padding: '14px 12px', color: '#F5F0E8', fontSize: 13,
                      fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap',
                    }}>
                      {g}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LEISTUNGEN.map(l => (
                  <tr key={l.name} style={{ background: l.relevant ? 'rgba(201,150,60,0.09)' : 'transparent' }}>
                    <td style={{
                      padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                      borderLeft: l.relevant ? '3px solid #C9963C' : '3px solid transparent',
                    }}>
                      <div style={{ color: l.relevant ? '#E0B860' : '#F5F0E8', fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
                        {l.name}
                      </div>
                      <div style={{ color: '#8A8278', fontSize: 11.5, marginTop: 2 }}>{l.detail}</div>
                    </td>
                    {l.werte.map((w, i) => (
                      <td key={i} style={{
                        textAlign: 'center', padding: '13px 12px', whiteSpace: 'nowrap',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        color: w === '—' ? '#6A6259' : (l.relevant ? '#E0B860' : '#D8D0C4'),
                        fontSize: 13.5, fontWeight: w === '—' ? 400 : 700,
                      }}>
                        {w}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: '#6A6259', fontSize: 11.5, lineHeight: 1.5, marginTop: 8, textAlign: 'center' }}>
            „—" bedeutet: für diesen Pflegegrad kein Anspruch. Entlastungsbetrag 131 €/Monat = 1.572 €/Jahr. Stand 2026.
          </p>

          {/* Was heißt das für Alltagsengel-Kunden? */}
          <div style={{
            ...cardStyle,
            marginTop: 16,
            background: 'linear-gradient(150deg, rgba(201,150,60,0.14) 0%, rgba(201,150,60,0.04) 100%)',
            border: '1px solid rgba(201,150,60,0.28)',
          }}>
            <h3 style={{ color: '#C9963C', fontSize: 17, fontWeight: 700, marginBottom: 10 }}>
              Was heißt das für Sie als Alltagsengel-Kunde?
            </h3>
            <p style={{ color: '#D8D0C4', fontSize: 14, lineHeight: 1.7, marginTop: 0, marginBottom: 12 }}>
              Alltagsengel ist <strong style={{ color: '#F5F0E8' }}>kein Pflegedienst</strong> — wir bieten
              Alltagsbegleitung und Hauswirtschaft. Bezahlt werden diese Leistungen vor allem über zwei Töpfe:
            </p>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['Entlastungsbetrag §45b', 'Der Haupttopf: 131 €/Monat (1.572 €/Jahr) — schon ab Pflegegrad 1. Wir rechnen direkt mit der Pflegekasse ab, 0 € Eigenanteil.'],
                ['Verhinderungspflege', 'Ist die Hauptpflegeperson verhindert, finanzieren wir unsere Begleitung aus dem gemeinsamen Jahresbetrag von 3.539 € (ab Pflegegrad 2).'],
                ['Steuerliche Entlastung §35a', 'Selbst getragene Kosten für haushaltsnahe Dienstleistungen sind zu 20 % (bis 4.000 €/Jahr) direkt von der Steuer absetzbar.'],
              ].map(([t, txt]) => (
                <li key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: '#C9963C', flexShrink: 0, fontWeight: 700, fontSize: 14 }}>✓</span>
                  <span style={{ color: '#D8D0C4', fontSize: 14, lineHeight: 1.55 }}>
                    <strong style={{ color: '#F5F0E8' }}>{t}:</strong> {txt}
                  </span>
                </li>
              ))}
            </ul>
            <p style={{ color: '#B8B0A4', fontSize: 13, lineHeight: 1.6, marginTop: 12, marginBottom: 0 }}>
              Gut zu wissen: Pflegegeld, Pflegesachleistungen und Tages-/Nachtpflege stehen Ihnen je nach
              Pflegegrad ebenfalls zu — sie sind für Pflege durch Angehörige oder einen ambulanten
              Pflegedienst gedacht und werden nicht über Alltagsengel abgerechnet.
            </p>
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
