/**
 * E2E: Mahnversand ueber den Route-Handler — Berechtigung, Dead Letter,
 * Wiederaufnahme, Mandantengrenze
 * ═══════════════════════════════════════════════════════════════════════
 *
 * __tests__/e2e/mahnkette-pglite.test.ts faehrt die Zustandsmaschine der
 * Warteschlange durch (Mahnlauf → Versuch → Wartezeit → Dead Letter). Was
 * dort fehlt, ist die Schicht darueber: der ECHTE Route-Handler
 * POST/GET /api/billing/dunning/versand. Genau dort haengen zwei Dinge,
 * die eine Bibliotheksfunktion nicht zeigen kann.
 *
 * BEFUND 1 — Wiederaufnahme aus dem Dead Letter war unerreichbar.
 *   `reaktiviereAufgegebene()` existierte, hatte aber KEINEN Aufrufer:
 *   kein Endpunkt, keine Oberflaeche, nichts. Eine Mahnung im Endzustand
 *   'aufgegeben' liess sich ausserhalb des SQL-Editors durch nichts
 *   zurueckholen — obwohl genau das der Sinn des Endzustands ist (er endet
 *   durch eine Entscheidung der Verwaltung, nicht durch Ablauf).
 *   Geschlossen ueber `deadLetterReaktivieren` im Body.
 *
 * BEFUND 2 — die Rechteschwelle muss am Endpunkt haengen, nicht am
 *   Modul: `verarbeiteMahnQueue()` prueft gar nichts, es ist der Handler,
 *   der `abrechnung.schreiben` verlangt. Eine Lese-Rolle darf die
 *   Warteschlange ZAEHLEN, aber keine Mahnung an einen Kunden ausloesen.
 *
 * WAS GEMOCKT IST: die beiden Aussenkanten — Sitzung (es gibt keinen
 * Browser) und `sendRawEmail` (die Provider-Antwort muss steuerbar sein),
 * dazu die PDF-Erzeugung. Rollenpruefung, Warteschlange, Zaehler,
 * Wartezeit, Dead Letter, Audit und Mandantengrenze laufen echt gegen
 * Postgres.
 *
 * ES WIRD KEINE ECHTE MAIL VERSCHICKT: sendRawEmail ist ersetzt, und die
 * Empfaengeradressen sind example.org-Testadressen.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, baueMahnTabellen, STAMM_ORG } from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

// ─────────────────────────────────────────────────────────────────────
// Aussenkanten
// ─────────────────────────────────────────────────────────────────────
const halter = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
  /** Antwort des naechsten sendRawEmail-Aufrufs. */
  antwort: null as unknown,
  aufrufe: [] as Array<{ to: string; subject: string; idempotenzSchluessel?: string }>,
  /** Angemeldete Sitzung — je Test umstellbar. */
  sitzung: { userId: '' as string | null, orgId: '' as string | null },
}))

vi.mock('@/lib/notifications', () => ({
  sendRawEmail: async (p: { to: string; subject: string; idempotenzSchluessel?: string }) => {
    halter.aufrufe.push({
      to: p.to, subject: p.subject, idempotenzSchluessel: p.idempotenzSchluessel,
    })
    const a = halter.antwort
    if (a instanceof Error) throw a
    return a
  },
}))

vi.mock('@/lib/billing/dunning/mahnung-pdf-datei', () => ({
  hatMahnText: (stufe: string) => stufe !== 'offen' && stufe !== 'inkasso_vorbereitung',
  mahnungDateiname: () => 'Mahnung-TEST.pdf',
  erzeugeMahnungPdf: async () => new Uint8Array([37, 80, 68, 70]),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => halter.client,
}))

// Die Sitzung: `auth.getUser()` liefert den angemeldeten Nutzer, alle
// Tabellenabfragen gehen an dieselbe echte Datenbank. Damit ist die
// Rollenpruefung des Handlers ECHT — sie liest die Rolle aus `profiles`.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        halter.sitzung.userId
          ? { data: { user: { id: halter.sitzung.userId } }, error: null }
          : { data: { user: null }, error: { message: 'keine Sitzung' } },
    },
    from: (t: string) => (halter.client as unknown as SupabaseClient).from(t),
  }),
}))

vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: async () => halter.sitzung.orgId,
  getActiveOrgIdOrDefault: async () => halter.sitzung.orgId,
}))

