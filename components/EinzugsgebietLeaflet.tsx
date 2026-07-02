'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap } from 'leaflet'

// ═══════════════════════════════════════════════════════════
// EINZUGSGEBIET: LEAFLET-KARTE (OpenStreetMap) + PLZ-CHECK
// ═══════════════════════════════════════════════════════════
// Interaktive Karte mit 30-km-Radius um Frankfurt (PLZ 60313)
// und Sofort-Check: "Sind wir bei Ihnen verfügbar?"
// Kartendaten: © OpenStreetMap-Mitwirkende (Hinweis in /datenschutz)
// ═══════════════════════════════════════════════════════════

// Zentrum: Frankfurt am Main, PLZ 60313 (Innenstadt)
const ZENTRUM: [number, number] = [50.1155, 8.6842]
const RADIUS_METER = 30_000

interface Stadt {
  name: string
  lat: number
  lng: number
  slug?: string // → /alltagsbegleitung/<slug>
  gross?: boolean
}

const STAEDTE: Stadt[] = [
  { name: 'Frankfurt am Main', lat: 50.1109, lng: 8.6821, slug: 'frankfurt', gross: true },
  { name: 'Offenbach', lat: 50.0956, lng: 8.7761, slug: 'offenbach' },
  { name: 'Hanau', lat: 50.1328, lng: 8.9169, slug: 'hanau' },
  { name: 'Bad Homburg', lat: 50.2268, lng: 8.6182, slug: 'bad-homburg' },
  { name: 'Oberursel', lat: 50.2027, lng: 8.575 },
  { name: 'Bad Vilbel', lat: 50.1782, lng: 8.736 },
  { name: 'Maintal', lat: 50.1482, lng: 8.8367 },
  { name: 'Neu-Isenburg', lat: 50.0483, lng: 8.6967 },
  { name: 'Dreieich', lat: 50.0093, lng: 8.696 },
  { name: 'Langen', lat: 49.9895, lng: 8.6685 },
  { name: 'Dietzenbach', lat: 50.0084, lng: 8.777 },
  { name: 'Rodgau', lat: 50.0247, lng: 8.885 },
  { name: 'Eschborn', lat: 50.1435, lng: 8.5702 },
  { name: 'Hofheim', lat: 50.0876, lng: 8.4448 },
  { name: 'Kelkheim', lat: 50.137, lng: 8.4517 },
  { name: 'Rüsselsheim', lat: 49.9891, lng: 8.4113 },
  { name: 'Mörfelden-Walldorf', lat: 49.9793, lng: 8.5651 },
  { name: 'Darmstadt', lat: 49.8728, lng: 8.6512, slug: 'darmstadt' },
  { name: 'Friedberg', lat: 50.3374, lng: 8.7563 },
]

// ── PLZ-Zonen ──────────────────────────────────────────────
// Kerngebiet: Frankfurt + ca. 30 km Umkreis (PLZ-Präfixe)
const KERN: { praefix: string; region: string }[] = [
  { praefix: '60', region: 'Frankfurt am Main' },
  { praefix: '659', region: 'Frankfurt am Main (West)' },
  { praefix: '611', region: 'Bad Vilbel / Karben / Wetterau' },
  { praefix: '613', region: 'Bad Homburg / Hochtaunus' },
  { praefix: '614', region: 'Oberursel / Königstein / Kronberg' },
  { praefix: '630', region: 'Offenbach am Main' },
  { praefix: '631', region: 'Rodgau / Dietzenbach / Kreis Offenbach' },
  { praefix: '632', region: 'Langen / Neu-Isenburg' },
  { praefix: '633', region: 'Dreieich / Rödermark' },
  { praefix: '634', region: 'Hanau / Maintal / Bruchköbel' },
  { praefix: '6350', region: 'Seligenstadt' },
  { praefix: '6351', region: 'Hainburg' },
  { praefix: '642', region: 'Darmstadt' },
  { praefix: '643', region: 'Weiterstadt / Griesheim' },
  { praefix: '645', region: 'Groß-Gerau / Mörfelden-Walldorf' },
  { praefix: '654', region: 'Rüsselsheim / Kelsterbach' },
  { praefix: '657', region: 'Hofheim / Eschborn / Main-Taunus' },
  { praefix: '658', region: 'Bad Soden / Schwalbach / Main-Taunus' },
]

// Randgebiet: knapp außerhalb der 30 km — Anfrage lohnt sich
const RAND: { praefix: string; region: string }[] = [
  { praefix: '612', region: 'Bad Nauheim / Usingen' },
  { praefix: '635', region: 'Main-Kinzig-Kreis' },
  { praefix: '637', region: 'Aschaffenburg / Alzenau' },
  { praefix: '648', region: 'Dieburg / Darmstadt-Dieburg' },
  { praefix: '651', region: 'Wiesbaden' },
  { praefix: '652', region: 'Wiesbaden' },
  { praefix: '655', region: 'Idstein / Untertaunus' },
  { praefix: '551', region: 'Mainz' },
]

type Zone = 'kern' | 'rand' | null

