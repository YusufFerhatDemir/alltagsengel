/**
 * E2E: Pflegedienstleitung — Wochenübersicht, ArbZG-Entscheidung, Freigabe
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Die COMPLETION-MATRIX fuehrt die Pflegedienstleitung als Modul 3 und
 * vermerkt in der Spalte „Mock/Stub?" ausdruecklich:
 *
 *   „**kein eigenes Modul** — nur Kennzahlen-Cockpit ueber fremde Tabellen"
 *
 * Befund I-12 nennt dasselbe. Vorhanden war `lib/analytics/pdl-cockpit.ts`:
 * eine Lesesicht auf Leistungen, Umsatz, Personal, Klienten, Budgets. Die
 * PDL konnte damit SEHEN, aber nichts ENTSCHEIDEN.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DIE ENTSCHEIDUNG, DIE ES NICHT GAB (Befund, live nachgeprueft)
 * ─────────────────────────────────────────────────────────────────────
 * `20260920060000_arbeitszeit_verstoesse.sql` haelt in ihrem Kopf fest,
 * der ArbZG-Trigger blockiere BEWUSST nicht:
 *
 *   „Stattdessen wird der Verstoss protokolliert und im Fristen-Dashboard
 *    sichtbar gemacht — **PDL entscheidet**."
 *
 * Die zweite Haelfte dieses Satzes gab es nicht. Im ganzen Repo liest
 * genau EINE Stelle die Tabelle — `lib/automation/fristen-sammler.ts`,
 * Abschnitt 8 — und die zeigt Verstoesse nur an. Es existierte kein
 * einziger Schreibweg auf `quittiert`: der Eintrag konnte die Liste nie
 * verlassen, egal wie die PDL entschied. Ein Riegel, der bewusst auf eine
 * Entscheidung wartet, die niemand treffen kann, ist kein Riegel.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WAS NUR EINE ECHTE DATENBANK BEANTWORTET
 * ─────────────────────────────────────────────────────────────────────
 *   • `arbzg_pruefung` schreibt die Verstoesse ueberhaupt erst — ohne
 *     echten Trigger gaebe es nichts zu entscheiden, und die ganze
 *     Fail-Closed-Pruefung der Freigabe liefe leer
 *   • `dienstplan_freigaben_montag` (CHECK auf ISODOW) — eine Freigabe auf
 *     einen Mittwoch waere eine Woche, die es nicht gibt
 *   • `dienstplan_freigaben_woche_unique` — zwei Saetze waeren zwei
 *     Wahrheiten ueber dieselben Tage
 *   • `pruefe_dienstplan_freigabe` — der eigentliche Riegel, samt der
 *     Feinheit, dass ein einmal gesetzter Grund nicht die naechste
 *     Aenderung mit abdeckt
 *
 * ─────────────────────────────────────────────────────────────────────
 * ZWEI SCHEMAFASSUNGEN
 * ─────────────────────────────────────────────────────────────────────
 * Migration 20260829005700 ist eingecheckt und NICHT angewendet. Die
 * Suite prueft deshalb beides: dass die Anwendung heute weiterlaeuft
 * (42703-Rueckfall) und dass der Riegel mit der Migration greift.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  baueKettenSchema,
  bauePersonalTabellen,
  wendeDienstplanFreigabeMigrationAn,
} from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

import {
  wochenStart,
  wochenEnde,
  ladeWochenUebersicht,
  quittiereVerstoss,
  gibWocheFrei,
  ziehefreigabeZurueck,
  getFreigabe,
  listFreigaben,
  istWocheFreigegeben,
} from '@/lib/pdl/dienstplanfreigabe'
import { createEintrag, updateEintrag, deleteEintrag } from '@/lib/personal/dienstplan'

const ORG       = 'aaaaaaaa-0000-4000-8000-000000000030'
const FREMD_ORG = 'bbbbbbbb-0000-4000-8000-000000000030'
const KRAFT_A   = 'cccccccc-0000-4000-8000-000000000030'
const KRAFT_B   = 'cccccccc-0000-4000-8000-000000000031'
const PDL       = 'dddddddd-0000-4000-8000-000000000030'

/** Eine feste Woche: Montag 2026-09-07 bis Sonntag 2026-09-13. */
const MONTAG   = '2026-09-07'
const DIENSTAG = '2026-09-08'
const SONNTAG  = '2026-09-13'
/** Die Folgewoche — fuer die Abgrenzung. */
const MONTAG_2 = '2026-09-14'

