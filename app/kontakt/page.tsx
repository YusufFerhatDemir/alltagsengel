import type { Metadata } from 'next'
import Link from 'next/link'
import KontaktForm from './KontaktForm'

export const metadata: Metadata = {
  title: 'Kontakt — AlltagsEngel',
  description: 'Nehmen Sie Kontakt mit AlltagsEngel auf. Kostenlose Beratung zu Alltagsbegleitung, Entlastungsbetrag und Pflegehilfe.',
  openGraph: {
    title: 'Kontakt — AlltagsEngel',
    description: 'Kostenlose Beratung zu Alltagsbegleitung und Entlastungsbetrag.',
    url: 'https://alltagsengel.care/kontakt',
  },
}

export default function KontaktPage() {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #1A1612 0%, #2A2420 100%)',
      padding: '0 16px 60px',
    }}>
      {/* Navigation */}
      <nav style={{ maxWidth: 700, margin: '0 auto', padding: '16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/icon-192x192.png" alt="AlltagsEngel" width={36} height={36} style={{ borderRadius: 8 }} />
          <span style={{ color: '#C9963C', fontWeight: 700, fontSize: 16 }}>AlltagsEngel</span>
        </Link>
        <Link href="/auth/register" style={{
          background: '#C9963C', color: '#1A1612', padding: '8px 20px', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none',
        }}>
          Kostenlos starten
        </Link>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '40px 0 36px', maxWidth: 600, margin: '0 auto' }}>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 38px)', fontWeight: 700, color: '#F5F0E8', marginBottom: 12, lineHeight: 1.2 }}>
          Kontaktieren Sie uns
        </h1>
        <p style={{ color: '#B8B0A4', fontSize: 16, lineHeight: 1.6 }}>
          Kostenlose Beratung zu Alltagsbegleitung, Entlastungsbetrag und allen unseren Services.
        </p>
      </section>

      <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 24 }}>
        {/* Contact Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Phone */}
          <a href="tel:+491783382825" style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 18, padding: 24, border: '1px solid rgba(255,255,255,0.06)',
            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, background: 'rgba(201, 150, 60, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
            }}>📞</div>
            <div>
              <div style={{ color: '#F5F0E8', fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Telefon</div>
              <div style={{ color: '#C9963C', fontSize: 14 }}>+49 178 338 28 25</div>
              <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>Mo–Fr, 8:00–18:00 Uhr</div>
            </div>
          </a>

          {/* WhatsApp */}
          <a href="https://wa.me/491783382825?text=Hallo!%20Ich%20interessiere%20mich%20f%C3%BCr%20AlltagsEngel." target="_blank" rel="noopener noreferrer" style={{
            background: 'rgba(37, 211, 102, 0.06)', borderRadius: 18, padding: 24, border: '1px solid rgba(37, 211, 102, 0.15)',
            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, background: 'rgba(37, 211, 102, 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <div>
              <div style={{ color: '#F5F0E8', fontSize: 15, fontWeight: 600, marginBottom: 2 }}>WhatsApp</div>
              <div style={{ color: '#25D366', fontSize: 14 }}>Direkt schreiben</div>
              <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>Antwort innerhalb von 1 Stunde</div>
            </div>
          </a>

          {/* Email */}
          <a href="mailto:info@alltagsengel.care" style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 18, padding: 24, border: '1px solid rgba(255,255,255,0.06)',
            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, background: 'rgba(201, 150, 60, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
            }}>✉️</div>
            <div>
              <div style={{ color: '#F5F0E8', fontSize: 15, fontWeight: 600, marginBottom: 2 }}>E-Mail</div>
              <div style={{ color: '#C9963C', fontSize: 14 }}>info@alltagsengel.care</div>
              <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>Antwort innerhalb von 24 Stunden</div>
            </div>
          </a>

          {/* Address */}
          <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 18, padding: 24, border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, background: 'rgba(201, 150, 60, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
            }}>📍</div>
            <div>
              <div style={{ color: '#F5F0E8', fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Adresse</div>
              <div style={{ color: '#B8B0A4', fontSize: 14, lineHeight: 1.5 }}>
                Neue Mainzer Str. 66-68<br />60311 Frankfurt am Main
              </div>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <KontaktForm />
      </div>

      {/* Schema.org */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ContactPage',
        name: 'AlltagsEngel Kontakt',
        url: 'https://alltagsengel.care/kontakt',
        mainEntity: {
          '@type': 'Organization',
          name: 'AlltagsEngel',
          telephone: '+491783382825',
          email: 'info@alltagsengel.care',
          address: {
            '@type': 'PostalAddress',
            streetAddress: 'Neue Mainzer Str. 66-68',
            addressLocality: 'Frankfurt am Main',
            postalCode: '60311',
            addressCountry: 'DE',
          },
        },
      })}} />
    </main>
  )
}
