/**
 * Die beiden Schreibwege für Wiedervorlagen und ATS-Felder.
 *
 * @see app/admin/posteingang/actions.ts
 * @see app/admin/applications/actions.ts
 *
 * ── WAS HIER GEPRÜFT WIRD ─────────────────────────────────────────────
 * Nicht, dass ein Update „ankommt" — das prüft der Fake ohnehin. Sondern
 * die drei Stellen, an denen ein Schreibweg still danebengehen kann:
 *
 *   1. Der **Mandanten- und Artfilter**. Eine Kundenanfrage darf nicht über
 *      den Bewerbungsweg beschreibbar sein und umgekehrt. Fehlt ein Filter,
 *      merkt das niemand — das Update läuft, nur an der falschen Zeile.
 *   2. Die **leere Trefferliste**. PostgREST liefert bei einem Update ohne
 *      Treffer kein Fehlerobjekt, sondern eine leere Liste. Wer nur
 *      `error` prüft, meldet „gespeichert" und hat nichts geschrieben.
 *   3. Das **Audit ohne Feldwerte**. Freitextnotizen über Bewerberinnen
 *      gehören nicht ins Protokoll.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeSupabase, type FakeAufruf,
} from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const NUTZER = '22222222-2222-4222-8222-222222222222'
const LEAD = '33333333-3333-4333-8333-333333333333'

let fake: FakeSupabase
const auditEintraege: any[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => fake.client,
}))
vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: async () => ORG,
}))
vi.mock('@/lib/audit-log', () => ({
  logAuditEventOrWarn: async (e: unknown) => { auditEintraege.push(e) },
}))

/** Antworten für den Admin-Check plus eine frei wählbare Update-Antwort. */
function baueFake(updateAntwort: { data?: unknown; error?: { message: string } | null }) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === 'profiles') {
      return { data: { role: 'admin', first_name: 'V', last_name: null }, error: null }
    }
    if (a.tabelle === 'lead_inquiries' && a.operation === 'select') {
      return { data: { status: 'contacted', bewerbung_daten: { ats: { prioritaet: 3 } } }, error: null }
    }
    if (a.tabelle === 'lead_inquiries' && a.operation === 'update') {
      return { data: updateAntwort.data ?? null, error: updateAntwort.error ?? null }
    }
    return undefined
  })
}

beforeEach(() => {
  auditEintraege.length = 0
  fake = baueFake({ data: [{ id: LEAD }] })
  ;(fake.client as any).auth = {
    getUser: async () => ({ data: { user: { id: NUTZER } }, error: null }),
  }
})

function updateAufruf(): FakeAufruf | undefined {
  return fake.aufrufe.find(a => a.tabelle === 'lead_inquiries' && a.operation === 'update')
}

