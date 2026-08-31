/**
 * E2E: Rechnung unbezahlt → Mahnlauf → Warteschlange → Wiederholung →
 * Dead Letter, vollstaendig auf echtem PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Kette 4 des Phase-4-Auftrags. Die Vorgaenger-Tests decken die beiden
 * Haelften einzeln ab — __tests__/billing/mahnlauf.test.ts die
 * Eskalationsleiter, __tests__/billing/mahn-versand.test.ts den
 * Warteschlangen-Konsumenten — beide gegen eine Fake-Datenbank im
 * Arbeitsspeicher. Hier laufen sie ZUSAMMEN und gegen echte
 * CHECK-Constraints, Fremdschluessel und Defaults.
 *
 * BEFUND, der diese Datei ausgeloest hat: die Warteschlange hatte weder
 * einen Versuchszaehler noch einen Endzustand. Eine einmal gescheiterte
 * Mahnung blieb fuer immer auf 'fehlgeschlagen' liegen (der Mahn-Cron
 * rief ohne `wiederholen` auf), und wer doch wiederholte, wiederholte
 * ohne Obergrenze — auch an eine Adresse, die es nicht gibt. Geschlossen
 * mit 20261001000000_mahnqueue_retry_dead_letter.sql; die Schritte 4 bis
 * 10 unten sind die Gegenprobe.
 *
 * Schritte:
 *    1. Kunde, ueberfaellige und unbezahlte Rechnung
 *    2. Mahnlauf eskaliert auf "Zahlungserinnerung" und fuellt die Queue
 *    3. Ohne RESEND_API_KEY: uebersprungen — der Versuch zaehlt NICHT
 *    4. Provider-Stoerung: fehlgeschlagen, Versuch 1, Wartezeit gesetzt
 *    5. Vor Ablauf der Wartezeit holt der Lauf nichts zurueck
 *    6. Nach Ablauf der Wartezeit laeuft die Zeile wieder an
 *    7. Nach MAHN_MAX_VERSUCHE: Dead Letter mit Audit-Eintrag
 *    8. Ein Dead Letter kommt durch `wiederholen` NICHT zurueck
 *    9. Dauerhafter Fehler: sofort Dead Letter, ohne die Versuche zu verbrennen
 *   10. Erfolgreicher Versand nach einer Stoerung
 *   11. Zahlung zwischen Mahnlauf und Versand ⇒ storniert, keine Mail
 *   12. Die Datenbank selbst haelt Statusliste und Zaehler eng
 *   13. Mandantengrenze der Warteschlange
 *
 * WAS GEMOCKT IST: nur die beiden Aussenkanten — die PDF-Erzeugung
 * (Schriftdateien, kein Erkenntnisgewinn fuer die Zustandsmaschine) und
 * `sendRawEmail`, weil der Test die Provider-Antwort STEUERN muss. Alles
 * dazwischen — Mahnlauf, Warteschlange, Zaehler, Wartezeit, Dead Letter,
 * Audit — laeuft echt gegen Postgres.
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
  /** Antwort, die der naechste sendRawEmail-Aufruf liefert. */
  antwort: null as unknown,
  /** Jeder Aufruf mit Empfaenger und Betreff. */
  aufrufe: [] as Array<{ to: string; subject: string; mitAnhang: boolean }>,
}))

vi.mock('@/lib/notifications', () => ({
  sendRawEmail: async (p: { to: string; subject: string; attachments?: unknown[] }) => {
    halter.aufrufe.push({
      to: p.to,
      subject: p.subject,
      mitAnhang: Array.isArray(p.attachments) && p.attachments.length > 0,
    })
    const a = halter.antwort
    if (a instanceof Error) throw a
    return a
  },
}))

// Die PDF-Erzeugung braucht Schriftdateien und sagt ueber die
// Zustandsmaschine nichts aus.
vi.mock('@/lib/billing/dunning/mahnung-pdf-datei', () => ({
  hatMahnText: (stufe: string) => stufe !== 'offen' && stufe !== 'inkasso_vorbereitung',
  mahnungDateiname: () => 'Mahnung-TEST.pdf',
  erzeugeMahnungPdf: async () => new Uint8Array([37, 80, 68, 70]), // "%PDF"
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => halter.client,
}))

