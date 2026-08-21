'use client'
import { datumBerlin } from '@/lib/utils/timezone';
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import SignaturePad from '@/components/admin/SignaturePad'
import { logger } from '@/lib/logger';
const log = logger.child('engel:einsaetze');

const STATUS_META: Record<string, { label: string; color: string }> = {
  GEPLANT: { label: 'Geplant', color: '#2196F3' },
  BESTAETIGT: { label: 'Bestätigt', color: '#00BCD4' },
  UNTERWEGS: { label: 'Unterwegs', color: '#FF9800' },
  GESTARTET: { label: 'Gestartet', color: '#4CAF50' },
  BEENDET: { label: 'Beendet', color: '#5CB882' },
  STORNIERT: { label: 'Storniert', color: '#9E9E9E' },
  NO_SHOW: { label: 'Nicht erschienen', color: '#D04B3B' },
  active: { label: 'Aktiv', color: '#5CB882' },
}

const SERVICE_TYPES = ['Alltagsbegleitung', 'Haushaltshilfe', 'Einkaufshilfe', 'Arztbegleitung', 'Betreuung/Gesellschaft', 'Spaziergang/Mobilität', 'Demenzbetreuung', 'Sonstige']

interface Assignment {
  id: string
  client_id: string
  client_name: string
  assignment_date: string | null
  weekday: number | null
  start_time: string
  end_time: string
  service_type: string
  status: string
  address: string | null
  notes: string | null
}

function isoDate(d: Date): string { return datumBerlin(d) }
function fmtTime(t: string | null): string { return t ? t.slice(0, 5) : '—' }
function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit' })
}

