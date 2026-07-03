'use client'
import Link from 'next/link'

// ═══════════════════════════════════════════════════════════
// SITE HEADER — Globale Marketing-Navigation (öffentliche Seiten)
// ═══════════════════════════════════════════════════════════
// Slim In-Flow-Leiste innerhalb des Phone-Frames, direkt unter der
// StatusBar. Zeigt Marke + zwei CTAs:
//   • "Beratung"       (Ghost) → /kontakt  (kostenfreie Erstberatung)
//   • "Jetzt bewerben" (Gold)  → /jobs     (Recruiting, auffällig)
// Bewusst KEIN position:fixed — verändert das #splash-Scrollverhalten
// der Startseite nicht. Sichtbarkeit steuert der LayoutWrapper.
// ═══════════════════════════════════════════════════════════

export default function SiteHeader() {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '10px 14px',
        background: 'rgba(20,18,16,0.92)',
        borderBottom: '1px solid rgba(201,150,60,0.12)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <Link
        href="/"
        aria-label="Alltagsengel Startseite"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          textDecoration: 'none',
          minWidth: 0,
          flexShrink: 1,
        }}
      >
        <img
          src="/icon-192x192.png"
          alt="Alltagsengel"
          width={26}
          height={26}
          style={{ borderRadius: 6, flexShrink: 0 }}
        />
        <span
          style={{
            color: '#C9963C',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          Alltagsengel
        </span>
      </Link>

      <nav style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Link
          href="/kontakt"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '8px 12px',
            borderRadius: 9,
            border: '1px solid rgba(201,150,60,0.45)',
            color: '#C9963C',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Beratung
        </Link>
        <Link
          href="/jobs"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '8px 14px',
            borderRadius: 9,
            background: 'linear-gradient(135deg, #E8C87E 0%, #C9963C 100%)',
            color: '#1A1612',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 10px rgba(201,150,60,0.35)',
          }}
        >
          Jetzt bewerben
        </Link>
      </nav>
    </header>
  )
}
