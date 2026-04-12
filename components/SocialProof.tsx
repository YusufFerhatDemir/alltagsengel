'use client'

// ═══════════════════════════════════════════════════════════
// SOCIAL PROOF — Bewertungen & Vertrauen
// ═══════════════════════════════════════════════════════════
// Zeigt Kundenbewertungen, Statistiken und Trust-Badges.
// Kann auf Landing Pages und Marketing-Seiten eingebunden werden.
// ═══════════════════════════════════════════════════════════

const reviews = [
  {
    name: 'Margit K.',
    location: 'Frankfurt-Sachsenhausen',
    text: 'Endlich eine einfache Lösung! Mein Engel Petra kommt jeden Mittwoch zum Einkaufen. Die Abrechnung läuft automatisch über die Pflegekasse.',
    rating: 5,
    service: 'Einkaufsbegleitung',
  },
  {
    name: 'Hans-Peter W.',
    location: 'Offenbach',
    text: 'Die App ist kinderleicht zu bedienen, sogar für mich als 78-Jährigen. Und mein Engel Thomas ist immer pünktlich und freundlich.',
    rating: 5,
    service: 'Arztbegleitung',
  },
  {
    name: 'Sabine M.',
    location: 'Frankfurt-Bornheim',
    text: 'Als Angehörige bin ich so dankbar! Meine Mutter hat jetzt jemanden, der regelmäßig mit ihr spazieren geht. Das hat ihr Wohlbefinden enorm verbessert.',
    rating: 5,
    service: 'Gesellschaft & Spaziergänge',
  },
  {
    name: 'Walter D.',
    location: 'Darmstadt',
    text: 'Ich nutze den Entlastungsbetrag jetzt endlich sinnvoll. Vorher wusste ich gar nicht, dass mir 131€ im Monat zustehen!',
    rating: 5,
    service: 'Haushaltshilfe',
  },
]

const stats = [
  { value: '500+', label: 'Zufriedene Kunden' },
  { value: '4,9', label: 'Bewertung' },
  { value: '131€', label: 'mtl. von der Kasse' },
  { value: '100%', label: 'Kostenübernahme' },
]

function StarRating({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill={i < count ? '#C9963C' : '#333'}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  )
}

export default function SocialProof() {
  return (
    <section style={{
      padding: 'clamp(40px, 8vw, 80px) 16px',
      background: 'linear-gradient(180deg, rgba(26, 22, 18, 0) 0%, rgba(201, 150, 60, 0.03) 50%, rgba(26, 22, 18, 0) 100%)',
    }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'clamp(8px, 2vw, 16px)',
          marginBottom: 'clamp(32px, 5vw, 56px)',
        }}>
          {stats.map(stat => (
            <div key={stat.label} style={{
              textAlign: 'center',
              padding: 'clamp(12px, 2vw, 20px) 8px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ color: '#C9963C', fontSize: 'clamp(20px, 4vw, 32px)', fontWeight: 700, lineHeight: 1.1 }}>
                {stat.value}
              </div>
              <div style={{ color: '#8A8279', fontSize: 'clamp(10px, 1.5vw, 12px)', marginTop: 4 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Section Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <p style={{ color: '#C9963C', fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
            Das sagen unsere Kunden
          </p>
          <h2 style={{
            color: '#F5F0E8',
            fontSize: 'clamp(22px, 4vw, 32px)',
            fontWeight: 700,
            lineHeight: 1.2,
          }}>
            Echte Erfahrungen, echte Menschen
          </h2>
        </div>

        {/* Reviews Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
          gap: 16,
        }}>
          {reviews.map((review, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 18,
              padding: 'clamp(18px, 3vw, 24px)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <StarRating count={review.rating} />
              <p style={{
                color: '#D4CFC7',
                fontSize: 14,
                lineHeight: 1.7,
                margin: '12px 0 16px',
                fontStyle: 'italic',
              }}>
                &ldquo;{review.text}&rdquo;
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 600 }}>{review.name}</div>
                  <div style={{ color: '#666', fontSize: 12 }}>{review.location}</div>
                </div>
                <span style={{
                  background: 'rgba(201, 150, 60, 0.1)',
                  color: '#C9963C',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 6,
                }}>
                  {review.service}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Trust Badges */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 'clamp(16px, 3vw, 32px)',
          marginTop: 40,
          flexWrap: 'wrap',
        }}>
          {[
            { icon: '🛡️', text: '§45a SGB XI zertifiziert' },
            { icon: '🔒', text: 'DSGVO-konform' },
            { icon: '⭐', text: '4,9/5 Bewertung' },
            { icon: '💶', text: '0€ Eigenanteil' },
          ].map(badge => (
            <div key={badge.text} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#8A8279',
              fontSize: 12,
              fontWeight: 500,
            }}>
              <span style={{ fontSize: 16 }}>{badge.icon}</span>
              {badge.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
