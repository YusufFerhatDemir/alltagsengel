/**
 * PILOT-KANDIDAT — welche Rechnung trägt den ersten echten Versand?
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Geprüft wird nicht, ob die Karte hübsch aussieht, sondern vier
 * Eigenschaften, an denen genau diese Art von Übersicht scheitert:
 *
 *   1. DER LEERE FALL IST NICHT DER FEHLERFALL. „Keine Rechnung
 *      vorhanden" (NO_PILOT_INVOICE) und „Bestand nicht lesbar"
 *      (NICHT_MESSBAR) führen zu entgegengesetzten nächsten Schritten.
 *      Ein Modul, das beides gleich beantwortet, schickt jemanden in die
 *      falsche Richtung — und der gefährlichere Fall ist der, in dem eine
 *      kaputte Abfrage wie „alles erledigt" aussieht.
 *
 *   2. MANDANTENZAUN. Jede Abfrage filtert auf `organization_id`. Das
 *      Modul läuft mit service_role (BYPASSRLS); eine vergessene
 *      Bedingung zeigt fremde Rechnungen mit Namen und Betrag an.
 *
 *   3. KEINE SCHREIBOPERATION. Die Kandidatenkarte darf nichts anlegen —
 *      insbesondere kein Token. Sie beschreibt, sie erlaubt nicht.
 *
 *   4. DETERMINISTISCHE AUSWAHL. Zwei Aufrufe hintereinander müssen auf
 *      dieselbe Rechnung zeigen, sonst bezieht sich eine Freigabe auf
 *      etwas anderes als das, was auf dem Bildschirm stand.
 */

import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '../helpers/supabase-fake'
import {
  ermittlePilotKandidat,
  ACTION_REQUIRED_KEIN_KANDIDAT,
  type PilotKandidatUebersicht,
} from '@/lib/pilot/pilot-kandidat'

const ORG = '11111111-1111-4111-8111-111111111111'
const RECHNUNG = '33333333-3333-4333-8333-333333333333'

const ENV_ZU: Record<string, string | undefined> = {}
const ENV_FREI: Record<string, string | undefined> = { PILOT_ERSTVERSAND_FREIGEGEBEN: '1' }

/**
 * Der Pilot selbst wird ersetzt.
 *
 * `pruefeRechnungFuerPilot` ist ein eigenes Modul mit eigener Suite
 * (rechnung-pilot.test.ts) und mehr als einem Dutzend Abfragen. Hier geht
 * es um die Kandidatenfrage; würde der echte Pilot mitlaufen, prüfte diese
 * Datei am Ende ihn und nicht das, was sie prüfen soll.
 */
vi.mock('@/lib/pilot/rechnung-pilot', () => ({
  pruefeRechnungFuerPilot: vi.fn(async () => ({
    invoiceId: RECHNUNG,
    invoiceNumber: 'RE-2026-0001',
    organizationId: ORG,
    erstelltAm: '2026-08-27T10:00:00.000Z',
    urteil: 'READY_FOR_SEND',
    preflightStatus: 'READY_FOR_SEND',
    punkte: [{ nummer: 11, schluessel: 'pdf', titel: 'PDF erzeugbar', stand: 'erfuellt', befund: 'ok' }],
    auftragspunkte: [],
    blocker: [],
    zuPruefen: [],
    pilotBefunde: [],
    empfaenger: 'kundin@beispiel.test',
    empfaengerName: 'Frau Beispiel',
    betragEuro: 123.45,
    betragCent: 12345,
    bereitsVersendetAm: null,
  })),
}))

function fake(
  antwort: (a: FakeAufruf) => { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null } | undefined = () => undefined,
) {
  return erstelleFakeSupabase(a => {
    const eigen = antwort(a)
    if (eigen) return eigen
    if (a.head) return { count: 0 }
    return { data: [] }
  })
}

/** Ein Bestand mit genau einer versandbereiten Rechnung. */
function mitKandidat(a: FakeAufruf) {
  if (a.tabelle === 'invoices' && !a.head) {
    return { data: [{ id: RECHNUNG, invoice_number: 'RE-2026-0001', client: { email: 'kundin@beispiel.test' } }] }
  }
  if (a.tabelle === 'invoices' && a.head) return { count: 1 }
  return undefined
}

