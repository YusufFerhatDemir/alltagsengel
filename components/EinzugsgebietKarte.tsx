'use client'
import { useState } from 'react'
import Link from 'next/link'

// ═══════════════════════════════════════════════════════════
// EINZUGSGEBIET-KARTE + PLZ-SOFORT-CHECK
// ═══════════════════════════════════════════════════════════
// Stilisierte Rhein-Main-Karte (SVG, keine externen Tiles —
// schnell & DSGVO-frei) mit klickbaren Städten und einem
// PLZ-Check: "Sind wir bei Ihnen vor Ort?"
// ═══════════════════════════════════════════════════════════

interface Stadt {
  name: string
  slug?: string // → /alltagsbegleitung/<slug>
  x: number
  y: number
  gross?: boolean
}

// Positionen ≈ geografisch (lon 8.0–9.3 → x, lat 50.45–49.75 → y)
const STAEDTE: Stadt[] = [
  { name: 'Frankfurt', slug: 'frankfurt', x: 209, y: 146, gross: true },
  { name: 'Offenbach', slug: 'offenbach', x: 240, y: 156 },
  { name: 'Wiesbaden', slug: 'wiesbaden', x: 74, y: 159 },
  { name: 'Mainz', slug: 'mainz', x: 83, y: 196 },
  { name: 'Darmstadt', slug: 'darmstadt', x: 200, y: 249 },
  { name: 'Hanau', slug: 'hanau', x: 283, y: 137 },
  { name: 'Bad Homburg', slug: 'bad-homburg', x: 188, y: 94 },
  { name: 'Oberursel', x: 166, y: 110 },
  { name: 'Friedberg', x: 231, y: 47 },
  { name: 'Neu-Isenburg', x: 215, y: 176 },
  { name: 'Rodgau', x: 271, y: 190 },
  { name: 'Aschaffenburg', slug: 'aschaffenburg', x: 354, y: 201 },
]

// PLZ-Bereiche des Einzugsgebiets (Präfix → Region)
const PLZ_REGIONEN: { praefix: string; region: string }[] = [
  { praefix: '60', region: 'Frankfurt am Main' },
  { praefix: '65929', region: 'Frankfurt-Höchst' },
  { praefix: '6593', region: 'Frankfurt (West)' },
  { praefix: '611', region: 'Bad Vilbel / Wetterau' },
  { praefix: '613', region: 'Bad Homburg / Hochtaunus' },
  { praefix: '614', region: 'Oberursel / Hochtaunus' },
  { praefix: '630', region: 'Offenbach am Main' },
  { praefix: '631', region: 'Rodgau / Kreis Offenbach' },
  { praefix: '632', region: 'Neu-Isenburg / Kreis Offenbach' },
  { praefix: '634', region: 'Hanau' },
  { praefix: '635', region: 'Main-Kinzig-Kreis' },
  { praefix: '637', region: 'Aschaffenburg' },
  { praefix: '64', region: 'Darmstadt / Südhessen' },
  { praefix: '65', region: 'Wiesbaden / Main-Taunus' },
  { praefix: '551', region: 'Mainz' },
]

function pruefePlz(plz: string): string | null {
  // Längste Präfixe zuerst prüfen (spezifischste Region gewinnt)
  const sortiert = [...PLZ_REGIONEN].sort((a, b) => b.praefix.length - a.praefix.length)
  for (const r of sortiert) {
    if (plz.startsWith(r.praefix)) return r.region
  }
  return null
}

