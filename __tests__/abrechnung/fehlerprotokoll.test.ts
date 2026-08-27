/**
 * DTA-Fehlerprotokoll — Statusautomat und Pruefpfad
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `lib/abrechnung/fehlerprotokoll.ts` sammelt jeden Fehler des Kassenwegs
 * (Validierung, Export, Verschluesselung, Transport, Annahmestelle,
 * Kostentraeger, Ruecklaeufer) und fuehrt ihn bis zur Erledigung. Es ist
 * damit der Nachweis dafuer, wie mit einer beanstandeten Abrechnung
 * umgegangen wurde — und hatte keinen Test.
 *
 * ── BEFUNDE, DIE DIESE SUITE AUSGELOEST HAT ────────────────────────────
 *   FP-1  Die Uebergangstabelle kannte 'erledigt' und 'ignoriert' nicht,
 *         und die Pruefung lautete `if (erlaubt[current] && …)`. Ein
 *         Status ohne Tabelleneintrag hatte damit KEINE Beschraenkung:
 *         ein erledigter Fehler liess sich auf 'neu' zuruecksetzen, ein
 *         ignorierter auf 'erledigt'. Ausgerechnet die beiden Zustaende,
 *         die als abgeschlossen gelesen werden, waren die einzigen ohne
 *         Riegel.
 *   FP-2  Der Zielstatus kam ungeprueft aus dem Anfragekoerper der Route.
 *   FP-3  Das Ergebnis des UPDATE wurde nur abgewartet, nicht ausgewertet.
 *         Ein abgelehnter CHECK oder eine RLS-Sperre fielen still unter
 *         den Tisch — die Route meldete { success: true } und der
 *         Pruefpfad bekam einen Eintrag ueber einen Statuswechsel, den es
 *         nie gegeben hat.
 *
 * Der Supabase-Zugriff ist eine mitschreibende Attrappe: gemessen wird,
 * WAS geschrieben wurde und ob ueberhaupt geschrieben wurde.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  erstelleFehler,
  aktualisiereFehler,
  holeFehlerDashboard,
  BEARBEITUNGS_STATUS,
} from '@/lib/abrechnung/fehlerprotokoll'

const ORG = '00000000-0000-4000-8000-00000000d001'
const ORG_FREMD = '00000000-0000-4000-8000-00000000d002'
const ACTOR = '00000000-0000-4000-8000-00000000d003'
const FEHLER_ID = '00000000-0000-4000-8000-00000000d004'

interface StubLage {
  /** Zeile, die die Attrappe fuer dta_fehlerprotokoll liefert. */
  zeile?: Record<string, unknown> | null
  /** Fehler, den das UPDATE melden soll. */
  updateFehler?: string | null
  /** Fehler, den das INSERT melden soll. */
  insertFehler?: string | null
  /** Zeilen fuer die Dashboard-Abfrage. */
  liste?: Record<string, unknown>[]
}

function makeStub(lage: StubLage = {}) {
  const protokoll = {
    inserts: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
    updateFilter: [] as Array<[string, unknown]>,
    selectFilter: [] as Array<[string, unknown]>,
    audit: [] as Record<string, unknown>[],
  }

  const zeile = lage.zeile === undefined
    ? { bearbeitungsstatus: 'neu', organization_id: ORG }
    : lage.zeile

  function protokollBuilder() {
    const b: Record<string, unknown> = {}
    b.select = () => b
    b.eq = (spalte: string, wert: unknown) => { protokoll.selectFilter.push([spalte, wert]); return b }
    b.gte = () => b
    b.lte = () => b
    b.single = async () => ({ data: zeile, error: zeile ? null : { message: 'not found' } })
    b.then = (aufloesen: (v: unknown) => unknown) =>
      Promise.resolve({ data: lage.liste ?? [], error: null }).then(aufloesen)
    return b
  }

  const stub = {
    from(tabelle: string) {
      if (tabelle === 'dta_fehlerprotokoll') {
        return {
          select: (...a: unknown[]) => { void a; return protokollBuilder() },
          insert: (werte: Record<string, unknown>) => {
            protokoll.inserts.push(werte)
            return {
              select: () => ({
                single: async () => lage.insertFehler
                  ? { data: null, error: { message: lage.insertFehler } }
                  : { data: { id: FEHLER_ID }, error: null },
              }),
            }
          },
          update: (werte: Record<string, unknown>) => {
            protokoll.updates.push(werte)
            const u: Record<string, unknown> = {}
            u.eq = (spalte: string, wert: unknown) => {
              protokoll.updateFilter.push([spalte, wert]); return u
            }
            u.then = (aufloesen: (v: unknown) => unknown) =>
              Promise.resolve({
                error: lage.updateFehler ? { message: lage.updateFehler } : null,
              }).then(aufloesen)
            return u
          },
        } as never
      }
      if (tabelle === 'billing_audit_trail') {
        return {
          insert: async (werte: Record<string, unknown>) => {
            protokoll.audit.push(werte)
            return { error: null }
          },
        } as never
      }
      throw new Error(`Unerwartete Tabelle im Stub: ${tabelle}`)
    },
  }

  return { stub: stub as never, protokoll }
}

