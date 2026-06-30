'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  euro, formatDate, fullName, statusMeta,
  BONUS_TYPE, REWARD_TYPE, CAREGIVER_STATUS,
} from '@/lib/admin/ops'
import { StatusBadge, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface Caregiver { id: string; name: string; status: string }
interface BonusRow {
  id: string; caregiver_id: string; caregiver: string; bonus_type: string | null
  description: string | null; points: number | null; reward_type: string | null
  reward_value: number | null; awarded_date: string | null
}

function monthKey(dateStr: string | null): string | null {
  if (!dateStr) return null
  return dateStr.slice(0, 7) // YYYY-MM
}

export default function AdminBonusesPage() {
  const router = useRouter()
  const [caregivers, setCaregivers] = useState<Caregiver[]>([])
  const [bonuses, setBonuses] = useState<BonusRow[]>([])
  const [loading, setLoading] = useState(true)
  const [award, setAward] = useState(false)

  const load = useCallback(async () => {
    try {
      const supabase = createClient()
      const [cgRes, boRes] = await Promise.all([
        supabase.from('caregivers').select('id, first_name, last_name, status'),
        supabase.from('caregiver_bonuses').select('id, caregiver_id, bonus_type, description, points, reward_type, reward_value, awarded_date, caregiver:caregivers(first_name, last_name)').order('awarded_date', { ascending: false }),
      ])
      setCaregivers((cgRes.data || []).map((c: any) => ({ id: c.id, name: fullName(c), status: c.status || 'active' })))
      setBonuses((boRes.data || []).map((b: any) => ({
        id: b.id, caregiver_id: b.caregiver_id, caregiver: fullName(b.caregiver), bonus_type: b.bonus_type,
        description: b.description, points: b.points, reward_type: b.reward_type, reward_value: b.reward_value,
        awarded_date: b.awarded_date,
      })))
    } catch (err) {
      console.error('Bonuses load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const thisMonth = useMemo(() => new Date().toISOString().slice(0, 7), [])

  // Punkte je Mitarbeiter (gesamt + aktueller Monat)
  const ranking = useMemo(() => {
    const totals = new Map<string, { total: number; month: number; count: number }>()
    bonuses.forEach(b => {
      const cur = totals.get(b.caregiver_id) || { total: 0, month: 0, count: 0 }
      cur.total += Number(b.points) || 0
      cur.count += 1
      if (monthKey(b.awarded_date) === thisMonth) cur.month += Number(b.points) || 0
      totals.set(b.caregiver_id, cur)
    })
    return caregivers
      .map(c => ({ ...c, ...(totals.get(c.id) || { total: 0, month: 0, count: 0 }) }))
      .sort((a, b) => b.total - a.total)
  }, [caregivers, bonuses, thisMonth])

  // Mitarbeiter des Monats = meiste Punkte im laufenden Monat
  const employeeOfMonth = useMemo(() => {
    const withMonth = ranking.filter(r => r.month > 0).sort((a, b) => b.month - a.month)
    return withMonth[0] || null
  }, [ranking])

  const rewards = useMemo(() => bonuses.filter(b => b.reward_type), [bonuses])
  const totalRewardValue = useMemo(() => rewards.reduce((s, r) => s + (Number(r.reward_value) || 0), 0), [rewards])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Mitarbeiterbindung</h1>
          <p className="admin-subtitle">Bonus-Punkte, Prämien und Mitarbeiter des Monats</p>
        </div>
        <button onClick={() => setAward(true)} style={primaryBtn}>+ Bonus vergeben</button>
      </div>

      {/* Mitarbeiter des Monats */}
      <div className="admin-stat-card gold" style={{ padding: 20, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 36 }}>🏆</span>
        <div>
          <div style={{ fontSize: 12, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>
            Mitarbeiter des Monats · {new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
          </div>
          {employeeOfMonth ? (
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--gold2)', fontFamily: "'Cormorant Garamond', serif" }}>
              {employeeOfMonth.name} <span style={{ fontSize: 15, color: 'var(--ink3)' }}>· {employeeOfMonth.month} Punkte diesen Monat</span>
            </div>
          ) : (
            <div style={{ fontSize: 16, color: 'var(--ink4)' }}>Noch keine Punkte in diesem Monat vergeben.</div>
          )}
        </div>
      </div>

      {loading ? <p>Laden…</p> : (
        <>
          {/* Bonus-Übersicht / Ranking */}
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Bonus-Übersicht
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>({ranking.length} Mitarbeiter)</span>
          </h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>#</th><th>Mitarbeiter</th><th>Status</th><th>Punkte (Monat)</th><th>Punkte gesamt</th><th>Vergaben</th></tr></thead>
              <tbody>
                {ranking.length === 0 ? <EmptyRow colSpan={6}>Keine Mitarbeiter</EmptyRow> : ranking.map((r, i) => {
                  const sm = statusMeta(CAREGIVER_STATUS, r.status)
                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`
                  return (
                    <tr key={r.id} onClick={() => router.push(`/admin/caregivers/${r.id}`)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 700, color: i < 3 ? 'var(--gold2)' : 'var(--ink4)', fontSize: i < 3 ? 16 : 14 }}>{medal}</td>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td><StatusBadge label={sm.label} color={sm.color} /></td>
                      <td style={{ color: r.month > 0 ? '#5CB882' : 'var(--ink4)' }}>{r.month > 0 ? `+${r.month}` : '—'}</td>
                      <td style={{ fontWeight: 700, color: 'var(--gold2)' }}>{r.total}</td>
                      <td style={{ fontSize: 13, color: 'var(--ink4)' }}>{r.count}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Prämien-Verwaltung */}
          <h2 style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
            Prämien-Verwaltung
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>
              ({rewards.length} · {euro(totalRewardValue)})
            </span>
          </h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Datum</th><th>Mitarbeiter</th><th>Prämie</th><th>Wert</th><th>Anlass</th></tr></thead>
              <tbody>
                {rewards.length === 0 ? <EmptyRow colSpan={5}>Noch keine Prämien vergeben</EmptyRow> : rewards.map(r => {
                  const rw = r.reward_type ? (REWARD_TYPE[r.reward_type] || REWARD_TYPE.other) : null
                  const bm = r.bonus_type ? (BONUS_TYPE[r.bonus_type] || BONUS_TYPE.other) : null
                  return (
                    <tr key={r.id}>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(r.awarded_date)}</td>
                      <td style={{ fontWeight: 600 }}>{r.caregiver}</td>
                      <td>{rw ? `${rw.emoji} ${rw.label}` : '—'}</td>
                      <td>{r.reward_value ? euro(r.reward_value) : '—'}</td>
                      <td style={{ fontSize: 13 }}>{r.description || (bm ? bm.label : '—')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {award && <AwardModal caregivers={caregivers} onClose={() => setAward(false)} onSaved={() => { setAward(false); load() }} />}
    </div>
  )
}

function AwardModal({ caregivers, onClose, onSaved }: { caregivers: Caregiver[]; onClose: () => void; onSaved: () => void }) {
  const [caregiverId, setCaregiverId] = useState('')
  const [type, setType] = useState('punctuality')
  const [points, setPoints] = useState('10')
  const [desc, setDesc] = useState('')
  const [reward, setReward] = useState('')
  const [rewardValue, setRewardValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null)
    if (!caregiverId) { setErr('Bitte einen Mitarbeiter wählen.'); return }
    setSaving(true)
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
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: 460, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>Bonus vergeben</h3>
        {err && <Banner tone="danger">{err}</Banner>}
        <Field label="Mitarbeiter *">
          <select value={caregiverId} onChange={e => setCaregiverId(e.target.value)} style={modalSelect}>
            <option value="">— wählen —</option>
            {caregivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Kategorie">
            <select value={type} onChange={e => setType(e.target.value)} style={modalSelect}>
              {Object.entries(BONUS_TYPE).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select>
          </Field>
          <Field label="Punkte"><input type="number" value={points} onChange={e => setPoints(e.target.value)} style={modalInput} /></Field>
        </div>
        <Field label="Anlass / Beschreibung"><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="z. B. 3 Monate ohne Verspätung" style={modalInput} /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Prämie (optional)">
            <select value={reward} onChange={e => setReward(e.target.value)} style={modalSelect}>
              <option value="">— keine —</option>
              {Object.entries(REWARD_TYPE).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select>
          </Field>
          <Field label="Wert (€, optional)"><input type="number" step="0.01" value={rewardValue} onChange={e => setRewardValue(e.target.value)} placeholder="0,00" style={modalInput} /></Field>
        </div>
        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose}>Abbrechen</button>
          <button className="btn-confirm" onClick={save} disabled={saving}>{saving ? 'Speichern…' : 'Vergeben'}</button>
        </div>
      </div>
    </div>
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
const modalInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box', marginBottom: 0,
}
const modalSelect: React.CSSProperties = { ...modalInput }
