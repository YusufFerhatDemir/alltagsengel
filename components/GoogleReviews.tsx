'use client'
import { useEffect, useState } from 'react'

// ═══════════════════════════════════════════════════════════
// GOOGLE-REVIEWS WIDGET
// ═══════════════════════════════════════════════════════════
// Zeigt echte Google-Bewertungen (über /api/google-reviews),
// sobald das Business-Profil konfiguriert ist. Bis dahin:
// "Bewerten Sie uns"-CTA. Keine erfundenen Bewertungen.
// ═══════════════════════════════════════════════════════════

const REVIEW_URL = process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL || 'https://www.google.com/maps/search/?api=1&query=Alltagsengel%20Frankfurt%20am%20Main'

interface Review {
  author: string
  rating: number
  text: string
  relativeTime: string
}

interface Daten {
  configured: boolean
  rating?: number
  count?: number
  reviews?: Review[]
}

function Sterne({ wert, groesse = 16 }: { wert: number; groesse?: number }) {
  return (
    <span aria-label={`${wert} von 5 Sternen`} style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ fontSize: groesse, color: i <= Math.round(wert) ? '#E8C87E' : 'rgba(255,255,255,0.15)' }} aria-hidden="true">★</span>
      ))}
    </span>
  )
}

export default function GoogleReviews() {
  const [daten, setDaten] = useState<Daten | null>(null)

  useEffect(() => {
    fetch('/api/google-reviews')
      .then(r => r.json())
      .then(setDaten)
      .catch(() => setDaten({ configured: false }))
  }, [])

  if (!daten) return null

  // Noch kein Business-Profil verknüpft → Bewertungs-CTA
  if (!daten.configured || !daten.rating) {
    return (
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 'clamp(18px, 3vw, 28px)', textAlign: 'center' }}>
        <div style={{ fontSize: 30, marginBottom: 8 }} aria-hidden="true">⭐</div>
        <h3 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Ihre Erfahrung zählt</h3>
        <p style={{ color: '#B8B0A4', fontSize: 13.5, lineHeight: 1.6, maxWidth: 420, margin: '0 auto 14px' }}>
          Sie sind bereits Kunde bei Alltagsengel? Mit Ihrer Google-Bewertung helfen Sie anderen
          Familien, uns zu finden — und uns, noch besser zu werden.
        </p>
        <a href={REVIEW_URL} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ fontSize: 14 }}>Auf Google bewerten</a>
      </div>
    )
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': 'https://alltagsengel.care/#localbusiness',
    name: 'Alltagsengel',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: daten.rating,
      reviewCount: daten.count,
      bestRating: 5,
      worstRating: 1,
    },
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 'clamp(18px, 3vw, 28px)' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Kopf: Gesamtwertung */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ color: '#E8C87E', fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{daten.rating.toFixed(1).replace('.', ',')}</div>
        <div>
          <Sterne wert={daten.rating} groesse={18} />
          <div style={{ color: '#8A8279', fontSize: 12.5, marginTop: 2 }}>{daten.count} Bewertungen auf Google</div>
        </div>
        <a href={REVIEW_URL} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', color: '#E8C87E', fontSize: 13, textDecoration: 'underline' }}>
          Alle ansehen
        </a>
      </div>

      {/* Rezensionen */}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6, scrollSnapType: 'x mandatory' }}>
        {(daten.reviews || []).map((r, i) => (
          <div key={i} style={{ minWidth: 240, maxWidth: 280, scrollSnapAlign: 'start', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ color: '#F5F0E8', fontSize: 13, fontWeight: 700 }}>{r.author}</span>
              <Sterne wert={r.rating} groesse={12} />
            </div>
            <p style={{ color: '#B8B0A4', fontSize: 12.5, lineHeight: 1.55 }}>{r.text}</p>
            <div style={{ color: '#6A6259', fontSize: 11, marginTop: 8 }}>{r.relativeTime} · Google</div>
          </div>
        ))}
      </div>
    </div>
  )
}
