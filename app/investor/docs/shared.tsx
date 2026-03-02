'use client'
import Link from 'next/link'
import React from 'react'

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

/* ── Premium SVG Icon System ── */
const s = (d: string, size = 28) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">{d.split('|').map((p, i) => <path key={i} d={p} />)}</svg>
)

export const Icons = {
  building:    (sz = 28) => s('M3 21h18|M9 8h1|M9 12h1|M9 16h1|M14 8h1|M14 12h1|M14 16h1|M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16', sz),
  chart:       (sz = 28) => s('M3 3v18h18|M7 16l4-4 4 4 5-6', sz),
  palette:     (sz = 28) => s('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.1 0 2-.9 2-2 0-.53-.21-1-.55-1.35-.34-.36-.55-.83-.55-1.35 0-1.1.9-2 2-2h2.35C19.86 15.3 22 13.18 22 10.5 22 5.81 17.52 2 12 2', sz),
  trending:    (sz = 28) => s('M22 7l-8.5 8.5-5-5L2 17|M16 7h6v6', sz),
  coins:       (sz = 28) => s('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20|M12 6v12|M8 10h8|M8 14h8', sz),
  cog:         (sz = 28) => s('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6|M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1', sz),
  rocket:      (sz = 28) => s('M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09|M12 15l-3-3|M22 2l-7.5 7.5|M15 2H22v7|M22 2L13.5 10.5', sz),
  scale:       (sz = 28) => s('M12 3v18|M5 8l7-5 7 5|M5 8v4a7 7 0 0 0 7 7|M19 8v4a7 7 0 0 1-7 7|M2 12a5 5 0 0 0 5 5|M17 17a5 5 0 0 0 5-5', sz),
  users:       (sz = 28) => s('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75', sz),
  clipboard:   (sz = 28) => s('M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2|M9 2h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1|M12 11h4|M12 15h4|M8 11h.01|M8 15h.01', sz),
  fileText:    (sz = 28) => s('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8', sz),
  presentation:(sz = 28) => s('M2 3h20|M8 21l4-4 4 4|M4 3v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3|M8 10l3-3 2 2 3-3', sz),
  target:      (sz = 28) => s('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20|M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12|M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4', sz),
  shield:      (sz = 28) => s('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10|M9 12l2 2 4-4', sz),
  globe:       (sz = 28) => s('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20|M2 12h20|M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2', sz),
  phone:       (sz = 28) => s('M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2|M12 18h.01', sz),
  search:      (sz = 28) => s('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16|M21 21l-4.35-4.35', sz),
  lock:        (sz = 28) => s('M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2|M7 11V7a5 5 0 0 1 10 0v4', sz),
  heart:       (sz = 28) => s('M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78', sz),
  mail:        (sz = 28) => s('M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2|M22 6l-10 7L2 6', sz),
  calendar:    (sz = 28) => s('M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2|M16 2v4|M8 2v4|M3 10h18', sz),
  star:        (sz = 28) => s('M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2', sz),
  zap:         (sz = 28) => s('M13 2L3 14h9l-1 8 10-12h-9l1-8', sz),
  check:       (sz = 28) => s('M22 11.08V12a10 10 0 1 1-5.93-9.14|M22 4L12 14.01l-3-3', sz),
  cross:       (sz = 28) => s('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20|M15 9l-6 6|M9 9l6 6', sz),
  diamond:     (sz = 28) => s('M6 3h12l4 6-10 13L2 9z|M2 9h20', sz),
  award:       (sz = 28) => s('M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14|M8.21 13.89L7 23l5-3 5 3-1.21-9.12', sz),
  briefcase:   (sz = 28) => s('M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2|M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2', sz),
  layers:      (sz = 28) => s('M12 2L2 7l10 5 10-5-10-5|M2 17l10 5 10-5|M2 12l10 5 10-5', sz),
  pieChart:    (sz = 28) => s('M21.21 15.89A10 10 0 1 1 8 2.83|M22 12A10 10 0 0 0 12 2v10z', sz),
  barChart:    (sz = 28) => s('M12 20V10|M18 20V4|M6 20v-4', sz),
  trendUp:     (sz = 28) => s('M23 6l-9.5 9.5-5-5L1 18|M17 6h6v6', sz),
  database:    (sz = 28) => s('M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3|M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5|M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3', sz),
  creditCard:  (sz = 28) => s('M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2|M1 10h22', sz),
  mapPin:      (sz = 28) => s('M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0|M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6', sz),
  angelWing:   (sz = 28) => s('M12 2a4 4 0 0 1 0 8 4 4 0 0 1 0-8|M12 14c-5 0-9 2-9 4v2h18v-2c0-2-4-4-9-4|M8 6c-3 0-5 2-6 4|M16 6c3 0 5 2 6 4', sz),
}

/* ── Icon Wrapper for hero sections ── */
export const HeroIcon = ({ icon, size = 56 }: { icon: React.ReactNode; size?: number }) => (
  <div style={{
    width: size, height: size, borderRadius: size * 0.28,
    background: `linear-gradient(135deg, ${C.goldPale}, rgba(201,150,60,0.06))`,
    border: `1.5px solid rgba(201,150,60,0.18)`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 16px',
    boxShadow: '0 4px 20px rgba(201,150,60,0.08)',
  }}>{icon}</div>
)

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
  title: string; subtitle: string; icon: React.ReactNode; badge?: string; children: React.ReactNode; lang?: 'de' | 'en'
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
        <HeroIcon icon={icon} />
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
