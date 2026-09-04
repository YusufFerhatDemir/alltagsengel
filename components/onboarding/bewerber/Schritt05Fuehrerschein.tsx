'use client'
/**
 * Schritt 5 — Führerschein und Fahrzeug.
 * Nach dem Fahrzeug wird nur gefragt, wenn ein Führerschein da ist —
 * sonst steht eine Frage im Weg, die sich nicht beantworten lässt.
 */
import { EinfachAuswahl, FehltHinweis } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

const FUEHRERSCHEIN = [
  { wert: 'ja', label: 'Ja, ich habe einen Führerschein' },
  { wert: 'nein', label: 'Nein', hinweis: 'Kein Problem — viele Einsätze sind gut mit Bus und Bahn erreichbar.' },
] as const

const FAHRZEUG = [
  { wert: 'eigenes', label: 'Eigenes Auto' },
  { wert: 'gelegentlich', label: 'Gelegentlich ein Auto verfügbar' },
  { wert: 'keines', label: 'Kein Auto' },
] as const

export default function Schritt05Fuehrerschein({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  const hatFuehrerschein = daten.fuehrerschein === 'ja'

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <EinfachAuswahl
          name="fuehrerschein"
          legende="Haben Sie einen Führerschein?"
          optionen={FUEHRERSCHEIN}
          wert={String(daten.fuehrerschein ?? '')}
          disabled={disabled}
          onChange={v => setzeDaten({ fuehrerschein: v, ...(v === 'nein' ? { fahrzeug: '' } : {}) })}
        />
        <FehltHinweis sichtbar={fehlendePflicht.includes('fuehrerschein')} />
      </div>

      {hatFuehrerschein && (
        <EinfachAuswahl
          name="fahrzeug"
          legende="Steht Ihnen ein Fahrzeug zur Verfügung?"
          optionen={FAHRZEUG}
          wert={String(daten.fahrzeug ?? '')}
          disabled={disabled}
          onChange={v => setzeDaten({ fahrzeug: v })}
        />
      )}
    </div>
  )
}
