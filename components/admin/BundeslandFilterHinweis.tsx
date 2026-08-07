'use client'
// ═══════════════════════════════════════════════════════════════
// Hinweiszeile: „Diese Liste ist auf ein Bundesland gefiltert."
// ═══════════════════════════════════════════════════════════════
// Ohne diesen Hinweis hält jemand eine gefilterte Liste für den
// vollständigen Bestand — der häufigste Bedienfehler bei globalen
// Filtern. Zeigt zusätzlich, wie viele Einträge ausgeblendet sind,
// und erlaubt das Zurücksetzen mit einem Klick.
// ═══════════════════════════════════════════════════════════════

import { ALLE_BUNDESLAENDER } from '@/lib/expansion/types'
import { useBundeslandFilter } from './BundeslandContext'

export default function BundeslandFilterHinweis({
  gesamt, sichtbar,
}: {
  /** Anzahl Datensätze vor dem Bundesland-Filter. */
  gesamt: number
  /** Anzahl Datensätze nach dem Bundesland-Filter. */
  sichtbar: number
}) {
  const { alle, label, setAktiv } = useBundeslandFilter()
  if (alle) return null

  const ausgeblendet = Math.max(gesamt - sichtbar, 0)

  async function zuruecksetzen() {
    setAktiv(ALLE_BUNDESLAENDER)
    await fetch('/api/expansion/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundesland: ALLE_BUNDESLAENDER }),
    }).catch(() => {})
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: 'rgba(201,150,60,0.08)', border: '1px solid rgba(201,150,60,0.22)',
      borderRadius: 10, padding: '8px 12px', marginBottom: 14,
      fontSize: 13, color: 'var(--ink3)',
    }}>
      <span>
        Gefiltert auf <strong>{label}</strong>
        {ausgeblendet > 0
          ? ` — ${ausgeblendet} von ${gesamt} Einträgen ausgeblendet.`
          : ` — alle ${gesamt} Einträge liegen in diesem Bundesland.`}
      </span>
      <button
        onClick={zuruecksetzen}
        style={{
          marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--ink)',
          background: 'transparent', border: '1px solid var(--border)',
          borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        Filter aufheben
      </button>
    </div>
  )
}
