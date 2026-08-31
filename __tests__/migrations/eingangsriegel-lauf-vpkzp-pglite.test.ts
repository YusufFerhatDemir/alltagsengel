/**
 * PGlite: Eingangsriegel für Abrechnungslauf und VP/KZP-Verbrauch
 * (Migration 20261023000004_eingangsriegel_lauf_und_vpkzp.sql)
 *
 * ── HERKUNFT ──────────────────────────────────────────────────────────────
 * Dieselbe Frage wie bei U11 und R1: feuert der Riegel auch beim EINFÜGEN?
 * Ein Sweep über alle Trigger des Schemas fand fünf echte Fachriegel mit
 * `BEFORE UPDATE` ohne INSERT. Live geprobt (in einer Transaktion, die
 * zurückrollt) gingen zwei davon durch:
 *
 *   abrechnungslaeufe   status='uebermittelt'    DURCHGELASSEN
 *   client_vpkzp_usage  Verbrauch vorbelegt      DURCHGELASSEN
 *
 * ── WAS DIESE SUITE NICHT IST ─────────────────────────────────────────────
 * Kein Beweis, dass die Migration live steht — sie steht am 31.08.2026
 * ausdrücklich nicht. Den Live-Nachweis führt `npm run verify:trigger-eingang`
 * (Prüfungen A3/A4 und B2/B3).
 *
 * ── ABWEICHUNG VOM PRODUKTIONSSCHEMA ──────────────────────────────────────
 * Beide Tabellen sind nur mit den Spalten nachgebaut, die hier eine Rolle
 * spielen — plus dem echten Jahres-CHECK auf `client_vpkzp_usage`. Der
 * gehört dazu: beim ersten Entwurf des Live-Laufs stand dort ein Jahr vor
 * 2024, der INSERT scheiterte am CHECK, und die Prüfung meldete
 * fälschlich „Riegel greift". Gefangen hat das erst die Gegenprobe.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { funktionAusMigration, liesMigration } from '../helpers/sql-extract'

const MIGRATION = '20261023000004_eingangsriegel_lauf_und_vpkzp.sql'
const ROLLBACK = '20261023000005_rollback_eingangsriegel_lauf_und_vpkzp.sql'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const KLIENT = '00000000-0000-4000-8000-0000000000ba'

let db: InstanceType<typeof PGlite>
let lfd = 0

const TRIGGER = `
  DROP TRIGGER IF EXISTS trg_a_lauf_eingangsstatus ON public.abrechnungslaeufe;
  CREATE TRIGGER trg_a_lauf_eingangsstatus
    BEFORE INSERT ON public.abrechnungslaeufe
    FOR EACH ROW EXECUTE FUNCTION public.enforce_lauf_eingangsstatus();

  DROP TRIGGER IF EXISTS trg_vpkzp_usage_abgeleitet ON public.client_vpkzp_usage;
  CREATE TRIGGER trg_vpkzp_usage_abgeleitet
    BEFORE INSERT OR UPDATE ON public.client_vpkzp_usage
    FOR EACH ROW EXECUTE FUNCTION public.trg_vpkzp_usage_abgeleitet();
`

async function lauf(status?: string | null) {
  lfd += 1
  const spalten = ['organization_id', 'abrechnungsmonat', 'kostentraeger_ik']
  const werte: unknown[] = [ORG, `2026-0${(lfd % 9) + 1}`, '999999999']
  if (status !== undefined) { spalten.push('status'); werte.push(status) }
  const platzhalter = spalten.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await db.query<{ status: string }>(
    `INSERT INTO public.abrechnungslaeufe (${spalten.join(', ')}) VALUES (${platzhalter}) RETURNING status`,
    werte as never[],
  )
  return rows[0]
}

async function jahressatz(werte: Record<string, unknown> = {}) {
  lfd += 1
  const basis: Record<string, unknown> = {
    organization_id: ORG, client_id: KLIENT, calendar_year: 2024 + (lfd % 3), ...werte,
  }
  const spalten = Object.keys(basis)
  const platzhalter = spalten.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.client_vpkzp_usage (${spalten.join(', ')}) VALUES (${platzhalter}) RETURNING id`,
    Object.values(basis) as never[],
  )
  return rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE public.abrechnungslaeufe (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id   uuid,
      abrechnungsmonat  text NOT NULL,
      kostentraeger_ik  text NOT NULL,
      status            text DEFAULT 'erstellt',
      updated_at        timestamptz
    );

    CREATE TABLE public.client_vpkzp_usage (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  uuid NOT NULL,
      client_id        uuid NOT NULL,
      calendar_year    integer NOT NULL CHECK (calendar_year >= 2024),
      vp_days_used     integer DEFAULT 0,
      kzp_days_used    integer DEFAULT 0,
      vp_amount_used   numeric(10,2) DEFAULT 0,
      kzp_amount_used  numeric(10,2) DEFAULT 0,
      updated_at       timestamptz
    );
  `)
})

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec('TRUNCATE public.abrechnungslaeufe, public.client_vpkzp_usage')
  await db.exec(funktionAusMigration(MIGRATION, 'enforce_lauf_eingangsstatus'))
  await db.exec(funktionAusMigration(MIGRATION, 'trg_vpkzp_usage_abgeleitet'))
  await db.exec(TRIGGER)
})

describe('Abrechnungslauf', () => {
  it('lässt sich nur als erstellt anlegen', async () => {
    expect((await lauf('erstellt')).status).toBe('erstellt')
    expect((await lauf()).status).toBe('erstellt')
  })

  it('weist jeden späteren Status beim Anlegen ab', async () => {
    // Die vollständige Statusliste der Maschine, nicht drei Beispiele.
    const spaeter = [
      'validierung_laeuft', 'validierung_fehlgeschlagen', 'geprueft', 'freigegeben',
      'export_laeuft', 'bereit_zum_export', 'exportiert', 'bereit_zur_uebermittlung',
      'uebermittlung_laeuft', 'uebermittelt', 'quittiert', 'angenommen',
      'teilweise_abgelehnt', 'abgelehnt', 'korrektur_erforderlich', 'korrigiert',
      'abgeschlossen', 'storniert',
    ]
    for (const status of spaeter) {
      await expect(lauf(status), `status=${status} wurde durchgelassen`)
        .rejects.toThrow(/LAUF_EINGANGSSTATUS/)
    }
  })

  it('weist einen ausdrücklich auf NULL gesetzten Status ab', async () => {
    await expect(lauf(null)).rejects.toThrow(/ohne Status ist nicht zulaessig/)
  })

  it('der Weg über UPDATE bleibt offen', async () => {
    // Der Riegel sitzt nur am Eingang — die Statusmaschine selbst bleibt
    // unangetastet und ist hier bewusst NICHT nachgebaut.
    await lauf('erstellt')
    await db.exec("UPDATE public.abrechnungslaeufe SET status = 'validierung_laeuft'")
    const { rows } = await db.query<{ status: string }>('SELECT status FROM public.abrechnungslaeufe')
    expect(rows[0].status).toBe('validierung_laeuft')
  })
})

describe('VP/KZP-Verbrauch', () => {
  it('ein neuer Jahressatz ohne Verbrauch entsteht', async () => {
    // Die Gegenprobe zuerst: ein Riegel, der JEDE Anlage blockiert, machte
    // die Fortschreibung selbst kaputt.
    await expect(jahressatz()).resolves.toBeDefined()
    await expect(jahressatz({ vp_days_used: 0, kzp_days_used: 0 })).resolves.toBeDefined()
  })

  it('vorbelegter Verbrauch wird beim Anlegen abgewiesen', async () => {
    // Beide Richtungen sind falsch: zu hoch lehnt Leistungen zu Unrecht ab,
    // zu niedrig zeigt Budget, das es nicht gibt. Geprüft wird jedes der
    // vier Felder einzeln — ein Riegel, der nur die Tage prüft, ließe die
    // Beträge offen.
    for (const feld of ['vp_days_used', 'kzp_days_used', 'vp_amount_used', 'kzp_amount_used']) {
      await expect(jahressatz({ [feld]: 5 }), `${feld} wurde durchgelassen`)
        .rejects.toThrow(/VPKZP_STAND_ABGELEITET/)
    }
  })

  it('der bestehende UPDATE-Riegel bleibt unverändert', async () => {
    await jahressatz()
    await expect(
      db.exec('UPDATE public.client_vpkzp_usage SET vp_days_used = 7'),
    ).rejects.toThrow(/VPKZP_STAND_ABGELEITET/)
  })

  it('ein UPDATE ohne Verbrauchsänderung geht weiterhin durch', async () => {
    // Ohne diese Prüfung wäre auch ein Riegel grün, der jedes UPDATE
    // blockiert — die Zeile wäre danach unveränderlich.
    await jahressatz()
    await expect(
      db.exec("UPDATE public.client_vpkzp_usage SET updated_at = '2026-08-31'"),
    ).resolves.toBeDefined()
  })
})

describe('Rollback', () => {
  it('stellt beide Riegel auf den Stand vom 31.08.2026 zurück', async () => {
    await db.exec(funktionAusMigration(ROLLBACK, 'trg_vpkzp_usage_abgeleitet'))
    await db.exec(`
      DROP TRIGGER IF EXISTS trg_a_lauf_eingangsstatus ON public.abrechnungslaeufe;
      DROP TRIGGER IF EXISTS trg_vpkzp_usage_abgeleitet ON public.client_vpkzp_usage;
      CREATE TRIGGER trg_vpkzp_usage_abgeleitet
        BEFORE UPDATE ON public.client_vpkzp_usage
        FOR EACH ROW EXECUTE FUNCTION public.trg_vpkzp_usage_abgeleitet();
    `)

    expect((await lauf('uebermittelt')).status).toBe('uebermittelt')
    await expect(jahressatz({ vp_days_used: 56 })).resolves.toBeDefined()
  })

  it('die Rollback-Datei nimmt Trigger und Funktion des Laufs weg', async () => {
    // Die DROP-Anweisungen stehen nicht in einer Funktion und werden oben
    // nachgebildet — hier wird der Dateitext geprüft, damit die
    // Nachbildung nicht von der Datei abweichen kann.
    const text = liesMigration(ROLLBACK)
    expect(text).toMatch(/DROP TRIGGER IF EXISTS trg_a_lauf_eingangsstatus/)
    expect(text).toMatch(/DROP FUNCTION IF EXISTS public\.enforce_lauf_eingangsstatus/)
    expect(text).toMatch(/BEFORE UPDATE ON public\.client_vpkzp_usage/)
  })
})
