/**
 * E2E: Zeiterfassung — Erfassung, Korrektur, Sperre, ArbZG-Protokoll
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Die COMPLETION-MATRIX fuehrt die Zeiterfassung als Modul 6 auf Stufe
 * `MIGRATION_APPLIED` mit **14 Testfaellen** und haelt das als Befund I-6
 * ausdruecklich fest: „Nur 14 Testfaelle fuer ein Modul, das
 * Arbeitszeitrecht abbildet." Diese Suite faehrt die Kette erstmals
 * durchgehend gegen echtes PostgreSQL (PGlite) — durch die ECHTEN
 * Funktionen aus `lib/personal/arbeitszeiten.ts`, nicht an ihnen vorbei.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WARUM DAS HIER NICHT GEGEN EINE ATTRAPPE LAUFEN DARF
 * ─────────────────────────────────────────────────────────────────────
 * Vier der fuenf tragenden Aussagen dieses Moduls sind Aussagen ueber die
 * DATENBANK, nicht ueber den TypeScript-Code:
 *
 *   • `personal_arbeitszeiten_unique` — eine Zeit je Kraft/Tag/Startzeit
 *   • `ueberstunden_minuten` GENERATED ALWAYS — der Saldo wird gerechnet,
 *     nicht geschrieben; wer ihn im Anwendungscode setzen wollte, koennte
 *     es gar nicht
 *   • `log_arbeitszeit_korrektur` — schreibt das Korrekturprotokoll und
 *     hebt den Status auf `korrigiert`
 *   • `arbzg_pruefung` — protokolliert §3/§5 ArbZG, **ohne zu blockieren**
 *
 * Eine Fake-DB haette jede davon bestaetigt, egal was drinsteht.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WAS DIESE SUITE BEIM SCHREIBEN GEFUNDEN HAT (P1, live nachgemessen)
 * ─────────────────────────────────────────────────────────────────────
 * `log_arbeitszeit_korrektur()` schreibt `korrigiert_von = auth.uid()` in
 * `personal_zeitkorrekturen` — und die Spalte ist NOT NULL (live aus
 * information_schema gelesen: nullable = NO). Der einzige Schreibweg der
 * Zeiterfassung faehrt mit `createAdminClient()`; unter dem
 * Dienstschluessel liefert `auth.uid()` live NULL, die JWT-Claims lauten
 * dort {"role":"service_role"} und tragen kein `sub` (ebenfalls live
 * gemessen, 29.08.2026).
 *
 * Folge: JEDE Korrektur einer Arbeitszeit scheitert mit 23502 und einer
 * rohen Datenbankmeldung. Live ist das nie aufgefallen, weil
 * `personal_arbeitszeiten` **0 Zeilen** traegt — niemand hat je eine Zeit
 * korrigiert. Das ist eine Aussage ueber den BESTAND, nicht ueber den Code.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DIE TRIGGER-LUECKE DER SPERRE (Befund I-6, hier belegt und geschlossen)
 * ─────────────────────────────────────────────────────────────────────
 * Der Kopfkommentar in `lib/personal/arbeitszeiten.ts` behauptet, der
 * DB-Trigger blocke NUR `OLD.gesperrt = true AND NEW.gesperrt = true`,
 * weshalb ein mitgeschicktes `gesperrt: false` die Sperre umgehe und der
 * TypeScript-Guard die echte Schranke sei. Das war eine Aussage ueber
 * Code, den niemand gegen eine Datenbank gehalten hatte. Sie stimmt —
 * und wird hier zum ersten Mal belegt.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ZWEI SCHEMAFASSUNGEN, WEIL ES ZWEI GIBT
 * ─────────────────────────────────────────────────────────────────────
 * Migration 20260829005500 behebt beide Befunde, ist aber EINGECHECKT und
 * NICHT ANGEWENDET (DDL laeuft ueber den Dienstschluessel als 42501 auf).
 * Wer sie in den Schemaaufbau zoege, liesse die Suite gegen eine
 * Datenbank laufen, die es so noch nicht gibt — und der Befund waere in
 * keinem Lauf mehr sichtbar. Deshalb laeuft die Kette ZWEIMAL:
 *
 *   LIVE-FASSUNG   — der heutige Zustand. Belegt den Befund und dass die
 *                    Anwendung ihn jetzt LESBAR meldet statt roh.
 *   MIT MIGRATION  — der Zielzustand. Die Kette laeuft durch, das
 *                    Protokoll traegt einen Urheber, die Sperre haelt
 *                    auch ohne den TypeScript-Guard.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WAS DIESE SUITE NICHT PRUEFT
 * ─────────────────────────────────────────────────────────────────────
 * RLS. Die Zeiterfassung faehrt live ueber `createAdminClient()`
 * (BYPASSRLS) — der Mandantenzaun ist an dieser Stelle KEINE Policy,
 * sondern `assertCaregiverInOrg()` im Anwendungscode. Genau der wird
 * geprueft, mit einem echten zweiten Mandanten.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  baueKettenSchema,
  bauePersonalTabellen,
  wendeArbeitszeitAkteurMigrationAn,
} from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

import {
  createArbeitszeit,
  updateArbeitszeit,
  listArbeitszeiten,
  listArbeitszeitKonto,
} from '@/lib/personal/arbeitszeiten'

const ORG       = 'aaaaaaaa-0000-4000-8000-000000000060'
const FREMD_ORG = 'bbbbbbbb-0000-4000-8000-000000000060'
const CG        = 'cccccccc-0000-4000-8000-000000000060'
const CG_FREMD  = 'cccccccc-0000-4000-8000-000000000061'
const PLANER    = 'dddddddd-0000-4000-8000-000000000060'
/** Der handelnde Benutzer, den die Routen aus dem Auth-Kontext mitgeben. */
const PDL       = 'eeeeeeee-0000-4000-8000-000000000060'

