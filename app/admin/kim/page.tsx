'use client'
// ═══════════════════════════════════════════════════════════════
// KIM / TI-Anbindung (Block 18)
//
// Verwaltungsoberfläche für Postfach-Konfiguration, Kartenzuordnung
// (eHBA/SMC-B) und die Nachrichten-Warteschlange.
//
// WICHTIG: Der Versand ist bewusst GESPERRT. Weder das KIM-Client-Protokoll
// noch eine Konnektor-Anbindung liegen vor — ein Versandversuch würde immer
// mit 409 abgewiesen. Diese Seite zeigt, was bereits verwaltet werden kann
// (Konfiguration, Karten, Nachrichtenentwürfe) und was noch fehlt.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { formatDate } from '@/lib/admin/ops'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'

interface ReadinessPunkt {
  id: string
  label: string
  ampel: 'gruen' | 'gelb' | 'rot'
  wert: string | null
  hinweis: string | null
  blocker: 'intern' | 'extern' | null
}

interface Readiness {
  gesamt: 'gruen' | 'gelb' | 'rot'
  versandbereit: boolean
  punkte: ReadinessPunkt[]
  zusammenfassung: { gruen: number; gelb: number; rot: number; gesamt: number }
  offeneBlocker: { intern: string[]; extern: string[] }
}

interface Konfiguration {
  id: string
  bezeichnung: string
  postfachadresse: string | null
  provider_name: string | null
  freischaltungsstatus: 'nicht_beantragt' | 'beantragt' | 'freigeschaltet' | 'gesperrt'
  aktiv: boolean
  hinweis: string | null
}

interface Karte {
  id: string
  karten_typ: 'smc_b' | 'ehba'
  kartennummer: string | null
  inhaber_name: string | null
  status: 'beantragt' | 'aktiv' | 'gesperrt' | 'abgelaufen'
  gueltig_von: string | null
  gueltig_bis: string | null
}

interface Nachricht {
  id: string
  betreff: string
  empfaenger_adresse: string | null
  status: 'entwurf' | 'wartend' | 'gesperrt'
  gesperrt_grund: string | null
  created_at: string
}

const AMPEL_FARBE: Record<string, string> = {
  gruen: '#5CB882',
  gelb: '#E8A000',
  rot: '#D04B3B',
}

const AMPEL_LABEL: Record<string, string> = {
  gruen: 'OK',
  gelb: 'Offen',
  rot: 'Blockiert',
}

const FREISCHALTUNGSSTATUS_LABEL: Record<string, string> = {
  nicht_beantragt: 'Nicht beantragt',
  beantragt: 'Beantragt',
  freigeschaltet: 'Freigeschaltet',
  gesperrt: 'Gesperrt',
}

const KARTENTYP_LABEL: Record<string, string> = {
  smc_b: 'SMC-B',
  ehba: 'eHBA',
}

