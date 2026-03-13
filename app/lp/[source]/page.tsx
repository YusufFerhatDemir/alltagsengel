import type { Metadata } from 'next'
import Link from 'next/link'

/* ──────────────────────────────────────────────
   Platform-specific landing page content
   ────────────────────────────────────────────── */

const platformData: Record<string, {
  headline: string
  subline: string
  description: string
  features: { icon: string; title: string; text: string }[]
  cta: string
  ctaSub: string
  trustBadge: string
  metaTitle: string
  metaDesc: string
}> = {
  facebook: {
    headline: 'Liebevolle Alltagshilfe für Ihre Familie',
    subline: 'Premium Alltagsbegleitung in Frankfurt — zuverlässig, versichert, persönlich.',
    description: 'Ob Einkauf, Arztbegleitung oder Behördengang — unsere zertifizierten Alltagsengel sind für Ihre Liebsten da. Abrechnung direkt über die Pflegekasse.',
    features: [
      { icon: '🛡️', title: '100% Versichert', text: 'Jeder Einsatz ist vollständig abgesichert.' },
      { icon: '💶', title: '131€/Monat inklusive', text: 'Über §45b SGB XI — kein eigenes Geld nötig.' },
      { icon: '📍', title: 'In Ihrer Nähe', text: 'Engel direkt in Ihrem Frankfurter Stadtteil.' },
      { icon: '📱', title: 'Einfache Buchung', text: 'Per App oder Telefon — so wie Sie möchten.' },
    ],
    cta: 'Jetzt kostenlos registrieren',
    ctaSub: 'Keine Kreditkarte · Keine versteckten Kosten',
    trustBadge: 'Über 131€/Monat für Alltagshilfe — Sie zahlen nichts selbst!',
    metaTitle: 'Alltagsengel — Liebevolle Alltagshilfe in Frankfurt',
    metaDesc: 'Zertifizierte Alltagsbegleiter für Ihre Familie. 131€/Monat über die Pflegekasse. Jetzt kostenlos registrieren.',
  },
  instagram: {
    headline: 'Die App für Alltagsbegleitung',
    subline: 'Finde zertifizierte Alltagsengel in Frankfurt — direkt über die App buchen.',
    description: 'Alltagsengel verbindet pflegebedürftige Menschen mit liebevollen Begleitern. Einkauf, Arztbesuche, Spaziergänge — alles über die Pflegekasse abgedeckt.',
    features: [
      { icon: '✨', title: 'Matching', text: 'Der perfekte Engel für deine Bedürfnisse.' },
      { icon: '📅', title: 'Flexibel buchen', text: 'Termine direkt in der App vereinbaren.' },
      { icon: '💳', title: 'Kostenlos nutzbar', text: '131€/Monat über §45b — du zahlst nichts.' },
      { icon: '⭐', title: 'Bewertungen', text: 'Echte Erfahrungen von echten Familien.' },
    ],
    cta: 'App entdecken',
    ctaSub: '100% kostenlos · Frankfurt & Umgebung',
    trustBadge: 'Premium Alltagsbegleitung — jetzt in Frankfurt verfügbar',
    metaTitle: 'Alltagsengel App — Alltagsbegleitung buchen in Frankfurt',
    metaDesc: 'Zertifizierte Alltagsbegleiter per App buchen. 131€/Monat über die Pflegekasse. Jetzt entdecken.',
  },
  tiktok: {
    headline: 'Premium Alltagshilfe für deine Familie',
    subline: 'Deine Oma verdient das Beste. Alltagsengel macht\'s möglich.',
    description: 'Einkaufen, zum Arzt begleiten, Papierkram erledigen — unsere Engel kümmern sich. Und das Beste: Die Pflegekasse zahlt 131€/Monat dafür.',
    features: [
      { icon: '💪', title: 'Echte Hilfe', text: 'Nicht nur reden — wir machen.' },
      { icon: '🆓', title: 'Kostenlos', text: 'Pflegekasse zahlt bis 131€/Monat.' },
      { icon: '📍', title: 'Frankfurt', text: 'Engel in deinem Stadtteil.' },
      { icon: '⚡', title: 'Schnell gebucht', text: 'App öffnen, Engel finden, fertig.' },
    ],
    cta: 'Jetzt Engel finden',
    ctaSub: 'Kostenlos · In 2 Minuten gebucht',
    trustBadge: '131€/Monat von der Pflegekasse — du zahlst 0€',
    metaTitle: 'Alltagsengel — Alltagshilfe die nichts kostet',
    metaDesc: 'Premium Alltagsbegleitung für Senioren in Frankfurt. 131€/Monat über die Pflegekasse. Jetzt kostenlos buchen.',
  },
  google: {
    headline: 'Alltagsbegleitung in Frankfurt buchen',
    subline: 'Zertifizierte Alltagsbegleiter nach §45b SGB XI — 131€/Monat über die Pflegekasse.',
    description: 'Alltagsengel vermittelt professionelle Alltagsbegleiter für Senioren und Pflegebedürftige in Frankfurt. Einkaufsservice, Arztbegleitung, Behördengänge — alles versichert und über den Entlastungsbetrag abrechenbar.',
    features: [
      { icon: '✅', title: '§45b zertifiziert', text: 'Offizielle Anerkennung nach SGB XI.' },
      { icon: '💶', title: '131€ Entlastungsbetrag', text: 'Monatlich über die Pflegekasse abrechnen.' },
      { icon: '🏥', title: 'Umfassende Leistungen', text: 'Einkauf, Arzt, Behörden, Begleitung.' },
      { icon: '📍', title: 'Frankfurt am Main', text: 'PLZ 60318–60433 und Umgebung.' },
    ],
    cta: 'Kostenlos registrieren',
    ctaSub: 'Keine Wartezeit · Sofort verfügbar',
    trustBadge: 'Nr. 1 Premium-Alltagsbegleitung in Frankfurt',
    metaTitle: 'Alltagsbegleitung Frankfurt — §45b Alltagsengel buchen',
    metaDesc: 'Zertifizierte Alltagsbegleiter in Frankfurt. 131€/Monat über §45b SGB XI. Einkauf, Arztbegleitung, Behördengänge. Jetzt kostenlos registrieren.',
  },
}