// ═══════════════════════════════════════════════════════════════════════
// Pruefumgebung — eine je Schemafassung
// ═══════════════════════════════════════════════════════════════════════

interface Umgebung {
  db: PGlite
  supabase: SupabaseClient
}

async function baueUmgebung(mitMigration: boolean): Promise<Umgebung> {
  const db = await baueKettenSchema()
  await bauePersonalTabellen(db)
  if (mitMigration) await wendeArbeitszeitAkteurMigrationAn(db)

  await db.exec(`
    INSERT INTO organizations (id, name, bundesland, status) VALUES
      ('${ORG}',       'Alltagsengel Pruefbetrieb', 'Hessen', 'active'),
      ('${FREMD_ORG}', 'Fremder Pflegedienst',      'Hessen', 'active');

    INSERT INTO caregivers (id, organization_id, first_name, last_name, initials) VALUES
      ('${CG}',       '${ORG}',       'Nadine', 'Zeitnehmer', 'NZ'),
      ('${CG_FREMD}', '${FREMD_ORG}', 'Ilhan',  'Fremdkraft', 'IF');
  `)

  return { db, supabase: macheSupabaseClient(db) as unknown as SupabaseClient }
}

async function leere(db: PGlite): Promise<void> {
  // `personal_zeitkorrekturen` traegt zwei BEFORE-Trigger, die JEDES UPDATE
  // und DELETE abweisen — das ist der Pruefgegenstand und wird deshalb
  // nicht entschaerft, sondern fuer das Aufraeumen zwischen zwei Faellen
  // kurz stillgelegt. Eigene Tests pruefen die Unveraenderlichkeit
  // ausdruecklich; hier geht es nur um einen leeren Ausgangszustand.
  await db.exec(`
    ALTER TABLE personal_zeitkorrekturen DISABLE TRIGGER trg_immutable_zeitkorrektur_delete;
    DELETE FROM personal_zeitkorrekturen;
    ALTER TABLE personal_zeitkorrekturen ENABLE TRIGGER trg_immutable_zeitkorrektur_delete;
    DELETE FROM arbeitszeit_verstoesse;
    DELETE FROM personal_arbeitszeiten;
    DELETE FROM dienstplan_eintraege;
    DELETE FROM absences;
  `)
}

/** Rohzugriff an der Anwendung vorbei — fuer Befund und Gegenprobe. */
async function rohZeile(db: PGlite, id: string) {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM personal_arbeitszeiten WHERE id = $1', [id] as never[],
  )
  return rows[0]
}

async function korrekturen(db: PGlite, arbeitszeitId: string) {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT feld, alter_wert, neuer_wert, grund, korrigiert_von FROM personal_zeitkorrekturen'
    + ' WHERE arbeitszeit_id = $1 ORDER BY feld',
    [arbeitszeitId] as never[],
  )
  return rows
}

async function verstoesse(db: PGlite, eintragId: string) {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT verstoss_art, gemessener_wert_minuten, grenzwert_minuten FROM arbeitszeit_verstoesse'
    + ' WHERE eintrag_id = $1 ORDER BY verstoss_art',
    [eintragId] as never[],
  )
  return rows
}

