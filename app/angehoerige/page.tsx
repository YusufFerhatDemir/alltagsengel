'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import { IconCalendar, IconChat, IconClipboard, IconDocument, IconUser, IconHeart, IconShield } from '@/components/Icons'
import type { AngehoerigenZugang, FreigabeBereich } from '@/lib/angehoerige/types'
import { ROLLEN_LABEL, BEREICH_LABEL } from '@/lib/angehoerige/types'

interface ZugangMitClient extends AngehoerigenZugang {
  client_name: string
  client_pflegegrad: number | null
  client_status: string
}

interface DashboardData {
  zugaenge: ZugangMitClient[]
  zusammenfassung: {
    termine_kommend: number
    nachrichten_ungelesen: number
    letzte_leistungen: any[]
  }
}

export default function AngehoerigenPortalPage() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setError('')
    setLoading(true)
    try {
      const user = await requireUser(router, { redirectTo: '/angehoerige' })
      if (!user) return

      const supabase = createClient()
      const { data: p } = await supabase.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()
      setProfile(p)

      const res = await fetch('/api/angehoerige/portal')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Daten konnten nicht geladen werden.')
      }

      setData(await res.json())
    } catch (err: any) {
      setError(err?.message || 'Ein Fehler ist aufgetreten.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="gold-spinner" />
          <p style={{ color: 'var(--ink4)', fontSize: 13, marginTop: 16 }}>Portal wird geladen...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>
          <IconShield size={48} color="var(--gold)" />
        </div>
        <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Zugang nicht verfügbar</h2>
        <p style={{ color: 'var(--ink4)', fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>{error}</p>
        <button
          onClick={() => { setError(''); load() }}
          style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,var(--gold),var(--gold2))', color: 'var(--coal)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Erneut versuchen
        </button>
      </div>
    )
  }

  if (!data) return null

  const firstName = profile?.first_name || 'Angehörige(r)'

  return (
    <div className="screen">
      {/* Header */}
      <div style={{ padding: '24px 20px 16px', background: 'linear-gradient(135deg, rgba(201,150,60,0.08), transparent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--ink4)' }}>Angehörigenportal</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
              Hallo, {firstName}
            </div>
          </div>
          <div style={{
            width: 40, height: 40, borderRadius: 20,
            background: 'linear-gradient(135deg, var(--gold), var(--gold2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconUser size={20} color="var(--coal)" />
          </div>
        </div>
      </div>

      <div style={{ padding: '0 20px 100px' }}>
        {/* Schnellzugriff-Karten */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <Link href="/angehoerige/termine" style={{ textDecoration: 'none' }}>
            <div className="portal-stat-card">
              <div className="portal-stat-icon" style={{ background: 'rgba(92,184,130,0.12)' }}>
                <IconCalendar size={20} color="var(--green)" />
              </div>
              <div className="portal-stat-value">{data.zusammenfassung.termine_kommend}</div>
              <div className="portal-stat-label">Termine</div>
            </div>
          </Link>
          <Link href="/angehoerige/kommunikation" style={{ textDecoration: 'none' }}>
            <div className="portal-stat-card">
              <div className="portal-stat-icon" style={{ background: 'rgba(201,150,60,0.12)' }}>
                <IconChat size={20} color="var(--gold2)" />
              </div>
              <div className="portal-stat-value">
                {data.zusammenfassung.nachrichten_ungelesen}
                {data.zusammenfassung.nachrichten_ungelesen > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--gold2)', marginLeft: 4 }}>neu</span>
                )}
              </div>
              <div className="portal-stat-label">Nachrichten</div>
            </div>
          </Link>
          <Link href="/angehoerige/pflegebericht" style={{ textDecoration: 'none' }}>
            <div className="portal-stat-card">
              <div className="portal-stat-icon" style={{ background: 'rgba(114,137,218,0.12)' }}>
                <IconClipboard size={20} color="#7289DA" />
              </div>
              <div className="portal-stat-value">{data.zusammenfassung.letzte_leistungen.length}</div>
              <div className="portal-stat-label">Letzte Berichte</div>
            </div>
          </Link>
          <Link href="/angehoerige/dokumente" style={{ textDecoration: 'none' }}>
            <div className="portal-stat-card">
              <div className="portal-stat-icon" style={{ background: 'rgba(201,150,60,0.08)' }}>
                <IconDocument size={20} color="var(--ink3)" />
              </div>
              <div className="portal-stat-value">
                <IconDocument size={16} color="var(--ink3)" />
              </div>
              <div className="portal-stat-label">Dokumente</div>
            </div>
          </Link>
        </div>

        {/* Betreute Personen */}
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>
          Betreute Personen
        </h3>

        {data.zugaenge.map(zugang => (
          <div key={zugang.id} className="portal-client-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 22,
                background: 'linear-gradient(135deg, var(--gold), var(--gold2))',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <IconHeart size={20} color="var(--coal)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                  {zugang.client_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink4)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>{ROLLEN_LABEL[zugang.rolle]}</span>
                  {zugang.client_pflegegrad && (
                    <span>Pflegegrad {zugang.client_pflegegrad}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Freigegebene Bereiche */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {zugang.freigegebene_bereiche.map((bereich: FreigabeBereich) => (
                <span
                  key={bereich}
                  style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 6,
                    background: 'rgba(201,150,60,0.1)', color: 'var(--gold2)',
                    fontWeight: 500,
                  }}
                >
                  {BEREICH_LABEL[bereich] || bereich}
                </span>
              ))}
            </div>

            {zugang.gueltig_bis && (
              <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 8 }}>
                Zugang gültig bis: {new Date(zugang.gueltig_bis).toLocaleDateString('de-DE')}
              </div>
            )}
          </div>
        ))}

        {/* Letzte Leistungen */}
        {data.zusammenfassung.letzte_leistungen.length > 0 && (
          <>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '24px 0 12px' }}>
              Letzte Leistungen
            </h3>
            {data.zusammenfassung.letzte_leistungen.map((l: any) => (
              <div key={l.id} className="portal-list-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                      {l.service_type || 'Leistung'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink4)' }}>
                      {new Date(l.date).toLocaleDateString('de-DE')}
                      {l.duration_minutes ? ` • ${l.duration_minutes} Min.` : ''}
                    </div>
                  </div>
                  <span className={`portal-status portal-status--${l.status || 'draft'}`}>
                    {l.status === 'signed' ? 'Unterschrieben' :
                      l.status === 'completed' ? 'Abgeschlossen' :
                        l.status === 'draft' ? 'Entwurf' : l.status || 'Offen'}
                  </span>
                </div>
              </div>
            ))}
            <Link
              href="/angehoerige/pflegebericht"
              style={{
                display: 'block', textAlign: 'center', fontSize: 13,
                color: 'var(--gold2)', fontWeight: 600, padding: '12px 0',
                textDecoration: 'none',
              }}
            >
              Alle Berichte ansehen
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
