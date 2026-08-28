/**
 * E2E: Qualitaetsmanagement — Pflegevisite, Befunde, Regelkreis
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Die COMPLETION-MATRIX fuehrt das Qualitaetsmanagement als Modul 29 auf
 * `DEPLOYED` — der niedrigsten Stufe der ganzen Matrix nach ePA — und
 * haelt als Befund I-12 fest:
 *
 *   „Beide Module (PDL und QM) sind Lesesichten auf fremde Tabellen, kein
 *    eigenes Fachmodul. Es gibt keine Pflegevisite, keine Dienstanweisung,
 *    kein QM-Handbuch, keinen Beschwerde-Regelkreis. Das ist eine
 *    Produktluecke, kein Bug."
 *
 * Vorhanden war ausschliesslich `lib/analytics/quality.ts`: ein
 * Kennzahlen-Dashboard, das Wunden, Stuerze, Vitalalarme und offene
 * Massnahmen ZAEHLT. Zaehlen ist keine Qualitaetssicherung — es sagt, wie
 * viele Wunden es gibt, nicht ob die Versorgung stimmt.
 *
 * Diese Suite prueft das neue Fachmodul `lib/qm/pflegevisite.ts`: die
 * Pflegevisite nach § 113 SGB XI, das Kerninstrument der internen
 * Qualitaetspruefung im ambulanten Dienst.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DIE ROLLENTRENNUNG IST DER KERN, NICHT DAS BEIWERK
 * ─────────────────────────────────────────────────────────────────────
 * `lib/auth/rollen.ts` haelt fuer die Rolle `qm` ausdruecklich fest:
 * „prueft, dokumentiert Befunde, aendert aber die geprueften Daten NICHT
 * — sonst pruefte es die eigene Korrektur."
 *
 * Das Modul haelt sich daran: es schreibt nirgendwo in einen
 * Pflegebestand. Ein Befund kann eine Massnahme ANTRAGEN; anlegen und
 * zurueckverknuepfen muss sie, wer `pflege.schreiben` hat. Die Suite
 * prueft diese Trennung als Verhalten (`verknuepfeMassnahme` verlangt eine
 * bereits existierende Massnahme im eigenen Mandanten und legt selbst
 * keine an), nicht als Absichtserklaerung im Kommentar.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WAS NUR EINE ECHTE DATENBANK BEANTWORTET
 * ─────────────────────────────────────────────────────────────────────
 *   • `qm_visite_befunde_feststellung_belegt` (CHECK) — eine Abweichung
 *     ohne Feststellung ist ein Vorwurf ohne Sachverhalt
 *   • `qm_visite_befunde_punkt_unique` (UNIQUE) — je Visite jeder
 *     Pruefpunkt genau einmal; sonst stehen zwei Bewertungen desselben
 *     Punktes nebeneinander und keine gilt
 *   • `qm_pflegevisiten_durchgefuehrt_datum` (CHECK) — eine durchgefuehrte
 *     Visite ohne Datum ist keine durchgefuehrte Visite
 *   • die beiden Abschluss-Trigger, samt der einen Ausnahme, die sie
 *     offen lassen
 *
 * ─────────────────────────────────────────────────────────────────────
 * WAS DIESE SUITE NICHT PRUEFT
 * ─────────────────────────────────────────────────────────────────────
 * RLS und die HTTP-Schicht. Die Routen fahren mit `createAdminClient()`;
 * geprueft wird der Zaun im Anwendungscode, mit einem echten zweiten
 * Mandanten. Dass die Routen bewacht sind, ist Sache des
 * Berechtigungstests, nicht dieser Kette.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  baueKettenSchema,
  bauePflegeplanungTabellen,
  bauePersonalTabellen,
  baueQmTabellen,
} from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

import {
  planeVisite,
  listVisiten,
  getVisite,
  updateVisite,
  fuehreVisiteDurch,
  werteVisiteAus,
  schliesseVisiteAb,
  erfasseBefund,
  listBefunde,
  aendereBefund,
  verknuepfeMassnahme,
  listOffeneAbweichungen,
  berechneVisitenKennzahlen,
  validateVisiteUebergang,
} from '@/lib/qm/pflegevisite'
import { createPlan } from '@/lib/pflege/massnahmenplaene'
import { createMassnahme } from '@/lib/pflege/massnahmen'
import { heuteBerlin, datumBerlin } from '@/lib/utils/timezone'

const ORG       = 'aaaaaaaa-0000-4000-8000-000000000290'
const FREMD_ORG = 'bbbbbbbb-0000-4000-8000-000000000290'
const KLIENT    = 'cccccccc-0000-4000-8000-000000000290'
const FREMD_KLIENT = 'cccccccc-0000-4000-8000-000000000291'
const KRAFT     = 'dddddddd-0000-4000-8000-000000000290'
const FREMD_KRAFT = 'dddddddd-0000-4000-8000-000000000291'
const QM_PRUEFER = 'eeeeeeee-0000-4000-8000-000000000290'

/**
 * Die drei Bezugstage — BERLINER Zeitrechnung, nicht UTC.
 *
 * `fuehreVisiteDurch()` vergleicht gegen `heuteBerlin()`. Wer die
 * Testdaten aus `new Date().toISOString()` zieht, rechnet in UTC und liegt
 * zwischen Mitternacht und 02:00 Berliner Zeit einen Tag daneben: „morgen"
 * ist dann genau „heute", und der Test „meldet keine Durchfuehrung fuer
 * die Zukunft" faellt still um. Deshalb dieselbe Quelle wie die
 * Anwendung.
 */
