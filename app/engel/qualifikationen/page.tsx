'use client'
// ═══════════════════════════════════════════════════════════
// MEINE QUALIFIKATIONEN (Engel)
// ═══════════════════════════════════════════════════════════
// Qualifikationen + Schulungen einsehen (nur lesen).
// RLS liefert nur eigene Daten. Ablauf-Ampel zeigt dem Engel
// fruehzeitig, wenn etwas bald ablaeuft.
// ═══════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate, statusMeta, daysUntil,
  QUALIFICATION_STATUS, SCHULUNGSART,
} from '@/lib/admin/ops'
import { logger } from '@/lib/logger'
const log = logger.child('engel:qualifikationen')

interface Qualification {
  id: string
  title: string
  qualification_type: string
  issued_date: string | null
  valid_until: string | null
  status: string
  pflicht: boolean
  einsatzrelevant: boolean
  ausstellende_stelle: string | null
  bemerkung: string | null
}

interface Schulung {
  id: string
  titel: string
  schulungsart: string
  anbieter: string | null
  beginn: string | null
  ende: string | null
  dauer_stunden: number | null
  bestanden: boolean
  naechste_auffrischung: string | null
  bemerkung: string | null
}

function ablaufAmpel(validUntil: string | null | undefined): { label: string; color: string } {
  const d = daysUntil(validUntil)
  if (d === null) return { label: 'Kein Ablaufdatum', color: '#999' }
  if (d < 0) return { label: `${Math.abs(d)} Tage abgelaufen`, color: '#D04B3B' }
  if (d <= 7) return { label: `Noch ${d} Tage`, color: '#D04B3B' }
  if (d <= 30) return { label: `Noch ${d} Tage`, color: '#E8A000' }
  if (d <= 90) return { label: `Noch ${d} Tage`, color: '#C9963C' }
  return { label: `Noch ${d} Tage`, color: '#5CB882' }
}

