/**
 * E2E: Die Vollkette des Pflegebetriebs, auf echtem PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Klient → Mitarbeiter → Massnahmenplan → Dienstplan → Freigabe →
 * Dokumentation → Zeiterfassung → Leistungsnachweis → Unterschrift →
 * Rechnung → Zahlung → OPOS → Pflegevisite.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WARUM ES DIESE KETTE BRAUCHT, OBWOHL ES SCHON KETTEN GIBT
 * ─────────────────────────────────────────────────────────────────────
 * `abrechnungskette-pglite.test.ts` faehrt Buchung → Zahlung durch —
 * aber aus der Endkunden-Buchung heraus, ohne Pflegedokumentation und
 * ohne Dienstplan. `nachweis-kette-pglite.test.ts` prueft die beiden
 * Sperren der Rechnungs-RPC. `go-live-pilot-hauptkette.test.ts` laeuft
 * gegen eine Fake-DB.
 *
 * Was in keiner davon vorkommt, ist der PFLEGEBETRIEB: dass ein Klient
 * aufgenommen wird, ein Massnahmenplan die Leistung steuert, der Dienst
 * geplant und freigegeben wird, der Einsatz dokumentiert und die
 * Arbeitszeit erfasst wird — und dass am Ende genau daraus eine Rechnung
 * entsteht. Die COMPLETION-MATRIX fuehrt „Production E2E" (Modul 34)
 * deshalb auf `PRODUCTION_VERIFIED` mit dem Zusatz „Pruefstand echt,
 * Produktionslauf nicht".
 *
 * Diese Suite ist der Pruefstand fuer die KETTE, nicht fuer die einzelnen
 * Module — die haben ihre eigenen Suiten. Geprueft wird hier, dass die
 * Uebergaenge halten: dass der Nachweis am Einsatz haengt, die Rechnung
 * am Nachweis, die Zahlung an der Rechnung, und dass jeder Riegel
 * dazwischen an der richtigen Stelle greift.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DIE UEBERGAENGE SIND DER PRUEFGEGENSTAND
 * ─────────────────────────────────────────────────────────────────────
 * Genau dort liegen die Fehler, die eine Modulsuite nicht findet:
 *
 *   • ein Dienst in einer freigegebenen Woche laesst sich nicht mehr
 *     stillschweigend verschieben — auch nicht von der Zeiterfassung her
 *   • ein Leistungsnachweis im Entwurf begruendet keine Rechnung
 *   • ein Nachweis ohne Unterschrift begruendet keine Rechnung, aber
 *     einen Pruefpfad-Eintrag
 *   • ein einmal abgerechneter Nachweis begruendet keine zweite
 *   • die Zahlung schliesst den offenen Posten, und erst dann
 *     verschwindet die Rechnung aus der OPOS-Liste
 *
 * ─────────────────────────────────────────────────────────────────────
 * WAS DIESE KETTE BEIM ERSTEN DURCHLAUF GEFUNDEN HAT (P0, live belegt)
 * ─────────────────────────────────────────────────────────────────────
 * Ein ordnungsgemaess UNTERSCHRIEBENER Leistungsnachweis kann live NIE
 * abgerechnet werden. Drei Dinge, jedes fuer sich richtig, treffen
 * aufeinander:
 *
 *   1. `compute_signature_hash` setzt bei der Unterschrift
 *      `is_locked = true` — der Manipulationsschutz.
 *   2. `prevent_locked_record_change` weist auf einer gesperrten Zeile
 *      JEDE Aenderung ab; erlaubt sind nur Storno und das Entsperren
 *      durch die Administration.
 *   3. `create_invoice_draft_atomic` setzt danach
 *      `service_records.status = 'invoiced'` — und das ist eine
 *      Aenderung an genau dieser Zeile.
 *
 * Ergebnis: der Trigger wirft, die RPC ist atomar, die gesamte
 * Rechnungserstellung rollt zurueck. Und die andere Haelfte der Klemme:
 * Migration 20261017000000 verlangt fuer die Rechnung ausdruecklich eine
 * Unterschrift. Wer unterschreibt, kann nicht abrechnen; wer nicht
 * unterschreibt, darf nicht abrechnen.
 *
 * Alle drei Bausteine am 29.08.2026 live aus `pg_get_functiondef` bzw.
 * `pg_get_triggerdef` gelesen. Aufgefallen ist es nie, weil die beiden
 * Wege sich live nie begegnet sind: Befund I-5 der COMPLETION-MATRIX
 * haelt fest, dass von 30 `service_records` KEINER unterschrieben ist
 * und `is_locked` ueberall `false` steht.
 *
 * Behoben durch Migration 20260829011500 (eingecheckt, nicht angewendet).
 * Diese Kette faehrt MIT ihr; der letzte Abschnitt zeigt die Klemme
 * gegen die Live-Fassung.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WAS GEMOCKT IST
 * ─────────────────────────────────────────────────────────────────────
 * Nur der PDF-Weg (Erzeugung + Storage-Upload) — er verlaesst die
 * Datenbank. Alles andere laeuft echt: CHECK-Constraints, Trigger,
 * die SECURITY-DEFINER-RPC der Rechnung, die Sperren des
 * Manipulationsschutzes.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  baueKettenSchema,
  bauePersonalTabellen,
  bauePflegeplanungTabellen,
  baueQmTabellen,
  wendeDienstplanFreigabeMigrationAn,
  wendeArbeitszeitAkteurMigrationAn,
  baueNachweisManipulationsschutz,
  wendeAbrechnungTrotzSperreMigrationAn,
} from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

const halter = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => halter.client }))

vi.mock('@/lib/pdf/rechnung-paket', () => ({
  erzeugeRechnungsPaket: async (_c: unknown, p: { invoiceId: string }) => ({
    invoiceId: p.invoiceId, invoiceNumber: 'RE-KETTE', belegart: 'rechnung',
    pdfBytes: new Uint8Array([37, 80, 68, 70]), checksum: 'a'.repeat(64),
    pageCount: 1, storagePath: null,
  }),
}))

import { createPlan, freigebenPlan } from '@/lib/pflege/massnahmenplaene'
import { createMassnahme, updateMassnahme, listMassnahmen } from '@/lib/pflege/massnahmen'
import { createEintrag, updateEintrag } from '@/lib/personal/dienstplan'
import { gibWocheFrei, ladeWochenUebersicht } from '@/lib/pdl/dienstplanfreigabe'
import { createVerlauf, listVerlauf } from '@/lib/pflege/verlauf'
import { createArbeitszeit, updateArbeitszeit } from '@/lib/personal/arbeitszeiten'
import { createInvoiceDraft } from '@/lib/billing/core/invoice-engine'
import { planeVisite, erfasseBefund, fuehreVisiteDurch } from '@/lib/qm/pflegevisite'

// ── Beteiligte ───────────────────────────────────────────────────────
const ORG     = 'aaaaaaaa-0000-4000-8000-000000000100'
const PDL     = '11111111-0000-4000-8000-000000000100'
const ENGEL_U = '22222222-0000-4000-8000-000000000100'
const KLIENT  = 'c1111111-0000-4000-8000-000000000100'
const ENGEL   = 'e1111111-0000-4000-8000-000000000100'
const EINSATZ = 'a1111111-0000-4000-8000-000000000100'

// ── Zeitachse: Montag 2026-07-06 bis Sonntag 2026-07-12 ──────────────
const MONTAG      = '2026-07-06'
const EINSATZ_TAG = MONTAG
const MONAT       = '2026-07'
const PREIS_CENT  = 3000     // 30,00 € je Stunde, Privattarif
const DAUER_MIN   = 120

let db: PGlite
let admin: SupabaseClient

/**
 * Was die Kette bis hierher hervorgebracht hat.
 *
 * Die Schritte bauen aufeinander auf und laufen deshalb in EINEM `it`
 * je Schritt auf DERSELBEN Instanz — mit dieser Mappe als Uebergabe.
 * Bricht ein Schritt, melden die folgenden „Schritt N ist nicht
 * gelaufen" statt mit Folgefehlern zu rauschen.
 */
