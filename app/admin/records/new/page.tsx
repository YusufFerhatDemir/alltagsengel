'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BUDGET_TYPE } from '@/lib/admin/ops'
import { Banner } from '@/components/admin/OpsUI'
import SignaturePad from '@/components/admin/SignaturePad'

interface Option { id: string; label: string }

// Minuten zwischen zwei "HH:MM"-Zeiten (über Mitternacht hinweg robust)
function diffMinutes(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return mins
}

const SERVICE_TYPES = [
  'Alltagsbegleitung',
  'Haushaltshilfe',
  'Einkaufshilfe',
  'Arztbegleitung',
  'Betreuung / Gesellschaft',
  'Spaziergang / Mobilität',
  'Demenzbetreuung',
  'Sonstige',
]

function NewRecordInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const presetClient = searchParams.get('client') || ''

  const [clients, setClients] = useState<Option[]>([])
  const [caregivers, setCaregivers] = useState<{ id: string; label: string; initials: string }[]>([])

  const [clientId, setClientId] = useState(presetClient)
  const [caregiverId, setCaregiverId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [serviceType, setServiceType] = useState('')
  const [budgetType, setBudgetType] = useState('entlastung')
  const [amount, setAmount] = useState('')
  const [initials, setInitials] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsState, setGpsState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [notes, setNotes] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [cRes, gRes] = await Promise.all([
        supabase.from('clients').select('id, first_name, last_name').order('last_name'),
        supabase.from('caregivers').select('id, first_name, last_name, initials').order('last_name'),
      ])
      setClients((cRes.data || []).map((c: any) => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim() })))
      setCaregivers((gRes.data || []).map((g: any) => ({
        id: g.id, label: `${g.first_name} ${g.last_name}`.trim(), initials: g.initials || '',
      })))
    }
    load()
  }, [])

  // Handzeichen automatisch aus gewählter Kraft vorbelegen
  useEffect(() => {
    const cg = caregivers.find(c => c.id === caregiverId)
    if (cg && cg.initials && !initials) setInitials(cg.initials)
  }, [caregiverId, caregivers]) // eslint-disable-line react-hooks/exhaustive-deps

  const duration = useMemo(() => diffMinutes(startTime, endTime), [startTime, endTime])

  // ── Live-Vollständigkeitsprüfung ──
  const checks = useMemo(() => ({
    client: !!clientId,
    caregiver: !!caregiverId,
    date: !!date,
    time: !!startTime && !!endTime && duration > 0,
    service: !!serviceType,
    budget: !!budgetType,
    amount: !!amount && Number(amount) > 0,
    initials: !!initials.trim(),
    signature: !!signature,
  }), [clientId, caregiverId, date, startTime, endTime, duration, serviceType, budgetType, amount, initials, signature])

  const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  const isComplete = missing.length === 0
  // Pflichtfelder (ohne Unterschrift) für "complete"-Status
  const coreComplete = missing.every(m => m === 'signature')

  function captureGps() {
    if (!('geolocation' in navigator)) { setGpsState('error'); return }
    setGpsState('loading')
    navigator.geolocation.getCurrentPosition(
      pos => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsState('ok') },
      () => setGpsState('error'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function save() {
    setError(null)
    if (!coreComplete) { setError('Bitte alle Pflichtfelder ausfüllen.'); return }
    setSaving(true)
    try {
      const supabase = createClient()
      const status = isComplete ? 'signed' : 'complete'
      const { data, error: insErr } = await supabase.from('service_records').insert({
        client_id: clientId,
        caregiver_id: caregiverId,
        date,
        start_time: startTime || null,
        end_time: endTime || null,
        duration_minutes: duration || null,
        service_type: serviceType,
        budget_type: budgetType,
        amount: amount ? Number(amount) : null,
        client_signature: signature,
        caregiver_initials: initials.trim() || null,
        gps_lat: gps?.lat ?? null,
        gps_lng: gps?.lng ?? null,
        notes: notes.trim() || null,
        status,
        completeness_check: { ...checks, complete: isComplete, checked_at: new Date().toISOString() },
      }).select('id').single()

      if (insErr) { setError(`Fehler beim Speichern: ${insErr.message}`); setSaving(false); return }
      router.push(`/admin/records?focus=${data?.id || ''}`)
    } catch (err: any) {
      setError(`Unerwarteter Fehler: ${err.message}`)
      setSaving(false)
    }
  }

  return (
    <div className="admin-page">
      <button onClick={() => router.push('/admin/records')} style={backBtn}>← Leistungsnachweise</button>
      <h1>Neuer Leistungsnachweis</h1>
      <p className="admin-subtitle">Erfassung mit digitaler Unterschrift und Vollständigkeitsprüfung</p>

      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }} className="client-detail-grid">
        {/* Formular */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={fieldRow}>
            <Field label="Klient *">
              <select value={clientId} onChange={e => setClientId(e.target.value)} style={inputStyle}>
                <option value="">— wählen —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Betreuungskraft *">
              <select value={caregiverId} onChange={e => setCaregiverId(e.target.value)} style={inputStyle}>
                <option value="">— wählen —</option>
                {caregivers.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
          </div>

          <div style={fieldRow}>
            <Field label="Datum *">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Von *">
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Bis *">
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={inputStyle} />
            </Field>
          </div>

          {duration > 0 && (
            <div style={{ fontSize: 13, color: 'var(--ink4)', marginTop: -8 }}>
              Dauer: <strong style={{ color: 'var(--gold2)' }}>{Math.floor(duration / 60)}h {duration % 60}min</strong> ({duration} Minuten)
            </div>
          )}

          <div style={fieldRow}>
            <Field label="Leistungsart *">
              <select value={serviceType} onChange={e => setServiceType(e.target.value)} style={inputStyle}>
                <option value="">— wählen —</option>
                {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Budget-Topf *">
              <select value={budgetType} onChange={e => setBudgetType(e.target.value)} style={inputStyle}>
                {Object.entries(BUDGET_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>

          <div style={fieldRow}>
            <Field label="Betrag (€) *">
              <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" style={inputStyle} />
            </Field>
            <Field label="Handzeichen Kraft *">
              <input type="text" value={initials} onChange={e => setInitials(e.target.value)} placeholder="z. B. M.S." maxLength={10} style={inputStyle} />
            </Field>
          </div>

          <Field label="Notizen">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optionale Anmerkungen…" style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>

          {/* GPS */}
          <div>
            <span style={fieldLabel}>GPS-Standort (optional)</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <button type="button" onClick={captureGps} style={secondaryBtn}>
                📍 Standort erfassen
              </button>
              {gpsState === 'loading' && <span style={{ fontSize: 13, color: 'var(--ink4)' }}>Wird ermittelt…</span>}
              {gpsState === 'ok' && gps && <span style={{ fontSize: 13, color: '#5CB882' }}>✓ {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</span>}
              {gpsState === 'error' && <span style={{ fontSize: 13, color: '#D04B3B' }}>Standort nicht verfügbar</span>}
            </div>
          </div>

          {/* Unterschrift */}
          <SignaturePad label="Unterschrift Klient" onChange={setSignature} />
        </div>

        {/* Vollständigkeits-Panel */}
        <div className="admin-stat-card" style={{ padding: 20, position: 'sticky', top: 16 }}>
          <h2 style={{ marginBottom: 12 }}>Vollständigkeit</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <CheckItem ok={checks.client} label="Klient gewählt" />
            <CheckItem ok={checks.caregiver} label="Betreuungskraft gewählt" />
            <CheckItem ok={checks.date} label="Datum" />
            <CheckItem ok={checks.time} label="Uhrzeit / Dauer" />
            <CheckItem ok={checks.service} label="Leistungsart" />
            <CheckItem ok={checks.budget} label="Budget-Topf" />
            <CheckItem ok={checks.amount} label="Betrag" />
            <CheckItem ok={checks.initials} label="Handzeichen" />
            <CheckItem ok={checks.signature} label="Unterschrift Klient" />
          </div>

          <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: isComplete ? 'rgba(92,184,130,.12)' : coreComplete ? 'rgba(33,150,243,.12)' : 'rgba(232,160,0,.12)',
            color: isComplete ? '#5CB882' : coreComplete ? '#64B5F6' : '#E8A000',
          }}>
            {isComplete ? '✓ Vollständig & unterschrieben' : coreComplete ? 'Bereit — Unterschrift fehlt noch' : `${missing.length} Pflichtfeld(er) offen`}
          </div>

          <button onClick={save} disabled={saving || !coreComplete} style={{
            ...primaryBtn, width: '100%', marginTop: 16, opacity: (saving || !coreComplete) ? 0.5 : 1,
            cursor: (saving || !coreComplete) ? 'not-allowed' : 'pointer',
          }}>
            {saving ? 'Speichern…' : 'Nachweis speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <span style={fieldLabel}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  )
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: ok ? 'var(--ink2)' : 'var(--ink4)' }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: ok ? '#5CB882' : 'var(--coal3)', color: ok ? '#fff' : 'var(--ink5)', fontSize: 11, flexShrink: 0,
      }}>{ok ? '✓' : ''}</span>
      {label}
    </div>
  )
}

export default function NewRecordPage() {
  return (
    <Suspense fallback={<div className="admin-page"><h1>Neuer Leistungsnachweis</h1><p>Laden…</p></div>}>
      <NewRecordInner />
    </Suspense>
  )
}

const fieldRow: React.CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap' }
const fieldLabel: React.CSSProperties = { fontSize: 13, color: 'var(--ink3)', fontWeight: 600 }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal2)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box',
}
const backBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--gold2)', cursor: 'pointer',
  fontSize: 14, padding: 0, marginBottom: 12, fontFamily: 'inherit',
}
const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const secondaryBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink2)', background: 'var(--coal3)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit',
}
