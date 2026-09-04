'use client'
/** Schritt 6 — Sprachen. Weitere Sprachen sind ein Gewinn, kein Beiwerk. */
import { EinfachAuswahl, FehltHinweis, MehrfachAuswahl } from '@/components/onboarding/Auswahl'
import { TextFeld } from '@/components/admin/PflegeUI'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

const NIVEAU = [
  { wert: 'grundkenntnisse', label: 'Grundkenntnisse', hinweis: 'Einfache Gespräche' },
  { wert: 'gut', label: 'Gut', hinweis: 'Alltag und Absprachen sicher' },
  { wert: 'sehr_gut', label: 'Sehr gut' },
  { wert: 'muttersprache', label: 'Muttersprache' },
] as const

const SPRACHEN = [
  { wert: 'tuerkisch', label: 'Türkisch' },
  { wert: 'russisch', label: 'Russisch' },
  { wert: 'polnisch', label: 'Polnisch' },
  { wert: 'arabisch', label: 'Arabisch' },
  { wert: 'englisch', label: 'Englisch' },
  { wert: 'ukrainisch', label: 'Ukrainisch' },
] as const

export default function Schritt06Sprachen({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  const weitere = Array.isArray(daten.weitere_sprachen) ? daten.weitere_sprachen as string[] : []

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <EinfachAuswahl
          name="deutsch_niveau"
          legende="Wie gut sprechen Sie Deutsch?"
          optionen={NIVEAU}
          wert={String(daten.deutsch_niveau ?? '')}
          disabled={disabled}
          onChange={v => setzeDaten({ deutsch_niveau: v })}
        />
        <FehltHinweis sichtbar={fehlendePflicht.includes('deutsch_niveau')} />
      </div>

      <MehrfachAuswahl
        legende="Welche Sprachen sprechen Sie außerdem?"
        hinweis="Freiwillig — für viele Familien ist das ein großer Gewinn."
        optionen={SPRACHEN}
        werte={weitere}
        disabled={disabled}
        onChange={v => setzeDaten({ weitere_sprachen: v })}
      />

      <TextFeld
        label="Weitere Sprache (falls nicht dabei)"
        value={String(daten.sprache_sonstige ?? '')}
        disabled={disabled}
        onChange={v => setzeDaten({ sprache_sonstige: v })}
      />
    </div>
  )
}
