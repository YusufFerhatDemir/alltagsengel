// ═══════════════════════════════════════════════════════════════════════
// Bonussystem (Block 19) — Haertung vom 27.08.2026
// ═══════════════════════════════════════════════════════════════════════
//
// Geprueft werden die ZUSAGEN, nicht die Schreibweise. Jeder Test hier
// benennt in seiner Beschreibung, was am alten Stand passiert waere —
// die Gegenprobe steht am Ende der Datei und laesst die alte Rechnung
// noch einmal laufen, damit belegt ist, dass der Test tatsaechlich
// unterscheidet.
//
// Die bisherige Testdatei (bonusEngine.test.ts) prueft ausschliesslich die
// vier reinen Bewertungsfunktionen. Alles, was die Datenbank anfasst —
// Berechnungslauf, Freigabe, Messwertermittlung — war ungetestet, und
// genau dort lagen die Befunde.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  fuehreBerechnungslaufDurch,
  freigebenBerechnung,
  createRegel,
  assertZeitraum,
  istEntschieden,
  bewerteKeineOffenenPruefungen,
  ENTSCHIEDENE_BONUS_STATUS,
} from '@/lib/analytics/bonusEngine'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const FREMD_ORG = '11111111-1111-4111-8111-111111111111'
const REGEL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CG1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const CG2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const REGEL_AUSFAELLE = {
  id: REGEL_ID, organization_id: ORG, name: 'Keine Ausfälle',
  kriterium_typ: 'keine_ausfaelle', schwellenwert: 0, punkte: 10,
  aktiv: true, created_at: '2026-01-01T00:00:00Z',
}
const REGEL_DOKU = { ...REGEL_AUSFAELLE, kriterium_typ: 'vollstaendige_dokumentation', schwellenwert: 100 }
const REGEL_PRUEF = { ...REGEL_AUSFAELLE, kriterium_typ: 'keine_offenen_pruefungen', schwellenwert: 100 }

/**
 * Baut einen Antwortgeber fuer den Berechnungslauf. Alles, was nicht
 * ausdruecklich belegt ist, kommt leer zurueck — ein Test, der eine Tabelle
 * vergisst, faellt damit auf, statt still zu bestehen.
 */
function laufAntworten(opt: {
  regel?: Record<string, unknown>
  caregivers?: string[]
  absences?: Array<Record<string, unknown>>
  records?: Array<Record<string, unknown>>
  signaturen?: Array<{ service_record_id: string }>
  reviewErrors?: Array<{ service_record_id: string }>
  bestand?: Array<Record<string, unknown>>
  bestandFehler?: { message: string; code?: string }
  updateTrifft?: boolean
  insertFehler?: { message: string; code?: string }
}) {
  return (a: FakeAufruf) => {
    if (a.tabelle === 'bonus_regeln') return { data: opt.regel ?? REGEL_AUSFAELLE }
    if (a.tabelle === 'caregivers') return { data: (opt.caregivers ?? [CG1]).map(id => ({ id })) }
    if (a.tabelle === 'absences') return { data: opt.absences ?? [] }
    if (a.tabelle === 'service_records') return { data: opt.records ?? [] }
    if (a.tabelle === 'service_signatures') return { data: opt.signaturen ?? [] }
    if (a.tabelle === 'review_errors') return { data: opt.reviewErrors ?? [] }
    if (a.tabelle === 'bonus_berechnungen') {
      if (a.operation === 'select') {
        if (opt.bestandFehler) return { error: opt.bestandFehler }
        return { data: opt.bestand ?? [] }
      }
      if (a.operation === 'update') return { data: opt.updateTrifft === false ? null : { id: 'neu' } }
      if (a.operation === 'insert') return opt.insertFehler ? { error: opt.insertFehler } : { data: { id: 'neu' } }
    }
    return {}
  }
}

const LAUF = { organizationId: ORG, regelId: REGEL_ID, von: '2026-01-01', bis: '2026-01-31', userId: USER }

// ═══════════════════════════════════════════════════════════════════════
// P0 — Ein zweiter Lauf darf entschiedene Prämien nicht zurücksetzen
// ═══════════════════════════════════════════════════════════════════════

