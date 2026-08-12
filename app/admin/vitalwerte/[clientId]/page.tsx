'use client'
// ═══════════════════════════════════════════════════════════════
// Vitalwerte eines Klienten — Erfassung, Verlauf (Chart), Grenzwerte
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import { Banner, StatusBadge } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, SchalterFeld, Tabs, TextBereich, TextFeld,
  pflegeMiniBtn, pflegePrimaryBtn, pflegeSecondaryBtn,
} from '@/components/admin/PflegeUI'
import VitalChart from '@/components/admin/VitalChart'
import {
  VITAL_TYPEN, VITAL_TYP_WERTE,
  type VitalSign, type VitalSignThreshold, type VitalTyp,
} from '@/lib/vitals/types'
import { bewerteMesswert } from '@/lib/vitals/vitals'
import type { PflegeUebersichtZeile } from '@/lib/pflege/types'

const STUFEN_META = {
  ok: { label: 'OK', color: '#5CB882' },
  warnung: { label: 'Warnung', color: '#E8A000' },
  kritisch: { label: 'KRITISCH', color: '#D04B3B' },
}

const TYP_OPTIONEN: Array<[string, string]> = VITAL_TYP_WERTE.map(t => [t, VITAL_TYPEN[t].label])
const ZEITRAEUME: Array<[string, string]> = [['7', '7 Tage'], ['30', '30 Tage'], ['90', '90 Tage']]

const LEERES_FORMULAR = { wert: '', wertSekundaer: '', gemessenAm: '', notizen: '' }

type GrenzwertFormular = {
  min_warn: string; max_warn: string; min_critical: string; max_critical: string
  min_warn_secondary: string; max_warn_secondary: string
  min_critical_secondary: string; max_critical_secondary: string
  enabled: boolean; notizen: string
}
const LEERE_GRENZEN: GrenzwertFormular = {
  min_warn: '', max_warn: '', min_critical: '', max_critical: '',
  min_warn_secondary: '', max_warn_secondary: '', min_critical_secondary: '', max_critical_secondary: '',
  enabled: true, notizen: '',
}

