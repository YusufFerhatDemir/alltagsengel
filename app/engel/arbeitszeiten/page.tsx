'use client'
// ═══════════════════════════════════════════════════════════
// MEINE ARBEITSZEITEN (Engel)
// ═══════════════════════════════════════════════════════════
// Der Engel sieht hier seine erfassten Arbeitszeiten pro Monat
// und kann neue Zeiten erfassen. Bearbeiten/Löschen ist Adminsache.
// ═══════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate, formatTime, formatDuration, diffMinutes,
  statusMeta, ARBEITSZEIT_STATUS, MONATSNAMEN,
} from '@/lib/admin/ops'

interface Eintrag {
  id: string
  datum: string
  start_zeit: string
  end_zeit: string
  pause_minuten: number
  ist_minuten: number
  status: string
  bemerkung: string | null
}

export default function ArbeitszeitenPage() {
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [caregiverId, setCaregiverId] = useState<string | null>(null)

  // Monatsnavigation
  const now = new Date()
  const [monat, setMonat] = useState(now.getMonth())
  const [jahr, setJahr] = useState(now.getFullYear())

  // Formular
  const [showForm, setShowForm] = useState(false)
  const [formDatum, setFormDatum] = useState('')
  const [formStart, setFormStart] = useState('08:00')
  const [formEnd, setFormEnd] = useState('16:00')
  const [formPause, setFormPause] = useState('30')
  const [saving, setSaving] = useState(false)

  async function laden(m: number, j: number) {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: cg } = await supabase
        .from('caregivers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!cg) { setError('Kein Engel-Profil gefunden.'); return }
      setCaregiverId(cg.id)

      // Monatsgrenzen
      const von = `${j}-${String(m + 1).padStart(2, '0')}-01`
      const bisDate = new Date(j, m + 1, 0)
      const bis = `${j}-${String(m + 1).padStart(2, '0')}-${String(bisDate.getDate()).padStart(2, '0')}`

      const { data, error: dbErr } = await supabase
        .from('personal_arbeitszeiten')
        .select('id, datum, start_zeit, end_zeit, pause_minuten, ist_minuten, status, bemerkung')
        .eq('caregiver_id', cg.id)
        .gte('datum', von)
        .lte('datum', bis)
        .order('datum', { ascending: true })
        .order('start_zeit', { ascending: true })
      if (dbErr) throw dbErr
      setEintraege((data || []) as Eintrag[])
    } catch (err) {
      console.error('Arbeitszeiten laden:', err)
      const code = (err as { code?: string })?.code
      setError(
        code === 'PGRST205'
          ? 'Die Zeiterfassung ist noch nicht freigeschaltet.'
          : 'Arbeitszeiten konnten nicht geladen werden.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { laden(monat, jahr) }, [monat, jahr])

  function navigateMonth(dir: -1 | 1) {
    let m = monat + dir
    let j = jahr
    if (m < 0) { m = 11; j-- }
    if (m > 11) { m = 0; j++ }
    setMonat(m)
    setJahr(j)
  }

  async function handleSubmit() {
    if (!caregiverId) return
    if (!formDatum || !formStart || !formEnd) {
      setError('Bitte alle Felder ausfuellen.')
      return
    }
    const pause = parseInt(formPause) || 0
    const istMin = diffMinutes(formStart, formEnd) - pause
    if (istMin <= 0) {
      setError('Die Arbeitszeit muss positiv sein (Ende nach Start, abzgl. Pause).')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/personal/arbeitszeiten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caregiverId,
          datum: formDatum,
          startZeit: formStart,
          endZeit: formEnd,
          pauseMinuten: pause,
          istMinuten: istMin,
          quelle: 'app',
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Fehler ${res.status}`)
      }
      setSuccess('Arbeitszeit erfolgreich erfasst.')
      setShowForm(false)
      setFormDatum('')
      setFormStart('08:00')
      setFormEnd('16:00')
      setFormPause('30')
      setTimeout(() => setSuccess(''), 4000)
      // Neu laden falls der erfasste Tag im aktuellen Monat liegt
      laden(monat, jahr)
    } catch (err: any) {
      console.error('Arbeitszeit speichern:', err)
      setError(err.message || 'Arbeitszeit konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  // Monatszusammenfassung
  const gesamtMinuten = eintraege.reduce((s, e) => s + (e.ist_minuten || 0), 0)
  const gesamtStunden = (gesamtMinuten / 60).toFixed(1).replace('.', ',')
  const sollMinuten = eintraege.length * 480 // Grobe Schaetzung: 8h Soll
  const ueberMinuten = gesamtMinuten - sollMinuten

  if (loading && eintraege.length === 0) {
    return (
      <div className="screen">
        <div className="topbar" style={{ paddingTop: 14 }}>
          <div className="topbar-title">Meine Arbeitszeiten</div>
        </div>
        <div style={{ padding: 24, color: 'var(--ink3)', fontSize: 14 }}>Wird geladen...</div>
      </div>
    )
  }

  return (
    <div className="screen" id="arbeitszeiten">
      <div className="topbar" style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/engel/profil" style={{ color: 'var(--ink3)', fontSize: 24, textDecoration: 'none', lineHeight: 1 }}>&#8249;</Link>
        <div className="topbar-title">Meine Arbeitszeiten</div>
      </div>

      <div style={{ padding: '0 18px 100px' }}>
        {/* Monatsnavigation */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14,
        }}>
          <button onClick={() => navigateMonth(-1)} style={navBtn} aria-label="Vorheriger Monat">&#8249;</button>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
            {MONATSNAMEN[monat]} {jahr}
          </div>
          <button onClick={() => navigateMonth(1)} style={navBtn} aria-label="Naechster Monat">&#8250;</button>
        </div>

        {/* Zusammenfassung */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16,
        }}>
          <div style={summaryCard}>
            <div style={{ fontSize: 11, color: 'var(--ink4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Gesamtstunden</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>{gesamtStunden} h</div>
          </div>
          <div style={summaryCard}>
            <div style={{ fontSize: 11, color: 'var(--ink4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Eintraege</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>{eintraege.length}</div>
          </div>
        </div>

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

        {/* CTA: Zeit erfassen */}
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setError(''); setSuccess('') }}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, var(--gold2), var(--gold))',
              color: 'var(--coal)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              marginBottom: 18,
            }}
          >+ Zeit erfassen</button>
        )}

        {/* Erfassungsformular */}
        {showForm && (
          <div style={{
            background: 'var(--white)', border: '1.5px solid var(--border)',
            borderRadius: 18, padding: 18, marginBottom: 18,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 12 }}>
              Neue Arbeitszeit
            </div>

            <label style={labelStyle}>Datum</label>
            <input
              type="date"
              value={formDatum}
              onChange={e => setFormDatum(e.target.value)}
              style={inputStyle}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <div>
                <label style={labelStyle}>Start</label>
                <input type="time" value={formStart} onChange={e => setFormStart(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Ende</label>
                <input type="time" value={formEnd} onChange={e => setFormEnd(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <label style={{ ...labelStyle, marginTop: 10 }}>Pause (Minuten)</label>
            <input
              type="number"
              min="0"
              value={formPause}
              onChange={e => setFormPause(e.target.value)}
              style={inputStyle}
            />

            {formStart && formEnd && (
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8 }}>
                Ist-Minuten: {Math.max(0, diffMinutes(formStart, formEnd) - (parseInt(formPause) || 0))} min
                ({formatDuration(Math.max(0, diffMinutes(formStart, formEnd) - (parseInt(formPause) || 0)))})
              </div>
            )}

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
              >{saving ? 'Speichern...' : 'Speichern'}</button>
            </div>
          </div>
        )}

        {/* Eintraege-Liste */}
        {eintraege.length === 0 && !loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink4)', fontSize: 13 }}>
            Keine Arbeitszeiten in diesem Monat erfasst.
          </div>
        ) : (
          eintraege.map(e => {
            const sm = statusMeta(ARBEITSZEIT_STATUS, e.status)
            return (
              <div key={e.id} style={{
                background: 'var(--coal2)', border: '1px solid var(--border)',
                borderRadius: 14, padding: '14px 16px', marginBottom: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                    {formatDate(e.datum)}
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: sm.color,
                    background: `${sm.color}18`, padding: '3px 10px', borderRadius: 6,
                  }}>{sm.label}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--ink3)' }}>
                  <span>{formatTime(e.start_zeit)} - {formatTime(e.end_zeit)}</span>
                  <span>Pause: {e.pause_minuten} min</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 4, fontWeight: 500 }}>
                  {formatDuration(e.ist_minuten)}
                </div>
                {e.bemerkung && (
                  <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 4, fontStyle: 'italic' }}>
                    {e.bemerkung}
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
const navBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 10,
  border: '1px solid var(--border2)', background: 'transparent',
  color: 'var(--ink3)', fontSize: 20, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const summaryCard: React.CSSProperties = {
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 14, padding: '14px 16px',
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
