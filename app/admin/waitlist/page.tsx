'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, timeAgo } from '@/lib/admin/ops'
import {
  WARTELISTE_STUFEN_FLOW, WARTELISTE_VORWAERTS, WARTELISTE_OFFEN, WARTELISTE_REGIONEN,
  WARTELISTE_STUFE_MIGRATION,
  regionLabel, pflegegradLabel, leistungLabel, stufeAusDbWert, wartelisteStufeMeta, wartelisteStufe,
} from '@/lib/warteliste/katalog'
import {
  berechnePrioritaet, sortiereWarteliste, WARTELISTE_SORTIERUNGEN,
  type WartelisteLead, type WartelisteSortierung, type Prioritaet,
} from '@/lib/warteliste/prioritaet'
import { FOLLOW_UP_META, zaehleFollowUps } from '@/lib/leads/follow-up'
import { updateWaitlistStatus } from './actions'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { klickbareZeile } from '@/lib/a11y'
import EmailVorlagenDialog from '@/components/admin/EmailVorlagenDialog'
import { logger } from '@/lib/logger'

const log = logger.child('admin:waitlist')

// ═══════════════════════════════════════════════════════════════════════
// Kunden-Warteliste — Verwaltung (Admin-Inbox)
//
// Liest `state_waitlist` — die EINE Warteliste, live seit 20260808100000
// und zugleich die Quelle des Expansion-Moduls. Gelesen wird mit dem
// Browser-Client, also unter RLS; die Seite ist in BEREICHE auf
// `marketing.verwalten` (NUR_ADMINISTRATION) registriert.
//
// STUFEN: NEU → KONTAKTIERT → TERMIN → WARTELISTE → KUNDE, Ausstieg
// ABGELEHNT. Die Übersetzung Stufe ↔ DB-Wert steht in
// lib/warteliste/katalog.ts (z. B. „Kunde" = `aktiviert`).
//
// FOLLOW-UP: 24/48/72-h-Leiter aus lib/leads/follow-up.ts. Die Seite
// rechnet live beim Laden; dieselbe Rechnung meldet die Tages-Kette
// `lead_follow_up` in die Glocke.
//
// PRIORITÄT: Punktzahl aus Dringlichkeit, Pflegegrad, Region,
// Leistungswunsch, Quelle, Datum und letztem Kontakt
// (lib/warteliste/prioritaet.ts) — mit Aufschlüsselung in der Zeile.
// ═══════════════════════════════════════════════════════════════════════

interface Eintrag extends WartelisteLead {
  name: string
  email: string | null
  phone: string | null
  utm_medium: string | null
  utm_campaign: string | null
}

/** Filter zusätzlich zu den Stufen. */
const FILTER_NACHFASSEN = 'nachfassen'
const FILTER_OFFEN = 'offen'

