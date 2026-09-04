'use client'
/**
 * Schritt 8 — Unterlagen.
 *
 * Freiwillig, wie im Bewerberablauf. Der Pflegegradbescheid beschleunigt
 * die Abrechnung mit der Kasse, ist aber keine Voraussetzung für die
 * Anfrage — und wer ihn gerade nicht findet, soll weitermachen können.
 */
import { useState } from 'react'
import { Feld, pflegeSecondaryBtn } from '@/components/admin/PflegeUI'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

const ABLAGEN = [
  { art: 'pflegegradbescheid', label: 'Pflegegradbescheid', hinweis: 'Der Bescheid der Pflegekasse.' },
  { art: 'kostenuebernahme', label: 'Kostenübernahme', hinweis: 'Falls eine Zusage vorliegt.' },
  { art: 'vollmacht', label: 'Vollmacht oder Betreuungsurkunde', hinweis: 'Wenn Sie für jemanden handeln.' },
] as const

export interface Schritt08Props extends WizardMaskeProps {
  onUpload?: (art: string, datei: File) => Promise<string>
}

export default function Schritt08Unterlagen({ daten, setzeDaten, disabled, onUpload }: Schritt08Props) {
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  async function nimm(art: string, datei: File | null) {
    if (!datei || !onUpload) return
    setLaeuft(art); setFehler(null)
    try {
      setzeDaten({ [art]: await onUpload(art, datei) })
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Das Hochladen hat nicht geklappt.')
    } finally {
      setLaeuft(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {ABLAGEN.map(a => {
        const vorhanden = String(daten[a.art] ?? '')
        return (
          <Feld key={a.art} label={a.label} hint={a.hinweis}>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={disabled || laeuft !== null || !onUpload}
              onChange={e => nimm(a.art, e.target.files?.[0] ?? null)}
              style={{ ...pflegeSecondaryBtn, minHeight: 52, padding: 12, width: '100%' }}
            />
            {laeuft === a.art && <span style={{ fontSize: 12, color: 'var(--ink5)' }}>Wird hochgeladen …</span>}
            {vorhanden && laeuft !== a.art && (
              <span style={{ fontSize: 12, color: '#2E7D32' }}>✓ {vorhanden}</span>
            )}
          </Feld>
        )
      })}

      {fehler && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B42828' }}>
          {fehler} Sie können den Schritt überspringen und die Unterlagen später nachreichen.
        </p>
      )}

      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink5)' }}>
        Alles freiwillig. Ein Foto vom Bescheid genügt.
      </p>
    </div>
  )
}
