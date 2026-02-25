'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Stats {
  totalUsers: number
  totalEngel: number
  totalKunden: number
  totalBookings: number
  pendingBookings: number
  completedBookings: number
  totalRevenue: number
  totalFees: number
}

export default function AdminHomePage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadStats() {
      try {
        const supabase = createClient()

        const [profilesRes, angelsRes, bookingsRes] = await Promise.all([
          supabase.from('profiles').select('role'),
          supabase.from('angels').select('id'),
          supabase.from('bookings').select('status, total_amount, platform_fee'),
        ])

        const profiles = profilesRes.data || []
        const bookings = bookingsRes.data || []

        setStats({
          totalUsers: profiles.length,
          totalEngel: profiles.filter(p => p.role === 'engel').length,
          totalKunden: profiles.filter(p => p.role === 'kunde').length,
          totalBookings: bookings.length,
          pendingBookings: bookings.filter(b => b.status === 'pending').length,
          completedBookings: bookings.filter(b => b.status === 'completed').length,
          totalRevenue: bookings.reduce((sum, b) => sum + (b.total_amount || 0), 0),
          totalFees: bookings.reduce((sum, b) => sum + (b.platform_fee || 0), 0),
        })
      } catch (err) {
        console.error('Admin stats load error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [])

  if (loading) return <div className="admin-page"><h1>Dashboard</h1><p>Laden...</p></div>

  return (
    <div className="admin-page">
      <h1>Dashboard</h1>
      <p className="admin-subtitle">Übersicht über die Plattform</p>

      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-value">{stats?.totalUsers}</div>
          <div className="admin-stat-label">Benutzer gesamt</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{stats?.totalEngel}</div>
          <div className="admin-stat-label">Engel</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{stats?.totalKunden}</div>
          <div className="admin-stat-label">Kunden</div>
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
    </div>
  )
}
