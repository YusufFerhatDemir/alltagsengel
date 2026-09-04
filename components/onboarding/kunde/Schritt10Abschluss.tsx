'use client'
/**
 * Schritt 10 — Anfrage senden.
 *
 * „Passenden Engel finden" wird hier bewusst NICHT als Automatik
 * angeboten: die Zuordnung einer Begleitperson ist eine fachliche
 * Entscheidung (Einsatzfreigabe, Qualifikation, Entfernung) und nie das
 * Ergebnis eines Formulars. Die Person wählt, wie es weitergehen soll —
 * wir suchen, oder es gibt zuerst ein Kennenlernen.
 */
import { SchalterFeld, TextBereich } from '@/components/admin/PflegeUI'
import { EinfachAuswahl } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

const WEITER = [
  { wert: 'vorschlag', label: 'Schlagen Sie mir jemanden vor', hinweis: 'Wir suchen eine passende Begleitperson in Ihrer Nähe.' },
  { wert: 'kennenlernen', label: 'Erst ein Kennenlerngespräch', hinweis: 'Unverbindlich, telefonisch oder bei Ihnen zu Hause.' },
  { wert: 'rueckruf', label: 'Rufen Sie mich einfach an', hinweis: 'Wir klären alles Weitere am Telefon.' },
] as const

export default function Schritt10Abschluss({ daten, setzeDaten, disabled }: WizardMaskeProps) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--ink)' }}>
        Ihre Anfrage ist unverbindlich und kostenfrei. Wir melden uns
        innerhalb weniger Tage bei Ihnen.
      </p>

      <EinfachAuswahl
        name="wie_weiter"
        legende="Wie möchten Sie weitermachen?"
        optionen={WEITER}
        wert={String(daten.wie_weiter ?? '')}
        disabled={disabled}
        onChange={v => setzeDaten({ wie_weiter: v })}
      />

      <TextBereich
        label="Möchten Sie uns noch etwas mitteilen?"
        value={String(daten.nachricht ?? '')}
        disabled={disabled}
        rows={3}
        placeholder="Freiwillig."
        onChange={v => setzeDaten({ nachricht: v })}
      />

      <SchalterFeld
        label="Ich bin damit einverstanden, dass meine Angaben zur Bearbeitung meiner Anfrage gespeichert und verarbeitet werden."
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
