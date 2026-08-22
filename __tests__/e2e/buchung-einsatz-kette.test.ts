// ═══════════════════════════════════════════════════════════════════
// Track A1 — E2E: Kunde bucht → Engel nimmt an → Einsatz → Nachweis
// ═══════════════════════════════════════════════════════════════════
//
// BEFUND (docs/FUNKTIONALE_LUECKENANALYSE.md, Bereich 3, P1):
//   POST /api/bookings/respond setzte nur `bookings.status`. Es entstand
//   weder ein `assignment` noch ein `service_record` — der angenommene
//   Termin tauchte in Planung und Abrechnung nie auf.
//
// Diese Suite fährt die Kette durch den ECHTEN Route-Handler auf einer
// gemeinsamen Fake-Datenbank (__tests__/e2e/helpers/fake-billing-db.ts):
// dieselbe Buchung, die der Handler auf 'accepted' setzt, ist die Zeile,
// zu der danach Einsatz und Nachweis in der Datenbank stehen müssen.
//
// Geprüft wird beides — dass die Kette hält UND dass sie sauber reisst:
//   1. Hauptkette: Annahme erzeugt assignment + service_record (draft)
//   2. Fail-closed je Bruchstelle (Klient, Betreuungskraft, Freigabe,
//      Tarifzuordnung, Budget, Zeitfenster, Doppelbelegung)
//   3. Rollback: scheitert der Nachweis, verschwindet auch der Einsatz
//      und die Buchung steht wieder auf 'pending'
//   4. Ablehnung baut keine Kette
//
// Bekannte Grenze der Fake-DB: echte DB-Trigger laufen hier nicht. Der
// Doppelbelegungs-Trigger wird deshalb über einen injizierten Insert-
// Fehler mit derselben Fehlermeldung simuliert, die Postgres liefert —
// nicht nachgebaut, sondern als Fehlerpfad geprüft.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeFakeBillingDb, type FakeBillingDb } from './helpers/fake-billing-db'

const ORG = 'org-a1-0001'
const KUNDE_PROFIL = 'profil-kunde-a1'
const ENGEL_PROFIL = 'profil-engel-a1'
const KLIENT = 'client-a1'
const BETREUUNGSKRAFT = 'caregiver-a1'
const BUCHUNG = 'booking-a1'
const JAHR = new Date().getFullYear()

// ─── Testdoubles ───────────────────────────────────────────────────

let db: FakeBillingDb
let sessionUser: { id: string } | null = null
/** Tabelle → Fehler, den der nächste INSERT auf ihr liefern soll. */
let insertFehler: Record<string, { message: string }> = {}
const auditEintraege: Array<Record<string, unknown>> = []
const benachrichtigungen: string[] = []

vi.mock('@/lib/audit-log', () => ({
  logAuditEventOrWarn: async (e: Record<string, unknown>) => { auditEintraege.push(e); return true },
  logAuditEvent: async (e: Record<string, unknown>) => { auditEintraege.push(e); return true },
}))

vi.mock('@/lib/notifications', () => ({
  notifyCustomerBookingAccepted: async () => { benachrichtigungen.push('accepted') },
  notifyCustomerBookingDeclined: async () => { benachrichtigungen.push('declined') },
}))

vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgIdOrDefault: async () => ORG,
  getActiveOrgId: async () => ORG,
}))

/**
 * Legt eine Schicht über die Fake-DB, die INSERTs auf ausgewählten
 * Tabellen scheitern lässt — so wird der Rollback-Pfad prüfbar, ohne
 * einen echten DB-Trigger nachzubauen.
 */
function mitInsertFehlern(basis: FakeBillingDb) {
  return {
    ...basis,
    from(table: string) {
      const b = basis.from(table)
      const echterInsert = b.insert.bind(b)
      b.insert = (rows: unknown) => {
        const chain = echterInsert(rows)
        const fehler = insertFehler[table]
        if (!fehler) return chain
        return {
          ...chain,
          select: () => ({
            single: async () => ({ data: null, error: fehler }),
            then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: fehler }).then(res),
          }),
          single: async () => ({ data: null, error: fehler }),
          then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: fehler }).then(res),
        }
      }
      return b
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mitInsertFehlern(db),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    ...db,
    auth: { getUser: async () => ({ data: { user: sessionUser }, error: null }) },
  }),
}))

