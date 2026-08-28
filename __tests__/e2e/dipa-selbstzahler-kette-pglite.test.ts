/**
 * E2E: DiPA/PflegeCoach — Selbstzahler-Kette auf echtem Postgres
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WARUM DIESE SUITE: `lib/coach/verkauf-server.ts` ist die einzige Datei,
 * die den bezahlten Zugang tatsächlich VERÄNDERT — Freischaltung anlegen,
 * Zahlung verbuchen, Rechnung ausstellen, Zugang beenden. Sie hatte keinen
 * einzigen Test. Geprüft waren nur die reinen Rechenmodule daneben
 * (`bestellung.ts`, `pricing.ts`, `rechnung.ts`, `freischaltung.ts`).
 *
 * Das ist genau die Trennung, an der eine Fake-Datenbank nichts beweist:
 * Der Modulkopf beruft sich für die Idempotenz auf UNIQUE-Spalten und auf
 * einen Nummernkreis aus einer Sequenz. Beides sind Zusicherungen der
 * DATENBANK. Ein Doppelgänger, der sie nachbildet, prüft die Nachbildung.
 * Deshalb läuft hier ein echtes Postgres (PGlite) mit den Tabellen
 * WORTGLEICH aus den Migrationen (siehe helpers/coach-schema.ts).
 *
 * WAS GEMOCKT IST: nur `createAdminClient` — sonst nichts. Es gibt in
 * dieser Kette keinen HTTP-Aufruf, keine Stripe-Verbindung und keine Mail.
 * Statusübergänge, Idempotenz, Nummernkreis, Steuerzerlegung und die
 * Wirkung auf `istFreigeschaltet()` laufen echt.
 *
 * VIER FRAGEN, DIE HIER BEANTWORTET WERDEN:
 *
 *  1. Wird aus einer bezahlten Bestellung ein WIRKSAMER Zugang? Nicht:
 *     „steht eine Zeile in coach_freischaltungen", sondern: liefert
 *     `istFreigeschaltet()` — die einzige Zugangsprüfung des Produkts —
 *     danach true?
 *
 *  2. Hält die Kette die Stripe-Wiederholung aus? Stripe stellt Ereignisse
 *     ausdrücklich „at least once" und ohne Reihenfolgegarantie zu. Jede
 *     Funktion muss beim zweiten Aufruf dasselbe Ergebnis erzeugen und
 *     nichts doppelt anlegen. Geprüft wird auch der TOCTOU-Fall, den
 *     Migration 20261009000002 abfängt: zwei INSERTs, die beide den
 *     select-then-insert-Vorabblick vor dem jeweils anderen gesehen haben.
 *
 *  3. Wirkt der Widerruf HEUTE? `beendeZugang(sofort=true)` setzt
 *     `gueltig_bis` auf GESTERN, nicht auf heute — sonst bliebe der Zugang
 *     bis Mitternacht offen. Beim Widerruf ist das falsch, weil der Vertrag
 *     als nie geschlossen gilt (§ 355 BGB). Der Unterschied ist einen Tag
 *     groß und in einer Fake-DB unsichtbar; hier wird er gegen
 *     `istFreigeschaltet()` gemessen.
 *
 *  4. Entsteht eine Rechnung, die sich nicht vollständig NENNT, wenn sie
 *     es nicht ist? Die Steuernummer der UG ist noch nicht zugeteilt.
 *     Die Kette darf daraus keine Rechnung machen, die vollständig
 *     AUSSIEHT — der Mangel gehört in `angaben_unvollstaendig`.
 *
 * KEINE ZULASSUNGSAUSSAGE: Diese Suite prüft Technik. Der PflegeCoach ist
 * in Produktion nicht verkäuflich (`verkauf_moeglich: false`), der
 * DiPA-Modus ist aus, und daran ändert ein grüner Lauf nichts.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueCoachSchema, legeNutzerAn, legeBestellungAn } from './helpers/coach-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

// ─────────────────────────────────────────────────────────────────────
// Einzige Aussenkante: der Dienstschluessel-Client.
// ─────────────────────────────────────────────────────────────────────
const halter = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => halter.client,
}))

import {
  aktiviereBestellung,
  beendeZugang,
  bestellungPerCheckout,
  bestellungPerSubscription,
  massgeblicheBestellung,
  schalteZugangFrei,
  setzeStatus,
  stelleRechnungAus,
  verbucheZahlung,
} from '@/lib/coach/verkauf-server'
import { istFreigeschaltet, type FreischaltungZeile } from '@/lib/coach/freischaltung'
import { heuteBerlin } from '@/lib/utils/timezone'
import type { CoachBestellung } from '@/lib/coach/types'
import {
  COACH_STEUERNUMMER_ENV,
  COACH_UST_ID_ENV,
} from '@/lib/coach/rechnung'
import { COACH_UST_KLEINUNTERNEHMER_ENV, COACH_UST_SATZ_ENV } from '@/lib/coach/pricing'

const NUTZER_A = '00000000-0000-4000-8000-0000000000a1'
const NUTZER_B = '00000000-0000-4000-8000-0000000000b1'

let db: PGlite
let coachUserA: string
let coachUserB: string

/** Alle Freischaltungen eines Nutzers in der Form, die istFreigeschaltet() erwartet. */
async function freischaltungen(coachUserId: string): Promise<FreischaltungZeile[]> {
  const r = await db.query<FreischaltungZeile>(
    `SELECT status, gueltig_von::text AS gueltig_von, gueltig_bis::text AS gueltig_bis
       FROM coach_freischaltungen WHERE coach_user_id = $1`,
    [coachUserId],
  )
  return r.rows
}

