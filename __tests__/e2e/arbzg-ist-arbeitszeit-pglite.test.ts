/**
 * E2E: ArbZG auf der ERFASSTEN Arbeitszeit (§ 3, § 4, § 5)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND GAP-13 (29.08.2026): die ArbZG-Pruefung des Projekts sitzt seit
 * `20260920060000` ausschliesslich auf `dienstplan_eintraege` — auf dem
 * PLAN. Die tatsaechlich erfasste Arbeitszeit wird von keiner Regel
 * beruehrt, und § 4 ArbZG (Ruhepausen) fehlte auch im Plan.
 *
 * Das Arbeitszeitgesetz bindet an die GELEISTETE Arbeitszeit (§ 2 Abs. 1
 * ArbZG). Wer acht Stunden eingeplant bekommt und elfeinhalb arbeitet,
 * erzeugt einen Verstoss, den heute nichts sieht: der Plan bleibt
 * unauffaellig, und die Zeiterfassung hatte keine Regel.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WARUM DAS GEGEN ECHTES POSTGRES LAUFEN MUSS
 * ─────────────────────────────────────────────────────────────────────
 * Der Pruefgegenstand ist fast vollstaendig Datenbank:
 *
 *   • `arbzg_pruefung_ist()` — ein AFTER-Trigger, der protokolliert statt
 *     zu blockieren. Eine Attrappe haette das bestaetigt, egal was in der
 *     Funktion steht.
 *   • die beiden PARTIELLEN Unique-Indizes. Mit nullable `eintrag_id`
 *     sind NULL-Werte in Postgres voneinander verschieden — ein
 *     gewoehnliches UNIQUE haette die Ist-Verstoesse unbegrenzt stapeln
 *     lassen, und genau das faellt nur einer echten Datenbank auf.
 *   • `azv_genau_eine_herkunft` — der CHECK, der eine Zeile ohne beide
 *     Bezuege verhindert.
 *   • die Aufraeum-DELETEs: wird eine Zeit korrigiert, bis sie zulaessig
 *     ist, muss der Verstoss VERSCHWINDEN. Ein Protokoll, das nur waechst,
 *     waere nach dem ersten Monat unlesbar.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ZWEI SCHEMAFASSUNGEN, WEIL ES ZWEI GIBT
 * ─────────────────────────────────────────────────────────────────────
 * Migration `20260829184500` ist eingecheckt und NICHT angewendet (DDL
 * laeuft ueber den Dienstschluessel als 42501 auf). Der erste Block faehrt
 * deshalb ausdruecklich gegen den HEUTIGEN Zustand und belegt, dass die
 * erfasste Arbeitszeit dort ungeprueft durchgeht. Wer die Migration in den
 * Grundaufbau zoege, machte genau diesen Befund unsichtbar.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DRIFT ZWISCHEN SQL UND TYPESCRIPT
 * ─────────────────────────────────────────────────────────────────────
 * Dieselbe Regel steht zweimal: in `arbzg_pruefung_ist()` und in
 * `lib/personal/arbzg.ts`. Der letzte Block haelt beide gegeneinander —
 * ohne ihn wuerde eine Aenderung an einer der beiden Fassungen
 * stillschweigend auseinanderlaufen.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  baueKettenSchema,
  bauePersonalTabellen,
  wendeArbzgIstMigrationAn,
  wendeArbeitszeitAkteurMigrationAn,
} from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'
import { createArbeitszeit, updateArbeitszeit } from '@/lib/personal/arbeitszeiten'
import { pruefeArbeitstag, pruefeRuhezeit } from '@/lib/personal/arbzg'

const ORG    = 'aaaaaaaa-0000-4000-8000-000000000070'
const CG     = 'cccccccc-0000-4000-8000-000000000070'
const CG_ZWO = 'cccccccc-0000-4000-8000-000000000071'
const PDL    = 'eeeeeeee-0000-4000-8000-000000000070'
const PLANER = 'dddddddd-0000-4000-8000-000000000070'

interface Umgebung {
  db: PGlite
  supabase: SupabaseClient
}

async function baueUmgebung(mitMigration: boolean): Promise<Umgebung> {
  const db = await baueKettenSchema()
  await bauePersonalTabellen(db)

  // `20260829005500` ist seit dem 29.08.2026 LIVE (Spalte
  // `personal_arbeitszeiten.geaendert_von` aus information_schema gelesen).
  // Sie gehoert deshalb in BEIDE Fassungen: ohne sie schreibt
  // `log_arbeitszeit_korrektur()` weiter blind `auth.uid()` in eine
  // NOT-NULL-Spalte, und jede Korrektur scheiterte hier an einem Befund,
  // der mit dem ArbZG nichts zu tun hat.
  await wendeArbeitszeitAkteurMigrationAn(db)

  if (mitMigration) await wendeArbzgIstMigrationAn(db)

  await db.exec(`
    INSERT INTO organizations (id, name, bundesland, status) VALUES
      ('${ORG}', 'Alltagsengel Pruefbetrieb ArbZG', 'Hessen', 'active');

    INSERT INTO caregivers (id, organization_id, first_name, last_name, initials) VALUES
      ('${CG}',     '${ORG}', 'Nadine', 'Langschicht', 'NL'),
      ('${CG_ZWO}', '${ORG}', 'Peter',  'Kurzschicht', 'PK');
  `)

  return { db, supabase: macheSupabaseClient(db) as unknown as SupabaseClient }
}

async function leere(db: PGlite): Promise<void> {
  await db.exec(`
    ALTER TABLE personal_zeitkorrekturen DISABLE TRIGGER trg_immutable_zeitkorrektur_delete;
    DELETE FROM personal_zeitkorrekturen;
    ALTER TABLE personal_zeitkorrekturen ENABLE TRIGGER trg_immutable_zeitkorrektur_delete;
    DELETE FROM arbeitszeit_verstoesse;
    DELETE FROM personal_arbeitszeiten;
    DELETE FROM dienstplan_eintraege;
  `)
}

/** Verstoesse einer erfassten Arbeitszeit, nach Art sortiert. */
async function istVerstoesse(db: PGlite, arbeitszeitId: string) {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT verstoss_art, gemessener_wert_minuten, grenzwert_minuten, basis'
    + ' FROM arbeitszeit_verstoesse WHERE arbeitszeit_id = $1 ORDER BY verstoss_art',
    [arbeitszeitId] as never[],
  )
  return rows
}

