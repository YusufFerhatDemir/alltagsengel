'use client'
/**
 * Schritt 10 — Unterlagen hochladen.
 *
 * Freiwillig. Wer gerade kein Dokument zur Hand hat, soll weitermachen
 * können; die Lücke steht danach in `fehlende_angaben` und kommt über die
 * Erinnerung zurück.
 *
 * Der eigentliche Upload läuft über POST /api/onboarding/dokumente. Diese
 * Maske hält nur fest, WAS hochgeladen wurde — die Datei selbst liegt im
 * Storage, nicht im Fortschritt.
 */
import { useState } from 'react'
import { Feld, pflegeSecondaryBtn } from '@/components/admin/PflegeUI'
import type { WizardMaskeProps } from '@/components/onboarding/Wizard'

interface Ablage { art: string; label: string; hinweis: string }

const ABLAGEN: readonly Ablage[] = [
  { art: 'lebenslauf', label: 'Lebenslauf', hinweis: 'PDF, JPG oder PNG — auch ein Foto genügt.' },
  { art: 'zeugnisse', label: 'Zeugnisse', hinweis: 'Arbeitszeugnisse oder Abschlüsse.' },
  { art: 'qualifikationsnachweise', label: 'Qualifikationsnachweise', hinweis: 'Kurse, Fortbildungen, Zertifikate.' },
]

export interface Schritt10Props extends WizardMaskeProps {
  /** Lädt eine Datei hoch und liefert den gespeicherten Namen zurück. */
  onUpload?: (art: string, datei: File) => Promise<string>
}

export default function Schritt10Unterlagen({ daten, setzeDaten, disabled, onUpload }: Schritt10Props) {
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  async function nimm(art: string, datei: File | null) {
    if (!datei || !onUpload) return
    setLaeuft(art)
    setFehler(null)
    try {
      const name = await onUpload(art, datei)
      setzeDaten({ [art]: name })
    } catch (err) {
      // Fail-soft: der Schritt ist freiwillig. Ein misslungener Upload
      // darf niemanden aus dem Ablauf werfen.
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
            {laeuft === a.art && (
              <span style={{ fontSize: 12, color: 'var(--ink5)' }}>Wird hochgeladen …</span>
            )}
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
        Alles freiwillig. Sie können auch ohne Unterlagen weitermachen und sie
        später nachreichen.
      </p>
    </div>
  )
}
