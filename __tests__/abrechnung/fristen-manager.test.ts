/**
 * Fristen-Manager (lib/abrechnung/fristen-manager.ts)
 *
 * Ueberwacht die Fristen, in denen ein Ruecklaeufer der Kasse beantwortet
 * sein muss. Verstreicht eine Frist unbemerkt, verfaellt die Forderung —
 * das Modul ist damit ein Geldweg, auch wenn es keine Betraege rechnet.
 *
 * Zwei Eigenschaften werden hier besonders geprueft:
 *
 *   1. Die Eskalationsstufe muss die FRISTUEBERSCHREITUNG abbilden, nicht
 *      die Anzahl der Laeufe. `escaliereUeberfaellige` wird von zwei Seiten
 *      aufgerufen — taeglich vom Automatisierungs-Cron (vercel.json, 05:00)
 *      UND von Hand ueber POST /api/billing/dta/fristen. Wer den Knopf
 *      dreimal drueckt, darf eine Frist nicht von Stufe 0 auf "abgelaufen"
 *      durchreichen.
 *   2. Die Rueckmeldung muss stimmen. "12 Fristen eskaliert" ist wertlos,
 *      wenn die Schreibvorgaenge fehlgeschlagen sind und niemand es merkt.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  FRIST_DEFINITIONEN,
  fristFuerTyp,
  erstelleFrist,
  erstelleWiedervorlage,
  pruefeUeberfaelligeFristen,
  escaliereUeberfaellige,
  markiereFristErledigt,
} from '@/lib/abrechnung/fristen-manager'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const ACTOR = '22222222-2222-4222-8222-222222222222'

// Feste Zeit: die Faelligkeitsberechnung rechnet ab "jetzt", und ein Test,
// der ueber Mitternacht laeuft, waere sonst sporadisch rot.
const JETZT = new Date('2026-05-20T09:00:00+02:00')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(JETZT)
})
afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// 1 — Frist-Definitionen
// ---------------------------------------------------------------------------

describe('FRIST_DEFINITIONEN', () => {
  /**
   * Die Tage stehen im Kopfkommentar des Moduls und in der Datenstruktur.
   * Laufen die beiden auseinander, glaubt der naechste Leser dem Kommentar.
   */
  const erwartet: Array<[string, number]> = [
    ['technischer_fehler', 2],
    ['fachlicher_fehler', 5],
    ['abgelehnt', 3],
    ['teilweise_abgelehnt', 5],
    ['korrektur_erforderlich', 3],
    ['wiedervorlage', 7],
    ['eskalation', 1],
  ]

  for (const [typ, tage] of erwartet) {
    it(`"${typ}" hat ${tage} Tage`, () => {
      expect(fristFuerTyp(typ)).toBe(tage)
    })
  }

  it('deckt genau die dokumentierten Typen ab — keine verwaisten Eintraege', () => {
    expect(FRIST_DEFINITIONEN.map(d => d.typ).sort()).toEqual(erwartet.map(e => e[0]).sort())
  })

  it('faellt bei unbekanntem Typ auf 7 Tage zurueck, statt 0 (= sofort ueberfaellig)', () => {
    expect(fristFuerTyp('gibt-es-nicht')).toBe(7)
    expect(fristFuerTyp('')).toBe(7)
  })

  it('jede Definition hat eine Beschreibung und eine positive Frist', () => {
    for (const d of FRIST_DEFINITIONEN) {
      expect(d.tage, d.typ).toBeGreaterThan(0)
      expect(d.beschreibung.length, d.typ).toBeGreaterThan(10)
    }
  })
})

// ---------------------------------------------------------------------------
// 2 — Frist anlegen
// ---------------------------------------------------------------------------

