'use client'
// ═══════════════════════════════════════════════════════════════
// BUNDESLAND-ERKENNUNG — kompakte Anzeige unter einem PLZ-Feld
// ═══════════════════════════════════════════════════════════════
// Sobald fünf Ziffern stehen, zeigt diese Zeile, welches Bundesland
// erkannt wurde und was dort möglich ist. Der Nutzer sieht damit
// sofort, warum die Kassenoption verfügbar ist oder nicht — statt
// es erst im letzten Buchungsschritt zu erfahren.
//
// Für die ausführliche Fassung inklusive Warteliste gibt es
// <BundeslandHinweis /> — dieses Bauteil ist die einzeilige Version.
// ═══════════════════════════════════════════════════════════════

import { useBundeslandLage } from '@/lib/expansion/client'

interface Props {
  plz: string | null | undefined
  /** Kompakt (eine Zeile) oder mit Erklärsatz darunter. */
  ausfuehrlich?: boolean
}

export default function BundeslandErkennung({ plz, ausfuehrlich = false }: Props) {
  const { lage, laedt } = useBundeslandLage(plz)
  const fuenfstellig = /^\d{5}$/.test(String(plz ?? '').trim())

  if (!fuenfstellig) return null

  if (laedt) {
    return <div style={{ ...zeile, color: 'var(--ink5)' }}>Bundesland wird geprüft…</div>
  }

  // PLZ nicht zuordenbar
  if (!lage.bundesland) {
    return (
      <div style={{ ...zeile, color: 'var(--ink4)' }}>
        <Punkt farbe="var(--ink5)" />
        Diese Postleitzahl konnten wir keinem Bundesland zuordnen. Bitte prüfen Sie Ihre Angabe.
      </div>
    )
  }

  const farbe = lage.kassenabrechnung
    ? 'var(--green, #3E8E5A)'
    : lage.privatleistungen
      ? 'var(--gold, #C9963C)'
      : 'var(--ink4)'

  return (
    <div>
      <div style={{ ...zeile, color: 'var(--ink3)' }}>
        <Punkt farbe={farbe} />
        <span>
          Erkanntes Bundesland: <strong>{lage.bundeslandName}</strong>
          {lage.kassenabrechnung
            ? ' — Abrechnung über die Pflegekasse möglich.'
            : lage.privatleistungen
              ? ' — Privatleistungen buchbar, Kassenabrechnung noch nicht freigeschaltet.'
              : ' — derzeit nehmen wir hier Vormerkungen entgegen.'}
        </span>
      </div>

      {ausfuehrlich && !lage.kassenabrechnung && (
        <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink4)' }}>
          {lage.hinweis}
        </p>
      )}
    </div>
  )
}

function Punkt({ farbe }: { farbe: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 8, height: 8, borderRadius: '50%', background: farbe,
        flexShrink: 0, marginTop: 5,
      }}
    />
  )
}

const zeile: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8,
  fontSize: 12.5, lineHeight: 1.5, marginTop: 8,
}
