'use client'
/**
 * Angehörigen-Onboarding — Masken je Schritt.
 *
 * Die Schrittfolge ist kurz und teilt sich die Bausteine mit dem
 * Kundenablauf (Auswahl.tsx, PflegeUI). Eigene Dateien je Schritt wären
 * hier vier Dateien mit je zehn Zeilen — der Bewerber- und der
 * Kundenablauf haben eigene, weil sie zwölf bzw. zehn Schritte mit
 * eigener Logik tragen.
 *
 * ── DIESER ABLAUF ERTEILT KEINEN ZUGANG ────────────────────────────────
 * Er sammelt die Angaben, die für eine Freigabe gebraucht werden. Über
 * die Freigabe selbst entscheiden die betreute Person oder die
 * Verwaltung — nie dieses Formular. Der letzte Schritt sagt das
 * ausdrücklich, damit niemand nach dem Absenden auf Daten wartet, die
 * nicht kommen.
 */

import { FeldRaster, TextBereich, TextFeld } from '@/components/admin/PflegeUI'
import { EinfachAuswahl, FehltHinweis, MehrfachAuswahl } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

const BEZIEHUNGSART = [
  { wert: 'angehoeriger', label: 'Angehörig', hinweis: 'Familie oder nahestehend' },
  { wert: 'betreuer', label: 'Rechtliche Betreuung', hinweis: 'Vom Gericht bestellt' },
  { wert: 'bevollmaechtigter', label: 'Bevollmächtigt', hinweis: 'Mit Vorsorgevollmacht' },
] as const

const NACHWEIS = [
  { wert: 'betreuerausweis', label: 'Betreuerausweis' },
  { wert: 'vorsorgevollmacht', label: 'Vorsorgevollmacht' },
  { wert: 'liegt_nicht_vor', label: 'Liegt mir gerade nicht vor', hinweis: 'Sie können ihn nachreichen.' },
] as const

const UMFANG = [
  { wert: 'termine', label: 'Termine und Einsätze' },
  { wert: 'berichte', label: 'Berichte zur Betreuung' },
  { wert: 'abrechnung', label: 'Abrechnung und Budget' },
  { wert: 'nachrichten', label: 'Nachrichten mit dem Team' },
] as const

export function SchrittKontakt({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  const t = (k: string) => String(daten[k] ?? '')
  return (
    <FeldRaster>
      {(['vorname', 'nachname', 'telefon'] as const).map(feld => (
        <div key={feld}>
          <TextFeld
            label={feld === 'vorname' ? 'Vorname' : feld === 'nachname' ? 'Nachname' : 'Telefonnummer'}
            value={t(feld)} disabled={disabled}
            onChange={v => setzeDaten({ [feld]: v })}
          />
          <FehltHinweis sichtbar={fehlendePflicht.includes(feld)} />
        </div>
      ))}
    </FeldRaster>
  )
}

export function SchrittBezug({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  const art = String(daten.beziehungsart ?? '')
  const brauchtNachweis = art === 'betreuer' || art === 'bevollmaechtigter'

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--ink4)' }}>
        Die Person, die bereits von uns betreut wird.
      </p>

      <FeldRaster>
        <div>
          <TextFeld label="Vorname der Person" value={String(daten.person_vorname ?? '')}
            disabled={disabled} onChange={v => setzeDaten({ person_vorname: v })} />
          <FehltHinweis sichtbar={fehlendePflicht.includes('person_vorname')} />
        </div>
        <div>
          <TextFeld label="Nachname der Person" value={String(daten.person_nachname ?? '')}
            disabled={disabled} onChange={v => setzeDaten({ person_nachname: v })} />
          <FehltHinweis sichtbar={fehlendePflicht.includes('person_nachname')} />
        </div>
      </FeldRaster>

      <div>
        <EinfachAuswahl
          name="beziehungsart"
          legende="In welchem Verhältnis stehen Sie zu dieser Person?"
          optionen={BEZIEHUNGSART}
          wert={art}
          disabled={disabled}
          onChange={v => setzeDaten({ beziehungsart: v })}
        />
        <FehltHinweis sichtbar={fehlendePflicht.includes('beziehungsart')} />
      </div>

      {/* Nur bei Betreuung oder Vollmacht — „angehörig" ist kein
          Rechtsverhältnis, das man belegen müsste. */}
      {brauchtNachweis && (
        <div>
          <EinfachAuswahl
            name="nachweis_art"
            legende="Welchen Nachweis können Sie vorlegen?"
            optionen={NACHWEIS}
            wert={String(daten.nachweis_art ?? '')}
            disabled={disabled}
            onChange={v => setzeDaten({ nachweis_art: v })}
          />
          <FehltHinweis sichtbar={fehlendePflicht.includes('nachweis_art')} />
        </div>
      )}
    </div>
  )
}