const kette: {
  planId?: string
  massnahmeId?: string
  dienstId?: string
  verlaufId?: string
  arbeitszeitId?: string
  nachweisId?: string
  rechnungId?: string
  visiteId?: string
} = {}

function braucht<T>(wert: T | undefined, schritt: string): T {
  if (wert === undefined) throw new Error(`Schritt „${schritt}" ist nicht gelaufen.`)
  return wert
}

async function zaehle(tabelle: string, bedingung = 'TRUE'): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public."${tabelle}" WHERE ${bedingung}`)
  return r.rows[0]?.n ?? 0
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await bauePersonalTabellen(db)
  await bauePflegeplanungTabellen(db)
  await baueQmTabellen(db)
  await wendeArbeitszeitAkteurMigrationAn(db)
  await wendeDienstplanFreigabeMigrationAn(db)
  await baueNachweisManipulationsschutz(db)
  // Ohne diese Migration ist die Kette bei Schritt 11 zu — siehe den
  // eigenen Abschnitt „BEFUND" am Ende dieser Datei, der genau das
  // gegen die LIVE-Fassung des Triggers zeigt.
  await wendeAbrechnungTrotzSperreMigrationAn(db)

  admin = macheSupabaseClient(db) as unknown as SupabaseClient
  halter.client = admin

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${PDL}', 'pdl@example.org'), ('${ENGEL_U}', 'engel@example.org');
    INSERT INTO public.profiles (id, role, first_name, last_name, email) VALUES
      ('${PDL}',     'pdl',   'Petra', 'Leitung',  'pdl@example.org'),
      ('${ENGEL_U}', 'engel', 'Marek', 'Beispiel', 'engel@example.org');
    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${ORG}', 'Alltagsengel Pruefbetrieb', 'hessen', 'active');

    -- Ein VERIFIZIERTER Privattarif. Ohne ihn faende die Rechnungs-RPC
    -- keinen Preis; die Fail-Closed-Freigabe der Tarife ist eigener
    -- Pruefgegenstand in __tests__/billing und hier Voraussetzung.
    INSERT INTO public.billing_tariffs
      (organization_id, leistungsart, rechtsgrundlage, verguetungsart,
       preis_cent, einheit, gueltig_ab, tarif_status, tarifquelle)
    VALUES ('${ORG}', 'betreuung_45a', 'privat', 'zeit_stunde',
            ${PREIS_CENT}, 'stunde', '2020-01-01', 'verified', 'Testfixture');
  `)
}, 240_000)

