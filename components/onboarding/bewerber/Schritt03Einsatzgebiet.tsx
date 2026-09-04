'use client'
/** Schritt 3 — Wohnort und Einsatzradius. */
import { FeldRaster, TextFeld } from '@/components/admin/PflegeUI'
import { EinfachAuswahl, FehltHinweis } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

const RADIEN = [
  { wert: '5', label: 'Bis 5 km', hinweis: 'Nur in direkter Nachbarschaft' },
  { wert: '10', label: 'Bis 10 km' },
  { wert: '15', label: 'Bis 15 km', hinweis: 'Üblichster Bereich' },
  { wert: '25', label: 'Bis 25 km', hinweis: 'Auch weitere Wege' },
] as const

export default function Schritt03Einsatzgebiet({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  const t = (k: string) => String(daten[k] ?? '')

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <FeldRaster>
        <div>
          <TextFeld label="Postleitzahl" value={t('plz')} disabled={disabled}
            placeholder="60313" onChange={v => setzeDaten({ plz: v.replace(/\D/g, '').slice(0, 5) })} />
          <FehltHinweis sichtbar={fehlendePflicht.includes('plz')} />
        </div>
        <div>
          <TextFeld label="Stadt" value={t('stadt')} disabled={disabled}
            placeholder="Frankfurt am Main" onChange={v => setzeDaten({ stadt: v })} />
          <FehltHinweis sichtbar={fehlendePflicht.includes('stadt')} />
        </div>
      </FeldRaster>

      <div>
        <EinfachAuswahl
          name="radius"
          legende="Wie weit möchten Sie fahren?"
          optionen={RADIEN}
          wert={t('radius_km')}
          disabled={disabled}
          onChange={v => setzeDaten({ radius_km: v })}
        />
        <FehltHinweis sichtbar={fehlendePflicht.includes('radius_km')} />
      </div>
    </div>
  )
}
