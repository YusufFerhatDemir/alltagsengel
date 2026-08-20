// ═══════════════════════════════════════════════════════════════
// E2E (intern): Rückläufer → Fehlerprotokoll → automatische Aufgabe
// ═══════════════════════════════════════════════════════════════
// Fährt die Kette gegen eine speicherinterne Datenbank — kein Netz, keine
// Produktionsdaten, keine externe Übermittlung. Geprüft wird das Verhalten,
// das ein echter Kassenrückläufer auslöst:
//
//   1. dta_ruecklaeufer wird geschrieben (Originalmeldung unverändert)
//   2. bei Fehlern entsteht ein dta_fehlerprotokoll-Eintrag
//   3. daraus entsteht GENAU EINE ops_aufgaben-Zeile
//   4. der Audit-Trail hält beides fest, mandantenrichtig
//   5. ein erneuter Import derselben Meldung erzeugt nichts doppelt
//
// Die Übermittlung an die Kasse ist NICHT Teil dieses Tests und wird auch
// nicht simuliert — sie ist extern und bleibt unbewiesen.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest'
import { heuteBerlin } from '@/lib/utils/timezone'
import { importiereRuecklaeufer } from '@/lib/abrechnung/ruecklaeufer'

const ORG = '00000000-0000-4000-8000-000460629986'
const FREMDE_ORG = '11111111-1111-4111-8111-111111111111'
const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

// ── Speicherinterne Supabase-Attrappe ───────────────────────────
// Unterstuetzt genau so viel PostgREST-Semantik, wie die Kette braucht:
// insert/select/update mit eq-Filtern, .single()/.maybeSingle(), und den
// JSON-Pfad-Filter `metadata->>schluessel`, auf dem der Dublettenschutz sitzt.

function createDb(seed: Record<string, any[]> = {}) {
  const tabellen: Record<string, any[]> = {
    dta_ruecklaeufer: [], dta_ruecklaeufer_positionen: [], dta_fehlerprotokoll: [],
    ops_aufgaben: [], billing_audit_trail: [], abrechnungslaeufe: [],
    organization_members: [{ organization_id: ORG, user_id: ACTOR }],
    profiles: [{ id: ACTOR, role: 'admin', deleted_at: null }],
    ops_ereignis_regeln: [], ops_benachrichtigungen: [], ops_aktivitaetslog: [],
    ops_benachrichtigungs_praeferenzen: [],
    ...seed,
  }

  let idZaehler = 0
  const naechsteId = (praefix: string) => `${praefix}-${++idZaehler}`

  function wertAus(zeile: any, spalte: string): unknown {
    const json = spalte.match(/^(\w+)->>(\w+)$/)
    if (json) return zeile[json[1]]?.[json[2]]
    return zeile[spalte]
  }

  function query(tabelle: string) {
    const filter: { spalte: string; wert: unknown; art: 'eq' | 'in' | 'is' }[] = []
    let modus: 'select' | 'insert' | 'update' = 'select'
    let nutzlast: any = null

    const treffer = () =>
      (tabellen[tabelle] ?? []).filter(zeile =>
        filter.every(f => {
          const v = wertAus(zeile, f.spalte)
          if (f.art === 'in') return (f.wert as unknown[]).includes(v)
          if (f.art === 'is') return f.wert === null ? v == null : v === f.wert
          return v === f.wert
        }),
      )

    function ausfuehren(): { data: any; error: any } {
      if (modus === 'insert') {
        const zeilen = (Array.isArray(nutzlast) ? nutzlast : [nutzlast]).map(z => ({
          id: z.id ?? naechsteId(tabelle),
          created_at: new Date().toISOString(),
          ...z,
        }))
        tabellen[tabelle] ??= []
        tabellen[tabelle].push(...zeilen)
        return { data: Array.isArray(nutzlast) ? zeilen : zeilen[0], error: null }
      }
      if (modus === 'update') {
        const betroffen = treffer()
        for (const z of betroffen) Object.assign(z, nutzlast)
        return { data: betroffen, error: null }
      }
      return { data: treffer(), error: null }
    }

    const chain: any = {
      select: () => chain,
      eq: (spalte: string, wert: unknown) => { filter.push({ spalte, wert, art: 'eq' }); return chain },
      in: (spalte: string, wert: unknown) => { filter.push({ spalte, wert, art: 'in' }); return chain },
      is: (spalte: string, wert: unknown) => { filter.push({ spalte, wert, art: 'is' }); return chain },
      or: () => chain,
      order: () => chain,
      limit: () => chain,
      insert: (p: any) => { modus = 'insert'; nutzlast = p; return chain },
      update: (p: any) => { modus = 'update'; nutzlast = p; return chain },
      single: () => {
        const r = ausfuehren()
        const zeile = Array.isArray(r.data) ? r.data[0] : r.data
        return Promise.resolve(zeile ? { data: zeile, error: null } : { data: null, error: { message: 'not found' } })
      },
      maybeSingle: () => {
        const r = ausfuehren()
        const zeile = Array.isArray(r.data) ? r.data[0] : r.data
        return Promise.resolve({ data: zeile ?? null, error: null })
      },
      then: (resolve: any) => resolve(ausfuehren()),
    }
    return chain
  }

  return {
    client: { from: (tabelle: string) => query(tabelle) } as any,
    tabellen,
  }
}

