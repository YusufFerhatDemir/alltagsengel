'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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

  async function handleResetPassword() {
    if (!selectedUser || !newPassword) return
    setResetLoading(true)
    setResetMessage(null)

    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: selectedUser.id, newPassword }),
    })
    const data = await res.json()

    if (data.success) {
      setResetMessage({ type: 'success', text: `Passwort für ${selectedUser.first_name} ${selectedUser.last_name} zurückgesetzt` })
      setNewPassword('')
      setTimeout(() => { setSelectedUser(null); setResetMessage(null) }, 2000)
    } else {
      setResetMessage({ type: 'error', text: data.error })
    }
    setResetLoading(false)
  }

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
                <th>Aktionen</th>
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
                  <td>
                    <button
                      className="admin-action-btn"
                      onClick={() => { setSelectedUser(p); setNewPassword(''); setResetMessage(null) }}
                      title="Passwort zurücksetzen"
                    >
                      Passwort
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedUser && (
        <div className="admin-modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <h3>Passwort zurücksetzen</h3>
            <p style={{ color: 'var(--ink3)', marginBottom: 16, fontSize: 14 }}>
              {selectedUser.first_name} {selectedUser.last_name} ({selectedUser.email})
            </p>
            <input
              type="password"
              placeholder="Neues Passwort (min. 6 Zeichen)"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleResetPassword()}
            />
            {resetMessage && (
              <div style={{
                padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13,
                background: resetMessage.type === 'success' ? 'var(--green-pale)' : '#fde8e8',
                color: resetMessage.type === 'success' ? 'var(--green)' : '#c53030',
              }}>
                {resetMessage.text}
              </div>
            )}
            <div className="admin-modal-btns">
              <button className="btn-cancel" onClick={() => setSelectedUser(null)}>Abbrechen</button>
              <button
                className="btn-confirm"
                onClick={handleResetPassword}
                disabled={resetLoading || newPassword.length < 6}
              >
                {resetLoading ? 'Wird gesetzt...' : 'Zurücksetzen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
