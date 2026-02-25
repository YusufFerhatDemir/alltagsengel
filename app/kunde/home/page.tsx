import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const categories = [
  { key: 'all', icon: '⭐', label: 'Alle' },
  { key: 'begleitung', icon: '🤝', label: 'Begleitung' },
  { key: 'arzt', icon: '🏥', label: 'Arztbesuch' },
  { key: 'einkauf', icon: '🛒', label: 'Einkauf' },
  { key: 'haushalt', icon: '🏠', label: 'Haushalt' },
  { key: 'freizeit', icon: '☕', label: 'Freizeit' },
]

export default async function KundeHomePage() {
  let profile = null
  let angels: any[] = []

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      profile = p
      const { data: a } = await supabase.from('angels').select('*, profiles(*)').order('rating', { ascending: false })
      angels = a || []
    }
  } catch (err) {
    console.error('Kunde home load error:', err)
  }

  const firstName = profile?.first_name || 'Maria'

  return (
    <div className="screen" id="khome">
      <div className="kh-header">
        <div className="kh-row">
          <div>
            <div className="kh-greet">Willkommen zurück</div>
            <div className="kh-name">Hallo, {firstName}</div>
            <div className="kh-loc">📍 {profile?.location || 'Berlin'}</div>
          </div>
          <div className="kh-avatar">👤</div>
        </div>
      </div>

      <div className="kh-body">
        <div className="search-bar">
          <span>🔍</span>
          <span className="search-placeholder">Engel suchen...</span>
        </div>

        <div className="cat-list">
          {categories.map((cat, i) => (
            <div key={cat.key} className={`cat-item${i === 0 ? ' on' : ''}`}>
              <div className="cat-ic">{cat.icon}</div>
              <div className="cat-lbl">{cat.label}</div>
            </div>
          ))}
        </div>

        <div className="banner-45b">
          <div className="banner-row">
            <div className="banner-icon">💳</div>
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
          <div className="section-title">Top Engel</div>
          <div className="section-link">Alle ansehen</div>
        </div>

        {angels.length > 0 ? angels.map((angel: any) => (
          <Link key={angel.id} href={`/kunde/engel/${angel.id}`} style={{ textDecoration: 'none' }}>
            <div className="engel-card">
              <div className="engel-avatar" style={{ background: angel.profiles?.avatar_color || 'var(--gold-pale)' }}>
                👼
                <div className={`online-dot${angel.is_online ? '' : ' away'}`}></div>
              </div>
              <div className="engel-info">
                <div className="engel-row1">
                  <div className="engel-name">{angel.profiles?.first_name} {angel.profiles?.last_name}</div>
                  <div className="engel-rating">★ {angel.rating}</div>
                </div>
                <div className="engel-cert">✓ Zertifiziert · {angel.total_jobs} Einsätze</div>
                <div className="engel-tags">
                  {(angel.services || []).slice(0, 3).map((s: string) => (
                    <span key={s} className="engel-tag">{s}</span>
                  ))}
                </div>
                <div className="engel-price-row">
                  <div className="engel-price">{angel.hourly_rate}€ <span>/Std.</span></div>
                  {angel.is_45b_capable && <div className="badge-45b">💳 §45b</div>}
                </div>
              </div>
            </div>
          </Link>
        )) : (
          <>
            <Link href="/kunde/engel/demo-anna" style={{ textDecoration: 'none' }}>
              <div className="engel-card">
                <div className="engel-avatar" style={{ background: 'var(--gold-pale)' }}>👼<div className="online-dot"></div></div>
                <div className="engel-info">
                  <div className="engel-row1"><div className="engel-name">Anna Müller</div><div className="engel-rating">★ 4.9</div></div>
                  <div className="engel-cert">✓ Zertifiziert · 127 Einsätze</div>
                  <div className="engel-tags"><span className="engel-tag">Begleitung</span><span className="engel-tag">Einkauf</span><span className="engel-tag">Haushalt</span></div>
                  <div className="engel-price-row"><div className="engel-price">32€ <span>/Std.</span></div><div className="badge-45b">💳 §45b</div></div>
                </div>
              </div>
            </Link>
            <Link href="/kunde/engel/demo-thomas" style={{ textDecoration: 'none' }}>
              <div className="engel-card">
                <div className="engel-avatar" style={{ background: 'var(--green-pale)' }}>👼<div className="online-dot"></div></div>
                <div className="engel-info">
                  <div className="engel-row1"><div className="engel-name">Thomas Weber</div><div className="engel-rating">★ 4.8</div></div>
                  <div className="engel-cert">✓ Zertifiziert · 89 Einsätze</div>
                  <div className="engel-tags"><span className="engel-tag">Arztbesuch</span><span className="engel-tag">Begleitung</span></div>
                  <div className="engel-price-row"><div className="engel-price">28€ <span>/Std.</span></div><div className="badge-45b">💳 §45b</div></div>
                </div>
              </div>
            </Link>
            <Link href="/kunde/engel/demo-lisa" style={{ textDecoration: 'none' }}>
              <div className="engel-card">
                <div className="engel-avatar" style={{ background: 'var(--cream2)' }}>👼<div className="online-dot away"></div></div>
                <div className="engel-info">
                  <div className="engel-row1"><div className="engel-name">Lisa Schneider</div><div className="engel-rating">★ 4.7</div></div>
                  <div className="engel-cert">✓ Zertifiziert · 56 Einsätze</div>
                  <div className="engel-tags"><span className="engel-tag">Freizeit</span><span className="engel-tag">Haushalt</span></div>
                  <div className="engel-price-row"><div className="engel-price">30€ <span>/Std.</span></div><div className="badge-45b">💳 §45b</div></div>
                </div>
              </div>
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
