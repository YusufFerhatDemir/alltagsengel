import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { safeSingleQuery } from '@/lib/safe-query'
import { NotFoundState, ErrorState } from '@/components/UIStates'
import { IconCheck, IconUser, IconChat, IconShield, IconCalendar, IconClock, IconHome as IconHouse, IconMoney, IconCard, IconPin } from '@/components/Icons'

export default async function EngelBestaetigtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: booking, status } = await safeSingleQuery<any>(supabase, 'bookings', id, {
    select: '*, customer:profiles!bookings_customer_id_fkey(first_name, last_name)',
  })

  if (status === 'invalid_id' || status === 'not_found') {
    return <NotFoundState title="Auftrag nicht gefunden" subtitle="Dieser Auftrag existiert nicht oder wurde storniert." homeHref="/engel/home" />
  }
  if (status === 'error' || !booking) {
    return <div className="screen"><ErrorState homeHref="/engel/home" /></div>
  }

  const customerName = booking.customer ? `${booking.customer.first_name} ${booking.customer.last_name}` : 'Kunde'
  const dateStr = booking.date ? new Date(booking.date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }) : '01. März 2026'
  const timeEnd = `${booking.time?.slice(0,5)} – ${String(Number(booking.time?.slice(0,2)) + booking.duration_hours).padStart(2,'0')}:${booking.time?.slice(3,5)} Uhr`

  return (
    <div className="screen" id="ebestaetigt">
      <div className="confirm-header">
        <div className="confirm-check gold"><IconCheck size={28} /></div>
        <div className="confirm-title">Auftrag angenommen!</div>
        <div className="confirm-sub">Sie haben den Einsatz bei {customerName} bestätigt</div>
      </div>

      <div className="confirm-body">
        <div className="person-row">
          <div className="person-av" style={{ background: 'var(--cream2)' }}><IconUser size={20} /></div>
          <div>
            <div className="person-name">{customerName}</div>
            <div className="person-sub"><IconCheck size={12} /> Verifiziert · Stammkundin</div>
          </div>
          <div className="person-chat"><IconChat size={18} /></div>
        </div>

        <div className="insurance">
          <div className="ins-header">
            <div className="ins-icon"><IconShield size={20} /></div>
            <div>
              <div className="ins-title">Ihr Schutz ist aktiv</div>
              <div className="ins-subtitle">Automatisch für diesen Einsatz</div>
            </div>
          </div>
          <div className="ins-features">
            <div className="ins-feat"><div className="ins-check"><IconCheck size={14} /></div><div className="ins-text"><strong>Berufshaftpflicht</strong> — Voller Schutz während des Einsatzes</div></div>
            <div className="ins-feat"><div className="ins-check"><IconCheck size={14} /></div><div className="ins-text"><strong>Unfallversicherung</strong> — Hin- und Rückweg inklusive</div></div>
            <div className="ins-feat"><div className="ins-check"><IconCheck size={14} /></div><div className="ins-text"><strong>Rechtsschutz</strong> — Im Einsatzfall abgesichert</div></div>
          </div>
          <div className="ins-footer">Versicherungsnr.: <strong>AE-E-2026-00847</strong></div>
        </div>

        <div className="detail-card">
          <div className="detail-card-h">Einsatzdetails</div>
          <div className="detail-row"><div className="detail-ic"><IconCalendar size={15} /></div><div><div className="detail-lbl">Datum</div><div className="detail-val">{dateStr}</div></div></div>
          <div className="detail-row"><div className="detail-ic"><IconClock size={15} /></div><div><div className="detail-lbl">Uhrzeit</div><div className="detail-val">{timeEnd}</div></div></div>
          <div className="detail-row"><div className="detail-ic"><IconHouse size={15} /></div><div><div className="detail-lbl">Leistung</div><div className="detail-val">{booking.service || 'Alltagsbegleitung'}</div></div></div>
          <div className="detail-row"><div className="detail-ic"><IconMoney size={15} /></div><div><div className="detail-lbl">Vergütung</div><div className="detail-val">{booking.total_amount?.toFixed(2) || '64,00'}€</div></div></div>
          <div className="detail-row"><div className="detail-ic"><IconCard size={15} /></div><div><div className="detail-lbl">Abrechnung</div><div className="detail-val">{booking.payment_method === 'kasse' ? `§45b · ${booking.insurance_provider || ''}` : booking.payment_method || '§45b · AOK'}</div></div></div>
        </div>

        <div className="action-grid">
          <button className="action-btn"><IconChat size={15} /> Chat</button>
          <button className="action-btn"><IconPin size={15} /> Navigation</button>
          <button className="action-btn"><IconCalendar size={15} /> Kalender</button>
          <Link href="/engel/home"><button className="action-btn primary"><IconHouse size={15} /> Dashboard</button></Link>
        </div>
      </div>
    </div>
  )
}
