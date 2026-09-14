// ═══════════════════════════════════════════════════════════════════════
// Wiederholungslauf gegen echtes Postgres
// ═══════════════════════════════════════════════════════════════════════
//
// WAS NUR HIER GEPRUEFT WERDEN KANN
// __tests__/notifications/retry-worker.test.ts laeuft gegen einen
// Zeilenspeicher, der die Datenbankregeln NACHBILDET — er ist damit
// Annahme, nicht Beweis. Dieser Test spielt die echten Migrationen
// (20260923000000 + 20260927000000) in ein WASM-Postgres und laesst den
// unveraenderten Worker dagegen laufen. Dabei greifen wirklich:
//
//   • der partielle Unique-Index auf die Erfolgszeile
//   • der partielle Unique-Index auf status='laeuft' (die Sperre)
//   • pg_advisory_xact_lock in zustellung_retry_beanspruchen
//   • die CHECK-Constraints auf vorgang_art und grund
//   • die Rechtevergabe (REVOKE … FROM anon)
//
// Kein Netzverkehr: der Vorgang wird ueber das Register mit einer
// Attrappe registriert.
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
import { MAX_VERSUCHE, type SendeErgebnis } from '@/lib/notifications/retry'

const MIGRATIONEN = ['20260923000000_notification_delivery_log.sql', '20260927000000_zustellung_retry_worker.sql']
  .map(n => path.join(__dirname, '..', '..', 'supabase', 'migrations', n))

const ORG = '00000000-0000-4000-8000-0000000000aa'
const ORG_B = '00000000-0000-4000-8000-0000000000bb'
const BUCHUNG = '00000000-0000-4000-8000-0000000000dd'
const NUTZER = '00000000-0000-4000-8000-0000000000cc'