/* ──────────────────────────────────────────────
   Metadata
   ────────────────────────────────────────────── */
type Props = { params: Promise<{ source: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { source } = await params
  const data = platformData[source] || platformData.google
  return {
    title: data.metaTitle,
    description: data.metaDesc,
    openGraph: {
      title: data.metaTitle,
      description: data.metaDesc,
      url: `https://alltagsengel.care/lp/${source}`,
      siteName: 'Alltagsengel.care',
      locale: 'de_DE',
      type: 'website',
    },
    robots: { index: true, follow: true },
  }
}

export function generateStaticParams() {
  return [
    { source: 'facebook' },
    { source: 'instagram' },
    { source: 'tiktok' },
    { source: 'google' },
  ]
}

/* ──────────────────────────────────────────────
   Landing Page Component
   ────────────────────────────────────────────── */
export default async function LandingPage({ params }: Props) {
  const { source } = await params
  const data = platformData[source] || platformData.google

  return (
    <div style={styles.page}>
      {/* Hero */}
      <header style={styles.hero}>
        <div style={styles.heroInner}>
          <div style={styles.logoRow}>
            <div style={styles.halo}>😇</div>
            <span style={styles.logoText}>ALLTAGSENGEL</span>
          </div>
          <h1 style={styles.h1}>{data.headline}</h1>
          <p style={styles.subline}>{data.subline}</p>
          <Link href={`/choose?utm_source=${source}&utm_medium=ad&utm_campaign=coming_soon`}>
            <button style={styles.ctaBtn}>{data.cta}</button>
          </Link>
          <p style={styles.ctaSub}>{data.ctaSub}</p>
        </div>
      </header>

      {/* Trust Banner */}
      <div style={styles.trustBanner}>
        <span style={styles.trustText}>{data.trustBadge}</span>
      </div>

      {/* Description */}
      <section style={styles.section}>
        <p style={styles.desc}>{data.description}</p>
      </section>

      {/* Features */}
      <section style={styles.section}>
        <h2 style={styles.h2}>Warum Alltagsengel?</h2>
        <div style={styles.featureGrid}>
          {data.features.map((f, i) => (
            <div key={i} style={styles.featureCard}>
              <div style={styles.featureIcon}>{f.icon}</div>
              <h3 style={styles.featureTitle}>{f.title}</h3>
              <p style={styles.featureText}>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{...styles.section, ...styles.howSection}}>
        <h2 style={styles.h2}>So einfach geht&apos;s</h2>
        <div style={styles.steps}>
          {[
            { num: '1', title: 'Registrieren', text: 'Kostenlos in 2 Minuten' },
            { num: '2', title: 'Engel finden', text: 'Nach PLZ & Leistung filtern' },
            { num: '3', title: 'Buchen & genießen', text: 'Direkt über die Pflegekasse' },
          ].map((s, i) => (
            <div key={i} style={styles.step}>
              <div style={styles.stepNum}>{s.num}</div>
              <div>
                <div style={styles.stepTitle}>{s.title}</div>
                <div style={styles.stepText}>{s.text}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section style={styles.section}>
        <h2 style={styles.h2}>Unsere Leistungen</h2>
        <div style={styles.serviceList}>
          {[
            'Einkaufsservice', 'Arztbegleitung', 'Behördengänge',
            'Spaziergänge', 'Gesellschaft', 'Haushaltshilfe',
            'Fahrdienst', 'Notfallhilfe',
          ].map((s, i) => (
            <div key={i} style={styles.serviceTag}>{s}</div>
          ))}
        </div>
      </section>

      {/* Frankfurt PLZ */}
      <section style={{...styles.section, textAlign: 'center' as const}}>
        <h2 style={styles.h2}>Verfügbar in Frankfurt</h2>
        <p style={styles.plzText}>
          PLZ 60318 · 60320 · 60321 · 60323 · 60385 · 60389 · 60431 · 60433
        </p>
        <p style={{...styles.desc, marginTop: 8, fontSize: 14, opacity: 0.7}}>
          Und bald in ganz Frankfurt & Rhein-Main
        </p>
      </section>

      {/* Final CTA */}
      <section style={styles.finalCta}>
        <h2 style={{...styles.h2, color: '#1A1612'}}>Bereit loszulegen?</h2>
        <p style={{...styles.desc, color: '#1A1612', opacity: 0.8}}>
          Registrieren Sie sich kostenlos und finden Sie Ihren Alltagsengel.
        </p>
        <Link href={`/choose?utm_source=${source}&utm_medium=ad&utm_campaign=coming_soon`}>
          <button style={styles.ctaBtnDark}>{data.cta}</button>
        </Link>
        <div style={styles.contactRow}>
          <a href="mailto:info@alltagsengel.care" style={styles.contactLink}>
            ✉️ info@alltagsengel.care
          </a>
          <a href="https://alltagsengel.care" style={styles.contactLink}>
            🌐 alltagsengel.care
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <p>© 2026 Alltagsengel.care — Premium Alltagsbegleitung</p>
        <div style={styles.footerLinks}>
          <Link href="/impressum" style={styles.footerLink}>Impressum</Link>
          <Link href="/datenschutz" style={styles.footerLink}>Datenschutz</Link>
          <Link href="/agb" style={styles.footerLink}>AGB</Link>
        </div>
      </footer>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Inline Styles (no phone frame, full-width)
   ────────────────────────────────────────────── */
const gold = '#C9963C'
const coal = '#1A1612'
const ink = '#F7F2EA'
const ink2 = '#C4B8A8'

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${coal} 0%, #0D0B08 100%)`,
    color: ink,
    fontFamily: "'Jost', 'Segoe UI', sans-serif",
    overflowX: 'hidden',
    width: '100%',
    maxWidth: '100vw',
  },
  hero: {
    background: `linear-gradient(135deg, ${coal} 0%, #2A2418 50%, ${coal} 100%)`,
    padding: '60px 24px 48px',
    textAlign: 'center',
    borderBottom: `2px solid ${gold}`,
  },
  heroInner: { maxWidth: 640, margin: '0 auto' },
  logoRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 },
  halo: { fontSize: 40 },
  logoText: { fontSize: 24, fontWeight: 700, letterSpacing: 3, color: gold },
  h1: { fontSize: 32, fontWeight: 700, lineHeight: 1.2, marginBottom: 12, color: ink },
  subline: { fontSize: 16, color: ink2, lineHeight: 1.5, marginBottom: 28, maxWidth: 500, margin: '0 auto 28px' },
  ctaBtn: {
    background: `linear-gradient(135deg, ${gold}, #DBA84A)`,
    color: coal,
    border: 'none',
    padding: '16px 40px',
    borderRadius: 12,
    fontSize: 17,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 0.5,
    boxShadow: `0 4px 20px rgba(201,150,60,0.4)`,
  },
  ctaSub: { fontSize: 13, color: ink2, marginTop: 12, opacity: 0.7 },
  trustBanner: {
    background: `linear-gradient(90deg, rgba(201,150,60,0.15), rgba(201,150,60,0.05))`,
    borderBottom: '1px solid rgba(201,150,60,0.2)',
    padding: '14px 24px',
    textAlign: 'center',
  },
  trustText: { fontSize: 14, fontWeight: 600, color: gold },
  section: { maxWidth: 640, margin: '0 auto', padding: '40px 24px' },
  h2: { fontSize: 24, fontWeight: 700, color: gold, marginBottom: 20, textAlign: 'center' as const },
  desc: { fontSize: 16, lineHeight: 1.6, color: ink2, textAlign: 'center' as const },
  featureGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 16,
  },
  featureCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(201,150,60,0.15)',
    borderRadius: 16,
    padding: '24px 16px',
    textAlign: 'center',
  },
  featureIcon: { fontSize: 32, marginBottom: 8 },
  featureTitle: { fontSize: 15, fontWeight: 700, color: ink, marginBottom: 4 },
  featureText: { fontSize: 13, color: ink2, lineHeight: 1.4 },
  howSection: { borderTop: '1px solid rgba(255,255,255,0.06)' },
  steps: { display: 'flex', flexDirection: 'column', gap: 20 },
  step: { display: 'flex', alignItems: 'center', gap: 16 },
  stepNum: {
    width: 44, height: 44, borderRadius: '50%',
    background: `linear-gradient(135deg, ${gold}, #DBA84A)`,
    color: coal, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, fontWeight: 700, flexShrink: 0,
  },
  stepTitle: { fontSize: 16, fontWeight: 700, color: ink },
  stepText: { fontSize: 14, color: ink2 },
  serviceList: {
    display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center',
  },
  serviceTag: {
    background: 'rgba(201,150,60,0.1)',
    border: '1px solid rgba(201,150,60,0.25)',
    borderRadius: 20,
    padding: '8px 18px',
    fontSize: 14,
    color: gold,
    fontWeight: 500,
  },
  plzText: { fontSize: 16, color: ink, fontWeight: 600, letterSpacing: 1 },
  finalCta: {
    background: `linear-gradient(135deg, ${gold}, #DBA84A)`,
    padding: '48px 24px',
    textAlign: 'center',
    margin: '20px 0 0',
  },
  ctaBtnDark: {
    background: coal,
    color: gold,
    border: 'none',
    padding: '16px 40px',
    borderRadius: 12,
    fontSize: 17,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 16,
  },
  contactRow: { display: 'flex', justifyContent: 'center', gap: 24, marginTop: 20, flexWrap: 'wrap' },
  contactLink: { color: coal, fontSize: 14, textDecoration: 'none', fontWeight: 600 },
  footer: {
    background: coal,
    borderTop: `1px solid rgba(201,150,60,0.15)`,
    padding: '24px',
    textAlign: 'center',
    fontSize: 13,
    color: ink2,
  },
  footerLinks: { display: 'flex', justifyContent: 'center', gap: 20, marginTop: 8 },
  footerLink: { color: ink2, textDecoration: 'none', fontSize: 13 },
}
