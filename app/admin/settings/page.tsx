'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AdminSettings() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [currentRole, setCurrentRole] = useState('')
  const [admins, setAdmins] = useState<any[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Passwort ändern
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  // Admin hinzufügen
  const [selectedUserId, setSelectedUserId] = useState('')
  const [adminMsg, setAdminMsg] = useState('')

  // Passwort zurücksetzen für andere
  const [resetUserId, setResetUserId] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [showResetPw, setShowResetPw] = useState(false)
  const [resetMsg, setResetMsg] = useState('')

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUser(user)

    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setCurrentRole(profile?.role || '')
    }

    // Alle Admins laden
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, role')
      .in('role', ['admin', 'superadmin'])
      .order('role', { ascending: false })
    setAdmins(adminProfiles || [])

    // Alle User laden (für Admin-Vergabe)
    const { data: users } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, role')
      .order('created_at', { ascending: false })
    setAllUsers(users || [])

    setLoading(false)
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg('')
    if (newPassword.length < 6) { setPwMsg('Mindestens 6 Zeichen'); return }
    if (newPassword !== confirmPassword) { setPwMsg('Passwörter stimmen nicht überein'); return }

    setPwLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setPwMsg('Fehler: ' + error.message)
    } else {
      setPwMsg('✓ Passwort erfolgreich geändert!')
      setNewPassword('')
      setConfirmPassword('')
    }
    setPwLoading(false)
  }

  async function handleGrantAdmin(userId: string) {
    if (!userId) return
    setAdminMsg('')
    try {
      const res = await fetch('/api/admin/manage-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'grant' }),
      })
      const data = await res.json()
      if (data.error) {
        setAdminMsg('Fehler: ' + data.error)
      } else {
        setAdminMsg('✓ ' + data.message)
        setSelectedUserId('')
        loadData()
      }
    } catch {
      setAdminMsg('Fehler: Netzwerkfehler')
    }
  }

  async function handleRevokeAdmin(userId: string) {
    if (userId === currentUser?.id) { setAdminMsg('Du kannst dir selbst nicht die Rolle entziehen!'); return }
    try {
      const res = await fetch('/api/admin/manage-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'revoke' }),
      })
      const data = await res.json()
      if (data.error) {
        setAdminMsg('Fehler: ' + data.error)
      } else {
        setAdminMsg('✓ ' + data.message)
        loadData()
      }
    } catch {
      setAdminMsg('Fehler: Netzwerkfehler')
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setResetMsg('')
    if (!resetUserId || !resetPassword) { setResetMsg('User und Passwort auswählen'); return }
    if (resetPassword.length < 6) { setResetMsg('Mindestens 6 Zeichen'); return }

    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: resetUserId, newPassword: resetPassword }),
    })
    const data = await res.json()
    if (data.error) {
      setResetMsg('Fehler: ' + data.error)
    } else {
      setResetMsg('✓ Passwort zurückgesetzt!')
      setResetPassword('')
      setResetUserId('')
    }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--ink)' }}>Laden...</div>

  const isSuperadmin = currentRole === 'superadmin'
  const nonAdminUsers = allUsers.filter(u => !['admin', 'superadmin'].includes(u.role))

  const cardStyle: React.CSSProperties = {
    background: 'var(--card-bg, rgba(28,24,20,0.6))',
    border: '1px solid var(--border, rgba(201,150,60,0.15))',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid var(--border, rgba(201,150,60,0.2))',
    background: 'rgba(13,10,8,0.5)',
    color: 'var(--ink, #e8e0d4)',
    fontSize: 14,
    fontFamily: 'inherit',
    marginBottom: 10,
  }

  const btnStyle: React.CSSProperties = {
    padding: '10px 20px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, #C9963C, #DBA84A)',
    color: '#0D0A08',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  const btnDangerStyle: React.CSSProperties = {
    ...btnStyle,
    background: 'rgba(180,50,50,0.8)',
    color: '#fff',
  }

  const msgStyle = (msg: string): React.CSSProperties => ({
    padding: '8px 12px',
    borderRadius: 8,
    marginTop: 8,
    fontSize: 13,
    background: msg.startsWith('✓') ? 'rgba(50,180,80,0.15)' : 'rgba(180,50,50,0.15)',
    color: msg.startsWith('✓') ? '#6ddf80' : '#ff8080',
  })

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
        Einstellungen
      </h1>
      <p style={{ color: 'var(--dim)', fontSize: 14, marginBottom: 32 }}>
        Eingeloggt als: <strong style={{ color: 'var(--gold2, #DBA84A)' }}>{currentUser?.email}</strong>
        {' · '}
        <span style={{ textTransform: 'uppercase', fontSize: 11, padding: '2px 8px', borderRadius: 6, background: isSuperadmin ? 'rgba(201,150,60,0.2)' : 'rgba(100,100,100,0.2)', color: isSuperadmin ? 'var(--gold2)' : 'var(--dim)' }}>
          {currentRole}
        </span>
      </p>

      {/* ═══ Mein Passwort ändern ═══ */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 16, fontFamily: "'Cormorant Garamond', serif" }}>
          Mein Passwort ändern
        </h2>
        <form onSubmit={handlePasswordChange}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <input
              type={showNewPw ? 'text' : 'password'}
              placeholder="Neues Passwort (min. 6 Zeichen)"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={{ ...inputStyle, marginBottom: 0, paddingRight: 80 }}
              minLength={6}
              required
            />
            <button type="button" onClick={() => setShowNewPw(!showNewPw)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(201,150,60,0.6)', cursor: 'pointer', fontSize: 12 }}>
              {showNewPw ? 'Verbergen' : 'Anzeigen'}
            </button>
          </div>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <input
              type={showConfirmPw ? 'text' : 'password'}
              placeholder="Passwort bestätigen"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              style={{ ...inputStyle, marginBottom: 0, paddingRight: 80 }}
              required
            />
            <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(201,150,60,0.6)', cursor: 'pointer', fontSize: 12 }}>
              {showConfirmPw ? 'Verbergen' : 'Anzeigen'}
            </button>
          </div>
          <button type="submit" disabled={pwLoading} style={btnStyle}>
            {pwLoading ? 'Wird geändert...' : 'Passwort ändern'}
          </button>
          {pwMsg && <div style={msgStyle(pwMsg)}>{pwMsg}</div>}
        </form>
      </div>

      {/* ═══ Admin-Verwaltung ═══ */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 16, fontFamily: "'Cormorant Garamond', serif" }}>
          Admin-Verwaltung
        </h2>

        {/* Aktuelle Admins */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ color: 'var(--dim)', fontSize: 13, marginBottom: 10 }}>Aktuelle Admins:</p>
          {admins.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(13,10,8,0.4)', marginBottom: 6,
            }}>
              <div>
                <span style={{ color: 'var(--ink)', fontSize: 14 }}>
                  {a.first_name} {a.last_name}
                </span>
                <span style={{ color: 'var(--dim)', fontSize: 12, marginLeft: 8 }}>{a.email}</span>
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4, marginLeft: 8,
                  background: a.role === 'superadmin' ? 'rgba(201,150,60,0.2)' : 'rgba(100,100,100,0.2)',
                  color: a.role === 'superadmin' ? 'var(--gold2)' : 'var(--dim)',
                  textTransform: 'uppercase',
                }}>
                  {a.role}
                </span>
              </div>
              {isSuperadmin && a.id !== currentUser?.id && (
                <button
                  onClick={() => handleRevokeAdmin(a.id)}
                  style={{ ...btnDangerStyle, padding: '5px 12px', fontSize: 12 }}
                >
                  Entfernen
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Neuen Admin hinzufügen */}
        {isSuperadmin && nonAdminUsers.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <p style={{ color: 'var(--dim)', fontSize: 13, marginBottom: 10 }}>Neuen Admin hinzufügen:</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
              >
                <option value="">Benutzer auswählen...</option>
                {nonAdminUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.first_name} {u.last_name} ({u.email}) — {u.role}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleGrantAdmin(selectedUserId)}
                disabled={!selectedUserId}
                style={{ ...btnStyle, whiteSpace: 'nowrap' }}
              >
                Admin machen
              </button>
            </div>
            {adminMsg && <div style={msgStyle(adminMsg)}>{adminMsg}</div>}
          </div>
        )}
      </div>

      {/* ═══ Passwort zurücksetzen (für andere User) ═══ */}
      {isSuperadmin && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 16, fontFamily: "'Cormorant Garamond', serif" }}>
            Benutzer-Passwort zurücksetzen
          </h2>
          <form onSubmit={handleResetPassword}>
            <select
              value={resetUserId}
              onChange={e => setResetUserId(e.target.value)}
              style={inputStyle}
              required
            >
              <option value="">Benutzer auswählen...</option>
              {allUsers.filter(u => u.id !== currentUser?.id).map(u => (
                <option key={u.id} value={u.id}>
                  {u.first_name} {u.last_name} ({u.email}) — {u.role}
                </option>
              ))}
            </select>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                type={showResetPw ? 'text' : 'password'}
                placeholder="Neues Passwort (min. 6 Zeichen)"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                style={{ ...inputStyle, marginBottom: 0, paddingRight: 80 }}
                minLength={6}
                required
              />
              <button type="button" onClick={() => setShowResetPw(!showResetPw)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(201,150,60,0.6)', cursor: 'pointer', fontSize: 12 }}>
                {showResetPw ? 'Verbergen' : 'Anzeigen'}
              </button>
            </div>
            <button type="submit" style={btnStyle}>Passwort zurücksetzen</button>
            {resetMsg && <div style={msgStyle(resetMsg)}>{resetMsg}</div>}
          </form>
        </div>
      )}
    </div>
  )
}
