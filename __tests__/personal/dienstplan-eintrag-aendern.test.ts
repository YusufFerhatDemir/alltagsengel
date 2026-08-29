/**
 * `PATCH`/`DELETE /api/personal/dienstplan/eintraege/[id]` — die Handler,
 * die es gab und die nie gelaufen sind.
 *
 * BEFUND (29.08.2026): beide Handler sind seit langem vollständig — samt
 * Mandantenprüfung auf Klient und Schicht, Einsatzfreigabe mit
 * `forceOverride`, Vorher-Schnappschuss und Audit-Eintrag. Aufgerufen hat
 * sie KEINE Stelle der Oberfläche: der Wochenplan konnte Dienste anlegen
 * und sonst nichts. Ein Dienstplan, der sich nicht ändern lässt, ist
 * keiner — der häufigste Vorgang der Woche ist die Umplanung.
 *
 * Geprüft wurde bisher nur, ob im Quelltext `requirePersonalAdmin` steht
 * (`track9-personalverwaltung-audit.test.ts`). Diese Suite RUFT die
 * Handler auf, über einen protokollierenden Supabase-Doppelgänger, und
 * sieht auf die Abfragen, die dabei wirklich gestellt werden.
 *
 * `updateEintrag`/`deleteEintrag` und `writeAuditLog` laufen dabei ECHT.
 * Nur die Einsatzfreigabe ist ersetzt — sie hat eigene Tests und würde
 * hier ein halbes Personalstammdatenmodell nachbauen wollen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  erstelleFakeSupabase, hatFilter, hatOrgFence,
  type FakeAufruf, type FakeSupabase,
} from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const USER = '44444444-4444-4444-8444-444444444444'
const EINTRAG = '55555555-5555-4555-8555-555555555555'
const KRAFT = '66666666-6666-4666-8666-666666666666'
const KLIENT = '77777777-7777-4777-8777-777777777777'

let fake: FakeSupabase
let darfSchreiben = true
/** Der Bestand, den `updateEintrag`/`deleteEintrag` vorfinden. */
let bestand: Record<string, unknown> | null
/** Antwort der Einsatzfreigabe. */
let freigegeben = true
/** Gehören Klient und Schicht zum Mandanten? */
let fremderKlient = false
/** Fehlermeldung, die die Datenbank auf das Schreiben zurückgibt. */
let schreibFehler: string | null = null

vi.mock('@/lib/personal/api-auth', () => ({
  requirePersonalAdmin: vi.fn(async () => (
    darfSchreiben
      ? { ok: true, ctx: { userId: USER, organizationId: ORG, role: 'pdl', name: 'Test' } }
      : { ok: false, response: new Response(JSON.stringify({ error: 'fehlt' }), { status: 403 }) }
  )),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake.client),
}))

vi.mock('@/lib/personal/einsatzfreigabe', () => ({
  pruefeEinsatzfreigabe: vi.fn(async () => ({
    freigegeben,
    caregiverName: 'Frau M.',
    probleme: freigegeben ? [] : ['Führungszeugnis abgelaufen'],
    abgelaufeneQualifikationen: [],
  })),
}))

const { PATCH, DELETE } = await import('@/app/api/personal/dienstplan/eintraege/[id]/route')

const ctx = { params: Promise.resolve({ id: EINTRAG }) }

