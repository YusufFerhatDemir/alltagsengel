/**
 * Barrierefreiheit-Helfer (BITV 2.0 / WCAG 2.1 AA).
 *
 * Klickbare Elemente, die kein <button> sind, brauchen laut WCAG 2.1.1
 * (Tastatur) und 4.1.2 (Name, Rolle, Wert) drei Dinge: eine Rolle, einen
 * Fokus-Stop und eine Tastaturauslösung. `klickbar()` liefert genau das.
 *
 * Verwendung:
 *   <div {...klickbar(() => auswaehlen(id))} className="chip">…</div>
 *
 * Wo immer möglich ist ein echtes <button> vorzuziehen — dieser Helfer ist
 * für Fälle, in denen das Layout/CSS an einem <div> hängt.
 */
import type { KeyboardEvent } from 'react'

export function klickbar(onClick: () => void, options?: { rolle?: 'button' | 'switch' | 'option' | 'tab'; aktiv?: boolean }) {
  const rolle = options?.rolle ?? 'button'
  return {
    role: rolle,
    tabIndex: 0,
    onClick,
    onKeyDown: (e: KeyboardEvent) => {
      // Enter und Leertaste sind die erwarteten Auslöser für Button-Rollen.
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    },
    ...(rolle === 'switch' ? { 'aria-checked': options?.aktiv ?? false } : {}),
    ...(rolle === 'option' || rolle === 'tab' ? { 'aria-selected': options?.aktiv ?? false } : {}),
  }
}
