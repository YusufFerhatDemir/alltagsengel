'use client'
// ═══════════════════════════════════════════════════════════════
// Zeitreihen-Chart für Vitalwerte — pures SVG, keine Chart-Bibliothek.
// Zeichnet Warn-/Kritisch-Bänder aus den effektiven Grenzwerten,
// die Messreihe (Blutdruck: zwei Linien) und färbt Messpunkte nach
// Alarmstufe.
// ═══════════════════════════════════════════════════════════════
import { useMemo } from 'react'
import { VITAL_TYPEN, type Grenzwerte, type VitalSign, type VitalTyp } from '@/lib/vitals/types'
import { bewerteMesswert } from '@/lib/vitals/vitals'

const FARBEN = { ok: '#5CB882', warnung: '#E8A000', kritisch: '#D04B3B' }

interface Props {
  typ: VitalTyp
  /** Messungen in beliebiger Reihenfolge — der Chart sortiert selbst. */
  messungen: VitalSign[]
  /** Effektive Grenzwerte (klientenspezifisch oder Standard); null = keine Bänder. */
  grenzen: (Grenzwerte & { enabled?: boolean }) | null
  /**
   * MDR-Kill-Switch: nur wenn true werden Grenzwert-Bänder gezeichnet und
   * Messpunkte nach Alarmstufe eingefärbt. Fail-closed: ohne explizites true
   * zeigt der Chart eine reine, neutrale Verlaufskurve (nur Dokumentation).
   */
  alarmeAktiv?: boolean
  hoehe?: number
}

