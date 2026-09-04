'use client'
/** Schritt 2 — Persönliche Angaben. */
import { FeldRaster, TextFeld } from '@/components/admin/PflegeUI'
import { FehltHinweis } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

export default function Schritt02Person({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  const t = (k: string) => String(daten[k] ?? '')
  const fehlt = (k: string) => fehlendePflicht.includes(k)

  return (
    <FeldRaster>
      <div>
        <TextFeld label="Vorname" value={t('vorname')} disabled={disabled}
          onChange={v => setzeDaten({ vorname: v })} />
        <FehltHinweis sichtbar={fehlt('vorname')} />
      </div>
      <div>
        <TextFeld label="Nachname" value={t('nachname')} disabled={disabled}
          onChange={v => setzeDaten({ nachname: v })} />
        <FehltHinweis sichtbar={fehlt('nachname')} />
      </div>
      <div>
        <TextFeld label="Geburtsdatum" type="date" value={t('geburtsdatum')} disabled={disabled}
          onChange={v => setzeDaten({ geburtsdatum: v })} />
        <FehltHinweis sichtbar={fehlt('geburtsdatum')} />
      </div>
      <div>
        <TextFeld label="Telefonnummer" value={t('telefon')} disabled={disabled}
          placeholder="z. B. 069 1234567"
          onChange={v => setzeDaten({ telefon: v })} />
        <FehltHinweis sichtbar={fehlt('telefon')} />
      </div>
      <div>
        <TextFeld label="E-Mail-Adresse" value={t('email')} disabled={disabled}
          placeholder="name@beispiel.de"
          onChange={v => setzeDaten({ email: v })} />
        <FehltHinweis sichtbar={fehlt('email')} />
      </div>
    </FeldRaster>
  )
}
