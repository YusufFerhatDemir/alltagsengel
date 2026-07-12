'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import CookieSettingsLink from '@/components/CookieSettingsLink'

// ═══════════════════════════════════════════════════════════
// SITE-FOOTER — global auf allen Marketing-Seiten
// ═══════════════════════════════════════════════════════════
// Wird in LayoutWrapper (showHeader-Gate) gerendert — vorher existierte der
// vollständige Footer nur auf der Homepage, alle Unterseiten hatten nur
// Mini-Footer → der interne Linkgraph (Städte, Tools, /termin, /bewertungen)
// war für Crawler kaum erreichbar (Orphan-Problem).
// Styles: .lp-footer* in app/globals.css (global).
// ═══════════════════════════════════════════════════════════

export default function SiteFooter() {
  const pathname = usePathname()
  // Seiten mit fixer Sticky-CTA-Bar: Footer braucht Luft nach unten,
  // sonst liegt die letzte Link-Zeile dauerhaft unter der Bar.
  const hasStickyBar = pathname === '/' || ['/jobs', '/engel-werden'].includes(pathname || '')
  return (
    <footer className="lp-footer" style={hasStickyBar ? { paddingBottom: 'calc(130px + env(safe-area-inset-bottom))' } : undefined}>
      <div className="lp-footer-brand">ALLTAGSENGEL</div>
      <div className="lp-footer-sub">Alltagsbegleitung · Pflege-Box · Krankenfahrt · Frankfurt &amp; Rhein-Main</div>

      {/* Telefon — direktester Kanal für die Senioren-Zielgruppe */}
      <div className="lp-footer-sub" style={{ marginTop: 6 }}>
        Telefon:{' '}
        <a href="tel:+491783382825" style={{ color: '#C9963C', textDecoration: 'none', fontWeight: 600 }}>
          +49 178 338 28 25
        </a>{' '}
        · Mo–Fr 8–18 Uhr
      </div>

      {/* Adresse — vollständige NAP (Name/Adresse/Telefon) crawlbar auf jeder Seite (Local SEO) */}
      <div className="lp-footer-sub" style={{ marginTop: 4 }}>
        Neue Mainzer Straße 66-68 · 60311 Frankfurt am Main
      </div>

      <div className="lp-footer-links">
        <Link href="/hygienebox">Pflege-Box</Link>
        <Link href="/krankenfahrten">Krankenfahrt</Link>
        <Link href="/alltagsbegleitung">Alltagsbegleitung</Link>
        <Link href="/entlastungsbetrag">Entlastungsbetrag</Link>
        <Link href="/verhinderungspflege">Verhinderungspflege</Link>
        <Link href="/termin">Termin buchen</Link>
        <Link href="/budgetrechner">Budgetrechner</Link>
        <Link href="/pflegegrad-check">Pflegegrad-Check</Link>
        <Link href="/finanzierung">Finanzierung</Link>
        <Link href="/jobs">Jobs</Link>
        <Link href="/engel-werden">Engel werden</Link>
        <Link href="/blog">Ratgeber</Link>
        <Link href="/faq">FAQ</Link>
        <Link href="/bewertungen">Bewertungen</Link>
        <Link href="/team">Team</Link>
        <Link href="/ueber-uns">Über uns</Link>
        <Link href="/kontakt">Kontakt</Link>
      </div>

      {/* Städte-Links: Stadt-Landingpages intern verlinken (Indexierung —
          vorher waren sie nur über die Sitemap erreichbar = Orphan-Pages) */}
      <div className="lp-footer-links" style={{ marginTop: 4 }}>
        <Link href="/alltagsbegleitung/frankfurt">Frankfurt</Link>
        <Link href="/alltagsbegleitung/offenbach">Offenbach</Link>
        <Link href="/alltagsbegleitung/wiesbaden">Wiesbaden</Link>
        <Link href="/alltagsbegleitung/darmstadt">Darmstadt</Link>
        <Link href="/alltagsbegleitung/mainz">Mainz</Link>
        <Link href="/alltagsbegleitung/hanau">Hanau</Link>
        <Link href="/alltagsbegleitung/bad-homburg">Bad Homburg</Link>
        <Link href="/einzugsgebiet">Alle Einsatzorte →</Link>
      </div>

      <div className="lp-footer-links" style={{ marginTop: 4 }}>
        <Link href="/impressum">Impressum</Link>
        <Link href="/datenschutz">Datenschutz</Link>
        <Link href="/agb">AGB</Link>
        <CookieSettingsLink />
      </div>

      <div className="lp-footer-copy">
        © 2026 Alltagsengel UG (haftungsbeschränkt) — Frankfurt am Main
      </div>
    </footer>
  )
}
