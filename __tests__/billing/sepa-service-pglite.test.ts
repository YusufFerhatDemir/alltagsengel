/**
 * SEPA-Lastschrift-Service auf echtem PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `lib/billing/sepa/sepa-service.ts` steht zwischen vier Routen und dem
 * Geldeinzug (`/api/billing/sepa/mandates`, `.../mandates/[id]/revoke`,
 * `/api/billing/sepa/batches`) und hatte bis hierhin KEINEN einzigen
 * Test. Was das Modul falsch macht, faellt erst beim Einzug auf — also
 * an der Bank, nicht im Betrieb.
 *
 * Gefahren wird gegen PGlite, weil die drei entscheidenden Fragen dieses
 * Moduls nur die Datenbank beantworten kann:
 *   • Existiert die Spalte, die die Abfrage nennt? (42703)
 *   • Haelt UNIQUE(organization_id, mandate_reference)?
 *   • Haelt CHECK(amount_cents > 0) auf sepa_batch_items?
 * Eine Fake-DB haette zu allen drei Fragen „ja" gesagt.
 *
 * ── BEFUNDE, DIE DIESE SUITE AUSGELOEST HAT ────────────────────────────
 *   B-1  listMandates() waehlte `clients(… client_number)`. Die Spalte
 *        heisst live `customer_number` (Baseline 20260101000000) — die
 *        Mandatsliste war mit 42703 komplett tot. Ausgerechnet
 *        createMandate() nennt den richtigen Namen zwei Funktionen
 *        weiter oben, samt Kommentar zu genau diesem Fehler.
 *   B-2  createMandate() las den Klienten ohne Mandantenfilter. Ein
 *        Admin von Mandant A konnte ein Lastschriftmandat auf einen
 *        Klienten von Mandant B anlegen — inklusive dessen IBAN.
 *   B-3  createSepaBatch() las `status` mit, wertete ihn aber nie aus.
 *        Entwuerfe, stornierte und abgeschriebene Rechnungen wurden
 *        eingezogen.
 *   B-4  Dieselbe Rechnung liess sich beliebig oft in Sammelauftraege
 *        aufnehmen — doppelter Einzug beim Kunden.
 *
 * BETRAEGE: alle Werte sind Testwerte innerhalb der In-Memory-Instanz.
 * Es wird kein Tarif und kein Kassensatz behauptet. Die IBANs sind die
 * offiziellen Beispiel-IBANs aus der SEPA-Dokumentation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, baueCamtTabellen } from '../e2e/helpers/kette-schema'
import { macheSupabaseClient } from '../e2e/helpers/pglite-supabase'

import {
  createMandate,
  listMandates,
  revokeMandate,
  createSepaBatch,
  listBatches,
} from '@/lib/billing/sepa/sepa-service'

// ─────────────────────────────────────────────────────────────────────
// Feste IDs
// ─────────────────────────────────────────────────────────────────────
const ORG_A = 'aaaaaaaa-0000-4000-8000-0000000053a1'
const ORG_B = 'bbbbbbbb-0000-4000-8000-0000000053a1'
const ADMIN_A = '11111111-0000-4000-8000-0000000053a1'
const ADMIN_B = '22222222-0000-4000-8000-0000000053a1'

const KLIENT_A = 'c1111111-0000-4000-8000-0000000053a1'
const KLIENT_A2 = 'c1111111-0000-4000-8000-0000000053a2'
const KLIENT_B = 'c2222222-0000-4000-8000-0000000053a1'

/** Offizielle Beispiel-IBANs — keine echten Konten. */
const IBAN_KUNDE = 'DE89370400440532013000'
const IBAN_KUNDE_2 = 'DE02120300000000202051'
const IBAN_ORG = 'DE02500105170137075030'

/** Struktur-gueltige Glaeubiger-ID, die NICHT in SEPA_PLATZHALTER_IDS steht. */
const CI_ECHT = 'DE31ZZZ00000012345'
/** Der Migrations-Platzhalter aus 20260812120000 — muss den Einzug sperren. */
const CI_PLATZHALTER = 'DE98ZZZ09999999999'

let db: PGlite
let admin: SupabaseClient