async function lauf(
  f: ReturnType<typeof fake>,
  quelle = ENV_ZU,
): Promise<PilotKandidatUebersicht> {
  return ermittlePilotKandidat(f.client as unknown as SupabaseClient, ORG, quelle)
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Der leere Fall
// ═══════════════════════════════════════════════════════════════════════

describe('Kein Kandidat', () => {
  it('meldet NO_PILOT_INVOICE mit der Auftragskennung', async () => {
    const u = await lauf(fake())
    expect(u.zustand).toBe('NO_PILOT_INVOICE')
    expect(u.actionRequired).toBe(ACTION_REQUIRED_KEIN_KANDIDAT)
    expect(u.actionRequired).toContain('CREATE_OR_SELECT_REAL_DRAFT_INVOICE')
    expect(u.kandidat).toBeNull()
  })

  it('nennt die fehlende Geschäftshandlung, nicht einen technischen Grund', async () => {
    const u = await lauf(fake())
    // Der Satz muss ohne Vorwissen erklären, WER jetzt WAS tun muss.
    expect(u.begruendung).toMatch(/Rechnung erzeugen|festschreiben/i)
  })

  it('unterscheidet „nichts da" von „nicht lesbar"', async () => {
    // Genau der Fall, in dem eine kaputte Abfrage wie Ordnung aussieht.
    const u = await lauf(fake(a =>
      a.tabelle === 'invoices' ? { error: { message: 'permission denied' } } : undefined))
    expect(u.zustand).toBe('NICHT_MESSBAR')
    expect(u.actionRequired).toBeNull()
    expect(u.begruendung).toMatch(/nicht dasselbe|NICHT dasselbe/i)
    expect(u.hinweise.length).toBeGreaterThan(0)
  })

  it('meldet BEREITS_VERSENDET statt NO_PILOT_INVOICE, wenn nur BELEGT Versendetes übrig ist', async () => {
    let n = 0
    const u = await lauf(fake(a => {
      if (a.tabelle !== 'invoices') return undefined
      if (!a.head) return { data: [] }
      // 1 = versandbereit (0), 2 = versendet (3), 3 = versendet ohne
      // Festschreibung (0). Alle drei sind festgeschrieben, also belegt.
      n += 1
      return { count: n === 1 ? 0 : n === 2 ? 3 : 0 }
    }))
    expect(u.zustand).toBe('BEREITS_VERSENDET')
    expect(u.actionRequired).toBeNull()
    expect(u.versendetUnbelegt).toBe(0)
  })

  it('bleibt NO_PILOT_INVOICE, wenn die Versandzeitpunkte nicht festgeschrieben sind', async () => {
    // Der Live-Fall aus Phase 8.4: drei eingespielte Rechnungen tragen
    // sent_at, aber kein frozen_at. Der Versandweg weist eine nicht
    // festgeschriebene Rechnung ab — er kann sie also nicht gesetzt haben.
    // Vorher meldete diese Übersicht dafür BEREITS_VERSENDET und der
    // Erstversand galt fälschlich als erledigt.
    let n = 0
    const u = await lauf(fake(a => {
      if (a.tabelle !== 'invoices') return undefined
      if (!a.head) return { data: [] }
      n += 1
      return { count: n === 1 ? 0 : 3 }
    }))
    expect(u.zustand).toBe('NO_PILOT_INVOICE')
    expect(u.actionRequired).toBe(ACTION_REQUIRED_KEIN_KANDIDAT)
    expect(u.versendetUnbelegt).toBe(3)
    expect(u.begruendung).toContain('OHNE')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Der gefüllte Fall
// ═══════════════════════════════════════════════════════════════════════

describe('Kandidat vorhanden', () => {
  it('nennt Kunde, Empfänger, Betrag und PDF-Stand', async () => {
    const u = await lauf(fake(mitKandidat))
    expect(u.zustand).toBe('KANDIDAT_VORHANDEN')
    expect(u.kandidat?.kundeName).toBe('Frau Beispiel')
    expect(u.kandidat?.empfaenger).toBe('kundin@beispiel.test')
    expect(u.kandidat?.betragCent).toBe(12345)
    expect(u.kandidat?.pdfBereit).toBe(true)
  })

  it('ohne Umgebungs-Freigabe ist die Handlung BLOCKED_BY_ENV, nicht „freigeben"', async () => {
    // READY_FOR_SEND heisst NICHT, dass sich ein Token ausstellen liesse.
    const u = await lauf(fake(mitKandidat), ENV_ZU)
    expect(u.actionRequired).toContain('BLOCKED_BY_ENV')
    expect(u.freigabe.freigegeben).toBe(false)
  })

  it('mit Umgebungs-Freigabe wird die Freigabe zum nächsten Schritt', async () => {
    const u = await lauf(fake(mitKandidat), ENV_FREI)
    expect(u.actionRequired).toContain('READY_FOR_APPROVAL')
    expect(u.freigabe.freigegeben).toBe(true)
  })

  it('zählt offene, verbrauchte und verfallene Freigaben getrennt', async () => {
    // Ein verfallenes Token sieht aus wie ein vorhandenes, ist aber keines.
    const u = await lauf(fake(mitKandidat))
    expect(u.kandidat?.token).toHaveProperty('offen')
    expect(u.kandidat?.token).toHaveProperty('verbraucht')
    expect(u.kandidat?.token).toHaveProperty('verfallen')
  })

  it('trennt die Gültigkeit: offen filtert auf gt, verfallen auf lte', async () => {
    const f = fake(mitKandidat)
    await lauf(f)
    const gate = f.auf('pilot_send_gate')
    expect(gate.some(a => hatFilter(a, 'gt', 'gueltig_bis'))).toBe(true)
    expect(gate.some(a => hatFilter(a, 'lte', 'gueltig_bis'))).toBe(true)
  })

  it('eine nicht lesbare Freigabetabelle wird zu null, nicht zu 0', async () => {
    // Die Migration kann fehlen. „0 offene Freigaben" wäre dann eine
    // Behauptung über etwas, das gar nicht existiert.
    const u = await lauf(fake(a => {
      const k = mitKandidat(a)
      if (k) return k
      if (a.tabelle === 'pilot_send_gate') return { error: { message: 'relation does not exist' } }
      return undefined
    }))
    expect(u.kandidat?.token.offen).toBeNull()
    expect(u.hinweise.join(' ')).toContain('pilot_send_gate')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Mandantenzaun und Schreibverbot
// ═══════════════════════════════════════════════════════════════════════

describe('Mandantenzaun', () => {
  it('jede Abfrage filtert auf die eigene Organisation', async () => {
    const f = fake(mitKandidat)
    await lauf(f)
    for (const a of f.aufrufe) {
      expect(hatOrgFence(a, ORG), `${a.tabelle} ohne org-Fence`).toBe(true)
    }
  })

  it('die Token-Abfragen binden zusätzlich an die konkrete Rechnung', async () => {
    // Sonst zählte die Karte Freigaben fremder Rechnungen mit.
    const f = fake(mitKandidat)
    await lauf(f)
    for (const a of f.auf('pilot_send_gate')) {
      expect(hatFilter(a, 'eq', 'invoice_id', RECHNUNG)).toBe(true)
    }
  })
})

describe('Schreibverbot', () => {
  it('führt ausschliesslich Leseoperationen aus', async () => {
    const f = fake(mitKandidat)
    await lauf(f)
    expect(f.aufrufe.length).toBeGreaterThan(0)
    for (const a of f.aufrufe) {
      expect(a.operation, `${a.tabelle}: ${a.operation}`).toBe('select')
    }
  })

  it('legt insbesondere kein Token an', async () => {
    const f = fake(mitKandidat)
    await lauf(f)
    expect(f.auf('pilot_send_gate').every(a => a.operation === 'select')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Determinismus
// ═══════════════════════════════════════════════════════════════════════

describe('Auswahl', () => {
  it('sortiert und begrenzt, damit zwei Aufrufe dieselbe Rechnung treffen', async () => {
    const f = fake(mitKandidat)
    await lauf(f)
    const auswahl = f.auf('invoices').find(a => !a.head)
    expect(hatFilter(auswahl, 'order', 'created_at')).toBe(true)
    // limit(1) landet im Protokoll als Spalte '1' — der Doppelgaenger
    // schreibt das erste Argument jeder Kettenmethode in `spalte`.
    expect(auswahl?.filter.some(f => f.methode === 'limit' && f.spalte === '1')).toBe(true)
  })

  it('schliesst versendete und gelöschte Rechnungen aus', async () => {
    const f = fake(mitKandidat)
    await lauf(f)
    const auswahl = f.auf('invoices').find(a => !a.head)
    expect(hatFilter(auswahl, 'is', 'sent_at', null)).toBe(true)
    expect(hatFilter(auswahl, 'is', 'deleted_at', null)).toBe(true)
    expect(hatFilter(auswahl, 'not', 'frozen_at')).toBe(true)
  })
})