export function SchrittUmfang({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  const gewaehlt = Array.isArray(daten.einsicht_umfang) ? daten.einsicht_umfang as string[] : []
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <MehrfachAuswahl
          legende="Was möchten Sie einsehen können?"
          hinweis="Sie bestimmen den Umfang. Ändern lässt er sich jederzeit."
          optionen={UMFANG}
          werte={gewaehlt}
          disabled={disabled}
          onChange={v => setzeDaten({ einsicht_umfang: v })}
        />
        <FehltHinweis sichtbar={fehlendePflicht.includes('einsicht_umfang')}
          text="Bitte wählen Sie mindestens einen Bereich." />
      </div>
      <TextBereich
        label="Möchten Sie dazu etwas anmerken?"
        value={String(daten.anmerkung ?? '')}
        disabled={disabled} rows={3} placeholder="Freiwillig."
        onChange={v => setzeDaten({ anmerkung: v })}
      />
    </div>
  )
}

export interface SchrittUnterlagenProps extends WizardMaskeProps {
  onUpload?: (art: string, datei: File) => Promise<string>
}

export function SchrittUnterlagen({ daten, setzeDaten, disabled, onUpload }: SchrittUnterlagenProps) {
  const vorhanden = String(daten.vollmacht ?? '')
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink4)' }}>
          Betreuerausweis oder Vollmacht
        </span>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          disabled={disabled || !onUpload}
          onChange={async e => {
            const datei = e.target.files?.[0]
            if (datei && onUpload) setzeDaten({ vollmacht: await onUpload('vollmacht', datei) })
          }}
          style={{ minHeight: 52, padding: 12, width: '100%' }}
        />
      </label>
      {vorhanden && <span style={{ fontSize: 12, color: '#2E7D32' }}>✓ {vorhanden}</span>}
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink5)' }}>
        Nur nötig bei rechtlicher Betreuung oder Vollmacht. Sie können den
        Nachweis auch später nachreichen.
      </p>
    </div>
  )
}

export function SchrittZusammenfassung({ alleDaten }: WizardMaskeProps) {
  const zeilen: Array<[string, string]> = [
    ['Ihr Name', [alleDaten.kontakt?.vorname, alleDaten.kontakt?.nachname].filter(Boolean).join(' ') || '—'],
    ['Ihr Telefon', String(alleDaten.kontakt?.telefon ?? '—')],
    ['Betreute Person', [alleDaten.bezug?.person_vorname, alleDaten.bezug?.person_nachname].filter(Boolean).join(' ') || '—'],
    ['Verhältnis', String(alleDaten.bezug?.beziehungsart ?? '—')],
    ['Einsicht in', Array.isArray(alleDaten.umfang?.einsicht_umfang)
      ? (alleDaten.umfang.einsicht_umfang as string[]).join(', ') || '—' : '—'],
  ]
  return (
    <dl style={{ margin: 0, display: 'grid', gap: 8 }}>
      {zeilen.map(([label, wert]) => (
        <div key={label} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <dt style={{ fontSize: 13, color: 'var(--ink5)', minWidth: 150 }}>{label}</dt>
          <dd style={{ margin: 0, fontSize: 14, color: 'var(--ink)', flex: 1 }}>{wert}</dd>
        </div>
      ))}
    </dl>
  )
}

export function SchrittAbschluss() {
  return (
    <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink)' }}>
      <p style={{ marginTop: 0 }}>
        Wir prüfen Ihre Angaben und melden uns bei Ihnen.
      </p>
      <p style={{ margin: '0 0 0', color: 'var(--ink4)' }}>
        Den Zugang selbst gibt die betreute Person frei — oder unsere
        Verwaltung, wenn eine Betreuung oder Vollmacht vorliegt. Mit dem
        Absenden ist er noch nicht erteilt.
      </p>
    </div>
  )
}
