/**
 * Statuswechsel im CRM — Katalog und die beiden Server Actions.
 *
 * @see lib/admin/crm-katalog.ts
 * @see app/mis/crm/actions.ts
 *
 * ── DER BEFUND VOM 13.09.2026 ─────────────────────────────────────────
 * Seite und Server Action führten verschiedene Kataloge für dieselbe
 * Spalte. Die Liste der Action (`new`, `contact`, `consultation`, `trial`,
 * `churned`) widersprach sogar dem CHECK der Datenbank aus Migration
 * 20260705000000:
 *
 *   CHECK (pipeline_status IN ('lead','erstgespraech','active','paused','ended'))
 *
 * Drei von der Oberfläche angebotene Stufen kannte die Action nicht und
 * schrieb den rohen Schlüssel in den Aktivitätsverlauf; vier ihrer eigenen
 * Stufen hätte die Datenbank abgelehnt.
 *
 * Der Test hält den Katalog deshalb an die Migration — nicht an den Code,
 * der ihn benutzt. Eine Erlaubnisliste, die nur zu sich selbst passt,
 * beweist nichts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLIENT_PIPELINE, LEAD_STATUS, CLIENT_PIPELINE_KEYS, LEAD_STATUS_KEYS,
  istClientPipelineStatus, istLeadStatus, statusLabel,
  deckungsgleichMitApplicationFlow,
  AKTIVITAET_TYPEN_KEYS, AKTIVITAET_MAX_LEN, istAktivitaetsTyp, pruefeAktivitaet,
} from '@/lib/admin/crm-katalog'
import { APPLICATION_FLOW } from '@/lib/admin/ops'
import { erstelleFakeSupabase, hatOrgFence, type FakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const NUTZER = '22222222-2222-4222-8222-222222222222'
const ID = '33333333-3333-4333-8333-333333333333'

// ═══════════════════════════════════════════════════════════════════════
describe('Katalog gegen die Datenbank', () => {
  /** Die CHECK-Bedingung aus der Migration, nicht aus dem Anwendungscode. */
  function checkWerteAusMigration(spalte: string, datei: string): string[] {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations', datei), 'utf8')
    const m = sql.match(new RegExp(`CHECK\\s*\\(\\s*${spalte}\\s+IN\\s*\\(([^)]+)\\)`, 'i'))
    if (!m) throw new Error(`CHECK für ${spalte} in ${datei} nicht gefunden`)
    return m[1].split(',').map(t => t.trim().replace(/^'|'$/g, ''))
  }

  it('CLIENT_PIPELINE deckt sich mit dem CHECK auf clients.pipeline_status', () => {
    const ausDb = checkWerteAusMigration('pipeline_status', '20260705000000_crm_module_tables.sql')
    expect([...CLIENT_PIPELINE_KEYS].sort()).toEqual([...ausDb].sort())
  })

  it('LEAD_STATUS deckt sich mit APPLICATION_FLOW — dieselbe Spalte', () => {
    expect(deckungsgleichMitApplicationFlow()).toBe(true)
    expect([...LEAD_STATUS_KEYS].sort()).toEqual([...APPLICATION_FLOW].sort())
  })

  it('jeder Eintrag hat Beschriftung und Farbe', () => {
    for (const [k, v] of [...Object.entries(CLIENT_PIPELINE), ...Object.entries(LEAD_STATUS)]) {
      expect(v.label.length, k).toBeGreaterThan(2)
      expect(v.color, k).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('die Pipeline-Kacheln tragen alle ein Symbol', () => {
    for (const [k, v] of Object.entries(CLIENT_PIPELINE)) {
      expect(v.icon.length, k).toBeGreaterThan(0)
    }
  })
})

describe('Erlaubnisliste ist fail-closed', () => {
  it.each([...CLIENT_PIPELINE_KEYS])('laesst %s durch', (k) => {
    expect(istClientPipelineStatus(k)).toBe(true)
  })

  it.each([
    ['contact'], ['consultation'], ['trial'], ['churned'], ['new'],
  ])('weist %s ab — stand in der alten Liste der Action, nicht in der DB', (k) => {
    expect(istClientPipelineStatus(k)).toBe(false)
  })

  it.each([[''], [null], [undefined], [42], [{}], [['active']], ['ACTIVE'], ['__proto__'], ['constructor']])(
    'weist %s ab', (w) => {
      expect(istClientPipelineStatus(w)).toBe(false)
      expect(istLeadStatus(w)).toBe(false)
    })

  it('Prototyp-Schluessel gelten NICHT als bekannt', () => {
    // `'toString' in katalog` waere true — deshalb hasOwnProperty.
    expect(istLeadStatus('toString')).toBe(false)
    expect(istLeadStatus('valueOf')).toBe(false)
  })

  it('statusLabel faellt auf den Schluessel zurueck, statt zu werfen', () => {
    expect(statusLabel(LEAD_STATUS, 'new')).toBe('Neu')
    expect(statusLabel(LEAD_STATUS, 'unbekannt')).toBe('unbekannt')
  })
})

// ═══════════════════════════════════════════════════════════════════════
let fake: FakeSupabase
const audit: any[] = []

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }))
vi.mock('@/lib/organizations/server', () => ({ getActiveOrgId: async () => ORG }))
vi.mock('@/lib/audit-log', () => ({
  logAuditEventOrWarn: async (e: unknown) => { audit.push(e) },
}))

