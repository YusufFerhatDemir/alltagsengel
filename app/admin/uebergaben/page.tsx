'use client'
// ═══════════════════════════════════════════════════════════════
// Dienstübergabe — Protokolle, Übergabepunkte, Kenntnisnahmen
// Links die Protokollliste, rechts das gewählte Protokoll mit seinen
// Punkten. Abgeschlossene Protokolle sind unveränderlich; Ergänzungen
// laufen als Nachtrag (das erzwingt zusätzlich die Datenbank).
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, fullName } from '@/lib/admin/ops'
import { StatusBadge, Banner, EmptyRow } from '@/components/admin/OpsUI'
import {
  DRINGLICHKEIT_META,
  DRINGLICHKEIT_WERTE,
  KATEGORIE_LABEL,
  PROTOKOLL_STATUS_META,
  PUNKT_KATEGORIE_WERTE,
  SCHICHT_LABEL,
  SCHICHT_WERTE,
  type Dringlichkeit,
  type ProtokollMitDetails,
  type PunktKategorie,
  type Schicht,
  type UebergabeProtokoll,
} from '@/lib/uebergabe/types'

interface ClientOption { id: string; name: string }

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const ghostBtn: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--ink,#333)',
  background: 'transparent', border: '1px solid rgba(0,0,0,.15)',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
}
const inputStyle: React.CSSProperties = {
  fontSize: 14, padding: '8px 10px', borderRadius: 8,
  border: '1px solid rgba(0,0,0,.15)', fontFamily: 'inherit', width: '100%',
}
const cardStyle: React.CSSProperties = {
  background: 'var(--card,#fff)', borderRadius: 12,
  border: '1px solid rgba(0,0,0,.08)', padding: 16,
}

