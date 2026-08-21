'use client'

/**
 * Overlay für modale Admin-Dialoge (BITV 2.0 / WCAG 2.1 AA).
 *
 * Ersetzt das bisherige
 *   <div role="presentation" className="admin-modal-overlay" onClick={onClose}>
 * und bringt das Fokus-Management mit, das `aria-modal="true"` allein nicht
 * leistet: Fokus beim Öffnen in den Dialog, Tab-Zyklus innerhalb des Dialogs,
 * ESC schließt, Fokus zurück zum auslösenden Element (WCAG 2.1.2, 2.4.3).
 *
 * Der Klick auf die Fläche schließt weiterhin — die Fläche bleibt dabei
 * `role="presentation"`, weil ein Overlay keine Schaltfläche ist. Der
 * zugängliche Weg zum Schließen ist ESC bzw. der Abbrechen-Button.
 */
import type { CSSProperties, ReactNode } from 'react'
import { useFokusFalle } from '@/lib/a11y'

export default function DialogOverlay({
  onClose,
  className = 'admin-modal-overlay',
  style,
  children,
}: {
  onClose: () => void
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const ref = useFokusFalle<HTMLDivElement>(onClose)

  return (
    <div ref={ref} role="presentation" className={className} style={style} onClick={onClose}>
      {children}
    </div>
  )
}
