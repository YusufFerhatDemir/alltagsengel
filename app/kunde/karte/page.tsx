'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { IconPin, IconWingsGold, IconStarFilled, IconNav } from '@/components/Icons'
import Icon3D from '@/components/Icon3D'

export default function KarteSeite() {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const [profile, setProfile] = useState<any>(null)
  const [angels, setAngels] = useState<any[]>([])
  const [selectedAngel, setSelectedAngel] = useState<any>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const leafletMap = useRef<any>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p)
      const { data: a } = await supabase.from('angels').select('*, profiles(*)').eq('is_online', true)
      setAngels(a || [])
    }
    load()
  }, [])

  useEffect(() => {
    if (!profile || mapLoaded) return

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => {
      const L = (window as any).L
      if (!L || !mapRef.current) return

      const lat = profile.latitude || 50.1109
      const lng = profile.longitude || 8.6821
      const map = L.map(mapRef.current).setView([lat, lng], 13)
      leafletMap.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 18,
      }).addTo(map)

      const goldIcon = L.divIcon({
        className: 'map-marker-user',
        html: '<div style="width:16px;height:16px;border-radius:50%;background:var(--gold);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3)"></div>',
        iconSize: [16, 16],
      })
      L.marker([lat, lng], { icon: goldIcon }).addTo(map).bindPopup('Dein Standort')

      angels.forEach(a => {
        const aLat = a.profiles?.latitude
        const aLng = a.profiles?.longitude
        if (!aLat || !aLng) return

        const angelIcon = L.divIcon({
          className: 'map-marker-angel',
          html: '<div style="width:32px;height:32px;border-radius:10px;background:#1A1612;border:2px solid #C9963C;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);font-size:16px;color:#C9963C">&#10025;</div>',
          iconSize: [32, 32],
        })

        L.marker([aLat, aLng], { icon: angelIcon })
          .addTo(map)
          .on('click', () => setSelectedAngel(a))
      })

      setMapLoaded(true)
    }
    document.head.appendChild(script)
  }, [profile, angels, mapLoaded])

  return (
    <div className="screen" id="karte">
      <div className="topbar" style={{ position: 'absolute', top: 48, zIndex: 1000, background: 'transparent' }}>
        <button className="back-btn" onClick={() => router.back()} type="button" style={{ background: 'var(--coal)', borderColor: 'rgba(201,150,60,.2)' }}>‹</button>
        <div className="topbar-title" style={{ color: 'white', textShadow: '0 1px 4px rgba(0,0,0,.5)' }}>Engel in der Nähe</div>
      </div>

      <div ref={mapRef} className="map-container"></div>

      {selectedAngel && (
        <div className="map-card">
          <div className="map-card-close" onClick={() => setSelectedAngel(null)}>&times;</div>
          <div className="engel-card" style={{ marginBottom: 0 }}>
            <div className="engel-avatar" style={{ overflow: 'visible' }}>
              <Icon3D size={62} />
            </div>
            <div className="engel-info">
              <div className="engel-row1">
                <div className="engel-name">{selectedAngel.profiles?.first_name} {selectedAngel.profiles?.last_name?.[0]}.</div>
                <div className="engel-rating"><IconStarFilled size={13} /> {selectedAngel.rating}</div>
              </div>
              <div className="engel-cert" style={{ color: 'var(--green)' }}>{selectedAngel.total_jobs} Einsätze · 32€/h</div>
              <Link href={`/kunde/engel/${selectedAngel.id}`}>
                <button className="map-card-btn">Profil ansehen</button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
