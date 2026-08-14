/**
 * Go-Live-Pilot — Hauptkette (Phase 2, Echtbetrieb-Pilot absichern)
 *
 * Prüft den vollständigen realistischen Ablauf technisch, Ende-zu-Ende, auf
 * EINER gemeinsamen Fake-Datenbank (__tests__/e2e/helpers/fake-billing-db.ts):
 *
 *   Klient → Pflegegrad → Budget → Mitarbeiter → Buchung → Einsatz →
 *   Leistungsnachweis → Unterschrift → Tarifzuordnung → Rechnung → PDF →
 *   Zahlung → OPOS → Mahnung → Abschluss
 *
 * Anders als __tests__/e2e/billing-e2e.test.ts (isolierte Mocks je Funktion)
 * teilen sich hier alle Schritte denselben Zustand: die Rechnung, die
 * createInvoiceDraft anlegt, ist dieselbe Zeile, die freezeInvoice einfriert,
 * auf die allocatePayment eine Zahlung bucht und die getOposListe/der
 * Mahnlauf danach auswerten. Keine echten Kundendaten — alle IDs sind
 * synthetische Test-Fixtures.
 *
 * Bekannte Grenzen dieser Fake-DB (siehe Kopfkommentar der Helper-Datei):
 * DB-Trigger (is_locked-Sperre auf service_records, wf_audit_log-
 * Immutability) laufen hier NICHT — sie sind nur gegen eine echte Postgres-
 * Instanz prüfbar und werden hier bewusst nicht vorgetäuscht.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { makeFakeBillingDb, installBillingRpcSimulation, type FakeBillingDb } from './helpers/fake-billing-db'
import {
  createInvoiceDraft,
  freezeInvoice,
  cancelInvoice,
  correctInvoice,
  createCreditNote,
  writeOffInvoice,
} from '@/lib/billing/core/invoice-engine'
import { createPayment, allocatePayment } from '@/lib/billing/core/payments'
import {
  ensureDunningEntry,
  advanceDunning,
  runDunningRun,
  DUNNING_DAYS,
  DUNNING_LEVEL_ORDER,
} from '@/lib/billing/core/dunning'
import { getOposListe } from '@/lib/billing/opos/opos-manager'
import { ermittleKundenKette } from '@/lib/pilot/kundenkette'
import {
  ENTLASTUNG_JAEHRLICH_EUR,
  ENTLASTUNG_MONATLICH_EUR,
  VP_KZP_KOMBINIERT_EUR,
} from '@/lib/config/budget-constants'
import { ZAHLUNGSZIEL_STANDARD_TAGE, berechneFaelligkeit } from '@/lib/billing/core/zahlungsziel'

const ORG = 'org-pilot-hauptkette-0001'
const CLIENT = 'client-pilot-hauptkette-0001'
const CAREGIVER = 'caregiver-pilot-hauptkette-0001'
const ACTOR = 'actor-pilot-hauptkette-0001'
const PERIOD = '2026-08'

/** Vollständig gepflegter Klient inkl. Pflegegrad, Budget, Mitarbeiter, Einsatz, Nachweis, Unterschrift. */
function seedVollstaendigenPiloten(db: FakeBillingDb) {
  db.seed('clients', [{
    id: CLIENT,
    organization_id: ORG,
    first_name: 'Erika',
    last_name: 'Testfall',
    geburtsdatum: '1942-03-11',
    date_of_birth: null,
    address: 'Musterweg 1',
    zip_code: '60311',
    city: 'Frankfurt am Main',
    phone: '069 0000000',
    email: null,
    care_level: 2,
    pflegegrad: 2,
    pflegekasse_name: 'AOK Hessen',
    insurance_name: 'AOK Hessen',
    insurance_number: '123456789',
    pflegekasse_ik: '105815527',
  }])

  db.seed('client_budgets', [{
    id: 'budget-1',
    client_id: CLIENT,
    organization_id: ORG,
    year: new Date().getFullYear(),
    annual_amount: ENTLASTUNG_JAEHRLICH_EUR,
    monthly_amount: ENTLASTUNG_MONATLICH_EUR,
    combined_annual_amount: VP_KZP_KOMBINIERT_EUR,
    combined_used_amount: 0,
    used_amount: 0,
  }])

  db.seed('caregivers', [{ id: CAREGIVER, organization_id: ORG, einsatzfreigabe: true }])

  db.seed('assignments', [{
    id: 'assign-1',
    client_id: CLIENT,
    caregiver_id: CAREGIVER,
    organization_id: ORG,
    assignment_date: `${PERIOD}-01`,
    status: 'geplant',
  }])

  db.seed('service_records', [{
    id: 'sr-1',
    client_id: CLIENT,
    organization_id: ORG,
    status: 'signed',
    amount: 35,
    date: `${PERIOD}-01`,
    leistungsart: 'Alltagsbegleitung',
  }])

  db.seed('service_signatures', [{
    id: 'sig-1',
    service_record_id: 'sr-1',
    signer_role: 'client',
    organization_id: ORG,
  }])

  db.seed('billing_tariffs', [{
    id: 'tarif-1',
    organization_id: ORG,
    leistungsart: 'Alltagsbegleitung',
    rechtsgrundlage: '§45b SGB XI',
    preis_cent: 3500,
    tarif_status: 'verified',
    gueltig_ab: '2025-01-01',
    gueltig_bis: null,
    deleted_at: null,
    verifizierungs_quelle: 'AOK Hessen Bescheid',
  }])

  db.seed('datev_exports', [])
}

