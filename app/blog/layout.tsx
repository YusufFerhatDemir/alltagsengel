import Link from 'next/link'
import Image from 'next/image'
import './blog.css'

// KEIN zentrales Article-JSON-LD mehr hier: BlogPostJsonLd emittierte auf
// 21 Posts ein ZWEITES, widersprüchliches Article+BreadcrumbList neben dem
// Inline-Schema der Posts (abweichende Headlines/Daten, veraltete €-Beträge).
// Single Source of Truth ist das Inline-JSON-LD jedes Posts.
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#1A1612' }}>
      {/* Blog Navigation */}
      <nav style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Link href="/" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textDecoration: 'none',
        }}>
          <Image
            src="/icon-192x192.png"
            alt="Alltagsengel"
            width={36}
            height={36}
            style={{ borderRadius: 8 }}
          />
          <span style={{ color: '#C9963C', fontWeight: 700, fontSize: 16 }}>Alltagsengel</span>
        </Link>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <Link href="/blog" style={{ color: '#B8B0A4', fontSize: 14, textDecoration: 'none', fontWeight: 500 }}>
            Ratgeber
          </Link>
          <Link href="/auth/register" style={{
            background: '#C9963C',
            color: '#1A1612',
            padding: '8px 20px',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 13,
            textDecoration: 'none',
          }}>
            Kostenlos starten
          </Link>
        </div>
      </nav>
      {children}
    </div>
  )
}