async function zaehle(tabelle: string, wo = '', params: unknown[] = []): Promise<number> {
  const r = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ${tabelle} ${wo ? 'WHERE ' + wo : ''}`,
    params as never[],
  )
  return Number(r.rows[0].n)
}

/**
 * Bestellung als Objekt, wie verkauf-server.ts es erwartet.
 *
 * `laufzeit_bis` wird ausdruecklich als Text nachgezogen: PGlite liefert
 * `date` als JS-Date, PostgREST dagegen als 'YYYY-MM-DD'. Ohne die
 * Vereinheitlichung prueft der Test ein Format, das live nie ankommt —
 * derselbe Grund, aus dem der Shim in helpers/pglite-supabase.ts das tut.
 */
async function holeBestellung(id: string): Promise<CoachBestellung> {
  const r = await db.query<CoachBestellung>(
    `SELECT *, laufzeit_bis::text AS laufzeit_bis FROM coach_bestellungen WHERE id = $1`,
    [id],
  )
  return r.rows[0]
}

beforeAll(async () => {
  db = await baueCoachSchema()
  halter.client = macheSupabaseClient(db) as unknown as SupabaseClient
  coachUserA = (await legeNutzerAn(db, NUTZER_A)).coachUserId
  coachUserB = (await legeNutzerAn(db, NUTZER_B)).coachUserId
})

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  // Aufräumen in Fremdschlüssel-Reihenfolge; die Sequenz bleibt bewusst
  // stehen — ein Nummernkreis wird live auch nicht zurückgesetzt.
  await db.exec(`
    DELETE FROM coach_rechnungen;
    DELETE FROM coach_zahlungen;
    DELETE FROM coach_freischaltungen;
    DELETE FROM coach_bestellungen;
  `)
  delete process.env[COACH_STEUERNUMMER_ENV]
  delete process.env[COACH_UST_ID_ENV]
  delete process.env[COACH_UST_KLEINUNTERNEHMER_ENV]
  delete process.env[COACH_UST_SATZ_ENV]
})

// ═══════════════════════════════════════════════════════════════════
describe('Kette 1 — aus der bezahlten Bestellung wird ein wirksamer Zugang', () => {
  it('aktiviereBestellung setzt Status, Laufzeit UND schaltet frei', async () => {
    const id = await legeBestellungAn(db, coachUserA)
    const bestellung = await holeBestellung(id)

    const bis = await aktiviereBestellung(bestellung, 'sub_test_1', '2026-09-30')

    expect(bis).toBe('2026-09-30')
    const nachher = await holeBestellung(id)
    expect(nachher.status).toBe('aktiv')
    expect(nachher.laufzeit_bis).toBe('2026-09-30')
    expect(nachher.stripe_subscription_id).toBe('sub_test_1')

    // Der eigentliche Punkt: nicht „eine Zeile existiert", sondern die
    // Zugangsprüfung des Produkts sagt ja.
    expect(istFreigeschaltet(await freischaltungen(coachUserA), heuteBerlin())).toBe(true)
  })

  it('die Freischaltung trägt die Quelle „selbstzahler"', async () => {
    // Ohne diesen CHECK-Wert (nachgezogen in 20260907000100) schlüge der
    // INSERT fehl — und der Zugang entstünde stillschweigend nicht.
    const id = await legeBestellungAn(db, coachUserA)
    await aktiviereBestellung(await holeBestellung(id), null, '2026-09-30')
    const r = await db.query<{ quelle: string; bestellung_id: string }>(
      `SELECT quelle, bestellung_id FROM coach_freischaltungen WHERE coach_user_id = $1`,
      [coachUserA],
    )
    expect(r.rows[0].quelle).toBe('selbstzahler')
    expect(r.rows[0].bestellung_id).toBe(id)
  })

  it('ohne Zeitraum aus Stripe wird das Laufzeitende aus dem Intervall gerechnet', async () => {
    // Der Zugang darf nicht daran scheitern, dass ein Feld im Ereignis
    // fehlte. Gerechnet wird ab heute über intervall_monate.
    const id = await legeBestellungAn(db, coachUserA, { tarif: 'jaehrlich', intervallMonate: 12 })
    const bis = await aktiviereBestellung(await holeBestellung(id), null, null)

    const heute = heuteBerlin()
    expect(bis > heute).toBe(true)
    expect(Number(bis.slice(0, 4))).toBe(Number(heute.slice(0, 4)) + 1)
    expect(istFreigeschaltet(await freischaltungen(coachUserA), heute)).toBe(true)
  })

  it('eine Verlängerung schreibt die bestehende Zeile fort statt eine zweite anzulegen', async () => {
    // Sonst zeigte die Zugangsliste nach einem Jahr zwölf Einträge.
    const id = await legeBestellungAn(db, coachUserA)
    const bestellung = await holeBestellung(id)
    await aktiviereBestellung(bestellung, 'sub_v', '2026-09-30')
    await schalteZugangFrei(id, coachUserA, '2026-10-31')

    expect(await zaehle('coach_freischaltungen', 'bestellung_id = $1', [id])).toBe(1)
    const r = await db.query<{ gueltig_bis: string }>(
      `SELECT gueltig_bis::text AS gueltig_bis FROM coach_freischaltungen WHERE bestellung_id = $1`,
      [id],
    )
    expect(r.rows[0].gueltig_bis).toBe('2026-10-31')
  })

  it('ein wiederbelebter Zugang steht wieder auf „aktiv"', async () => {
    // Fall: gekündigt/abgelaufen, dann zahlt der Nutzer erneut. Ohne das
    // Zurücksetzen des Status bliebe die Zeile auf 'abgelaufen' und
    // istFreigeschaltet() liefe trotz gültiger Frist auf false.
    const id = await legeBestellungAn(db, coachUserA)
    await aktiviereBestellung(await holeBestellung(id), null, '2026-09-30')
    await beendeZugang(id, false)
    await schalteZugangFrei(id, coachUserA, '2026-12-31')

    const zeilen = await freischaltungen(coachUserA)
    expect(zeilen).toHaveLength(1)
    expect(zeilen[0].status).toBe('aktiv')
    expect(istFreigeschaltet(zeilen, heuteBerlin())).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Kette 2 — Stripe liefert doppelt', () => {
  it('zweimal aktivieren erzeugt genau eine Freischaltung', async () => {
    const id = await legeBestellungAn(db, coachUserA)
    const bestellung = await holeBestellung(id)
    await aktiviereBestellung(bestellung, 'sub_d', '2026-09-30')
    await aktiviereBestellung(await holeBestellung(id), 'sub_d', '2026-09-30')

    expect(await zaehle('coach_freischaltungen', 'bestellung_id = $1', [id])).toBe(1)
  })

  it('der UNIQUE-Index fängt den Wettlauf ab, den der Vorabblick nicht sieht', async () => {
    // Nachgestellt wird der TOCTOU-Fall aus 20261009000002: eine ZWEITE
    // Zeile ist bereits da, wenn schalteZugangFrei() ihren INSERT abgibt.
    // Der Vorabblick (select-then-insert) hat sie nicht gesehen. Ohne den
    // Index entstünden hier zwei aktive Zugänge zur selben Bestellung.
    const id = await legeBestellungAn(db, coachUserA)

    // Zeile direkt einfügen, ohne über das Modul zu gehen — das ist der
    // Zustand, den der zweite Webhook vorfindet.
    await db.query(
      `INSERT INTO coach_freischaltungen (coach_user_id, bestellung_id, quelle, status, gueltig_von, gueltig_bis)
       VALUES ($1,$2,'selbstzahler','widerrufen',CURRENT_DATE,'2026-01-01')`,
      [coachUserA, id],
    )
    const doppelt = db.query(
      `INSERT INTO coach_freischaltungen (coach_user_id, bestellung_id, quelle, status, gueltig_von, gueltig_bis)
       VALUES ($1,$2,'selbstzahler','aktiv',CURRENT_DATE,'2026-12-31')`,
      [coachUserA, id],
    )
    // Die Datenbank selbst lehnt ab — das ist der Riegel, auf den sich der
    // 23505-Zweig in schalteZugangFrei() verlässt.
    await expect(doppelt).rejects.toThrow(/duplicate key|unique/i)

    // Und der Modulweg macht daraus eine Fortschreibung, keinen Fehler.
    await schalteZugangFrei(id, coachUserA, '2026-12-31')
    const zeilen = await freischaltungen(coachUserA)
    expect(zeilen).toHaveLength(1)
    expect(zeilen[0].status).toBe('aktiv')
    expect(zeilen[0].gueltig_bis).toBe('2026-12-31')
  })

  it('Gegenprobe: OHNE den Index entstehen tatsächlich zwei Zugänge', async () => {
    // Ohne diese Zeile wäre der Test darüber auch dann grün, wenn der
    // Index gar nicht greift und der Fehler aus einer anderen Ecke kommt.
    // Hier läuft ein zweites Postgres im Stand VOR Migration 20261009000002.
    const alt = await baueCoachSchema(false)
    try {
      const nutzer = await legeNutzerAn(alt, NUTZER_A)
      const bestellId = await legeBestellungAn(alt, nutzer.coachUserId)
      for (const status of ['aktiv', 'aktiv']) {
        await alt.query(
          `INSERT INTO coach_freischaltungen (coach_user_id, bestellung_id, quelle, status, gueltig_von)
           VALUES ($1,$2,'selbstzahler',$3,CURRENT_DATE)`,
          [nutzer.coachUserId, bestellId, status],
        )
      }
      const r = await alt.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM coach_freischaltungen WHERE bestellung_id = $1`,
        [bestellId],
      )
      expect(Number(r.rows[0].n)).toBe(2)
    } finally {
      await alt.close()
    }
  }, 60_000)

  it('dieselbe Stripe-Rechnung wird nur einmal verbucht', async () => {
    const id = await legeBestellungAn(db, coachUserA)
    const bestellung = await holeBestellung(id)
    const eingang = {
      bestellung, art: 'zahlung' as const, betragCent: 1490,
      zeitraumVon: '2026-09-01', zeitraumBis: '2026-09-30',
      stripeInvoiceId: 'in_test_1', stripePaymentIntent: 'pi_test_1',
    }
    const erste = await verbucheZahlung(eingang)
    const zweite = await verbucheZahlung(eingang)

    expect(erste).toBeTruthy()
    expect(zweite).toBeNull()
    expect(await zaehle('coach_zahlungen', 'bestellung_id = $1', [id])).toBe(1)
  })

  it('zwei Zahlungen OHNE Stripe-Rechnungsnummer sind zwei Zahlungen', async () => {
    // Gegenprobe zur Idempotenz: sie darf nicht so weit gehen, dass zwei
    // echte Abbuchungen zu einer verschmelzen. Der Schlüssel ist die
    // Stripe-Rechnungsnummer, nicht „Bestellung plus Betrag".
    const id = await legeBestellungAn(db, coachUserA)
    const bestellung = await holeBestellung(id)
    const eingang = {
      bestellung, art: 'zahlung' as const, betragCent: 1490,
      zeitraumVon: null, zeitraumBis: null, stripeInvoiceId: null,
    }
    expect(await verbucheZahlung(eingang)).toBeTruthy()
    expect(await verbucheZahlung(eingang)).toBeTruthy()
    expect(await zaehle('coach_zahlungen', 'bestellung_id = $1', [id])).toBe(2)
  })

  it('ein langer Stripe-Fehlergrund wird gekürzt gespeichert', async () => {
    // Ungekürzt stünde eine mehrere Kilobyte lange Provider-Meldung auf
    // der Kontoseite des Nutzers.
    const id = await legeBestellungAn(db, coachUserA)
    await verbucheZahlung({
      bestellung: await holeBestellung(id), art: 'fehlgeschlagen', betragCent: 1490,
      zeitraumVon: null, zeitraumBis: null, fehlergrund: 'x'.repeat(1000),
      stripeInvoiceId: 'in_fail_1',
    })
    const r = await db.query<{ fehlergrund: string }>(
      `SELECT fehlergrund FROM coach_zahlungen WHERE bestellung_id = $1`, [id],
    )
    expect(r.rows[0].fehlergrund).toHaveLength(300)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Kette 3 — Rechnung', () => {
  it('zieht die Nummer aus der Sequenz und stellt genau einmal aus', async () => {
    const id = await legeBestellungAn(db, coachUserA)
    const bestellung = await holeBestellung(id)
    const zahlungId = await verbucheZahlung({
      bestellung, art: 'zahlung', betragCent: 1490,
      zeitraumVon: '2026-09-01', zeitraumBis: '2026-09-30', stripeInvoiceId: 'in_r_1',
    })

    const nummer = await stelleRechnungAus(bestellung, zahlungId, 1490, '2026-09-01', '2026-09-30')
    expect(nummer).toMatch(/^PC-\d{4}-\d{6}$/)

    // Zweiter Zustellversuch desselben Ereignisses: dieselbe Nummer, keine
    // zweite Rechnung. Eine doppelte Rechnung wäre ein Buchhaltungsfehler.
    const nochmal = await stelleRechnungAus(bestellung, zahlungId, 1490, '2026-09-01', '2026-09-30')
    expect(nochmal).toBe(nummer)
    expect(await zaehle('coach_rechnungen', 'bestellung_id = $1', [id])).toBe(1)
  })

  it('zwei Rechnungen bekommen aufsteigende, verschiedene Nummern', async () => {
    // Der Grund für die Sequenz statt SELECT max()+1: zwei gleichzeitige
    // Abbuchungen dürfen nicht dieselbe Nummer bekommen.
    const bestellung = await holeBestellung(await legeBestellungAn(db, coachUserA))
    const zweite = await holeBestellung(await legeBestellungAn(db, coachUserB))

    const a = await stelleRechnungAus(bestellung, null, 1490, '2026-09-01', '2026-09-30')
    const b = await stelleRechnungAus(zweite, null, 1490, '2026-09-01', '2026-09-30')

    expect(a).not.toBe(b)
    expect(Number(a!.slice(-6))).toBeLessThan(Number(b!.slice(-6)))
  })

  it('vermerkt die fehlende Steuernummer statt sie zu verschweigen', async () => {
    // Die Steuernummer der UG ist noch nicht zugeteilt. Eine Rechnung, die
    // deshalb unvollständig ist, muss das SELBST festhalten — sonst fällt
    // es erst dem Betriebsprüfer auf.
    const bestellung = await holeBestellung(await legeBestellungAn(db, coachUserA))
    await stelleRechnungAus(bestellung, null, 1490, '2026-09-01', '2026-09-30')

    const r = await db.query<{ angaben_unvollstaendig: string | null }>(
      `SELECT angaben_unvollstaendig FROM coach_rechnungen WHERE coach_user_id = $1`, [coachUserA],
    )
    expect(r.rows[0].angaben_unvollstaendig).toContain(COACH_STEUERNUMMER_ENV)
  })

  it('mit zugeteilter Steuernummer ist der Vermerk leer', async () => {
    // Gegenprobe: der Vermerk darf nicht immer stehen, sonst sagt er nichts.
    process.env[COACH_STEUERNUMMER_ENV] = '045 123 45678'
    const bestellung = await holeBestellung(await legeBestellungAn(db, coachUserA))
    await stelleRechnungAus(bestellung, null, 1490, '2026-09-01', '2026-09-30')

    const r = await db.query<{ angaben_unvollstaendig: string | null }>(
      `SELECT angaben_unvollstaendig FROM coach_rechnungen WHERE coach_user_id = $1`, [coachUserA],
    )
    expect(r.rows[0].angaben_unvollstaendig).toBeNull()
  })

  it('Kleinunternehmer: brutto = netto, keine Steuer', async () => {
    // Default ist Kleinunternehmer (§ 19 UStG) — lieber keine Steuer
    // ausweisen als eine falsche.
    const bestellung = await holeBestellung(await legeBestellungAn(db, coachUserA))
    await stelleRechnungAus(bestellung, null, 1490, '2026-09-01', '2026-09-30')

    const r = await db.query<{ brutto_cent: number; netto_cent: number; steuer_cent: number; steuersatz: string }>(
      `SELECT brutto_cent, netto_cent, steuer_cent, steuersatz::text FROM coach_rechnungen WHERE coach_user_id = $1`,
      [coachUserA],
    )
    expect(r.rows[0].brutto_cent).toBe(1490)
    expect(r.rows[0].netto_cent).toBe(1490)
    expect(r.rows[0].steuer_cent).toBe(0)
    expect(Number(r.rows[0].steuersatz)).toBe(0)
  })

  it('mit Regelbesteuerung wird brutto aufgeteilt und geht auf', async () => {
    process.env[COACH_UST_KLEINUNTERNEHMER_ENV] = 'false'
    process.env[COACH_UST_SATZ_ENV] = '19'
    const bestellung = await holeBestellung(await legeBestellungAn(db, coachUserA))
    await stelleRechnungAus(bestellung, null, 1490, '2026-09-01', '2026-09-30')

    const r = await db.query<{ brutto_cent: number; netto_cent: number; steuer_cent: number }>(
      `SELECT brutto_cent, netto_cent, steuer_cent FROM coach_rechnungen WHERE coach_user_id = $1`,
      [coachUserA],
    )
    const z = r.rows[0]
    // Kein Cent darf verschwinden — das ist der eigentliche Test.
    expect(z.netto_cent + z.steuer_cent).toBe(z.brutto_cent)
    expect(z.steuer_cent).toBeGreaterThan(0)
  })

  it('friert die Anschrift ein — eine spätere Adressänderung ändert die Rechnung nicht', async () => {
    // GoBD-Unveränderbarkeit. Geprüft wird nicht der Kommentar, sondern
    // dass die Rechnung nach dem UPDATE noch den alten Namen trägt.
    const id = await legeBestellungAn(db, coachUserA, { name: 'Erika Mustermann' })
    await stelleRechnungAus(await holeBestellung(id), null, 1490, '2026-09-01', '2026-09-30')
    await db.query(`UPDATE coach_bestellungen SET rechnung_name = 'Neuer Name' WHERE id = $1`, [id])

    const r = await db.query<{ empfaenger_name: string; empfaenger_anschrift: string }>(
      `SELECT empfaenger_name, empfaenger_anschrift FROM coach_rechnungen WHERE bestellung_id = $1`, [id],
    )
    expect(r.rows[0].empfaenger_name).toBe('Erika Mustermann')
    expect(r.rows[0].empfaenger_anschrift).toContain('60311 Frankfurt am Main')
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Kette 4 — Zugang beenden', () => {
  it('Widerruf wirkt HEUTE, nicht erst morgen', async () => {
    const id = await legeBestellungAn(db, coachUserA)
    await aktiviereBestellung(await holeBestellung(id), null, '2099-12-31')
    expect(istFreigeschaltet(await freischaltungen(coachUserA), heuteBerlin())).toBe(true)

    await beendeZugang(id, true)

    const zeilen = await freischaltungen(coachUserA)
    expect(zeilen[0].status).toBe('widerrufen')
    // Der Kern: gueltig_bis liegt VOR heute. Auf heute gesetzt bliebe der
    // Zugang bis Mitternacht offen — beim Widerruf ist das falsch.
    expect(zeilen[0].gueltig_bis! < heuteBerlin()).toBe(true)
    expect(istFreigeschaltet(zeilen, heuteBerlin())).toBe(false)
  })

  it('Kündigung lässt den Zugang heute noch bestehen', async () => {
    // Gegenrichtung zum Widerruf: gekündigt heißt „läuft aus", nicht
    // „sofort zu". Wären beide gleich, verlöre der Nutzer bezahlte Tage.
    const id = await legeBestellungAn(db, coachUserA)
    await aktiviereBestellung(await holeBestellung(id), null, '2099-12-31')

    await beendeZugang(id, false)

    const zeilen = await freischaltungen(coachUserA)
    expect(zeilen[0].status).toBe('abgelaufen')
    expect(zeilen[0].gueltig_bis).toBe(heuteBerlin())
    // 'abgelaufen' ist nicht 'aktiv' — istFreigeschaltet() verlangt beides.
    expect(istFreigeschaltet(zeilen, heuteBerlin())).toBe(false)
  })

  it('beendet nur die eigene Bestellung', async () => {
    const idA = await legeBestellungAn(db, coachUserA)
    const idB = await legeBestellungAn(db, coachUserB)
    await aktiviereBestellung(await holeBestellung(idA), null, '2099-12-31')
    await aktiviereBestellung(await holeBestellung(idB), null, '2099-12-31')

    await beendeZugang(idA, true)

    expect(istFreigeschaltet(await freischaltungen(coachUserA), heuteBerlin())).toBe(false)
    expect(istFreigeschaltet(await freischaltungen(coachUserB), heuteBerlin())).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Kette 5 — die maßgebliche Bestellung finden', () => {
  it('abgebrochene Checkouts verdrängen die bezahlte Bestellung nicht', async () => {
    // Ein Nutzer kann mehrere Anläufe hinterlassen haben. Die Kontoseite
    // darf nicht den abgebrochenen letzten Versuch zeigen, während der
    // bezahlte Zugang daneben läuft.
    await legeBestellungAn(db, coachUserA, { status: 'aktiv', bestelltAm: '2026-08-01T10:00:00Z' })
    await legeBestellungAn(db, coachUserA, { status: 'offen', bestelltAm: '2026-08-20T10:00:00Z' })

    const treffer = await massgeblicheBestellung(halter.client, coachUserA)
    expect(treffer?.status).toBe('aktiv')
  })

  it('gibt es nur offene, bleibt die neueste sichtbar', async () => {
    // Sonst verschwände ein hängengebliebener Checkout aus der Anzeige und
    // der Nutzer sähe gar keine Bestellung.
    await legeBestellungAn(db, coachUserA, { status: 'offen', bestelltAm: '2026-08-01T10:00:00Z', betragCent: 1490 })
    await legeBestellungAn(db, coachUserA, { status: 'offen', bestelltAm: '2026-08-20T10:00:00Z', betragCent: 14900 })

    const treffer = await massgeblicheBestellung(halter.client, coachUserA)
    expect(treffer?.status).toBe('offen')
    expect(treffer?.betrag_cent).toBe(14900)
  })

  it('ohne Bestellung liefert sie null statt zu werfen', async () => {
    expect(await massgeblicheBestellung(halter.client, coachUserB)).toBeNull()
  })

  it('findet die Bestellung über Checkout- und Subscription-Kennung', async () => {
    const id = await legeBestellungAn(db, coachUserA)
    await db.query(
      `UPDATE coach_bestellungen SET stripe_checkout_id = 'cs_1', stripe_subscription_id = 'sub_1' WHERE id = $1`,
      [id],
    )
    expect((await bestellungPerCheckout('cs_1'))?.id).toBe(id)
    expect((await bestellungPerSubscription('sub_1'))?.id).toBe(id)
    // Unbekannte Kennung: null, kein Fehler und keine fremde Bestellung.
    expect(await bestellungPerCheckout('cs_unbekannt')).toBeNull()
    expect(await bestellungPerSubscription('sub_unbekannt')).toBeNull()
  })

  it('setzeStatus schreibt nur die genannte Bestellung', async () => {
    const idA = await legeBestellungAn(db, coachUserA)
    const idB = await legeBestellungAn(db, coachUserB)
    await setzeStatus(idA, 'gesperrt', { gekuendigt_am: new Date().toISOString() })

    expect((await holeBestellung(idA)).status).toBe('gesperrt')
    expect((await holeBestellung(idB)).status).toBe('offen')
  })

  it('ein Status ausserhalb des CHECK wird von der Datenbank abgelehnt', async () => {
    // Der Zustandsraum steht im CHECK der Migration, nicht nur im
    // TypeScript-Typ. Ein Tippfehler im Aufrufer darf nicht als neuer,
    // stiller Zustand in der Tabelle landen.
    const id = await legeBestellungAn(db, coachUserA)
    await expect(
      db.query(`UPDATE coach_bestellungen SET status = 'bezahlt' WHERE id = $1`, [id]),
    ).rejects.toThrow(/check constraint|verletzt/i)
  })
})
