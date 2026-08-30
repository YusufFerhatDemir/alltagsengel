'use client'
// ═══════════════════════════════════════════════════════════════════════
// Standortkarte — OpenStreetMap via Leaflet
// ═══════════════════════════════════════════════════════════════════════
//
// KEIN GOOGLE MAPS. Die Kacheln kommen von der OpenStreetMap
// Foundation; es wird keine Kennung, kein Konto und kein Suchbegriff an
// einen Kartenanbieter uebertragen — nur der Kachelausschnitt, den der
// Browser ohnehin anfordern muss.
//
// ZWEI-KLICK, WIE AUF DER OEFFENTLICHEN SEITE
// Der Kachelabruf uebertraegt die IP-Adresse an die OSM Foundation (UK).
// Dieselbe Regel wie in components/EinzugsgebietLeaflet.tsx: die Karte
// laedt erst nach einem ausdruecklichen Klick. Die Entscheidung wird
// lokal gemerkt, damit es bei EINEM Klick bleibt und nicht bei einem je
// Seitenaufruf.
//
// WAS DIE KARTE ZEIGT
//   * je Konto eine Spur (Linie) durch die Punkte des Zeitraums
//   * den juengsten Punkt als gefuellten Kreis mit Genauigkeitsradius
//   * aeltere Punkte als kleine Ringe
// Der Genauigkeitsradius steht bewusst mit auf der Karte: ein Punkt mit
// 1200 m Genauigkeit sieht ohne ihn genauso genau aus wie einer mit 8 m,
// und daraus werden falsche Schluesse gezogen.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap, LayerGroup } from 'leaflet'

const SPEICHER_SCHLUESSEL = 'ae_admin_standortkarte_osm'

/** Mitte Hessen — nur der Startausschnitt, bevor Punkte da sind. */
const ZENTRUM: [number, number] = [50.1155, 8.6842]

export interface KartenPunkt {
  id: string
  userId: string
  latitude: number
  longitude: number
  accuracyMeters: number | null
  timestampUtc: string
  plattform: string | null
  modus: string
  serviceId: string | null
}

export interface KartenKonto {
  userId: string
  name: string | null
  email: string | null
  modus: string
}

/**
 * Farbe je Konto. Deterministisch aus der Kennung — dieselbe Person hat
 * ueber Neuladen hinweg dieselbe Farbe, ohne dass irgendwo eine
 * Zuordnung gespeichert werden muesste.
 */
const PALETTE = [
  '#C9963C', '#2D8F5E', '#3C7DC9', '#B4533C', '#8A5CC9',
  '#2E9C9C', '#C93C8A', '#7A8F2D',
]

export function farbeFuer(userId: string): string {
  let summe = 0
  for (let i = 0; i < userId.length; i++) summe = (summe * 31 + userId.charCodeAt(i)) % 100_000
  return PALETTE[summe % PALETTE.length]
}

/** Popups bekommen HTML. Namen und Adressen sind Daten, kein Markup. */
function escape(wert: string | null | undefined): string {
  if (!wert) return ''
  return wert
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function zeitpunkt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'medium',
    })
  } catch { return iso }
}