describe('Hauptkette 1-8: Klient → Pflegegrad → Budget → Mitarbeiter → Buchung → Einsatz → Leistungsnachweis → Unterschrift', () => {
  let db: FakeBillingDb

  beforeEach(() => {
    db = makeFakeBillingDb()
    installBillingRpcSimulation(db)
    seedVollstaendigenPiloten(db)
  })

  it('meldet nach Stammdaten, Pflegegrad, Budget, Mitarbeiter, Termin, Nachweis und Unterschrift jeden Schritt als erledigt', async () => {
    const kette = await ermittleKundenKette(db as any, ORG, CLIENT)
    expect(kette).not.toBeNull()
    const stand = (id: string) => kette!.schritte.find(s => s.id === id)!.stand

    expect(stand('kunde')).toBe('erledigt')
    expect(stand('pflegegrad')).toBe('erledigt')
    expect(stand('budget')).toBe('erledigt')
    expect(stand('engel')).toBe('erledigt')
    expect(stand('termin')).toBe('erledigt')
    expect(stand('leistungsnachweis')).toBe('erledigt')
    expect(stand('signatur')).toBe('erledigt')
    expect(stand('freigabe')).toBe('erledigt')
    // Ab hier ist noch keine Rechnung erstellt.
    expect(stand('rechnung')).toBe('offen')
    expect(kette!.vollstaendig).toBe(false)
  })

  it('Budget-Beträge stimmen mit den gesetzlichen Werten überein (§45b 131€/Monat, VP/KZP kombiniert 3.539€)', () => {
    expect(ENTLASTUNG_MONATLICH_EUR).toBe(131)
    expect(ENTLASTUNG_JAEHRLICH_EUR).toBe(1572)
    expect(VP_KZP_KOMBINIERT_EUR).toBe(3539)
    const budget = db.table('client_budgets')[0]
    expect(budget.annual_amount).toBe(1572)
    expect(budget.combined_annual_amount).toBe(3539)
  })

  it('blockiert den Mitarbeiter-Schritt, wenn die zugeordnete Kraft keine Einsatzfreigabe hat', async () => {
    // Zweite Kraft ohne Freigabe zusätzlich zuordnen.
    db.seed('caregivers', [{ id: 'caregiver-gesperrt', organization_id: ORG, einsatzfreigabe: false }])
    db.table('assignments').push({
      id: 'assign-2', client_id: CLIENT, caregiver_id: 'caregiver-gesperrt',
      organization_id: ORG, assignment_date: `${PERIOD}-02`, status: 'geplant',
    })
    // Freigegebene Kraft entfernen, damit NUR die gesperrte übrig bleibt.
    db.table('assignments').splice(0, 1)

    const kette = await ermittleKundenKette(db as any, ORG, CLIENT)
    const engel = kette!.schritte.find(s => s.id === 'engel')!
    expect(engel.stand).toBe('blockiert')
  })
})