describe('Berechnungslauf überschreibt keine entschiedene Prämie', () => {
  for (const status of ENTSCHIEDENE_BONUS_STATUS) {
    it(`schreibt NICHTS, wenn die Berechnung im Zeitraum bereits "${status}" ist`, async () => {
      const fake = erstelleFakeSupabase(laufAntworten({
        bestand: [{ id: 'vorhanden', caregiver_id: CG1, status }],
      }))
      const ergebnisse = await fuehreBerechnungslaufDurch(fake.client, LAUF)

      // Kein Schreibvorgang auf bonus_berechnungen — weder insert noch update.
      const schreibend = fake.auf('bonus_berechnungen').filter(a => a.operation !== 'select')
      expect(schreibend, `am alten Stand hätte der upsert status='berechnet' geschrieben`).toHaveLength(0)

      expect(ergebnisse).toHaveLength(1)
      expect(ergebnisse[0].uebersprungen).toBe(true)
      expect(ergebnisse[0].hinweis).toContain(status)
    })
  }

  it('schreibt normal, solange die Berechnung noch auf "berechnet" steht', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({
      bestand: [{ id: 'vorhanden', caregiver_id: CG1, status: 'berechnet' }],
    }))
    const ergebnisse = await fuehreBerechnungslaufDurch(fake.client, LAUF)
    const update = fake.auf('bonus_berechnungen').find(a => a.operation === 'update')
    expect(update).toBeDefined()
    expect(ergebnisse[0].uebersprungen).toBeUndefined()
  })

  it('setzt das UPDATE per Compare-and-Swap auf status=berechnet', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({
      bestand: [{ id: 'vorhanden', caregiver_id: CG1, status: 'berechnet' }],
    }))
    await fuehreBerechnungslaufDurch(fake.client, LAUF)
    const update = fake.auf('bonus_berechnungen').find(a => a.operation === 'update')
    expect(hatFilter(update, 'eq', 'status', 'berechnet')).toBe(true)
    expect(hatOrgFence(update, ORG)).toBe(true)
  })

  it('überschreibt nicht, wenn zwischen Prüfung und Schreiben entschieden wurde (CAS greift ins Leere)', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({
      bestand: [{ id: 'vorhanden', caregiver_id: CG1, status: 'berechnet' }],
      updateTrifft: false,
    }))
    const ergebnisse = await fuehreBerechnungslaufDurch(fake.client, LAUF)
    expect(ergebnisse[0].uebersprungen).toBe(true)
    expect(ergebnisse[0].hinweis).toContain('Während des Laufs entschieden')
  })

  it('wertet eine parallel angelegte Zeile (23505) als übersprungen, nicht als Fehler', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({
      bestand: [],
      insertFehler: { message: 'duplicate key', code: '23505' },
    }))
    const ergebnisse = await fuehreBerechnungslaufDurch(fake.client, LAUF)
    expect(ergebnisse[0].uebersprungen).toBe(true)
    expect(ergebnisse[0].hinweis).toContain('Parallel angelegt')
  })

  it('schreibt GAR NICHTS, wenn der Bestand nicht gelesen werden kann (fail-closed)', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({
      bestandFehler: { message: 'connection reset' },
    }))
    await expect(fuehreBerechnungslaufDurch(fake.client, LAUF)).rejects.toThrow(/NICHTS geschrieben/)
    const schreibend = fake.auf('bonus_berechnungen').filter(a => a.operation !== 'select')
    expect(schreibend).toHaveLength(0)
  })

  it('prüft den Bestand mit Mandanten-Fence, Regel und Zeitraum', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({}))
    await fuehreBerechnungslaufDurch(fake.client, LAUF)
    const bestand = fake.ersterAuf('bonus_berechnungen', 'select')
    expect(hatOrgFence(bestand, ORG)).toBe(true)
    expect(hatFilter(bestand, 'eq', 'regel_id', REGEL_ID)).toBe(true)
    expect(hatFilter(bestand, 'eq', 'zeitraum_von', '2026-01-01')).toBe(true)
    expect(hatFilter(bestand, 'eq', 'zeitraum_bis', '2026-01-31')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// P1 — Abgelehnte und stornierte Abwesenheiten kosten keine Prämie
// ═══════════════════════════════════════════════════════════════════════

describe('Ausfalltage zählen nur echte Abwesenheiten', () => {
  const zeitraum = { start_date: '2026-01-05', end_date: '2026-01-09' } // 5 Tage

  it('zählt einen ABGELEHNTEN Urlaubsantrag NICHT als Ausfall', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({
      absences: [{ caregiver_id: CG1, status: 'abgelehnt', ...zeitraum }],
    }))
    const [e] = await fuehreBerechnungslaufDurch(fake.client, LAUF)
    // Am alten Stand: 5 Ausfalltage, Grenze 0 => nicht erfüllt, 0 Punkte.
    expect(e.messwert).toBe(0)
    expect(e.erfuellt).toBe(true)
    expect(e.punkte).toBe(10)
  })

  it('zählt einen STORNIERTEN Antrag NICHT als Ausfall', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({
      absences: [{ caregiver_id: CG1, status: 'storniert', ...zeitraum }],
    }))
    const [e] = await fuehreBerechnungslaufDurch(fake.client, LAUF)
    expect(e.messwert).toBe(0)
    expect(e.erfuellt).toBe(true)
  })

  it('zählt einen GENEHMIGTEN Urlaub weiterhin als Ausfall', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({
      absences: [{ caregiver_id: CG1, status: 'genehmigt', ...zeitraum }],
    }))
    const [e] = await fuehreBerechnungslaufDurch(fake.client, LAUF)
    expect(e.messwert).toBe(5)
    expect(e.erfuellt).toBe(false)
    expect(e.punkte).toBe(0)
  })

  it('zählt Altbestand ohne Status weiterhin — gleiche Liste wie die Einsatzplanung', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({
      absences: [{ caregiver_id: CG1, status: null, ...zeitraum }],
    }))
    const [e] = await fuehreBerechnungslaufDurch(fake.client, LAUF)
    expect(e.messwert).toBe(5)
  })

  it('liest den Status überhaupt mit — ohne die Spalte wäre kein Filter möglich', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({}))
    await fuehreBerechnungslaufDurch(fake.client, LAUF)
    expect(fake.ersterAuf('absences')?.spalten).toContain('status')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// P1 — Unterschriften aus der App zählen mit