export default function AdminWaitlistPage() {
  const [rows, setRows] = useState<Eintrag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tabelleFehlt, setTabelleFehlt] = useState(false)
  const [filter, setFilter] = useState<string>(FILTER_OFFEN)
  const [region, setRegion] = useState('alle')
  const [search, setSearch] = useState('')
  const [sortierung, setSortierung] = useState<WartelisteSortierung>('prioritaet')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [mailAn, setMailAn] = useState<Eintrag | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // Zeitpunkt der Rechnung: einmal je Laden, nicht je Render — sonst
  // springen Zeilen während der Bearbeitung um.
  const [jetzt, setJetzt] = useState(() => new Date())

  // Deep-Link aus der Glocke/Tages-Mail: ?filter=nachfassen
  useEffect(() => {
    try {
      const f = new URLSearchParams(window.location.search).get('filter')
      if (f && (f === FILTER_NACHFASSEN || f === FILTER_OFFEN || f === 'alle' || WARTELISTE_STUFEN_FLOW.includes(f))) {
        setFilter(f)
      }
    } catch { /* ohne URL-Parameter bleibt der Standardfilter */ }
  }, [])

  async function laden() {
    try {
      const supabase = createClient()
      const { data, error: fehler } = await supabase
        .from('state_waitlist')
        .select('*')
        .order('created_at', { ascending: false })

      if (fehler) {
        if (fehler.code === 'PGRST205') {
          setTabelleFehlt(true)
          return
        }
        log.error(`state_waitlist laden fehlgeschlagen: ${fehler.message}`)
        setError(`Die Warteliste konnte nicht geladen werden: ${fehler.message}`)
        return
      }

      setRows((data || []).map((z: any) => ({
        id: z.id,
        name: z.name || '—',
        email: z.email,
        phone: z.telefon,
        // `ort` traegt das Regions-Label; `bundesland` den FK-Code.
        region: z.ort || null,
        bundesland: z.bundesland || null,
        pflegegrad: z.pflegegrad ?? null,
        gewuenschte_leistungen: Array.isArray(z.gewuenschte_leistungen) ? z.gewuenschte_leistungen : [],
        nachricht: z.nachricht ?? null,
        quelle: z.quelle ?? null,
        utm_medium: z.utm_medium ?? null,
        utm_campaign: z.utm_campaign ?? null,
        stufe: stufeAusDbWert(z.status),
        created_at: z.created_at,
        updated_at: z.updated_at ?? null,
      })))
      setJetzt(new Date())
    } catch (err) {
      log.errorWithException('Warteliste laden fehlgeschlagen', err)
      setError('Die Warteliste konnte nicht geladen werden. Bitte laden Sie die Seite neu.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { laden() }, [])

  async function setStufe(eintrag: Eintrag, stufe: string) {
    setBusy(eintrag.id)
    const ergebnis = await updateWaitlistStatus(eintrag.id, stufe, eintrag.stufe)
    setBusy(null)
    if (!ergebnis.ok) { setError(ergebnis.error); return }
    setError(null)
    setRows(prev => prev.map(r => r.id === eintrag.id
      ? { ...r, stufe, updated_at: ergebnis.aktualisiertAm ?? new Date().toISOString() }
      : r))
  }

  const prio = useMemo(() => {
    const m = new Map<string, Prioritaet>()
    rows.forEach(r => m.set(r.id, berechnePrioritaet(r, jetzt)))
    return m
  }, [rows, jetzt])
  const prioVon = (r: Eintrag) => prio.get(r.id) ?? berechnePrioritaet(r, jetzt)

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    rows.forEach(r => { m[r.stufe] = (m[r.stufe] || 0) + 1 })
    return m
  }, [rows])

  const offen = useMemo(() => rows.filter(r => WARTELISTE_OFFEN.includes(r.stufe)).length, [rows])

  const followUps = useMemo(
    () => zaehleFollowUps(rows.map(r => prioVon(r).followUp)),
    [rows, prio],
  )

  const gefiltert = useMemo(() => {
    const q = search.trim().toLowerCase()
    const treffer = rows.filter(r => {
      if (filter === FILTER_NACHFASSEN) {
        if (prioVon(r).followUp === 'keine') return false
      } else if (filter === FILTER_OFFEN) {
        if (['kunde', 'abgelehnt'].includes(r.stufe)) return false
      } else if (filter !== 'alle' && r.stufe !== filter) return false
      if (region !== 'alle' && r.region !== regionLabel(region)) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q)
        || (r.email || '').toLowerCase().includes(q)
        || (r.phone || '').toLowerCase().includes(q)
        || (r.region || '').toLowerCase().includes(q)
        || (r.quelle || '').toLowerCase().includes(q)
    })
    return sortiereWarteliste(treffer, sortierung, prioVon)
  }, [rows, filter, region, search, sortierung, prio])

  if (loading) {
    return <div className="admin-page"><h1>Warteliste</h1><p>Laden…</p></div>
  }

  // Tabelle fehlt: handlungsleitend melden statt „keine Einträge". Eine
  // leere Tabelle wäre hier eine Aussage, welche die Seite nicht treffen
  // kann — sie weiß nicht, ob niemand sich eingetragen hat oder ob die
  // Tabelle fehlt.
  if (tabelleFehlt) {
    return (
      <div className="admin-page">
        <h1>Warteliste</h1>
        <Banner tone="warn">
          Die Tabelle <code>state_waitlist</code> ist nicht erreichbar.
        </Banner>
        <div className="admin-table-wrap" style={{ marginTop: 14, padding: 16 }}>
          <p style={{ marginTop: 0 }}>
            Das sollte nicht vorkommen: <code>state_waitlist</code> steht live seit dem 08.08.2026
            (Migration 20260808100000). Bitte Schema und Rechte prüfen.
          </p>
          <p>
            Solange sie fehlt, nimmt auch das öffentliche Formular unter <code>/warteliste</code>
            keine Einträge an: die Route antwortet mit <code>503</code> und einem Hinweis, statt
            einen Erfolg vorzutäuschen.
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

      {/* Follow-up: 24 h Erinnerung, 48 h Eskalation, 72 h Dringend. */}
      {followUps.gesamt > 0 ? (
        <Banner tone={followUps.dringend > 0 ? 'danger' : 'warn'}>
          <strong>Nachfassen nötig:</strong>{' '}
          {[
            followUps.dringend ? `${followUps.dringend} dringend (>72 h)` : null,
            followUps.eskalation ? `${followUps.eskalation} eskaliert (>48 h)` : null,
            followUps.erinnerung ? `${followUps.erinnerung} Erinnerung (>24 h)` : null,
          ].filter(Boolean).join(' · ')}
          {filter !== FILTER_NACHFASSEN && (
            <button onClick={() => setFilter(FILTER_NACHFASSEN)} style={{ ...aktionBtn, marginLeft: 10 }}>
              Nur diese zeigen
            </button>
          )}
        </Banner>
      ) : rows.length > 0 ? (
        <Banner tone="success">Kein Lead überfällig — alle offenen Vormerkungen sind im Zeitplan.</Banner>
      ) : null}

      <div style={{ margin: '14px 0' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Name, E-Mail, Telefon, Region, Quelle…" />
      </div>

      <div className="admin-filters">
        <button className={`admin-filter-btn ${filter === FILTER_OFFEN ? 'active' : ''}`} onClick={() => setFilter(FILTER_OFFEN)}>
          Offen ({offen})
        </button>
        <button className={`admin-filter-btn ${filter === FILTER_NACHFASSEN ? 'active' : ''}`} onClick={() => setFilter(FILTER_NACHFASSEN)}
          title="24 h ohne Bearbeitung (NEU) oder Wiedervorlage überfällig">
          Nachfassen ({followUps.gesamt})
        </button>
        {WARTELISTE_STUFEN_FLOW.map(s => (
          <button key={s} className={`admin-filter-btn ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            {wartelisteStufeMeta(s).label} ({counts[s] || 0})
          </button>
        ))}
        <button className={`admin-filter-btn ${filter === 'alle' ? 'active' : ''}`} onClick={() => setFilter('alle')}>
          Alle ({rows.length})
        </button>
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '12px 0 16px', alignItems: 'center' }}>
        <label style={{ fontSize: 13, color: 'var(--ink3)' }}>
          Region:{' '}
          <select className="admin-select" value={region} onChange={e => setRegion(e.target.value)}>
            <option value="alle">Alle Regionen</option>
            {WARTELISTE_REGIONEN.map(r => (
              <option key={r.key} value={r.key}>
                {r.label} ({rows.filter(x => x.region === r.label).length})
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13, color: 'var(--ink3)' }}>
          Sortierung:{' '}
          <select className="admin-select" value={sortierung} onChange={e => setSortierung(e.target.value as WartelisteSortierung)}>
            {WARTELISTE_SORTIERUNGEN.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Prio</th><th>Eingegangen</th><th>Name</th><th>Region</th>
              <th>Pflegegrad</th><th>Leistungen</th><th>Quelle</th><th>Letzter Kontakt</th>
              <th>Stufe</th><th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.length === 0 ? (
              <EmptyRow colSpan={10}>
                {search || filter !== FILTER_OFFEN || region !== 'alle'
                  ? 'Keine Treffer'
                  : 'Keine offenen Vormerkungen'}
              </EmptyRow>
            ) : gefiltert.map(e => {
              const sm = wartelisteStufeMeta(e.stufe)
              const p = prioVon(e)
              const fu = FOLLOW_UP_META[p.followUp]
              const idx = WARTELISTE_VORWAERTS.indexOf(e.stufe)
              const naechster = idx >= 0 && idx < WARTELISTE_VORWAERTS.length - 1 ? WARTELISTE_VORWAERTS[idx + 1] : null
              const offenKlappe = expanded === e.id
              const hatBearbeitung = e.updated_at && e.created_at && Date.parse(e.updated_at) - Date.parse(e.created_at) > 5000
              return (
                <Fragment key={e.id}>
                  <tr {...klickbareZeile(() => setExpanded(offenKlappe ? null : e.id))}
                    aria-expanded={offenKlappe}
                    style={{ cursor: 'pointer', boxShadow: p.followUp !== 'keine' ? `inset 4px 0 0 ${fu.color}` : undefined }}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{p.punkte}</div>
                      {p.followUp !== 'keine' && <StatusBadge label={fu.label} color={fu.color} />}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                      {timeAgo(e.created_at)}
                      <div style={{ color: 'var(--ink5)', fontSize: 11 }}>{formatDate(e.created_at)}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{e.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{e.email || e.phone || '—'}</div>
                    </td>
                    <td style={{ fontSize: 13 }}>{e.region || '—'}</td>
                    <td style={{ fontSize: 13 }}>{pflegegradLabel(e.pflegegrad)}</td>
                    <td style={{ fontSize: 13 }} title={e.gewuenschte_leistungen.map(leistungLabel).join(', ')}>
                      {e.gewuenschte_leistungen.length || '—'}
                    </td>
                    <td style={{ fontSize: 13 }}>{e.quelle || '—'}</td>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {hatBearbeitung ? timeAgo(e.updated_at) : <span style={{ color: 'var(--ink5)' }}>noch keiner</span>}
                    </td>
                    <td><StatusBadge label={sm.label} color={sm.color} /></td>
                    <td onClick={ev => ev.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {naechster && (
                          <button disabled={busy === e.id} onClick={() => setStufe(e, naechster)} style={aktionBtn}
                            title={WARTELISTE_STUFE_MIGRATION[naechster]
                              ? `Braucht Migration ${WARTELISTE_STUFE_MIGRATION[naechster]}, falls noch nicht angewendet`
                              : undefined}>
                            → {wartelisteStufeMeta(naechster).label}
                          </button>
                        )}
                        <button onClick={() => setMailAn(e)} style={mailBtn}>✉ E-Mail</button>
                        {e.stufe !== 'abgelehnt' && e.stufe !== 'kunde' && (
                          <button disabled={busy === e.id} onClick={() => setStufe(e, 'abgelehnt')} style={abmeldenBtn}>
                            Ablehnen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {offenKlappe && (
                    <tr>
                      <td colSpan={10} style={{ background: 'var(--coal3)', padding: 16 }}>
                        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, marginBottom: 10 }}>
                          {e.email && <span style={{ color: 'var(--ink3)' }}>✉️ {e.email}</span>}
                          {e.phone && <span style={{ color: 'var(--ink3)' }}>📞 {e.phone}</span>}
                          <span style={{ color: 'var(--ink3)' }}>
                            Interesse:{' '}
                            {e.gewuenschte_leistungen.length
                              ? e.gewuenschte_leistungen.map(leistungLabel).join(', ')
                              : 'keine Angabe'}
                          </span>
                          {(e.quelle || e.utm_medium || e.utm_campaign) && (
                            <span style={{ color: 'var(--ink5)' }}>
                              Kampagne: {[e.quelle, e.utm_medium, e.utm_campaign].filter(Boolean).join(' · ')}
                            </span>
                          )}
                          {p.wiedervorlageAm && (
                            <span style={{ color: 'var(--ink3)' }}>
                              Wiedervorlage: {formatDate(p.wiedervorlageAm)}
                              {' '}({wartelisteStufe(e.stufe).wiedervorlageTage} Tage nach letzter Bearbeitung)
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 10 }}>
                          <strong>Warum Priorität {p.punkte}:</strong>{' '}
                          {p.teile.length
                            ? p.teile.map(t => `${t.grund} (+${t.punkte})`).join(' · ')
                            : 'keine Kriterien erfüllt'}
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                          <span style={{ fontSize: 12, color: 'var(--ink5)', alignSelf: 'center' }}>Stufe setzen:</span>
                          {WARTELISTE_STUFEN_FLOW.filter(s => s !== e.stufe).map(s => (
                            <button key={s} disabled={busy === e.id} onClick={() => setStufe(e, s)} style={mailBtn}>
                              {wartelisteStufeMeta(s).label}
                            </button>
                          ))}
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

      {mailAn && (
        <EmailVorlagenDialog
          zielgruppe="kunde"
          empfaengerEmail={mailAn.email}
          empfaengerName={mailAn.name}
          vorbelegung={{ vorname: (mailAn.name || '').trim().split(/\s+/)[0] ?? '' }}
          onClose={() => setMailAn(null)}
        />
      )}
    </div>
  )
}

const mailBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--ink2)', background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
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
