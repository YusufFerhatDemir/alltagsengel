'use client'
import { useState, useEffect, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { IconPin, IconSearch, IconUser, IconCard, IconStarFilled, IconCheck, IconStarGold, IconHandshakeGold, IconMedicalGold, IconBagGold, IconHomeGold, IconCoffeeGold, IconPillGold, IconWalkGold, IconTargetGold, IconWingsGold, IconBox, IconKrankenfahrtGold, IconHygieneboxGold } from '@/components/Icons'
import NotificationBell from '@/components/NotificationBell'
import { useRouter } from 'next/navigation'
import { haversineDistance } from '@/lib/geocoding'
import { useUserLocation } from '@/hooks/useUserLocation'
import { useTrackVisit } from '@/hooks/useTrackVisit'

const categories: { key: string; icon: ReactNode; label: string }[] = [
  { key: 'all', icon: <IconStarGold size={26} />, label: 'Alle' },
  { key: 'begleitung', icon: <IconHandshakeGold size={26} />, label: 'Begleitung' },
  { key: 'arzt', icon: <IconMedicalGold size={26} />, label: 'Arztbesuch' },
  { key: 'einkauf', icon: <IconBagGold size={26} />, label: 'Einkauf' },
  { key: 'haushalt', icon: <IconHomeGold size={26} />, label: 'Haushalt' },
  { key: 'freizeit', icon: <IconCoffeeGold size={26} />, label: 'Freizeit' },
  { key: 'apotheke', icon: <IconPillGold size={26} />, label: 'Apotheke' },
  { key: 'spazieren', icon: <IconWalkGold size={26} />, label: 'Spazieren' },
  { key: 'aktivitaeten', icon: <IconTargetGold size={26} />, label: 'Aktivitäten' },
  { key: 'krankenfahrdienst', icon: <IconKrankenfahrtGold size={26} />, label: 'Krankenfahrt' },
  { key: 'hygienebox', icon: <IconHygieneboxGold size={26} />, label: 'Hygienebox' },
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
  krankenfahrdienst: 'Krankenfahrdienst',
  hygienebox: 'Hygienebox',
}

export default function KundeHomePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [angels, setAngels] = useState<any[]>([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchRadius, setSearchRadius] = useState(10)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState('')
  const userLocation = useUserLocation()
  useTrackVisit('kunde')
  // Note: error state already defined above

  const load = async () => {
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p, error: profileErr } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
        if (profileErr) throw new Error('Profil konnte nicht geladen werden')
        setProfile(p)
        const { data: a, error: angelsErr } = await supabase.from('angels').select('*, profiles(*)').order('rating', { ascending: false })
        if (angelsErr) throw new Error('Engel konnte nicht geladen werden')
        setAngels(a || [])
      }
    } catch (err: any) {
      setError(err?.message || 'Ein Fehler beim Laden der Daten ist aufgetreten')
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Standort in Profil aktualisieren (GPS/IP)
  useEffect(() => {
    if (!userLocation.loading && userLocation.city && profile && !profile.location) {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          supabase.from('profiles').update({ location: userLocation.city }).eq('id', user.id)
        }
      })
    }
  }, [userLocation.loading, userLocation.city, profile])

  const firstName = profile?.first_name || ''

  if (error) return (
    <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 24px',textAlign:'center'}}>
      <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
      <p style={{color:'var(--ink3)',fontSize:14,marginBottom:16}}>{error}</p>
      <button onClick={()=>{setError('');load()}} style={{padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold2))',color:'var(--coal)',fontSize:13,fontWeight:600,cursor:'pointer'}}>Erneut versuchen</button>
    </div>
  )

  // Mesafe filtresi: GPS veya profil koordinatları ile hesapla
  const angelsWithDistance = angels.map((a: any) => {
    const aLat = a.profiles?.latitude
    const aLng = a.profiles?.longitude
    const pLat = profile?.latitude || userLocation.lat
    const pLng = profile?.longitude || userLocation.lng
    const distance = (pLat && pLng && aLat && aLng)
      ? haversineDistance(pLat, pLng, aLat, aLng)
      : null
    return { ...a, _distance: distance }
  })

  const filteredAngels = angelsWithDistance
    .filter((a: any) => {
      // İsim araması
      if (searchQuery.trim()) {
        const fullName = `${a.profiles?.first_name || ''} ${a.profiles?.last_name || ''}`.toLowerCase()
        const services = (a.services || []).join(' ').toLowerCase()
        const q = searchQuery.toLowerCase()
        if (!fullName.includes(q) && !services.includes(q)) return false
      }
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

  const filteredDemos = demoAngels.filter(a => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      if (!a.name.toLowerCase().includes(q) && !a.services.join(' ').toLowerCase().includes(q)) return false
    }
    if (activeCategory !== 'all') {
      if (!a.services.some(s => s.toLowerCase().includes(serviceMap[activeCategory]?.toLowerCase() || activeCategory))) return false
    }
    return true
  })

  return (
    <div className="screen" id="khome">
      <div className="kh-header">
        <div className="kh-row">
          <div>
            <div className="kh-greet">Willkommen zurück</div>
            <div className="kh-name">Hallo, {firstName}</div>
            <div className="kh-loc"><IconPin size={14} /> {profile?.location || 'Frankfurt am Main'} · {searchRadius} km</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NotificationBell />
            <Link href="/kunde/profil" className="kh-avatar" aria-label="Mein Profil"><IconUser size={22} /></Link>
          </div>
        </div>
      </div>

      <div className="kh-body">
        <div className="search-bar" id="search-bar">
          <span><IconSearch size={16} aria-hidden="true" /></span>
          <input
            type="text"
            className="search-input"
            placeholder="Engel suchen..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Engel nach Name oder Service durchsuchen"
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')} aria-label="Sucheingabe löschen">✕</button>
          )}
        </div>

        <div className="radius-bar">
          <div className="radius-label"><IconPin size={13} /> Suchradius</div>
          <div className="radius-options" role="radiogroup" aria-label="Suchradius auswählen">
            {[5, 10, 25, 50].map(r => (
              <button
                key={r}
                className={`radius-chip${searchRadius === r ? ' active' : ''}`}
                onClick={() => setSearchRadius(r)}
                role="radio"
                aria-checked={searchRadius === r}
                aria-label={`${r} Kilometer`}
              >
                {r} km
              </button>
            ))}
          </div>
        </div>

        <div className="cat-list" role="tablist" aria-label="Service-Kategorien">
          {categories.map(cat => (
            <div
              key={cat.key}
              className={`cat-item${activeCategory === cat.key ? ' on' : ''}`}
              onClick={() => {
                if (cat.key === 'all') { setActiveCategory('all'); return }
                if (cat.key === 'krankenfahrdienst') { router.push('/kunde/krankenfahrt'); return }
                if (cat.key === 'hygienebox') { router.push('/kunde/hygienebox'); return }
                router.push(`/kunde/buchen-service?service=${cat.key}`)
              }}
              role="tab"
              aria-selected={activeCategory === cat.key}
              tabIndex={activeCategory === cat.key ? 0 : -1}
              aria-label={cat.label}
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
              <div className="banner-sub">Bis zu <strong>131€/Monat</strong> über Ihre Pflegekasse. Direkt über Alltagsengel abrechnen.</div>
            </div>
          </div>
          <div className="banner-pills">
            <span className="banner-pill">Pflegegrad 1-5</span>
            <span className="banner-pill">Direkte Abrechnung</span>
            <span className="banner-pill">1.572€/Jahr</span>
          </div>
        </div>

        <Link href="/kunde/hygienebox" style={{ textDecoration: 'none' }}>
          <div className="banner-pflegebox">
            <div className="banner-row">
              <div className="banner-icon"><IconBox size={22} /></div>
              <div>
                <div className="banner-title">Hygienebox bestellen</div>
                <div className="banner-sub">Bis <strong>42 €/Monat</strong> • Handschuhe, Desinfektion, Masken, Bettschutzeinlagen</div>
              </div>
            </div>
            <div className="banner-pills">
              <span className="banner-pill">Pflegegrad 1–5</span>
              <span className="banner-pill">0 € Eigenanteil</span>
              <span className="banner-pill">Jetzt bestellen</span>
            </div>
          </div>
        </Link>

        <div className="quick-links">
          <Link href="/kunde/krankenfahrt" className="quick-link">
            <IconKrankenfahrtGold size={20} />
            <span>Krankenfahrt buchen</span>
          </Link>
          <Link href="/kunde/buchungen" className="quick-link">
            <IconCheck size={18} />
            <span>Meine Buchungen</span>
          </Link>
          <Link href="/kunde/notfall" className="quick-link">
            <span>Notfall & Medikamente</span>
          </Link>
        </div>

        <div className="section-row">
          <div className="section-title">
            {activeCategory === 'all' ? 'Top Engel' : categories.find(c => c.key === activeCategory)?.label || 'Engel'}
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink4)', marginLeft: 6 }}>im Umkreis von {searchRadius} km</span>
          </div>
          <div className="section-link">Alle ansehen</div>
        </div>

        {filteredAngels.length > 0 ? (
          <>
          {filteredAngels.map((angel: any) => (
          <Link key={angel.id} href={`/kunde/engel/${angel.id}`} style={{ textDecoration: 'none' }} aria-label={`${angel.profiles?.first_name} ${angel.profiles?.last_name?.[0]}., Bewertung ${angel.rating}, ${angel.total_jobs} Einsätze`}>
            <div className={`engel-card${angel.is_online ? ' engel-online' : ''}`}>
              <div className={`engel-avatar${angel.is_online ? ' glow-available' : ''}`} style={{ background: angel.profiles?.avatar_color || 'var(--gold-pale)' }} aria-label={`${angel.profiles?.first_name} ist ${angel.is_online ? 'online' : 'offline'}`}>
                <IconWingsGold size={34} />
                <div className={`online-dot${angel.is_online ? '' : ' away'}`}></div>
              </div>
              <div className="engel-info">
                <div className="engel-row1">
                  <div className="engel-name">{angel.profiles?.first_name} {angel.profiles?.last_name?.[0]}.</div>
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
        ))}
          </>
        ) : filteredDemos.length > 0 ? (
          <>
          <div style={{ textAlign: 'center', padding: '12px 16px 4px', color: 'rgba(201,150,60,0.6)', fontSize: 12, fontStyle: 'italic' }}>
            Vorschau — Diese Engel werden bald in Ihrer Nähe verfügbar sein
          </div>
          {filteredDemos.map(angel => (
          <Link key={angel.id} href={`/kunde/engel/${angel.id}`} style={{ textDecoration: 'none' }} aria-label={`${angel.name}, Bewertung ${angel.rating}, ${angel.jobs} Einsätze`}>
            <div className={`engel-card${angel.online ? ' engel-online' : ''}`}>
              <div className={`engel-avatar${angel.online ? ' glow-available' : ''}`} style={{ background: angel.bg }} aria-label={`${angel.name} ist ${angel.online ? 'online' : 'offline'}`}>
                <IconWingsGold size={34} /><div className={`online-dot${angel.online ? '' : ' away'}`}></div>
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
        ))}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--ink4)', fontSize: 14 }}>
            Keine Engel für diese Kategorie gefunden.
          </div>
        )}
      </div>
    </div>
  )
}
