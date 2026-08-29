/**
 * Das Statusvokabular der Oberfläche gegen die Statusmaschine.
 *
 * BEFUND (29.08.2026): `lib/billing/core/status-machine.ts` kennt fünfzehn
 * Rechnungsstatus und trägt für jeden ein deutsches Etikett. Daneben führt
 * `lib/admin/ops.ts` eine ZWEITE Liste — dieselben Status noch einmal, mit
 * Etikett und Farbe für die Anzeige. `abgeschrieben` fehlte darin.
 *
 * Was das bewirkt, ist keine Schönheitsfrage: `statusMeta()` fällt auf
 * `{ label: status, color: '#999' }` zurück. Eine abgeschriebene Rechnung
 * hätte in jeder Liste des Betriebssystems das rohe Wort „abgeschrieben"
 * getragen — kleingeschrieben, in derselben Farbe wie ein leeres Feld.
 *
 * Zwei Listen über dieselbe Frage bleiben so lange stimmig, bis eine von
 * beiden gepflegt wird. Diese Suite prüft nicht, dass sie heute stimmen,
 * sondern dass ein künftiger Status nicht wieder still nur in einer der
 * beiden landet.
 */
import { describe, it, expect } from 'vitest'
import { INVOICE_STATUS } from '@/lib/admin/ops'
import {
  INVOICE_STATUS_LABELS,
  ABSCHREIBBAR_VON,
  isTerminalStatus,
  isTransitionAllowed,
  type InvoiceStatus,
} from '@/lib/billing/core/status-machine'

const ALLE = Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]

describe('Anzeigevokabular deckt die Statusmaschine ab', () => {
  it.each(ALLE)('kennt %s', (status) => {
    expect(INVOICE_STATUS[status], `Status "${status}" fehlt in INVOICE_STATUS (lib/admin/ops.ts)`).toBeDefined()
  })

  it('zeigt für jeden Status ein deutsches Etikett, nie den rohen Schlüssel', () => {
    for (const status of ALLE) {
      expect(INVOICE_STATUS[status].label).toBe(INVOICE_STATUS_LABELS[status])
    }
  })

  it('gibt jedem Status eine Farbe', () => {
    for (const status of ALLE) {
      expect(INVOICE_STATUS[status].color).toMatch(/^#[0-9A-Fa-f]{3,8}$/)
    }
  })
})

describe('ABSCHREIBBAR_VON stammt aus der Übergangstabelle', () => {
  it('enthält genau die Status, aus denen die Maschine den Übergang erlaubt', () => {
    for (const status of ALLE) {
      expect(
        ABSCHREIBBAR_VON.has(status),
        `ABSCHREIBBAR_VON und isTransitionAllowed widersprechen sich bei "${status}"`,
      ).toBe(isTransitionAllowed(status, 'abgeschrieben'))
    }
  })

  it('enthält keinen Endstatus — was fertig ist, wird nicht abgeschrieben', () => {
    for (const status of ABSCHREIBBAR_VON) {
      expect(isTerminalStatus(status), `"${status}" ist Endstatus und trotzdem abschreibbar`).toBe(false)
    }
  })

  it('enthält weder Entwurf noch geprüft — auf einen Entwurf gibt es keine Forderung', () => {
    expect(ABSCHREIBBAR_VON.has('entwurf')).toBe(false)
    expect(ABSCHREIBBAR_VON.has('geprueft')).toBe(false)
  })

  it('ist nicht leer', () => {
    // Eine leere Menge wäre die stillste aller Regressionen: der Knopf
    // verschwände aus der Oberfläche und jeder Test oben bliebe grün.
    expect(ABSCHREIBBAR_VON.size).toBeGreaterThan(0)
  })
})

describe('abgeschrieben ist ein Endstatus', () => {
  it('gilt der Maschine als endgültig', () => {
    expect(isTerminalStatus('abgeschrieben')).toBe(true)
  })

  it('lässt keinen Übergang mehr zu — auch nicht zurück auf bezahlt', () => {
    for (const ziel of ALLE) {
      expect(isTransitionAllowed('abgeschrieben', ziel)).toBe(false)
    }
  })
})