// ═══════════════════════════════════════════════════════════════════════

describe('Vollständige Dokumentation sieht auch App-Unterschriften', () => {
  const REC = { id: 'r1', caregiver_id: CG1, client_signature: null, proof_status: 'UNTERSCHRIEBEN', billing_status: null }

  it('wertet eine Unterschrift aus service_signatures als signiert', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({
      regel: REGEL_DOKU,
      records: [REC],
      signaturen: [{ service_record_id: 'r1' }],
    }))
    const [e] = await fuehreBerechnungslaufDurch(fake.client, LAUF)
    // Am alten Stand: nur client_signature zählte => 0 %, Prämie weg.
    expect(e.messwert).toBe(100)
    expect(e.erfuellt).toBe(true)
  })

  it('bleibt bei 0 %, wenn es weder Spalte noch App-Unterschrift gibt', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({
      regel: REGEL_DOKU, records: [REC], signaturen: [],
    }))
    const [e] = await fuehreBerechnungslaufDurch(fake.client, LAUF)
    expect(e.messwert).toBe(0)
    expect(e.erfuellt).toBe(false)
  })

  it('fragt service_signatures auf die Rolle "client" ein', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({ regel: REGEL_DOKU, records: [REC] }))
    await fuehreBerechnungslaufDurch(fake.client, LAUF)
    expect(hatFilter(fake.ersterAuf('service_signatures'), 'eq', 'signer_role', 'client')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// P1 — Stornierte Leistungsnachweise zählen nicht gegen die Kraft
// ═══════════════════════════════════════════════════════════════════════

describe('Stornierte Leistungsnachweise bleiben außen vor', () => {
  it('zählt einen per proof_status stornierten Nachweis nicht in "gesamt"', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({
      regel: REGEL_DOKU,
      records: [
        { id: 'r1', caregiver_id: CG1, client_signature: 'x', proof_status: 'UNTERSCHRIEBEN', billing_status: null },
        { id: 'r2', caregiver_id: CG1, client_signature: null, proof_status: 'STORNIERT', billing_status: null },
      ],
    }))
    const [e] = await fuehreBerechnungslaufDurch(fake.client, LAUF)
    // Am alten Stand: 1 von 2 signiert => 50 %, Ziel 100 % => Prämie weg.
    expect(e.messwert).toBe(100)
    expect(e.erfuellt).toBe(true)
  })

  it('zählt auch ein Storno über billing_status nicht mit', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({
      regel: REGEL_DOKU,
      records: [
        { id: 'r1', caregiver_id: CG1, client_signature: 'x', proof_status: null, billing_status: null },
        { id: 'r2', caregiver_id: CG1, client_signature: null, proof_status: null, billing_status: 'STORNIERT' },
      ],
    }))
    const [e] = await fuehreBerechnungslaufDurch(fake.client, LAUF)
    expect(e.messwert).toBe(100)
  })

  it('liest proof_status und billing_status mit — sonst filtert ohneStornierte nichts', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({ regel: REGEL_DOKU }))
    await fuehreBerechnungslaufDurch(fake.client, LAUF)
    const spalten = fake.ersterAuf('service_records')?.spalten ?? ''
    expect(spalten).toContain('proof_status')
    expect(spalten).toContain('billing_status')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// P1 — Prüfhinweise werden je Nachweis gezählt, nicht je Fehlerzeile
