'use client'
/** Schritt 6 — Zeiten und Häufigkeit. */
import { EinfachAuswahl, FehltHinweis, MehrfachAuswahl } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

const TAGE = [
  { wert: 'mo', label: 'Montag' }, { wert: 'di', label: 'Dienstag' },
  { wert: 'mi', label: 'Mittwoch' }, { wert: 'do', label: 'Donnerstag' },
  { wert: 'fr', label: 'Freitag' }, { wert: 'sa', label: 'Samstag' },
  { wert: 'so', label: 'Sonntag' },
] as const

const TAGESZEIT = [
  { wert: 'vormittag', label: 'Vormittags', hinweis: 'etwa 8 bis 12 Uhr' },
  { wert: 'nachmittag', label: 'Nachmittags', hinweis: 'etwa 12 bis 17 Uhr' },
  { wert: 'abend', label: 'Abends', hinweis: 'etwa 17 bis 21 Uhr' },
  { wert: 'flexibel', label: 'Das ist uns egal' },
] as const

const HAEUFIGKEIT = [
  { wert: 'einmalig', label: 'Einmalig', hinweis: 'Nur ein einzelner Termin' },
  { wert: '1x_woche', label: 'Einmal pro Woche' },
  { wert: '2-3x_woche', label: 'Zwei- bis dreimal pro Woche' },
  { wert: 'taeglich', label: 'Täglich' },
  { wert: 'unklar', label: 'Weiß ich noch nicht' },
] as const

export default function Schritt06Zeiten({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  const tage = Array.isArray(daten.wochentage) ? daten.wochentage as string[] : []
  const zeiten = Array.isArray(daten.tageszeit) ? daten.tageszeit as string[] : []

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <MehrfachAuswahl
          legende="An welchen Tagen?"
          hinweis="Mehrfachauswahl. Das ist noch keine feste Vereinbarung."
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
          legende="Zu welcher Tageszeit?"
          optionen={TAGESZEIT}
          werte={zeiten}
          disabled={disabled}
          onChange={v => setzeDaten({ tageszeit: v })}
        />
        <FehltHinweis sichtbar={fehlendePflicht.includes('tageszeit')}
          text="Bitte wählen Sie mindestens eine Tageszeit." />
      </div>

      <div>
        <EinfachAuswahl
          name="haeufigkeit"
          legende="Wie oft?"
          optionen={HAEUFIGKEIT}
          wert={String(daten.haeufigkeit ?? '')}
          disabled={disabled}
          onChange={v => setzeDaten({ haeufigkeit: v })}
        />
        <FehltHinweis sichtbar={fehlendePflicht.includes('haeufigkeit')} />
      </div>
    </div>
  )
}
