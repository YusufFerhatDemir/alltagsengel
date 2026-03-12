'use client'
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, KpiCard, DataTable, Tabs, Badge, SearchInput, EmptyState } from '@/components/mis/MisComponents'
import { useMis } from '@/lib/mis/MisContext'

interface AuthLogEntry {
  id: string
  user_id: string | null
  user_email: string | null
  user_name: string | null
  action: string
  ip_address: string | null
  user_agent: string | null
  location: string | null
  device: string | null
  status: string
  created_at: string
}

interface UserSession {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  role: string | null
  created_at: string
  last_sign_in_at: string | null
  location: string | null
}

export default function AnalyticsPage() {
  const { isMobile } = useMis()
  const [authLogs, setAuthLogs] = useState<AuthLogEntry[]>([])
  const [users, setUsers] = useState<UserSession[]>([])
  const [tab, setTab] = useState('logins')
  const [search, setSearch] = useState('')
  const [timeFilter, setTimeFilter] = useState('7d')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [timeFilter])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()

    // Zeitfilter berechnen
    const now = new Date()
    let since = new Date()
    if (timeFilter === 'today') since.setHours(0, 0, 0, 0)
    else if (timeFilter === '7d') since.setDate(now.getDate() - 7)
    else if (timeFilter === '30d') since.setDate(now.getDate() - 30)
    else since = new Date(0) // all

    // Auth Logs laden
    const { data: logs } = await supabase
      .from('mis_auth_log')
      .select('*')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(200)

    // Benutzer laden mit letztem Login
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    setAuthLogs(logs as AuthLogEntry[] || [])
    setUsers(profiles as UserSession[] || [])
    setLoading(false)
  }

  // Login bei Auth-State-Change tracken
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const profile = users.find(u => u.id === session.user.id)
        await supabase.from('mis_auth_log').insert({
          user_id: session.user.id,
          user_email: session.user.email,
          user_name: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : session.user.email,
          action: 'login',
          user_agent: navigator.userAgent,
          device: getDeviceInfo(),
          status: 'success',
        })
        loadData()
      }
    })
    return () => subscription.unsubscribe()
  }, [users])

  function getDeviceInfo(): string {
    const ua = navigator.userAgent
    if (/iPhone/i.test(ua)) return 'iPhone'
    if (/iPad/i.test(ua)) return 'iPad'
    if (/Android/i.test(ua)) return 'Android'
    if (/Mac/i.test(ua)) return 'Mac'
    if (/Windows/i.test(ua)) return 'Windows'
    if (/Linux/i.test(ua)) return 'Linux'
    return 'Unbekannt'
  }

  // Statistiken
  const totalLogins = authLogs.filter(l => l.action === 'login').length
  const failedLogins = authLogs.filter(l => l.status === 'failed').length
  const uniqueUsers = new Set(authLogs.filter(l => l.user_id).map(l => l.user_id)).size
  const todayLogins = authLogs.filter(l => {
    const d = new Date(l.created_at)
    const now = new Date()
    return d.toDateString() === now.toDateString() && l.action === 'login'
  }).length

  // Suchfilter
  const filteredLogs = authLogs.filter(l => {
    if (!search) return true
    const s = search.toLowerCase()
    return (l.user_name?.toLowerCase().includes(s)) ||
           (l.user_email?.toLowerCase().includes(s)) ||
           (l.action?.toLowerCase().includes(s)) ||
           (l.device?.toLowerCase().includes(s))
  })

  const filteredUsers = users.filter(u => {
    if (!search) return true
    const s = search.toLowerCase()
    return (u.first_name?.toLowerCase().includes(s)) ||
           (u.last_name?.toLowerCase().includes(s)) ||
           (u.email?.toLowerCase().includes(s)) ||
           (u.role?.toLowerCase().includes(s))
  })

  const timeButtons = [
    { id: 'today', label: 'Heute' },
    { id: '7d', label: '7 Tage' },
    { id: '30d', label: '30 Tage' },
    { id: 'all', label: 'Alle' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader
        title="Analytics & Aktivitäten"
        subtitle="Login-Tracking, Benutzeraktivitäten und Zugriffsprotokoll"
        icon="activity"
      />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: isMobile ? 10 : 16 }}>
        <KpiCard title="Logins gesamt" value={totalLogins} icon="users" />
        <KpiCard title="Heute" value={todayLogins} icon="calendar" color={BRAND.info} />
        <KpiCard title="Aktive Nutzer" value={uniqueUsers} icon="activity" color={BRAND.success} />
        <KpiCard title="Fehlversuche" value={failedLogins} icon="shield" color={failedLogins > 0 ? BRAND.error : BRAND.success} />
      </div>

      {/* Zeitfilter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {timeButtons.map(t => (
          <button
            key={t.id}
            onClick={() => setTimeFilter(t.id)}
            style={{
              padding: '6px 16px', borderRadius: 8, border: `1px solid ${BRAND.border}`,
              background: timeFilter === t.id ? `${BRAND.gold}20` : BRAND.white,
              color: timeFilter === t.id ? BRAND.gold : BRAND.muted,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Suchen..." />
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={[
        { id: 'logins', label: 'Login-Protokoll', icon: 'clock', count: filteredLogs.length },
        { id: 'users', label: 'Benutzer', icon: 'users', count: filteredUsers.length },
        { id: 'live', label: 'Übersicht', icon: 'activity' },
      ]} active={tab} onChange={setTab} />

      {/* Login-Protokoll */}
      {tab === 'logins' && (
        <>
          {loading ? (
            <Card><div style={{ padding: 40, textAlign: 'center', color: BRAND.muted }}>Laden...</div></Card>
          ) : filteredLogs.length === 0 ? (
            <EmptyState
              icon="clock"
              title="Keine Login-Einträge"
              description="Login-Aktivitäten werden automatisch protokolliert."
            />
          ) : (
            <Card noPad>
              <DataTable
                columns={[
                  { key: 'user_name', label: 'Benutzer', render: (r) => (
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{(r.user_name as string) || '—'}</div>
                      <div style={{ fontSize: 11, color: BRAND.muted }}>{(r.user_email as string) || ''}</div>
                    </div>
                  )},
                  { key: 'action', label: 'Aktion', render: (r) => {
                    const colors: Record<string, string> = { login: BRAND.success, logout: BRAND.info, failed_login: BRAND.error }
                    const labels: Record<string, string> = { login: 'Anmeldung', logout: 'Abmeldung', failed_login: 'Fehlgeschlagen' }
                    return <Badge label={labels[r.action as string] || String(r.action)} color={colors[r.action as string] || BRAND.muted} size="sm" />
                  }},
                  { key: 'status', label: 'Status', render: (r) => (
                    <Badge
                      label={r.status === 'success' ? 'Erfolgreich' : 'Fehlgeschlagen'}
                      color={r.status === 'success' ? BRAND.success : BRAND.error}
                      size="sm"
                    />
                  )},
                  { key: 'device', label: 'Gerät', render: (r) => (
                    <span style={{ fontSize: 12, color: BRAND.muted }}>{(r.device as string) || '—'}</span>
                  )},
                  { key: 'created_at', label: 'Datum & Uhrzeit', render: (r) => {
                    const d = new Date(r.created_at as string)
                    return (
                      <div>
                        <div style={{ fontSize: 13 }}>{d.toLocaleDateString('de-DE')}</div>
                        <div style={{ fontSize: 11, color: BRAND.muted }}>{d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                      </div>
                    )
                  }},
                ]}
                data={filteredLogs as unknown as Record<string, unknown>[]}
              />
            </Card>
          )}
        </>
      )}

      {/* Benutzer-Übersicht */}
      {tab === 'users' && (
        <>
          {loading ? (
            <Card><div style={{ padding: 40, textAlign: 'center', color: BRAND.muted }}>Laden...</div></Card>
          ) : filteredUsers.length === 0 ? (
            <EmptyState icon="users" title="Keine Benutzer" description="Es sind noch keine Benutzer registriert." />
          ) : (
            <Card noPad>
              <DataTable
                columns={[
                  { key: 'name', label: 'Name', render: (r) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${BRAND.gold}30`, color: BRAND.cream, fontWeight: 700, fontSize: 12, flexShrink: 0,
                      }}>
                        {((r.first_name as string) || '?').charAt(0)}{((r.last_name as string) || '').charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.first_name as string} {r.last_name as string}</div>
                        <div style={{ fontSize: 11, color: BRAND.muted }}>{r.email as string}</div>
                      </div>
                    </div>
                  )},
                  { key: 'role', label: 'Rolle', render: (r) => {
                    const roleLabels: Record<string, string> = { admin: 'Admin', engel: 'Engel', kunde: 'Kunde' }
                    const roleColors: Record<string, string> = { admin: BRAND.gold, engel: BRAND.success, kunde: BRAND.info }
                    return <Badge label={roleLabels[r.role as string] || String(r.role)} color={roleColors[r.role as string] || BRAND.muted} size="sm" />
                  }},
                  { key: 'location', label: 'Standort', render: (r) => (
                    <span style={{ fontSize: 12, color: BRAND.muted }}>{(r.location as string) || '—'}</span>
                  )},
                  { key: 'created_at', label: 'Registriert', render: (r) => (
                    <div>
                      <div style={{ fontSize: 13 }}>{new Date(r.created_at as string).toLocaleDateString('de-DE')}</div>
                      <div style={{ fontSize: 11, color: BRAND.muted }}>{new Date(r.created_at as string).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  )},
                  { key: 'last_sign_in_at', label: 'Letzter Login', render: (r) => {
                    if (!r.last_sign_in_at) return <span style={{ color: BRAND.muted, fontSize: 12 }}>—</span>
                    const d = new Date(r.last_sign_in_at as string)
                    return (
                      <div>
                        <div style={{ fontSize: 13 }}>{d.toLocaleDateString('de-DE')}</div>
                        <div style={{ fontSize: 11, color: BRAND.muted }}>{d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    )
                  }},
                ]}
                data={filteredUsers as unknown as Record<string, unknown>[]}
              />
            </Card>
          )}
        </>
      )}

      {/* Übersicht / Statistik */}
      {tab === 'live' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: isMobile ? 12 : 20 }}>
          <Card title="Login-Verteilung nach Rolle" icon="pieChart">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { role: 'Admin', count: users.filter(u => u.role === 'admin').length, color: BRAND.gold },
                { role: 'Engel', count: users.filter(u => u.role === 'engel').length, color: BRAND.success },
                { role: 'Kunde', count: users.filter(u => u.role === 'kunde').length, color: BRAND.info },
              ].map(item => (
                <div key={item.role} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', background: item.color, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 13, color: BRAND.text, flex: 1 }}>{item.role}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: item.color }}>{item.count}</span>
                </div>
              ))}
              <div style={{ marginTop: 8, paddingTop: 12, borderTop: `1px solid ${BRAND.border}`, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>Gesamt</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: BRAND.cream }}>{users.length}</span>
              </div>
            </div>
          </Card>

          <Card title="Letzte Registrierungen" icon="users">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {users.slice(0, 8).map(u => (
                <div key={u.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: `1px solid ${BRAND.border}`,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: `${BRAND.gold}25`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: BRAND.cream, flexShrink: 0,
                  }}>
                    {(u.first_name || '?').charAt(0)}{(u.last_name || '').charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: BRAND.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {u.first_name} {u.last_name}
                    </div>
                    <div style={{ fontSize: 11, color: BRAND.muted }}>{u.role === 'admin' ? 'Admin' : u.role === 'engel' ? 'Engel' : 'Kunde'}</div>
                  </div>
                  <div style={{ fontSize: 11, color: BRAND.muted, flexShrink: 0 }}>
                    {new Date(u.created_at).toLocaleDateString('de-DE')}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Sicherheitshinweise" icon="shield" style={{ gridColumn: isMobile ? undefined : 'span 2' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {failedLogins > 0 ? (
                <div style={{
                  padding: '12px 16px', borderRadius: 10, background: `${BRAND.error}15`,
                  border: `1px solid ${BRAND.error}30`, display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <Badge label="!" color={BRAND.error} size="sm" />
                  <span style={{ fontSize: 13, color: BRAND.text }}>
                    {failedLogins} fehlgeschlagene Anmeldeversuche im gewählten Zeitraum
                  </span>
                </div>
              ) : (
                <div style={{
                  padding: '12px 16px', borderRadius: 10, background: `${BRAND.success}15`,
                  border: `1px solid ${BRAND.success}30`, display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <Badge label="✓" color={BRAND.success} size="sm" />
                  <span style={{ fontSize: 13, color: BRAND.text }}>
                    Keine fehlgeschlagenen Anmeldeversuche — alles in Ordnung
                  </span>
                </div>
              )}
              <div style={{
                padding: '12px 16px', borderRadius: 10, background: `${BRAND.info}15`,
                border: `1px solid ${BRAND.info}30`, display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <Badge label="i" color={BRAND.info} size="sm" />
                <span style={{ fontSize: 13, color: BRAND.text }}>
                  Alle Login-Aktivitäten werden automatisch protokolliert und gespeichert
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