// Der Handler wird NACH den Mocks importiert.
const { POST } = await import('@/app/api/bookings/respond/route')

// ─── Fixtures ──────────────────────────────────────────────────────

interface SeedOptionen {
  service?: string
  paymentMethod?: string
  time?: string
  durationHours?: number
  mitKlient?: boolean
  mitBetreuungskraft?: boolean
  einsatzfreigabe?: boolean
  mitVertrag?: boolean
  mitBudget?: boolean
  budgetVerbraucht?: number
}

function seed(opt: SeedOptionen = {}) {
  const {
    service = 'Alltagsbegleitung',
    paymentMethod = 'privat',
    time = '10:00:00',
    durationHours = 2,
    mitKlient = true,
    mitBetreuungskraft = true,
    einsatzfreigabe = true,
    mitVertrag = true,
    mitBudget = true,
    budgetVerbraucht = 0,
  } = opt

  db.seed('profiles', [
    { id: KUNDE_PROFIL, role: 'kunde', first_name: 'Erika', last_name: 'Testfall', email: 'kunde@example.invalid' },
    { id: ENGEL_PROFIL, role: 'engel', first_name: 'Maria', last_name: 'Beispiel', email: 'engel@example.invalid' },
  ])

  db.seed('bookings', [{
    id: BUCHUNG,
    organization_id: ORG,
    customer_id: KUNDE_PROFIL,
    angel_id: ENGEL_PROFIL,
    service,
    date: `${JAHR}-09-15`,
    time,
    duration_hours: durationHours,
    total_amount: 0,
    payment_method: paymentMethod,
    status: 'pending',
    responded_at: null,
    decline_reason: null,
  }])

  if (mitKlient) {
    db.seed('clients', [{
      id: KLIENT,
      organization_id: ORG,
      user_id: KUNDE_PROFIL,
      first_name: 'Erika',
      last_name: 'Testfall',
      address: 'Musterweg 1',
      zip_code: '60311',
      status: 'aktiv',
      aufnahmestatus: 'aufgenommen',
    }])
  }

  if (mitVertrag) {
    db.seed('akten_vertraege', [{
      id: 'vertrag-a1',
      organization_id: ORG,
      client_id: KLIENT,
      status: 'aktiv',
      vertragsende: null,
    }])
  }

  if (mitBetreuungskraft) {
    db.seed('caregivers', [{
      id: BETREUUNGSKRAFT,
      organization_id: ORG,
      user_id: ENGEL_PROFIL,
      first_name: 'Maria',
      last_name: 'Beispiel',
      initials: 'MB',
      status: 'aktiv',
      vertragsstatus: 'aktiv',
      einsatzfreigabe,
    }])
  }

  // Ohne die beiden Pflichtqualifikationen blockiert pruefeEinsatzfreigabe
  // unabhängig vom einsatzfreigabe-Flag.
  db.seed('caregiver_qualifications', [
    { id: 'q1', organization_id: ORG, caregiver_id: BETREUUNGSKRAFT, title: 'Erweitertes Führungszeugnis', valid_until: null, einsatzrelevant: true, pflicht: true },
    { id: 'q2', organization_id: ORG, caregiver_id: BETREUUNGSKRAFT, title: 'Erste Hilfe Kurs', valid_until: null, einsatzrelevant: true, pflicht: true },
  ])

  if (mitBudget) {
    db.seed('client_budgets', [{
      id: 'budget-a1',
      organization_id: ORG,
      client_id: KLIENT,
      year: JAHR,
      annual_amount: 1572,
      carryover_amount: 0,
      used_amount: budgetVerbraucht,
      combined_annual_amount: 3539,
      combined_used_amount: 0,
    }])
  }
}