describe('Hauptkette 9-10: Tarifzuordnung → Rechnung → PDF', () => {
  let db: FakeBillingDb

  beforeEach(() => {
    db = makeFakeBillingDb()
    installBillingRpcSimulation(db)
    seedVollstaendigenPiloten(db)
  })

  it('erstellt aus dem freigegebenen Nachweis einen Rechnungsentwurf mit Tarifpreis 35,00 €', async () => {
    const draft = await createInvoiceDraft(db as any, {
      clientId: CLIENT, periodMonth: PERIOD, budgetType: 'entlastung', actorId: ACTOR,
    })

    expect(draft.alreadyExists).toBe(false)
    expect(draft.totalAmountCents).toBe(3500)
    expect(draft.lineCount).toBe(1)
    expect(draft.priceSource).toBe('billing_tariffs')

    const invoice = db.table('invoices').find(i => i.id === draft.invoiceId)!
    expect(invoice.status).toBe('entwurf')
    // due_date wird von setzeFaelligkeitFallsLeer nachgezogen (RPC kennt die Spalte nicht).
    expect(invoice.due_date).toBe(berechneFaelligkeit(String(invoice.created_at).slice(0, 10), ZAHLUNGSZIEL_STANDARD_TAGE))
    expect(invoice.payment_terms_days).toBe(ZAHLUNGSZIEL_STANDARD_TAGE)

    // Der zugrundeliegende Leistungsnachweis ist jetzt "invoiced".
    expect(db.table('service_records').find(r => r.id === 'sr-1')!.status).toBe('invoiced')
  })

  it('ist idempotent: ein zweiter Aufruf mit identischen Parametern erzeugt KEINE zweite Rechnung', async () => {
    const erste = await createInvoiceDraft(db as any, {
      clientId: CLIENT, periodMonth: PERIOD, budgetType: 'entlastung', actorId: ACTOR,
    })
    const zweite = await createInvoiceDraft(db as any, {
      clientId: CLIENT, periodMonth: PERIOD, budgetType: 'entlastung', actorId: ACTOR,
    })

    expect(zweite.alreadyExists).toBe(true)
    expect(zweite.invoiceId).toBe(erste.invoiceId)
    expect(db.table('invoices').filter(i => i.client_id === CLIENT)).toHaveLength(1)
  })

  it('schreibt die Rechnung fest: Snapshot, Checksumme, fortlaufende Nummer, Status "freigegeben"', async () => {
    const draft = await createInvoiceDraft(db as any, {
      clientId: CLIENT, periodMonth: PERIOD, budgetType: 'entlastung', actorId: ACTOR,
    })
    // freezeInvoice erwartet Status 'geprueft' fuer einen sauberen Uebergang;
    // der Entwurf wird dafuer auf den vorausgehenden Status gesetzt.
    db.table('invoices').find(i => i.id === draft.invoiceId)!.status = 'geprueft'
    db.table('invoices').find(i => i.id === draft.invoiceId)!.frozen_at = null

    const result = await freezeInvoice(db as any, draft.invoiceId, ACTOR, ORG)

    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/)
    expect(result.version).toBe(1)
    expect(result.invoiceNumber).toMatch(/^RE-\d{4}-\d{5}$/)

    const invoice = db.table('invoices').find(i => i.id === draft.invoiceId)!
    expect(invoice.status).toBe('freigegeben')
    expect(invoice.frozen_at).toBeTruthy()
    expect(invoice.invoice_number_formatted).toBe(result.invoiceNumber)

    // Snapshot wurde geschrieben und ist inhaltsadressiert (Checksumme reproduzierbar).
    const snapshot = db.table('invoice_snapshots').find(s => s.invoice_id === draft.invoiceId)!
    expect(snapshot.checksum).toBe(result.checksum)

    // Audit-Trail-Eintrag fuer die Festschreibung existiert.
    const audit = db.table('billing_audit_trail').find(a => a.entity_id === draft.invoiceId && a.action === 'frozen')
    expect(audit).toBeTruthy()
    expect((audit as any).checksum).toMatch(/^[0-9a-f]{64}$/)

    // freezeInvoice legt automatisch (best-effort) einen Mahneintrag an.
    const dunningEntry = db.table('dunning_entries').find(d => d.invoice_id === draft.invoiceId)
    expect(dunningEntry).toBeTruthy()
    expect(dunningEntry!.dunning_level).toBe('offen')
  })

  it('vergibt bei zwei Festschreibungen in derselben Organisation unterschiedliche, fortlaufende Rechnungsnummern', async () => {
    // Zweiten Klienten mit eigenem Nachweis anlegen, um zwei unabhängige Rechnungen zu erzeugen.
    const CLIENT_2 = 'client-pilot-hauptkette-0002'
    db.seed('clients', [{ id: CLIENT_2, organization_id: ORG, first_name: 'Hans', last_name: 'Zweitfall' }])
    db.seed('service_records', [{
      id: 'sr-2', client_id: CLIENT_2, organization_id: ORG, status: 'signed',
      amount: 35, date: `${PERIOD}-03`, leistungsart: 'Alltagsbegleitung',
    }])

    const draft1 = await createInvoiceDraft(db as any, { clientId: CLIENT, periodMonth: PERIOD, budgetType: 'entlastung', actorId: ACTOR })
    const draft2 = await createInvoiceDraft(db as any, { clientId: CLIENT_2, periodMonth: PERIOD, budgetType: 'entlastung', actorId: ACTOR })

    for (const d of [draft1, draft2]) {
      db.table('invoices').find(i => i.id === d.invoiceId)!.status = 'geprueft'
    }
    const f1 = await freezeInvoice(db as any, draft1.invoiceId, ACTOR, ORG)
    const f2 = await freezeInvoice(db as any, draft2.invoiceId, ACTOR, ORG)

    expect(f1.invoiceNumber).not.toBe(f2.invoiceNumber)
    const n1 = parseInt(f1.invoiceNumber.split('-')[2], 10)
    const n2 = parseInt(f2.invoiceNumber.split('-')[2], 10)
    expect(n2).toBe(n1 + 1)
  })
})

