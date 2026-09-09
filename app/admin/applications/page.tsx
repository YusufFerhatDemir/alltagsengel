'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate, timeAgo, statusMeta,
  APPLICATION_STATUS, APPLICATION_FLOW, APPLICATION_FORTSCHRITT,
  APPLICATION_ABGELEHNT, APPLICATION_SOURCE, BEWERBUNG_FILTER,
} from '@/lib/admin/ops'
import { updateApplicationStatus, createApplication } from './actions'
import {
  qualifikationLabel, fuehrerscheinLabel, spracheLabel,
  verfuegbarkeitLabel, stundenLabel, beschaeftigungsartLabel,
  type BewerbungDaten,
} from '@/lib/bewerbung/katalog'
import { regionLabel } from '@/lib/warteliste/katalog'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger'
import DialogOverlay from '@/components/DialogOverlay'
import { klickbareZeile } from '@/lib/a11y'
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
  /** Zusatzangaben aus /api/apply — bei Altbestaenden leer. */
  daten: BewerbungDaten | null
}

export default function AdminApplicationsPage() {
  const [rows, setRows] = useState<AppRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  async function load() {
    try {
      const supabase = createClient()
      const [appRes, cgRes] = await Promise.all([
        supabase
          .from('lead_inquiries')
          .select('id, name, email, phone, plz, service, source, message, status, created_at, eingereicht_am, bewerbung_daten')
          .or(BEWERBUNG_FILTER)
          .order('created_at', { ascending: false }),
        supabase.from('caregivers').select('id, first_name, last_name'),
      ])
      if (appRes.error) { setError(appRes.error.message); setLoading(false); return }
      const cgMap = new Map<string, string>()
      ;(cgRes.data || []).forEach((c: any) => cgMap.set(c.id, `${c.first_name} ${c.last_name}`.trim()))
      setRows((appRes.data || []).map((a: any) => {
        const empfohlenVon: string | null = a.bewerbung_daten?.empfohlen_von_caregiver_id ?? null
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
          daten: (a.bewerbung_daten && typeof a.bewerbung_daten === 'object')
            ? a.bewerbung_daten as BewerbungDaten
            : null,
        }
      }))
    } catch (err) {
      log.errorWithException('Applications load error', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function setStatus(app: AppRow, status: string) {
    const result = await updateApplicationStatus(app.id, status)
    if (!result.ok) { setError(result.error); return }
    setRows(prev => prev.map(r => r.id === app.id ? { ...r, status } : r))
  }

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    rows.forEach(r => { m[r.status] = (m[r.status] || 0) + 1 })
    return m
  }, [rows])

  const referralCount = useMemo(() => rows.filter(r => r.referredById).length, [rows])
  // Endzustaende im Wortschatz von lead_inquiries: eingestellt oder abgesagt.
  const openCount = useMemo(
    () => rows.filter(r => !['converted', APPLICATION_ABGELEHNT].includes(r.status)).length,
    [rows],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false
      if (!q) return true
      // Telefon mitsuchen: bei Website-Bewerbungen ist es das einzige
      // Kontaktmerkmal — eine E-Mail fragt das Formular nicht ab.
      return r.name.toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q) ||
        (r.position || '').toLowerCase().includes(q)
    })
  }, [rows, filter, search])

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

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Name, Telefon, E-Mail, Qualifikation…" />
      </div>

      <div className="admin-filters">
        <button className={`admin-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          Alle ({rows.length})
        </button>
        {APPLICATION_FLOW.map(f => (
          <button key={f} className={`admin-filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {statusMeta(APPLICATION_STATUS, f).label} ({counts[f] || 0})
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Name</th><th>Qualifikation</th><th>Quelle</th><th>Eingegangen</th><th>Status</th><th>Aktion</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={6}>{search || filter !== 'all' ? 'Keine Treffer' : 'Noch keine Bewerbungen'}</EmptyRow>
              ) : filtered.map(a => {
                const sm = statusMeta(APPLICATION_STATUS, a.status)
                const src = a.source ? (APPLICATION_SOURCE[a.source] || APPLICATION_SOURCE.sonstige) : null
                const isOpen = expanded === a.id
                // Der Vorwaertsweg endet bei „Eingestellt". Eine Absage ist
                // kein naechster Schritt, sondern der eigene Knopf daneben.
                const idx = APPLICATION_FORTSCHRITT.indexOf(a.status)
                const next = idx >= 0 && idx < APPLICATION_FORTSCHRITT.length - 1
                  ? APPLICATION_FORTSCHRITT[idx + 1]
                  : null
                return (
                  <Fragment key={a.id}>
                    <tr {...klickbareZeile(() => setExpanded(isOpen ? null : a.id))} aria-expanded={isOpen} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 600 }}>
                        {a.name}
                        {a.referredById && <span title={`Empfohlen von ${a.referredBy}`} style={{ marginLeft: 6 }}>🤝</span>}
                      </td>
                      <td style={{ fontSize: 13 }}>{a.position || '—'}</td>
                      <td style={{ fontSize: 13 }}>{src ? `${src.emoji} ${src.label}` : '—'}</td>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{timeAgo(a.created_at)}</td>
                      <td><StatusBadge label={sm.label} color={sm.color} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {next && (
                            <button onClick={() => setStatus(a, next)} style={actionBtn}>
                              → {statusMeta(APPLICATION_STATUS, next).label}
                            </button>
                          )}
                          {a.status !== APPLICATION_ABGELEHNT && a.status !== 'converted' && (
                            <button onClick={() => setStatus(a, APPLICATION_ABGELEHNT)} style={rejectBtn}>Ablehnen</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--coal3)', padding: 16 }}>
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
