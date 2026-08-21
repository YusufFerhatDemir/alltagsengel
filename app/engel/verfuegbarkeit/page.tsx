'use client'
// ═══════════════════════════════════════════════════════════
// VERFÜGBARKEITSKALENDER (Engel)
// ═══════════════════════════════════════════════════════════
// Der Engel pflegt hier wöchentlich wiederkehrende Zeitfenster.
// Die Buchungsstrecke des Kunden filtert damit vor, sodass
// gar nicht erst Anfragen zu Zeiten eintrudeln, an denen der
// Engel nicht kann (siehe /api/engel/match + lib/availability).
//
// Änderungen werden sofort gespeichert — kein Speichern-Button,
// weil einzelne Zeitfenster unabhängig voneinander sind und ein
// halb ausgefülltes Formular sonst verloren ginge.
// ═══════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { addAvailabilitySlot, deleteAvailabilitySlot, applyDefaultTemplate } from './actions'
import {
  WOCHENTAGE,
  fensterProTag,
  fensterText,
  ueberschneidetSich,
  zeitZuMinuten,
  zeitAnzeige,
  type Zeitfenster,
} from '@/lib/availability'
import { logger } from '@/lib/logger'
const log = logger.child('engel:verfuegbarkeit')

type Slot = Zeitfenster & { id: string }

// Häufigster Fall zuerst: klassische Bürozeiten Mo–Fr.
const VORLAGE = { tage: [1, 2, 3, 4, 5], start: '09:00', ende: '17:00' }

