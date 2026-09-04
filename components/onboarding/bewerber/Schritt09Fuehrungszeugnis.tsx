'use client'
/**
 * Schritt 9 — Erweitertes Führungszeugnis.
 *
 * Gefragt wird die AUSKUNFT, nicht das Dokument. „Beantrage ich noch" ist
 * eine vollständige Antwort: die meisten Bewerbungen warten an genau
 * dieser Stelle wochenlang auf das Amt, und ein Ablauf, der hier blockt,
 * verliert Menschen, die alles richtig machen.
 */
import { EinfachAuswahl, FehltHinweis } from '@/components/onboarding/Auswahl'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

const STATUS = [
  { wert: 'vorhanden', label: 'Ich habe eines', hinweis: 'Nicht älter als drei Monate.' },
  { wert: 'beantragt', label: 'Ist beantragt', hinweis: 'Wir warten gemeinsam ab.' },
  { wert: 'beantrage_noch', label: 'Beantrage ich noch', hinweis: 'Wir erklären Ihnen, wie das geht.' },
] as const

export default function Schritt09Fuehrungszeugnis({ daten, setzeDaten, fehlendePflicht, disabled }: WizardMaskeProps) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <EinfachAuswahl
          name="fuehrungszeugnis_status"
          legende="Wie ist der Stand?"
          optionen={STATUS}
          wert={String(daten.fuehrungszeugnis_status ?? '')}
          disabled={disabled}
          onChange={v => setzeDaten({ fuehrungszeugnis_status: v })}
        />
        <FehltHinweis sichtbar={fehlendePflicht.includes('fuehrungszeugnis_status')} />
      </div>

      <p style={{
        margin: 0, padding: '12px 14px', borderRadius: 10,
        background: 'rgba(201,150,60,.10)', fontSize: 13, lineHeight: 1.5, color: 'var(--ink4)',
      }}>
        Das erweiterte Führungszeugnis beantragen Sie beim Bürgeramt. Für die
        Arbeit mit pflegebedürftigen Menschen ist es vorgeschrieben. Die Kosten
        übernehmen wir nach Ihrer Einstellung.
      </p>
    </div>
  )
}