function baueFake(updateData: unknown) {
  const f = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === 'profiles') return { data: { role: 'admin', first_name: 'V', last_name: null }, error: null }
    if (a.tabelle === 'lead_inquiries' && a.operation === 'select') return { data: { status: 'new' }, error: null }
    if (a.operation === 'update') return { data: updateData, error: null }
    if (a.tabelle === 'mis_crm_activities') return { data: null, error: null }
    return undefined
  })
  ;(f.client as any).auth = { getUser: async () => ({ data: { user: { id: NUTZER } }, error: null }) }
  return f
}

beforeEach(() => {
  audit.length = 0
  fake = baueFake([{ id: ID }])
})

const updateAuf = (t: string) => fake.aufrufe.find(a => a.tabelle === t && a.operation === 'update')
const insertAuf = (t: string) => fake.aufrufe.find(a => a.tabelle === t && a.operation === 'insert')

describe('updateClientPipeline', () => {
  const laden = async () => (await import('@/app/mis/crm/actions')).updateClientPipeline

  it('schreibt mit Mandantenfilter und schreibt eine Aktivitaet mit BESCHRIFTUNG', async () => {
    const r = await (await laden())(ID, 'erstgespraech')
    expect(r).toEqual({ ok: true })
    expect(hatOrgFence(updateAuf('clients'), ORG)).toBe(true)
    // Frueher stand hier „Status → erstgespraech" — der rohe Schluessel.
    expect((insertAuf('mis_crm_activities')!.payload as any).title).toBe('Status → Erstgespräch')
  })

  it('weist eine Stufe ab, die die Datenbank ablehnen wuerde', async () => {
    const r = await (await laden())(ID, 'consultation')
    expect(r.ok).toBe(false)
    expect(updateAuf('clients')).toBeUndefined()
  })

  it('null getroffene Zeilen sind ein Fehler, kein stilles Gespeichert', async () => {
    fake = baueFake([])
    const r = await (await laden())(ID, 'active')
    expect(r.ok).toBe(false)
    expect((r as any).error).toMatch(/nicht gefunden|kein Zugriff/)
  })
})

