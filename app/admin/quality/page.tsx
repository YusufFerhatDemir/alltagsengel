'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate, fullName, statusMeta, daysUntil, stars,
  CALL_TYPE, CALL_SEQUENCE,
} from '@/lib/admin/ops'
import { StatusBadge, Banner, EmptyRow } from '@/components/admin/OpsUI'

interface Client { id: string; name: string; created_at: string | null; status: string }
interface CallRow {
  id: string; client_id: string; client: string; call_type: string | null; call_date: string | null
  called_by: string | null; satisfaction_rating: number | null; is_punctual: boolean | null
  feels_comfortable: boolean | null; keep_caregiver: boolean | null; suggestions: string | null
  notes: string | null; next_call_date: string | null
}
interface DueCall { client_id: string; client: string; call_type: string; due_date: string | null; daysLeft: number | null }

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

interface QualityDashboard {
  zeitraum: { von: string; bis: string }
  wunden: { gesamt: number; aktiv: number; verschlechtert: number; abgeheilt: number }
  sturzereignisse: { anzahl: number }
  vitalalarme: { aktiv: boolean; kritisch: number; warnung: number }
  massnahmen: { offen: number; abgeschlossen: number }
}

function aktuellerMonatVon(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function aktuellerMonatBis(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

export default function AdminQualityPage() {
  const [tab, setTab] = useState<'anrufe' | 'pflegequalitaet'>('anrufe')
  const [clients, setClients] = useState<Client[]>([])
  const [calls, setCalls] = useState<CallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [docCall, setDocCall] = useState<{ client_id?: string; call_type?: string } | null>(null)
  const [qVon, setQVon] = useState(aktuellerMonatVon())
  const [qBis, setQBis] = useState(aktuellerMonatBis())
  const [qDashboard, setQDashboard] = useState<QualityDashboard | null>(null)
  const [qLoading, setQLoading] = useState(false)
  const [qError, setQError] = useState<string | null>(null)

  const loadQuality = useCallback(async () => {
    setQLoading(true)
    setQError(null)
    try {
      const res = await fetch(`/api/admin/analytics/quality?von=${qVon}&bis=${qBis}`)
      const json = await res.json()
      if (!res.ok) { setQError(json.error || 'Unbekannter Fehler'); setQDashboard(null); return }
      setQDashboard(json)
    } catch (err: any) {
      setQError(err.message || 'Unbekannter Fehler')
    } finally {
      setQLoading(false)
    }
  }, [qVon, qBis])

  useEffect(() => { if (tab === 'pflegequalitaet') loadQuality() }, [tab, loadQuality])

  const load = useCallback(async () => {
    try {
      const supabase = createClient()
      const [clRes, caRes] = await Promise.all([
        supabase.from('clients').select('id, first_name, last_name, created_at, status'),
        supabase.from('satisfaction_calls').select('id, client_id, call_type, call_date, called_by, satisfaction_rating, is_punctual, feels_comfortable, keep_caregiver, suggestions, notes, next_call_date, client:clients(first_name, last_name)').order('call_date', { ascending: false }),
      ])
      setClients((clRes.data || []).map((c: any) => ({ id: c.id, name: fullName(c), created_at: c.created_at, status: c.status || 'active' })))
      setCalls((caRes.data || []).map((c: any) => ({
        id: c.id, client_id: c.client_id, client: fullName(c.client), call_type: c.call_type, call_date: c.call_date,
        called_by: c.called_by, satisfaction_rating: c.satisfaction_rating, is_punctual: c.is_punctual,
        feels_comfortable: c.feels_comfortable, keep_caregiver: c.keep_caregiver, suggestions: c.suggestions,
        notes: c.notes, next_call_date: c.next_call_date,
      })))
    } catch (err) {
      console.error('Quality load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Anstehende Anrufe: Kadenz 7 → 30 → 90 → alle 6 Monate
  const dueCalls = useMemo<DueCall[]>(() => {
    const callsByClient = new Map<string, CallRow[]>()
    calls.forEach(c => {
      const arr = callsByClient.get(c.client_id) || []
      arr.push(c)
      callsByClient.set(c.client_id, arr)
    })
    const result: DueCall[] = []
    for (const cl of clients) {
      if (cl.status === 'inactive' || cl.status === 'archived') continue
      const done = (callsByClient.get(cl.id) || [])
      const doneTypes = new Set(done.map(d => d.call_type).filter(Boolean) as string[])
      // Nächsten fehlenden Anruf der festen Kadenz finden
      const nextFixed = CALL_SEQUENCE.find(t => t !== 'recurring' && !doneTypes.has(t))
      let call_type: string
      let due_date: string | null = null
      if (nextFixed) {
        call_type = nextFixed
        const off = CALL_TYPE[nextFixed].offsetDays
        due_date = cl.created_at && off != null ? addDays(cl.created_at.slice(0, 10), off) : null
      } else {
        // Feste Kadenz erledigt → halbjährlich ab letztem Anruf
        call_type = 'recurring'
        const last = done.map(d => d.call_date).filter(Boolean).sort().pop() || null
        due_date = last ? addDays(last, 182) : null
      }
      result.push({ client_id: cl.id, client: cl.name, call_type, due_date, daysLeft: daysUntil(due_date) })
    }
    // Nur fällige oder bald fällige (≤ 14 Tage) sortiert nach Dringlichkeit
    return result
      .filter(r => r.daysLeft == null || r.daysLeft <= 14)
      .sort((a, b) => (a.daysLeft ?? 99999) - (b.daysLeft ?? 99999))
  }, [clients, calls])

  const overdue = dueCalls.filter(d => d.daysLeft != null && d.daysLeft < 0).length

  // Auswertung
  const evaluation = useMemo(() => {
    const rated = calls.filter(c => c.satisfaction_rating != null)
    const avg = rated.length ? rated.reduce((s, c) => s + (c.satisfaction_rating || 0), 0) / rated.length : null
    const pct = (key: 'is_punctual' | 'feels_comfortable' | 'keep_caregiver') => {
      const ans = calls.filter(c => c[key] != null)
      if (!ans.length) return null
      return Math.round((ans.filter(c => c[key] === true).length / ans.length) * 100)
    }
    return {
      total: calls.length, avg,
      punctual: pct('is_punctual'), comfortable: pct('feels_comfortable'), keep: pct('keep_caregiver'),
    }
  }, [calls])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Qualitätsmanagement</h1>
          <p className="admin-subtitle">Zufriedenheitsanrufe — 7 / 30 / 90 Tage, danach halbjährlich</p>
        </div>
        {tab === 'anrufe' && <button onClick={() => setDocCall({})} style={primaryBtn}>+ Anruf dokumentieren</button>}
      </div>

      <div className="admin-filters" style={{ marginBottom: 20 }}>
        <button className={`admin-filter-btn ${tab === 'anrufe' ? 'active' : ''}`} onClick={() => setTab('anrufe')}>Zufriedenheitsanrufe</button>
        <button className={`admin-filter-btn ${tab === 'pflegequalitaet' ? 'active' : ''}`} onClick={() => setTab('pflegequalitaet')}>Pflegequalität</button>
      </div>

      {tab === 'anrufe' && (
      <>
      {overdue > 0 && <Banner tone="danger">❗ {overdue} überfällige(r) Zufriedenheitsanruf(e).</Banner>}

      {/* Auswertung */}
      <div className="admin-stats-grid" style={{ marginBottom: 8 }}>
        <div className="admin-stat-card gold">
          <div className="admin-stat-value">{evaluation.avg != null ? evaluation.avg.toFixed(1) : '—'}</div>
          <div className="admin-stat-label">Ø Zufriedenheit {evaluation.avg != null && <span style={{ color: 'var(--gold2)' }}>{stars(evaluation.avg)}</span>}</div>
        </div>
        <div className="admin-stat-card success">
          <div className="admin-stat-value">{evaluation.punctual != null ? `${evaluation.punctual}%` : '—'}</div>
          <div className="admin-stat-label">Pünktlich</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{evaluation.comfortable != null ? `${evaluation.comfortable}%` : '—'}</div>
          <div className="admin-stat-label">Fühlt sich wohl</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{evaluation.keep != null ? `${evaluation.keep}%` : '—'}</div>
          <div className="admin-stat-label">Will Kraft behalten</div>
        </div>
        <div className="admin-stat-card accent">
          <div className="admin-stat-value">{evaluation.total}</div>
          <div className="admin-stat-label">Anrufe gesamt</div>
        </div>
      </div>

      {loading ? <p>Laden…</p> : (
        <>
          {/* Anstehende Anrufe */}
          <h2 style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
            Anstehende Anrufe
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>({dueCalls.length})</span>
          </h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Klient</th><th>Anruf-Typ</th><th>Fällig am</th><th>Status</th><th>Aktion</th></tr></thead>
              <tbody>
                {dueCalls.length === 0 ? <EmptyRow colSpan={5}>Aktuell keine Anrufe fällig 🎉</EmptyRow> : dueCalls.map(d => {
                  const ct = CALL_TYPE[d.call_type] || { label: d.call_type, color: '#999' }
                  const tone = d.daysLeft == null ? { l: 'Geplant', c: '#999' }
                    : d.daysLeft < 0 ? { l: `${Math.abs(d.daysLeft)}T überfällig`, c: '#D04B3B' }
                    : d.daysLeft === 0 ? { l: 'Heute', c: '#E8A000' }
                    : { l: `in ${d.daysLeft}T`, c: d.daysLeft <= 7 ? '#E8A000' : '#5CB882' }
                  return (
                    <tr key={d.client_id + d.call_type}>
                      <td style={{ fontWeight: 600 }}>{d.client}</td>
                      <td><StatusBadge label={ct.label} color={ct.color} /></td>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{d.due_date ? formatDate(d.due_date) : '—'}</td>
                      <td><span style={{ color: tone.c, fontWeight: 600, fontSize: 13 }}>{tone.l}</span></td>
                      <td><button onClick={() => setDocCall({ client_id: d.client_id, call_type: d.call_type })} style={actionBtn}>Dokumentieren</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Durchgeführte Anrufe */}
          <h2 style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
            Dokumentierte Anrufe
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>({calls.length})</span>
          </h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Datum</th><th>Klient</th><th>Typ</th><th>Zufriedenheit</th><th>Pünktl.</th><th>Wohl</th><th>Behalten</th><th>Anmerkung</th></tr></thead>
              <tbody>
                {calls.length === 0 ? <EmptyRow colSpan={8}>Noch keine Anrufe dokumentiert</EmptyRow> : calls.map(c => {
                  const ct = c.call_type ? (CALL_TYPE[c.call_type] || { label: c.call_type, color: '#999' }) : { label: '—', color: '#999' }
                  return (
                    <tr key={c.id}>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(c.call_date)}</td>
                      <td style={{ fontWeight: 600 }}>{c.client}</td>
                      <td><StatusBadge label={ct.label} color={ct.color} /></td>
                      <td style={{ color: 'var(--gold2)', whiteSpace: 'nowrap' }}>{c.satisfaction_rating != null ? `${stars(c.satisfaction_rating)} ${c.satisfaction_rating}` : '—'}</td>
                      <td>{boolIcon(c.is_punctual)}</td>
                      <td>{boolIcon(c.feels_comfortable)}</td>
                      <td>{boolIcon(c.keep_caregiver)}</td>
                      <td style={{ fontSize: 13, maxWidth: 240 }}>{c.suggestions || c.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      </>
      )}

      {tab === 'pflegequalitaet' && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginBottom: 20 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink3)' }}>
              Von
              <input type="date" value={qVon} onChange={e => setQVon(e.target.value)} style={modalInput} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink3)' }}>
              Bis
              <input type="date" value={qBis} onChange={e => setQBis(e.target.value)} style={modalInput} />
            </label>
            <button onClick={loadQuality} disabled={qLoading} style={actionBtn}>{qLoading ? 'Lädt…' : 'Aktualisieren'}</button>
          </div>

          {qError && <Banner tone="danger">{qError}</Banner>}

          {qLoading && !qDashboard ? <p>Laden…</p> : qDashboard && (
            <>
              <div className="admin-stats-grid">
                <div className="admin-stat-card" style={{ borderLeft: qDashboard.wunden.verschlechtert > 0 ? '3px solid #D04B3B' : undefined }}>
                  <div className="admin-stat-value">{qDashboard.wunden.aktiv}</div>
                  <div className="admin-stat-label">Offene Wunden ({qDashboard.wunden.verschlechtert} verschlechtert, {qDashboard.wunden.gesamt} gesamt)</div>
                </div>
                <div className="admin-stat-card" style={{ borderLeft: qDashboard.sturzereignisse.anzahl > 0 ? '3px solid #E8A000' : undefined }}>
                  <div className="admin-stat-value">{qDashboard.sturzereignisse.anzahl}</div>
                  <div className="admin-stat-label">Sturzereignisse im Zeitraum</div>
                </div>
                <div className="admin-stat-card" style={{ borderLeft: qDashboard.vitalalarme.kritisch > 0 ? '3px solid #D04B3B' : undefined }}>
                  <div className="admin-stat-value">
                    {qDashboard.vitalalarme.aktiv ? `${qDashboard.vitalalarme.kritisch} kritisch / ${qDashboard.vitalalarme.warnung} Warnung` : 'Deaktiviert'}
                  </div>
                  <div className="admin-stat-label">Vitalwerte-Alarme{!qDashboard.vitalalarme.aktiv && ' (VITALS_GRENZWERT_ALARME_AKTIV aus)'}</div>
                </div>
                <div className="admin-stat-card accent">
                  <div className="admin-stat-value">{qDashboard.massnahmen.offen}</div>
                  <div className="admin-stat-label">Offene Maßnahmen ({qDashboard.massnahmen.abgeschlossen} abgeschlossen)</div>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 16 }}>
                Quelle: Wunddokumentation (Block 7), Pflegeverlauf-Einträge vom Typ „Sturz", Vitalwerte-Grenzwertbewertung (nur aktiv, wenn regulatorisch freigeschaltet), offene Maßnahmenplan-Einträge.
              </p>
            </>
          )}
        </>
      )}

      {docCall && <DocCallModal clients={clients} preset={docCall} onClose={() => setDocCall(null)} onSaved={() => { setDocCall(null); load() }} />}
    </div>
  )
}

function boolIcon(v: boolean | null) {
  if (v == null) return <span style={{ color: 'var(--ink5)' }}>—</span>
  return <span style={{ color: v ? '#5CB882' : '#D04B3B' }}>{v ? '✓' : '✗'}</span>
}

function DocCallModal({ clients, preset, onClose, onSaved }: {
  clients: Client[]; preset: { client_id?: string; call_type?: string }
  onClose: () => void; onSaved: () => void
}) {
  const [clientId, setClientId] = useState(preset.client_id || '')
  const [callType, setCallType] = useState(preset.call_type || 'day7')
  const [callDate, setCallDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [rating, setRating] = useState(5)
  const [punctual, setPunctual] = useState(true)
  const [comfortable, setComfortable] = useState(true)
  const [keep, setKeep] = useState(true)
  const [suggestions, setSuggestions] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Nächsten Anruf vorschlagen
  const nextCallDate = useMemo(() => {
    const idx = CALL_SEQUENCE.indexOf(callType)
    const nextType = idx >= 0 && idx < CALL_SEQUENCE.length - 1 ? CALL_SEQUENCE[idx + 1] : 'recurring'
    const off = nextType === 'recurring' ? 182 : (CALL_TYPE[nextType]?.offsetDays ?? 182)
    // grobe Schätzung: ab Anrufdatum
    const base = callType === 'recurring' ? 182 : (off - (CALL_TYPE[callType]?.offsetDays ?? 0))
    return addDays(callDate, Math.max(base, 7))
  }, [callType, callDate])

  async function save() {
    setErr(null)
    if (!clientId) { setErr('Bitte einen Klienten wählen.'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('satisfaction_calls').insert({
      client_id: clientId, call_type: callType, call_date: callDate, called_by: 'Alltagsengel',
      satisfaction_rating: rating, is_punctual: punctual, feels_comfortable: comfortable,
      keep_caregiver: keep, suggestions: suggestions.trim() || null, notes: notes.trim() || null,
      next_call_date: nextCallDate,
    })
    if (error) { setErr(error.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: 480, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>Zufriedenheitsanruf dokumentieren</h3>
        {err && <Banner tone="danger">{err}</Banner>}
        <Field label="Klient *">
          <select value={clientId} onChange={e => setClientId(e.target.value)} style={modalSelect}>
            <option value="">— wählen —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Anruf-Typ">
            <select value={callType} onChange={e => setCallType(e.target.value)} style={modalSelect}>
              {Object.entries(CALL_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Datum"><input type="date" value={callDate} onChange={e => setCallDate(e.target.value)} style={modalInput} /></Field>
        </div>
        <Field label={`Zufriedenheit: ${stars(rating)} (${rating}/5)`}>
          <input type="range" min={1} max={5} step={1} value={rating} onChange={e => setRating(Number(e.target.value))} style={{ width: '100%' }} />
        </Field>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '6px 0 12px' }}>
          <Toggle label="Pünktlich" value={punctual} onChange={setPunctual} />
          <Toggle label="Fühlt sich wohl" value={comfortable} onChange={setComfortable} />
          <Toggle label="Will Kraft behalten" value={keep} onChange={setKeep} />
        </div>
        <Field label="Verbesserungsvorschläge"><input value={suggestions} onChange={e => setSuggestions(e.target.value)} style={modalInput} /></Field>
        <Field label="Notizen"><input value={notes} onChange={e => setNotes(e.target.value)} style={modalInput} /></Field>
        <p style={{ fontSize: 12, color: 'var(--ink4)', margin: '4px 0 0' }}>Nächster Anruf vorgemerkt für {formatDate(nextCallDate)}.</p>
        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose}>Abbrechen</button>
          <button className="btn-confirm" onClick={save} disabled={saving}>{saving ? 'Speichern…' : 'Anruf speichern'}</button>
        </div>
      </div>
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink2)', cursor: 'pointer' }}>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0, marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{label}</span>
      <div style={{ marginTop: 3 }}>{children}</div>
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
const modalInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box', marginBottom: 0,
}
const modalSelect: React.CSSProperties = { ...modalInput }