/** Dienstplaneintrag direkt anlegen — Ausloeser der ArbZG-Pruefung. */
async function dienst(db: PGlite, werte: Record<string, unknown> = {}): Promise<string> {
  const basis: Record<string, unknown> = {
    organization_id: ORG,
    datum: '2026-09-07',
    caregiver_id: CG,
    start_zeit: '08:00',
    end_zeit: '16:00',
    pause_minuten: 30,
    status: 'geplant',
    typ: 'regulaer',
    erstellt_von: PLANER,
    ...werte,
  }
  const spalten = Object.keys(basis)
  const platzhalter = spalten.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO dienstplan_eintraege (${spalten.join(', ')}) VALUES (${platzhalter}) RETURNING id`,
    Object.values(basis) as never[],
  )
  return rows[0].id
}

/**
 * Standard-Arbeitszeit ueber die ECHTE Anwendungsfunktion — mit
 * `benutzerId`, genau wie die Route sie aus dem Auth-Kontext mitgibt.
 */
function zeitParams(ueber: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    caregiverId: CG,
    datum: '2026-09-07',
    startZeit: '08:00',
    endZeit: '16:00',
    pauseMinuten: 30,
    // `istMinuten` steht hier BEWUSST NICHT: seit GAP-13 (29.08.2026)
    // leitet `createArbeitszeit` die Netto-Arbeitszeit aus Beginn, Ende
    // und Pause her und weist einen abweichenden Wert ab. Stuende hier
    // ein fester Wert, muesste ihn jede Abwandlung mitpflegen — und ein
    // vergessener Nachzug saehe aus wie ein Fehler in der Regel.
    // 08:00–16:00 abzueglich 30 min Pause = 450 min.
    sollMinuten: 420,
    benutzerId: PDL,
    ...ueber,
  } as Parameters<typeof createArbeitszeit>[1]
}

// ═══════════════════════════════════════════════════════════════════════
// TEIL 1 — was in BEIDEN Schemafassungen gleich gilt
// ═══════════════════════════════════════════════════════════════════════

/**
 * Erfassung, ArbZG-Protokoll und Auswertung haengen nicht am
 * Korrektur-Trigger und muessen deshalb in beiden Fassungen identisch
 * laufen. Wuerde eine der beiden abweichen, waere das selbst ein Befund —
 * deshalb steht der Block in einer Funktion und wird zweimal registriert.
 */
function gemeinsameKette(hole: () => Umgebung, fassung: string) {
  describe(`Erfassung (${fassung})`, () => {
    beforeEach(async () => { await leere(hole().db) })

    it('legt eine Arbeitszeit an und laesst den Saldo von der Datenbank rechnen', async () => {
      const { supabase } = hole()
      const zeit = await createArbeitszeit(supabase, zeitParams())

      expect(zeit.id).toBeTruthy()
      expect(zeit.status).toBe('erfasst')
      // ueberstunden_minuten ist GENERATED ALWAYS — 450 ist minus 420 soll.
      // Der Wert steht in KEINEM insert(); er entsteht in der Spalte.
      expect(Number(zeit.ueberstunden_minuten)).toBe(30)
    })

    it('rechnet ohne Soll-Vorgabe keinen Saldo (0 statt negativ)', async () => {
      const zeit = await createArbeitszeit(hole().supabase, zeitParams({ sollMinuten: null }))
      expect(Number(zeit.ueberstunden_minuten)).toBe(0)
    })

    it('haelt einen Minusstand fest, wenn die Ist-Zeit unter dem Soll liegt', async () => {
      // 08:00–14:30 abzueglich 30 min Pause = 360 min gegen 420 min Soll.
      // Die Ist-Minuten werden aus den ZEITEN hergeleitet, nicht mehr
      // uebergeben — ein frei gesetztes `istMinuten` weist
      // `assertIstMinutenStimmig` seit GAP-13 ab.
      const zeit = await createArbeitszeit(hole().supabase, zeitParams({
        endZeit: '14:30', sollMinuten: 420,
      }))
      expect(Number(zeit.ist_minuten)).toBe(360)
      expect(Number(zeit.ueberstunden_minuten)).toBe(-60)
    })

    it('weist dieselbe Kraft mit derselben Startzeit am selben Tag zurueck (UNIQUE)', async () => {
      const { supabase } = hole()
      await createArbeitszeit(supabase, zeitParams())
      await expect(createArbeitszeit(supabase, zeitParams({ endZeit: '17:00' })))
        .rejects.toThrow(/personal_arbeitszeiten_unique|duplicate key/i)
    })

    it('erlaubt dieselbe Kraft am selben Tag mit anderer Startzeit', async () => {
      const { supabase } = hole()
      await createArbeitszeit(supabase, zeitParams())
      const zweite = await createArbeitszeit(supabase, zeitParams({
        startZeit: '18:00', endZeit: '20:00', pauseMinuten: 0, sollMinuten: null,
      }))
      expect(zweite.id).toBeTruthy()
    })

    it('weist eine Zeit auf einen FREMDEN Mitarbeiter ab — und legt keine Zeile an', async () => {
      // Der Mandantenzaun ist hier keine Policy: die Anwendung faehrt mit dem
      // Dienstschluessel. assertCaregiverInOrg() ist die einzige Grenze.
      const { supabase, db } = hole()
      await expect(createArbeitszeit(supabase, zeitParams({ caregiverId: CG_FREMD })))
        .rejects.toThrow(/Mitarbeiter nicht gefunden/)

      const { rows } = await db.query('SELECT id FROM personal_arbeitszeiten')
      expect(rows).toHaveLength(0)
    })

    it('GEGENPROBE: derselbe Aufruf im richtigen Mandanten geht durch', async () => {
      // Ohne diese Gegenprobe waere „weist alles ab" ebenfalls gruen — und
      // der Zaun kein Zaun, sondern ein Defekt.
      const zeit = await createArbeitszeit(hole().supabase, zeitParams({ caregiverId: CG }))
      expect(zeit.caregiver_id).toBe(CG)
    })

    it('weist unplausible Minutenwerte ab, bevor sie die Datenbank erreichen', async () => {
      const { supabase } = hole()
      // Pause laenger als der Dienst → 0 Minuten Arbeitszeit.
      await expect(createArbeitszeit(supabase, zeitParams({ pauseMinuten: 600 })))
        .rejects.toThrow(/Ist-Minuten/)
      await expect(createArbeitszeit(supabase, zeitParams({ pauseMinuten: -5 })))
        .rejects.toThrow(/Pause-Minuten/)
      await expect(createArbeitszeit(supabase, zeitParams({ startZeit: 'acht' })))
        .rejects.toThrow(/HH:MM/)
    })

    it('weist eine Ist-Minuten-Angabe ab, die nicht zu den Zeiten passt (GAP-13)', async () => {
      // Bis zum 29.08.2026 kam `istMinuten` unveraendert aus dem
      // Request-Body in die Spalte. Ein Aufruf mit 08:00–20:00, Pause 0
      // und istMinuten 60 legte damit eine Zwoelfstundenschicht an, die
      // als eine Stunde in der Datenbank steht — und die ArbZG-Pruefung
      // liefe auf einen frei waehlbaren Wert.
      const { supabase, db } = hole()
      await expect(createArbeitszeit(supabase, zeitParams({
        startZeit: '08:00', endZeit: '20:00', pauseMinuten: 0, istMinuten: 60,
      }))).rejects.toThrow(/passen nicht zu Beginn, Ende und Pause/)

      const { rows } = await db.query('SELECT id FROM personal_arbeitszeiten')
      expect(rows).toHaveLength(0)
    })

    it('nimmt einen passenden Ist-Minuten-Wert an, statt ihn zu verwerfen', async () => {
      // Die Oberflaeche rechnet dieselbe Formel und schickt das Ergebnis
      // mit. Es abzuweisen waere ebenso falsch wie es ungeprueft zu
      // uebernehmen.
      const zeit = await createArbeitszeit(hole().supabase, zeitParams({ istMinuten: 450 }))
      expect(Number(zeit.ist_minuten)).toBe(450)
    })

    it('weist eine unbekannte Quelle ab (kontrolliertes Vokabular)', async () => {
      await expect(createArbeitszeit(hole().supabase, zeitParams({ quelle: 'zuruf' })))
        .rejects.toThrow(/quelle/)
    })

    it('nimmt einen Nachtdienst ueber Mitternacht an (Ende vor Start ist erlaubt)', async () => {
      // Bewusst KEINE Ablehnung: 22:00–06:00 ist ein legitimer Dienst.
      const zeit = await createArbeitszeit(hole().supabase, zeitParams({
        startZeit: '22:00', endZeit: '06:00', pauseMinuten: 0, sollMinuten: 480,
      }))
      // 22:00–06:00 sind acht Stunden, nicht minus sechzehn: die
      // Herleitung der Ist-Minuten rechnet ueber Mitternacht.
      expect(Number(zeit.ist_minuten)).toBe(480)
      expect(zeit.start_zeit).toBe('22:00:00')
      expect(Number(zeit.ueberstunden_minuten)).toBe(0)
    })
  })

  describe(`Arbeitszeitgesetz — protokollieren statt blockieren (${fassung})`, () => {
    beforeEach(async () => { await leere(hole().db) })

    it('haelt eine Ueberschreitung der Tageshoechstarbeitszeit fest (§3 ArbZG)', async () => {
      // 08:00–19:30 abzueglich 30 min Pause = 660 min > 600 min.
      const { db } = hole()
      const id = await dienst(db, { end_zeit: '19:30' })

      const gefunden = await verstoesse(db, id)
      expect(gefunden).toHaveLength(1)
      expect(gefunden[0]).toMatchObject({
        verstoss_art: 'max_tagesarbeitszeit',
        gemessener_wert_minuten: 660,
        grenzwert_minuten: 600,
      })
    })

    it('blockiert den Dienst dabei NICHT — die PDL entscheidet, nicht der Trigger', async () => {
      const { db } = hole()
      const id = await dienst(db, { end_zeit: '19:30' })
      const { rows } = await db.query('SELECT id FROM dienstplan_eintraege WHERE id = $1', [id] as never[])
      expect(rows).toHaveLength(1)
    })

    it('rechnet die Pause heraus — 10h30 mit 45 min Pause bleiben unter der Grenze', async () => {
      const { db } = hole()
      const id = await dienst(db, { end_zeit: '18:30', pause_minuten: 45 })
      expect(await verstoesse(db, id)).toHaveLength(0)
    })

    it('haelt eine zu kurze Ruhezeit zum vorherigen Dienst fest (§5 ArbZG)', async () => {
      const { db } = hole()
      await dienst(db, { datum: '2026-09-07', start_zeit: '08:00', end_zeit: '16:00' })
      // Naechster Dienst am Folgetag um 02:00 → 10 Stunden Abstand.
      const id = await dienst(db, { datum: '2026-09-08', start_zeit: '02:00', end_zeit: '06:00' })

      const gefunden = await verstoesse(db, id)
      const ruhe = gefunden.find(g => g.verstoss_art === 'mindestruhezeit')
      expect(ruhe).toBeDefined()
      expect(Number(ruhe!.gemessener_wert_minuten)).toBe(600)
    })

    it('GEGENPROBE: 11 Stunden Abstand loesen keinen Verstoss aus', async () => {
      const { db } = hole()
      await dienst(db, { datum: '2026-09-07', start_zeit: '08:00', end_zeit: '16:00' })
      const id = await dienst(db, { datum: '2026-09-08', start_zeit: '03:00', end_zeit: '07:00' })
      expect(await verstoesse(db, id)).toHaveLength(0)
    })

    it('nimmt Bereitschaft und Notdienst aus (§7 ArbZG, abweichende Regeln)', async () => {
      const { db } = hole()
      const bereitschaft = await dienst(db, { end_zeit: '21:00', typ: 'bereitschaft' })
      const notdienst = await dienst(db, { start_zeit: '21:30', end_zeit: '09:00', typ: 'notdienst' })
      expect(await verstoesse(db, bereitschaft)).toHaveLength(0)
      expect(await verstoesse(db, notdienst)).toHaveLength(0)
    })

    it('raeumt den Verstoss weg, wenn der Dienst ausfaellt', async () => {
      const { db } = hole()
      const id = await dienst(db, { end_zeit: '19:30' })
      expect(await verstoesse(db, id)).toHaveLength(1)

      await db.query(`UPDATE dienstplan_eintraege SET status = 'ausgefallen' WHERE id = $1`, [id] as never[])
      expect(await verstoesse(db, id)).toHaveLength(0)
    })

    it('raeumt den Verstoss weg, wenn der Dienst auf ein zulaessiges Mass gekuerzt wird', async () => {
      const { db } = hole()
      const id = await dienst(db, { end_zeit: '19:30' })
      await db.query(`UPDATE dienstplan_eintraege SET end_zeit = '17:00' WHERE id = $1`, [id] as never[])
      expect(await verstoesse(db, id)).toHaveLength(0)
    })

    it('meldet einen verschaerften Verstoss erneut (die Quittung faellt zurueck)', async () => {
      const { db } = hole()
      const id = await dienst(db, { end_zeit: '19:30' })
      await db.query(
        `UPDATE arbeitszeit_verstoesse SET quittiert = true, quittiert_am = now() WHERE eintrag_id = $1`,
        [id] as never[],
      )

      await db.query(`UPDATE dienstplan_eintraege SET end_zeit = '21:00' WHERE id = $1`, [id] as never[])

      const { rows } = await db.query<{ quittiert: boolean; gemessener_wert_minuten: number }>(
        'SELECT quittiert, gemessener_wert_minuten FROM arbeitszeit_verstoesse WHERE eintrag_id = $1',
        [id] as never[],
      )
      expect(rows[0].quittiert).toBe(false)
      expect(Number(rows[0].gemessener_wert_minuten)).toBe(750)
    })

    it('haelt den Doppelbelegungs-Riegel daneben aufrecht (der blockiert sehr wohl)', async () => {
      // Wichtig fuer die Abgrenzung: das ArbZG-Protokoll ist bewusst
      // nachgiebig, der Doppelbelegungs-Schutz bewusst hart. Wer beide
      // verwechselt, baut den falschen Riegel um.
      const { db } = hole()
      await dienst(db, { start_zeit: '08:00', end_zeit: '12:00' })
      await expect(dienst(db, { start_zeit: '10:00', end_zeit: '14:00' }))
        .rejects.toThrow(/Doppelbelegung/)
    })
  })

  describe(`Auswertung (${fassung})`, () => {
    beforeEach(async () => { await leere(hole().db) })

    it('summiert Ist, Soll und Saldo je Mitarbeiter und Monat', async () => {
      const { supabase } = hole()
      await createArbeitszeit(supabase, zeitParams())
      await createArbeitszeit(supabase, zeitParams({
        // 08:00–16:00 abzueglich 80 min Pause = 400 min.
        datum: '2026-09-08', pauseMinuten: 80, sollMinuten: 420,
      }))

      const konto = await listArbeitszeitKonto(supabase, ORG, CG, 2026, 9)
      expect(konto).toHaveLength(1)
      expect(Number(konto[0].anzahl_eintraege)).toBe(2)
      expect(Number(konto[0].ist_minuten_gesamt)).toBe(850)
      expect(Number(konto[0].soll_minuten_gesamt)).toBe(840)
      expect(Number(konto[0].ueberstunden_gesamt)).toBe(10)
    })

    it('liefert einem fremden Mandanten weder Zeiten noch Konto', async () => {
      const { supabase } = hole()
      await createArbeitszeit(supabase, zeitParams())

      expect(await listArbeitszeiten(supabase, { organizationId: FREMD_ORG })).toHaveLength(0)
      expect(await listArbeitszeitKonto(supabase, FREMD_ORG)).toHaveLength(0)
    })

    it('filtert nach Zeitraum und Sperrkennzeichen', async () => {
      const { supabase } = hole()
      const eine = await createArbeitszeit(supabase, zeitParams())
      await createArbeitszeit(supabase, zeitParams({ datum: '2026-10-01' }))
      await updateArbeitszeit(supabase, eine.id, ORG, { gesperrt: true, benutzerId: PDL })

      const september = await listArbeitszeiten(supabase, {
        organizationId: ORG, datumVon: '2026-09-01', datumBis: '2026-09-30',
      })
      expect(september).toHaveLength(1)

      const gesperrte = await listArbeitszeiten(supabase, { organizationId: ORG, nurGesperrt: true })
      expect(gesperrte.map(z => z.id)).toEqual([eine.id])
    })

    it('weist eine Zeit aus einem fremden Mandanten als „nicht gefunden" ab', async () => {
      const { supabase } = hole()
      const zeit = await createArbeitszeit(supabase, zeitParams())
      await expect(updateArbeitszeit(supabase, zeit.id, FREMD_ORG, { pauseMinuten: 10, benutzerId: PDL }))
        .rejects.toThrow(/nicht gefunden/)
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════
// FASSUNG A — der heutige Live-Stand (Migration 20260829005500 NICHT da)
// ═══════════════════════════════════════════════════════════════════════

describe('Zeiterfassung gegen die LIVE-Fassung des Triggers', () => {
  let u: Umgebung
  beforeAll(async () => { u = await baueUmgebung(false) }, 180_000)

  gemeinsameKette(() => u, 'live')

  describe('BEFUND: die Korrektur ist live nicht durchfuehrbar', () => {
    beforeEach(async () => { await leere(u.db) })

    it('die Anwendung schreibt geaendert_von nicht, wenn die Spalte fehlt (42703-Rueckfall)', async () => {
      // Ohne diesen Rueckfall waere JEDE Erfassung heute kaputt — die
      // Migration ist nicht angewendet, die Spalte existiert nicht.
      // Genau das Muster aus dem Projekt-Gedaechtnis „Schema-Drift 42703".
      const zeit = await createArbeitszeit(u.supabase, zeitParams())
      expect(zeit.id).toBeTruthy()
      expect(Object.keys(await rohZeile(u.db, zeit.id))).not.toContain('geaendert_von')
    })

    it('meldet die fehlende Urheberschaft LESBAR statt als rohe Datenbankmeldung', async () => {
      // Vorher kam hier woertlich „null value in column korrigiert_von of
      // relation personal_zeitkorrekturen violates not-null constraint"
      // beim Nutzer an — samt Spalten- und Tabellennamen.
      const zeit = await createArbeitszeit(u.supabase, zeitParams())
      await expect(updateArbeitszeit(u.supabase, zeit.id, ORG, { pauseMinuten: 10, benutzerId: PDL }))
        .rejects.toThrow(/bearbeitende Benutzer fehlt/)
    })

    it('und aendert dabei nichts — die Zeit steht unveraendert da', async () => {
      const zeit = await createArbeitszeit(u.supabase, zeitParams())
      await expect(updateArbeitszeit(u.supabase, zeit.id, ORG, { pauseMinuten: 10, benutzerId: PDL }))
        .rejects.toThrow()
      expect(Number((await rohZeile(u.db, zeit.id)).ist_minuten)).toBe(450)
    })

    it('GEGENPROBE: eine Aenderung OHNE Zeitspalte laeuft auch live durch', async () => {
      // Ohne diese Gegenprobe waere „nichts geht mehr" ebenfalls gruen und
      // der Befund nicht auf die Zeitspalten eingegrenzt.
      const zeit = await createArbeitszeit(u.supabase, zeitParams())
      const nachher = await updateArbeitszeit(u.supabase, zeit.id, ORG, {
        bemerkung: 'nur ein Vermerk', benutzerId: PDL,
      })
      expect(nachher.bemerkung).toBe('nur ein Vermerk')
      expect(await korrekturen(u.db, zeit.id)).toHaveLength(0)
    })
  })

  describe('BEFUND I-6: die Sperre haengt live allein am TypeScript-Guard', () => {
    beforeEach(async () => { await leere(u.db) })

    async function gesperrteZeit() {
      const zeit = await createArbeitszeit(u.supabase, zeitParams())
      await updateArbeitszeit(u.supabase, zeit.id, ORG, { gesperrt: true, benutzerId: PDL })
      return zeit.id
    }

    it('der DB-Riegel greift, solange gesperrt=true stehen bleibt', async () => {
      const id = await gesperrteZeit()
      await expect(u.db.query(
        `UPDATE personal_arbeitszeiten SET ist_minuten = 999 WHERE id = $1`, [id] as never[],
      )).rejects.toThrow(/Gesperrte Arbeitszeit/)
    })

    it('BEFUND: mit gesperrt=false im selben UPDATE laeuft er ins Leere', async () => {
      // Die Bedingung des Live-Triggers lautet OLD.gesperrt AND NEW.gesperrt.
      // Wer `gesperrt = false` anhaengt, faellt aus ihr heraus.
      //
      // Geaendert wird hier `status` und `bestaetigt_von` — beides
      // Nachweisfelder im Sinne von NACHWEIS_FELDER, aber KEINE Felder, die
      // der Live-Trigger protokolliert. Genau deshalb zeigen sie die Luecke
      // sauber: bei einer Zeitspalte scheiterte das UPDATE zufaellig an
      // BEFUND 1 (korrigiert_von NOT NULL) — an einem Riegel also, der
      // etwas ganz anderes bewacht. Ein Schutz, der nur aus Versehen haelt,
      // ist kein Schutz.
      const id = await gesperrteZeit()
      await u.db.query(
        `UPDATE personal_arbeitszeiten SET status = 'erfasst', bestaetigt_von = NULL, gesperrt = false WHERE id = $1`,
        [id] as never[],
      )
      const zeile = await rohZeile(u.db, id)
      expect(zeile.status).toBe('erfasst')   // der Trigger hat NICHT gegriffen
      expect(zeile.gesperrt).toBe(false)
    })

    it('ZWEITER BEFUND: eine korrigierte Zeit laesst sich nicht mehr loeschen', async () => {
      // prevent_zeitkorrektur_edit() wirft auch im Kaskadenfall — dasselbe
      // Muster, das 20260919010000 fuer akten_dokument_versionen bereits
      // behoben hat. Hier zaehlt der Nachweis, dass es diese Tabelle
      // ebenfalls trifft; live geht das nicht auf, weil ueberhaupt keine
      // Korrektur zustande kommt (BEFUND 1).
      const zeit = await createArbeitszeit(u.supabase, zeitParams())
      // Korrektureintrag am Trigger vorbei setzen — live entstuende er
      // durch updateArbeitszeit(), was hier an BEFUND 1 scheitert.
      await u.db.query(
        `INSERT INTO personal_zeitkorrekturen
           (organization_id, arbeitszeit_id, caregiver_id, feld, alter_wert, neuer_wert, grund, korrigiert_von)
         VALUES ($1, $2, $3, 'ist_minuten', '450', '470', 'Nachtrag', $4)`,
        [ORG, zeit.id, CG, PDL] as never[],
      )

      await expect(u.db.query(
        'DELETE FROM personal_arbeitszeiten WHERE id = $1', [zeit.id] as never[],
      )).rejects.toThrow(/unver/i)
    })

    it('GEGENPROBE: dieselbe Absicht durch updateArbeitszeit() wird abgewiesen', async () => {
      // Hier steht die einzige Schranke, die heute wirklich haelt: der
      // Anwendungscode liest den Bestand VOR dem Schreiben und entscheidet.
      const id = await gesperrteZeit()
      await expect(updateArbeitszeit(u.supabase, id, ORG, {
        istMinuten: 999, gesperrt: false, benutzerId: PDL,
      })).rejects.toThrow(/Gesperrte Arbeitszeit/)

      const zeile = await rohZeile(u.db, id)
      expect(Number(zeile.ist_minuten)).toBe(450)   // Bestand unveraendert
      expect(zeile.gesperrt).toBe(true)             // und immer noch gesperrt
    })

    it('laesst reines Entsperren zu — sonst waere eine Zeit fuer immer eingefroren', async () => {
      const id = await gesperrteZeit()
      const nachher = await updateArbeitszeit(u.supabase, id, ORG, {
        gesperrt: false, bemerkung: 'Entsperrt zur Korrektur', benutzerId: PDL,
      })
      expect(nachher.gesperrt).toBe(false)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// FASSUNG B — mit Migration 20260829005500 (der Zielzustand)
// ═══════════════════════════════════════════════════════════════════════

describe('Zeiterfassung mit Migration 20260829005500', () => {
  let u: Umgebung
  beforeAll(async () => { u = await baueUmgebung(true) }, 180_000)

  gemeinsameKette(() => u, 'mit Migration')

  describe('Korrektur schreibt ein unveraenderliches Protokoll — mit Urheber', () => {
    beforeEach(async () => { await leere(u.db) })

    it('haelt jede geaenderte Zeitspalte einzeln fest, mit altem und neuem Wert', async () => {
      const zeit = await createArbeitszeit(u.supabase, zeitParams())
      await updateArbeitszeit(u.supabase, zeit.id, ORG, {
        endZeit: '17:00', istMinuten: 510, bemerkung: 'Einsatz verlaengert', benutzerId: PDL,
      })

      const eintraege = await korrekturen(u.db, zeit.id)
      expect(eintraege.map(e => e.feld)).toEqual(['end_zeit', 'ist_minuten'])
      expect(eintraege[0]).toMatchObject({ alter_wert: '16:00:00', neuer_wert: '17:00:00' })
      expect(eintraege[1]).toMatchObject({ alter_wert: '450', neuer_wert: '510' })
    })

    it('traegt den handelnden Benutzer ein — nicht NULL, nicht den Mitarbeiter', async () => {
      // Der Kern der Migration: `korrigiert_von` kommt aus
      // COALESCE(auth.uid(), NEW.geaendert_von). Unter dem Dienstschluessel
      // ist der erste Teil NULL, der zweite traegt.
      const zeit = await createArbeitszeit(u.supabase, zeitParams())
      await updateArbeitszeit(u.supabase, zeit.id, ORG, { pauseMinuten: 10, benutzerId: PDL })

      // Zwei Eintraege, nicht einer: `ist_minuten` laesst sich seit
      // GAP-13 nicht mehr fuer sich aendern — es haengt an Beginn, Ende
      // und Pause. Wer die Pause korrigiert, korrigiert zwangslaeufig
      // auch die Arbeitszeit, und beides gehoert ins Protokoll.
      const eintraege = await korrekturen(u.db, zeit.id)
      expect(eintraege.map(e => e.feld)).toEqual(['ist_minuten', 'pause_minuten'])
      expect(eintraege.every(e => e.korrigiert_von === PDL)).toBe(true)
    })

    it('uebernimmt die Bemerkung als Korrekturgrund', async () => {
      const zeit = await createArbeitszeit(u.supabase, zeitParams())
      await updateArbeitszeit(u.supabase, zeit.id, ORG, {
        pauseMinuten: 80, bemerkung: 'Tippfehler', benutzerId: PDL,
      })
      expect((await korrekturen(u.db, zeit.id))[0].grund).toBe('Tippfehler')
    })

    it('FAIL-CLOSED: ohne Urheber wird nicht protokolliert — und nicht geaendert', async () => {
      // Ein Revisionsprotokoll ohne Urheber waere schlimmer als keins: es
      // saehe vollstaendig aus. Deshalb bricht der Trigger mit Klartext ab.
      const zeit = await createArbeitszeit(u.supabase, zeitParams())
      await expect(updateArbeitszeit(u.supabase, zeit.id, ORG, { pauseMinuten: 10 }))
        .rejects.toThrow(/bearbeitende Benutzer fehlt/)

      expect(Number((await rohZeile(u.db, zeit.id)).ist_minuten)).toBe(450)
      expect(await korrekturen(u.db, zeit.id)).toHaveLength(0)
    })

    it('hebt den Status auf „korrigiert", wenn die Zeit schon bestaetigt war', async () => {
      const zeit = await createArbeitszeit(u.supabase, zeitParams())
      await updateArbeitszeit(u.supabase, zeit.id, ORG, { status: 'bestaetigt', benutzerId: PDL })
      const nachher = await updateArbeitszeit(u.supabase, zeit.id, ORG, { pauseMinuten: 10, benutzerId: PDL })

      expect(nachher.status).toBe('korrigiert')
    })

    it('GEGENPROBE: eine frisch erfasste Zeit bleibt bei „erfasst"', async () => {
      // Ohne diese Gegenprobe waere „alles wird korrigiert" ebenfalls gruen.
      const zeit = await createArbeitszeit(u.supabase, zeitParams())
      const nachher = await updateArbeitszeit(u.supabase, zeit.id, ORG, { pauseMinuten: 10, benutzerId: PDL })
      expect(nachher.status).toBe('erfasst')
    })

    it('schreibt kein Protokoll, wenn sich keine Zeitspalte aendert', async () => {
      const zeit = await createArbeitszeit(u.supabase, zeitParams())
      await updateArbeitszeit(u.supabase, zeit.id, ORG, { bemerkung: 'nur ein Vermerk', benutzerId: PDL })
      expect(await korrekturen(u.db, zeit.id)).toHaveLength(0)
    })

    it('laesst das Korrekturprotokoll weder aendern noch loeschen (Revisionssicherheit)', async () => {
      const zeit = await createArbeitszeit(u.supabase, zeitParams())
      await updateArbeitszeit(u.supabase, zeit.id, ORG, { pauseMinuten: 10, benutzerId: PDL })

      await expect(u.db.exec(`UPDATE personal_zeitkorrekturen SET neuer_wert = '999'`))
        .rejects.toThrow(/unver/i)
      await expect(u.db.exec(`DELETE FROM personal_zeitkorrekturen`))
        .rejects.toThrow(/unver/i)
    })
  })

  describe('Befund I-6 geschlossen: die Sperre haelt jetzt in der Datenbank', () => {
    beforeEach(async () => { await leere(u.db) })

    async function gesperrteZeit() {
      const zeit = await createArbeitszeit(u.supabase, zeitParams())
      await updateArbeitszeit(u.supabase, zeit.id, ORG, { status: 'bestaetigt', benutzerId: PDL })
      await updateArbeitszeit(u.supabase, zeit.id, ORG, { gesperrt: true, benutzerId: PDL })
      return zeit.id
    }

    it('sperrt eine bestaetigte Zeit', async () => {
      const id = await gesperrteZeit()
      expect((await rohZeile(u.db, id)).gesperrt).toBe(true)
    })

    it('blockt ein UPDATE, das gesperrt=true stehen laesst', async () => {
      const id = await gesperrteZeit()
      await expect(u.db.query(
        `UPDATE personal_arbeitszeiten SET ist_minuten = 999 WHERE id = $1`, [id] as never[],
      )).rejects.toThrow(/Gesperrte Arbeitszeit/)
    })

    it('blockt jetzt AUCH das UPDATE mit gesperrt=false im selben Zug', async () => {
      // Das ist der Unterschied zur Live-Fassung: die Sperre haengt an der
      // ABSICHT (aendert sich ein Nachweisfeld?), nicht am Endzustand.
      const id = await gesperrteZeit()
      await expect(u.db.query(
        `UPDATE personal_arbeitszeiten SET ist_minuten = 999, gesperrt = false WHERE id = $1`,
        [id] as never[],
      )).rejects.toThrow(/Gesperrte Arbeitszeit/)

      const zeile = await rohZeile(u.db, id)
      expect(Number(zeile.ist_minuten)).toBe(450)
      expect(zeile.gesperrt).toBe(true)
    })

    it('blockt auch eine Statusaenderung an der gesperrten Zeit', async () => {
      const id = await gesperrteZeit()
      await expect(u.db.query(
        `UPDATE personal_arbeitszeiten SET status = 'erfasst', gesperrt = false WHERE id = $1`,
        [id] as never[],
      )).rejects.toThrow(/Gesperrte Arbeitszeit/)
    })

    it('laesst reines Entsperren weiterhin zu — auch direkt per SQL', async () => {
      // Die Gegenprobe zur Verschaerfung: waere hier alles gesperrt, waere
      // eine einmal gesperrte Zeit fuer immer eingefroren.
      const id = await gesperrteZeit()
      await u.db.query(
        `UPDATE personal_arbeitszeiten SET gesperrt = false, bemerkung = 'Freigabe PDL' WHERE id = $1`,
        [id] as never[],
      )
      expect((await rohZeile(u.db, id)).gesperrt).toBe(false)
    })

    it('erlaubt nach dem Entsperren die Korrektur — mit Protokolleintrag', async () => {
      const id = await gesperrteZeit()
      await updateArbeitszeit(u.supabase, id, ORG, { gesperrt: false, benutzerId: PDL })
      await updateArbeitszeit(u.supabase, id, ORG, { pauseMinuten: 10, bemerkung: 'Nachtrag', benutzerId: PDL })

      expect(Number((await rohZeile(u.db, id)).ist_minuten)).toBe(470)
      expect((await korrekturen(u.db, id)).map(k => k.feld)).toContain('ist_minuten')
    })

    it('weist die Aenderung ueber updateArbeitszeit() unveraendert ab (Guard bleibt)', async () => {
      // Der TypeScript-Guard wird durch die Migration NICHT ueberfluessig:
      // er liefert die lesbare 409 statt einer Datenbankausnahme.
      const id = await gesperrteZeit()
      await expect(updateArbeitszeit(u.supabase, id, ORG, { istMinuten: 999, benutzerId: PDL }))
        .rejects.toThrow(/Gesperrte Arbeitszeit/)
    })
  })
})
