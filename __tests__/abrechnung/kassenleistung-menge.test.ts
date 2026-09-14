/**
 * Kassenabrechnung — die Menge einer Leistungszeile
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 44, 14.09.2026)
 *
 * In /admin/abrechnung stand fuer eine zeitbasierte Leistung:
 *
 *     const stunden = (r.duration_minutes || 60) / 60
 *
 * `duration_minutes` ist GENERATED aus start_time/end_time und bleibt
 * NULL, wenn eine der Zeiten fehlt — genau so legt
 * /admin/leistungsnachweis-upload Nachweise an. Der Ersatzwert 60 meldete
 * dem Kostentraeger dann EINE STUNDE, die niemand erfasst hat.
 *
 * Dieselbe erfundene Stunde steht live noch in der Datenbank:
 * `create_invoice_draft_atomic` rechnet mit
 * `COALESCE(duration_minutes, 60)`. Dagegen laeuft Migration
 * 20261130000000; bis sie angewendet ist, ist dieser Code der Riegel.
 */

import { describe, it, expect } from 'vitest'
import {
  kassenLeistungMenge,
  verweigerungsText,
} from '@/lib/abrechnung/kassenleistung-menge'

describe('zeitbasierte Leistung', () => {
  it('rechnet die Menge aus der erfassten Dauer', () => {
    const r = kassenLeistungMenge({ amount: 60, duration_minutes: 120, zeitbasiert: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.menge).toBe(2)
    expect(r.gesamtCent).toBe(6000)
    expect(r.einzelpreisCent).toBe(3000)
  })

  it('verweigert die Zeile ohne Dauer, statt eine Stunde zu erfinden', () => {
    const r = kassenLeistungMenge({ amount: 45, duration_minutes: null, zeitbasiert: true })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.grund).toBe('keine_dauer')
  })

  it('erfindet auch bei Dauer 0 keine Stunde', () => {
    // `|| 60` machte aus der 0 ebenfalls eine Stunde. Der Live-CHECK
    // verbietet Dauer 0 inzwischen, aber die Regel darf nicht davon leben.
    const r = kassenLeistungMenge({ amount: 45, duration_minutes: 0, zeitbasiert: true })
    expect(r.ok).toBe(false)
  })

  it('haelt den Halb-Cent fest (euroZuCent statt Math.round)', () => {
    const r = kassenLeistungMenge({ amount: 1.005, duration_minutes: 60, zeitbasiert: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.gesamtCent).toBe(101)
  })

  it('rundet die Menge auf zwei Stellen', () => {
    const r = kassenLeistungMenge({ amount: 30, duration_minutes: 50, zeitbasiert: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.menge).toBe(0.83)
  })
})

describe('Stueckleistung', () => {
  it('braucht keine Dauer — § 45b hat keine Stundenzahl', () => {
    const r = kassenLeistungMenge({ amount: 131, duration_minutes: null, zeitbasiert: false })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.menge).toBe(1)
    expect(r.einzelpreisCent).toBe(13100)
  })
})

describe('fehlender Betrag', () => {
  it('verweigert ohne Betrag', () => {
    const r = kassenLeistungMenge({ amount: null, duration_minutes: 120, zeitbasiert: true })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.grund).toBe('kein_betrag')
  })

  it('verweigert bei einem negativen Betrag', () => {
    expect(kassenLeistungMenge({ amount: -5, duration_minutes: 120, zeitbasiert: true }).ok).toBe(false)
  })

  it('prueft den Betrag VOR der Dauer — ohne Betrag gibt es nichts zu melden', () => {
    const r = kassenLeistungMenge({ amount: 0, duration_minutes: null, zeitbasiert: true })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.grund).toBe('kein_betrag')
  })
})

describe('Begruendungstexte', () => {
  it('nennt bei fehlender Dauer die erfundene Stunde ausdruecklich', () => {
    expect(verweigerungsText('keine_dauer')).toContain('eine Stunde gemeldet')
  })

  it('nennt den fehlenden Betrag', () => {
    expect(verweigerungsText('kein_betrag')).toContain('kein Betrag')
  })
})
