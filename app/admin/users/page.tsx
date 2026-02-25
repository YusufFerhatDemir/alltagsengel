'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    async function loadUsers() {
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      setProfiles(data || [])
      setLoading(false)
    }
    loadUsers()
  }, [])

  const filtered = filter === 'all' ? profiles : profiles.filter(p => p.role === filter)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Benutzer</h1>
          <p className="admin-subtitle">{profiles.length} Benutzer registriert</p>
        </div>
      </div>

      <div className="admin-filters">
        {['all', 'kunde', 'engel', 'admin'].map(f => (
          <button
            key={f}
            className={`admin-filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Alle' : f === 'kunde' ? 'Kunden' : f === 'engel' ? 'Engel' : 'Admins'}
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
                <th>Name</th>
                <th>E-Mail</th>
                <th>Rolle</th>
                <th>Ort</th>
                <th>Registriert</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td>
                    <div className="admin-user-cell">
                      <div className="admin-avatar" style={{ background: p.avatar_color || '#C5A572' }}>
                        {p.first_name?.[0]}{p.last_name?.[0]}
                      </div>
                      <span>{p.first_name} {p.last_name}</span>
                    </div>
                  </td>
                  <td>{p.email}</td>
                  <td>
                    <span className={`admin-badge ${p.role}`}>
                      {p.role === 'kunde' ? 'Kunde' : p.role === 'engel' ? 'Engel' : 'Admin'}
                    </span>
                  </td>
                  <td>{p.location || '—'}</td>
                  <td>{new Date(p.created_at).toLocaleDateString('de-DE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
