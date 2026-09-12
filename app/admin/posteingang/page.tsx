'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatDate, timeAgo, BEWERBUNG_FILTER } from '@/lib/admin/ops'
import {
  ausWarteliste, ausBewerbung, ausAnfrage, sortierePosteingang, zaehlePosteingang,
  posteingangSatz, AMPEL_META, ART_META,
  type Ampel, type LeadArt, type PosteingangEintrag,
} from '@/lib/leads/posteingang'
import { StatusBadge, EmptyRow, Banner, SearchInput } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger'

const log = logger.child('admin:posteingang')

// ═══════════════════════════════════════════════════════════════════════
// PRIORITY INBOX — was heute liegen bleibt, auf einer Seite
//
// Drei Quellen, eine Liste: Warteliste (`state_waitlist`), Bewerbungen und
// Kundenanfragen (beide `lead_inquiries`). Gelesen wird mit dem
// Browser-Client, also unter RLS.
//
// Die Ampel ist dieselbe Leiter wie in den Einzellisten und in der
// Tages-Kette `lead_follow_up`: 24 h gelb, 48 h orange, 72 h rot. Die
// Rechnung steht in lib/leads/posteingang.ts und wird dort getestet —
// diese Datei zeigt nur an.
//
// Bearbeitet wird NICHT hier: jede Zeile verlinkt in die Fachliste, die
// den passenden Stufenwechsel kennt. Zwei Orte mit Schreibrechten auf
// dieselbe Zeile wären zwei Wahrheiten.
// ═══════════════════════════════════════════════════════════════════════

const AMPEL_FILTER: { key: 'alle' | Ampel; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'rot', label: 'Dringend (>72 h)' },
  { key: 'orange', label: 'Eskaliert (>48 h)' },
  { key: 'gelb', label: 'Erinnerung (>24 h)' },
  { key: 'gruen', label: 'Im Zeitplan' },
]