async function antworte(body: Record<string, unknown>) {
  const req = new Request('http://localhost:3000/api/bookings/respond', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  // Der Handler erwartet NextRequest; Request erfüllt die genutzte
  // Teilmenge (json(), headers, url).
  const res = await POST(req as never)
  return { status: res.status, body: await res.json() as Record<string, unknown> }
}

beforeEach(() => {
  db = makeFakeBillingDb()
  sessionUser = { id: ENGEL_PROFIL }
  insertFehler = {}
  auditEintraege.length = 0
  benachrichtigungen.length = 0
})

// ═══════════════════════════════════════════════════════════════════
// 1) Hauptkette
// ═══════════════════════════════════════════════════════════════════

describe('Hauptkette: Kunde bucht → Engel nimmt an → Einsatz → Nachweis', () => {
  it('erzeugt bei Annahme Einsatz UND Leistungsnachweis-Entwurf', async () => {
    seed()
    const { status, body } = await antworte({ bookingId: BUCHUNG, action: 'accept' })

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.status).toBe('accepted')
    expect(body.assignment_id).toBeTruthy()
    expect(body.service_record_id).toBeTruthy()

    // Buchung steht auf accepted
    expect(db.table('bookings')[0].status).toBe('accepted')

    // Einsatz existiert — vorher entstand hier gar nichts
    const einsaetze = db.table('assignments')
    expect(einsaetze).toHaveLength(1)
    expect(einsaetze[0]).toMatchObject({
      organization_id: ORG,
      client_id: KLIENT,
      caregiver_id: BETREUUNGSKRAFT,
      assignment_date: `${JAHR}-09-15`,
      start_time: '10:00:00',
      end_time: '12:00:00',
      service_type: 'alltagsbegleitung',
      status: 'GEPLANT',
      is_recurring: false,
    })
    // Adresse aus dem Klientenstamm → PLZ-Trigger kann Bundesland setzen
    expect(einsaetze[0].zip_code).toBe('60311')

    // Leistungsnachweis-Entwurf existiert und hängt am Einsatz
    const nachweise = db.table('service_records')
    expect(nachweise).toHaveLength(1)
    expect(nachweise[0]).toMatchObject({
      organization_id: ORG,
      client_id: KLIENT,
      caregiver_id: BETREUUNGSKRAFT,
      assignment_id: einsaetze[0].id,
      date: `${JAHR}-09-15`,
      start_time: '10:00:00',
      end_time: '12:00:00',
      service_type: 'alltagsbegleitung',
      status: 'draft',
      proof_status: 'ENTWURF',
      billing_status: 'OFFEN',
      caregiver_initials: 'MB',
    })
  })

  it('erfindet keinen Betrag und keine Dauer', async () => {
    seed()
    await antworte({ bookingId: BUCHUNG, action: 'accept' })

    const nachweis = db.table('service_records')[0]
    // amount entsteht erst im Rechnungslauf aus dem verifizierten Tarif
    expect(nachweis.amount).toBeUndefined()
    // duration_minutes ist eine GENERATED-Spalte — ein mitgelieferter Wert
    // liesse den INSERT live mit 428C9 scheitern
    expect(nachweis.duration_minutes).toBeUndefined()
  })

  it('schreibt den Einsatz in den Audit-Trail', async () => {
    seed()
    await antworte({ bookingId: BUCHUNG, action: 'accept' })

    const eintrag = auditEintraege.find(e => e.entityType === 'assignment')
    expect(eintrag).toBeDefined()
    expect(eintrag!.action).toBe('create')
    expect(eintrag!.organizationId).toBe(ORG)
    const details = eintrag!.details as Record<string, unknown>
    expect(details.quelle).toBe('booking_accept')
    expect(details.booking_id).toBe(BUCHUNG)
    expect(details.service_record_id).toBe(db.table('service_records')[0].id)
  })

  it('benachrichtigt den Kunden weiterhin', async () => {
    seed()
    await antworte({ bookingId: BUCHUNG, action: 'accept' })
    expect(benachrichtigungen).toEqual(['accepted'])
  })

  it('übersetzt die Buchungs-Schreibweise auf den Tarif-Schlüssel', async () => {
    // 'Haushalt' kommt aus app/kunde/buchen-service, der Tarif heisst
    // 'hauswirtschaft' — ohne Übersetzung wäre der Nachweis nicht abrechenbar.
    seed({ service: 'Haushalt' })
    const { status } = await antworte({ bookingId: BUCHUNG, action: 'accept' })
    expect(status).toBe(200)
    expect(db.table('service_records')[0].service_type).toBe('hauswirtschaft')
    expect(db.table('assignments')[0].service_type).toBe('hauswirtschaft')
  })

  it('setzt bei Kassenbuchung Entlastungsbetrag und §45b', async () => {
    seed({ paymentMethod: 'kasse' })
    await antworte({ bookingId: BUCHUNG, action: 'accept' })
    expect(db.table('service_records')[0]).toMatchObject({
      budget_type: 'entlastung',
      billing_type: '§45b',
    })
  })

  it('weist bei Kombi-Abrechnung auf die offene Aufteilung hin', async () => {
    seed({ paymentMethod: 'kombi' })
    const { body } = await antworte({ bookingId: BUCHUNG, action: 'accept' })
    expect((body.warnungen as string[]).join(' ')).toMatch(/Kombi-Abrechnung/)
  })
})

