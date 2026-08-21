'use client'

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
import { useEffect, useRef } from 'react'
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

/**
 * Klickbare Tabellenzeile (WCAG 2.1.1 „Tastatur").
 *
 * Bewusst **ohne** `role="button"`: eine `<tr>` hat die implizite Rolle `row`.
 * Wird sie zum Button umdeklariert, verliert die Tabelle für Screenreader ihre
 * Struktur — der Schaden wäre größer als der Nutzen. Die Zeile bekommt deshalb
 * nur einen Fokus-Stop und eine Tastaturauslösung.
 *
 * Restgrenze: dass die Zeile anklickbar ist, wird weiterhin nur visuell
 * vermittelt. Sauber wäre langfristig ein echter Link in der ersten Zelle;
 * dieser Helfer schließt die Tastatur-Lücke, nicht die Semantik-Lücke.
 *
 *   <tr {...klickbareZeile(() => router.push(pfad))}>…</tr>
 */
export function klickbareZeile(onClick: () => void) {
  return {
    tabIndex: 0,
    onClick,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    },
  }
}

/**
 * Fokus-Falle für modale Dialoge (WCAG 2.1.2 „Keine Tastaturfalle",
 * 2.4.3 „Fokus-Reihenfolge", 2.1.1 „Tastatur").
 *
 * `aria-modal="true"` verbirgt den Hintergrund nur für Screenreader — der
 * Tastaturfokus wandert trotzdem hinter den Dialog. Dieser Hook liefert das
 * fehlende Fokus-Management:
 *
 *   1. Fokus springt beim Öffnen auf das erste bedienbare Element im Dialog.
 *   2. Tab und Shift+Tab zyklieren innerhalb des Dialogs.
 *   3. ESC schließt den Dialog.
 *   4. Beim Schließen kehrt der Fokus zum auslösenden Element zurück.
 *
 * Verwendung:
 *   const dialogRef = useFokusFalle<HTMLDivElement>(onClose)
 *   return <div ref={dialogRef} role="dialog" aria-modal="true">…</div>
 *
 * Für die 21 Admin-Dialoge übernimmt das die Komponente
 * `components/DialogOverlay.tsx` — dort muss der Hook nicht einzeln
 * eingebaut werden.
 */
const FOKUSSIERBAR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useFokusFalle<T extends HTMLElement>(
  onClose?: () => void,
  optionen?: {
    /** Nur aktiv, solange der Dialog offen ist. Bei Dialogen, die als eigene
     *  Komponente ein-/ausgehängt werden, kann das entfallen. */
    aktiv?: boolean
    /** `false` für **nicht**-modale Dialoge (ohne `aria-modal`): dort wäre ein
     *  Tab-Zyklus falsch, der Fokus muss zurück auf die Seite können.
     *  Fokus beim Öffnen, ESC und Fokus-Rückgabe gelten weiterhin. */
    fangen?: boolean
  },
) {
  const aktiv = optionen?.aktiv ?? true
  const fangen = optionen?.fangen ?? true
  const ref = useRef<T | null>(null)
  // Der Handler darf sich zwischen Renders ändern, ohne die Falle neu aufzubauen.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const node = ref.current
    if (!aktiv || !node) return

    // Auslösendes Element merken, damit der Fokus dorthin zurückkehren kann.
    const ausloeser = document.activeElement as HTMLElement | null

    // Nur wirklich sichtbare Elemente zählen: unsichtbare haben keine
    // Client-Rechtecke (deckt display:none, visibility:hidden und
    // zusammengeklappte Bereiche gleichermaßen ab).
    const bedienbare = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOKUSSIERBAR)).filter(
        el => el.getClientRects().length > 0 && el.getAttribute('aria-hidden') !== 'true',
      )

    const erstes = bedienbare()[0]
    if (erstes) {
      erstes.focus()
    } else {
      // Dialog ohne Bedienelemente: der Container selbst nimmt den Fokus,
      // sonst bliebe er im Hintergrund stehen.
      node.setAttribute('tabindex', '-1')
      node.focus()
    }

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !fangen) return

      const liste = bedienbare()
      if (liste.length === 0) {
        e.preventDefault()
        return
      }
      const anfang = liste[0]
      const ende = liste[liste.length - 1]
      const fokussiert = document.activeElement as HTMLElement | null

      // Fokus außerhalb des Dialogs (z. B. nach einem Re-Render) → zurückholen.
      if (!node.contains(fokussiert)) {
        e.preventDefault()
        ;(e.shiftKey ? ende : anfang).focus()
        return
      }
      if (e.shiftKey && fokussiert === anfang) {
        e.preventDefault()
        ende.focus()
      } else if (!e.shiftKey && fokussiert === ende) {
        e.preventDefault()
        anfang.focus()
      }
    }

    // Am Dokument, nicht am Dialog: so greift die Falle auch dann, wenn der
    // Fokus zwischenzeitlich hinter den Dialog gerutscht ist.
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // Nur zurückgeben, wenn das Element noch im Dokument hängt.
      if (ausloeser && document.contains(ausloeser)) ausloeser.focus()
    }
  }, [aktiv, fangen])

  return ref
}