const HEUTE = heuteBerlin()
const GESTERN = datumBerlin(new Date(Date.parse(`${HEUTE}T12:00:00Z`) - 86_400_000))
const MORGEN = datumBerlin(new Date(Date.parse(`${HEUTE}T12:00:00Z`) + 86_400_000))

let db: PGlite
let supabase: SupabaseClient

/** Eine Visite mit einem sauberen Befund — der uebliche Ausgangspunkt. */
async function visiteMitBefund(ueber: Record<string, unknown> = {}) {
  const visite = await planeVisite(supabase, {
    organizationId: ORG, clientId: KLIENT, caregiverId: KRAFT,
    geplantAm: GESTERN, erstelltVon: QM_PRUEFER, ...ueber,
  })
  await erfasseBefund(supabase, {
    organizationId: ORG, visiteId: visite.id,
    pruefpunkt: 'pflegeplanung_aktuell', bewertung: 'erfuellt',
    erstelltVon: QM_PRUEFER,
  })
  return visite
}

/** Eine Visite mit einer belegten, abstellbaren Abweichung. */
async function visiteMitAbweichung(frist = MORGEN) {
  const visite = await visiteMitBefund()
  const befund = await erfasseBefund(supabase, {
    organizationId: ORG, visiteId: visite.id,
    pruefpunkt: 'dokumentation_vollstaendig', bewertung: 'nicht_erfuellt',
    feststellung: 'Verlaufseintraege der letzten zwei Wochen fehlen.',
    empfehlung: 'Nachdokumentation und Einweisung der Kraft.',
    frist, massnahmeBeantragt: true,
    erstelltVon: QM_PRUEFER,
  })
  return { visite, befund }
}

/** Die vollstaendige Kette bis zum Abschluss. */
async function abgeschlosseneVisite() {
  const { visite, befund } = await visiteMitAbweichung()
  await fuehreVisiteDurch(supabase, visite.id, ORG, QM_PRUEFER, GESTERN)
  await werteVisiteAus(supabase, visite.id, ORG, 'geringe_abweichung', 'Insgesamt tragfaehig.')
  const fertig = await schliesseVisiteAb(supabase, visite.id, ORG, QM_PRUEFER)
  return { visite: fertig, befund }
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await bauePersonalTabellen(db)
  await bauePflegeplanungTabellen(db)
  await baueQmTabellen(db)
  supabase = macheSupabaseClient(db) as unknown as SupabaseClient

  await db.exec(`
    INSERT INTO organizations (id, name, bundesland, status) VALUES
      ('${ORG}',       'Alltagsengel Pruefbetrieb', 'Hessen', 'active'),
      ('${FREMD_ORG}', 'Fremder Pflegedienst',      'Hessen', 'active');

    INSERT INTO auth.users (id, email) VALUES ('${QM_PRUEFER}', 'qm@example.org');
    INSERT INTO profiles (id, email, role) VALUES ('${QM_PRUEFER}', 'qm@example.org', 'qm');

    INSERT INTO clients (id, organization_id, customer_number, first_name, last_name) VALUES
      ('${KLIENT}',       '${ORG}',       'K-2026-0290', 'Margarete', 'Beispiel'),
      ('${FREMD_KLIENT}', '${FREMD_ORG}', 'K-2026-0291', 'Fremde',    'Person');

    INSERT INTO caregivers (id, organization_id, first_name, last_name, initials) VALUES
      ('${KRAFT}',       '${ORG}',       'Nadine', 'Pflegekraft', 'NP'),
      ('${FREMD_KRAFT}', '${FREMD_ORG}', 'Ilhan',  'Fremdkraft',  'IF');
  `)
}, 180_000)