interface Umgebung { db: PGlite; supabase: SupabaseClient }

async function baueUmgebung(mitMigration: boolean): Promise<Umgebung> {
  const db = await baueKettenSchema()
  await bauePersonalTabellen(db)
  if (mitMigration) await wendeDienstplanFreigabeMigrationAn(db)

  await db.exec(`
    INSERT INTO organizations (id, name, bundesland, status) VALUES
      ('${ORG}',       'Alltagsengel Pruefbetrieb', 'Hessen', 'active'),
      ('${FREMD_ORG}', 'Fremder Pflegedienst',      'Hessen', 'active');

    INSERT INTO auth.users (id, email) VALUES ('${PDL}', 'pdl@example.org');

    INSERT INTO caregivers (id, organization_id, first_name, last_name, initials, wochenstunden_soll) VALUES
      ('${KRAFT_A}', '${ORG}', 'Nadine', 'Vollzeit',  'NV', 40),
      ('${KRAFT_B}', '${ORG}', 'Selim',  'Teilzeit',  'ST', 20);
  `)

  return { db, supabase: macheSupabaseClient(db) as unknown as SupabaseClient }
}

async function leere(db: PGlite): Promise<void> {
  // Die Freigaben ZUERST — solange eine Woche freigegeben ist, weist der
  // Trigger das Loeschen ihrer Dienste ab. Genau das ist sein Zweck; die
  // Reihenfolge hier ist also kein Kniff, sondern die Folge davon.
  // Die Tabelle gibt es nur in der Fassung mit Migration.
  await db.exec(`
    DO $$ BEGIN
      IF to_regclass('public.dienstplan_freigaben') IS NOT NULL THEN
        DELETE FROM public.dienstplan_freigaben;
      END IF;
    END $$;
  `)
  await db.exec(`
    DELETE FROM arbeitszeit_verstoesse;
    DELETE FROM dienstplan_eintraege;
    DELETE FROM absences;
  `)
}

/** Ein Dienst ueber die ECHTE Anwendungsfunktion. */
function dienstParams(ueber: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    datum: MONTAG,
    caregiverId: KRAFT_A,
    startZeit: '08:00',
    endZeit: '16:00',
    pauseMinuten: 30,
    erstelltVon: PDL,
    ...ueber,
  } as Parameters<typeof createEintrag>[1]
}

