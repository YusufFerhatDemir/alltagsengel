'use client'
import { useState } from 'react'
import Link from 'next/link'

/* ════════════════════════════════════════════
   AlltagsEngel — Investor Data Room Portal
   ════════════════════════════════════════════ */

const docsDe = [
  { id: '01', title: 'Unternehmensprofil', desc: 'Firmenprofil, Gründerteam, Unternehmensstruktur & Vision', icon: '🏢', cat: 'Unternehmen', format: 'WEB', link: '/investor/unternehmensprofil' },
  { id: '02', title: 'Investor Pitch Deck', desc: '14-seitiges Premium Pitch Deck mit Finanzplan & Marktanalyse', icon: '📊', cat: 'Präsentation', format: 'WEB', link: '/investor/pitch' },
  { id: '03', title: 'Markenidentität', desc: 'Logo, Farben, Typografie & Corporate Design Guidelines', icon: '🎨', cat: 'Brand', format: 'WEB', link: '/investor/brand' },
  { id: '04', title: 'Marktanalyse', desc: 'TAM/SAM/SOM, Wettbewerbsanalyse & Markttrends', icon: '📈', cat: 'Markt', format: 'WEB', link: '/investor/marktanalyse' },
  { id: '05', title: 'Finanzplan', desc: '5-Jahres-Prognose, P&L, Break-Even & Kennzahlen', icon: '💰', cat: 'Finanzen', format: 'WEB', link: '/investor/finanzplan' },
  { id: '06', title: 'Produkt & Technologie', desc: 'Tech Stack, Architektur, Features & Roadmap', icon: '⚙️', cat: 'Produkt', format: 'WEB', link: '/investor/produkt-technologie' },
  { id: '07', title: 'Go-to-Market Strategie', desc: 'Launch-Plan, Marketingkanäle & Wachstumsstrategie', icon: '🚀', cat: 'Strategie', format: 'WEB', link: '/investor/go-to-market' },
  { id: '08', title: 'Recht & Compliance', desc: 'SGB XI, Datenschutz, Versicherung & regulatorischer Rahmen', icon: '⚖️', cat: 'Legal', format: 'WEB', link: '/investor/recht-compliance' },
  { id: '09', title: 'Teamübersicht', desc: 'Mitarbeiterprofile, Qualifikationen & Gehaltsstruktur', icon: '👥', cat: 'Team', format: 'WEB', link: '/investor/team' },
  { id: '10', title: 'Betriebskosten', desc: 'Personal-, Büro-, Fahrzeug- & Gesamtkostenübersicht', icon: '📋', cat: 'Finanzen', format: 'WEB', link: '/investor/betriebskosten' },
  { id: '11', title: 'Zusammenfassung', desc: 'Executive Summary aller Kernpunkte für Investoren', icon: '📄', cat: 'Übersicht', format: 'WEB', link: '/investor/zusammenfassung' },
]

const docsEn = [
  { id: 'E1', title: 'Executive Summary', desc: 'Investment opportunity overview with key metrics', icon: '📄', cat: 'Overview', format: 'WEB', link: '/investor/en/executive-summary' },
  { id: 'E2', title: 'Company Overview', desc: 'Company profile, team & vision', icon: '🏢', cat: 'Company', format: 'WEB', link: '/investor/en/company-overview' },
  { id: 'E3', title: 'Brand Identity', desc: 'Logo, colors, typography & design guidelines', icon: '🎨', cat: 'Brand', format: 'WEB', link: '/investor/en/brand-identity' },
  { id: 'E4', title: 'Market Analysis', desc: 'TAM/SAM/SOM, competition & business model', icon: '📈', cat: 'Market', format: 'WEB', link: '/investor/en/market-analysis' },
  { id: 'E5', title: 'Financial Projections', desc: '5-year revenue forecast & key metrics', icon: '💰', cat: 'Finance', format: 'WEB', link: '/investor/en/financial-projections' },
  { id: 'E6', title: 'Product & Technology', desc: 'Tech stack, architecture & roadmap', icon: '⚙️', cat: 'Product', format: 'WEB', link: '/investor/en/product-technology' },
  { id: 'E7', title: 'Go-to-Market Strategy', desc: 'Launch campaign, channels & growth plan', icon: '🚀', cat: 'Strategy', format: 'WEB', link: '/investor/en/go-to-market' },
  { id: 'E8', title: 'Legal & Compliance', desc: 'SGB XI, data privacy, insurance & IP', icon: '⚖️', cat: 'Legal', format: 'WEB', link: '/investor/en/legal-compliance' },
]