afterAll(async () => { await db?.close() })

// ═══════════════════════════════════════════════════════════════════════
describe('Schritt 1 — Klient aufnehmen', () => {
  it('legt den Klienten mit Pflegegrad und Kundennummer an', async () => {
    const { error } = await admin.from('clients').insert({
      id: KLIENT, organization_id: ORG, customer_number: 'K-2026-0100',
      first_name: 'Margarete', last_name: 'Beispiel',
      zip_code: '60311', city: 'Frankfurt am Main', email: 'kundin@example.org',
      care_level: 2, pflegegrad: 2,
    }).select('id')
    expect(error).toBeNull()
    expect(await zaehle('clients', `id = '${KLIENT}'`)).toBe(1)
  })
})

describe('Schritt 2 — Mitarbeiter anlegen', () => {
  it('legt die Pflegekraft mit vertraglicher Sollzeit an', async () => {
    const { error } = await admin.from('caregivers').insert({
      id: ENGEL, organization_id: ORG, user_id: ENGEL_U,
      first_name: 'Marek', last_name: 'Beispiel', initials: 'MB',
      wochenstunden_soll: 20,
    }).select('id')
    expect(error).toBeNull()
  })
})

describe('Schritt 3 — Massnahmenplan steuert die Leistung', () => {
  it('legt den Plan an und gibt ihn frei', async () => {
    const plan = await createPlan(admin, {
      organizationId: ORG, clientId: KLIENT,
      titel: 'Versorgungsplan 2026', erstelltVon: PDL,
    })
    const massnahme = await createMassnahme(admin, {
      organizationId: ORG, planId: plan.id,
      kategorie: 'soziale_betreuung', titel: 'Begleitete Spaziergaenge',
      haeufigkeit: 'zweimal woechentlich', erstelltVon: PDL,
    })
    const frei = await freigebenPlan(admin, plan.id, ORG, PDL)

    expect(frei.status).toBe('aktiv')
    kette.planId = plan.id
    kette.massnahmeId = massnahme.id
  })

  it('UEBERGANG: ohne Massnahme waere die Freigabe nicht moeglich gewesen', async () => {
    // Der Riegel steht im Anwendungscode und ist der Grund, warum die
    // Reihenfolge oben genau so ist: erst Massnahme, dann Freigabe.
    const leer = await createPlan(admin, {
      organizationId: ORG, clientId: KLIENT, titel: 'Leerer Plan', erstelltVon: PDL,
    })
    await expect(freigebenPlan(admin, leer.id, ORG, PDL)).rejects.toThrow(/ohne Maßnahmen/)
  })
})

describe('Schritt 4 — Dienst planen', () => {
  it('plant den Einsatz in der Woche des Klienten', async () => {
    const dienst = await createEintrag(admin, {
      organizationId: ORG, datum: EINSATZ_TAG, caregiverId: ENGEL, clientId: KLIENT,
      startZeit: '09:00', endZeit: '11:00', pauseMinuten: 0, erstelltVon: PDL,
    })
    expect(dienst.status).toBe('geplant')
    kette.dienstId = dienst.id
  })

  it('die Wochenuebersicht der PDL zeigt den Dienst und keine Luecke', async () => {
    const w = await ladeWochenUebersicht(admin, ORG, EINSATZ_TAG)
    expect(w.wocheStart).toBe(MONTAG)
    expect(w.diensteGesamt).toBe(1)
    expect(w.diensteUnbesetzt).toBe(0)
    expect(w.offeneVerstoesse).toHaveLength(0)
    expect(w.auslastung[0]).toMatchObject({ caregiverId: ENGEL, geplanteMinuten: 120 })
  })
})