import {
  POST as versandPost,
  GET as versandGet,
} from '@/app/api/billing/dunning/versand/route'
import { MAHN_MAX_VERSUCHE } from '@/lib/billing/dunning/mahn-versand'
import { rolleDarf } from '@/lib/auth/guard'

// ─────────────────────────────────────────────────────────────────────
const ORG_A   = STAMM_ORG
const ORG_B   = '00000000-0000-4000-8000-0000000000b0'
const ADMIN_A = '00000000-0000-4000-8000-00000000a001'
const ADMIN_B = '00000000-0000-4000-8000-00000000a002'
const LESER   = '00000000-0000-4000-8000-00000000a003'
const KUNDE_A = '00000000-0000-4000-8000-00000000c001'
const KUNDE_B = '00000000-0000-4000-8000-00000000c002'

const ERFOLG = { ok: true, uebersprungen: false, messageId: 'msg-route-1' }
const STOERUNG = {
  ok: false, uebersprungen: false, grund: 'Provider nicht erreichbar',
  statusCode: 503, fehler: { statusCode: 503, message: 'service unavailable' },
}
const ADRESSE_UNGUELTIG = {
  ok: false, uebersprungen: false, grund: 'invalid_email: recipient not accepted',
  statusCode: 422, fehler: { statusCode: 422, message: 'invalid_email' },
}
const OHNE_SCHLUESSEL = {
  ok: false, uebersprungen: true, grund: 'RESEND_API_KEY nicht konfiguriert',
}

let db: PGlite
let admin: SupabaseClient

function alsNutzer(userId: string | null, orgId: string | null) {
  halter.sitzung = { userId, orgId }
}

