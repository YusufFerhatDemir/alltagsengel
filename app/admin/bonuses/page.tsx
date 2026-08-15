'use client'
import { datumBerlin, monatBerlin } from '@/lib/utils/timezone';
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  euro, formatDate, fullName, statusMeta,
  BONUS_TYPE, REWARD_TYPE, CAREGIVER_STATUS,
} from '@/lib/admin/ops'
import { awardBonus } from './actions'
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

type BonusKriteriumTyp = 'keine_ausfaelle' | 'vollstaendige_dokumentation' | 'keine_offenen_pruefungen'
const KRITERIUM_LABEL: Record<BonusKriteriumTyp, string> = {
  keine_ausfaelle: 'Keine Ausfälle (max. Ausfalltage im Zeitraum)',
  vollstaendige_dokumentation: 'Vollständige Dokumentation (% signierte Leistungsnachweise)',
  keine_offenen_pruefungen: 'Keine offenen Prüfhinweise (% ohne offene Fehler)',
}
interface BonusRegel {
  id: string; organizationId: string; name: string; kriteriumTyp: BonusKriteriumTyp
  schwellenwert: number; punkte: number; aktiv: boolean; createdAt: string
}
interface BonusBerechnung {
  id: string; regelId: string; caregiverId: string; zeitraumVon: string; zeitraumBis: string
  erfuellt: boolean; messwert: number | null; punkte: number
  status: 'berechnet' | 'freigegeben' | 'abgelehnt' | 'ausgezahlt'; berechnetAm: string
}

