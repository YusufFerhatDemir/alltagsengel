import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { safeSingleQuery, logError } from '@/lib/safe-query'
import { NotFoundState, ErrorState } from '@/components/UIStates'
import { CUSTOMER_HOURLY_RATE } from '@/lib/pricing/b2c-constants'
import { IconWingsGold, IconStar, IconStarFilled, IconHeart, IconMore, IconUser, IconCheck } from '@/components/Icons'
import EngelProfilActions from './EngelProfilActions'
import { getActiveOrgIdOrDefault } from '@/lib/organizations/server'
import { ladeEngelBewertungen, type OeffentlicheBewertung } from '@/lib/reviews'
import {
  WOCHENTAGE,
  fensterProTag,
  fensterText,
  kuerzelZuWochentag,
  type Zeitfenster,
} from '@/lib/availability'

export default async function EngelProfilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: angel, status } = await safeSingleQuery<any>(supabase, 'angels', id, {
    select: '*, profiles(*)',
  })

  if (status === 'invalid_id' || status === 'not_found') {
    return <NotFoundState homeHref="/kunde/home" />
  }

  if (status === 'error' || !angel) {
    return (
      <div className="screen">
        <ErrorState homeHref="/kunde/home" />
      </div>
    )
  }

  // Bewertungen ueber die zentrale, mandantengefencte Leseschicht.
  // Direkt aus angel_reviews zu lesen ist nicht mehr moeglich (und war
  // vorher ein PII-Leak: der Join lieferte die Nachnamen der Kundschaft).
  let reviews: OeffentlicheBewertung[] = []
  try {
    // Kundschaft ist nicht in organization_members gefuehrt — bewusster
    // Stamm-Org-Fallback (Audit MITTEL-1, dokumentierte Ausnahme).
    const orgId = await getActiveOrgIdOrDefault()
    reviews = await ladeEngelBewertungen(id, orgId, 5)
  } catch (err) {
    logError('EngelProfil:reviews', err)
  }

  // Verfügbarkeit: gepflegte Zeitfenster haben Vorrang, sonst greift
  // die alte Wochentags-Liste aus angels.availability.
  let zeitfenster: Zeitfenster[] = []
  try {
    const { data, error } = await supabase
      .from('angel_availability')
      .select('weekday, start_time, end_time')
      .eq('angel_id', id)
    if (error) logError('EngelProfil:availability', error.message)
    zeitfenster = (data || []) as Zeitfenster[]
  } catch (err) {
    logError('EngelProfil:availability', err)
  }

  const verfuegbareTage = new Set<number>(
    zeitfenster.length > 0
      ? zeitfenster.map(f => f.weekday)
      : (angel.availability || [])
          .map((kuerzel: string) => kuerzelZuWochentag(kuerzel))
          .filter((nr: number | null): nr is number => nr !== null)
  )

  const name = `${angel.profiles?.first_name || ''} ${angel.profiles?.last_name?.[0] || ''}.`

  return (
    <div className="screen" id="eprofil">
      <div className="ep-header">
        <div className="ep-nav">
          <Link href="/kunde/home" className="ep-back">‹</Link>
          <EngelProfilActions angelId={id} angelName={`${angel?.profiles?.first_name || ''} ${angel?.profiles?.last_name?.[0] || ''}.`} />
        </div>
        <div className="ep-main">
          {/* next/image statt <img>: liefert das 68-KB-JPG als ~80px-AVIF/WebP
              aus (gleiches Pattern wie Icon3D — Gold-Optik kommt aus .icon3d-CSS) */}
          <div className="ep-avatar icon3d" style={{ '--sz': '80px' } as React.CSSProperties}><Image src="/assets/icon.jpg" alt="Engel-Profilbild" fill sizes="80px" /></div>
          <div>
            <div className="ep-name">{name}</div>
            <div className="ep-role">{angel.qualification || 'Alltagsbegleiter/in'}</div>
            <div className="ep-stars">
              <span className="ep-stars-icons">{Array.from({ length: Math.round(angel.rating) }).map((_, i) => <IconStarFilled key={i} size={13} color="var(--gold)" />)}</span>
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
            {WOCHENTAGE.map(tag => (
              <div key={tag.nr} className={`avail-day${verfuegbareTage.has(tag.nr) ? ' on' : ''}`}>
                <div className="day-name">{tag.kurz}</div>
                <div className="day-dot"></div>
              </div>
            ))}
          </div>
          {/* Konkrete Zeitfenster, sofern der Engel sie gepflegt hat —
              die reine Wochentags-Ansicht sagt nichts über Uhrzeiten. */}
          {zeitfenster.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {WOCHENTAGE.filter(tag => fensterProTag(zeitfenster, tag.nr).length > 0).map(tag => (
                <div key={tag.nr} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--ink4)' }}>
                  <span style={{ minWidth: 84, fontWeight: 600, color: 'var(--ink3)' }}>{tag.lang}</span>
                  <span>{fensterProTag(zeitfenster, tag.nr).map(fensterText).join(', ')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {reviews.length > 0 && (
          <div className="prof-section">
            <div className="prof-section-hdr">Bewertungen</div>
            <div className="review-list">
              {reviews.map((r) => (
                <div key={r.id} className="review-item">
                  <div className="review-top">
                    <div className="review-av"><IconUser size={16} /></div>
                    <div>
                      <div className="review-name">{r.verfasser.first_name || 'Kundin/Kunde'}</div>
                      <div className="review-stars">{Array.from({ length: r.rating }).map((_, i) => <IconStarFilled key={i} size={11} color="var(--gold)" />)}{Array.from({ length: 5 - r.rating }).map((_, i) => <IconStar key={i} size={11} color="var(--ink5)" />)}</div>
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
          <div className="price-val">{CUSTOMER_HOURLY_RATE}€<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink4)' }}>/Std.</span></div>
          {angel.is_45b_capable && <div className="price-sub">§45b-fähig</div>}
        </div>
        <Link href={`/kunde/buchen/${id}`}><button className="btn-book">JETZT BUCHEN</button></Link>
      </div>
    </div>
  )
}