export default function VerfuegbarkeitPage() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [angelId, setAngelId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [offenerTag, setOffenerTag] = useState<number | null>(null)
  const [neuStart, setNeuStart] = useState('09:00')
  const [neuEnde, setNeuEnde] = useState('14:00')

  async function laden() {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setAngelId(user.id)

      const { data, error: dbError } = await supabase
        .from('angel_availability')
        .select('id, weekday, start_time, end_time')
        .eq('angel_id', user.id)
      if (dbError) throw dbError
      setSlots((data || []) as Slot[])
    } catch (err) {
      log.errorWithException('Verfügbarkeit laden', err)
      // PGRST205 = Tabelle fehlt im Schema-Cache. Das heißt: die Migration
      // 20260719_angel_availability.sql ist noch nicht eingespielt — kein
      // Fehler, den ein Wiederholen behebt.
      const code = (err as { code?: string })?.code
      setError(
        code === 'PGRST205'
          ? 'Der Verfügbarkeitskalender ist noch nicht freigeschaltet. Bitte wende dich kurz an das Team von Alltagsengel.'
          : 'Deine Zeiten konnten nicht geladen werden. Bitte versuche es später erneut.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { laden() }, [])

  async function fensterHinzufuegen(weekday: number, start: string, ende: string) {
    if (!angelId) return
    const s = zeitZuMinuten(start)
    const e = zeitZuMinuten(ende)
    if (s === null || e === null) { setError('Bitte gültige Uhrzeiten angeben.'); return }
    if (e <= s) { setError('Das Ende muss nach dem Beginn liegen.'); return }
    if (ueberschneidetSich(slots, weekday, start, ende)) {
      setError('Dieses Zeitfenster überschneidet sich mit einem bestehenden.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const result = await addAvailabilitySlot(weekday, start, ende)
      if (!result.ok) { setError(result.error); return }
      setSlots(prev => [...prev, result.data])
      setOffenerTag(null)
    } catch (err) {
      log.errorWithException('Zeitfenster speichern', err)
      setError('Das Zeitfenster konnte nicht gespeichert werden.')
    } finally {
      setBusy(false)
    }
  }

  async function fensterLoeschen(id: string) {
    setBusy(true)
    setError('')
    try {
      const result = await deleteAvailabilitySlot(id)
      if (!result.ok) { setError(result.error); return }
      setSlots(prev => prev.filter(s => s.id !== id))
    } catch (err) {
      log.errorWithException('Zeitfenster löschen', err)
      setError('Das Zeitfenster konnte nicht gelöscht werden.')
    } finally {
      setBusy(false)
    }
  }

  async function vorlageUebernehmen() {
    if (!angelId) return
    const fehlende = VORLAGE.tage.filter(
      tag => !ueberschneidetSich(slots, tag, VORLAGE.start, VORLAGE.ende)
    )
    if (fehlende.length === 0) return

    setBusy(true)
    setError('')
    try {
      const result = await applyDefaultTemplate(fehlende, VORLAGE.start, VORLAGE.ende)
      if (!result.ok) { setError(result.error); return }
      setSlots(prev => [...prev, ...result.data])
    } catch (err) {
      log.errorWithException('Vorlage übernehmen', err)
      setError('Die Vorlage konnte nicht übernommen werden.')
    } finally {
      setBusy(false)
    }
  }

  const stundenGesamt = slots.reduce((summe, s) => {
    const start = zeitZuMinuten(s.start_time)
    const ende = zeitZuMinuten(s.end_time)
    return start !== null && ende !== null ? summe + (ende - start) / 60 : summe
  }, 0)

  if (loading) {
    return (
      <div className="screen">
        <div className="topbar" style={{ paddingTop: 14 }}>
          <div className="topbar-title">Verfügbarkeit</div>
        </div>
        <div style={{ padding: 24, color: 'var(--ink3)', fontSize: 14 }}>Wird geladen…</div>
      </div>
    )
  }

  return (
    <div className="screen" id="verfuegbarkeit">
      <div className="topbar" style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/engel/profil" style={{ color: 'var(--ink3)', fontSize: 24, textDecoration: 'none', lineHeight: 1 }}>‹</Link>
        <div className="topbar-title">Meine Verfügbarkeit</div>
      </div>

      <div style={{ padding: '0 18px 100px' }}>
        <p style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6, margin: '10px 0 16px' }}>
          Trage ein, wann du regelmäßig Zeit hast. Kundinnen und Kunden sehen dich
          nur bei Anfragen, die in eines deiner Zeitfenster passen — so bekommst du
          weniger Anfragen, die du absagen musst.
        </p>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', borderRadius: 12, background: 'var(--coal2)',
          border: '1px solid var(--border)', marginBottom: 16,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
              {slots.length === 0 ? 'Noch keine Zeiten hinterlegt' : `${slots.length} Zeitfenster`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
              {stundenGesamt > 0 ? `${stundenGesamt.toFixed(1).replace('.', ',')} Std. pro Woche` : 'Du erhältst Anfragen für jede Uhrzeit'}
            </div>
          </div>
          {slots.length === 0 && (
            <button
              onClick={vorlageUebernehmen}
              disabled={busy}
              style={{
                padding: '9px 14px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,var(--gold),var(--gold2))',
                color: 'var(--coal)', fontSize: 12, fontWeight: 600,
                cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Mo–Fr 9–17
            </button>
          )}
        </div>

        {error && (
          <div style={{
            padding: '10px 12px', borderRadius: 10, marginBottom: 14,
            background: 'rgba(255,80,80,.1)', border: '1px solid rgba(255,80,80,.3)',
            color: '#ff6b6b', fontSize: 12.5,
          }}>{error}</div>
        )}

        {WOCHENTAGE.map(tag => {
          const tagesFenster = fensterProTag(slots, tag.nr) as Slot[]
          const offen = offenerTag === tag.nr
          return (
            <div key={tag.nr} style={{
              borderRadius: 14, background: 'var(--coal2)', border: '1px solid var(--border)',
              padding: 14, marginBottom: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{tag.lang}</div>
                <button
                  onClick={() => { setOffenerTag(offen ? null : tag.nr); setError('') }}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border2)',
                    background: 'transparent', color: offen ? 'var(--gold)' : 'var(--ink3)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {offen ? 'Abbrechen' : '+ Zeit'}
                </button>
              </div>

              {tagesFenster.length === 0 && !offen && (
                <div style={{ fontSize: 12.5, color: 'var(--ink5)', marginTop: 8 }}>Nicht verfügbar</div>
              )}

              {tagesFenster.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {tagesFenster.map(f => (
                    <span key={f.id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', borderRadius: 9,
                      background: 'rgba(212,175,55,.12)', border: '1px solid rgba(212,175,55,.3)',
                      color: 'var(--ink)', fontSize: 12.5,
                    }}>
                      {fensterText(f)}
                      <button
                        onClick={() => fensterLoeschen(f.id)}
                        disabled={busy}
                        aria-label={`${tag.lang} ${zeitAnzeige(f.start_time)} entfernen`}
                        style={{
                          border: 'none', background: 'transparent', color: 'var(--ink4)',
                          fontSize: 15, lineHeight: 1, cursor: busy ? 'not-allowed' : 'pointer', padding: 0,
                        }}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}

              {offen && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <input
                    type="time"
                    value={neuStart}
                    onChange={e => setNeuStart(e.target.value)}
                    aria-label="Beginn"
                    style={zeitFeld}
                  />
                  <span style={{ color: 'var(--ink4)', fontSize: 13 }}>bis</span>
                  <input
                    type="time"
                    value={neuEnde}
                    onChange={e => setNeuEnde(e.target.value)}
                    aria-label="Ende"
                    style={zeitFeld}
                  />
                  <button
                    onClick={() => fensterHinzufuegen(tag.nr, neuStart, neuEnde)}
                    disabled={busy}
                    style={{
                      padding: '10px 14px', borderRadius: 9, border: 'none',
                      background: 'linear-gradient(135deg,var(--gold),var(--gold2))',
                      color: 'var(--coal)', fontSize: 12.5, fontWeight: 600,
                      cursor: busy ? 'not-allowed' : 'pointer',
                    }}
                  >Speichern</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const zeitFeld: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: '9px 10px', borderRadius: 9,
  border: '1px solid var(--border2)', background: 'var(--coal)',
  color: 'var(--ink)', fontSize: 13, outline: 'none',
}
