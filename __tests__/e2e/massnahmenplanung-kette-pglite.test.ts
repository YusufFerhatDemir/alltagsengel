/**
 * E2E: Massnahmenplanung — Plan, Massnahmen, Freigabe, Versionierung
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Die COMPLETION-MATRIX fuehrt die Massnahmenplanung als Modul 9 auf
 * `MIGRATION_APPLIED` und haelt als Befund I-8 fest: „23 Testfaelle fuer
 * die Massnahmenplanung — duenn fuer ein Modul, das die Pflegeleistung
 * steuert." Der Live-Nachweis bestand aus genau einer Zeile: der
 * UNIQUE-Index „ein aktiver Plan" existiert. Ob die Kette dahinter
 * durchlaeuft, war nie geprueft — `pflege_massnahmenplaene` traegt live
 * **0 Zeilen**.
 *
 * Diese Suite faehrt sie durch die ECHTEN Funktionen aus
 * `lib/pflege/massnahmenplaene.ts` und `lib/pflege/massnahmen.ts` gegen
 * echtes PostgreSQL (PGlite).
 *
 * ─────────────────────────────────────────────────────────────────────
 * WARUM DAS HIER NICHT GEGEN EINE ATTRAPPE LAUFEN DARF
 * ─────────────────────────────────────────────────────────────────────
 * Der tragende Riegel dieses Moduls ist ein TEILINDEX:
 *
 *   uq_pflege_massnahmenplaene_ein_aktiver_plan
 *     ON pflege_massnahmenplaene (organization_id, client_id)
 *     WHERE status = 'aktiv'
 *
 * Migration 20261009000000 nennt ihn ausdruecklich „die eigentliche
 * Absicherung", weil `freigebenPlan()` mit ZWEI getrennten UPDATEs ohne
 * Transaktionsschutz arbeitet: erst wird der alte Plan auf `ersetzt`
 * gesetzt, dann der neue auf `aktiv`. Zwischen beiden Anweisungen liegt
 * ein Fenster. Der Index ist das, was in diesem Fenster haelt.
 *
 * Genau daran scheitert jede Attrappe: sie kennt keine Teilindizes. Und
 * ein handgeschriebenes Testschema haette daraus leicht ein gewoehnliches
 * UNIQUE(organization_id, client_id) gemacht — das haette schon den
 * ZWEITEN Entwurf desselben Kunden abgewiesen und damit die Versionierung
 * unmoeglich gemacht, waehrend der Test gruen bliebe.
 *
 * Deshalb pruefen die Faelle unten BEIDE Seiten des `WHERE`:
 *   • mehrere Entwuerfe/ersetzte Plaene je Kunde sind erlaubt
 *   • ein zweiter AKTIVER Plan ist es nicht
 *
 * ─────────────────────────────────────────────────────────────────────
 * WAS DIESE SUITE NICHT PRUEFT
 * ─────────────────────────────────────────────────────────────────────
 * RLS. Die Pflegedoku-Routen fahren mit `createAdminClient()`; der
 * Mandantenzaun liegt hier in den `.eq('organization_id', …)` des
 * Anwendungscodes. Genau die werden mit einem echten zweiten Mandanten
 * geprueft.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, bauePflegeplanungTabellen } from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

import {
  createPlan,
  updatePlan,
  listPlaene,
  getPlan,
  getAktivenPlan,
  freigebenPlan,
  sperrePlan,
  entsperrePlan,
  neueVersion,
  validatePlanUebergang,
} from '@/lib/pflege/massnahmenplaene'
import {
  createMassnahme,
  updateMassnahme,
  listMassnahmen,
} from '@/lib/pflege/massnahmen'

const ORG       = 'aaaaaaaa-0000-4000-8000-000000000090'
const FREMD_ORG = 'bbbbbbbb-0000-4000-8000-000000000090'
const KLIENT    = 'cccccccc-0000-4000-8000-000000000090'
const KLIENT_2  = 'cccccccc-0000-4000-8000-000000000091'
const PDL       = 'dddddddd-0000-4000-8000-000000000090'

let db: PGlite
let supabase: SupabaseClient

async function auditEintraege(entitaetId: string) {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT entitaet_typ, aktion, akteur_id FROM pflege_audit_log WHERE entitaet_id = $1 ORDER BY erstellt_am',
    [entitaetId] as never[],
  )
  return rows
}

/** Ein Entwurf mit einer Massnahme — der uebliche Ausgangspunkt. */
async function planMitMassnahme(ueber: Record<string, unknown> = {}) {
  const plan = await createPlan(supabase, {
    organizationId: ORG,
    clientId: KLIENT,
    titel: 'Versorgungsplan 2026',
    erstelltVon: PDL,
    ...ueber,
  })
  await createMassnahme(supabase, {
    organizationId: ORG,
    planId: plan.id,
    kategorie: 'koerperpflege',
    titel: 'Morgendliche Grundpflege',
    haeufigkeit: 'taeglich',
    erstelltVon: PDL,
  })
  return plan
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await bauePflegeplanungTabellen(db)
  supabase = macheSupabaseClient(db) as unknown as SupabaseClient

  await db.exec(`
    INSERT INTO organizations (id, name, bundesland, status) VALUES
      ('${ORG}',       'Alltagsengel Pruefbetrieb', 'Hessen', 'active'),
      ('${FREMD_ORG}', 'Fremder Pflegedienst',      'Hessen', 'active');

    INSERT INTO auth.users (id, email) VALUES ('${PDL}', 'pdl@example.org');
    -- pflege_audit_log.akteur_id zeigt auf profiles, NICHT auf auth.users —
    -- die beiden Fremdschluessel dieses Moduls gehen auseinander
    -- (erstellt_von/freigegeben_von → auth.users). Ohne beide Zeilen
    -- scheitert das Protokoll am FK, und weil logPflegeAktivitaet() den
    -- Fehler nur protokolliert und verschluckt, faellt das erst am
    -- fehlenden Eintrag auf.
    INSERT INTO profiles (id, email, role) VALUES ('${PDL}', 'pdl@example.org', 'admin');

    INSERT INTO clients (id, organization_id, customer_number, first_name, last_name) VALUES
      ('${KLIENT}',   '${ORG}', 'K-2026-0090', 'Margarete', 'Beispiel'),
      ('${KLIENT_2}', '${ORG}', 'K-2026-0091', 'Wilhelm',   'Zweitfall');
  `)
}, 180_000)