// ═══════════════════════════════════════════════════════════════════════

describe('Offene Prüfhinweise ergeben keine negative Quote', () => {
  it('zählt drei offene Hinweise an EINEM Nachweis als einen betroffenen Nachweis', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({
      regel: { ...REGEL_PRUEF, schwellenwert: 50 },
      records: [
        { id: 'r1', caregiver_id: CG1, client_signature: 'x', proof_status: null, billing_status: null },
        { id: 'r2', caregiver_id: CG1, client_signature: 'x', proof_status: null, billing_status: null },
      ],
      reviewErrors: [
        { service_record_id: 'r1' }, { service_record_id: 'r1' }, { service_record_id: 'r1' },
      ],
    }))
    const [e] = await fuehreBerechnungslaufDurch(fake.client, LAUF)
    // Am alten Stand: (2 - 3) / 2 = -50 % — eine negative Quote in einer
    // numeric-Spalte und im Bericht.
    expect(e.messwert).toBe(50)
    expect(e.messwert).toBeGreaterThanOrEqual(0)
    expect(e.erfuellt).toBe(true)
  })

  it('bewerteKeineOffenenPruefungen klammert eine unmögliche Eingabe (zweite Linie)', () => {
    const m = bewerteKeineOffenenPruefungen(2, 5, 50)
    expect(m.messwert).toBe(0)
    expect(m.messwert).toBeGreaterThanOrEqual(0)
  })

  it('rechnet zwei betroffene von vier Nachweisen korrekt als 50 %', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({
      regel: { ...REGEL_PRUEF, schwellenwert: 50 },
      records: ['r1', 'r2', 'r3', 'r4'].map(id => ({
        id, caregiver_id: CG1, client_signature: 'x', proof_status: null, billing_status: null,
      })),
      reviewErrors: [{ service_record_id: 'r1' }, { service_record_id: 'r2' }],
    }))
    const [e] = await fuehreBerechnungslaufDurch(fake.client, LAUF)
    expect(e.messwert).toBe(50)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// P0 — Freigabe: Compare-and-Swap und Rückabwicklung
// ═══════════════════════════════════════════════════════════════════════

