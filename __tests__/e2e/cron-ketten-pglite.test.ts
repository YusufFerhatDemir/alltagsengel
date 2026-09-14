/**
 * E2E: Automatisierungsketten gegen echtes Postgres
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ── DIE LÜCKE ─────────────────────────────────────────────────────────
 * Elf Ketten laufen täglich um 05:00 (vercel.json). Keine einzige hatte
 * bis hierher einen E2E-Test: es gibt ein bis zwei Modultests je Kette
 * gegen einen Supabase-Doppelgänger, und `fristen-warnung` hat gar
 * keinen. Der Trockenlauf aus `npm run verify:automatisierung` fährt sie
 * zwar gegen die Produktionsdaten — aber er FÄNGT jeden Schreibvorgang
 * ab. Dass die Ketten lesen können, ist damit belegt; ob die Datenbank
 * ihre Schreibvorgänge ANNIMMT, war offen.
 *
 * Genau dort sitzt die Gefahr. `ops_aufgaben` trägt vier
 * CHECK-Constraints (kategorie, prioritaet, status,
 * wiederholung_intervall). Ein nicht eingetragener Wert lässt den INSERT
 * scheitern, die Kette meldet „Anlage fehlgeschlagen" und läuft weiter —
 * die Aufgabe fehlt, niemand wird erinnert, und im Protokoll steht eine
 * Zeile, die niemand liest. Dasselbe Muster ist bei
 * `mis_audit_log.action` belegt: dort scheitert der Eintrag der
 * Lead-Kette bis heute lautlos am CHECK.
 *
 * ── WAS HIER ECHT LÄUFT ───────────────────────────────────────────────
 * Die Kette selbst, gegen echtes Postgres, mit der Tabelle WORTGLEICH
 * aus ihrer Migration — samt CHECKs und Fremdschlüsseln. Geprüft wird
 * nicht, ob die Funktion „ok" meldet, sondern ob die Aufgabe hinterher
 * WIRKLICH in der Datenbank steht.
 *
 * ── CRON_SECRET ───────────────────────────────────────────────────────
 * Live läuft keine dieser Ketten: `CRON_SECRET` ist nicht gesetzt,
 * `pruefeCronGeheimnis` weist jeden Aufruf ab, und `ops_aufgaben` steht
 * produktiv bei null Zeilen. Das ist eine Entscheidung des Betriebs und
 * kein Gegenstand dieser Tests — sie messen, was am Tag der
 * Scharfschaltung passiert.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, baueOpsAufgaben, STAMM_ORG } from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'
import { meldeFehlendeNachweise } from '@/lib/automation/nachweis-fehlt'

const ORG_A = STAMM_ORG
const ORG_B = '00000000-0000-4000-8000-0000000000b0'
const ADMIN = '00000000-0000-4000-8000-00000000a001'
const PDL_A = '00000000-0000-4000-8000-00000000a002'
const KUNDE_A = '00000000-0000-4000-8000-00000000c001'
const KUNDE_B = '00000000-0000-4000-8000-00000000c002'
const ENGEL_A = '00000000-0000-4000-8000-00000000e001'
const ENGEL_B = '00000000-0000-4000-8000-00000000e002'

let db: PGlite
let admin: SupabaseClient

/** Ein Datum, das sicher älter ist als die Nachweisfrist. */
function langeHer(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

/** Offener Nachweis, wie ihn die Kette aufgreift. */
async function offenerNachweis(opts: { org: string; kunde: string; engel: string }): Promise<string> {
  const id = crypto.randomUUID()
  await db.query(
    `INSERT INTO public.service_records
       (id, organization_id, client_id, caregiver_id, date, start_time, end_time,
        service_type, budget_type, amount, status, caregiver_initials, proof_status)
     VALUES ($1,$2,$3,$4,$5,'09:00','10:00','alltagsbegleitung','entlastung',40,
             'draft','MB','ENTWURF')`,
    [id, opts.org, opts.kunde, opts.engel, langeHer()],
  )
  return id
}

async function aufgaben(org?: string): Promise<Array<Record<string, unknown>>> {
  const r = org
    ? await db.query(`SELECT * FROM public.ops_aufgaben WHERE organization_id = $1`, [org])
    : await db.query(`SELECT * FROM public.ops_aufgaben`)
  return r.rows as Array<Record<string, unknown>>
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await baueOpsAufgaben(db)
  admin = macheSupabaseClient(db) as unknown as SupabaseClient

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@example.org'), ('${PDL_A}', 'pdl@example.org');
    INSERT INTO public.profiles (id, role, first_name, last_name, email) VALUES
      ('${ADMIN}', 'admin', 'Admin', 'Alpha', 'admin@example.org'),
      ('${PDL_A}', 'pdl',   'Petra', 'Leitung', 'pdl@example.org');
    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${ORG_A}', 'Mandant Alpha', 'hessen', 'active'),
      ('${ORG_B}', 'Mandant Beta',  'hessen', 'active');
    INSERT INTO public.clients
      (id, organization_id, customer_number, first_name, last_name, status) VALUES
      ('${KUNDE_A}', '${ORG_A}', 'K-A1', 'Erika', 'Alpha', 'active'),
      ('${KUNDE_B}', '${ORG_B}', 'K-B1', 'Berta', 'Beta',  'active');
    INSERT INTO public.caregivers
      (id, organization_id, first_name, last_name, initials, status) VALUES
      ('${ENGEL_A}', '${ORG_A}', 'Marek', 'Alpha', 'MA', 'active'),
      ('${ENGEL_B}', '${ORG_B}', 'Mara',  'Beta',  'MB', 'active');
    -- Ohne Mitgliedschaft findet ersterPdlDerOrg niemanden, und die
    -- Kette legt gar nichts an (siehe "Ohne Empfaenger" unten).
    INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
      ('${ORG_A}', '${PDL_A}', 'pdl');
  `)
}, 120_000)

beforeEach(async () => {
  await db.exec(`DELETE FROM public.ops_aufgaben; DELETE FROM public.service_records;`)
})

describe('Die Aufgabe entsteht WIRKLICH', () => {
  it('ein überfälliger Nachweis erzeugt eine Aufgabe in der Datenbank', async () => {
    await offenerNachweis({ org: ORG_A, kunde: KUNDE_A, engel: ENGEL_A })
    const ergebnis = await meldeFehlendeNachweise(admin, ORG_A, ADMIN)

    expect(ergebnis.fehler, JSON.stringify(ergebnis.fehler)).toEqual([])
    expect(ergebnis.geprueft).toBe(1)
    // Der Kern: nicht „die Funktion meldet ok", sondern die Zeile steht.
    const a = await aufgaben(ORG_A)
    expect(a.length, 'Kette meldete Erfolg, aber es steht keine Aufgabe in der DB').toBeGreaterThan(0)
  })

  it('die geschriebenen Werte halten die CHECK-Constraints ein', async () => {
    // Ein nicht eingetragener Wert liesse den INSERT scheitern — die
    // Kette meldete „Anlage fehlgeschlagen" und liefe weiter.
    await offenerNachweis({ org: ORG_A, kunde: KUNDE_A, engel: ENGEL_A })
    await meldeFehlendeNachweise(admin, ORG_A, ADMIN)
    const a = await aufgaben(ORG_A)
    expect(a.length).toBeGreaterThan(0)
    for (const auf of a) {
      expect(['allgemein','kunde','mitarbeiter','einsatz','dokument','verordnung',
              'abrechnung','pflege','qualifikation','dienstplan','urlaub',
              'kommunikation','system']).toContain(auf.kategorie)
      expect(['niedrig','mittel','hoch','kritisch']).toContain(auf.prioritaet)
      expect(['offen','in_bearbeitung','warten','erledigt','storniert','ueberfaellig'])
        .toContain(auf.status)
    }
  })

  it('ein frischer Nachweis wird nicht gemeldet — die Frist ist der Zweck', async () => {
    const id = crypto.randomUUID()
    await db.query(
      `INSERT INTO public.service_records
         (id, organization_id, client_id, caregiver_id, date, start_time, end_time,
          service_type, budget_type, amount, status, caregiver_initials, proof_status)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,'09:00','10:00','alltagsbegleitung','entlastung',40,
               'draft','MB','ENTWURF')`,
      [id, ORG_A, KUNDE_A, ENGEL_A],
    )
    const ergebnis = await meldeFehlendeNachweise(admin, ORG_A, ADMIN)
    expect(ergebnis.geprueft).toBe(0)
    expect(await aufgaben(ORG_A)).toEqual([])
  })
})

describe('Idempotenz — zweimal laufen ändert nichts', () => {
  it('der zweite Lauf am selben Tag erzeugt keine zweite Aufgabe', async () => {
    // Ohne Dublettenschutz stünde nach einer Woche siebenmal dasselbe in
    // der Liste, und die Liste wäre danach unbrauchbar.
    await offenerNachweis({ org: ORG_A, kunde: KUNDE_A, engel: ENGEL_A })
    await meldeFehlendeNachweise(admin, ORG_A, ADMIN)
    const nachErstem = (await aufgaben(ORG_A)).length
    await meldeFehlendeNachweise(admin, ORG_A, ADMIN)
    expect((await aufgaben(ORG_A)).length, 'zweiter Lauf hat verdoppelt').toBe(nachErstem)
  })

  it('auch ein dritter Lauf bleibt dabei', async () => {
    await offenerNachweis({ org: ORG_A, kunde: KUNDE_A, engel: ENGEL_A })
    for (let i = 0; i < 3; i++) await meldeFehlendeNachweise(admin, ORG_A, ADMIN)
    const a = await aufgaben(ORG_A)
    expect(a.length).toBeGreaterThan(0)
    const erste = (await aufgaben(ORG_A)).length
    await meldeFehlendeNachweise(admin, ORG_A, ADMIN)
    expect((await aufgaben(ORG_A)).length).toBe(erste)
  })
})

describe('Mandantentrennung', () => {
  it('der Lauf für Mandant A rührt die Nachweise von B nicht an', async () => {
    await offenerNachweis({ org: ORG_A, kunde: KUNDE_A, engel: ENGEL_A })
    await offenerNachweis({ org: ORG_B, kunde: KUNDE_B, engel: ENGEL_B })

    const ergebnis = await meldeFehlendeNachweise(admin, ORG_A, ADMIN)
    expect(ergebnis.geprueft, 'Lauf für A hat auch B geprüft').toBe(1)

    expect(await aufgaben(ORG_B), 'Lauf für A hat eine Aufgabe bei B angelegt').toEqual([])
    expect((await aufgaben(ORG_A)).length).toBeGreaterThan(0)
  })

  it('jede Aufgabe trägt die Organisation, für die der Lauf lief', async () => {
    // Ohne organization_id fiele die Zeile auf den Spalten-Default und
    // landete in der Stamm-Organisation — für den eigenen Mandanten
    // hinter dem Fence unsichtbar.
    //
    // Gefahren wird mit ORG_A: nur dort gibt es einen Empfänger, und
    // ohne Empfänger entsteht gar keine Aufgabe (siehe BEFUND unten).
    await offenerNachweis({ org: ORG_A, kunde: KUNDE_A, engel: ENGEL_A })
    await meldeFehlendeNachweise(admin, ORG_A, ADMIN)
    const a = await aufgaben()
    expect(a.length).toBeGreaterThan(0)
    for (const auf of a) expect(auf.organization_id).toBe(ORG_A)
  })
})

describe('Fehlerbehandlung', () => {
  it('ein leerer Mandant ist kein Fehler, sondern ein leeres Ergebnis', async () => {
    const ergebnis = await meldeFehlendeNachweise(admin, ORG_B, ADMIN)
    expect(ergebnis).toEqual({ geprueft: 0, aufgabenErstellt: 0, fehler: [] })
  })

  it('mehrere offene Nachweise werden alle abgearbeitet', async () => {
    // Ein Fehler an einem Nachweis darf die übrigen nicht mitreissen —
    // die Kette fängt je Vorgang ab (`try` im Schleifenrumpf).
    for (let i = 0; i < 3; i++) {
      await offenerNachweis({ org: ORG_A, kunde: KUNDE_A, engel: ENGEL_A })
    }
    const ergebnis = await meldeFehlendeNachweise(admin, ORG_A, ADMIN)
    expect(ergebnis.geprueft).toBe(3)
    expect(ergebnis.fehler).toEqual([])
    expect((await aufgaben(ORG_A)).length).toBe(3)
  })
})

describe('BEFUND: ohne Empfänger meldet die Kette eine stille Null', () => {
  /**
   * Gefunden am 14.09.2026 beim Bau dieser Kette.
   *
   * `meldeFehlendeNachweise` legt eine Aufgabe nur an, wenn ein
   * Empfänger feststeht: entweder `caregivers.user_id` (die
   * Betreuungskraft hat ein Konto) oder `ersterPdlDerOrg` (eine PDL bzw.
   * ein Admin ist der Organisation zugeordnet). Fehlen beide, ist das
   * Ergebnis
   *
   *     { geprueft: 1, aufgabenErstellt: 0, fehler: [] }
   *
   * — also ohne Fehler. Für den Betrieb liest sich das wie „ein Nachweis
   * geprüft, nichts zu tun". Tatsächlich heisst es: „ein Nachweis ist
   * überfällig, und es liess sich niemand finden, dem man das sagen
   * könnte." Beides ergibt dieselbe Zeile im Protokoll.
   *
   * Das ist dasselbe Muster wie die leere Bewerberliste in
   * /mis/recruiting (Block 17) und die org-blinden Policies (Block 23):
   * ein Zustand, der sich als Normalfall tarnt.
   *
   * NICHT BEHOBEN in diesem Block, weil die Abhilfe eine Entscheidung
   * verlangt: eine Aufgabe ohne Verantwortlichen ist nicht sinnvoll, ein
   * stiller Durchlauf aber auch nicht. Denkbar wäre eine Meldung an die
   * Administration („N Nachweise überfällig, kein Empfänger
   * ermittelbar") — wer sie bekommt, ist eine Frage des Betriebs.
   */
  it('ein überfälliger Nachweis ohne jeden Empfänger erzeugt nichts und meldet nichts', async () => {
    // ORG_B hat weder ein organization_members-Mitglied noch eine
    // Betreuungskraft mit Konto.
    await offenerNachweis({ org: ORG_B, kunde: KUNDE_B, engel: ENGEL_B })
    const ergebnis = await meldeFehlendeNachweise(admin, ORG_B, ADMIN)

    expect(ergebnis.geprueft, 'der Nachweis wurde gesehen').toBe(1)
    expect(ergebnis.aufgabenErstellt, 'aber niemand wurde benachrichtigt').toBe(0)
    expect(ergebnis.fehler, 'und gemeldet wurde es auch nicht').toEqual([])
    expect(await aufgaben(ORG_B)).toEqual([])
  })

  it('mit zugeordneter PDL entsteht die Aufgabe', async () => {
    // Die Gegenprobe: derselbe Fall, nur mit Empfänger. Ohne sie könnte
    // der Test oben auch dann grün sein, wenn die Kette generell nichts
    // anlegt.
    await offenerNachweis({ org: ORG_A, kunde: KUNDE_A, engel: ENGEL_A })
    const ergebnis = await meldeFehlendeNachweise(admin, ORG_A, ADMIN)
    expect(ergebnis.aufgabenErstellt).toBeGreaterThan(0)
  })
})
