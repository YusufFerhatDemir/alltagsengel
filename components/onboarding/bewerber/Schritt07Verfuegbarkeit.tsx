'use client'
/** Schritt 7 — Wochentage und Zeitfenster. */
import { FehltHinweis, MehrfachAuswahl } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

const TAGE = [
  { wert: 'mo', label: 'Montag' },
  { wert: 'di', label: 'Dienstag' },
  { wert: 'mi', label: 'Mittwoch' },
  { wert: 'do', label: 'Donnerstag' },
  { wert: 'fr', label: 'Freitag' },
  { wert: 'sa', label: 'Samstag' },
  { wert: 'so', label: 'Sonntag' },
] as const

const ZEITEN = [
  { wert: 'vormittag', label: 'Vormittags', hinweis: 'etwa 8 bis 12 Uhr' },
  { wert: 'nachmittag', label: 'Nachmittags', hinweis: 'etwa 12 bis 17 Uhr' },
  { wert: 'abend', label: 'Abends', hinweis: 'etwa 17 bis 21 Uhr' },
] as const

export default function Schritt07Verfuegbarkeit({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  const tage = Array.isArray(daten.wochentage) ? daten.wochentage as string[] : []
  const zeiten = Array.isArray(daten.zeitfenster) ? daten.zeitfenster as string[] : []

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <MehrfachAuswahl
          legende="An welchen Tagen können Sie?"
          hinweis="Mehrfachauswahl. Das ist keine feste Zusage."
          optionen={TAGE}
          werte={tage}
          disabled={disabled}
          onChange={v => setzeDaten({ wochentage: v })}
        />
        <FehltHinweis sichtbar={fehlendePflicht.includes('wochentage')}
          text="Bitte wählen Sie mindestens einen Tag." />
      </div>

      <div>
        <MehrfachAuswahl
          legende="Zu welchen Tageszeiten?"
          optionen={ZEITEN}
          werte={zeiten}
          disabled={disabled}
          onChange={v => setzeDaten({ zeitfenster: v })}
        />
        <FehltHinweis sichtbar={fehlendePflicht.includes('zeitfenster')}
          text="Bitte wählen Sie mindestens eine Tageszeit." />
      </div>
    </div>
  )
}
