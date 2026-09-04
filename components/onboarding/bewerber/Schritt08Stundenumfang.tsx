'use client'
/**
 * Schritt 8 — Gewünschter Stundenumfang.
 *
 * Bewusst Auswahlkacheln statt eines Schiebereglers: ein Regler verlangt
 * eine feine Geste und liefert eine Scheingenauigkeit („17 Stunden"), die
 * hier niemand braucht. Die Beträge sind bewusst NICHT genannt — die
 * Vergütung hängt vom Einsatz ab und wird im Gespräch besprochen.
 */
import { EinfachAuswahl, FehltHinweis } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

const UMFANG = [
  { wert: 'minijob', label: 'Minijob', hinweis: 'bis etwa 10 Stunden pro Woche' },
  { wert: 'teilzeit_klein', label: 'Kleine Teilzeit', hinweis: 'etwa 10 bis 20 Stunden pro Woche' },
  { wert: 'teilzeit', label: 'Teilzeit', hinweis: 'etwa 20 bis 30 Stunden pro Woche' },
  { wert: 'vollzeit', label: 'Vollzeit', hinweis: 'ab etwa 35 Stunden pro Woche' },
  { wert: 'unklar', label: 'Das weiß ich noch nicht', hinweis: 'Wir besprechen das gemeinsam.' },
] as const

export default function Schritt08Stundenumfang({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  return (
    <div>
      <EinfachAuswahl
        name="umfang"
        legende="Wie viel möchten Sie arbeiten?"
        optionen={UMFANG}
        wert={String(daten.umfang ?? '')}
        disabled={disabled}
        onChange={v => setzeDaten({ umfang: v })}
      />
      <FehltHinweis sichtbar={fehlendePflicht.includes('umfang')} />
    </div>
  )
}