// ═══════════════════════════════════════════════════════════════════════
describe('setLeadWiedervorlage — Kundenanfragen', () => {
  async function laden() {
    return (await import('@/app/admin/posteingang/actions')).setLeadWiedervorlage
  }

  const morgen = () => {
    const d = new Date(Date.now() + 2 * 86_400_000)
    return d.toISOString().slice(0, 10)
  }

  it('schreibt mit Mandanten-, Art- und Statusfilter', async () => {
    const setzen = await laden()
    const r = await setzen(LEAD, morgen())
    expect(r).toEqual({ ok: true })

    const u = updateAufruf()
    expect(u, 'kein Update abgesetzt').toBeDefined()
    expect(hatOrgFence(u!, ORG), 'Mandantenfilter fehlt').toBe(true)
    expect(hatFilter(u!, 'eq', 'art', 'anfrage'), 'Artfilter fehlt').toBe(true)
    // Ohne diesen Ausschluss waeren die 34 Altbestaende mit
    // source='engel-bewerbung' ueber BEIDE Schreibwege erreichbar.
    expect(hatFilter(u!, 'neq', 'source', 'engel-bewerbung'),
      'Bewerbungen nicht ausgeschlossen').toBe(true)
    expect(u!.filter.some(f => f.spalte === 'status'), 'Statusfilter fehlt').toBe(true)
  })

  it('weist ein Datum in der Vergangenheit ab, ohne zu schreiben', async () => {
    const setzen = await laden()
    const r = await setzen(LEAD, '2020-01-01')
    expect(r).toEqual({ ok: false, error: 'Die Wiedervorlage liegt in der Vergangenheit.' })
    expect(updateAufruf()).toBeUndefined()
  })

  it.each([['01.10.2026'], ['morgen'], ['2026-13-45'], ['']])(
    'weist das ungueltige Datum %s ab', async (datum) => {
      const setzen = await laden()
      const r = await setzen(LEAD, datum as string)
      expect(r.ok).toBe(false)
      expect(updateAufruf()).toBeUndefined()
    })

  it('null loescht die Wiedervorlage — das ist erlaubt', async () => {
    const setzen = await laden()
    const r = await setzen(LEAD, null)
    expect(r).toEqual({ ok: true })
    expect((updateAufruf()!.payload as any).follow_up_date).toBeNull()
  })

  it('leere Trefferliste ist ein Fehler, kein stilles Gespeichert', async () => {
    // Der Fall, den PostgREST ohne `error` liefert: die Zeile passt nicht
    // zum Filter (fremde Organisation, abgeschlossen, oder Bewerbung).
    fake = baueFake({ data: [] })
    ;(fake.client as any).auth = { getUser: async () => ({ data: { user: { id: NUTZER } }, error: null }) }
    const setzen = await laden()
    const r = await setzen(LEAD, morgen())
    expect(r.ok).toBe(false)
    expect((r as any).error).toMatch(/nicht gefunden|nicht mehr offen/)
  })

  it('protokolliert den Vorgang', async () => {
    const setzen = await laden()
    await setzen(LEAD, morgen())
    expect(auditEintraege).toHaveLength(1)
    expect(auditEintraege[0]).toMatchObject({ entityType: 'lead', entityId: LEAD, organizationId: ORG })
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('setApplicationAtsFelder — Bewerbungen', () => {
  async function laden() {
    return (await import('@/app/admin/applications/actions')).setApplicationAtsFelder
  }

  it('schreibt die Felder in bewerbung_daten.ats', async () => {
    const setzen = await laden()
    const r = await setzen(LEAD, { notizen: 'Telefonat 13.09.' })
    expect(r).toEqual({ ok: true })
    const nutzlast = (updateAufruf()!.payload as any).bewerbung_daten
    expect(nutzlast.ats.notizen).toBe('Telefonat 13.09.')
    // Bestehende Felder bleiben stehen — ein Teilformular loescht nichts.
    expect(nutzlast.ats.prioritaet).toBe(3)
  })

  it('weist Formularfelder ab, statt sie stillschweigend zu verwerfen', async () => {
    const setzen = await laden()
    const r = await setzen(LEAD, { qualifikation: 'pflegefachkraft' })
    expect(r.ok).toBe(false)
    expect((r as any).error).toMatch(/Bewerbungsformular/)
    expect(updateAufruf()).toBeUndefined()
  })

  it('weist unbekannte Schluessel ab', async () => {
    const setzen = await laden()
    const r = await setzen(LEAD, { organization_id: 'fremd' })
    expect(r.ok).toBe(false)
    expect(updateAufruf()).toBeUndefined()
  })

  it('weist einen unzulaessigen Wert ab', async () => {
    const setzen = await laden()
    const r = await setzen(LEAD, { prioritaet: 99 })
    expect(r.ok).toBe(false)
    expect(updateAufruf()).toBeUndefined()
  })

  it('das Protokoll nennt Feldnamen, aber KEINE Werte', async () => {
    // Freitextnotizen ueber Bewerberinnen gehoeren nicht ins Audit-Log.
    const setzen = await laden()
    await setzen(LEAD, { notizen: 'Wirkte am Telefon unsicher' })
    expect(auditEintraege).toHaveLength(1)
    const alsText = JSON.stringify(auditEintraege[0])
    expect(alsText).toContain('notizen')
    expect(alsText).not.toContain('unsicher')
  })

  it('schreibt mit Mandantenfilter', async () => {
    const setzen = await laden()
    await setzen(LEAD, { prioritaet: 1 })
    expect(hatOrgFence(updateAufruf()!, ORG)).toBe(true)
  })

  it('leere Trefferliste ist ein Fehler', async () => {
    fake = baueFake({ data: [] })
    ;(fake.client as any).auth = { getUser: async () => ({ data: { user: { id: NUTZER } }, error: null }) }
    const setzen = await laden()
    const r = await setzen(LEAD, { prioritaet: 1 })
    expect(r.ok).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Notizverlauf einer Bewerbung (13.09.2026)
// ═══════════════════════════════════════════════════════════════════════

describe('addApplicationNotiz', () => {
  const laden = async () => (await import('@/app/admin/applications/actions')).addApplicationNotiz

  function fakeMitBewerbung(gefunden: boolean) {
    const f = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'profiles') return { data: { role: 'admin', first_name: 'Vera', last_name: 'Verwaltung' }, error: null }
      if (a.tabelle === 'lead_inquiries' && a.operation === 'select') {
        return { data: gefunden ? { id: LEAD } : null, error: null }
      }
      if (a.tabelle === 'mis_crm_activities') return { data: { id: 'n1' }, error: null }
      return undefined
    })
    ;(f.client as any).auth = { getUser: async () => ({ data: { user: { id: NUTZER } }, error: null }) }
    return f
  }

  const notizInsert = () => fake.aufrufe.find(a => a.tabelle === 'mis_crm_activities' && a.operation === 'insert')

  it('haengt einen EIGENEN Eintrag an, statt zu ueberschreiben', async () => {
    fake = fakeMitBewerbung(true)
    const r = await (await laden())(LEAD, 'Telefonat: meldet sich Montag')
    expect(r).toEqual({ ok: true })
    const p = notizInsert()!.payload as any
    expect(p.lead_id).toBe(LEAD)
    expect(p.activity_type).toBe('note')
    expect(p.description).toBe('Telefonat: meldet sich Montag')
    // Kein Update auf bewerbung_daten — ats.notizen bleibt unberuehrt.
    expect(fake.aufrufe.find(a => a.operation === 'update')).toBeUndefined()
  })

  it('traegt den angemeldeten Nutzer als Urheber ein', async () => {
    fake = fakeMitBewerbung(true)
    await (await laden())(LEAD, 'x')
    expect((notizInsert()!.payload as any).performed_by).toBe('Vera Verwaltung')
  })

  it('nimmt die erste Zeile als Titel', async () => {
    fake = fakeMitBewerbung(true)
    await (await laden())(LEAD, 'Kurz erreicht\nDetails folgen')
    expect((notizInsert()!.payload as any).title).toBe('Kurz erreicht')
  })

  it.each([[''], ['   '], ['\n\n']])('weist die leere Notiz %j ab', async (t) => {
    fake = fakeMitBewerbung(true)
    const r = await (await laden())(LEAD, t)
    expect(r.ok).toBe(false)
    expect(notizInsert()).toBeUndefined()
  })

  it('weist eine zu lange Notiz ab', async () => {
    fake = fakeMitBewerbung(true)
    const r = await (await laden())(LEAD, 'x'.repeat(4001))
    expect(r.ok).toBe(false)
    expect(notizInsert()).toBeUndefined()
  })

  it('weist eine fremde Bewerbung ab', async () => {
    fake = fakeMitBewerbung(false)
    const r = await (await laden())(LEAD, 'x')
    expect(r.ok).toBe(false)
    expect(notizInsert()).toBeUndefined()
  })

  it('das Protokoll traegt den Wortlaut NICHT', async () => {
    fake = fakeMitBewerbung(true)
    await (await laden())(LEAD, 'Wirkte am Telefon unsicher')
    expect(JSON.stringify(auditEintraege[0])).not.toContain('unsicher')
    expect(auditEintraege[0].details).toMatchObject({ aktion: 'notiz_angelegt' })
  })
})

describe('ladeApplicationNotizen', () => {
  const laden = async () => (await import('@/app/admin/applications/actions')).ladeApplicationNotizen

  it('liest mit Mandantenfilter und gibt den Verlauf zurueck', async () => {
    fake = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'profiles') return { data: { role: 'admin', first_name: 'V', last_name: null }, error: null }
      if (a.tabelle === 'mis_crm_activities') {
        return {
          data: [{ id: 'n1', title: 'Kurz erreicht', description: 'Kurz erreicht', performed_by: 'Vera', created_at: '2026-09-13T10:00:00Z' }],
          error: null,
        }
      }
      return undefined
    })
    ;(fake.client as any).auth = { getUser: async () => ({ data: { user: { id: NUTZER } }, error: null }) }
    const r = await (await laden())(LEAD)
    expect(r.ok).toBe(true)
    expect((r as any).notizen).toHaveLength(1)
    expect((r as any).notizen[0]).toMatchObject({ text: 'Kurz erreicht', von: 'Vera' })
    const sel = fake.aufrufe.find(a => a.tabelle === 'mis_crm_activities' && a.operation === 'select')
    expect(hatOrgFence(sel, ORG)).toBe(true)
  })
})
