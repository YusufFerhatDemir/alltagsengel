import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function EngelProfilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: angel } = await supabase
    .from('angels')
    .select('*, profiles(*)')
    .eq('id', id)
    .single()

  const { data: reviews } = await supabase
    .from('reviews')
    .select('*, profiles:reviewer_id(first_name, last_name)')
    .eq('angel_id', id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Fallback for demo IDs
  if (!angel) {
    return (
      <div className="screen" id="eprofil">
        <div className="ep-header">
          <div className="ep-nav">
            <Link href="/kunde/home" className="ep-back">‹</Link>
            <div className="ep-actions"><div className="ep-action">♡</div><div className="ep-action">…</div></div>
          </div>
          <div className="ep-main">
            <div className="ep-avatar" style={{ background: 'rgba(201,150,60,.12)' }}>👼</div>
            <div>
              <div className="ep-name">Engel nicht gefunden</div>
              <div className="ep-role">Dieser Engel existiert nicht mehr</div>
            </div>
          </div>
        </div>
        <div className="ep-body" style={{ textAlign: 'center', padding: 40 }}>
          <Link href="/kunde/home" style={{ color: 'var(--gold)' }}>Zurück zur Startseite</Link>
        </div>
      </div>
    )
  }

  const name = `${angel.profiles?.first_name || ''} ${angel.profiles?.last_name || ''}`
  const dayMap = ['Mo','Di','Mi','Do','Fr','Sa','So']

  return (
    <div className="screen" id="eprofil">
      <div className="ep-header">
        <div className="ep-nav">
          <Link href="/kunde/home" className="ep-back">‹</Link>
          <div className="ep-actions">
            <div className="ep-action">♡</div>
            <div className="ep-action">…</div>
          </div>
        </div>
        <div className="ep-main">
          <div className="ep-avatar" style={{ background: angel.profiles?.avatar_color || 'rgba(201,150,60,.12)' }}>👼</div>
          <div>
            <div className="ep-name">{name}</div>
            <div className="ep-role">{angel.qualification || 'Alltagsbegleiter/in'}</div>
            <div className="ep-stars">
              <span className="ep-stars-icons">{'★'.repeat(Math.round(angel.rating))}</span>
              <span className="ep-stars-count">{angel.rating} · {angel.total_jobs} Bewertungen</span>
            </div>
            <div className="ep-badges">
              <span className="ep-badge light">{angel.profiles?.location || 'In Ihrer Nähe'}</span>
              {angel.is_45b_capable && <span className="ep-badge gold">§45b</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="ep-body">
        <div className="stat-row">
          <div className="stat-box"><div className="stat-val">{angel.total_jobs}</div><div className="stat-lbl">Einsätze</div></div>
          <div className="stat-box"><div className="stat-val">{angel.rating}</div><div className="stat-lbl">Bewertung</div></div>
          <div className="stat-box"><div className="stat-val">{angel.satisfaction_pct}%</div><div className="stat-lbl">Zufrieden</div></div>
        </div>

        {angel.bio && (
          <div className="prof-section">
            <div className="prof-section-hdr">Über mich</div>
            <div className="prof-desc">{angel.bio}</div>
          </div>
        )}

        <div className="prof-section">
          <div className="prof-section-hdr">Leistungen</div>
          <div className="skill-list">
            {angel.is_45b_capable && <span className="skill-tag gold">§45b-fähig</span>}
            {(angel.services || []).map((s: string) => (
              <span key={s} className="skill-tag">{s}</span>
            ))}
          </div>
        </div>

        <div className="prof-section">
          <div className="prof-section-hdr">Verfügbarkeit</div>
          <div className="avail-row">
            {dayMap.map(day => (
              <div key={day} className={`avail-day${(angel.availability || []).includes(day) ? ' on' : ''}`}>
                <div className="day-name">{day}</div>
                <div className="day-dot"></div>
              </div>
            ))}
          </div>
        </div>

        {reviews && reviews.length > 0 && (
          <div className="prof-section">
            <div className="prof-section-hdr">Bewertungen</div>
            <div className="review-list">
              {reviews.map((r: any) => (
                <div key={r.id} className="review-item">
                  <div className="review-top">
                    <div className="review-av">👤</div>
                    <div>
                      <div className="review-name">{r.profiles?.first_name} {r.profiles?.last_name?.[0]}.</div>
                      <div className="review-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                    </div>
                  </div>
                  {r.comment && <div className="review-text">{r.comment}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 80 }}></div>
      </div>

      <div className="booking-bar">
        <div className="booking-price">
          <div className="price-val">{angel.hourly_rate}€<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink4)' }}>/Std.</span></div>
          {angel.is_45b_capable && <div className="price-sub">§45b-fähig</div>}
        </div>
        <Link href={`/kunde/buchen/${id}`}><button className="btn-book">JETZT BUCHEN</button></Link>
      </div>
    </div>
  )
}