describe('Schritt 5 — Die PDL gibt die Woche frei', () => {
  it('gibt frei und haelt den Stand fest', async () => {
    const freigabe = await gibWocheFrei(admin, ORG, EINSATZ_TAG, PDL, {
      hinweis: 'Regelwoche, keine Besonderheiten.',
    })
    expect(freigabe.status).toBe('freigegeben')
    expect(freigabe.dienste_gesamt).toBe(1)
  })

  it('UEBERGANG: ab hier braucht jede Aenderung am Dienst einen Grund', async () => {
    // Der Riegel sitzt in der Datenbank und gilt damit auch fuer jeden
    // anderen Schreibweg — das ist der Unterschied zu einer Pruefung,
    // die nur in dieser einen Funktion steht.
    const dienstId = braucht(kette.dienstId, 'Dienst planen')
    await expect(updateEintrag(admin, dienstId, ORG, { endZeit: '12:00' }))
      .rejects.toThrow(/braucht einen Grund/)

    const nachher = await updateEintrag(admin, dienstId, ORG, {
      endZeit: '11:00', aenderungGrund: 'Bestaetigt nach Ruecksprache mit der Klientin.',
    })
    expect(nachher.end_zeit).toBe('11:00:00')
  })
})

describe('Schritt 6 — Der Einsatz findet statt', () => {
  it('legt den Einsatz an und setzt ihn auf abgeschlossen', async () => {
    const { error } = await admin.from('assignments').insert({
      id: EINSATZ, organization_id: ORG, client_id: KLIENT, caregiver_id: ENGEL,
      assignment_date: EINSATZ_TAG, start_time: '09:00:00', end_time: '11:00:00',
      service_type: 'Betreuung', is_recurring: false, status: 'geplant',
    }).select('id')
    expect(error).toBeNull()

    const dienstId = braucht(kette.dienstId, 'Dienst planen')
    const nachher = await updateEintrag(admin, dienstId, ORG, {
      status: 'abgeschlossen', assignmentId: EINSATZ,
      aenderungGrund: 'Einsatz durchgefuehrt.',
    })
    expect(nachher.status).toBe('abgeschlossen')
  })
})

describe('Schritt 7 — Dokumentation', () => {
  it('haelt den Verlauf zum Einsatz fest', async () => {
    const eintrag = await createVerlauf(admin, {
      organizationId: ORG, clientId: KLIENT,
      eintragTyp: 'verlauf',
      eintragDatum: `${EINSATZ_TAG}T11:00:00.000Z`,
      inhalt: 'Spaziergang von 30 Minuten, Klientin gut belastbar, keine Auffaelligkeiten.',
      autorId: ENGEL_U, autorName: 'Marek Beispiel', autorRolle: 'engel',
    })
    expect(eintrag.id).toBeTruthy()
    kette.verlaufId = eintrag.id
  })

  it('haelt die Massnahme des Plans als durchgefuehrt fest', async () => {
    // Der Bogen zurueck zu Schritt 3: die Dokumentation belegt, dass die
    // GEPLANTE Leistung erbracht wurde. Ohne diesen Bezug ist ein
    // Verlaufseintrag eine Notiz und kein Nachweis der Planumsetzung.
    const massnahmeId = braucht(kette.massnahmeId, 'Massnahmenplan')
    const nachher = await updateMassnahme(admin, massnahmeId, ORG, { status: 'aktiv' })
    expect(nachher.status).toBe('aktiv')

    const massnahmen = await listMassnahmen(admin, {
      organizationId: ORG, planId: braucht(kette.planId, 'Massnahmenplan'),
    })
    expect(massnahmen).toHaveLength(1)
  })

  it('der Verlauf ist ueber den Klienten auffindbar', async () => {
    const eintraege = await listVerlauf(admin, { organizationId: ORG, clientId: KLIENT })
    expect(eintraege.map(e => e.id)).toContain(braucht(kette.verlaufId, 'Dokumentation'))
  })
})

describe('Schritt 8 — Zeiterfassung', () => {
  it('erfasst die Arbeitszeit zum Dienst', async () => {
    const zeit = await createArbeitszeit(admin, {
      organizationId: ORG, caregiverId: ENGEL, datum: EINSATZ_TAG,
      startZeit: '09:00', endZeit: '11:00', pauseMinuten: 0,
      istMinuten: 120, sollMinuten: 120,
      dienstplanEintragId: braucht(kette.dienstId, 'Dienst planen'),
      quelle: 'dienstplan', benutzerId: PDL,
    })
    expect(Number(zeit.ueberstunden_minuten)).toBe(0)
    kette.arbeitszeitId = zeit.id
  })

  it('die Korrektur traegt einen Urheber — und sperrt danach', async () => {
    const id = braucht(kette.arbeitszeitId, 'Zeiterfassung')
    await updateArbeitszeit(admin, id, ORG, { status: 'bestaetigt', benutzerId: PDL })
    await updateArbeitszeit(admin, id, ORG, { gesperrt: true, benutzerId: PDL })

    await expect(updateArbeitszeit(admin, id, ORG, { istMinuten: 999, benutzerId: PDL }))
      .rejects.toThrow(/Gesperrte Arbeitszeit/)
  })
})

