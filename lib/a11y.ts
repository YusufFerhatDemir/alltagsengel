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

// ── Wer hat den Dialog ausgelöst? ────────────────────────────────────────
// `document.activeElement` allein beantwortet das nicht zuverlässig. WebKit
// fokussiert eine Schaltfläche beim Anklicken NICHT — Safari (macOS wie iOS)
// gibt den Fokus per Klick nur an Formularfelder — und räumt beim `mousedown`
// zusätzlich den bestehenden Fokus ab. In dem Moment, in dem der Dialog
// aufgeht, steht dort also `body`. Die Fokus-Rückgabe unten lief damit ins
// Leere: nach dem Schließen stand der Fokus am Seitenanfang statt auf der
// auslösenden Schaltfläche, und die Tastaturbedienung begann von vorn
// (WCAG 2.4.3). Gemessen am 29.08.2026 im `mobile-safari`-Lauf; in Chromium
// fiel es nicht auf, weil dort der Klick den Fokus mitnimmt.
//
// Deshalb wird mitgeschrieben, was zuletzt bedient wurde. `focusin` deckt
// Tastatur und alle Browser ab, die den Fokus beim Klick mitführen;
// `pointerdown` deckt genau den WebKit-Fall ab, in dem das ausbleibt.
// Beide hören in der Erfassungsphase, damit ein `stopPropagation` einer
// Komponente den Eintrag nicht verschluckt.
//
// Die Beobachter müssen VOR dem auslösenden Klick stehen — der Dialog wird
// erst danach eingehängt, sein Effekt käme zu spät. Sie hängen deshalb am
// Modul, nicht am Hook. Der Verweis wird nur gelesen und beim Schließen
// gegen `document.contains` geprüft; er hält kein entferntes Element fest,
// das nicht ohnehin bis zum nächsten Klick im Speicher bliebe.
let zuletztBedient: HTMLElement | null = null

if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    e => {
      const ziel = e.target as HTMLElement | null
      if (ziel && ziel !== document.body) zuletztBedient = ziel
    },
    true,
  )
  document.addEventListener(
    'pointerdown',
    e => {
      const ziel = (e.target as HTMLElement | null)?.closest?.(FOKUSSIERBAR) as HTMLElement | null
      if (ziel) zuletztBedient = ziel
    },
    true,
  )
}

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
    // `document.activeElement` bleibt die erste Quelle, solange es etwas
    // Sinnvolles zeigt; steht dort `body` (oder nichts), greift der oben
    // mitgeschriebene letzte Bedienvorgang.
    const aktiv0 = document.activeElement as HTMLElement | null
    const ausloeser =
      aktiv0 && aktiv0 !== document.body ? aktiv0 : zuletztBedient

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

      // ── Warum JEDER Tab hier gesetzt wird, nicht nur der am Rand ────────
      // Die frühere Fassung griff nur an den beiden Enden der Liste: am
      // letzten Element vorwärts, am ersten rückwärts. Dazwischen ließ sie
      // den Browser laufen — und setzte damit voraus, dass dessen
      // Tab-Reihenfolge der DOM-Reihenfolge der Liste folgt.
      //
      // WebKit tut das nicht. Safari springt mit Tab standardmäßig nur
      // zwischen FORMULARFELDERN; Links und Schaltflächen werden
      // übersprungen, solange „Tab highlights each item" aus ist. Im
      // Rückruf-Dialog der Startseite steht deshalb nach dem letzten
      // Eingabefeld nicht das Listenende, sondern gar nichts mehr: der
      // Fokus fiel auf `body`, und weil `fokussiert === ende` nie zutraf,
      // hat die Falle es nicht einmal bemerkt. Gemessen am 29.08.2026 im
      // `mobile-safari`-Lauf, reproduzierbar in jedem Versuch, nach dem
      // dritten Tab.
      //
      // Jetzt bestimmt die Falle das Ziel selbst und der Browser bekommt
      // den Tastendruck gar nicht mehr zu sehen. Damit ist die Reihenfolge
      // im Dialog überall dieselbe — die des DOM — statt von einer
      // Browser-Einstellung abzuhängen.
      e.preventDefault()

      // Fokus außerhalb des Dialogs (z. B. nach einem Re-Render, oder weil
      // der Browser ihn ins Nichts gesetzt hat) → zurückholen.
      const i = fokussiert && node.contains(fokussiert) ? liste.indexOf(fokussiert) : -1
      if (i === -1) {
        ;(e.shiftKey ? ende : anfang).focus()
        return
      }
      const ziel = e.shiftKey
        ? (i === 0 ? liste.length - 1 : i - 1)
        : (i === liste.length - 1 ? 0 : i + 1)
      liste[ziel].focus()
    }

    // Am Dokument, nicht am Dialog: so greift die Falle auch dann, wenn der
    // Fokus zwischenzeitlich hinter den Dialog gerutscht ist.
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // Nur zurückgeben, wenn das Element noch im Dokument hängt — und nicht
      // in den Dialog selbst, der gerade verschwindet.
      if (ausloeser && document.contains(ausloeser) && !node.contains(ausloeser)) {
        ausloeser.focus()
      }
    }
  }, [aktiv, fangen])

  return ref
}