describe('erstelleFrist', () => {
  function fake(antwort: { data?: unknown; error?: { message: string } | null } = { data: { id: 'frist-1' } }) {
    return erstelleFakeSupabase((a: FakeAufruf) =>
      a.tabelle === 'billing_fristen' ? antwort : { data: null })
  }

  it('rechnet die Faelligkeit aus der Frist-Definition — 3 Tage bei "abgelehnt"', async () => {
    const f = fake()
    await erstelleFrist(f.client, { organizationId: ORG, fristTyp: 'abgelehnt', actorId: ACTOR })
    const p = f.ersterAuf('billing_fristen', 'insert')?.payload as Record<string, unknown>
    expect(p.faellig_am).toBe('2026-05-23')
    expect(p.frist_typ).toBe('abgelehnt')
  })

  it('technischer Fehler ist nach 2 Tagen faellig', async () => {
    const f = fake()
    await erstelleFrist(f.client, { organizationId: ORG, fristTyp: 'technischer_fehler', actorId: ACTOR })
    const p = f.ersterAuf('billing_fristen', 'insert')?.payload as Record<string, unknown>
    expect(p.faellig_am).toBe('2026-05-22')
  })

  it('ein ausdruecklich uebergebenes Faelligkeitsdatum schlaegt die Definition', async () => {
    const f = fake()
    await erstelleFrist(f.client, {
      organizationId: ORG, fristTyp: 'abgelehnt', faelligAm: '2026-06-30', actorId: ACTOR,
    })
    const p = f.ersterAuf('billing_fristen', 'insert')?.payload as Record<string, unknown>
    expect(p.faellig_am).toBe('2026-06-30')
  })

  it('legt die Frist offen und auf Stufe 0 an, mit Mandant und Verknuepfungen', async () => {
    const f = fake()
    await erstelleFrist(f.client, {
      organizationId: ORG, fristTyp: 'fachlicher_fehler',
      aufgabeId: 'auf-1', ruecklaeuferId: 'rl-1', notiz: 'Position 4', actorId: ACTOR,
    })
    const p = f.ersterAuf('billing_fristen', 'insert')?.payload as Record<string, unknown>
    expect(p).toMatchObject({
      organization_id: ORG,
      aufgabe_id: 'auf-1',
      ruecklaeufer_id: 'rl-1',
      eskalationsstufe: 0,
      status: 'offen',
      notiz: 'Position 4',
    })
  })

  it('liefert die neue Frist-ID zurueck', async () => {
    const f = fake({ data: { id: 'frist-42' } })
    await expect(erstelleFrist(f.client, { organizationId: ORG, fristTyp: 'abgelehnt', actorId: ACTOR }))
      .resolves.toBe('frist-42')
  })

  /**
   * Bewusst festgehaltenes Verhalten: bei einem Schreibfehler liefert die
   * Funktion null statt zu werfen. Der einzige Aufrufer
   * (app/api/billing/dta/ruecklaeufer/upload) haengt ein .catch() an und
   * behandelt die Frist ausdruecklich als nicht blockierend — der Import des
   * Ruecklaeufers soll nicht scheitern, nur weil die Ueberwachung nicht
   * angelegt werden konnte. Wer das aendert, muss dort mitziehen.
   */
  it('liefert bei einem Schreibfehler null und wirft nicht', async () => {
    const f = fake({ data: null, error: { message: 'constraint violation' } })
    await expect(erstelleFrist(f.client, { organizationId: ORG, fristTyp: 'abgelehnt', actorId: ACTOR }))
      .resolves.toBeNull()
    // Ohne Frist-ID darf auch kein Audit-Eintrag entstehen.
    expect(f.auf('billing_audit_trail')).toHaveLength(0)
  })

  it('schreibt einen Audit-Eintrag mit Mandant und Faelligkeit', async () => {
    const f = fake()
    await erstelleFrist(f.client, { organizationId: ORG, fristTyp: 'abgelehnt', actorId: ACTOR })
    const audit = f.ersterAuf('billing_audit_trail', 'insert')?.payload as Record<string, unknown>
    expect(audit.organization_id).toBe(ORG)
    expect(audit.action).toBe('frist_erstellt')
    expect((audit.new_state as Record<string, unknown>).faellig_am).toBe('2026-05-23')
  })
})