const stats = [
  { value: '€50 Mrd.+', label: 'Marktpotenzial' },
  { value: '4,96 Mio.', label: 'Pflegebedürftige' },
  { value: '€500K', label: 'Seed-Runde' },
  { value: '18%', label: 'Provision' },
]

const catsDe = ['Alle', 'Unternehmen', 'Finanzen', 'Markt', 'Produkt', 'Strategie', 'Brand', 'Legal', 'Team', 'Übersicht', 'Präsentation']
const catsEn = ['All', 'Company', 'Finance', 'Market', 'Product', 'Strategy', 'Brand', 'Legal', 'Overview']

export default function InvestorPortal() {
  const [lang, setLang] = useState<'de' | 'en'>('de')
  const [filter, setFilter] = useState('Alle')
  const docs = lang === 'de' ? docsDe : docsEn
  const cats = lang === 'de' ? catsDe : catsEn
  const defaultFilter = lang === 'de' ? 'Alle' : 'All'
  const filtered = filter === defaultFilter ? docs : docs.filter(d => d.cat === filter)

  return (
    <div style={{ minHeight: '100vh', background: '#111009', fontFamily: "'Jost', sans-serif" }}>
      <style>{`
        @media (max-width: 768px) {
          .portal-hero { padding: 48px 16px 40px !important; }
          .portal-hero h1 { font-size: 36px !important; }
          .portal-stat-value { font-size: 22px !important; }
          .portal-grid { grid-template-columns: 1fr !important; }
          .portal-filters { gap: 6px !important; }
          .portal-cta-btn { padding: 12px 20px !important; font-size: 13px !important; }
        }
        @media (max-width: 480px) {
          .portal-hero h1 { font-size: 30px !important; }
          .portal-stat { padding: 0 14px !important; }
        }
      `}</style>
      {/* Hero */}
      <div style={{ position: 'relative', overflow: 'hidden', background: '#1A1612', padding: '80px 24px 60px', textAlign: 'center' }}>
        <div style={{ position: 'absolute', top: '-120px', left: '50%', transform: 'translateX(-50%)', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,150,60,0.1) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 800, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '8px 18px', borderRadius: 100, background: 'rgba(201,150,60,0.1)', border: '1px solid rgba(201,150,60,0.15)' }}>
            <span style={{ fontSize: 18 }}>👼</span>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: '#C9963C', textTransform: 'uppercase' as const }}>Investor Data Room</span>
          </div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 48, fontWeight: 700, color: '#F7F2EA', lineHeight: 1.15, marginBottom: 12 }}>
            ALLTAGSENGEL
          </h1>
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontStyle: 'italic', color: '#C9963C', marginBottom: 8 }}>
            Mit Herz für dich da
          </p>
          <p style={{ fontSize: 14, color: '#9A8C7C', marginBottom: 40 }}>
            Premium Alltagsbegleitung · Seed Round März 2026
          </p>

          {/* Stats Row */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 0, flexWrap: 'wrap' as const }}>
            {stats.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <div style={{ textAlign: 'center', padding: '0 24px' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#C9963C', fontFamily: "'Cormorant Garamond', serif" }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#7A6E5E', letterSpacing: '0.05em', marginTop: 4 }}>{s.label}</div>
                </div>
                {i < stats.length - 1 && <div style={{ width: 1, height: 36, background: 'rgba(201,150,60,0.2)' }} />}
              </div>
            ))}
          </div>

          {/* Language Toggle */}
          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 16 }}>
            <button onClick={() => { setLang('de'); setFilter('Alle') }} style={{
              padding: '8px 18px', borderRadius: '10px 0 0 10px', fontSize: 12, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: lang === 'de' ? '#C9963C' : 'rgba(255,255,255,0.06)',
              color: lang === 'de' ? '#1A1612' : '#9A8C7C',
            }}>🇩🇪 Deutsch</button>
            <button onClick={() => { setLang('en'); setFilter('All') }} style={{
              padding: '8px 18px', borderRadius: '0 10px 10px 0', fontSize: 12, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: lang === 'en' ? '#C9963C' : 'rgba(255,255,255,0.06)',
              color: lang === 'en' ? '#1A1612' : '#9A8C7C',
            }}>🇬🇧 English</button>
          </div>

          {/* CTA */}
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' as const }}>
            <Link href="/investor/pitch" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', borderRadius: 14, background: 'linear-gradient(135deg, #DBA84A 0%, #C9963C 55%, #9A7020 100%)', color: '#1A1612', fontWeight: 600, fontSize: 14, textDecoration: 'none', boxShadow: '0 4px 28px rgba(201,150,60,0.35)' }}>
              📊 Pitch Deck ansehen
            </Link>
            <a href="mailto:info@alltagsengel.care" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', borderRadius: 14, border: '1px solid rgba(201,150,60,0.25)', color: '#C9963C', fontWeight: 500, fontSize: 14, textDecoration: 'none', background: 'transparent' }}>
              ✉️ Kontakt aufnehmen
            </a>
          </div>
        </div>
      </div>

      {/* Filter Chips */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 0' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 24 }}>
          {cats.map(c => (
            <button key={c} onClick={() => setFilter(c)} style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: filter === c ? 'none' : '1px solid rgba(255,255,255,0.08)',
              background: filter === c ? '#C9963C' : 'transparent',
              color: filter === c ? '#1A1612' : '#9A8C7C',
              cursor: 'pointer', transition: 'all 0.2s',
              boxShadow: filter === c ? '0 2px 8px rgba(201,150,60,0.25)' : 'none'
            }}>{c}</button>
          ))}
        </div>

        {/* Documents Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, paddingBottom: 60 }}>
          {filtered.map(doc => {
            const inner = (
              <div style={{
                background: '#252118', borderRadius: 18, padding: 20,
                border: '1.5px solid rgba(255,255,255,0.06)',
                boxShadow: '0 2px 14px rgba(26,22,18,0.06)',
                transition: 'all 0.22s', cursor: 'pointer', height: '100%',
                display: 'flex', flexDirection: 'column' as const, gap: 12,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(201,150,60,0.2)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(201,150,60,0.08)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 14px rgba(26,22,18,0.06)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(201,150,60,0.12)', border: '1px solid rgba(201,150,60,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    {doc.icon}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#DBA84A', background: 'rgba(201,150,60,0.12)', border: '1px solid rgba(201,150,60,0.18)', borderRadius: 7, padding: '4px 9px' }}>{doc.format}</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#F7F2EA', marginBottom: 4 }}>{doc.title}</div>
                  <div style={{ fontSize: 13, color: '#9A8C7C', lineHeight: 1.5 }}>{doc.desc}</div>
                </div>
                <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#7A6E5E', textTransform: 'uppercase' as const, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 100, padding: '4px 10px' }}>{doc.cat}</span>
                </div>
              </div>
            )
            return doc.link ? (
              <Link key={doc.id} href={doc.link} style={{ textDecoration: 'none' }}>{inner}</Link>
            ) : (
              <div key={doc.id}>{inner}</div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: '#1A1612', borderTop: '1px solid rgba(201,150,60,0.1)', padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: '#F7F2EA', marginBottom: 8 }}>AlltagsEngel UG</div>
          <div style={{ fontSize: 13, color: '#7A6E5E', marginBottom: 16 }}>(haftungsbeschränkt)</div>
          <div style={{ fontSize: 13, color: '#9A8C7C', lineHeight: 1.8 }}>
            Yusuf Ferhat Demir · Gründer & CEO<br />
            Schiller Str. 31, 60313 Frankfurt am Main<br />
            info@alltagsengel.care · www.alltagsengel.de
          </div>
          <div style={{ marginTop: 20, fontSize: 11, color: '#5A4E3E' }}>
            © 2026 AlltagsEngel UG. Vertraulich — nur für autorisierte Investoren.
          </div>
        </div>
      </div>
    </div>
  )
}
