// ═══════════════════════════════════════════════════════════════════════
// Phase 4 / P1 — Wiederholungslauf unter echten Fehlerbedingungen
// ═══════════════════════════════════════════════════════════════════════
//
// __tests__/notifications/retry-worker-pglite.test.ts belegt bereits den
// Normalweg gegen echtes Postgres. Diese Datei prueft die sechs
// Betriebsszenarien, die dort NICHT abgedeckt sind:
//
//   1. Voruebergehender Providerfehler (503) — Wartezeiten und Zaehler
//   2. Dauerhafter Providerfehler (400)      — sofort Dead Letter
//   3. Obergrenze                            — der Versuch, der sie reisst
//   4. Absturz und Uebernahme                — Zaehler, Versuchsnummer
//   5. Doppelte Verarbeitung                 — zwei Laeufe gleichzeitig
//   6. Idempotenz                            — dieselbe correlation_id
//
// WAS HIER NICHT BEWIESEN WERDEN KANN
// PGlite ist eine Ein-Verbindungs-Datenbank; sie serialisiert alle
// Anweisungen. Zwei ECHT gleichzeitige Transaktionen — und damit die
// Wirkung von pg_advisory_xact_lock beim Warten — lassen sich hier nicht
// herstellen. Was Szenario 5 zeigt, ist die Stufe darunter und die
// eigentlich tragende: der partielle UNIQUE-Index laesst keine zweite
// 'laeuft'-Zeile zu, und der Worker macht daraus ein sauberes
// 'blockiert'. Das steht so auch im Bericht.
// ═══════════════════════════════════════════════════════════════════════

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { macheSupabaseClient, type PgliteSupabaseClient } from '@/__tests__/e2e/helpers/pglite-supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

const H = vi.hoisted(() => ({ client: null as PgliteSupabaseClient | null }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => H.client }))
vi.mock('resend', () => ({ Resend: class { emails = { send: async () => ({ data: null, error: null }) } } }))
vi.mock('web-push', () => ({
  default: { setVapidDetails: () => {}, sendNotification: async () => ({ statusCode: 201 }) },
}))

import { fuehreWiederholungslaufAus } from '@/lib/notifications/retry-worker'
import { registriereVorgang, _leereRegister } from '@/lib/notifications/wiederherstellung'
import { _setzeSchemaMerkerZurueck } from '@/lib/notifications/delivery-log'
import { MAX_VERSUCHE, wartezeitMinuten, type SendeErgebnis } from '@/lib/notifications/retry'

const MIGRATIONEN = ['20260923000000_notification_delivery_log.sql', '20260927000000_zustellung_retry_worker.sql']
  .map(n => path.join(__dirname, '..', '..', 'supabase', 'migrations', n))

const ORG = '00000000-0000-4000-8000-0000000000aa'
const BUCHUNG = '00000000-0000-4000-8000-0000000000dd'
const NUTZER = '00000000-0000-4000-8000-0000000000cc'

let db: InstanceType<typeof PGlite>

function alsSupabase(): SupabaseClient {
  return H.client as unknown as SupabaseClient
}

let zaehler = 0
function neuerVorgang(): string {
  zaehler++
  return `00000000-0000-4000-8000-${String(zaehler).padStart(12, '0')}`
}

/**
 * Zeit vergeht, indem die Zeilen altern — nicht ueber eine injizierte
 * Uhr. sendeIdempotent() rechnet gegen Date.now(), die Zeilen tragen
 * now() aus Postgres; eine nur im Worker eingehaengte Uhr liefe
 * auseinander und ergaebe einen gruenen Test ohne Aussage.
 */
async function altere(minuten: number): Promise<void> {
  await db.query(
    `UPDATE public.notification_delivery_log
        SET created_at   = created_at   - make_interval(mins => $1),
            attempted_at = attempted_at - make_interval(mins => $1),
            failed_at    = failed_at    - make_interval(mins => $1),
            delivered_at = delivered_at - make_interval(mins => $1)`,
    [minuten] as never[],
  )
}

