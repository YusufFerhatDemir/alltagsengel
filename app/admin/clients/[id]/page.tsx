'use client'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isValidUUID } from '@/lib/safe-query'
import {
  euro, formatDate, formatTime, fullName, statusMeta, summarizeBudget,
  CLIENT_STATUS, RECORD_STATUS, BUDGET_TYPE, MOBILITY_STATUS, type BudgetSummary,
} from '@/lib/admin/ops'
import { AmpelDot, BudgetBar, StatusBadge, Banner, EmptyRow } from '@/components/admin/OpsUI'
import { CareNotesPanel } from '@/components/admin/CareNotesPanel'
import { logger } from '@/lib/logger'
import { klickbareZeile } from '@/lib/a11y'
import { SETZBARE_STATUS, sperrtEinsaetze } from '@/lib/clients/status'
const log = logger.child('admin:clients')

interface ClientDetail {
  id: string
  customer_number: string | null
  first_name: string
  last_name: string
  date_of_birth: string | null
  address: string | null
  city: string | null
  zip_code: string | null
  phone: string | null
  email: string | null
  care_level: number | null
  care_level_since: string | null
  insurance_name: string | null
  insurance_number: string | null
  notes: string | null
  status: string
  // Gesundheitsdaten & Notfallkontakte
  allergies: string | null
  medications: string | null
  mobility_status: string | null
  dietary_restrictions: string | null
  medical_conditions: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relationship: string | null
  next_of_kin_name: string | null
  next_of_kin_phone: string | null
  next_of_kin_email: string | null
  next_of_kin_relationship: string | null
  hausarzt_name: string | null
  hausarzt_phone: string | null
  versichertennummer: string | null
  pflegekasse_name: string | null
  pflegekasse_ik: string | null
}

