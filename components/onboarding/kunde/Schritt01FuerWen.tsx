'use client'
/**
 * Schritt 1 — Für wen wird Unterstützung gesucht?
 *
 * Steht bewusst ganz vorn: die Antwort ändert den Ton aller weiteren
 * Fragen („Ihre Adresse" oder „die Adresse Ihrer Mutter") und entscheidet,
 * ob wir zusätzlich die Angaben der pflegebedürftigen Person brauchen.
 */
import { EinfachAuswahl, FehltHinweis } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

export const FUER_WEN = [
  { wert: 'selbst', label: 'Für mich selbst' },
  { wert: 'angehoeriger', label: 'Für eine angehörige Person', hinweis: 'Eltern, Partner, Geschwister' },
  { wert: 'andere', label: 'Für jemand anderen', hinweis: 'Nachbarschaft, Betreuung, Bekanntenkreis' },
] as const

export default function Schritt01FuerWen({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  return (
    <div>
      <EinfachAuswahl
        name="fuer_wen"
        legende="Für wen suchen Sie Unterstützung?"
        optionen={FUER_WEN}
        wert={String(daten.fuer_wen ?? '')}
        disabled={disabled}
        onChange={v => setzeDaten({ fuer_wen: v })}
      />
      <FehltHinweis sichtbar={fehlendePflicht.includes('fuer_wen')} />
    </div>
  )
}