function heute(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function UebergabenPage() {
  const [protokolle, setProtokolle] = useState<UebergabeProtokoll[]>([])
  const [detail, setDetail] = useState<ProtokollMitDetails | null>(null)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Neues Protokoll
  const [neuDatum, setNeuDatum] = useState(heute())
  const [neuSchicht, setNeuSchicht] = useState<Schicht>('frueh')

  // Neuer Punkt
  const [punktInhalt, setPunktInhalt] = useState('')
  const [punktClient, setPunktClient] = useState('')
  const [punktKategorie, setPunktKategorie] = useState<PunktKategorie>('zustandsaenderung')
  const [punktDringlichkeit, setPunktDringlichkeit] = useState<Dringlichkeit>('normal')
  const [punktHandlungsbedarf, setPunktHandlungsbedarf] = useState(false)

  const [zusammenfassung, setZusammenfassung] = useState('')

  const ladeProtokolle = useCallback(async () => {
    setLoading(true)
    setFehler(null)
    try {
      const res = await fetch('/api/uebergaben?limit=60')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Übergaben konnten nicht geladen werden.')
      setProtokolle(json.protokolle ?? [])
    } catch (err) {
      setFehler((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const ladeDetail = useCallback(async (id: string) => {
    setFehler(null)
    try {
      const res = await fetch(`/api/uebergaben/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Protokoll konnte nicht geladen werden.')
      setDetail(json.protokoll)
      setZusammenfassung(json.protokoll?.zusammenfassung ?? '')
    } catch (err) {
      setFehler((err as Error).message)
    }
  }, [])

  useEffect(() => { ladeProtokolle() }, [ladeProtokolle])

  useEffect(() => {
    // Klientenliste für den Klientenbezug eines Punktes — wie in den übrigen
    // Admin-Seiten direkt über den Browser-Client (RLS-Admin-Policy).
    const supabase = createClient()
    supabase
      .from('clients')
      .select('id, first_name, last_name')
      .order('last_name', { ascending: true })
      .then(({ data }) => {
        setClients((data ?? []).map((c: any) => ({ id: c.id, name: fullName(c) })))
      })
  }, [])

  async function anlegen() {
    setBusy(true)
    setFehler(null)
    setHinweis(null)
    try {
      const res = await fetch('/api/uebergaben', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datum: neuDatum, schicht: neuSchicht }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Protokoll konnte nicht angelegt werden.')
      setHinweis('Übergabeprotokoll angelegt.')
      await ladeProtokolle()
      await ladeDetail(json.protokoll.id)
    } catch (err) {
      setFehler((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function punktHinzufuegen() {
    if (!detail || !punktInhalt.trim()) return
    setBusy(true)
    setFehler(null)
    try {
      const res = await fetch(`/api/uebergaben/${detail.id}/punkte`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inhalt: punktInhalt,
          clientId: punktClient || null,
          kategorie: punktKategorie,
          dringlichkeit: punktDringlichkeit,
          handlungsbedarf: punktHandlungsbedarf,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Punkt konnte nicht gespeichert werden.')
      setPunktInhalt('')
      setPunktHandlungsbedarf(false)
      await ladeDetail(detail.id)
    } catch (err) {
      setFehler((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function erledigtUmschalten(punktId: string, erledigt: boolean) {
    if (!detail) return
    try {
      const res = await fetch(`/api/uebergaben/${detail.id}/punkte/${punktId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ erledigt }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erledigung konnte nicht gespeichert werden.')
      await ladeDetail(detail.id)
    } catch (err) {
      setFehler((err as Error).message)
    }
  }

  async function abschliessen() {
    if (!detail) return
    setBusy(true)
    setFehler(null)
    try {
      const res = await fetch(`/api/uebergaben/${detail.id}/abschliessen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zusammenfassung }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Protokoll konnte nicht abgeschlossen werden.')
      setHinweis('Protokoll abgeschlossen. Es ist ab jetzt unveränderlich.')
      await ladeProtokolle()
      await ladeDetail(detail.id)
    } catch (err) {
      setFehler((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function quittieren() {
    if (!detail) return
    setBusy(true)
    setFehler(null)
    try {
      const res = await fetch(`/api/uebergaben/${detail.id}/kenntnisnahme`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kenntnisnahme konnte nicht gespeichert werden.')
      setHinweis('Kenntnisnahme dokumentiert.')
      await ladeDetail(detail.id)
    } catch (err) {
      setFehler((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const clientName = useMemo(() => {
    const map = new Map(clients.map(c => [c.id, c.name]))
    return (id: string | null) => (id ? map.get(id) ?? 'Klient' : 'Organisatorisch')
  }, [clients])

  const istOffen = detail?.status === 'offen'

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Dienstübergabe</h1>
      <p style={{ color: 'var(--muted,#777)', marginBottom: 20, fontSize: 14 }}>
        Strukturierte Übergabe zwischen den Diensten. Ein abgeschlossenes Protokoll ist
        unveränderlich — spätere Informationen werden als Nachtrag erfasst. Die Kenntnisnahme
        des übernehmenden Dienstes ist der Nachweis der Informationsweitergabe.
      </p>

      {fehler && <div style={{ marginBottom: 16 }}><Banner tone="danger">{fehler}</Banner></div>}
      {hinweis && <div style={{ marginBottom: 16 }}><Banner tone="success">{hinweis}</Banner></div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 20, alignItems: 'start' }}>
        {/* ── Liste + Anlage ───────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={cardStyle}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Neues Protokoll</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Datum
                <input type="date" value={neuDatum} onChange={e => setNeuDatum(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Schicht
                <select value={neuSchicht} onChange={e => setNeuSchicht(e.target.value as Schicht)} style={{ ...inputStyle, marginTop: 4 }}>
                  {SCHICHT_WERTE.map(s => <option key={s} value={s}>{SCHICHT_LABEL[s]}</option>)}
                </select>
              </label>
              <button onClick={anlegen} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
                Protokoll anlegen
              </button>
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Protokolle</h2>
            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--muted,#777)' }}>Wird geladen …</p>
            ) : protokolle.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted,#777)' }}>Noch keine Übergabeprotokolle erfasst.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflowY: 'auto' }}>
                {protokolle.map(p => (
                  <button
                    key={p.id}
                    onClick={() => ladeDetail(p.id)}
                    style={{
                      textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      border: detail?.id === p.id ? '1px solid var(--gold,#C9963C)' : '1px solid rgba(0,0,0,.08)',
                      background: detail?.id === p.id ? 'rgba(201,150,60,.08)' : 'transparent',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{formatDate(p.datum)}</span>
                      <StatusBadge label={PROTOKOLL_STATUS_META[p.status].label} color={PROTOKOLL_STATUS_META[p.status].color} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted,#777)', marginTop: 2 }}>
                      {SCHICHT_LABEL[p.schicht]} · {p.uebergeber_name}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Detail ───────────────────────────────────────── */}
        <div style={cardStyle}>
          {!detail ? (
            <p style={{ fontSize: 14, color: 'var(--muted,#777)' }}>
              Protokoll links auswählen oder ein neues anlegen.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700 }}>
                    {SCHICHT_LABEL[detail.schicht]} · {formatDate(detail.datum)}
                  </h2>
                  <p style={{ fontSize: 13, color: 'var(--muted,#777)', marginTop: 2 }}>
                    Übergeben von {detail.uebergeber_name}
                    {detail.abgeschlossen_am && ` · abgeschlossen am ${formatDate(detail.abgeschlossen_am)}`}
                  </p>
                </div>
                <StatusBadge label={PROTOKOLL_STATUS_META[detail.status].label} color={PROTOKOLL_STATUS_META[detail.status].color} />
              </div>

              {!istOffen && (
                <div style={{ marginBottom: 16 }}>
                  <Banner tone="info">
                    Dieses Protokoll ist abgeschlossen. Neue Punkte werden als Nachtrag gekennzeichnet,
                    bestehende Inhalte lassen sich nicht mehr ändern.
                  </Banner>
                </div>
              )}

              {/* Punkte */}
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
                Übergabepunkte ({detail.punkte?.length ?? 0})
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted,#777)' }}>
                    <th style={{ padding: '6px 4px' }}>Betrifft</th>
                    <th style={{ padding: '6px 4px' }}>Kategorie</th>
                    <th style={{ padding: '6px 4px' }}>Inhalt</th>
                    <th style={{ padding: '6px 4px' }}>Dringlichkeit</th>
                    <th style={{ padding: '6px 4px' }}>Erledigt</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.punkte ?? []).length === 0 ? (
                    <EmptyRow colSpan={5}>Noch keine Punkte erfasst.</EmptyRow>
                  ) : (
                    detail.punkte.map(pt => (
                      <tr key={pt.id} style={{ borderTop: '1px solid rgba(0,0,0,.06)' }}>
                        <td style={{ padding: '8px 4px' }}>{clientName(pt.client_id)}</td>
                        <td style={{ padding: '8px 4px' }}>
                          {KATEGORIE_LABEL[pt.kategorie]}
                          {pt.nachtrag && <span style={{ marginLeft: 6, fontSize: 11, color: '#D99A2B', fontWeight: 700 }}>NACHTRAG</span>}
                        </td>
                        <td style={{ padding: '8px 4px', maxWidth: 420 }}>
                          {pt.inhalt}
                          <div style={{ fontSize: 11, color: 'var(--muted,#777)', marginTop: 2 }}>
                            {pt.erstellt_von_name}
                            {pt.handlungsbedarf && ' · Handlungsbedarf'}
                          </div>
                        </td>
                        <td style={{ padding: '8px 4px' }}>
                          <StatusBadge
                            label={DRINGLICHKEIT_META[pt.dringlichkeit].label}
                            color={DRINGLICHKEIT_META[pt.dringlichkeit].color}
                          />
                        </td>
                        <td style={{ padding: '8px 4px' }}>
                          {pt.handlungsbedarf ? (
                            <input
                              type="checkbox"
                              checked={pt.erledigt}
                              onChange={e => erledigtUmschalten(pt.id, e.target.checked)}
                            />
                          ) : (
                            <span style={{ color: 'var(--muted,#999)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Punkt erfassen */}
              <div style={{ border: '1px solid rgba(0,0,0,.08)', borderRadius: 10, padding: 14, marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                  {istOffen ? 'Punkt hinzufügen' : 'Nachtrag hinzufügen'}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>
                    Klient (optional)
                    <select value={punktClient} onChange={e => setPunktClient(e.target.value)} style={{ ...inputStyle, marginTop: 4 }}>
                      <option value="">Ohne Klientenbezug</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>
                    Kategorie
                    <select value={punktKategorie} onChange={e => setPunktKategorie(e.target.value as PunktKategorie)} style={{ ...inputStyle, marginTop: 4 }}>
                      {PUNKT_KATEGORIE_WERTE.map(k => <option key={k} value={k}>{KATEGORIE_LABEL[k]}</option>)}
                    </select>
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>
                    Dringlichkeit
                    <select value={punktDringlichkeit} onChange={e => setPunktDringlichkeit(e.target.value as Dringlichkeit)} style={{ ...inputStyle, marginTop: 4 }}>
                      {DRINGLICHKEIT_WERTE.map(d => <option key={d} value={d}>{DRINGLICHKEIT_META[d].label}</option>)}
                    </select>
                  </label>
                </div>
                <textarea
                  value={punktInhalt}
                  onChange={e => setPunktInhalt(e.target.value)}
                  placeholder="Was muss der nächste Dienst wissen?"
                  rows={3}
                  style={{ ...inputStyle, marginBottom: 10, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={punktHandlungsbedarf} onChange={e => setPunktHandlungsbedarf(e.target.checked)} />
                    Handlungsbedarf für den Folgedienst
                  </label>
                  <button onClick={punktHinzufuegen} disabled={busy || !punktInhalt.trim()} style={{ ...primaryBtn, opacity: busy || !punktInhalt.trim() ? 0.6 : 1 }}>
                    Punkt speichern
                  </button>
                </div>
              </div>

              {/* Zusammenfassung + Abschluss */}
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Zusammenfassung</h3>
              <textarea
                value={zusammenfassung}
                onChange={e => setZusammenfassung(e.target.value)}
                disabled={!istOffen}
                rows={3}
                placeholder="Zusammenfassende Bemerkung zur Schicht"
                style={{ ...inputStyle, marginBottom: 12, resize: 'vertical', opacity: istOffen ? 1 : 0.7 }}
              />
              {istOffen && (
                <button onClick={abschliessen} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
                  Übergabe abschließen
                </button>
              )}

              {/* Kenntnisnahmen */}
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: '24px 0 8px' }}>
                Kenntnisnahmen ({detail.kenntnisnahmen?.length ?? 0})
              </h3>
              {(detail.kenntnisnahmen ?? []).length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--muted,#777)', marginBottom: 12 }}>
                  Noch niemand hat diese Übergabe zur Kenntnis genommen.
                </p>
              ) : (
                <ul style={{ fontSize: 13, marginBottom: 12, paddingLeft: 18 }}>
                  {detail.kenntnisnahmen.map(k => (
                    <li key={k.id} style={{ marginBottom: 4 }}>
                      {k.name} ({k.rolle}) — {formatDate(k.zeitpunkt)}
                    </li>
                  ))}
                </ul>
              )}
              {!istOffen && (
                <button onClick={quittieren} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>
                  Kenntnisnahme bestätigen
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