async function alleVerstoesse(db: PGlite) {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT verstoss_art, basis, eintrag_id, arbeitszeit_id FROM arbeitszeit_verstoesse',
  )
  return rows
}

/**
 * Nur die Anzahl — brauchbar auch in der Fassung OHNE die Migration, in
 * der es die Spalten `basis` und `arbeitszeit_id` noch gar nicht gibt.
 */
async function zaehleVerstoesse(db: PGlite): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM arbeitszeit_verstoesse',
  )
  return Number(rows[0].n)
}

/**
 * Legt eine Arbeitszeit ueber die ECHTE Anwendungsfunktion an. Die
 * Netto-Minuten werden dort serverseitig hergeleitet — hier wird bewusst
 * nichts vorgerechnet, sonst pruefte die Suite ihre eigene Rechnung.
 */
async function erfasse(
  supabase: SupabaseClient,
  werte: { datum: string; startZeit: string; endZeit: string; pauseMinuten?: number; caregiverId?: string },
) {
  return await createArbeitszeit(supabase, {
    organizationId: ORG,
    caregiverId: werte.caregiverId ?? CG,
    datum: werte.datum,
    startZeit: werte.startZeit,
    endZeit: werte.endZeit,
    pauseMinuten: werte.pauseMinuten ?? 0,
    quelle: 'app',
    benutzerId: PDL,
  })
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Der HEUTIGE Zustand — die erfasste Arbeitszeit geht ungeprueft durch
// ═══════════════════════════════════════════════════════════════════════

describe('ArbZG · Schema OHNE Migration 20260829184500 (Befund)', () => {
  let u: Umgebung
  beforeAll(async () => { u = await baueUmgebung(false) })
  beforeEach(async () => { await leere(u.db) })

  it('kennt keinen Trigger auf personal_arbeitszeiten', async () => {
    const { rows } = await u.db.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger
       WHERE tgrelid = 'personal_arbeitszeiten'::regclass AND NOT tgisinternal`,
    )
    expect(rows.map(r => r.tgname)).not.toContain('trg_arbzg_pruefung_ist')
  })

  it('protokolliert eine Zwoelfstundenschicht ohne Pause NICHT', async () => {
    // 06:00–18:00 ohne Pause = 720 Minuten. Zwei Verstoesse nach § 3 und
    // § 4 — und heute bleibt die Tabelle leer.
    const zeit = await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '06:00', endZeit: '18:00', pauseMinuten: 0,
    })
    expect(zeit.ist_minuten).toBe(720)
    expect(await zaehleVerstoesse(u.db)).toBe(0)
  })

  it('kennt die Verstoss-Art `pflichtpause` nicht — auch nicht fuer den Plan', async () => {
    // Der CHECK der Ausgangsmigration laesst nur zwei Arten zu. § 4 ArbZG
    // war also nicht bloss ungeprueft, er war nicht speicherbar.
    await expect(u.db.exec(`
      INSERT INTO arbeitszeit_verstoesse
        (organization_id, caregiver_id, eintrag_id, verstoss_art, datum,
         gemessener_wert_minuten, grenzwert_minuten)
      VALUES ('${ORG}', '${CG}', gen_random_uuid(), 'pflichtpause', '2026-09-07', 0, 30);
    `)).rejects.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. MIT der Migration — die Regel greift
// ═══════════════════════════════════════════════════════════════════════

describe('ArbZG · Schema MIT Migration 20260829184500', () => {
  let u: Umgebung
  beforeAll(async () => { u = await baueUmgebung(true) })
  beforeEach(async () => { await leere(u.db) })

  // ── § 3 ArbZG ────────────────────────────────────────────────────────

  it('laesst den regulaeren Tag unbeanstandet', async () => {
    const zeit = await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '08:00', endZeit: '16:30', pauseMinuten: 30,
    })
    expect(zeit.ist_minuten).toBe(480)
    expect(await istVerstoesse(u.db, zeit.id)).toHaveLength(0)
  })

  it('protokolliert die Ueberschreitung der Tageshoechstarbeitszeit', async () => {
    // 06:00–18:00 mit 30 min Pause = 690 Minuten netto.
    const zeit = await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '06:00', endZeit: '18:00', pauseMinuten: 30,
    })
    const befunde = await istVerstoesse(u.db, zeit.id)
    const tag = befunde.find(b => b.verstoss_art === 'max_tagesarbeitszeit')
    expect(tag).toBeDefined()
    expect(Number(tag!.gemessener_wert_minuten)).toBe(690)
    expect(Number(tag!.grenzwert_minuten)).toBe(600)
    expect(tag!.basis).toBe('ist')
  })

  it('laesst exakt 600 Minuten durch — der Grenzwert selbst ist zulaessig', async () => {
    // 07:00–17:30 mit 30 min Pause = 600 netto.
    const zeit = await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '07:00', endZeit: '17:30', pauseMinuten: 30,
    })
    const arten = (await istVerstoesse(u.db, zeit.id)).map(b => b.verstoss_art)
    expect(arten).not.toContain('max_tagesarbeitszeit')
  })

  it('blockiert die Erfassung NICHT — der Verstoss wird protokolliert, nicht verboten', async () => {
    // Die bewusste Bauart aus 20260920060000: ein hartes Verbot wuerde in
    // Notfaellen die Einsatzplanung lahmlegen. Die Zeile MUSS entstehen.
    const zeit = await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '05:00', endZeit: '20:00', pauseMinuten: 45,
    })
    expect(zeit.id).toBeTruthy()
    expect(zeit.ist_minuten).toBe(855)
    expect((await istVerstoesse(u.db, zeit.id)).length).toBeGreaterThan(0)
  })

  // ── § 4 ArbZG ────────────────────────────────────────────────────────

  it('protokolliert die fehlende Ruhepause ab mehr als sechs Stunden', async () => {
    // 08:00–17:00 ohne Pause = 540 netto → Pflicht 30 min.
    const zeit = await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '08:00', endZeit: '17:00', pauseMinuten: 0,
    })
    const pause = (await istVerstoesse(u.db, zeit.id))
      .find(b => b.verstoss_art === 'pflichtpause')
    expect(pause).toBeDefined()
    expect(Number(pause!.gemessener_wert_minuten)).toBe(0)
    expect(Number(pause!.grenzwert_minuten)).toBe(30)
  })

  it('verlangt ab mehr als neun Stunden 45 Minuten', async () => {
    // 08:00–18:00 mit 30 min Pause = 570 netto → Pflicht 45, gewaehrt 30.
    const zeit = await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '08:00', endZeit: '18:00', pauseMinuten: 30,
    })
    const pause = (await istVerstoesse(u.db, zeit.id))
      .find(b => b.verstoss_art === 'pflichtpause')
    expect(Number(pause!.grenzwert_minuten)).toBe(45)
    expect(Number(pause!.gemessener_wert_minuten)).toBe(30)
  })

  it('laesst genau sechs Stunden ohne Pause zu', async () => {
    // § 4 ArbZG sagt „mehr als sechs Stunden". 360 Minuten sind zulaessig.
    const zeit = await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '08:00', endZeit: '14:00', pauseMinuten: 0,
    })
    expect(zeit.ist_minuten).toBe(360)
    expect(await istVerstoesse(u.db, zeit.id)).toHaveLength(0)
  })

  it('meldet die lange Schicht ohne Pause als ZWEI Befunde, nicht als einen', async () => {
    // Zwei Rechtsgruende (§ 3 und § 4), zwei Zeilen. Wer sie zusammenfasst,
    // nimmt der PDL die Moeglichkeit, den einen zu quittieren und den
    // anderen offen zu lassen.
    const zeit = await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '06:00', endZeit: '18:00', pauseMinuten: 0,
    })
    expect((await istVerstoesse(u.db, zeit.id)).map(b => b.verstoss_art))
      .toEqual(['max_tagesarbeitszeit', 'pflichtpause'])
  })

  // ── § 5 ArbZG ────────────────────────────────────────────────────────

  it('protokolliert die zu kurze Ruhezeit zwischen zwei erfassten Zeiten', async () => {
    await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '08:00', endZeit: '16:00', pauseMinuten: 30,
    })
    // Naechster Dienst am Folgetag um 02:00 → 10 h Abstand.
    const zweite = await erfasse(u.supabase, {
      datum: '2026-09-08', startZeit: '02:00', endZeit: '06:00', pauseMinuten: 0,
    })
    const ruhe = (await istVerstoesse(u.db, zweite.id))
      .find(b => b.verstoss_art === 'mindestruhezeit')
    expect(ruhe).toBeDefined()
    expect(Number(ruhe!.gemessener_wert_minuten)).toBe(600)
    expect(Number(ruhe!.grenzwert_minuten)).toBe(660)
  })

  it('rechnet das Ende eines Nachtdienstes auf den Folgetag', async () => {
    // 22:00–06:00 am 07. endet am 08. um 06:00. Naechster Dienst am 08.
    // um 14:00 → acht Stunden Ruhezeit, nicht zwanzig.
    await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '22:00', endZeit: '06:00', pauseMinuten: 0,
    })
    const zweite = await erfasse(u.supabase, {
      datum: '2026-09-08', startZeit: '14:00', endZeit: '18:00', pauseMinuten: 0,
    })
    const ruhe = (await istVerstoesse(u.db, zweite.id))
      .find(b => b.verstoss_art === 'mindestruhezeit')
    expect(Number(ruhe!.gemessener_wert_minuten)).toBe(480)
  })

  it('haelt elf Stunden Abstand fuer eingehalten', async () => {
    await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '08:00', endZeit: '16:00', pauseMinuten: 30,
    })
    const zweite = await erfasse(u.supabase, {
      datum: '2026-09-08', startZeit: '03:00', endZeit: '07:00', pauseMinuten: 0,
    })
    expect((await istVerstoesse(u.db, zweite.id)).map(b => b.verstoss_art))
      .not.toContain('mindestruhezeit')
  })

  it('mischt die Ruhezeiten zweier Mitarbeitender nicht', async () => {
    await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '08:00', endZeit: '16:00', pauseMinuten: 30,
    })
    const fremd = await erfasse(u.supabase, {
      caregiverId: CG_ZWO,
      datum: '2026-09-08', startZeit: '02:00', endZeit: '06:00', pauseMinuten: 0,
    })
    expect(await istVerstoesse(u.db, fremd.id)).toHaveLength(0)
  })

  // ── Das Aufraeumen ───────────────────────────────────────────────────

  it('nimmt den Verstoss zurueck, sobald die Zeit korrigiert ist', async () => {
    const zeit = await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '06:00', endZeit: '18:00', pauseMinuten: 0,
    })
    expect((await istVerstoesse(u.db, zeit.id)).length).toBe(2)

    // Korrektur auf einen zulaessigen Tag. `ist_minuten` wird dabei
    // serverseitig neu hergeleitet — der Aufrufer gibt es nicht mit.
    await updateArbeitszeit(u.supabase, zeit.id, ORG, {
      endZeit: '14:30', pauseMinuten: 30, benutzerId: PDL,
    })
    expect(await istVerstoesse(u.db, zeit.id)).toHaveLength(0)
  })

  it('aktualisiert den gemessenen Wert statt eine zweite Zeile anzulegen', async () => {
    const zeit = await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '06:00', endZeit: '18:00', pauseMinuten: 30,
    })
    await updateArbeitszeit(u.supabase, zeit.id, ORG, {
      endZeit: '19:00', benutzerId: PDL,
    })
    const befunde = await istVerstoesse(u.db, zeit.id)
    expect(befunde.filter(b => b.verstoss_art === 'max_tagesarbeitszeit')).toHaveLength(1)
    expect(Number(befunde.find(b => b.verstoss_art === 'max_tagesarbeitszeit')!.gemessener_wert_minuten))
      .toBe(750)
  })

  it('loescht die Verstoesse mit der Arbeitszeit selbst (ON DELETE CASCADE)', async () => {
    const zeit = await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '06:00', endZeit: '18:00', pauseMinuten: 0,
    })
    expect((await alleVerstoesse(u.db)).length).toBe(2)
    await u.db.query('DELETE FROM personal_arbeitszeiten WHERE id = $1', [zeit.id] as never[])
    expect(await alleVerstoesse(u.db)).toHaveLength(0)
  })

  // ── Die Riegel der geweiteten Tabelle ────────────────────────────────

  it('verlangt GENAU EINE Herkunft je Verstoss', async () => {
    // Ohne diesen CHECK entstuende ein Verstoss, der zu nichts gehoert —
    // und den die aufraeumenden DELETEs beider Trigger nie wieder finden.
    await expect(u.db.exec(`
      INSERT INTO arbeitszeit_verstoesse
        (organization_id, caregiver_id, basis, verstoss_art, datum,
         gemessener_wert_minuten, grenzwert_minuten)
      VALUES ('${ORG}', '${CG}', 'ist', 'pflichtpause', '2026-09-07', 0, 30);
    `)).rejects.toThrow(/azv_genau_eine_herkunft/)
  })

  it('stapelt Ist-Verstoesse nicht — der partielle Unique-Index greift', async () => {
    // Der Kern der Umstellung: mit nullable `eintrag_id` sind NULL-Werte
    // in Postgres voneinander verschieden. Ein gewoehnliches
    // UNIQUE (eintrag_id, verstoss_art) haette hier NICHTS verhindert.
    const zeit = await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '06:00', endZeit: '18:00', pauseMinuten: 0,
    })
    await expect(u.db.exec(`
      INSERT INTO arbeitszeit_verstoesse
        (organization_id, caregiver_id, arbeitszeit_id, basis, verstoss_art, datum,
         gemessener_wert_minuten, grenzwert_minuten)
      VALUES ('${ORG}', '${CG}', '${zeit.id}', 'ist', 'pflichtpause', '2026-09-07', 0, 30);
    `)).rejects.toThrow(/uq_azv_arbeitszeit_art/)
  })

  it('kennt `basis` und setzt sie auf `ist`', async () => {
    const zeit = await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '06:00', endZeit: '18:00', pauseMinuten: 0,
    })
    expect((await istVerstoesse(u.db, zeit.id)).every(b => b.basis === 'ist')).toBe(true)
  })

  it('haelt Plan- und Ist-Verstoesse in derselben Tabelle auseinander', async () => {
    // Beide Trigger schreiben in dieselbe Tabelle — die PDL liest sie
    // gemeinsam, muss sie aber unterscheiden koennen: ein Plan-Verstoss
    // laesst sich umplanen, ein Ist-Verstoss ist bereits geschehen.
    await u.db.query(
      `INSERT INTO dienstplan_eintraege
         (organization_id, datum, caregiver_id, start_zeit, end_zeit, pause_minuten,
          status, typ, erstellt_von)
       VALUES ($1, '2026-09-14', $2, '06:00', '19:00', 0, 'geplant', 'regulaer', $3)`,
      [ORG, CG, PLANER] as never[],
    )
    await erfasse(u.supabase, {
      datum: '2026-09-21', startZeit: '06:00', endZeit: '19:00', pauseMinuten: 0,
    })

    const alle = await alleVerstoesse(u.db)
    const plan = alle.filter(v => v.basis === 'plan')
    const ist  = alle.filter(v => v.basis === 'ist')
    expect(plan.length).toBe(2)
    expect(ist.length).toBe(2)
    expect(plan.every(v => v.eintrag_id !== null && v.arbeitszeit_id === null)).toBe(true)
    expect(ist.every(v => v.arbeitszeit_id !== null && v.eintrag_id === null)).toBe(true)
  })

  it('prueft jetzt auch den PLAN auf § 4 ArbZG', async () => {
    // Die Migration zieht die Pausenregel in beiden Triggern nach. Ohne
    // das waere derselbe Sachverhalt im Plan zulaessig und in der
    // Erfassung ein Verstoss.
    const { rows } = await u.db.query<{ id: string }>(
      `INSERT INTO dienstplan_eintraege
         (organization_id, datum, caregiver_id, start_zeit, end_zeit, pause_minuten,
          status, typ, erstellt_von)
       VALUES ($1, '2026-09-14', $2, '08:00', '17:00', 0, 'geplant', 'regulaer', $3)
       RETURNING id`,
      [ORG, CG, PLANER] as never[],
    )
    const { rows: befunde } = await u.db.query<{ verstoss_art: string; grenzwert_minuten: number }>(
      'SELECT verstoss_art, grenzwert_minuten FROM arbeitszeit_verstoesse WHERE eintrag_id = $1',
      [rows[0].id] as never[],
    )
    expect(befunde.map(b => b.verstoss_art)).toEqual(['pflichtpause'])
    expect(Number(befunde[0].grenzwert_minuten)).toBe(30)
  })

  // ── Die Netto-Minuten werden hergeleitet, nicht geglaubt ─────────────

  it('weist eine Ist-Minuten-Angabe ab, die nicht zu den Zeiten passt', async () => {
    // Ohne diesen Riegel legte ein Aufruf mit 08:00–20:00, Pause 0 und
    // istMinuten 60 eine Zwoelfstundenschicht an, die als eine Stunde in
    // der Datenbank steht — und die ArbZG-Pruefung liefe auf einen frei
    // waehlbaren Wert.
    await expect(createArbeitszeit(u.supabase, {
      organizationId: ORG, caregiverId: CG, datum: '2026-09-07',
      startZeit: '08:00', endZeit: '20:00', pauseMinuten: 0,
      istMinuten: 60, quelle: 'app', benutzerId: PDL,
    })).rejects.toThrow(/passen nicht zu Beginn, Ende und Pause/)
    expect(await alleVerstoesse(u.db)).toHaveLength(0)
  })

  it('rechnet die Netto-Minuten bei einer Pausen-Korrektur neu', async () => {
    // Wer nur die Pause korrigiert, aendert damit die Arbeitszeit. Bliebe
    // `ist_minuten` stehen, passte die Zeile nicht mehr zu sich selbst —
    // und die naechste ArbZG-Pruefung maesse den alten Wert.
    const zeit = await erfasse(u.supabase, {
      datum: '2026-09-07', startZeit: '06:00', endZeit: '17:00', pauseMinuten: 60,
    })
    expect(zeit.ist_minuten).toBe(600)
    expect(await istVerstoesse(u.db, zeit.id)).toHaveLength(0)

    const nachher = await updateArbeitszeit(u.supabase, zeit.id, ORG, {
      pauseMinuten: 15, benutzerId: PDL,
    })
    expect(nachher.ist_minuten).toBe(645)
    expect((await istVerstoesse(u.db, zeit.id)).map(b => b.verstoss_art))
      .toEqual(['max_tagesarbeitszeit', 'pflichtpause'])
  })

  // ── Kein Drift zwischen SQL und TypeScript ───────────────────────────

  it('liefert dieselben Zahlen wie lib/personal/arbzg.ts', async () => {
    const faelle = [
      { datum: '2026-09-07', startZeit: '08:00', endZeit: '16:30', pauseMinuten: 30 },
      { datum: '2026-09-08', startZeit: '06:00', endZeit: '18:00', pauseMinuten: 0 },
      { datum: '2026-09-09', startZeit: '08:00', endZeit: '17:00', pauseMinuten: 0 },
      { datum: '2026-09-10', startZeit: '08:00', endZeit: '18:00', pauseMinuten: 30 },
      { datum: '2026-09-11', startZeit: '20:00', endZeit: '07:00', pauseMinuten: 0 },
    ]
    for (const fall of faelle) {
      await leere(u.db)
      const zeit = await erfasse(u.supabase, fall)
      const ausDerDatenbank = (await istVerstoesse(u.db, zeit.id))
        .filter(b => b.verstoss_art !== 'mindestruhezeit')
        .map(b => ({
          art: b.verstoss_art,
          gemessenMinuten: Number(b.gemessener_wert_minuten),
          grenzwertMinuten: Number(b.grenzwert_minuten),
        }))
      const ausTypeScript = pruefeArbeitstag(fall)
        .sort((a, b) => a.art.localeCompare(b.art))
      expect(ausDerDatenbank, `Fall ${fall.datum} ${fall.startZeit}-${fall.endZeit}`)
        .toEqual(ausTypeScript)
    }
  })

  it('liefert fuer die Ruhezeit dieselbe Zahl wie lib/personal/arbzg.ts', async () => {
    const vorher  = { datum: '2026-09-07', startZeit: '22:00', endZeit: '06:00', pauseMinuten: 0 }
    const nachher = { datum: '2026-09-08', startZeit: '14:00', endZeit: '18:00', pauseMinuten: 0 }
    await erfasse(u.supabase, vorher)
    const zweite = await erfasse(u.supabase, nachher)

    const ausDerDatenbank = (await istVerstoesse(u.db, zweite.id))
      .find(b => b.verstoss_art === 'mindestruhezeit')
    const ausTypeScript = pruefeRuhezeit({
      datumVorher: vorher.datum,
      startZeitVorher: vorher.startZeit,
      endZeitVorher: vorher.endZeit,
      datumNachher: nachher.datum,
      startZeitNachher: nachher.startZeit,
    })
    expect(Number(ausDerDatenbank!.gemessener_wert_minuten))
      .toBe(ausTypeScript!.gemessenMinuten)
    expect(Number(ausDerDatenbank!.grenzwert_minuten))
      .toBe(ausTypeScript!.grenzwertMinuten)
  })
})
