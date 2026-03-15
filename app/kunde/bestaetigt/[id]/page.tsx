import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { safeSingleQuery, logError } from '@/lib/safe-query'
import { NotFoundState, ErrorState } from '@/components/UIStates'
import { IconCheck, IconWingsGold, IconChat, IconShield, IconCalendar, IconClock, IconHome as IconHouse, IconCard, IconMoney, IconPhone } from '@/components/Icons'

export default async function BestaetigtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: booking, status } = await safeSingleQuery<any>(supabase, 'bookings', id, {
    select: '*, angel:angels!bookings_angel_id_fkey(profiles(first_name, last_name, avatar_color))',
  })

  if (status === 'invalid_id' || status === 'not_found') {
    return <NotFoundState title="Buchung nicht gefunden" subtitle="Diese Buchung existiert nicht oder wurde bereits storniert." homeHref="/kunde/home" />
  }
  if (status === 'error' || !booking) {
    return <div className="screen"><ErrorState homeHref="/kunde/home" /></div>
  }

  const angelName = booking.angel?.profiles ? `${booking.angel.profiles.first_name} ${booking.angel.profiles.last_name?.[0]}.` : 'Engel'
  const dateStr = booking.date ? new Date(booking.date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }) : '01. März 2026'
  const timeEnd = `${booking.time?.slice(0,5)} – ${String(Number(booking.time?.slice(0,2)) + booking.duration_hours).padStart(2,'0')}:${booking.time?.slice(3,5)} Uhr`
  const payLabel = booking.payment_method === 'kasse' ? `§45b · ${booking.insurance_provider || ''}` : booking.payment_method === 'kombi' ? `Kombi · ${booking.insurance_provider || ''}` : 'Privat'

  return (
    <div className="screen" id="bbestaetigt">
      <div className="confirm-header">
        <div className="confirm-check green"><IconCheck size={28} /></div>
        <div className="confirm-title">Buchung bestätigt!</div>
        <div className="confirm-sub">{angelName} hat Ihre Anfrage angenommen</div>
      </div>

      <div className="confirm-body">
        <div className="person-row">
          <div className="person-av" style={{ background: booking.angel?.profiles?.avatar_color || 'var(--gold-pale)' }}><IconWingsGold size={22} /></div>
          <div>
            <div className="person-name">{angelName}</div>
            <div className="person-sub"><IconCheck size={12} /> Bestätigt · Unterwegs</div>
          </div>
          <div className="person-chat"><IconChat size={18} /></div>
        </div>

        <div className="insurance">
          <div className="ins-header">
            <div className="ins-icon"><IconShield size={20} /></div>
            <div>
              <div className="ins-title">Versicherungsschutz aktiv</div>
              <div className="ins-subtitle">Automatisch für diesen Einsatz</div>
            </div>
          </div>
          <div className="ins-features">
            <div className="ins-feat"><div className="ins-check"><IconCheck size={14} /></div><div className="ins-text"><strong>Haftpflicht</strong> — Bis zu 5 Mio. € Deckung</div></div>
            <div className="ins-feat"><div className="ins-check"><IconCheck size={14} /></div><div className="ins-text"><strong>Unfallversicherung</strong> — Während des gesamten Einsatzes</div></div>
            <div className="ins-feat"><div className="ins-check"><IconCheck size={14} /></div><div className="ins-text"><strong>Sachschäden</strong> — Bis zu 50.000€ abgesichert</div></div>
          </div>
          <div className="ins-footer">Versicherungsnr.: <strong>AE-2026-00847</strong></div>
        </div>

        <div className="detail-card">
          <div className="detail-card-h">Buchungsdetails</div>
          <div className="detail-row"><div className="detail-ic"><IconCalendar size={15} /></div><div><div className="detail-lbl">Datum</div><div className="detail-val">{dateStr}</div></div></div>
          <div className="detail-row"><div className="detail-ic"><IconClock size={15} /></div><div><div className="detail-lbl">Uhrzeit</div><div className="detail-val">{timeEnd}</div></div></div>
          <div className="detail-row"><div className="detail-ic"><IconHouse size={15} /></div><div><div className="detail-lbl">Leistung</div><div className="detail-val">{booking.service || 'Alltagsbegleitung'}</div></div></div>
          <div className="detail-row"><div className="detail-ic"><IconCard size={15} /></div><div><div className="detail-lbl">Zahlung</div><div className="detail-val">{payLabel}</div></div></div>
          <div className="detail-row"><div className="detail-ic"><IconMoney size={15} /></div><div><div className="detail-lbl">Gesamtbetrag</div><div className="detail-val">{booking.total_amount?.toFixed(2) || '69,90'}€</div></div></div>
        </div>

        <div className="action-grid">
          <Link href={`/kunde/chat/${booking.angel_id || ''}`}><button className="action-btn"><IconChat size={15} /> Chat</button></Link>
          <button className="action-btn" onClick={() => window.location.href = `tel:${booking.angel_phone || ''}`}><IconPhone size={15} /> Anrufen</button>
          <Link href="/kunde/kalender"><button className="action-btn"><IconCalendar size={15} /> Kalender</button></Link>
          <Link href="/kunde/home"><button className="action-btn primary"><IconHouse size={15} /> Home</button></Link>
        </div>
      </div>
    </div>
  )
}