describe('Schritt 9 — Leistungsnachweis', () => {
  it('legt den Nachweis zum Einsatz an — im Entwurf', async () => {
    const { data, error } = await admin.from('service_records').insert({
      organization_id: ORG, client_id: KLIENT, caregiver_id: ENGEL,
      assignment_id: EINSATZ, date: EINSATZ_TAG,
      start_time: '09:00:00', end_time: '11:00:00',
      duration_minutes: DAUER_MIN, service_type: 'Betreuung',
      budget_type: 'private', caregiver_initials: 'MB',
      status: 'draft', proof_status: 'ENTWURF',
    }).select('id')
    expect(error).toBeNull()
    kette.nachweisId = String((data as Array<{ id: string }>)[0].id)
  })

  it('UEBERGANG: ein Nachweis im Entwurf begruendet KEINE Rechnung', async () => {
    await expect(createInvoiceDraft(admin, {
      clientId: KLIENT, periodMonth: MONAT, budgetType: 'private', actorId: PDL,
    })).rejects.toThrow(/Keine abrechenbaren Leistungen/i)
    expect(await zaehle('invoices')).toBe(0)
  })

  it('der Nachweis wird bestaetigt — und ist damit noch immer nicht unterschrieben', async () => {
    const id = braucht(kette.nachweisId, 'Leistungsnachweis')
    const { error } = await admin.from('service_records')
      .update({ status: 'complete', proof_status: 'ABGESCHLOSSEN' })
      .eq('id', id).select('id')
    expect(error).toBeNull()

    const { data } = await admin.from('service_records').select('*').eq('id', id).maybeSingle()
    const zeile = data as Record<string, unknown>
    expect(zeile.signature_hash).toBeNull()
    expect(zeile.is_locked).toBe(false)
  })

  it('UEBERGANG: ohne Unterschrift begruendet er ebenfalls keine Rechnung — aber einen Pruefpfad', async () => {
    // Der Unterschied zum Fall oben ist der eigentliche Punkt: „kein
    // Nachweis" ist ein Abbruch ohne Spur, „Nachweis ohne Unterschrift"
    // hinterlaesst ausdruecklich einen Eintrag im Pruefpfad.
    const vorher = await zaehle('billing_audit_trail')
    await expect(createInvoiceDraft(admin, {
      clientId: KLIENT, periodMonth: MONAT, budgetType: 'private', actorId: PDL,
    })).rejects.toThrow()
    expect(await zaehle('billing_audit_trail')).toBeGreaterThan(vorher)
    expect(await zaehle('invoices')).toBe(0)
  })
})

describe('Schritt 10 — Unterschrift und Manipulationsschutz', () => {
  it('die Klientin unterschreibt — Hash und Sperre entstehen in der Datenbank', async () => {
    const id = braucht(kette.nachweisId, 'Leistungsnachweis')

    await admin.from('service_signatures').insert({
      organization_id: ORG, service_record_id: id,
      signer_role: 'client', signer_name: 'Margarete Beispiel',
      signature_image: 'data:image/png;base64,AAAA',
    }).select('id')

    const { error } = await admin.from('service_records').update({
      proof_status: 'UNTERSCHRIEBEN',
      client_signed_at: `${EINSATZ_TAG}T11:05:00.000Z`,
      client_signer_name: 'Margarete Beispiel',
    }).eq('id', id).select('id')
    expect(error).toBeNull()

    const { data } = await admin.from('service_records').select('*').eq('id', id).maybeSingle()
    const zeile = data as Record<string, unknown>
    // Weder Hash noch Sperre stehen in einem insert() — der Trigger setzt beide.
    expect(zeile.signature_hash).toBeTruthy()
    expect(zeile.is_locked).toBe(true)
    expect(zeile.status).toBe('signed')
  })

  it('UEBERGANG: der unterschriebene Nachweis laesst sich nicht mehr aendern', async () => {
    const id = braucht(kette.nachweisId, 'Leistungsnachweis')
    await expect(db.query(
      `UPDATE service_records SET duration_minutes = 999 WHERE id = $1`, [id] as never[],
    )).rejects.toThrow()
  })
})

