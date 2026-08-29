/**
 * E2E: Evaluation einer Pflegemassnahme — Pflegeprozess, Schritt 6
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND GAP-14 (29.08.2026): die Massnahmenplanung kannte Plaene,
 * Massnahmen, Versionen, Freigabe und Sperre — aber keine Evaluation.
 * Damit fehlte der Schluss des Regelkreises: die Feststellung, ob ein
 * Pflegeziel erreicht wurde, und was daraus folgt.
 *
 * Zwei vorhandene Felder sahen danach aus und waren es nicht:
 *   • `pflege_massnahmen.ergebnis` — Freitext, ueberschreibbar, ohne
 *     Datum und ohne Urheber. Nach der zweiten Beurteilung ist die erste
 *     weg; eine Reihe gibt es also nicht, und ohne Reihe keinen Regelkreis.
 *   • `pflege_massnahmen.status` — sagt, was mit der MASSNAHME geschieht,
 *     nicht ob ihr ZIEL erreicht wurde.
 *
 * Die praktische Folge stand nirgends: es gab keine Abfrage, die „welche
 * Massnahmen sind zur Evaluation faellig?" beantwortet. Genau danach wird
 * bei einer Qualitaetspruefung nach § 114 SGB XI gefragt.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WARUM GEGEN ECHTES POSTGRES
 * ─────────────────────────────────────────────────────────────────────
 *   • `pme_bewertung_nicht_leer` — ein CHECK auf `length(btrim(...))`.
 *     Eine Attrappe haette jede leere Beurteilung durchgelassen.
 *   • `trg_pme_unveraenderlich_*` — und ihre EINE Ausnahme fuer die
 *     FK-Kaskade. Ohne sie bliebe die DSGVO-Loeschung eines Klienten an
 *     seinen Evaluationen haengen; das faellt nur einer echten Datenbank
 *     auf, die die Kaskade auch wirklich faehrt.
 *   • `trg_pme_wiedervorlage` — schreibt die Faelligkeit an der MASSNAHME
 *     fort, in einer anderen Tabelle als der eingefuegten Zeile.
 *   • `trg_pme_plan_in_kraft` — liest ueber zwei Joins hinweg.
 *   • `pflege_audit_log_typ_check` — der Grund, warum der Audit-Eintrag
 *     ohne die Migration gar nicht erst entsteht.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ZWEI SCHEMAFASSUNGEN
 * ─────────────────────────────────────────────────────────────────────
 * Migration `20260829185500` ist eingecheckt und nicht angewendet. Der
 * erste Block faehrt gegen den HEUTIGEN Zustand und belegt, was fehlt.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  baueKettenSchema,
  bauePflegeplanungTabellen,
  wendeEvaluationMigrationAn,
} from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

import { createPlan, freigebenPlan } from '@/lib/pflege/massnahmenplaene'
import { createMassnahme, updateMassnahme } from '@/lib/pflege/massnahmen'
import {
  evaluiereMassnahme,
  letzteEvaluation,
  listEvaluationen,
  listFaelligeEvaluationen,
} from '@/lib/pflege/evaluation'
import { PFLEGE_AUDIT_ENTITAET_TYP_WERTE } from '@/lib/pflege/types'

const ORG    = 'aaaaaaaa-0000-4000-8000-000000000095'
const KLIENT = 'cccccccc-0000-4000-8000-000000000095'
const PDL    = 'dddddddd-0000-4000-8000-000000000095'

interface Umgebung {
  db: PGlite
  supabase: SupabaseClient
}

async function baueUmgebung(mitMigration: boolean): Promise<Umgebung> {
  const db = await baueKettenSchema()
  await bauePflegeplanungTabellen(db)
  if (mitMigration) await wendeEvaluationMigrationAn(db)

  await db.exec(`
    INSERT INTO organizations (id, name, bundesland, status) VALUES
      ('${ORG}', 'Alltagsengel Pruefbetrieb Evaluation', 'Hessen', 'active');

    INSERT INTO auth.users (id, email) VALUES ('${PDL}', 'pdl-eval@example.org');
    INSERT INTO profiles (id, email, role) VALUES ('${PDL}', 'pdl-eval@example.org', 'admin');

    INSERT INTO clients (id, organization_id, customer_number, first_name, last_name) VALUES
      ('${KLIENT}', '${ORG}', 'K-2026-0095', 'Margarete', 'Regelkreis');
  `)

  return { db, supabase: macheSupabaseClient(db) as unknown as SupabaseClient }
}

async function leere(db: PGlite, mitMigration: boolean): Promise<void> {
  if (mitMigration) {
    await db.exec(`
      ALTER TABLE pflege_massnahmen_evaluationen DISABLE TRIGGER trg_pme_unveraenderlich_delete;
      DELETE FROM pflege_massnahmen_evaluationen;
      ALTER TABLE pflege_massnahmen_evaluationen ENABLE TRIGGER trg_pme_unveraenderlich_delete;
    `)
  }
  await db.exec(`
    ALTER TABLE pflege_audit_log DISABLE TRIGGER trg_pflege_audit_log_immutable_delete;
    DELETE FROM pflege_audit_log;
    ALTER TABLE pflege_audit_log ENABLE TRIGGER trg_pflege_audit_log_immutable_delete;
    DELETE FROM pflege_massnahmen;
    DELETE FROM pflege_massnahmenplaene;
  `)
}

/**
 * Ein FREIGEGEBENER Plan mit einer Massnahme — der Ausgangspunkt jeder
 * Evaluation. Ein Entwurf taugt bewusst nicht dafuer.
 */
