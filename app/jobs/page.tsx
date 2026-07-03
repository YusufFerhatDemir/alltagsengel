import type { Metadata } from 'next'
import Link from 'next/link'
import CookieSettingsLink from '@/components/CookieSettingsLink'
import EngelBewerbungForm from '@/components/EngelBewerbungForm'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

// WhatsApp-Recruiting-Nummer (identisch zur Karriere-Seite)
const WA_BEWERBUNG =
  'https://wa.me/4915510445517?text=Hallo%2C%20ich%20m%C3%B6chte%20mich%20als%20Alltagsengel%20bewerben.'

export const metadata: Metadata = {
  title: 'Jobs — Werde Teil des Alltagsengel-Teams | Frankfurt & Rhein-Main',
  description:
    'Jobs bei Alltagsengel: flexible Arbeitszeiten, kein Wochenenddienst, eigener Dienstwagen möglich, Wunschfrei-Tag, 20/30/40 Std. wählbar, Fort- und Weiterbildungen. Bewirb dich in 2 Minuten per WhatsApp.',
  keywords: [
    'jobs alltagsbegleitung frankfurt',
    'stellenangebot seniorenbetreuung',
    'hauswirtschaftskraft job rhein-main',
    'betreuungskraft gesucht frankfurt',
    'dienstwagen pflege job',
    'kein wochenenddienst pflege',
    'teilzeit job betreuung',
    'quereinsteiger betreuung',
    'alltagsbegleiter bewerben',
    'job mit dienstwagen frankfurt',
  ],
  openGraph: {
    title: 'Werde Teil des Alltagsengel-Teams',
    description:
      'Flexible Arbeitszeiten, kein Wochenenddienst, eigener Dienstwagen möglich, 20/30/40 Std. wählbar. Jetzt in 2 Minuten per WhatsApp bewerben.',
    url: 'https://alltagsengel.care/jobs',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Alltagsengel — Jobs & Karriere' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Werde Teil des Alltagsengel-Teams',
    description: 'Flexible Zeiten, kein Wochenenddienst, Dienstwagen möglich. Bewirb dich in 2 Minuten.',
    images: ['/og-image.png'],
  },
  alternates: { canonical: 'https://alltagsengel.care/jobs' },
}

const BENEFITS = [
  {
    title: 'Flexible Arbeitszeiten',
    desc: 'Du bestimmst, wann du arbeitest. Kein starrer Schichtplan — deine Einsätze passen zu deinem Leben.',
  },
  {
    title: 'Kein Wochenenddienst',
    desc: 'Samstag und Sonntag gehören dir und deiner Familie. Wir planen von Montag bis Freitag.',
  },
  {
    title: 'Eigener Dienstwagen möglich',
    desc: 'Für deine Touren stellen wir dir bei Bedarf ein Fahrzeug — auch zur privaten Nutzung verhandelbar.',
  },
  {
    title: 'Dein Wunschfrei-Tag',
    desc: 'Ein fester freier Tag pro Woche nach deiner Wahl — verlässlich in der Planung berücksichtigt.',
  },
  {
    title: '20 / 30 / 40 Std. wählbar',
    desc: 'Minijob, Teilzeit oder Vollzeit — du entscheidest, wie viel du arbeiten möchtest.',
  },
  {
    title: 'Fort- und Weiterbildungen',
    desc: 'Wir fördern deine Qualifikation, z. B. die Betreuungskraft-Schulung nach §45a/§53c SGB XI.',
  },
]

const MITBRINGEN = [
  { title: 'Eine gute Seele', desc: 'Du hörst zu, packst mit an und begegnest Menschen mit Wärme und Geduld.' },
  { title: 'Zuverlässigkeit', desc: 'Unsere Klientinnen und Klienten verlassen sich auf dich — Pünktlichkeit ist alles.' },
  { title: 'Deutschkenntnisse', desc: 'Du kannst dich gut auf Deutsch verständigen (ca. B2). Weitere Sprachen sind ein Plus.' },
  { title: 'Führerschein von Vorteil', desc: 'Für Touren und Begleitfahrten hilfreich — aber keine zwingende Voraussetzung.' },
  { title: 'Keine Ausbildung nötig', desc: 'Quereinsteiger sind herzlich willkommen. Das Handwerk bringen wir dir bei.' },
]

