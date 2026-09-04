'use client'
/**
 * Schritt 4 — Qualifikation und Berufserfahrung.
 * Freiwillig: eine fehlende Ausbildung ist kein Ausschlussgrund, und der
 * Schritt darf niemanden aufhalten, der sich unsicher fühlt.
 */
import { TextBereich } from '@/components/admin/PflegeUI'
import { EinfachAuswahl } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

const AUSBILDUNG = [
  { wert: 'keine', label: 'Keine Ausbildung in der Pflege', hinweis: 'Völlig in Ordnung — wir schulen Sie ein.' },
  { wert: 'betreuungskraft', label: 'Betreuungskraft nach § 43b' },
  { wert: 'pflegehelfer', label: 'Pflegehelferin / Pflegehelfer' },
  { wert: 'pflegefachkraft', label: 'Pflegefachkraft' },
  { wert: 'sonstige', label: 'Andere Ausbildung' },
] as const

const JAHRE = [
  { wert: '0', label: 'Noch keine Erfahrung' },
  { wert: '1-2', label: '1 bis 2 Jahre' },
  { wert: '3-5', label: '3 bis 5 Jahre' },
  { wert: '5+', label: 'Mehr als 5 Jahre' },
] as const

export default function Schritt04Qualifikation({ daten, setzeDaten, disabled }: WizardMaskeProps) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <EinfachAuswahl
        name="ausbildung"
        legende="Haben Sie eine Ausbildung in der Pflege?"
        optionen={AUSBILDUNG}
        wert={String(daten.ausbildung ?? '')}
        disabled={disabled}
        onChange={v => setzeDaten({ ausbildung: v })}
      />
      <EinfachAuswahl
        name="jahre_erfahrung"
        legende="Wie lange arbeiten Sie schon mit Menschen?"
        hinweis="Auch Erfahrung aus der eigenen Familie zählt."
        optionen={JAHRE}
        wert={String(daten.jahre_erfahrung ?? '')}
        disabled={disabled}
        onChange={v => setzeDaten({ jahre_erfahrung: v })}
      />
      <TextBereich
        label="Was haben Sie bisher gemacht?"
        value={String(daten.taetigkeiten ?? '')}
        disabled={disabled}
        rows={4}
        placeholder="Ein paar Sätze genügen."
        onChange={v => setzeDaten({ taetigkeiten: v })}
      />
    </div>
  )
}
