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
  customer_id: string | null
  angel_id: string | null
  customer_name: string
  angel_name: string
}

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    async function loadBookings() {
      try {
        const supabase = createClient()

        // Load bookings separately from profiles to avoid join issues
        const { data: bookingsData, error: bookingsError } = await supabase
          .from('bookings')
          .select('*')
          .order('created_at', { ascending: false })

        if (bookingsError) {
          console.error('Bookings load error:', bookingsError)
          setError(`Fehler beim Laden: ${bookingsError.message}`)
          setLoading(false)
          return
        }

        if (!bookingsData || bookingsData.length === 0) {
          setBookings([])
          setLoading(false)
          return
        }

        // Load all profiles for name resolution
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')

        const profileMap = new Map<string, string>()
        ;(profiles || []).forEach((p: any) => {
          profileMap.set(p.id, `${p.first_name || ''} ${(p.last_name || '').charAt(0)}.`.trim())
        })

        const rows: BookingRow[] = bookingsData.map((b: any) => ({
          id: b.id,
          service: b.service || '—',
          date: b.date || '—',
          time: b.time || '—',
          duration_hours: b.duration_hours || 0,
          status: b.status || 'pending',
          payment_method: b.payment_method || '—',
          total_amount: b.total_amount || 0,
          platform_fee: b.platform_fee || 0,
          notes: b.notes,
          created_at: b.created_at,
          customer_id: b.customer_id,
          angel_id: b.angel_id,
          customer_name: b.customer_id ? (profileMap.get(b.customer_id) || 'Unbekannt') : '—',
          angel_name: b.angel_id ? (profileMap.get(b.angel_id) || 'Nicht zugewiesen') : 'Nicht zugewiesen',
        }))

        setBookings(rows)
      } catch (err: any) {
        console.error('Bookings page error:', err)
        setError(`Unerwarteter Fehler: ${err.message}`)
      } finally {
        setLoading(false)
      }
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
            {f !== 'all' && ` (${bookings.filter(b => b.status === f).length})`}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          background: 'rgba(244,67,54,0.1)', border: '1px solid rgba(244,67,54,0.3)',
          borderRadius: 8, padding: 16, margin: '16px 0', color: '#F44336',
        }}>
          {error}
        </div>
      )}

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
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
                  {filter === 'all' ? 'Noch keine Buchungen vorhanden' : `Keine ${statusLabels[filter] || filter} Buchungen`}
                </td></tr>
              ) : (
                filtered.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600 }}>{b.customer_name}</td>
                    <td>{b.angel_name}</td>
                    <td>{b.service}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{b.date} {b.time}</td>
                    <td>
                      <span className="admin-status" style={{ background: statusColors[b.status] || '#999' }}>
                        {statusLabels[b.status] || b.status}
                      </span>
                    </td>
                    <td>{b.total_amount?.toFixed(2)} €</td>
                    <td>{b.platform_fee?.toFixed(2)} €</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