export default function VitalChart({ typ, messungen, grenzen, alarmeAktiv = false, hoehe = 260 }: Props) {
  const cfg = VITAL_TYPEN[typ]
  const breite = 720
  const pad = { links: 46, rechts: 12, oben: 12, unten: 28 }

  const daten = useMemo(() =>
    [...messungen]
      .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
      .map(m => ({
        t: new Date(m.measured_at).getTime(),
        y: Number(m.value),
        y2: m.value_secondary != null ? Number(m.value_secondary) : null,
        stufe: alarmeAktiv
          ? bewerteMesswert(typ, Number(m.value), m.value_secondary != null ? Number(m.value_secondary) : null, grenzen ? { ...grenzen, enabled: true } : null).stufe
          : 'ok' as const,
      })),
  [messungen, typ, grenzen, alarmeAktiv])

  if (daten.length === 0) {
    return <p style={{ color: 'var(--muted)', padding: 24, textAlign: 'center' }}>Keine Messungen im gewählten Zeitraum</p>
  }

  // Bänder nur bei freigeschalteter Alarmfunktion (MDR). Sonst reine Kurve.
  const aktiveGrenzen = alarmeAktiv && grenzen && grenzen.enabled !== false ? grenzen : null
  // Ohne Alarmfunktion neutrale Punktfarbe — kein „grün = ok"-Signal.
  const punktFarbe = (stufe: 'ok' | 'warnung' | 'kritisch') => (alarmeAktiv ? FARBEN[stufe] : 'var(--gold)')
  const grenzwertZahlen = aktiveGrenzen
    ? [
      aktiveGrenzen.min_warn, aktiveGrenzen.max_warn, aktiveGrenzen.min_critical, aktiveGrenzen.max_critical,
      aktiveGrenzen.min_warn_secondary, aktiveGrenzen.max_warn_secondary,
      aktiveGrenzen.min_critical_secondary, aktiveGrenzen.max_critical_secondary,
    ].filter((v): v is number => v != null)
    : []
  const werte = [...daten.map(d => d.y), ...daten.flatMap(d => (d.y2 != null ? [d.y2] : [])), ...grenzwertZahlen]
  const roheMin = Math.min(...werte)
  const roheMax = Math.max(...werte)
  const spanne = Math.max(roheMax - roheMin, 1)
  const yMin = roheMin - spanne * 0.1
  const yMax = roheMax + spanne * 0.1

  const tMin = daten[0].t
  const tMax = daten[daten.length - 1].t
  const tSpanne = Math.max(tMax - tMin, 1)

  const x = (t: number) => pad.links + ((t - tMin) / tSpanne) * (breite - pad.links - pad.rechts)
  const y = (v: number) => pad.oben + (1 - (v - yMin) / (yMax - yMin)) * (hoehe - pad.oben - pad.unten)

  // Grenzwert-Bänder: kritisch (außen) rot, Warnung gelb — jeweils nur, wo definiert.
  const bandRect = (von: number | null | undefined, bis: number | null | undefined, farbe: string) => {
    const oben = bis != null ? y(bis) : pad.oben
    const unten = von != null ? y(von) : hoehe - pad.unten
    if (von == null && bis == null) return null
    if (unten <= oben) return null
    return { yPos: oben, h: unten - oben, farbe }
  }
  const baender = aktiveGrenzen
    ? [
      // unterhalb kritischer Untergrenze / oberhalb kritischer Obergrenze
      aktiveGrenzen.min_critical != null ? bandRect(null, aktiveGrenzen.min_critical, FARBEN.kritisch) : null,
      aktiveGrenzen.max_critical != null ? bandRect(aktiveGrenzen.max_critical, null, FARBEN.kritisch) : null,
      // Warnzonen zwischen warn- und kritisch-Grenze
      aktiveGrenzen.min_warn != null ? bandRect(aktiveGrenzen.min_critical ?? null, aktiveGrenzen.min_warn, FARBEN.warnung) : null,
      aktiveGrenzen.max_warn != null ? bandRect(aktiveGrenzen.max_warn, aktiveGrenzen.max_critical ?? null, FARBEN.warnung) : null,
    ].filter((b): b is NonNullable<typeof b> => b !== null)
    : []

  const linie = (punkte: Array<{ t: number; v: number }>) =>
    punkte.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')

  const primaer = linie(daten.map(d => ({ t: d.t, v: d.y })))
  const sekundaerPunkte = daten.filter(d => d.y2 != null).map(d => ({ t: d.t, v: d.y2 as number }))
  const sekundaer = sekundaerPunkte.length > 0 ? linie(sekundaerPunkte) : null

  const datum = (t: number) => new Date(t).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })
  const yTicks = [yMin + (yMax - yMin) * 0.1, (yMin + yMax) / 2, yMax - (yMax - yMin) * 0.1]

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${breite} ${hoehe}`} style={{ width: '100%', minWidth: 480, display: 'block' }} role="img"
        aria-label={`Verlauf ${cfg.label} (${cfg.einheit}), ${daten.length} Messungen`}>
        {baender.map((b, i) => (
          <rect key={i} x={pad.links} y={b.yPos} width={breite - pad.links - pad.rechts} height={b.h}
            fill={b.farbe} opacity={0.09} />
        ))}

        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={pad.links} x2={breite - pad.rechts} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray="3 4" strokeWidth={1} />
            <text x={pad.links - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink4)">
              {v.toFixed(cfg.dezimalstellen)}
            </text>
          </g>
        ))}

        <path d={primaer} fill="none" stroke="var(--gold)" strokeWidth={2} />
        {sekundaer && <path d={sekundaer} fill="none" stroke="var(--gold)" strokeWidth={2} strokeDasharray="5 4" opacity={0.7} />}

        {daten.map((d, i) => (
          <g key={i}>
            <circle cx={x(d.t)} cy={y(d.y)} r={4} fill={punktFarbe(d.stufe)} stroke="var(--coal2)" strokeWidth={1.5}>
              <title>{`${datum(d.t)} · ${d.y.toFixed(cfg.dezimalstellen)}${d.y2 != null ? `/${d.y2.toFixed(cfg.dezimalstellen)}` : ''} ${cfg.einheit}`}</title>
            </circle>
            {d.y2 != null && (
              <circle cx={x(d.t)} cy={y(d.y2)} r={3} fill={punktFarbe(d.stufe)} opacity={0.7} stroke="var(--coal2)" strokeWidth={1} />
            )}
          </g>
        ))}

        <text x={pad.links} y={hoehe - 8} fontSize={11} fill="var(--ink4)">{datum(tMin)}</text>
        {tSpanne > 24 * 60 * 60 * 1000 && (
          <text x={breite - pad.rechts} y={hoehe - 8} textAnchor="end" fontSize={11} fill="var(--ink4)">{datum(tMax)}</text>
        )}
      </svg>
      {cfg.hatSekundaer && (
        <p style={{ fontSize: 11, color: 'var(--ink5)', margin: '4px 0 0' }}>
          Durchgezogen: {cfg.labelWert} · Gestrichelt: {cfg.labelSekundaer}
        </p>
      )}
    </div>
  )
}