const jsonLdJobPosting = {
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: 'Alltagsbegleiter / Betreuungskraft (m/w/d) — flexibel, kein Wochenenddienst',
  description:
    'Werde Teil des Alltagsengel-Teams: Begleite Menschen mit Pflegegrad im Alltag — Einkaufen, Arztbegleitung, Spaziergänge, Gesellschaft. Flexible Arbeitszeiten, kein Wochenenddienst, eigener Dienstwagen möglich, Wunschfrei-Tag, 20/30/40 Std./Woche wählbar, Fort- und Weiterbildungen. Quereinsteiger willkommen.',
  datePosted: '2026-07-03',
  validThrough: '2026-12-31',
  employmentType: ['PART_TIME', 'FULL_TIME'],
  hiringOrganization: {
    '@type': 'Organization',
    name: 'Alltagsengel',
    sameAs: 'https://alltagsengel.care',
    logo: 'https://alltagsengel.care/icon-512x512.png',
  },
  jobLocation: {
    '@type': 'Place',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Frankfurt am Main',
      addressRegion: 'Hessen',
      addressCountry: 'DE',
    },
  },
  baseSalary: {
    '@type': 'MonetaryAmount',
    currency: 'EUR',
    value: { '@type': 'QuantitativeValue', value: 20, unitText: 'HOUR' },
  },
  qualifications:
    'Keine Ausbildung erforderlich, Quereinsteiger willkommen. Zuverlässigkeit, Empathie und Deutschkenntnisse (ca. B2). Führerschein von Vorteil.',
  industry: 'Sozialwesen / Alltagsbegleitung',
  applicantLocationRequirements: { '@type': 'Country', name: 'Germany' },
}