export default function EinzugsgebietKarte() {
  const [plz, setPlz] = useState('')
  const [ergebnis, setErgebnis] = useState<'idle' | 'drin' | 'draussen'>('idle')
  const [region, setRegion] = useState('')
  const [aktiveStadt, setAktiveStadt] = useState<string | null>(null)

  function checken(e: React.FormEvent) {
    e.preventDefault()
    if (!/^[0-9]{5}$/.test(plz)) return
    const r = pruefePlz(plz)
    if (r) {
      setRegion(r)
      setErgebnis('drin')
    } else {
      setErgebnis('draussen')
    }
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 'clamp(18px, 3vw, 28px)' }}>

      {/* PLZ-Check */}
      <form onSubmit={checken} style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Ihre PLZ, z. B. 60311"
          value={plz}
          onChange={e => { setPlz(e.target.value.replace(/\D/g, '').slice(0, 5)); setErgebnis('idle') }}
          pattern="[0-9]{5}"
          maxLength={5}
          aria-label="Postleitzahl eingeben"
          style={{ flex: 1, padding: '13px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#F5F0E8', fontSize: 16, outline: 'none', letterSpacing: '0.1em' }}
        />
        <button
          type="submit"
          disabled={plz.length !== 5}
          style={{ padding: '0 18px', borderRadius: 12, border: 'none', background: plz.length === 5 ? '#C9963C' : 'rgba(255,255,255,0.08)', color: plz.length === 5 ? '#1A1612' : '#6A6259', fontSize: 14, fontWeight: 700, cursor: plz.length === 5 ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
        >
          Prüfen
        </button>
      </form>

      <div aria-live="polite">
        {ergebnis === 'drin' && (
          <div style={{ background: 'rgba(45,106,79,0.15)', border: '1px solid rgba(45,106,79,0.35)', borderRadius: 12, padding: '12px 14px', marginTop: 10 }}>
            <div style={{ color: '#7DBE9C', fontSize: 14, fontWeight: 700 }}>✓ Ja! Wir sind in {region} für Sie da.</div>
            <div style={{ marginTop: 8 }}>
              <Link href="/termin"><button className="btn-gold" style={{ fontSize: 14, padding: '10px 18px' }}>Jetzt kostenlosen Termin buchen</button></Link>
            </div>
          </div>
        )}
        {ergebnis === 'draussen' && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,150,60,0.25)', borderRadius: 12, padding: '12px 14px', marginTop: 10 }}>
            <div style={{ color: '#E8C87E', fontSize: 14, fontWeight: 700 }}>Noch nicht regulär bei Ihnen — aber wir wachsen schnell.</div>
            <div style={{ color: '#B8B0A4', fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
              Fragen Sie unverbindlich an — oft können wir auch außerhalb des Kerngebiets helfen: <Link href="/kontakt" style={{ color: '#E8C87E', textDecoration: 'underline' }}>Kontakt aufnehmen</Link>
            </div>
          </div>
        )}
      </div>

      {/* Karte */}
      <div style={{ marginTop: 18 }}>
        <svg viewBox="0 0 400 290" role="img" aria-label="Karte des Einzugsgebiets: Frankfurt und Rhein-Main" style={{ width: '100%', height: 'auto', display: 'block' }}>
          {/* Main-Fluss (stilisiert) */}
          <path
            d="M 400 190 C 340 195, 300 150, 260 152 C 235 154, 228 148, 209 150 C 180 154, 150 140, 120 165 C 95 185, 60 175, 30 185"
            fill="none" stroke="rgba(120,160,200,0.35)" strokeWidth="7" strokeLinecap="round"
          />
          {/* Einzugsgebiet-Radius um Frankfurt */}
          <circle cx="209" cy="146" r="150" fill="rgba(201,150,60,0.05)" stroke="rgba(201,150,60,0.35)" strokeWidth="1.5" strokeDasharray="6 5" />
          <circle cx="209" cy="146" r="80" fill="rgba(201,150,60,0.06)" stroke="rgba(201,150,60,0.2)" strokeWidth="1" strokeDasharray="3 4" />

          {STAEDTE.map(s => {
            const aktiv = aktiveStadt === s.name
            const punkt = (
              <g
                key={s.name}
                onMouseEnter={() => setAktiveStadt(s.name)}
                onMouseLeave={() => setAktiveStadt(null)}
                style={{ cursor: s.slug ? 'pointer' : 'default' }}
              >
                {s.gross && <circle cx={s.x} cy={s.y} r="14" fill="rgba(232,200,126,0.18)"><animate attributeName="r" values="12;18;12" dur="3s" repeatCount="indefinite" /></circle>}
                <circle cx={s.x} cy={s.y} r={s.gross ? 7 : aktiv ? 6 : 4.5} fill={s.gross ? '#E8C87E' : aktiv ? '#E8C87E' : '#C9963C'} stroke="#1A1612" strokeWidth="1.5" />
                <text
                  x={s.x} y={s.y - (s.gross ? 13 : 10)}
                  textAnchor="middle"
                  style={{ fill: aktiv || s.gross ? '#F5F0E8' : '#B8B0A4', fontSize: s.gross ? 13 : 10.5, fontWeight: s.gross ? 800 : 600, fontFamily: 'inherit' }}
                >
                  {s.name}
                </text>
              </g>
            )
            return s.slug ? <Link key={s.name} href={`/alltagsbegleitung/${s.slug}`} aria-label={`Alltagsbegleitung in ${s.name}`}>{punkt}</Link> : punkt
          })}
        </svg>
        <p style={{ color: '#6A6259', fontSize: 11, textAlign: 'center', marginTop: 6 }}>
          Frankfurt am Main + gesamtes Rhein-Main-Gebiet · Städte antippen für lokale Infos
        </p>
      </div>
    </div>
  )
}
