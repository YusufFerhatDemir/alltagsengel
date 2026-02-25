'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function WartenPage() {
  const router = useRouter()
  const params = useParams()
  const [confirmed, setConfirmed] = useState(false)
  const [booking, setBooking] = useState<any>(null)

  useEffect(() => {
    async function loadBooking() {
      const supabase = createClient()
      const { data } = await supabase
        .from('bookings')
        .select('*, angel:angels!bookings_angel_id_fkey(profiles(first_name, last_name))')
        .eq('id', params.id)
        .single()
      setBooking(data)
    }
    if (params.id) loadBooking()
  }, [params.id])

  useEffect(() => {
    const timer = setTimeout(async () => {
      const supabase = createClient()
      await supabase.from('bookings').update({ status: 'accepted' }).eq('id', params.id)
      setConfirmed(true)
    }, 4000)
    return () => clearTimeout(timer)
  }, [params.id])

  const angelName = booking?.angel?.profiles ? `${booking.angel.profiles.first_name} ${booking.angel.profiles.last_name}` : 'Engel'
  const dateStr = booking?.date ? new Date(booking.date).toLocaleDateString('de-DE') : '...'
  const timeStr = booking?.time ? `${booking.time.slice(0,5)} Uhr` : '...'

  return (
    <div className="screen" id="bwarten">
      <div className="wait-body">
        <div className="wait-pulse">
          <div className="wait-ring"></div>
          <div className="wait-ring"></div>
          <div className="wait-core">👼</div>
        </div>
        <div className="wait-title">{confirmed ? 'Buchung bestätigt!' : 'Anfrage wird gesendet...'}</div>
        <div className="wait-sub">
          {confirmed
            ? `${angelName} hat Ihre Anfrage angenommen. Sie können jetzt die Details einsehen.`
            : `Wir verbinden Sie mit ${angelName}. Dies dauert in der Regel nur wenige Augenblicke.`
          }
        </div>

        <div className="wait-card">
          <div className="wait-row"><div className="wait-lbl">Engel</div><div className="wait-val">{angelName}</div></div>
          <div className="wait-row"><div className="wait-lbl">Datum</div><div className="wait-val">{dateStr}</div></div>
          <div className="wait-row"><div className="wait-lbl">Uhrzeit</div><div className="wait-val">{timeStr}</div></div>
          <div className="wait-row"><div className="wait-lbl">Dauer</div><div className="wait-val">{booking?.duration_hours || '...'} Stunden</div></div>
          <div className="wait-row"><div className="wait-lbl">Betrag</div><div className="wait-val">{booking?.total_amount?.toFixed(2) || '...'}€</div></div>
        </div>

        <div className="wait-bar"><div className="wait-fill"></div></div>

        {confirmed && (
          <button className="btn-done" onClick={() => router.push(`/kunde/bestaetigt/${params.id}`)} style={{ animation: 'screenIn .28s cubic-bezier(.4,0,.2,1) both' }}>
            BUCHUNG BESTÄTIGT ✓
          </button>
        )}
        <Link href="/kunde/home" className="btn-cancel">Abbrechen</Link>
      </div>
    </div>
  )
}
