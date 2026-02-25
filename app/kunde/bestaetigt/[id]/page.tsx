import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function BestaetigtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, angel:angels!bookings_angel_id_fkey(profiles(first_name, last_name, avatar_color))')
    .eq('id', id)
    .single()

  const angelName = booking?.angel?.profiles ? `${booking.angel.profiles.first_name} ${booking.angel.profiles.last_name}` : 'Engel'
  const dateStr = booking?.date ? new Date(booking.date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }) : '01. März 2026'
  const timeEnd = booking ? `${booking.time?.slice(0,5)} – ${String(Number(booking.time?.slice(0,2)) + booking.duration_hours).padStart(2,'0')}:${booking.time?.slice(3,5)} Uhr` : '10:00 – 12:00 Uhr'
  const payLabel = booking?.payment_method === 'kasse' ? `§45b · ${booking?.insurance_provider || ''}` : booking?.payment_method === 'kombi' ? `Kombi · ${booking?.insurance_provider || ''}` : 'Privat'

  return (
    <div className="screen" id="bbestaetigt">
      <div className="confirm-header">
        <div className="confirm-check green">✓</div>
        <div className="confirm-title">Buchung bestätigt!</div>
        <div className="confirm-sub">{angelName} hat Ihre Anfrage angenommen</div>
      </div>

      <div className="confirm-body">
        <div className="person-row">
          <div className="person-av" style={{ background: booking?.angel?.profiles?.avatar_color || 'var(--gold-pale)' }}>👼</div>
          <div>
            <div className="person-name">{angelName}</div>
            <div className="person-sub">✓ Bestätigt · Unterwegs</div>
          </div>
          <div className="person-chat">💬</div>
        </div>

        <div className="insurance">
          <div className="ins-header">
            <div className="ins-icon">🛡️</div>
            <div>
              <div className="ins-title">Versicherungsschutz aktiv</div>
              <div className="ins-subtitle">Automatisch für diesen Einsatz</div>
            </div>
          </div>
          <div className="ins-features">
            <div className="ins-feat"><div className="ins-check">✓</div><div className="ins-text"><strong>Haftpflicht</strong> — Bis zu 5 Mio. € Deckung</div></div>
            <div className="ins-feat"><div className="ins-check">✓</div><div className="ins-text"><strong>Unfallversicherung</strong> — Während des gesamten Einsatzes</div></div>
            <div className="ins-feat"><div className="ins-check">✓</div><div className="ins-text"><strong>Sachschäden</strong> — Bis zu 50.000€ abgesichert</div></div>
          </div>
          <div className="ins-footer">Versicherungsnr.: <strong>AE-2026-00847</strong></div>
        </div>

        <div className="detail-card">
          <div className="detail-card-h">Buchungsdetails</div>
          <div className="detail-row"><div className="detail-ic">📅</div><div><div className="detail-lbl">Datum</div><div className="detail-val">{dateStr}</div></div></div>
          <div className="detail-row"><div className="detail-ic">🕐</div><div><div className="detail-lbl">Uhrzeit</div><div className="detail-val">{timeEnd}</div></div></div>
          <div className="detail-row"><div className="detail-ic">🏠</div><div><div className="detail-lbl">Leistung</div><div className="detail-val">{booking?.service || 'Alltagsbegleitung'}</div></div></div>
          <div className="detail-row"><div className="detail-ic">💳</div><div><div className="detail-lbl">Zahlung</div><div className="detail-val">{payLabel}</div></div></div>
          <div className="detail-row"><div className="detail-ic">💰</div><div><div className="detail-lbl">Gesamtbetrag</div><div className="detail-val">{booking?.total_amount?.toFixed(2) || '69,90'}€</div></div></div>
        </div>

        <div className="action-grid">
          <button className="action-btn">💬 Chat</button>
          <button className="action-btn">📞 Anrufen</button>
          <button className="action-btn">📅 Kalender</button>
          <Link href="/kunde/home"><button className="action-btn primary">🏠 Home</button></Link>
        </div>
      </div>
    </div>
  )
}