const FEHLERMELDUNG = 'UNB+UNOC:3+460629986:...+FEHLER: Segment SRD ungueltig'

function importParams(ueberschreibung: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    laufId: 'lauf-1',
    kostentraegerIk: '105313145',
    ruecklaeuferTyp: 'fehlermeldung' as const,
    originalMeldung: FEHLERMELDUNG,
    fehlerCode: 'T4711',
    fehlerText: 'Segment SRD ungueltig',
    actorId: ACTOR,
    ...ueberschreibung,
  }
}

let db: ReturnType<typeof createDb>

beforeEach(() => {
  db = createDb({ abrechnungslaeufe: [{ id: 'lauf-1', organization_id: ORG, status: 'uebermittelt' }] })
})

// ── Kette bei technischem Fehler ────────────────────────────────

describe('E2E: technischer Rueckläufer', () => {
  it('schreibt Rueckläufer, Fehlerprotokoll und genau eine Aufgabe', async () => {
    const r = await importiereRuecklaeufer(db.client, importParams())

    expect(r.status).toBe('technischer_fehler')
    expect(r.fehlerErstellt).toBe(true)
    expect(db.tabellen.dta_ruecklaeufer).toHaveLength(1)
    expect(db.tabellen.dta_fehlerprotokoll).toHaveLength(1)
    expect(db.tabellen.ops_aufgaben).toHaveLength(1)
    expect(r.aufgabeId).toBe(db.tabellen.ops_aufgaben[0].id)
  })

  it('speichert die Originalmeldung unveraendert', async () => {
    await importiereRuecklaeufer(db.client, importParams())
    expect(db.tabellen.dta_ruecklaeufer[0].original_meldung).toBe(FEHLERMELDUNG)
  })

  it('verknuepft die Aufgabe mit Lauf, Rueckläufer und Fehlerprotokoll', async () => {
    await importiereRuecklaeufer(db.client, importParams())
    const aufgabe = db.tabellen.ops_aufgaben[0]
    const fehler = db.tabellen.dta_fehlerprotokoll[0]
    const rl = db.tabellen.dta_ruecklaeufer[0]

    expect(aufgabe.abrechnungslauf_id).toBe('lauf-1')
    expect(aufgabe.metadata.ruecklaeufer_id).toBe(rl.id)
    expect(aufgabe.metadata.fehlerprotokoll_id).toBe(fehler.id)
    expect(aufgabe.metadata.fehler_code).toBe('T4711')
  })

  it('setzt Prioritaet, Frist, Verantwortlichen und Status der Aufgabe', async () => {
    await importiereRuecklaeufer(db.client, importParams())
    const aufgabe = db.tabellen.ops_aufgaben[0]

    expect(aufgabe.prioritaet).toBe('kritisch')
    expect(aufgabe.status).toBe('offen')
    expect(aufgabe.kategorie).toBe('abrechnung')
    expect(aufgabe.verantwortlich_id).toBe(ACTOR)
    expect(aufgabe.faellig_am >= heuteBerlin()).toBe(true)
  })

  it('setzt den Lauf auf korrektur_erforderlich', async () => {
    await importiereRuecklaeufer(db.client, importParams())
    const lauf = db.tabellen.abrechnungslaeufe[0]
    expect(lauf.antwort_status).toBe('technischer_fehler')
    expect(lauf.status).toBe('korrektur_erforderlich')
  })

  it('protokolliert mandantenrichtig im Audit-Trail', async () => {
    await importiereRuecklaeufer(db.client, importParams())
    const audit = db.tabellen.billing_audit_trail
    expect(audit.length).toBeGreaterThanOrEqual(2)
    for (const eintrag of audit) {
      expect(eintrag.organization_id).toBe(ORG)
      expect(eintrag.entity_type).toBe('dta_ruecklaeufer')
    }
    expect(audit.map(a => a.action)).toContain('aufgabe_automatisch_erstellt')
    expect(audit.map(a => a.action)).toContain('ruecklaeufer_importiert')
  })
})

// ── Dubletten ───────────────────────────────────────────────────

