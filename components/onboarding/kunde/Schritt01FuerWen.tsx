'use client'
/**
 * Schritt 1 — Für wen wird Unterstützung gesucht?
 *
 * Steht bewusst ganz vorn: die Antwort ändert den Ton aller weiteren
 * Fragen („Ihre Adresse" oder „die Adresse Ihrer Mutter") und entscheidet,
 * ob wir zusätzlich die Angaben der pflegebedürftigen Person brauchen.
 *
 * Die Zusatzfelder erscheinen NUR bei „angehörige Person" oder „jemand
 * anderes". Welche Angaben dann verlangt werden, steht nicht hier,
 * sondern als `bedingteAngaben` in der Schrittfolge — sonst könnten
 * Maske und Prüfung auseinanderlaufen.
 */
import { FeldRaster, TextFeld } from '@/components/admin/PflegeUI'
import { EinfachAuswahl, FehltHinweis } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

export const FUER_WEN = [
  { wert: 'selbst', label: 'Für mich selbst' },
  { wert: 'angehoeriger', label: 'Für eine angehörige Person', hinweis: 'Eltern, Partner, Geschwister' },
  { wert: 'andere', label: 'Für jemand anderen', hinweis: 'Nachbarschaft, Betreuung, Bekanntenkreis' },
] as const

const BEZIEHUNG = [
  { wert: 'kind', label: 'Tochter oder Sohn' },
  { wert: 'partner', label: 'Partnerin oder Partner' },
  { wert: 'elternteil', label: 'Mutter oder Vater' },
  { wert: 'geschwister', label: 'Schwester oder Bruder' },
  { wert: 'betreuer', label: 'Rechtliche Betreuung' },
  { wert: 'bevollmaechtigter', label: 'Bevollmächtigt' },
  { wert: 'sonstige', label: 'Etwas anderes' },
] as const

export default function Schritt01FuerWen({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  const fuerWen = String(daten.fuer_wen ?? '')
  const fuerAndere = fuerWen === 'angehoeriger' || fuerWen === 'andere'

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <EinfachAuswahl
          name="fuer_wen"
          legende="Für wen suchen Sie Unterstützung?"
          optionen={FUER_WEN}
          wert={fuerWen}
          disabled={disabled}
          onChange={v => setzeDaten({ fuer_wen: v })}
        />
        <FehltHinweis sichtbar={fehlendePflicht.includes('fuer_wen')} />
      </div>

      {fuerAndere && (
        <section style={{ display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
            Angaben zur pflegebedürftigen Person
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink5)' }}>
            Wir brauchen den Namen, um die Betreuung richtig zuzuordnen. Alles
            Weitere fragen wir im Gespräch.
          </p>

          <FeldRaster>
            <div>
              <TextFeld label="Vorname" value={String(daten.person_vorname ?? '')} disabled={disabled}
                onChange={v => setzeDaten({ person_vorname: v })} />
              <FehltHinweis sichtbar={fehlendePflicht.includes('person_vorname')} />
            </div>
            <div>
              <TextFeld label="Nachname" value={String(daten.person_nachname ?? '')} disabled={disabled}
                onChange={v => setzeDaten({ person_nachname: v })} />
              <FehltHinweis sichtbar={fehlendePflicht.includes('person_nachname')} />
            </div>
            <div>
              <TextFeld label="Geburtsdatum" type="date" value={String(daten.person_geburtsdatum ?? '')}
                disabled={disabled} onChange={v => setzeDaten({ person_geburtsdatum: v })} />
            </div>
            <div>
              <TextFeld label="Telefon der Person" value={String(daten.person_telefon ?? '')}
                disabled={disabled} placeholder="Freiwillig"
                onChange={v => setzeDaten({ person_telefon: v })} />
            </div>
          </FeldRaster>

          <div>
            <EinfachAuswahl
              name="beziehung"
              legende="In welchem Verhältnis stehen Sie zu dieser Person?"
              optionen={BEZIEHUNG}
              wert={String(daten.beziehung ?? '')}
              disabled={disabled}
              onChange={v => setzeDaten({ beziehung: v })}
            />
            <FehltHinweis sichtbar={fehlendePflicht.includes('beziehung')} />
          </div>

          {(daten.beziehung === 'betreuer' || daten.beziehung === 'bevollmaechtigter') && (
            <p style={{
              margin: 0, padding: '12px 14px', borderRadius: 10,
              background: 'rgba(201,150,60,.10)', fontSize: 13, lineHeight: 1.5, color: 'var(--ink4)',
            }}>
              Für eine rechtliche Betreuung oder eine Vollmacht brauchen wir später
              einen Nachweis — den Betreuerausweis oder die Vollmacht. Sie können
              ihn im Schritt „Unterlagen" hochladen oder uns später zusenden.
            </p>
          )}
        </section>
      )}
    </div>
  )
}