describe('Hauptkette 11-13: Zahlung → OPOS → Mahnung', () => {
  let db: FakeBillingDb
  let invoiceId: string
  let invoiceNumber: string

  beforeEach(async () => {
    db = makeFakeBillingDb()
    installBillingRpcSimulation(db)
    seedVollstaendigenPiloten(db)

    const draft = await createInvoiceDraft(db as any, {
      clientId: CLIENT, periodMonth: PERIOD, budgetType: 'entlastung', actorId: ACTOR,
    })
    invoiceId = draft.invoiceId
    db.table('invoices').find(i => i.id === invoiceId)!.status = 'geprueft'
    const frozen = await freezeInvoice(db as any, invoiceId, ACTOR, ORG)
    invoiceNumber = frozen.invoiceNumber
  })

  it('OPOS zeigt vor der Zahlung den vollen Rechnungsbetrag als offen', async () => {
    const opos = await getOposListe(db as any, ORG)
    expect(opos.gesamtAnzahl).toBe(1)
    expect(opos.gesamtOffen).toBe(3500)
    expect(opos.offenePosten[0].invoiceId).toBe(invoiceId)
    expect(opos.offenePosten[0].status).toBe('offen')
  })

  it('Vollzahlung (autoMatch:false + explizite Zuordnung) gleicht die Rechnung vollständig aus — OPOS wird leer', async () => {
    const payment = await createPayment(db as any, {
      organizationId: ORG,
      paymentDate: `${PERIOD}-20`,
      amountCents: 3500,
      paymentMethod: 'ueberweisung',
      payerType: 'kunde',
      payerName: 'Erika Testfall',
      verwendungszweck: invoiceNumber,
      actorId: ACTOR,
      autoMatch: false,
    })
    expect(payment.matchingStatus).toBe('nicht_zugeordnet')

    await allocatePayment(db as any, {
      paymentId: payment.paymentId,
      allocations: [{ invoiceId, amountCents: 3500 }],
      actorId: ACTOR,
    })

    const invoice = db.table('invoices').find(i => i.id === invoiceId)!
    expect(invoice.status).toBe('bezahlt')
    expect(invoice.paid_amount).toBe(35)

    const opos = await getOposListe(db as any, ORG)
    expect(opos.gesamtAnzahl).toBe(0)
    expect(opos.gesamtOffen).toBe(0)

    // Mahneintrag wird bei Vollzahlung automatisch auf "bezahlt" gesetzt.
    const dunningEntry = db.table('dunning_entries').find(d => d.invoice_id === invoiceId)!
    expect(dunningEntry.dunning_level).toBe('bezahlt')
  })

  it('autoMatch:true (Standardfall bei Verwendungszweck = Rechnungsnummer) ordnet automatisch zu', async () => {
    const payment = await createPayment(db as any, {
      organizationId: ORG,
      paymentDate: `${PERIOD}-20`,
      amountCents: 3500,
      paymentMethod: 'ueberweisung',
      payerType: 'kunde',
      payerName: 'Erika Testfall',
      verwendungszweck: `Zahlung ${invoiceNumber}`,
      actorId: ACTOR,
      // autoMatch default = true
    })

    expect(payment.matchingStatus).toBe('automatisch_zugeordnet')
    expect(payment.matchedInvoices).toHaveLength(1)
    expect(payment.matchedInvoices[0].invoiceId).toBe(invoiceId)

    const invoice = db.table('invoices').find(i => i.id === invoiceId)!
    expect(invoice.status).toBe('bezahlt')
  })

  it('due_date liegt genau 14 Tage nach Rechnungsdatum (Zahlungsziel-Standard)', () => {
    const invoice = db.table('invoices').find(i => i.id === invoiceId)!
    const rechnungsdatum = new Date(String(invoice.created_at).slice(0, 10))
    const faellig = new Date(String(invoice.due_date))
    const diffTage = Math.round((faellig.getTime() - rechnungsdatum.getTime()) / 86400000)
    expect(diffTage).toBe(14)
    expect(ZAHLUNGSZIEL_STANDARD_TAGE).toBe(14)
  })

  it('Mahnstufen eskalieren in der richtigen Reihenfolge mit den korrekten Fristen (Tage nach Fälligkeit)', async () => {
    expect(DUNNING_DAYS.erinnerung).toBe(14)
    expect(DUNNING_DAYS.mahnung_1).toBe(28)
    expect(DUNNING_DAYS.mahnung_2).toBe(42)
    expect(DUNNING_DAYS.letzte_mahnung).toBe(56)
    expect(DUNNING_DAYS.inkasso_vorbereitung).toBe(70)
    expect(DUNNING_LEVEL_ORDER).toEqual([
      'offen', 'erinnerung', 'mahnung_1', 'mahnung_2',
      'letzte_mahnung', 'inkasso_vorbereitung', 'bezahlt',
    ])

    await ensureDunningEntry(db as any, invoiceId, ORG, ACTOR)
    let level = 'offen'
    for (const erwarteteStufe of ['erinnerung', 'mahnung_1', 'mahnung_2', 'letzte_mahnung', 'inkasso_vorbereitung']) {
      const { newLevel } = await advanceDunning(db as any, invoiceId, ACTOR)
      expect(newLevel).toBe(erwarteteStufe)
      level = newLevel
    }
    // Höchste automatische Stufe erreicht — weitere Eskalation ist nicht möglich.
    await expect(advanceDunning(db as any, invoiceId, ACTOR)).rejects.toThrow(/nicht weiter eskaliert/)
    expect(level).toBe('inkasso_vorbereitung')
  })

  it('runDunningRun eskaliert eine überfällige, unbezahlte Rechnung automatisch um eine Stufe', async () => {
    // Fälligkeit 20 Tage in die Vergangenheit setzen → über die 14-Tage-Erinnerungsfrist hinaus.
    const invoice = db.table('invoices').find(i => i.id === invoiceId)!
    const ueberfaellig = new Date()
    ueberfaellig.setDate(ueberfaellig.getDate() - 20)
    invoice.due_date = ueberfaellig.toISOString().slice(0, 10)

    const result = await runDunningRun(db as any, ORG, ACTOR)

    expect(result.geprueft).toBe(1)
    expect(result.eskaliert).toHaveLength(1)
    expect(result.eskaliert[0].invoiceId).toBe(invoiceId)
    expect(result.eskaliert[0].toLevel).toBe('erinnerung')

    const dunningEntry = db.table('dunning_entries').find(d => d.invoice_id === invoiceId)!
    expect(dunningEntry.dunning_level).toBe('erinnerung')
  })

  it('runDunningRun mit dryRun:true simuliert die Eskalation, ohne den Zustand zu ändern', async () => {
    // freezeInvoice hat im beforeEach bereits automatisch einen Mahneintrag
    // auf Stufe 'offen' angelegt — dryRun darf ihn nicht verändern.
    const vorher = db.table('dunning_entries').find(d => d.invoice_id === invoiceId)!
    expect(vorher.dunning_level).toBe('offen')

    const invoice = db.table('invoices').find(i => i.id === invoiceId)!
    const ueberfaellig = new Date()
    ueberfaellig.setDate(ueberfaellig.getDate() - 20)
    invoice.due_date = ueberfaellig.toISOString().slice(0, 10)

    const result = await runDunningRun(db as any, ORG, ACTOR, { dryRun: true })

    expect(result.dryRun).toBe(true)
    expect(result.eskaliert).toHaveLength(1)
    expect(result.eskaliert[0].toLevel).toBe('erinnerung')
    // Der tatsächliche Mahneintrag bleibt unveraendert auf 'offen'.
    const nachher = db.table('dunning_entries').find(d => d.invoice_id === invoiceId)!
    expect(nachher.dunning_level).toBe('offen')
  })
})