// ═══════════════════════════════════════════════════════════════════
// 2) Fail-closed: jede Bruchstelle blockiert die Annahme
// ═══════════════════════════════════════════════════════════════════

describe('Fail-closed: Annahme ohne belastbaren Einsatz wird abgelehnt', () => {
  /** Prüft: 422/409, richtiger Code, nichts angelegt, Buchung wieder offen. */
  async function erwarteBruch(code: string, erwarteterStatus = 422) {
    const { status, body } = await antworte({ bookingId: BUCHUNG, action: 'accept' })
    expect(status).toBe(erwarteterStatus)
    expect(body.code).toBe(code)
    expect(db.table('assignments')).toHaveLength(0)
    expect(db.table('service_records')).toHaveLength(0)
    // Rollback: die Buchung darf nicht als angenommen stehenbleiben
    expect(db.table('bookings')[0].status).toBe('pending')
    expect(db.table('bookings')[0].responded_at).toBeNull()
    expect(body.rollback).toBe(true)
    return body
  }

  it('ohne Klienten-Datensatz zum Kundenprofil', async () => {
    seed({ mitKlient: false })
    const body = await erwarteBruch('KEIN_KLIENT')
    expect(body.error).toMatch(/Klienten-Datensatz/)
  })

  it('ohne Mitarbeiter-Datensatz zum Engel-Profil', async () => {
    seed({ mitBetreuungskraft: false })
    await erwarteBruch('KEINE_BETREUUNGSKRAFT')
  })

  it('ohne aktiven Vertrag des Klienten', async () => {
    seed({ mitVertrag: false })
    const body = await erwarteBruch('CLIENT_FREIGABE_FEHLT')
    expect(JSON.stringify(body.details)).toMatch(/Kein aktiver Vertrag/)
  })

  it('ohne erteilte Einsatzfreigabe', async () => {
    seed({ einsatzfreigabe: false })
    await erwarteBruch('EINSATZFREIGABE_FEHLT')
  })

  it('bei einer Leistung ohne Tarifzuordnung', async () => {
    // 'Hygienebox' ist ein Produkt, kein §45a-Tarif — bewusst nicht
    // auf 'sonstige' ausgewichen (das wäre der Begleitungssatz).
    seed({ service: 'Hygienebox' })
    const body = await erwarteBruch('KEINE_TARIFZUORDNUNG')
    expect(body.error).toMatch(/kein Tarif hinterlegt/)
  })

  it('bei ausgeschöpftem Entlastungsbudget', async () => {
    seed({ paymentMethod: 'kasse', budgetVerbraucht: 1572 })
    await erwarteBruch('BUDGET_BLOCKIERT')
  })

  it('bei einem Zeitfenster über Mitternacht', async () => {
    seed({ time: '22:00:00', durationHours: 4 })
    await erwarteBruch('ZEITFENSTER_UNGUELTIG')
  })

  it('bei Doppelbelegung (DB-Trigger) mit 409', async () => {
    seed()
    insertFehler.assignments = { message: 'DOPPELBELEGUNG: Einsatz überschneidet sich' }
    await erwarteBruch('DOPPELBELEGUNG', 409)
  })
})

