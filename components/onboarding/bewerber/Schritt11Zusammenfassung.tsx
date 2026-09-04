'use client'
/**
 * Schritt 11 — Angaben prüfen.
 *
 * Alles nur zum Lesen, je Block ein Korrektur-Knopf. Der springt zurück
 * zum passenden Schritt; das Zurückspringen selbst begrenzt der Wizard
 * (springeZu) auf bereits erreichte Schritte.
 */
import { Karte, pflegeMiniBtn } from '@/components/admin/PflegeUI'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'
import { baueBloecke, offenePflichtangaben } from './zusammenfassung'
import { TIPPFLAECHE_MIN } from '@/components/onboarding/masse'

export default function Schritt11Zusammenfassung({ alleDaten, geheZuSchritt, disabled }: WizardMaskeProps) {
  const bloecke = baueBloecke(alleDaten)
  const offen = offenePflichtangaben(alleDaten)

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {offen.length > 0 && (
        <p role="status" style={{
          margin: 0, padding: '12px 14px', borderRadius: 10,
          background: 'rgba(180,40,40,.10)', color: '#B42828', fontSize: 14, lineHeight: 1.5,
        }}>
          Es fehlen noch: {offen.join(', ')}. Sie können die Bewerbung trotzdem
          absenden — wir fragen die Angaben dann nach.
        </p>
      )}

      {bloecke.map(block => (
        <Karte
          key={block.schluessel}
          titel={block.titel}
          aktion={
            <button
              type="button"
              disabled={disabled}
              onClick={() => geheZuSchritt(block.nummer)}
              style={{ ...pflegeMiniBtn, minHeight: TIPPFLAECHE_MIN, paddingInline: 14 }}
            >
              Ändern
            </button>
          }
        >
          <dl style={{ margin: 0, display: 'grid', gap: 8 }}>
            {block.eintraege.map(e => (
              <div key={e.feld} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <dt style={{ fontSize: 13, color: 'var(--ink5)', minWidth: 150 }}>{e.label}</dt>
                <dd style={{ margin: 0, fontSize: 14, color: 'var(--ink)', flex: 1 }}>{e.text}</dd>
              </div>
            ))}
          </dl>
        </Karte>
      ))}
    </div>
  )
}
