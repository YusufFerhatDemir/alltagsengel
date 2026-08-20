'use client'
// ═══════════════════════════════════════════════════════════════
// Engel: Medikamentengabe dokumentieren (mobil-optimiert)
// Medikamentenliste wird direkt über den user-scoped Supabase-Client
// gelesen (RLS: engel_medikamente_select über eigene_caregiver_ids()).
// Die Verabreichung wird über /api/medikamente/eingaben dokumentiert;
// dort greift requireMedUser() + engel_med_eingaben_insert (RLS).
// ═══════════════════════════════════════════════════════════════
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import { IconPill, IconClock, IconCheck } from '@/components/Icons'
import { KATEGORIEN } from '@/lib/medikamente/types'
import type { Medikament, MedikamentEingabe, Einnahmezeit } from '@/lib/medikamente/types'

const EINNAHME_ZEIT_LABEL: Record<Einnahmezeit, string> = {
  morgens: 'Morgens', mittags: 'Mittags', abends: 'Abends', nachts: 'Nachts',
}

const EINGABE_STATUS_META: Record<string, { label: string; color: string }> = {
  geplant: { label: 'Geplant', color: '#2196F3' },
  gegeben: { label: 'Gegeben', color: '#5CB882' },
  verweigert: { label: 'Verweigert', color: '#D04B3B' },
  ausgelassen: { label: 'Ausgelassen', color: '#9E9E9E' },
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

function nowLocalInputValue(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function zeitFuerUhrzeit(): Einnahmezeit {
  const h = new Date().getHours()
  if (h < 11) return 'morgens'
  if (h < 15) return 'mittags'
  if (h < 21) return 'abends'
  return 'nachts'
}

export default function EngelMedikamentePage() {
  return (
    <Suspense fallback={<div className="screen"><div className="chat-empty">Laden...</div></div>}>
      <MedikamentePage />
    </Suspense>
  )
}

function MedikamentePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [kunden, setKunden] = useState<Array<{ id: string; name: string }>>([])
  const [clientId, setClientId] = useState(searchParams.get('clientId') ?? '')
  const [loadingKunden, setLoadingKunden] = useState(true)
  const [loadingMed, setLoadingMed] = useState(false)
  const [medikamente, setMedikamente] = useState<Medikament[]>([])
  const [eingaben, setEingaben] = useState<MedikamentEingabe[]>([])
  const [error, setError] = useState('')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [einnahmeZeit, setEinnahmeZeit] = useState<Einnahmezeit>('morgens')
  const [geplantUm, setGeplantUm] = useState(nowLocalInputValue())
  const [status, setStatus] = useState<'gegeben' | 'verweigert' | 'ausgelassen'>('gegeben')
  const [verweigertGrund, setVerweigertGrund] = useState('')
  const [notizen, setNotizen] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [erfolgId, setErfolgId] = useState<string | null>(null)

  // ── Zugewiesene Kunden laden ──
  useEffect(() => {
    async function load() {
      const user = await requireUser(router, { redirectTo: '/engel/medikamente' })
      if (!user) return
      try {
        const supabase = createClient()
        const { data: cg } = await supabase.from('caregivers').select('id').eq('user_id', user.id).single()
        if (!cg) { setLoadingKunden(false); return }

        const { data: zuordnungen } = await supabase
          .from('assignments')
          .select('client_id, client:clients(first_name, last_name)')
          .eq('caregiver_id', cg.id)

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
     
  }, [])

  // ── Medikamente + Verlauf für ausgewählten Kunden laden ──
  const ladeDaten = useCallback(async (id: string) => {
    if (!id) return
    setLoadingMed(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: medData, error: medErr } = await supabase
        .from('medikamente')
        .select('*')
        .eq('client_id', id)
        .eq('status', 'aktiv')
        .order('medikament_name')
      if (medErr) throw medErr
      setMedikamente((medData || []) as Medikament[])

      const res = await fetch(`/api/medikamente/eingaben?client_id=${encodeURIComponent(id)}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Verlauf konnte nicht geladen werden.')
      setEingaben((body || []) as MedikamentEingabe[])
    } catch (err: any) {
      setError(err?.message || 'Medikamente konnten nicht geladen werden.')
    } finally {
      setLoadingMed(false)
    }
  }, [])

  useEffect(() => {
    if (clientId) ladeDaten(clientId)
  }, [clientId, ladeDaten])

  function oeffneFormular(medikamentId: string) {
    setExpandedId(expandedId === medikamentId ? null : medikamentId)
    setEinnahmeZeit(zeitFuerUhrzeit())
    setGeplantUm(nowLocalInputValue())
    setStatus('gegeben')
    setVerweigertGrund('')
    setNotizen('')
    setFormError('')
  }

  async function absenden(medikamentId: string) {
    if (!clientId) { setFormError('Bitte zuerst einen Kunden auswählen.'); return }
    if (status === 'verweigert' && !verweigertGrund.trim()) {
      setFormError('Bitte einen Grund für die Verweigerung angeben.')
      return
    }
    setBusy(true)
    setFormError('')
    try {
      const geplantIso = new Date(geplantUm).toISOString()
      const res = await fetch('/api/medikamente/eingaben', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medikament_id: medikamentId,
          client_id: clientId,
          einnahme_zeit: einnahmeZeit,
          geplant_um: geplantIso,
          status,
          verweigert_grund: status === 'verweigert' ? verweigertGrund.trim() : undefined,
          notizen: notizen.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setFormError(body.error || 'Speichern fehlgeschlagen.'); return }
      setErfolgId(medikamentId)
      setExpandedId(null)
      await ladeDaten(clientId)
      setTimeout(() => setErfolgId(null), 3000)
    } catch {
      setFormError('Speichern fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setBusy(false)
    }
  }

  const ausgewaehlterKunde = kunden.find(k => k.id === clientId)

  return (
    <div className="screen" id="engel-medikamente">
      <div className="topbar" style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/engel/profil" className="back-btn" style={{ textDecoration: 'none' }}>‹</Link>
        <div className="topbar-title">Medikamentengabe</div>
      </div>

      <div style={{ padding: '0 20px 30px' }}>
        {error && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.3)', color: 'var(--red-w,#dc2626)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {loadingKunden ? (
          <div className="chat-empty">Laden...</div>
        ) : kunden.length === 0 ? (
          <div className="chat-empty" style={{ paddingTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}><IconPill size={36} /></div>
            <div className="chat-empty-title">Keine Kunden zugeordnet</div>
            <div className="chat-empty-sub">Sobald dir ein Kunde zugeordnet ist, kannst du hier die Medikamentengabe dokumentieren.</div>
          </div>
        ) : (
          <>
            <MobilFeld label="Kunde">
              <select value={clientId} onChange={e => setClientId(e.target.value)} style={mobilInput}>
                {kunden.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </MobilFeld>

            <div style={{ marginTop: 20, fontSize: 12, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 8 }}>
              Medikamente{ausgewaehlterKunde ? ` von ${ausgewaehlterKunde.name}` : ''}
            </div>

            {loadingMed ? (
              <div className="chat-empty">Laden...</div>
            ) : medikamente.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--ink4)', padding: '8px 2px' }}>
                Keine aktiven Medikamente für diesen Kunden hinterlegt.
              </div>
            ) : (
              medikamente.map(m => (
                <div key={m.id} style={{
                  background: 'var(--white)', borderRadius: 16, marginBottom: 12,
                  border: '1px solid var(--border)', padding: 16,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{m.medikament_name}</div>
                      <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 3 }}>{m.dosierung} {m.einheit}</div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: '#C9963C', background: 'rgba(201,150,60,.12)',
                      padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap',
                    }}>
                      {KATEGORIEN[m.kategorie] || m.kategorie}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    {(['morgens', 'mittags', 'abends', 'nachts'] as Einnahmezeit[])
                      .filter(z => m[`einnahme_${z}` as keyof Medikament])
                      .map(z => (
                        <span key={z} style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', background: 'var(--cream,#F7F2EA)', padding: '3px 9px', borderRadius: 999 }}>
                          {EINNAHME_ZEIT_LABEL[z]}
                        </span>
                      ))}
                  </div>

                  {m.einnahme_hinweis && (
                    <p style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 8, marginBottom: 0 }}>{m.einnahme_hinweis}</p>
                  )}

                  {erfolgId === m.id && (
                    <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, background: 'rgba(92,184,130,.10)', border: '1px solid rgba(92,184,130,.35)', color: '#3E8E5F', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <IconCheck size={13} /> Verabreichung dokumentiert
                    </div>
                  )}

                  {expandedId !== m.id ? (
                    <button
                      onClick={() => oeffneFormular(m.id)}
                      style={{
                        marginTop: 12, width: '100%', padding: '11px 14px', borderRadius: 12, border: 'none',
                        background: 'linear-gradient(135deg,var(--gold2),var(--gold))', color: 'var(--coal)',
                        fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
                      }}
                    >
                      Verabreichung dokumentieren
                    </button>
                  ) : (
                    <div style={{ marginTop: 14, display: 'grid', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                      {formError && (
                        <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.3)', color: 'var(--red-w,#dc2626)', fontSize: 12 }}>
                          {formError}
                        </div>
                      )}

                      <MobilFeld label="Einnahmezeit">
                        <select value={einnahmeZeit} onChange={e => setEinnahmeZeit(e.target.value as Einnahmezeit)} style={mobilInput}>
                          {(['morgens', 'mittags', 'abends', 'nachts'] as Einnahmezeit[]).map(z => (
                            <option key={z} value={z}>{EINNAHME_ZEIT_LABEL[z]}</option>
                          ))}
                        </select>
                      </MobilFeld>

                      <MobilFeld label="Zeitpunkt">
                        <input type="datetime-local" value={geplantUm} onChange={e => setGeplantUm(e.target.value)} style={mobilInput} />
                      </MobilFeld>

                      <MobilFeld label="Status">
                        <select value={status} onChange={e => setStatus(e.target.value as typeof status)} style={mobilInput}>
                          <option value="gegeben">Gegeben</option>
                          <option value="verweigert">Verweigert</option>
                          <option value="ausgelassen">Ausgelassen</option>
                        </select>
                      </MobilFeld>

                      {status === 'verweigert' && (
                        <MobilFeld label="Grund der Verweigerung">
                          <input value={verweigertGrund} onChange={e => setVerweigertGrund(e.target.value)} style={mobilInput} placeholder="z. B. Kunde wollte nicht" />
                        </MobilFeld>
                      )}

                      <MobilFeld label="Bemerkung (optional)">
                        <textarea
                          value={notizen}
                          onChange={e => setNotizen(e.target.value)}
                          rows={3}
                          style={{ ...mobilInput, resize: 'vertical' }}
                          placeholder="Besonderheiten bei der Gabe…"
                        />
                      </MobilFeld>

                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          onClick={() => setExpandedId(null)}
                          disabled={busy}
                          style={{
                            flex: 1, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)',
                            background: 'var(--white)', color: 'var(--ink2)', fontWeight: 600, fontSize: 14,
                            fontFamily: 'inherit', cursor: 'pointer',
                          }}
                        >
                          Abbrechen
                        </button>
                        <button
                          onClick={() => absenden(m.id)}
                          disabled={busy}
                          style={{
                            flex: 2, padding: '12px 14px', borderRadius: 12, border: 'none',
                            background: 'linear-gradient(135deg,var(--gold2),var(--gold))', color: 'var(--coal)',
                            fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
                            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                          }}
                        >
                          {busy ? 'Speichern…' : 'Speichern'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            <div style={{ marginTop: 24, fontSize: 12, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 8 }}>
              Verlauf der letzten Eingaben
            </div>

            {loadingMed ? null : eingaben.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--ink4)', padding: '8px 2px' }}>
                Noch keine Eingaben dokumentiert.
              </div>
            ) : (
              eingaben.slice(0, 20).map(e => {
                const med = medikamente.find(m => m.id === e.medikament_id)
                const meta = EINGABE_STATUS_META[e.status] || { label: e.status, color: '#999' }
                return (
                  <div key={e.id} style={{
                    background: 'var(--white)', borderRadius: 14, marginBottom: 10,
                    border: '1px solid var(--border)', padding: 12,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{med?.medikament_name || 'Medikament'}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <IconClock size={11} /> {formatDateTime(e.geplant_um)} · {EINNAHME_ZEIT_LABEL[e.einnahme_zeit]}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: meta.color, background: `${meta.color}18`,
                        padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
                      }}>
                        {meta.label}
                      </span>
                    </div>
                    {e.verweigert_grund && (
                      <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 6 }}>Grund: {e.verweigert_grund}</div>
                    )}
                    {e.notizen && (
                      <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 6 }}>{e.notizen}</div>
                    )}
                  </div>
                )
              })
            )}
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