async function offeneZeile(ueber: {
  correlationId?: string
  status?: 'queued' | 'failed'
  versuche?: number
  vorgangArt?: string | null
  alterMinuten?: number
} = {}): Promise<string> {
  const id = ueber.correlationId ?? neuerVorgang()
  const alter = ueber.alterMinuten ?? 6 * 60
  await db.query(
    `INSERT INTO public.notification_delivery_log
       (organization_id, channel, recipient, status, attempt_count, provider,
        sanitized_error, correlation_id, attempted_at, failed_at, created_at,
        vorgang_art, vorgang_ref, vorgang_empfaenger)
     VALUES ($1,'email','kunde@example.org',$2,$3,'resend',$4,$5,
             now() - make_interval(mins => $6), now() - make_interval(mins => $6),
             now() - make_interval(mins => $6), $7, $8, $9)`,
    [
      ORG,
      ueber.status ?? 'failed',
      ueber.versuche ?? 1,
      ueber.status === 'queued' ? null : 'Provider nicht erreichbar',
      id,
      alter,
      ueber.vorgangArt === undefined ? 'test-vorgang' : ueber.vorgangArt,
      BUCHUNG,
      NUTZER,
    ] as never[],
  )
  return id
}

/**
 * Legt einen Vorgang mit `n` echten Fehlversuchszeilen an.
 *
 * WARUM NICHT EINE ZEILE MIT attempt_count = n
 * `leseVersuchsStand()` in retry.ts zaehlt ZEILEN, nicht den Wert der
 * Spalte attempt_count. Eine einzelne Zeile mit attempt_count = 4 sieht
 * fuer den Idempotenz-Riegel deshalb aus wie ein einziger Fehlversuch —
 * eine Attrappe, die im Betrieb nie entsteht (jeder Versuch schreibt
 * seine eigene Zeile) und die den Test an der Obergrenze vorbeilaufen
 * liesse.
 */
async function mehrereFehlversuche(n: number, alterMinuten = 6 * 60): Promise<string> {
  const id = neuerVorgang()
  for (let versuch = 1; versuch <= n; versuch++) {
    await db.query(
      `INSERT INTO public.notification_delivery_log
         (organization_id, channel, recipient, status, attempt_count, provider,
          sanitized_error, correlation_id, attempted_at, failed_at, created_at,
          vorgang_art, vorgang_ref, vorgang_empfaenger)
       VALUES ($1,'email','kunde@example.org','failed',$2,'resend','Provider nicht erreichbar',$3,
               now() - make_interval(mins => $4), now() - make_interval(mins => $4),
               now() - make_interval(mins => $4), 'test-vorgang', $5, $6)`,
      [ORG, versuch, id, alterMinuten, BUCHUNG, NUTZER] as never[],
    )
  }
  return id
}

async function zeilen(correlationId: string) {
  const r = await db.query<{ status: string; grund: string | null; attempt_count: number }>(
    `SELECT status, grund, attempt_count
       FROM public.notification_delivery_log
      WHERE correlation_id = $1 ORDER BY created_at, attempt_count`,
    [correlationId] as never[],
  )
  return r.rows
}

function registriereTestVorgang(ergebnis: () => Promise<SendeErgebnis>) {
  const senden = vi.fn(ergebnis)
  registriereVorgang('test-vorgang', ['email', 'push', 'in_app'], senden)
  return senden
}

function lauf(ueber: Record<string, unknown> = {}) {
  return fuehreWiederholungslaufAus({
    admin: alsSupabase(), organisationen: [ORG], zeitbudgetMs: 60_000, ...ueber,
  })
}

async function laufZeile() {
  const r = await db.query<{
    id: string; status: string; versuch: number; verarbeitet: number
    erfolgreich: number; fehlgeschlagen: number; dead_letter: number; uebersprungen: number
  }>(`SELECT id, status, versuch, verarbeitet, erfolgreich, fehlgeschlagen, dead_letter, uebersprungen
        FROM public.zustellung_retry_laeufe`)
  return r.rows
}

