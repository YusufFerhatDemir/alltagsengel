'use client'
// ═══════════════════════════════════════════════════════════════
// BUNDESLAND-UMSCHALTER — Seitenleiste der Admin-Oberfläche
// ═══════════════════════════════════════════════════════════════
// Steht direkt unter dem Organisations-Umschalter. Die Auswahl wirkt
// auf alle Admin-Listen, die bundeslandbezogen sind (Klienten,
// Rechnungen, Tarife, Expansion).
//
// Der Punkt links zeigt sofort, ob im gewählten Land bereits mit der
// Kasse abgerechnet werden darf:
//   grün  = Kassenabrechnung frei
//   gold  = Verfahren läuft, Privatleistungen aktiv
//   grau  = nur Werbung/Registrierung/Warteliste
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import {
  ALLE_BUNDESLAENDER,
  STATUS_META,
  type ExpansionStatus,
} from '@/lib/expansion/types'
import { useBundeslandFilter } from './BundeslandContext'

interface LandZeile {
  code: string
  label: string
  status: ExpansionStatus
  insurance_enabled: boolean
  private_enabled: boolean
}

function punktFarbe(land: LandZeile | undefined): string {
  if (!land) return 'var(--ink5, #999)'
  if (land.insurance_enabled) return '#3E8E5A'
  if (land.private_enabled) return 'var(--gold2, #C9963C)'
  return 'var(--ink5, #999)'
}

export default function BundeslandSwitcher() {
  const { aktiv, setAktiv } = useBundeslandFilter()
  const [laender, setLaender] = useState<LandZeile[]>([])
  const [wechselt, setWechselt] = useState(false)

  useEffect(() => {
    let abgebrochen = false
    fetch('/api/expansion/switch')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (abgebrochen || !data) return
        setLaender(data.laender || [])
        if (data.aktiv) setAktiv(data.aktiv)
      })
      .catch(() => { /* Migration evtl. noch nicht angewendet — Umschalter bleibt leer */ })
    return () => { abgebrochen = true }
    // setAktiv ist stabil (useCallback im Provider)
  }, [setAktiv])

  async function wechseln(wert: string) {
    if (wert === aktiv || wechselt) return
    setWechselt(true)
    const vorher = aktiv
    setAktiv(wert)   // sofortige UI-Reaktion, ohne auf den Server zu warten
    try {
      const res = await fetch('/api/expansion/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundesland: wert }),
      })
      if (!res.ok) {
        setAktiv(vorher)
        const json = await res.json().catch(() => null)
        alert(json?.error || 'Wechsel fehlgeschlagen')
      }
    } catch {
      setAktiv(vorher)
    } finally {
      setWechselt(false)
    }
  }

  // Ohne Daten (Migration fehlt) gar nichts anzeigen — kein toter Schalter.
  if (laender.length === 0) return null

  const gewaehlt = laender.find(l => l.code === aktiv)
  const anerkannt = laender.filter(l => l.insurance_enabled).length

  return (
    <div style={{ padding: '4px 12px 10px' }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase',
        color: 'var(--ink5, #999)', padding: '0 0 4px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6,
      }}>
        <span>Bundesland</span>
        <span style={{ fontSize: 9, letterSpacing: 0, textTransform: 'none' }}>
          {anerkannt}/16 mit Kasse
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span
          title={
            aktiv === ALLE_BUNDESLAENDER
              ? 'Kein Filter — alle Bundesländer'
              : gewaehlt?.insurance_enabled
                ? 'Kassenabrechnung freigeschaltet'
                : `${STATUS_META[gewaehlt?.status ?? 'VORBEREITUNG'].label} — keine Kassenabrechnung`
          }
          style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: aktiv === ALLE_BUNDESLAENDER ? 'var(--ink4, #777)' : punktFarbe(gewaehlt),
          }}
        />
        <select
          value={aktiv}
          disabled={wechselt}
          onChange={e => wechseln(e.target.value)}
          style={{
            flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 8, fontSize: 12,
            fontFamily: 'inherit', background: 'var(--coal, #1A1612)',
            color: 'var(--ink, #F7F2EA)', border: '1px solid var(--border, #332E24)',
            cursor: wechselt ? 'wait' : 'pointer', outline: 'none',
          }}
        >
          <option value={ALLE_BUNDESLAENDER}>Alle Bundesländer</option>
          {laender.map(l => (
            <option key={l.code} value={l.code}>
              {l.insurance_enabled ? '✓ ' : ''}{l.label}
            </option>
          ))}
        </select>
      </div>

      {aktiv !== ALLE_BUNDESLAENDER && gewaehlt && !gewaehlt.insurance_enabled && (
        <div style={{ fontSize: 10, color: 'var(--ink5, #999)', marginTop: 5, lineHeight: 1.4 }}>
          {STATUS_META[gewaehlt.status].label} — keine Kassenabrechnung
          {gewaehlt.private_enabled ? ', Privatleistungen aktiv' : ''}
        </div>
      )}
    </div>
  )
}