import { runDunningRun, DUNNING_DAYS } from '@/lib/billing/core/dunning'
import {
  verarbeiteMahnQueue,
  reaktiviereFehlgeschlagene,
  reaktiviereAufgegebene,
  zaehleWartendeMahnmails,
  zaehleAufgegebeneMahnmails,
  bewerteMahnFehlschlag,
  MAHN_MAX_VERSUCHE,
} from '@/lib/billing/dunning/mahn-versand'

// ─────────────────────────────────────────────────────────────────────
// Feste IDs
// ─────────────────────────────────────────────────────────────────────

const ORG_A = STAMM_ORG
const ORG_B = '00000000-0000-4000-8000-0000000000b0'
const ADMIN = '00000000-0000-4000-8000-00000000a001'
const KUNDE = '00000000-0000-4000-8000-00000000c001'
const KUNDE_B = '00000000-0000-4000-8000-00000000c002'

let db: PGlite
let admin: SupabaseClient

/** Antwort des Providers fuer den naechsten Lauf festlegen. */
function providerAntwortet(a: unknown) {
  halter.antwort = a
}

const ERFOLG = { ok: true, uebersprungen: false, messageId: 'msg-1' }
const OHNE_SCHLUESSEL = { ok: false, uebersprungen: true, grund: 'RESEND_API_KEY nicht konfiguriert' }
const STOERUNG = {
  ok: false, uebersprungen: false, grund: 'Provider nicht erreichbar',
  statusCode: 503, fehler: { statusCode: 503, message: 'service unavailable' },
}
const ADRESSE_UNGUELTIG = {
  ok: false, uebersprungen: false, grund: 'invalid_email: recipient not accepted',
  statusCode: 422, fehler: { statusCode: 422, message: 'invalid_email' },
}

