/**
 * PGlite: Sammelrechnungslauf-Haertung (Migration 20260925000000)
 *
 * Die Parallelitaetssperre, die Wiederaufnahme und die Zaehler leben in
 * SQL — als partieller UNIQUE-Index, als Advisory-Lock und als Aggregat
 * ueber die Gruppentabelle. Eine TypeScript-Attrappe kann davon nichts
 * beweisen: sie wuerde genau die Annahmen bestaetigen, die man ohnehin
 * schon getroffen hat. Deshalb laeuft die Migration hier auf einer
 * echten PostgreSQL-Instanz und wird auf ihr Verhalten geprueft.
 *
 * Geprueft:
 *   1. Beanspruchung — erster Aufruf gewinnt, zweiter wird abgewiesen
 *   2. Verwaiste Sperre wird uebernommen, nicht verdoppelt
 *   3. Wiederaufnahme eines abgebrochenen Laufs
 *   4. Der UNIQUE-Index haelt auch ohne die Funktion
 *   5. Zaehler und Laufzeit stammen aus der Gruppentabelle
 *   6. Idempotenz der Gruppenzeilen (UNIQUE je Lauf)
 *   7. Eingabepruefung (Monat, Mandant, Status)
 *   8. billing_audit_trail nimmt 'invoice_draft', 'tariff_lookup' und
 *      'sammelrechnungslauf' — der Befund, der diese Migration ausgeloest hat
 *   9. Keine anon-Ausfuehrung
 *  10. Rollback
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { AUDIT_ENTITY_TYPES } from '@/lib/billing/core/audit'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const MIGRATION = '20260925000000_sammelrechnungslauf_haertung.sql'
const ROLLBACK = '20260925000001_rollback_sammelrechnungslauf_haertung.sql'

const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const ACTOR = '11111111-0000-4000-8000-000000000001'
const ACTOR_2 = '22222222-0000-4000-8000-000000000001'
const KLIENT_1 = 'c1c1c1c1-0000-4000-8000-000000000001'
const KLIENT_2 = 'c2c2c2c2-0000-4000-8000-000000000001'
const MONAT = '2026-07'

type Zeile = Record<string, unknown>

describe('PGlite: Sammelrechnungslauf-Haertung', () => {
  let db: InstanceType<typeof PGlite>

  async function beanspruche(
    org = ORG_A,
    monat = MONAT,
    actor = ACTOR,
    staleMinuten = 15,
  ): Promise<{ zeile?: Zeile; fehler?: string }> {
    try {
      const r = await db.query<Zeile>(
        `SELECT * FROM public.sammelrechnung_lauf_beanspruchen($1, $2, $3, '{}'::jsonb, false, false, $4)`,
        [org, monat, actor, staleMinuten] as never[],
      )
      return { zeile: r.rows[0] }
    } catch (e: unknown) {
      return { fehler: (e as { message?: string })?.message ?? String(e) }
    }
  }

  async function kopf(laufId: string): Promise<Zeile> {
    const r = await db.query<Zeile>('SELECT * FROM public.sammelrechnungslaeufe WHERE id = $1', [laufId] as never[])
    return r.rows[0]
  }

  async function gruppe(laufId: string, clientId: string, status: string, betrag: number | null = null, bestand = false) {
    await db.query(
      `INSERT INTO public.sammelrechnungslauf_gruppen
         (lauf_id, organization_id, client_id, budget_type, status, betrag_cent, bestand, verarbeitet_am)
       VALUES ($1, $2, $3, 'entlastungsbetrag', $4, $5, $6, now())
       ON CONFLICT (lauf_id, client_id, budget_type) DO UPDATE
         SET status = EXCLUDED.status, betrag_cent = EXCLUDED.betrag_cent, bestand = EXCLUDED.bestand`,
      [laufId, ORG_A, clientId, status, betrag, bestand] as never[],
    )
  }

  beforeAll(async () => {
    db = new PGlite()

    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
      END $$;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('test.user_id', true), '')::uuid
      $$;

      CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text NOT NULL DEFAULT 'Org');
      INSERT INTO public.organizations (id) VALUES ('${ORG_A}'), ('${ORG_B}');

      -- Die Fachrollen-Funktionen aus 20260924000000. Hier reicht eine
      -- Attrappe: geprueft wird in diesem File die Batch-Mechanik, nicht
      -- das Rollenmodell (das tut rollen-tenant-crossover-pglite).
      CREATE FUNCTION public.darf(p_berechtigung text) RETURNS boolean
        LANGUAGE sql STABLE AS $$ SELECT true $$;
      CREATE FUNCTION public.current_org_id() RETURNS uuid
        LANGUAGE sql STABLE AS $$ SELECT '${ORG_A}'::uuid $$;

      -- billing_audit_trail mit dem CHECK-Stand VOR dieser Migration —
      -- also nach 20260921010000, wo 'invoice_draft' und 'tariff_lookup'
      -- herausgefallen sind. Nur so laesst sich zeigen, dass die
      -- Migration den Befund tatsaechlich behebt.
      CREATE TABLE public.billing_audit_trail (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        entity_type text NOT NULL,
        entity_id uuid NOT NULL,
        action text NOT NULL,
        previous_state jsonb,
        new_state jsonb,
        reason text,
        actor_id uuid,
        checksum text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT billing_audit_trail_entity_type_check CHECK (
          entity_type = ANY(ARRAY['invoice', 'tariff', 'correction', 'sgb_v_korrekturlauf'])
        )
      );
    `)

    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf-8'))
  }, 60000)

  afterAll(async () => {
    await db?.close()
  })

  beforeEach(async () => {
    await db.exec(`
      DELETE FROM public.sammelrechnungslauf_gruppen;
      DELETE FROM public.sammelrechnungslaeufe;
      DELETE FROM public.billing_audit_trail;
    `)
  })

  // ═══════════════════════════════════════════════════════════════
  // 1. Doppelstart
  // ═══════════════════════════════════════════════════════════════
  describe('Doppelstart-Verhinderung', () => {
    it('der erste Aufruf bekommt eine Batch-ID', async () => {
      const { zeile, fehler } = await beanspruche()
      expect(fehler).toBeUndefined()
      expect(zeile?.lauf_id).toMatch(/^[0-9a-f-]{36}$/)
      expect(zeile?.wiederaufnahme).toBe(false)
      expect(zeile?.offene_gruppen).toBe(0)
    })

    it('der zweite Aufruf wird abgewiesen und legt KEINEN zweiten Kopfsatz an', async () => {
      const erster = await beanspruche()
      const zweiter = await beanspruche(ORG_A, MONAT, ACTOR_2)

      expect(zweiter.fehler).toContain('SAMMELRECHNUNG_LAEUFT')
      // Die Absage nennt die Batch-ID des laufenden Vorgangs — sonst
      // wuesste der Zweite nicht, worauf er warten soll.
      expect(zweiter.fehler).toContain(String(erster.zeile?.lauf_id))

      const { rows } = await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM public.sammelrechnungslaeufe',
      )
      expect(rows[0].n).toBe(1)
    })

    it('ein anderer Monat desselben Mandanten laeuft parallel', async () => {
      await beanspruche(ORG_A, '2026-07')
      const anderer = await beanspruche(ORG_A, '2026-08')
      expect(anderer.fehler).toBeUndefined()
      expect(anderer.zeile?.lauf_id).not.toBe(undefined)
    })

    it('ein anderer Mandant im selben Monat laeuft parallel', async () => {
      await beanspruche(ORG_A, MONAT)
      const andererMandant = await beanspruche(ORG_B, MONAT)
      expect(andererMandant.fehler).toBeUndefined()
    })

    it('nach dem Abschluss darf wieder gestartet werden', async () => {
      const erster = await beanspruche()
      await db.query('SELECT public.sammelrechnung_lauf_abschliessen($1, $2, NULL)', [
        erster.zeile?.lauf_id, 'abgeschlossen',
      ] as never[])

      const zweiter = await beanspruche()
      expect(zweiter.fehler).toBeUndefined()
      expect(zweiter.zeile?.lauf_id).not.toBe(erster.zeile?.lauf_id)
    })

    it('der UNIQUE-Index haelt auch ohne die Funktion', async () => {
      // Gegenprobe zur Funktion: selbst ein direktes INSERT — etwa aus
      // einem kuenftigen Codepfad, der die Beanspruchung umgeht — kann
      // keinen zweiten laufenden Lauf anlegen.
      await beanspruche()
      let fehler = ''
      try {
        await db.query(
          `INSERT INTO public.sammelrechnungslaeufe (organization_id, period_month) VALUES ($1, $2)`,
          [ORG_A, MONAT] as never[],
        )
      } catch (e: unknown) {
        fehler = (e as { message?: string })?.message ?? ''
      }
      expect(fehler).toMatch(/uq_sammelrechnungslauf_aktiv|duplicate key/i)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // 2. Verwaiste Sperre
  // ═══════════════════════════════════════════════════════════════
  describe('Verwaiste Sperre', () => {
    it('bleibt bestehen, solange der Herzschlag frisch ist', async () => {
      const erster = await beanspruche()
      await db.query('SELECT public.sammelrechnung_lauf_heartbeat($1)', [erster.zeile?.lauf_id] as never[])
      const zweiter = await beanspruche()
      expect(zweiter.fehler).toContain('SAMMELRECHNUNG_LAEUFT')
    })

    it('wird nach Ablauf der Frist uebernommen — nicht verdoppelt', async () => {
      const erster = await beanspruche()
      const laufId = erster.zeile?.lauf_id as string
      await gruppe(laufId, KLIENT_1, 'erstellt', 13100)

      // Der Vorgang ist gestorben: kein Herzschlag mehr seit 30 Minuten.
      await db.query(
        `UPDATE public.sammelrechnungslaeufe SET heartbeat_am = now() - interval '30 minutes' WHERE id = $1`,
        [laufId] as never[],
      )

      const uebernahme = await beanspruche(ORG_A, MONAT, ACTOR_2)
      expect(uebernahme.fehler).toBeUndefined()
      expect(uebernahme.zeile?.lauf_id).toBe(laufId)   // dieselbe Batch-ID
      expect(uebernahme.zeile?.wiederaufnahme).toBe(true)

      const k = await kopf(laufId)
      expect(k.versuch).toBe(2)
      expect(k.actor_id).toBe(ACTOR_2)

      const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM public.sammelrechnungslaeufe')
      expect(rows[0].n).toBe(1)
    })

    it('der Herzschlag greift nur bei einem laufenden Lauf', async () => {
      const erster = await beanspruche()
      const laufId = erster.zeile?.lauf_id as string
      await db.query('SELECT public.sammelrechnung_lauf_abschliessen($1, $2, NULL)', [laufId, 'abgeschlossen'] as never[])
      const r = await db.query<{ h: boolean | null }>(
        'SELECT public.sammelrechnung_lauf_heartbeat($1) AS h', [laufId] as never[],
      )
      // NULL heisst: „dieser Lauf gehoert dir nicht mehr". Der Aufrufer
      // kann daran erkennen, dass er uebernommen oder beendet wurde.
      expect(r.rows[0].h).toBeNull()
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // 3. Wiederaufnahme
  // ═══════════════════════════════════════════════════════════════
  describe('Wiederaufnahme nach Abbruch', () => {
    it('setzt einen abgebrochenen Lauf fort, statt einen zweiten anzulegen', async () => {
      const erster = await beanspruche()
      const laufId = erster.zeile?.lauf_id as string
      await gruppe(laufId, KLIENT_1, 'erstellt', 4500)
      await gruppe(laufId, KLIENT_2, 'offen')
      await db.query('SELECT public.sammelrechnung_lauf_abschliessen($1, $2, $3)', [
        laufId, 'abgebrochen', 'Zeitueberschreitung',
      ] as never[])

      const fortsetzung = await beanspruche()
      expect(fortsetzung.zeile?.lauf_id).toBe(laufId)
      expect(fortsetzung.zeile?.wiederaufnahme).toBe(true)
      expect(fortsetzung.zeile?.offene_gruppen).toBe(1)

      const k = await kopf(laufId)
      expect(k.status).toBe('laeuft')
      expect(k.versuch).toBe(2)
      // Der Abbruchgrund des Vorlaufs wird geloescht: er beschreibt den
      // alten Versuch, nicht den neuen.
      expect(k.abbruchgrund).toBeNull()
      expect(k.beendet_am).toBeNull()
    })

    it('meldet keine Wiederaufnahme, wenn der Vorlauf gar nichts erledigt hatte', async () => {
      const erster = await beanspruche()
      const laufId = erster.zeile?.lauf_id as string
      await db.query('SELECT public.sammelrechnung_lauf_abschliessen($1, $2, $3)', [
        laufId, 'abgebrochen', 'sofort abgebrochen',
      ] as never[])

      const fortsetzung = await beanspruche()
      expect(fortsetzung.zeile?.lauf_id).toBe(laufId)
      expect(fortsetzung.zeile?.wiederaufnahme).toBe(false)
    })

    it('ein fehlgeschlagener Lauf blockiert nicht und wird NICHT fortgesetzt', async () => {
      // Fehlgeschlagen heisst: der Lauf ist an etwas gescheitert, das
      // sich nicht durch Weitermachen loest. Ein neuer Lauf faengt neu
      // an — die erzeugten Rechnungen bleiben trotzdem stehen und werden
      // von create_invoice_draft_atomic nicht doppelt angelegt.
      const erster = await beanspruche()
      const laufId = erster.zeile?.lauf_id as string
      await db.query('SELECT public.sammelrechnung_lauf_abschliessen($1, $2, $3)', [
        laufId, 'fehlgeschlagen', 'Datenbank nicht erreichbar',
      ] as never[])

      const zweiter = await beanspruche()
      expect(zweiter.fehler).toBeUndefined()
      expect(zweiter.zeile?.lauf_id).not.toBe(laufId)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // 4. Zaehler und Laufzeit
  // ═══════════════════════════════════════════════════════════════
  describe('Abschluss zaehlt aus der Gruppentabelle', () => {
    it('zaehlt erstellt / uebersprungen / fehlgeschlagen / offen getrennt', async () => {
      const { zeile } = await beanspruche()
      const laufId = zeile?.lauf_id as string
      await gruppe(laufId, KLIENT_1, 'erstellt', 4500)
      await gruppe(laufId, KLIENT_2, 'uebersprungen')
      await gruppe(laufId, 'c3c3c3c3-0000-4000-8000-000000000001', 'fehlgeschlagen')
      await gruppe(laufId, 'c4c4c4c4-0000-4000-8000-000000000001', 'offen')

      const r = await db.query<Zeile>(
        'SELECT * FROM public.sammelrechnung_lauf_abschliessen($1, $2, NULL)',
        [laufId, 'abgeschlossen'] as never[],
      )
      const k = r.rows[0]
      expect(k.gruppen_gesamt).toBe(4)
      expect(k.gruppen_erstellt).toBe(1)
      expect(k.gruppen_uebersprungen).toBe(1)
      expect(k.gruppen_fehlgeschlagen).toBe(1)
      expect(k.gruppen_offen).toBe(1)
      expect(Number(k.summe_cent)).toBe(4500)
      expect(k.status).toBe('abgeschlossen')
      expect(k.beendet_am).not.toBeNull()
      expect(Number(k.laufzeit_ms)).toBeGreaterThanOrEqual(0)
    })

    it('laesst Bestandsrechnungen aus der Summe — sonst zaehlt jeder Wiederholungslauf denselben Umsatz', async () => {
      const { zeile } = await beanspruche()
      const laufId = zeile?.lauf_id as string
      await gruppe(laufId, KLIENT_1, 'erstellt', 4500, false)
      await gruppe(laufId, KLIENT_2, 'erstellt', 9900, true)   // gab es schon

      const r = await db.query<Zeile>(
        'SELECT * FROM public.sammelrechnung_lauf_abschliessen($1, $2, NULL)',
        [laufId, 'abgeschlossen'] as never[],
      )
      expect(r.rows[0].gruppen_erstellt).toBe(2)
      expect(Number(r.rows[0].summe_cent)).toBe(4500)
    })

    it('kommt mit einem Lauf ohne jede Gruppe zurecht', async () => {
      const { zeile } = await beanspruche()
      const r = await db.query<Zeile>(
        'SELECT * FROM public.sammelrechnung_lauf_abschliessen($1, $2, NULL)',
        [zeile?.lauf_id, 'abgeschlossen'] as never[],
      )
      expect(r.rows[0].gruppen_gesamt).toBe(0)
      expect(Number(r.rows[0].summe_cent)).toBe(0)
    })

    it('weist einen unbekannten Status ab', async () => {
      const { zeile } = await beanspruche()
      let fehler = ''
      try {
        await db.query('SELECT public.sammelrechnung_lauf_abschliessen($1, $2, NULL)', [
          zeile?.lauf_id, 'irgendwas',
        ] as never[])
      } catch (e: unknown) { fehler = (e as { message?: string })?.message ?? '' }
      expect(fehler).toContain('SAMMELRECHNUNG_STATUS_UNGUELTIG')
    })

    it('weist eine unbekannte Batch-ID ab, statt still nichts zu tun', async () => {
      let fehler = ''
      try {
        await db.query('SELECT public.sammelrechnung_lauf_abschliessen($1, $2, NULL)', [
          '99999999-0000-4000-8000-000000000001', 'abgeschlossen',
        ] as never[])
      } catch (e: unknown) { fehler = (e as { message?: string })?.message ?? '' }
      expect(fehler).toContain('SAMMELRECHNUNG_LAUF_UNBEKANNT')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // 5. Grosse Datenmengen
  // ═══════════════════════════════════════════════════════════════
  describe('Grosse Laeufe', () => {
    it('traegt 150 Gruppen und zaehlt sie korrekt', async () => {
      const { zeile } = await beanspruche()
      const laufId = zeile?.lauf_id as string

      await db.query(
        `INSERT INTO public.sammelrechnungslauf_gruppen
           (lauf_id, organization_id, client_id, budget_type, status, betrag_cent)
         SELECT $1, $2,
                ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
                'entlastungsbetrag',
                CASE WHEN i % 10 = 0 THEN 'uebersprungen' ELSE 'erstellt' END,
                CASE WHEN i % 10 = 0 THEN NULL ELSE 1000 END
           FROM generate_series(1, 150) AS i`,
        [laufId, ORG_A] as never[],
      )

      const r = await db.query<Zeile>(
        'SELECT * FROM public.sammelrechnung_lauf_abschliessen($1, $2, NULL)',
        [laufId, 'abgeschlossen'] as never[],
      )
      expect(r.rows[0].gruppen_gesamt).toBe(150)
      expect(r.rows[0].gruppen_uebersprungen).toBe(15)
      expect(r.rows[0].gruppen_erstellt).toBe(135)
      expect(Number(r.rows[0].summe_cent)).toBe(135 * 1000)
    })

    it('haelt die Gruppe je Lauf eindeutig — zweimal dieselbe Gruppe geht nicht', async () => {
      const { zeile } = await beanspruche()
      const laufId = zeile?.lauf_id as string
      await db.query(
        `INSERT INTO public.sammelrechnungslauf_gruppen (lauf_id, organization_id, client_id, budget_type)
         VALUES ($1, $2, $3, 'entlastungsbetrag')`,
        [laufId, ORG_A, KLIENT_1] as never[],
      )
      let fehler = ''
      try {
        await db.query(
          `INSERT INTO public.sammelrechnungslauf_gruppen (lauf_id, organization_id, client_id, budget_type)
           VALUES ($1, $2, $3, 'entlastungsbetrag')`,
          [laufId, ORG_A, KLIENT_1] as never[],
        )
      } catch (e: unknown) { fehler = (e as { message?: string })?.message ?? '' }
      expect(fehler).toMatch(/uq_sammelrechnungslauf_gruppe|duplicate key/i)
    })

    it('nimmt Gruppen ohne budget_type auf — sie sind der Befund, nicht der Fehler', async () => {
      const { zeile } = await beanspruche()
      const r = await db.query<Zeile>(
        `INSERT INTO public.sammelrechnungslauf_gruppen
           (lauf_id, organization_id, client_id, budget_type, status, code)
         VALUES ($1, $2, $3, '', 'uebersprungen', 'BUDGETTYP_UNBEKANNT') RETURNING id`,
        [zeile?.lauf_id, ORG_A, KLIENT_1] as never[],
      )
      expect(r.rows).toHaveLength(1)
    })

    it('loescht die Gruppen mit dem Lauf (ON DELETE CASCADE)', async () => {
      const { zeile } = await beanspruche()
      const laufId = zeile?.lauf_id as string
      await gruppe(laufId, KLIENT_1, 'erstellt', 100)
      await db.query('DELETE FROM public.sammelrechnungslaeufe WHERE id = $1', [laufId] as never[])
      const r = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM public.sammelrechnungslauf_gruppen')
      expect(r.rows[0].n).toBe(0)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // 6. Eingabepruefung
  // ═══════════════════════════════════════════════════════════════
  describe('Eingabepruefung', () => {
    it('weist einen Lauf ohne Mandanten ab', async () => {
      const { fehler } = await beanspruche(null as unknown as string)
      expect(fehler).toContain('SAMMELRECHNUNG_OHNE_MANDANT')
    })

    it('weist einen unmoeglichen Monat ab', async () => {
      for (const monat of ['2026-13', '2026-00', '202607', 'Juli']) {
        const { fehler } = await beanspruche(ORG_A, monat)
        expect(fehler, monat).toContain('SAMMELRECHNUNG_MONAT_UNGUELTIG')
      }
    })

    it('haelt den Monat auch am CHECK der Tabelle fest', async () => {
      let fehler = ''
      try {
        await db.query(
          `INSERT INTO public.sammelrechnungslaeufe (organization_id, period_month) VALUES ($1, '2026-13')`,
          [ORG_B] as never[],
        )
      } catch (e: unknown) { fehler = (e as { message?: string })?.message ?? '' }
      expect(fehler).toMatch(/period_month|check constraint/i)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // 7. Der Audit-Befund
  // ═══════════════════════════════════════════════════════════════
  describe('billing_audit_trail: die verlorenen entity_type-Werte', () => {
    async function schreibe(typ: string): Promise<string> {
      try {
        await db.query(
          `INSERT INTO public.billing_audit_trail (organization_id, entity_type, entity_id, action)
           VALUES ($1, $2, $3, 'test')`,
          [ORG_A, typ, KLIENT_1] as never[],
        )
        return ''
      } catch (e: unknown) {
        return (e as { message?: string })?.message ?? 'fehler'
      }
    }

    it('nimmt invoice_draft wieder an — jede uebersprungene Gruppe schreibt darauf', async () => {
      expect(await schreibe('invoice_draft')).toBe('')
    })

    it('nimmt tariff_lookup wieder an — das schreibt die RPC selbst', async () => {
      expect(await schreibe('tariff_lookup')).toBe('')
    })

    it('nimmt sammelrechnungslauf an', async () => {
      expect(await schreibe('sammelrechnungslauf')).toBe('')
    })

    it('weist einen erfundenen Typ weiterhin ab', async () => {
      expect(await schreibe('irgendwas_neues')).toMatch(/entity_type_check|check constraint/i)
    })

    it('kennt jeden Wert aus AUDIT_ENTITY_TYPES', async () => {
      // Der Gleichstand zwischen TypeScript und Datenbank ist die
      // eigentliche Regression: ein Wert, den TypeScript erlaubt und
      // Postgres ablehnt, faellt erst zur Laufzeit auf — und dann still,
      // weil der Audit-Aufruf gekapselt ist.
      const abgelehnt: string[] = []
      for (const typ of AUDIT_ENTITY_TYPES) {
        if (await schreibe(typ)) abgelehnt.push(typ)
      }
      expect(abgelehnt).toEqual([])
    })

    it('traegt die Batch-ID als eigene Spalte', async () => {
      const { zeile } = await beanspruche()
      await db.query(
        `INSERT INTO public.billing_audit_trail
           (organization_id, entity_type, entity_id, action, batch_id)
         VALUES ($1, 'sammelrechnungslauf', $2, 'sammelrechnung_gestartet', $2)`,
        [ORG_A, zeile?.lauf_id] as never[],
      )
      const r = await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM public.billing_audit_trail WHERE batch_id = $1',
        [zeile?.lauf_id] as never[],
      )
      expect(r.rows[0].n).toBe(1)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // 8. Keine anon-Ausfuehrung
  // ═══════════════════════════════════════════════════════════════
  it('gibt anon und authenticated keine der drei Funktionen', async () => {
    const { rows } = await db.query<{ p: string; rolle: string; darf: boolean }>(`
      SELECT p.proname AS p, r.rolname AS rolle,
             has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS darf
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN (SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')) r
       WHERE n.nspname = 'public'
         AND p.proname LIKE 'sammelrechnung\\_lauf\\_%'
    `)
    expect(rows.length).toBeGreaterThanOrEqual(6)
    expect(rows.filter(r => r.darf)).toEqual([])
  })

  it('gibt service_role alle drei', async () => {
    const { rows } = await db.query<{ darf: boolean }>(`
      SELECT has_function_privilege('service_role', p.oid, 'EXECUTE') AS darf
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'sammelrechnung\\_lauf\\_%'
    `)
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.darf)).toBe(true)
  })

  it('schaltet RLS auf beiden Tabellen ein und gibt keinen Schreibweg', async () => {
    const { rows } = await db.query<{ tablename: string; relrowsecurity: boolean }>(`
      SELECT c.relname AS tablename, c.relrowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND c.relname IN ('sammelrechnungslaeufe', 'sammelrechnungslauf_gruppen')
    `)
    expect(rows).toHaveLength(2)
    expect(rows.every(r => r.relrowsecurity)).toBe(true)

    const { rows: policies } = await db.query<{ policyname: string; cmd: string; permissive: string }>(`
      SELECT policyname, cmd, permissive FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN ('sammelrechnungslaeufe', 'sammelrechnungslauf_gruppen')
    `)
    // Nur Lesepolicies plus der RESTRICTIVE Mandantenzaun. Ein Lauf ist
    // ein Protokoll — geschrieben wird er ausschliesslich von
    // service_role ueber die Routen.
    const schreibend = policies.filter(p => p.permissive === 'PERMISSIVE' && p.cmd !== 'SELECT')
    expect(schreibend).toEqual([])
    expect(policies.filter(p => p.permissive === 'RESTRICTIVE')).toHaveLength(2)
  })

  // ═══════════════════════════════════════════════════════════════
  // 9. Rollback
  // ═══════════════════════════════════════════════════════════════
  it('Rollback entfernt Tabellen und Funktionen, laesst den CHECK aber stehen', async () => {
    const db2 = new PGlite()
    await db2.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
      END $$;
      CREATE TABLE public.organizations (id uuid PRIMARY KEY);
      INSERT INTO public.organizations (id) VALUES ('${ORG_A}');
      CREATE FUNCTION public.darf(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
      CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${ORG_A}'::uuid $$;
      CREATE TABLE public.billing_audit_trail (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL, entity_type text NOT NULL,
        entity_id uuid NOT NULL, action text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT billing_audit_trail_entity_type_check CHECK (entity_type = ANY(ARRAY['invoice']))
      );
    `)
    await db2.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf-8'))
    await db2.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, ROLLBACK), 'utf-8'))

    const { rows: tabellen } = await db2.query<{ n: number }>(`
      SELECT count(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('sammelrechnungslaeufe', 'sammelrechnungslauf_gruppen')
    `)
    expect(tabellen[0].n).toBe(0)

    const { rows: funktionen } = await db2.query<{ n: number }>(`
      SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
       WHERE n2.nspname = 'public' AND p.proname LIKE 'sammelrechnung\\_lauf\\_%'
    `)
    expect(funktionen[0].n).toBe(0)

    // Der wiederhergestellte CHECK bleibt bewusst stehen: ihn erneut zu
    // verkleinern hiesse, denselben Fehler noch einmal zu machen.
    await db2.query(
      `INSERT INTO public.billing_audit_trail (organization_id, entity_type, entity_id, action)
       VALUES ($1, 'invoice_draft', $2, 'test')`,
      [ORG_A, KLIENT_1] as never[],
    )
    await db2.close()
  }, 60000)
})
