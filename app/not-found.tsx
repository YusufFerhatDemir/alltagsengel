import Link from 'next/link'

const POPULAR: { href: string; label: string }[] = [
  { href: '/alltagsbegleitung', label: 'Alltagsbegleitung' },
  { href: '/hygienebox', label: 'Pflegebox' },
  { href: '/krankenfahrten', label: 'Krankenfahrten' },
  { href: '/budgetrechner', label: 'Budgetrechner' },
  { href: '/pflegegrad-check', label: 'Pflegegrad-Check' },
  { href: '/faq', label: 'Häufige Fragen' },
]

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      textAlign: 'center',
      background: '#1A1612',
      color: '#F7F2EA',
      fontFamily: "'Jost', sans-serif",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }} aria-hidden="true">🔍</div>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: '#C9963C' }}>
        Seite nicht gefunden
      </h1>
      <p style={{ fontSize: 14, color: '#B8AC9C', marginBottom: 24, maxWidth: 340 }}>
        Die angeforderte Seite existiert nicht oder wurde verschoben.
        Vielleicht finden Sie hier, was Sie suchen:
      </p>

      <nav aria-label="Beliebte Seiten" style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center',
        maxWidth: 420, marginBottom: 28,
      }}>
        {POPULAR.map(({ href, label }) => (
          <Link key={href} href={href} style={{
            padding: '8px 16px',
            borderRadius: 10,
            border: '1px solid rgba(201, 150, 60, 0.35)',
            color: '#DBA84A',
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
          }}>
            {label}
          </Link>
        ))}
      </nav>

      <Link
        href="/"
        style={{
          padding: '12px 32px',
          borderRadius: 12,
          border: 'none',
          background: 'linear-gradient(135deg, #C9963C, #DBA84A)',
          color: '#1A1612',
          fontSize: 14,
          fontWeight: 600,
          textDecoration: 'none',
          fontFamily: "'Jost', sans-serif",
        }}
      >
        Zur Startseite
      </Link>

      <p style={{ fontSize: 13, color: '#8A8175', marginTop: 24 }}>
        Nichts gefunden? Rufen Sie uns an:{' '}
        <a href="tel:+491783382825" style={{ color: '#C9963C', textDecoration: 'none' }}>
          +49 178 338 28 25
        </a>
      </p>
    </div>
  )
}
