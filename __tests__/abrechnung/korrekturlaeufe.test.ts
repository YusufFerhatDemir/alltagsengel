/**
 * Korrekturlaeufe (lib/abrechnung/korrekturlaeufe.ts)
 *
 * Der Weg, auf dem eine von der Kasse abgelehnte Abrechnung erneut
 * eingereicht wird. Zwei Dinge muessen hier stimmen, sonst geht Geld
 * verloren oder wird doppelt gefordert:
 *
 *   1. Ein Lauf darf nur aus einem ablehnenden Zustand heraus korrigiert
 *      werden. Wer einen bereits angenommenen Lauf korrigiert, reicht
 *      dieselben Leistungen ein zweites Mal ein.
 *   2. Die Korrektur-Kette muss vollstaendig UND endlich sein. Sie ist der
 *      Nachweis, welcher Lauf welchen ersetzt hat.
 *
 * Die Kettenabfrage laeuft ueber `korrektur_von`. Diese Spalte ist ein
 * gewoehnlicher Fremdschluessel auf dieselbe Tabelle — die Datenbank
 * verbietet einen Zyklus nicht. Der entsprechende Test unten benutzt
 * deshalb die Aufruf-Obergrenze des Fakes: ohne Zyklusschutz im Pruefling
 * wuerde er nicht fehlschlagen, sondern haengen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const FREMD_ORG = '99999999-9999-4999-8999-999999999999'
const ACTOR = '22222222-2222-4222-8222-222222222222'
const LAUF = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const KORREKTUR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

// Der Abrechnungslauf-Motor ist eine eigene, getrennt getestete Einheit.
// Hier wird geprueft, WOMIT er aufgerufen wird — nicht, was er tut.
const erstelleAbrechnungslaufMock = vi.fn()
vi.mock('@/lib/abrechnung/kassenabrechnung-engine', () => ({
  erstelleAbrechnungslauf: (...args: unknown[]) => erstelleAbrechnungslaufMock(...args),
}))
vi.mock('../../lib/abrechnung/kassenabrechnung-engine', () => ({
  erstelleAbrechnungslauf: (...args: unknown[]) => erstelleAbrechnungslaufMock(...args),
}))

const { erstelleKorrekturlauf, fuehreKorrekturAus, ladeKorrekturHistorie } =
  await import('@/lib/abrechnung/korrekturlaeufe')

beforeEach(() => {
  erstelleAbrechnungslaufMock.mockReset()
})

function originalLauf(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: LAUF,
    organization_id: ORG,
    status: 'abgelehnt',
    abrechnungsmonat: '2026-05',
    bundesland: 'HE',
    kostentraeger_ik: '109519005',
    lauf_typ: 'erstabrechnung',
    gesamtbetrag_cent: 250000,
    erstellt_am: '2026-06-01T08:00:00Z',
    korrektur_von: null,
    ...ueberschreibung,
  }
}

// ---------------------------------------------------------------------------
// 1 — erstelleKorrekturlauf: Statusschranke
// ---------------------------------------------------------------------------

describe('erstelleKorrekturlauf — nur ablehnende Zustaende sind korrigierbar', () => {
  function fake(lauf: unknown, extra: Record<string, unknown> = {}) {
    return erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'abrechnungslaeufe') return { data: lauf }
      if (a.tabelle === 'dta_lauf_rechnungen') return { data: null, count: 3 }
      if (a.tabelle === 'dta_korrekturlaeufe' && a.operation === 'insert') return { data: { id: KORREKTUR } }
      return (extra as Record<string, { data?: unknown }>)[a.tabelle] ?? { data: null }
    })
  }

  for (const status of ['teilweise_abgelehnt', 'abgelehnt', 'korrektur_erforderlich']) {
    it(`erlaubt die Korrektur eines Laufs im Status "${status}"`, async () => {
      const f = fake(originalLauf({ status }))
      const r = await erstelleKorrekturlauf(f.client, {
        organizationId: ORG, originalLaufId: LAUF,
        korrekturTyp: 'korrekturabrechnung', korrekturGrund: 'Kasse hat abgelehnt', actorId: ACTOR,
      })
      expect(r.korrekturId).toBe(KORREKTUR)
      expect(r.status).toBe('angelegt')
    })
  }

  for (const status of ['angenommen', 'erstellt', 'uebermittelt', 'abgeschlossen', 'korrigiert', 'storniert']) {
    it(`verweigert die Korrektur eines Laufs im Status "${status}" — sonst doppelte Einreichung`, async () => {
      const f = fake(originalLauf({ status }))
      await expect(erstelleKorrekturlauf(f.client, {
        organizationId: ORG, originalLaufId: LAUF,
        korrekturTyp: 'korrekturabrechnung', korrekturGrund: 'x', actorId: ACTOR,
      })).rejects.toThrow(/kann nicht korrigiert werden/)

      // Entscheidend: es darf auch nichts geschrieben worden sein.
      expect(f.auf('dta_korrekturlaeufe').filter(a => a.operation === 'insert')).toHaveLength(0)
    })
  }

  it('wirft, wenn der Original-Lauf einem anderen Mandanten gehoert', async () => {
    const f = fake(null)
    await expect(erstelleKorrekturlauf(f.client, {
      organizationId: FREMD_ORG, originalLaufId: LAUF,
      korrekturTyp: 'storno', korrekturGrund: 'x', actorId: ACTOR,
    })).rejects.toThrow('Original-Lauf nicht gefunden')
    expect(hatOrgFence(f.ersterAuf('abrechnungslaeufe'), FREMD_ORG)).toBe(true)
  })

  it('wirft, wenn der Korrekturlauf nicht angelegt werden kann — kein stiller Verlust', async () => {
    const f = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'abrechnungslaeufe') return { data: originalLauf() }
      if (a.tabelle === 'dta_lauf_rechnungen') return { data: null, count: 1 }
      if (a.tabelle === 'dta_korrekturlaeufe' && a.operation === 'insert') {
        return { data: null, error: { message: 'constraint violation' } }
      }
      return { data: null }
    })
    await expect(erstelleKorrekturlauf(f.client, {
      organizationId: ORG, originalLaufId: LAUF,
      korrekturTyp: 'storno', korrekturGrund: 'x', actorId: ACTOR,
    })).rejects.toThrow(/konnte nicht erstellt werden/)

    // Der Original-Lauf darf dabei NICHT als korrigiert markiert worden sein.
    const markierung = f.auf('abrechnungslaeufe').filter(a => a.operation === 'update')
    expect(markierung).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 2 — erstelleKorrekturlauf: Betraege und Folgemarkierungen
// ---------------------------------------------------------------------------

describe('erstelleKorrekturlauf — Betraege, Zaehlung, Folgemarkierungen', () => {
  function fake(ueberschreibung: Partial<Record<string, unknown>> = {}) {
    return erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'abrechnungslaeufe') return { data: originalLauf() }
      if (a.tabelle === 'dta_lauf_rechnungen') return { data: null, count: 7 }
      if (a.tabelle === 'dta_ruecklaeufer' && a.operation === 'select') {
        return { data: (ueberschreibung.ruecklaeufer ?? { betrag_differenz_cent: 48250 }) }
      }
      if (a.tabelle === 'dta_korrekturlaeufe' && a.operation === 'insert') return { data: { id: KORREKTUR } }
      return { data: null }
    })
  }

  it('uebernimmt die Differenz aus dem Ruecklaeufer — nicht 0', async () => {
    const f = fake()
    const r = await erstelleKorrekturlauf(f.client, {
      organizationId: ORG, originalLaufId: LAUF, ruecklaeuferId: 'rl-1',
      korrekturTyp: 'nachberechnung', korrekturGrund: 'Kuerzung', actorId: ACTOR,
    })
    expect(r.differenzCent).toBe(48250)
    const insert = f.auf('dta_korrekturlaeufe').find(a => a.operation === 'insert')
    expect((insert?.payload as Record<string, unknown>).differenz_cent).toBe(48250)
  })

  it('ohne Ruecklaeufer bleibt die Differenz 0 und es wird kein Ruecklaeufer gelesen', async () => {
    const f = fake()
    const r = await erstelleKorrekturlauf(f.client, {
      organizationId: ORG, originalLaufId: LAUF,
      korrekturTyp: 'storno', korrekturGrund: 'x', actorId: ACTOR,
    })
    expect(r.differenzCent).toBe(0)
    expect(f.auf('dta_ruecklaeufer')).toHaveLength(0)
  })

  it('eine NULL-Differenz am Ruecklaeufer wird zu 0, nicht zu NaN', async () => {
    const f = fake({ ruecklaeufer: { betrag_differenz_cent: null } })
    const r = await erstelleKorrekturlauf(f.client, {
      organizationId: ORG, originalLaufId: LAUF, ruecklaeuferId: 'rl-1',
      korrekturTyp: 'nachberechnung', korrekturGrund: 'x', actorId: ACTOR,
    })
    expect(r.differenzCent).toBe(0)
  })

  it('zaehlt nur abgelehnte und teilweise abgelehnte Rechnungen des Laufs', async () => {
    const f = fake()
    const r = await erstelleKorrekturlauf(f.client, {
      organizationId: ORG, originalLaufId: LAUF,
      korrekturTyp: 'korrekturabrechnung', korrekturGrund: 'x', actorId: ACTOR,
    })
    expect(r.betroffeneRechnungen).toBe(7)
    const zaehlung = f.ersterAuf('dta_lauf_rechnungen')
    expect(zaehlung?.head).toBe(true)
    expect(zaehlung?.zaehlmodus).toBe('exact')
    expect(hatFilter(zaehlung, 'eq', 'lauf_id', LAUF)).toBe(true)
    expect(hatFilter(zaehlung, 'in', 'status', ['abgelehnt', 'teilweise_abgelehnt'])).toBe(true)
  })

  it('markiert den Original-Lauf als korrigiert — mit Mandanten-Fence', async () => {
    const f = fake()
    await erstelleKorrekturlauf(f.client, {
      organizationId: ORG, originalLaufId: LAUF,
      korrekturTyp: 'storno', korrekturGrund: 'x', actorId: ACTOR,
    })
    const update = f.auf('abrechnungslaeufe').find(a => a.operation === 'update')
    expect((update?.payload as Record<string, unknown>).status).toBe('korrigiert')
    expect(hatOrgFence(update, ORG)).toBe(true)
    expect(hatFilter(update, 'eq', 'id', LAUF)).toBe(true)
  })

  it('haengt Ruecklaeufer und Fehlerprotokoll an den Korrekturlauf — beide mit Fence', async () => {
    const f = fake()
    await erstelleKorrekturlauf(f.client, {
      organizationId: ORG, originalLaufId: LAUF,
      ruecklaeuferId: 'rl-1', fehlerIds: ['f-1', 'f-2'],
      korrekturTyp: 'korrekturabrechnung', korrekturGrund: 'x', actorId: ACTOR,
    })

    const rlUpdate = f.auf('dta_ruecklaeufer').find(a => a.operation === 'update')
    expect((rlUpdate?.payload as Record<string, unknown>).korrektur_lauf_id).toBe(KORREKTUR)
    expect((rlUpdate?.payload as Record<string, unknown>).status).toBe('korrektur_erstellt')
    expect(hatOrgFence(rlUpdate, ORG)).toBe(true)

    const fehlerUpdate = f.auf('dta_fehlerprotokoll').find(a => a.operation === 'update')
    expect((fehlerUpdate?.payload as Record<string, unknown>).bearbeitungsstatus).toBe('korrigiert')
    expect(hatFilter(fehlerUpdate, 'in', 'id', ['f-1', 'f-2'])).toBe(true)
    expect(hatOrgFence(fehlerUpdate, ORG)).toBe(true)
  })

  it('ohne Fehler-IDs wird das Fehlerprotokoll gar nicht angefasst', async () => {
    const f = fake()
    await erstelleKorrekturlauf(f.client, {
      organizationId: ORG, originalLaufId: LAUF, fehlerIds: [],
      korrekturTyp: 'storno', korrekturGrund: 'x', actorId: ACTOR,
    })
    expect(f.auf('dta_fehlerprotokoll')).toHaveLength(0)
  })

  it('schreibt einen Audit-Eintrag mit Mandant, Grund und Original-Lauf', async () => {
    const f = fake()
    await erstelleKorrekturlauf(f.client, {
      organizationId: ORG, originalLaufId: LAUF,
      korrekturTyp: 'gutschrift', korrekturGrund: 'Kasse kuerzt Position 4', actorId: ACTOR,
    })
    const audit = f.auf('billing_audit_trail').find(a => a.operation === 'insert')
    expect(audit, 'kein Audit-Eintrag geschrieben').toBeDefined()
    const p = audit?.payload as Record<string, unknown>
    expect(p.organization_id).toBe(ORG)
    expect(p.entity_id).toBe(KORREKTUR)
    expect(p.action).toBe('korrekturlauf_erstellt')
    expect(p.actor_id).toBe(ACTOR)
    expect((p.new_state as Record<string, unknown>).grund).toBe('Kasse kuerzt Position 4')
  })
})

// ---------------------------------------------------------------------------
// 3 — fuehreKorrekturAus
// ---------------------------------------------------------------------------

describe('fuehreKorrekturAus', () => {
  function fake(korrektur: unknown) {
    return erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'dta_korrekturlaeufe' && a.operation === 'select') return { data: korrektur }
      return { data: null }
    })
  }

  function korrekturZeile(ueberschreibung: Record<string, unknown> = {}) {
    return {
      id: KORREKTUR,
      organization_id: ORG,
      status: 'angelegt',
      korrektur_typ: 'korrekturabrechnung',
      original_lauf_id: LAUF,
      original_lauf: originalLauf(),
      ...ueberschreibung,
    }
  }

  it('wirft, wenn die Korrektur nicht gefunden wird', async () => {
    const f = fake(null)
    await expect(fuehreKorrekturAus(f.client, KORREKTUR, ACTOR, ORG))
      .rejects.toThrow('Korrekturlauf nicht gefunden')
  })

  for (const status of ['validiert', 'freigegeben', 'exportiert', 'uebermittelt', 'abgeschlossen', 'abgebrochen']) {
    it(`verweigert die Ausfuehrung im Status "${status}" — sonst zwei Laeufe fuer dieselbe Korrektur`, async () => {
      const f = fake(korrekturZeile({ status }))
      await expect(fuehreKorrekturAus(f.client, KORREKTUR, ACTOR, ORG))
        .rejects.toThrow(/kann nicht ausgeführt werden/)
      expect(erstelleAbrechnungslaufMock).not.toHaveBeenCalled()
    })
  }

  it('setzt den Mandanten-Fence auf die Korrektur-Abfrage, wenn er uebergeben wurde', async () => {
    const f = fake(korrekturZeile())
    erstelleAbrechnungslaufMock.mockResolvedValue({ laufId: 'neu-1', rechnungenAnzahl: 4, gesamtbetragCent: 120000 })
    await fuehreKorrekturAus(f.client, KORREKTUR, ACTOR, ORG)
    expect(hatOrgFence(f.ersterAuf('dta_korrekturlaeufe'), ORG)).toBe(true)
  })

  const typAbbildung: Array<[string, string]> = [
    ['korrekturabrechnung', 'korrekturabrechnung'],
    ['nachberechnung', 'nachberechnung'],
    ['storno', 'storno'],
    ['teilstorno', 'storno'],
    ['gutschrift', 'korrekturabrechnung'],
  ]

  for (const [korrekturTyp, laufTyp] of typAbbildung) {
    it(`bildet Korrekturtyp "${korrekturTyp}" auf Lauftyp "${laufTyp}" ab`, async () => {
      const f = fake(korrekturZeile({ korrektur_typ: korrekturTyp }))
      erstelleAbrechnungslaufMock.mockResolvedValue({ laufId: 'neu-1', rechnungenAnzahl: 2, gesamtbetragCent: 5000 })
      await fuehreKorrekturAus(f.client, KORREKTUR, ACTOR, ORG)
      expect(erstelleAbrechnungslaufMock.mock.calls[0][1]).toMatchObject({ laufTyp })
    })
  }

  it('unbekannter Korrekturtyp faellt auf korrekturabrechnung zurueck, statt undefined zu uebergeben', async () => {
    const f = fake(korrekturZeile({ korrektur_typ: 'unbekannt' }))
    erstelleAbrechnungslaufMock.mockResolvedValue({ laufId: 'neu-1', rechnungenAnzahl: 1, gesamtbetragCent: 100 })
    await fuehreKorrekturAus(f.client, KORREKTUR, ACTOR, ORG)
    expect(erstelleAbrechnungslaufMock.mock.calls[0][1].laufTyp).toBe('korrekturabrechnung')
  })

  it('uebernimmt Monat, Bundesland und Kostentraeger aus dem Original-Lauf', async () => {
    const f = fake(korrekturZeile())
    erstelleAbrechnungslaufMock.mockResolvedValue({ laufId: 'neu-1', rechnungenAnzahl: 3, gesamtbetragCent: 90000 })
    await fuehreKorrekturAus(f.client, KORREKTUR, ACTOR, ORG)
    expect(erstelleAbrechnungslaufMock.mock.calls[0][1]).toMatchObject({
      organizationId: ORG,
      abrechnungsmonat: '2026-05',
      bundesland: 'HE',
      kostentraegerIk: '109519005',
      korrekturVon: LAUF,
      actorId: ACTOR,
    })
  })

  it('ein Sammellauf traegt keinen einzelnen Kostentraeger in die Korrektur', async () => {
    const f = fake(korrekturZeile({ original_lauf: originalLauf({ kostentraeger_ik: 'SAMMEL' }) }))
    erstelleAbrechnungslaufMock.mockResolvedValue({ laufId: 'neu-1', rechnungenAnzahl: 9, gesamtbetragCent: 700000 })
    await fuehreKorrekturAus(f.client, KORREKTUR, ACTOR, ORG)
    expect(erstelleAbrechnungslaufMock.mock.calls[0][1].kostentraegerIk).toBeUndefined()
  })

  it('verknuepft den neuen Lauf und uebernimmt dessen Zahlen', async () => {
    const f = fake(korrekturZeile())
    erstelleAbrechnungslaufMock.mockResolvedValue({ laufId: 'neu-1', rechnungenAnzahl: 6, gesamtbetragCent: 333300 })
    const r = await fuehreKorrekturAus(f.client, KORREKTUR, ACTOR, ORG)

    expect(r).toMatchObject({ korrekturLaufId: 'neu-1', status: 'validiert', betroffeneRechnungen: 6, differenzCent: 333300 })
    const updates = f.auf('dta_korrekturlaeufe').filter(a => a.operation === 'update')
    const letzte = updates.at(-1)?.payload as Record<string, unknown>
    expect(letzte.korrektur_lauf_id).toBe('neu-1')
    expect(letzte.status).toBe('validiert')
    expect(letzte.differenz_cent).toBe(333300)
  })

  it('ohne neuen Lauf endet die Korrektur als abgebrochen — nicht als validiert', async () => {
    const f = fake(korrekturZeile())
    erstelleAbrechnungslaufMock.mockResolvedValue({ laufId: null, rechnungenAnzahl: 0, gesamtbetragCent: 0 })
    const r = await fuehreKorrekturAus(f.client, KORREKTUR, ACTOR, ORG)
    expect(r.status).toBe('abgebrochen')
    expect(r.korrekturLaufId).toBeUndefined()
    const letzte = f.auf('dta_korrekturlaeufe').filter(a => a.operation === 'update').at(-1)
    expect((letzte?.payload as Record<string, unknown>).status).toBe('abgebrochen')
  })

  it('wirft, wenn der Original-Lauf nicht aufgeloest werden konnte', async () => {
    const f = fake(korrekturZeile({ original_lauf: null }))
    await expect(fuehreKorrekturAus(f.client, KORREKTUR, ACTOR, ORG))
      .rejects.toThrow('Original-Lauf nicht aufgelöst')
  })
})

// ---------------------------------------------------------------------------
// 4 — ladeKorrekturHistorie
// ---------------------------------------------------------------------------

describe('ladeKorrekturHistorie', () => {
  /**
   * Baut eine Kette aus Laeufen auf. `korrektur_von` zeigt jeweils auf den
   * Vorgaenger — genau wie live.
   */
  function ketteFake(laeufe: Record<string, Record<string, unknown>>, gruende: Record<string, string> = {}) {
    return erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'abrechnungslaeufe') {
        const vorwaerts = a.filter.find(f => f.methode === 'eq' && f.spalte === 'korrektur_von')
        if (vorwaerts) {
          const nachfolger = Object.values(laeufe).find(l => l.korrektur_von === vorwaerts.wert)
          return { data: nachfolger ?? null }
        }
        const id = a.filter.find(f => f.methode === 'eq' && f.spalte === 'id')?.wert as string
        return { data: laeufe[id] ?? null }
      }
      if (a.tabelle === 'dta_korrekturlaeufe') {
        const id = a.filter.find(f => f.methode === 'eq' && f.spalte === 'korrektur_lauf_id')?.wert as string
        return { data: gruende[id] ? { korrektur_grund: gruende[id] } : null }
      }
      return { data: null }
    })
  }

  const L1 = 'lauf-1', L2 = 'lauf-2', L3 = 'lauf-3'
  const dreierKette = {
    [L1]: { id: L1, lauf_typ: 'erstabrechnung', status: 'abgelehnt', abrechnungsmonat: '2026-05', gesamtbetrag_cent: 100000, erstellt_am: '2026-06-01T08:00:00Z', korrektur_von: null },
    [L2]: { id: L2, lauf_typ: 'korrekturabrechnung', status: 'teilweise_abgelehnt', abrechnungsmonat: '2026-05', gesamtbetrag_cent: 90000, erstellt_am: '2026-06-05T08:00:00Z', korrektur_von: L1 },
    [L3]: { id: L3, lauf_typ: 'korrekturabrechnung', status: 'angenommen', abrechnungsmonat: '2026-05', gesamtbetrag_cent: 88000, erstellt_am: '2026-06-09T08:00:00Z', korrektur_von: L2 },
  }

  it('liefert die Kette chronologisch — vom Erstlauf bis zur letzten Korrektur', async () => {
    const f = ketteFake(dreierKette, { [L2]: 'Position 4 gekuerzt', [L3]: 'IK falsch' })
    const h = await ladeKorrekturHistorie(f.client, L2, ORG)
    expect(h.kette.map(k => k.laufId)).toEqual([L1, L2, L3])
  })

  it('haengt an jeden Kettenglied den Korrekturgrund, soweit vorhanden', async () => {
    const f = ketteFake(dreierKette, { [L2]: 'Position 4 gekuerzt' })
    const h = await ladeKorrekturHistorie(f.client, L2, ORG)
    expect(h.kette[0].korrekturGrund).toBeUndefined()   // Erstlauf hat keinen
    expect(h.kette[1].korrekturGrund).toBe('Position 4 gekuerzt')
  })

  it('uebernimmt Betrag, Monat und Status je Glied — NULL-Betrag wird zu 0', async () => {
    const f = ketteFake({
      [L1]: { id: L1, lauf_typ: null, status: 'abgelehnt', abrechnungsmonat: '2026-05', gesamtbetrag_cent: null, erstellt_am: '2026-06-01T08:00:00Z', korrektur_von: null },
    })
    const h = await ladeKorrekturHistorie(f.client, L1, ORG)
    expect(h.kette).toHaveLength(1)
    expect(h.kette[0]).toMatchObject({ typ: 'erstabrechnung', status: 'abgelehnt', monat: '2026-05', betragCent: 0 })
  })

  it('setzt den Mandanten-Fence auf beide Richtungen der Kettenabfrage', async () => {
    const f = ketteFake(dreierKette)
    await ladeKorrekturHistorie(f.client, L2, ORG)
    const laufAbfragen = f.auf('abrechnungslaeufe')
    expect(laufAbfragen.length).toBeGreaterThan(1)
    for (const a of laufAbfragen) {
      expect(hatOrgFence(a, ORG), `Kettenabfrage ohne Mandanten-Fence: ${JSON.stringify(a.filter)}`).toBe(true)
    }
  })

  it('liefert eine leere Kette, wenn der Lauf nicht existiert', async () => {
    const f = ketteFake({})
    const h = await ladeKorrekturHistorie(f.client, 'gibt-es-nicht', ORG)
    expect(h.kette).toEqual([])
  })

  /**
   * Der eigentliche Grund fuer diese Suite.
   *
   * `korrektur_von` ist ein Selbstbezug ohne Zyklusschutz in der Datenbank.
   * Zeigt ein Lauf (durch Fehleingabe, Backfill oder Import) auf sich
   * selbst oder auf einen Nachfolger, laeuft die Kettenabfrage endlos:
   * die Rueckwaerts-Schleife setzt currentId immer wieder auf denselben
   * Wert, und der Request kommt nie zurueck.
   *
   * Der Fake bricht nach MAX_AUFRUFE ab — ohne diese Schranke wuerde der
   * Test haengen statt fehlzuschlagen.
   */
  it('bricht bei einem Lauf, der auf sich selbst zeigt, ab statt endlos zu laufen', async () => {
    const f = ketteFake({
      [L1]: { id: L1, lauf_typ: 'korrekturabrechnung', status: 'abgelehnt', abrechnungsmonat: '2026-05', gesamtbetrag_cent: 1000, erstellt_am: '2026-06-01T08:00:00Z', korrektur_von: L1 },
    })
    const h = await ladeKorrekturHistorie(f.client, L1, ORG)
    expect(h.kette.map(k => k.laufId)).toEqual([L1])
  })

  it('bricht bei einem Zyklus ueber zwei Laeufe ab statt endlos zu laufen', async () => {
    const f = ketteFake({
      [L1]: { id: L1, lauf_typ: 'erstabrechnung', status: 'abgelehnt', abrechnungsmonat: '2026-05', gesamtbetrag_cent: 1000, erstellt_am: '2026-06-01T08:00:00Z', korrektur_von: L2 },
      [L2]: { id: L2, lauf_typ: 'korrekturabrechnung', status: 'abgelehnt', abrechnungsmonat: '2026-05', gesamtbetrag_cent: 900, erstellt_am: '2026-06-05T08:00:00Z', korrektur_von: L1 },
    })
    const h = await ladeKorrekturHistorie(f.client, L1, ORG)
    // Jeder Lauf darf hoechstens einmal in der Kette stehen.
    const ids = h.kette.map(k => k.laufId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  /**
   * Zweiter Fund derselben Stelle: die Vorwaerts-Abfrage filtert
   * `deleted_at IS NULL`, die Rueckwaerts-Abfrage nicht. Ein
   * soft-geloeschter Vorgaenger stand damit weiter in der Historie,
   * ein soft-geloeschter Nachfolger nicht — dieselbe Kette, zwei
   * Wahrheiten.
   */
  it('blendet soft-geloeschte Laeufe in BEIDEN Richtungen aus', async () => {
    const f = ketteFake(dreierKette)
    await ladeKorrekturHistorie(f.client, L2, ORG)
    const rueckwaerts = f.auf('abrechnungslaeufe')
      .filter(a => a.filter.some(x => x.methode === 'eq' && x.spalte === 'id'))
    expect(rueckwaerts.length).toBeGreaterThan(0)
    for (const a of rueckwaerts) {
      expect(
        hatFilter(a, 'is', 'deleted_at', null),
        'Rueckwaerts-Kettenabfrage ohne deleted_at-Filter — geloeschte Vorgaenger erscheinen in der Historie',
      ).toBe(true)
    }
  })
})