function pruefePlz(plz: string): { zone: Zone; region: string } {
  const alle = [
    ...KERN.map(k => ({ ...k, zone: 'kern' as const })),
    ...RAND.map(r => ({ ...r, zone: 'rand' as const })),
  ].sort((a, b) => b.praefix.length - a.praefix.length)
  for (const e of alle) {
    if (plz.startsWith(e.praefix)) return { zone: e.zone, region: e.region }
  }
  return { zone: null, region: '' }
}

export default function EinzugsgebietLeaflet() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanz = useRef<LeafletMap | null>(null)
  const [plz, setPlz] = useState('')
  const [ergebnis, setErgebnis] = useState<{ zone: Zone; region: string } | 'idle'>('idle')

  useEffect(() => {
    if (!mapRef.current || mapInstanz.current) return
    let aktiv = true

    import('leaflet').then(({ default: L }) => {
      if (!aktiv || !mapRef.current || mapInstanz.current) return

      const map = L.map(mapRef.current, {
        center: ZENTRUM,
        zoom: 10,
        scrollWheelZoom: false,
        attributionControl: true,
      })
      mapInstanz.current = map

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
      }).addTo(map)

      // 30-km-Einzugsgebiet um Frankfurt (PLZ 60313)
      const kreis = L.circle(ZENTRUM, {
        radius: RADIUS_METER,
        color: '#C9963C',
        weight: 2,
        dashArray: '8 6',
        fillColor: '#C9963C',
        fillOpacity: 0.08,
      }).addTo(map)
      kreis.bindTooltip('Einzugsgebiet: Frankfurt + 30 km', { sticky: true })

      for (const s of STAEDTE) {
        const marker = L.circleMarker([s.lat, s.lng], {
          radius: s.gross ? 9 : 6,
          color: '#1A1612',
          weight: 1.5,
          fillColor: s.gross ? '#E8C87E' : '#C9963C',
          fillOpacity: 1,
        }).addTo(map)
        const link = s.slug
          ? `<br/><a href="/alltagsbegleitung/${s.slug}" style="color:#C9963C;font-weight:600">Alltagsbegleitung in ${s.name} →</a>`
          : ''
        marker.bindPopup(`<strong>${s.name}</strong>${link}`)
      }

      map.fitBounds(kreis.getBounds(), { padding: [10, 10] })
    })

    return () => {
      aktiv = false
      mapInstanz.current?.remove()
      mapInstanz.current = null
    }
  }, [])

  function checken(e: React.FormEvent) {
    e.preventDefault()
    if (!/^[0-9]{5}$/.test(plz)) return
    setErgebnis(pruefePlz(plz))
  }

  const erg = ergebnis === 'idle' ? null : ergebnis

  return (
    <div>
      {/* ── PLZ-Check ── */}
      <form onSubmit={checken} style={{ display: 'flex', gap: 10 }}>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Ihre PLZ, z. B. 60313"
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
        {erg?.zone === 'kern' && (
          <div style={{ background: 'rgba(45,106,79,0.15)', border: '1px solid rgba(45,106,79,0.35)', borderRadius: 12, padding: '12px 14px', marginTop: 10 }}>
            <div style={{ color: '#7DBE9C', fontSize: 14, fontWeight: 700 }}>✓ Ja, wir sind bei Ihnen verfügbar! ({erg.region})</div>
            <div style={{ marginTop: 8 }}>
              <Link href="/termin"><button className="btn-gold" style={{ fontSize: 14, padding: '10px 18px' }}>Jetzt kostenlosen Termin buchen</button></Link>
            </div>
          </div>
        )}
        {erg?.zone === 'rand' && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,150,60,0.25)', borderRadius: 12, padding: '12px 14px', marginTop: 10 }}>
            <div style={{ color: '#E8C87E', fontSize: 14, fontWeight: 700 }}>Randgebiet ({erg.region}) — fragen Sie uns an!</div>
            <div style={{ color: '#B8B0A4', fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
              Sie liegen knapp außerhalb unseres Kerngebiets. Oft können wir trotzdem helfen: <Link href="/kontakt" style={{ color: '#E8C87E', textDecoration: 'underline' }}>Kontakt aufnehmen</Link>
            </div>
          </div>
        )}
        {erg?.zone === null && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '12px 14px', marginTop: 10 }}>
            <div style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 700 }}>Leider noch nicht in Ihrem Gebiet.</div>
            <div style={{ color: '#B8B0A4', fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
              Wir wachsen schnell — hinterlassen Sie uns Ihre <Link href="/kontakt" style={{ color: '#E8C87E', textDecoration: 'underline' }}>Kontaktdaten</Link>, wir melden uns, sobald wir Ihre Region erreichen.
            </div>
          </div>
        )}
      </div>

      {/* ── Karte ── */}
      <div
        ref={mapRef}
        role="application"
        aria-label="Interaktive Karte des Einzugsgebiets: Frankfurt am Main und 30 Kilometer Umkreis"
        style={{ height: 'clamp(320px, 55vw, 460px)', borderRadius: 16, overflow: 'hidden', marginTop: 16, border: '1px solid rgba(255,255,255,0.1)', background: '#2a2a2a', zIndex: 0, position: 'relative' }}
      />
      <p style={{ color: '#6A6259', fontSize: 11, textAlign: 'center', marginTop: 6 }}>
        Kerngebiet: Frankfurt am Main (PLZ 60313) + 30 km Umkreis · Städte antippen für lokale Infos
      </p>
    </div>
  )
}
