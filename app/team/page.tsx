import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Unser Team — Die Menschen hinter Alltagsengel | Frankfurt',
  description:
    'Lernen Sie das Team von Alltagsengel kennen: Geschäftsführung, Kundenbetreuung, Tourenplanung, Qualität und Pflegeberatung. Echte Ansprechpartner für Alltagsbegleitung, Pflegebox und Krankenfahrten im Rhein-Main-Gebiet.',
  alternates: { canonical: 'https://alltagsengel.care/team' },
  openGraph: {
    title: 'Unser Team — Alltagsengel',
    description:
      'Die Menschen hinter Alltagsengel: Geschäftsführung, Kundenbetreuung, Tourenplanung, Qualität und Pflegeberatung.',
    url: 'https://alltagsengel.care/team',
    type: 'website',
  },
}

const teamPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  '@id': 'https://alltagsengel.care/team#team',
  name: 'Team von Alltagsengel',
  url: 'https://alltagsengel.care/team',
  inLanguage: 'de-DE',
  isPartOf: { '@id': 'https://alltagsengel.care/#website' },
  about: { '@id': 'https://alltagsengel.care/#organization' },
}

// Platzhalter-Einträge — Fotos folgen. Bewusst mit Initialen-Avatar
// (kein Foto, keine eigenen Icon-SVGs), damit die Struktur schon steht
// und später nur die Bilder ergänzt werden müssen.
type Member = { name: string; role: string; bio: string; initials: string }

const LEITUNG: Member[] = [
  {
    name: 'Geschäftsführung',
    role: 'Strategie, Partnerschaften & Vision',
    bio: 'Verantwortlich für Strategie, Partnerschaften und die Vision, pflegebedürftigen Menschen ihre gesetzlichen Leistungen ohne Papierkrieg zugänglich zu machen.',
    initials: 'AE',
  },
]

const TEAM: Member[] = [
  {
    name: 'Kundenbetreuung',
    role: 'Ihre erste Anlaufstelle',
    bio: 'Beantwortet Fragen zu Entlastungsbetrag, Pflegebox und Krankenfahrten, hilft beim Antrag und begleitet Sie vom ersten Kontakt bis zum ersten Einsatz.',
    initials: 'KB',
  },
  {
    name: 'Tourenplanung',
    role: 'Einsatz- & Fahrtenkoordination',
    bio: 'Plant Betreuungseinsätze und Krankenfahrten so, dass Begleitung und Fahrer pünktlich und zuverlässig bei Ihnen sind.',
    initials: 'TP',
  },
  {
    name: 'Qualität & Pflegeberatung',
    role: 'Qualitätssicherung nach §45a SGB XI',
    bio: 'Sorgt für geschulte Begleiter:innen, geprüfte Führungszeugnisse und einheitliche Qualität — und berät zu Pflegegrad und Ansprüchen.',
    initials: 'QP',
  },
  {
    name: 'Buchhaltung & Abrechnung',
    role: 'Direkte Kassenabrechnung',
    bio: 'Rechnet den Entlastungsbetrag und die Pflegebox direkt mit der Pflegekasse ab — damit Sie nicht in Vorleistung gehen müssen.',
    initials: 'BA',
  },
]

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 18,
  padding: 22,
  border: '1px solid rgba(255,255,255,0.06)',
}

function Avatar({ initials }: { initials: string }) {
  // Platzhalter-Avatar: Initialen im goldenen Kreis. Foto folgt.
  return (
    <div
      aria-hidden="true"
      style={{
        flexShrink: 0,
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, rgba(201,150,60,0.22), rgba(201,150,60,0.06))',
        border: '1px solid rgba(201,150,60,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#E8C87E',
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: '0.03em',
      }}
    >
      {initials}
    </div>
  )
}

function MemberCard({ m }: { m: Member }) {
  return (
    <div style={{ ...cardStyle, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <Avatar initials={m.initials} />
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#F5F0E8', fontSize: 16, fontWeight: 700 }}>{m.name}</div>
        <div style={{ color: '#C9963C', fontSize: 13, fontWeight: 600, marginTop: 2, marginBottom: 8 }}>{m.role}</div>
        <p style={{ color: '#B8B0A4', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{m.bio}</p>
      </div>
    </div>
  )
}

export default function TeamPage() {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #1A1612 0%, #2A2420 100%)',
      padding: '0 16px 60px',
    }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(teamPageJsonLd) }} />
      <BreadcrumbSchema items={[{ name: 'Team' }]} />

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '36px 0 28px', maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 38px)', fontWeight: 700, color: '#F5F0E8', marginBottom: 12, lineHeight: 1.2 }}>
          Die Menschen hinter Alltagsengel
        </h1>
        <p style={{ color: '#B8B0A4', fontSize: 16, lineHeight: 1.6 }}>
          Bei Alltagsengel steht hinter jedem Anruf ein echter Mensch. Lernen Sie das Team kennen,
          das dafür sorgt, dass Betreuung, Pflegebox und Krankenfahrten zuverlässig funktionieren.
        </p>
      </section>

      <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Hinweis: Fotos folgen */}
        <div style={{
          background: 'rgba(201,150,60,0.08)',
          border: '1px solid rgba(201,150,60,0.18)',
          borderRadius: 14,
          padding: '14px 18px',
          color: '#D8D0C4',
          fontSize: 13,
          lineHeight: 1.6,
          textAlign: 'center',
        }}>
          Wir stellen unser Team gerade mit persönlichen Fotos vor — die Bilder folgen in Kürze.
        </div>

        {/* Geschäftsführung */}
        <section>
          <h2 style={{ color: '#C9963C', fontSize: 20, fontWeight: 700, marginBottom: 14 }}>Geschäftsführung</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {LEITUNG.map(m => <MemberCard key={m.name} m={m} />)}
          </div>
        </section>

        {/* Team & Büro */}
        <section>
          <h2 style={{ color: '#C9963C', fontSize: 20, fontWeight: 700, marginBottom: 14 }}>Team &amp; Büro</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
            {TEAM.map(m => <MemberCard key={m.name} m={m} />)}
          </div>
        </section>

        {/* Begleiter:innen */}
        <section style={cardStyle}>
          <h2 style={{ color: '#C9963C', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Unsere Alltagsengel</h2>
          <p style={{ color: '#D8D0C4', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
            Das Herzstück sind unsere Alltagsbegleiter:innen im gesamten Rhein-Main-Gebiet — geprüft,
            versichert und mit Führungszeugnis. Sie sind es, die jeden Tag zu unseren Kundinnen und
            Kunden nach Hause kommen. Möchten Sie dazugehören?{' '}
            <Link href="/jobs" style={{ color: '#C9963C', fontWeight: 600 }}>Jetzt im Team bewerben →</Link>
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
            <Link href="/ueber-uns" style={{ border: '1px solid rgba(201,150,60,0.5)', color: '#C9963C', padding: '12px 26px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              Über uns
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
