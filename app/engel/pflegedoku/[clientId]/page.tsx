'use client'
// ═══════════════════════════════════════════════════════════════
// Engel: Pflegedoku eines zugewiesenen Kunden
// Diagnosen, Risiken, aktiver Maßnahmenplan und sichtbarer Verlauf.
// Die Sichtbarkeitsgrenzen setzt RLS (engel_pflege_*_select).
// ═══════════════════════════════════════════════════════════════
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import {
  PFLEGE_DIAGNOSE_TYP, PFLEGE_MASSNAHME_KATEGORIE, PFLEGE_RISIKO_TYP,
  PFLEGE_SCHWEREGRAD, PFLEGE_VERLAUF_TYP, formatDate, statusMeta,
} from '@/lib/admin/ops'
import type {
  PflegeDiagnose, PflegeMassnahme, PflegeMassnahmenplan, PflegeRisiko, PflegeVerlaufEintrag,
} from '@/lib/pflege/types'

export default function EngelPflegedokuKundePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params)
  const router = useRouter()
  const [name, setName] = useState('Kunde')
  const [diagnosen, setDiagnosen] = useState<PflegeDiagnose[]>([])
  const [risiken, setRisiken] = useState<PflegeRisiko[]>([])
  const [plan, setPlan] = useState<PflegeMassnahmenplan | null>(null)
  const [massnahmen, setMassnahmen] = useState<PflegeMassnahme[]>([])
  const [verlauf, setVerlauf] = useState<PflegeVerlaufEintrag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const user = await requireUser(router, { redirectTo: `/engel/pflegedoku/${clientId}` })
      if (!user) return
      try {
        const supabase = createClient()
        const [kundeRes, dRes, rRes, pRes, vRes] = await Promise.all([
          supabase.from('clients').select('first_name, last_name').eq('id', clientId).maybeSingle(),
          supabase.from('pflege_diagnosen').select('*').eq('client_id', clientId),
          supabase.from('pflege_risiken').select('*').eq('client_id', clientId),
          supabase.from('pflege_massnahmenplaene').select('*').eq('client_id', clientId).eq('status', 'aktiv').maybeSingle(),
          supabase.from('pflege_verlauf').select('*').eq('client_id', clientId).order('eintrag_datum', { ascending: false }).limit(50),
        ])

        if (kundeRes.data) setName(`${kundeRes.data.first_name ?? ''} ${kundeRes.data.last_name ?? ''}`.trim() || 'Kunde')
        setDiagnosen((dRes.data || []) as PflegeDiagnose[])
        setRisiken((rRes.data || []) as PflegeRisiko[])
        setVerlauf((vRes.data || []) as PflegeVerlaufEintrag[])

        const aktiverPlan = (pRes.data || null) as PflegeMassnahmenplan | null
        setPlan(aktiverPlan)
        if (aktiverPlan) {
          const { data: ms } = await supabase
            .from('pflege_massnahmen')
            .select('*')
            .eq('plan_id', aktiverPlan.id)
            .order('sortierung', { ascending: true })
          setMassnahmen((ms || []) as PflegeMassnahme[])
        }
      } catch (err: any) {
        setError(err?.message || 'Pflegedokumentation konnte nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  return (
    <div className="screen" id="engel-pflegedoku-kunde">
      <div className="topbar" style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/engel/pflegedoku" className="back-btn" style={{ textDecoration: 'none' }}>‹</Link>
        <div className="topbar-title">{name}</div>
      </div>

      <div style={{ padding: '0 20px' }}>
        {error && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.3)', color: 'var(--red-w,#dc2626)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? <div className="chat-empty">Laden...</div> : (
          <>
            <Abschnitt titel={`Risiken (${risiken.length})`}>
              {risiken.length === 0
                ? <Leer text="Keine Risiken hinterlegt" />
                : risiken.map(r => (
                  <Karte key={r.id} rand={statusMeta(PFLEGE_SCHWEREGRAD, r.schweregrad).color}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{r.bezeichnung}</div>
                      <Chip label={statusMeta(PFLEGE_SCHWEREGRAD, r.schweregrad).label} color={statusMeta(PFLEGE_SCHWEREGRAD, r.schweregrad).color} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 3 }}>
                      {statusMeta(PFLEGE_RISIKO_TYP, r.risiko_typ).label}
                    </div>
                    {r.massnahmen && <p style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 8, marginBottom: 0 }}>{r.massnahmen}</p>}
                  </Karte>
                ))}
            </Abschnitt>

            <Abschnitt titel={`Diagnosen (${diagnosen.length})`}>
              {diagnosen.length === 0
                ? <Leer text="Keine betreuungsrelevanten Diagnosen freigegeben" />
                : diagnosen.map(d => (
                  <Karte key={d.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{d.bezeichnung}</div>
                      <Chip label={statusMeta(PFLEGE_DIAGNOSE_TYP, d.diagnose_typ).label} color={statusMeta(PFLEGE_DIAGNOSE_TYP, d.diagnose_typ).color} />
                    </div>
                    {d.hinweis_fuer_engel && (
                      <p style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 8, marginBottom: 0 }}>{d.hinweis_fuer_engel}</p>
                    )}
                  </Karte>
                ))}
            </Abschnitt>

            <Abschnitt titel="Aktiver Maßnahmenplan">
              {!plan
                ? <Leer text="Kein aktiver Plan hinterlegt" />
                : (
                  <Karte>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{plan.titel}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 3 }}>
                      Version {plan.version} · gültig ab {formatDate(plan.gueltig_von)}
                    </div>
                    {plan.betreuungsziele && (
                      <p style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 8, marginBottom: 0 }}>{plan.betreuungsziele}</p>
                    )}
                    <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                      {massnahmen.map(m => (
                        <div key={m.id} style={{ padding: 10, borderRadius: 10, background: 'var(--cream,#F7F2EA)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{m.titel}</div>
                            <Chip label={statusMeta(PFLEGE_MASSNAHME_KATEGORIE, m.kategorie).label} color={statusMeta(PFLEGE_MASSNAHME_KATEGORIE, m.kategorie).color} />
                          </div>
                          {m.beschreibung && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>{m.beschreibung}</div>}
                          {m.haeufigkeit && <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 4 }}>Häufigkeit: {m.haeufigkeit}</div>}
                        </div>
                      ))}
                    </div>
                  </Karte>
                )}
            </Abschnitt>

            <Abschnitt titel={`Verlauf (${verlauf.length})`}>
              {verlauf.length === 0
                ? <Leer text="Noch keine Verlaufseinträge" />
                : verlauf.map(e => (
                  <Karte key={e.id} rand={e.ist_dringend ? '#D04B3B' : undefined}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <Chip label={statusMeta(PFLEGE_VERLAUF_TYP, e.eintrag_typ).label} color={statusMeta(PFLEGE_VERLAUF_TYP, e.eintrag_typ).color} />
                      <span style={{ fontSize: 11, color: 'var(--ink4)' }}>{formatDate(e.eintrag_datum)}</span>
                    </div>
                    {e.titel && <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>{e.titel}</div>}
                    <p style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 6, marginBottom: 0, whiteSpace: 'pre-wrap' }}>{e.inhalt}</p>
                    <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 6 }}>{e.autor_name}</div>
                  </Karte>
                ))}
            </Abschnitt>

            <Link
              href={`/engel/pflegedoku/verlauf?clientId=${clientId}`}
              style={{
                display: 'block', textAlign: 'center', padding: '12px 16px', borderRadius: 14,
                background: 'linear-gradient(135deg,var(--gold2),var(--gold))', color: 'var(--coal)',
                fontWeight: 700, fontSize: 14, textDecoration: 'none', margin: '4px 0 24px',
              }}
            >
              + Verlaufseintrag für {name}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--ink4)', margin: '0 0 8px' }}>
        {titel}
      </div>
      {children}
    </div>
  )
}

function Karte({ children, rand }: { children: React.ReactNode; rand?: string }) {
  return (
    <div style={{
      background: 'var(--white)', borderRadius: 16, marginBottom: 10,
      border: `1px solid ${rand ? `${rand}55` : 'var(--border)'}`, padding: 14,
    }}>
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
