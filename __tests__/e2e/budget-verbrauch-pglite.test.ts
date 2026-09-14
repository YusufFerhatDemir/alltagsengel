/**
 * E2E: Budgetverbrauch — was eine Leistung vom Entlastungsbetrag abzieht
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ── DIE LÜCKE ─────────────────────────────────────────────────────────
 * `client_budgets.used_amount` ist die Zahl, an der die Einsatzfreigabe
 * entscheidet, ob noch Budget da ist. Geprüft wurde sie bisher nur im
 * Ausgangszustand: `expect(zeile.used_amount).toBe(0)` in
 * billing-e2e.test.ts. Ob sie STEIGT, wenn eine Leistung erbracht wird,
 * und ob sie beim Storno ZURÜCKGEHT, prüfte niemand.
 *
 * Beides hängt an einem Trigger, und der hatte schon einmal genau hier
 * einen P0: die Baseline-Fassung summierte
 * `status IN ('completed','billed','paid')` — Werte, die das Werteset
 * seit dem 02.07.2026 nicht mehr kennt ('completed' ist nicht
 * 'complete', ein Buchstabe). Die IN-Liste traf auf keine Zeile zu, und
 * `used_amount` stand vier Monate lang für JEDEN Klienten auf 0, während
 * die Anzeige „Budget frei" meldete. Behoben mit 20261013000002.
 *
 * Diese Kette fährt die live gültige Fassung gegen echtes Postgres.
 *
 * ── WAS SIE FESTHÄLT ──────────────────────────────────────────────────
 *   · Ein Entwurf zählt nicht — erst die erbrachte, dokumentierte Leistung.
 *   · § 45b (entlastung) und § 42a (Verhinderungs-/Kurzzeitpflege) sind
 *     GETRENNTE Töpfe. Eine Verwechslung verbraucht still das Geld des
 *     Kunden aus dem falschen Topf.
 *   · Ein Storno gibt das Budget frei. Der Storno lässt `status` auf
 *     'signed' stehen; ohne die beiden STORNIERT-Zeilen im Trigger
 *     verbrauchte eine widerrufene Leistung weiter Budget.
 *
 * ── ZWEI STORNOS, DIE NICHT DASSELBE SIND ────────────────────────────
 * Gemeint ist hier der Storno der LEISTUNG (`/api/bookings/cancel`
 * setzt `proof_status`/`billing_status` auf 'STORNIERT'). Der Storno der
 * RECHNUNG ist etwas anderes: `cancelInvoice` legt eine Stornorechnung
 * an und setzt `invoices.status`, rührt die `service_records` aber
 * NICHT an — das Budget bleibt danach verbraucht.
 *
 * Das ist vertretbar: eine Rechnung wird auch aus formalen Gründen
 * storniert (falscher Betrag, falsche Anschrift) und anschliessend neu
 * gestellt; die Leistung war trotzdem erbracht. Wer aber einen
 * Rechnungsstorno für einen Leistungswiderruf hält, wundert sich über
 * ein Budget, das verbraucht bleibt. Beide Wege gehören deshalb
 * nacheinander gegangen, nicht wechselweise.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { baueKettenSchema, baueBudgetTrigger, STAMM_ORG } from './helpers/kette-schema'

const ORG = STAMM_ORG
const KUNDE = '00000000-0000-4000-8000-00000000c001'
const ENGEL = '00000000-0000-4000-8000-00000000e001'
const JAHR = 2026

let db: PGlite

/** Legt einen Nachweis an und gibt seine ID zurück. */
async function nachweis(opts: {
  betrag: number
  topf: string
  status: string
  datum?: string
  proof?: string | null
  billing?: string | null
}): Promise<string> {
  const id = crypto.randomUUID()
  await db.query(
    `INSERT INTO public.service_records
       (id, organization_id, client_id, caregiver_id, date, start_time, end_time,
        service_type, budget_type, amount, status, caregiver_initials, proof_status, billing_status)
     VALUES ($1,$2,$3,$4,$5,'09:00','10:00','alltagsbegleitung',$6,$7,$8,'MB',$9,$10)`,
    [id, ORG, KUNDE, ENGEL, opts.datum ?? `${JAHR}-03-05`, opts.topf, opts.betrag,
     opts.status, opts.proof ?? null, opts.billing ?? null],
  )
  return id
}

async function budget(): Promise<{ used: number; combined: number }> {
  const r = await db.query<{ u: string; c: string }>(
    `SELECT COALESCE(used_amount,0)::text AS u, COALESCE(combined_used_amount,0)::text AS c
     FROM public.client_budgets WHERE client_id = $1 AND year = $2`, [KUNDE, JAHR])
  return { used: Number(r.rows[0]?.u ?? 0), combined: Number(r.rows[0]?.c ?? 0) }
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await baueBudgetTrigger(db)

  await db.exec(`
    INSERT INTO public.organizations (id, name, bundesland, status)
      VALUES ('${ORG}', 'Mandant Alpha', 'hessen', 'active');
    INSERT INTO public.clients
      (id, organization_id, customer_number, first_name, last_name, status)
      VALUES ('${KUNDE}', '${ORG}', 'K-0001', 'Erika', 'Testfall', 'active');
    INSERT INTO public.caregivers
      (id, organization_id, first_name, last_name, initials, status)
      VALUES ('${ENGEL}', '${ORG}', 'Marek', 'Beispiel', 'MB', 'active');
  `)
}, 120_000)