// ═══════════════════════════════════════════════════════════════════════
describe('Wochenrechnung', () => {
  it('findet zu jedem Tag denselben Montag', () => {
    for (const tag of [MONTAG, DIENSTAG, '2026-09-10', SONNTAG]) {
      expect(wochenStart(tag)).toBe(MONTAG)
    }
    expect(wochenEnde(DIENSTAG)).toBe(SONNTAG)
  })

  it('trennt die Folgewoche sauber ab', () => {
    // Der Sonntag gehoert noch zur alten Woche, der Montag danach nicht
    // mehr. Wer hier die US-Zaehlung (Woche ab Sonntag) nimmt, verschiebt
    // jede Freigabe um einen Tag.
    expect(wochenStart(SONNTAG)).toBe(MONTAG)
    expect(wochenStart(MONTAG_2)).toBe(MONTAG_2)
  })

  it('weist ein unbrauchbares Datum ab', () => {
    expect(() => wochenStart('irgendwann')).toThrow(/gültiges Datum/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Wochenuebersicht — die Auslastung', () => {
  let u: Umgebung
  beforeAll(async () => { u = await baueUmgebung(true) }, 180_000)
  beforeEach(async () => { await leere(u.db) })

  it('zaehlt Dienste und geplante Minuten je Kraft', async () => {
    await createEintrag(u.supabase, dienstParams())                                    // 450 min
    await createEintrag(u.supabase, dienstParams({ datum: DIENSTAG }))                 // 450 min
    await createEintrag(u.supabase, dienstParams({ caregiverId: KRAFT_B, startZeit: '17:00', endZeit: '21:00', pauseMinuten: 0 }))

    const w = await ladeWochenUebersicht(u.supabase, ORG, DIENSTAG)

    expect(w.wocheStart).toBe(MONTAG)
    expect(w.wocheEnde).toBe(SONNTAG)
    expect(w.diensteGesamt).toBe(3)
    expect(w.geplanteMinuten).toBe(450 + 450 + 240)

    const a = w.auslastung.find(z => z.caregiverId === KRAFT_A)!
    expect(a.dienste).toBe(2)
    expect(a.geplanteMinuten).toBe(900)
    expect(a.sollMinuten).toBe(2400)          // 40 h
    expect(a.abweichungMinuten).toBe(-1500)   // deutlich unter Soll
  })

  it('rechnet einen Nachtdienst ueber Mitternacht richtig', async () => {
    // Naive Subtraktion ergaebe hier minus 16 Stunden und eine Auslastung,
    // die nach unten luegt.
    await createEintrag(u.supabase, dienstParams({
      startZeit: '22:00', endZeit: '06:00', pauseMinuten: 0,
    }))
    const w = await ladeWochenUebersicht(u.supabase, ORG, MONTAG)
    expect(w.geplanteMinuten).toBe(480)
  })

  it('zaehlt einen ausgefallenen Dienst NICHT als geplante Arbeit', async () => {
    const dienst = await createEintrag(u.supabase, dienstParams())
    await updateEintrag(u.supabase, dienst.id, ORG, { status: 'ausgefallen' })

    const w = await ladeWochenUebersicht(u.supabase, ORG, MONTAG)
    expect(w.diensteGesamt).toBe(0)
    expect(w.geplanteMinuten).toBe(0)
  })

  it('weist unbesetzte Dienste gesondert aus', async () => {
    await createEintrag(u.supabase, dienstParams({ caregiverId: null }))
    await createEintrag(u.supabase, dienstParams({ datum: DIENSTAG }))

    const w = await ladeWochenUebersicht(u.supabase, ORG, MONTAG)
    expect(w.diensteGesamt).toBe(2)
    expect(w.diensteUnbesetzt).toBe(1)
    // Die unbesetzte Stunde zaehlt zur Wochenlast, aber zu niemandes Konto.
    expect(w.auslastung).toHaveLength(1)
  })

  it('nimmt die Folgewoche nicht mit auf', async () => {
    await createEintrag(u.supabase, dienstParams())
    await createEintrag(u.supabase, dienstParams({ datum: MONTAG_2 }))

    expect((await ladeWochenUebersicht(u.supabase, ORG, MONTAG)).diensteGesamt).toBe(1)
    expect((await ladeWochenUebersicht(u.supabase, ORG, MONTAG_2)).diensteGesamt).toBe(1)
  })

  it('zaehlt Abwesenheiten, die in die Woche hineinragen', async () => {
    await u.db.query(
      `INSERT INTO absences (organization_id, caregiver_id, absence_type, start_date, end_date, status)
       VALUES ($1, $2, 'vacation', '2026-09-05', '2026-09-09', 'genehmigt')`,
      [ORG, KRAFT_B] as never[],
    )
    const w = await ladeWochenUebersicht(u.supabase, ORG, MONTAG)
    expect(w.abwesenheiten).toBe(1)
  })

  it('liefert einem fremden Mandanten eine leere Woche', async () => {
    await createEintrag(u.supabase, dienstParams())
    const w = await ladeWochenUebersicht(u.supabase, FREMD_ORG, MONTAG)
    expect(w.diensteGesamt).toBe(0)
    expect(w.auslastung).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('ArbZG — die Entscheidung, die es nicht gab', () => {
  let u: Umgebung
  beforeAll(async () => { u = await baueUmgebung(true) }, 180_000)
  beforeEach(async () => { await leere(u.db) })

  /** Ein Dienst, der die Tageshoechstarbeitszeit reisst (11 h netto). */
  async function ueberlangerDienst() {
    return createEintrag(u.supabase, dienstParams({ endZeit: '19:30' }))
  }

  it('der Trigger schreibt den Verstoss — und blockiert den Dienst nicht', async () => {
    const dienst = await ueberlangerDienst()
    const w = await ladeWochenUebersicht(u.supabase, ORG, MONTAG)

    expect(w.diensteGesamt).toBe(1)                 // der Dienst steht
    expect(w.offeneVerstoesse).toHaveLength(1)
    expect(w.offeneVerstoesse[0]).toMatchObject({
      art: 'max_tagesarbeitszeit', gemessen: 660, grenzwert: 600,
    })
    expect(w.offeneVerstoesse[0].id).toBeTruthy()
    expect(dienst.id).toBeTruthy()
  })

  it('quittiert einen Verstoss mit Begruendung — und nimmt ihn aus der Liste', async () => {
    await ueberlangerDienst()
    const [verstoss] = (await ladeWochenUebersicht(u.supabase, ORG, MONTAG)).offeneVerstoesse

    await quittiereVerstoss(u.supabase, verstoss.id, ORG, PDL, 'Einmaliger Ausfallersatz, Ruhezeit am Folgetag verlaengert.')

    const w = await ladeWochenUebersicht(u.supabase, ORG, MONTAG)
    expect(w.offeneVerstoesse).toHaveLength(0)

    const { rows } = await u.db.query<{ quittiert: boolean; quittiert_von: string; bemerkung: string }>(
      'SELECT quittiert, quittiert_von, bemerkung FROM arbeitszeit_verstoesse WHERE id = $1',
      [verstoss.id] as never[],
    )
    expect(rows[0].quittiert).toBe(true)
    expect(rows[0].quittiert_von).toBe(PDL)
    expect(rows[0].bemerkung).toMatch(/Ausfallersatz/)
  })

  it('FAIL-CLOSED: ohne Begruendung wird nicht quittiert', async () => {
    // Der Trigger ist bewusst nachgiebig, damit ein Notfall die Planung
    // nicht lahmlegt. Genau deshalb muss die Entscheidung begruendet sein
    // — sonst ist die Nachgiebigkeit eine Hintertuer statt eines Ermessens.
    await ueberlangerDienst()
    const [verstoss] = (await ladeWochenUebersicht(u.supabase, ORG, MONTAG)).offeneVerstoesse

    await expect(quittiereVerstoss(u.supabase, verstoss.id, ORG, PDL, '   '))
      .rejects.toThrow(/Begründung/)
    expect((await ladeWochenUebersicht(u.supabase, ORG, MONTAG)).offeneVerstoesse).toHaveLength(1)
  })

  it('quittiert nicht zweimal (CAS)', async () => {
    await ueberlangerDienst()
    const [verstoss] = (await ladeWochenUebersicht(u.supabase, ORG, MONTAG)).offeneVerstoesse
    await quittiereVerstoss(u.supabase, verstoss.id, ORG, PDL, 'Erste Entscheidung.')

    await expect(quittiereVerstoss(u.supabase, verstoss.id, ORG, PDL, 'Zweite Entscheidung.'))
      .rejects.toThrow(/bereits quittiert/)

    const { rows } = await u.db.query<{ bemerkung: string }>(
      'SELECT bemerkung FROM arbeitszeit_verstoesse WHERE id = $1', [verstoss.id] as never[],
    )
    expect(rows[0].bemerkung).toBe('Erste Entscheidung.')   // die erste gilt
  })

  it('quittiert keinen Verstoss eines fremden Mandanten', async () => {
    await ueberlangerDienst()
    const [verstoss] = (await ladeWochenUebersicht(u.supabase, ORG, MONTAG)).offeneVerstoesse
    await expect(quittiereVerstoss(u.supabase, verstoss.id, FREMD_ORG, PDL, 'Fremdzugriff.'))
      .rejects.toThrow(/nicht gefunden/)
  })

  it('meldet einen verschaerften Verstoss erneut — die Quittung faellt zurueck', async () => {
    // Sonst deckte eine einmalige Entscheidung jede spaetere Verschaerfung
    // desselben Dienstes mit ab.
    const dienst = await ueberlangerDienst()
    const [verstoss] = (await ladeWochenUebersicht(u.supabase, ORG, MONTAG)).offeneVerstoesse
    await quittiereVerstoss(u.supabase, verstoss.id, ORG, PDL, 'Vertretbar.')

    await updateEintrag(u.supabase, dienst.id, ORG, { endZeit: '21:00' })

    expect((await ladeWochenUebersicht(u.supabase, ORG, MONTAG)).offeneVerstoesse).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Freigabe der Woche', () => {
  let u: Umgebung
  beforeAll(async () => { u = await baueUmgebung(true) }, 180_000)
  beforeEach(async () => { await leere(u.db) })

  it('gibt eine saubere Woche frei und haelt den Stand fest', async () => {
    await createEintrag(u.supabase, dienstParams())
    await createEintrag(u.supabase, dienstParams({ datum: DIENSTAG }))

    const freigabe = await gibWocheFrei(u.supabase, ORG, DIENSTAG, PDL, { hinweis: 'Regelwoche.' })

    expect(freigabe.status).toBe('freigegeben')
    expect(freigabe.woche_start).toBe(MONTAG)
    expect(freigabe.freigegeben_von).toBe(PDL)
    // Der Stand wird MITGESCHRIEBEN: die PDL hat auf diese Zahlen hin
    // freigegeben, und eine Woche spaeter sieht die Abfrage anders aus.
    expect(freigabe.dienste_gesamt).toBe(2)
    expect(freigabe.dienste_unbesetzt).toBe(0)
    expect(await istWocheFreigegeben(u.supabase, ORG, SONNTAG)).toBe(true)
  })

  it('DER DB-RIEGEL: woche_start muss ein Montag sein', async () => {
    // Ein Freigabesatz auf einen Mittwoch waere eine Woche, die es nicht
    // gibt — und zwei ueberlappende Freigaben derselben Tage.
    await expect(u.db.query(
      `INSERT INTO dienstplan_freigaben (organization_id, woche_start, freigegeben_von)
       VALUES ($1, '2026-09-09', $2)`,
      [ORG, PDL] as never[],
    )).rejects.toThrow(/dienstplan_freigaben_montag/)
  })

  it('DER DB-RIEGEL: je Woche nur eine Freigabe', async () => {
    await createEintrag(u.supabase, dienstParams())
    await gibWocheFrei(u.supabase, ORG, MONTAG, PDL)

    await expect(u.db.query(
      `INSERT INTO dienstplan_freigaben (organization_id, woche_start, freigegeben_von)
       VALUES ($1, $2, $3)`,
      [ORG, MONTAG, PDL] as never[],
    )).rejects.toThrow(/dienstplan_freigaben_woche_unique|duplicate key/i)
  })

  it('FAIL-CLOSED: gibt eine Woche mit offenem ArbZG-Verstoss nicht frei', async () => {
    await createEintrag(u.supabase, dienstParams({ endZeit: '19:30' }))

    await expect(gibWocheFrei(u.supabase, ORG, MONTAG, PDL))
      .rejects.toThrow(/Arbeitszeitgesetz/)
    expect(await getFreigabe(u.supabase, ORG, MONTAG)).toBeNull()
  })

  it('GEGENPROBE: nach der Quittierung geht dieselbe Woche durch', async () => {
    // Ohne sie waere „gibt nie frei" ebenfalls gruen — und die Pruefung
    // kein Ermessen, sondern eine Sackgasse.
    await createEintrag(u.supabase, dienstParams({ endZeit: '19:30' }))
    const [verstoss] = (await ladeWochenUebersicht(u.supabase, ORG, MONTAG)).offeneVerstoesse
    await quittiereVerstoss(u.supabase, verstoss.id, ORG, PDL, 'Ausfallersatz, einmalig.')

    const freigabe = await gibWocheFrei(u.supabase, ORG, MONTAG, PDL)
    expect(freigabe.status).toBe('freigegeben')
    expect(freigabe.verstoesse_quittiert).toBe(1)
  })

  it('haelt bei unbesetzten Diensten an — laesst sich aber ausdruecklich uebergehen', async () => {
    await createEintrag(u.supabase, dienstParams({ caregiverId: null }))

    await expect(gibWocheFrei(u.supabase, ORG, MONTAG, PDL))
      .rejects.toThrow(/nicht besetzt/)

    const freigabe = await gibWocheFrei(u.supabase, ORG, MONTAG, PDL, { trotzLuecken: true })
    expect(freigabe.dienste_unbesetzt).toBe(1)
  })

  it('gibt eine leere Woche nicht frei', async () => {
    await expect(gibWocheFrei(u.supabase, ORG, MONTAG, PDL))
      .rejects.toThrow(/ohne geplante Dienste/)
  })

  it('gibt dieselbe Woche nicht zweimal frei', async () => {
    await createEintrag(u.supabase, dienstParams())
    await gibWocheFrei(u.supabase, ORG, MONTAG, PDL)
    await expect(gibWocheFrei(u.supabase, ORG, MONTAG, PDL)).rejects.toThrow(/bereits freigegeben/)
  })

  it('zieht die Freigabe mit Grund zurueck — und loescht sie nicht', async () => {
    await createEintrag(u.supabase, dienstParams())
    await gibWocheFrei(u.supabase, ORG, MONTAG, PDL)

    await expect(ziehefreigabeZurueck(u.supabase, ORG, MONTAG, PDL, '  '))
      .rejects.toThrow(/Grund/)

    const zurueck = await ziehefreigabeZurueck(u.supabase, ORG, MONTAG, PDL, 'Krankheitswelle, Plan wird neu gebaut.')
    expect(zurueck.status).toBe('zurueckgezogen')
    expect(zurueck.zurueckziehungsgrund).toMatch(/Krankheitswelle/)
    // Die Zeile bleibt: sonst waere „zurueckgezogen" von „nie
    // freigegeben" nicht zu unterscheiden.
    expect(await getFreigabe(u.supabase, ORG, MONTAG)).not.toBeNull()
    expect(await istWocheFreigegeben(u.supabase, ORG, MONTAG)).toBe(false)
  })

  it('zieht nicht zweimal zurueck und nicht ohne Freigabe', async () => {
    await expect(ziehefreigabeZurueck(u.supabase, ORG, MONTAG, PDL, 'Grund'))
      .rejects.toThrow(/keine Freigabe/)

    await createEintrag(u.supabase, dienstParams())
    await gibWocheFrei(u.supabase, ORG, MONTAG, PDL)
    await ziehefreigabeZurueck(u.supabase, ORG, MONTAG, PDL, 'Erster Rueckzug.')
    await expect(ziehefreigabeZurueck(u.supabase, ORG, MONTAG, PDL, 'Zweiter.'))
      .rejects.toThrow(/bereits zurückgezogen/)
  })

  it('gibt eine zurueckgezogene Woche erneut frei — ohne zweiten Satz', async () => {
    await createEintrag(u.supabase, dienstParams())
    await gibWocheFrei(u.supabase, ORG, MONTAG, PDL)
    await ziehefreigabeZurueck(u.supabase, ORG, MONTAG, PDL, 'Umplanung.')

    const erneut = await gibWocheFrei(u.supabase, ORG, MONTAG, PDL, { hinweis: 'Nach Umplanung.' })
    expect(erneut.status).toBe('freigegeben')
    expect(erneut.zurueckziehungsgrund).toBeNull()

    const { rows } = await u.db.query('SELECT id FROM dienstplan_freigaben WHERE woche_start = $1', [MONTAG] as never[])
    expect(rows).toHaveLength(1)
  })

  it('trennt die Mandanten', async () => {
    await createEintrag(u.supabase, dienstParams())
    await gibWocheFrei(u.supabase, ORG, MONTAG, PDL)

    expect(await getFreigabe(u.supabase, FREMD_ORG, MONTAG)).toBeNull()
    expect(await listFreigaben(u.supabase, FREMD_ORG)).toHaveLength(0)
    expect(await listFreigaben(u.supabase, ORG)).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Nach der Freigabe: keine stillen Aenderungen', () => {
  let u: Umgebung
  beforeAll(async () => { u = await baueUmgebung(true) }, 180_000)
  beforeEach(async () => { await leere(u.db) })

  async function freigegebeneWoche() {
    const dienst = await createEintrag(u.supabase, dienstParams())
    await gibWocheFrei(u.supabase, ORG, MONTAG, PDL)
    return dienst
  }

  it('weist eine Aenderung ohne Grund ab', async () => {
    const dienst = await freigegebeneWoche()
    await expect(updateEintrag(u.supabase, dienst.id, ORG, { endZeit: '17:00' }))
      .rejects.toThrow(/braucht einen Grund/)

    const { rows } = await u.db.query<{ end_zeit: string }>(
      'SELECT end_zeit FROM dienstplan_eintraege WHERE id = $1', [dienst.id] as never[],
    )
    expect(rows[0].end_zeit).toBe('16:00:00')
  })

  it('laesst sie mit Grund zu — und der Grund steht in der Zeile', async () => {
    const dienst = await freigegebeneWoche()
    const nachher = await updateEintrag(u.supabase, dienst.id, ORG, {
      endZeit: '17:00', aenderungGrund: 'Klientin bat um Verlaengerung.',
    })
    expect(nachher.end_zeit).toBe('17:00:00')

    const { rows } = await u.db.query<{ aenderung_grund: string }>(
      'SELECT aenderung_grund FROM dienstplan_eintraege WHERE id = $1', [dienst.id] as never[],
    )
    expect(rows[0].aenderung_grund).toMatch(/Verlaengerung/)
  })

  it('DER KERN: ein einmal gesetzter Grund deckt die naechste Aenderung NICHT mit ab', async () => {
    // Ohne diese Feinheit reichte ein einziger Grund („Krankmeldung Frau M.")
    // aus, um dieselbe Zeile auf Dauer beliebig zu veraendern.
    const dienst = await freigegebeneWoche()
    await updateEintrag(u.supabase, dienst.id, ORG, {
      endZeit: '17:00', aenderungGrund: 'Klientin bat um Verlaengerung.',
    })

    await expect(updateEintrag(u.supabase, dienst.id, ORG, {
      endZeit: '18:00', aenderungGrund: 'Klientin bat um Verlaengerung.',
    })).rejects.toThrow(/eigenen Grund/)

    const nachher = await updateEintrag(u.supabase, dienst.id, ORG, {
      endZeit: '18:00', aenderungGrund: 'Zweite Verlaengerung, Ruecksprache mit PDL.',
    })
    expect(nachher.end_zeit).toBe('18:00:00')
  })

  it('laesst einen freigegebenen Dienst nicht loeschen — nur ausfallen', async () => {
    const dienst = await freigegebeneWoche()
    await expect(deleteEintrag(u.supabase, dienst.id, ORG))
      .rejects.toThrow(/nicht gelöscht werden/)

    const nachher = await updateEintrag(u.supabase, dienst.id, ORG, {
      status: 'ausgefallen', aenderungGrund: 'Klientin im Krankenhaus.',
    })
    expect(nachher.status).toBe('ausgefallen')
  })

  it('verlangt den Grund auch fuer einen NEUEN Dienst in der freigegebenen Woche', async () => {
    await freigegebeneWoche()
    await expect(createEintrag(u.supabase, dienstParams({
      caregiverId: KRAFT_B, startZeit: '18:00', endZeit: '20:00',
    }))).rejects.toThrow(/braucht einen Grund/)

    const nachtrag = await createEintrag(u.supabase, dienstParams({
      caregiverId: KRAFT_B, startZeit: '18:00', endZeit: '20:00',
      aenderungGrund: 'Zusatzeinsatz nach Rueckfrage.',
    }))
    expect(nachtrag.id).toBeTruthy()
  })

  it('GEGENPROBE: in einer NICHT freigegebenen Woche greift der Riegel nicht', async () => {
    // Ohne sie waere „alles braucht einen Grund" ebenfalls gruen — und der
    // Entwurf waere unbenutzbar.
    await freigegebeneWoche()
    const spaeter = await createEintrag(u.supabase, dienstParams({ datum: MONTAG_2 }))
    const nachher = await updateEintrag(u.supabase, spaeter.id, ORG, { endZeit: '17:00' })
    expect(nachher.end_zeit).toBe('17:00:00')
    await deleteEintrag(u.supabase, spaeter.id, ORG)
  })

  it('gibt die Woche nach dem Rueckzug wieder frei zur Bearbeitung', async () => {
    const dienst = await freigegebeneWoche()
    await ziehefreigabeZurueck(u.supabase, ORG, MONTAG, PDL, 'Neuplanung.')

    const nachher = await updateEintrag(u.supabase, dienst.id, ORG, { endZeit: '17:00' })
    expect(nachher.end_zeit).toBe('17:00:00')
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Ohne Migration 20260829005700 (heutiger Live-Stand)', () => {
  let u: Umgebung
  beforeAll(async () => { u = await baueUmgebung(false) }, 180_000)
  beforeEach(async () => { await leere(u.db) })

  it('die Dienstplanung laeuft weiter — der 42703-Rueckfall greift', async () => {
    // Die Anwendung schickt `aenderung_grund` mit; die Spalte gibt es
    // heute nicht. Ohne den Rueckfall fiele JEDE Dienstanlage aus.
    const dienst = await createEintrag(u.supabase, dienstParams({
      aenderungGrund: 'Wird heute noch nicht gespeichert.',
    }))
    expect(dienst.id).toBeTruthy()
    expect(Object.keys(dienst)).not.toContain('aenderung_grund')

    const nachher = await updateEintrag(u.supabase, dienst.id, ORG, { endZeit: '17:00' })
    expect(nachher.end_zeit).toBe('17:00:00')
  })

  it('meldet die fehlende Freigabetabelle lesbar statt als rohe 42P01', async () => {
    await expect(getFreigabe(u.supabase, ORG, MONTAG))
      .rejects.toThrow(/noch nicht eingerichtet/)
    await expect(listFreigaben(u.supabase, ORG))
      .rejects.toThrow(/noch nicht eingerichtet/)
  })

  it('die ArbZG-Entscheidung wirkt AUCH OHNE die Migration', async () => {
    // `quittiereVerstoss` haengt nur an `arbeitszeit_verstoesse`, und die
    // ist live vorhanden. Der fehlende Schreibweg laesst sich also sofort
    // schliessen — ohne auf die Freigabe zu warten.
    await createEintrag(u.supabase, dienstParams({ endZeit: '19:30' }))
    const { rows } = await u.db.query<{ id: string }>(
      'SELECT id FROM arbeitszeit_verstoesse WHERE organization_id = $1', [ORG] as never[],
    )
    expect(rows).toHaveLength(1)

    await quittiereVerstoss(u.supabase, rows[0].id, ORG, PDL, 'Vertretbar, Ruhezeit verlaengert.')
    const { rows: nachher } = await u.db.query<{ quittiert: boolean }>(
      'SELECT quittiert FROM arbeitszeit_verstoesse WHERE id = $1', [rows[0].id] as never[],
    )
    expect(nachher[0].quittiert).toBe(true)
  })
})