describe('Hauptkette: Korrektur, Storno, Gutschrift, Abschreibung', () => {
  let db: FakeBillingDb
  let invoiceId: string

  beforeEach(async () => {
    db = makeFakeBillingDb()
    installBillingRpcSimulation(db)
    seedVollstaendigenPiloten(db)

    const draft = await createInvoiceDraft(db as any, {
      clientId: CLIENT, periodMonth: PERIOD, budgetType: 'entlastung', actorId: ACTOR,
    })
    invoiceId = draft.invoiceId
    db.table('invoices').find(i => i.id === invoiceId)!.status = 'geprueft'
    await freezeInvoice(db as any, invoiceId, ACTOR, ORG)
  })

  it('korrigiert eine Rechnung innerhalb der 10%-Toleranz ohne Korrekturgrund', async () => {
    const result = await correctInvoice(db as any, invoiceId, [{
      leistungsart: 'Alltagsbegleitung',
      leistungsdatum: `${PERIOD}-01`,
      menge: 1,
      einheit: 'einsatz',
      einzelpreisCent: 3600, // 2,8% über dem Tarif (3500) — unter 10%
      gesamtpreisCent: 3600,
    }], 'Nachtrag', ACTOR, ORG)

    expect(result.correctionInvoiceNumber).toMatch(/^KR-\d{4}-\d{5}$/)
    expect(result.differenceCents).toBe(100)

    const korrektur = db.table('invoices').find(i => i.id === result.correctionInvoiceId)!
    expect(korrektur.status).toBe('entwurf')
    expect(korrektur.correction_of).toBe(invoiceId)
  })

  it('storniert eine freigegebene Rechnung mit Gegenrechnung und setzt das Original auf "storniert"', async () => {
    const result = await cancelInvoice(db as any, invoiceId, 'Kunde storniert Vertrag', ACTOR, ORG)

    expect(result.correctionInvoiceNumber).toMatch(/^ST-\d{4}-\d{5}$/)
    expect(result.differenceCents).toBe(-3500)

    const original = db.table('invoices').find(i => i.id === invoiceId)!
    expect(original.status).toBe('storniert')

    const storno = db.table('invoices').find(i => i.id === result.correctionInvoiceId)!
    expect(storno.total_amount).toBe(-35)
    expect(storno.status).toBe('freigegeben')
  })

  it('erstellt eine Teil-Gutschrift und lässt den Restbetrag weiter gutschriftfähig', async () => {
    const gutschrift = await createCreditNote(db as any, invoiceId, 1000, 'Kürzung nach Reklamation', ACTOR, ORG)

    expect(gutschrift.creditInvoiceNumber).toMatch(/^GS-\d{4}-\d{5}$/)
    expect(gutschrift.amountCents).toBe(1000)

    const credit = db.table('invoices').find(i => i.id === gutschrift.creditInvoiceId)!
    expect(credit.total_amount).toBe(-10)
  })

  it('schreibt eine unbezahlte, freigegebene Rechnung ab, wenn keine Zahlung mehr erwartet wird', async () => {
    const result = await writeOffInvoice(db as any, invoiceId, 'Schuldner insolvent, Forderung uneinbringlich', ACTOR, ORG)

    expect(result.writtenOffAmountCents).toBe(3500)
    expect(db.table('invoices').find(i => i.id === invoiceId)!.status).toBe('abgeschrieben')
  })
})