export default function StandortKarte({
  punkte, konten, hoehe = 460,
}: {
  punkte: KartenPunkt[]
  konten: KartenKonto[]
  hoehe?: number
}) {
  const behaelter = useRef<HTMLDivElement>(null)
  const karte = useRef<LeafletMap | null>(null)
  const ebene = useRef<LayerGroup | null>(null)
  const [aktiv, setAktiv] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(SPEICHER_SCHLUESSEL) === 'ja') setAktiv(true)
    } catch {
      // Privates Fenster oder blockierter Speicher: dann eben ein Klick.
    }
  }, [])

  // ── Karte anlegen ────────────────────────────────────────────────
  useEffect(() => {
    if (!aktiv || !behaelter.current || karte.current) return
    let lebt = true

    import('leaflet').then(({ default: L }) => {
      if (!lebt || !behaelter.current || karte.current) return
      const map = L.map(behaelter.current, {
        center: ZENTRUM, zoom: 10, scrollWheelZoom: true, attributionControl: true,
      })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
      }).addTo(map)
      ebene.current = L.layerGroup().addTo(map)
      karte.current = map
    })

    return () => {
      lebt = false
      karte.current?.remove()
      karte.current = null
      ebene.current = null
    }
  }, [aktiv])

  // ── Punkte zeichnen ──────────────────────────────────────────────
  useEffect(() => {
    if (!aktiv || !karte.current || !ebene.current) return
    let lebt = true

    import('leaflet').then(({ default: L }) => {
      const map = karte.current
      const gruppe = ebene.current
      if (!lebt || !map || !gruppe) return

      gruppe.clearLayers()
      if (!punkte.length) return

      const nameJeKonto = new Map(konten.map(k => [k.userId, k.name || k.email || k.userId]))

      // Nach Konto buendeln, aufsteigend nach Zeit (die Abfrage liefert
      // absteigend — eine Spur soll aber vorwaerts laufen).
      const jeKonto = new Map<string, KartenPunkt[]>()
      for (const p of punkte) {
        const liste = jeKonto.get(p.userId)
        if (liste) liste.push(p)
        else jeKonto.set(p.userId, [p])
      }

      const alle: Array<[number, number]> = []

      for (const [userId, roh] of jeKonto) {
        const liste = [...roh].sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc))
        const farbe = farbeFuer(userId)
        const bezeichnung = escape(nameJeKonto.get(userId) ?? userId)
        const koordinaten = liste.map(p => [p.latitude, p.longitude] as [number, number])
        alle.push(...koordinaten)

        if (koordinaten.length > 1) {
          L.polyline(koordinaten, {
            color: farbe, weight: 2, opacity: 0.55, dashArray: '4 5',
          }).addTo(gruppe)
        }

        liste.forEach((p, i) => {
          const juengster = i === liste.length - 1

          if (juengster && p.accuracyMeters && p.accuracyMeters > 0) {
            L.circle([p.latitude, p.longitude], {
              radius: p.accuracyMeters,
              color: farbe, weight: 1, opacity: 0.5,
              fillColor: farbe, fillOpacity: 0.08,
            }).addTo(gruppe)
          }

          const marker = L.circleMarker([p.latitude, p.longitude], {
            radius: juengster ? 8 : 4,
            color: farbe,
            weight: juengster ? 2 : 1,
            fillColor: juengster ? farbe : '#00000000',
            fillOpacity: juengster ? 1 : 0,
          }).addTo(gruppe)

          marker.bindPopup(
            `<strong>${bezeichnung}</strong><br/>`
            + `${escape(zeitpunkt(p.timestampUtc))}<br/>`
            + `Genauigkeit: ${p.accuracyMeters == null ? 'unbekannt' : `${Math.round(p.accuracyMeters)} m`}<br/>`
            + `Modus: ${escape(p.modus)}<br/>`
            + `Plattform: ${escape(p.plattform ?? 'unbekannt')}`
            + (p.serviceId ? '<br/>Einsatz zugeordnet' : ''),
          )
        })
      }

      if (alle.length) map.fitBounds(L.latLngBounds(alle), { padding: [30, 30], maxZoom: 16 })
    })

    return () => { lebt = false }
  }, [aktiv, punkte, konten])

  if (!aktiv) {
    return (
      <div style={{
        height: hoehe, borderRadius: 12, border: '1px solid var(--border)',
        background: 'var(--coal2)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 14, color: 'var(--ink3)', maxWidth: 460, lineHeight: 1.6 }}>
          Die Karte lädt Kartenausschnitte von der OpenStreetMap Foundation (UK).
          Dabei wird die IP-Adresse dieses Browsers an deren Server übertragen.
          Die Standortdaten selbst verlassen dabei nichts — sie werden hier gezeichnet.
        </div>
        <button
          type="button"
          onClick={() => {
            setAktiv(true)
            try { localStorage.setItem(SPEICHER_SCHLUESSEL, 'ja') } catch { /* egal */ }
          }}
          style={{
            fontSize: 13, fontWeight: 600, color: 'var(--coal)', background: '#C9963C',
            border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Karte laden
        </button>
      </div>
    )
  }

  return (
    <div
      ref={behaelter}
      className="map-container"
      style={{
        height: hoehe, borderRadius: 12, overflow: 'hidden',
        border: '1px solid var(--border)', background: 'var(--coal2)',
      }}
    />
  )
}
