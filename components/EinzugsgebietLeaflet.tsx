'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap } from 'leaflet'
import { pruefePlz, type Zone } from '@/lib/einzugsgebiet-plz'
import { getCookieConsent } from './CookieConsent'

// ═══════════════════════════════════════════════════════════
// EINZUGSGEBIET: LEAFLET-KARTE (OpenStreetMap) + PLZ-CHECK
// ═══════════════════════════════════════════════════════════
// Interaktive Karte mit 30-km-Radius um Frankfurt (PLZ 60313)
// und Sofort-Check: "Sind wir bei Ihnen verfügbar?"
// Kartendaten: © OpenStreetMap-Mitwirkende (Hinweis in /datenschutz)
//
// DSGVO/§25 TDDDG — Zwei-Klick-Lösung: OSM-Tiles werden NICHT
// beim Seitenaufruf geladen (IP-Übertragung an die OSM
// Foundation, UK). Stattdessen Platzhalter mit „Karte laden"-
// Button; nur bei bereits erteiltem Cookie-Consent
// (localStorage 'ae_cookie_consent' = 'accepted') lädt die
// Karte direkt. PLZ-Logik: lib/einzugsgebiet-plz.ts (geteilt
// mit EinzugsgebietKarte.tsx).
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

export default function EinzugsgebietLeaflet() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanz = useRef<LeafletMap | null>(null)
  const [plz, setPlz] = useState('')
  const [ergebnis, setErgebnis] = useState<{ zone: Zone; region: string } | 'idle'>('idle')
  // DSGVO-Zwei-Klick: Karte erst nach Klick bzw. bei vorhandenem Consent laden
  const [karteAktiv, setKarteAktiv] = useState(false)

  // Bereits erteilter Cookie-Consent → Karte direkt laden (kein zweiter Klick nötig)
  useEffect(() => {
    if (getCookieConsent() === 'accepted') setKarteAktiv(true)
    const onConsent = (e: Event) => {
      if ((e as CustomEvent).detail === 'accepted') setKarteAktiv(true)
    }
    window.addEventListener('ae_consent_change', onConsent)
    return () => window.removeEventListener('ae_consent_change', onConsent)
  }, [])

  useEffect(() => {
    if (!karteAktiv || !mapRef.current || mapInstanz.current) return
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
  }, [karteAktiv])

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
              <Link href="/termin" className="btn-gold" style={{ fontSize: 14, padding: '10px 18px' }}>Jetzt kostenlosen Termin buchen</Link>
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

      {/* ── Karte (DSGVO-Zwei-Klick: Tiles erst nach Klick/Consent) ── */}
      {karteAktiv ? (
        <div
          ref={mapRef}
          role="application"
          aria-label="Interaktive Karte des Einzugsgebiets: Frankfurt am Main und 30 Kilometer Umkreis"
          style={{ height: 'clamp(320px, 55vw, 460px)', borderRadius: 16, overflow: 'hidden', marginTop: 16, border: '1px solid rgba(255,255,255,0.1)', background: '#2a2a2a', zIndex: 0, position: 'relative' }}
        />
      ) : (
        <div
          style={{
            height: 'clamp(320px, 55vw, 460px)',
            borderRadius: 16,
            overflow: 'hidden',
            marginTop: 16,
            border: '1px solid rgba(201,150,60,0.2)',
            background: 'radial-gradient(circle at 50% 42%, rgba(201,150,60,0.1) 0%, rgba(201,150,60,0.03) 34%, transparent 62%), #1A1612',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            padding: '24px 20px',
            textAlign: 'center',
          }}
        >
          {/* Stilisierter Karten-Pin als dezenter Hinweis auf die Karte */}
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 21s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11Z" stroke="#C9963C" strokeWidth="1.5" fill="rgba(201,150,60,0.12)" />
            <circle cx="12" cy="10" r="2.6" stroke="#E8C87E" strokeWidth="1.5" fill="none" />
          </svg>
          <div style={{ color: '#F5F0E8', fontSize: 15, fontWeight: 700 }}>
            Interaktive Karte (OpenStreetMap)
          </div>
          <button
            type="button"
            onClick={() => setKarteAktiv(true)}
            className="btn-gold"
            style={{ fontSize: 14, padding: '12px 22px' }}
          >
            Karte laden
          </button>
          <p style={{ color: '#8A8279', fontSize: 12, lineHeight: 1.5, maxWidth: 360, margin: 0 }}>
            Beim Laden wird Ihre IP-Adresse an OpenStreetMap (UK) übertragen.{' '}
            <Link href="/datenschutz" style={{ color: '#C9963C', textDecoration: 'underline' }}>Datenschutzerklärung</Link>
          </p>
        </div>
      )}
      <p style={{ color: '#6A6259', fontSize: 11, textAlign: 'center', marginTop: 6 }}>
        Kerngebiet: Frankfurt am Main (PLZ 60313) + 30 km Umkreis · Städte antippen für lokale Infos
      </p>
    </div>
  )
}
