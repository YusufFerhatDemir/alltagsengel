'use client'
import { datumBerlin } from '@/lib/utils/timezone';
// ═══════════════════════════════════════════════════════════
// MEIN DIENSTPLAN (Engel)
// ═══════════════════════════════════════════════════════════
// Wochenansicht der eigenen Schichten. Nur Lesen — der Admin
// plant. RLS liefert automatisch nur eigene Eintraege.
// ═══════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  formatTime, statusMeta, fullName,
  DIENSTPLAN_STATUS, DIENSTPLAN_TYP,
} from '@/lib/admin/ops'
import { logger } from '@/lib/logger';
const log = logger.child('engel:dienstplan');

interface DienstplanEintrag {
  id: string
  datum: string
  start_zeit: string
  end_zeit: string
  pause_minuten: number
  status: string
  typ: string
  notizen: string | null
  clients: { first_name: string; last_name: string } | null
  dienstplan_schichten: { bezeichnung: string; farbe: string } | null
}

const WOCHENTAGE_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const WOCHENTAGE_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const mon = new Date(d)
  mon.setDate(diff)
  mon.setHours(0, 0, 0, 0)
  return mon
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function isoDate(d: Date): string {
  return datumBerlin(d)
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getDate()}.${d.getMonth() + 1}.`
}

export default function DienstplanPage() {
  const [eintraege, setEintraege] = useState<DienstplanEintrag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))

  async function laden(startDate: Date) {
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

      const von = isoDate(startDate)
      const bis = isoDate(addDays(startDate, 6))

      const { data, error: dbErr } = await supabase
        .from('dienstplan_eintraege')
        .select('id, datum, start_zeit, end_zeit, pause_minuten, status, typ, notizen, clients(first_name, last_name), dienstplan_schichten(bezeichnung, farbe)')
        .eq('caregiver_id', cgId)
        .gte('datum', von)
        .lte('datum', bis)
        .order('datum', { ascending: true })
        .order('start_zeit', { ascending: true })
      if (dbErr) throw dbErr
      // Supabase returns joined FK as arrays — normalize to single object or null
      const normalized = (data || []).map((row: any) => ({
        ...row,
        clients: Array.isArray(row.clients) ? row.clients[0] ?? null : row.clients,
        dienstplan_schichten: Array.isArray(row.dienstplan_schichten) ? row.dienstplan_schichten[0] ?? null : row.dienstplan_schichten,
      }))
      setEintraege(normalized as DienstplanEintrag[])
    } catch (err) {
      log.errorWithException('Dienstplan laden', err)
      const code = (err as { code?: string })?.code
      setError(
        code === 'PGRST205'
          ? 'Der Dienstplan ist noch nicht freigeschaltet.'
          : 'Dienstplan konnte nicht geladen werden.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { laden(weekStart) }, [weekStart])

  function navigateWeek(dir: -1 | 1) {
    setWeekStart(prev => addDays(prev, dir * 7))
  }

  // Eintraege nach Tagen gruppieren
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i)
    const dateStr = isoDate(date)
    const tagesEintraege = eintraege.filter(e => e.datum === dateStr)
    return { date, dateStr, tagesEintraege, wochentag: WOCHENTAGE_LANG[i], kurz: WOCHENTAGE_KURZ[i] }
  })

  const isCurrentWeek = isoDate(getMonday(new Date())) === isoDate(weekStart)
  const today = isoDate(new Date())

  if (loading && eintraege.length === 0) {
    return (
      <div className="screen">
        <div className="topbar" style={{ paddingTop: 14 }}>
          <div className="topbar-title">Mein Dienstplan</div>
        </div>
        <div style={{ padding: 24, color: 'var(--ink3)', fontSize: 14 }}>Wird geladen...</div>
      </div>
    )
  }

  return (
    <div className="screen" id="dienstplan">
      <div className="topbar" style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/engel/profil" style={{ color: 'var(--ink3)', fontSize: 24, textDecoration: 'none', lineHeight: 1 }}>&#8249;</Link>
        <div className="topbar-title">Mein Dienstplan</div>
      </div>

      <div style={{ padding: '0 18px 100px' }}>
        {/* Wochennavigation */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14,
        }}>
          <button onClick={() => navigateWeek(-1)} style={navBtn} aria-label="Vorherige Woche">&#8249;</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
              {formatDateShort(isoDate(weekStart))} - {formatDateShort(isoDate(addDays(weekStart, 6)))}
            </div>
            {isCurrentWeek && (
              <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600 }}>Aktuelle Woche</div>
            )}
          </div>
          <button onClick={() => navigateWeek(1)} style={navBtn} aria-label="Naechste Woche">&#8250;</button>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 14,
            background: 'rgba(208,75,59,.1)', border: '1px solid rgba(208,75,59,.3)',
            color: '#D04B3B', fontSize: 13,
          }}>{error}</div>
        )}

        {/* Tage */}
        {weekDays.map(day => {
          const isToday = day.dateStr === today
          return (
            <div key={day.dateStr} style={{ marginBottom: 12 }}>
              {/* Tagesheader */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: isToday ? 'var(--gold)' : 'var(--coal2)',
                  color: isToday ? 'var(--coal)' : 'var(--ink3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>{day.kurz}</div>
                <div>
                  <div style={{
                    fontSize: 13, fontWeight: isToday ? 700 : 500,
                    color: isToday ? 'var(--ink)' : 'var(--ink3)',
                  }}>{day.wochentag}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink4)' }}>{formatDateShort(day.dateStr)}</div>
                </div>
              </div>

              {/* Schichten des Tages */}
              {day.tagesEintraege.length === 0 ? (
                <div style={{
                  fontSize: 12, color: 'var(--ink5)', marginLeft: 46, paddingBottom: 4,
                }}>Keine Dienste</div>
              ) : (
                day.tagesEintraege.map(e => {
                  const stMeta = statusMeta(DIENSTPLAN_STATUS, e.status)
                  const typMeta = statusMeta(DIENSTPLAN_TYP, e.typ)
                  const schichtFarbe = e.dienstplan_schichten?.farbe || 'var(--gold)'
                  return (
                    <div key={e.id} style={{
                      background: 'var(--coal2)', border: '1px solid var(--border)',
                      borderRadius: 14, padding: '12px 14px', marginLeft: 46, marginBottom: 6,
                      borderLeft: `3px solid ${schichtFarbe}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                          {formatTime(e.start_zeit)} - {formatTime(e.end_zeit)}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, color: typMeta.color,
                            background: `${typMeta.color}18`, padding: '2px 8px', borderRadius: 5,
                          }}>{typMeta.label}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 600, color: stMeta.color,
                            background: `${stMeta.color}18`, padding: '2px 8px', borderRadius: 5,
                          }}>{stMeta.label}</span>
                        </div>
                      </div>
                      {e.dienstplan_schichten && (
                        <div style={{ fontSize: 12, color: schichtFarbe, fontWeight: 500, marginBottom: 2 }}>
                          {e.dienstplan_schichten.bezeichnung}
                        </div>
                      )}
                      {e.clients && (
                        <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                          Kunde: {fullName(e.clients)}
                        </div>
                      )}
                      {e.pause_minuten > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 2 }}>
                          Pause: {e.pause_minuten} min
                        </div>
                      )}
                      {e.notizen && (
                        <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 4, fontStyle: 'italic' }}>
                          {e.notizen}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )
        })}

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
