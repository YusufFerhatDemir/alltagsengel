// ═══════════════════════════════════════════════════════════════════════════
// PILOT CONTROL CENTER — die Phasenkette des Erstbetriebs
//
// Diese Übersicht ist eine ANZEIGETAFEL. Sie ist gefährlich, wenn sie
//
//   1. etwas ausführt oder freigibt — geprüft wird deshalb: keine
//      Schreiboperation, keine POST-Route, kein Formular auf der Seite,
//   2. eine gescheiterte Messung als 0 darstellt — „keine offene Freigabe"
//      und „Tabelle gibt es nicht" führen zu völlig verschiedenen nächsten
//      Schritten,
//   3. eine Abfrage ohne Mandantenzaun macht — der Dienst läuft mit
//      service_role (BYPASSRLS), eine Zahl sieht immer plausibel aus,
//   4. VERIFIED behauptet, ohne die Gegenprüfung gerechnet zu haben —
//      besonders bei RECONCILIATION.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  ermittlePilotPhasen,
  PHASEN_REIHENFOLGE,
  PHASEN_FREIGABE_HINWEIS,
  type PhaseId,
  type PilotPhasenUebersicht,
  type VorgangStatus,
} from '@/lib/pilot/pilot-phasen'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'
import { exportiertHandler } from '../helpers/route-quelle'

const ORG = '11111111-1111-4111-8111-111111111111'
const WURZEL = join(__dirname, '..', '..')

/** Ein Doppelgänger, der jede Zählabfrage mit 0 beantwortet. */
function fake(
  antwort: (a: FakeAufruf) => { data?: unknown; error?: { message: string } | null; count?: number | null } | undefined = () => undefined,
) {
  return erstelleFakeSupabase(a => {
    const eigen = antwort(a)
    if (eigen) return eigen
    if (a.head) return { count: 0 }
    return { data: [] }
  })
}

async function lauf(
  f: ReturnType<typeof fake>,
  quelle: Record<string, string | undefined> = {},
): Promise<PilotPhasenUebersicht> {
  return ermittlePilotPhasen(f.client as unknown as SupabaseClient, {
    organizationId: ORG, quelle,
  })
}

function phase(u: PilotPhasenUebersicht, id: PhaseId) {
  return u.phasen.find(p => p.id === id)!
}

/**
 * Antwortgeber, der bestimmten Zählabfragen einen Wert gibt.
 * Der Schlüssel ist `tabelle` plus optional ein Filterwert.
 */
function zaehlerFuer(werte: { tabelle: string; wenn?: (a: FakeAufruf) => boolean; count: number }[]) {
  return (a: FakeAufruf) => {
    for (const w of werte) {
      if (a.tabelle !== w.tabelle) continue
      if (w.wenn && !w.wenn(a)) continue
      return { count: w.count }
    }
    return undefined
  }
}

const ohneFilterAusser = (spalten: string[]) => (a: FakeAufruf) =>
  !a.filter.some(f => f.spalte !== 'organization_id' && !spalten.includes(f.spalte))

// ── Versendet: belegt vs. unbelegt ───────────────────────────────────────
// Seit Phase 8.4 fragt die Phasenkette zweimal nach `sent_at IS NOT NULL`:
// einmal insgesamt, einmal zusaetzlich mit `frozen_at IS NULL`. Ein Fixture,
// das beide Abfragen gleich beantwortet, behauptet „alle Versendungen sind
// unbelegt" — deshalb muessen sie hier getrennt werden.
const istVersendetGesamt = (a: FakeAufruf) =>
  hatFilter(a, 'not', 'sent_at') && !hatFilter(a, 'is', 'frozen_at', null)
const istVersendetUnbelegt = (a: FakeAufruf) =>
  hatFilter(a, 'not', 'sent_at') && hatFilter(a, 'is', 'frozen_at', null)

/** n belegte Versendungen (festgeschrieben), keine unbelegten. */
function versendetBelegt(n: number) {
  return [
    { tabelle: 'invoices', wenn: istVersendetUnbelegt, count: 0 },
    { tabelle: 'invoices', wenn: istVersendetGesamt, count: n },
  ]
}