beforeAll(async () => {
  db = new PGlite()

  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
    END $$;
  `)

  await db.exec(`
    CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
    CREATE TABLE public.notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid, type text, title text, body text, link text, data jsonb,
      email_sent boolean DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    INSERT INTO public.organizations (id, name) VALUES ('${ORG}', 'Stamm');
  `)

  for (const datei of MIGRATIONEN) {
    await db.exec(fs.readFileSync(datei, 'utf-8'))
  }

  H.client = macheSupabaseClient(db)
})

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  _leereRegister()
  _setzeSchemaMerkerZurueck()
  await db.exec('DELETE FROM public.notification_delivery_log; DELETE FROM public.zustellung_retry_laeufe; DELETE FROM public.notifications;')
})

// ═══════════════════════════════════════════════════════════════════════
// 1) Voruebergehender Providerfehler (503)
// ═══════════════════════════════════════════════════════════════════════

describe('Szenario 1: voruebergehender Providerfehler (503)', () => {
  it('versucht es erneut und schreibt eine zweite Fehlversuchszeile', async () => {
    const vorgang = await offeneZeile({ versuche: 1 })
    const senden = registriereTestVorgang(async () => ({ ok: false, fehler: { statusCode: 503 } }))

    await lauf()

    expect(senden).toHaveBeenCalledTimes(1)
    const stand = await zeilen(vorgang)
    expect(stand.filter(z => z.status === 'failed')).toHaveLength(2)
    // Kein Dead Letter: 503 ist voruebergehend.
    expect(stand.every(z => z.grund === null)).toBe(true)
  })

  it('zaehlt attempt_count bei jedem Versuch um genau eins hoch', async () => {
    const vorgang = await offeneZeile({ versuche: 1 })
    registriereTestVorgang(async () => ({ ok: false, fehler: { statusCode: 503 } }))

    // Drei weitere Laeufe, jeweils nach abgelaufener Wartezeit.
    for (let i = 0; i < 3; i++) {
      await altere(4 * 60)
      await lauf()
    }

    const versuche = (await zeilen(vorgang)).filter(z => z.status === 'failed').map(z => z.attempt_count)
    expect(versuche).toEqual([1, 2, 3, 4])
  })

  it.each([
    [1, wartezeitMinuten(1)],
    [2, wartezeitMinuten(2)],
    [3, wartezeitMinuten(3)],
  ])('haelt nach %i Fehlversuch(en) die Wartezeit von %i Minuten ein', async (versuche, warten) => {
    await mehrereFehlversuche(versuche, Math.max(0, warten - 1))
    const senden = registriereTestVorgang(async () => ({ ok: false, fehler: { statusCode: 503 } }))

    // Innerhalb der Wartezeit: kein Versand.
    const zuFrueh = await lauf()
    expect(senden).not.toHaveBeenCalled()
    expect(zuFrueh.metriken.wartend).toBe(1)
    expect(zuFrueh.metriken.verarbeitet).toBe(0)

    // Nach Ablauf: Versand.
    await altere(2)
    const rechtzeitig = await lauf()
    expect(senden).toHaveBeenCalledTimes(1)
    expect(rechtzeitig.metriken.fehlgeschlagen).toBe(1)
  })

  it('waechst exponentiell: 1 → 5 → 15 → 60 → 240 Minuten', () => {
    expect([1, 2, 3, 4, 5, 9].map(wartezeitMinuten)).toEqual([1, 5, 15, 60, 240, 240])
    expect(wartezeitMinuten(0)).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2) Dauerhafter Providerfehler (400)
// ═══════════════════════════════════════════════════════════════════════

describe('Szenario 2: dauerhafter Providerfehler (400)', () => {
  it('geht sofort ins Dead Letter, ohne die vier Wartezeiten zu verbrennen', async () => {
    const vorgang = await offeneZeile({ versuche: 1 })
    const senden = registriereTestVorgang(async () => ({
      ok: false,
      fehler: { statusCode: 400, message: 'Bad Request' },
    }))

    const e = await lauf()

    expect(senden).toHaveBeenCalledTimes(1)
    expect(e.metriken.deadLetter).toBe(1)
    const tot = (await zeilen(vorgang)).find(z => z.grund === 'dauerhaft_fehlgeschlagen')
    expect(tot?.status).toBe('skipped')
    // Der Vorgang ist nach EINEM Versuch erledigt, nicht nach MAX_VERSUCHE.
    expect(tot?.attempt_count).toBeLessThan(MAX_VERSUCHE)
  })

  it('fasst den Vorgang danach nie wieder an', async () => {
    await offeneZeile({ versuche: 1 })
    const senden = registriereTestVorgang(async () => ({ ok: false, fehler: { statusCode: 400 } }))

    await lauf()
    expect(senden).toHaveBeenCalledTimes(1)

    for (let i = 0; i < 3; i++) {
      await altere(6 * 60)
      const weiter = await lauf()
      expect(weiter.metriken.deadLetter).toBe(0)
    }
    expect(senden).toHaveBeenCalledTimes(1)
  })

  it('unterscheidet 400 von 503 — derselbe Vorgang, zwei Ausgaenge', async () => {
    const dauerhaft = await offeneZeile({ versuche: 1 })
    const voruebergehend = await offeneZeile({ versuche: 1 })
    registriereTestVorgang(async kontext => ({
      ok: false,
      fehler: { statusCode: kontext.correlationId === dauerhaft ? 400 : 503 },
    }))

    const e = await lauf()

    expect(e.metriken.deadLetter).toBe(1)
    expect((await zeilen(dauerhaft)).some(z => z.grund === 'dauerhaft_fehlgeschlagen')).toBe(true)
    expect((await zeilen(voruebergehend)).every(z => z.grund === null)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3) Obergrenze
// ═══════════════════════════════════════════════════════════════════════

describe('Szenario 3: Obergrenze der Versuche', () => {
  it('schliesst den Vorgang mit dem Versuch ab, der die Grenze reisst', async () => {
    // Vier Fehlversuche stehen schon; dieser Lauf macht den fuenften.
    const vorgang = await mehrereFehlversuche(MAX_VERSUCHE - 1)
    const senden = registriereTestVorgang(async () => ({ ok: false, fehler: { statusCode: 503 } }))

    const e = await lauf()

    expect(senden).toHaveBeenCalledTimes(1)
    expect(e.metriken.deadLetter).toBe(1)
    const tot = (await zeilen(vorgang)).find(z => z.grund === 'max_versuche_erreicht')
    expect(tot?.status).toBe('skipped')
    expect(tot?.attempt_count).toBe(MAX_VERSUCHE)
  })

  it('sendet nach dem Dead Letter nicht noch einmal', async () => {
    await mehrereFehlversuche(MAX_VERSUCHE - 1)
    const senden = registriereTestVorgang(async () => ({ ok: false, fehler: { statusCode: 503 } }))

    await lauf()
    await altere(24 * 60)
    const zweiter = await lauf()

    expect(senden).toHaveBeenCalledTimes(1)
    expect(zweiter.metriken.deadLetter).toBe(0)
    expect(zweiter.metriken.verarbeitet).toBe(0)
  })

  it('haelt den Grund auf der geschlossenen Liste der Migration', async () => {
    await expect(
      db.query(
        `INSERT INTO public.notification_delivery_log
           (organization_id, channel, recipient, status, grund)
         VALUES ($1,'email','x@example.org','skipped','zu_oft_versucht')`,
        [ORG] as never[],
      ),
    ).rejects.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4) Absturz und Uebernahme
// ═══════════════════════════════════════════════════════════════════════

describe('Szenario 4: Absturz und Uebernahme', () => {
  it('haelt die Sperre, solange der Herzschlag frisch ist', async () => {
    await db.query(
      `INSERT INTO public.zustellung_retry_laeufe (heartbeat_am) VALUES (now() - interval '2 minutes')`,
    )
    await expect(
      db.query(`SELECT public.zustellung_retry_beanspruchen(10)`),
    ).rejects.toThrow(/ZUSTELLUNG_RETRY_LAEUFT/)
  })

  it('uebernimmt nach Ablauf der Frist, setzt die Zaehler zurueck und erhoeht den Versuch', async () => {
    const eingesetzt = await db.query<{ id: string }>(
      `INSERT INTO public.zustellung_retry_laeufe
         (heartbeat_am, gestartet_am, verarbeitet, erfolgreich, fehlgeschlagen, dead_letter, uebersprungen, abbruchgrund)
       VALUES (now() - interval '30 minutes', now() - interval '30 minutes', 7, 5, 2, 1, 3, 'abgestuerzt')
       RETURNING id`,
    )
    const alteId = eingesetzt.rows[0].id

    const r = await db.query<{ ergebnis: { lauf_id: string; uebernommen: boolean } }>(
      `SELECT public.zustellung_retry_beanspruchen(10) AS ergebnis`,
    )
    expect(r.rows[0].ergebnis.uebernommen).toBe(true)
    // Dieselbe Zeile — kein zweiter Lauf.
    expect(r.rows[0].ergebnis.lauf_id).toBe(alteId)

    const nachher = (await laufZeile())[0]
    expect(nachher.versuch).toBe(2)
    expect(nachher.verarbeitet).toBe(0)
    expect(nachher.erfolgreich).toBe(0)
    expect(nachher.fehlgeschlagen).toBe(0)
    expect(nachher.dead_letter).toBe(0)
    expect(nachher.uebersprungen).toBe(0)
  })

  it('richtet sich nach p_stale_minuten, nicht nach einer festen Frist', async () => {
    await db.query(
      `INSERT INTO public.zustellung_retry_laeufe (heartbeat_am, gestartet_am)
       VALUES (now() - interval '3 minutes', now() - interval '3 minutes')`,
    )
    // 5 Minuten Frist: der Lauf gilt noch als lebend.
    await expect(db.query(`SELECT public.zustellung_retry_beanspruchen(5)`)).rejects.toThrow(
      /ZUSTELLUNG_RETRY_LAEUFT/,
    )
    // 2 Minuten Frist: verwaist.
    const r = await db.query<{ ergebnis: { uebernommen: boolean } }>(
      `SELECT public.zustellung_retry_beanspruchen(2) AS ergebnis`,
    )
    expect(r.rows[0].ergebnis.uebernommen).toBe(true)
  })

  it('weist eine unsinnige Frist ab, statt sie zu raten', async () => {
    await expect(db.query(`SELECT public.zustellung_retry_beanspruchen(0)`)).rejects.toThrow(
      /ZUSTELLUNG_RETRY_PARAMETER/,
    )
    await expect(db.query(`SELECT public.zustellung_retry_beanspruchen(NULL)`)).rejects.toThrow(
      /ZUSTELLUNG_RETRY_PARAMETER/,
    )
  })

  it('reicht staleMinuten aus dem Worker bis in die Sperre durch', async () => {
    await offeneZeile()
    const senden = registriereTestVorgang(async () => ({ ok: true }))
    await db.query(
      `INSERT INTO public.zustellung_retry_laeufe (heartbeat_am, gestartet_am)
       VALUES (now() - interval '3 minutes', now() - interval '3 minutes')`,
    )

    const blockiert = await lauf({ staleMinuten: 60 })
    expect(blockiert.status).toBe('blockiert')
    expect(senden).not.toHaveBeenCalled()

    const uebernommen = await lauf({ staleMinuten: 2 })
    expect(uebernommen.uebernommen).toBe(true)
    expect(uebernommen.status).toBe('fertig')
    expect(senden).toHaveBeenCalledTimes(1)
  })

  it('gibt der Herzschlag einer fremden ID keine Sperre', async () => {
    const r = await db.query<{ ok: boolean }>(
      `SELECT public.zustellung_retry_heartbeat('00000000-0000-4000-8000-00000000ffff') AS ok`,
    )
    expect(r.rows[0].ok).toBe(false)
  })

  it('arbeitet nach der Uebernahme die liegengebliebenen Vorgaenge ab', async () => {
    for (let i = 0; i < 3; i++) await offeneZeile()
    const senden = registriereTestVorgang(async () => ({ ok: true }))
    await db.query(
      `INSERT INTO public.zustellung_retry_laeufe (heartbeat_am, gestartet_am)
       VALUES (now() - interval '30 minutes', now() - interval '30 minutes')`,
    )

    const e = await lauf()

    expect(e.uebernommen).toBe(true)
    expect(e.metriken.erfolgreich).toBe(3)
    expect(senden).toHaveBeenCalledTimes(3)
    const laeufe = await laufZeile()
    expect(laeufe).toHaveLength(1)
    expect(laeufe[0].status).toBe('fertig')
    expect(laeufe[0].versuch).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5) Doppelte Verarbeitung
// ═══════════════════════════════════════════════════════════════════════

describe('Szenario 5: zwei Laeufe gleichzeitig', () => {
  it('laesst der UNIQUE-Index nur EINE aktive Beanspruchung zu', async () => {
    await db.query(`SELECT public.zustellung_retry_beanspruchen(10)`)
    await expect(db.query(`SELECT public.zustellung_retry_beanspruchen(10)`)).rejects.toThrow(
      /ZUSTELLUNG_RETRY_LAEUFT/,
    )
    const alle = await laufZeile()
    expect(alle).toHaveLength(1)
  })

  it('startet zwei Laeufe gleichzeitig — genau einer verschickt', async () => {
    await offeneZeile()
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    const [a, b] = await Promise.all([lauf(), lauf()])

    const ausgaenge = [a.status, b.status].sort()
    expect(ausgaenge).toEqual(['blockiert', 'fertig'])
    expect(senden).toHaveBeenCalledTimes(1)
    // Der blockierte Lauf ist KEIN Fehler — er hat nur nichts zu tun.
    expect(a.ok && b.ok).toBe(true)

    const gesendet = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.notification_delivery_log WHERE status = 'sent'`,
    )
    expect(gesendet.rows[0].n).toBe(1)
  })

  it('legt der blockierte Lauf keinen zweiten Kopfsatz an', async () => {
    await offeneZeile()
    registriereTestVorgang(async () => ({ ok: true }))

    await Promise.all([lauf(), lauf(), lauf()])

    expect(await laufZeile()).toHaveLength(1)
  })

  it('gibt die Sperre nach dem Lauf wieder frei', async () => {
    await offeneZeile()
    registriereTestVorgang(async () => ({ ok: true }))

    await lauf()
    const offen = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.zustellung_retry_laeufe WHERE status = 'laeuft'`,
    )
    expect(offen.rows[0].n).toBe(0)

    // Und der naechste Lauf kommt wieder dran.
    const zweiter = await lauf()
    expect(zweiter.status).toBe('fertig')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6) Idempotenz
// ═══════════════════════════════════════════════════════════════════════

describe('Szenario 6: dieselbe correlation_id zweimal', () => {
  it('verschickt beim zweiten Lauf nichts mehr', async () => {
    const vorgang = await offeneZeile()
    const senden = registriereTestVorgang(async () => ({ ok: true, providerMessageId: 'm1' }))

    await lauf()
    await altere(6 * 60)
    const zweiter = await lauf()

    expect(senden).toHaveBeenCalledTimes(1)
    expect(zweiter.metriken.verarbeitet).toBe(0)
    expect((await zeilen(vorgang)).filter(z => z.status === 'sent')).toHaveLength(1)
  })

  it('laesst die Datenbank keine zweite Erfolgszeile zu', async () => {
    const vorgang = await offeneZeile()
    registriereTestVorgang(async () => ({ ok: true }))
    await lauf()

    await expect(
      db.query(
        `INSERT INTO public.notification_delivery_log
           (organization_id, channel, recipient, status, attempt_count, correlation_id)
         VALUES ($1,'email','kunde@example.org','sent',9,$2)`,
        [ORG, vorgang] as never[],
      ),
    ).rejects.toThrow()
  })

  it('sperrt je Kanal getrennt — E-Mail zugestellt heisst nicht Push zugestellt', async () => {
    const vorgang = neuerVorgang()
    await offeneZeile({ correlationId: vorgang })
    await db.query(
      `INSERT INTO public.notification_delivery_log
         (organization_id, channel, recipient, status, attempt_count, correlation_id,
          vorgang_art, vorgang_ref, vorgang_empfaenger, created_at, attempted_at)
       VALUES ($1,'push',$2,'failed',1,$3,'test-vorgang',$4,$5,
               now() - interval '6 hours', now() - interval '6 hours')`,
      [ORG, NUTZER, vorgang, BUCHUNG, NUTZER] as never[],
    )
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    await lauf()

    // Beide Kanaele werden einzeln zugestellt.
    expect(senden).toHaveBeenCalledTimes(2)
    const kanaele = await db.query<{ channel: string }>(
      `SELECT channel FROM public.notification_delivery_log
        WHERE correlation_id = $1 AND status = 'sent' ORDER BY channel`,
      [vorgang] as never[],
    )
    expect(kanaele.rows.map(r => r.channel)).toEqual(['email', 'push'])
  })

  it('verdichtet vier Fehlversuchszeilen desselben Vorgangs zu EINEM Versand', async () => {
    const vorgang = neuerVorgang()
    for (const versuch of [1, 2, 3]) {
      await db.query(
        `INSERT INTO public.notification_delivery_log
           (organization_id, channel, recipient, status, attempt_count, correlation_id,
            vorgang_art, vorgang_ref, vorgang_empfaenger, created_at, attempted_at)
         VALUES ($1,'email','kunde@example.org','failed',$2,$3,'test-vorgang',$4,$5,
                 now() - interval '6 hours', now() - interval '6 hours')`,
        [ORG, versuch, vorgang, BUCHUNG, NUTZER] as never[],
      )
    }
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    const e = await lauf()

    expect(senden).toHaveBeenCalledTimes(1)
    expect(e.metriken.erfolgreich).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Herzschlag waehrend des Laufs
// ═══════════════════════════════════════════════════════════════════════
//
// Der Herzschlag haengt am DURCHGESEHENEN Vorgang, nicht am versendeten.
// Vorher zaehlte die Bedingung `(verarbeitet + deadLetter) % 20 === 0`:
// solange nichts versendet wurde, stand die Summe auf 0 — und 0 % 20 ist
// 0. Ein Lauf ueber lauter wartende Zeilen schlug damit bei JEDER Zeile
// Herz (200 zusaetzliche Rundreisen im 45-Sekunden-Budget), ein Lauf mit
// genau 20 Versendungen danach ebenfalls bei jeder weiteren.

describe('Herzschlag', () => {
  /** Zaehlt die Herzschlag-Aufrufe, ohne den Lauf zu veraendern. */
  function mitZaehler() {
    const echt = H.client as unknown as { rpc: (n: string, p?: unknown) => Promise<unknown> }
    const zaehlung = { herzschlaege: 0 }
    const client = new Proxy(echt, {
      get(ziel, feld, empfaenger) {
        if (feld === 'rpc') {
          return async (name: string, params?: unknown) => {
            if (name === 'zustellung_retry_heartbeat') zaehlung.herzschlaege++
            return echt.rpc(name, params)
          }
        }
        return Reflect.get(ziel, feld, empfaenger)
      },
    })
    return { client: client as unknown as SupabaseClient, zaehlung }
  }

  it('schlaegt auch dann Herz, wenn kein einziger Vorgang versendet wird', async () => {
    // 25 Zeilen, alle noch in der Wartezeit.
    for (let i = 0; i < 25; i++) await offeneZeile({ versuche: 4, alterMinuten: 1 })
    registriereTestVorgang(async () => ({ ok: true }))
    const { client, zaehlung } = mitZaehler()

    const e = await lauf({ admin: client })

    expect(e.metriken.wartend).toBe(25)
    expect(e.metriken.verarbeitet).toBe(0)
    expect(zaehlung.herzschlaege).toBe(1)
  })

  it('schlaegt nicht bei jedem einzelnen Vorgang', async () => {
    for (let i = 0; i < 19; i++) await offeneZeile({ versuche: 4, alterMinuten: 1 })
    registriereTestVorgang(async () => ({ ok: true }))
    const { client, zaehlung } = mitZaehler()

    await lauf({ admin: client })

    expect(zaehlung.herzschlaege).toBe(0)
  })

  it('erneuert den Zeitstempel des laufenden Laufs in der Datenbank', async () => {
    for (let i = 0; i < 21; i++) await offeneZeile()
    registriereTestVorgang(async () => ({ ok: true }))

    await lauf()

    const r = await db.query<{ frisch: boolean }>(
      `SELECT heartbeat_am > gestartet_am AS frisch FROM public.zustellung_retry_laeufe`,
    )
    expect(r.rows[0].frisch).toBe(true)
  })
})
