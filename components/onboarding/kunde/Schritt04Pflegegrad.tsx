'use client'
/**
 * Schritt 4 — Pflegegrad.
 *
 * „Weiß ich nicht" ist eine vollständige Antwort und steht gleichwertig
 * neben den Zahlen. Sehr viele Menschen kennen den Grad nicht auswendig
 * oder haben noch keinen beantragt; ein Ablauf, der hier eine Zahl
 * erzwingt, verliert genau die Leute, die Hilfe am dringendsten brauchen.
 */
import { EinfachAuswahl, FehltHinweis } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

const GRADE = [
  { wert: 'keiner', label: 'Kein Pflegegrad', hinweis: 'Wir helfen Ihnen beim Antrag.' },
  { wert: '1', label: 'Pflegegrad 1' },
  { wert: '2', label: 'Pflegegrad 2' },
  { wert: '3', label: 'Pflegegrad 3' },
  { wert: '4', label: 'Pflegegrad 4' },
  { wert: '5', label: 'Pflegegrad 5' },
  { wert: 'unbekannt', label: 'Weiß ich nicht', hinweis: 'Völlig in Ordnung — wir finden es gemeinsam heraus.' },
  { wert: 'beantragt', label: 'Ist beantragt', hinweis: 'Der Bescheid steht noch aus.' },
] as const

export default function Schritt04Pflegegrad({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  const wert = String(daten.pflegegrad ?? '')

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <EinfachAuswahl
          name="pflegegrad"
          legende="Liegt ein Pflegegrad vor?"
          optionen={GRADE}
          wert={wert}
          disabled={disabled}
          onChange={v => setzeDaten({ pflegegrad: v })}
        />
        <FehltHinweis sichtbar={fehlendePflicht.includes('pflegegrad')} />
      </div>

      {(wert === 'keiner' || wert === 'unbekannt') && (
        <div style={{
          padding: '12px 14px', borderRadius: 10, background: 'rgba(201,150,60,.10)',
          fontSize: 14, lineHeight: 1.6, color: 'var(--ink4)',
        }}>
          <strong style={{ color: 'var(--ink)' }}>Was ist ein Pflegegrad?</strong>
          <p style={{ margin: '6px 0 0' }}>
            Der Pflegegrad beschreibt, wie viel Unterstützung jemand im Alltag
            braucht. Er wird von der Pflegekasse festgestellt und entscheidet
            darüber, welche Leistungen bezahlt werden. Den Antrag stellen Sie
            formlos bei der Pflegekasse — wir helfen Ihnen dabei und begleiten
            Sie auch beim Begutachtungstermin.
          </p>
          <p style={{ margin: '8px 0 0' }}>
            Ohne Pflegegrad können Sie unsere Unterstützung trotzdem in Anspruch
            nehmen; sie wird dann privat abgerechnet.
          </p>
        </div>
      )}
    </div>
  )
}