export default function AdminPosteingangPage() {
  const [rows, setRows] = useState<PosteingangEintrag[]>([])
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState<string[]>([])
  const [ampel, setAmpel] = useState<'alle' | Ampel>('alle')
  const [art, setArt] = useState<'alle' | LeadArt>('alle')
  const [suche, setSuche] = useState('')
  const [jetzt, setJetzt] = useState(() => new Date())

  async function laden() {
    const supabase = createClient()
    const zeitpunkt = new Date()
    const probleme: string[] = []
    const eintraege: PosteingangEintrag[] = []

    const [wl, bew, anf] = await Promise.all([
      supabase.from('state_waitlist')
        .select('id, name, email, telefon, status, pflegegrad, ort, bundesland, gewuenschte_leistungen, nachricht, quelle, created_at, updated_at'),
      supabase.from('lead_inquiries')
        .select('id, name, email, phone, status, created_at, updated_at, follow_up_date, bewerbung_daten')
        .or(BEWERBUNG_FILTER).in('status', ['new', 'contacted', 'qualified']),
      supabase.from('lead_inquiries')
        .select('id, name, email, phone, status, source, created_at, updated_at, follow_up_date')
        .eq('art', 'anfrage').neq('source', 'engel-bewerbung').in('status', ['new', 'contacted', 'qualified']),
    ])

    // Eine gescheiterte Quelle wird GENANNT, nicht verschwiegen: eine still
    // fehlende Quelle sähe aus wie „nichts zu tun".
    if (wl.error) { probleme.push(`Warteliste: ${wl.error.message}`); log.error(wl.error.message) }
    if (bew.error) { probleme.push(`Bewerbungen: ${bew.error.message}`); log.error(bew.error.message) }
    if (anf.error) { probleme.push(`Kundenanfragen: ${anf.error.message}`); log.error(anf.error.message) }

    for (const z of wl.data ?? []) {
      const e = ausWarteliste({
        id: z.id, name: z.name, email: z.email, telefon: z.telefon, status: z.status,
        pflegegrad: z.pflegegrad ?? null, region: z.ort ?? null, bundesland: z.bundesland ?? null,
        gewuenschte_leistungen: Array.isArray(z.gewuenschte_leistungen) ? z.gewuenschte_leistungen : [],
        nachricht: z.nachricht ?? null, quelle: z.quelle ?? null,
        created_at: z.created_at, updated_at: z.updated_at ?? null,
      }, zeitpunkt)
      if (e) eintraege.push(e)
    }
    for (const z of bew.data ?? []) {
      const e = ausBewerbung(z as any, zeitpunkt)
      if (e) eintraege.push(e)
    }
    for (const z of anf.data ?? []) {
      const e = ausAnfrage(z as any, zeitpunkt)
      if (e) eintraege.push(e)
    }

    setRows(sortierePosteingang(eintraege))
    setFehler(probleme)
    setJetzt(zeitpunkt)
    setLoading(false)
  }

  useEffect(() => { laden() }, [])

  // Deep-Link aus der Glocke: ?ampel=rot
  useEffect(() => {
    try {
      const a = new URLSearchParams(window.location.search).get('ampel')
      if (a && ['rot', 'orange', 'gelb', 'gruen'].includes(a)) setAmpel(a as Ampel)
    } catch { /* ohne Parameter bleibt „Alle" */ }
  }, [])

  const zaehlung = useMemo(() => zaehlePosteingang(rows), [rows])

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()
    return rows.filter(r => {
      if (ampel !== 'alle' && r.ampel !== ampel) return false
      if (art !== 'alle' && r.art !== art) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q)
        || (r.kontakt || '').toLowerCase().includes(q)
        || r.stufeLabel.toLowerCase().includes(q)
    })
  }, [rows, ampel, art, suche])

  if (loading) return <div className="admin-page"><h1>Posteingang</h1><p>Laden…</p></div>

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Posteingang</h1>
          <p className="admin-subtitle">
            {posteingangSatz(zaehlung)} Stand {formatDate(jetzt.toISOString())} ·{' '}
            {zaehlung.jeArt.warteliste} Warteliste · {zaehlung.jeArt.bewerbung} Bewerbungen ·{' '}
            {zaehlung.jeArt.anfrage} Kundenanfragen
          </p>
        </div>
        <button onClick={() => { setLoading(true); laden() }} style={btnGhost}>Aktualisieren</button>
      </div>

      {fehler.map(f => <Banner key={f} tone="danger">{f}</Banner>)}

      {zaehlung.rot > 0 ? (
        <Banner tone="danger">
          <strong>{zaehlung.rot} Lead(s) liegen seit über 72 Stunden.</strong>{' '}
          Bitte heute bearbeiten oder eine Wiedervorlage setzen.
        </Banner>
      ) : zaehlung.orange + zaehlung.gelb > 0 ? (
        <Banner tone="warn">
          {zaehlung.orange} eskaliert (&gt;48 h), {zaehlung.gelb} zur Erinnerung (&gt;24 h).
        </Banner>
      ) : rows.length > 0 ? (
        <Banner tone="success">Alle offenen Leads sind im Zeitplan.</Banner>
      ) : null}

      <div style={{ margin: '14px 0' }}>
        <SearchInput value={suche} onChange={setSuche} placeholder="Name, Kontakt, Stufe…" />
      </div>

      <div className="admin-filters">
        {AMPEL_FILTER.map(f => (
          <button key={f.key} className={`admin-filter-btn ${ampel === f.key ? 'active' : ''}`} onClick={() => setAmpel(f.key)}>
            {f.label} ({f.key === 'alle' ? rows.length : rows.filter(r => r.ampel === f.key).length})
          </button>
        ))}
      </div>
      <div className="admin-filters" style={{ marginTop: 8 }}>
        <button className={`admin-filter-btn ${art === 'alle' ? 'active' : ''}`} onClick={() => setArt('alle')}>
          Alle Arten ({rows.length})
        </button>
        {(Object.keys(ART_META) as LeadArt[]).map(a => (
          <button key={a} className={`admin-filter-btn ${art === a ? 'active' : ''}`} onClick={() => setArt(a)}>
            {ART_META[a].label} ({zaehlung.jeArt[a]})
          </button>
        ))}
      </div>

      <div className="admin-table-wrap" style={{ marginTop: 14 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Ampel</th><th>Art</th><th>Name</th><th>Kontakt</th>
              <th>Offen seit</th><th>Stufe</th><th>Nächster Schritt</th><th>Wiedervorlage</th><th></th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.length === 0 ? (
              <EmptyRow colSpan={9}>
                {rows.length === 0 ? 'Keine offenen Leads — alles bearbeitet.' : 'Keine Treffer für diesen Filter.'}
              </EmptyRow>
            ) : gefiltert.map(e => {
              const am = AMPEL_META[e.ampel]
              return (
                <tr key={`${e.art}-${e.id}`} style={{ boxShadow: e.ampel !== 'gruen' ? `inset 4px 0 0 ${am.color}` : undefined }}>
                  <td><StatusBadge label={am.label} color={am.color} /></td>
                  <td style={{ fontSize: 13 }}>{ART_META[e.art].label}</td>
                  <td style={{ fontWeight: 600 }}>{e.name}</td>
                  <td style={{ fontSize: 13 }}>{e.kontakt || <span style={{ color: 'var(--ink5)' }}>kein Rückweg</span>}</td>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                    {timeAgo(e.eingang)}
                    <div style={{ color: 'var(--ink5)', fontSize: 11 }}>{e.stundenOffen} h</div>
                  </td>
                  <td><StatusBadge label={e.stufeLabel} color={e.stufeFarbe} /></td>
                  <td style={{ fontSize: 13, color: 'var(--ink3)' }}>{e.hinweis}</td>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                    {e.wiedervorlage ? formatDate(e.wiedervorlage) : <span style={{ color: 'var(--ink5)' }}>—</span>}
                  </td>
                  <td>
                    <Link href={e.ziel} style={linkBtn}>Bearbeiten →</Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: 'var(--ink5)', marginTop: 12 }}>
        Ampel: rot ab 72 Stunden, orange ab 48, gelb ab 24 — für neue Leads ab Eingang,
        für spätere Stufen ab der Wiedervorlage. Dieselbe Rechnung meldet die Tages-Kette
        <code> lead_follow_up</code> morgens in die Glocke.
      </p>
    </div>
  )
}

const btnGhost: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink2)', background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px',
  cursor: 'pointer', fontFamily: 'inherit',
}
const linkBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '4px 10px',
  textDecoration: 'none', whiteSpace: 'nowrap',
}
