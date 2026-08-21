'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import { IconCheck, IconClock, IconClipboard } from '@/components/Icons'
import { updateTaskStatus } from './actions'
import { logger } from '@/lib/logger'
const log = logger.child('engel:aufgaben')

const STATUS_META: Record<string, { label: string; color: string }> = {
  offen: { label: 'Offen', color: '#2196F3' },
  in_bearbeitung: { label: 'In Bearbeitung', color: '#FF9800' },
  warten: { label: 'Wartend', color: '#9E9E9E' },
  erledigt: { label: 'Erledigt', color: '#5CB882' },
  storniert: { label: 'Storniert', color: '#9E9E9E' },
}

const PRIO_META: Record<string, { label: string; color: string }> = {
  niedrig: { label: 'Niedrig', color: '#9E9E9E' },
  mittel: { label: 'Mittel', color: '#2196F3' },
  hoch: { label: 'Hoch', color: '#FF9800' },
  kritisch: { label: 'Kritisch', color: '#D04B3B' },
}

const KAT_META: Record<string, string> = {
  allgemein: 'Allgemein', kunde: 'Kunde', mitarbeiter: 'Mitarbeiter',
  einsatz: 'Einsatz', dokument: 'Dokument', verordnung: 'Verordnung',
  abrechnung: 'Abrechnung', pflege: 'Pflege', qualifikation: 'Qualifikation',
  dienstplan: 'Dienstplan', urlaub: 'Urlaub', kommunikation: 'Kommunikation',
  system: 'System',
}

const TABS = [
  { key: 'offen', label: 'Offen' },
  { key: 'in_bearbeitung', label: 'In Bearbeitung' },
  { key: 'erledigt', label: 'Erledigt' },
] as const

