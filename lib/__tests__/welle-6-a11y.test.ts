// ═══════════════════════════════════════════════════════════════
// Welle 6 — Barrierefreiheits-Helfer (lib/a11y.ts)
// ═══════════════════════════════════════════════════════════════
//
// klickbar() und klickbareZeile() liefern Props-Objekte — reine
// Funktionen, kein React-Rendering nötig. Sie schließen WCAG 2.1.1
// („Tastatur") an Nicht-Button-Elementen; bricht der Tastatur-Handler,
// ist die Lücke visuell unsichtbar.
//
// useFokusFalle ist ein Hook und braucht ein DOM — hier nicht geprüft.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { klickbar, klickbareZeile } from '../a11y'

/** Minimaler Tastatur-Event-Doppelgänger mit preventDefault-Protokoll. */
function tastenEvent(key: string) {
  let verhindert = false
  return {
    event: { key, preventDefault: () => { verhindert = true } },
    wurdeVerhindert: () => verhindert,
  }
}

// ───────────────────────────────────────────────────────────────
describe('klickbar', () => {
  test('setzt standardmäßig role="button" und einen Fokus-Stop', () => {
    const p = klickbar(() => {})
    assert.equal(p.role, 'button')
    assert.equal(p.tabIndex, 0)
  })

  test('reicht den Klick-Handler unverändert durch', () => {
    const fn = () => {}
    assert.equal(klickbar(fn).onClick, fn)
  })

  test('Enter löst aus und unterdrückt die Standardaktion', () => {
    let aufrufe = 0
    const p = klickbar(() => { aufrufe++ })
    const t = tastenEvent('Enter')
    p.onKeyDown(t.event as never)
    assert.equal(aufrufe, 1)
    assert.equal(t.wurdeVerhindert(), true)
  })

  test('Leertaste löst aus — sonst scrollt die Seite statt zu klicken', () => {
    let aufrufe = 0
    const p = klickbar(() => { aufrufe++ })
    const t = tastenEvent(' ')
    p.onKeyDown(t.event as never)
    assert.equal(aufrufe, 1)
    assert.equal(t.wurdeVerhindert(), true)
  })

  test('andere Tasten lösen nicht aus und werden nicht abgefangen', () => {
    let aufrufe = 0
    const p = klickbar(() => { aufrufe++ })
    for (const key of ['Tab', 'Escape', 'a', 'ArrowDown', 'Spacebar']) {
      const t = tastenEvent(key)
      p.onKeyDown(t.event as never)
      assert.equal(t.wurdeVerhindert(), false, `${key} wurde abgefangen`)
    }
    assert.equal(aufrufe, 0)
  })

  test('role="button" trägt weder aria-checked noch aria-selected', () => {
    const p = klickbar(() => {}) as Record<string, unknown>
    assert.equal('aria-checked' in p, false)
    assert.equal('aria-selected' in p, false)
  })

  test('role="switch" trägt aria-checked', () => {
    const an = klickbar(() => {}, { rolle: 'switch', aktiv: true }) as Record<string, unknown>
    const aus = klickbar(() => {}, { rolle: 'switch', aktiv: false }) as Record<string, unknown>
    assert.equal(an.role, 'switch')
    assert.equal(an['aria-checked'], true)
    assert.equal(aus['aria-checked'], false)
    assert.equal('aria-selected' in an, false)
  })

  test('switch ohne aktiv-Angabe meldet false, nicht undefined', () => {
    const p = klickbar(() => {}, { rolle: 'switch' }) as Record<string, unknown>
    assert.equal(p['aria-checked'], false)
  })

  test('role="option" und role="tab" tragen aria-selected', () => {
    for (const rolle of ['option', 'tab'] as const) {
      const p = klickbar(() => {}, { rolle, aktiv: true }) as Record<string, unknown>
      assert.equal(p.role, rolle)
      assert.equal(p['aria-selected'], true)
      assert.equal('aria-checked' in p, false)
    }
  })

  test('option ohne aktiv-Angabe meldet false', () => {
    const p = klickbar(() => {}, { rolle: 'option' }) as Record<string, unknown>
    assert.equal(p['aria-selected'], false)
  })

  test('leeres Options-Objekt verhält sich wie gar keins', () => {
    assert.deepEqual(Object.keys(klickbar(() => {}, {})).sort(), Object.keys(klickbar(() => {})).sort())
  })

  test('jeder Aufruf liefert ein frisches Objekt', () => {
    const fn = () => {}
    assert.notEqual(klickbar(fn), klickbar(fn))
  })
})

// ───────────────────────────────────────────────────────────────
describe('klickbareZeile', () => {
  test('setzt KEINE role — eine <tr> behält ihre implizite Rolle „row"', () => {
    const p = klickbareZeile(() => {}) as Record<string, unknown>
    assert.equal('role' in p, false)
  })

  test('setzt einen Fokus-Stop', () => {
    assert.equal(klickbareZeile(() => {}).tabIndex, 0)
  })

  test('reicht den Klick-Handler unverändert durch', () => {
    const fn = () => {}
    assert.equal(klickbareZeile(fn).onClick, fn)
  })

  test('Enter und Leertaste lösen aus und unterdrücken die Standardaktion', () => {
    for (const key of ['Enter', ' ']) {
      let aufrufe = 0
      const p = klickbareZeile(() => { aufrufe++ })
      const t = tastenEvent(key)
      p.onKeyDown(t.event as never)
      assert.equal(aufrufe, 1, `${key} löste nicht aus`)
      assert.equal(t.wurdeVerhindert(), true)
    }
  })

  test('andere Tasten lösen nicht aus', () => {
    let aufrufe = 0
    const p = klickbareZeile(() => { aufrufe++ })
    for (const key of ['Tab', 'Escape', 'x']) {
      const t = tastenEvent(key)
      p.onKeyDown(t.event as never)
      assert.equal(t.wurdeVerhindert(), false)
    }
    assert.equal(aufrufe, 0)
  })

  test('trägt keine ARIA-Zustände — die Semantik der Tabelle bleibt unangetastet', () => {
    const p = klickbareZeile(() => {}) as Record<string, unknown>
    assert.deepEqual(Object.keys(p).sort(), ['onClick', 'onKeyDown', 'tabIndex'])
  })
})
