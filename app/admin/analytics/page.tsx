'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IconUser, IconClock, IconTarget, IconChart } from '@/components/Icons'

interface Visitor {
  id: number
  ip: string
  country: string
  city: string
  region: string
  user_agent: string
  referrer: string
  page: string
  created_at: string
}

interface PageView {
  id: string
  user_id: string | null
  path: string
  page_label: string
  viewed_at: string
  screen_width: number | null
  profile?: { first_name: string; last_name: string; role: string; email: string } | null
}

interface PageStat {
  page_label: string
  path: string
  count: number
  unique_users: number
}

interface UserActivity {
  user_id: string
  name: string
  role: string
  email: string
  total_views: number
  last_seen: string
  pages: string[]
}

export default function AdminAnalyticsPage() {
  const [views, setViews] = useState<PageView[]>([])
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'visitors' | 'live' | 'pages' | 'users'>('visitors')
  const [dateFilter, setDateFilter] = useState<'today' | '7d' | '30d' | 'all'>('today')

  useEffect(() => {
    loadData()
  }, [dateFilter])

  async function loadData() {
    setLoading(true)
    try {
      const supabase = createClient()

      let query = supabase
        .from('page_views')
        .select('*, profile:profiles!page_views_user_id_fkey(first_name, last_name, role, email)')
        .order('viewed_at', { ascending: false })
        .limit(500)

      if (dateFilter !== 'all') {
        const now = new Date()
        let from: Date
        if (dateFilter === 'today') {
          from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        } else if (dateFilter === '7d') {
          from = new Date(now.getTime() - 7 * 86400000)
        } else {
          from = new Date(now.getTime() - 30 * 86400000)
        }
        query = query.gte('viewed_at', from.toISOString())
      }

      const { data, error } = await query
      if (error) {
        console.error('[Analytics] Load error:', error.message)
        setViews([])
      } else {
        setViews((data as PageView[]) || [])
      }

      // Besucher-Daten (IP, Region) laden
      let vQuery = supabase
        .from('visitors')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)

      if (dateFilter !== 'all') {
        const now = new Date()
        let from: Date
        if (dateFilter === 'today') {
          from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        } else if (dateFilter === '7d') {
          from = new Date(now.getTime() - 7 * 86400000)
        } else {
          from = new Date(now.getTime() - 30 * 86400000)
        }
        vQuery = vQuery.gte('created_at', from.toISOString())
      }

      const { data: vData } = await vQuery
      setVisitors((vData as Visitor[]) || [])
    } catch (err) {
      console.error('[Analytics] Unexpected error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Aggregate stats
  const pageStats: PageStat[] = (() => {
    const map = new Map<string, { path: string; count: number; users: Set<string> }>()
    for (const v of views) {
      const key = v.page_label
      if (!map.has(key)) map.set(key, { path: v.path, count: 0, users: new Set() })
      const entry = map.get(key)!
      entry.count++
      if (v.user_id) entry.users.add(v.user_id)
    }
    return Array.from(map.entries())
      .map(([page_label, d]) => ({ page_label, path: d.path, count: d.count, unique_users: d.users.size }))
      .sort((a, b) => b.count - a.count)
  })()

  const userActivities: UserActivity[] = (() => {
    const map = new Map<string, { name: string; role: string; email: string; views: number; last: string; pages: Set<string> }>()
    for (const v of views) {
      if (!v.user_id) continue
      const p = v.profile as any
      const uid = v.user_id
      if (!map.has(uid)) {
        map.set(uid, {
          name: p ? `${p.first_name} ${(p.last_name || '').charAt(0)}.` : 'Unbekannt',
          role: p?.role || '?',
          email: p?.email || '',
          views: 0,
          last: v.viewed_at,
          pages: new Set(),
        })
      }
      const entry = map.get(uid)!
      entry.views++
      entry.pages.add(v.page_label)
      if (v.viewed_at > entry.last) entry.last = v.viewed_at
    }
    return Array.from(map.entries())
      .map(([user_id, d]) => ({ user_id, name: d.name, role: d.role, email: d.email, total_views: d.views, last_seen: d.last, pages: Array.from(d.pages) }))
      .sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime())
  })()

  const totalViews = views.length
  const uniqueUsers = new Set(views.filter(v => v.user_id).map(v => v.user_id)).size
  const anonymousViews = views.filter(v => !v.user_id).length

  function formatTime(iso: string) {
    const d = new Date(iso)
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }
  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }
  function formatDateTime(iso: string) {
    return `${formatDate(iso)} ${formatTime(iso)}`
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'gerade eben'
    if (mins < 60) return `vor ${mins} Min.`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `vor ${hrs} Std.`
    const days = Math.floor(hrs / 24)
    return `vor ${days} Tag${days > 1 ? 'en' : ''}`
  }

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = { kunde: 'var(--green)', engel: 'var(--gold)', admin: 'var(--red-w)' }
    const labels: Record<string, string> = { kunde: 'Kunde', engel: 'Engel', admin: 'Admin' }
    return (
      <span className="an-role-badge" style={{ background: `${colors[role] || 'var(--ink5)'}22`, color: colors[role] || 'var(--ink4)' }}>
        {labels[role] || role}
      </span>
    )
  }

  return (
    <div className="admin-page">
      <div className="an-header">
        <div>
          <h1>Analytik & Besucherstatistik</h1>
          <p className="admin-subtitle">Wer hat wann welche Seiten besucht</p>
        </div>
        <button className="an-refresh" onClick={loadData} disabled={loading}>
          {loading ? '⟳' : '↻'} Aktualisieren
        </button>
      </div>

      {/* Summary Cards */}
      <div className="admin-stats-grid" style={{ marginBottom: 20 }}>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{totalViews}</div>
          <div className="admin-stat-label">Seitenaufrufe</div>
        </div>
        <div className="admin-stat-card accent">
          <div className="admin-stat-value">{uniqueUsers}</div>
          <div className="admin-stat-label">Aktive Nutzer</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{pageStats.length}</div>
          <div className="admin-stat-label">Besuchte Seiten</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{anonymousViews}</div>
          <div className="admin-stat-label">Anonym</div>
        </div>
      </div>

      {/* Date Filter + Tabs */}
      <div className="an-controls">
        <div className="an-tabs">
          {([['visitors', 'Besucher 🌍'], ['live', 'Live-Feed'], ['pages', 'Seiten'], ['users', 'Nutzer']] as const).map(([key, label]) => (
            <button key={key} className={`an-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
        <div className="an-date-filter">
          {([['today', 'Heute'], ['7d', '7 Tage'], ['30d', '30 Tage'], ['all', 'Alle']] as const).map(([key, label]) => (
            <button key={key} className={`an-date-btn ${dateFilter === key ? 'active' : ''}`} onClick={() => setDateFilter(key)}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="an-loading">Daten werden geladen...</div>
      ) : (
        <>
          {/* Visitors Tab - IP, Region, Land */}
          {tab === 'visitors' && (
            <div className="an-table-wrap">
              <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--gold)', background: 'rgba(201,150,60,0.08)', borderRadius: 8, marginBottom: 12 }}>
                {visitors.length} Besucher · {new Set(visitors.map(v => v.ip)).size} einzigartige IPs · {new Set(visitors.filter(v => v.country).map(v => v.country)).size} Länder
              </div>
              <table className="an-table">
                <thead>
                  <tr>
                    <th>Zeit</th>
                    <th>IP</th>
                    <th>Land / Region / Stadt</th>
                    <th>Seite</th>
                    <th>Referrer</th>
                  </tr>
                </thead>
                <tbody>
                  {visitors.length === 0 && (
                    <tr><td colSpan={5} className="an-empty">Noch keine Besucher-Daten. Tracking startet nach dem nächsten Deploy.</td></tr>
                  )}
                  {visitors.map(v => (
                    <tr key={v.id}>
                      <td className="an-time">
                        <div>{formatTime(v.created_at)}</div>
                        <div className="an-time-sub">{formatDate(v.created_at)}</div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{v.ip}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {v.country && <span className="an-page-tag">{v.country}</span>}
                          {v.region && <span className="an-page-tag">{v.region}</span>}
                          {v.city && <span className="an-page-tag">{v.city}</span>}
                          {!v.country && !v.region && !v.city && <span className="an-anon">—</span>}
                        </div>
                      </td>
                      <td>
                        <div className="an-page-name">{v.page}</div>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--ink4)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.referrer || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Live Feed Tab */}
          {tab === 'live' && (
            <div className="an-table-wrap">
              <table className="an-table">
                <thead>
                  <tr>
                    <th>Zeit</th>
                    <th>Nutzer</th>
                    <th>Seite</th>
                    <th>Gerät</th>
                  </tr>
                </thead>
                <tbody>
                  {views.length === 0 && (
                    <tr><td colSpan={4} className="an-empty">Keine Daten für diesen Zeitraum</td></tr>
                  )}
                  {views.map(v => {
                    const p = v.profile as any
                    const isMobile = (v.screen_width || 0) < 768
                    return (
                      <tr key={v.id}>
                        <td className="an-time">
                          <div>{formatTime(v.viewed_at)}</div>
                          <div className="an-time-sub">{formatDate(v.viewed_at)}</div>
                        </td>
                        <td>
                          {p ? (
                            <div className="an-user-cell">
                              <div className="an-user-av"><IconUser size={14} /></div>
                              <div>
                                <div className="an-user-name">{p.first_name} {p.last_name}</div>
                                <div className="an-user-email">{p.email}</div>
                              </div>
                              {roleBadge(p.role)}
                            </div>
                          ) : (
                            <span className="an-anon">Anonym</span>
                          )}
                        </td>
                        <td>
                          <div className="an-page-name">{v.page_label}</div>
                          <div className="an-page-path">{v.path}</div>
                        </td>
                        <td className="an-device">{isMobile ? '📱' : '🖥️'} {v.screen_width || '?'}px</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pages Tab */}
          {tab === 'pages' && (
            <div className="an-table-wrap">
              <table className="an-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Seite</th>
                    <th>Aufrufe</th>
                    <th>Nutzer</th>
                    <th>Anteil</th>
                  </tr>
                </thead>
                <tbody>
                  {pageStats.length === 0 && (
                    <tr><td colSpan={5} className="an-empty">Keine Daten</td></tr>
                  )}
                  {pageStats.map((ps, i) => {
                    const pct = totalViews > 0 ? Math.round((ps.count / totalViews) * 100) : 0
                    return (
                      <tr key={ps.path}>
                        <td className="an-rank">{i + 1}</td>
                        <td>
                          <div className="an-page-name">{ps.page_label}</div>
                          <div className="an-page-path">{ps.path}</div>
                        </td>
                        <td className="an-num">{ps.count}</td>
                        <td className="an-num">{ps.unique_users}</td>
                        <td>
                          <div className="an-bar-wrap">
                            <div className="an-bar" style={{ width: `${pct}%` }} />
                            <span className="an-bar-lbl">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Users Tab */}
          {tab === 'users' && (
            <div className="an-table-wrap">
              <table className="an-table">
                <thead>
                  <tr>
                    <th>Nutzer</th>
                    <th>Rolle</th>
                    <th>Aufrufe</th>
                    <th>Zuletzt aktiv</th>
                    <th>Besuchte Seiten</th>
                  </tr>
                </thead>
                <tbody>
                  {userActivities.length === 0 && (
                    <tr><td colSpan={5} className="an-empty">Keine Daten</td></tr>
                  )}
                  {userActivities.map(u => (
                    <tr key={u.user_id}>
                      <td>
                        <div className="an-user-cell">
                          <div className="an-user-av"><IconUser size={14} /></div>
                          <div>
                            <div className="an-user-name">{u.name}</div>
                            <div className="an-user-email">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>{roleBadge(u.role)}</td>
                      <td className="an-num">{u.total_views}</td>
                      <td className="an-time">
                        <div>{timeAgo(u.last_seen)}</div>
                        <div className="an-time-sub">{formatDateTime(u.last_seen)}</div>
                      </td>
                      <td>
                        <div className="an-page-tags">
                          {u.pages.slice(0, 5).map(p => (
                            <span key={p} className="an-page-tag">{p}</span>
                          ))}
                          {u.pages.length > 5 && <span className="an-page-tag more">+{u.pages.length - 5}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
