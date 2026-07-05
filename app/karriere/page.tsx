import type { Metadata } from 'next'
import Link from 'next/link'
import EngelBewerbungForm from '@/components/EngelBewerbungForm'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Karriere — Werde Alltagsengel | Flexibler Nebenjob mit Sinn',
  description: 'Werde Alltagsengel in Frankfurt & Rhein-Main: 20 €/Stunde, flexible Zeiteinteilung, sinnvolle Arbeit. Für Studierende, Quereinsteiger und alle mit Herz. Jetzt bewerben!',
  keywords: [
    'nebenjob pflege frankfurt',
    'alltagsbegleiter werden',
    'seniorenbetreuung job',
    'alltagsbegleitung job',
    'nebenjob mit sinn',
    '20 euro stunde nebenjob',
    'quereinsteiger pflege',
    'minijob betreuung',
    'job alltagsbegleitung frankfurt',
    'karriere pflege rhein-main',
  ],
  openGraph: {
    title: 'Karriere — Werde Alltagsengel | Flexibler Nebenjob mit Sinn',
    description: '20 €/Stunde als Alltagsbegleiter. Flexible Zeiten, sinnvolle Arbeit, keine Pflegeausbildung nötig. Studierende, Quereinsteiger, alle willkommen.',
    url: 'https://alltagsengel.care/karriere',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Alltagsengel — Werde Alltagsbegleiter' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Werde Alltagsengel — 20 €/Stunde, flexible Zeiten',
    description: 'Sinnvoller Nebenjob als Alltagsbegleiter in Frankfurt & Rhein-Main. Jetzt bewerben!',
    images: ['/og-image.png'],
  },
  alternates: { canonical: 'https://alltagsengel.care/karriere' },
}

const FAQS = [
  {
    q: 'Brauche ich eine Pflegeausbildung?',
    a: 'Nein. Alltagsbegleitung ist keine medizinische Pflege. Sie helfen bei alltäglichen Aufgaben wie Einkaufen, Arztbegleitung oder Gesellschaft leisten. Empathie und Zuverlässigkeit zählen mehr als Zertifikate. Eine §45a-Qualifikation ist von Vorteil, aber keine Voraussetzung.',
  },
  {
    q: 'Wer kann sich bewerben?',
    a: 'Alle, die gerne mit Menschen arbeiten: Studierende, Quereinsteiger, Berufserfahrene, Menschen im Ruhestand — Alter, Herkunft und Vorberuf spielen keine Rolle. Wichtig sind Zuverlässigkeit, Empathie und Deutschkenntnisse (mind. B2).',
  },
  {
    q: 'Wie viel verdiene ich als Alltagsengel?',
    a: 'Sie erhalten 20 € pro Stunde. Die Abrechnung erfolgt transparent über die Alltagsengel-App. Sie bestimmen selbst, wie viele Stunden pro Woche Sie arbeiten möchten.',
  },
  {
    q: 'Kann ich mir die Zeiten selbst einteilen?',
    a: 'Ja, vollständig. Sie legen in der App fest, an welchen Tagen und zu welchen Uhrzeiten Sie verfügbar sind. Es gibt keine Mindestarbeitszeit und keine Schichtpflicht.',
  },
  {
    q: 'Ist das ein Minijob oder eine Festanstellung?',
    a: 'Beides ist möglich. Viele Engel starten als Minijobber (bis 538 €/Monat). Je nach Verfügbarkeit können Sie auch mehr Stunden übernehmen.',
  },
  {
    q: 'Was ist eine §45a-Qualifikation?',
    a: 'Die Qualifikation nach §45a SGB XI befähigt Sie zur anerkannten Alltagsbegleitung. Die Schulung umfasst ca. 40 Stunden und wird von uns unterstützt. Sie ist von Vorteil, aber keine Pflicht für den Einstieg.',
  },
  {
    q: 'Wie läuft die Bewerbung ab?',
    a: 'Füllen Sie das Formular auf dieser Seite aus oder schreiben Sie uns per WhatsApp. Nach einem kurzen Kennenlerngespräch können Sie direkt starten.',
  },
  {
    q: 'Bin ich versichert während der Einsätze?',
    a: 'Ja. Alle Einsätze über Alltagsengel sind haftpflichtversichert. Sie sind während Ihrer Tätigkeit abgesichert.',
  },
]

// HINWEIS: Das JobPosting-JSON-LD wurde entfernt — dieselbe Stelle ist bereits
// auf /jobs (app/jobs/page.tsx) ausgezeichnet. Google-Jobs-Richtlinie verbietet
// mehrfache Postings derselben Stelle unter verschiedenen URLs; /jobs ist die
// kanonische Job-Seite (in SiteHeader + Footer verlinkt). FAQ-Schema bleibt.