function aktuellerMonatVon(): string {
  const d = new Date()
  return datumBerlin(new Date(d.getFullYear(), d.getMonth(), 1))
}
function aktuellerMonatBis(): string {
  const d = new Date()
  return datumBerlin(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

export default function AdminBonusesPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'uebersicht' | 'regelwerk' | 'berechnungslauf' | 'freigaben'>('uebersicht')
  const [caregivers, setCaregivers] = useState<Caregiver[]>([])
  const [bonuses, setBonuses] = useState<BonusRow[]>([])
  const [loading, setLoading] = useState(true)
  const [award, setAward] = useState(false)

  // Regelwerk
  const [regeln, setRegeln] = useState<BonusRegel[]>([])
  const [regelnLoading, setRegelnLoading] = useState(false)
  const [regelnError, setRegelnError] = useState<string | null>(null)
  const [neueRegel, setNeueRegel] = useState({ name: '', kriteriumTyp: 'keine_ausfaelle' as BonusKriteriumTyp, schwellenwert: '0', punkte: '10' })
  const [regelSaving, setRegelSaving] = useState(false)

  const loadRegeln = useCallback(async () => {
    setRegelnLoading(true)
    setRegelnError(null)
    try {
      const res = await fetch('/api/admin/analytics/bonuses/regeln')
      const json = await res.json()
      if (!res.ok) { setRegelnError(json.error || 'Unbekannter Fehler'); return }
      setRegeln(json)
    } catch (err: any) {
      setRegelnError(err.message || 'Unbekannter Fehler')
    } finally {
      setRegelnLoading(false)
    }
  }, [])

  useEffect(() => { if (tab === 'regelwerk' || tab === 'berechnungslauf' || tab === 'freigaben') loadRegeln() }, [tab, loadRegeln])

  async function regelAnlegen() {
    setRegelSaving(true)
    setRegelnError(null)
    try {
      const res = await fetch('/api/admin/analytics/bonuses/regeln', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: neueRegel.name,
          kriteriumTyp: neueRegel.kriteriumTyp,
          schwellenwert: Number(neueRegel.schwellenwert),
          punkte: Number(neueRegel.punkte),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setRegelnError(json.error || 'Unbekannter Fehler'); return }
      setNeueRegel({ name: '', kriteriumTyp: 'keine_ausfaelle', schwellenwert: '0', punkte: '10' })
      await loadRegeln()
    } catch (err: any) {
      setRegelnError(err.message || 'Unbekannter Fehler')
    } finally {
      setRegelSaving(false)
    }
  }

  async function regelToggle(id: string, aktiv: boolean) {
    await fetch('/api/admin/analytics/bonuses/regeln', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, aktiv }),
    })
    await loadRegeln()
  }

  // Berechnungslauf
  const [laufRegelId, setLaufRegelId] = useState('')
  const [laufVon, setLaufVon] = useState(aktuellerMonatVon())
  const [laufBis, setLaufBis] = useState(aktuellerMonatBis())
  const [laufRunning, setLaufRunning] = useState(false)
  const [laufError, setLaufError] = useState<string | null>(null)
  const [laufErgebnis, setLaufErgebnis] = useState<{ anzahl: number; erfuellt: number; ergebnisse: { caregiverId: string; erfuellt: boolean; messwert: number; punkte: number; begruendung: string }[] } | null>(null)

  async function berechnungslaufStarten() {
    if (!laufRegelId) { setLaufError('Bitte eine Regel wählen.'); return }
    setLaufRunning(true)
    setLaufError(null)
    try {
      const res = await fetch('/api/admin/analytics/bonuses/berechnen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regelId: laufRegelId, von: laufVon, bis: laufBis }),
      })
      const json = await res.json()
      if (!res.ok) { setLaufError(json.error || 'Unbekannter Fehler'); setLaufErgebnis(null); return }
      setLaufErgebnis(json)
    } catch (err: any) {
      setLaufError(err.message || 'Unbekannter Fehler')
    } finally {
      setLaufRunning(false)
    }
  }

  // Freigaben & Historie
  const [berechnungen, setBerechnungen] = useState<BonusBerechnung[]>([])
  const [berechnungenLoading, setBerechnungenLoading] = useState(false)
  const [freigabeBusyId, setFreigabeBusyId] = useState<string | null>(null)

  const loadBerechnungen = useCallback(async () => {
    setBerechnungenLoading(true)
    try {
      const res = await fetch('/api/admin/analytics/bonuses/historie')
      const json = await res.json()
      if (res.ok) setBerechnungen(json)
    } finally {
      setBerechnungenLoading(false)
    }
  }, [])

  useEffect(() => { if (tab === 'freigaben') loadBerechnungen() }, [tab, loadBerechnungen])

  async function entscheiden(berechnungId: string, entscheidung: 'freigegeben' | 'abgelehnt') {
    setFreigabeBusyId(berechnungId)
    try {
      await fetch('/api/admin/analytics/bonuses/freigeben', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ berechnungId, entscheidung }),
      })
      await loadBerechnungen()
    } finally {
      setFreigabeBusyId(null)
    }
  }

  const caregiverName = useCallback((id: string) => caregivers.find(c => c.id === id)?.name || id, [caregivers])
  const regelName = useCallback((id: string) => regeln.find(r => r.id === id)?.name || id, [regeln])

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

  const thisMonth = useMemo(() => monatBerlin(), [])

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
        {tab === 'uebersicht' && <button onClick={() => setAward(true)} style={primaryBtn}>+ Bonus vergeben</button>}
      </div>

      <div className="admin-filters" style={{ marginBottom: 20 }}>
        <button className={`admin-filter-btn ${tab === 'uebersicht' ? 'active' : ''}`} onClick={() => setTab('uebersicht')}>Übersicht</button>
        <button className={`admin-filter-btn ${tab === 'regelwerk' ? 'active' : ''}`} onClick={() => setTab('regelwerk')}>Regelwerk</button>
        <button className={`admin-filter-btn ${tab === 'berechnungslauf' ? 'active' : ''}`} onClick={() => setTab('berechnungslauf')}>Berechnungslauf</button>
        <button className={`admin-filter-btn ${tab === 'freigaben' ? 'active' : ''}`} onClick={() => setTab('freigaben')}>Freigaben & Historie</button>
      </div>

      {tab === 'uebersicht' && (
      <>
      {/* Mitarbeiter des Monats */}
      <div className="admin-stat-card gold" style={{ padding: 20, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 36 }}>🏆</span>
        <div>
          <div style={{ fontSize: 12, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>
            Mitarbeiter des Monats · {new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', month: 'long', year: 'numeric' })}
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
      </>
      )}

      {tab === 'regelwerk' && (
        <div>
          <h2>Regelwerk anlegen</h2>
          {regelnError && <Banner tone="danger">{regelnError}</Banner>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 20 }}>
            <Field label="Name">
              <input value={neueRegel.name} onChange={e => setNeueRegel(s => ({ ...s, name: e.target.value }))} placeholder="z. B. Zuverlässigkeit Q3" style={modalInput} />
            </Field>
            <Field label="Kriterium">
              <select value={neueRegel.kriteriumTyp} onChange={e => setNeueRegel(s => ({ ...s, kriteriumTyp: e.target.value as BonusKriteriumTyp }))} style={modalSelect}>
                {Object.entries(KRITERIUM_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Schwellenwert">
              <input type="number" step="0.1" value={neueRegel.schwellenwert} onChange={e => setNeueRegel(s => ({ ...s, schwellenwert: e.target.value }))} style={modalInput} />
            </Field>
            <Field label="Punkte bei Erfüllung">
              <input type="number" value={neueRegel.punkte} onChange={e => setNeueRegel(s => ({ ...s, punkte: e.target.value }))} style={modalInput} />
            </Field>
            <button onClick={regelAnlegen} disabled={regelSaving || !neueRegel.name} style={primaryBtn}>{regelSaving ? 'Speichern…' : 'Regel anlegen'}</button>
          </div>

          <h2>Aktive Regeln ({regeln.length})</h2>
          {regelnLoading ? <p>Laden…</p> : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Name</th><th>Kriterium</th><th>Schwellenwert</th><th>Punkte</th><th>Status</th><th>Aktion</th></tr></thead>
                <tbody>
                  {regeln.length === 0 ? <EmptyRow colSpan={6}>Noch keine Regeln angelegt</EmptyRow> : regeln.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td style={{ fontSize: 13 }}>{KRITERIUM_LABEL[r.kriteriumTyp]}</td>
                      <td>{r.schwellenwert}</td>
                      <td style={{ fontWeight: 700, color: 'var(--gold2)' }}>{r.punkte}</td>
                      <td>{r.aktiv ? <StatusBadge label="Aktiv" color="#5CB882" /> : <StatusBadge label="Inaktiv" color="#999" />}</td>
                      <td><button onClick={() => regelToggle(r.id, !r.aktiv)} style={actionBtn}>{r.aktiv ? 'Deaktivieren' : 'Aktivieren'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'berechnungslauf' && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 16 }}>
            Wertet eine aktive Regel für alle aktiven Kräfte im gewählten Zeitraum aus und speichert das Ergebnis mit Status „berechnet" — Freigabe erfolgt im nächsten Tab.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginBottom: 20 }}>
            <Field label="Regel">
              <select value={laufRegelId} onChange={e => setLaufRegelId(e.target.value)} style={modalSelect}>
                <option value="">— wählen —</option>
                {regeln.filter(r => r.aktiv).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Von">
              <input type="date" value={laufVon} onChange={e => setLaufVon(e.target.value)} style={modalInput} />
            </Field>
            <Field label="Bis">
              <input type="date" value={laufBis} onChange={e => setLaufBis(e.target.value)} style={modalInput} />
            </Field>
            <button onClick={berechnungslaufStarten} disabled={laufRunning} style={primaryBtn}>{laufRunning ? 'Läuft…' : 'Berechnungslauf starten'}</button>
          </div>

          {laufError && <Banner tone="danger">{laufError}</Banner>}

          {laufErgebnis && (
            <>
              <p style={{ fontSize: 13, color: 'var(--ink3)' }}>{laufErgebnis.erfuellt} von {laufErgebnis.anzahl} Kräften haben das Kriterium erfüllt.</p>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Mitarbeiter</th><th>Erfüllt</th><th>Messwert</th><th>Punkte</th><th>Begründung</th></tr></thead>
                  <tbody>
                    {laufErgebnis.ergebnisse.map(e => (
                      <tr key={e.caregiverId}>
                        <td style={{ fontWeight: 600 }}>{caregiverName(e.caregiverId)}</td>
                        <td>{e.erfuellt ? <StatusBadge label="Ja" color="#5CB882" /> : <StatusBadge label="Nein" color="#D04B3B" />}</td>
                        <td>{e.messwert}</td>
                        <td style={{ fontWeight: 700, color: 'var(--gold2)' }}>{e.punkte}</td>
                        <td style={{ fontSize: 13 }}>{e.begruendung}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'freigaben' && (
        <div>
          {berechnungenLoading ? <p>Laden…</p> : (
            <>
              <h2>Offen zur Freigabe ({berechnungen.filter(b => b.status === 'berechnet').length})</h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Mitarbeiter</th><th>Regel</th><th>Zeitraum</th><th>Erfüllt</th><th>Punkte</th><th>Aktion</th></tr></thead>
                  <tbody>
                    {berechnungen.filter(b => b.status === 'berechnet').length === 0 ? (
                      <EmptyRow colSpan={6}>Keine offenen Berechnungen</EmptyRow>
                    ) : berechnungen.filter(b => b.status === 'berechnet').map(b => (
                      <tr key={b.id}>
                        <td style={{ fontWeight: 600 }}>{caregiverName(b.caregiverId)}</td>
                        <td style={{ fontSize: 13 }}>{regelName(b.regelId)}</td>
                        <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(b.zeitraumVon)} – {formatDate(b.zeitraumBis)}</td>
                        <td>{b.erfuellt ? <StatusBadge label="Ja" color="#5CB882" /> : <StatusBadge label="Nein" color="#D04B3B" />}</td>
                        <td style={{ fontWeight: 700, color: 'var(--gold2)' }}>{b.punkte}</td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => entscheiden(b.id, 'freigegeben')} disabled={freigabeBusyId === b.id} style={actionBtn}>Freigeben</button>
                          <button onClick={() => entscheiden(b.id, 'abgelehnt')} disabled={freigabeBusyId === b.id} style={{ ...actionBtn, color: '#D04B3B', borderColor: 'rgba(208,75,59,0.3)', background: 'rgba(208,75,59,0.08)' }}>Ablehnen</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h2 style={{ marginTop: 32 }}>Historie ({berechnungen.length})</h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Mitarbeiter</th><th>Regel</th><th>Zeitraum</th><th>Status</th><th>Punkte</th><th>Berechnet am</th></tr></thead>
                  <tbody>
                    {berechnungen.length === 0 ? <EmptyRow colSpan={6}>Noch keine Berechnungsläufe</EmptyRow> : berechnungen.map(b => (
                      <tr key={b.id}>
                        <td style={{ fontWeight: 600 }}>{caregiverName(b.caregiverId)}</td>
                        <td style={{ fontSize: 13 }}>{regelName(b.regelId)}</td>
                        <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(b.zeitraumVon)} – {formatDate(b.zeitraumBis)}</td>
                        <td>
                          {b.status === 'freigegeben' && <StatusBadge label="Freigegeben" color="#5CB882" />}
                          {b.status === 'abgelehnt' && <StatusBadge label="Abgelehnt" color="#D04B3B" />}
                          {b.status === 'berechnet' && <StatusBadge label="Offen" color="#E8A000" />}
                          {b.status === 'ausgezahlt' && <StatusBadge label="Ausgezahlt" color="#2196F3" />}
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--gold2)' }}>{b.punkte}</td>
                        <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(b.berechnetAm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
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
    const result = await awardBonus({
      caregiver_id: caregiverId,
      bonus_type: type,
      points: points ? Number(points) : null,
      description: desc.trim() || null,
      reward_type: reward || null,
      reward_value: rewardValue ? Number(rewardValue) : null,
    })
    if (!result.ok) { setErr(result.error); setSaving(false); return }
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
const actionBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