/** n Versandzeitpunkte OHNE Festschreibung — kein einziger belegter Versand. */
function versendetUnbelegt(n: number) {
  return [
    { tabelle: 'invoices', wenn: istVersendetUnbelegt, count: n },
    { tabelle: 'invoices', wenn: istVersendetGesamt, count: n },
  ]
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Struktur
// ═══════════════════════════════════════════════════════════════════════

describe('Struktur', () => {
  it('liefert genau die neun Phasen des Auftrags, in Reihenfolge', async () => {
    const u = await lauf(fake())
    expect(u.phasen.map(p => p.id)).toEqual([
      'PRE_FLIGHT', 'APPROVAL', 'SEND', 'DELIVERY',
      'CAMT', 'MATCH', 'ALLOCATION', 'RECONCILIATION', 'AUDIT',
    ])
    expect(PHASEN_REIHENFOLGE).toEqual(u.phasen.map(p => p.id))
    expect(u.phasen.map(p => p.nr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('jede Phase nennt Status, Begründung, Backend-Gate und mindestens eine Kennzahl', async () => {
    const u = await lauf(fake())
    for (const p of u.phasen) {
      expect(p.titel.length).toBeGreaterThan(3)
      expect(p.begruendung.length).toBeGreaterThan(10)
      expect(p.gate.length).toBeGreaterThan(5)
      expect(p.kennzahlen.length).toBeGreaterThan(0)
    }
  })

  it('jeder Status stammt aus dem vereinbarten Vorrat', async () => {
    const erlaubt: VorgangStatus[] = [
      'NOT_STARTED', 'READY', 'APPROVED', 'EXECUTING', 'VERIFIED', 'FAILED', 'BLOCKED',
    ]
    const u = await lauf(fake())
    for (const p of u.phasen) expect(erlaubt).toContain(p.status)
  })

  it('trägt den Freigabehinweis im Datenmodell, nicht nur im Seitentext', async () => {
    const u = await lauf(fake())
    expect(u.freigabeHinweis).toBe(PHASEN_FREIGABE_HINWEIS)
    expect(u.freigabeHinweis).toContain('erlaubt nichts')
    expect(u.ausfuehrend).toBe(false)
  })

  it('die aktuelle Phase ist die erste, die nicht VERIFIED ist', async () => {
    const u = await lauf(fake())
    const ersteOffene = u.phasen.find(p => p.status !== 'VERIFIED')
    expect(u.aktuellePhase?.id).toBe(ersteOffene?.id)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Keine Ausführung
// ═══════════════════════════════════════════════════════════════════════

describe('Keine Ausführung', () => {
  it('kein insert, update oder delete', async () => {
    const f = fake()
    await lauf(f)
    expect(f.aufrufe.filter(a => a.operation !== 'select')).toEqual([])
  })

  it('das Modul kennt keine schreibende Kette', () => {
    const quelle = readFileSync(join(WURZEL, 'lib/pilot/pilot-phasen.ts'), 'utf8')
    for (const op of ['.insert(', '.update(', '.delete(', '.upsert(']) {
      expect(quelle).not.toContain(op)
    }
  })

  it('die Route hat weiterhin kein POST/PUT/PATCH/DELETE', () => {
    const quelle = readFileSync(join(WURZEL, 'app/api/admin/pilot/route.ts'), 'utf8')
    for (const methode of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(exportiertHandler(quelle, methode), `${methode} darf es nicht geben`).toBe(false)
    }
    expect(exportiertHandler(quelle, 'GET')).toBe(true)
  })

  it('die Seite hat kein Formular und keinen Klick-Handler', () => {
    const quelle = readFileSync(join(WURZEL, 'app/admin/pilot/page.tsx'), 'utf8')
    expect(quelle).not.toContain('<form')
    expect(quelle).not.toContain('onClick')
    expect(quelle).not.toContain('<button')
  })

  it('jede Phase nennt das Modul, das die Aktion wirklich freigibt', async () => {
    const u = await lauf(fake())
    for (const p of u.phasen) {
      // Ein Gate ist ein Pfad oder eine Modulangabe — nie diese Seite selbst.
      expect(p.gate).not.toContain('pilot-phasen')
      expect(p.gate).not.toContain('admin/pilot')
      expect(p.gate).toMatch(/\.(ts|tsx)|lib\/|app\//)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Fail-closed
// ═══════════════════════════════════════════════════════════════════════

describe('Fail-closed', () => {
  it('eine gescheiterte Messung ergibt null und BLOCKED, nicht 0 und NOT_STARTED', async () => {
    const f = fake(a => a.tabelle === 'invoices' ? { error: { message: 'permission denied' } } : undefined)
    const u = await lauf(f)
    expect(phase(u, 'PRE_FLIGHT').status).toBe('BLOCKED')
    expect(phase(u, 'PRE_FLIGHT').kennzahlen.every(k => k.wert === null)).toBe(true)
    expect(u.hinweise.join(' ')).toContain('permission denied')
  })

  it('eine geworfene Ausnahme wird ebenso behandelt wie ein Fehlerfeld', async () => {
    const f = erstelleFakeSupabase(a => {
      if (a.tabelle === 'camt_imports') throw new Error('Verbindung abgebrochen')
      if (a.head) return { count: 0 }
      return { data: [] }
    })
    const u = await lauf(f)
    expect(phase(u, 'CAMT').status).toBe('BLOCKED')
    expect(u.hinweise.join(' ')).toContain('Verbindung abgebrochen')
  })

  it('eine fehlende pilot_send_gate-Tabelle ist BLOCKED und nennt die Migration', async () => {
    const f = fake(a => a.tabelle === 'pilot_send_gate'
      ? { error: { message: 'relation "public.pilot_send_gate" does not exist' } }
      : undefined)
    const u = await lauf(f)
    const p = phase(u, 'APPROVAL')
    expect(p.status).toBe('BLOCKED')
    expect(p.begruendung).toContain('20261005000000')
    expect(p.naechsterSchritt).toContain('SQL-Editor')
  })

  it('keine Phase ist VERIFIED, wenn ihre Messung fehlgeschlagen ist', async () => {
    const f = fake(() => ({ error: { message: 'alles kaputt' } }))
    const u = await lauf(f)
    expect(u.phasen.filter(p => p.status === 'VERIFIED')).toEqual([])
    expect(u.fortschritt.verifiziert).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Mandantenzaun
// ═══════════════════════════════════════════════════════════════════════

describe('Mandantentrennung', () => {
  it('JEDE Abfrage filtert auf organization_id', async () => {
    const f = fake()
    await lauf(f)
    expect(f.aufrufe.length).toBeGreaterThan(10)
    const ohneFence = f.aufrufe.filter(a => !hatFilter(a, 'eq', 'organization_id', ORG))
    expect(ohneFence.map(a => a.tabelle)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Die Phasenlogik
// ═══════════════════════════════════════════════════════════════════════

describe('PRE-FLIGHT', () => {
  it('NOT_STARTED ohne versandfähige Rechnung', async () => {
    const u = await lauf(fake())
    expect(phase(u, 'PRE_FLIGHT').status).toBe('NOT_STARTED')
  })

  it('READY, sobald eine Rechnung festgeschrieben und versandfähig ist', async () => {
    const f = fake(zaehlerFuer([
      { tabelle: 'invoices', wenn: a => hatFilter(a, 'is', 'sent_at', null), count: 3 },
    ]))
    const u = await lauf(f)
    expect(phase(u, 'PRE_FLIGHT').status).toBe('READY')
    // Und die Zahl darf nicht als Freigabe gelesen werden.
    expect(phase(u, 'PRE_FLIGHT').begruendung).toContain('sagt es NICHT')
  })

  it('VERIFIED, sobald etwas BELEGT versendet wurde', async () => {
    const f = fake(zaehlerFuer(versendetBelegt(1)))
    const u = await lauf(f)
    expect(phase(u, 'PRE_FLIGHT').status).toBe('VERIFIED')
  })

  it('NICHT VERIFIED, wenn der Versandzeitpunkt ohne Festschreibung dasteht', async () => {
    // Der Versandweg weist eine nicht festgeschriebene Rechnung ab — ein
    // sent_at ohne frozen_at kann also nicht von ihm stammen. Vor Phase 8.4
    // meldete die Kette hier „der Preflight ist mindestens einmal
    // durchlaufen", obwohl er nie lief.
    const f = fake(zaehlerFuer(versendetUnbelegt(3)))
    const u = await lauf(f)
    expect(phase(u, 'PRE_FLIGHT').status).toBe('NOT_STARTED')
    expect(phase(u, 'PRE_FLIGHT').begruendung).toContain('nicht festgeschrieben')
  })
})

describe('APPROVAL', () => {
  it('APPROVED bei offenem Token', async () => {
    const f = fake(zaehlerFuer([
      { tabelle: 'invoices', wenn: a => hatFilter(a, 'is', 'sent_at', null), count: 1 },
      { tabelle: 'pilot_send_gate', wenn: a => hatFilter(a, 'is', 'verbraucht_am', null), count: 1 },
    ]))
    const u = await lauf(f)
    expect(phase(u, 'APPROVAL').status).toBe('APPROVED')
  })

  it('VERIFIED bei verbrauchtem Token', async () => {
    const f = fake(zaehlerFuer([
      { tabelle: 'pilot_send_gate', wenn: a => hatFilter(a, 'not', 'verbraucht_am'), count: 1 },
    ]))
    const u = await lauf(f)
    expect(phase(u, 'APPROVAL').status).toBe('VERIFIED')
  })

  it('BLOCKED bei offener Versandsperre — sie schlägt ein verbrauchtes Token', async () => {
    const f = fake(zaehlerFuer([
      { tabelle: 'pilot_send_gate', wenn: a => hatFilter(a, 'not', 'verbraucht_am'), count: 1 },
      { tabelle: 'pilot_versand_sperre', count: 1 },
    ]))
    const u = await lauf(f)
    expect(phase(u, 'APPROVAL').status).toBe('BLOCKED')
    expect(phase(u, 'APPROVAL').begruendung).toContain('Versandsperre')
  })
})

describe('SEND und DELIVERY', () => {
  it('FAILED, wenn alle Versandversuche gescheitert sind', async () => {
    const f = fake(zaehlerFuer([
      { tabelle: 'invoice_email_log', wenn: a => hatFilter(a, 'eq', 'status', 'fehlgeschlagen'), count: 2 },
    ]))
    const u = await lauf(f)
    expect(phase(u, 'SEND').status).toBe('FAILED')
    expect(phase(u, 'DELIVERY').status).toBe('FAILED')
  })

  it('EXECUTING bei belegtem sent_at ohne erfolgreiche Protokollzeile — der Fall für die Nachprüfung', async () => {
    const f = fake(zaehlerFuer(versendetBelegt(1)))
    const u = await lauf(f)
    expect(phase(u, 'SEND').status).toBe('VERIFIED')
    expect(phase(u, 'DELIVERY').status).toBe('EXECUTING')
    expect(phase(u, 'DELIVERY').naechsterSchritt).toContain('pruefeNachVersand')
  })

  it('BLOCKED statt VERIFIED, wenn alle Versandzeitpunkte unbelegt sind', async () => {
    // Der gefährlichste Zustand: es SIEHT versendet aus, ist es aber
    // nachweislich nicht.
    const f = fake(zaehlerFuer(versendetUnbelegt(3)))
    const u = await lauf(f)
    expect(phase(u, 'SEND').status).toBe('BLOCKED')
    expect(phase(u, 'SEND').begruendung).toContain('nicht festgeschrieben')
    expect(phase(u, 'SEND').naechsterSchritt).toContain('Herkunft')
    // Und DELIVERY darf daraus kein „läuft noch" ableiten.
    expect(phase(u, 'DELIVERY').status).toBe('NOT_STARTED')
  })

  it('VERIFIED bei belegter Zustellung', async () => {
    const f = fake(zaehlerFuer([
      { tabelle: 'invoices', wenn: a => hatFilter(a, 'not', 'sent_at'), count: 1 },
      { tabelle: 'invoice_email_log', wenn: a => hatFilter(a, 'eq', 'status', 'versendet'), count: 1 },
    ]))
    const u = await lauf(f)
    expect(phase(u, 'DELIVERY').status).toBe('VERIFIED')
  })

  it('meldet den Stand des Versandschalters, ohne ihn als Freigabe zu behandeln', async () => {
    const aus = await lauf(fake(), {})
    const an = await lauf(fake(), { RECHNUNGSVERSAND_AUTOMATISCH: '1', VERCEL_ENV: 'production' })
    const kzAus = aus.phasen.find(p => p.id === 'SEND')!.kennzahlen.find(k => k.label === 'Schalter scharf')!
    const kzAn = an.phasen.find(p => p.id === 'SEND')!.kennzahlen.find(k => k.label === 'Schalter scharf')!
    expect(kzAus.wert).toBe(0)
    expect(kzAn.wert).toBe(1)
    // Der Schalter allein macht die Phase nicht VERIFIED.
    expect(phase(an, 'SEND').status).not.toBe('VERIFIED')
  })
})

describe('CAMT und MATCH', () => {
  it('FAILED bei einem Import im Status fehler', async () => {
    const f = fake(zaehlerFuer([
      { tabelle: 'camt_imports', wenn: a => hatFilter(a, 'eq', 'status', 'fehler'), count: 1 },
    ]))
    const u = await lauf(f)
    expect(phase(u, 'CAMT').status).toBe('FAILED')
  })

  it('READY, sobald eine Zustellung belegt ist, mit Verweis auf den Trockenlauf', async () => {
    const f = fake(zaehlerFuer([
      { tabelle: 'invoices', wenn: a => hatFilter(a, 'not', 'sent_at'), count: 1 },
      { tabelle: 'invoice_email_log', wenn: a => hatFilter(a, 'eq', 'status', 'versendet'), count: 1 },
    ]))
    const u = await lauf(f)
    expect(phase(u, 'CAMT').status).toBe('READY')
    expect(phase(u, 'CAMT').naechsterSchritt).toContain('camtPilotLauf')
  })

  it('MATCH ist READY, wenn Buchungen da sind, aber keine zugeordnet ist', async () => {
    const f = fake(zaehlerFuer([
      { tabelle: 'zahlungseingaenge', wenn: ohneFilterAusser([]), count: 4 },
    ]))
    const u = await lauf(f)
    expect(phase(u, 'MATCH').status).toBe('READY')
  })
})

describe('ALLOCATION', () => {
  it('READY bei vorhandenen Buchungen ohne Zuordnung', async () => {
    const f = fake(zaehlerFuer([
      { tabelle: 'zahlungseingaenge', wenn: ohneFilterAusser([]), count: 2 },
    ]))
    const u = await lauf(f)
    expect(phase(u, 'ALLOCATION').status).toBe('READY')
    expect(phase(u, 'ALLOCATION').naechsterSchritt).toContain('oeffneAllocationGate')
  })

  it('VERIFIED bei gebuchter Zuordnung', async () => {
    const f = fake(zaehlerFuer([{ tabelle: 'payment_allocations', count: 1 }]))
    const u = await lauf(f)
    expect(phase(u, 'ALLOCATION').status).toBe('VERIFIED')
  })
})

describe('RECONCILIATION', () => {
  it('ist NIE VERIFIED — diese Übersicht rechnet die Abstimmung nicht mit', async () => {
    const f = fake(zaehlerFuer([
      { tabelle: 'payment_allocations', count: 5 },
      ...versendetBelegt(5),
      { tabelle: 'invoice_email_log', wenn: a => hatFilter(a, 'eq', 'status', 'versendet'), count: 5 },
      { tabelle: 'camt_imports', wenn: ohneFilterAusser([]), count: 1 },
      { tabelle: 'zahlungseingaenge', count: 5 },
      { tabelle: 'billing_audit_trail', count: 20 },
      { tabelle: 'pilot_send_gate', wenn: a => hatFilter(a, 'not', 'verbraucht_am'), count: 1 },
    ]))
    const u = await lauf(f)
    // Alles andere ist durch — RECONCILIATION bleibt trotzdem READY.
    expect(phase(u, 'RECONCILIATION').status).toBe('READY')
    expect(phase(u, 'RECONCILIATION').begruendung).toContain('rechnet die Abstimmung NICHT mit')
    expect(u.aktuellePhase?.id).toBe('RECONCILIATION')
  })

  it('NOT_STARTED, solange weder versendet noch zugeordnet wurde', async () => {
    const u = await lauf(fake())
    expect(phase(u, 'RECONCILIATION').status).toBe('NOT_STARTED')
  })
})

describe('AUDIT', () => {
  it('FAILED bei Geldvorgängen ohne einen einzigen Audit-Eintrag', async () => {
    const f = fake(zaehlerFuer([
      { tabelle: 'payment_allocations', count: 3 },
      { tabelle: 'billing_audit_trail', count: 0 },
    ]))
    const u = await lauf(f)
    expect(phase(u, 'AUDIT').status).toBe('FAILED')
    expect(phase(u, 'AUDIT').begruendung).toContain('Protokolllücke')
  })

  it('VERIFIED bei vorhandenen Einträgen — mit ausdrücklichem Vorbehalt', async () => {
    const f = fake(zaehlerFuer([
      { tabelle: 'payment_allocations', count: 3 },
      { tabelle: 'billing_audit_trail', count: 9 },
    ]))
    const u = await lauf(f)
    expect(phase(u, 'AUDIT').status).toBe('VERIFIED')
    // Die Zahl belegt nur, DASS protokolliert wird — nicht, dass jeder
    // Vorgang seinen Eintrag hat. Das steht auch so da.
    expect(phase(u, 'AUDIT').begruendung).toContain('Stufe 9 der Abstimmung')
  })

  it('NOT_STARTED, solange es keinen Geldvorgang gibt', async () => {
    const u = await lauf(fake())
    expect(phase(u, 'AUDIT').status).toBe('NOT_STARTED')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. Fortschritt
// ═══════════════════════════════════════════════════════════════════════

describe('Fortschritt', () => {
  it('zählt nur VERIFIED', async () => {
    const u = await lauf(fake())
    expect(u.fortschritt.gesamt).toBe(9)
    expect(u.fortschritt.verifiziert).toBe(u.phasen.filter(p => p.status === 'VERIFIED').length)
    expect(u.fortschritt.prozent).toBe(Math.round((u.fortschritt.verifiziert / 9) * 100))
  })
})