export default function QualifikationenPage() {
  const [qualifikationen, setQualifikationen] = useState<Qualification[]>([])
  const [schulungen, setSchulungen] = useState<Schulung[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
      const caregiverId = cgIds?.[0] ?? null
      if (!caregiverId) { setError('Kein Engel-Profil gefunden.'); return }

      // Qualifikationen
      const { data: qData, error: qErr } = await supabase
        .from('caregiver_qualifications')
        .select('id, title, qualification_type, issued_date, valid_until, status, pflicht, einsatzrelevant, ausstellende_stelle, bemerkung')
        .eq('caregiver_id', caregiverId)
        .order('valid_until', { ascending: true, nullsFirst: false })
      if (qErr) throw qErr
      setQualifikationen((qData || []) as Qualification[])

      // Schulungen
      const { data: sData, error: sErr } = await supabase
        .from('personal_schulungen')
        .select('id, titel, schulungsart, anbieter, beginn, ende, dauer_stunden, bestanden, naechste_auffrischung, bemerkung')
        .eq('caregiver_id', caregiverId)
        .order('beginn', { ascending: false })
      if (sErr) throw sErr
      setSchulungen((sData || []) as Schulung[])
    } catch (err) {
      log.errorWithException('Qualifikationen laden', err)
      const code = (err as { code?: string })?.code
      setError(
        code === 'PGRST205'
          ? 'Die Qualifikationsuebersicht ist noch nicht freigeschaltet.'
          : 'Daten konnten nicht geladen werden.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { laden() }, [])

  if (loading) {
    return (
      <div className="screen">
        <div className="topbar" style={{ paddingTop: 14 }}>
          <div className="topbar-title">Meine Qualifikationen</div>
        </div>
        <div style={{ padding: 24, color: 'var(--ink3)', fontSize: 14 }}>Wird geladen...</div>
      </div>
    )
  }

  return (
    <div className="screen" id="qualifikationen">
      <div className="topbar" style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/engel/profil" style={{ color: 'var(--ink3)', fontSize: 24, textDecoration: 'none', lineHeight: 1 }}>&#8249;</Link>
        <div className="topbar-title">Meine Qualifikationen</div>
      </div>

      <div style={{ padding: '0 18px 100px' }}>
        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 14,
            background: 'rgba(208,75,59,.1)', border: '1px solid rgba(208,75,59,.3)',
            color: '#D04B3B', fontSize: 13,
          }}>{error}</div>
        )}

        {/* Zusammenfassung */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18,
        }}>
          <div style={summaryCard}>
            <div style={summaryLabel}>Gesamt</div>
            <div style={summaryValue}>{qualifikationen.length}</div>
          </div>
          <div style={summaryCard}>
            <div style={summaryLabel}>Gueltig</div>
            <div style={{ ...summaryValue, color: '#5CB882' }}>
              {qualifikationen.filter(q => q.status === 'valid').length}
            </div>
          </div>
          <div style={summaryCard}>
            <div style={summaryLabel}>Achtung</div>
            <div style={{ ...summaryValue, color: '#E8A000' }}>
              {qualifikationen.filter(q => q.status === 'expiring' || q.status === 'expired').length}
            </div>
          </div>
        </div>

        {/* Qualifikationen */}
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 10 }}>
          Qualifikationen
        </div>

        {qualifikationen.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink4)', fontSize: 13 }}>
            Keine Qualifikationen hinterlegt.
          </div>
        ) : (
          qualifikationen.map(q => {
            const stMeta = statusMeta(QUALIFICATION_STATUS, q.status)
            const ampel = ablaufAmpel(q.valid_until)
            return (
              <div key={q.id} style={{
                background: 'var(--coal2)', border: '1px solid var(--border)',
                borderRadius: 14, padding: '14px 16px', marginBottom: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{q.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{q.qualification_type}</div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: stMeta.color,
                    background: `${stMeta.color}18`, padding: '3px 10px', borderRadius: 6,
                    flexShrink: 0, marginLeft: 8,
                  }}>{stMeta.label}</span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--ink3)' }}>
                  {q.issued_date && <span>Ausgestellt: {formatDate(q.issued_date)}</span>}
                  {q.valid_until && <span>Gueltig bis: {formatDate(q.valid_until)}</span>}
                </div>

                {q.valid_until && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    marginTop: 8, fontSize: 11, fontWeight: 600, color: ampel.color,
                    background: `${ampel.color}14`, padding: '4px 10px', borderRadius: 6,
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: ampel.color, flexShrink: 0,
                    }}></span>
                    {ampel.label}
                  </div>
                )}

                {q.ausstellende_stelle && (
                  <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 4 }}>
                    {q.ausstellende_stelle}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  {q.pflicht && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#D04B3B', background: 'rgba(208,75,59,.1)', padding: '2px 8px', borderRadius: 5 }}>
                      Pflicht
                    </span>
                  )}
                  {q.einsatzrelevant && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#2196F3', background: 'rgba(33,150,243,.1)', padding: '2px 8px', borderRadius: 5 }}>
                      Einsatzrelevant
                    </span>
                  )}
                </div>

                {q.bemerkung && (
                  <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 6, fontStyle: 'italic' }}>
                    {q.bemerkung}
                  </div>
                )}
              </div>
            )
          })
        )}

        {/* Schulungen */}
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', marginTop: 24, marginBottom: 10 }}>
          Schulungen
        </div>

        {schulungen.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink4)', fontSize: 13 }}>
            Keine Schulungen hinterlegt.
          </div>
        ) : (
          schulungen.map(s => {
            const artMeta = statusMeta(SCHULUNGSART, s.schulungsart)
            const auffrischungAmpel = s.naechste_auffrischung ? ablaufAmpel(s.naechste_auffrischung) : null
            return (
              <div key={s.id} style={{
                background: 'var(--coal2)', border: '1px solid var(--border)',
                borderRadius: 14, padding: '14px 16px', marginBottom: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{s.titel}</div>
                    {s.anbieter && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{s.anbieter}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: artMeta.color,
                      background: `${artMeta.color}18`, padding: '3px 10px', borderRadius: 6,
                    }}>{artMeta.label}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: s.bestanden ? '#5CB882' : '#D04B3B',
                      background: s.bestanden ? 'rgba(92,184,130,.12)' : 'rgba(208,75,59,.12)',
                      padding: '3px 10px', borderRadius: 6,
                    }}>{s.bestanden ? 'Bestanden' : 'Nicht bestanden'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--ink3)' }}>
                  {s.beginn && <span>{formatDate(s.beginn)}{s.ende && s.ende !== s.beginn ? ` - ${formatDate(s.ende)}` : ''}</span>}
                  {s.dauer_stunden != null && <span>{s.dauer_stunden} Stunden</span>}
                </div>

                {auffrischungAmpel && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    marginTop: 8, fontSize: 11, fontWeight: 600, color: auffrischungAmpel.color,
                    background: `${auffrischungAmpel.color}14`, padding: '4px 10px', borderRadius: 6,
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: auffrischungAmpel.color, flexShrink: 0,
                    }}></span>
                    Auffrischung: {formatDate(s.naechste_auffrischung)} ({auffrischungAmpel.label})
                  </div>
                )}

                {s.bemerkung && (
                  <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 6, fontStyle: 'italic' }}>
                    {s.bemerkung}
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
const summaryCard: React.CSSProperties = {
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 14, padding: '12px 14px', textAlign: 'center',
}

const summaryLabel: React.CSSProperties = {
  fontSize: 10, color: 'var(--ink4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em',
}

const summaryValue: React.CSSProperties = {
  fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginTop: 4,
}
