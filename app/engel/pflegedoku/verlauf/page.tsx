'use client'
// ═══════════════════════════════════════════════════════════════
// Engel: Verlaufseintrag erfassen (mobil-optimiert)
// Der POST läuft über /api/pflege/verlauf; dort schreibt der
// user-scoped Client, sodass RLS die Zuordnung prüft.
// ═══════════════════════════════════════════════════════════════
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import { PFLEGE_VERLAUF_KATEGORIE, PFLEGE_VERLAUF_TYP } from '@/lib/admin/ops'
import { one } from '@/lib/supabase/join'

export default function EngelVerlaufPage() {
  return (
    <Suspense fallback={<div className="screen"><div className="chat-empty">Laden...</div></div>}>
      <VerlaufFormular />
    </Suspense>
  )
}

function VerlaufFormular() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [kunden, setKunden] = useState<Array<{ id: string; name: string }>>([])
  const [clientId, setClientId] = useState(searchParams.get('clientId') ?? '')
  const [eintragTyp, setEintragTyp] = useState('verlauf')
  const [kategorie, setKategorie] = useState('allgemein')
  const [titel, setTitel] = useState('')
  const [inhalt, setInhalt] = useState('')
  const [istDringend, setIstDringend] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [erfolg, setErfolg] = useState(false)

  useEffect(() => {
    async function load() {
      const user = await requireUser(router, { redirectTo: '/engel/pflegedoku/verlauf' })
      if (!user) return
      try {
        const supabase = createClient()
        const { data: cg } = await supabase.from('caregivers').select('id').eq('user_id', user.id).single()
        if (!cg) { setLoading(false); return }

        const { data: zuordnungen } = await supabase
          .from('assignments')
          .select('client_id, client:clients(first_name, last_name)')
          .eq('caregiver_id', cg.id)

        const map = new Map<string, string>()
        for (const z of (zuordnungen || [])) {
          if (!z.client_id || map.has(z.client_id)) continue
          const c = one(z.client)
          map.set(z.client_id, c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : 'Kunde')
        }
        const liste = [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'de'))
        setKunden(liste)
        if (!clientId && liste.length > 0) setClientId(liste[0].id)
      } catch (err: any) {
        setError(err?.message || 'Kunden konnten nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    }
    load()
     
  }, [])

  async function absenden() {
    if (!clientId || !inhalt.trim()) { setError('Bitte Kunde und Inhalt angeben.'); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/pflege/verlauf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, eintragTyp, kategorie, titel: titel || null, inhalt, istDringend, sichtbarkeit: 'engel' }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Speichern fehlgeschlagen.'); return }
      setErfolg(true)
      setTitel(''); setInhalt(''); setIstDringend(false)
    } catch {
      setError('Speichern fehlgeschlagen.')
    } finally { setBusy(false) }
  }

  return (
    <div className="screen" id="engel-verlauf-neu">
      <div className="topbar" style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/engel/pflegedoku" className="back-btn" style={{ textDecoration: 'none' }}>‹</Link>
        <div className="topbar-title">Verlaufseintrag</div>
      </div>

      <div style={{ padding: '0 20px 30px' }}>
        {error && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.3)', color: 'var(--red-w,#dc2626)', fontSize: 13 }}>
            {error}
          </div>
        )}
        {erfolg && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(92,184,130,.10)', border: '1px solid rgba(92,184,130,.35)', color: '#3E8E5F', fontSize: 13 }}>
            Eintrag gespeichert. Du kannst direkt den nächsten erfassen.
          </div>
        )}

        {loading ? <div className="chat-empty">Laden...</div> : kunden.length === 0 ? (
          <div className="chat-empty" style={{ paddingTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
            <div className="chat-empty-title">Keine Kunden zugeordnet</div>
            <div className="chat-empty-sub">Sobald dir ein Kunde zugeordnet ist, kannst du hier dokumentieren.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            <MobilFeld label="Kunde">
              <select value={clientId} onChange={e => setClientId(e.target.value)} style={mobilInput}>
                {kunden.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </MobilFeld>

            <MobilFeld label="Art des Eintrags">
              <select value={eintragTyp} onChange={e => setEintragTyp(e.target.value)} style={mobilInput}>
                {Object.entries(PFLEGE_VERLAUF_TYP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </MobilFeld>

            <MobilFeld label="Kategorie">
              <select value={kategorie} onChange={e => setKategorie(e.target.value)} style={mobilInput}>
                {Object.entries(PFLEGE_VERLAUF_KATEGORIE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </MobilFeld>

            <MobilFeld label="Titel (optional)">
              <input value={titel} onChange={e => setTitel(e.target.value)} style={mobilInput} placeholder="Kurze Überschrift" />
            </MobilFeld>

            <MobilFeld label="Was ist passiert?">
              <textarea
                value={inhalt}
                onChange={e => setInhalt(e.target.value)}
                rows={7}
                style={{ ...mobilInput, resize: 'vertical' }}
                placeholder="Beobachtungen, Ereignisse, Besonderheiten…"
              />
            </MobilFeld>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--ink2)' }}>
              <input type="checkbox" checked={istDringend} onChange={e => setIstDringend(e.target.checked)} />
              Dringend — bitte zeitnah ansehen
            </label>

            <button
              onClick={absenden}
              disabled={busy || !inhalt.trim()}
              style={{
                padding: '14px 16px', borderRadius: 14, border: 'none',
                background: 'linear-gradient(135deg,var(--gold2),var(--gold))', color: 'var(--coal)',
                fontWeight: 700, fontSize: 15, fontFamily: 'inherit',
                cursor: busy ? 'default' : 'pointer', opacity: busy || !inhalt.trim() ? 0.6 : 1,
              }}
            >
              {busy ? 'Speichern…' : 'Eintrag speichern'}
            </button>

            <p style={{ fontSize: 12, color: 'var(--ink4)', margin: 0 }}>
              Der Eintrag wird intern für das Team sichtbar gespeichert. Die Freigabe an Angehörige
              erfolgt durch das Büro.
            </p>
          </div>
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