const jsonLdFAQ = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function KarrierePage() {
  return (
    <div className="screen" id="engel-werden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }} />
      <BreadcrumbSchema items={[{ name: 'Karriere' }]} />

      {/* ── Sticky CTA Bar ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
        background: 'linear-gradient(180deg, transparent 0%, rgba(20,18,16,0.95) 30%, #141210 100%)',
        padding: '20px 16px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, color: '#C9963C', fontWeight: 600, marginBottom: 8 }}>
          20 €/Stunde · Flexible Zeiten · Für alle mit Herz
        </div>
        <a href="https://wa.me/4915510445517?text=Hallo%2C%20ich%20interessiere%20mich%20f%C3%BCr%20die%20T%C3%A4tigkeit%20als%20Alltagsengel." target="_blank" rel="noopener noreferrer" className="btn-gold" style={{ width: '100%', maxWidth: 340, fontSize: 16, padding: '14px 0' }}>
          JETZT PER WHATSAPP BEWERBEN
        </a>
      </div>

      {/* ── HERO ── */}
      <div className="sp-glow"></div>
      <div className="sp-inner">
        <div style={{ marginBottom: 20 }}>
          <div style={{
            width: 100, height: 100, borderRadius: '50%', margin: '0 auto',
            background: 'linear-gradient(135deg, rgba(201,150,60,0.15), rgba(201,150,60,0.05))',
            border: '2px solid rgba(201,150,60,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 48 48" width="48" height="48" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <circle cx="24" cy="14" r="8" />
              <path d="M8 42c0-8.8 7.2-16 16-16s16 7.2 16 16" />
              <path d="M24 30v6M21 33h6" />
            </svg>
          </div>
        </div>
        <h1 className="sp-word" style={{ fontSize: 22, letterSpacing: '.06em' }}>WERDE ALLTAGSENGEL</h1>
        <p className="sp-tag">Flexibler Nebenjob mit Sinn</p>
        <p className="sp-ug">Frankfurt · Rhein-Main · 20 €/Stunde</p>
        <div className="gold-div"></div>
        <div className="sp-btns">
          <a href="https://wa.me/4915510445517?text=Hallo%2C%20ich%20interessiere%20mich%20f%C3%BCr%20die%20T%C3%A4tigkeit%20als%20Alltagsengel." target="_blank" rel="noopener noreferrer" className="btn-gold">JETZT BEWERBEN</a>
          <Link href="#formular" className="btn-ghost">Bewerbungsformular ausfüllen</Link>
        </div>
      </div>

      {/* ── Trust Row ── */}
      <div className="sp-trust">
        <div className="trust-row">
          <div className="trust-item"><div className="trust-val">20 €</div><div className="trust-lbl">pro Stunde</div></div>
          <div className="trust-sep"></div>
          <div className="trust-item"><div className="trust-val">Flexibel</div><div className="trust-lbl">Zeiteinteilung</div></div>
          <div className="trust-sep"></div>
          <div className="trust-item"><div className="trust-val">Für alle</div><div className="trust-lbl">mit Herz</div></div>
        </div>
      </div>

      {/* ── Content Sections ── */}
      <div className="lp-sections">

        {/* ─── Intro ─── */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <div className="lp-badge">Dein Job als Alltagsengel</div>
          <h2 className="lp-h2">Menschen begleiten. Flexibel verdienen.</h2>
          <p className="lp-text">
            Als Alltagsengel unterstützt du Menschen mit Pflegegrad bei alltäglichen Aufgaben:
            Einkaufen, Arztbesuche, Spaziergänge, Behördengänge oder einfach Gesellschaft leisten.
            Keine medizinische Pflege — sondern menschliche Nähe und praktische Hilfe.
            Du bestimmst selbst, wann und wie oft du arbeitest.
          </p>
        </section>

        {/* ─── Für alle ─── */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <div className="lp-badge">Für alle — nicht nur Pflegeprofis</div>
          <h2 className="lp-h2">Wer kann Alltagsengel werden?</h2>
          <p className="lp-text">
            Alltagsbegleitung ist keine medizinische Pflege. Du brauchst kein Examen und keine Ausbildung.
            Was zählt: Du bist zuverlässig, empathisch und hast Freude am Umgang mit Menschen.
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 140px), 1fr))',
            gap: 12,
            marginTop: 24,
          }}>
            {[
              { icon: '🎓', label: 'Studierende' },
              { icon: '🔄', label: 'Quereinsteiger' },
              { icon: '🏠', label: 'Eltern in Teilzeit' },
              { icon: '🌿', label: 'Menschen im Ruhestand' },
              { icon: '💼', label: 'Berufserfahrene' },
              { icon: '🌍', label: 'Menschen jeder Herkunft' },
            ].map(p => (
              <div key={p.label} style={{
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 14,
                padding: '18px 12px',
                border: '1px solid rgba(255,255,255,0.06)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{p.icon}</div>
                <div style={{ color: '#F5F0E8', fontSize: 13, fontWeight: 600 }}>{p.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Vorteile ─── */}
        <section className="lp-section">
          <div className="lp-badge">Deine Vorteile</div>
          <h2 className="lp-h2">Warum Alltagsengel?</h2>
          <div className="lp-values">
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <circle cx="20" cy="20" r="14" />
                  <path d="M20 12v8l5 5" />
                </svg>
              </div>
              <h4>Flexible Zeiteinteilung</h4>
              <p>Du bestimmst selbst, an welchen Tagen und zu welchen Zeiten du arbeitest. Kein Schichtplan, keine Mindestarbeitszeit.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <circle cx="20" cy="20" r="14" />
                  <path d="M14 20h12M20 14v12" />
                </svg>
              </div>
              <h4>Faire Bezahlung: 20 €/Stunde</h4>
              <p>Transparenter Stundenlohn. Abrechnung direkt über die App, pünktliche Auszahlung.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M20 35s-13-8-13-18a7 7 0 0 1 13-4 7 7 0 0 1 13 4c0 10-13 18-13 18z" />
                </svg>
              </div>
              <h4>Sinnvolle Arbeit</h4>
              <p>Du machst einen echten Unterschied im Leben von Menschen, die Unterstützung brauchen.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <rect x="8" y="4" width="24" height="32" rx="4" />
                  <circle cx="20" cy="30" r="2" />
                  <path d="M14 8h12" />
                </svg>
              </div>
              <h4>Eigene App</h4>
              <p>Aufträge annehmen, Zeiten erfassen, Verdienst im Blick — alles bequem in der Alltagsengel-App.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M20 4c-7 4-12 4-14 4 0 12 4 22 14 28 10-6 14-16 14-28-2 0-7 0-14-4z" />
                  <path d="M15 20l4 4 7-8" />
                </svg>
              </div>
              <h4>Versicherungsschutz</h4>
              <p>Alle Einsätze über Alltagsengel sind haftpflichtversichert. Du bist abgesichert.</p>
            </div>
          </div>
        </section>

        {/* ─── Tätigkeiten ─── */}
        <section className="lp-section">
          <div className="lp-badge">Deine Aufgaben</div>
          <h2 className="lp-h2">Was du als Alltagsengel machst</h2>
          <p className="lp-text" style={{ marginBottom: 20 }}>
            Du begleitest Menschen mit Pflegegrad bei Alltagsaufgaben —
            unabhängig von deren Alter. Pflegebedürftigkeit betrifft nicht nur die ältere Generation.
          </p>
          <div className="lp-values">
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M8 32h24M12 28v4M28 28v4" />
                  <rect x="10" y="12" width="20" height="16" rx="2" />
                  <path d="M16 12V8a4 4 0 0 1 8 0v4" />
                </svg>
              </div>
              <h4>Einkaufsbegleitung</h4>
              <p>Gemeinsam einkaufen gehen oder Besorgungen erledigen.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <rect x="4" y="12" width="32" height="16" rx="2" />
                  <path d="M8 28v3c0 1 .5 2 2 2h2c1.5 0 2-1 2-2v-3m12 3v3c0 1 .5 2 2 2h2c1.5 0 2-1 2-2v-3M4 18h32" />
                </svg>
              </div>
              <h4>Arztbegleitung</h4>
              <p>Begleitung zu Arztbesuchen, Therapien und medizinischen Terminen.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M20 8c-5 0-10 4-10 10 0 8 10 18 10 18s10-10 10-18c0-6-5-10-10-10z" />
                  <circle cx="20" cy="18" r="4" />
                </svg>
              </div>
              <h4>Spaziergänge &amp; Freizeit</h4>
              <p>Spaziergänge, Ausflüge und gemeinsame Aktivitäten gestalten.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M6 8h28v24H6z" />
                  <path d="M6 14h28M14 8v6" />
                  <path d="M18 20h8M18 26h5" />
                </svg>
              </div>
              <h4>Behördengänge</h4>
              <p>Begleitung zu Ämtern, Formulare ausfüllen, bei Verwaltungsdingen helfen.</p>
            </div>
          </div>
        </section>

        {/* ─── Anforderungen ─── */}
        <section className="lp-section">
          <div className="lp-badge">Was wir erwarten</div>
          <h2 className="lp-h2">Das bringst du mit</h2>
          <div className="lp-values">
            {[
              { title: 'Empathie', desc: 'Einfühlungsvermögen und Freude am Umgang mit Menschen.' },
              { title: 'Zuverlässigkeit', desc: 'Pünktlichkeit und Verlässlichkeit sind das Wichtigste für unsere Klienten.' },
              { title: 'Deutschkenntnisse (mind. B2)', desc: 'Du musst dich sicher auf Deutsch verständigen können.' },
              { title: 'Führungszeugnis', desc: 'Ein erweitertes Führungszeugnis ist erforderlich (kann nach der Bewerbung eingereicht werden).' },
              { title: '§45a-Qualifikation — von Vorteil', desc: 'Die Qualifikation nach §45a SGB XI ist ein Plus, aber keine Voraussetzung. Wir unterstützen dich bei der Schulung.' },
            ].map(item => (
              <div key={item.title} className="lp-value-item" style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
                <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: 'rgba(201,150,60,0.1)', border: '1px solid rgba(201,150,60,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                </div>
                <div>
                  <h4 style={{ marginBottom: 2 }}>{item.title}</h4>
                  <p>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── So funktioniert's ─── */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <div className="lp-badge">In 3 Schritten zum Engel</div>
          <h2 className="lp-h2">So einfach geht&apos;s</h2>
          <div className="lp-steps">
            <div className="lp-step">
              <div className="lp-step-num">1</div>
              <div className="lp-step-text"><strong>Bewerben</strong><br />Formular ausfüllen oder per WhatsApp melden</div>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">2</div>
              <div className="lp-step-text"><strong>Kennenlernen</strong><br />Kurzes Gespräch mit unserem Team</div>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">3</div>
              <div className="lp-step-text"><strong>Loslegen</strong><br />Aufträge annehmen &amp; verdienen</div>
            </div>
          </div>
        </section>

        {/* ─── Kontakt-CTAs: WhatsApp & E-Mail ─── */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <div className="lp-badge">Direkt Kontakt aufnehmen</div>
          <h2 className="lp-h2">Schreib uns — wir antworten schnell</h2>
          <p className="lp-text" style={{ marginBottom: 24 }}>
            Du hast Fragen oder möchtest dich direkt bewerben?
            Melde dich per WhatsApp oder E-Mail — kein Anschreiben nötig, einfach kurz vorstellen.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <a
              href="https://wa.me/4915510445517?text=Hallo%2C%20ich%20interessiere%20mich%20f%C3%BCr%20die%20T%C3%A4tigkeit%20als%20Alltagsengel."
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                width: '100%', maxWidth: 340, padding: '14px 20px',
                borderRadius: 14, background: '#25D366', color: '#fff',
                fontSize: 16, fontWeight: 700, textDecoration: 'none',
                transition: 'opacity 0.2s',
              }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Per WhatsApp bewerben
            </a>
            <a
              href="mailto:info@alltagsengel.care?subject=Bewerbung%20als%20Alltagsengel"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                width: '100%', maxWidth: 340, padding: '14px 20px',
                borderRadius: 14, background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#F5F0E8', fontSize: 16, fontWeight: 600,
                textDecoration: 'none', transition: 'border-color 0.2s',
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 4l-10 8L2 4" />
              </svg>
              info@alltagsengel.care
            </a>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section className="lp-section">
          <div className="lp-badge">Häufige Fragen</div>
          <h2 className="lp-h2">Antworten für Bewerber</h2>
          <div className="lp-faq">
            {FAQS.map((f, i) => (
              <details key={i} className="lp-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ─── Bewerbungsformular ─── */}
        <section className="lp-section" id="formular" style={{ textAlign: 'center' }}>
          <div className="lp-badge">Kein Login nötig</div>
          <h2 className="lp-h2">Interesse? Melde dich unverbindlich.</h2>
          <p className="lp-text" style={{ marginBottom: 24 }}>
            Hinterlasse deine Kontaktdaten — wir melden uns bei dir.
            Kein Anschreiben, kein Lebenslauf, keine Verpflichtung.
          </p>
          <EngelBewerbungForm />
        </section>

        {/* ─── CTA ─── */}
        <section className="lp-section lp-cta-section">
          <h2 className="lp-h2">Bereit, Alltagsengel zu werden?</h2>
          <p className="lp-text">
            Egal ob Student, Quereinsteiger oder Profi — bei uns bist du willkommen.
            Bewirb dich jetzt und starte als Alltagsbegleiter in Frankfurt und dem Rhein-Main-Gebiet.
          </p>
          <div className="sp-btns" style={{ marginTop: 20 }}>
            <a href="https://wa.me/4915510445517?text=Hallo%2C%20ich%20interessiere%20mich%20f%C3%BCr%20die%20T%C3%A4tigkeit%20als%20Alltagsengel." target="_blank" rel="noopener noreferrer" className="btn-gold">JETZT PER WHATSAPP BEWERBEN</a>
          </div>
        </section>

        {/* Spacer for sticky CTA bar */}
        <div style={{ height: 100 }} />

        {/* ─── Footer ─── */}
        {/* Footer kommt global aus components/SiteFooter.tsx (LayoutWrapper) */}
      </div>
    </div>
  )
}
