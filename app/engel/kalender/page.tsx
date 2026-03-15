'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IconClock, IconUser } from '@/components/Icons'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfMonth(year: number, month: number) {
  const d = new Date(year, month, 1).getDay()
  return d === 0 ? 6 : d - 1
}

export default function EngelKalenderPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [bookings, setBookings] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('bookings')
        .select('*, profiles:customer_id(first_name, last_name)')
        .eq('angel_id', user.id)
        .in('status', ['accepted', 'completed'])
        .order('date', { ascending: true })
      setBookings(data || [])
    }
    load()
  }, [])

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const bookingDates = new Set(bookings.map(b => b.date))
  const selectedBookings = selectedDate ? bookings.filter(b => b.date === selectedDate) : []

  function prevMonth() { if (month === 0) { setMonth(11); setYear(year - 1) } else setMonth(month - 1) }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(year + 1) } else setMonth(month + 1) }

  return (
    <div className="screen" id="kalender">
      <div className="topbar" style={{ paddingTop: 14 }}>
        <div className="topbar-title">Kalender</div>
      </div>

      <div className="kal-body">
        <div className="kal-header">
          <button className="kal-nav" onClick={prevMonth}>‹</button>
          <div className="kal-month">{MONTHS[month]} {year}</div>
          <button className="kal-nav" onClick={nextMonth}>›</button>
        </div>

        <div className="kal-weekdays">
          {WEEKDAYS.map(d => <div key={d} className="kal-wd">{d}</div>)}
        </div>

        <div className="kal-grid">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} className="kal-day empty"></div>)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const isToday = dateStr === today.toISOString().slice(0, 10)
            const hasBooking = bookingDates.has(dateStr)
            const isSelected = dateStr === selectedDate
            return (
              <div
                key={day}
                className={`kal-day${isToday ? ' today' : ''}${hasBooking ? ' has-booking' : ''}${isSelected ? ' selected' : ''}`}
                onClick={() => setSelectedDate(dateStr === selectedDate ? null : dateStr)}
              >
                <span>{day}</span>
                {hasBooking && <div className="kal-dot"></div>}
              </div>
            )
          })}
        </div>

        {selectedDate && (
          <div className="kal-events">
            <div className="kal-events-title">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            {selectedBookings.length === 0 ? (
              <div className="kal-no-events">Keine Einsätze an diesem Tag</div>
            ) : (
              selectedBookings.map(b => {
                const customer = b.profiles as any
                const name = customer ? `${customer.first_name} ${customer.last_name?.[0] || ''}.` : 'Kunde'
                return (
                  <div key={b.id} className="kal-event">
                    <div className="kal-event-time"><IconClock size={13} /> {b.time?.slice(0, 5)} · {b.duration_hours}h</div>
                    <div className="kal-event-info">
                      <div className="kal-event-name"><IconUser size={14} /> {name}</div>
                      <div className="kal-event-service">{b.service}</div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
        <div style={{ height: 90 }}></div>
      </div>
    </div>
  )
}
