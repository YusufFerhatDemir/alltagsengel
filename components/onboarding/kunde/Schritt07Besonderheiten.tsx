'use client'
/**
 * Schritt 7 — Besondere Anforderungen.
 *
 * Vier getrennte Felder statt eines großen Freitexts: „Gibt es etwas zu
 * beachten?" beantwortet fast niemand, „Haben Sie Haustiere?" schon.
 * Alles freiwillig — der Schritt ist überspringbar.
 */
import { TextBereich } from '@/components/admin/PflegeUI'
import { MehrfachAuswahl } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

const SPRACHEN = [
  { wert: 'tuerkisch', label: 'Türkisch' }, { wert: 'russisch', label: 'Russisch' },
  { wert: 'polnisch', label: 'Polnisch' }, { wert: 'arabisch', label: 'Arabisch' },
  { wert: 'englisch', label: 'Englisch' }, { wert: 'ukrainisch', label: 'Ukrainisch' },
] as const

export default function Schritt07Besonderheiten({ daten, setzeDaten, disabled }: WizardMaskeProps) {
  const sprachen = Array.isArray(daten.wunschsprachen) ? daten.wunschsprachen as string[] : []

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <TextBereich
        label="Mobilität"
        value={String(daten.mobilitaet ?? '')}
        disabled={disabled}
        rows={2}
        placeholder="z. B. Rollator, Rollstuhl, Treppenhaus ohne Aufzug"
        onChange={v => setzeDaten({ mobilitaet: v })}
      />
      <TextBereich
        label="Haustiere"
        value={String(daten.haustiere ?? '')}
        disabled={disabled}
        rows={2}
        placeholder="z. B. eine Katze, ein kleiner Hund"
        onChange={v => setzeDaten({ haustiere: v })}
      />
      <TextBereich
        label="Allergien oder Unverträglichkeiten"
        value={String(daten.allergien ?? '')}
        disabled={disabled}
        rows={2}
        placeholder="Freiwillig."
        onChange={v => setzeDaten({ allergien: v })}
      />

      <MehrfachAuswahl
        legende="Wäre eine bestimmte Sprache hilfreich?"
        hinweis="Freiwillig — wir versuchen, es zu berücksichtigen."
        optionen={SPRACHEN}
        werte={sprachen}
        disabled={disabled}
        onChange={v => setzeDaten({ wunschsprachen: v })}
      />

      <TextBereich
        label="Sonstiges"
        value={String(daten.besonderheiten ?? '')}
        disabled={disabled}
        rows={3}
        placeholder="Alles, was uns bei der Auswahl der passenden Person hilft."
        onChange={v => setzeDaten({ besonderheiten: v })}
      />
    </div>
  )
}
