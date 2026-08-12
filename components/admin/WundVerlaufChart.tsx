'use client'
// ═══════════════════════════════════════════════════════════════
// Größen-/Score-Verlauf einer Wunde als Inline-SVG-Liniendiagramm
// (bewusst ohne Chart-Library — keine neue Dependency).
// ═══════════════════════════════════════════════════════════════
import type { VerlaufsPunkt } from '@/lib/wunden/assessments'

const BREITE = 640
const HOEHE = 220
const PAD_L = 44
const PAD_R = 16
const PAD_T = 16
const PAD_B = 36

interface Serie {
  key: 'flaeche_cm2' | 'push_gesamt'
  label: string
  farbe: string
}

const SERIEN: Serie[] = [
  { key: 'flaeche_cm2', label: 'Fläche (cm²)', farbe: '#b45309' },
  { key: 'push_gesamt', label: 'PUSH-Score (0–17)', farbe: '#1d4ed8' },
]

export default function WundVerlaufChart({ verlauf }: { verlauf: VerlaufsPunkt[] }) {
  const punkte = verlauf.filter(p => p.flaeche_cm2 !== null || p.push_gesamt !== null)
  if (punkte.length < 2) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink4, #6b7280)' }}>
        Verlaufsgrafik ab zwei Assessments mit Größen- oder Score-Angabe.
      </p>
    )
  }

  const maxWert = Math.max(
    1,
    ...punkte.map(p => p.flaeche_cm2 ?? 0),
    ...punkte.map(p => p.push_gesamt ?? 0),
  )

  const x = (i: number) => PAD_L + (i / (punkte.length - 1)) * (BREITE - PAD_L - PAD_R)
  const y = (wert: number) => HOEHE - PAD_B - (wert / maxWert) * (HOEHE - PAD_T - PAD_B)

  function pfad(key: Serie['key']): string {
    let d = ''
    punkte.forEach((p, i) => {
      const wert = p[key]
      if (wert === null) return
      d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(wert).toFixed(1)} `
    })
    return d.trim()
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxWert * f * 10) / 10)

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 6 }}>
        {SERIEN.map(s => (
          <span key={s.key} style={{ fontSize: 12, color: s.farbe, fontWeight: 600 }}>■ {s.label}</span>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${BREITE} ${HOEHE}`} style={{ width: '100%', maxWidth: BREITE, display: 'block' }} role="img" aria-label="Wundverlauf">
          {yTicks.map(t => (
            <g key={t}>
              <line x1={PAD_L} x2={BREITE - PAD_R} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth={1} />
              <text x={PAD_L - 6} y={y(t) + 4} fontSize={10} fill="#6b7280" textAnchor="end">{t}</text>
            </g>
          ))}
          {punkte.map((p, i) => (
            <text
              key={p.erhoben_am}
              x={x(i)}
              y={HOEHE - PAD_B + 16}
              fontSize={10}
              fill="#6b7280"
              textAnchor="middle"
            >
              {new Date(p.erhoben_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
            </text>
          ))}
          {SERIEN.map(s => (
            <path key={s.key} d={pfad(s.key)} fill="none" stroke={s.farbe} strokeWidth={2} />
          ))}
          {SERIEN.map(s => punkte.map((p, i) => {
            const wert = p[s.key]
            if (wert === null) return null
            return <circle key={`${s.key}-${p.erhoben_am}`} cx={x(i)} cy={y(wert)} r={3} fill={s.farbe} />
          }))}
        </svg>
      </div>
    </div>
  )
}