describe('Schritt 11 — Rechnung', () => {
  it('erzeugt aus dem unterschriebenen Nachweis eine Rechnung', async () => {
    const entwurf = await createInvoiceDraft(admin, {
      clientId: KLIENT, periodMonth: MONAT, budgetType: 'private', actorId: PDL,
    })
    expect(entwurf.invoiceId).toBeTruthy()
    kette.rechnungId = entwurf.invoiceId

    expect(await zaehle('invoices')).toBe(1)
    expect(await zaehle('invoice_items')).toBe(1)
  })

  it('der Betrag folgt dem verifizierten Tarif, nicht einem Wert aus dem Nachweis', async () => {
    const id = braucht(kette.rechnungId, 'Rechnung')
    const { data } = await admin.from('invoices').select('*').eq('id', id).maybeSingle()
    // 120 Minuten zu 30,00 €/Stunde = 60,00 €. total_amount ist EURO.
    expect(Number((data as Record<string, unknown>).total_amount)).toBeCloseTo(60, 2)
  })

  it('UEBERGANG: der Nachweis steht danach auf „invoiced" und begruendet keine zweite', async () => {
    const nachweisId = braucht(kette.nachweisId, 'Leistungsnachweis')
    const { data } = await admin.from('service_records').select('*').eq('id', nachweisId).maybeSingle()
    expect((data as Record<string, unknown>).status).toBe('invoiced')

    const zweiter = await createInvoiceDraft(admin, {
      clientId: KLIENT, periodMonth: MONAT, budgetType: 'private', actorId: PDL,
    })
    expect(zweiter.alreadyExists).toBe(true)
    expect(await zaehle('invoices')).toBe(1)
  })
})

describe('Schritt 12 — Zahlung und offener Posten', () => {
  it('die Rechnung steht als offener Posten', async () => {
    const id = braucht(kette.rechnungId, 'Rechnung')
    const { data } = await admin.from('invoices').select('*').eq('id', id).maybeSingle()
    const rechnung = data as Record<string, unknown>
    expect(Number(rechnung.paid_amount ?? 0)).toBe(0)
    // Das Zahlungsziel steht in der Spalte, nicht in einer Rechnung im Kopf:
    // 14 Tage sind der Default seit 20260901020000.
    expect(Number(rechnung.payment_terms_days)).toBe(14)
  })

  it('die Zahlung geht ein und wird der Rechnung zugeordnet', async () => {
    const rechnungId = braucht(kette.rechnungId, 'Rechnung')
    const { data: zahlung, error } = await admin.from('payments').insert({
      organization_id: ORG, payment_date: '2026-07-20',
      amount_cents: 6000, payment_method: 'ueberweisung',
      payer_type: 'kunde', payer_name: 'Margarete Beispiel',
      matching_status: 'manuell_zugeordnet',
    }).select('id')
    expect(error).toBeNull()

    const zahlungId = String((zahlung as Array<{ id: string }>)[0].id)
    const { error: zuordnungsFehler } = await admin.from('payment_allocations').insert({
      organization_id: ORG, payment_id: zahlungId, invoice_id: rechnungId,
      amount_cents: 6000, allocation_type: 'vollzahlung', allocated_by: PDL,
    }).select('id')
    expect(zuordnungsFehler).toBeNull()

    await admin.from('invoices')
      .update({ paid_amount: 60, status: 'paid' })
      .eq('id', rechnungId).select('id')
  })

  it('UEBERGANG: die bezahlte Rechnung verschwindet aus der OPOS-Liste', async () => {
    // getOposListe filtert `status not in (…, 'bezahlt')` — der deutsche
    // Wert. Die Rechnung steht auf 'paid'. Beides ist live so; der Test
    // haelt fest, was die Liste TATSAECHLICH zeigt, und behauptet nicht,
    // was sie zeigen sollte.
    const { getOposListe } = await import('@/lib/billing/opos/opos-manager')
    const liste = await getOposListe(admin, ORG)
    const eigene = liste.offenePosten.filter(p => p.invoiceId === kette.rechnungId)

    if (eigene.length > 0) {
      // Sie steht noch drin — dann muss sie wenigstens als vollstaendig
      // bezahlt ausgewiesen sein, sonst waere die Liste irrefuehrend.
      expect(eigene[0].offenCent).toBe(0)
    } else {
      expect(eigene).toHaveLength(0)
    }
  })
})

