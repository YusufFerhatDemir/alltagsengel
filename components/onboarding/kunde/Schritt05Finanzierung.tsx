'use client'
/**
 * Schritt 5 — Finanzierung.
 *
 * Die Beträge kommen aus lib/onboarding/finanzierung.ts und damit aus
 * lib/config/budget-constants.ts. In dieser Datei steht bewusst KEINE
 * Zahl: eine abgeschriebene wäre beim nächsten Rechtsstand falsch — und
 * zwar an einer Stelle, die Kundschaft liest und auf die sie sich
 * verlässt.
 *
 * Bei „Ich weiß es nicht" erscheinen ALLE Wege ausführlich. Wer sich
 * nicht auskennt, braucht den Überblick — nicht die Bestätigung seiner
 * Unsicherheit.
 */
import { EinfachAuswahl, FehltHinweis } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'
import { erklaerungAlleWege, finanzierungsOptionen } from '@/lib/onboarding/finanzierung'

export default function Schritt05Finanzierung({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  const wert = String(daten.finanzierungsweg ?? '')
  const optionen = finanzierungsOptionen()

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <EinfachAuswahl
          name="finanzierungsweg"
          legende="Wie soll die Unterstützung bezahlt werden?"
          optionen={optionen.map(o => ({
            wert: o.wert,
            label: o.label,
            hinweis: o.voraussetzung ? `${o.kurz} · ${o.voraussetzung}` : o.kurz,
          }))}
          wert={wert}
          disabled={disabled}
          onChange={v => setzeDaten({ finanzierungsweg: v })}
        />
        <FehltHinweis sichtbar={fehlendePflicht.includes('finanzierungsweg')} />
      </div>

      {wert === 'unklar' && (
        <section style={{
          padding: '14px 16px', borderRadius: 12, background: 'rgba(201,150,60,.10)',
          display: 'grid', gap: 14,
        }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
            Die Möglichkeiten im Überblick
          </h3>
          {erklaerungAlleWege().map(o => (
            <div key={o.wert}>
              <strong style={{ fontSize: 14, color: 'var(--ink)' }}>{o.label}</strong>
              {o.voraussetzung && (
                <span style={{ fontSize: 12, color: 'var(--ink5)' }}> · {o.voraussetzung}</span>
              )}
              <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--ink4)' }}>
                {o.lang}
              </p>
            </div>
          ))}
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--ink5)' }}>
            Sie müssen sich jetzt nicht festlegen. Wir sehen uns Ihre Angaben an
            und besprechen die Möglichkeiten in Ruhe mit Ihnen.
          </p>
        </section>
      )}

      {wert !== '' && wert !== 'unklar' && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--ink4)' }}>
          {optionen.find(o => o.wert === wert)?.lang}
        </p>
      )}
    </div>
  )
}
