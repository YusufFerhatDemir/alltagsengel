'use client'
// ═══════════════════════════════════════════════════════════════
// Engel: Vitalwerte erfassen (mobil-optimiert)
// Kunde + Verlauf werden direkt über den user-scoped Supabase-Client
// gelesen (RLS: engel_vital_signs_select über eigene_caregiver_ids()).
// Die Messung wird über POST /api/vitals gespeichert; dort greift
// requirePflegeUser() + engel_vital_signs_insert (RLS). GET /api/vitals
// ist admin-only — der Verlauf kommt deshalb aus der direkten Abfrage,
// nicht aus der API-Route.
//
// MDR-Kill-Switch (lib/vitals/config.ts): Die automatische Grenzwert-
// Bewertung ist regulatorisch noch nicht freigegeben und standardmäßig
// AUS. Die Messung wird trotzdem immer gespeichert — die API liefert
// dann bewertung: null, alarmeAktiv: false. Das UI darf sich darauf
// nicht verlassen und muss beide Fälle sauber anzeigen.
// ═══════════════════════════════════════════════════════════════
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import { IconHeart } from '@/components/Icons'
import {
  VITAL_TYPEN, VITAL_TYP_WERTE,
  type AlarmBewertung, type VitalSign, type VitalTyp,
} from '@/lib/vitals/types'
import { validierePlausibilitaet } from '@/lib/vitals/vitals'

const STUFEN_META: Record<AlarmBewertung['stufe'], { label: string; color: string; bg: string; border: string }> = {
  ok: { label: 'Im Normbereich', color: '#3E8E5F', bg: 'rgba(92,184,130,.10)', border: 'rgba(92,184,130,.35)' },
  warnung: { label: 'Warnung', color: '#A6740A', bg: 'rgba(232,160,0,.12)', border: 'rgba(232,160,0,.4)' },
  kritisch: { label: 'KRITISCH', color: '#B23A2C', bg: 'rgba(208,75,59,.12)', border: 'rgba(208,75,59,.4)' },
}