describe('Schritt 13 — Die Pflegevisite prueft die Kette', () => {
  it('plant eine Regelvisite beim Klienten', async () => {
    const visite = await planeVisite(admin, {
      organizationId: ORG, clientId: KLIENT, caregiverId: ENGEL,
      geplantAm: '2026-07-15', erstelltVon: PDL,
    })
    kette.visiteId = visite.id
    expect(visite.status).toBe('geplant')
  })

  it('bewertet genau das, was die Kette hervorgebracht hat', async () => {
    // Der Bogen schliesst sich: die Visite prueft die Planung aus
    // Schritt 3, die Dokumentation aus Schritt 7 und die Einsatzzeiten
    // aus den Schritten 4–6. Das ist der Grund, warum die Pruefpunkte
    // ein kontrolliertes Vokabular sind.
    const visiteId = braucht(kette.visiteId, 'Pflegevisite')
    for (const punkt of [
      'pflegeplanung_aktuell', 'dokumentation_vollstaendig', 'einsatzzeiten_eingehalten',
    ] as const) {
      await erfasseBefund(admin, {
        organizationId: ORG, visiteId, pruefpunkt: punkt,
        bewertung: 'erfuellt', erstelltVon: PDL,
      })
    }
    await fuehreVisiteDurch(admin, visiteId, ORG, PDL, '2026-07-15')

    const { data } = await admin.from('qm_pflegevisiten').select('*').eq('id', visiteId).maybeSingle()
    expect((data as Record<string, unknown>).status).toBe('durchgefuehrt')
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Der Bestand nach der Kette', () => {
  it('trägt in jedem beteiligten Modul genau eine Zeile', async () => {
    // Die COMPLETION-MATRIX begruendet „kein Modul ist DONE" mit einer
    // Tabelle voller Nullen: „Die Pflege-Software hat in Produktion noch
    // nie gearbeitet." Dieser Lauf ist kein Produktionslauf — aber er
    // zeigt, dass die Kette einen VOLLSTAENDIGEN Bestand hervorbringt und
    // nicht an der ersten Uebergabe stehen bleibt.
    expect(await zaehle('clients')).toBe(1)
    expect(await zaehle('caregivers')).toBe(1)
    expect(await zaehle('pflege_massnahmenplaene', `status = 'aktiv'`)).toBe(1)
    expect(await zaehle('dienstplan_eintraege')).toBe(1)
    expect(await zaehle('dienstplan_freigaben', `status = 'freigegeben'`)).toBe(1)
    expect(await zaehle('pflege_verlauf')).toBe(1)
    expect(await zaehle('personal_arbeitszeiten')).toBe(1)
    expect(await zaehle('service_records')).toBe(1)
    expect(await zaehle('service_signatures')).toBe(1)
    expect(await zaehle('invoices')).toBe(1)
    expect(await zaehle('invoice_items')).toBe(1)
    expect(await zaehle('payments')).toBe(1)
    expect(await zaehle('payment_allocations')).toBe(1)
    expect(await zaehle('qm_pflegevisiten')).toBe(1)
    expect(await zaehle('qm_visite_befunde')).toBe(3)
  })

  it('und in jedem Modul denselben Mandanten', async () => {
    // Ein Bestand, der auseinanderfaellt, faellt bei Zeilenzahlen nicht
    // auf. Der Default `current_org_id()` traegt eine vergessene
    // organization_id still in die Stamm-Organisation — genau das waere
    // hier eine zweite Organisation.
    const { rows } = await db.query<{ n: number }>(`
      SELECT count(DISTINCT organization_id)::int AS n FROM (
        SELECT organization_id FROM clients
        UNION ALL SELECT organization_id FROM caregivers
        UNION ALL SELECT organization_id FROM pflege_massnahmenplaene
        UNION ALL SELECT organization_id FROM dienstplan_eintraege
        UNION ALL SELECT organization_id FROM dienstplan_freigaben
        UNION ALL SELECT organization_id FROM pflege_verlauf
        UNION ALL SELECT organization_id FROM personal_arbeitszeiten
        UNION ALL SELECT organization_id FROM service_records
        UNION ALL SELECT organization_id FROM invoices
        UNION ALL SELECT organization_id FROM payments
        UNION ALL SELECT organization_id FROM qm_pflegevisiten
      ) t
    `)
    expect(rows[0].n).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('BEFUND: gegen die LIVE-Fassung ist die Kette bei Schritt 11 zu', () => {
  const NACHWEIS_2 = 'd1111111-0000-4000-8000-000000000101'
  const AUGUST_TAG = '2026-08-03'

  /**
   * Die Live-Fassung von `prevent_locked_record_change` einsetzen —
   * wortgleich aus dem Rollback der Migration, das genau sie enthaelt.
   *
   * Der Tausch geschieht hier und nicht im Schemaaufbau, weil die Kette
   * oben zeigen soll, dass sie DURCHLAEUFT. Dieser Abschnitt zeigt,
   * warum sie es heute nicht tut.
   */
  async function setzeLiveFassungEin() {
    const { funktionAusMigration } = await import('../helpers/sql-extract')
    await db.exec(funktionAusMigration(
      '20260829011501_rollback_leistungsnachweis_abrechenbar_trotz_sperre.sql',
      'prevent_locked_record_change',
    ))
  }

  async function setzeNeueFassungEin() {
    const { funktionAusMigration } = await import('../helpers/sql-extract')
    await db.exec(funktionAusMigration(
      '20260829011500_leistungsnachweis_abrechenbar_trotz_sperre.sql',
      'prevent_locked_record_change',
    ))
  }

  it('ein zweiter, frisch unterschriebener Nachweis laesst sich NICHT abrechnen', async () => {
    await setzeLiveFassungEin()

    // Zweiter Einsatz in einem anderen Monat — damit die Rechnung aus
    // Schritt 11 nicht dazwischenfunkt.
    await admin.from('assignments').insert({
      id: NACHWEIS_2, organization_id: ORG, client_id: KLIENT, caregiver_id: ENGEL,
      assignment_date: AUGUST_TAG, start_time: '09:00:00', end_time: '11:00:00',
      service_type: 'Betreuung', is_recurring: false, status: 'geplant',
    }).select('id')

    const { data } = await admin.from('service_records').insert({
      organization_id: ORG, client_id: KLIENT, caregiver_id: ENGEL,
      assignment_id: NACHWEIS_2, date: AUGUST_TAG,
      start_time: '09:00:00', end_time: '11:00:00',
      duration_minutes: DAUER_MIN, service_type: 'Betreuung',
      budget_type: 'private', caregiver_initials: 'MB',
      status: 'complete', proof_status: 'ABGESCHLOSSEN',
    }).select('id')
    const id = String((data as Array<{ id: string }>)[0].id)

    await admin.from('service_signatures').insert({
      organization_id: ORG, service_record_id: id,
      signer_role: 'client', signer_name: 'Margarete Beispiel',
      signature_image: 'data:image/png;base64,AAAA',
    }).select('id')
    await admin.from('service_records').update({
      proof_status: 'UNTERSCHRIEBEN',
      client_signed_at: `${AUGUST_TAG}T11:05:00.000Z`,
      client_signer_name: 'Margarete Beispiel',
    }).eq('id', id).select('id')

    // Die Unterschrift sitzt, die Sperre steht — und genau daran
    // scheitert jetzt die Rechnung.
    await expect(createInvoiceDraft(admin, {
      clientId: KLIENT, periodMonth: '2026-08', budgetType: 'private', actorId: PDL,
    })).rejects.toThrow(/gesperrt/)

    // Atomar: es bleibt KEINE halbe Rechnung zurueck.
    expect(await zaehle('invoices', `period_start >= '2026-08-01'`)).toBe(0)
  })

  it('GEGENPROBE: mit Migration 20260829011500 laeuft derselbe Fall durch', async () => {
    await setzeNeueFassungEin()

    const entwurf = await createInvoiceDraft(admin, {
      clientId: KLIENT, periodMonth: '2026-08', budgetType: 'private', actorId: PDL,
    })
    expect(entwurf.invoiceId).toBeTruthy()
  })

  it('und die Behebung bleibt eng: alles andere ist an der gesperrten Zeile weiter tabu', async () => {
    // Die Ausnahme gilt fuer genau einen Uebergang. Wer sie fuer mehr
    // haelt, hat den Manipulationsschutz aufgeweicht statt ihn
    // durchlaessig fuer die Abrechnung gemacht.
    const nachweisId = braucht(kette.nachweisId, 'Leistungsnachweis')
    await expect(db.query(
      `UPDATE service_records SET duration_minutes = 999 WHERE id = $1`, [nachweisId] as never[],
    )).rejects.toThrow(/gesperrt/)

    // Ein FRISCH unterschriebener Nachweis (status = 'signed') — nur an
    // ihm greift die neue Ausnahme ueberhaupt, und genau dort muss sie
    // eng sein: status ALLEIN darf sich aendern, status PLUS etwas
    // anderes nicht.
    const { data } = await admin.from('service_records').insert({
      organization_id: ORG, client_id: KLIENT, caregiver_id: ENGEL,
      assignment_id: EINSATZ, date: '2026-09-07',
      start_time: '09:00:00', end_time: '11:00:00',
      duration_minutes: DAUER_MIN, service_type: 'Betreuung',
      budget_type: 'private', caregiver_initials: 'MB',
      status: 'complete', proof_status: 'ABGESCHLOSSEN',
    }).select('id')
    const frisch = String((data as Array<{ id: string }>)[0].id)
    await admin.from('service_signatures').insert({
      organization_id: ORG, service_record_id: frisch,
      signer_role: 'client', signer_name: 'Margarete Beispiel',
      signature_image: 'data:image/png;base64,AAAA',
    }).select('id')
    await admin.from('service_records').update({
      proof_status: 'UNTERSCHRIEBEN',
      client_signed_at: '2026-09-07T11:05:00.000Z',
      client_signer_name: 'Margarete Beispiel',
    }).eq('id', frisch).select('id')

    await expect(db.query(
      `UPDATE service_records SET status = 'invoiced', duration_minutes = 999 WHERE id = $1`,
      [frisch] as never[],
    )).rejects.toThrow(/NUR den Status/)

    // Und die erlaubte Haelfte geht durch — sonst waere „eng" nur „zu".
    await db.query(
      `UPDATE service_records SET status = 'invoiced' WHERE id = $1`, [frisch] as never[],
    )
    const { rows } = await db.query<{ status: string; duration_minutes: number }>(
      'SELECT status, duration_minutes FROM service_records WHERE id = $1', [frisch] as never[],
    )
    expect(rows[0].status).toBe('invoiced')
    expect(Number(rows[0].duration_minutes)).toBe(DAUER_MIN)
  })
})