describe('updateLeadStatus', () => {
  const laden = async () => (await import('@/app/mis/crm/actions')).updateLeadStatus

  it('schreibt Aktivitaet mit VON → NACH', async () => {
    // Bis 13.09.2026 schrieb ein Lead-Statuswechsel gar keine Aktivitaet —
    // live trug kein einziger der 50 Leads eine Bearbeitungsspur.
    const r = await (await laden())(ID, 'contacted')
    expect(r).toEqual({ ok: true })
    const akt = insertAuf('mis_crm_activities')
    expect(akt, 'keine Aktivitaet geschrieben').toBeDefined()
    expect((akt!.payload as any).title).toBe('Neu → Kontaktiert')
    expect((akt!.payload as any).lead_id).toBe(ID)
  })

  it('schreibt mit Mandantenfilter', async () => {
    await (await laden())(ID, 'qualified')
    expect(hatOrgFence(updateAuf('lead_inquiries'), ORG)).toBe(true)
  })

  it('weist einen unbekannten Status ab', async () => {
    const r = await (await laden())(ID, 'vielleicht')
    expect(r.ok).toBe(false)
    expect(updateAuf('lead_inquiries')).toBeUndefined()
  })

  it('null getroffene Zeilen sind ein Fehler', async () => {
    fake = baueFake([])
    const r = await (await laden())(ID, 'contacted')
    expect(r.ok).toBe(false)
  })

  it('das Protokoll nennt den Wechsel, nicht nur das Ziel', async () => {
    await (await laden())(ID, 'converted')
    expect(audit).toHaveLength(1)
    expect(audit[0].details).toMatchObject({ von: 'new', neuer_status: 'converted' })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Aktivitäten (13.09.2026)
// ═══════════════════════════════════════════════════════════════════════

describe('Aktivitätsarten gegen die Datenbank', () => {
  it('AKTIVITAET_TYPEN deckt sich mit dem CHECK auf activity_type', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations', '20260705000000_crm_module_tables.sql'), 'utf8')
    const m = sql.match(/activity_type\s+text\s+NOT NULL\s+CHECK\s*\(\s*activity_type\s+IN\s*\(([^)]+)\)/i)
    expect(m, 'CHECK für activity_type nicht gefunden').toBeTruthy()
    const ausDb = m![1].split(',').map(t => t.trim().replace(/^'|'$/g, ''))
    expect([...AKTIVITAET_TYPEN_KEYS].sort()).toEqual([...ausDb].sort())
  })

  it('weist unbekannte Arten ab', () => {
    expect(istAktivitaetsTyp('call')).toBe(true)
    expect(istAktivitaetsTyp('anruf')).toBe(false)
    expect(istAktivitaetsTyp('toString')).toBe(false)
    expect(istAktivitaetsTyp(null)).toBe(false)
  })
})

describe('pruefeAktivitaet', () => {
  const gut = { activity_type: 'call', title: 'Rückruf', lead_id: ID }

  it('nimmt eine gültige Aktivität an', () => {
    const r = pruefeAktivitaet({ ...gut, description: 'Erreicht, Termin vereinbart' })
    expect(r.fehler).toBeNull()
    expect(r.aktivitaet).toMatchObject({ activity_type: 'call', lead_id: ID })
  })

  it('verlangt genau EINEN Bezug', () => {
    // Ohne Bezug haengt die Zeile an nichts und steht in keiner
    // Verlaufsliste; mit beiden behauptet sie, derselbe Vorgang sei
    // Kunde UND Anfrage.
    expect(pruefeAktivitaet({ activity_type: 'call', title: 'x' }).fehler).toMatch(/ohne Bezug/)
    expect(pruefeAktivitaet({ ...gut, client_id: 'c1' }).fehler).toMatch(/nicht zu Kunde UND Anfrage/)
  })

  it('verlangt einen Titel', () => {
    expect(pruefeAktivitaet({ ...gut, title: '  ' }).fehler).toMatch(/title/)
  })

  it('weist zu langen Text ab', () => {
    expect(pruefeAktivitaet({ ...gut, title: 'x'.repeat(AKTIVITAET_MAX_LEN.title + 1) }).fehler).toMatch(/zu lang/)
    expect(pruefeAktivitaet({ ...gut, description: 'x'.repeat(AKTIVITAET_MAX_LEN.description + 1) }).fehler).toMatch(/zu lang/)
  })

  it('weist eine unbekannte Art ab', () => {
    expect(pruefeAktivitaet({ ...gut, activity_type: 'brieftaube' }).fehler).toMatch(/Aktivitätsart/)
  })
})

describe('createActivity', () => {
  const laden = async () => (await import('@/app/mis/crm/actions')).createActivity

  function fakeMitBezug(bezugGefunden: boolean) {
    const f = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'profiles') return { data: { role: 'admin', first_name: 'Vera', last_name: 'Verwaltung' }, error: null }
      if ((a.tabelle === 'clients' || a.tabelle === 'lead_inquiries') && a.operation === 'select') {
        return { data: bezugGefunden ? { id: ID } : null, error: null }
      }
      if (a.tabelle === 'mis_crm_activities' && a.operation === 'insert') {
        return { data: { id: 'a1' }, error: null }
      }
      return undefined
    })
    ;(f.client as any).auth = { getUser: async () => ({ data: { user: { id: NUTZER } }, error: null }) }
    return f
  }

  it('traegt den ANGEMELDETEN Nutzer als Urheber ein, nicht die Eingabe', async () => {
    // Bis 13.09.2026 kam `performed_by` aus dem Formular: in einem
    // Verlauf, den spaeter jemand als Beleg liest, konnte sich damit jeder
    // als beliebige Person eintragen.
    fake = fakeMitBezug(true)
    const r = await (await laden())({
      activity_type: 'note', title: 'Notiz', lead_id: ID,
      // absichtlich untergeschoben:
      performed_by: 'Jemand ganz anderes',
    } as any)
    expect(r.ok).toBe(true)
    const ins = fake.aufrufe.find(a => a.tabelle === 'mis_crm_activities' && a.operation === 'insert')
    expect((ins!.payload as any).performed_by).toBe('Vera Verwaltung')
  })

  it('weist einen Bezug aus einer fremden Organisation ab', async () => {
    fake = fakeMitBezug(false)
    const r = await (await laden())({ activity_type: 'note', title: 'x', lead_id: ID })
    expect(r.ok).toBe(false)
    expect(fake.aufrufe.find(a => a.tabelle === 'mis_crm_activities' && a.operation === 'insert')).toBeUndefined()
  })

  it('das Protokoll traegt den Freitext NICHT', async () => {
    fake = fakeMitBezug(true)
    await (await laden())({ activity_type: 'note', title: 'Wirkte bedrückt', lead_id: ID })
    expect(JSON.stringify(audit[0])).not.toContain('bedrückt')
  })
})
