'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isValidUUID } from '@/lib/safe-query'
import {
  euro, formatDate, fullName, statusMeta, daysUntil,
  CAREGIVER_STATUS, QUALIFICATION_STATUS, DOCUMENT_TYPE, REQUIRED_DOCUMENTS,
  BONUS_TYPE, REWARD_TYPE,
} from '@/lib/admin/ops'
import { StatusBadge, Banner, EmptyRow } from '@/components/admin/OpsUI'

interface Caregiver {
  id: string
  first_name: string
  last_name: string
  initials: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  zip_code: string | null
  has_drivers_license: boolean
  has_vehicle: boolean
  languages: string[]
  status: string
  emergency_pool: boolean
  emergency_pool_bonus_rate: number | null
  is_nurse: boolean
  nurse_title: string | null
  nurse_registration_number: string | null
  nurse_certificate_url: string | null
}

interface DocRow {
  id: string
  document_type: string | null
  title: string | null
  document_url: string | null
  issued_date: string | null
  valid_until: string | null
  notes: string | null
}

interface QualRow {
  id: string
  qualification_type: string | null
  title: string | null
  issued_date: string | null
  valid_until: string | null
  document_url: string | null
}

interface InitialsRow {
  id: string
  initials: string | null
  valid_from: string | null
  valid_until: string | null
  changed_reason: string | null
}

interface BonusRow {
  id: string
  bonus_type: string | null
  description: string | null
  points: number | null
  reward_type: string | null
  reward_value: number | null
  awarded_date: string | null
  awarded_by: string | null
}

type Ampel = 'valid' | 'expiring' | 'expired'
function ampelFor(validUntil: string | null): { ampel: Ampel; daysLeft: number | null } {
  if (!validUntil) return { ampel: 'valid', daysLeft: null }
  const d = daysUntil(validUntil)
  if (d === null) return { ampel: 'valid', daysLeft: null }
  if (d < 0) return { ampel: 'expired', daysLeft: d }
  if (d <= 60) return { ampel: 'expiring', daysLeft: d }
  return { ampel: 'valid', daysLeft: d }
}

// Erinnerungsstufe 60/30/7 Tage
function reminderTone(daysLeft: number | null): string | null {
  if (daysLeft == null) return null
  if (daysLeft < 0) return `seit ${Math.abs(daysLeft)} Tagen abgelaufen`
  if (daysLeft <= 7) return `❗ in ${daysLeft} Tagen — dringend erneuern`
  if (daysLeft <= 30) return `⏳ in ${daysLeft} Tagen`
  if (daysLeft <= 60) return `📅 in ${daysLeft} Tagen`
  return null
}