/** Mitgeschriebene Storage-Aufrufe — der Shim kennt kein Supabase Storage. */
interface StorageAufruf {
  bucket: string
  pfad: string
  bytes: number
}
let storageAufrufe: StorageAufruf[] = []
/** Gesetzt ⇒ jeder Upload meldet diesen Fehler. */
let storageFehler: string | null = null

/**
 * Haengt eine Storage-Attrappe an den PGlite-Shim.
 *
 * Bewusst KEIN Nachbau von Supabase Storage: gemessen wird nur, ob
 * `createSepaBatch()` die pain.008-Datei unter dem erwarteten Pfad
 * ablegt und ob ein fehlgeschlagener Upload den Batch trotzdem stehen
 * laesst (er tut es — der xml_storage_path bleibt dann leer).
 */
function mitStorage(client: unknown): SupabaseClient {
  const c = client as Record<string, unknown>
  c.storage = {
    from(bucket: string) {
      return {
        async upload(pfad: string, daten: Blob | ArrayBuffer) {
          if (storageFehler) return { data: null, error: { message: storageFehler } }
          const bytes =
            daten instanceof Blob ? daten.size : (daten as ArrayBuffer).byteLength
          storageAufrufe.push({ bucket, pfad, bytes })
          return { data: { path: pfad }, error: null }
        },
      }
    },
  }
  return c as unknown as SupabaseClient
}

// ─────────────────────────────────────────────────────────────────────
// Hilfen
// ─────────────────────────────────────────────────────────────────────
async function zeilen<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const r = await db.query<T>(sql)
  return r.rows
}

async function zaehle(tabelle: string, bedingung = 'TRUE'): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public."${tabelle}" WHERE ${bedingung}`,
  )
  return r.rows[0]?.n ?? 0
}

let rechnungsZaehler = 0
async function legeRechnung(opts: {
  org: string
  klient: string
  nummer: string
  betragEuro: number
  bezahltEuro?: number
  status?: string
}): Promise<string> {
  rechnungsZaehler++
  const id = `f0000000-0000-4000-8000-${String(rechnungsZaehler).padStart(12, '0')}`
  await db.query(
    `INSERT INTO public.invoices
       (id, organization_id, client_id, invoice_number, invoice_number_formatted,
        period_start, period_end, total_amount, paid_amount, status, dunning_level)
     VALUES ($1, $2, $3, $4, $4, '2026-07-01', '2026-07-31', $5, $6, $7, 'offen')`,
    [
      id,
      opts.org,
      opts.klient,
      opts.nummer,
      opts.betragEuro,
      opts.bezahltEuro ?? 0,
      opts.status ?? 'freigegeben',
    ] as never[],
  )
  return id
}

async function setzeGlaeubigerId(org: string, ci: string | null): Promise<void> {
  await db.query('UPDATE public.organizations SET sepa_creditor_id = $2 WHERE id = $1', [
    org,
    ci,
  ] as never[])
}

async function leereStrecke(): Promise<void> {
  await db.exec(`
    DELETE FROM public.sepa_batch_items;
    DELETE FROM public.sepa_batches;
    DELETE FROM public.sepa_mandates;
    DELETE FROM public.billing_audit_trail;
    DELETE FROM public.invoices;
  `)
  storageAufrufe = []
  storageFehler = null
}

// ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  db = await baueKettenSchema()
  await baueCamtTabellen(db)

  admin = mitStorage(macheSupabaseClient(db))

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN_A}', 'admin-a@example.org'),
      ('${ADMIN_B}', 'admin-b@example.org');

    INSERT INTO public.profiles (id, role, first_name, last_name, email) VALUES
      ('${ADMIN_A}', 'admin', 'Admin', 'Alpha', 'admin-a@example.org'),
      ('${ADMIN_B}', 'admin', 'Admin', 'Beta',  'admin-b@example.org');

    INSERT INTO public.organizations (id, name, bundesland, status, iban, bic, bank_name) VALUES
      ('${ORG_A}', 'Mandant Alpha', 'hessen', 'active', '${IBAN_ORG}', 'INGDDEFFXXX', 'Testbank'),
      ('${ORG_B}', 'Mandant Beta',  'bayern', 'active', '${IBAN_ORG}', 'INGDDEFFXXX', 'Testbank');

    INSERT INTO public.clients (id, organization_id, customer_number, first_name, last_name, zip_code) VALUES
      ('${KLIENT_A}',  '${ORG_A}', 'A-0001', 'Erika', 'Mustermann', '60311'),
      ('${KLIENT_A2}', '${ORG_A}', 'A-0002', 'Hans',  'Zweitkunde', '60311'),
      ('${KLIENT_B}',  '${ORG_B}', 'B-0001', 'Berta', 'Fremdorg',   '80331');
  `)

  await setzeGlaeubigerId(ORG_A, CI_ECHT)
  await setzeGlaeubigerId(ORG_B, CI_ECHT)
}, 120000)

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await leereStrecke()
})