beforeEach(() => { vi.clearAllMocks() })

// ═══════════════════════════════════════════════════════════════════
describe('Statuskatalog', () => {
  it('deckt sich mit dem CHECK in der Datenbank', () => {
    // chk_fp_bearbeitungsstatus, Migration 20260808220000. Weicht die
    // Liste ab, schreibt die Anwendung Werte, die die Datenbank ablehnt.
    expect([...BEARBEITUNGS_STATUS]).toEqual([
      'neu', 'in_pruefung', 'korrektur_erforderlich', 'korrigiert',
      'erneut_eingereicht', 'erledigt', 'ignoriert',
    ])
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('erstelleFehler', () => {
  it('legt den Fehler mit Status neu an', async () => {
    const { stub, protokoll } = makeStub()
    const id = await erstelleFehler(stub, {
      organizationId: ORG,
      fehlerQuelle: 'annahmestelle',
      fehlerKategorie: 'fachlich',
      fehlerMeldung: 'Testmeldung',
    })

    expect(id).toBe(FEHLER_ID)
    expect(protokoll.inserts[0]).toMatchObject({
      organization_id: ORG,
      fehler_quelle: 'annahmestelle',
      bearbeitungsstatus: 'neu',
      // Ohne Angabe gilt 'fehler', nicht 'hinweis': ein unbewerteter
      // Eintrag aus dem Kassenweg darf nicht als Randnotiz durchgehen.
      schweregrad: 'fehler',
    })
  })

  it('schreibt nur mit actorId einen Pruefpfad-Eintrag', async () => {
    const ohne = makeStub()
    await erstelleFehler(ohne.stub, {
      organizationId: ORG, fehlerQuelle: 'intern',
      fehlerKategorie: 'technisch', fehlerMeldung: 'x',
    })
    expect(ohne.protokoll.audit).toHaveLength(0)

    const mit = makeStub()
    await erstelleFehler(mit.stub, {
      organizationId: ORG, fehlerQuelle: 'intern',
      fehlerKategorie: 'technisch', fehlerMeldung: 'x', actorId: ACTOR,
    })
    expect(mit.protokoll.audit[0]).toMatchObject({
      entity_type: 'dta_fehlerprotokoll',
      action: 'fehler_erstellt',
      organization_id: ORG,
    })
  })

  it('wirft, wenn der Eintrag nicht angelegt werden konnte', async () => {
    const { stub } = makeStub({ insertFehler: 'RLS verweigert' })
    await expect(erstelleFehler(stub, {
      organizationId: ORG, fehlerQuelle: 'intern',
      fehlerKategorie: 'technisch', fehlerMeldung: 'x',
    })).rejects.toThrow(/RLS verweigert/)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('aktualisiereFehler — erlaubte Wege', () => {
  const wege: Array<[string, string]> = [
    ['neu', 'in_pruefung'],
    ['neu', 'ignoriert'],
    ['in_pruefung', 'korrektur_erforderlich'],
    ['in_pruefung', 'erledigt'],
    ['korrektur_erforderlich', 'korrigiert'],
    ['korrigiert', 'erneut_eingereicht'],
    ['erneut_eingereicht', 'erledigt'],
    ['erneut_eingereicht', 'korrektur_erforderlich'],
  ]

  for (const [von, nach] of wege) {
    it(`laesst ${von} → ${nach} zu`, async () => {
      const { stub, protokoll } = makeStub({
        zeile: { bearbeitungsstatus: von, organization_id: ORG },
      })
      await aktualisiereFehler(stub, {
        fehlerId: FEHLER_ID, bearbeitungsstatus: nach as never,
        actorId: ACTOR, organizationId: ORG,
      })
      expect(protokoll.updates[0]).toMatchObject({ bearbeitungsstatus: nach })
    })
  }

  it('setzt loesung_am mit, wenn eine Loesung mitkommt', async () => {
    const { stub, protokoll } = makeStub({
      zeile: { bearbeitungsstatus: 'in_pruefung', organization_id: ORG },
    })
    await aktualisiereFehler(stub, {
      fehlerId: FEHLER_ID, bearbeitungsstatus: 'erledigt',
      loesung: 'Versichertennummer korrigiert', actorId: ACTOR, organizationId: ORG,
    })
    expect(protokoll.updates[0].loesung).toBe('Versichertennummer korrigiert')
    expect(protokoll.updates[0].loesung_am).toBeTruthy()
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('aktualisiereFehler — FP-1: Endzustaende sind endgueltig', () => {
  it('laesst einen erledigten Fehler NICHT auf neu zuruecksetzen', async () => {
    const { stub, protokoll } = makeStub({
      zeile: { bearbeitungsstatus: 'erledigt', organization_id: ORG },
    })
    await expect(aktualisiereFehler(stub, {
      fehlerId: FEHLER_ID, bearbeitungsstatus: 'neu',
      actorId: ACTOR, organizationId: ORG,
    })).rejects.toThrow(/Endzustand/)

    // Nichts geschrieben — auch kein Pruefpfad-Eintrag.
    expect(protokoll.updates).toHaveLength(0)
    expect(protokoll.audit).toHaveLength(0)
  })

  it('laesst einen ignorierten Fehler NICHT auf erledigt heben', async () => {
    // Der Unterschied ist fachlich: 'ignoriert' heisst „war keiner",
    // 'erledigt' heisst „war einer und wurde behoben". Wer das eine ins
    // andere umschreiben kann, faelscht die Fehlerstatistik gegenueber
    // der Kasse.
    const { stub } = makeStub({
      zeile: { bearbeitungsstatus: 'ignoriert', organization_id: ORG },
    })
    await expect(aktualisiereFehler(stub, {
      fehlerId: FEHLER_ID, bearbeitungsstatus: 'erledigt',
      actorId: ACTOR, organizationId: ORG,
    })).rejects.toThrow(/Endzustand/)
  })

  it('lehnt einen unbekannten Ausgangsstatus ab, statt alles zu erlauben', async () => {
    const { stub } = makeStub({
      zeile: { bearbeitungsstatus: 'irgendwas_altes', organization_id: ORG },
    })
    await expect(aktualisiereFehler(stub, {
      fehlerId: FEHLER_ID, bearbeitungsstatus: 'erledigt',
      actorId: ACTOR, organizationId: ORG,
    })).rejects.toThrow(/Unbekannter Ausgangsstatus/)
  })

  it('lehnt einen unerlaubten Sprung ab', async () => {
    const { stub } = makeStub({
      zeile: { bearbeitungsstatus: 'neu', organization_id: ORG },
    })
    await expect(aktualisiereFehler(stub, {
      fehlerId: FEHLER_ID, bearbeitungsstatus: 'erledigt',
      actorId: ACTOR, organizationId: ORG,
    })).rejects.toThrow(/Ungültiger Statusübergang/)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('aktualisiereFehler — FP-2: Zielstatus aus dem Anfragekoerper', () => {
  it('lehnt einen Status ab, den der Katalog nicht kennt', async () => {
    const { stub, protokoll } = makeStub()
    await expect(aktualisiereFehler(stub, {
      fehlerId: FEHLER_ID, bearbeitungsstatus: 'geloescht' as never,
      actorId: ACTOR, organizationId: ORG,
    })).rejects.toThrow(/Unbekannter Bearbeitungsstatus/)
    expect(protokoll.updates).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('aktualisiereFehler — FP-3: Ergebnis des Schreibens', () => {
  it('wirft, wenn das UPDATE scheitert', async () => {
    const { stub } = makeStub({
      zeile: { bearbeitungsstatus: 'neu', organization_id: ORG },
      updateFehler: 'new row violates check constraint',
    })
    await expect(aktualisiereFehler(stub, {
      fehlerId: FEHLER_ID, bearbeitungsstatus: 'in_pruefung',
      actorId: ACTOR, organizationId: ORG,
    })).rejects.toThrow(/nicht aktualisiert/)
  })

  it('schreibt bei gescheitertem UPDATE KEINEN Pruefpfad-Eintrag', async () => {
    // Der Kern des Befunds: ein Audit-Eintrag ueber einen Statuswechsel,
    // den es nie gab, ist schlimmer als gar keiner — er wird spaeter als
    // Beleg gelesen.
    const { stub, protokoll } = makeStub({
      zeile: { bearbeitungsstatus: 'neu', organization_id: ORG },
      updateFehler: 'Verbindung verloren',
    })
    await expect(aktualisiereFehler(stub, {
      fehlerId: FEHLER_ID, bearbeitungsstatus: 'in_pruefung',
      actorId: ACTOR, organizationId: ORG,
    })).rejects.toThrow()
    expect(protokoll.audit).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('aktualisiereFehler — Mandantengrenze', () => {
  it('filtert Lesen UND Schreiben auf die Organisation', async () => {
    const { stub, protokoll } = makeStub({
      zeile: { bearbeitungsstatus: 'neu', organization_id: ORG },
    })
    await aktualisiereFehler(stub, {
      fehlerId: FEHLER_ID, bearbeitungsstatus: 'in_pruefung',
      actorId: ACTOR, organizationId: ORG,
    })
    expect(protokoll.selectFilter).toContainEqual(['organization_id', ORG])
    expect(protokoll.updateFilter).toContainEqual(['organization_id', ORG])
  })

  it('nimmt die Organisation fuer den Pruefpfad aus der Zeile, nicht aus den Parametern', async () => {
    // organizationId ist im Parametersatz optional. Der Pruefpfad muss dem
    // Mandanten des Fehlers folgen, sonst landet der Eintrag im falschen
    // Mandanten und fehlt dort, wo er gebraucht wird.
    const { stub, protokoll } = makeStub({
      zeile: { bearbeitungsstatus: 'neu', organization_id: ORG_FREMD },
    })
    await aktualisiereFehler(stub, {
      fehlerId: FEHLER_ID, bearbeitungsstatus: 'in_pruefung', actorId: ACTOR,
    })
    expect(protokoll.audit[0]).toMatchObject({ organization_id: ORG_FREMD })
  })

  it('wirft, wenn die Zeile im Mandanten nicht existiert', async () => {
    const { stub } = makeStub({ zeile: null })
    await expect(aktualisiereFehler(stub, {
      fehlerId: FEHLER_ID, bearbeitungsstatus: 'in_pruefung',
      actorId: ACTOR, organizationId: ORG,
    })).rejects.toThrow(/nicht gefunden/)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('holeFehlerDashboard', () => {
  it('liefert bei leerem Bestand Nullen statt undefined', async () => {
    const { stub } = makeStub({ liste: [] })
    const d = await holeFehlerDashboard(stub, ORG)
    expect(d).toMatchObject({ gesamt: 0, neu: 0, kritisch: 0 })
    expect(d.nachQuelle).toEqual({})
  })

  it('zaehlt nach Quelle, Kategorie, Schwere und Status', async () => {
    const { stub } = makeStub({
      liste: [
        { id: '1', fehler_quelle: 'annahmestelle', fehler_kategorie: 'format', schweregrad: 'kritisch', bearbeitungsstatus: 'neu' },
        { id: '2', fehler_quelle: 'annahmestelle', fehler_kategorie: 'inhalt', schweregrad: 'fehler', bearbeitungsstatus: 'in_pruefung' },
        { id: '3', fehler_quelle: 'transport', fehler_kategorie: 'verbindung', schweregrad: 'warnung', bearbeitungsstatus: 'erledigt' },
        { id: '4', fehler_quelle: 'transport', fehler_kategorie: 'verbindung', schweregrad: 'kritisch', bearbeitungsstatus: 'korrektur_erforderlich' },
      ],
    })
    const d = await holeFehlerDashboard(stub, ORG)

    expect(d.gesamt).toBe(4)
    expect(d.neu).toBe(1)
    expect(d.inPruefung).toBe(1)
    expect(d.korrekturErforderlich).toBe(1)
    expect(d.erledigt).toBe(1)
    expect(d.kritisch).toBe(2)
    expect(d.nachQuelle).toEqual({ annahmestelle: 2, transport: 2 })
    expect(d.nachKategorie).toEqual({ format: 1, inhalt: 1, verbindung: 2 })
    expect(d.nachSchwere).toEqual({ kritisch: 2, fehler: 1, warnung: 1 })
  })

  it('filtert auf die Organisation', async () => {
    const { stub, protokoll } = makeStub({ liste: [] })
    await holeFehlerDashboard(stub, ORG)
    expect(protokoll.selectFilter).toContainEqual(['organization_id', ORG])
  })
})
