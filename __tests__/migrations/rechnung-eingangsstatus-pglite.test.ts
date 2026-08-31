/**
 * PGlite: die Statusmaschine der Rechnung bekommt einen Eingang
 * (Migration 20261023000002_rechnung_eingangsstatus.sql)
 *
 * ── DER BEFUND, DEN DIESE SUITE FESTHÄLT ──────────────────────────────────
 * Auf `invoices` stehen drei Riegel, und alle drei sind `BEFORE UPDATE`:
 * die Statusmaschine, das Kassen-Freischaltungs-Gate und die
 * Unveränderlichkeit festgeschriebener Rechnungen. Keiner beschreibt, in
 * welchem Status eine Rechnung ENTSTEHEN darf. Wer den Anfangszustand frei
 * wählt, braucht keinen einzigen Übergang.
 *
 * Live nachgemessen am 31.08.2026 (angelegt und sofort gelöscht):
 * `status='bezahlt'`, `'freigegeben'` und `'uebermittelt'` gingen alle drei
 * direkt beim INSERT durch.
 *
 * ── WARUM ECHTES POSTGRES ─────────────────────────────────────────────────
 * Die Aussage ist eine über Trigger-Verdrahtung. Eine Attrappe hat keine
 * Trigger und kann sie deshalb prinzipiell nicht prüfen.
 *
 * ── ZWEI BEWUSSTE ABWEICHUNGEN VOM PRODUKTIONSSCHEMA ──────────────────────
 * 1. `invoices` wird nur mit den Spalten nachgebaut, die hier eine Rolle
 *    spielen, PLUS dem echten `invoices_status_check` — der ist Teil der
 *    Aussage, weil er BEIDE Vokabulare zulässt (deutsch und englisch) und
 *    der Riegel deshalb beide Entwurfsschreibweisen kennen muss.
 * 2. Die übrigen Trigger von `invoices` fehlen. Sie sind nicht Gegenstand
 *    dieser Frage — ihr Fehlen darf nicht als „geprüft" gelesen werden.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { funktionAusMigration, liesMigration } from '../helpers/sql-extract'

const MIGRATION = '20261023000002_rechnung_eingangsstatus.sql'
const ROLLBACK = '20261023000003_rollback_rechnung_eingangsstatus.sql'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const KLIENT = '00000000-0000-4000-8000-0000000000ba'

/** Wörtlich der Live-CHECK — beide Vokabulare. */
const STATUS_CHECK = `CHECK (status = ANY (ARRAY[
  'draft','sent','paid','partial','rejected','disputed',
  'entwurf','geprueft','freigegeben','uebermittelt','quittiert','abgelehnt',
  'bezahlt','teilweise_bezahlt','gekuerzt','korrektur_erforderlich',
  'erneut_eingereicht','akzeptiert','storniert','strittig','abgeschrieben']))`

const TRIGGER = `
  DROP TRIGGER IF EXISTS trg_a_invoice_eingangsstatus ON public.invoices;
  CREATE TRIGGER trg_a_invoice_eingangsstatus
    BEFORE INSERT ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_eingangsstatus();
`

let db: InstanceType<typeof PGlite>
let lfd = 0