beforeEach(async () => {
  await db.exec(`
    -- pflege_audit_log ist append-only; fuer den Ausgangszustand wird der
    -- DELETE-Riegel kurz stillgelegt. Seine Wirkung prueft ein eigener Fall.
    ALTER TABLE pflege_audit_log DISABLE TRIGGER trg_pflege_audit_log_immutable_delete;
    DELETE FROM pflege_audit_log;
    ALTER TABLE pflege_audit_log ENABLE TRIGGER trg_pflege_audit_log_immutable_delete;
    DELETE FROM pflege_massnahmen;
    DELETE FROM pflege_massnahmenplaene;
  `)
})

// ═══════════════════════════════════════════════════════════════════════
describe('Massnahmenplan — Anlage und Pflichtangaben', () => {
  it('legt einen Entwurf an und protokolliert ihn', async () => {
    const plan = await createPlan(supabase, {
      organizationId: ORG, clientId: KLIENT,
      titel: '  Versorgungsplan 2026  ', erstelltVon: PDL,
    })

    expect(plan.status).toBe('entwurf')
    expect(plan.version).toBe(1)
    expect(plan.plan_typ).toBe('versorgungsplan')
    expect(plan.titel).toBe('Versorgungsplan 2026')   // getrimmt
    expect(plan.gesperrt).toBe(false)

    const log = await auditEintraege(plan.id)
    expect(log).toEqual([{ entitaet_typ: 'massnahmenplan', aktion: 'erstellt', akteur_id: PDL }])
  })

  it('weist einen leeren Titel ab', async () => {
    await expect(createPlan(supabase, {
      organizationId: ORG, clientId: KLIENT, titel: '   ', erstelltVon: PDL,
    })).rejects.toThrow(/Titel ist ein Pflichtfeld/)
  })

  it('weist einen unbekannten Plantyp ab (kontrolliertes Vokabular)', async () => {
    await expect(createPlan(supabase, {
      organizationId: ORG, clientId: KLIENT, titel: 'X',
      planTyp: 'wunschzettel' as never, erstelltVon: PDL,
    })).rejects.toThrow(/plan_typ/)
  })

  it('weist einen Gueltigkeitszeitraum ab, der rueckwaerts laeuft', async () => {
    await expect(createPlan(supabase, {
      organizationId: ORG, clientId: KLIENT, titel: 'X',
      gueltigVon: '2026-09-01', gueltigBis: '2026-08-01', erstelltVon: PDL,
    })).rejects.toThrow(/Gültig bis/)
  })

  it('laesst mehrere ENTWUERFE fuer denselben Kunden zu', async () => {
    // Gegenprobe zum Teilindex: er greift NUR bei status='aktiv'. Waere er
    // ein gewoehnliches UNIQUE(organization_id, client_id), scheiterte
    // schon dieser Fall — und die Versionierung waere unmoeglich.
    await createPlan(supabase, { organizationId: ORG, clientId: KLIENT, titel: 'A', erstelltVon: PDL })
    const zweiter = await createPlan(supabase, { organizationId: ORG, clientId: KLIENT, titel: 'B', erstelltVon: PDL })
    expect(zweiter.id).toBeTruthy()
    expect(await listPlaene(supabase, { organizationId: ORG, clientId: KLIENT })).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Massnahmen — Positionsebene', () => {
  it('haengt eine Massnahme an den Plan und protokolliert sie', async () => {
    const plan = await createPlan(supabase, {
      organizationId: ORG, clientId: KLIENT, titel: 'Plan', erstelltVon: PDL,
    })
    const m = await createMassnahme(supabase, {
      organizationId: ORG, planId: plan.id,
      kategorie: 'mobilitaet', titel: 'Gehtraining', prioritaet: 'hoch',
      erstelltVon: PDL,
    })

    expect(m.status).toBe('geplant')
    expect(m.prioritaet).toBe('hoch')
    expect((await auditEintraege(m.id)).map(e => e.aktion)).toEqual(['erstellt'])
  })

  it('weist eine unbekannte Kategorie ab, bevor sie die Datenbank erreicht', async () => {
    const plan = await createPlan(supabase, {
      organizationId: ORG, clientId: KLIENT, titel: 'Plan', erstelltVon: PDL,
    })
    await expect(createMassnahme(supabase, {
      organizationId: ORG, planId: plan.id,
      kategorie: 'gartenarbeit' as never, titel: 'X', erstelltVon: PDL,
    })).rejects.toThrow(/kategorie/)
  })

  it('weist eine Massnahme an einem unbekannten Plan ab', async () => {
    await expect(createMassnahme(supabase, {
      organizationId: ORG, planId: '00000000-0000-4000-8000-00000000dead',
      kategorie: 'ernaehrung', titel: 'X', erstelltVon: PDL,
    })).rejects.toThrow(/Maßnahmenplan nicht gefunden/)
  })

  it('weist eine Massnahme an einem Plan eines FREMDEN Mandanten ab', async () => {
    const plan = await createPlan(supabase, {
      organizationId: ORG, clientId: KLIENT, titel: 'Plan', erstelltVon: PDL,
    })
    await expect(createMassnahme(supabase, {
      organizationId: FREMD_ORG, planId: plan.id,
      kategorie: 'ernaehrung', titel: 'X', erstelltVon: PDL,
    })).rejects.toThrow(/Maßnahmenplan nicht gefunden/)
  })

  it('weist ein Ende vor dem Beginn ab — bei Anlage und bei Aenderung', async () => {
    const plan = await createPlan(supabase, {
      organizationId: ORG, clientId: KLIENT, titel: 'Plan', erstelltVon: PDL,
    })
    await expect(createMassnahme(supabase, {
      organizationId: ORG, planId: plan.id, kategorie: 'ernaehrung', titel: 'X',
      beginnDatum: '2026-09-10', endeDatum: '2026-09-01', erstelltVon: PDL,
    })).rejects.toThrow(/Enddatum/)

    const m = await createMassnahme(supabase, {
      organizationId: ORG, planId: plan.id, kategorie: 'ernaehrung', titel: 'X',
      beginnDatum: '2026-09-10', erstelltVon: PDL,
    })
    await expect(updateMassnahme(supabase, m.id, ORG, { endeDatum: '2026-09-01' }))
      .rejects.toThrow(/Enddatum/)
  })

  it('sortiert die Massnahmen nach der vorgegebenen Reihenfolge', async () => {
    const plan = await createPlan(supabase, {
      organizationId: ORG, clientId: KLIENT, titel: 'Plan', erstelltVon: PDL,
    })
    for (const [titel, sortierung] of [['Dritte', 30], ['Erste', 10], ['Zweite', 20]] as const) {
      await createMassnahme(supabase, {
        organizationId: ORG, planId: plan.id, kategorie: 'sonstiges',
        titel, sortierung, erstelltVon: PDL,
      })
    }
    const liste = await listMassnahmen(supabase, { organizationId: ORG, planId: plan.id })
    expect(liste.map(m => m.titel)).toEqual(['Erste', 'Zweite', 'Dritte'])
  })

  it('haelt den Abschluss einer Massnahme mit Ergebnis fest', async () => {
    const plan = await createPlan(supabase, {
      organizationId: ORG, clientId: KLIENT, titel: 'Plan', erstelltVon: PDL,
    })
    const m = await createMassnahme(supabase, {
      organizationId: ORG, planId: plan.id, kategorie: 'mobilitaet',
      titel: 'Gehtraining', erstelltVon: PDL,
    })
    const nachher = await updateMassnahme(supabase, m.id, ORG, {
      status: 'abgeschlossen', ergebnis: 'Gehstrecke von 20 m auf 80 m gesteigert',
    })
    expect(nachher.status).toBe('abgeschlossen')
    expect(nachher.ergebnis).toMatch(/80 m/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Freigabe — der Teilindex ist der eigentliche Riegel', () => {
  it('gibt einen Entwurf mit Massnahmen frei', async () => {
    const plan = await planMitMassnahme()
    const frei = await freigebenPlan(supabase, plan.id, ORG, PDL)

    expect(frei.status).toBe('aktiv')
    expect(frei.freigegeben_von).toBe(PDL)
    expect(frei.freigegeben_am).toBeTruthy()
    expect((await auditEintraege(plan.id)).map(e => e.aktion)).toContain('freigegeben')
  })

  it('weist die Freigabe eines Plans OHNE Massnahmen ab', async () => {
    // Ein leerer Plan steuert nichts. Der Riegel steht im Anwendungscode
    // (count-Abfrage), nicht in der Datenbank — und wird deshalb hier
    // ausdruecklich mitgeprueft.
    const plan = await createPlan(supabase, {
      organizationId: ORG, clientId: KLIENT, titel: 'Leer', erstelltVon: PDL,
    })
    await expect(freigebenPlan(supabase, plan.id, ORG, PDL))
      .rejects.toThrow(/ohne Maßnahmen/)
    expect((await getPlan(supabase, plan.id, ORG))!.status).toBe('entwurf')
  })

  it('loest den bisher aktiven Plan desselben Kunden ab', async () => {
    const erster = await planMitMassnahme({ titel: 'Plan 1' })
    await freigebenPlan(supabase, erster.id, ORG, PDL)

    const zweiter = await planMitMassnahme({ titel: 'Plan 2' })
    await freigebenPlan(supabase, zweiter.id, ORG, PDL)

    expect((await getPlan(supabase, erster.id, ORG))!.status).toBe('ersetzt')
    expect((await getAktivenPlan(supabase, KLIENT, ORG))!.id).toBe(zweiter.id)
  })

  it('DER RIEGEL: ein zweiter aktiver Plan laesst sich nicht per SQL erzwingen', async () => {
    // Das Fenster zwischen den beiden UPDATEs in freigebenPlan() ist nicht
    // transaktional geschuetzt. Was in diesem Fenster haelt, ist der
    // Teilindex — und nur er. Hier wird er direkt angegangen.
    const erster = await planMitMassnahme({ titel: 'Plan 1' })
    await freigebenPlan(supabase, erster.id, ORG, PDL)

    const zweiter = await planMitMassnahme({ titel: 'Plan 2' })
    await expect(db.query(
      `UPDATE pflege_massnahmenplaene SET status = 'aktiv' WHERE id = $1`, [zweiter.id] as never[],
    )).rejects.toThrow(/uq_pflege_massnahmenplaene_ein_aktiver_plan|duplicate key/i)
  })

  it('der Riegel trennt nach Kunde — zwei Kunden duerfen je einen aktiven Plan haben', async () => {
    // Gegenprobe: waere der Index nur auf organization_id, haette der
    // zweite Kunde keinen aktiven Plan bekommen koennen.
    const a = await planMitMassnahme({ titel: 'Plan A' })
    await freigebenPlan(supabase, a.id, ORG, PDL)

    const b = await planMitMassnahme({ clientId: KLIENT_2, titel: 'Plan B' })
    const freiB = await freigebenPlan(supabase, b.id, ORG, PDL)

    expect(freiB.status).toBe('aktiv')
    expect((await getAktivenPlan(supabase, KLIENT, ORG))!.id).toBe(a.id)
    expect((await getAktivenPlan(supabase, KLIENT_2, ORG))!.id).toBe(b.id)
  })

  it('mehrere ERSETZTE Plaene stoeren den Riegel nicht', async () => {
    // Die andere Haelfte des `WHERE status = 'aktiv'`: die Historie darf
    // beliebig lang werden.
    for (let i = 0; i < 3; i++) {
      const p = await planMitMassnahme({ titel: `Plan ${i}` })
      await freigebenPlan(supabase, p.id, ORG, PDL)
    }
    const alle = await listPlaene(supabase, { organizationId: ORG, clientId: KLIENT })
    expect(alle.filter(p => p.status === 'ersetzt')).toHaveLength(2)
    expect(alle.filter(p => p.status === 'aktiv')).toHaveLength(1)
  })

  it('weist die Freigabe eines Plans aus einem fremden Mandanten ab', async () => {
    const plan = await planMitMassnahme()
    await expect(freigebenPlan(supabase, plan.id, FREMD_ORG, PDL))
      .rejects.toThrow(/nicht gefunden/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Statusmaschine', () => {
  it('laesst nur die vorgesehenen Uebergaenge zu', () => {
    expect(() => validatePlanUebergang('entwurf', 'aktiv')).not.toThrow()
    expect(() => validatePlanUebergang('aktiv', 'abgelaufen')).not.toThrow()
    expect(() => validatePlanUebergang('aktiv', 'ersetzt')).not.toThrow()
    // Ein ersetzter Plan ist ein Endzustand — er wird nicht wieder aktiv.
    expect(() => validatePlanUebergang('ersetzt', 'aktiv')).toThrow(/nicht erlaubt/)
    expect(() => validatePlanUebergang('gesperrt', 'aktiv')).toThrow(/nicht erlaubt/)
    expect(() => validatePlanUebergang('abgelaufen', 'aktiv')).toThrow(/nicht erlaubt/)
  })

  it('weist einen unzulaessigen Statuswechsel auch ueber updatePlan() ab', async () => {
    const plan = await planMitMassnahme()
    await freigebenPlan(supabase, plan.id, ORG, PDL)
    await updatePlan(supabase, plan.id, ORG, { status: 'abgelaufen' })

    await expect(updatePlan(supabase, plan.id, ORG, { status: 'aktiv' }))
      .rejects.toThrow(/nicht erlaubt/)
  })

  it('laesst den Zeitraum eines Plans nicht rueckwaerts laufen', async () => {
    const plan = await createPlan(supabase, {
      organizationId: ORG, clientId: KLIENT, titel: 'Plan',
      gueltigVon: '2026-09-01', erstelltVon: PDL,
    })
    await expect(updatePlan(supabase, plan.id, ORG, { gueltigBis: '2026-08-01' }))
      .rejects.toThrow(/Gültig bis/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Sperre — Plan und Massnahmen zusammen', () => {
  it('sperrt den Plan und weist danach jede Aenderung ab', async () => {
    const plan = await planMitMassnahme()
    const gesperrt = await sperrePlan(supabase, plan.id, ORG)

    expect(gesperrt.gesperrt).toBe(true)
    expect(gesperrt.status).toBe('gesperrt')
    await expect(updatePlan(supabase, plan.id, ORG, { titel: 'Neu' }))
      .rejects.toThrow(/Gesperrter Maßnahmenplan/)
    await expect(freigebenPlan(supabase, plan.id, ORG, PDL))
      .rejects.toThrow(/Gesperrter Maßnahmenplan/)
  })

  it('die Massnahmen erben die Sperre des Plans', async () => {
    // Der Riegel sitzt in assertPlanOffen() — ohne ihn liessen sich die
    // Inhalte eines gesperrten Plans weiter aendern, waehrend der Plan
    // selbst unantastbar aussieht.
    const plan = await planMitMassnahme()
    const [m] = await listMassnahmen(supabase, { organizationId: ORG, planId: plan.id })
    await sperrePlan(supabase, plan.id, ORG)

    await expect(updateMassnahme(supabase, m.id, ORG, { titel: 'Neu' }))
      .rejects.toThrow(/Gesperrter Maßnahmenplan/)
    await expect(createMassnahme(supabase, {
      organizationId: ORG, planId: plan.id, kategorie: 'sonstiges',
      titel: 'Nachtrag', erstelltVon: PDL,
    })).rejects.toThrow(/Gesperrter Maßnahmenplan/)
  })

  it('DER DB-RIEGEL greift auch an der Anwendung vorbei', async () => {
    const plan = await planMitMassnahme()
    await sperrePlan(supabase, plan.id, ORG)

    await expect(db.query(
      `UPDATE pflege_massnahmenplaene SET titel = 'Umgangen' WHERE id = $1`, [plan.id] as never[],
    )).rejects.toThrow(/Gesperrter Maßnahmenplan/)
  })

  it('BEFUND: mit gesperrt=false im selben UPDATE laeuft der DB-Riegel ins Leere', async () => {
    // Dieselbe Trigger-Bedingung wie in der Zeiterfassung
    // (OLD.gesperrt AND NEW.gesperrt) und dieselbe Luecke. Hier ist sie
    // weniger scharf, weil `entsperrePlan()` den Plan ohnehin in den
    // Entwurf zuruecksetzt und die Anwendung damit denselben Zustand
    // erreicht — der Test haelt fest, dass die Datenbank fuer sich
    // genommen nicht die Schranke ist.
    const plan = await planMitMassnahme()
    await sperrePlan(supabase, plan.id, ORG)

    await db.query(
      `UPDATE pflege_massnahmenplaene SET titel = 'Umgangen', gesperrt = false WHERE id = $1`,
      [plan.id] as never[],
    )
    const { rows } = await db.query<{ titel: string }>(
      'SELECT titel FROM pflege_massnahmenplaene WHERE id = $1', [plan.id] as never[],
    )
    expect(rows[0].titel).toBe('Umgangen')
  })

  it('GEGENPROBE: die Anwendung weist genau das ab', async () => {
    const plan = await planMitMassnahme()
    await sperrePlan(supabase, plan.id, ORG)
    await expect(updatePlan(supabase, plan.id, ORG, { titel: 'Umgangen' }))
      .rejects.toThrow(/Gesperrter Maßnahmenplan/)
  })

  it('entsperrt in den Entwurfsstatus zurueck — und macht den Plan wieder aenderbar', async () => {
    const plan = await planMitMassnahme()
    await sperrePlan(supabase, plan.id, ORG)
    const offen = await entsperrePlan(supabase, plan.id, ORG)

    expect(offen.gesperrt).toBe(false)
    expect(offen.status).toBe('entwurf')
    const geaendert = await updatePlan(supabase, plan.id, ORG, { titel: 'Ueberarbeitet' })
    expect(geaendert.titel).toBe('Ueberarbeitet')
  })

  it('weist doppeltes Sperren und Entsperren ohne Sperre ab', async () => {
    const plan = await planMitMassnahme()
    await sperrePlan(supabase, plan.id, ORG)
    await expect(sperrePlan(supabase, plan.id, ORG)).rejects.toThrow(/bereits gesperrt/)

    await entsperrePlan(supabase, plan.id, ORG)
    await expect(entsperrePlan(supabase, plan.id, ORG)).rejects.toThrow(/nicht gesperrt/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Versionierung', () => {
  it('erbt die Massnahmen des Vorgaengers — als frische Planung', async () => {
    const alt = await planMitMassnahme({ titel: 'Plan 2026' })
    await createMassnahme(supabase, {
      organizationId: ORG, planId: alt.id, kategorie: 'ernaehrung',
      titel: 'Trinkprotokoll', sortierung: 20, erstelltVon: PDL,
    })
    await freigebenPlan(supabase, alt.id, ORG, PDL)
    // Eine Massnahme im Vorgaenger ist bereits abgeschlossen …
    const [erste] = await listMassnahmen(supabase, { organizationId: ORG, planId: alt.id })
    await updateMassnahme(supabase, erste.id, ORG, { status: 'abgeschlossen' })

    const neu = await neueVersion(supabase, alt.id, ORG, PDL)

    expect(neu.version).toBe(2)
    expect(neu.status).toBe('entwurf')
    expect(neu.vorgaenger_id).toBe(alt.id)

    const uebernommen = await listMassnahmen(supabase, { organizationId: ORG, planId: neu.id })
    expect(uebernommen.map(m => m.titel)).toEqual(['Morgendliche Grundpflege', 'Trinkprotokoll'])
    // … kommt in der neuen Version trotzdem als 'geplant' an. Ein
    // uebernommener Abschluss waere eine Dokumentation, die nie stattfand.
    expect(uebernommen.every(m => m.status === 'geplant')).toBe(true)
  })

  it('laesst den Vorgaenger aktiv, bis die neue Version freigegeben ist', async () => {
    const alt = await planMitMassnahme()
    await freigebenPlan(supabase, alt.id, ORG, PDL)
    const neu = await neueVersion(supabase, alt.id, ORG, PDL)

    expect((await getAktivenPlan(supabase, KLIENT, ORG))!.id).toBe(alt.id)

    await freigebenPlan(supabase, neu.id, ORG, PDL)
    expect((await getAktivenPlan(supabase, KLIENT, ORG))!.id).toBe(neu.id)
    expect((await getPlan(supabase, alt.id, ORG))!.status).toBe('ersetzt')
  })

  it('versioniert einen bereits ersetzten Plan nicht erneut', async () => {
    const alt = await planMitMassnahme()
    await freigebenPlan(supabase, alt.id, ORG, PDL)
    const neu = await neueVersion(supabase, alt.id, ORG, PDL)
    await freigebenPlan(supabase, neu.id, ORG, PDL)   // alt → ersetzt

    await expect(neueVersion(supabase, alt.id, ORG, PDL))
      .rejects.toThrow(/bereits ersetzter Plan/)
  })

  it('uebernimmt die Ziele des Vorgaengers und laesst sich dabei ueberschreiben', async () => {
    const alt = await planMitMassnahme({
      betreuungsziele: 'Selbstaendigkeit erhalten',
      pflegeziele: 'Dekubitusprophylaxe',
    })
    const neu = await neueVersion(supabase, alt.id, ORG, PDL, { titel: 'Plan 2027' })

    expect(neu.titel).toBe('Plan 2027')
    expect(neu.betreuungsziele).toBe('Selbstaendigkeit erhalten')
    expect(neu.pflegeziele).toBe('Dekubitusprophylaxe')
  })

  it('weist die Versionierung eines Plans aus einem fremden Mandanten ab', async () => {
    const alt = await planMitMassnahme()
    await expect(neueVersion(supabase, alt.id, FREMD_ORG, PDL))
      .rejects.toThrow(/Vorgänger-Plan nicht gefunden/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Protokoll und Mandantengrenze', () => {
  it('haelt die Kette Anlage → Freigabe → Sperre → Entsperrung fest', async () => {
    const plan = await planMitMassnahme()
    await freigebenPlan(supabase, plan.id, ORG, PDL)
    await sperrePlan(supabase, plan.id, ORG)
    await entsperrePlan(supabase, plan.id, ORG)

    expect((await auditEintraege(plan.id)).map(e => e.aktion))
      .toEqual(['erstellt', 'freigegeben', 'gesperrt', 'entsperrt'])
  })

  it('das Protokoll laesst sich weder aendern noch loeschen', async () => {
    await planMitMassnahme()
    await expect(db.exec(`UPDATE pflege_audit_log SET aktion = 'geloescht'`))
      .rejects.toThrow()
    await expect(db.exec(`DELETE FROM pflege_audit_log`))
      .rejects.toThrow()
  })

  it('ein fremder Mandant sieht die Plaene nicht — und den aktiven auch nicht', async () => {
    const plan = await planMitMassnahme()
    await freigebenPlan(supabase, plan.id, ORG, PDL)

    expect(await listPlaene(supabase, { organizationId: FREMD_ORG })).toHaveLength(0)
    expect(await getPlan(supabase, plan.id, FREMD_ORG)).toBeNull()
    expect(await getAktivenPlan(supabase, KLIENT, FREMD_ORG)).toBeNull()
    expect(await listMassnahmen(supabase, { organizationId: FREMD_ORG })).toHaveLength(0)
  })

  it('GEGENPROBE: im eigenen Mandanten liegt alles vor', async () => {
    // Ohne sie waere „sieht nichts" auch dann gruen, wenn gar nichts
    // angelegt wurde.
    const plan = await planMitMassnahme()
    await freigebenPlan(supabase, plan.id, ORG, PDL)

    expect(await listPlaene(supabase, { organizationId: ORG })).toHaveLength(1)
    expect((await getAktivenPlan(supabase, KLIENT, ORG))!.id).toBe(plan.id)
    expect(await listMassnahmen(supabase, { organizationId: ORG })).toHaveLength(1)
  })
})