export default function EngelEinsaetzePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [caregiverId, setCaregiverId] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [activeRecord, setActiveRecord] = useState<string | null>(null)
  const [showDocument, setShowDocument] = useState<Assignment | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const today = isoDate(new Date())

  const load = useCallback(async () => {
    try {
      const user = await requireUser(router, { redirectTo: '/engel/einsaetze' })
      if (!user) return
      const supabase = createClient()

      const { data: cg } = await supabase
        .from('caregivers')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!cg) { setLoading(false); return }
      setCaregiverId(cg.id)

      const { data } = await supabase
        .from('assignments')
        .select('id, client_id, assignment_date, weekday, start_time, end_time, service_type, status, address, notes, client:clients(first_name, last_name)')
        .eq('caregiver_id', cg.id)
        .in('status', ['GEPLANT', 'BESTAETIGT', 'UNTERWEGS', 'GESTARTET', 'active'])
        .order('assignment_date', { ascending: true })
        .order('start_time', { ascending: true })

      setAssignments((data || []).map((a: any) => ({
        ...a,
        client_name: a.client ? `${a.client.first_name || ''} ${a.client.last_name || ''}`.trim() : '—',
      })))
    } catch (e) {
      log.errorWithException('Load error', e)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { load() }, [load])

  const todayAssignments = assignments.filter(a =>
    a.assignment_date === today ||
    (!a.assignment_date && a.weekday === new Date().getDay())
  )
  const upcomingAssignments = assignments.filter(a =>
    a.assignment_date && a.assignment_date > today
  )

  async function updateStatus(assignmentId: string, newStatus: string) {
    setErr(null)
    setSaving(true)
    const res = await fetch('/api/einsatzplanung', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: assignmentId, status: newStatus }),
    })
    if (!res.ok) {
      const r = await res.json()
      setErr(r.error || 'Fehler')
    } else {
      setSuccess(newStatus === 'GESTARTET' ? 'Einsatz gestartet' : newStatus === 'BEENDET' ? 'Einsatz beendet' : 'Status aktualisiert')
      setTimeout(() => setSuccess(null), 3000)
    }
    setSaving(false)
    load()
  }

  async function documentService(a: Assignment, data: {
    leistung: string; bemerkungen: string; signature: string | null;
    signerName: string; signerRole: string
  }) {
    setErr(null)
    setSaving(true)

    const supabase = createClient()
    const { data: cg } = await supabase
      .from('caregivers')
      .select('initials')
      .eq('id', caregiverId!)
      .single()

    const res = await fetch('/api/leistungsnachweis/crud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: a.client_id,
        caregiver_id: caregiverId,
        date: a.assignment_date || today,
        start_time: a.start_time,
        end_time: a.end_time,
        service_type: a.service_type,
        budget_type: 'private',
        billing_type: 'PRIVAT',
        caregiver_initials: cg?.initials || '??',
        assignment_id: a.id,
        leistung_beschreibung: data.leistung,
        notes: data.bemerkungen,
      }),
    })

    if (!res.ok) {
      const r = await res.json()
      setErr(r.error || 'Fehler beim Erstellen')
      setSaving(false)
      return
    }

    const record = await res.json()
    setActiveRecord(record.id)

    if (data.signature) {
      await fetch('/api/leistungsnachweis/crud', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: record.id,
          action: 'confirm',
        }),
      })
      await fetch('/api/leistungsnachweis/crud', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: record.id,
          action: 'sign',
          client_signature: data.signature,
          client_signer_name: data.signerName,
          client_signer_role: data.signerRole,
        }),
      })
    }

    setSuccess('Leistungsnachweis erstellt und unterschrieben')
    setTimeout(() => setSuccess(null), 4000)
    setSaving(false)
    setShowDocument(null)
    await updateStatus(a.id, 'BEENDET')
  }

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)' }}>
        <div style={{ fontSize: 14 }}>Lade Einsätze...</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, fontFamily: "'Cormorant Garamond', serif" }}>
        Meine Einsätze
      </h1>
      <p style={{ fontSize: 13, color: 'var(--ink4)', marginBottom: 16 }}>
        {new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
      </p>

      {err && <div style={{ background: 'rgba(208,75,59,.1)', border: '1px solid rgba(208,75,59,.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#D04B3B' }}>{err}</div>}
      {success && <div style={{ background: 'rgba(92,184,130,.1)', border: '1px solid rgba(92,184,130,.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#5CB882' }}>{success}</div>}

      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink2)', marginBottom: 10 }}>
        Heute ({todayAssignments.length})
      </h2>
      {todayAssignments.length === 0 ? (
        <div style={{ background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--ink4)', fontSize: 14, marginBottom: 20 }}>
          Keine Einsätze heute
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {todayAssignments.map(a => (
            <AssignmentCard
              key={a.id}
              assignment={a}
              onStart={() => updateStatus(a.id, 'GESTARTET')}
              onEnd={() => setShowDocument(a)}
              saving={saving}
            />
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink2)', marginBottom: 10 }}>
        Kommende Einsätze ({upcomingAssignments.length})
      </h2>
      {upcomingAssignments.length === 0 ? (
        <div style={{ background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--ink4)', fontSize: 14 }}>
          Keine weiteren Einsätze geplant
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {upcomingAssignments.slice(0, 10).map(a => (
            <AssignmentCard key={a.id} assignment={a} saving={false} />
          ))}
        </div>
      )}

      {showDocument && (
        <DocumentModal
          assignment={showDocument}
          onClose={() => setShowDocument(null)}
          onSave={(data) => documentService(showDocument, data)}
          saving={saving}
        />
      )}
    </div>
  )
}

function AssignmentCard({ assignment: a, onStart, onEnd, saving }: {
  assignment: Assignment
  onStart?: () => void
  onEnd?: () => void
  saving: boolean
}) {
  const sm = STATUS_META[a.status] || { label: a.status, color: '#999' }
  const canStart = ['GEPLANT', 'BESTAETIGT', 'active'].includes(a.status)
  const canEnd = a.status === 'GESTARTET'

  return (
    <div style={{
      background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 14,
      padding: '14px 16px', position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
            {fmtTime(a.start_time)} – {fmtTime(a.end_time)}
          </div>
          {a.assignment_date && (
            <div style={{ fontSize: 12, color: 'var(--ink4)' }}>{fmtDate(a.assignment_date)}</div>
          )}
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, color: sm.color,
          background: `${sm.color}18`, padding: '3px 10px', borderRadius: 6,
        }}>{sm.label}</span>
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold2)', marginBottom: 2 }}>
        {a.client_name}
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{a.service_type}</div>
      {a.address && <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 2 }}>{a.address}</div>}
      {a.notes && <div style={{ fontSize: 12, color: 'var(--ink5)', marginTop: 4, fontStyle: 'italic' }}>{a.notes}</div>}

      {(canStart || canEnd) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {canStart && onStart && (
            <button onClick={onStart} disabled={saving} style={{
              flex: 1, padding: '10px 0', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
              background: 'linear-gradient(135deg, #4CAF50, #388E3C)', color: '#fff',
              border: 'none', borderRadius: 10, cursor: 'pointer',
            }}>
              Einsatz starten
            </button>
          )}
          {canEnd && onEnd && (
            <button onClick={onEnd} disabled={saving} style={{
              flex: 1, padding: '10px 0', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
              background: 'linear-gradient(135deg, var(--gold2), var(--gold))', color: 'var(--coal)',
              border: 'none', borderRadius: 10, cursor: 'pointer',
            }}>
              Beenden & Dokumentieren
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function DocumentModal({ assignment: a, onClose, onSave, saving }: {
  assignment: Assignment
  onClose: () => void
  onSave: (data: { leistung: string; bemerkungen: string; signature: string | null; signerName: string; signerRole: string }) => void
  saving: boolean
}) {
  const [leistung, setLeistung] = useState(a.service_type)
  const [bemerkungen, setBemerkungen] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [signerName, setSignerName] = useState('')
  const [signerRole, setSignerRole] = useState('KUNDE')

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--coal)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
        maxHeight: '90vh', overflowY: 'auto', padding: '20px 20px 40px',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
          Leistung dokumentieren
        </h3>
        <p style={{ fontSize: 13, color: 'var(--ink4)', marginBottom: 16 }}>
          {a.client_name} — {fmtTime(a.start_time)}–{fmtTime(a.end_time)}
        </p>

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', marginBottom: 4, display: 'block' }}>
          Erbrachte Leistung
        </label>
        <select value={leistung} onChange={e => setLeistung(e.target.value)} style={mobileSelect}>
          {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', marginBottom: 4, display: 'block', marginTop: 12 }}>
          Bemerkungen
        </label>
        <textarea
          value={bemerkungen}
          onChange={e => setBemerkungen(e.target.value)}
          placeholder="Besonderheiten, Beobachtungen..."
          rows={3}
          style={{ ...mobileSelect, resize: 'vertical' }}
        />

        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', marginBottom: 4, display: 'block' }}>
            Unterschrift Klient/Angehöriger
          </label>
          <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
            <input
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              placeholder="Name des Unterzeichners"
              style={{ ...mobileSelect, flex: 1 }}
            />
            <select value={signerRole} onChange={e => setSignerRole(e.target.value)} style={{ ...mobileSelect, width: 130 }}>
              <option value="KUNDE">Klient</option>
              <option value="ANGEHOERIGER">Angehöriger</option>
              <option value="VERTRETER">Vertreter</option>
            </select>
          </div>
          <SignaturePad onChange={setSignature} label="Hier unterschreiben" height={150} />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px 0', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
            background: 'var(--coal3)', color: 'var(--ink3)', border: '1px solid var(--border)',
            borderRadius: 10, cursor: 'pointer',
          }}>
            Abbrechen
          </button>
          <button
            onClick={() => onSave({ leistung, bemerkungen, signature, signerName, signerRole })}
            disabled={saving}
            style={{
              flex: 1, padding: '12px 0', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
              background: 'linear-gradient(135deg, var(--gold2), var(--gold))', color: 'var(--coal)',
              border: 'none', borderRadius: 10, cursor: 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? 'Speichern...' : 'Speichern & Unterschreiben'}
          </button>
        </div>
      </div>
    </div>
  )
}

const mobileSelect: React.CSSProperties = {
  width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal2)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box',
}