// ═════════════════════════════════════════════════════════════════════
describe('createMandate — Mandatsanlage', () => {
  it('legt ein Mandat mit Referenz aus der Kundennummer an', async () => {
    const m = await createMandate(admin, {
      organizationId: ORG_A,
      clientId: KLIENT_A,
      debtorName: 'Erika Mustermann',
      debtorIban: IBAN_KUNDE,
      mandateDate: '2026-08-01',
      actorId: ADMIN_A,
    })

    expect(m.organization_id).toBe(ORG_A)
    expect(m.client_id).toBe(KLIENT_A)
    expect(m.status).toBe('aktiv')
    // Erstes Mandat MUSS FRST sein — sonst weist die Bank den Erstlauf ab.
    expect(m.sequence_type).toBe('FRST')
    // Die Referenz muss den Kunden wiedererkennbar machen.
    expect(String(m.mandate_reference)).toContain('A-0001')
  })

  it('normalisiert die IBAN (Leerzeichen weg, Grossbuchstaben)', async () => {
    const m = await createMandate(admin, {
      organizationId: ORG_A,
      clientId: KLIENT_A,
      debtorName: 'Erika Mustermann',
      debtorIban: 'de89 3704 0044 0532 0130 00',
      mandateDate: '2026-08-01',
      actorId: ADMIN_A,
    })
    expect(m.debtor_iban).toBe(IBAN_KUNDE)
  })

  it('weist eine ungueltige IBAN ab, ohne eine Zeile zu hinterlassen', async () => {
    await expect(
      createMandate(admin, {
        organizationId: ORG_A,
        clientId: KLIENT_A,
        debtorName: 'Erika Mustermann',
        debtorIban: 'DE89370400440532013001', // Pruefziffer verdreht
        mandateDate: '2026-08-01',
        actorId: ADMIN_A,
      }),
    ).rejects.toThrow(/Ungültige IBAN/)

    expect(await zaehle('sepa_mandates')).toBe(0)
  })

  it('schreibt einen Audit-Eintrag mit dem richtigen Mandanten', async () => {
    const m = await createMandate(admin, {
      organizationId: ORG_A,
      clientId: KLIENT_A,
      debtorName: 'Erika Mustermann',
      debtorIban: IBAN_KUNDE,
      mandateDate: '2026-08-01',
      actorId: ADMIN_A,
    })

    const audit = await zeilen<{ organization_id: string; entity_id: string; action: string }>(
      `SELECT organization_id, entity_id, action FROM public.billing_audit_trail
       WHERE entity_type = 'sepa_mandate'`,
    )
    expect(audit).toHaveLength(1)
    expect(audit[0].organization_id).toBe(ORG_A)
    expect(audit[0].entity_id).toBe(m.id)
    expect(audit[0].action).toBe('created')
  })

  /**
   * BEFUND B-2 — Mandantengrenze.
   *
   * Der Klient wurde ohne `organization_id`-Filter gelesen. Ein Admin von
   * Mandant A konnte damit ein Lastschriftmandat auf einen Klienten von
   * Mandant B anlegen; die Zeile landete in A, der FK zeigte nach B. Beim
   * naechsten Einzug wird von einem fremden Konto abgebucht.
   */
  it('legt KEIN Mandat auf einen Klienten eines anderen Mandanten an', async () => {
    await expect(
      createMandate(admin, {
        organizationId: ORG_A,
        clientId: KLIENT_B, // gehoert ORG_B
        debtorName: 'Berta Fremdorg',
        debtorIban: IBAN_KUNDE_2,
        mandateDate: '2026-08-01',
        actorId: ADMIN_A,
      }),
    ).rejects.toThrow()

    expect(await zaehle('sepa_mandates')).toBe(0)
  })

  /**
   * Zwei aktive Mandate je Klient sind moeglich — `mandate_reference`
   * traegt einen Zeitstempel, UNIQUE(organization_id, mandate_reference)
   * greift also nicht. Das ist hier bewusst festgehalten und NICHT
   * verboten (Kontowechsel eines Kunden erzeugt legitim ein zweites
   * Mandat). Die Folge muss aber beherrscht sein: siehe den Batch-Test
   * „nimmt bei zwei aktiven Mandaten das neueste".
   */
  it('laesst ein zweites aktives Mandat je Klient zu', async () => {
    await createMandate(admin, {
      organizationId: ORG_A,
      clientId: KLIENT_A,
      debtorName: 'Erika Mustermann',
      debtorIban: IBAN_KUNDE,
      mandateDate: '2026-08-01',
      actorId: ADMIN_A,
    })
    await createMandate(admin, {
      organizationId: ORG_A,
      clientId: KLIENT_A,
      debtorName: 'Erika Mustermann',
      debtorIban: IBAN_KUNDE_2,
      mandateDate: '2026-08-02',
      actorId: ADMIN_A,
    })

    expect(await zaehle('sepa_mandates', "status = 'aktiv'")).toBe(2)
    const referenzen = await zeilen<{ mandate_reference: string }>(
      'SELECT mandate_reference FROM public.sepa_mandates',
    )
    // Die Referenzen unterscheiden sich — sonst haette UNIQUE gegriffen.
    expect(new Set(referenzen.map(r => r.mandate_reference)).size).toBe(2)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('listMandates — Mandatsliste', () => {
  beforeEach(async () => {
    await createMandate(admin, {
      organizationId: ORG_A,
      clientId: KLIENT_A,
      debtorName: 'Erika Mustermann',
      debtorIban: IBAN_KUNDE,
      mandateDate: '2026-08-01',
      actorId: ADMIN_A,
    })
    await createMandate(admin, {
      organizationId: ORG_B,
      clientId: KLIENT_B,
      debtorName: 'Berta Fremdorg',
      debtorIban: IBAN_KUNDE_2,
      mandateDate: '2026-08-01',
      actorId: ADMIN_B,
    })
  })

  /**
   * BEFUND B-1 — Regressionstest.
   *
   * Die Abfrage nannte `clients(… client_number)`. Diese Spalte gibt es
   * nicht; sie heisst `customer_number`. PostgREST beantwortet das mit
   * 42703, listMandates() wirft, und GET /api/billing/sepa/mandates war
   * damit komplett tot — ohne dass irgendein Test es gemerkt haette.
   */
  it('laedt die Mandate (Spaltennamen muessen zum Live-Schema passen)', async () => {
    const liste = await listMandates(admin, ORG_A)
    expect(liste).toHaveLength(1)
    expect(liste[0].client_id).toBe(KLIENT_A)
  })

  it('zeigt nur Mandate des eigenen Mandanten', async () => {
    const a = await listMandates(admin, ORG_A)
    const b = await listMandates(admin, ORG_B)
    expect(a.map(m => m.client_id)).toEqual([KLIENT_A])
    expect(b.map(m => m.client_id)).toEqual([KLIENT_B])
  })

  it('filtert nach Klient und Status', async () => {
    expect(await listMandates(admin, ORG_A, { clientId: KLIENT_A2 })).toHaveLength(0)
    expect(await listMandates(admin, ORG_A, { status: 'widerrufen' })).toHaveLength(0)
    expect(await listMandates(admin, ORG_A, { status: 'aktiv' })).toHaveLength(1)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('revokeMandate — Widerruf', () => {
  let mandatA: string

  beforeEach(async () => {
    const m = await createMandate(admin, {
      organizationId: ORG_A,
      clientId: KLIENT_A,
      debtorName: 'Erika Mustermann',
      debtorIban: IBAN_KUNDE,
      mandateDate: '2026-08-01',
      actorId: ADMIN_A,
    })
    mandatA = m.id
  })

  it('setzt Status, Zeitpunkt und Grund', async () => {
    await revokeMandate(admin, mandatA, 'Kunde hat widersprochen', ADMIN_A, ORG_A)

    const [m] = await zeilen<{ status: string; revoked_at: string | null; revoke_reason: string }>(
      `SELECT status, revoked_at, revoke_reason FROM public.sepa_mandates WHERE id = '${mandatA}'`,
    )
    expect(m.status).toBe('widerrufen')
    expect(m.revoked_at).not.toBeNull()
    expect(m.revoke_reason).toBe('Kunde hat widersprochen')
  })

  it('widerruft NICHT ueber die Mandantengrenze hinweg', async () => {
    await expect(
      revokeMandate(admin, mandatA, 'Fremdzugriff', ADMIN_B, ORG_B),
    ).rejects.toThrow()

    const [m] = await zeilen<{ status: string }>(
      `SELECT status FROM public.sepa_mandates WHERE id = '${mandatA}'`,
    )
    expect(m.status).toBe('aktiv')
  })

  it('ist nicht zweimal moeglich (nur aktive Mandate)', async () => {
    await revokeMandate(admin, mandatA, 'erster Widerruf', ADMIN_A, ORG_A)
    await expect(
      revokeMandate(admin, mandatA, 'zweiter Widerruf', ADMIN_A, ORG_A),
    ).rejects.toThrow()

    const [m] = await zeilen<{ revoke_reason: string }>(
      `SELECT revoke_reason FROM public.sepa_mandates WHERE id = '${mandatA}'`,
    )
    expect(m.revoke_reason).toBe('erster Widerruf')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('createSepaBatch — Sammelauftrag', () => {
  let mandatA: string
  let rechnung1: string

  beforeEach(async () => {
    const m = await createMandate(admin, {
      organizationId: ORG_A,
      clientId: KLIENT_A,
      debtorName: 'Erika Mustermann',
      debtorIban: IBAN_KUNDE,
      mandateDate: '2026-08-01',
      actorId: ADMIN_A,
    })
    mandatA = m.id
    rechnung1 = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-0001', betragEuro: 120,
    })
  })

  it('erzeugt Batch, Position und pain.008 und zieht das Mandat auf RCUR', async () => {
    const r = await createSepaBatch(admin, {
      organizationId: ORG_A,
      invoiceIds: [rechnung1],
      requestedCollectionDate: '2026-09-01',
      actorId: ADMIN_A,
    })

    expect(r.totalItems).toBe(1)
    expect(r.totalCents).toBe(12000)
    expect(r.skipped).toEqual([])
    expect(r.xmlContent).toContain('<CstmrDrctDbtInitn>')
    expect(r.xmlContent).toContain(IBAN_KUNDE)
    expect(r.xmlContent).toContain(CI_ECHT)

    const [item] = await zeilen<{ amount_cents: string; status: string; invoice_id: string }>(
      'SELECT amount_cents, status, invoice_id FROM public.sepa_batch_items',
    )
    expect(Number(item.amount_cents)).toBe(12000)
    expect(item.status).toBe('offen')
    expect(item.invoice_id).toBe(rechnung1)

    // FRST → RCUR nach dem ersten Einzug.
    const [m] = await zeilen<{ sequence_type: string; last_used_at: string | null }>(
      `SELECT sequence_type, last_used_at FROM public.sepa_mandates WHERE id = '${mandatA}'`,
    )
    expect(m.sequence_type).toBe('RCUR')
    expect(m.last_used_at).not.toBeNull()

    // Die Datei wird abgelegt und der Pfad an der Zeile vermerkt.
    expect(storageAufrufe).toHaveLength(1)
    expect(storageAufrufe[0].bucket).toBe('documents')
    expect(storageAufrufe[0].pfad).toBe(`sepa/${ORG_A}/${r.batchNumber}.xml`)
    const [batch] = await zeilen<{ xml_storage_path: string | null }>(
      'SELECT xml_storage_path FROM public.sepa_batches',
    )
    expect(batch.xml_storage_path).toBe(storageAufrufe[0].pfad)
  })

  it('rechnet den OFFENEN Betrag ein, nicht den Gesamtbetrag', async () => {
    const teilbezahlt = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-0002',
      betragEuro: 200, bezahltEuro: 75.5, status: 'teilweise_bezahlt',
    })

    const r = await createSepaBatch(admin, {
      organizationId: ORG_A,
      invoiceIds: [teilbezahlt],
      requestedCollectionDate: '2026-09-01',
      actorId: ADMIN_A,
    })
    expect(r.totalCents).toBe(12450)
  })

  /**
   * Fail-Closed aus lib/billing/sepa/glaeubiger-id.ts: der Platzhalter aus
   * Migration 20260812120000 darf nie in einen Einzug geraten. Wichtig ist
   * nicht nur die Ausnahme, sondern dass NICHTS zurueckbleibt — sonst gilt
   * der Lauf intern als erzeugt und die Rechnungen verschwinden aus der
   * OPOS-Liste.
   */
  it('sperrt den Einzug bei Platzhalter-Glaeubiger-ID und legt nichts an', async () => {
    await setzeGlaeubigerId(ORG_A, CI_PLATZHALTER)
    try {
      await expect(
        createSepaBatch(admin, {
          organizationId: ORG_A,
          invoiceIds: [rechnung1],
          requestedCollectionDate: '2026-09-01',
          actorId: ADMIN_A,
        }),
      ).rejects.toThrow(/SEPA_GESPERRT/)

      expect(await zaehle('sepa_batches')).toBe(0)
      expect(await zaehle('sepa_batch_items')).toBe(0)
      expect(storageAufrufe).toHaveLength(0)
    } finally {
      await setzeGlaeubigerId(ORG_A, CI_ECHT)
    }
  })

  it('sperrt den Einzug auch ohne hinterlegte Glaeubiger-ID', async () => {
    await setzeGlaeubigerId(ORG_A, null)
    try {
      await expect(
        createSepaBatch(admin, {
          organizationId: ORG_A,
          invoiceIds: [rechnung1],
          requestedCollectionDate: '2026-09-01',
          actorId: ADMIN_A,
        }),
      ).rejects.toThrow(/SEPA_GESPERRT/)
      expect(await zaehle('sepa_batches')).toBe(0)
    } finally {
      await setzeGlaeubigerId(ORG_A, CI_ECHT)
    }
  })

  it('ueberspringt Rechnungen ohne aktives Mandat', async () => {
    const ohneMandat = await legeRechnung({
      org: ORG_A, klient: KLIENT_A2, nummer: 'RE-2026-0003', betragEuro: 90,
    })

    const r = await createSepaBatch(admin, {
      organizationId: ORG_A,
      invoiceIds: [rechnung1, ohneMandat],
      requestedCollectionDate: '2026-09-01',
      actorId: ADMIN_A,
    })

    expect(r.totalItems).toBe(1)
    expect(r.skipped).toEqual([{ invoiceId: ohneMandat, reason: 'Kein aktives SEPA-Mandat' }])
  })

  it('zieht ueber ein widerrufenes Mandat nicht ein', async () => {
    await revokeMandate(admin, mandatA, 'Kunde hat widersprochen', ADMIN_A, ORG_A)

    await expect(
      createSepaBatch(admin, {
        organizationId: ORG_A,
        invoiceIds: [rechnung1],
        requestedCollectionDate: '2026-09-01',
        actorId: ADMIN_A,
      }),
    ).rejects.toThrow(/Keine einziehbaren Rechnungen/)

    expect(await zaehle('sepa_batches')).toBe(0)
  })

  it('ueberspringt Rechnungen ohne offenen Restbetrag', async () => {
    // Status noch nicht auf 'bezahlt' nachgezogen, Betrag aber ausgeglichen —
    // genau der Zustand zwischen Zahlungseingang und Statuslauf.
    const ausgeglichen = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-0004',
      betragEuro: 100, bezahltEuro: 100, status: 'teilweise_bezahlt',
    })

    const r = await createSepaBatch(admin, {
      organizationId: ORG_A,
      invoiceIds: [rechnung1, ausgeglichen],
      requestedCollectionDate: '2026-09-01',
      actorId: ADMIN_A,
    })

    expect(r.totalItems).toBe(1)
    expect(r.skipped).toEqual([{ invoiceId: ausgeglichen, reason: 'Rechnung bereits bezahlt' }])
    // CHECK(amount_cents > 0) haette einen 0-Posten ohnehin abgewiesen —
    // hier wird geprueft, dass es gar nicht erst dazu kommt.
    expect(await zaehle('sepa_batch_items')).toBe(1)
  })

  it('nimmt bei zwei aktiven Mandaten das neueste', async () => {
    const neu = await createMandate(admin, {
      organizationId: ORG_A,
      clientId: KLIENT_A,
      debtorName: 'Erika Mustermann',
      debtorIban: IBAN_KUNDE_2, // Kontowechsel
      mandateDate: '2026-08-15',
      actorId: ADMIN_A,
    })

    const r = await createSepaBatch(admin, {
      organizationId: ORG_A,
      invoiceIds: [rechnung1],
      requestedCollectionDate: '2026-09-01',
      actorId: ADMIN_A,
    })

    expect(r.xmlContent).toContain(IBAN_KUNDE_2)
    expect(r.xmlContent).not.toContain(IBAN_KUNDE)
    const [item] = await zeilen<{ mandate_id: string }>(
      'SELECT mandate_id FROM public.sepa_batch_items',
    )
    expect(item.mandate_id).toBe(neu.id)
  })

  it('nimmt keine Rechnung eines anderen Mandanten auf', async () => {
    await createMandate(admin, {
      organizationId: ORG_B,
      clientId: KLIENT_B,
      debtorName: 'Berta Fremdorg',
      debtorIban: IBAN_KUNDE_2,
      mandateDate: '2026-08-01',
      actorId: ADMIN_B,
    })
    const fremd = await legeRechnung({
      org: ORG_B, klient: KLIENT_B, nummer: 'RE-B-0001', betragEuro: 300,
    })

    const r = await createSepaBatch(admin, {
      organizationId: ORG_A,
      invoiceIds: [rechnung1, fremd],
      requestedCollectionDate: '2026-09-01',
      actorId: ADMIN_A,
    })

    expect(r.totalItems).toBe(1)
    const items = await zeilen<{ invoice_id: string }>(
      'SELECT invoice_id FROM public.sepa_batch_items',
    )
    expect(items.map(i => i.invoice_id)).toEqual([rechnung1])
  })

  /**
   * BEFUND B-3 — Status wurde gelesen, aber nie ausgewertet.
   *
   * `entwurf` ist keine Forderung (die Rechnung ist nicht festgeschrieben
   * und nicht versandt), `storniert` und `abgeschrieben` sind ausdruecklich
   * keine mehr. Alle drei wurden trotzdem eingezogen.
   */
  it('zieht Entwuerfe, stornierte und abgeschriebene Rechnungen NICHT ein', async () => {
    const entwurf = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-0005', betragEuro: 50, status: 'entwurf',
    })
    const storniert = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-0006', betragEuro: 60, status: 'storniert',
    })
    const abgeschrieben = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-0007', betragEuro: 70, status: 'abgeschrieben',
    })

    const r = await createSepaBatch(admin, {
      organizationId: ORG_A,
      invoiceIds: [rechnung1, entwurf, storniert, abgeschrieben],
      requestedCollectionDate: '2026-09-01',
      actorId: ADMIN_A,
    })

    expect(r.totalItems).toBe(1)
    expect(r.totalCents).toBe(12000)
    expect(r.skipped.map(s => s.invoiceId).sort()).toEqual(
      [entwurf, storniert, abgeschrieben].sort(),
    )
  })

  /**
   * BEFUND B-4 — doppelter Einzug.
   *
   * Nichts hinderte daran, dieselbe Rechnung in einen zweiten
   * Sammelauftrag zu legen. Beim Kunden wird dann zweimal abgebucht; die
   * zweite Abbuchung ist eine unberechtigte Lastschrift, die er bis zu
   * 13 Monate lang zurueckholen kann.
   */
  it('nimmt eine bereits eingezogene Rechnung nicht ein zweites Mal auf', async () => {
    const erster = await createSepaBatch(admin, {
      organizationId: ORG_A,
      invoiceIds: [rechnung1],
      requestedCollectionDate: '2026-09-01',
      actorId: ADMIN_A,
    })
    expect(erster.totalItems).toBe(1)

    await expect(
      createSepaBatch(admin, {
        organizationId: ORG_A,
        invoiceIds: [rechnung1],
        requestedCollectionDate: '2026-09-15',
        actorId: ADMIN_A,
      }),
    ).rejects.toThrow(/Keine einziehbaren Rechnungen/)

    expect(await zaehle('sepa_batch_items')).toBe(1)
  })

  it('nimmt eine zurueckgegebene Rechnung wieder auf', async () => {
    await createSepaBatch(admin, {
      organizationId: ORG_A,
      invoiceIds: [rechnung1],
      requestedCollectionDate: '2026-09-01',
      actorId: ADMIN_A,
    })
    // Ruecklastschrift: der Posten ist erledigt, die Forderung lebt weiter.
    await db.exec(
      `UPDATE public.sepa_batch_items SET status = 'ruecklastschrift'`,
    )

    const zweiter = await createSepaBatch(admin, {
      organizationId: ORG_A,
      invoiceIds: [rechnung1],
      requestedCollectionDate: '2026-09-15',
      actorId: ADMIN_A,
    })
    expect(zweiter.totalItems).toBe(1)
    expect(await zaehle('sepa_batch_items')).toBe(2)
  })

  it('wirft ohne Rechnungsauswahl und legt nichts an', async () => {
    await expect(
      createSepaBatch(admin, {
        organizationId: ORG_A,
        invoiceIds: [],
        requestedCollectionDate: '2026-09-01',
        actorId: ADMIN_A,
      }),
    ).rejects.toThrow(/Mindestens eine Rechnung/)
    expect(await zaehle('sepa_batches')).toBe(0)
  })

  it('laesst den Batch stehen, wenn nur die Ablage scheitert', async () => {
    storageFehler = 'Bucket not found'

    const r = await createSepaBatch(admin, {
      organizationId: ORG_A,
      invoiceIds: [rechnung1],
      requestedCollectionDate: '2026-09-01',
      actorId: ADMIN_A,
    })

    expect(r.totalItems).toBe(1)
    const [batch] = await zeilen<{ xml_storage_path: string | null }>(
      'SELECT xml_storage_path FROM public.sepa_batches',
    )
    // Kein Pfad — die Datei liegt nirgends. Das XML kommt trotzdem
    // zurueck und kann von der Route ausgeliefert werden.
    expect(batch.xml_storage_path).toBeNull()
    expect(r.xmlContent).toContain('<CstmrDrctDbtInitn>')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('listBatches — Mandantengrenze', () => {
  it('zeigt nur Batches des eigenen Mandanten', async () => {
    await createMandate(admin, {
      organizationId: ORG_A, clientId: KLIENT_A, debtorName: 'Erika Mustermann',
      debtorIban: IBAN_KUNDE, mandateDate: '2026-08-01', actorId: ADMIN_A,
    })
    await createMandate(admin, {
      organizationId: ORG_B, clientId: KLIENT_B, debtorName: 'Berta Fremdorg',
      debtorIban: IBAN_KUNDE_2, mandateDate: '2026-08-01', actorId: ADMIN_B,
    })
    const rA = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-A-9001', betragEuro: 10,
    })
    const rB = await legeRechnung({
      org: ORG_B, klient: KLIENT_B, nummer: 'RE-B-9001', betragEuro: 20,
    })

    await createSepaBatch(admin, {
      organizationId: ORG_A, invoiceIds: [rA],
      requestedCollectionDate: '2026-09-01', actorId: ADMIN_A,
    })
    await createSepaBatch(admin, {
      organizationId: ORG_B, invoiceIds: [rB],
      requestedCollectionDate: '2026-09-01', actorId: ADMIN_B,
    })

    expect(await listBatches(admin, ORG_A)).toHaveLength(1)
    expect(await listBatches(admin, ORG_B)).toHaveLength(1)
    expect(await zaehle('sepa_batches')).toBe(2)
  })
})