describe('E2E: erneuter Import derselben Meldung', () => {
  it('erzeugt weder einen zweiten Rueckläufer noch eine zweite Aufgabe', async () => {
    const erst = await importiereRuecklaeufer(db.client, importParams())
    const zweit = await importiereRuecklaeufer(db.client, importParams())

    expect(zweit.status).toBe('duplikat')
    expect(zweit.ruecklaeuferId).toBe(erst.ruecklaeuferId)
    expect(db.tabellen.dta_ruecklaeufer).toHaveLength(1)
    expect(db.tabellen.ops_aufgaben).toHaveLength(1)
    expect(db.tabellen.dta_fehlerprotokoll).toHaveLength(1)
  })

  it('erzeugt auch dann keine zweite Aufgabe, wenn die erste erledigt wurde', async () => {
    await importiereRuecklaeufer(db.client, importParams())
    db.tabellen.ops_aufgaben[0].status = 'erledigt'

    // Anderer Meldungstext -> anderer Hash -> die Dublettenpruefung des
    // Rueckläufers greift nicht. Nur der Aufgaben-Dublettenschutz kann hier
    // noch verhindern, dass dieselbe Sache zweimal auf dem Tisch landet.
    const zweit = await importiereRuecklaeufer(db.client, importParams({ originalMeldung: FEHLERMELDUNG + ' (Wiederholung)' }))

    expect(db.tabellen.dta_ruecklaeufer).toHaveLength(2)
    // Neuer Rueckläufer -> neue Id -> bewusst eine eigene Aufgabe.
    expect(zweit.aufgabeId).not.toBe(db.tabellen.ops_aufgaben[0].id)
    expect(db.tabellen.ops_aufgaben).toHaveLength(2)
  })
})

// ── Erfolgsfaelle erzeugen keine Aufgabe ────────────────────────

describe('E2E: erfolgreiche Rueckmeldungen', () => {
  it.each(['quittung', 'annahmebestaetigung', 'zahlungsavis'] as const)(
    'erzeugt bei %s weder Fehlerprotokoll noch Aufgabe',
    async (typ) => {
      const r = await importiereRuecklaeufer(db.client, importParams({
        ruecklaeuferTyp: typ, fehlerCode: undefined, fehlerText: undefined,
      }))
      expect(r.status).toBe('angenommen')
      expect(r.fehlerErstellt).toBe(false)
      expect(r.aufgabeId).toBeNull()
      expect(db.tabellen.dta_fehlerprotokoll).toHaveLength(0)
      expect(db.tabellen.ops_aufgaben).toHaveLength(0)
    },
  )

  it('setzt den Lauf bei Annahme auf angenommen', async () => {
    await importiereRuecklaeufer(db.client, importParams({ ruecklaeuferTyp: 'quittung', fehlerCode: undefined }))
    expect(db.tabellen.abrechnungslaeufe[0].status).toBe('angenommen')
  })
})

// ── Teilablehnung mit Positionen ────────────────────────────────

describe('E2E: Teilablehnung mit Einzelpositionen', () => {
  it('zaehlt Positionen und erzeugt eine Aufgabe mit hoher Prioritaet', async () => {
    const r = await importiereRuecklaeufer(db.client, importParams({
      fehlerCode: 'F100',
      positionen: [
        { status: 'angenommen', betragAngefordertCent: 5000 },
        { status: 'abgelehnt', betragAngefordertCent: 3000, fehlerCode: 'F100' },
        { status: 'gekuerzt', betragAngefordertCent: 2000, betragAnerkannt_cent: 1000 },
      ],
    }))

    expect(r.status).toBe('fachlicher_fehler')
    expect(r.positionenGesamt).toBe(3)
    expect(r.positionenAngenommen).toBe(1)
    expect(r.positionenAbgelehnt).toBe(2)
    expect(db.tabellen.dta_ruecklaeufer_positionen).toHaveLength(3)

    const aufgabe = db.tabellen.ops_aufgaben[0]
    expect(aufgabe.prioritaet).toBe('hoch')
    expect(aufgabe.beschreibung).toContain('2 von 3 Positionen abgelehnt')
  })
})

// ── Mandantentrennung ───────────────────────────────────────────

describe('E2E: Mandantentrennung', () => {
  it('ordnet einen Lauf einer fremden Organisation nicht zu', async () => {
    const r = await importiereRuecklaeufer(db.client, importParams({ organizationId: FREMDE_ORG }))

    // Der Lauf gehoert ORG — er darf vom fremden Mandanten nicht angefasst werden.
    expect(r.zugeordnet).toBe(false)
    expect(db.tabellen.abrechnungslaeufe[0].antwort_status).toBeUndefined()
    expect(db.tabellen.abrechnungslaeufe[0].status).toBe('uebermittelt')
  })

  it('schreibt Rueckläufer, Fehler und Aufgabe unter der uebergebenen Organisation', async () => {
    await importiereRuecklaeufer(db.client, importParams({ organizationId: FREMDE_ORG }))
    expect(db.tabellen.dta_ruecklaeufer[0].organization_id).toBe(FREMDE_ORG)
    expect(db.tabellen.dta_fehlerprotokoll[0].organization_id).toBe(FREMDE_ORG)
    expect(db.tabellen.ops_aufgaben[0].organization_id).toBe(FREMDE_ORG)
    for (const a of db.tabellen.billing_audit_trail) expect(a.organization_id).toBe(FREMDE_ORG)
  })

  it('findet einen gleichnamigen Rueckläufer eines anderen Mandanten nicht als Dublette', async () => {
    await importiereRuecklaeufer(db.client, importParams())
    const fremd = await importiereRuecklaeufer(db.client, importParams({ organizationId: FREMDE_ORG }))

    expect(fremd.status).not.toBe('duplikat')
    expect(db.tabellen.dta_ruecklaeufer).toHaveLength(2)
    expect(db.tabellen.ops_aufgaben).toHaveLength(2)
  })
})