function formatDateTime(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatWert(m: Pick<VitalSign, 'type' | 'value' | 'value_secondary'>): string {
  const cfg = VITAL_TYPEN[m.type]
  const wert = Number(m.value).toFixed(cfg.dezimalstellen)
  const sekundaer = m.value_secondary != null ? `/${Number(m.value_secondary).toFixed(cfg.dezimalstellen)}` : ''
  return `${wert}${sekundaer} ${cfg.einheit}`
}

export default function EngelVitalwertePage() {
  return (
    <Suspense fallback={<div className="screen"><div className="chat-empty">Laden...</div></div>}>
      <VitalwerteFormular />
    </Suspense>
  )
}

function VitalwerteFormular() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [kunden, setKunden] = useState<Array<{ id: string; name: string }>>([])
  const [clientId, setClientId] = useState(searchParams.get('clientId') ?? '')
  const [loadingKunden, setLoadingKunden] = useState(true)
  const [loadingVerlauf, setLoadingVerlauf] = useState(false)
  const [messungen, setMessungen] = useState<VitalSign[]>([])
  const [verlaufError, setVerlaufError] = useState('')

  const [typ, setTyp] = useState<VitalTyp>('blutdruck')
  const [wert, setWert] = useState('')
  const [wertSekundaer, setWertSekundaer] = useState('')
  const [gemessenAm, setGemessenAm] = useState('')
  const [notizen, setNotizen] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hinweis, setHinweis] = useState<{ stufe: AlarmBewertung['stufe'] | 'neutral'; text: string; details?: string[] } | null>(null)

  const cfg = VITAL_TYPEN[typ]

  // ── Zugewiesene Kunden laden ──
  useEffect(() => {
    async function load() {
      const user = await requireUser(router, { redirectTo: '/engel/vitalwerte' })
      if (!user) return
      try {
        const supabase = createClient()
        // WICHTIG: NIE direkt gegen caregivers selektieren — dafür gibt es
        // für Engel keine Self-Select-Policy (nur admin_all). eigene_caregiver_ids()
        // ist eine SECURITY DEFINER RPC und liefert die eigene(n) caregiver_id(s).
        const { data: cgIds, error: cgErr } = await supabase.rpc('eigene_caregiver_ids')
        if (cgErr) throw cgErr
        const caregiverIds: string[] = cgIds || []
        if (caregiverIds.length === 0) { setLoadingKunden(false); return }

        const { data: zuordnungen, error: zErr } = await supabase
          .from('assignments')
          .select('client_id, client:clients(first_name, last_name)')
          .in('caregiver_id', caregiverIds)
        if (zErr) throw zErr

        const map = new Map<string, string>()
        for (const z of (zuordnungen || []) as any[]) {
          if (!z.client_id || map.has(z.client_id)) continue
          const c = z.client
          map.set(z.client_id, c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : 'Kunde')
        }
        const liste = [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'de'))
        setKunden(liste)
        if (!clientId && liste.length > 0) setClientId(liste[0].id)
      } catch (err: any) {
        setError(err?.message || 'Kunden konnten nicht geladen werden.')
      } finally {
        setLoadingKunden(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Verlauf des ausgewählten Kunden laden ──
  const ladeVerlauf = useCallback(async (id: string) => {
    if (!id) return
    setLoadingVerlauf(true)
    setVerlaufError('')
    try {
      const supabase = createClient()
      const { data, error: vErr } = await supabase
        .from('vital_signs')
        .select('*')
        .eq('client_id', id)
        .order('measured_at', { ascending: false })
        .limit(30)
      if (vErr) throw vErr
      setMessungen((data || []) as VitalSign[])
    } catch (err: any) {
      const code = err?.code
      setVerlaufError(
        code === 'PGRST205'
          ? 'Der Vitalwerte-Verlauf ist noch nicht freigeschaltet.'
          : 'Verlauf konnte nicht geladen werden.'
      )
    } finally {
      setLoadingVerlauf(false)
    }
  }, [])

  useEffect(() => {
    if (clientId) ladeVerlauf(clientId)
  }, [clientId, ladeVerlauf])

  function feldZuruecksetzen() {
    setWert('')
    setWertSekundaer('')
    setGemessenAm('')
    setNotizen('')
  }

  async function absenden() {
    if (!clientId) { setError('Bitte zuerst einen Kunden auswählen.'); return }
    if (!wert.trim()) { setError(`Bitte einen Wert für ${cfg.labelWert} angeben.`); return }
    if (cfg.hatSekundaer && !wertSekundaer.trim()) { setError(`Bitte ${cfg.labelSekundaer} angeben.`); return }

    // Client-seitige Plausibilitätsprüfung — dieselbe Logik wie im Backend,
    // damit Tippfehler ohne Netzwerk-Roundtrip verständlich zurückgemeldet werden.
    try {
      validierePlausibilitaet(typ, Number(wert), cfg.hatSekundaer ? Number(wertSekundaer) : undefined)
    } catch (err) {
      setError((err as Error).message)
      return
    }

    setBusy(true)
    setError('')
    setHinweis(null)
    try {
      const res = await fetch('/api/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId, typ, wert,
          wertSekundaer: cfg.hatSekundaer ? wertSekundaer : undefined,
          gemessenAm: gemessenAm ? new Date(gemessenAm).toISOString() : undefined,
          notizen: notizen.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        // Backend liefert bereits eine verständliche deutsche Meldung
        // (u. a. aus validierePlausibilitaet) — kein rohes Fehlerobjekt anzeigen.
        setError(typeof body?.error === 'string' ? body.error : 'Speichern fehlgeschlagen.')
        return
      }

      setMessungen(ms => [body.messung as VitalSign, ...ms])
      feldZuruecksetzen()

      // Alarm-Rückmeldung nur bei freigeschalteter Alarmfunktion (MDR-Kill-Switch).
      // Ohne Freigabe kommt bewertung: null — dann neutral quittieren, nicht so tun
      // als sei geprüft worden.
      if (body.alarmeAktiv && body.bewertung) {
        const bewertung = body.bewertung as AlarmBewertung
        setHinweis({
          stufe: bewertung.stufe,
          text: bewertung.stufe === 'kritisch'
            ? 'Kritischer Wert!'
            : bewertung.stufe === 'warnung'
              ? 'Wert außerhalb der Warngrenze.'
              : 'Messung gespeichert — Wert im Normbereich.',
          details: bewertung.meldungen,
        })
      } else {
        setHinweis({ stufe: 'neutral', text: 'Messung gespeichert.' })
      }
    } catch {
      setError('Speichern fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setBusy(false)
    }
  }

  const ausgewaehlterKunde = kunden.find(k => k.id === clientId)
  const stufeMeta = hinweis && hinweis.stufe !== 'neutral' ? STUFEN_META[hinweis.stufe as AlarmBewertung['stufe']] : null

  return (
    <div className="screen" id="engel-vitalwerte">
      <div className="topbar" style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/engel/profil" className="back-btn" style={{ textDecoration: 'none' }}>‹</Link>
        <div className="topbar-title">Vitalwerte</div>
      </div>

      <div style={{ padding: '0 20px 30px' }}>
        {error && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.3)', color: 'var(--red-w,#dc2626)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {hinweis && (
          <div style={{
            marginBottom: 14, padding: '10px 14px', borderRadius: 10,
            background: stufeMeta ? stufeMeta.bg : 'rgba(92,184,130,.10)',
            border: `1px solid ${stufeMeta ? stufeMeta.border : 'rgba(92,184,130,.35)'}`,
            color: stufeMeta ? stufeMeta.color : '#3E8E5F', fontSize: 13,
          }}>
            <div style={{ fontWeight: 700 }}>{hinweis.text}</div>
            {hinweis.details && hinweis.details.length > 0 && (
              <div style={{ marginTop: 4 }}>{hinweis.details.join(' · ')}</div>
            )}
          </div>
        )}

        {loadingKunden ? (
          <div className="chat-empty">Laden...</div>
        ) : kunden.length === 0 ? (
          <div className="chat-empty" style={{ paddingTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}><IconHeart size={36} /></div>
            <div className="chat-empty-title">Keine Kunden zugeordnet</div>
            <div className="chat-empty-sub">Sobald dir ein Kunde zugeordnet ist, kannst du hier Vitalwerte erfassen.</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 14 }}>
              <MobilFeld label="Kunde">
                <select value={clientId} onChange={e => setClientId(e.target.value)} style={mobilInput}>
                  {kunden.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </MobilFeld>

              <MobilFeld label="Vitalwert">
                <select value={typ} onChange={e => { setTyp(e.target.value as VitalTyp); setWertSekundaer('') }} style={mobilInput}>
                  {VITAL_TYP_WERTE.map(t => <option key={t} value={t}>{VITAL_TYPEN[t].label}</option>)}
                </select>
              </MobilFeld>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <MobilFeld label={`${cfg.labelWert} (${cfg.einheit}) *`}>
                    <input
                      type="number" inputMode="decimal"
                      value={wert} onChange={e => setWert(e.target.value)}
                      step={cfg.dezimalstellen > 0 ? Math.pow(10, -cfg.dezimalstellen) : 1}
                      style={mobilInput}
                      placeholder={cfg.labelWert}
                    />
                  </MobilFeld>
                </div>
                {cfg.hatSekundaer && (
                  <div style={{ flex: 1 }}>
                    <MobilFeld label={`${cfg.labelSekundaer} (${cfg.einheit}) *`}>
                      <input
                        type="number" inputMode="decimal"
                        value={wertSekundaer} onChange={e => setWertSekundaer(e.target.value)}
                        step={cfg.dezimalstellen > 0 ? Math.pow(10, -cfg.dezimalstellen) : 1}
                        style={mobilInput}
                        placeholder={cfg.labelSekundaer}
                      />
                    </MobilFeld>
                  </div>
                )}
              </div>

              <MobilFeld label="Zeitpunkt (leer = jetzt)">
                <input type="datetime-local" value={gemessenAm} onChange={e => setGemessenAm(e.target.value)} style={mobilInput} />
              </MobilFeld>

              <MobilFeld label="Notizen (optional)">
                <textarea
                  value={notizen}
                  onChange={e => setNotizen(e.target.value)}
                  rows={2}
                  style={{ ...mobilInput, resize: 'vertical' }}
                  placeholder="Besonderheiten bei der Messung…"
                />
              </MobilFeld>

              <button
                onClick={absenden}
                disabled={busy || !wert.trim() || (cfg.hatSekundaer && !wertSekundaer.trim())}
                style={{
                  padding: '14px 16px', borderRadius: 14, border: 'none',
                  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', color: 'var(--coal)',
                  fontWeight: 700, fontSize: 15, fontFamily: 'inherit',
                  cursor: busy ? 'default' : 'pointer', opacity: busy || !wert.trim() ? 0.6 : 1,
                }}
              >
                {busy ? 'Speichern…' : 'Messung speichern'}
              </button>
            </div>

            <div style={{ marginTop: 24, fontSize: 12, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 8 }}>
              Verlauf{ausgewaehlterKunde ? ` von ${ausgewaehlterKunde.name}` : ''}
            </div>

            {verlaufError && (
              <div style={{ fontSize: 13, color: 'var(--ink4)', padding: '8px 2px' }}>{verlaufError}</div>
            )}

            {loadingVerlauf ? (
              <div className="chat-empty">Laden...</div>
            ) : messungen.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--ink4)', padding: '8px 2px' }}>
                Noch keine Messungen für diesen Kunden erfasst.
              </div>
            ) : (
              messungen.map(m => (
                <div key={m.id} style={{
                  background: 'var(--white)', borderRadius: 14, marginBottom: 10,
                  border: '1px solid var(--border)', padding: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{formatWert(m)}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 2 }}>
                        {formatDateTime(m.measured_at)} · {m.measured_by_name ?? 'unbekannt'}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: '#C9963C', background: 'rgba(201,150,60,.12)',
                      padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
                    }}>
                      {VITAL_TYPEN[m.type].label}
                    </span>
                  </div>
                  {m.notes && (
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 6 }}>{m.notes}</div>
                  )}
                </div>
              ))
            )}

            <p style={{ fontSize: 11, color: 'var(--ink5,var(--ink4))', margin: '10px 0 0' }}>
              Der Verlauf zeigt reine Messwerte zur Dokumentation. Eine automatische Grenzwert-Bewertung
              erfolgt nur direkt nach dem Speichern und nur, wenn die Alarmfunktion freigeschaltet ist.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function MobilFeld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink4)' }}>{label}</span>
      {children}
    </label>
  )
}

const mobilInput: React.CSSProperties = {
  fontSize: 15, padding: '12px 14px', borderRadius: 12,
  border: '1px solid var(--border)', background: 'var(--white)',
  color: 'var(--ink)', fontFamily: 'inherit', width: '100%',
}