export default function AdminVitalwerteKlientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params)
  const [messungen, setMessungen] = useState<VitalSign[]>([])
  const [grenzwerte, setGrenzwerte] = useState<VitalSignThreshold[]>([])
  const [alarmeAktiv, setAlarmeAktiv] = useState(false)
  const [kunde, setKunde] = useState<PflegeUebersichtZeile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hinweis, setHinweis] = useState('')

  const [tab, setTab] = useState<'verlauf' | 'grenzwerte'>('verlauf')
  const [typ, setTyp] = useState<VitalTyp>('blutdruck')
  const [zeitraum, setZeitraum] = useState('30')
  const [form, setForm] = useState(LEERES_FORMULAR)
  const [zeigeForm, setZeigeForm] = useState(false)
  const [grenzenForm, setGrenzenForm] = useState<GrenzwertFormular>(LEERE_GRENZEN)

  const cfg = VITAL_TYPEN[typ]

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [mRes, gRes, kRes] = await Promise.all([
        fetch(`/api/vitals?clientId=${clientId}&limit=2000`).then(r => r.json()),
        fetch(`/api/vitals/thresholds?clientId=${clientId}`).then(r => r.json()),
        fetch(`/api/pflege/uebersicht?clientId=${clientId}`).then(r => r.json()),
      ])
      if (mRes.error) { setError(mRes.error); return }
      if (gRes.error) { setError(gRes.error); return }
      setMessungen(mRes.messungen || [])
      setGrenzwerte(gRes.grenzwerte || [])
      setAlarmeAktiv(Boolean(mRes.alarmeAktiv))
      setKunde((kRes.uebersicht || [])[0] ?? null)
    } catch {
      setError('Laden fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }

  const klientGrenzwert = useMemo(
    () => grenzwerte.find(g => g.type === typ) ?? null,
    [grenzwerte, typ])

  /** Effektive Grenzen für Chart & Tabelle: Klient-Satz, sonst Standard. */
  const effektiveGrenzen = useMemo(() => {
    if (klientGrenzwert && klientGrenzwert.enabled) return klientGrenzwert
    return cfg.standard
  }, [klientGrenzwert, cfg])

  const imZeitraum = useMemo(() => {
    const von = Date.now() - Number(zeitraum) * 24 * 60 * 60 * 1000
    return messungen.filter(m => m.type === typ && new Date(m.measured_at).getTime() >= von)
  }, [messungen, typ, zeitraum])

  // Grenzwert-Formular beim Typwechsel aus dem gespeicherten Satz vorbelegen
  useEffect(() => {
    const g = klientGrenzwert
    const s = (v: number | null | undefined) => (v == null ? '' : String(v))
    setGrenzenForm(g
      ? {
        min_warn: s(g.min_warn), max_warn: s(g.max_warn),
        min_critical: s(g.min_critical), max_critical: s(g.max_critical),
        min_warn_secondary: s(g.min_warn_secondary), max_warn_secondary: s(g.max_warn_secondary),
        min_critical_secondary: s(g.min_critical_secondary), max_critical_secondary: s(g.max_critical_secondary),
        enabled: g.enabled, notizen: g.notes ?? '',
      }
      : LEERE_GRENZEN)
  }, [klientGrenzwert])

  async function messungAnlegen() {
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch('/api/vitals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId, typ,
          wert: form.wert,
          wertSekundaer: cfg.hatSekundaer ? form.wertSekundaer : undefined,
          gemessenAm: form.gemessenAm ? new Date(form.gemessenAm).toISOString() : undefined,
          notizen: form.notizen || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Speichern fehlgeschlagen.'); return }
      setMessungen(ms => [body.messung, ...ms])
      setForm(LEERES_FORMULAR)
      setZeigeForm(false)
      // Alarm-Rückmeldung nur bei freigeschalteter Alarmfunktion (MDR).
      // Ohne Freigabe kommt bewertung=null — dann neutral quittieren.
      if (body.alarmeAktiv && body.bewertung?.stufe === 'kritisch') {
        setError(`KRITISCHER WERT: ${body.bewertung.meldungen.join(' · ')}`)
      } else if (body.alarmeAktiv && body.bewertung?.stufe === 'warnung') {
        setHinweis(`Warnung: ${body.bewertung.meldungen.join(' · ')}`)
      } else if (body.alarmeAktiv) {
        setHinweis('Messung gespeichert — Wert im Normbereich.')
      } else {
        setHinweis('Messung gespeichert.')
      }
    } finally { setBusy(false) }
  }

  async function messungLoeschen(id: string) {
    if (!window.confirm('Diese Messung wirklich löschen?')) return
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/vitals/${id}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Löschen fehlgeschlagen.'); return }
      setMessungen(ms => ms.filter(m => m.id !== id))
    } finally { setBusy(false) }
  }

  async function grenzwerteSpeichern() {
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch('/api/vitals/thresholds', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, typ, ...grenzenForm, notizen: grenzenForm.notizen }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Speichern fehlgeschlagen.'); return }
      setGrenzwerte(gs => [...gs.filter(g => g.type !== typ), body.grenzwert])
      setHinweis(`Grenzwerte für ${cfg.label} gespeichert.`)
    } finally { setBusy(false) }
  }

  if (loading) return <div className="admin-page"><p style={{ color: 'var(--muted)' }}>Laden…</p></div>

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Vitalwerte</h1>
          <p className="admin-subtitle">
            {kunde ? `${kunde.first_name} ${kunde.last_name}` : 'Klient'} · {messungen.length} Messungen
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setZeigeForm(v => !v)} style={pflegePrimaryBtn}>+ Messung</button>
          <Link href="/admin/vitalwerte" style={pflegeSecondaryBtn}>← Übersicht</Link>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {hinweis && <Banner tone="success">{hinweis}</Banner>}

      <div className="admin-filters" style={{ marginBottom: 16 }}>
        {TYP_OPTIONEN.map(([k, l]) => (
          <button key={k} className={`admin-filter-btn ${typ === k ? 'active' : ''}`}
            onClick={() => setTyp(k as VitalTyp)}>{l}</button>
        ))}
      </div>

      {zeigeForm && (
        <Karte titel={`Neue Messung: ${cfg.label}`}>
          <FeldRaster>
            <TextFeld label={`${cfg.labelWert} (${cfg.einheit}) *`} type="number"
              value={form.wert} onChange={v => setForm(f => ({ ...f, wert: v }))} />
            {cfg.hatSekundaer && (
              <TextFeld label={`${cfg.labelSekundaer} (${cfg.einheit}) *`} type="number"
                value={form.wertSekundaer} onChange={v => setForm(f => ({ ...f, wertSekundaer: v }))} />
            )}
            <TextFeld label="Zeitpunkt (leer = jetzt)" type="datetime-local"
              value={form.gemessenAm} onChange={v => setForm(f => ({ ...f, gemessenAm: v }))} />
          </FeldRaster>
          <div style={{ marginTop: 12 }}>
            <TextBereich label="Notizen" value={form.notizen} onChange={v => setForm(f => ({ ...f, notizen: v }))} rows={2} />
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={messungAnlegen} disabled={busy || !form.wert || (cfg.hatSekundaer && !form.wertSekundaer)}
              style={pflegePrimaryBtn}>Speichern</button>
            <button onClick={() => setZeigeForm(false)} style={pflegeSecondaryBtn}>Abbrechen</button>
          </div>
        </Karte>
      )}

      <Tabs
        tabs={[{ key: 'verlauf' as const, label: 'Verlauf' }, { key: 'grenzwerte' as const, label: 'Grenzwerte' }]}
        aktiv={tab} onChange={setTab}
      />

      {tab === 'verlauf' && (
        <>
          <Karte
            titel={`${cfg.label} — Verlauf`}
            aktion={(
              <div style={{ display: 'flex', gap: 6 }}>
                {ZEITRAEUME.map(([k, l]) => (
                  <button key={k} className={`admin-filter-btn ${zeitraum === k ? 'active' : ''}`}
                    onClick={() => setZeitraum(k)}>{l}</button>
                ))}
              </div>
            )}
          >
            <VitalChart typ={typ} messungen={imZeitraum} grenzen={effektiveGrenzen} alarmeAktiv={alarmeAktiv} />
            {alarmeAktiv && effektiveGrenzen && (
              <p style={{ fontSize: 11, color: 'var(--ink5)', margin: '8px 0 0' }}>
                Grenzwerte: {klientGrenzwert?.enabled ? 'klientenspezifisch' : 'Standard'} ·
                Warnung {effektiveGrenzen.min_warn ?? '–'}–{effektiveGrenzen.max_warn ?? '–'} ·
                Kritisch {effektiveGrenzen.min_critical ?? '–'}–{effektiveGrenzen.max_critical ?? '–'} {cfg.einheit}
              </p>
            )}
            {!alarmeAktiv && (
              <p style={{ fontSize: 11, color: 'var(--ink5)', margin: '8px 0 0' }}>
                Reine Verlaufsdarstellung — keine automatische Grenzwert-Bewertung (Alarmfunktion regulatorisch deaktiviert).
              </p>
            )}
          </Karte>

          <Karte titel="Messungen">
            {imZeitraum.length === 0 && <p style={{ color: 'var(--muted)', margin: 0 }}>Keine Messungen im Zeitraum</p>}
            {imZeitraum.map(m => {
              // Bewertung nur bei freigeschalteter Alarmfunktion (MDR).
              const bewertung = alarmeAktiv
                ? bewerteMesswert(
                  m.type, Number(m.value),
                  m.value_secondary != null ? Number(m.value_secondary) : null,
                  klientGrenzwert)
                : null
              const meta = bewertung ? STUFEN_META[bewertung.stufe] : null
              return (
                <div key={m.id} style={{
                  display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
                  padding: '10px 0', borderBottom: '1px solid var(--border)',
                }}>
                  {meta && <StatusBadge label={meta.label} color={meta.color} />}
                  <span style={{ fontWeight: 600, minWidth: 120 }}>
                    {Number(m.value).toFixed(cfg.dezimalstellen)}
                    {m.value_secondary != null ? `/${Number(m.value_secondary).toFixed(cfg.dezimalstellen)}` : ''} {cfg.einheit}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--ink4)' }}>
                    {new Date(m.measured_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{m.measured_by_name ?? 'unbekannt'}
                  </span>
                  {m.notes && <span style={{ fontSize: 13, color: 'var(--ink3)', flex: 1 }}>{m.notes}</span>}
                  {bewertung && meta && bewertung.meldungen.length > 0 && (
                    <span style={{ fontSize: 12, color: meta.color }}>{bewertung.meldungen.join(' · ')}</span>
                  )}
                  <button onClick={() => messungLoeschen(m.id)} disabled={busy}
                    style={{ ...pflegeMiniBtn, marginLeft: 'auto' }}>Löschen</button>
                </div>
              )
            })}
          </Karte>
        </>
      )}

      {tab === 'grenzwerte' && (
        <Karte titel={`Grenzwerte: ${cfg.label} (${cfg.einheit})`}>
          {!alarmeAktiv && (
            <Banner tone="warn">
              Die <strong>Grenzwert-Alarmfunktion ist regulatorisch deaktiviert</strong> (Medizinprodukt-Prüfung
              ausstehend). Grenzwerte können vorbereitend hinterlegt werden, werden aber <strong>nicht ausgewertet</strong> —
              es entstehen keine Warnungen oder Alarme, bis die Funktion freigegeben ist.
            </Banner>
          )}
          {alarmeAktiv && cfg.standard && !klientGrenzwert && (
            <Banner tone="info">
              Ohne klientenspezifische Grenzwerte gelten die Standardwerte:
              Warnung {cfg.standard.min_warn ?? '–'}–{cfg.standard.max_warn ?? '–'},
              kritisch {cfg.standard.min_critical ?? '–'}–{cfg.standard.max_critical ?? '–'} {cfg.einheit}.
            </Banner>
          )}
          {alarmeAktiv && !cfg.standard && !klientGrenzwert && (
            <Banner tone="info">Für {cfg.label} gibt es keine Standard-Grenzwerte — Alarme erst nach Konfiguration.</Banner>
          )}
          <FeldRaster>
            <TextFeld label={`Warnung ab (unter) ${cfg.hatSekundaer ? '— systolisch' : ''}`} type="number"
              value={grenzenForm.min_warn} onChange={v => setGrenzenForm(f => ({ ...f, min_warn: v }))} />
            <TextFeld label={`Warnung ab (über) ${cfg.hatSekundaer ? '— systolisch' : ''}`} type="number"
              value={grenzenForm.max_warn} onChange={v => setGrenzenForm(f => ({ ...f, max_warn: v }))} />
            <TextFeld label={`Kritisch ab (unter) ${cfg.hatSekundaer ? '— systolisch' : ''}`} type="number"
              value={grenzenForm.min_critical} onChange={v => setGrenzenForm(f => ({ ...f, min_critical: v }))} />
            <TextFeld label={`Kritisch ab (über) ${cfg.hatSekundaer ? '— systolisch' : ''}`} type="number"
              value={grenzenForm.max_critical} onChange={v => setGrenzenForm(f => ({ ...f, max_critical: v }))} />
            {cfg.hatSekundaer && (
              <>
                <TextFeld label="Warnung ab (unter) — diastolisch" type="number"
                  value={grenzenForm.min_warn_secondary} onChange={v => setGrenzenForm(f => ({ ...f, min_warn_secondary: v }))} />
                <TextFeld label="Warnung ab (über) — diastolisch" type="number"
                  value={grenzenForm.max_warn_secondary} onChange={v => setGrenzenForm(f => ({ ...f, max_warn_secondary: v }))} />
                <TextFeld label="Kritisch ab (unter) — diastolisch" type="number"
                  value={grenzenForm.min_critical_secondary} onChange={v => setGrenzenForm(f => ({ ...f, min_critical_secondary: v }))} />
                <TextFeld label="Kritisch ab (über) — diastolisch" type="number"
                  value={grenzenForm.max_critical_secondary} onChange={v => setGrenzenForm(f => ({ ...f, max_critical_secondary: v }))} />
              </>
            )}
          </FeldRaster>
          <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
            <TextBereich label="Notizen (z. B. ärztliche Vorgabe)" value={grenzenForm.notizen}
              onChange={v => setGrenzenForm(f => ({ ...f, notizen: v }))} rows={2} />
            <SchalterFeld label="Grenzwert-Alarme für diesen Typ aktiv" value={grenzenForm.enabled}
              onChange={v => setGrenzenForm(f => ({ ...f, enabled: v }))} />
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={grenzwerteSpeichern} disabled={busy} style={pflegePrimaryBtn}>Grenzwerte speichern</button>
          </div>
        </Karte>
      )}
    </div>
  )
}
