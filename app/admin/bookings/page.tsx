'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface BookingRow {
  id: string
  service: string
  date: string
  time: string
  duration_hours: number
  status: string
  payment_method: string
  total_amount: number
  platform_fee: number
  notes: string | null
  created_at: string
  customer: { first_name: string; last_name: string } | null
  angel: { first_name: string; last_name: string } | null
}

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    async function loadBookings() {
      const supabase = createClient()
      const { data } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:profiles!bookings_customer_id_fkey(first_name, last_name),
          angel:angels!bookings_angel_id_fkey(profiles(first_name, last_name))
        `)
        .order('created_at', { ascending: false })

      const rows: BookingRow[] = (data || []).map((b: Record<string, unknown>) => ({
        id: b.id as string,
        service: b.service as string,
        date: b.date as string,
        time: b.time as string,
        duration_hours: b.duration_hours as number,
        status: b.status as string,
        payment_method: b.payment_method as string,
        total_amount: b.total_amount as number,
        platform_fee: b.platform_fee as number,
        notes: b.notes as string | null,
        created_at: b.created_at as string,
        customer: b.customer as { first_name: string; last_name: string } | null,
        angel: ((b.angel as Record<string, unknown>)?.profiles as { first_name: string; last_name: string }) || null,
      }))

      setBookings(rows)
      setLoading(false)
    }
    loadBookings()
  }, [])

  const statusColors: Record<string, string> = {
    pending: '#E8A000',
    accepted: '#2196F3',
    completed: '#4CAF50',
    declined: '#F44336',
    cancelled: '#999',
  }

  const statusLabels: Record<string, string> = {
    pending: 'Ausstehend',
    accepted: 'Akzeptiert',
    completed: 'Abgeschlossen',
    declined: 'Abgelehnt',
    cancelled: 'Storniert',
  }

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Buchungen</h1>
          <p className="admin-subtitle">{bookings.length} Buchungen insgesamt</p>
        </div>
      </div>

      <div className="admin-filters">
        {['all', 'pending', 'accepted', 'completed', 'declined'].map(f => (
          <button
            key={f}
            className={`admin-filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Alle' : statusLabels[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <p>Laden...</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Kunde</th>
                <th>Engel</th>
                <th>Service</th>
                <th>Datum</th>
                <th>Status</th>
                <th>Betrag</th>
                <th>Gebühr</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => (
                <tr key={b.id}>
                  <td>{b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : '—'}</td>
                  <td>{b.angel ? `${b.angel.first_name} ${b.angel.last_name}` : '—'}</td>
                  <td>{b.service}</td>
                  <td>{b.date} {b.time}</td>
                  <td>
                    <span className="admin-status" style={{ background: statusColors[b.status] || '#999' }}>
                      {statusLabels[b.status] || b.status}
                    </span>
                  </td>
                  <td>{b.total_amount?.toFixed(2)} €</td>
                  <td>{b.platform_fee?.toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
