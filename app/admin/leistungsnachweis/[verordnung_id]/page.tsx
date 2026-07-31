'use client'
// ═══════════════════════════════════════════════════════════════
// Admin: Leistungsnachweis-Druckseite
// ═══════════════════════════════════════════════════════════════
// /admin/leistungsnachweis/[verordnung_id]?monat=YYYY-MM
//
// Lädt Verordnung + Klient + service_records des Monats und rendert
// den kassenkonformen Leistungsnachweis als druckbare A4-Seite
// (CSS @media print). „Als PDF drucken" nutzt window.print() —
// funktioniert sofort, ohne Server-Roundtrip und ohne Dependencies.
// Alle Pflichtfelder der Kasse inkl. Handzeichen-Spalten,
// Unterschriftslinien und Stempelfeld. DejaVu Sans für den Druck.
// ═══════════════════════════════════════════════════════════════
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  buildLeistungsnachweisHtml,
  loadLeistungsnachweis,
  type LeistungsnachweisData,
} from '@/lib/abrechnung/leistungsnachweis-pdf'

const GOLD = '#C9963C'
const COAL = '#1A1612'

function aktuellerMonat(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function LeistungsnachweisInner() {
  const params = useParams<{ verordnung_id: string }>()
  const searchParams = useSearchParams()
  const verordnungId = params?.verordnung_id
  const [monat, setMonat] = useState(searchParams.get('monat') || aktuellerMonat())
  const [data, setData] = useState<LeistungsnachweisData | null>(null)
  const [html, setHtml] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!verordnungId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const supabase = createClient()
        const d = await loadLeistungsnachweis({ verordnung_id: verordnungId, monat, supabase })
        if (cancelled) return
        setData(d)
        setHtml(buildLeistungsnachweisHtml(d))
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Leistungsnachweis konnte nicht geladen werden.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [verordnungId, monat])

  // Druck über ein verstecktes iframe: so wird NUR der Nachweis gedruckt,
  // ohne Admin-Navigation, in sauberem A4 mit eigenem Stylesheet.
  const drucken = useCallback(() => {
    if (!html) return
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (!doc) return
    doc.open()
    doc.write(html)
    doc.close()
    iframe.onload = () => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }
  }, [html])

  const herunterladen = useCallback(() => {
    if (!html || !data) return
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Leistungsnachweis_${data.klient.name.replace(/[^a-zA-ZäöüÄÖÜß0-9-]/g, '_')}_${monat}.html`
    a.click()
    URL.revokeObjectURL(url)
  }, [html, data, monat])

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      {/* ── Steuerleiste (wird nicht gedruckt) ── */}
      <div
        className="ln-controls"
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: COAL, margin: 0, flex: 1 }}>
          Leistungsnachweis
        </h1>
        <label style={{ fontSize: 13, color: '#555' }}>
          Monat{' '}
          <input
            type="month"
            value={monat}
            onChange={e => setMonat(e.target.value)}
            style={{
              padding: '6px 10px',
              border: '1px solid #ddd',
              borderRadius: 8,
              fontSize: 14,
            }}
          />
        </label>
        <button
          onClick={drucken}
          disabled={!html || loading}
          style={{
            background: GOLD,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Als PDF drucken
        </button>
        <button
          onClick={herunterladen}
          disabled={!html || loading}
          style={{
            background: '#fff',
            color: COAL,
            border: `1px solid ${GOLD}`,
            borderRadius: 8,
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Herunterladen
        </button>
      </div>

      {loading && <p style={{ color: '#777' }}>Leistungsnachweis wird geladen…</p>}
      {error && (
        <div
          style={{
            background: '#FBEFE9',
            border: '1px solid #D04B3B',
            color: '#8A2E1B',
            padding: '12px 16px',
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      )}

      {/* ── Warnungen zu fehlenden Pflichtfeldern ── */}
      {data && data.warnungen.length > 0 && (
        <div
          className="ln-controls"
          style={{
            background: '#FDF6E7',
            border: `1px solid ${GOLD}`,
            color: '#7A5314',
            padding: '12px 16px',
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          <b>Vor dem Einreichen prüfen:</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {data.warnungen.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── A4-Vorschau ── */}
      {html && (
        <div
          style={{
            background: '#fff',
            boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <iframe
            title="Leistungsnachweis-Vorschau"
            srcDoc={html}
            style={{ width: '100%', height: '1160px', border: 'none' }}
          />
        </div>
      )}
    </div>
  )
}

export default function LeistungsnachweisPage() {
  return (
    <Suspense fallback={<p style={{ padding: 24, color: '#777' }}>Lädt…</p>}>
      <LeistungsnachweisInner />
    </Suspense>
  )
}