function freigabeAntworten(opt: {
  casTrifft?: boolean
  standNachher?: Record<string, unknown> | null
  freigabeFehler?: { message: string }
}) {
  return (a: FakeAufruf) => {
    if (a.tabelle === 'bonus_berechnungen') {
      if (a.operation === 'update') {
        // Das CAS-Update trägt den Filter status=berechnet, die
        // Rückabwicklung trägt den Entscheidungswert.
        const istCas = a.filter.some(f => f.methode === 'eq' && f.spalte === 'status' && f.wert === 'berechnet')
        if (istCas) {
          return opt.casTrifft === false
            ? { data: null }
            : { data: { id: 'b1', organization_id: ORG, regel_id: REGEL_ID, caregiver_id: CG1, zeitraum_von: '2026-01-01', zeitraum_bis: '2026-01-31', erfuellt: true, messwert: 0, punkte: 10, status: 'freigegeben', berechnet_am: '2026-02-01T00:00:00Z', details: null } }
        }
        return { data: { id: 'b1' } }
      }
      if (a.operation === 'select') return { data: opt.standNachher === undefined ? { status: 'freigegeben' } : opt.standNachher }
    }
    if (a.tabelle === 'bonus_freigaben') {
      return opt.freigabeFehler ? { error: opt.freigabeFehler } : { data: { id: 'f1' } }
    }
    return {}
  }
}

const FREIGABE = {
  organizationId: ORG, berechnungId: 'b1',
  entscheidung: 'freigegeben' as const, userId: USER,
}

