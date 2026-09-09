'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, timeAgo, statusMeta } from '@/lib/admin/ops'
import {
  WARTELISTE_STATUS, WARTELISTE_STATUS_FLOW, WARTELISTE_REGIONEN,
  regionLabel, pflegegradLabel, leistungLabel,
} from '@/lib/warteliste/katalog'
import { updateWaitlistStatus } from './actions'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { klickbareZeile } from '@/lib/a11y'
import { logger } from '@/lib/logger'

const log = logger.child('admin:waitlist')

// ═══════════════════════════════════════════════════════════════════════
// Kunden-Warteliste — Verwaltung
//
// Liest `waitlist_customers` mit dem Browser-Client, also unter RLS. Dort
// steht genau eine verwaltende Policy: is_admin(). Die Seite ist in
// BEREICHE entsprechend auf `marketing.verwalten` (NUR_ADMINISTRATION)
// registriert — stuende dort ein Recht, das auch pdl oder qm tragen,
// saehen die eine leere Liste ohne Fehlermeldung (siehe lint:rls-sicht).
// ═══════════════════════════════════════════════════════════════════════

interface Eintrag {
  id: string
  name: string
  email: string | null
  phone: string | null
  region: string | null
  pflegegrad: string | null
  gewuenschte_leistungen: string[]
  nachricht: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  status: string
  created_at: string | null
}