// ═══════════════════════════════════════════════════════════════════
// 3) Rollback der halben Kette
// ═══════════════════════════════════════════════════════════════════

describe('Rollback', () => {
  it('nimmt den Einsatz zurück, wenn der Nachweis nicht angelegt werden kann', async () => {
    seed()
    insertFehler.service_records = { message: 'permission denied for table service_records' }

    const { status, body } = await antworte({ bookingId: BUCHUNG, action: 'accept' })

    expect(status).toBe(500)
    expect(body.code).toBe('NACHWEIS_FEHLGESCHLAGEN')
    // Kein verwaister Einsatz — das wäre genau die halbe Kette
    expect(db.table('assignments')).toHaveLength(0)
    expect(db.table('service_records')).toHaveLength(0)
    expect(db.table('bookings')[0].status).toBe('pending')
  })

  it('lässt den Kunden bei gerissener Kette unbenachrichtigt', async () => {
    seed({ mitKlient: false })
    await antworte({ bookingId: BUCHUNG, action: 'accept' })
    expect(benachrichtigungen).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════
// 4) Ablehnung, Override und Berechtigungen
// ═══════════════════════════════════════════════════════════════════

describe('Ablehnung', () => {
  it('baut keine Kette und lässt Planung wie Abrechnung unberührt', async () => {
    seed()
    const { status, body } = await antworte({ bookingId: BUCHUNG, action: 'decline', reason: 'Bin an dem Tag krank' })

    expect(status).toBe(200)
    expect(body.status).toBe('declined')
    expect(body.assignment_id).toBeUndefined()
    expect(db.table('assignments')).toHaveLength(0)
    expect(db.table('service_records')).toHaveLength(0)
    expect(db.table('bookings')[0].decline_reason).toBe('Bin an dem Tag krank')
    expect(benachrichtigungen).toEqual(['declined'])
  })
})

describe('force_override', () => {
  it('ist für den Engel gesperrt', async () => {
    seed({ mitKlient: false })
    const { status, body } = await antworte({ bookingId: BUCHUNG, action: 'accept', force_override: true })
    expect(status).toBe(403)
    expect(body.error).toMatch(/nur für Administratoren/)
    expect(db.table('bookings')[0].status).toBe('pending')
  })

  it('lässt einen Admin annehmen, protokolliert aber den fehlenden Einsatz', async () => {
    seed({ mitKlient: false })
    db.table('profiles').find(p => p.id === ENGEL_PROFIL)!.role = 'admin'

    const { status, body } = await antworte({
      bookingId: BUCHUNG,
      action: 'accept',
      force_override: true,
      override_reason: 'Klient wird nachträglich angelegt',
    })

    expect(status).toBe(200)
    expect(db.table('bookings')[0].status).toBe('accepted')
    expect(db.table('assignments')).toHaveLength(0)
    expect((body.warnungen as string[]).join(' ')).toMatch(/manuell in der Einsatzplanung/)

    const eintrag = auditEintraege.find(
      e => (e.details as Record<string, unknown> | undefined)?.quelle === 'booking_accept_force_override',
    )
    expect(eintrag).toBeDefined()
    expect((eintrag!.details as Record<string, unknown>).fehlercode).toBe('KEIN_KLIENT')
    expect((eintrag!.details as Record<string, unknown>).begruendung).toBe('Klient wird nachträglich angelegt')
  })
})
