'use client'
// ═══════════════════════════════════════════════════════════
// MEIN URLAUB (Engel)
// ═══════════════════════════════════════════════════════════
// Resturlaub einsehen, eigene Abwesenheiten auflisten und
// neuen Urlaub beantragen. Engel hat INSERT + SELECT via RLS.
// ═══════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { requestAbsence } from './actions'
import {
  formatDate, statusMeta,
  ABSENCE_TYPE, ABSENCE_STATUS,
} from '@/lib/admin/ops'
import { logger } from '@/lib/logger'
const log = logger.child('engel:urlaub')

interface Urlaubskonto {
  anspruch_tage: number
  genommen_tage: number
  geplant_tage: number
  uebertrag_vorjahr: number
  resturlaub: number
}

interface Abwesenheit {
  id: string
  absence_type: string
  start_date: string
  end_date: string
  status: string
  halber_tag: boolean
  reason: string | null
  ablehnungsgrund: string | null
  created_at: string
}

const absenceTypeOptions = Object.entries(ABSENCE_TYPE).map(([k, v]) => ({ value: k, label: v.label }))

export default function UrlaubPage() {
  const [konto, setKonto] = useState<Urlaubskonto | null>(null)
  const [abwesenheiten, setAbwesenheiten] = useState<Abwesenheit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [caregiverId, setCaregiverId] = useState<string | null>(null)

  // Formular
  const [showForm, setShowForm] = useState(false)
  const [formVon, setFormVon] = useState('')
  const [formBis, setFormBis] = useState('')
  const [formTyp, setFormTyp] = useState('vacation')
  const [formHalberTag, setFormHalberTag] = useState(false)
  const [formBemerkung, setFormBemerkung] = useState('')
  const [saving, setSaving] = useState(false)

  async function laden() {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // WICHTIG: NIE direkt gegen caregivers selektieren — die Tabelle hat
      // fuer Engel keine Self-Select-Policy (nur admin_all), das liefert
      // hier still "keine Zeile" statt eines Fehlers. eigene_caregiver_ids()
      // ist eine SECURITY DEFINER RPC und umgeht das (siehe Memory-Eintrag
      // engel-rls-caregivers-join-falle).
      const { data: cgIds, error: cgErr } = await supabase.rpc('eigene_caregiver_ids')
      if (cgErr) throw cgErr
      const cgId = cgIds?.[0] ?? null
      if (!cgId) { setError('Kein Engel-Profil gefunden.'); return }
      setCaregiverId(cgId)

      // Urlaubskonto (aktuelles Jahr)
      const currentYear = new Date().getFullYear()
      // Der Resturlaub ist eine Zahl, nach der jemand seinen Antrag stellt.
      // Ihr Fehler wurde bis 31.08.2026 verworfen — dann stand das Konto
      // einfach nicht da, als waere keines gefuehrt. Der Fehler gehoert in
      // denselben Zweig wie die Abwesenheiten (throw → catch unten).
      const { data: kontoData, error: kontoErr } = await supabase
        .from('personal_urlaubskonto')
        .select('anspruch_tage, genommen_tage, geplant_tage, uebertrag_vorjahr, resturlaub')
        .eq('caregiver_id', cgId)
        .eq('jahr', currentYear)
        .maybeSingle()
      if (kontoErr) throw kontoErr
      setKonto(kontoData as Urlaubskonto | null)

      // Abwesenheiten
      const { data: absData, error: absErr } = await supabase
        .from('absences')
        .select('id, absence_type, start_date, end_date, status, halber_tag, reason, ablehnungsgrund, created_at')
        .eq('caregiver_id', cgId)
        .order('start_date', { ascending: false })
      if (absErr) throw absErr
      setAbwesenheiten((absData || []) as Abwesenheit[])
    } catch (err) {
      log.errorWithException('Urlaub laden', err)
      const code = (err as { code?: string })?.code
      setError(
        code === 'PGRST205'
          ? 'Die Urlaubsverwaltung ist noch nicht freigeschaltet.'
          : 'Daten konnten nicht geladen werden.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { laden() }, [])

  async function handleSubmit() {
    if (!caregiverId) return
    if (!formVon || !formBis) {
      setError('Bitte Von- und Bis-Datum angeben.')
      return
    }
    if (formBis < formVon) {
      setError('Das Enddatum muss nach dem Startdatum liegen.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const result = await requestAbsence({
        absenceType: formTyp,
        startDate: formVon,
        endDate: formBis,
        halberTag: formHalberTag,
        reason: formBemerkung || null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }

      setSuccess('Abwesenheit erfolgreich beantragt.')
      setShowForm(false)
      setFormVon('')
      setFormBis('')
      setFormTyp('vacation')
      setFormHalberTag(false)
      setFormBemerkung('')
      setTimeout(() => setSuccess(''), 4000)
      laden()
    } catch (err: any) {
      log.errorWithException('Abwesenheit beantragen', err)
      setError(err.message || 'Abwesenheit konnte nicht beantragt werden.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="screen">
        <div className="topbar" style={{ paddingTop: 14 }}>
          <div className="topbar-title">Mein Urlaub</div>
        </div>
        <div style={{ padding: 24, color: 'var(--ink3)', fontSize: 14 }}>Wird geladen...</div>
      </div>
    )
  }

  return (
    <div className="screen" id="urlaub">
      <div className="topbar" style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/engel/profil" style={{ color: 'var(--ink3)', fontSize: 24, textDecoration: 'none', lineHeight: 1 }}>&#8249;</Link>
        <div className="topbar-title">Mein Urlaub</div>
      </div>

      <div style={{ padding: '0 18px 100px' }}>
        {/* Resturlaub-Karte */}
        {konto ? (
          <div style={{
            background: 'linear-gradient(135deg, rgba(201,150,60,.12), rgba(201,150,60,.04))',
            border: '1px solid rgba(201,150,60,.25)',
            borderRadius: 16, padding: 18, marginBottom: 18,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--gold)' }}>
              Resturlaub {new Date().getFullYear()}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)', marginTop: 6 }}>
              {konto.resturlaub} Tage
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
              <div>
                <div style={kontoLabel}>Anspruch</div>
                <div style={kontoValue}>{konto.anspruch_tage} Tage</div>
              </div>
              <div>
                <div style={kontoLabel}>Genommen</div>
                <div style={kontoValue}>{konto.genommen_tage} Tage</div>
              </div>
              <div>
                <div style={kontoLabel}>Geplant</div>
                <div style={kontoValue}>{konto.geplant_tage} Tage</div>
              </div>
              <div>
                <div style={kontoLabel}>Uebertrag Vorjahr</div>
                <div style={kontoValue}>{konto.uebertrag_vorjahr} Tage</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            background: 'var(--coal2)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '14px 16px', marginBottom: 18,
            fontSize: 13, color: 'var(--ink4)',
          }}>
            Kein Urlaubskonto fuer das aktuelle Jahr hinterlegt.
          </div>
        )}

        {/* Feedback */}
        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 14,
            background: 'rgba(208,75,59,.1)', border: '1px solid rgba(208,75,59,.3)',
            color: '#D04B3B', fontSize: 13,
          }}>{error}</div>
        )}
        {success && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 14,
            background: 'rgba(92,184,130,.1)', border: '1px solid rgba(92,184,130,.3)',
            color: '#5CB882', fontSize: 13,
          }}>{success}</div>
        )}

        {/* CTA */}
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setError(''); setSuccess('') }}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, var(--gold2), var(--gold))',
              color: 'var(--coal)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              marginBottom: 18,
            }}
          >+ Urlaub beantragen</button>
        )}

        {/* Antragsformular */}
        {showForm && (
          <div style={{
            background: 'var(--white)', border: '1.5px solid var(--border)',
            borderRadius: 18, padding: 18, marginBottom: 18,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 12 }}>
              Abwesenheit beantragen
            </div>

            <label htmlFor="urlaub-art" style={labelStyle}>Art</label>
            <select
              id="urlaub-art"
              value={formTyp}
              onChange={e => setFormTyp(e.target.value)}
              style={inputStyle}
            >
              {absenceTypeOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <div>
                <label htmlFor="urlaub-von" style={labelStyle}>Von</label>
                <input id="urlaub-von" type="date" value={formVon} onChange={e => setFormVon(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label htmlFor="urlaub-bis" style={labelStyle}>Bis</label>
                <input id="urlaub-bis" type="date" value={formBis} onChange={e => setFormBis(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <input
                type="checkbox"
                id="halberTag"
                checked={formHalberTag}
                onChange={e => setFormHalberTag(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--gold)' }}
              />
              <label htmlFor="halberTag" style={{ fontSize: 13, color: 'var(--ink)' }}>Halber Tag</label>
            </div>

            <label htmlFor="urlaub-bemerkung-optional" style={{ ...labelStyle, marginTop: 10 }}>Bemerkung (optional)</label>
            <textarea
              id="urlaub-bemerkung-optional"
              value={formBemerkung}
              onChange={e => setFormBemerkung(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="z.B. Grund, besondere Hinweise..."
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                onClick={() => { setShowForm(false); setError('') }}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 10,
                  border: '1px solid var(--border2)', background: 'transparent',
                  color: 'var(--ink3)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >Abbrechen</button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, var(--gold2), var(--gold))',
                  color: 'var(--coal)', fontSize: 13, fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >{saving ? 'Wird beantragt...' : 'Beantragen'}</button>
            </div>
          </div>
        )}

        {/* Abwesenheiten-Liste */}
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 10 }}>
          Meine Abwesenheiten
        </div>

        {abwesenheiten.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink4)', fontSize: 13 }}>
            Keine Abwesenheiten vorhanden.
          </div>
        ) : (
          abwesenheiten.map(a => {
            const typMeta = statusMeta(ABSENCE_TYPE, a.absence_type)
            const stMeta = statusMeta(ABSENCE_STATUS, a.status)
            return (
              <div key={a.id} style={{
                background: 'var(--coal2)', border: '1px solid var(--border)',
                borderRadius: 14, padding: '14px 16px', marginBottom: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: typMeta.color,
                      background: `${typMeta.color}18`, padding: '3px 10px', borderRadius: 6,
                    }}>{typMeta.label}</span>
                    {a.halber_tag && (
                      <span style={{ fontSize: 10, color: 'var(--ink4)', fontWeight: 500 }}>halber Tag</span>
                    )}
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: stMeta.color,
                    background: `${stMeta.color}18`, padding: '3px 10px', borderRadius: 6,
                  }}>{stMeta.label}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>
                  {formatDate(a.start_date)} - {formatDate(a.end_date)}
                </div>
                {a.reason && (
                  <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 4, fontStyle: 'italic' }}>
                    {a.reason}
                  </div>
                )}
                {a.ablehnungsgrund && (
                  <div style={{ fontSize: 12, color: '#D04B3B', marginTop: 4 }}>
                    Ablehnungsgrund: {a.ablehnungsgrund}
                  </div>
                )}
              </div>
            )
          })
        )}

        <div style={{ height: 90 }}></div>
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────
const kontoLabel: React.CSSProperties = {
  fontSize: 11, color: 'var(--ink4)', fontWeight: 500,
}

const kontoValue: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginTop: 2,
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink4)',
  marginBottom: 4, marginTop: 0,
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--cream)', border: '1.5px solid var(--border)',
  borderRadius: 12, padding: '13px 15px', fontFamily: "'Jost',sans-serif",
  fontSize: 14, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
}
