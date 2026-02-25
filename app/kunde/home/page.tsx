'use client'
import { useState, useEffect, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { IconStar, IconHandshake, IconMedical, IconBag, IconHome as IconHouse, IconCoffee, IconPill, IconWalk, IconTarget, IconPin, IconSearch, IconUser, IconWings, IconCard, IconStarFilled, IconCheck } from '@/components/Icons'
import { haversineDistance } from '@/lib/geocoding'

const categories: { key: string; icon: ReactNode; label: string }[] = [
  { key: 'all', icon: <IconStar size={18} />, label: 'Alle' },
  { key: 'begleitung', icon: <IconHandshake size={18} />, label: 'Begleitung' },
  { key: 'arzt', icon: <IconMedical size={18} />, label: 'Arztbesuch' },
  { key: 'einkauf', icon: <IconBag size={18} />, label: 'Einkauf' },
  { key: 'haushalt', icon: <IconHouse size={18} />, label: 'Haushalt' },
  { key: 'freizeit', icon: <IconCoffee size={18} />, label: 'Freizeit' },
  { key: 'apotheke', icon: <IconPill size={18} />, label: 'Apotheke' },
  { key: 'spazieren', icon: <IconWalk size={18} />, label: 'Spazieren' },
  { key: 'aktivitaeten', icon: <IconTarget size={18} />, label: 'Aktivitäten' },
]

const serviceMap: Record<string, string> = {
  begleitung: 'Begleitung',
  arzt: 'Arztbesuch',
  einkauf: 'Einkauf',
  haushalt: 'Haushalt',
  freizeit: 'Freizeit',
  apotheke: 'Apotheke',
  spazieren: 'Spazieren',
  aktivitaeten: 'Aktivitäten',
}

export default function KundeHomePage() {
  const [profile, setProfile] = useState<any>(null)
  const [angels, setAngels] = useState<any[]>([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchRadius, setSearchRadius] = useState(10)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(p)
        const { data: a } = await supabase.from('angels').select('*, profiles(*)').order('rating', { ascending: false })
        setAngels(a || [])
      }
    }
    load()
  }, [])

  const firstName = profile?.first_name || 'Maria'

  // Mesafe filtresi: Müşteri ve engel koordinatları varsa hesapla
  const angelsWithDistance = angels.map((a: any) => {
    const aLat = a.profiles?.latitude
    const aLng = a.profiles?.longitude
    const pLat = profile?.latitude
    const pLng = profile?.longitude
    const distance = (pLat && pLng && aLat && aLng)
      ? haversineDistance(pLat, pLng, aLat, aLng)
      : null
    return { ...a, _distance: distance }
  })

  const filteredAngels = angelsWithDistance
    .filter((a: any) => {
      // Kategori filtresi
      if (activeCategory !== 'all') {
        const match = (a.services || []).some((s: string) =>
          s.toLowerCase().includes(serviceMap[activeCategory]?.toLowerCase() || activeCategory)
        )
        if (!match) return false
      }
      // Mesafe filtresi (koordinat yoksa engeli göster)
      if (a._distance !== null && a._distance > searchRadius) return false
      return true
    })
    .sort((a: any, b: any) => {
      if (a._distance !== null && b._distance !== null) return a._distance - b._distance
      if (a._distance !== null) return -1
      if (b._distance !== null) return 1
      return 0
    })

  const demoAngels = [
    { id: 'demo-anna', name: 'Anna Müller', rating: 4.9, jobs: 127, services: ['Begleitung', 'Einkauf', 'Haushalt'], price: 32, online: true, bg: 'var(--gold-pale)', is45b: true },
    { id: 'demo-thomas', name: 'Thomas Weber', rating: 4.8, jobs: 89, services: ['Arztbesuch', 'Begleitung', 'Spazieren'], price: 28, online: true, bg: 'var(--green-pale)', is45b: true },
    { id: 'demo-lisa', name: 'Lisa Schneider', rating: 4.7, jobs: 56, services: ['Freizeit', 'Haushalt', 'Apotheke'], price: 30, online: false, bg: 'var(--cream2)', is45b: true },
  ]

  const filteredDemos = activeCategory === 'all'
    ? demoAngels
    : demoAngels.filter(a => a.services.some(s =>
        s.toLowerCase().includes(serviceMap[activeCategory]?.toLowerCase() || activeCategory)
      ))

  return (
    <div className="screen" id="khome">
      <div className="kh-header">
        <div className="kh-row">
          <div>
            <div className="kh-greet">Willkommen zurück</div>
            <div className="kh-name">Hallo, {firstName}</div>
            <div className="kh-loc"><IconPin size={14} /> {profile?.location || 'Berlin'} · {searchRadius} km</div>
          </div>
          <div className="kh-avatar"><IconUser size={22} /></div>
        </div>
      </div>

      <div className="kh-body">
        <div className="search-bar">
          <span><IconSearch size={16} /></span>
          <span className="search-placeholder">Engel suchen...</span>
        </div>

        <div className="radius-bar">
          <div className="radius-label"><IconPin size={13} /> Suchradius</div>
          <div className="radius-options">
            {[5, 10, 25, 50].map(r => (
              <button
                key={r}
                className={`radius-chip${searchRadius === r ? ' active' : ''}`}
                onClick={() => setSearchRadius(r)}
              >
                {r} km
              </button>
            ))}
          </div>
        </div>

        <div className="cat-list">
          {categories.map(cat => (
            <div
              key={cat.key}
              className={`cat-item${activeCategory === cat.key ? ' on' : ''}`}
              onClick={() => setActiveCategory(cat.key)}
            >
              <div className="cat-ic">{cat.icon}</div>
              <div className="cat-lbl">{cat.label}</div>
            </div>
          ))}
        </div>

        <div className="banner-45b">
          <div className="banner-row">
            <div className="banner-icon"><IconCard size={22} /></div>
            <div>
              <div className="banner-title">§45b Entlastungsbetrag</div>
              <div className="banner-sub">Bis zu <strong>125€/Monat</strong> über Ihre Pflegekasse. Direkt über Alltagsengel abrechnen.</div>
            </div>
          </div>
          <div className="banner-pills">
            <span className="banner-pill">Pflegegrad 1-5</span>
            <span className="banner-pill">Direkte Abrechnung</span>
            <span className="banner-pill">1.500€/Jahr</span>
          </div>
        </div>

        <div className="section-row">
          <div className="section-title">
            {activeCategory === 'all' ? 'Top Engel' : categories.find(c => c.key === activeCategory)?.label || 'Engel'}
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink4)', marginLeft: 6 }}>im Umkreis von {searchRadius} km</span>
          </div>
          <div className="section-link">Alle ansehen</div>
        </div>

        {filteredAngels.length > 0 ? filteredAngels.map((angel: any) => (
          <Link key={angel.id} href={`/kunde/engel/${angel.id}`} style={{ textDecoration: 'none' }}>
            <div className="engel-card">
              <div className="engel-avatar" style={{ background: angel.profiles?.avatar_color || 'var(--gold-pale)' }}>
                <IconWings size={22} />
                <div className={`online-dot${angel.is_online ? '' : ' away'}`}></div>
              </div>
              <div className="engel-info">
                <div className="engel-row1">
                  <div className="engel-name">{angel.profiles?.first_name} {angel.profiles?.last_name}</div>
                  <div className="engel-rating"><IconStarFilled size={13} /> {angel.rating}</div>
                </div>
                <div className="engel-cert"><IconCheck size={12} /> Zertifiziert · {angel.total_jobs} Einsätze{angel._distance !== null ? ` · ${angel._distance.toFixed(1)} km` : angel.profiles?.location ? ` · ${angel.profiles.location}` : ''}</div>
                <div className="engel-tags">
                  {(angel.services || []).slice(0, 3).map((s: string) => (
                    <span key={s} className="engel-tag">{s}</span>
                  ))}
                </div>
                <div className="engel-price-row">
                  <div className="engel-price">{angel.hourly_rate}€ <span>/Std.</span></div>
                  {angel.is_45b_capable && <div className="badge-45b"><IconCard size={12} /> §45b</div>}
                </div>
              </div>
            </div>
          </Link>
        )) : filteredDemos.length > 0 ? filteredDemos.map(angel => (
          <Link key={angel.id} href={`/kunde/engel/${angel.id}`} style={{ textDecoration: 'none' }}>
            <div className="engel-card">
              <div className="engel-avatar" style={{ background: angel.bg }}>
                <IconWings size={22} /><div className={`online-dot${angel.online ? '' : ' away'}`}></div>
              </div>
              <div className="engel-info">
                <div className="engel-row1"><div className="engel-name">{angel.name}</div><div className="engel-rating"><IconStarFilled size={13} /> {angel.rating}</div></div>
                <div className="engel-cert"><IconCheck size={12} /> Zertifiziert · {angel.jobs} Einsätze</div>
                <div className="engel-tags">
                  {angel.services.slice(0, 3).map(s => (
                    <span key={s} className="engel-tag">{s}</span>
                  ))}
                </div>
                <div className="engel-price-row">
                  <div className="engel-price">{angel.price}€ <span>/Std.</span></div>
                  {angel.is45b && <div className="badge-45b"><IconCard size={12} /> §45b</div>}
                </div>
              </div>
            </div>
          </Link>
        )) : (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--ink4)', fontSize: 14 }}>
            Keine Engel für diese Kategorie gefunden.
          </div>
        )}
      </div>
    </div>
  )
}
