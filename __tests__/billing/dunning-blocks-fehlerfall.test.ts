// ═══════════════════════════════════════════════════════════════════════
// checkDunningBlocks — wenn die Sperrprüfung selbst scheitert
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND 31.08.2026: Die drei Blocker-Abfragen in checkDunningBlocks
// (Beanstandungen, Widersprüche gegen eine Kürzung, offene Gutschriften)
// verwarfen ihren Fehler. Sie sind SPERREN — sie stehen dort, um eine
// Mahnung zu VERHINDERN. Fiel eine aus, war ihr Ergebnis null, `blocks`
// blieb leer, und der Mahnlauf sah eine saubere Rechnung.
//
// Aus einer Netzstörung wurde damit eine Mahnung an jemanden, der der
// Forderung ausdrücklich widersprochen hat. Der Schaden ist nicht nur
// juristisch: eine unberechtigte Mahnung ist ein Vorwurf gegenüber einem
// Menschen, der bereits Einwände erhoben hat.
//
// Diese Suite hält fest, dass ein Fehler SELBST zur Sperre wird — lieber
// eine Mahnung zu spät als eine unberechtigte.
import { describe, it, expect } from 'vitest'
import { checkDunningBlocks } from '@/lib/billing/core/dunning'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'

const INV = '00000000-0000-4000-8000-0000000000dd'

const RECHNUNG_OK = {
  id: INV,
  status: 'freigegeben',
  total_amount: 200,
  paid_amount: 0,
  due_date: '2026-01-01',
}

interface Lage {
  beanstandungenFehler?: string
  differenzenFehler?: string
  korrekturenFehler?: string
}

function db(lage: Lage = {}) {
  return (a: FakeAufruf) => {
    switch (a.tabelle) {
      case 'invoices':
        return { data: RECHNUNG_OK }
      case 'invoice_disputes':
        return lage.beanstandungenFehler
          ? { error: { message: lage.beanstandungenFehler } }
          : { data: [] }
      case 'payment_differences':
        return lage.differenzenFehler
          ? { error: { message: lage.differenzenFehler } }
          : { data: [] }
      case 'invoice_corrections':
        return lage.korrekturenFehler
          ? { error: { message: lage.korrekturenFehler } }
          : { data: [] }
      default:
        return { data: [] }
    }
  }
}

async function blocks(lage: Lage = {}) {
  const fake = erstelleFakeSupabase(db(lage))
  return checkDunningBlocks(fake.client as never, INV)
}

describe('checkDunningBlocks — Grundlage', () => {
  it('eine saubere Rechnung hat keine Sperre', async () => {
    // Ohne diesen Fall wäre nicht unterscheidbar, ob die Fehlerfälle unten
    // greifen oder ob die Funktion immer sperrt.
    expect(await blocks()).toEqual([])
  })
})

describe('checkDunningBlocks — eine gestörte Abfrage wird selbst zur Sperre', () => {
  it('sperrt, wenn Beanstandungen nicht abfragbar sind', async () => {
    const b = await blocks({ beanstandungenFehler: 'timeout' })
    expect(b).toHaveLength(1)
    expect(b[0].reason).toContain('Beanstandungen nicht prüfbar')
  })

  it('sperrt, wenn Widersprüche gegen eine Kürzung nicht abfragbar sind', async () => {
    const b = await blocks({ differenzenFehler: 'connection reset' })
    expect(b).toHaveLength(1)
    expect(b[0].reason).toContain('Widersprüche nicht prüfbar')
  })

  it('sperrt, wenn offene Gutschriften nicht abfragbar sind', async () => {
    // Solange der Betrag der Forderung nicht feststeht, darf nicht gemahnt
    // werden — auch dann nicht, wenn die Prüfung dieses Betrags scheitert.
    const b = await blocks({ korrekturenFehler: 'timeout' })
    expect(b).toHaveLength(1)
    expect(b[0].reason).toContain('Gutschriften nicht prüfbar')
  })

  it('sammelt mehrere gestörte Prüfungen, statt bei der ersten aufzuhören', async () => {
    // Der Mahnlauf zeigt dem Sachbearbeiter alle Gründe auf einmal; wer
    // nur den ersten sieht, behebt einen und läuft in den nächsten.
    const b = await blocks({
      beanstandungenFehler: 'timeout',
      differenzenFehler: 'timeout',
      korrekturenFehler: 'timeout',
    })
    expect(b).toHaveLength(3)
  })

  it('nennt den Grund als Störung, nicht als fachliche Sperre', async () => {
    // Der Unterschied ist für die Buchhaltung entscheidend: „offene
    // Beanstandung" heisst nachfassen, „nicht prüfbar" heisst neu laden.
    const b = await blocks({ beanstandungenFehler: 'timeout' })
    expect(b[0].reason).not.toBe('1 offene Beanstandung(en)')
    expect(b[0].reason).toContain('timeout')
  })
})