export default function KimPage() {
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [konfigurationen, setKonfigurationen] = useState<Konfiguration[]>([])
  const [karten, setKarten] = useState<Karte[]>([])
  const [nachrichten, setNachrichten] = useState<Nachricht[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [versandHinweis, setVersandHinweis] = useState<string | null>(null)

  const [neueKonfig, setNeueKonfig] = useState({ bezeichnung: '', postfachadresse: '', provider_name: '' })
  const [neueKarte, setNeueKarte] = useState({ karten_typ: 'smc_b' as 'smc_b' | 'ehba', kartennummer: '', inhaber_name: '' })
  const [neueNachricht, setNeueNachricht] = useState({ betreff: '', empfaenger_adresse: '' })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rRes, kRes, kaRes, nRes] = await Promise.all([
        fetch('/api/billing/kim/readiness'),
        fetch('/api/billing/kim/konfiguration'),
        fetch('/api/billing/kim/karten'),
        fetch('/api/billing/kim/nachrichten'),
      ])
      const [rJson, kJson, kaJson, nJson] = await Promise.all([rRes.json(), kRes.json(), kaRes.json(), nRes.json()])
      if (!rRes.ok) { setError(rJson.error || 'Readiness konnte nicht geladen werden.'); return }
      setReadiness(rJson)
      setKonfigurationen(kRes.ok ? kJson : [])
      setKarten(kaRes.ok ? kaJson : [])
      setNachrichten(nRes.ok ? nJson : [])
    } catch {
      setError('Unerwarteter Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function konfigAnlegen(e: FormEvent) {
    e.preventDefault()
    if (!neueKonfig.bezeichnung.trim()) return
    const res = await fetch('/api/billing/kim/konfiguration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(neueKonfig),
    })
    if (res.ok) {
      setNeueKonfig({ bezeichnung: '', postfachadresse: '', provider_name: '' })
      load()
    } else {
      const j = await res.json().catch(() => ({}))
      setError(j.error || 'Konfiguration konnte nicht angelegt werden.')
    }
  }

  async function karteAnlegen(e: FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/billing/kim/karten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(neueKarte),
    })
    if (res.ok) {
      setNeueKarte({ karten_typ: 'smc_b', kartennummer: '', inhaber_name: '' })
      load()
    } else {
      const j = await res.json().catch(() => ({}))
      setError(j.error || 'Karte konnte nicht angelegt werden.')
    }
  }

  async function nachrichtAnlegen(e: FormEvent) {
    e.preventDefault()
    if (!neueNachricht.betreff.trim()) return
    const res = await fetch('/api/billing/kim/nachrichten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(neueNachricht),
    })
    if (res.ok) {
      setNeueNachricht({ betreff: '', empfaenger_adresse: '' })
      load()
    } else {
      const j = await res.json().catch(() => ({}))
      setError(j.error || 'Nachricht konnte nicht angelegt werden.')
    }
  }

  async function versandVersuchen(id: string) {
    setVersandHinweis(null)
    const res = await fetch(`/api/billing/kim/nachrichten/${id}/versenden`, { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    setVersandHinweis(j.error || 'Versand wurde abgewiesen.')
    load()
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>KIM / TI-Anbindung</h1>
          <p className="admin-subtitle">
            Kommunikation im Medizinwesen — Postfach, Kartenzuordnung (eHBA/SMC-B), Nachrichten-Warteschlange
          </p>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {versandHinweis && <Banner tone="warn">{versandHinweis}</Banner>}

      <Banner tone="warn">
        <strong>Versand gesperrt.</strong> Weder das KIM-Client-Protokoll noch eine
        Konnektor-Anbindung (für den Zugriff auf SMC-B/eHBA) sind implementiert — beides ist Teil
        der gematik-Spezifikation und liegt hier nicht vor. Jeder Versandversuch wird mit 409
        abgewiesen und in der Warteschlange als „gesperrt" festgehalten. Konfiguration, Karten und
        Nachrichtenentwürfe können bereits jetzt gepflegt werden.
      </Banner>

      {loading ? <p>Laden…</p> : (
        <>
          {/* ── Readiness ── */}
          {readiness && (
            <>
              <h2 style={cardTitle}>Voraussetzungen</h2>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <StatusBadge
                  label={`Gesamt: ${AMPEL_LABEL[readiness.gesamt]}`}
                  color={AMPEL_FARBE[readiness.gesamt]}
                />
                <span style={{ fontSize: 13, color: 'var(--ink4)' }}>
                  {readiness.zusammenfassung.gruen} OK · {readiness.zusammenfassung.gelb} offen ·{' '}
                  {readiness.zusammenfassung.rot} blockiert
                </span>
              </div>

              <div className="admin-table-wrap" style={{ marginBottom: 24 }}>
                <table className="admin-table">
                  <thead>
                    <tr><th>Punkt</th><th>Status</th><th>Wert</th><th>Blocker</th><th>Hinweis</th></tr>
                  </thead>
                  <tbody>
                    {readiness.punkte.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.label}</td>
                        <td><StatusBadge label={AMPEL_LABEL[p.ampel]} color={AMPEL_FARBE[p.ampel]} /></td>
                        <td style={{ fontSize: 13 }}>{p.wert || '—'}</td>
                        <td style={{ fontSize: 12 }}>
                          {p.blocker === 'extern'
                            ? <span style={{ color: '#D04B3B' }}>extern</span>
                            : p.blocker === 'intern'
                              ? <span style={{ color: '#E8A000' }}>intern</span>
                              : '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--ink4)', maxWidth: 420 }}>{p.hinweis || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(readiness.offeneBlocker.extern.length > 0 || readiness.offeneBlocker.intern.length > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 24 }}>
                  <BlockerKarte
                    titel="Extern zu beschaffen"
                    hinweis="Nur von aussen lösbar — gematik-Zulassung, KIM-Provider-Vertrag, Konnektor, Technische Anlage 5."
                    punkte={readiness.offeneBlocker.extern}
                    farbe="#D04B3B"
                  />
                  <BlockerKarte
                    titel="Intern lösbar"
                    hinweis="In Code oder Stammdaten dieser Plattform lösbar."
                    punkte={readiness.offeneBlocker.intern}
                    farbe="#E8A000"
                  />
                </div>
              )}
            </>
          )}

          {/* ── Konfiguration ── */}
          <h2 style={cardTitle}>Postfach-Konfiguration</h2>
          <form onSubmit={konfigAnlegen} style={formRow}>
            <input style={inputStyle} placeholder="Bezeichnung" value={neueKonfig.bezeichnung}
              onChange={e => setNeueKonfig(s => ({ ...s, bezeichnung: e.target.value }))} />
            <input style={inputStyle} placeholder="Postfachadresse (optional)" value={neueKonfig.postfachadresse}
              onChange={e => setNeueKonfig(s => ({ ...s, postfachadresse: e.target.value }))} />
            <input style={inputStyle} placeholder="Provider (optional)" value={neueKonfig.provider_name}
              onChange={e => setNeueKonfig(s => ({ ...s, provider_name: e.target.value }))} />
            <button type="submit" style={actionBtn}>Anlegen</button>
          </form>
          <div className="admin-table-wrap" style={{ marginBottom: 24 }}>
            <table className="admin-table">
              <thead>
                <tr><th>Bezeichnung</th><th>Postfachadresse</th><th>Provider</th><th>Status</th><th>Aktiv</th></tr>
              </thead>
              <tbody>
                {konfigurationen.length === 0 ? (
                  <EmptyRow colSpan={5}>Keine Konfiguration angelegt</EmptyRow>
                ) : konfigurationen.map(k => (
                  <tr key={k.id}>
                    <td style={{ fontWeight: 600 }}>{k.bezeichnung}</td>
                    <td style={{ fontSize: 13 }}>{k.postfachadresse || '—'}</td>
                    <td style={{ fontSize: 13 }}>{k.provider_name || '—'}</td>
                    <td>
                      <StatusBadge
                        label={FREISCHALTUNGSSTATUS_LABEL[k.freischaltungsstatus]}
                        color={k.freischaltungsstatus === 'freigeschaltet' ? '#5CB882' : k.freischaltungsstatus === 'gesperrt' ? '#D04B3B' : '#E8A000'}
                      />
                    </td>
                    <td>{k.aktiv ? 'Ja' : 'Nein'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Karten ── */}
          <h2 style={cardTitle}>eHBA / SMC-B</h2>
          <form onSubmit={karteAnlegen} style={formRow}>
            <select style={inputStyle} value={neueKarte.karten_typ}
              onChange={e => setNeueKarte(s => ({ ...s, karten_typ: e.target.value as 'smc_b' | 'ehba' }))}>
              <option value="smc_b">SMC-B</option>
              <option value="ehba">eHBA</option>
            </select>
            <input style={inputStyle} placeholder="Kartennummer (optional)" value={neueKarte.kartennummer}
              onChange={e => setNeueKarte(s => ({ ...s, kartennummer: e.target.value }))} />
            <input style={inputStyle} placeholder="Inhaber (optional)" value={neueKarte.inhaber_name}
              onChange={e => setNeueKarte(s => ({ ...s, inhaber_name: e.target.value }))} />
            <button type="submit" style={actionBtn}>Anlegen</button>
          </form>
          <div className="admin-table-wrap" style={{ marginBottom: 24 }}>
            <table className="admin-table">
              <thead>
                <tr><th>Typ</th><th>Kartennummer</th><th>Inhaber</th><th>Status</th><th>Gültigkeit</th></tr>
              </thead>
              <tbody>
                {karten.length === 0 ? (
                  <EmptyRow colSpan={5}>Keine Karte erfasst</EmptyRow>
                ) : karten.map(k => (
                  <tr key={k.id}>
                    <td style={{ fontWeight: 600 }}>{KARTENTYP_LABEL[k.karten_typ]}</td>
                    <td style={{ fontSize: 13, fontFamily: 'monospace' }}>{k.kartennummer || '—'}</td>
                    <td style={{ fontSize: 13 }}>{k.inhaber_name || '—'}</td>
                    <td>
                      <StatusBadge
                        label={k.status}
                        color={k.status === 'aktiv' ? '#5CB882' : k.status === 'gesperrt' || k.status === 'abgelaufen' ? '#D04B3B' : '#E8A000'}
                      />
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink4)' }}>
                      {k.gueltig_von ? formatDate(k.gueltig_von) : '—'} – {k.gueltig_bis ? formatDate(k.gueltig_bis) : 'offen'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Nachrichten ── */}
          <h2 style={cardTitle}>Nachrichten-Warteschlange</h2>
          <form onSubmit={nachrichtAnlegen} style={formRow}>
            <input style={inputStyle} placeholder="Betreff" value={neueNachricht.betreff}
              onChange={e => setNeueNachricht(s => ({ ...s, betreff: e.target.value }))} />
            <input style={inputStyle} placeholder="Empfängeradresse (optional)" value={neueNachricht.empfaenger_adresse}
              onChange={e => setNeueNachricht(s => ({ ...s, empfaenger_adresse: e.target.value }))} />
            <button type="submit" style={actionBtn}>Entwurf anlegen</button>
          </form>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Betreff</th><th>Empfänger</th><th>Status</th><th>Angelegt</th><th></th></tr>
              </thead>
              <tbody>
                {nachrichten.length === 0 ? (
                  <EmptyRow colSpan={5}>Keine Nachrichten</EmptyRow>
                ) : nachrichten.map(n => (
                  <tr key={n.id}>
                    <td style={{ fontWeight: 600 }}>{n.betreff}</td>
                    <td style={{ fontSize: 13 }}>{n.empfaenger_adresse || '—'}</td>
                    <td>
                      <StatusBadge
                        label={n.status}
                        color={n.status === 'gesperrt' ? '#D04B3B' : n.status === 'wartend' ? '#E8A000' : 'var(--ink4)'}
                      />
                      {n.gesperrt_grund && (
                        <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 2, maxWidth: 320 }}>{n.gesperrt_grund}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink4)' }}>{formatDate(n.created_at)}</td>
                    <td>
                      <button style={actionBtn} onClick={() => versandVersuchen(n.id)}>Versand versuchen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function BlockerKarte({ titel, hinweis, punkte, farbe }: {
  titel: string; hinweis: string; punkte: string[]; farbe: string
}) {
  return (
    <div style={{ background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: farbe, marginBottom: 4 }}>
        {titel} ({punkte.length})
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink4)', marginBottom: 8 }}>{hinweis}</div>
      {punkte.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink4)' }}>—</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink3)' }}>
          {punkte.map(p => <li key={p} style={{ marginBottom: 3 }}>{p}</li>)}
        </ul>
      )}
    </div>
  )
}

const cardTitle: CSSProperties = {
  fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 700,
  color: 'var(--ink)', margin: '20px 0 12px',
}
const inputStyle: CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box', flex: '1 1 180px',
}
const formRow: CSSProperties = {
  display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center',
}
const actionBtn: CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '8px 14px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