async function anlegen(status?: string | null) {
  lfd += 1
  const spalten = ['organization_id', 'client_id', 'invoice_number', 'total_amount', 'period_start', 'period_end']
  const werte: unknown[] = [ORG, KLIENT, `RE-${lfd}`, 100, '2026-08-01', '2026-08-31']
  if (status !== undefined) { spalten.push('status'); werte.push(status) }
  const platzhalter = spalten.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await db.query<{ id: string; status: string }>(
    `INSERT INTO public.invoices (${spalten.join(', ')}) VALUES (${platzhalter}) RETURNING id, status`,
    werte as never[],
  )
  return rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE public.invoices (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL,
      client_id       uuid NOT NULL,
      invoice_number  text NOT NULL,
      status          text DEFAULT 'draft' ${STATUS_CHECK},
      total_amount    numeric(10,2) NOT NULL,
      period_start    date NOT NULL,
      period_end      date NOT NULL,
      frozen_at       timestamptz
    );
  `)
})

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec('TRUNCATE public.invoices')
  await db.exec(funktionAusMigration(MIGRATION, 'enforce_invoice_eingangsstatus'))
  await db.exec(TRIGGER)
})

describe('Der Befund: ohne Eingangsriegel ist jeder Endstatus frei wählbar', () => {
  it('ohne den Trigger geht status=bezahlt direkt beim Anlegen durch', async () => {
    // Die Gegenprobe. Ohne sie bewiese die Suite nicht, dass die Migration
    // überhaupt etwas ändert.
    await db.exec('DROP TRIGGER trg_a_invoice_eingangsstatus ON public.invoices')
    const zeile = await anlegen('bezahlt')
    expect(zeile.status).toBe('bezahlt')
  })
})

describe('Mit Eingangsriegel', () => {
  it('weist jeden Status ausser Entwurf beim Anlegen ab', async () => {
    // Die vollständige Liste, nicht drei Beispiele: eine Lücke im Riegel
    // wäre sonst genau der Status, den niemand aufgeschrieben hat.
    const verboten = [
      'sent', 'paid', 'partial', 'rejected', 'disputed',
      'geprueft', 'freigegeben', 'uebermittelt', 'quittiert', 'abgelehnt',
      'bezahlt', 'teilweise_bezahlt', 'gekuerzt', 'korrektur_erforderlich',
      'erneut_eingereicht', 'akzeptiert', 'storniert', 'strittig', 'abgeschrieben',
    ]
    for (const status of verboten) {
      await expect(anlegen(status), `status=${status} wurde durchgelassen`)
        .rejects.toThrow(/RECHNUNG_EINGANGSSTATUS/)
    }
  })

  it('lässt beide Entwurfsschreibweisen zu', async () => {
    // `invoices_status_check` erlaubt zwei Vokabulare: der Spalten-DEFAULT
    // ist 'draft', `create_invoice_draft_atomic` schreibt 'entwurf'. Wer
    // nur eines zuließe, bräche einen der beiden Wege.
    expect((await anlegen('entwurf')).status).toBe('entwurf')
    expect((await anlegen('draft')).status).toBe('draft')
  })

  it('lässt den Spalten-DEFAULT durch', async () => {
    // Ein weggelassener Status ist NICHT NULL: Spalten-DEFAULTs werden vor
    // den BEFORE-Triggern angewendet, `NEW.status` trägt hier schon
    // 'draft'. Ohne diese Prüfung wäre jede Anlage ohne ausdrücklichen
    // Status kaputt.
    expect((await anlegen()).status).toBe('draft')
  })

  it('weist einen ausdrücklich auf NULL gesetzten Status ab', async () => {
    // Beim Schreiben dieser Suite aufgefallen: `invoices.status` ist
    // nullable, und ein CHECK ist bei NULL erfüllt. Ein ausdrückliches
    // NULL wird NICHT durch den DEFAULT ersetzt — die Zeile stünde dann
    // ohne Status da und fiele aus jedem Statusfilter heraus: keine
    // Entwurfsliste, keine offenen Posten, kein Mahnlauf. Unsichtbar und
    // trotzdem da.
    await expect(anlegen(null)).rejects.toThrow(/ohne Status ist nicht zulaessig/)
  })

  it('der Weg über UPDATE bleibt offen — der Riegel sitzt nur am Eingang', async () => {
    // Das ist der Kern: nichts wird unmöglich, alles wird nur zum Übergang.
    // Genau dort greifen die drei bestehenden BEFORE-UPDATE-Riegel wieder.
    const { id } = await anlegen('entwurf')
    for (const status of ['geprueft', 'freigegeben', 'uebermittelt']) {
      await db.query('UPDATE public.invoices SET status = $1 WHERE id = $2', [status, id])
    }
    const { rows } = await db.query<{ status: string }>(
      'SELECT status FROM public.invoices WHERE id = $1', [id])
    expect(rows[0].status).toBe('uebermittelt')
  })

  it('die Fehlermeldung nennt den Grund und den Weg', async () => {
    // Eine Sperre, die nur „nicht erlaubt" sagt, erzeugt beim nächsten
    // Aufrufer einen Workaround statt einer Korrektur.
    await expect(anlegen('bezahlt')).rejects.toThrow(/nur als Entwurf angelegt werden/)
  })
})

describe('Rollback', () => {
  it('nimmt Trigger und Funktion weg', async () => {
    await db.exec(liesMigration(ROLLBACK))
    const zeile = await anlegen('bezahlt')
    expect(zeile.status).toBe('bezahlt')

    const { rows } = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'enforce_invoice_eingangsstatus'")
    expect(rows[0].n).toBe(0)
  })
})
