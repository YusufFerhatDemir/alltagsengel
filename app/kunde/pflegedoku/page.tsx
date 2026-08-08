'use client'
// ═══════════════════════════════════════════════════════════════
// Kunde: eigener aktiver Maßnahmenplan + freigegebener Verlauf
// RLS liefert nur den aktiven Plan und Einträge mit
// sichtbarkeit in ('kunde','alle') (kunde_pflege_*_select).
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import {
  PFLEGE_MASSNAHME_KATEGORIE, PFLEGE_VERLAUF_KATEGORIE, PFLEGE_VERLAUF_TYP, formatDate, statusMeta,
} from '@/lib/admin/ops'
import type { PflegeMassnahme, PflegeMassnahmenplan, PflegeVerlaufEintrag } from '@/lib/pflege/types'

export default function KundePflegedokuPage() {
  const router = useRouter()
  const [plan, setPlan] = useState<PflegeMassnahmenplan | null>(null)
  const [massnahmen, setMassnahmen] = useState<PflegeMassnahme[]>([])
  const [verlauf, setVerlauf] = useState<PflegeVerlaufEintrag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const user = await requireUser(router, { redirectTo: '/kunde/pflegedoku' })
      if (!user) return
      try {
        const supabase = createClient()
        const [planRes, verlaufRes] = await Promise.all([
          supabase.from('pflege_massnahmenplaene').select('*').eq('status', 'aktiv').order('version', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('pflege_verlauf').select('*').order('eintrag_datum', { ascending: false }).limit(50),
        ])

        const aktiverPlan = (planRes.data || null) as PflegeMassnahmenplan | null
        setPlan(aktiverPlan)
        setVerlauf((verlaufRes.data || []) as PflegeVerlaufEintrag[])

        if (aktiverPlan) {
          const { data: ms } = await supabase
            .from('pflege_massnahmen')
            .select('*')
            .eq('plan_id', aktiverPlan.id)
            .order('sortierung', { ascending: true })
          setMassnahmen((ms || []) as PflegeMassnahme[])
        }
      } catch (err: any) {
        setError(err?.message || 'Ihre Pflegedokumentation konnte nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="screen" id="kunde-pflegedoku">
      <div className="topbar" style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/kunde/home" className="back-btn" style={{ textDecoration: 'none' }}>‹</Link>
        <div className="topbar-title">Meine Betreuung</div>
      </div>

      <div style={{ padding: '0 20px 30px' }}>
        {error && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.3)', color: 'var(--red-w,#dc2626)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? <div className="chat-empty">Laden...</div> : (
          <>
            <Abschnitt titel="Ihr Versorgungsplan">
              {!plan
                ? <Leer text="Sobald Ihr Versorgungsplan freigegeben ist, sehen Sie ihn hier." />
                : (
                  <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--border)', padding: 16, marginBottom: 10 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{plan.titel}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 3 }}>
                      Gültig ab {formatDate(plan.gueltig_von)}
                      {plan.gueltig_bis && ` bis ${formatDate(plan.gueltig_bis)}`}
                    </div>
                    {plan.betreuungsziele && (
                      <p style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 10, marginBottom: 0 }}>{plan.betreuungsziele}</p>
                    )}
                    <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                      {massnahmen.map(m => (
                        <div key={m.id} style={{ padding: 12, borderRadius: 12, background: 'var(--cream,#F7F2EA)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{m.titel}</div>
                            <Chip
                              label={statusMeta(PFLEGE_MASSNAHME_KATEGORIE, m.kategorie).label}
                              color={statusMeta(PFLEGE_MASSNAHME_KATEGORIE, m.kategorie).color}
                            />
                          </div>
                          {m.beschreibung && <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 5 }}>{m.beschreibung}</div>}
                          {m.haeufigkeit && <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 5 }}>Häufigkeit: {m.haeufigkeit}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </Abschnitt>

            <Abschnitt titel="Verlauf Ihrer Betreuung">
              {verlauf.length === 0
                ? <Leer text="Hier erscheinen die für Sie freigegebenen Einträge zu Ihrer Betreuung." />
                : verlauf.map(e => (
                  <div key={e.id} style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--border)', padding: 14, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <Chip label={statusMeta(PFLEGE_VERLAUF_TYP, e.eintrag_typ).label} color={statusMeta(PFLEGE_VERLAUF_TYP, e.eintrag_typ).color} />
                      <span style={{ fontSize: 11, color: 'var(--ink4)' }}>{formatDate(e.eintrag_datum)}</span>
                    </div>
                    {e.titel && <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>{e.titel}</div>}
                    <p style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 6, marginBottom: 0, whiteSpace: 'pre-wrap' }}>{e.inhalt}</p>
                    <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 8 }}>
                      {statusMeta(PFLEGE_VERLAUF_KATEGORIE, e.kategorie).label} · Alltagsengel
                    </div>
                  </div>
                ))}
            </Abschnitt>
          </>
        )}
      </div>
    </div>
  )
}

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--ink4)', margin: '0 0 8px' }}>
        {titel}
      </div>
      {children}
    </div>
  )
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color, background: `${color}18`,
      padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function Leer({ text }: { text: string }) {
  return <div style={{ fontSize: 13, color: 'var(--ink4)', padding: '8px 2px' }}>{text}</div>
}