/** Datum als YYYY-MM-DD, N Tage vor heute. */
function vorTagen(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

let rechnungsZaehler = 0

/**
 * Legt eine ueberfaellige, unbezahlte Rechnung an und liefert ihre ID.
 * `tageUeberfaellig` steuert, welche Mahnstufe der Lauf erreicht.
 */
async function ueberfaelligeRechnung(
  organizationId: string,
  clientId: string,
  tageUeberfaellig: number,
): Promise<string> {
  rechnungsZaehler++
  const nummer = 2000 + rechnungsZaehler
  const { data, error } = await admin
    .from('invoices')
    .insert({
      organization_id: organizationId,
      client_id: clientId,
      invoice_number: String(nummer),
      invoice_number_formatted: `RE-2026-${nummer}`,
      // invoices hat kein invoice_date — das Belegdatum ist created_at,
      // der Abrechnungszeitraum steht in period_start/period_end.
      period_start: vorTagen(tageUeberfaellig + 44),
      period_end: vorTagen(tageUeberfaellig + 15),
      due_date: vorTagen(tageUeberfaellig),
      status: 'freigegeben',
      // Eine freigegebene Rechnung ist festgeschrieben — freezeInvoice setzt
      // Status und frozen_at gemeinsam. Der Mahnlauf-Vorfilter verlangt
      // frozen_at (synthetische Zeilen ohne Festschreibung bleiben draußen).
      frozen_at: vorTagen(tageUeberfaellig + 15),
      total_amount: 210,
      paid_amount: 0,
      dunning_level: 'offen',
      payment_terms_days: 14,
    })
    .select('id')

  if (error) throw new Error(`Rechnung nicht anlegbar: ${error.message}`)
  return String((data as Array<{ id: string }>)[0].id)
}

/** Die Queue-Zeile zu einer Rechnung, roh aus der Datenbank. */
async function queueZeile(invoiceId: string): Promise<Record<string, unknown>> {
  const r = await db.query<Record<string, unknown>>(
    `SELECT * FROM public.dunning_email_queue WHERE invoice_id = $1`,
    [invoiceId],
  )
  expect(r.rows.length, 'genau eine Queue-Zeile je Rechnung').toBe(1)
  return r.rows[0]
}

/** Wartezeit kuenstlich verstreichen lassen. */
async function wartezeitAbgelaufen(invoiceId: string): Promise<void> {
  await db.query(
    `UPDATE public.dunning_email_queue
        SET naechster_versuch_ab = now() - interval '1 minute'
      WHERE invoice_id = $1`,
    [invoiceId],
  )
}

/** Einen vollen Lauf fahren: faellige Wiederholungen mitnehmen. */
function lauf(organizationId = ORG_A) {
  return verarbeiteMahnQueue(admin, { organizationId, actorId: ADMIN, wiederholen: true })
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await baueMahnTabellen(db)
  admin = macheSupabaseClient(db) as unknown as SupabaseClient
  halter.client = admin

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'verwaltung@alltagsengel.care');

    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${ORG_A}', 'Mandant Alpha', 'hessen', 'active'),
      ('${ORG_B}', 'Mandant Beta',  'bayern', 'active')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, email, role) VALUES
      ('${ADMIN}', 'verwaltung@alltagsengel.care', 'admin');

    INSERT INTO public.clients
      (id, organization_id, customer_number, first_name, last_name, email, zip_code)
    VALUES
      ('${KUNDE}',   '${ORG_A}', 'A-0001', 'Erika', 'Musterfrau', 'erika@example.org', '60311'),
      ('${KUNDE_B}', '${ORG_B}', 'B-0001', 'Bernd', 'Beispiel',   'bernd@example.org', '80331');
  `)
}, 120_000)

afterAll(async () => {
  await db?.close()
})

beforeEach(() => {
  halter.aufrufe = []
  providerAntwortet(ERFOLG)
})

// ═════════════════════════════════════════════════════════════════════
describe('Schritt 1-2: Mahnlauf fuellt die Warteschlange', () => {
  let rechnung: string

  it('Schritt 1: eine ueberfaellige, unbezahlte Rechnung existiert', async () => {
    rechnung = await ueberfaelligeRechnung(ORG_A, KUNDE, DUNNING_DAYS.erinnerung + 3)

    const { data } = await admin.from('invoices').select('*').eq('id', rechnung).maybeSingle()
    expect(data).toBeTruthy()
    expect((data as Record<string, unknown>).dunning_level).toBe('offen')
  })

  it('Schritt 2: der Lauf eskaliert auf "Zahlungserinnerung" und legt genau EINE Queue-Zeile an', async () => {
    const ergebnis = await runDunningRun(admin, ORG_A, ADMIN, { sendEmails: true })

    expect(ergebnis.eskaliert.map(e => e.toLevel)).toContain('erinnerung')
    expect(ergebnis.blockiert).toEqual([])

    const zeile = await queueZeile(rechnung)
    expect(zeile.status).toBe('wartend')
    expect(zeile.empfaenger_email).toBe('erika@example.org')
    // Die Migration setzt den Zaehler auf 0 — noch wurde nichts versucht.
    expect(Number(zeile.versuche)).toBe(0)
    expect(zeile.letzter_versuch_am).toBeNull()
    expect(zeile.naechster_versuch_ab).toBeNull()
  })

  it('Schritt 3: ohne RESEND_API_KEY bleibt die Zeile wartend — der Versuch zaehlt NICHT', async () => {
    providerAntwortet(OHNE_SCHLUESSEL)
    const ergebnis = await lauf()

    expect(ergebnis.uebersprungen).toBe(1)
    expect(ergebnis.fehlgeschlagen).toBe(0)
    expect(ergebnis.aufgegeben).toBe(0)

    const zeile = await queueZeile(rechnung)
    expect(zeile.status).toBe('wartend')
    expect(
      Number(zeile.versuche),
      'eine fehlende Umgebungsvariable darf kein Versuchskontingent verbrennen',
    ).toBe(0)
  })

  it('Schritt 4: eine Provider-Stoerung setzt Zaehler und Wartezeit', async () => {
    providerAntwortet(STOERUNG)
    const ergebnis = await lauf()

    expect(ergebnis.fehlgeschlagen).toBe(1)
    expect(ergebnis.aufgegeben).toBe(0)

    const zeile = await queueZeile(rechnung)
    expect(zeile.status).toBe('fehlgeschlagen')
    expect(Number(zeile.versuche)).toBe(1)
    expect(zeile.letzter_versuch_am).not.toBeNull()
    expect(zeile.naechster_versuch_ab).not.toBeNull()
    expect(String(zeile.fehler_details)).toContain(`Versuch 1 von ${MAHN_MAX_VERSUCHE}`)
    // versendet_am wurde beim Rollback wieder geleert — die Mahnung ist
    // nicht raus, und nichts darf so aussehen.
    expect(zeile.versendet_am).toBeNull()
  })

  it('Schritt 5: vor Ablauf der Wartezeit holt der Lauf die Zeile NICHT zurueck', async () => {
    providerAntwortet(ERFOLG)
    const ergebnis = await lauf()

    expect(ergebnis.reaktiviert).toBe(0)
    expect(ergebnis.geprueft).toBe(0)
    expect(halter.aufrufe, 'kein Versandversuch waehrend der Wartezeit').toEqual([])

    const zeile = await queueZeile(rechnung)
    expect(zeile.status).toBe('fehlgeschlagen')
    expect(Number(zeile.versuche)).toBe(1)
  })

  it('Schritt 6: nach Ablauf der Wartezeit laeuft die Zeile wieder an', async () => {
    await wartezeitAbgelaufen(rechnung)
    providerAntwortet(STOERUNG)
    const ergebnis = await lauf()

    expect(ergebnis.reaktiviert).toBe(1)
    expect(ergebnis.geprueft).toBe(1)
    expect(ergebnis.fehlgeschlagen).toBe(1)

    const zeile = await queueZeile(rechnung)
    expect(Number(zeile.versuche)).toBe(2)
  })

  it(`Schritt 7: nach ${MAHN_MAX_VERSUCHE} Versuchen geht die Zeile ins Dead Letter`, async () => {
    providerAntwortet(STOERUNG)

    // Versuche 3 bis MAHN_MAX_VERSUCHE.
    for (let n = 3; n <= MAHN_MAX_VERSUCHE; n++) {
      await wartezeitAbgelaufen(rechnung)
      const ergebnis = await lauf()
      expect(ergebnis.geprueft, `Lauf fuer Versuch ${n}`).toBe(1)
    }

    const zeile = await queueZeile(rechnung)
    expect(zeile.status).toBe('aufgegeben')
    expect(Number(zeile.versuche)).toBe(MAHN_MAX_VERSUCHE)
    expect(String(zeile.fehler_details)).toContain('Obergrenze erreicht')
    expect(
      zeile.naechster_versuch_ab,
      'ein Endzustand traegt keine Wartezeit — sonst sieht er wiederholbar aus',
    ).toBeNull()

    expect(await zaehleAufgegebeneMahnmails(admin, ORG_A)).toBe(1)
    expect(await zaehleWartendeMahnmails(admin, ORG_A)).toBe(0)
  })

  it('Schritt 7b: das Dead Letter steht im Pruefpfad', async () => {
    const r = await db.query<{ action: string; new_state: Record<string, unknown> }>(
      `SELECT action, new_state FROM public.billing_audit_trail
        WHERE entity_type = 'dunning' AND action = 'email_aufgegeben'`,
    )
    expect(r.rows.length).toBe(1)
    expect(Number(r.rows[0].new_state.versuche)).toBe(MAHN_MAX_VERSUCHE)
    expect(Number(r.rows[0].new_state.max_versuche)).toBe(MAHN_MAX_VERSUCHE)
  })

  it('Schritt 8: `wiederholen` holt ein Dead Letter NICHT zurueck', async () => {
    providerAntwortet(ERFOLG)
    const ergebnis = await lauf()

    expect(ergebnis.reaktiviert).toBe(0)
    expect(ergebnis.geprueft).toBe(0)
    expect(halter.aufrufe).toEqual([])

    // Nur die ausdrueckliche Entscheidung der Verwaltung holt sie zurueck.
    const zurueck = await reaktiviereAufgegebene(admin, ORG_A)
    expect(zurueck).toBe(1)

    const zeile = await queueZeile(rechnung)
    expect(zeile.status).toBe('wartend')
    expect(Number(zeile.versuche), 'die Verwaltung gibt der Zeile ihr Kontingent neu').toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Dauerhafte Fehler gehen sofort ins Dead Letter', () => {
  let rechnung: string

  beforeAll(async () => {
    rechnung = await ueberfaelligeRechnung(ORG_A, KUNDE, DUNNING_DAYS.erinnerung + 5)
    await runDunningRun(admin, ORG_A, ADMIN, { sendEmails: true })
  })

  it('Schritt 9: eine abgelehnte Adresse verbrennt keine vier weiteren Versuche', async () => {
    providerAntwortet(ADRESSE_UNGUELTIG)
    const ergebnis = await verarbeiteMahnQueue(admin, {
      organizationId: ORG_A, actorId: ADMIN, wiederholen: true,
    })

    // Der Lauf nimmt alles Wartende der Organisation mit — bewertet wird
    // hier nur die Zeile dieses Falls.
    const dieser = ergebnis.details.filter(d => d.invoiceId === rechnung)
    expect(dieser.length).toBe(1)
    expect(dieser[0].status).toBe('aufgegeben')
    expect(ergebnis.fehlgeschlagen).toBe(0)

    const zeile = await queueZeile(rechnung)
    expect(zeile.status).toBe('aufgegeben')
    expect(Number(zeile.versuche)).toBe(1)
    expect(String(zeile.fehler_details)).toContain('dauerhaft unzustellbar')
  })

  it('die Einstufung selbst trennt voruebergehend von dauerhaft', () => {
    expect(bewerteMahnFehlschlag({ statusCode: 503 }, 1).ziel).toBe('fehlgeschlagen')
    expect(bewerteMahnFehlschlag({ statusCode: 429 }, 1).ziel).toBe('fehlgeschlagen')
    // 401/403 sind Betriebsprobleme (Schluesselrotation), keine
    // Empfaengerprobleme — sie bleiben wiederholbar.
    expect(bewerteMahnFehlschlag({ statusCode: 401 }, 1).ziel).toBe('fehlgeschlagen')
    expect(bewerteMahnFehlschlag({ statusCode: 422 }, 1).ziel).toBe('aufgegeben')
    expect(bewerteMahnFehlschlag({ statusCode: 503 }, MAHN_MAX_VERSUCHE).ziel).toBe('aufgegeben')
  })

  it('die Wartezeit waechst mit jedem Versuch', () => {
    const jetzt = new Date('2026-08-23T12:00:00.000Z')
    const abstaende = [1, 2, 3, 4].map(n => {
      const bis = bewerteMahnFehlschlag({ statusCode: 503 }, n, jetzt).naechsterVersuchAb
      return new Date(String(bis)).getTime() - jetzt.getTime()
    })
    for (let i = 1; i < abstaende.length; i++) {
      expect(abstaende[i]).toBeGreaterThan(abstaende[i - 1])
    }
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Der gluecklich endende Weg', () => {
  let rechnung: string

  beforeAll(async () => {
    rechnung = await ueberfaelligeRechnung(ORG_A, KUNDE, DUNNING_DAYS.erinnerung + 7)
    await runDunningRun(admin, ORG_A, ADMIN, { sendEmails: true })
  })

  it('Schritt 10: nach einer Stoerung geht die Mahnung beim naechsten Lauf raus', async () => {
    providerAntwortet(STOERUNG)
    await lauf()
    expect((await queueZeile(rechnung)).status).toBe('fehlgeschlagen')

    await wartezeitAbgelaufen(rechnung)
    providerAntwortet(ERFOLG)
    halter.aufrufe = []
    const ergebnis = await lauf()

    expect(ergebnis.versendet).toBe(1)
    expect(halter.aufrufe.length).toBe(1)
    expect(halter.aufrufe[0].to).toBe('erika@example.org')
    expect(halter.aufrufe[0].mitAnhang, 'die Zahlungserinnerung hat ein PDF').toBe(true)

    const zeile = await queueZeile(rechnung)
    expect(zeile.status).toBe('versendet')
    expect(zeile.versendet_am).not.toBeNull()
    expect(Number(zeile.versuche)).toBe(2)
  })

  it('ein weiterer Lauf versendet dieselbe Mahnung nicht noch einmal', async () => {
    halter.aufrufe = []
    const ergebnis = await lauf()
    expect(ergebnis.geprueft).toBe(0)
    expect(halter.aufrufe).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Zahlung zwischen Mahnlauf und Versand', () => {
  it('Schritt 11: die Mahnung wird storniert statt verschickt', async () => {
    const rechnung = await ueberfaelligeRechnung(ORG_A, KUNDE, DUNNING_DAYS.erinnerung + 9)
    await runDunningRun(admin, ORG_A, ADMIN, { sendEmails: true })
    expect((await queueZeile(rechnung)).status).toBe('wartend')

    // Der Kunde zahlt, nachdem die Mahnung in der Queue liegt.
    await admin.from('invoices').update({ paid_amount: 210, status: 'bezahlt' }).eq('id', rechnung)

    halter.aufrufe = []
    providerAntwortet(ERFOLG)
    const ergebnis = await lauf()

    expect(ergebnis.storniert).toBe(1)
    expect(ergebnis.versendet).toBe(0)
    expect(halter.aufrufe, 'ein zahlender Kunde darf keine Mahnung bekommen').toEqual([])

    const zeile = await queueZeile(rechnung)
    expect(zeile.status).toBe('storniert')
    expect(Number(zeile.versuche), 'ein Stopp ist kein Versuch').toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Die Datenbank haelt die Grenzen selbst', () => {
  it('Schritt 12a: der Status-CHECK kennt "aufgegeben" und weist Erfundenes ab', async () => {
    const rechnung = await ueberfaelligeRechnung(ORG_A, KUNDE, 30)

    const gueltig = await admin.from('dunning_email_queue').insert({
      organization_id: ORG_A, invoice_id: rechnung,
      empfaenger_email: 'erika@example.org', betreff: 'x', inhalt: 'y',
      status: 'aufgegeben',
    }).select('id')
    expect(gueltig.error).toBeNull()

    const ungueltig = await admin.from('dunning_email_queue').insert({
      organization_id: ORG_A, invoice_id: rechnung,
      empfaenger_email: 'erika@example.org', betreff: 'x', inhalt: 'y',
      status: 'erledigt_irgendwie',
    }).select('id')
    expect(ungueltig.error?.code).toBe('23514')
  })

  it('Schritt 12b: der Versuchszaehler kann nicht negativ werden', async () => {
    const rechnung = await ueberfaelligeRechnung(ORG_A, KUNDE, 31)

    const { error } = await admin.from('dunning_email_queue').insert({
      organization_id: ORG_A, invoice_id: rechnung,
      empfaenger_email: 'erika@example.org', betreff: 'x', inhalt: 'y',
      versuche: -1,
    }).select('id')
    expect(error?.code).toBe('23514')
  })

  it('Schritt 12c: eine Queue-Zeile ohne Mandanten ist nicht anlegbar', async () => {
    const rechnung = await ueberfaelligeRechnung(ORG_A, KUNDE, 32)

    const { error } = await admin.from('dunning_email_queue').insert({
      organization_id: null, invoice_id: rechnung,
      empfaenger_email: 'erika@example.org', betreff: 'x', inhalt: 'y',
    }).select('id')
    expect(error?.code).toBe('23502')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Mandantengrenze', () => {
  it('Schritt 13: ein Lauf fasst nur die eigene Organisation an', async () => {
    const rechnungB = await ueberfaelligeRechnung(ORG_B, KUNDE_B, DUNNING_DAYS.erinnerung + 2)
    await runDunningRun(admin, ORG_B, ADMIN, { sendEmails: true })
    expect((await queueZeile(rechnungB)).status).toBe('wartend')

    halter.aufrufe = []
    providerAntwortet(ERFOLG)

    // Lauf fuer Mandant A — die Zeile von B darf er nicht sehen.
    const ergebnisA = await lauf(ORG_A)
    expect(halter.aufrufe.some(a => a.to === 'bernd@example.org')).toBe(false)
    expect(ergebnisA.details.some(d => d.invoiceId === rechnungB)).toBe(false)
    expect((await queueZeile(rechnungB)).status).toBe('wartend')

    // Und der Lauf fuer B holt sie ab.
    halter.aufrufe = []
    const ergebnisB = await lauf(ORG_B)
    expect(ergebnisB.versendet).toBe(1)
    expect(halter.aufrufe[0].to).toBe('bernd@example.org')
  })

  it('die Zaehler und die Wiederholung sind ebenfalls mandantengetrennt', async () => {
    expect(await zaehleAufgegebeneMahnmails(admin, ORG_B)).toBe(0)

    // Ein faelliger Fehlversuch in A — und nur in A.
    const rechnungA = await ueberfaelligeRechnung(ORG_A, KUNDE, 60)
    await admin.from('dunning_email_queue').insert({
      organization_id: ORG_A, invoice_id: rechnungA,
      empfaenger_email: 'erika@example.org', betreff: 'x', inhalt: 'y',
      status: 'fehlgeschlagen', versuche: 1,
      naechster_versuch_ab: new Date(Date.now() - 3_600_000).toISOString(),
    }).select('id')

    const reaktiviertB = await reaktiviereFehlgeschlagene(admin, ORG_B)
    expect(reaktiviertB, 'B hat keine faelligen Fehlversuche').toBe(0)
    expect((await queueZeile(rechnungA)).status, 'der Lauf von B laesst A in Ruhe')
      .toBe('fehlgeschlagen')

    const reaktiviertA = await reaktiviereFehlgeschlagene(admin, ORG_A)
    expect(reaktiviertA).toBe(1)
    expect((await queueZeile(rechnungA)).status).toBe('wartend')
  })
})
