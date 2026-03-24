'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Stats {
  totalUsers: number
  totalEngel: number
  totalKunden: number
  totalFahrer: number
  totalBookings: number
  pendingBookings: number
  completedBookings: number
  totalRevenue: number
  totalFees: number
}

interface RecentUser {
  id: string
  first_name: string
  last_name: string
  role: string
  email: string
  phone: string | null
  location: string | null
  created_at: string
}

interface RecentBooking {
  id: string
  service: string
  date: string
  time: string
  status: string
  total_amount: number
  created_at: string
  customer_name: string
  angel_name: string
}

export default function AdminHomePage() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([])
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadAll() {
      try {
        const supabase = createClient()

        const [profilesRes, bookingsRes, recentProfilesRes, recentBookingsRes] = await Promise.all([
          supabase.from('profiles').select('role'),
          supabase.from('bookings').select('status, total_amount, platform_fee'),
          supabase.from('profiles').select('id, first_name, last_name, role, email, phone, location, created_at')
            .not('role', 'in', '("admin","superadmin")')
            .order('created_at', { ascending: false })
            .limit(10),
          supabase.from('bookings').select(`
            id, service, date, time, status, total_amount, created_at,
            customer:profiles!bookings_customer_id_fkey(first_name, last_name)
          `).order('created_at', { ascending: false }).limit(10),
        ])

        const profiles = profilesRes.data || []
        const bookings = bookingsRes.data || []

        setStats({
          totalUsers: profiles.length,
          totalEngel: profiles.filter(p => p.role === 'engel').length,
          totalKunden: profiles.filter(p => p.role === 'kunde').length,
          totalFahrer: profiles.filter(p => p.role === 'fahrer').length,
          totalBookings: bookings.length,
          pendingBookings: bookings.filter(b => b.status === 'pending').length,
          completedBookings: bookings.filter(b => b.status === 'completed').length,
          totalRevenue: bookings.reduce((sum, b) => sum + (b.total_amount || 0), 0),
          totalFees: bookings.reduce((sum, b) => sum + (b.platform_fee || 0), 0),
        })

        setRecentUsers((recentProfilesRes.data || []) as RecentUser[])

        setRecentBookings((recentBookingsRes.data || []).map((b: any) => ({
          id: b.id,
          service: b.service,
          date: b.date,
          time: b.time,
          status: b.status,
          total_amount: b.total_amount,
          created_at: b.created_at,
          customer_name: b.customer ? `${b.customer.first_name} ${(b.customer.last_name || '').charAt(0)}.` : '—',
          angel_name: '—',
        })))
      } catch (err) {
        console.error('Admin stats load error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadAll()
  }, [])

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Gerade eben'
    if (mins < 60) return `vor ${mins} Min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `vor ${hours} Std`
    const days = Math.floor(hours / 24)
    return `vor ${days} Tag${days > 1 ? 'en' : ''}`
  }

  const roleColors: Record<string, string> = {
    engel: '#C9963C',
    kunde: '#4CAF50',
    fahrer: '#2196F3',
  }

  const roleLabels: Record<string, string> = {
    engel: 'Engel',
    kunde: 'Kunde',
    fahrer: 'Fahrer',
  }

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

  if (loading) return <div className="admin-page"><h1>Dashboard</h1><p>Laden...</p></div>

  return (
    <div className="admin-page">
      <h1>Dashboard</h1>
      <p className="admin-subtitle">Übersicht über die Plattform</p>

      {/* Stats Grid */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-value">{stats?.totalUsers}</div>
          <div className="admin-stat-label">Benutzer gesamt</div>
        </div>
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #C9963C' }}>
          <div className="admin-stat-value">{stats?.totalEngel}</div>
          <div className="admin-stat-label">Engel</div>
        </div>
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #4CAF50' }}>
          <div className="admin-stat-value">{stats?.totalKunden}</div>
          <div className="admin-stat-label">Kunden</div>
        </div>
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #2196F3' }}>
          <div className="admin-stat-value">{stats?.totalFahrer}</div>
          <div className="admin-stat-label">Fahrer</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{stats?.totalBookings}</div>
          <div className="admin-stat-label">Buchungen</div>
        </div>
        <div className="admin-stat-card accent">
          <div className="admin-stat-value">{stats?.pendingBookings}</div>
          <div className="admin-stat-label">Ausstehend</div>
        </div>
        <div className="admin-stat-card success">
          <div className="admin-stat-value">{stats?.completedBookings}</div>
          <div className="admin-stat-label">Abgeschlossen</div>
        </div>
      </div>

      {/* Finanzen */}
      <h2 style={{ marginTop: 32 }}>Finanzen</h2>
      <div className="admin-stats-grid">
        <div className="admin-stat-card wide">
          <div className="admin-stat-value">{stats?.totalRevenue.toFixed(2)} €</div>
          <div className="admin-stat-label">Gesamtumsatz</div>
        </div>
        <div className="admin-stat-card wide gold">
          <div className="admin-stat-value">{stats?.totalFees.toFixed(2)} €</div>
          <div className="admin-stat-label">Plattform-Gebühren</div>
        </div>
      </div>

      {/* Neue Registrierungen */}
      <h2 style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
        Neue Registrierungen
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>
          (Letzte 10)
        </span>
      </h2>
      <div className="admin-table-wrap" style={{ marginTop: 12 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Rolle</th>
              <th>E-Mail</th>
              <th>Telefon</th>
              <th>Standort</th>
              <th>Registriert</th>
            </tr>
          </thead>
          <tbody>
            {recentUsers.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)' }}>Keine Registrierungen</td></tr>
            ) : (
              recentUsers.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.first_name} {u.last_name}</td>
                  <td>
                    <span className="admin-status" style={{ background: roleColors[u.role] || '#999' }}>
                      {roleLabels[u.role] || u.role}
                    </span>
                  </td>
                  <td style={{ fontSize: 13 }}>{u.email || '—'}</td>
                  <td style={{ fontSize: 13 }}>{u.phone || '—'}</td>
                  <td style={{ fontSize: 13 }}>{u.location || '—'}</td>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{timeAgo(u.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Letzte Buchungen */}
      <h2 style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
        Letzte Buchungen
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>
          (Letzte 10)
        </span>
        <button
          onClick={() => router.push('/admin/bookings')}
          style={{
            marginLeft: 'auto', fontSize: 13, color: 'var(--gold2)',
            background: 'rgba(201,150,60,0.1)', border: '1px solid rgba(201,150,60,0.3)',
            borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Alle ansehen →
        </button>
      </h2>
      <div className="admin-table-wrap" style={{ marginTop: 12 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Kunde</th>
              <th>Service</th>
              <th>Datum</th>
              <th>Status</th>
              <th>Betrag</th>
              <th>Erstellt</th>
            </tr>
          </thead>
          <tbody>
            {recentBookings.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)' }}>Keine Buchungen</td></tr>
            ) : (
              recentBookings.map(b => (
                <tr key={b.id} onClick={() => router.push('/admin/bookings')} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{b.customer_name}</td>
                  <td>{b.service}</td>
                  <td>{b.date} {b.time}</td>
                  <td>
                    <span className="admin-status" style={{ background: statusColors[b.status] || '#999' }}>
                      {statusLabels[b.status] || b.status}
                    </span>
                  </td>
                  <td>{b.total_amount?.toFixed(2)} €</td>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{timeAgo(b.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