export default function AdminWaitlistPage() {
  const [rows, setRows] = useState<Eintrag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tabelleFehlt, setTabelleFehlt] = useState(false)
  const [filter, setFilter] = useState('alle')
  const [region, setRegion] = useState('alle')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  async function laden() {
    try {
      const supabase = createClient()
      const { data, error: fehler } = await supabase
        .from('waitlist_customers')
        .select('id, name, email, phone, region, pflegegrad, gewuenschte_leistungen, nachricht, utm_source, utm_medium, utm_campaign, status, created_at')
        .order('created_at', { ascending: false })

      if (fehler) {
        // Die Tabelle steht erst, wenn Migration 20261031000000 angewendet
        // ist — das kann nur ein Mensch im Supabase-SQL-Editor. Dieser Fall
        // bekommt eine eigene, handlungsleitende Meldung statt einer rohen
        // PostgREST-Zeile.
        if (fehler.code === 'PGRST205') {
          setTabelleFehlt(true)
          return
        }
        log.error(`waitlist_customers laden fehlgeschlagen: ${fehler.message}`)
        setError(`Die Warteliste konnte nicht geladen werden: ${fehler.message}`)
        return
      }

      setRows((data || []).map((z: any) => ({
        id: z.id,
        name: z.name || '—',
        email: z.email,
        phone: z.phone,
        region: z.region,
        pflegegrad: z.pflegegrad,
        gewuenschte_leistungen: Array.isArray(z.gewuenschte_leistungen) ? z.gewuenschte_leistungen : [],
        nachricht: z.nachricht,
        utm_source: z.utm_source,
        utm_medium: z.utm_medium,
        utm_campaign: z.utm_campaign,
        status: z.status || 'neu',
        created_at: z.created_at,
      })))
    } catch (err) {
      log.errorWithException('Warteliste laden fehlgeschlagen', err)
      setError('Die Warteliste konnte nicht geladen werden. Bitte laden Sie die Seite neu.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { laden() }, [])

  async function setStatus(eintrag: Eintrag, status: string) {
    const ergebnis = await updateWaitlistStatus(eintrag.id, status)
    if (!ergebnis.ok) { setError(ergebnis.error); return }
    setError(null)
    setRows(prev => prev.map(r => r.id === eintrag.id ? { ...r, status } : r))
  }

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    rows.forEach(r => { m[r.status] = (m[r.status] || 0) + 1 })
    return m
  }, [rows])

  const offen = useMemo(
    () => rows.filter(r => !['aktiviert', 'abgemeldet'].includes(r.status)).length,
    [rows],
  )

  const gefiltert = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'alle' && r.status !== filter) return false
      if (region !== 'alle' && r.region !== region) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q)
        || (r.email || '').toLowerCase().includes(q)
        || (r.phone || '').toLowerCase().includes(q)
        || regionLabel(r.region).toLowerCase().includes(q)
    })
  }, [rows, filter, region, search])

  if (loading) {
    return <div className="admin-page"><h1>Warteliste</h1><p>Laden…</p></div>
  }

  // Migration steht aus: handlungsleitend melden statt „keine Einträge".
  // Eine leere Tabelle wäre hier eine Aussage, welche die Seite nicht
  // treffen kann — sie weiß nicht, ob niemand sich eingetragen hat oder ob
  // die Tabelle fehlt.
  if (tabelleFehlt) {
    return (
      <div className="admin-page">
        <h1>Warteliste</h1>
        <Banner tone="warn">
          Die Tabelle <code>waitlist_customers</code> steht noch nicht in der Produktionsdatenbank.
        </Banner>
        <div className="admin-table-wrap" style={{ marginTop: 14, padding: 16 }}>
          <p style={{ marginTop: 0 }}>
            Anzuwenden ist <strong>supabase/migrations/20261031000000_waitlist_customers.sql</strong> im
            Supabase-SQL-Editor als Rolle <code>postgres</code>. Über den Dienstschlüssel scheitert
            jedes DDL am Eigentümer (Fehler 42501) — dieser Schritt lässt sich nicht automatisieren.
          </p>
          <p>
            Bis dahin nimmt auch das öffentliche Formular unter <code>/warteliste</code> keine
            Einträge an: die Route antwortet mit <code>503</code> und einem Hinweis, statt einen
            Erfolg vorzutäuschen. Es geht also nichts verloren — es kommt nur noch nichts an.
          </p>
        </div>
      </div>
    )
  }

  if (error && rows.length === 0) {
    return (
      <div className="admin-page">
        <h1>Warteliste</h1>
        <Banner tone="danger">{error}</Banner>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Warteliste</h1>
          <p className="admin-subtitle">
            {rows.length} Vormerkungen · {offen} offen · {counts['neu'] || 0} noch nicht kontaktiert
          </p>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ marginBottom: 14 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Name, E-Mail, Telefon, Region…" />
      </div>

      <div className="admin-filters">
        <button className={`admin-filter-btn ${filter === 'alle' ? 'active' : ''}`} onClick={() => setFilter('alle')}>
          Alle ({rows.length})
        </button>
        {WARTELISTE_STATUS_FLOW.map(s => (
          <button key={s} className={`admin-filter-btn ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            {statusMeta(WARTELISTE_STATUS, s).label} ({counts[s] || 0})
          </button>
        ))}
      </div>

      <div style={{ margin: '12px 0 16px' }}>
        <label style={{ fontSize: 13, color: 'var(--ink3)', marginRight: 8 }}>Region:</label>
        <select className="admin-select" value={region} onChange={e => setRegion(e.target.value)}>
          <option value="alle">Alle Regionen</option>
          {WARTELISTE_REGIONEN.map(r => (
            <option key={r.key} value={r.key}>
              {r.label} ({rows.filter(x => x.region === r.key).length})
            </option>
          ))}
        </select>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Eingegangen</th><th>Name</th><th>Kontakt</th><th>Region</th>
              <th>Pflegegrad</th><th>Status</th><th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.length === 0 ? (
              <EmptyRow colSpan={7}>
                {search || filter !== 'alle' || region !== 'alle'
                  ? 'Keine Treffer'
                  : 'Noch keine Vormerkungen eingegangen'}
              </EmptyRow>
            ) : gefiltert.map(e => {
              const sm = statusMeta(WARTELISTE_STATUS, e.status)
              const idx = WARTELISTE_STATUS_FLOW.indexOf(e.status)
              // Der Vorwärtsweg endet bei „Aktiviert". „Abgemeldet" ist ein
              // Ausstieg und bekommt einen eigenen Knopf, keinen Pfeil.
              const naechster = idx >= 0 && idx < 3 ? WARTELISTE_STATUS_FLOW[idx + 1] : null
              const offenKlappe = expanded === e.id
              return (
                <Fragment key={e.id}>
                  <tr {...klickbareZeile(() => setExpanded(offenKlappe ? null : e.id))}
                    aria-expanded={offenKlappe} style={{ cursor: 'pointer' }}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                      {timeAgo(e.created_at)}
                      <div style={{ color: 'var(--ink5)', fontSize: 11 }}>{formatDate(e.created_at)}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{e.name}</td>
                    <td style={{ fontSize: 13 }}>
                      {e.email && <div>{e.email}</div>}
                      {e.phone && <div style={{ color: 'var(--ink3)' }}>{e.phone}</div>}
                    </td>
                    <td style={{ fontSize: 13 }}>{regionLabel(e.region)}</td>
                    <td style={{ fontSize: 13 }}>{pflegegradLabel(e.pflegegrad)}</td>
                    <td><StatusBadge label={sm.label} color={sm.color} /></td>
                    <td onClick={ev => ev.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {naechster && (
                          <button onClick={() => setStatus(e, naechster)} style={aktionBtn}>
                            → {statusMeta(WARTELISTE_STATUS, naechster).label}
                          </button>
                        )}
                        {e.status !== 'abgemeldet' && (
                          <button onClick={() => setStatus(e, 'abgemeldet')} style={abmeldenBtn}>
                            Abmelden
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {offenKlappe && (
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--coal3)', padding: 16 }}>
                        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, marginBottom: 10 }}>
                          <span style={{ color: 'var(--ink3)' }}>
                            Interesse:{' '}
                            {e.gewuenschte_leistungen.length
                              ? e.gewuenschte_leistungen.map(leistungLabel).join(', ')
                              : 'keine Angabe'}
                          </span>
                          {(e.utm_source || e.utm_medium || e.utm_campaign) && (
                            <span style={{ color: 'var(--ink5)' }}>
                              Kampagne: {[e.utm_source, e.utm_medium, e.utm_campaign].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                        {e.nachricht
                          ? <div style={{ fontSize: 13, color: 'var(--ink2)' }}>{e.nachricht}</div>
                          : <div style={{ fontSize: 13, color: 'var(--ink5)' }}>Keine Nachricht hinterlassen.</div>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const aktionBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const abmeldenBtn: React.CSSProperties = {
  fontSize: 12, color: '#D04B3B', background: 'rgba(208,75,59,0.1)',
  border: '1px solid rgba(208,75,59,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