export default function JobsPage() {
  return (
    <div className="screen" id="jobs">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdJobPosting) }} />
      <BreadcrumbSchema items={[{ name: 'Jobs' }]} />

      {/* ── Sticky CTA Bar ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
        background: 'linear-gradient(180deg, transparent 0%, rgba(20,18,16,0.95) 30%, #141210 100%)',
        padding: '20px 16px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, color: '#C9963C', fontWeight: 600, marginBottom: 8 }}>
          Flexibel · Kein Wochenenddienst · Bewerbung in 2 Minuten
        </div>
        <a href={WA_BEWERBUNG} target="_blank" rel="noopener noreferrer">
          <button className="btn-gold" style={{ width: '100%', maxWidth: 340, fontSize: 16, padding: '14px 0' }}>
            JETZT PER WHATSAPP BEWERBEN
          </button>
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
        <h1 className="sp-word" style={{ fontSize: 21, letterSpacing: '.05em' }}>WERDE TEIL DES TEAMS</h1>
        <p className="sp-tag">Ein Job mit Sinn — und mit echten Vorteilen</p>
        <p className="sp-ug">Frankfurt · Rhein-Main · flexibel</p>
        <div className="gold-div"></div>
        <div className="sp-btns">
          <a href={WA_BEWERBUNG} target="_blank" rel="noopener noreferrer">
            <button className="btn-gold">IN 2 MINUTEN BEWERBEN</button>
          </a>
          <Link href="#formular">
            <button className="btn-ghost">Lieber per Formular bewerben</button>
          </Link>
        </div>
      </div>

      {/* ── Trust Row ── */}
      <div className="sp-trust">
        <div className="trust-row">
          <div className="trust-item"><div className="trust-val">Flexibel</div><div className="trust-lbl">Zeiteinteilung</div></div>
          <div className="trust-sep"></div>
          <div className="trust-item"><div className="trust-val">Mo–Fr</div><div className="trust-lbl">kein Wochenende</div></div>
          <div className="trust-sep"></div>
          <div className="trust-item"><div className="trust-val">Dienstwagen</div><div className="trust-lbl">möglich</div></div>
        </div>
      </div>

      <div className="lp-sections">

        {/* ─── Intro ─── */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <div className="lp-badge">Deine Karriere bei Alltagsengel</div>
          <h2 className="lp-h2">Menschen begleiten. Fair verdienen. Frei einteilen.</h2>
          <p className="lp-text">
            Als Alltagsengel unterstützt du Menschen mit Pflegegrad in ihrem Zuhause:
            beim Einkaufen, bei Arztbesuchen, auf Spaziergängen oder einfach mit Gesellschaft.
            Keine medizinische Pflege — sondern Nähe, Verlässlichkeit und praktische Hilfe.
            Bei uns bekommst du dafür Rahmenbedingungen, die zu deinem Leben passen.
          </p>
        </section>

        {/* ─── Benefits ─── */}
        <section className="lp-section">
          <div className="lp-badge">Deine Vorteile</div>
          <h2 className="lp-h2">Was wir dir bieten</h2>
          <div className="lp-values">
            {BENEFITS.map(b => (
              <div key={b.title} className="lp-value-item" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, textAlign: 'left' }}>
                <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: 'rgba(201,150,60,0.1)', border: '1px solid rgba(201,150,60,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                </div>
                <div>
                  <h4 style={{ marginBottom: 2 }}>{b.title}</h4>
                  <p>{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── WhatsApp-Bewerbung ─── */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <div className="lp-badge">Bewerbung in 2 Minuten</div>
          <h2 className="lp-h2">Kein Anschreiben, kein Lebenslauf</h2>
          <p className="lp-text" style={{ marginBottom: 24 }}>
            Schreib uns einfach kurz per WhatsApp, wer du bist. Wir melden uns schnell zurück
            und lernen uns in einem lockeren Gespräch kennen. So einfach ist der erste Schritt.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <a
              href={WA_BEWERBUNG}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                width: '100%', maxWidth: 340, padding: '14px 20px',
                borderRadius: 14, background: '#25D366', color: '#fff',
                fontSize: 16, fontWeight: 700, textDecoration: 'none',
              }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Per WhatsApp bewerben
            </a>
            <a
              href="mailto:info@alltagsengel.care?subject=Bewerbung%20bei%20Alltagsengel"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                width: '100%', maxWidth: 340, padding: '14px 20px',
                borderRadius: 14, background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#F5F0E8', fontSize: 16, fontWeight: 600, textDecoration: 'none',
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

        {/* ─── Was du mitbringen solltest ─── */}
        <section className="lp-section">
          <div className="lp-badge">Was du mitbringen solltest</div>
          <h2 className="lp-h2">Viel Herz — der Rest kommt von uns</h2>
          <div className="lp-values">
            {MITBRINGEN.map(item => (
              <div key={item.title} className="lp-value-item" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, textAlign: 'left' }}>
                <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: 'rgba(201,150,60,0.1)', border: '1px solid rgba(201,150,60,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z" />
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
          <div className="lp-badge">In 3 Schritten zum Job</div>
          <h2 className="lp-h2">So einfach geht&apos;s</h2>
          <div className="lp-steps">
            <div className="lp-step">
              <div className="lp-step-num">1</div>
              <div className="lp-step-text"><strong>Melden</strong><br />Per WhatsApp oder Formular kurz vorstellen</div>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">2</div>
              <div className="lp-step-text"><strong>Kennenlernen</strong><br />Lockeres Gespräch mit unserem Team</div>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">3</div>
              <div className="lp-step-text"><strong>Loslegen</strong><br />Einsätze übernehmen &amp; verdienen</div>
            </div>
          </div>
        </section>

        {/* ─── Bewerbungsformular ─── */}
        <section className="lp-section" id="formular" style={{ textAlign: 'center' }}>
          <div className="lp-badge">Kein Login nötig</div>
          <h2 className="lp-h2">Lieber schriftlich? Melde dich hier.</h2>
          <p className="lp-text" style={{ marginBottom: 24 }}>
            Hinterlasse deine Kontaktdaten — wir melden uns bei dir.
            Kein Anschreiben, kein Lebenslauf, keine Verpflichtung.
          </p>
          <EngelBewerbungForm />
        </section>

        {/* ─── CTA ─── */}
        <section className="lp-section lp-cta-section">
          <h2 className="lp-h2">Bereit für einen Job mit Sinn?</h2>
          <p className="lp-text">
            Ob Quereinsteiger, Wiedereinsteigerin oder erfahrene Betreuungskraft —
            bei Alltagsengel bist du willkommen. Wir freuen uns auf dich.
          </p>
          <div className="sp-btns" style={{ marginTop: 20 }}>
            <a href={WA_BEWERBUNG} target="_blank" rel="noopener noreferrer">
              <button className="btn-gold">JETZT PER WHATSAPP BEWERBEN</button>
            </a>
          </div>
        </section>

        {/* Spacer für Sticky CTA Bar */}
        <div style={{ height: 100 }} />

        {/* ─── Footer ─── */}
        <footer className="lp-footer">
          <div className="lp-footer-brand">ALLTAGSENGEL</div>
          <div className="lp-footer-sub">Pflege-Box &amp; Krankenfahrt &amp; Alltagsbegleitung · Frankfurt &amp; Rhein-Main</div>
          <div className="lp-footer-links">
            <Link href="/hygienebox">Pflege-Box</Link>
            <Link href="/krankenfahrten">Krankenfahrt</Link>
            <Link href="/alltagsbegleitung">Alltagsbegleitung</Link>
            <Link href="/team">Team</Link>
            <Link href="/finanzierung">Finanzierung</Link>
            <Link href="/blog">Ratgeber</Link>
            <Link href="/kontakt">Kontakt</Link>
          </div>
          <div className="lp-footer-links" style={{ marginTop: 4 }}>
            <Link href="/impressum">Impressum</Link>
            <Link href="/datenschutz">Datenschutz</Link>
            <Link href="/agb">AGB</Link>
            <CookieSettingsLink />
          </div>
          <div className="lp-footer-copy">
            © 2026 Alltagsengel UG (haftungsbeschränkt) — Frankfurt am Main
          </div>
        </footer>
      </div>
    </div>
  )
}