beforeEach(async () => {
  await db.exec(`DELETE FROM public.service_records;`)
  await db.exec(`DELETE FROM public.client_budgets;`)
  // Der Entlastungsbetrag nach § 45b: 131 € im Monat.
  await db.query(
    `INSERT INTO public.client_budgets
       (client_id, organization_id, year, annual_amount, used_amount, combined_used_amount)
     VALUES ($1,$2,$3,$4,0,0)`,
    [KUNDE, ORG, JAHR, 131 * 12],
  )
})

describe('Was zählt und was nicht', () => {
  it('ein Entwurf verbraucht kein Budget', async () => {
    await nachweis({ betrag: 40, topf: 'entlastung', status: 'draft' })
    expect((await budget()).used).toBe(0)
  })

  it('eine erbrachte Leistung wird abgezogen', async () => {
    await nachweis({ betrag: 40, topf: 'entlastung', status: 'complete' })
    expect((await budget()).used).toBe(40)
  })

  it('mehrere Leistungen summieren sich', async () => {
    await nachweis({ betrag: 40, topf: 'entlastung', status: 'complete' })
    await nachweis({ betrag: 35, topf: 'entlastung', status: 'signed', datum: `${JAHR}-03-12` })
    await nachweis({ betrag: 20, topf: 'entlastung', status: 'invoiced', datum: `${JAHR}-03-19` })
    expect((await budget()).used).toBe(95)
  })

  it('ein unvollständiger Nachweis zählt nicht mit', async () => {
    await nachweis({ betrag: 40, topf: 'entlastung', status: 'complete' })
    await nachweis({ betrag: 99, topf: 'entlastung', status: 'incomplete', datum: `${JAHR}-03-12` })
    expect((await budget()).used).toBe(40)
  })
})

describe('Die beiden Töpfe bleiben getrennt', () => {
  it('Verhinderungspflege belastet NICHT den Entlastungsbetrag', async () => {
    await nachweis({ betrag: 60, topf: 'verhinderungspflege', status: 'complete' })
    const b = await budget()
    expect(b.used, '§ 42a-Leistung hat den § 45b-Topf belastet').toBe(0)
    expect(b.combined).toBe(60)
  })

  it('der Übertrag aus dem Vorjahr zählt zum Entlastungstopf', async () => {
    await nachweis({ betrag: 25, topf: 'carryover', status: 'complete' })
    expect((await budget()).used).toBe(25)
  })

  it('beide Töpfe nebeneinander laufen nicht ineinander', async () => {
    await nachweis({ betrag: 40, topf: 'entlastung', status: 'complete' })
    await nachweis({ betrag: 60, topf: 'verhinderungspflege', status: 'complete', datum: `${JAHR}-03-12` })
    const b = await budget()
    expect({ used: b.used, combined: b.combined }).toEqual({ used: 40, combined: 60 })
  })
})

describe('Ein Storno gibt das Budget frei', () => {
  /**
   * Der Storno lässt `status` auf 'signed' stehen — das Werteset kennt
   * keinen Storno-Wert. Ohne die beiden STORNIERT-Zeilen im Trigger
   * verbrauchte eine widerrufene Leistung weiter Budget, und der Kunde
   * verlöre seinen Entlastungsbetrag für etwas, das nie stattfand.
   */
  it('über proof_status storniert ⇒ das Budget ist wieder frei', async () => {
    const id = await nachweis({ betrag: 40, topf: 'entlastung', status: 'signed' })
    expect((await budget()).used).toBe(40)
    await db.query(`UPDATE public.service_records SET proof_status = 'STORNIERT' WHERE id = $1`, [id])
    expect((await budget()).used, 'widerrufene Leistung verbraucht weiter Budget').toBe(0)
  })

  it('über billing_status storniert ⇒ ebenso', async () => {
    const id = await nachweis({ betrag: 40, topf: 'entlastung', status: 'invoiced' })
    expect((await budget()).used).toBe(40)
    await db.query(`UPDATE public.service_records SET billing_status = 'STORNIERT' WHERE id = $1`, [id])
    expect((await budget()).used).toBe(0)
  })

  it('nur das stornierte Blatt fällt weg, die übrigen bleiben', async () => {
    const id = await nachweis({ betrag: 40, topf: 'entlastung', status: 'signed' })
    await nachweis({ betrag: 35, topf: 'entlastung', status: 'signed', datum: `${JAHR}-03-12` })
    await db.query(`UPDATE public.service_records SET proof_status = 'STORNIERT' WHERE id = $1`, [id])
    expect((await budget()).used).toBe(35)
  })

  it('ein gelöschter Nachweis gibt das Budget ebenfalls frei', async () => {
    const id = await nachweis({ betrag: 40, topf: 'entlastung', status: 'complete' })
    expect((await budget()).used).toBe(40)
    await db.query(`DELETE FROM public.service_records WHERE id = $1`, [id])
    expect((await budget()).used).toBe(0)
  })
})

describe('Jahresgrenze', () => {
  it('eine Leistung aus dem Vorjahr belastet das Budget dieses Jahres nicht', async () => {
    await nachweis({ betrag: 40, topf: 'entlastung', status: 'complete', datum: `${JAHR - 1}-12-28` })
    expect((await budget()).used).toBe(0)
  })
})
