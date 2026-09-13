/**
 * Abrechnungslauf-Status und Leistungspreise: Erlaubnisliste und Rückmeldung.
 *
 * @see lib/abrechnung/lauf-status.ts
 * @see app/admin/abrechnung/actions.ts
 * @see app/admin/leistungspreise/actions.ts
 *
 * ── WARUM DIE ERLAUBNISLISTE HIER DIE EINZIGE SCHRANKE IST ────────────
 * `abrechnungslaeufe.status` hat **keinen CHECK** — Migration
 * `20260101000000` legt die Spalte als `status text DEFAULT 'erstellt'
 * NOT NULL` an. Die Datenbank nimmt jede Zeichenkette an.
 *
 * Bis zum 13.09.2026 gab `setzeLaufStatusAction` ihren Parameter
 * ungeprüft weiter, und der Katalog lag als lokale Konstante in der
 * Seite. Ein Tippfehler setzte einen Abrechnungslauf damit auf einen
 * Zustand, den keine Auswertung kennt — angezeigt als grauer Rohtext,
 * weil die Liste auf den Schlüssel zurückfällt.
 *
 * Der Test hält die Behauptung „kein CHECK" an der Migration fest. Bekommt
 * die Spalte später einen, wird er rot, und dann gehört diese Datei
 * angepasst statt der Migration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LAUF_STATUS, LAUF_STATUS_KEYS, istLaufStatus, laufStatusLabel,
} from '@/lib/abrechnung/lauf-status'
import {
  erstelleFakeSupabase, hatOrgFence, type FakeSupabase, type FakeAufruf,
} from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const NUTZER = '22222222-2222-4222-8222-222222222222'
const ID = '33333333-3333-4333-8333-333333333333'

describe('Katalog', () => {
  it('die Spalte hat wirklich keinen CHECK — sonst ist die Begründung hinfällig', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations', '20260101000000_baseline_live_only_tables.sql'), 'utf8')
    const i = sql.indexOf('CREATE TABLE IF NOT EXISTS public.abrechnungslaeufe')
    expect(i, 'Tabellendefinition nicht gefunden').toBeGreaterThan(-1)
    const block = sql.slice(i, sql.indexOf(');', i))
    expect(block).toMatch(/status\s+text\s+DEFAULT/)
    expect(block, 'Spalte hat jetzt einen CHECK — Katalog dagegen halten').not.toMatch(/status[^,]*CHECK/i)
  })

  it('kennt genau die acht Zustände der Oberfläche', () => {
    expect(LAUF_STATUS_KEYS).toEqual([
      'erstellt', 'geprueft', 'exportiert', 'uebermittelt',
      'akzeptiert', 'teilweise_abgelehnt', 'abgelehnt', 'bezahlt',
    ])
  })

  it('jeder Eintrag hat Beschriftung und Farbe', () => {
    for (const [k, v] of Object.entries(LAUF_STATUS)) {
      expect(v.label.length, k).toBeGreaterThan(2)
      expect(v.color, k).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('ist fail-closed', () => {
    for (const k of LAUF_STATUS_KEYS) expect(istLaufStatus(k)).toBe(true)
    for (const w of ['', 'ERSTELLT', 'storniert', 'toString', '__proto__', null, 42, {}]) {
      expect(istLaufStatus(w), String(w)).toBe(false)
    }
  })

  it('die Beschriftung fällt auf den Rohwert zurück, statt zu werfen', () => {
    // In der DB koennen Zustaende aus der Zeit vor der Erlaubnisliste
    // stehen. Eine Liste, die daran abstuerzt, ist schlechter als eine,
    // die einen Schluessel zeigt.
    expect(laufStatusLabel('erstellt').label).toBe('Erstellt')
    expect(laufStatusLabel('uralt').label).toBe('uralt')
  })
})

// ═══════════════════════════════════════════════════════════════════════
let fake: FakeSupabase

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }))
vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: async () => ORG,
  getActiveOrgIdOrDefault: async () => ORG,
}))
vi.mock('@/lib/audit-log', () => ({
  logAuditEventOrWarn: async () => {},
  logAuditEvent: async () => {},
}))

function baueFake(treffer: unknown[]) {
  const f = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === 'profiles') {
      return { data: { role: 'admin', first_name: 'V', last_name: null }, error: null }
    }
    if (a.operation === 'update' || a.operation === 'delete' || a.operation === 'insert') {
      return { data: treffer, error: null }
    }
    return { data: null, error: null }
  })
  ;(f.client as any).auth = {
    getUser: async () => ({ data: { user: { id: NUTZER } }, error: null }),
  }
  return f
}

const schreib = (t: string, op: string) =>
  fake.aufrufe.find(a => a.tabelle === t && a.operation === op)

beforeEach(() => { fake = baueFake([{ id: ID }]) })

describe('setzeLaufStatusAction', () => {
  const laden = async () =>
    (await import('@/app/admin/abrechnung/actions')).setzeLaufStatusAction

  it('schreibt einen bekannten Status mit Mandantenfilter', async () => {
    await (await laden())(ID, 'uebermittelt')
    const u = schreib('abrechnungslaeufe', 'update')
    expect(u, 'kein Update abgesetzt').toBeDefined()
    expect(hatOrgFence(u!, ORG), 'Mandantenfilter fehlt').toBe(true)
    expect((u!.payload as any).status).toBe('uebermittelt')
    // Der Zeitstempel haengt am Status, nicht am Aufrufer.
    expect((u!.payload as any).uebermittelt_am).toBeTruthy()
  })

  it.each([['storniert'], ['fertig'], [''], ['Uebermittelt']])(
    'weist den unbekannten Status %j ab, OHNE zu schreiben', async (s) => {
      await expect((await laden())(ID, s as string)).rejects.toThrow(/Lauf-Status/)
      expect(schreib('abrechnungslaeufe', 'update')).toBeUndefined()
    })

  it('wirft, wenn keine Zeile getroffen wurde — kein Audit über nichts', async () => {
    fake = baueFake([])
    await expect((await laden())(ID, 'akzeptiert')).rejects.toThrow(/nicht gefunden|kein Zugriff/)
  })
})

describe('Leistungspreise', () => {
  async function actions() {
    return import('@/app/admin/leistungspreise/actions')
  }

  it('das Löschen meldet einen Fehler, wenn die Zeile noch steht', async () => {
    // Die gefaehrlichste Rueckmeldung von allen: „geloescht" ueber einen
    // Preis, der weiter gilt.
    fake = baueFake([])
    const mod: any = await actions()
    const fn = mod.deleteLeistungspreis
    const r = await fn(ID)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/nicht gefunden|kein Zugriff|nichts geloescht/i)
  })

  it('das Löschen läuft mit Mandantenfilter', async () => {
    const mod: any = await actions()
    await mod.deleteLeistungspreis(ID)
    expect(hatOrgFence(schreib('leistungspreise', 'delete'), ORG)).toBe(true)
  })
})