const patchAnfrage = (body: unknown) =>
  new Request(`http://localhost/api/personal/dienstplan/eintraege/${EINTRAG}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const deleteAnfrage = () =>
  new Request(`http://localhost/api/personal/dienstplan/eintraege/${EINTRAG}`, { method: 'DELETE' })

/** Das eigentliche Schreiben auf `dienstplan_eintraege`. */
function schreibvorgang(op: 'update' | 'delete'): FakeAufruf | undefined {
  return fake.auf('dienstplan_eintraege').find(a => a.operation === op)
}

beforeEach(() => {
  darfSchreiben = true
  freigegeben = true
  fremderKlient = false
  schreibFehler = null
  bestand = {
    id: EINTRAG, organization_id: ORG, status: 'geplant',
    start_zeit: '08:00:00', end_zeit: '16:00:00', pause_minuten: 30,
    datum: '2026-09-07', caregiver_id: KRAFT, client_id: KLIENT,
    typ: 'regulaer', notizen: null,
  }
  fake = erstelleFakeSupabase((a) => {
    if (a.tabelle === 'clients' || a.tabelle === 'dienstplan_schichten') {
      return { data: fremderKlient ? null : { id: a.tabelle === 'clients' ? KLIENT : 'sch-1' } }
    }
    if (a.tabelle === 'dienstplan_eintraege' && a.operation === 'select') return { data: bestand }
    if (a.tabelle === 'dienstplan_eintraege' && (a.operation === 'update' || a.operation === 'delete')) {
      if (schreibFehler) return { data: null, error: { message: schreibFehler } }
      return { data: { ...bestand, ...(a.payload as object) } }
    }
    return { data: null, error: null }
  })
})

describe('Berechtigung', () => {
  it('PATCH weist ohne personal.schreiben mit 403 ab und fasst nichts an', async () => {
    darfSchreiben = false
    const res = await PATCH(patchAnfrage({ notizen: 'x' }) as never, ctx as never)
    expect(res.status).toBe(403)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('DELETE weist ohne personal.schreiben mit 403 ab und löscht nichts', async () => {
    darfSchreiben = false
    const res = await DELETE(deleteAnfrage() as never, ctx as never)
    expect(res.status).toBe(403)
    expect(fake.aufrufe).toHaveLength(0)
  })
})

describe('Mandantengrenze', () => {
  it('lehnt einen Klienten eines fremden Mandanten mit 403 ab', async () => {
    fremderKlient = true
    const res = await PATCH(patchAnfrage({ clientId: KLIENT }) as never, ctx as never)
    expect(res.status).toBe(403)
    expect(schreibvorgang('update')).toBeUndefined()
  })

  it('lehnt eine Schicht eines fremden Mandanten mit 403 ab', async () => {
    fremderKlient = true
    const res = await PATCH(patchAnfrage({ schichtId: 'sch-1' }) as never, ctx as never)
    expect(res.status).toBe(403)
    expect(schreibvorgang('update')).toBeUndefined()
  })

  it('prüft den Klienten mit Org-Fence — nicht bloß auf Existenz', async () => {
    await PATCH(patchAnfrage({ clientId: KLIENT }) as never, ctx as never)
    expect(hatOrgFence(fake.ersterAuf('clients'), ORG)).toBe(true)
  })

  it('setzt den Org-Fence auch auf dem Schreibvorgang selbst', async () => {
    await PATCH(patchAnfrage({ notizen: 'Nachtrag' }) as never, ctx as never)
    expect(hatOrgFence(schreibvorgang('update'), ORG)).toBe(true)
  })
})

describe('Einsatzfreigabe', () => {
  it('weist eine Umbesetzung auf eine nicht freigegebene Kraft mit 422 ab', async () => {
    freigegeben = false
    const res = await PATCH(patchAnfrage({ caregiverId: KRAFT }) as never, ctx as never)
    expect(res.status).toBe(422)
    expect(schreibvorgang('update')).toBeUndefined()
  })

  it('nennt dabei den Grund, nicht nur die Ablehnung', async () => {
    freigegeben = false
    const res = await PATCH(patchAnfrage({ caregiverId: KRAFT }) as never, ctx as never)
    const json = await res.json() as { freigabe_probleme: string[] }
    expect(json.freigabe_probleme).toContain('Führungszeugnis abgelaufen')
  })

  it('lässt die Umbesetzung mit forceOverride zu', async () => {
    freigegeben = false
    const res = await PATCH(patchAnfrage({ caregiverId: KRAFT, forceOverride: true }) as never, ctx as never)
    expect(res.status).toBe(200)
    expect(schreibvorgang('update')).toBeDefined()
  })

  it('hält das Übergehen im Audit fest — mit Grund', async () => {
    freigegeben = false
    await PATCH(patchAnfrage({ caregiverId: KRAFT, forceOverride: true }) as never, ctx as never)
    const eintrag = fake.ersterAuf('personal_audit_log', 'insert')?.payload as Record<string, unknown>
    expect(String(eintrag?.grund)).toContain('forceOverride')
  })

  it('fragt die Freigabe gar nicht ab, wenn niemand umbesetzt wird', async () => {
    // Eine reine Zeitverschiebung darf nicht an der Freigabe einer Kraft
    // scheitern, die gar nicht neu zugewiesen wird.
    freigegeben = false
    const res = await PATCH(patchAnfrage({ endZeit: '17:00' }) as never, ctx as never)
    expect(res.status).toBe(200)
  })
})

describe('Änderungsgrund der freigegebenen Woche', () => {
  it('schreibt den Grund mit — der Riegel aus 20260829005700 liest genau diese Spalte', async () => {
    await PATCH(patchAnfrage({ endZeit: '17:00', aenderungGrund: '  Krankmeldung  ' }) as never, ctx as never)
    expect((schreibvorgang('update')?.payload as Record<string, unknown>).aenderung_grund).toBe('Krankmeldung')
  })

  it('setzt ihn ausdrücklich auf null, wenn keiner angegeben ist', async () => {
    // Nicht weglassen: ein stehen gebliebener Grund aus einer früheren
    // Änderung würde sonst die nächste mit abdecken.
    await PATCH(patchAnfrage({ endZeit: '17:00' }) as never, ctx as never)
    expect((schreibvorgang('update')?.payload as Record<string, unknown>).aenderung_grund).toBeNull()
  })

  it('übersetzt die Trigger-Meldung in Klartext statt sie roh durchzureichen', async () => {
    schreibFehler = 'Die Woche ab 2026-09-07 ist freigegeben — jede Aenderung braucht einen Grund.'
    const res = await PATCH(patchAnfrage({ endZeit: '17:00' }) as never, ctx as never)
    expect(res.status).toBeGreaterThanOrEqual(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/freigegeben/i)
  })
})

describe('Endzustände', () => {
  it('weist die Änderung eines abgeschlossenen Dienstes ab', async () => {
    bestand = { ...bestand!, status: 'abgeschlossen' }
    const res = await PATCH(patchAnfrage({ endZeit: '17:00' }) as never, ctx as never)
    expect(res.status).toBe(409)
    expect(schreibvorgang('update')).toBeUndefined()
  })

  it('lässt eine Notiz an einem abgeschlossenen Dienst zu', async () => {
    bestand = { ...bestand!, status: 'abgeschlossen' }
    const res = await PATCH(patchAnfrage({ notizen: 'Nachtrag zur Dokumentation' }) as never, ctx as never)
    expect(res.status).toBe(200)
  })

  it('weist das Löschen eines ausgefallenen Dienstes ab — er gehört zur Dokumentation', async () => {
    bestand = { ...bestand!, status: 'ausgefallen' }
    const res = await DELETE(deleteAnfrage() as never, ctx as never)
    expect(res.status).toBe(409)
    expect(schreibvorgang('delete')).toBeUndefined()
  })
})

describe('Löschen', () => {
  it('löscht mit Org-Fence', async () => {
    const res = await DELETE(deleteAnfrage() as never, ctx as never)
    expect(res.status).toBe(200)
    expect(hatFilter(schreibvorgang('delete'), 'eq', 'id', EINTRAG)).toBe(true)
    expect(hatOrgFence(schreibvorgang('delete'), ORG)).toBe(true)
  })

  it('hält den Vorzustand im Audit fest — nach dem Löschen gibt es ihn nirgends mehr', async () => {
    await DELETE(deleteAnfrage() as never, ctx as never)
    const eintrag = fake.ersterAuf('personal_audit_log', 'insert')?.payload as Record<string, unknown>
    expect(eintrag?.aktion).toBe('geloescht')
    expect(eintrag?.vorher).toMatchObject({ datum: '2026-09-07', caregiver_id: KRAFT })
  })

  it('antwortet mit 404 auf einen unbekannten Eintrag', async () => {
    bestand = null
    const res = await DELETE(deleteAnfrage() as never, ctx as never)
    expect(res.status).toBe(404)
  })

  it('übersetzt die Löschsperre der freigegebenen Woche in Klartext', async () => {
    schreibFehler = 'Ein Dienst in einer freigegebenen Woche kann nicht geloescht werden.'
    const res = await DELETE(deleteAnfrage() as never, ctx as never)
    expect(res.status).toBeGreaterThanOrEqual(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/freigegeben/i)
  })
})

describe('Audit bei jeder Änderung', () => {
  it('hält Vorher und Nachher fest, auch ohne forceOverride', async () => {
    await PATCH(patchAnfrage({ endZeit: '17:00' }) as never, ctx as never)
    const eintrag = fake.ersterAuf('personal_audit_log', 'insert')?.payload as Record<string, unknown>
    expect(eintrag?.aktion).toBe('bearbeitet')
    expect(eintrag?.vorher).toMatchObject({ end_zeit: '16:00:00' })
    expect(eintrag?.organization_id).toBe(ORG)
  })
})