async function post(body?: Record<string, unknown>) {
  const req = new Request('http://localhost/api/billing/dunning/versand', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const res = await versandPost(req)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

async function get() {
  const req = new Request('http://localhost/api/billing/dunning/versand')
  const res = await versandGet(req)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

function vorTagen(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

let zaehler = 0

/** Ueberfaellige Rechnung + eine wartende Zeile in der Warteschlange. */
async function stelleMahnungEin(org: string, kunde: string, email: string): Promise<{
  rechnung: string
  queueId: string
}> {
  zaehler++
  const nummer = 5000 + zaehler
  const { data: inv, error: invErr } = await admin.from('invoices').insert({
    organization_id: org,
    client_id: kunde,
    invoice_number: String(nummer),
    invoice_number_formatted: `RE-2026-${nummer}`,
    period_start: vorTagen(60),
    period_end: vorTagen(31),
    due_date: vorTagen(30),
    status: 'freigegeben',
    total_amount: 210,
    paid_amount: 0,
    dunning_level: 'mahnung_1',
    payment_terms_days: 14,
  }).select('id')
  if (invErr) throw new Error(`Rechnung nicht anlegbar: ${invErr.message}`)
  const rechnung = String((inv as Array<{ id: string }>)[0].id)

  const { data: q, error: qErr } = await admin.from('dunning_email_queue').insert({
    organization_id: org,
    invoice_id: rechnung,
    empfaenger_email: email,
    empfaenger_name: 'Testempfaenger',
    betreff: `Zahlungserinnerung RE-2026-${nummer}`,
    inhalt: 'Bitte begleichen Sie den offenen Betrag.',
    status: 'wartend',
  }).select('id')
  if (qErr) throw new Error(`Queue-Zeile nicht anlegbar: ${qErr.message}`)

  return { rechnung, queueId: String((q as Array<{ id: string }>)[0].id) }
}

async function queueZeile(queueId: string): Promise<Record<string, unknown>> {
  const r = await db.query<Record<string, unknown>>(
    'SELECT * FROM public.dunning_email_queue WHERE id = $1', [queueId]
  )
  return r.rows[0]
}

/** Wartezeit verstreichen lassen, damit die Wiederholung greift. */
async function wartezeitAbgelaufen(queueId: string): Promise<void> {
  await db.query(
    `UPDATE public.dunning_email_queue
        SET naechster_versuch_ab = now() - interval '1 minute' WHERE id = $1`,
    [queueId]
  )
}

async function auditAktionen(): Promise<string[]> {
  const r = await db.query<{ action: string }>(
    "SELECT action FROM public.billing_audit_trail WHERE entity_type = 'dunning' ORDER BY created_at"
  )
  return r.rows.map(z => z.action)
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await baueMahnTabellen(db)
  admin = macheSupabaseClient(db) as unknown as SupabaseClient
  halter.client = admin

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN_A}', 'admin-a@example.org'),
      ('${ADMIN_B}', 'admin-b@example.org'),
      ('${LESER}',   'leser@example.org');

    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${ORG_A}', 'Mandant Alpha', 'hessen', 'active'),
      ('${ORG_B}', 'Mandant Beta',  'bayern', 'active')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, email, role) VALUES
      ('${ADMIN_A}', 'admin-a@example.org', 'admin'),
      ('${ADMIN_B}', 'admin-b@example.org', 'admin'),
      -- 'engel' statt 'pdl': der CHECK auf profiles.role kennt live nur
      -- kunde|engel|admin|superadmin|fahrer. Die Rollen, die
      -- abrechnung.lesen von abrechnung.schreiben trennen wuerden (pdl,
      -- qm, buchhaltung), lassen sich derzeit gar nicht anlegen — siehe
      -- den Abschnitt „Rollen, die es live noch nicht gibt".
      ('${LESER}',   'leser@example.org',   'engel');

    INSERT INTO public.clients
      (id, organization_id, customer_number, first_name, last_name, email, zip_code)
    VALUES
      ('${KUNDE_A}', '${ORG_A}', 'A-0001', 'Erika', 'Musterfrau', 'erika@example.org', '60311'),
      ('${KUNDE_B}', '${ORG_B}', 'B-0001', 'Bernd', 'Beispiel',   'bernd@example.org', '80331');
  `)
}, 120_000)

afterAll(async () => {
  await db?.close()
})

beforeEach(() => {
  halter.aufrufe = []
  halter.antwort = ERFOLG
  alsNutzer(ADMIN_A, ORG_A)
})

async function leereQueue(): Promise<void> {
  await db.exec(`
    DELETE FROM public.dunning_email_queue;
    DELETE FROM public.billing_audit_trail;
    DELETE FROM public.invoices;
  `)
}

// ═════════════════════════════════════════════════════════════════════
describe('Berechtigung am Endpunkt', () => {
  beforeAll(leereQueue)

  it('ohne Sitzung: 401, und es wird nichts versendet', async () => {
    alsNutzer(null, null)
    await stelleMahnungEin(ORG_A, KUNDE_A, 'erika@example.org').catch(() => null)
    const r = await post()
    expect(r.status).toBe(401)
    expect(halter.aufrufe).toHaveLength(0)
  })

  it('Admin darf die Warteschlange zaehlen', async () => {
    alsNutzer(ADMIN_A, ORG_A)
    const r = await get()
    expect(r.status).toBe(200)
    expect(r.body.queue).toBeTruthy()
  })

  it('eine Rolle ohne abrechnung.schreiben loest KEINE Mahnung aus', async () => {
    alsNutzer(LESER, ORG_A)
    await stelleMahnungEin(ORG_A, KUNDE_A, 'erika@example.org')
    const r = await post()
    expect(r.status).toBe(403)
    expect(halter.aufrufe).toHaveLength(0)
  })

  it('ohne zugewiesene Organisation: 403 statt stiller Stamm-Org', async () => {
    alsNutzer(ADMIN_A, null)
    const r = await post()
    expect(r.status).toBe(403)
    expect(halter.aufrufe).toHaveLength(0)
  })

  it('sie darf auch das Dead Letter nicht zurueckholen', async () => {
    alsNutzer(LESER, ORG_A)
    const r = await post({ deadLetterReaktivieren: true })
    expect(r.status).toBe(403)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Rollen, die es live noch nicht gibt', () => {
  // Die Matrix trennt „Rechnungen lesen" von „Rechnungen erzeugen" — das
  // ist der Grund, warum der Mahnversand `abrechnung.schreiben` verlangt
  // (Commit ffb969f).
  //
  // ── KORREKTUR EINER FRUEHEREN AUSSAGE HIER ─────────────────────────
  // An dieser Stelle stand: „die Rollen, die diese Trennung tragen,
  // lassen sich in profiles gar nicht anlegen — der CHECK kennt sie
  // nicht." Das war eine Aussage ueber das TESTSCHEMA, nicht ueber die
  // Produktion. Das Kettenschema schnitt `profiles` aus der
  // Core-Baseline, die pdl/qm/buchhaltung noch nicht kannte; live steht
  // seit 20260924000000 die weitere Fassung.
  //
  // Am 29.08.2026 aus pg_constraint gelesen:
  //   CHECK (role = ANY (ARRAY['kunde','engel','fahrer','angehoerige',
  //                            'pdl','qm','buchhaltung','admin','superadmin']))
  //
  // Die feinere Rechteschwelle ist trotzdem eine Absicht ohne Traeger —
  // aber aus einem anderen Grund, und der ist eine Aussage ueber den
  // BESTAND: von 65 Profilen traegt live KEIN einziges eine der drei
  // Fachrollen (admin 1, superadmin 3, engel 22, fahrer 5, kunde 34).
  // Anlegbar waeren sie; angelegt hat sie niemand.
  it('die Matrix trennt lesen und schreiben fuer die Pflegedienstleitung', () => {
    expect(rolleDarf('pdl', 'abrechnung.lesen')).toBe(true)
    expect(rolleDarf('pdl', 'abrechnung.schreiben')).toBe(false)
  })

  it('die Buchhaltung darf mahnen', () => {
    expect(rolleDarf('buchhaltung', 'abrechnung.schreiben')).toBe(true)
  })

  it('die drei Fachrollen sind in profiles anlegbar (wie live)', async () => {
    for (const [nr, rolle] of ['pdl', 'qm', 'buchhaltung'].entries()) {
      const nutzer = `00000000-0000-4000-8000-00000000a0${10 + nr}`
      await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${nutzer}', '${rolle}@example.org');`)
      await db.exec(
        `INSERT INTO public.profiles (id, email, role) VALUES ('${nutzer}', '${rolle}@example.org', '${rolle}');`
      )
    }
    const { rows } = await db.query<{ anzahl: string }>(
      `SELECT count(*)::text AS anzahl FROM public.profiles WHERE role IN ('pdl','qm','buchhaltung')`
    )
    expect(Number(rows[0].anzahl)).toBe(3)
  })

  it('eine erfundene Rolle bleibt abgewiesen — der CHECK ist nicht offen', async () => {
    // Gegenprobe: waere der CHECK ganz weg, waere der Fall oben trivial.
    const nutzer = '00000000-0000-4000-8000-00000000a020'
    await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${nutzer}', 'chef@example.org');`)
    let fehler: string | null = null
    try {
      await db.exec(
        `INSERT INTO public.profiles (id, email, role) VALUES ('${nutzer}', 'chef@example.org', 'oberchef');`
      )
    } catch (e) {
      fehler = e instanceof Error ? e.message : String(e)
    }
    expect(fehler).toMatch(/profiles_role_check/)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Erfolgreicher Versand ueber die Route', () => {
  let queueId: string

  beforeAll(async () => {
    await leereQueue()
    ;({ queueId } = await stelleMahnungEin(ORG_A, KUNDE_A, 'erika@example.org'))
  })

  it('der Lauf versendet genau eine Mahnung — mit Idempotenzschluessel', async () => {
    const r = await post()
    expect(r.status).toBe(200)
    expect(r.body.versendet).toBe(1)
    expect(halter.aufrufe).toHaveLength(1)
    expect(halter.aufrufe[0].to).toBe('erika@example.org')
    // Ohne den Schluessel bekaeme der Kunde bei einer Wiederholung nach
    // Zeitueberschreitung zwei Mahnungen.
    expect(halter.aufrufe[0].idempotenzSchluessel).toBe(`mahnung:${queueId}`)
  })

  it('die Zeile steht danach auf "versendet" mit Zeitstempel', async () => {
    const z = await queueZeile(queueId)
    expect(z.status).toBe('versendet')
    expect(z.versendet_am).not.toBeNull()
    expect(Number(z.versuche)).toBe(1)
  })

  it('ein zweiter Lauf ruehrt sie nicht mehr an — Idempotenz des Vorgangs', async () => {
    halter.aufrufe = []
    const r = await post({ wiederholen: true })
    expect(r.body.geprueft).toBe(0)
    expect(halter.aufrufe).toHaveLength(0)
  })

  it('der Versand steht mit Provider-Nachrichten-ID im Pruefpfad', async () => {
    expect(await auditAktionen()).toContain('email_versendet')
    const r = await db.query<{ new_state: { provider_message_id?: string } }>(
      "SELECT new_state FROM public.billing_audit_trail WHERE action = 'email_versendet'"
    )
    expect(r.rows[0].new_state.provider_message_id).toBe('msg-route-1')
  })

  it('GET zaehlt die Warteschlange, ohne etwas zu versenden', async () => {
    halter.aufrufe = []
    const r = await get()
    expect(r.status).toBe(200)
    expect((r.body.queue as Record<string, number>).versendet).toBe(1)
    expect(halter.aufrufe).toHaveLength(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Voruebergehender Providerfehler ueber die Route', () => {
  let queueId: string

  beforeAll(async () => {
    await leereQueue()
    ;({ queueId } = await stelleMahnungEin(ORG_A, KUNDE_A, 'erika@example.org'))
  })

  it('eine 503 setzt Zaehler und Wartezeit, statt die Zeile zu verbrennen', async () => {
    halter.antwort = STOERUNG
    const r = await post()
    expect(r.body.fehlgeschlagen).toBe(1)

    const z = await queueZeile(queueId)
    expect(z.status).toBe('fehlgeschlagen')
    expect(Number(z.versuche)).toBe(1)
    expect(z.naechster_versuch_ab).not.toBeNull()
  })

  it('vor Ablauf der Wartezeit holt kein Lauf die Zeile zurueck', async () => {
    halter.antwort = ERFOLG
    halter.aufrufe = []
    const r = await post({ wiederholen: true })
    expect(r.body.versendet).toBe(0)
    expect(halter.aufrufe).toHaveLength(0)
  })

  it('nach Ablauf der Wartezeit geht die Mahnung raus', async () => {
    await wartezeitAbgelaufen(queueId)
    halter.antwort = ERFOLG
    halter.aufrufe = []
    const r = await post({ wiederholen: true })
    expect(r.body.reaktiviert).toBeGreaterThanOrEqual(1)
    expect(r.body.versendet).toBe(1)
    // Der Zaehler der faelligen Fehlversuche und der des Dead Letter sind
    // zwei verschiedene Dinge und duerfen sich nicht ueberschreiben.
    expect(r.body.deadLetterReaktiviert).toBe(0)
    expect((await queueZeile(queueId)).status).toBe('versendet')
  })

  it('ein fehlender Schluessel zaehlt NICHT als Versuch', async () => {
    await leereQueue()
    const { queueId: q2 } = await stelleMahnungEin(ORG_A, KUNDE_A, 'erika@example.org')
    halter.antwort = OHNE_SCHLUESSEL
    const r = await post()
    expect(r.body.uebersprungen).toBe(1)

    const z = await queueZeile(q2)
    expect(z.status).toBe('wartend')
    expect(Number(z.versuche)).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Dead Letter und Wiederaufnahme ueber die Route', () => {
  let queueId: string

  beforeAll(async () => {
    await leereQueue()
    ;({ queueId } = await stelleMahnungEin(ORG_A, KUNDE_A, 'falsch@example.org'))
  })

  it('eine abgelehnte Adresse (422) geht sofort ins Dead Letter', async () => {
    halter.antwort = ADRESSE_UNGUELTIG
    const r = await post()
    expect(r.body.aufgegeben).toBe(1)

    const z = await queueZeile(queueId)
    expect(z.status).toBe('aufgegeben')
    expect(Number(z.versuche)).toBe(1)
  })

  it('die Aufgabe steht im Pruefpfad', async () => {
    expect(await auditAktionen()).toContain('email_aufgegeben')
  })

  it('`wiederholen` holt ein Dead Letter NICHT zurueck', async () => {
    halter.antwort = ERFOLG
    halter.aufrufe = []
    const r = await post({ wiederholen: true })
    expect(r.body.versendet).toBe(0)
    expect(halter.aufrufe).toHaveLength(0)
    expect((await queueZeile(queueId)).status).toBe('aufgegeben')
  })

  it('BEFUND: `deadLetterReaktivieren` holt sie zurueck und stellt zu', async () => {
    halter.antwort = ERFOLG
    halter.aufrufe = []
    const r = await post({ deadLetterReaktivieren: true })

    expect(r.status).toBe(200)
    expect(r.body.deadLetterReaktiviert).toBe(1)
    expect(r.body.versendet).toBe(1)
    expect(halter.aufrufe).toHaveLength(1)

    const z = await queueZeile(queueId)
    expect(z.status).toBe('versendet')
  })

  it('die Wiederaufnahme setzt den Versuchszaehler zurueck', async () => {
    // Nach der Reaktivierung (versuche = 0) zaehlt der Zustellversuch
    // wieder ab eins — sonst waere die Zeile nach einem einzigen weiteren
    // Fehlversuch erneut im Dead Letter.
    expect(Number((await queueZeile(queueId)).versuche)).toBe(1)
  })

  it('die Wiederaufnahme steht im Pruefpfad', async () => {
    expect(await auditAktionen()).toContain('dead_letter_reaktiviert')
  })

  it('sie laesst sich auf einzelne Eintraege begrenzen', async () => {
    await leereQueue()
    const a = await stelleMahnungEin(ORG_A, KUNDE_A, 'a@example.org')
    const b = await stelleMahnungEin(ORG_A, KUNDE_A, 'b@example.org')
    await db.exec(
      `UPDATE public.dunning_email_queue SET status = 'aufgegeben', versuche = ${MAHN_MAX_VERSUCHE};`
    )

    halter.antwort = ERFOLG
    const r = await post({ deadLetterReaktivieren: true, queueIds: [a.queueId] })
    expect(r.body.deadLetterReaktiviert).toBe(1)
    expect((await queueZeile(a.queueId)).status).toBe('versendet')
    expect((await queueZeile(b.queueId)).status).toBe('aufgegeben')
  })

  it('ohne Dead Letter bleibt die Wiederaufnahme folgenlos', async () => {
    await leereQueue()
    const r = await post({ deadLetterReaktivieren: true })
    expect(r.body.deadLetterReaktiviert).toBe(0)
  })

  it('erst die Obergrenze, dann das Dead Letter — auch bei lauter Stoerungen', async () => {
    await leereQueue()
    const { queueId: q } = await stelleMahnungEin(ORG_A, KUNDE_A, 'erika@example.org')
    halter.antwort = STOERUNG

    for (let i = 0; i < MAHN_MAX_VERSUCHE; i++) {
      await wartezeitAbgelaufen(q)
      await post({ wiederholen: true })
    }

    const z = await queueZeile(q)
    expect(Number(z.versuche)).toBe(MAHN_MAX_VERSUCHE)
    expect(z.status).toBe('aufgegeben')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Mandantengrenze der Route', () => {
  let aQueue: string
  let bQueue: string

  beforeAll(async () => {
    await leereQueue()
    aQueue = (await stelleMahnungEin(ORG_A, KUNDE_A, 'erika@example.org')).queueId
    bQueue = (await stelleMahnungEin(ORG_B, KUNDE_B, 'bernd@example.org')).queueId
  })

  it('Mandant A versendet nur seine eigene Mahnung', async () => {
    alsNutzer(ADMIN_A, ORG_A)
    const r = await post()
    expect(r.body.versendet).toBe(1)
    expect(halter.aufrufe.map(a => a.to)).toEqual(['erika@example.org'])
    expect((await queueZeile(bQueue)).status).toBe('wartend')
  })

  it('die Wiederaufnahme von Mandant A fasst Mandant B nicht an', async () => {
    await db.exec(
      `UPDATE public.dunning_email_queue SET status = 'aufgegeben' WHERE id = '${bQueue}';`
    )
    alsNutzer(ADMIN_A, ORG_A)
    const r = await post({ deadLetterReaktivieren: true })
    expect(r.body.deadLetterReaktiviert).toBe(0)
    expect((await queueZeile(bQueue)).status).toBe('aufgegeben')
  })

  it('Mandant B holt seine eigene Zeile sehr wohl zurueck', async () => {
    alsNutzer(ADMIN_B, ORG_B)
    halter.aufrufe = []
    const r = await post({ deadLetterReaktivieren: true })
    expect(r.body.deadLetterReaktiviert).toBe(1)
    expect(halter.aufrufe.map(a => a.to)).toEqual(['bernd@example.org'])
  })

  it('Mandant A hat davon nichts abbekommen', async () => {
    expect((await queueZeile(aQueue)).status).toBe('versendet')
  })
})