interface RecordRow {
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  service_type: string | null
  budget_type: string | null
  amount: number | null
  status: string
  caregiver: string
}

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id || '')
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [budget, setBudget] = useState<any>(null)
  const [summary, setSummary] = useState<BudgetSummary | null>(null)
  const [records, setRecords] = useState<RecordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<'uebersicht' | 'gesundheit' | 'notizen'>('uebersicht')

  const load = useCallback(async () => {
    if (!isValidUUID(id)) { setNotFound(true); setLoading(false); return }
    try {
      const supabase = createClient()
      const year = new Date().getFullYear()
      const [clientRes, budgetRes, recordsRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', id).single(),
        supabase.from('client_budgets').select('*').eq('client_id', id).eq('year', year).maybeSingle(),
        supabase.from('service_records')
          .select('id, date, start_time, end_time, duration_minutes, service_type, budget_type, amount, status, caregiver:caregivers(first_name, last_name)')
          .eq('client_id', id).order('date', { ascending: false }).limit(100),
      ])

      if (clientRes.error || !clientRes.data) { setNotFound(true); setLoading(false); return }
      setClient(clientRes.data as ClientDetail)
      setBudget(budgetRes.data)
      setSummary(budgetRes.data ? summarizeBudget(budgetRes.data) : null)
      setRecords((recordsRes.data || []).map((r: any) => ({
        id: r.id,
        date: r.date,
        start_time: r.start_time,
        end_time: r.end_time,
        duration_minutes: r.duration_minutes,
        service_type: r.service_type,
        budget_type: r.budget_type,
        amount: r.amount,
        status: r.status,
        caregiver: fullName(r.caregiver),
      })))
    } catch (err) {
      log.errorWithException('Client detail load error', err)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="admin-page"><p>Laden…</p></div>
  if (notFound || !client) return (
    <div className="admin-page">
      <button onClick={() => router.push('/admin/clients')} style={backBtn}>← Klienten</button>
      <h1>Klient nicht gefunden</h1>
    </div>
  )

  const sm = statusMeta(CLIENT_STATUS, client.status)

  return (
    <div className="admin-page">
      <button onClick={() => router.push('/admin/clients')} style={backBtn}>← Klienten</button>

      <div className="admin-page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {client.first_name} {client.last_name}
            <StatusBadge label={sm.label} color={sm.color} />
          </h1>
          <p className="admin-subtitle">
            {client.customer_number ? `Kundennr. ${client.customer_number} · ` : ''}
            {client.care_level ? `Pflegegrad ${client.care_level}` : 'Kein Pflegegrad'}
          </p>
        </div>
        <StatusEditor client={client} onSaved={load} />
      </div>

      {sperrtEinsaetze(client.status) && (
        <Banner tone="warn">
          Betreuung ist nicht aktiv (Status „{sm.label}") — für diesen Klienten lassen sich
          keine neuen Einsätze planen. Die vorhandenen Daten bleiben vollständig erhalten.
        </Banner>
      )}

      {/* ═══ Tabs ═══ */}
      <div className="admin-filters" style={{ marginBottom: 20 }}>
        {([
          ['uebersicht', 'Übersicht'],
          ['gesundheit', 'Gesundheitsdaten'],
          ['notizen', 'Notizen'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            className={`admin-filter-btn ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'gesundheit' && (
        <HealthSection client={client} onSaved={updated => setClient({ ...client, ...updated })} />
      )}

      {tab === 'notizen' && <CareNotesPanel clientId={client.id} />}

      {tab === 'uebersicht' && (<>
      {/* Stammdaten + Budget nebeneinander */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }} className="client-detail-grid">
        {/* Stammdaten */}
        <div className="admin-stat-card" style={{ padding: 20 }}>
          <StammdatenEditor client={client} onSaved={load} />
          <InfoRow label="Pflegekasse" value={client.insurance_name || '—'} />
          <InfoRow label="Versichertennr." value={client.insurance_number || '—'} />
          <PflegegradEditor client={client} onSaved={load} />
          {client.notes && <InfoRow label="Notizen" value={client.notes} />}
        </div>

        {/* Budget */}
        <div className="admin-stat-card" style={{ padding: 20 }}>
          <h2 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            Budget {new Date().getFullYear()}
            {summary && <AmpelDot ampel={summary.ampel} withLabel />}
          </h2>
          {!summary ? (
            <p style={{ color: 'var(--ink4)' }}>Für dieses Jahr ist noch kein Budget hinterlegt.</p>
          ) : (
            <>
              {summary.carryoverExpiresSoon && (
                <Banner tone="warn">
                  ⏳ Vorjahresübertrag {euro(summary.carryover)} verfällt am {formatDate(budget.carryover_expires)} — zuerst verbrauchen!
                </Banner>
              )}
              {summary.carryoverExpired && (
                <Banner tone="danger">
                  ❌ Vorjahresübertrag ist am {formatDate(budget.carryover_expires)} verfallen.
                </Banner>
              )}
              <div style={{ margin: '12px 0' }}>
                <BudgetBar summary={summary} />
              </div>
              <InfoRow label="Jahresbudget (§45b)" value={euro(budget.annual_amount)} />
              <InfoRow label="Vorjahresübertrag" value={euro(budget.carryover_amount)} />
              <InfoRow label="Verbraucht" value={euro(summary.used)} />
              <InfoRow label="aus Übertrag" value={euro(budget.used_from_carryover)} />
              <InfoRow label="Privat gezahlt" value={euro(budget.private_amount)} />
              <InfoRow label="Verfügbar gesamt" value={euro(summary.available)} strong />
              <InfoRow label="Verbleibend" value={euro(summary.remaining)} strong
                color={summary.remaining < 0 ? '#D04B3B' : '#5CB882'} />
            </>
          )}
        </div>
      </div>

      {/* Leistungshistorie */}
      <h2 style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
        Leistungshistorie
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>({records.length})</span>
        <button onClick={() => router.push(`/admin/records/new?client=${client.id}`)} style={addBtn}>+ Nachweis</button>
      </h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Datum</th><th>Zeit</th><th>Leistung</th><th>Kraft</th><th>Budget</th><th>Betrag</th><th>Status</th></tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <EmptyRow colSpan={7}>Noch keine Leistungen erfasst</EmptyRow>
            ) : records.map(r => {
              const rm = statusMeta(RECORD_STATUS, r.status)
              return (
                <tr key={r.id} {...klickbareZeile(() => router.push(`/admin/records?focus=${r.id}`))} style={{ cursor: 'pointer' }}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{formatTime(r.start_time)}–{formatTime(r.end_time)}</td>
                  <td>{r.service_type || '—'}</td>
                  <td>{r.caregiver}</td>
                  <td style={{ fontSize: 13 }}>{r.budget_type ? (BUDGET_TYPE[r.budget_type] || r.budget_type) : '—'}</td>
                  <td>{euro(r.amount)}</td>
                  <td><StatusBadge label={rm.label} color={rm.color} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      </>)}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Gesundheitsdaten & Notfallkontakte — Ansicht + Bearbeitung
// ═══════════════════════════════════════════════════════════════
type HealthPayload = Pick<ClientDetail,
  'allergies' | 'medications' | 'mobility_status' | 'dietary_restrictions' | 'medical_conditions' |
  'emergency_contact_name' | 'emergency_contact_phone' | 'emergency_contact_relationship' |
  'next_of_kin_name' | 'next_of_kin_phone' | 'next_of_kin_email' | 'next_of_kin_relationship' |
  'hausarzt_name' | 'hausarzt_phone' | 'versichertennummer' | 'pflegekasse_name' | 'pflegekasse_ik'
>

function healthFormFromClient(c: ClientDetail): Record<string, string> {
  return {
    allergies: c.allergies || '',
    medications: c.medications || '',
    mobility_status: c.mobility_status || '',
    dietary_restrictions: c.dietary_restrictions || '',
    medical_conditions: c.medical_conditions || '',
    emergency_contact_name: c.emergency_contact_name || '',
    emergency_contact_phone: c.emergency_contact_phone || '',
    emergency_contact_relationship: c.emergency_contact_relationship || '',
    next_of_kin_name: c.next_of_kin_name || '',
    next_of_kin_phone: c.next_of_kin_phone || '',
    next_of_kin_email: c.next_of_kin_email || '',
    next_of_kin_relationship: c.next_of_kin_relationship || '',
    hausarzt_name: c.hausarzt_name || '',
    hausarzt_phone: c.hausarzt_phone || '',
    versichertennummer: c.versichertennummer || '',
    pflegekasse_name: c.pflegekasse_name || '',
    pflegekasse_ik: c.pflegekasse_ik || '',
  }
}

function HealthSection({ client, onSaved }: { client: ClientDetail; onSaved: (u: HealthPayload) => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>(() => healthFormFromClient(client))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  function startEdit() {
    setForm(healthFormFromClient(client))
    setErr(null); setSavedOk(false); setEditing(true)
  }

  async function save() {
    setErr(null); setSaving(true)
    try {
      const t = (k: string) => form[k].trim() || null
      const payload: HealthPayload = {
        allergies: t('allergies'),
        medications: t('medications'),
        mobility_status: form.mobility_status || null,
        dietary_restrictions: t('dietary_restrictions'),
        medical_conditions: t('medical_conditions'),
        emergency_contact_name: t('emergency_contact_name'),
        emergency_contact_phone: t('emergency_contact_phone'),
        emergency_contact_relationship: t('emergency_contact_relationship'),
        next_of_kin_name: t('next_of_kin_name'),
        next_of_kin_phone: t('next_of_kin_phone'),
        next_of_kin_email: t('next_of_kin_email'),
        next_of_kin_relationship: t('next_of_kin_relationship'),
        hausarzt_name: t('hausarzt_name'),
        hausarzt_phone: t('hausarzt_phone'),
        versichertennummer: t('versichertennummer'),
        pflegekasse_name: t('pflegekasse_name'),
        pflegekasse_ik: t('pflegekasse_ik'),
      }
      // Läuft über die API-Route (nicht direkt per Browser-Client), damit
      // die Änderung wie Klienten-Anlage und Pflegegrad-Änderung ins
      // Audit-Log geschrieben wird.
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error || 'Speichern fehlgeschlagen.'); setSaving(false); return }
      onSaved(payload)
      setEditing(false)
      setSavedOk(true)
    } catch (e: any) {
      setErr(e?.message || 'Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  const mob = client.mobility_status ? statusMeta(MOBILITY_STATUS, client.mobility_status) : null

  return (
    <div>
      <h2 style={{ marginTop: 8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        Gesundheitsdaten &amp; Notfallkontakte
        {!editing && <button onClick={startEdit} style={addBtn}>Bearbeiten</button>}
      </h2>

      {err && <Banner tone="danger">{err}</Banner>}
      {savedOk && !editing && <Banner tone="info">✅ Gesundheitsdaten gespeichert.</Banner>}

      {!editing ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }} className="client-detail-grid">
          {/* Gesundheit */}
          <div className="admin-stat-card" style={{ padding: 20 }}>
            <h2 style={{ marginBottom: 12 }}>Gesundheit</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
              <span style={{ color: 'var(--ink4)' }}>Mobilität</span>
              {mob ? <StatusBadge label={mob.label} color={mob.color} /> : <span style={{ color: 'var(--ink2)' }}>—</span>}
            </div>
            <InfoBlock label="Allergien" value={client.allergies} />
            <InfoBlock label="Medikamente" value={client.medications} />
            <InfoBlock label="Ernährungseinschränkungen" value={client.dietary_restrictions} />
            <InfoBlock label="Medizinische Vorerkrankungen" value={client.medical_conditions} />
          </div>

          {/* Kontakte & Versicherung */}
          <div className="admin-stat-card" style={{ padding: 20 }}>
            <h2 style={{ marginBottom: 12 }}>Notfallkontakte &amp; Versicherung</h2>
            <InfoRow label="Notfallkontakt" value={[client.emergency_contact_name, client.emergency_contact_relationship ? `(${client.emergency_contact_relationship})` : ''].filter(Boolean).join(' ') || '—'} />
            <InfoRow label="Notfall-Telefon" value={client.emergency_contact_phone || '—'} />
            <InfoRow label="Angehörige/r" value={[client.next_of_kin_name, client.next_of_kin_relationship ? `(${client.next_of_kin_relationship})` : ''].filter(Boolean).join(' ') || '—'} />
            <InfoRow label="Angehörige/r Telefon" value={client.next_of_kin_phone || '—'} />
            <InfoRow label="Angehörige/r E-Mail" value={client.next_of_kin_email || '—'} />
            <InfoRow label="Hausarzt" value={client.hausarzt_name || '—'} />
            <InfoRow label="Hausarzt Telefon" value={client.hausarzt_phone || '—'} />
            <InfoRow label="Versichertennummer" value={client.versichertennummer || '—'} />
            <InfoRow label="Pflegekasse" value={client.pflegekasse_name || '—'} />
            <InfoRow label="Pflegekasse IK-Nummer" value={client.pflegekasse_ik || '—'} />
          </div>
        </div>
      ) : (
        <div className="admin-stat-card" style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }} className="client-detail-grid">
            {/* Spalte 1: Gesundheit */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <FormField label="Mobilität">
                <select value={form.mobility_status} onChange={set('mobility_status')} style={fieldInput}>
                  <option value="">— nicht erfasst —</option>
                  <option value="mobil">Mobil</option>
                  <option value="eingeschraenkt">Eingeschränkt</option>
                  <option value="rollstuhl">Rollstuhl</option>
                  <option value="bettlaegerig">Bettlägerig</option>
                </select>
              </FormField>
              <FormField label="Allergien">
                <textarea aria-label="z. B. Penicillin, Nüsse…" value={form.allergies} onChange={set('allergies')} rows={3} placeholder="z. B. Penicillin, Nüsse…" style={fieldArea} />
              </FormField>
              <FormField label="Medikamente">
                <textarea aria-label="z. B. Marcumar 1-0-0…" value={form.medications} onChange={set('medications')} rows={3} placeholder="z. B. Marcumar 1-0-0…" style={fieldArea} />
              </FormField>
              <FormField label="Ernährungseinschränkungen">
                <textarea aria-label="z. B. Diabetiker-Kost, laktosefrei…" value={form.dietary_restrictions} onChange={set('dietary_restrictions')} rows={3} placeholder="z. B. Diabetiker-Kost, laktosefrei…" style={fieldArea} />
              </FormField>
              <FormField label="Medizinische Vorerkrankungen">
                <textarea aria-label="z. B. Demenz, Herzinsuffizienz…" value={form.medical_conditions} onChange={set('medical_conditions')} rows={3} placeholder="z. B. Demenz, Herzinsuffizienz…" style={fieldArea} />
              </FormField>
            </div>

            {/* Spalte 2: Kontakte & Versicherung */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={groupLabel}>Notfallkontakt</div>
              <FormField label="Name"><input aria-label="Notfallkontakt" value={form.emergency_contact_name} onChange={set('emergency_contact_name')} style={fieldInput} /></FormField>
              <div style={{ display: 'flex', gap: 10 }}>
                <FormField label="Telefon"><input value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} style={fieldInput} /></FormField>
                <FormField label="Beziehung"><input aria-label="z. B. Tochter" value={form.emergency_contact_relationship} onChange={set('emergency_contact_relationship')} placeholder="z. B. Tochter" style={fieldInput} /></FormField>
              </div>

              <div style={groupLabel}>Angehörige</div>
              <FormField label="Name"><input aria-label="Angehörige" value={form.next_of_kin_name} onChange={set('next_of_kin_name')} style={fieldInput} /></FormField>
              <div style={{ display: 'flex', gap: 10 }}>
                <FormField label="Telefon"><input value={form.next_of_kin_phone} onChange={set('next_of_kin_phone')} style={fieldInput} /></FormField>
                <FormField label="Beziehung"><input aria-label="z. B. Sohn" value={form.next_of_kin_relationship} onChange={set('next_of_kin_relationship')} placeholder="z. B. Sohn" style={fieldInput} /></FormField>
              </div>
              <FormField label="E-Mail"><input type="email" value={form.next_of_kin_email} onChange={set('next_of_kin_email')} style={fieldInput} /></FormField>

              <div style={groupLabel}>Hausarzt</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <FormField label="Name"><input aria-label="Hausarzt" value={form.hausarzt_name} onChange={set('hausarzt_name')} style={fieldInput} /></FormField>
                <FormField label="Telefon"><input value={form.hausarzt_phone} onChange={set('hausarzt_phone')} style={fieldInput} /></FormField>
              </div>

              <div style={groupLabel}>Versicherung</div>
              <FormField label="Versichertennummer"><input aria-label="Versicherung" value={form.versichertennummer} onChange={set('versichertennummer')} style={fieldInput} /></FormField>
              <div style={{ display: 'flex', gap: 10 }}>
                <FormField label="Pflegekasse"><input aria-label="z. B. AOK Hessen" value={form.pflegekasse_name} onChange={set('pflegekasse_name')} placeholder="z. B. AOK Hessen" style={fieldInput} /></FormField>
                <FormField label="IK-Nummer"><input value={form.pflegekasse_ik} onChange={set('pflegekasse_ik')} style={fieldInput} /></FormField>
              </div>
            </div>
          </div>

          <div className="admin-modal-btns" style={{ marginTop: 18 }}>
            <button className="btn-cancel" onClick={() => setEditing(false)} disabled={saving}>Abbrechen</button>
            <button className="btn-confirm" onClick={save} disabled={saving}>{saving ? 'Speichern…' : 'Speichern'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Mehrzeiliger Info-Block (für Freitexte wie Allergien/Medikamente)
function InfoBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
      <div style={{ color: 'var(--ink4)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 500, color: 'var(--ink2)', whiteSpace: 'pre-wrap' }}>{value || '—'}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Pflegegrad — Höher-/Herabstufung durch den MDK
// ═══════════════════════════════════════════════════════════════
function PflegegradEditor({ client, onSaved }: { client: ClientDetail; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [pg, setPg] = useState(String(client.care_level ?? 0))
  const [seit, setSeit] = useState(client.care_level_since || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hinweise, setHinweise] = useState<string[]>([])

  function startEdit() {
    setPg(String(client.care_level ?? 0))
    setSeit(client.care_level_since || '')
    setErr(null); setHinweise([]); setEditing(true)
  }

  async function save() {
    setErr(null); setSaving(true)
    try {
      const res = await fetch(`/api/admin/clients/${client.id}/pflegegrad`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          care_level: Number(pg),
          care_level_since: seit || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error || 'Speichern fehlgeschlagen.'); setSaving(false); return }
      setHinweise(json.hinweise || [])
      setEditing(false)
      // Budget neu laden — beim Hochstufen auf PG 2 entsteht das VP/KZP-Budget.
      onSaved()
    } catch (e: any) {
      setErr(e?.message || 'Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 14, alignItems: 'center' }}>
          <span style={{ color: 'var(--ink4)' }}>Pflegegrad</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 500, color: 'var(--ink2)' }}>
              {client.care_level ? `PG ${client.care_level}` : 'kein Pflegegrad'}
            </span>
            <button onClick={startEdit} style={{ ...backBtn, marginBottom: 0, fontSize: 13 }}>ändern</button>
          </span>
        </div>
        <InfoRow label="Pflegegrad seit" value={formatDate(client.care_level_since)} />
        {hinweise.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {hinweise.map((h, i) => <Banner key={i} tone="warn">{h}</Banner>)}
          </div>
        )}
      </>
    )
  }

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      {err && <Banner tone="danger">{err}</Banner>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <FormField label="Pflegegrad">
          <select value={pg} onChange={e => setPg(e.target.value)} style={fieldInput}>
            <option value="0">kein Pflegegrad</option>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={String(n)}>Pflegegrad {n}</option>)}
          </select>
        </FormField>
        <FormField label="gültig ab">
          <input type="date" value={seit} onChange={e => setSeit(e.target.value)} style={fieldInput} />
        </FormField>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink5)', margin: '8px 0 0' }}>
        §45b Entlastungsbetrag ab PG 1 · §42a Verhinderungs-/Kurzzeitpflege ab PG 2.
        Fehlende Budgets werden nach dem Speichern automatisch angelegt.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={save} disabled={saving} style={addBtn}>{saving ? 'Speichert…' : 'Speichern'}</button>
        <button onClick={() => setEditing(false)} disabled={saving} style={{ ...backBtn, marginBottom: 0 }}>Abbrechen</button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Kontaktstammdaten — Ansicht + Bearbeitung
// ═══════════════════════════════════════════════════════════════
// Schließt Bereich 1 der Lückenanalyse: Name, Adresse, PLZ, Ort, Telefon,
// E-Mail und Geburtsdatum waren nach der Anlage nicht mehr änderbar. Läuft
// über PATCH /api/admin/clients/[id], damit die Änderung im Audit-Log landet.
function StammdatenEditor({ client, onSaved }: { client: ClientDetail; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>(() => stammdatenFormFromClient(client))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)

  const set = (key: string) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value }))

  function startEdit() {
    setForm(stammdatenFormFromClient(client))
    setErr(null); setSavedOk(false); setEditing(true)
  }

  async function save() {
    setErr(null); setSaving(true)
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          date_of_birth: form.date_of_birth || null,
          address: form.address.trim() || null,
          zip_code: form.zip_code.trim() || null,
          city: form.city.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(json.error || 'Speichern fehlgeschlagen.'); setSaving(false); return }
      setEditing(false)
      setSavedOk(true)
      onSaved()
    } catch (e: any) {
      setErr(e?.message || 'Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <>
        <h2 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          Stammdaten
          <button onClick={startEdit} style={addBtn}>Bearbeiten</button>
        </h2>
        {savedOk && <Banner tone="info">✅ Stammdaten gespeichert.</Banner>}
        <InfoRow label="Geburtsdatum" value={formatDate(client.date_of_birth)} />
        <InfoRow label="Adresse" value={[client.address, [client.zip_code, client.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'} />
        <InfoRow label="Telefon" value={client.phone || '—'} />
        <InfoRow label="E-Mail" value={client.email || '—'} />
      </>
    )
  }

  return (
    <>
      <h2 style={{ marginBottom: 12 }}>Stammdaten bearbeiten</h2>
      {err && <Banner tone="danger">{err}</Banner>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <FormField label="Vorname"><input value={form.first_name} onChange={set('first_name')} style={fieldInput} /></FormField>
          <FormField label="Nachname"><input value={form.last_name} onChange={set('last_name')} style={fieldInput} /></FormField>
        </div>
        <FormField label="Geburtsdatum"><input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} style={fieldInput} /></FormField>
        <FormField label="Straße und Hausnummer"><input value={form.address} onChange={set('address')} style={fieldInput} /></FormField>
        <div style={{ display: 'flex', gap: 10 }}>
          <FormField label="PLZ"><input value={form.zip_code} onChange={set('zip_code')} inputMode="numeric" maxLength={5} style={fieldInput} /></FormField>
          <FormField label="Ort"><input value={form.city} onChange={set('city')} style={fieldInput} /></FormField>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <FormField label="Telefon"><input type="tel" value={form.phone} onChange={set('phone')} style={fieldInput} /></FormField>
          <FormField label="E-Mail"><input type="email" value={form.email} onChange={set('email')} style={fieldInput} /></FormField>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={save} disabled={saving} style={addBtn}>{saving ? 'Speichert…' : 'Speichern'}</button>
        <button onClick={() => setEditing(false)} disabled={saving} style={{ ...backBtn, marginBottom: 0 }}>Abbrechen</button>
      </div>
    </>
  )
}

function stammdatenFormFromClient(c: ClientDetail): Record<string, string> {
  return {
    first_name: c.first_name || '',
    last_name: c.last_name || '',
    date_of_birth: c.date_of_birth || '',
    address: c.address || '',
    zip_code: c.zip_code || '',
    city: c.city || '',
    phone: c.phone || '',
    email: c.email || '',
  }
}

// ═══════════════════════════════════════════════════════════════
// Betreuungsstatus — pausieren, beenden, wieder aufnehmen
// ═══════════════════════════════════════════════════════════════
// AUSDRÜCKLICH KEINE LÖSCHUNG. Alle Nachweise, Rechnungen und Budgets
// bleiben erhalten; der Klient wird nur für neue Einsätze gesperrt.
// Für die echte Datenlöschung ist der DSGVO-Weg zuständig.
const STATUS_HINWEIS: Record<string, string> = {
  active: 'Betreuung läuft — Einsätze können geplant werden.',
  paused: 'Vorübergehend ausgesetzt (z. B. Krankenhausaufenthalt). Keine neuen Einsätze.',
  inactive: 'Betreuung beendet (Kündigung, Umzug, Versterben). Keine neuen Einsätze.',
  archived: 'Archiviert — Vorgang abgeschlossen, nur noch Nachweis- und Rechnungshistorie.',
}

function StatusEditor({ client, onSaved }: { client: ClientDetail; onSaved: () => void }) {
  const [offen, setOffen] = useState(false)
  const [ziel, setZiel] = useState<string>(client.status === 'active' ? 'inactive' : 'active')
  const [grund, setGrund] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hinweise, setHinweise] = useState<string[]>([])

  async function save() {
    setErr(null); setSaving(true)
    try {
      const res = await fetch(`/api/admin/clients/${client.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: ziel, grund: grund.trim() || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(json.error || 'Statuswechsel fehlgeschlagen.'); setSaving(false); return }
      setHinweise(json.hinweise || [])
      setOffen(false)
      setGrund('')
      onSaved()
    } catch (e: any) {
      setErr(e?.message || 'Statuswechsel fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  if (!offen) {
    return (
      <div style={{ textAlign: 'right' }}>
        <button onClick={() => { setErr(null); setOffen(true) }} style={{ ...addBtn, marginLeft: 0 }}>
          Status ändern
        </button>
        {hinweise.length > 0 && (
          <div style={{ marginTop: 8, textAlign: 'left', maxWidth: 460 }}>
            {hinweise.map((h, i) => <Banner key={i} tone="warn">{h}</Banner>)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="admin-stat-card" style={{ padding: 16, minWidth: 320, maxWidth: 460 }}>
      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Betreuungsstatus ändern</h2>
      {err && <Banner tone="danger">{err}</Banner>}
      <FormField label="Neuer Status">
        <select value={ziel} onChange={e => setZiel(e.target.value)} style={fieldInput}>
          {SETZBARE_STATUS.map(w => (
            <option key={w} value={w}>{CLIENT_STATUS[w]?.label || w}</option>
          ))}
        </select>
      </FormField>
      <p style={{ fontSize: 12, color: 'var(--ink5)', margin: '8px 0 0' }}>{STATUS_HINWEIS[ziel]}</p>
      <div style={{ marginTop: 10 }}>
        <FormField label="Grund (optional, wird protokolliert)">
          <input value={grund} onChange={e => setGrund(e.target.value)} placeholder="z. B. Kündigung zum 31.03." style={fieldInput} />
        </FormField>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink5)', margin: '10px 0 0' }}>
        Es werden keine Daten gelöscht. Nachweise, Rechnungen und Budgets bleiben
        vollständig erhalten — eine echte Löschung läuft über den DSGVO-Weg.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={save} disabled={saving} style={{ ...addBtn, marginLeft: 0 }}>{saving ? 'Speichert…' : 'Status setzen'}</button>
        <button onClick={() => setOffen(false)} disabled={saving} style={{ ...backBtn, marginBottom: 0 }}>Abbrechen</button>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{label}</span>
      <div style={{ marginTop: 3 }}>{children}</div>
    </label>
  )
}

const fieldInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box', marginBottom: 0,
}
const fieldArea: React.CSSProperties = { ...fieldInput, resize: 'vertical' }
const groupLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase',
  color: 'var(--ink5)', marginTop: 6,
}

function InfoRow({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
      <span style={{ color: 'var(--ink4)' }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 500, color: color || 'var(--ink2)', textAlign: 'right' }}>{value}</span>
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