describe('Freigabe beansprucht den Vorgang, bevor sie ihn protokolliert', () => {
  it('setzt den Status per CAS auf status=berechnet und mit Mandanten-Fence', async () => {
    const fake = erstelleFakeSupabase(freigabeAntworten({}))
    await freigebenBerechnung(fake.client, FREIGABE)
    const cas = fake.auf('bonus_berechnungen').find(a => a.operation === 'update')
    expect(hatFilter(cas, 'eq', 'status', 'berechnet')).toBe(true)
    expect(hatOrgFence(cas, ORG)).toBe(true)
  })

  it('schreibt die Entscheidungszeile ERST nach dem beanspruchten Statuswechsel', async () => {
    const fake = erstelleFakeSupabase(freigabeAntworten({}))
    await freigebenBerechnung(fake.client, FREIGABE)
    const cas = fake.auf('bonus_berechnungen').find(a => a.operation === 'update')!
    const nachweis = fake.ersterAuf('bonus_freigaben', 'insert')!
    // Am alten Stand lag der Nachweis VOR dem Statuswechsel — zwei
    // gleichzeitige Entscheidungen legten beide eine Zeile an.
    expect(cas.gesamtNr).toBeLessThan(nachweis.gesamtNr)
  })

  it('legt KEINE Entscheidungszeile an, wenn der Vorgang schon entschieden ist', async () => {
    const fake = erstelleFakeSupabase(freigabeAntworten({
      casTrifft: false, standNachher: { status: 'abgelehnt' },
    }))
    await expect(freigebenBerechnung(fake.client, FREIGABE)).rejects.toThrow(/bereits entschieden/)
    expect(fake.auf('bonus_freigaben')).toHaveLength(0)
  })

  it('nennt den erreichten Status, statt "Interner Serverfehler" zu werden', async () => {
    const fake = erstelleFakeSupabase(freigabeAntworten({
      casTrifft: false, standNachher: { status: 'ausgezahlt' },
    }))
    await expect(freigebenBerechnung(fake.client, FREIGABE)).rejects.toThrow(/ausgezahlt/)
  })

  it('unterscheidet "gibt es nicht" von "schon entschieden"', async () => {
    const fake = erstelleFakeSupabase(freigabeAntworten({
      casTrifft: false, standNachher: null,
    }))
    await expect(freigebenBerechnung(fake.client, FREIGABE)).rejects.toThrow(/nicht gefunden/)
  })

  it('rollt den Status zurück, wenn die Entscheidungszeile nicht geschrieben werden kann', async () => {
    const fake = erstelleFakeSupabase(freigabeAntworten({
      freigabeFehler: { message: 'permission denied' },
    }))
    await expect(freigebenBerechnung(fake.client, FREIGABE)).rejects.toThrow(/zurückgenommen/)
    const updates = fake.auf('bonus_berechnungen').filter(a => a.operation === 'update')
    const rueck = updates.find(a => (a.payload as any)?.status === 'berechnet')
    expect(rueck, 'ohne Rückabwicklung wäre der Vorgang entschieden ohne Nachweis, von wem').toBeDefined()
    expect(hatFilter(rueck, 'eq', 'status', 'freigegeben')).toBe(true)
  })

  it('weist eine unbekannte Entscheidung ab, bevor irgendetwas geschrieben wird', async () => {
    const fake = erstelleFakeSupabase(freigabeAntworten({}))
    await expect(
      freigebenBerechnung(fake.client, { ...FREIGABE, entscheidung: 'ausgezahlt' as any }),
    ).rejects.toThrow(/freigegeben/)
    expect(fake.aufrufe).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// P2 — Zeitraum und Regelwerte werden geprüft
// ═══════════════════════════════════════════════════════════════════════

describe('Zeitraum wird geprüft, bevor er in Filter und Spalte geht', () => {
  it.each([
    ['leer', ''],
    ['deutsches Format', '01.01.2026'],
    ['Klartext', 'Januar'],
    ['unvollständig', '2026-01'],
  ])('weist "%s" als von-Datum ab', async (_name, wert) => {
    const fake = erstelleFakeSupabase(laufAntworten({}))
    await expect(fuehreBerechnungslaufDurch(fake.client, { ...LAUF, von: wert })).rejects.toThrow(/JJJJ-MM-TT/)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('weist einen Kalender-Unfug wie 2026-02-30 ab', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({}))
    await expect(fuehreBerechnungslaufDurch(fake.client, { ...LAUF, von: '2026-02-30' }))
      .rejects.toThrow(/gültiges Datum/)
  })

  it('weist ein Ende VOR dem Beginn ab (live ein CHECK, kam als 500 zurück)', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({}))
    await expect(fuehreBerechnungslaufDurch(fake.client, { ...LAUF, von: '2026-03-01', bis: '2026-01-31' }))
      .rejects.toThrow(/liegt vor/)
  })

  it('lässt gleichen Beginn und gleiches Ende zu (Ein-Tages-Zeitraum)', () => {
    expect(assertZeitraum('2026-01-05', '2026-01-05')).toEqual({ von: '2026-01-05', bis: '2026-01-05' })
  })
})

describe('Regelwerte werden geprüft', () => {
  const basis = { organizationId: ORG, name: 'Regel', kriteriumTyp: 'keine_ausfaelle' as const, userId: USER }

  it.each([
    ['NaN als Schwellenwert', Number.NaN, 10, /Schwellenwert/],
    ['negativer Schwellenwert', -5, 10, /Schwellenwert/],
    ['NaN als Punkte', 0, Number.NaN, /Punkte/],
    ['0 Punkte', 0, 0, /Punkte/],
  ])('weist %s ab, ohne zu schreiben', async (_n, schwellenwert, punkte, muster) => {
    const fake = erstelleFakeSupabase(() => ({ data: null }))
    await expect(createRegel(fake.client, { ...basis, schwellenwert, punkte })).rejects.toThrow(muster as RegExp)
    expect(fake.auf('bonus_regeln')).toHaveLength(0)
  })

  it('weist einen leeren Namen ab', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: null }))
    await expect(createRegel(fake.client, { ...basis, name: '  ', schwellenwert: 0, punkte: 10 }))
      .rejects.toThrow(/Name/)
  })

  it('nennt bei unbekanntem Kriterium die zulässigen Werte', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: null }))
    await expect(
      createRegel(fake.client, { ...basis, kriteriumTyp: 'puenktlichkeit' as any, schwellenwert: 0, punkte: 10 }),
    ).rejects.toThrow(/keine_ausfaelle/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Mandantenschutz
// ═══════════════════════════════════════════════════════════════════════

describe('Mandanten-Fence sitzt auf jedem Zugriff des Laufs', () => {
  it('liest Regel, Kräfte und Bestand nur im eigenen Mandanten', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({}))
    await fuehreBerechnungslaufDurch(fake.client, LAUF)
    for (const tabelle of ['bonus_regeln', 'caregivers', 'bonus_berechnungen']) {
      expect(hatOrgFence(fake.ersterAuf(tabelle), ORG), `${tabelle} ohne Mandanten-Fence`).toBe(true)
    }
  })

  it('findet eine Regel eines fremden Mandanten nicht — und sagt das als Klartext', async () => {
    const fake = erstelleFakeSupabase(a => (a.tabelle === 'bonus_regeln' ? { data: null } : {}))
    await expect(fuehreBerechnungslaufDurch(fake.client, { ...LAUF, organizationId: FREMD_ORG }))
      .rejects.toThrow(/Regel nicht gefunden/)
  })

  it('deaktivierte Regel: kein Lauf', async () => {
    const fake = erstelleFakeSupabase(laufAntworten({ regel: { ...REGEL_AUSFAELLE, aktiv: false } }))
    await expect(fuehreBerechnungslaufDurch(fake.client, LAUF)).rejects.toThrow(/deaktiviert/)
    expect(fake.auf('bonus_berechnungen')).toHaveLength(0)
  })
})