describe('erstelleWiedervorlage', () => {
  it('nimmt die uebergebene Tageszahl, nicht die 7-Tage-Standardfrist', async () => {
    const f = erstelleFakeSupabase(() => ({ data: { id: 'frist-1' } }))
    await erstelleWiedervorlage(f.client, { organizationId: ORG, tage: 21, actorId: ACTOR })
    const p = f.ersterAuf('billing_fristen', 'insert')?.payload as Record<string, unknown>
    expect(p.faellig_am).toBe('2026-06-10')
    expect(p.frist_typ).toBe('wiedervorlage')
  })

  it('eine Wiedervorlage auf 0 Tage ist heute faellig, nicht in 7 Tagen', async () => {
    const f = erstelleFakeSupabase(() => ({ data: { id: 'frist-1' } }))
    await erstelleWiedervorlage(f.client, { organizationId: ORG, tage: 0, actorId: ACTOR })
    const p = f.ersterAuf('billing_fristen', 'insert')?.payload as Record<string, unknown>
    expect(p.faellig_am).toBe('2026-05-20')
  })
})

// ---------------------------------------------------------------------------
// 3 — Uebersicht
// ---------------------------------------------------------------------------

describe('pruefeUeberfaelligeFristen', () => {
  const zeilen = [
    { id: 'f-1', aufgabe_id: 'a-1', ruecklaeufer_id: null, frist_typ: 'abgelehnt', faellig_am: '2026-05-18', eskaliert_am: null, eskalationsstufe: 0, status: 'offen', notiz: null, created_at: '2026-05-15T08:00:00Z' },
    { id: 'f-2', aufgabe_id: null, ruecklaeufer_id: 'rl-2', frist_typ: 'fachlicher_fehler', faellig_am: '2026-05-20', eskaliert_am: null, eskalationsstufe: 0, status: 'offen', notiz: null, created_at: '2026-05-15T08:00:00Z' },
    { id: 'f-3', aufgabe_id: null, ruecklaeufer_id: 'rl-3', frist_typ: 'abgelehnt', faellig_am: '2026-05-19', eskaliert_am: '2026-05-19T05:00:00Z', eskalationsstufe: 1, status: 'eskaliert', notiz: null, created_at: '2026-05-14T08:00:00Z' },
    { id: 'f-4', aufgabe_id: null, ruecklaeufer_id: 'rl-4', frist_typ: 'wiedervorlage', faellig_am: '2026-06-01', eskaliert_am: null, eskalationsstufe: 0, status: 'offen', notiz: null, created_at: '2026-05-15T08:00:00Z' },
  ]

  function fake() {
    return erstelleFakeSupabase((a: FakeAufruf) =>
      a.tabelle === 'billing_fristen' ? { data: zeilen } : { data: null })
  }

  it('zaehlt ueberfaellig streng nach gestern — heute faellig ist NICHT ueberfaellig', async () => {
    const u = await pruefeUeberfaelligeFristen(fake().client, ORG)
    // f-1 (18.05.) und f-3 (19.05.) sind vorbei; f-2 ist heute faellig, f-4 kuenftig.
    expect(u.ueberfaellig).toBe(2)
  })

  it('trennt offen und eskaliert', async () => {
    const u = await pruefeUeberfaelligeFristen(fake().client, ORG)
    expect(u.gesamt).toBe(4)
    expect(u.offen).toBe(3)
    expect(u.eskaliert).toBe(1)
  })

  it('holt nur offene und eskalierte Fristen des Mandanten, nach Faelligkeit sortiert', async () => {
    const f = fake()
    await pruefeUeberfaelligeFristen(f.client, ORG)
    const a = f.ersterAuf('billing_fristen')
    expect(hatOrgFence(a, ORG)).toBe(true)
    expect(hatFilter(a, 'in', 'status', ['offen', 'eskaliert'])).toBe(true)
    expect(hatFilter(a, 'order', 'faellig_am')).toBe(true)
  })

  it('bildet die Spalten vollstaendig auf das Ergebnis ab', async () => {
    const u = await pruefeUeberfaelligeFristen(fake().client, ORG)
    expect(u.fristen[0]).toMatchObject({
      id: 'f-1', aufgabeId: 'a-1', ruecklaeuferId: null,
      fristTyp: 'abgelehnt', faelligAm: '2026-05-18', eskalationsstufe: 0, status: 'offen',
    })
  })

  it('liefert eine leere Uebersicht statt zu werfen, wenn nichts vorliegt', async () => {
    const f = erstelleFakeSupabase(() => ({ data: null }))
    const u = await pruefeUeberfaelligeFristen(f.client, ORG)
    expect(u).toMatchObject({ gesamt: 0, offen: 0, eskaliert: 0, ueberfaellig: 0, fristen: [] })
  })
})