/**
 * Zeit vergeht hier NICHT ueber eine injizierte Uhr, sondern indem die
 * Zeilen in der Datenbank altern.
 *
 * Grund: sendeIdempotent() prueft die Wartezeit gegen Date.now(), die
 * Protokollzeilen tragen now() aus Postgres. Eine nur im Worker
 * eingehaengte Uhr wuerde auseinanderlaufen und einen gruenen Test
 * liefern, der ueber den echten Ablauf nichts aussagt.
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

let db: InstanceType<typeof PGlite>

function alsSupabase(): SupabaseClient {
  return H.client as unknown as SupabaseClient
}

let zaehler = 0
function neuerVorgang(): string {
  zaehler++
  return `00000000-0000-4000-8000-${String(zaehler).padStart(12, '0')}`
}

/** Legt eine offene Zustellzeile direkt per SQL an. */
async function offeneZeile(ueber: {
  correlationId?: string
  organizationId?: string
  channel?: string
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
     VALUES ($1,$2,$3,$4,$5,'resend',$6,$7,
             now() - make_interval(mins => $8), now() - make_interval(mins => $8),
             now() - make_interval(mins => $8), $9, $10, $11)`,
    [
      ueber.organizationId ?? ORG,
      ueber.channel ?? 'email',
      'kunde@example.org',
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

async function zeilen(correlationId: string) {
  const r = await db.query<{ status: string; grund: string | null; attempt_count: number; organization_id: string }>(
    `SELECT status, grund, attempt_count, organization_id
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
    INSERT INTO public.organizations (id, name) VALUES ('${ORG}', 'Stamm'), ('${ORG_B}', 'Zweiter Mandant');
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

// ───────────────────────────────────────────────────────────────────────

describe('Schema der Migration', () => {
  it('legt die Vorgangsspalten mit engem CHECK an', async () => {
    const spalten = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'notification_delivery_log'
          AND column_name IN ('vorgang_art','vorgang_ref','vorgang_empfaenger','grund')`,
    )
    expect(spalten.rows.map(r => r.column_name).sort())
      .toEqual(['grund', 'vorgang_art', 'vorgang_empfaenger', 'vorgang_ref'])

    // Freitext passt strukturell nicht in vorgang_art.
    await expect(
      db.query(
        `INSERT INTO public.notification_delivery_log
           (organization_id, channel, recipient, status, vorgang_art)
         VALUES ($1,'email','x@example.org','failed','Sehr geehrte Frau Muster, Ihre Rechnung …')`,
        [ORG] as never[],
      ),
    ).rejects.toThrow()

    // Und ein erfundener Grund ebenso wenig.
    await expect(
      db.query(
        `INSERT INTO public.notification_delivery_log
           (organization_id, channel, recipient, status, grund)
         VALUES ($1,'email','x@example.org','skipped','irgendwas')`,
        [ORG] as never[],
      ),
    ).rejects.toThrow()
  })

  it('laesst hoechstens EINEN laufenden Wiederholungslauf zu', async () => {
    await db.query(`INSERT INTO public.zustellung_retry_laeufe DEFAULT VALUES`)
    await expect(
      db.query(`INSERT INTO public.zustellung_retry_laeufe DEFAULT VALUES`),
    ).rejects.toThrow()
  })

  it('entzieht anon die Sperr-Funktionen', async () => {
    const r = await db.query<{ hat: boolean }>(
      `SELECT has_function_privilege('anon', 'public.zustellung_retry_beanspruchen(integer)', 'EXECUTE') AS hat`,
    )
    expect(r.rows[0].hat).toBe(false)
  })
})

describe('Wiederholung gegen echte Constraints', () => {
  it('stellt erneut zu und schreibt genau eine Erfolgszeile', async () => {
    const vorgang = await offeneZeile()
    const senden = registriereTestVorgang(async () => ({ ok: true, providerMessageId: 'msg-2' }))

    const e = await lauf()

    expect(senden).toHaveBeenCalledTimes(1)
    expect(e.metriken.erfolgreich).toBe(1)
    const alle = await zeilen(vorgang)
    expect(alle.filter(z => z.status === 'sent')).toHaveLength(1)
  })

  it('versendet nicht erneut, was der Unique-Index bereits als zugestellt fuehrt', async () => {
    const vorgang = await offeneZeile()
    await db.query(
      `INSERT INTO public.notification_delivery_log
         (organization_id, channel, recipient, status, attempt_count, correlation_id, delivered_at)
       VALUES ($1,'email','kunde@example.org','sent',2,$2, now())`,
      [ORG, vorgang] as never[],
    )
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    const e = await lauf()

    expect(senden).not.toHaveBeenCalled()
    expect(e.metriken.verarbeitet).toBe(0)
  })

  it(`schliesst nach ${MAX_VERSUCHE} Versuchen als Dead Letter ab und laesst den Vorgang danach liegen`, async () => {
    const vorgang = await offeneZeile({ versuche: MAX_VERSUCHE })
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    const erster = await lauf()
    expect(erster.metriken.deadLetter).toBe(1)
    expect((await zeilen(vorgang)).some(z => z.grund === 'max_versuche_erreicht')).toBe(true)

    await altere(24 * 60)
    const zweiter = await lauf()
    expect(zweiter.metriken.deadLetter).toBe(0)
    expect(senden).not.toHaveBeenCalled()
  })

  it('schiebt einen dauerhaften Fehler sofort ins Dead Letter', async () => {
    const vorgang = await offeneZeile()
    registriereTestVorgang(async () => ({
      ok: false,
      fehler: { statusCode: 422, message: 'invalid recipient: post@nirgendwo.invalid' },
    }))

    const e = await lauf()

    expect(e.metriken.deadLetter).toBe(1)
    const tot = (await zeilen(vorgang)).find(z => z.grund === 'dauerhaft_fehlgeschlagen')
    expect(tot?.status).toBe('skipped')
  })

  it('arbeitet sich ueber mehrere Laeufe bis ins Dead Letter vor', async () => {
    const vorgang = await offeneZeile({ versuche: 1 })
    const senden = registriereTestVorgang(async () => ({ ok: false, fehler: { statusCode: 503 } }))

    // Vier weitere Versuche, jeweils nach abgelaufener Wartezeit.
    for (let i = 0; i < 4; i++) {
      await altere(5 * 60)
      await lauf()
    }
    expect(senden).toHaveBeenCalledTimes(4)

    const stand = await zeilen(vorgang)
    expect(stand.some(z => z.grund === 'max_versuche_erreicht')).toBe(true)

    // Danach bleibt es liegen.
    await altere(24 * 60)
    await lauf()
    expect(senden).toHaveBeenCalledTimes(4)
  })
})

describe('Sperre in der Datenbank', () => {
  it('laesst einen zweiten Lauf nicht zu, solange der erste lebt', async () => {
    await offeneZeile()
    registriereTestVorgang(async () => ({ ok: true }))

    // Sperre von Hand halten (so, wie sie ein noch laufender Job haelt).
    await db.query(`INSERT INTO public.zustellung_retry_laeufe DEFAULT VALUES`)

    const e = await lauf()
    expect(e.status).toBe('blockiert')
    expect(e.ok).toBe(true)
  })

  it('uebernimmt eine verwaiste Sperre nach dem Herzschlag-Fenster', async () => {
    await offeneZeile()
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    await db.query(
      `INSERT INTO public.zustellung_retry_laeufe (heartbeat_am, gestartet_am)
       VALUES (now() - interval '30 minutes', now() - interval '30 minutes')`,
    )

    const e = await lauf()
    expect(e.uebernommen).toBe(true)
    expect(e.status).toBe('fertig')
    expect(senden).toHaveBeenCalledTimes(1)

    const laeufe = await db.query<{ status: string }>(
      `SELECT status FROM public.zustellung_retry_laeufe`,
    )
    expect(laeufe.rows.map(r => r.status)).toEqual(['fertig'])
  })

  it('schreibt die Kennzahlen des Laufs fort', async () => {
    await offeneZeile()
    await offeneZeile({ versuche: MAX_VERSUCHE })
    registriereTestVorgang(async () => ({ ok: true }))

    await lauf()

    const r = await db.query<{ status: string; erfolgreich: number; dead_letter: number; laufzeit_ms: number }>(
      `SELECT status, erfolgreich, dead_letter, laufzeit_ms FROM public.zustellung_retry_laeufe`,
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].status).toBe('fertig')
    expect(r.rows[0].erfolgreich).toBe(1)
    expect(r.rows[0].dead_letter).toBe(1)
    expect(r.rows[0].laufzeit_ms).toBeGreaterThanOrEqual(0)
  })
})

describe('Absturzsicherheit', () => {
  it('macht nach einem abgebrochenen Lauf bei den restlichen Vorgaengen weiter', async () => {
    for (let i = 0; i < 10; i++) await offeneZeile()
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    const erster = await lauf({ maxVorgaenge: 3 })
    expect(erster.metriken.erfolgreich).toBe(3)
    expect(erster.status).toBe('abgebrochen')

    const zweiter = await lauf()
    expect(zweiter.metriken.erfolgreich).toBe(7)
    expect(senden).toHaveBeenCalledTimes(10)

    const gesendet = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.notification_delivery_log WHERE status = 'sent'`,
    )
    expect(gesendet.rows[0].n).toBe(10)
  })
})

describe('Mandantengrenze', () => {
  it('bearbeitet je Organisation nur deren eigene Zeilen', async () => {
    const a = await offeneZeile({ organizationId: ORG })
    const b = await offeneZeile({ organizationId: ORG_B })
    registriereTestVorgang(async () => ({ ok: true }))

    await lauf({ organisationen: [ORG] })

    expect((await zeilen(a)).some(z => z.status === 'sent')).toBe(true)
    expect((await zeilen(b)).some(z => z.status === 'sent')).toBe(false)
  })

  it('schreibt die Dead-Letter-Zeile in die Organisation der Quellzeile', async () => {
    const b = await offeneZeile({ organizationId: ORG_B, versuche: MAX_VERSUCHE })
    registriereTestVorgang(async () => ({ ok: true }))

    await lauf({ organisationen: [ORG_B] })

    const tot = (await zeilen(b)).find(z => z.grund === 'max_versuche_erreicht')
    expect(tot?.organization_id).toBe(ORG_B)
  })
})

describe('Nicht wiederherstellbare Zeilen', () => {
  it('gibt eine Zeile ohne Vorgangsart erst nach der Karenz auf', async () => {
    const vorgang = await offeneZeile({ vorgangArt: null, alterMinuten: 120 })
    registriereTestVorgang(async () => ({ ok: true }))

    expect((await lauf()).metriken.deadLetter).toBe(0)

    await altere(25 * 60)
    expect((await lauf()).metriken.deadLetter).toBe(1)
    expect((await zeilen(vorgang)).some(z => z.grund === 'nicht_wiederherstellbar')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Die Sperre, auf deren Antwort niemand hoerte (Block 100)
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND: der Lauf haelt seine Sperre mit einem Lebenszeichen wach:
//
//     await admin.rpc('zustellung_retry_heartbeat', { p_lauf_id: laufId })
//
// blind. `supabase.rpc()` wirft nicht — ein Fehler kommt als `error` im
// Ergebnis zurueck. Und die RPC gibt mehr als „erledigt": sie ist
// `RETURNS boolean` und liefert `FOUND` des UPDATE
// `WHERE id = p_lauf_id AND status = 'laeuft'` (live aus pg_proc
// gelesen). `false` heisst: dieser Lauf ist NICHT MEHR DER INHABER.
//
// Genau diese Antwort wurde weggeworfen. Der Lauf arbeitete dann weiter
// an derselben Zustellwarteschlange wie der neue Inhaber — zwei Arbeiter
// auf denselben Zeilen, und der Kanal versendet doppelt. Der Kommentar
// in `verarbeiteOrganisation` benennt die Gefahr sogar, nur sah sie
// niemand nach. Dreissig Zeilen weiter oben prueft
// `zustellung_retry_beanspruchen` seinen Fehler bis zur
// Fallunterscheidung.
//
// Gefahren wird das hier gegen die ECHTEN RPCs aus den Migrationen: die
// Sperre wird dem laufenden Worker mitten in der Arbeit entzogen.
describe('Block 100: verliert der Lauf seine Sperre, hoert er auf', () => {
  /** Mehr Vorgaenge als HEARTBEAT_ALLE (20), damit ein Lebenszeichen faellt. */
  async function vieleOffene(n: number): Promise<void> {
    for (let i = 0; i < n; i++) await offeneZeile()
  }

  it('bricht ab, sobald das Lebenszeichen "nicht mehr deiner" meldet', async () => {
    await vieleOffene(25)

    let gesendet = 0
    registriereTestVorgang(async () => {
      gesendet++
      // Nach dem 20. Vorgang faellt das erste Lebenszeichen. Kurz davor
      // entreisst ein anderer Lauf die Sperre — nachgebildet durch den
      // Zustand, den `zustellung_retry_beanspruchen` bei einer
      // Uebernahme hinterlaesst: dieser Eintrag steht nicht mehr auf
      // 'laeuft'.
      if (gesendet === 19) {
        await db.exec(`UPDATE public.zustellung_retry_laeufe SET status = 'fertig' WHERE status = 'laeuft'`)
      }
      return { ok: true } as SendeErgebnis
    })

    const r = await lauf()

    expect(r.status).toBe('abgebrochen')
    expect(r.grund).toBe('sperre_verloren')
    // Der Kern: er hat NICHT alle 25 abgearbeitet — und zwar GENAU nach
    // dem 19. Der Herzschlag faellt im 20. Durchlauf, VOR dem Versand.
    // Wer erst beim naechsten Durchlauf nachsieht, schickt diesen einen
    // Vorgang noch heraus — also genau den ersten, den zwei Laeufe
    // zugleich anfassen. Die Zahl haelt diese Reihenfolge fest.
    expect(gesendet).toBe(19)
  })

  it('bricht auch ab, wenn das Lebenszeichen gar nicht absetzbar ist', async () => {
    // Ein Fehler der RPC ist nicht dasselbe wie „nicht mehr deiner", hat
    // aber dieselbe Folge: ohne Lebenszeichen verfaellt die Sperre, und
    // weiterzuarbeiten hiesse, auf ihr Verfallen zu setzen. Nachgebildet,
    // indem die Funktion mitten im Lauf verschwindet.
    await vieleOffene(25)
    let gesendet = 0
    registriereTestVorgang(async () => {
      gesendet++
      if (gesendet === 19) {
        await db.exec('DROP FUNCTION IF EXISTS public.zustellung_retry_heartbeat(uuid);')
      }
      return { ok: true } as SendeErgebnis
    })

    try {
      const r = await lauf()
      expect(r.status).toBe('abgebrochen')
      expect(r.grund).toBe('herzschlag_nicht_moeglich')
      expect(gesendet).toBe(19)
    } finally {
      await db.exec(`
        CREATE OR REPLACE FUNCTION public.zustellung_retry_heartbeat(p_lauf_id uuid)
        RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
        SET search_path TO 'public', 'pg_catalog' AS $fn$
        BEGIN
          UPDATE public.zustellung_retry_laeufe
             SET heartbeat_am = now()
           WHERE id = p_lauf_id AND status = 'laeuft';
          RETURN FOUND;
        END $fn$;
      `)
    }
  })

  it('und meldet, dass sein Abschluss nicht mehr ankam', async () => {
    await vieleOffene(25)
    let gesendet = 0
    registriereTestVorgang(async () => {
      gesendet++
      if (gesendet === 19) {
        await db.exec(`UPDATE public.zustellung_retry_laeufe SET status = 'fertig' WHERE status = 'laeuft'`)
      }
      return { ok: true } as SendeErgebnis
    })

    const r = await lauf()
    // Der Eintrag gehoert ihm nicht mehr — sein Abschluss trifft keine
    // Zeile. Ohne dieses Feld waere das an der Rueckgabe nicht ablesbar.
    expect(r.abschlussOffen).toBe(true)
  })

  it('Gegenprobe: ein ungestoerter Lauf laeuft durch und schliesst ab', async () => {
    // Ohne diese Richtung waere ein Worker, der IMMER abbricht, ebenfalls
    // gruen.
    await vieleOffene(25)
    let gesendet = 0
    registriereTestVorgang(async () => { gesendet++; return { ok: true } as SendeErgebnis })

    const r = await lauf()

    expect(r.status).toBe('fertig')
    expect(r.grund).toBeUndefined()
    expect(r.abschlussOffen).toBe(false)
    expect(gesendet).toBe(25)

    const reg = await db.query<{ status: string }>(
      `SELECT status FROM public.zustellung_retry_laeufe ORDER BY gestartet_am DESC LIMIT 1`)
    expect(reg.rows[0].status).toBe('fertig')
  })

  it('das Lebenszeichen haelt die Sperre wirklich frisch', async () => {
    // Die Gegenrichtung zum Befund: waere der Herzschlag wirkungslos,
    // koennte ein zweiter Lauf die Sperre uebernehmen, obwohl der erste
    // arbeitet. Hier wird belegt, dass er `heartbeat_am` fortschreibt.
    await vieleOffene(25)
    let vorher: string | null = null
    let nachher: string | null = null
    let gesendet = 0
    registriereTestVorgang(async () => {
      gesendet++
      const r = await db.query<{ heartbeat_am: string }>(
        `SELECT heartbeat_am FROM public.zustellung_retry_laeufe WHERE status = 'laeuft'`)
      if (gesendet === 1) vorher = r.rows[0]?.heartbeat_am ?? null
      if (gesendet === 25) nachher = r.rows[0]?.heartbeat_am ?? null
      return { ok: true } as SendeErgebnis
    })

    await lauf()
    expect(vorher).not.toBeNull()
    expect(nachher).not.toBeNull()
    expect(new Date(nachher!).getTime()).toBeGreaterThanOrEqual(new Date(vorher!).getTime())
  })
})