export default function CaregiverDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id || '')
  const [cg, setCg] = useState<Caregiver | null>(null)
  const [docs, setDocs] = useState<DocRow[]>([])
  const [quals, setQuals] = useState<QualRow[]>([])
  const [history, setHistory] = useState<InitialsRow[]>([])
  const [bonuses, setBonuses] = useState<BonusRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [modal, setModal] = useState<null | 'doc' | 'qual' | 'initials' | 'bonus'>(null)

  const load = useCallback(async () => {
    if (!isValidUUID(id)) { setNotFound(true); setLoading(false); return }
    try {
      const supabase = createClient()
      const [cgRes, docRes, qualRes, histRes, bonusRes] = await Promise.all([
        supabase.from('caregivers').select('*').eq('id', id).single(),
        supabase.from('caregiver_documents').select('*').eq('caregiver_id', id),
        supabase.from('caregiver_qualifications').select('*').eq('caregiver_id', id),
        supabase.from('caregiver_initials_history').select('*').eq('caregiver_id', id).order('valid_from', { ascending: false }),
        supabase.from('caregiver_bonuses').select('*').eq('caregiver_id', id).order('awarded_date', { ascending: false }),
      ])
      if (cgRes.error || !cgRes.data) { setNotFound(true); setLoading(false); return }
      const c = cgRes.data as any
      setCg({
        id: c.id, first_name: c.first_name, last_name: c.last_name, initials: c.initials,
        phone: c.phone, email: c.email, address: c.address, city: c.city, zip_code: c.zip_code,
        has_drivers_license: !!c.has_drivers_license, has_vehicle: !!c.has_vehicle,
        languages: Array.isArray(c.languages) ? c.languages : [],
        status: c.status || 'active', emergency_pool: !!c.emergency_pool,
        emergency_pool_bonus_rate: c.emergency_pool_bonus_rate ?? null,
        is_nurse: !!c.is_nurse, nurse_title: c.nurse_title,
        nurse_registration_number: c.nurse_registration_number, nurse_certificate_url: c.nurse_certificate_url,
      })
      setDocs((docRes.data || []) as DocRow[])
      setQuals((qualRes.data || []) as QualRow[])
      setHistory((histRes.data || []) as InitialsRow[])
      setBonuses((bonusRes.data || []) as BonusRow[])
    } catch (err) {
      console.error('Caregiver detail load error:', err)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // Dokumenten-Checkliste: Soll-Dokumente + Status
  const docChecklist = useMemo(() => {
    const byType = new Map<string, DocRow>()
    docs.forEach(d => { if (d.document_type) byType.set(d.document_type, d) })
    const required = REQUIRED_DOCUMENTS.map(type => {
      const doc = byType.get(type)
      const a = doc ? ampelFor(doc.valid_until) : null
      return { type, doc, ampel: a?.ampel ?? null, daysLeft: a?.daysLeft ?? null }
    })
    const extras = docs.filter(d => !d.document_type || !REQUIRED_DOCUMENTS.includes(d.document_type))
    return { required, extras }
  }, [docs])

  const missingDocs = docChecklist.required.filter(r => !r.doc).length
  const expiredDocs = docChecklist.required.filter(r => r.ampel === 'expired').length
  const totalPoints = useMemo(() => bonuses.reduce((s, b) => s + (Number(b.points) || 0), 0), [bonuses])

  const qualsSorted = useMemo(() => {
    return quals.map(q => {
      const a = ampelFor(q.valid_until)
      return { ...q, ...a }
    }).sort((x, y) => (x.daysLeft ?? 99999) - (y.daysLeft ?? 99999))
  }, [quals])

  if (loading) return <div className="admin-page"><p>Laden…</p></div>
  if (notFound || !cg) return (
    <div className="admin-page">
      <button onClick={() => router.push('/admin/caregivers')} style={backBtn}>← Betreuungskräfte</button>
      <h1>Betreuungskraft nicht gefunden</h1>
    </div>
  )

  const sm = statusMeta(CAREGIVER_STATUS, cg.status)

  return (
    <div className="admin-page">
      <button onClick={() => router.push('/admin/caregivers')} style={backBtn}>← Betreuungskräfte</button>

      <div className="admin-page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {cg.first_name} {cg.last_name}
            <StatusBadge label={sm.label} color={sm.color} />
            {cg.emergency_pool && <span title="Notfall-Pool" style={{ fontSize: 18 }}>🚨</span>}
            {cg.is_nurse && <StatusBadge label="Pflegefachkraft" color="#7E57C2" />}
          </h1>
          <p className="admin-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            Handzeichen:
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--gold2)', background: 'rgba(201,150,60,.1)', padding: '2px 8px', borderRadius: 6 }}>
              {cg.initials || '—'}
            </span>
            · {totalPoints} Bonuspunkte
          </p>
        </div>
      </div>

      {(missingDocs > 0 || expiredDocs > 0) && (
        <Banner tone={expiredDocs > 0 ? 'danger' : 'warn'}>
          {expiredDocs > 0 && `❌ ${expiredDocs} Dokument(e) abgelaufen. `}
          {missingDocs > 0 && `📂 ${missingDocs} Pflicht-Dokument(e) fehlen in der Akte.`}
        </Banner>
      )}

      {/* Stammdaten + Pflegefachkraft */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }} className="client-detail-grid">
        <div className="admin-stat-card" style={{ padding: 20 }}>
          <h2 style={{ marginBottom: 12 }}>Stammdaten</h2>
          <InfoRow label="Telefon" value={cg.phone || '—'} />
          <InfoRow label="E-Mail" value={cg.email || '—'} />
          <InfoRow label="Adresse" value={[cg.address, [cg.zip_code, cg.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'} />
          <InfoRow label="Sprachen" value={cg.languages.length ? cg.languages.join(', ') : '—'} />
          <InfoRow label="Mobilität" value={`${cg.has_drivers_license ? 'Führerschein' : ''}${cg.has_drivers_license && cg.has_vehicle ? ' · ' : ''}${cg.has_vehicle ? 'Eigenes Fahrzeug' : ''}` || '—'} />
          <InfoRow label="Notfall-Pool" value={cg.emergency_pool ? `Ja${cg.emergency_pool_bonus_rate ? ` (Bonus ${cg.emergency_pool_bonus_rate}€/h)` : ''}` : 'Nein'} />
        </div>

        <div className="admin-stat-card" style={{ padding: 20 }}>
          <h2 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            Pflegefachkraft
            {cg.is_nurse ? <StatusBadge label="Ja" color="#7E57C2" /> : <StatusBadge label="Nein" color="#999" />}
          </h2>
          {cg.is_nurse ? (
            <>
              <InfoRow label="Berufsbezeichnung" value={cg.nurse_title || '—'} />
              <InfoRow label="Registrierungsnr." value={cg.nurse_registration_number || '—'} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 0', fontSize: 14 }}>
                <span style={{ color: 'var(--ink4)' }}>Berufsurkunde</span>
                {cg.nurse_certificate_url
                  ? <a href={cg.nurse_certificate_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold2)', fontWeight: 600 }}>Ansehen ↗</a>
                  : <span style={{ color: '#D04B3B' }}>fehlt</span>}
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--ink4)', fontSize: 14 }}>Keine Pflegefachkraft — als Betreuungskraft im Alltag tätig.</p>
          )}
        </div>
      </div>

      {/* Digitale Mitarbeiterakte */}
      <SectionHeader title="Digitale Mitarbeiterakte" count={`${docChecklist.required.filter(r => r.doc).length}/${REQUIRED_DOCUMENTS.length} vollständig`} onAdd={() => setModal('doc')} addLabel="+ Dokument" />
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Dokument</th><th>Status</th><th>Ausgestellt</th><th>Gültig bis</th><th>Datei</th></tr>
          </thead>
          <tbody>
            {docChecklist.required.map(r => {
              const meta = statusMeta(DOCUMENT_TYPE, r.type)
              const rt = r.doc ? reminderTone(r.daysLeft) : null
              return (
                <tr key={r.type}>
                  <td style={{ fontWeight: 600 }}>{meta.label}</td>
                  <td>
                    {!r.doc ? <StatusBadge label="Fehlt" color="#D04B3B" />
                      : r.ampel === 'expired' ? <StatusBadge label="Abgelaufen" color="#D04B3B" />
                      : r.ampel === 'expiring' ? <StatusBadge label="Läuft ab" color="#E8A000" />
                      : <StatusBadge label="Vorhanden" color="#5CB882" />}
                    {rt && <span style={{ marginLeft: 8, fontSize: 12, color: r.ampel === 'expired' ? '#D04B3B' : '#E8A000' }}>{rt}</span>}
                  </td>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{r.doc ? formatDate(r.doc.issued_date) : '—'}</td>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{r.doc?.valid_until ? formatDate(r.doc.valid_until) : '—'}</td>
                  <td>{r.doc?.document_url ? <a href={r.doc.document_url} target="_blank" rel="noopener noreferrer" style={linkA}>Öffnen ↗</a> : '—'}</td>
                </tr>
              )
            })}
            {docChecklist.extras.map(d => {
              const meta = statusMeta(DOCUMENT_TYPE, d.document_type || 'sonstige')
              const a = ampelFor(d.valid_until)
              return (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.title || meta.label} <span style={{ fontSize: 11, color: 'var(--ink5)' }}>(zusätzlich)</span></td>
                  <td>
                    {a.ampel === 'expired' ? <StatusBadge label="Abgelaufen" color="#D04B3B" />
                      : a.ampel === 'expiring' ? <StatusBadge label="Läuft ab" color="#E8A000" />
                      : <StatusBadge label="Vorhanden" color="#5CB882" />}
                  </td>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(d.issued_date)}</td>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{d.valid_until ? formatDate(d.valid_until) : '—'}</td>
                  <td>{d.document_url ? <a href={d.document_url} target="_blank" rel="noopener noreferrer" style={linkA}>Öffnen ↗</a> : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Qualifikations-Timeline */}
      <SectionHeader title="Qualifikationen & Fortbildungen" count={`${quals.length}`} onAdd={() => setModal('qual')} addLabel="+ Qualifikation" />
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Qualifikation</th><th>Status</th><th>Erworben</th><th>Gültig bis</th><th>Erinnerung</th></tr>
          </thead>
          <tbody>
            {qualsSorted.length === 0 ? <EmptyRow colSpan={5}>Keine Qualifikationen hinterlegt</EmptyRow> : qualsSorted.map(q => {
              const qm = statusMeta(QUALIFICATION_STATUS, q.ampel)
              const rt = reminderTone(q.daysLeft)
              return (
                <tr key={q.id}>
                  <td style={{ fontWeight: 600 }}>
                    {q.title || q.qualification_type || 'Qualifikation'}
                    {q.document_url && <a href={q.document_url} target="_blank" rel="noopener noreferrer" style={{ ...linkA, marginLeft: 8 }}>↗</a>}
                  </td>
                  <td><StatusBadge label={qm.label} color={qm.color} /></td>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(q.issued_date)}</td>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{q.valid_until ? formatDate(q.valid_until) : '—'}</td>
                  <td style={{ fontSize: 12, color: q.ampel === 'expired' ? '#D04B3B' : q.ampel === 'expiring' ? '#E8A000' : 'var(--ink4)' }}>{rt || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Handzeichen-Verwaltung */}
      <SectionHeader title="Handzeichen-Verwaltung" count={`Aktuell: ${cg.initials || '—'}`} onAdd={() => setModal('initials')} addLabel="+ Handzeichen ändern" />
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Handzeichen</th><th>Gültig von</th><th>Gültig bis</th><th>Grund</th></tr>
          </thead>
          <tbody>
            {history.length === 0 ? <EmptyRow colSpan={4}>Noch keine Historie — aktuelles Handzeichen: {cg.initials || '—'}</EmptyRow> : history.map(h => (
              <tr key={h.id}>
                <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--gold2)' }}>{h.initials || '—'}</span></td>
                <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(h.valid_from)}</td>
                <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{h.valid_until ? formatDate(h.valid_until) : <span style={{ color: '#5CB882' }}>aktiv</span>}</td>
                <td style={{ fontSize: 13 }}>{h.changed_reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Boni */}
      <SectionHeader title="Bonus-Übersicht" count={`${totalPoints} Punkte`} onAdd={() => setModal('bonus')} addLabel="+ Bonus" />
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Datum</th><th>Kategorie</th><th>Beschreibung</th><th>Punkte</th><th>Prämie</th></tr>
          </thead>
          <tbody>
            {bonuses.length === 0 ? <EmptyRow colSpan={5}>Noch keine Boni vergeben</EmptyRow> : bonuses.map(b => {
              const bm = b.bonus_type ? (BONUS_TYPE[b.bonus_type] || BONUS_TYPE.other) : BONUS_TYPE.other
              const rw = b.reward_type ? REWARD_TYPE[b.reward_type] : null
              return (
                <tr key={b.id}>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(b.awarded_date)}</td>
                  <td><StatusBadge label={`${bm.emoji} ${bm.label}`} color={bm.color} /></td>
                  <td style={{ fontSize: 13 }}>{b.description || '—'}</td>
                  <td style={{ fontWeight: 700, color: 'var(--gold2)' }}>{b.points != null ? `+${b.points}` : '—'}</td>
                  <td style={{ fontSize: 13 }}>{rw ? `${rw.emoji} ${rw.label}${b.reward_value ? ` (${euro(b.reward_value)})` : ''}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal === 'doc' && <DocModal caregiverId={cg.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {modal === 'qual' && <QualModal caregiverId={cg.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {modal === 'initials' && <InitialsModal caregiverId={cg.id} current={cg.initials} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {modal === 'bonus' && <BonusModal caregiverId={cg.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
    </div>
  )
}

// ═══ Modals ═══
function DocModal({ caregiverId, onClose, onSaved }: { caregiverId: string; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState('arbeitsvertrag')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [issued, setIssued] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null); setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('caregiver_documents').insert({
      caregiver_id: caregiverId, document_type: type, title: title.trim() || null,
      document_url: url.trim() || null, issued_date: issued || null,
      valid_until: validUntil || null, notes: notes.trim() || null,
    })
    if (error) { setErr(error.message); setSaving(false); return }
    onSaved()
  }

  return (
    <ModalShell title="Dokument zur Akte hinzufügen" onClose={onClose} err={err} saving={saving} onSave={save} saveLabel="Speichern">
      <ModalField label="Dokumententyp">
        <select value={type} onChange={e => setType(e.target.value)} style={modalSelect}>
          {Object.entries(DOCUMENT_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </ModalField>
      <ModalField label="Bezeichnung (optional)"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="z. B. Befristeter Vertrag" style={modalInput} /></ModalField>
      <ModalField label="Datei-Link (URL, optional)"><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" style={modalInput} /></ModalField>
      <div style={{ display: 'flex', gap: 10 }}>
        <ModalField label="Ausgestellt am"><input type="date" value={issued} onChange={e => setIssued(e.target.value)} style={modalInput} /></ModalField>
        <ModalField label="Gültig bis (optional)"><input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={modalInput} /></ModalField>
      </div>
      <ModalField label="Notiz (optional)"><input value={notes} onChange={e => setNotes(e.target.value)} style={modalInput} /></ModalField>
    </ModalShell>
  )
}

function QualModal({ caregiverId, onClose, onSaved }: { caregiverId: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('')
  const [url, setUrl] = useState('')
  const [issued, setIssued] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null)
    if (!title.trim()) { setErr('Bitte eine Bezeichnung angeben.'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('caregiver_qualifications').insert({
      caregiver_id: caregiverId, title: title.trim(), qualification_type: type.trim() || null,
      document_url: url.trim() || null, issued_date: issued || null, valid_until: validUntil || null,
      status: 'valid',
    })
    if (error) { setErr(error.message); setSaving(false); return }
    onSaved()
  }

  return (
    <ModalShell title="Qualifikation / Fortbildung" onClose={onClose} err={err} saving={saving} onSave={save} saveLabel="Speichern">
      <ModalField label="Bezeichnung *"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="z. B. Demenz-Fortbildung" style={modalInput} /></ModalField>
      <ModalField label="Art (optional)"><input value={type} onChange={e => setType(e.target.value)} placeholder="z. B. Pflichtfortbildung" style={modalInput} /></ModalField>
      <ModalField label="Nachweis-Link (URL, optional)"><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" style={modalInput} /></ModalField>
      <div style={{ display: 'flex', gap: 10 }}>
        <ModalField label="Erworben am"><input type="date" value={issued} onChange={e => setIssued(e.target.value)} style={modalInput} /></ModalField>
        <ModalField label="Gültig bis (optional)"><input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={modalInput} /></ModalField>
      </div>
    </ModalShell>
  )
}

function InitialsModal({ caregiverId, current, onClose, onSaved }: { caregiverId: string; current: string | null; onClose: () => void; onSaved: () => void }) {
  const [initials, setInitials] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null)
    if (!initials.trim()) { setErr('Bitte ein Handzeichen eingeben.'); return }
    setSaving(true)
    const supabase = createClient()
    const today = new Date().toISOString().slice(0, 10)
    // Bisheriges aktives Handzeichen abschließen
    await supabase.from('caregiver_initials_history')
      .update({ valid_until: today }).eq('caregiver_id', caregiverId).is('valid_until', null)
    const { error } = await supabase.from('caregiver_initials_history').insert({
      caregiver_id: caregiverId, initials: initials.trim(), valid_from: today,
      valid_until: null, changed_reason: reason.trim() || null,
    })
    if (error) { setErr(error.message); setSaving(false); return }
    // Aktuelles Handzeichen am Stammdatensatz aktualisieren
    await supabase.from('caregivers').update({ initials: initials.trim() }).eq('id', caregiverId)
    onSaved()
  }

  return (
    <ModalShell title="Handzeichen ändern" onClose={onClose} err={err} saving={saving} onSave={save} saveLabel="Übernehmen">
      <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '0 0 12px' }}>Aktuell: <strong style={{ color: 'var(--gold2)' }}>{current || '—'}</strong>. Das bisherige Handzeichen wird in der Historie abgeschlossen.</p>
      <ModalField label="Neues Handzeichen *"><input value={initials} onChange={e => setInitials(e.target.value)} placeholder="z. B. M.S." maxLength={10} style={modalInput} /></ModalField>
      <ModalField label="Grund (optional)"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="z. B. Namensänderung" style={modalInput} /></ModalField>
    </ModalShell>
  )
}

function BonusModal({ caregiverId, onClose, onSaved }: { caregiverId: string; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState('punctuality')
  const [points, setPoints] = useState('10')
  const [desc, setDesc] = useState('')
  const [reward, setReward] = useState('')
  const [rewardValue, setRewardValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null); setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('caregiver_bonuses').insert({
      caregiver_id: caregiverId, bonus_type: type, points: points ? Number(points) : null,
      description: desc.trim() || null, reward_type: reward || null,
      reward_value: rewardValue ? Number(rewardValue) : null,
      awarded_date: new Date().toISOString().slice(0, 10), awarded_by: 'Alltagsengel',
    })
    if (error) { setErr(error.message); setSaving(false); return }
    onSaved()
  }

  return (
    <ModalShell title="Bonus vergeben" onClose={onClose} err={err} saving={saving} onSave={save} saveLabel="Vergeben">
      <ModalField label="Kategorie">
        <select value={type} onChange={e => setType(e.target.value)} style={modalSelect}>
          {Object.entries(BONUS_TYPE).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
      </ModalField>
      <ModalField label="Punkte"><input type="number" value={points} onChange={e => setPoints(e.target.value)} style={modalInput} /></ModalField>
      <ModalField label="Beschreibung (optional)"><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="z. B. 3 Monate ohne Verspätung" style={modalInput} /></ModalField>
      <div style={{ display: 'flex', gap: 10 }}>
        <ModalField label="Prämie (optional)">
          <select value={reward} onChange={e => setReward(e.target.value)} style={modalSelect}>
            <option value="">— keine —</option>
            {Object.entries(REWARD_TYPE).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </ModalField>
        <ModalField label="Wert (€, optional)"><input type="number" step="0.01" value={rewardValue} onChange={e => setRewardValue(e.target.value)} placeholder="0,00" style={modalInput} /></ModalField>
      </div>
    </ModalShell>
  )
}

// ═══ Shared Bausteine ═══
function SectionHeader({ title, count, onAdd, addLabel }: { title: string; count?: string; onAdd?: () => void; addLabel?: string }) {
  return (
    <h2 style={{ marginTop: 32, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
      {title}
      {count && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>({count})</span>}
      {onAdd && <button onClick={onAdd} style={addBtn}>{addLabel}</button>}
    </h2>
  )
}

function ModalShell({ title, children, onClose, onSave, saving, err, saveLabel }: {
  title: string; children: React.ReactNode; onClose: () => void; onSave: () => void; saving: boolean; err: string | null; saveLabel: string
}) {
  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: 480, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        {err && <Banner tone="danger">{err}</Banner>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>{children}</div>
        <div className="admin-modal-btns">
          <button className="btn-cancel" onClick={onClose}>Abbrechen</button>
          <button className="btn-confirm" onClick={onSave} disabled={saving}>{saving ? 'Speichern…' : saveLabel}</button>
        </div>
      </div>
    </div>
  )
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{label}</span>
      <div style={{ marginTop: 3 }}>{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
      <span style={{ color: 'var(--ink4)' }}>{label}</span>
      <span style={{ fontWeight: 500, color: 'var(--ink2)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

const backBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--gold2)', cursor: 'pointer',
  fontSize: 14, padding: 0, marginBottom: 12, fontFamily: 'inherit',
}
const addBtn: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 13, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit',
}
const linkA: React.CSSProperties = { color: 'var(--gold2)', fontWeight: 600, fontSize: 13 }
const modalInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box', marginBottom: 0,
}
const modalSelect: React.CSSProperties = { ...modalInput }
