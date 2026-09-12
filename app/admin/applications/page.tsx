'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate, timeAgo, APPLICATION_SOURCE, BEWERBUNG_FILTER,
} from '@/lib/admin/ops'
import { updateApplicationStatus, createApplication, setApplicationWiedervorlage } from './actions'
import {
  BEWERBER_STUFEN, BEWERBER_STUFEN_FLOW, BEWERBER_VORWAERTS, BEWERBER_ENDZUSTAENDE,
  bewerberStufe, stufeFuerBewerbung, followUpFuerBewerbung, wiedervorlageFuerBewerbung,
  hatFormularangaben, type PipelineVerlauf,
} from '@/lib/bewerbung/pipeline'
import { FOLLOW_UP_META, zaehleFollowUps, type FollowUpStufe } from '@/lib/leads/follow-up'
import {
  qualifikationLabel, fuehrerscheinLabel, spracheLabel,
  verfuegbarkeitLabel, stundenLabel, beschaeftigungsartLabel,
  type BewerbungDaten,
} from '@/lib/bewerbung/katalog'
import { regionLabel } from '@/lib/warteliste/katalog'
import {
  berechneFortschritt, stufeFuer, FORTSCHRITT_STUFEN, erinnerungSinnvoll,
} from '@/lib/bewerbung/fortschritt'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger'
import DialogOverlay from '@/components/DialogOverlay'
import { klickbareZeile } from '@/lib/a11y'
import EmailVorlagenDialog from '@/components/admin/EmailVorlagenDialog'
const log = logger.child('admin:applications')

/**
 * Eine Bewerbung, wie sie in `lead_inquiries` steht.
 *
 * Die Tabelle `applications`, aus der diese Seite frueher gelesen hat, ist
 * laut Migration 20261027000000 bewusst tot und traegt produktiv null
 * Zeilen — die Verwaltung sah deshalb dauerhaft eine leere Liste, waehrend
 * die echten Bewerbungen ueber das Website-Formular in `lead_inquiries`
 * eingingen.
 *
 * Vier Spalten heissen hier anders als vorher, und zwei gibt es nicht mehr:
 *   first_name + last_name  →  name      (ein Feld, ungetrennt)
 *   position                →  service   ("Engel-Bewerbung (Pflegehelfer/in)")
 *   notes                   →  message
 *   interview_date          →  entfaellt (keine Spalte)
 *   referred_by_caregiver_id→  bewerbung_daten.empfohlen_von_caregiver_id
 */
interface AppRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  plz: string | null
  source: string | null
  referredById: string | null
  referredBy: string | null
  /** Qualifikation/Stelle aus `service`. */
  position: string | null
  status: string
  notes: string | null
  created_at: string | null
  eingereicht_am: string | null
  updated_at: string | null
  /** Zusatzangaben aus /api/apply — bei Altbestaenden leer. */
  daten: BewerbungDaten | null
  /** Feine Stufe (8 Stufen), aus Pipeline oder Status abgeleitet. */
  stufe: string
  stufeSeit: string | null
  verlauf: PipelineVerlauf[]
  /** lead_inquiries.follow_up_date — automatische Wiedervorlage. */
  follow_up_date: string | null
}

/** Filter zusaetzlich zu den Stufen. */
const FILTER_OFFEN = 'offen'
const FILTER_NACHFASSEN = 'nachfassen'
const FILTER_LUECKEN = 'luecken'

const SORTIERUNGEN = [
  { key: 'dringlichkeit', label: 'Dringlichkeit (empfohlen)' },
  { key: 'wiedervorlage', label: 'Wiedervorlage (früheste zuerst)' },
  { key: 'datum_neu', label: 'Eingang (neueste zuerst)' },
  { key: 'datum_alt', label: 'Eingang (älteste zuerst)' },
  { key: 'fortschritt', label: 'Vollständigkeit' },
] as const
type Sortierung = (typeof SORTIERUNGEN)[number]['key']