interface Aufgabe {
  id: string
  titel: string
  beschreibung: string | null
  kategorie: string
  prioritaet: string
  status: string
  faellig_am: string | null
  faelligkeits_status: string
  verantwortlich_name: string
  client_name: string
  caregiver_name: string
  checkliste_gesamt: number
  checkliste_erledigt: number
  kommentare_anzahl: number
  created_at: string
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function EngelAufgabenPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([])
  const [tab, setTab] = useState<string>('offen')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [statusError, setStatusError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const user = await requireUser(router, { redirectTo: '/engel/aufgaben' })
      if (!user) { setLoading(false); return }
      const supabase = createClient()

      // RLS ensures only tasks assigned to this user are returned
      const { data, error: err } = await supabase
        .from('ops_aufgaben_uebersicht')
        .select('*')
        .or(`verantwortlich_id.eq.${user.id},stellvertreter_id.eq.${user.id},erstellt_von.eq.${user.id}`)
        .order('faellig_am', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (err) throw err
      setAufgaben((data || []) as Aufgabe[])
    } catch (e: any) {
      log.errorWithException('Aufgaben load error', e)
      setError('Fehler beim Laden der Aufgaben')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { load() }, [load])

  const updateStatus = async (id: string, newStatus: string) => {
    setSaving(true)
    setStatusError('')
    try {
      const result = await updateTaskStatus(id, newStatus)
      if (!result.ok) {
        setStatusError(result.error)
        setTimeout(() => setStatusError(''), 4000)
      } else {
        await load()
      }
    } catch (e: any) {
      log.errorWithException('Status update error', e)
      setStatusError('Status konnte nicht geändert werden. Bitte erneut versuchen.')
      setTimeout(() => setStatusError(''), 4000)
    } finally {
      setSaving(false)
    }
  }

  const filtered = aufgaben.filter(a => {
    if (tab === 'offen') return a.status === 'offen' || a.status === 'warten'
    if (tab === 'in_bearbeitung') return a.status === 'in_bearbeitung'
    if (tab === 'erledigt') return a.status === 'erledigt' || a.status === 'storniert'
    return true
  })

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)' }}>
        <div style={{ fontSize: 14 }}>Lade Aufgaben...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>!</div>
        <p style={{ color: 'var(--ink3)', fontSize: 14, marginBottom: 16 }}>{error}</p>
        <button onClick={load} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--gold), var(--gold2))', color: 'var(--coal)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Erneut versuchen
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, fontFamily: "'Cormorant Garamond', serif" }}>
        Meine Aufgaben
      </h1>
      <p style={{ fontSize: 13, color: 'var(--ink4)', marginBottom: 16 }}>
        {aufgaben.filter(a => a.status !== 'erledigt' && a.status !== 'storniert').length} offene Aufgaben
      </p>

      {statusError && (
        <div style={{
          background: 'rgba(208,75,59,0.12)', border: '1px solid rgba(208,75,59,0.4)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 12,
          fontSize: 13, color: '#D04B3B',
        }}>
          {statusError}
        </div>
      )}

      {/* Status Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              border: tab === t.key ? 'none' : '1px solid var(--border)',
              borderRadius: 20,
              background: tab === t.key ? 'linear-gradient(135deg, var(--gold2), var(--gold))' : 'var(--coal2)',
              color: tab === t.key ? 'var(--coal)' : 'var(--ink3)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
            {tab === t.key && ` (${filtered.length})`}
          </button>
        ))}
      </div>

      {/* Task List */}
      {filtered.length === 0 ? (
        <div style={{ background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <IconClipboard size={28} color="var(--ink4)" />
          <div style={{ fontSize: 14, color: 'var(--ink4)', marginTop: 8 }}>Keine Aufgaben in dieser Kategorie</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(a => {
            const sm = STATUS_META[a.status] || { label: a.status, color: '#999' }
            const pm = PRIO_META[a.prioritaet] || { label: a.prioritaet, color: '#999' }
            const isExpanded = expandedId === a.id
            const isOverdue = a.faelligkeits_status === 'ueberfaellig'

            return (
              <div role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (() => setExpandedId(isExpanded ? null : a.id))() } }}
                key={a.id}
                style={{
                  background: 'var(--coal2)',
                  border: `1px solid ${isOverdue ? 'rgba(208,75,59,0.4)' : 'var(--border)'}`,
                  borderRadius: 14,
                  padding: '14px 16px',
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedId(isExpanded ? null : a.id)}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>
                      {a.titel}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: sm.color,
                    background: `${sm.color}18`, padding: '3px 10px', borderRadius: 6,
                    marginLeft: 8, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {sm.label}
                  </span>
                </div>

                {/* Meta badges */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: pm.color, background: `${pm.color}18`, padding: '2px 8px', borderRadius: 4 }}>
                    {pm.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--ink4)', background: 'var(--coal3)', padding: '2px 8px', borderRadius: 4 }}>
                    {KAT_META[a.kategorie] || a.kategorie}
                  </span>
                  {a.faellig_am && (
                    <span style={{
                      fontSize: 11,
                      color: isOverdue ? '#D04B3B' : 'var(--ink4)',
                      background: isOverdue ? 'rgba(208,75,59,0.1)' : 'var(--coal3)',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}>
                      <IconClock size={10} /> {fmtDate(a.faellig_am)}
                    </span>
                  )}
                </div>

                {/* Context line */}
                {a.client_name && (
                  <div style={{ fontSize: 12, color: 'var(--gold2)', marginBottom: 2 }}>
                    Kunde: {a.client_name}
                  </div>
                )}

                {/* Checklist progress */}
                {a.checkliste_gesamt > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 4 }}>
                    <IconCheck size={10} /> {a.checkliste_erledigt}/{a.checkliste_gesamt} Punkte erledigt
                  </div>
                )}

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    {a.beschreibung && (
                      <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 12, lineHeight: 1.5 }}>
                        {a.beschreibung}
                      </div>
                    )}

                    {a.kommentare_anzahl > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--ink4)', marginBottom: 12 }}>
                        {a.kommentare_anzahl} Kommentar{a.kommentare_anzahl !== 1 ? 'e' : ''}
                      </div>
                    )}

                    {/* Status action buttons */}
                    {a.status !== 'erledigt' && a.status !== 'storniert' && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {a.status === 'offen' && (
                          <button
                            onClick={e => { e.stopPropagation(); updateStatus(a.id, 'in_bearbeitung') }}
                            disabled={saving}
                            style={{
                              flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                              background: 'linear-gradient(135deg, #FF9800, #F57C00)', color: '#fff',
                              border: 'none', borderRadius: 10, cursor: 'pointer',
                              opacity: saving ? 0.5 : 1,
                            }}
                          >
                            Starten
                          </button>
                        )}
                        {(a.status === 'offen' || a.status === 'in_bearbeitung' || a.status === 'warten') && (
                          <button
                            onClick={e => { e.stopPropagation(); updateStatus(a.id, 'erledigt') }}
                            disabled={saving}
                            style={{
                              flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                              background: 'linear-gradient(135deg, #5CB882, #43A047)', color: '#fff',
                              border: 'none', borderRadius: 10, cursor: 'pointer',
                              opacity: saving ? 0.5 : 1,
                            }}
                          >
                            Erledigt
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
