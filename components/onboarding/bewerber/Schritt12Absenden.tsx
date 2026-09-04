'use client'
/**
 * Schritt 12 — Absenden.
 *
 * Der Wizard-Knopf heißt hier „Abschließen" und löst onAbschluss() aus;
 * diese Maske erklärt nur, was danach passiert, und holt die Einwilligung
 * zur Verarbeitung. Ein Gesprächswunsch ist optional — er ersetzt das
 * Absenden nicht, sondern begleitet es.
 */
import { SchalterFeld, TextBereich } from '@/components/admin/PflegeUI'
import { EinfachAuswahl } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

const GESPRAECH = [
  { wert: 'telefon', label: 'Telefonisch', hinweis: 'Wir rufen Sie an.' },
  { wert: 'vor_ort', label: 'Persönlich vor Ort' },
  { wert: 'egal', label: 'Beides ist mir recht' },
] as const

export default function Schritt12Absenden({ daten, setzeDaten, disabled }: WizardMaskeProps) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--ink)' }}>
        Wir sehen uns Ihre Bewerbung an und melden uns innerhalb weniger Tage
        bei Ihnen. Sie müssen dafür nichts weiter tun.
      </p>

      <EinfachAuswahl
        name="gespraech_art"
        legende="Wie möchten Sie das Gespräch führen?"
        hinweis="Freiwillig — wir richten uns nach Ihnen."
        optionen={GESPRAECH}
        wert={String(daten.gespraech_art ?? '')}
        disabled={disabled}
        onChange={v => setzeDaten({ gespraech_art: v })}
      />

      <TextBereich
        label="Möchten Sie uns noch etwas mitteilen?"
        value={String(daten.nachricht ?? '')}
        disabled={disabled}
        rows={3}
        placeholder="Freiwillig."
        onChange={v => setzeDaten({ nachricht: v })}
      />

      {/* Die Einwilligung ist Voraussetzung der Verarbeitung und deshalb
          keine Formalie am Rand — sie steht direkt über dem Absenden. */}
      <SchalterFeld
        label="Ich bin damit einverstanden, dass meine Angaben zur Bearbeitung meiner Bewerbung gespeichert und verarbeitet werden."
        value={daten.einwilligung === true}
        disabled={disabled}
        onChange={v => setzeDaten({ einwilligung: v })}
      />

      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--ink5)' }}>
        Sie können Ihre Einwilligung jederzeit widerrufen. Einzelheiten stehen
        in unserer Datenschutzerklärung.
      </p>
    </div>
  )
}