async function aktiveMassnahme(
  supabase: SupabaseClient,
  ueber: { evaluationIntervallTage?: number | null } = {},
) {
  const plan = await createPlan(supabase, {
    organizationId: ORG, clientId: KLIENT,
    titel: 'Versorgungsplan 2026', erstelltVon: PDL,
  })
  const massnahme = await createMassnahme(supabase, {
    organizationId: ORG, planId: plan.id,
    kategorie: 'mobilitaet',
    titel: 'Gehtraining zweimal taeglich',
    ziel: 'Selbststaendiges Aufstehen bis Ende Oktober',
    haeufigkeit: 'taeglich',
    evaluationIntervallTage: ueber.evaluationIntervallTage,
    erstelltVon: PDL,
  })
  await freigebenPlan(supabase, plan.id, ORG, PDL)
  return { plan, massnahme }
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Der HEUTIGE Zustand — es gibt keine Evaluation
// ═══════════════════════════════════════════════════════════════════════

describe('Evaluation · Schema OHNE Migration 20260829185500 (Befund)', () => {
  let u: Umgebung
  beforeAll(async () => { u = await baueUmgebung(false) }, 180_000)
  beforeEach(async () => { await leere(u.db, false) })

  it('kennt die Tabelle pflege_massnahmen_evaluationen nicht', async () => {
    const { rows } = await u.db.query<{ da: boolean }>(
      `SELECT to_regclass('public.pflege_massnahmen_evaluationen') IS NOT NULL AS da`,
    )
    expect(rows[0].da).toBe(false)
  })

  it('kennt keine Wiedervorlage an der Massnahme', async () => {
    const { rows } = await u.db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'pflege_massnahmen'`,
    )
    const spalten = rows.map(r => r.column_name)
    expect(spalten).not.toContain('naechste_evaluation')
    expect(spalten).not.toContain('evaluation_intervall_tage')
  })

  it('legt die Massnahme trotzdem an — der 42703-Rueckfall greift', async () => {
    // Ohne ihn waere das Anlegen JEDER Massnahme kaputt, sobald der Code
    // vor der Migration ausgeliefert wird — und das ist die Reihenfolge,
    // in der hier ausgeliefert wird.
    const { massnahme } = await aktiveMassnahme(u.supabase, { evaluationIntervallTage: 30 })
    expect(massnahme.id).toBeTruthy()
    expect(massnahme.titel).toBe('Gehtraining zweimal taeglich')
  })

  it('weist den Audit-Typ `evaluation` ab — der CHECK kennt ihn nicht', async () => {
    // Der Grund, warum die Migration den CHECK mitzieht: ein Audit-Eintrag,
    // den der Constraint verwirft, entsteht gar nicht erst.
    await expect(u.db.exec(`
      INSERT INTO pflege_audit_log (organization_id, entitaet_typ, entitaet_id, aktion, akteur_id)
      VALUES ('${ORG}', 'evaluation', gen_random_uuid(), 'erstellt', '${PDL}');
    `)).rejects.toThrow()
  })

  it('BEFUND NEBENBEI: der CHECK kennt auch acht bereits benutzte Typen nicht', async () => {
    // `PFLEGE_AUDIT_ENTITAET_TYP_WERTE` fuehrt sechzehn Typen, der CHECK
    // dieser Fassung sieben. Jeder Audit-Eintrag zu einem Medikament, einer
    // Wunddokumentation oder einem Sturzprotokoll lief hier auf — nicht
    // ganz lautlos (logPflegeAktivitaet protokolliert den Fehler), aber im
    // Audit stand er nicht.
    await expect(u.db.exec(`
      INSERT INTO pflege_audit_log (organization_id, entitaet_typ, entitaet_id, aktion, akteur_id)
      VALUES ('${ORG}', 'medikament', gen_random_uuid(), 'erstellt', '${PDL}');
    `)).rejects.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. MIT der Migration — der Regelkreis schliesst sich
// ═══════════════════════════════════════════════════════════════════════

describe('Evaluation · Schema MIT Migration 20260829185500', () => {
  let u: Umgebung
  beforeAll(async () => { u = await baueUmgebung(true) }, 180_000)
  beforeEach(async () => { await leere(u.db, true) })

  async function auditTypen(entitaetId: string) {
    const { rows } = await u.db.query<{ entitaet_typ: string; aktion: string }>(
      'SELECT entitaet_typ, aktion FROM pflege_audit_log WHERE entitaet_id = $1',
      [entitaetId] as never[],
    )
    return rows
  }

  // ── Die Beurteilung selbst ───────────────────────────────────────────

  it('haelt Zielerreichung, Beurteilung und Folgerung fest', async () => {
    const { massnahme } = await aktiveMassnahme(u.supabase)
    const ev = await evaluiereMassnahme(u.supabase, {
      organizationId: ORG,
      massnahmeId: massnahme.id,
      zielerreichung: 'teilweise_erreicht',
      bewertung: 'Steht mit Hilfe auf, freies Aufstehen noch nicht.',
      folgerung: 'fortfuehren',
      evaluiertAm: '2026-09-30',
      evaluiertVon: PDL,
    })

    expect(ev.zielerreichung).toBe('teilweise_erreicht')
    expect(ev.folgerung).toBe('fortfuehren')
    expect(ev.evaluiert_von).toBe(PDL)
    expect(ev.evaluiert_am).toBe('2026-09-30')
  })

  it('protokolliert die Evaluation im Pflege-Audit', async () => {
    const { massnahme } = await aktiveMassnahme(u.supabase)
    const ev = await evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'erreicht', bewertung: 'Ziel erreicht.',
      folgerung: 'beenden', evaluiertVon: PDL,
    })
    expect(await auditTypen(ev.id))
      .toEqual([{ entitaet_typ: 'evaluation', aktion: 'erstellt' }])
  })

  it('weist eine Beurteilung ohne Text ab — ein Haekchen ist kein Nachweis', async () => {
    const { massnahme } = await aktiveMassnahme(u.supabase)
    await expect(evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'erreicht', bewertung: '   ',
      folgerung: 'beenden', evaluiertVon: PDL,
    })).rejects.toThrow(/Beurteilung im Klartext/)
  })

  it('haelt denselben Riegel auch in der Datenbank — nicht nur im Code', async () => {
    // Der TypeScript-Guard ist die lesbare Haelfte; der CHECK ist die,
    // an der auch ein direkter Schreibweg scheitert.
    const { massnahme } = await aktiveMassnahme(u.supabase)
    await expect(u.db.query(
      `INSERT INTO pflege_massnahmen_evaluationen
         (organization_id, massnahme_id, zielerreichung, bewertung, folgerung, evaluiert_von)
       VALUES ($1, $2, 'erreicht', ' ', 'beenden', $3)`,
      [ORG, massnahme.id, PDL] as never[],
    )).rejects.toThrow(/pme_bewertung_nicht_leer/)
  })

  it('weist ein unbekanntes Vokabular ab', async () => {
    const { massnahme } = await aktiveMassnahme(u.supabase)
    await expect(evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'gut gelaufen' as never, bewertung: 'Passt.',
      folgerung: 'fortfuehren', evaluiertVon: PDL,
    })).rejects.toThrow(/zielerreichung/)

    await expect(evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'erreicht', bewertung: 'Passt.',
      folgerung: 'mal sehen' as never, evaluiertVon: PDL,
    })).rejects.toThrow(/folgerung/)
  })

  // ── Was nicht in Kraft ist, wird nicht beurteilt ──────────────────────

  it('weist die Evaluation eines Plans im ENTWURF ab', async () => {
    const plan = await createPlan(u.supabase, {
      organizationId: ORG, clientId: KLIENT,
      titel: 'Noch nicht freigegeben', erstelltVon: PDL,
    })
    const massnahme = await createMassnahme(u.supabase, {
      organizationId: ORG, planId: plan.id,
      kategorie: 'mobilitaet', titel: 'Gehtraining', erstelltVon: PDL,
    })

    await expect(evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'erreicht', bewertung: 'Lief gut.',
      folgerung: 'beenden', evaluiertVon: PDL,
    })).rejects.toThrow(/Entwurf hat nie gewirkt/)
  })

  it('haelt denselben Riegel in der Datenbank', async () => {
    const plan = await createPlan(u.supabase, {
      organizationId: ORG, clientId: KLIENT,
      titel: 'Noch nicht freigegeben', erstelltVon: PDL,
    })
    const massnahme = await createMassnahme(u.supabase, {
      organizationId: ORG, planId: plan.id,
      kategorie: 'mobilitaet', titel: 'Gehtraining', erstelltVon: PDL,
    })
    await expect(u.db.query(
      `INSERT INTO pflege_massnahmen_evaluationen
         (organization_id, massnahme_id, zielerreichung, bewertung, folgerung, evaluiert_von)
       VALUES ($1, $2, 'erreicht', 'Lief gut.', 'beenden', $3)`,
      [ORG, massnahme.id, PDL] as never[],
    )).rejects.toThrow(/Entwurf hat nie gewirkt/)
  })

  it('weist eine Massnahme aus einem fremden Mandanten als nicht gefunden ab', async () => {
    const { massnahme } = await aktiveMassnahme(u.supabase)
    await expect(evaluiereMassnahme(u.supabase, {
      organizationId: 'bbbbbbbb-0000-4000-8000-000000000095',
      massnahmeId: massnahme.id,
      zielerreichung: 'erreicht', bewertung: 'Lief gut.',
      folgerung: 'beenden', evaluiertVon: PDL,
    })).rejects.toThrow(/nicht gefunden/)
  })

  // ── Die Wiedervorlage ────────────────────────────────────────────────

  it('rechnet die Wiedervorlage aus dem Intervall der Massnahme', async () => {
    const { massnahme } = await aktiveMassnahme(u.supabase, { evaluationIntervallTage: 30 })
    await evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'teilweise_erreicht', bewertung: 'Fortschritt sichtbar.',
      folgerung: 'fortfuehren', evaluiertAm: '2026-09-01', evaluiertVon: PDL,
    })

    const { rows } = await u.db.query<{ naechste_evaluation: string }>(
      'SELECT naechste_evaluation::text AS naechste_evaluation FROM pflege_massnahmen WHERE id = $1',
      [massnahme.id] as never[],
    )
    expect(rows[0].naechste_evaluation).toBe('2026-10-01')
  })

  it('laesst die ausdrueckliche Angabe das Intervall schlagen', async () => {
    const { massnahme } = await aktiveMassnahme(u.supabase, { evaluationIntervallTage: 30 })
    await evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'nicht_erreicht', bewertung: 'Ruecklaeufig, engmaschiger beobachten.',
      folgerung: 'anpassen', evaluiertAm: '2026-09-01',
      naechsteEvaluation: '2026-09-08', evaluiertVon: PDL,
    })

    const { rows } = await u.db.query<{ naechste_evaluation: string }>(
      'SELECT naechste_evaluation::text AS naechste_evaluation FROM pflege_massnahmen WHERE id = $1',
      [massnahme.id] as never[],
    )
    expect(rows[0].naechste_evaluation).toBe('2026-09-08')
  })

  it('erfindet ohne Intervall und ohne Angabe KEINE Wiedervorlage', async () => {
    // Eine erfundene Faelligkeit taeuscht eine Verabredung vor, die
    // niemand getroffen hat — und sie stuende bei der naechsten Pruefung
    // als versaeumte Frist da.
    const { massnahme } = await aktiveMassnahme(u.supabase)
    await evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'erreicht', bewertung: 'Ziel erreicht.',
      folgerung: 'fortfuehren', evaluiertVon: PDL,
    })
    const { rows } = await u.db.query<{ naechste_evaluation: string | null }>(
      'SELECT naechste_evaluation::text AS naechste_evaluation FROM pflege_massnahmen WHERE id = $1',
      [massnahme.id] as never[],
    )
    expect(rows[0].naechste_evaluation).toBeNull()
  })

  it('loescht die Wiedervorlage, wenn die Folgerung „beenden" lautet', async () => {
    // Sonst verstopfte eine beendete Massnahme die Faelligkeitsliste auf
    // Dauer — und zwar mit jedem Intervall aufs Neue.
    const { massnahme } = await aktiveMassnahme(u.supabase, { evaluationIntervallTage: 14 })
    await evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'erreicht', bewertung: 'Ziel erreicht, Massnahme entbehrlich.',
      folgerung: 'beenden', evaluiertAm: '2026-09-01', evaluiertVon: PDL,
    })
    const { rows } = await u.db.query<{ naechste_evaluation: string | null }>(
      'SELECT naechste_evaluation::text AS naechste_evaluation FROM pflege_massnahmen WHERE id = $1',
      [massnahme.id] as never[],
    )
    expect(rows[0].naechste_evaluation).toBeNull()
  })

  it('weist eine Wiedervorlage in der Vergangenheit ab', async () => {
    const { massnahme } = await aktiveMassnahme(u.supabase)
    await expect(evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'erreicht', bewertung: 'Ziel erreicht.',
      folgerung: 'fortfuehren', evaluiertAm: '2026-09-30',
      naechsteEvaluation: '2026-09-01', evaluiertVon: PDL,
    })).rejects.toThrow(/nicht vor der heutigen/)
  })

  it('weist ein unbrauchbares Intervall ab', async () => {
    const plan = await createPlan(u.supabase, {
      organizationId: ORG, clientId: KLIENT, titel: 'Plan', erstelltVon: PDL,
    })
    await expect(createMassnahme(u.supabase, {
      organizationId: ORG, planId: plan.id, kategorie: 'mobilitaet',
      titel: 'Gehtraining', evaluationIntervallTage: 0, erstelltVon: PDL,
    })).rejects.toThrow(/zwischen 1 und 365/)
    await expect(createMassnahme(u.supabase, {
      organizationId: ORG, planId: plan.id, kategorie: 'mobilitaet',
      titel: 'Gehtraining', evaluationIntervallTage: 400, erstelltVon: PDL,
    })).rejects.toThrow(/zwischen 1 und 365/)
  })

  // ── Die Faelligkeitsliste ────────────────────────────────────────────

  it('meldet die faellige Massnahme mit ihrer Ueberfaelligkeit', async () => {
    const { massnahme } = await aktiveMassnahme(u.supabase, { evaluationIntervallTage: 30 })
    await evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'teilweise_erreicht', bewertung: 'Weiter beobachten.',
      folgerung: 'fortfuehren', evaluiertAm: '2026-09-01', evaluiertVon: PDL,
    })

    const faellig = await listFaelligeEvaluationen(u.supabase, ORG, '2026-10-05')
    expect(faellig).toHaveLength(1)
    expect(faellig[0].massnahmeId).toBe(massnahme.id)
    expect(faellig[0].naechsteEvaluation).toBe('2026-10-01')
    expect(faellig[0].ueberfaelligTage).toBe(4)
  })

  it('meldet am Faelligkeitstag selbst — mit 0 Tagen Verzug', async () => {
    const { massnahme } = await aktiveMassnahme(u.supabase, { evaluationIntervallTage: 30 })
    await evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'teilweise_erreicht', bewertung: 'Weiter beobachten.',
      folgerung: 'fortfuehren', evaluiertAm: '2026-09-01', evaluiertVon: PDL,
    })
    const faellig = await listFaelligeEvaluationen(u.supabase, ORG, '2026-10-01')
    expect(faellig.map(f => f.ueberfaelligTage)).toEqual([0])
  })

  it('meldet noch NICHT, was erst spaeter faellig wird', async () => {
    const { massnahme } = await aktiveMassnahme(u.supabase, { evaluationIntervallTage: 30 })
    await evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'teilweise_erreicht', bewertung: 'Weiter beobachten.',
      folgerung: 'fortfuehren', evaluiertAm: '2026-09-01', evaluiertVon: PDL,
    })
    expect(await listFaelligeEvaluationen(u.supabase, ORG, '2026-09-30')).toHaveLength(0)
  })

  it('laesst abgeschlossene Massnahmen aus der Faelligkeitsliste heraus', async () => {
    // Eine abgeschlossene Massnahme ist nicht faellig, sondern vorbei.
    const { massnahme } = await aktiveMassnahme(u.supabase, { evaluationIntervallTage: 30 })
    await evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'teilweise_erreicht', bewertung: 'Weiter beobachten.',
      folgerung: 'fortfuehren', evaluiertAm: '2026-09-01', evaluiertVon: PDL,
    })
    expect(await listFaelligeEvaluationen(u.supabase, ORG, '2026-10-05')).toHaveLength(1)

    await updateMassnahme(u.supabase, massnahme.id, ORG, { status: 'abgeschlossen' })
    expect(await listFaelligeEvaluationen(u.supabase, ORG, '2026-10-05')).toHaveLength(0)
  })

  it('meldet nichts, solange keine Wiedervorlage gesetzt ist', async () => {
    await aktiveMassnahme(u.supabase)
    expect(await listFaelligeEvaluationen(u.supabase, ORG, '2027-01-01')).toHaveLength(0)
  })

  // ── Die Reihe ist der Regelkreis ─────────────────────────────────────

  it('haelt mehrere Beurteilungen nebeneinander, juengste zuerst', async () => {
    const { massnahme } = await aktiveMassnahme(u.supabase, { evaluationIntervallTage: 30 })
    for (const [tag, ziel, text] of [
      ['2026-09-01', 'nicht_erreicht', 'Keine Fortschritte.'],
      ['2026-10-01', 'teilweise_erreicht', 'Steht mit Hilfe auf.'],
      ['2026-11-01', 'erreicht', 'Steht frei auf.'],
    ] as const) {
      await evaluiereMassnahme(u.supabase, {
        organizationId: ORG, massnahmeId: massnahme.id,
        zielerreichung: ziel, bewertung: text,
        folgerung: 'fortfuehren', evaluiertAm: tag, evaluiertVon: PDL,
      })
    }

    const reihe = await listEvaluationen(u.supabase, { organizationId: ORG, massnahmeId: massnahme.id })
    expect(reihe.map(e => e.evaluiert_am)).toEqual(['2026-11-01', '2026-10-01', '2026-09-01'])
    expect((await letzteEvaluation(u.supabase, massnahme.id, ORG))?.zielerreichung).toBe('erreicht')
  })

  it('gibt einem fremden Mandanten nichts heraus', async () => {
    const { massnahme } = await aktiveMassnahme(u.supabase)
    await evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'erreicht', bewertung: 'Ziel erreicht.',
      folgerung: 'beenden', evaluiertVon: PDL,
    })
    expect(await listEvaluationen(u.supabase, {
      organizationId: 'bbbbbbbb-0000-4000-8000-000000000095',
      massnahmeId: massnahme.id,
    })).toHaveLength(0)
  })

  // ── Unveraenderlichkeit ──────────────────────────────────────────────

  it('laesst eine Beurteilung weder aendern noch loeschen', async () => {
    const { massnahme } = await aktiveMassnahme(u.supabase)
    const ev = await evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'erreicht', bewertung: 'Ziel erreicht.',
      folgerung: 'beenden', evaluiertVon: PDL,
    })

    await expect(u.db.query(
      `UPDATE pflege_massnahmen_evaluationen SET zielerreichung = 'nicht_erreicht' WHERE id = $1`,
      [ev.id] as never[],
    )).rejects.toThrow(/unveraenderlich/i)

    await expect(u.db.query(
      'DELETE FROM pflege_massnahmen_evaluationen WHERE id = $1', [ev.id] as never[],
    )).rejects.toThrow(/unveraenderlich/i)
  })

  it('laesst die FK-Kaskade trotzdem durch — sonst blockiert sie die DSGVO-Loeschung', async () => {
    // Der Riegel darf die Loeschkette Klient → Plan → Massnahme →
    // Evaluation nicht anhalten. Ein RAISE im BEFORE DELETE ohne diese
    // Ausnahme macht den Klienten unloeschbar, und das faellt erst beim
    // Loeschauftrag auf.
    const { plan, massnahme } = await aktiveMassnahme(u.supabase)
    await evaluiereMassnahme(u.supabase, {
      organizationId: ORG, massnahmeId: massnahme.id,
      zielerreichung: 'erreicht', bewertung: 'Ziel erreicht.',
      folgerung: 'beenden', evaluiertVon: PDL,
    })

    await u.db.query('DELETE FROM pflege_massnahmenplaene WHERE id = $1', [plan.id] as never[])

    const { rows } = await u.db.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM pflege_massnahmen_evaluationen',
    )
    expect(Number(rows[0].n)).toBe(0)
  })

  // ── Der Audit-CHECK ──────────────────────────────────────────────────

  it('kennt jetzt jeden Typ, den der Anwendungscode fuehrt', async () => {
    // Der Abgleich, den es vorher nicht gab: die Liste in
    // `lib/pflege/types.ts` und der CHECK muessen deckungsgleich sein,
    // sonst verschwinden Audit-Eintraege am Constraint.
    for (const typ of PFLEGE_AUDIT_ENTITAET_TYP_WERTE) {
      await u.db.query(
        `INSERT INTO pflege_audit_log (organization_id, entitaet_typ, entitaet_id, aktion, akteur_id)
         VALUES ($1, $2, gen_random_uuid(), 'erstellt', $3)`,
        [ORG, typ, PDL] as never[],
      )
    }
    const { rows } = await u.db.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM pflege_audit_log',
    )
    expect(Number(rows[0].n)).toBe(PFLEGE_AUDIT_ENTITAET_TYP_WERTE.length)
  })
})
