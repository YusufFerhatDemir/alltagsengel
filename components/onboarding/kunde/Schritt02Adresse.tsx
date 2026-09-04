'use client'
/** Schritt 2 — Einsatzort. */
import { FeldRaster, TextFeld } from '@/components/admin/PflegeUI'
import { FehltHinweis } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

export default function Schritt02Adresse({ daten, setzeDaten, fehlendePflicht, alleDaten, disabled }: WizardMaskeProps) {
  const t = (k: string) => String(daten[k] ?? '')
  const fuerWen = String(alleDaten.fuer_wen?.fuer_wen ?? '')

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--ink4)' }}>
        {fuerWen === 'selbst'
          ? 'Ihre Adresse.'
          : 'Die Adresse der Person, die Unterstützung bekommt.'}
      </p>
      <FeldRaster>
        <div style={{ gridColumn: '1 / -1' }}>
          <TextFeld label="Straße und Hausnummer" value={t('strasse')} disabled={disabled}
            breit onChange={v => setzeDaten({ strasse: v })} />
          <FehltHinweis sichtbar={fehlendePflicht.includes('strasse')} />
        </div>
        <div>
          <TextFeld label="Postleitzahl" value={t('plz')} disabled={disabled}
            placeholder="60313" onChange={v => setzeDaten({ plz: v.replace(/\D/g, '').slice(0, 5) })} />
          <FehltHinweis sichtbar={fehlendePflicht.includes('plz')} />
        </div>
        <div>
          <TextFeld label="Ort" value={t('ort')} disabled={disabled}
            placeholder="Frankfurt am Main" onChange={v => setzeDaten({ ort: v })} />
          <FehltHinweis sichtbar={fehlendePflicht.includes('ort')} />
        </div>
      </FeldRaster>
    </div>
  )
}
