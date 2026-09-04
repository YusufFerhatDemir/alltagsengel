'use client'
/** Schritt 3 — Gewünschte Unterstützung. Werte sind Tarif-Schlüssel. */
import { FehltHinweis, MehrfachAuswahl } from '@/components/onboarding/Auswahl'
import { TextBereich } from '@/components/admin/PflegeUI'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'
import { LEISTUNGEN } from './leistungen'

export default function Schritt03Bedarf({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  const gewaehlt = Array.isArray(daten.leistungsarten) ? daten.leistungsarten as string[] : []

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <MehrfachAuswahl
          legende="Womit können wir helfen?"
          hinweis="Mehrfachauswahl. Nichts davon ist verbindlich."
          optionen={LEISTUNGEN}
          werte={gewaehlt}
          disabled={disabled}
          onChange={v => setzeDaten({ leistungsarten: v })}
        />
        <FehltHinweis sichtbar={fehlendePflicht.includes('leistungsarten')}
          text="Bitte wählen Sie mindestens eine Leistung." />
      </div>

      {gewaehlt.includes('sonstige') && (
        <TextBereich
          label="Was brauchen Sie darüber hinaus?"
          value={String(daten.sonstiges ?? '')}
          disabled={disabled}
          rows={3}
          onChange={v => setzeDaten({ sonstiges: v })}
        />
      )}
    </div>
  )
}