// ---------------------------------------------------------------------------
// 4 — Eskalation
// ---------------------------------------------------------------------------

describe('escaliereUeberfaellige', () => {
  function frist(ueberschreibung: Record<string, unknown> = {}) {
    return {
      id: 'f-1', aufgabe_id: null, ruecklaeufer_id: 'rl-1',
      frist_typ: 'abgelehnt', eskalationsstufe: 0,
      faellig_am: '2026-05-18', eskaliert_am: null,
      ...ueberschreibung,
    }
  }

  /** Fristen kommen aus dem select, Updates werden protokolliert. */
  function fake(fristen: unknown[], optionen: { aufgabe?: unknown; updateFehler?: boolean } = {}) {
    return erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'billing_fristen' && a.operation === 'select') return { data: fristen }
      if (a.tabelle === 'billing_fristen' && a.operation === 'update') {
        return optionen.updateFehler ? { data: null, error: { message: 'row level security' } } : { data: null }
      }
      if (a.tabelle === 'ops_aufgaben' && a.operation === 'select') return { data: optionen.aufgabe ?? null }
      return { data: null }
    })
  }

  it('holt nur ueberfaellige, noch nicht erledigte Fristen des Mandanten', async () => {
    const f = fake([])
    await escaliereUeberfaellige(f.client, ORG, ACTOR)
    const a = f.ersterAuf('billing_fristen', 'select')
    expect(hatOrgFence(a, ORG)).toBe(true)
    expect(hatFilter(a, 'in', 'status', ['offen', 'eskaliert'])).toBe(true)
    expect(hatFilter(a, 'lt', 'faellig_am', '2026-05-20')).toBe(true)
  })

  it('hebt Stufe 0 auf 1 und setzt den Status auf eskaliert', async () => {
    const f = fake([frist({ eskalationsstufe: 0 })])
    const r = await escaliereUeberfaellige(f.client, ORG, ACTOR)
    expect(r).toMatchObject({ eskaliert: 1, abgelaufen: 0, fehler: [] })
    const p = f.auf('billing_fristen').find(a => a.operation === 'update')?.payload as Record<string, unknown>
    expect(p.eskalationsstufe).toBe(1)
    expect(p.status).toBe('eskaliert')
  })

  it('hebt Stufe 1 auf 2', async () => {
    const f = fake([frist({ eskalationsstufe: 1, eskaliert_am: '2026-05-19T05:00:00Z' })])
    const r = await escaliereUeberfaellige(f.client, ORG, ACTOR)
    expect(r.eskaliert).toBe(1)
    const p = f.auf('billing_fristen').find(a => a.operation === 'update')?.payload as Record<string, unknown>
    expect(p.eskalationsstufe).toBe(2)
  })

  it('markiert ab Stufe 2 als abgelaufen statt weiter zu eskalieren', async () => {
    const f = fake([frist({ eskalationsstufe: 2, eskaliert_am: '2026-05-19T05:00:00Z' })])
    const r = await escaliereUeberfaellige(f.client, ORG, ACTOR)
    expect(r).toMatchObject({ eskaliert: 0, abgelaufen: 1 })
    const p = f.auf('billing_fristen').find(a => a.operation === 'update')?.payload as Record<string, unknown>
    expect(p.status).toBe('abgelaufen')
  })

  it('setzt den Mandanten-Fence auf jedes Update', async () => {
    const f = fake([frist(), frist({ id: 'f-2', eskalationsstufe: 2 })])
    await escaliereUeberfaellige(f.client, ORG, ACTOR)
    for (const a of f.auf('billing_fristen').filter(x => x.operation === 'update')) {
      expect(hatOrgFence(a, ORG)).toBe(true)
    }
  })

  it('zieht die Prioritaet der verknuepften Aufgabe eine Stufe hoch', async () => {
    const f = fake([frist({ aufgabe_id: 'auf-1' })], { aufgabe: { id: 'auf-1', prioritaet: 'mittel' } })
    await escaliereUeberfaellige(f.client, ORG, ACTOR)
    const p = f.auf('ops_aufgaben').find(a => a.operation === 'update')?.payload as Record<string, unknown>
    expect(p.prioritaet).toBe('hoch')
  })

  it('laesst eine bereits kritische Aufgabe unangetastet — kein Update ohne Aenderung', async () => {
    const f = fake([frist({ aufgabe_id: 'auf-1' })], { aufgabe: { id: 'auf-1', prioritaet: 'kritisch' } })
    await escaliereUeberfaellige(f.client, ORG, ACTOR)
    expect(f.auf('ops_aufgaben').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('hebt eine unbekannte Prioritaet auf kritisch, statt sie stehen zu lassen', async () => {
    const f = fake([frist({ aufgabe_id: 'auf-1' })], { aufgabe: { id: 'auf-1', prioritaet: 'unklar' } })
    await escaliereUeberfaellige(f.client, ORG, ACTOR)
    const p = f.auf('ops_aufgaben').find(a => a.operation === 'update')?.payload as Record<string, unknown>
    expect(p.prioritaet).toBe('kritisch')
  })

  it('ohne verknuepfte Aufgabe wird ops_aufgaben nicht angefasst', async () => {
    const f = fake([frist({ aufgabe_id: null })])
    await escaliereUeberfaellige(f.client, ORG, ACTOR)
    expect(f.auf('ops_aufgaben')).toHaveLength(0)
  })

  it('verarbeitet mehrere Fristen in einem Lauf', async () => {
    const f = fake([
      frist({ id: 'f-1', eskalationsstufe: 0 }),
      frist({ id: 'f-2', eskalationsstufe: 1 }),
      frist({ id: 'f-3', eskalationsstufe: 2 }),
    ])
    const r = await escaliereUeberfaellige(f.client, ORG, ACTOR)
    expect(r).toMatchObject({ eskaliert: 2, abgelaufen: 1 })
  })

  /**
   * BEFUND — Rueckmeldung ohne Deckung.
   *
   * Die Updates wurden nie auf `error` geprueft. Scheiterte das Schreiben
   * (RLS, Constraint, Netzwerk), zaehlte die Schleife die Frist trotzdem
   * als eskaliert und `fehler` blieb leer. Die Oberflaeche meldete dann
   * "3 Fristen eskaliert, 0 als abgelaufen markiert", waehrend in der
   * Datenbank nichts stand — und niemand sah nach, weil die Rueckmeldung
   * Erfolg behauptete. Genau die Klasse Fehler, die dieses Repo bei den
   * Resend-Aufrufern schon einmal hatte.
   */
  it('zaehlt eine Frist NICHT als eskaliert, wenn das Update fehlschlaegt', async () => {
    const f = fake([frist()], { updateFehler: true })
    const r = await escaliereUeberfaellige(f.client, ORG, ACTOR)
    expect(r.eskaliert).toBe(0)
    expect(r.fehler).toHaveLength(1)
    expect(r.fehler[0]).toContain('f-1')
  })

  it('zaehlt eine Frist NICHT als abgelaufen, wenn das Update fehlschlaegt', async () => {
    const f = fake([frist({ eskalationsstufe: 2 })], { updateFehler: true })
    const r = await escaliereUeberfaellige(f.client, ORG, ACTOR)
    expect(r.abgelaufen).toBe(0)
    expect(r.fehler).toHaveLength(1)
  })

  it('ein Fehler bei einer Frist stoppt die uebrigen nicht', async () => {
    let ersterUpdate = true
    const f = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'billing_fristen' && a.operation === 'select') {
        return { data: [frist({ id: 'f-1' }), frist({ id: 'f-2' })] }
      }
      if (a.tabelle === 'billing_fristen' && a.operation === 'update') {
        if (ersterUpdate) { ersterUpdate = false; return { data: null, error: { message: 'row level security' } } }
        return { data: null }
      }
      return { data: null }
    })
    const r = await escaliereUeberfaellige(f.client, ORG, ACTOR)
    expect(r.eskaliert).toBe(1)
    expect(r.fehler).toHaveLength(1)
  })

  /**
   * BEFUND — Eskalation zaehlte Laeufe statt Fristueberschreitung.
   *
   * Der Modulkopf beschreibt Stufe 1 bei +50 % und Stufe 2 bei +100 %
   * Fristueberschreitung. Implementiert war "jeder Lauf eine Stufe weiter",
   * ohne jeden Blick auf `eskaliert_am`. Weil `escaliereUeberfaellige`
   * ausser vom Tages-Cron auch von POST /api/billing/dta/fristen aufgerufen
   * wird, brachte dreimaliges Druecken des Knopfes jede ueberfaellige Frist
   * binnen Sekunden von Stufe 0 auf "abgelaufen" — und "abgelaufen" faellt
   * aus der Ueberwachung heraus, weil pruefeUeberfaelligeFristen nur offen
   * und eskaliert liest. Die Frist verschwand also aus der Liste, obwohl
   * sie unbearbeitet war.
   */
  it('eskaliert eine Frist nicht zweimal am selben Tag', async () => {
    const heuteEskaliert = frist({ eskalationsstufe: 1, eskaliert_am: '2026-05-20T05:00:00Z' })
    const f = fake([heuteEskaliert])
    const r = await escaliereUeberfaellige(f.client, ORG, ACTOR)
    expect(r.eskaliert).toBe(0)
    expect(f.auf('billing_fristen').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('eskaliert am Folgetag wieder', async () => {
    const gesternEskaliert = frist({ eskalationsstufe: 1, eskaliert_am: '2026-05-19T05:00:00Z' })
    const f = fake([gesternEskaliert])
    const r = await escaliereUeberfaellige(f.client, ORG, ACTOR)
    expect(r.eskaliert).toBe(1)
  })

  it('laesst eine noch nie eskalierte Frist sofort durch', async () => {
    const f = fake([frist({ eskalationsstufe: 0, eskaliert_am: null })])
    const r = await escaliereUeberfaellige(f.client, ORG, ACTOR)
    expect(r.eskaliert).toBe(1)
  })

  it('markiert eine heute schon eskalierte Frist auch nicht vorzeitig als abgelaufen', async () => {
    const f = fake([frist({ eskalationsstufe: 2, eskaliert_am: '2026-05-20T05:00:00Z' })])
    const r = await escaliereUeberfaellige(f.client, ORG, ACTOR)
    expect(r.abgelaufen).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 5 — Erledigen
// ---------------------------------------------------------------------------

describe('markiereFristErledigt', () => {
  it('setzt den Status auf erledigt — mit Mandanten-Fence', async () => {
    const f = erstelleFakeSupabase(() => ({ data: null }))
    await markiereFristErledigt(f.client, 'f-1', ORG, ACTOR)
    const a = f.auf('billing_fristen').find(x => x.operation === 'update')
    expect((a?.payload as Record<string, unknown>).status).toBe('erledigt')
    expect(hatOrgFence(a, ORG)).toBe(true)
    expect(hatFilter(a, 'eq', 'id', 'f-1')).toBe(true)
  })

  it('schreibt einen Audit-Eintrag', async () => {
    const f = erstelleFakeSupabase(() => ({ data: null }))
    await markiereFristErledigt(f.client, 'f-1', ORG, ACTOR)
    const audit = f.ersterAuf('billing_audit_trail', 'insert')?.payload as Record<string, unknown>
    expect(audit.action).toBe('frist_erledigt')
    expect(audit.entity_id).toBe('f-1')
  })
})