beforeEach(async () => {
  await db.exec(`
    -- Die Abschluss-Trigger weisen auch DELETE ab; fuer den
    -- Ausgangszustand werden sie kurz stillgelegt. Ihre Wirkung pruefen
    -- eigene Faelle.
    ALTER TABLE qm_visite_befunde  DISABLE TRIGGER trg_qm_befund_abgeschlossen;
    ALTER TABLE qm_pflegevisiten   DISABLE TRIGGER trg_qm_visite_abgeschlossen;
    DELETE FROM qm_visite_befunde;
    DELETE FROM qm_pflegevisiten;
    ALTER TABLE qm_visite_befunde  ENABLE TRIGGER trg_qm_befund_abgeschlossen;
    ALTER TABLE qm_pflegevisiten   ENABLE TRIGGER trg_qm_visite_abgeschlossen;
    DELETE FROM pflege_massnahmen;
    DELETE FROM pflege_massnahmenplaene;
  `)
})

// ═══════════════════════════════════════════════════════════════════════
describe('Visite planen', () => {
  it('plant eine Regelvisite fuer einen Klienten', async () => {
    const visite = await planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, caregiverId: KRAFT,
      geplantAm: MORGEN, erstelltVon: QM_PRUEFER,
    })

    expect(visite.status).toBe('geplant')
    expect(visite.visite_typ).toBe('regelvisite')
    expect(visite.geplant_am).toBe(MORGEN)
    expect(visite.durchgefuehrt_am).toBeNull()
  })

  it('verlangt bei einer Anlassvisite einen Anlass', async () => {
    // Eine Anlassvisite ohne Anlass ist eine Regelvisite mit falschem
    // Etikett — und verfaelscht jede Auswertung nach Visitenart.
    await expect(planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT,
      visiteTyp: 'anlassvisite', erstelltVon: QM_PRUEFER,
    })).rejects.toThrow(/Anlass/)

    const mitAnlass = await planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, visiteTyp: 'anlassvisite',
      anlass: 'Beschwerde der Angehoerigen vom 12.08.', erstelltVon: QM_PRUEFER,
    })
    expect(mitAnlass.visite_typ).toBe('anlassvisite')
  })

  it('weist eine unbekannte Visitenart ab (kontrolliertes Vokabular)', async () => {
    await expect(planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT,
      visiteTyp: 'stippvisite' as never, erstelltVon: QM_PRUEFER,
    })).rejects.toThrow(/visite_typ/)
  })

  it('weist einen Klienten aus einem FREMDEN Mandanten ab — und legt nichts an', async () => {
    await expect(planeVisite(supabase, {
      organizationId: ORG, clientId: FREMD_KLIENT, erstelltVon: QM_PRUEFER,
    })).rejects.toThrow(/Betreute Person nicht gefunden/)

    const { rows } = await db.query('SELECT id FROM qm_pflegevisiten')
    expect(rows).toHaveLength(0)
  })

  it('weist eine Pflegekraft aus einem FREMDEN Mandanten ab', async () => {
    await expect(planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, caregiverId: FREMD_KRAFT,
      erstelltVon: QM_PRUEFER,
    })).rejects.toThrow(/Mitarbeiter nicht gefunden/)
  })

  it('GEGENPROBE: dieselben Angaben aus dem eigenen Mandanten gehen durch', async () => {
    // Ohne sie waere „weist alles ab" ebenfalls gruen.
    const visite = await planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, caregiverId: KRAFT, erstelltVon: QM_PRUEFER,
    })
    expect(visite.client_id).toBe(KLIENT)
    expect(visite.caregiver_id).toBe(KRAFT)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Befunde — die Checkliste', () => {
  it('haelt einen erfuellten Pruefpunkt ohne Feststellung fest', async () => {
    const visite = await planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, erstelltVon: QM_PRUEFER,
    })
    const befund = await erfasseBefund(supabase, {
      organizationId: ORG, visiteId: visite.id,
      pruefpunkt: 'hygiene', bewertung: 'erfuellt', erstelltVon: QM_PRUEFER,
    })
    expect(befund.bewertung).toBe('erfuellt')
    expect(befund.feststellung).toBeNull()
  })

  it('verlangt zu jeder Abweichung eine Feststellung im Klartext', async () => {
    // Ein „nicht erfuellt" ohne Sachverhalt ist ein Vorwurf ohne Beleg.
    const visite = await planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, erstelltVon: QM_PRUEFER,
    })
    for (const bewertung of ['teilweise_erfuellt', 'nicht_erfuellt'] as const) {
      await expect(erfasseBefund(supabase, {
        organizationId: ORG, visiteId: visite.id,
        pruefpunkt: 'hygiene', bewertung, erstelltVon: QM_PRUEFER,
      })).rejects.toThrow(/Feststellung/)
    }
  })

  it('DER DB-RIEGEL greift auch an der Anwendung vorbei', async () => {
    // Der Anwendungscode liefert die lesbare Meldung, der CHECK ist der
    // nicht umgehbare Teil. Beide werden gebraucht.
    const visite = await planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, erstelltVon: QM_PRUEFER,
    })
    await expect(db.query(
      `INSERT INTO qm_visite_befunde
         (organization_id, visite_id, pruefpunkt, bewertung, erstellt_von)
       VALUES ($1, $2, 'hygiene', 'nicht_erfuellt', $3)`,
      [ORG, visite.id, QM_PRUEFER] as never[],
    )).rejects.toThrow(/qm_visite_befunde_feststellung_belegt/)
  })

  it('laesst denselben Pruefpunkt nicht zweimal bewerten', async () => {
    // Sonst stehen zwei Bewertungen desselben Punktes nebeneinander und
    // keine gilt.
    const visite = await planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, erstelltVon: QM_PRUEFER,
    })
    await erfasseBefund(supabase, {
      organizationId: ORG, visiteId: visite.id,
      pruefpunkt: 'hygiene', bewertung: 'erfuellt', erstelltVon: QM_PRUEFER,
    })
    await expect(erfasseBefund(supabase, {
      organizationId: ORG, visiteId: visite.id,
      pruefpunkt: 'hygiene', bewertung: 'nicht_erfuellt',
      feststellung: 'Doch nicht.', erstelltVon: QM_PRUEFER,
    })).rejects.toThrow(/bereits bewertet/)
  })

  it('erlaubt verschiedene Pruefpunkte in derselben Visite', async () => {
    const visite = await planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, erstelltVon: QM_PRUEFER,
    })
    for (const p of ['hygiene', 'medikamentengabe', 'sturzprophylaxe'] as const) {
      await erfasseBefund(supabase, {
        organizationId: ORG, visiteId: visite.id,
        pruefpunkt: p, bewertung: 'erfuellt', erstelltVon: QM_PRUEFER,
      })
    }
    expect(await listBefunde(supabase, visite.id, ORG)).toHaveLength(3)
  })

  it('weist einen unbekannten Pruefpunkt ab', async () => {
    const visite = await planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, erstelltVon: QM_PRUEFER,
    })
    await expect(erfasseBefund(supabase, {
      organizationId: ORG, visiteId: visite.id,
      pruefpunkt: 'kaffeequalitaet' as never, bewertung: 'erfuellt',
      erstelltVon: QM_PRUEFER,
    })).rejects.toThrow(/pruefpunkt/)
  })

  it('weist einen Befund an einer Visite eines fremden Mandanten ab', async () => {
    const visite = await planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, erstelltVon: QM_PRUEFER,
    })
    await expect(erfasseBefund(supabase, {
      organizationId: FREMD_ORG, visiteId: visite.id,
      pruefpunkt: 'hygiene', bewertung: 'erfuellt', erstelltVon: QM_PRUEFER,
    })).rejects.toThrow(/Pflegevisite nicht gefunden/)
  })

  it('laesst eine Bewertung nachbessern — mit dann geforderter Feststellung', async () => {
    const visite = await planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, erstelltVon: QM_PRUEFER,
    })
    const befund = await erfasseBefund(supabase, {
      organizationId: ORG, visiteId: visite.id,
      pruefpunkt: 'hygiene', bewertung: 'erfuellt', erstelltVon: QM_PRUEFER,
    })

    await expect(aendereBefund(supabase, befund.id, ORG, { bewertung: 'nicht_erfuellt' }))
      .rejects.toThrow(/Feststellung/)

    const geaendert = await aendereBefund(supabase, befund.id, ORG, {
      bewertung: 'nicht_erfuellt', feststellung: 'Handschuhe fehlten.',
    })
    expect(geaendert.bewertung).toBe('nicht_erfuellt')
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Die Kette: planen → durchfuehren → auswerten → abschliessen', () => {
  it('laesst nur die vorgesehenen Uebergaenge zu', () => {
    expect(() => validateVisiteUebergang('geplant', 'durchgefuehrt')).not.toThrow()
    expect(() => validateVisiteUebergang('durchgefuehrt', 'ausgewertet')).not.toThrow()
    expect(() => validateVisiteUebergang('ausgewertet', 'abgeschlossen')).not.toThrow()
    // Eine abgeschlossene Pruefung wird nicht wieder geoeffnet.
    expect(() => validateVisiteUebergang('abgeschlossen', 'ausgewertet')).toThrow(/nicht vorgesehen/)
    expect(() => validateVisiteUebergang('geplant', 'abgeschlossen')).toThrow(/nicht vorgesehen/)
    expect(() => validateVisiteUebergang('abgesagt', 'durchgefuehrt')).toThrow(/nicht vorgesehen/)
  })

  it('haelt die Durchfuehrung mit Datum und pruefender Person fest', async () => {
    const visite = await visiteMitBefund()
    const nachher = await fuehreVisiteDurch(supabase, visite.id, ORG, QM_PRUEFER, GESTERN)

    expect(nachher.status).toBe('durchgefuehrt')
    expect(nachher.durchgefuehrt_am).toBe(GESTERN)
    expect(nachher.durchgefuehrt_von).toBe(QM_PRUEFER)
  })

  it('meldet keine Durchfuehrung fuer die Zukunft', async () => {
    const visite = await visiteMitBefund()
    await expect(fuehreVisiteDurch(supabase, visite.id, ORG, QM_PRUEFER, MORGEN))
      .rejects.toThrow(/Zukunft/)
  })

  it('DER DB-RIEGEL: durchgefuehrt ohne Datum geht auch per SQL nicht', async () => {
    const visite = await visiteMitBefund()
    await expect(db.query(
      `UPDATE qm_pflegevisiten SET status = 'durchgefuehrt' WHERE id = $1`, [visite.id] as never[],
    )).rejects.toThrow(/qm_pflegevisiten_durchgefuehrt_datum/)
  })

  it('wertet aus — und weist ein Urteil ab, das den Befunden widerspricht', async () => {
    const { visite } = await visiteMitAbweichung()
    await fuehreVisiteDurch(supabase, visite.id, ORG, QM_PRUEFER, GESTERN)

    // „Ohne Beanstandung" bei einem offenen „nicht erfuellt" waere ein
    // Widerspruch im eigenen Dokument.
    await expect(werteVisiteAus(supabase, visite.id, ORG, 'ohne_beanstandung'))
      .rejects.toThrow(/Ohne Beanstandung/)

    const nachher = await werteVisiteAus(supabase, visite.id, ORG, 'geringe_abweichung', 'Tragfaehig.')
    expect(nachher.status).toBe('ausgewertet')
    expect(nachher.gesamtbewertung).toBe('geringe_abweichung')
  })

  it('GEGENPROBE: ohne Abweichung ist „ohne Beanstandung" moeglich', async () => {
    const visite = await visiteMitBefund()
    await fuehreVisiteDurch(supabase, visite.id, ORG, QM_PRUEFER, GESTERN)
    const nachher = await werteVisiteAus(supabase, visite.id, ORG, 'ohne_beanstandung')
    expect(nachher.gesamtbewertung).toBe('ohne_beanstandung')
  })

  it('wertet eine Visite ohne Befunde nicht aus', async () => {
    // Ein Urteil ohne Pruefpunkte ist kein Pruefergebnis.
    const visite = await planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, geplantAm: GESTERN, erstelltVon: QM_PRUEFER,
    })
    await fuehreVisiteDurch(supabase, visite.id, ORG, QM_PRUEFER, GESTERN)
    await expect(werteVisiteAus(supabase, visite.id, ORG, 'ohne_beanstandung'))
      .rejects.toThrow(/ohne Befunde/)
  })

  it('FAIL-CLOSED: der Abschluss verlangt zu jeder Abweichung Empfehlung UND Frist', async () => {
    // Eine festgestellte Abweichung ohne Termin ist keine
    // Qualitaetssicherung, sondern eine Notiz — und genau das haelt der
    // Medizinische Dienst einem Dienst bei der Pruefung vor.
    const visite = await visiteMitBefund()
    await erfasseBefund(supabase, {
      organizationId: ORG, visiteId: visite.id,
      pruefpunkt: 'medikamentengabe', bewertung: 'nicht_erfuellt',
      feststellung: 'Abzeichnung fehlt an drei Tagen.',
      erstelltVon: QM_PRUEFER,          // ohne Empfehlung, ohne Frist
    })
    await fuehreVisiteDurch(supabase, visite.id, ORG, QM_PRUEFER, GESTERN)
    await werteVisiteAus(supabase, visite.id, ORG, 'erhebliche_abweichung')

    await expect(schliesseVisiteAb(supabase, visite.id, ORG, QM_PRUEFER))
      .rejects.toThrow(/ohne Empfehlung oder Frist/)
    expect((await getVisite(supabase, visite.id, ORG))!.status).toBe('ausgewertet')
  })

  it('GEGENPROBE: mit Empfehlung und Frist schliesst dieselbe Visite ab', async () => {
    // Ohne sie waere „schliesst nie ab" ebenfalls gruen.
    const { visite } = await abgeschlosseneVisite()
    expect(visite.status).toBe('abgeschlossen')
    expect(visite.abgeschlossen_von).toBe(QM_PRUEFER)
    expect(visite.abgeschlossen_am).toBeTruthy()
  })

  it('schliesst nicht direkt aus dem Entwurf ab', async () => {
    const visite = await visiteMitBefund()
    await expect(schliesseVisiteAb(supabase, visite.id, ORG, QM_PRUEFER))
      .rejects.toThrow(/nicht vorgesehen/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Nach dem Abschluss ist die Visite ein Pruefergebnis', () => {
  it('weist jede Aenderung an der Visite ab — in der Anwendung', async () => {
    const { visite } = await abgeschlosseneVisite()
    await expect(updateVisite(supabase, visite.id, ORG, { zusammenfassung: 'Anders.' }))
      .rejects.toThrow(/Abgeschlossene Pflegevisite/)
  })

  it('weist sie auch an der Anwendung vorbei ab — der Trigger haengt an der ABSICHT', async () => {
    // Anders als prevent_locked_plan_edit und log_arbeitszeit_korrektur
    // (beide pruefen OLD.x AND NEW.x und lassen sich umgehen, indem man
    // die Sperre im selben UPDATE mit aufhebt — belegt in
    // zeiterfassung-kette-pglite.test.ts) blockt dieser Trigger JEDE
    // Aenderung an einer abgeschlossenen Visite, auch die, die den Status
    // gleich mit zurueckdreht.
    const { visite } = await abgeschlosseneVisite()

    await expect(db.query(
      `UPDATE qm_pflegevisiten SET zusammenfassung = 'Anders.' WHERE id = $1`,
      [visite.id] as never[],
    )).rejects.toThrow(/Abgeschlossene Pflegevisite/)

    await expect(db.query(
      `UPDATE qm_pflegevisiten SET zusammenfassung = 'Anders.', status = 'ausgewertet' WHERE id = $1`,
      [visite.id] as never[],
    )).rejects.toThrow(/Abgeschlossene Pflegevisite/)
  })

  it('laesst sie auch nicht loeschen', async () => {
    const { visite } = await abgeschlosseneVisite()
    await expect(db.query(
      'DELETE FROM qm_pflegevisiten WHERE id = $1', [visite.id] as never[],
    )).rejects.toThrow(/kann nicht geloescht werden/)
  })

  it('weist einen NACHGEREICHTEN Befund ab — dafuer gibt es die Nachvisite', async () => {
    const { visite } = await abgeschlosseneVisite()
    await expect(erfasseBefund(supabase, {
      organizationId: ORG, visiteId: visite.id,
      pruefpunkt: 'hygiene', bewertung: 'erfuellt', erstelltVon: QM_PRUEFER,
    })).rejects.toThrow(/abgeschlossenen Pflegevisite/)
  })

  it('friert die Feststellung eines Befundes ein', async () => {
    const { visite, befund } = await abgeschlosseneVisite()
    expect(visite.status).toBe('abgeschlossen')

    await expect(aendereBefund(supabase, befund.id, ORG, { feststellung: 'War doch nicht so.' }))
      .rejects.toThrow(/abgeschlossenen Pflegevisite/)

    await expect(db.query(
      `UPDATE qm_visite_befunde SET bewertung = 'erfuellt', feststellung = NULL WHERE id = $1`,
      [befund.id] as never[],
    )).rejects.toThrow(/kann nicht mehr geaendert werden/)
  })

  it('DIE EINE AUSNAHME: Massnahme und Erledigung bleiben nachtragbar', async () => {
    // Die Abstellung geschieht naturgemaess NACH der Pruefung. Waere auch
    // sie gesperrt, waere der Regelkreis nach dem Abschluss tot — und die
    // Visite ein Dokument im Ordner statt ein Vorgang.
    const { befund } = await abgeschlosseneVisite()
    const nachher = await verknuepfeMassnahme(supabase, befund.id, ORG, null, HEUTE)
    expect(nachher.erledigt_am).toBe(HEUTE)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Der Regelkreis — Feststellung und Abstellung in verschiedenen Haenden', () => {
  /** Eine echte Massnahme im Pflegebestand, wie die PDL sie anlegt. */
  async function pflegeMassnahme() {
    const plan = await createPlan(supabase, {
      organizationId: ORG, clientId: KLIENT, titel: 'Versorgungsplan', erstelltVon: QM_PRUEFER,
    })
    return createMassnahme(supabase, {
      organizationId: ORG, planId: plan.id, kategorie: 'sonstiges',
      titel: 'Nachdokumentation', erstelltVon: QM_PRUEFER,
    })
  }

  it('verknuepft eine bestehende Massnahme mit dem Befund', async () => {
    const { befund } = await visiteMitAbweichung()
    const massnahme = await pflegeMassnahme()

    const nachher = await verknuepfeMassnahme(supabase, befund.id, ORG, massnahme.id)
    expect(nachher.massnahme_id).toBe(massnahme.id)
  })

  it('DAS QM LEGT KEINE MASSNAHME AN — es beantragt sie nur', async () => {
    // Der Kern der Rollentrennung, als Verhalten geprueft: der Befund
    // traegt die Bitte, der Pflegebestand bleibt unberuehrt.
    const { befund } = await visiteMitAbweichung()
    expect(befund.massnahme_beantragt).toBe(true)
    expect(befund.massnahme_id).toBeNull()

    const { rows } = await db.query('SELECT id FROM pflege_massnahmen')
    expect(rows).toHaveLength(0)
  })

  it('weist eine Massnahme aus einem fremden Mandanten ab', async () => {
    const { befund } = await visiteMitAbweichung()
    const massnahme = await pflegeMassnahme()

    await expect(verknuepfeMassnahme(supabase, befund.id, FREMD_ORG, massnahme.id))
      .rejects.toThrow(/Befund nicht gefunden/)
    await expect(verknuepfeMassnahme(supabase, befund.id, ORG, '00000000-0000-4000-8000-00000000dead'))
      .rejects.toThrow(/Maßnahme nicht gefunden/)
  })

  it('haelt die Erledigung fest und nimmt den Befund aus der Arbeitsliste', async () => {
    const { befund } = await visiteMitAbweichung()
    expect(await listOffeneAbweichungen(supabase, ORG)).toHaveLength(1)

    await verknuepfeMassnahme(supabase, befund.id, ORG, null, HEUTE)
    expect(await listOffeneAbweichungen(supabase, ORG)).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Arbeitsliste und Kennzahlen', () => {
  it('fuehrt offene Abweichungen mit Klientenbezug', async () => {
    const { visite, befund } = await visiteMitAbweichung()
    const offen = await listOffeneAbweichungen(supabase, ORG)

    expect(offen).toHaveLength(1)
    expect(offen[0].befund.id).toBe(befund.id)
    expect(offen[0].visiteId).toBe(visite.id)
    expect(offen[0].clientId).toBe(KLIENT)
    expect(offen[0].ueberfaellig).toBe(false)
  })

  it('markiert eine gerissene Frist als ueberfaellig', async () => {
    await visiteMitAbweichung(GESTERN)
    const offen = await listOffeneAbweichungen(supabase, ORG)
    expect(offen[0].ueberfaellig).toBe(true)
  })

  it('fuehrt erfuellte Pruefpunkte NICHT als Abweichung', async () => {
    // Gegenprobe: waere der Filter falsch, staende die halbe Checkliste
    // als offener Vorgang in der Liste.
    await visiteMitBefund()
    expect(await listOffeneAbweichungen(supabase, ORG)).toHaveLength(0)
  })

  it('zaehlt die eigene Pruefleistung, nicht fremde Bestaende', async () => {
    // Der Unterschied zu lib/analytics/quality.ts: dort wird gezaehlt, wie
    // viele Wunden es gibt. Hier: wie viel geprueft wurde und was dabei
    // herauskam.
    await abgeschlosseneVisite()
    await visiteMitBefund()                       // bleibt offen

    const k = await berechneVisitenKennzahlen(supabase, ORG)
    expect(k.gesamt).toBe(2)
    expect(k.abgeschlossen).toBe(1)
    expect(k.offen).toBe(1)
    expect(k.mitAbweichung).toBe(1)
    expect(k.ohneBeanstandung).toBe(0)
    expect(k.offeneAbweichungen).toBe(1)
    expect(k.ueberfaelligeAbweichungen).toBe(0)
  })

  it('grenzt die Kennzahlen auf einen Zeitraum ein', async () => {
    await planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, geplantAm: '2026-01-15', erstelltVon: QM_PRUEFER,
    })
    await planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, geplantAm: '2026-06-15', erstelltVon: QM_PRUEFER,
    })

    const k = await berechneVisitenKennzahlen(supabase, ORG, { von: '2026-01-01', bis: '2026-03-31' })
    expect(k.gesamt).toBe(1)
  })

  it('ein fremder Mandant sieht weder Visiten noch Abweichungen noch Kennzahlen', async () => {
    await visiteMitAbweichung()

    expect(await listVisiten(supabase, { organizationId: FREMD_ORG })).toHaveLength(0)
    expect(await listOffeneAbweichungen(supabase, FREMD_ORG)).toHaveLength(0)
    expect((await berechneVisitenKennzahlen(supabase, FREMD_ORG)).gesamt).toBe(0)
  })

  it('filtert nach Status, Art und offenen Vorgaengen', async () => {
    await abgeschlosseneVisite()
    await planeVisite(supabase, {
      organizationId: ORG, clientId: KLIENT, visiteTyp: 'nachvisite',
      geplantAm: MORGEN, erstelltVon: QM_PRUEFER,
    })

    expect(await listVisiten(supabase, { organizationId: ORG, status: 'abgeschlossen' })).toHaveLength(1)
    expect(await listVisiten(supabase, { organizationId: ORG, visiteTyp: 'nachvisite' })).toHaveLength(1)
    expect(await listVisiten(supabase, { organizationId: ORG, nurOffen: true })).toHaveLength(1)
  })
})