describe('Hauptkette: Abschluss — vollständiger Zyklus in der Kundenkette sichtbar', () => {
  it('meldet nach Rechnung, PDF-Beleg, Vollzahlung und DATEV-Export die Kette als 100% vollständig', async () => {
    const db = makeFakeBillingDb()
    installBillingRpcSimulation(db)
    seedVollstaendigenPiloten(db)

    const draft = await createInvoiceDraft(db as any, {
      clientId: CLIENT, periodMonth: PERIOD, budgetType: 'entlastung', actorId: ACTOR,
    })
    db.table('invoices').find(i => i.id === draft.invoiceId)!.status = 'geprueft'
    await freezeInvoice(db as any, draft.invoiceId, ACTOR, ORG)

    // PDF/Belegpaket erzeugt (hier: die reine Existenzmarkierung, die die
    // Kettenlogik auswertet — die tatsächliche PDF-Erzeugung ist Gegenstand
    // eigener Tests, siehe __tests__/abrechnung/rechnung-briefkopf.test.ts).
    db.table('invoice_packages').push({ id: 'paket-1', invoice_id: draft.invoiceId, organization_id: ORG })

    const payment = await createPayment(db as any, {
      organizationId: ORG,
      paymentDate: `${PERIOD}-20`,
      amountCents: 3500,
      paymentMethod: 'ueberweisung',
      payerType: 'kunde',
      actorId: ACTOR,
      autoMatch: false,
    })
    await allocatePayment(db as any, {
      paymentId: payment.paymentId,
      allocations: [{ invoiceId: draft.invoiceId, amountCents: 3500 }],
      actorId: ACTOR,
    })

    const invoiceDatum = String(db.table('invoices').find(i => i.id === draft.invoiceId)!.created_at).slice(0, 10)
    db.table('datev_exports').push({
      zeitraum_von: `${PERIOD}-01`, zeitraum_bis: `${PERIOD}-31`, status: 'erstellt', organization_id: ORG,
    })
    // Sicherstellen, dass der Export den Rechnungszeitpunkt wirklich einschliesst.
    expect(invoiceDatum >= `${PERIOD}-01` && invoiceDatum <= `${PERIOD}-31`).toBe(true)

    const kette = await ermittleKundenKette(db as any, ORG, CLIENT)

    expect(kette!.datenfehler).toEqual([])
    expect(kette!.vollstaendig).toBe(true)
    expect(kette!.fortschritt.prozent).toBe(100)
    expect(kette!.aktuellerSchritt).toBeNull()
  })
})