describe('istEntschieden', () => {
  it('kennt genau die drei Endzustände', () => {
    expect([...ENTSCHIEDENE_BONUS_STATUS].sort()).toEqual(['abgelehnt', 'ausgezahlt', 'freigegeben'])
  })
  it('lässt "berechnet" und Unbekanntes durch (kein Endzustand)', () => {
    for (const w of ['berechnet', '', null, undefined, 'entwurf']) {
      expect(istEntschieden(w as any)).toBe(false)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// GEGENPROBE
// ═══════════════════════════════════════════════════════════════════════
// Die alten Rechnungen noch einmal, damit belegt ist, dass die Tests oben
// tatsaechlich unterscheiden und nicht nur die neue Fassung nachzeichnen.

describe('Gegenprobe am alten Stand', () => {
  it('ohne Status-Filter hätte ein abgelehnter Antrag 5 Ausfalltage ergeben', () => {
    const alt = [{ status: 'abgelehnt', start_date: '2026-01-05', end_date: '2026-01-09' }]
    // alte Rechnung: KEIN Filter
    const tage = alt.reduce((s, r) => {
      const start = new Date(Math.max(new Date(r.start_date).getTime(), new Date('2026-01-01').getTime()))
      const end = new Date(Math.min(new Date(r.end_date).getTime(), new Date('2026-01-31').getTime()))
      return s + Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
    }, 0)
    expect(tage).toBe(5)
    expect(tage <= 0).toBe(false) // Grenze 0 => Prämie war weg
  })

  it('Fehlerzeilen statt Nachweise ergaben eine negative Quote', () => {
    const gesamt = 2
    const fehlerZeilen = 3 // drei offene Hinweise an EINEM Nachweis
    const alteQuote = Math.round(((gesamt - fehlerZeilen) / gesamt) * 1000) / 10
    expect(alteQuote).toBe(-50)
    expect(alteQuote).toBeLessThan(0)
    // neue Rechnung: ein betroffener Nachweis
    expect(bewerteKeineOffenenPruefungen(gesamt, 1, 50).messwert).toBe(50)
  })

  it('ohne service_signatures war eine App-Unterschrift 0 % Dokumentation', () => {
    const records = [{ id: 'r1', client_signature: null as string | null }]
    const alteSigniert = records.filter(r => r.client_signature).length
    expect(Math.round((alteSigniert / records.length) * 1000) / 10).toBe(0)
  })

  it('ein NaN-Zeitraum ergab still "nicht erfüllt" statt eines Fehlers', () => {
    const tage = Math.max(1, Math.round((Date.now() - new Date('Januar' as any).getTime()) / 86400000) + 1)
    expect(Number.isNaN(tage)).toBe(true)
    expect(tage <= 0).toBe(false) // NaN <= 0 ist false => Prämie fiel lautlos aus
  })
})
