'use client'
import Link from 'next/link'

/* ════════════════════════════════════════════
   AlltagsEngel — Shared Investor Doc Components
   Premium dark-mode, gold accent, mobile-first
   ════════════════════════════════════════════ */

export const C = {
  coal: '#1A1612', coal2: '#252118', coal3: '#332E24', coal4: '#443C2E',
  gold: '#C9963C', gold2: '#DBA84A', gold3: '#ECC870',
  goldPale: 'rgba(201,150,60,0.12)', goldLt: 'rgba(201,150,60,0.25)',
  ink: '#F7F2EA', ink2: '#C4B8A8', ink3: '#9A8C7C', ink4: '#7A6E5E', ink5: '#5A4E3E',
  green: '#5CB882', red: '#D04B3B', blue: '#5B8CD4',
  border: 'rgba(255,255,255,0.08)',
}

export const goldGrad = `linear-gradient(135deg, ${C.gold2} 0%, ${C.gold} 55%, #9A7020 100%)`

/* ── Reusable Components ── */
export const SectionLabel = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: C.ink4, textTransform: 'uppercase', marginBottom: 10, ...style }}>{children}</div>
)

export const GoldSep = () => (
  <div style={{ width: 40, height: 2, background: `linear-gradient(90deg, ${C.gold}, transparent)`, borderRadius: 1, margin: '16px 0' }} />
)

export const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{
    background: C.coal2, borderRadius: 18, padding: '20px 20px',
    border: `1.5px solid ${C.border}`,
    boxShadow: '0 2px 14px rgba(26,22,18,0.15)',
    ...style,
  }}>{children}</div>
)

export const Badge = ({ children, color }: { children: React.ReactNode; color?: string }) => (
  <span style={{
    display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
    padding: '4px 10px', borderRadius: 20,
    background: color ? `${color}18` : C.goldPale,
    color: color || C.gold, textTransform: 'uppercase',
  }}>{children}</span>
)

export const StatBox = ({ value, label, icon, subLabel, style }: { value: string; label: string; icon?: string; subLabel?: string; style?: React.CSSProperties }) => (
  <div style={{
    flex: '1 1 140px', minWidth: 140, background: C.coal2, borderRadius: 14,
    padding: '18px 16px', border: `1px solid ${C.border}`, textAlign: 'center', ...style,
  }}>
    {icon && <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>}
    <div style={{ fontSize: 22, fontWeight: 700, color: C.gold, fontFamily: "'Cormorant Garamond', serif" }}>{value}</div>
    <div style={{ fontSize: 11, color: C.ink3, marginTop: 4, lineHeight: 1.3 }}>{label}</div>
    {subLabel && <div style={{ fontSize: 10, color: C.ink4, marginTop: 2 }}>{subLabel}</div>}
  </div>
)

export const TableRow = ({ cells, header }: { cells: string[]; header?: boolean }) => (
  <div style={{
    display: 'flex', gap: 2, padding: '10px 0',
    borderBottom: `1px solid ${C.border}`,
    fontWeight: header ? 700 : 400,
    color: header ? C.gold : C.ink,
    fontSize: header ? 11 : 13,
    letterSpacing: header ? '0.06em' : 0,
    textTransform: header ? 'uppercase' as const : 'none' as const,
  }}>
    {cells.map((c, i) => <div key={i} style={{ flex: i === 0 ? 2 : 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c}</div>)}
  </div>
)

export const BulletItem = ({ children, icon, style }: { children: React.ReactNode; icon?: string; style?: React.CSSProperties }) => (
  <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start', ...style }}>
    <span style={{ color: C.gold, fontSize: 14, lineHeight: 1.6, flexShrink: 0 }}>{icon || '▸'}</span>
    <span style={{ color: C.ink2, fontSize: 14, lineHeight: 1.6 }}>{children}</span>
  </div>
)

export const SectionTitle = ({ children, icon }: { children: React.ReactNode; icon?: string }) => (
  <div style={{ marginTop: 40, marginBottom: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {icon && <span style={{ fontSize: 24 }}>{icon}</span>}
      <h2 style={{ fontSize: 22, fontWeight: 700, color: C.ink, margin: 0, fontFamily: "'Cormorant Garamond', serif" }}>{children}</h2>
    </div>
    <GoldSep />
  </div>
)

export const Paragraph = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <p style={{ color: C.ink2, fontSize: 14, lineHeight: 1.75, margin: '0 0 16px 0', ...style }}>{children}</p>
)

/* ── Page Layout ── */
export const DocPageLayout = ({ title, subtitle, icon, badge, children, lang }: {
  title: string; subtitle: string; icon: string; badge?: string; children: React.ReactNode; lang?: 'de' | 'en'
}) => {
  const backLabel = lang === 'en' ? '← Back to Data Room' : '← Zurück zum Data Room'
  return (
    <div style={{
      minHeight: '100vh', background: C.coal, color: C.ink,
      fontFamily: "'Jost', sans-serif",
    }}>
      {/* Mobile-responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .doc-hero-title { font-size: 28px !important; }
          .doc-content { padding: 0 16px !important; }
          .doc-hero { padding: 24px 16px !important; }
          .stat-grid { gap: 10px !important; }
          .stat-grid > div { min-width: 120px !important; }
          .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
        @media (max-width: 480px) {
          .doc-hero-title { font-size: 24px !important; }
          .doc-content { padding: 0 12px !important; }
          .doc-hero { padding: 20px 12px !important; }
        }
      `}</style>

      {/* Top bar */}
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <Link href="/investor" style={{ color: C.ink3, textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>{backLabel}</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: C.gold }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: C.gold, letterSpacing: '0.06em' }}>ALLTAGSENGEL</span>
        </div>
      </div>

      {/* Hero */}
      <div className="doc-hero" style={{
        padding: '40px 24px', maxWidth: 900, margin: '0 auto',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
        {badge && <Badge>{badge}</Badge>}
        <h1 className="doc-hero-title" style={{
          fontSize: 36, fontWeight: 700, margin: '12px 0 8px',
          fontFamily: "'Cormorant Garamond', serif", color: C.ink,
          lineHeight: 1.2,
        }}>{title}</h1>
        <p style={{ color: C.ink3, fontSize: 14, margin: 0, maxWidth: 600, marginLeft: 'auto', marginRight: 'auto' }}>{subtitle}</p>
        <div style={{ width: 60, height: 2, background: goldGrad, margin: '24px auto 0', borderRadius: 1 }} />
      </div>

      {/* Content */}
      <div className="doc-content" style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 80px' }}>
        {children}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: `1px solid ${C.border}`, padding: '32px 24px',
        textAlign: 'center', color: C.ink4, fontSize: 12,
      }}>
        <div style={{ color: C.gold, fontWeight: 600, fontSize: 13, marginBottom: 8, letterSpacing: '0.06em' }}>ALLTAGSENGEL UG (haftungsbeschränkt)</div>
        <div>Schiller Str. 31 · 60313 Frankfurt am Main</div>
        <div style={{ marginTop: 4 }}>info@alltagsengel.care · www.alltagsengel.de</div>
        <div style={{ marginTop: 12, color: C.ink5, fontSize: 10 }}>Vertraulich — Nur für autorisierte Investoren</div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid rgba(201,150,60,0.08)` }}>
          <a href="https://dripfy.app" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', fontSize: 11, color: C.ink5, letterSpacing: '0.04em' }}>
            Powered by <span style={{ fontWeight: 700, color: C.gold }}>DRIPFY.APP</span>
          </a>
        </div>
      </div>
    </div>
  )
}