export default function AdminApplicationsPage() {
  const [rows, setRows] = useState<AppRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>(FILTER_OFFEN)
  const [sortierung, setSortierung] = useState<Sortierung>('dringlichkeit')
  // Drei Merkmale, nach denen die Verwaltung tatsaechlich sucht: wo wohnt
  // die Person, was kann sie, wie viel will sie arbeiten.
  const [region, setRegion] = useState('alle')
  const [qualifikation, setQualifikation] = useState('alle')
  const [modell, setModell] = useState('alle')
  const [busy, setBusy] = useState<string | null>(null)
  const [jetzt, setJetzt] = useState(() => new Date())
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [mailAn, setMailAn] = useState<AppRow | null>(null)

  async function load() {
    try {
      const supabase = createClient()
      const [appRes, cgRes] = await Promise.all([
        supabase
          .from('lead_inquiries')
          .select('id, name, email, phone, plz, service, source, message, status, created_at, updated_at, eingereicht_am, bewerbung_daten, follow_up_date')
          .or(BEWERBUNG_FILTER)
          .order('created_at', { ascending: false }),
        supabase.from('caregivers').select('id, first_name, last_name'),
      ])
      if (appRes.error) { setError(appRes.error.message); setLoading(false); return }
      const cgMap = new Map<string, string>()
      ;(cgRes.data || []).forEach((c: any) => cgMap.set(c.id, `${c.first_name} ${c.last_name}`.trim()))
      setRows((appRes.data || []).map((a: any) => {
        const empfohlenVon: string | null = a.bewerbung_daten?.empfohlen_von_caregiver_id ?? null
        const st = stufeFuerBewerbung(a.bewerbung_daten, a.status)
        const verlauf: PipelineVerlauf[] = Array.isArray(a.bewerbung_daten?.pipeline?.verlauf)
          ? a.bewerbung_daten.pipeline.verlauf
          : []
        return {
          id: a.id,
          name: a.name || '—',
          email: a.email,
          phone: a.phone,
          plz: a.plz || null,
          source: a.source,
          referredById: empfohlenVon,
          referredBy: empfohlenVon ? (cgMap.get(empfohlenVon) || 'Mitarbeiter') : null,
          position: a.service,
          status: a.status || 'new',
          notes: a.message,
          created_at: a.created_at,
          eingereicht_am: a.eingereicht_am,
          updated_at: a.updated_at ?? null,
          // Nur echte Formularangaben (version 1) als Detailfelder zeigen —
          // ein reiner Pipeline-Stand oder der Onboarding-Stand waere sonst
          // eine Reihe leerer Felder, die wie fehlende Daten aussaehe.
          daten: hatFormularangaben(a.bewerbung_daten) ? a.bewerbung_daten as BewerbungDaten : null,
          stufe: st.stufe,
          stufeSeit: st.seit,
          verlauf: st.ausStatus ? [] : verlauf,
          follow_up_date: a.follow_up_date ?? null,
        }
      }))
      setJetzt(new Date())
    } catch (err) {
      log.errorWithException('Applications load error', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Deep-Link aus der Glocke/Tages-Mail: ?filter=nachfassen
  useEffect(() => {
    try {
      const f = new URLSearchParams(window.location.search).get('filter')
      if (f && [FILTER_OFFEN, FILTER_NACHFASSEN, FILTER_LUECKEN, 'all', ...BEWERBER_STUFEN_FLOW].includes(f)) setFilter(f)
    } catch { /* ohne URL-Parameter bleibt der Standardfilter */ }
  }, [])

  async function setStufe(app: AppRow, stufe: string) {
    setBusy(app.id)
    const result = await updateApplicationStatus(app.id, stufe, app.stufe)
    setBusy(null)
    if (!result.ok) { setError(result.error); return }
    setError(null)
    const jetztIso = new Date().toISOString()
    setRows(prev => prev.map(r => r.id === app.id
      ? {
          ...r,
          stufe,
          status: bewerberStufe(stufe).dbStatus,
          stufeSeit: jetztIso,
          updated_at: jetztIso,
          follow_up_date: result.followUpDate,
          verlauf: [...r.verlauf, { stufe, am: jetztIso, von: null }],
        }
      : r))
  }

  async function setWiedervorlage(app: AppRow, datum: string | null) {
    setBusy(app.id)
    const result = await setApplicationWiedervorlage(app.id, datum)
    setBusy(null)
    if (!result.ok) { setError(result.error); return }
    setError(null)
    setRows(prev => prev.map(r => r.id === app.id ? { ...r, follow_up_date: datum } : r))
  }

  const followUpVon = (r: AppRow): FollowUpStufe => followUpFuerBewerbung({
    stufe: r.stufe, created_at: r.created_at, updated_at: r.updated_at, follow_up_date: r.follow_up_date,
  }, jetzt)
  const wiedervorlageVon = (r: AppRow): string | null => wiedervorlageFuerBewerbung({
    stufe: r.stufe, created_at: r.created_at, updated_at: r.updated_at, follow_up_date: r.follow_up_date,
  })

  const followUps = useMemo(() => zaehleFollowUps(rows.map(followUpVon)), [rows, jetzt])

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    rows.forEach(r => { m[r.stufe] = (m[r.stufe] || 0) + 1 })
    return m
  }, [rows])

  /**
   * Auswahllisten aus dem BESTAND, nicht aus dem Katalog: eine Liste mit
   * Optionen, die keine einzige Bewerbung trägt, sieht aus wie ein leeres
   * Ergebnis — dabei gab es den Fall nie.
   */
  const vorhanden = useMemo(() => {
    const sammle = (f: (r: AppRow) => string | undefined | null) => {
      const m = new Map<string, number>()
      rows.forEach(r => { const w = f(r); if (w) m.set(w, (m.get(w) ?? 0) + 1) })
      return [...m.entries()].sort((a, b) => b[1] - a[1])
    }
    return {
      regionen: sammle(r => r.daten?.region),
      qualifikationen: sammle(r => r.daten?.qualifikation),
      modelle: sammle(r => r.daten?.beschaeftigungsart),
      ohneAngaben: rows.filter(r => !r.daten).length,
    }
  }, [rows])

  const referralCount = useMemo(() => rows.filter(r => r.referredById).length, [rows])
  // Endzustaende im Wortschatz von lead_inquiries: eingestellt oder abgesagt.
  const openCount = useMemo(
    () => rows.filter(r => !BEWERBER_ENDZUSTAENDE.includes(r.stufe)).length,
    [rows],
  )

  /**
   * Bewerbungen, bei denen Nachfassen etwas bringt: noch offen, lückenhaft,
   * und mit einer E-Mail, über die man fragen kann.
   *
   * Das ist bewusst eine LISTE und kein automatischer Versand. Die
   * Bestätigung nach dem Absenden ist transaktional — eine Antwort auf eine
   * Handlung von gerade. Eine Nachfrage zu einer Bewerbung, die Wochen
   * liegt, ist das nicht; wer sie verschickt, schreibt Menschen
   * unaufgefordert an. Diese Entscheidung gehört einem Menschen, und der
   * Knopf dafür steht in der Zeile.
   */
  const nachfassCount = useMemo(
    () => rows.filter(r => erinnerungSinnvoll(
      { name: r.name, email: r.email, phone: r.phone, plz: r.plz, daten: r.daten },
      r.status,
    )).length,
    [rows],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const treffer = rows.filter(r => {
      if (filter === FILTER_LUECKEN) {
        if (!erinnerungSinnvoll(
          { name: r.name, email: r.email, phone: r.phone, plz: r.plz, daten: r.daten },
          r.status,
        )) return false
      } else if (filter === FILTER_NACHFASSEN) {
        if (followUpVon(r) === 'keine') return false
      } else if (filter === FILTER_OFFEN) {
        if (BEWERBER_ENDZUSTAENDE.includes(r.stufe)) return false
      } else if (filter !== 'all' && r.stufe !== filter) return false
      if (region !== 'alle' && (r.daten?.region ?? '') !== region) return false
      if (qualifikation !== 'alle' && (r.daten?.qualifikation ?? '') !== qualifikation) return false
      if (modell !== 'alle' && (r.daten?.beschaeftigungsart ?? '') !== modell) return false
      if (!q) return true
      // Telefon mitsuchen: bei Website-Bewerbungen ist es das einzige
      // Kontaktmerkmal — eine E-Mail fragt das Formular nicht ab.
      return r.name.toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q) ||
        (r.position || '').toLowerCase().includes(q)
    })
    const zeit = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0)
    const fifo = (a: AppRow, b: AppRow) => zeit(a.created_at) - zeit(b.created_at)
    const wv = (r: AppRow) => zeit(wiedervorlageVon(r)) || Number.MAX_SAFE_INTEGER
    const vollst = (r: AppRow) => berechneFortschritt({ name: r.name, email: r.email, phone: r.phone, plz: r.plz, daten: r.daten }).prozent
    const cmp: Record<Sortierung, (a: AppRow, b: AppRow) => number> = {
      dringlichkeit: (a, b) => (FOLLOW_UP_META[followUpVon(b)].rang - FOLLOW_UP_META[followUpVon(a)].rang)
        || (Number(BEWERBER_ENDZUSTAENDE.includes(a.stufe)) - Number(BEWERBER_ENDZUSTAENDE.includes(b.stufe)))
        || (wv(a) - wv(b)),
      wiedervorlage: (a, b) => wv(a) - wv(b),
      datum_neu: (a, b) => zeit(b.created_at) - zeit(a.created_at),
      datum_alt: () => 0,
      fortschritt: (a, b) => vollst(b) - vollst(a),
    }
    return [...treffer].sort((a, b) => cmp[sortierung](a, b) || fifo(a, b))
  }, [rows, filter, search, sortierung, jetzt, region, qualifikation, modell])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Bewerbungen</h1>
          <p className="admin-subtitle">{rows.length} Bewerbungen · {openCount} offen · {referralCount} per Empfehlung</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={primaryBtn}>+ Bewerbung erfassen</button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {/* Wiedervorlage: NEU 24/48/72 h ab Eingang, spätere Stufen ab follow_up_date. */}
      {!loading && (followUps.gesamt > 0 ? (
        <Banner tone={followUps.dringend > 0 ? 'danger' : 'warn'}>
          <strong>Wiedervorlage fällig:</strong>{' '}
          {[
            followUps.dringend ? `${followUps.dringend} dringend (>72 h)` : null,
            followUps.eskalation ? `${followUps.eskalation} eskaliert (>48 h)` : null,
            followUps.erinnerung ? `${followUps.erinnerung} Erinnerung (>24 h)` : null,
          ].filter(Boolean).join(' · ')}
          {filter !== FILTER_NACHFASSEN && (
            <button onClick={() => setFilter(FILTER_NACHFASSEN)} style={{ ...actionBtn, marginLeft: 10 }}>
              Nur diese zeigen
            </button>
          )}
        </Banner>
      ) : rows.length > 0 ? (
        <Banner tone="success">Keine Wiedervorlage überfällig.</Banner>
      ) : null)}

      <div style={{ margin: '14px 0 16px' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Name, Telefon, E-Mail, Qualifikation…" />
      </div>

      <div className="admin-filters">
        <button className={`admin-filter-btn ${filter === FILTER_OFFEN ? 'active' : ''}`} onClick={() => setFilter(FILTER_OFFEN)}>
          Offen ({openCount})
        </button>
        <button className={`admin-filter-btn ${filter === FILTER_NACHFASSEN ? 'active' : ''}`} onClick={() => setFilter(FILTER_NACHFASSEN)}
          title="NEU seit über 24 h oder Wiedervorlage erreicht">
          Wiedervorlage fällig ({followUps.gesamt})
        </button>
        {BEWERBER_STUFEN.map(st => (
          <button key={st.key} className={`admin-filter-btn ${filter === st.key ? 'active' : ''}`} onClick={() => setFilter(st.key)}>
            {st.label} ({counts[st.key] || 0})
          </button>
        ))}
        <button
          className={`admin-filter-btn ${filter === FILTER_LUECKEN ? 'active' : ''}`}
          onClick={() => setFilter(FILTER_LUECKEN)}
          title="Noch offen, unter 70 % vollständig und mit E-Mail erreichbar"
        >
          Angaben unvollständig ({nachfassCount})
        </button>
        <button className={`admin-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          Alle ({rows.length})
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0 16px' }}>
        <label style={{ fontSize: 13, color: 'var(--ink3)' }}>
          Sortierung:{' '}
          <select className="admin-select" value={sortierung} onChange={e => setSortierung(e.target.value as Sortierung)}>
            {SORTIERUNGEN.map(so => <option key={so.key} value={so.key}>{so.label}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: 'var(--ink3)' }}>
          Region:{' '}
          <select className="admin-select" value={region} onChange={e => setRegion(e.target.value)}>
            <option value="alle">Alle Regionen</option>
            {vorhanden.regionen.map(([k, n]) => <option key={k} value={k}>{regionLabel(k)} ({n})</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: 'var(--ink3)' }}>
          Qualifikation:{' '}
          <select className="admin-select" value={qualifikation} onChange={e => setQualifikation(e.target.value)}>
            <option value="alle">Alle Qualifikationen</option>
            {vorhanden.qualifikationen.map(([k, n]) => <option key={k} value={k}>{qualifikationLabel(k)} ({n})</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: 'var(--ink3)' }}>
          Arbeitsmodell:{' '}
          <select className="admin-select" value={modell} onChange={e => setModell(e.target.value)}>
            <option value="alle">Alle Modelle</option>
            {vorhanden.modelle.map(([k, n]) => <option key={k} value={k}>{beschaeftigungsartLabel(k)} ({n})</option>)}
          </select>
        </label>
        {vorhanden.ohneAngaben > 0 && (
          <span style={{ fontSize: 12, color: 'var(--ink5)' }}>
            {vorhanden.ohneAngaben} Bewerbung(en) ohne Zusatzangaben — die Filter greifen dort nicht.
          </span>
        )}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Name</th><th>Qualifikation</th><th>Vollständig</th><th>Eingegangen</th><th>Wiedervorlage</th><th>Stufe</th><th>Aktion</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={7}>{search || filter !== FILTER_OFFEN ? 'Keine Treffer' : 'Keine offenen Bewerbungen'}</EmptyRow>
              ) : filtered.map(a => {
                const sm = bewerberStufe(a.stufe)
                const fuStufe = followUpVon(a)
                const fu = FOLLOW_UP_META[fuStufe]
                const wvAm = wiedervorlageVon(a)
                const src = a.source ? (APPLICATION_SOURCE[a.source] || APPLICATION_SOURCE.sonstige) : null
                const fortschritt = berechneFortschritt({
                  name: a.name, email: a.email, phone: a.phone, plz: a.plz, daten: a.daten,
                })
                const isOpen = expanded === a.id
                // Der Vorwaertsweg endet bei „Einsatzbereit". Eine Absage ist
                // kein naechster Schritt, sondern der eigene Knopf daneben.
                const idx = BEWERBER_VORWAERTS.indexOf(a.stufe)
                const next = idx >= 0 && idx < BEWERBER_VORWAERTS.length - 1
                  ? BEWERBER_VORWAERTS[idx + 1]
                  : null
                return (
                  <Fragment key={a.id}>
                    <tr {...klickbareZeile(() => setExpanded(isOpen ? null : a.id))} aria-expanded={isOpen}
                      style={{ cursor: 'pointer', boxShadow: fuStufe !== 'keine' ? `inset 4px 0 0 ${fu.color}` : undefined }}>
                      <td style={{ fontWeight: 600 }}>
                        {a.name}
                        {a.referredById && <span title={`Empfohlen von ${a.referredBy}`} style={{ marginLeft: 6 }}>🤝</span>}
                      </td>
                      <td style={{ fontSize: 13 }}>{a.position || '—'}</td>
                      <td style={{ minWidth: 120 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={balkenSpur}>
                            <div style={{
                              width: `${fortschritt.prozent}%`, height: '100%',
                              background: FORTSCHRITT_STUFEN[stufeFuer(fortschritt.prozent)].color,
                              borderRadius: 5,
                            }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{fortschritt.prozent}%</span>
                        </div>
                      </td>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{timeAgo(a.created_at)}</td>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                        {a.stufe === 'neu'
                          ? <span style={{ color: 'var(--ink5)' }}>24 h ab Eingang</span>
                          : wvAm ? formatDate(wvAm) : '—'}
                        {fuStufe !== 'keine' && <div><StatusBadge label={fu.label} color={fu.color} /></div>}
                      </td>
                      <td><StatusBadge label={sm.label} color={sm.color} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {next && (
                            <button disabled={busy === a.id} onClick={() => setStufe(a, next)} style={actionBtn}>
                              → {bewerberStufe(next).label}
                            </button>
                          )}
                          <button onClick={() => setMailAn(a)} style={mailBtn}>
                            ✉ E-Mail
                          </button>
                          {!BEWERBER_ENDZUSTAENDE.includes(a.stufe) && (
                            <button disabled={busy === a.id} onClick={() => setStufe(a, 'abgelehnt')} style={rejectBtn}>Ablehnen</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--coal3)', padding: 16 }}>
                          {/* Stufe, Aufgabe, Wiedervorlage — die Arbeitsleiste zuerst. */}
                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
                            <span style={{ color: 'var(--ink2)' }}>
                              <strong>{sm.label}:</strong> {sm.aufgabe}
                              {a.stufeSeit && <span style={{ color: 'var(--ink5)' }}> · seit {formatDate(a.stufeSeit)}</span>}
                            </span>
                            {!BEWERBER_ENDZUSTAENDE.includes(a.stufe) && (
                              <label style={{ color: 'var(--ink3)' }} onClick={e => e.stopPropagation()}>
                                Wiedervorlage:{' '}
                                <input
                                  type="date"
                                  className="admin-select"
                                  disabled={busy === a.id}
                                  value={a.follow_up_date ?? ''}
                                  onChange={e => { if (e.target.value) setWiedervorlage(a, e.target.value) }}
                                />
                                {!a.follow_up_date && wvAm && (
                                  <span style={{ color: 'var(--ink5)' }}> (automatisch: {formatDate(wvAm)})</span>
                                )}
                              </label>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }} onClick={e => e.stopPropagation()}>
                            <span style={{ fontSize: 12, color: 'var(--ink5)', alignSelf: 'center' }}>Stufe setzen:</span>
                            {BEWERBER_STUFEN_FLOW.filter(k => k !== a.stufe).map(k => (
                              <button key={k} disabled={busy === a.id} onClick={() => setStufe(a, k)} style={mailBtn}>
                                {bewerberStufe(k).label}
                              </button>
                            ))}
                          </div>
                          {a.verlauf.length > 0 && (
                            <div style={{ fontSize: 12, color: 'var(--ink5)', marginBottom: 10 }}>
                              Verlauf: {a.verlauf.map(v => `${bewerberStufe(v.stufe).label} (${formatDate(v.am)})`).join(' → ')}
                            </div>
                          )}

                          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, marginBottom: a.notes ? 10 : 0 }}>
                            {a.phone && <span style={{ color: 'var(--ink3)' }}>📞 {a.phone}</span>}
                            {a.email
                              ? <span style={{ color: 'var(--ink3)' }}>✉️ {a.email}</span>
                              : <span style={{ color: 'var(--ink5)' }}>✉️ keine E-Mail hinterlassen</span>}
                            {a.plz && <span style={{ color: 'var(--ink3)' }}>📍 {a.plz}</span>}
                            {a.daten?.region && <span style={{ color: 'var(--ink3)' }}>🗺️ {regionLabel(a.daten.region)}</span>}
                            {a.referredBy && <span style={{ color: 'var(--ink3)' }}>🤝 Empfohlen von {a.referredBy}</span>}
                            <span style={{ color: 'var(--ink5)' }}>Eingegangen: {formatDate(a.eingereicht_am || a.created_at)}</span>
                          </div>

                          {/* Zusatzangaben aus /api/apply. Die 34 Altbestaende
                              aus dem frueheren Kurzformular tragen sie nicht —
                              dann steht hier ein Hinweis statt einer Reihe
                              leerer Felder, die wie fehlende Daten aussaehe. */}
                          {a.daten ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '8px 18px', fontSize: 13, marginBottom: 10 }}>
                              <Detail label="Qualifikation" wert={qualifikationLabel(a.daten.qualifikation)} />
                              <Detail label="Führerschein" wert={fuehrerscheinLabel(a.daten.fuehrerschein)} />
                              <Detail label="Stunden/Woche" wert={stundenLabel(a.daten.stunden)} />
                              <Detail label="Beschäftigungsart" wert={beschaeftigungsartLabel(a.daten.beschaeftigungsart)} />
                              <Detail label="Sprachen" wert={a.daten.sprachen?.length ? a.daten.sprachen.map(spracheLabel).join(', ') : '—'} />
                              <Detail label="Verfügbarkeit" wert={a.daten.verfuegbarkeit?.length ? a.daten.verfuegbarkeit.map(verfuegbarkeitLabel).join(', ') : '—'} />
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: 'var(--ink5)', marginBottom: 10 }}>
                              Über das frühere Kurzformular eingegangen — keine Zusatzangaben vorhanden.
                            </div>
                          )}

                          <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 10 }}>
                            Quelle: {src ? `${src.emoji} ${src.label}` : '—'}
                            {fortschritt.offen.length > 0 && (
                              <> · <strong>Es fehlt:</strong>{' '}
                                {fortschritt.offen.map(o => o.hinweis || o.label).join(' · ')}
                              </>
                            )}
                            {!fortschritt.kontaktierbar && (
                              <> · <span style={{ color: '#D04B3B', fontWeight: 600 }}>
                                Weder Telefon noch E-Mail — keine Bearbeitung möglich
                              </span></>
                            )}
                          </div>
                          {a.notes && <div style={{ fontSize: 13, color: 'var(--ink2)' }}>{a.notes}</div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {mailAn && (
        <EmailVorlagenDialog
          zielgruppe="bewerber"
          empfaengerEmail={mailAn.email}
          empfaengerName={mailAn.name}
          vorbelegung={{ vorname: (mailAn.name || '').trim().split(/\s+/)[0] ?? '' }}
          onClose={() => setMailAn(null)}
        />
      )}

      {showCreate && <CreateAppModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load() }} />}
    </div>
  )
}

function CreateAppModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [caregivers, setCaregivers] = useState<{ id: string; label: string }[]>([])
  // Ein Namensfeld, nicht zwei: `lead_inquiries` fuehrt nur `name`. Zwei
  // Felder anzubieten und sie beim Speichern zusammenzukleben waere eine
  // Trennung, die nirgends ankommt.
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [position, setPosition] = useState('')
  const [source, setSource] = useState('indeed')
  const [referredBy, setReferredBy] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      // Eine leere Auswahlliste sieht aus wie „es gibt keine Mitarbeitenden".
      // Bei gestoerter Abfrage ist sie genau das nicht.
      const { data, error: cgErr } = await supabase.from('caregivers').select('id, first_name, last_name').order('last_name')
      if (cgErr) {
        log.error(`Mitarbeiterliste laden fehlgeschlagen: ${cgErr.message}`)
        setErr('Die Mitarbeiterliste konnte nicht geladen werden. Bitte laden Sie die Seite neu.')
        return
      }
      setCaregivers((data || []).map((c: any) => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim() })))
    }
    load()
  }, [])

  async function save() {
    setErr(null)
    if (!name.trim()) { setErr('Bitte den Namen angeben.'); return }
    if (!phone.trim() && !email.trim()) {
      setErr('Bitte Telefon oder E-Mail angeben — sonst gibt es keinen Rückweg zur Bewerberin.')
      return
    }
    setSaving(true)
    const result = await createApplication({
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      position: position.trim() || null,
      source,
      referred_by_caregiver_id: source === 'empfehlung' && referredBy ? referredBy : null,
      notes: notes.trim() || null,
    })
    if (!result.ok) { setErr(result.error); setSaving(false); return }
    onCreated()
  }

  return (
    <DialogOverlay onClose={onClose}>
      <div role="dialog" aria-label="Neue Bewerbung erfassen" aria-modal="true" className="admin-modal" style={{ maxWidth: 500, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>Neue Bewerbung erfassen</h3>
        {err && <Banner tone="danger">{err}</Banner>}
        <Field label="Name *"><input value={name} onChange={e => setName(e.target.value)} placeholder="Vor- und Nachname" style={modalInput} /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Telefon"><input value={phone} onChange={e => setPhone(e.target.value)} style={modalInput} /></Field>
          <Field label="E-Mail"><input value={email} onChange={e => setEmail(e.target.value)} style={modalInput} /></Field>
        </div>
        <Field label="Qualifikation"><input value={position} onChange={e => setPosition(e.target.value)} placeholder="z. B. Alltagsbegleitung (Minijob)" style={modalInput} /></Field>
        <Field label="Quelle">
          <select value={source} onChange={e => setSource(e.target.value)} style={modalSelect}>
            {Object.entries(APPLICATION_SOURCE).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
        {source === 'empfehlung' && (
          <Field label="Empfohlen von (Mitarbeiter-werben-Mitarbeiter)">
            <select value={referredBy} onChange={e => setReferredBy(e.target.value)} style={modalSelect}>
              <option value="">— wählen —</option>
              {caregivers.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Notiz"><input value={notes} onChange={e => setNotes(e.target.value)} style={modalInput} /></Field>
        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose}>Abbrechen</button>
          <button className="btn-confirm" onClick={save} disabled={saving}>{saving ? 'Speichern…' : 'Bewerbung anlegen'}</button>
        </div>
      </div>
    </DialogOverlay>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', flex: 1, minWidth: 0, marginBottom: 10}}>
      <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{label}</span>
      <div style={{ marginTop: 3 }}>{children}</div>
    </label>
  )
}

function Detail({ label, wert }: { label: string; wert: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--ink5)', fontWeight: 600 }}>{label}</div>
      <div style={{ color: 'var(--ink2)' }}>{wert}</div>
    </div>
  )
}

const balkenSpur: React.CSSProperties = {
  flex: 1, minWidth: 50, height: 10, background: 'var(--coal3)',
  borderRadius: 5, overflow: 'hidden',
}
const mailBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--ink2)', background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const actionBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const rejectBtn: React.CSSProperties = {
  fontSize: 12, color: '#D04B3B', background: 'rgba(208,75,59,0.1)',
  border: '1px solid rgba(208,75,59,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const modalInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box', marginBottom: 0,
}
const modalSelect: React.CSSProperties = { ...modalInput }
