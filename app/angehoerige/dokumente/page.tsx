'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { requireUser } from '@/lib/supabase/require-session'
import { IconDocument, IconShield } from '@/components/Icons'

interface Dokument {
  id: string
  titel: string
  dokument_typ: string
  kategorie: string
  dateiname: string
  mime_type: string
  dokument_datum: string | null
  status: string
  sichtbarkeit: string
  client_id: string | null
  client_name: string
  created_at: string
}

const TYP_LABEL: Record<string, string> = {
  vertrag: 'Vertrag',
  verordnung: 'Verordnung',
  genehmigung: 'Genehmigung',
  vollmacht: 'Vollmacht',
  abtretungserklaerung: 'Abtretungserklärung',
  pflegegradbescheid: 'Pflegegradbescheid',
  kostentraegerzusage: 'Kostenträgerzusage',
  leistungsnachweis: 'Leistungsnachweis',
  rechnung: 'Rechnung',
  schriftverkehr: 'Schriftverkehr',
  bescheinigung: 'Bescheinigung',
  einwilligung: 'Einwilligung',
  datenschutzerklaerung: 'Datenschutzerklärung',
  sonstiges: 'Sonstiges',
}

const KATEGORIE_LABEL: Record<string, string> = {
  stammdaten: 'Stammdaten',
  vertrag: 'Vertrag',
  pflege: 'Pflege',
  abrechnung: 'Abrechnung',
  genehmigung: 'Genehmigung',
  korrespondenz: 'Korrespondenz',
  allgemein: 'Allgemein',
}

export default function DokumentePage() {
  const router = useRouter()
  const [dokumente, setDokumente] = useState<Dokument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterKategorie, setFilterKategorie] = useState<string>('alle')

  async function load() {
    setError('')
    setLoading(true)
    try {
      const user = await requireUser(router, { redirectTo: '/angehoerige/dokumente' })
      if (!user) return

      const res = await fetch('/api/angehoerige/portal/dokumente')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Dokumente konnten nicht geladen werden.')
      }
      const data = await res.json()
      setDokumente(data.dokumente ?? [])
    } catch (err: any) {
      setError(err?.message || 'Ein Fehler ist aufgetreten.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Eindeutige Kategorien für Filter sammeln
  const kategorien = [...new Set(dokumente.map(d => d.kategorie))]
  const filtered = filterKategorie === 'alle'
    ? dokumente
    : dokumente.filter(d => d.kategorie === filterKategorie)

  if (loading) {
    return (
      <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="gold-spinner" />
          <p style={{ color: 'var(--ink4)', fontSize: 13, marginTop: 16 }}>Dokumente werden geladen...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
        <IconShield size={48} color="var(--gold)" />
        <p style={{ color: 'var(--ink4)', fontSize: 14, marginTop: 12 }}>{error}</p>
        <button
          onClick={() => { setError(''); load() }}
          style={{ marginTop: 16, padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,var(--gold),var(--gold2))', color: 'var(--coal)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Erneut versuchen
        </button>
      </div>
    )
  }

  return (
    <div className="screen">
      <div style={{ padding: '24px 20px 16px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Dokumente</h1>
        <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '4px 0 0' }}>
          Freigegebene Unterlagen und Dokumente
        </p>
      </div>

      {/* Kategorie-Filter */}
      {kategorien.length > 1 && (
        <div style={{ display: 'flex', gap: 8, padding: '0 20px 16px', overflowX: 'auto' }}>
          <button
            onClick={() => setFilterKategorie('alle')}
            style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', whiteSpace: 'nowrap',
              background: filterKategorie === 'alle' ? 'linear-gradient(135deg,var(--gold),var(--gold2))' : 'rgba(255,255,255,0.06)',
              color: filterKategorie === 'alle' ? 'var(--coal)' : 'var(--ink3)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Alle
          </button>
          {kategorien.map(k => (
            <button
              key={k}
              onClick={() => setFilterKategorie(k)}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', whiteSpace: 'nowrap',
                background: filterKategorie === k ? 'linear-gradient(135deg,var(--gold),var(--gold2))' : 'rgba(255,255,255,0.06)',
                color: filterKategorie === k ? 'var(--coal)' : 'var(--ink3)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {KATEGORIE_LABEL[k] || k}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: '0 20px 100px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <IconDocument size={48} color="var(--ink4)" />
            <p style={{ color: 'var(--ink4)', fontSize: 14, marginTop: 12 }}>
              Keine Dokumente vorhanden.
            </p>
          </div>
        ) : (
          filtered.map(dok => (
            <div key={dok.id} className="portal-list-item">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(201,150,60,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <IconDocument size={18} color="var(--gold2)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                    {dok.titel}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 2 }}>
                    {TYP_LABEL[dok.dokument_typ] || dok.dokument_typ}
                    {dok.client_name && dok.client_name !== 'Allgemein' && ` • ${dok.client_name}`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span>{KATEGORIE_LABEL[dok.kategorie] || dok.kategorie}</span>
                    {dok.dokument_datum && (
                      <span>Datum: {new Date(dok.dokument_datum).toLocaleDateString('de-DE')}</span>
                    )}
                    <span>{new Date(dok.created_at).toLocaleDateString('de-DE')}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Hinweis */}
        <div style={{
          marginTop: 20, padding: '12px 16px', borderRadius: 10,
          background: 'rgba(201,150,60,0.06)', border: '1px solid rgba(201,150,60,0.15)',
          fontSize: 12, color: 'var(--ink4)', lineHeight: 1.6,
        }}>
          Hier werden nur vom Pflegedienst freigegebene Dokumente angezeigt.
          Für weitere Unterlagen wenden Sie sich bitte an Ihren Ansprechpartner.
        </div>
      </div>
    </div>
  )
}
