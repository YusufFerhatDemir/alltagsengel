/**
 * Buchung → Einsatz → Leistungsnachweis (lib/bookings/einsatz-kette.ts)
 *
 * Diese Datei ist die Bruecke zwischen der Marktplatz-Welt (bookings,
 * profiles, angels) und der Betriebs-Welt (clients, caregivers,
 * assignments, service_records). Reisst sie still, entsteht genau der
 * Zustand, gegen den sie gebaut wurde: eine angenommene Buchung, zu der
 * es weder Einsatz noch Nachweis noch Rechnung gibt.
 *
 * Drei Dinge werden hier hart geprueft:
 *
 *   MANDANT     Der Aufrufer benutzt einen Service-Role-Client, RLS greift
 *               also NICHT. Jede einzelne Abfrage muss den organization_id-
 *               Zaun selbst mitbringen — sonst zieht die Kette einen
 *               Klienten oder eine Betreuungskraft aus einem fremden
 *               Mandanten heran.
 *
 *   FAIL-CLOSED Kein Ausweichen auf 'sonstige', kein geratener Tarif, kein
 *               automatisch angelegter Klient. Jeder Bruch wirft mit Code.
 *
 *   KOMPENSATION Scheitert der Nachweis, muss der Sekunden alte Einsatz
 *               wieder verschwinden — sonst bleibt die halbe Kette stehen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf, type FakeAntwort } from '../helpers/supabase-fake'

// Die Freigabe-Pruefungen haben eigene Suiten (personal/*). Hier wird nur
// geprueft, DASS sie gestellt werden und dass ihr Nein die Kette anhaelt.
const freigaben = {
  client: { clientId: 'c', clientName: 'Frau Test', freigegeben: true, probleme: [] as string[] },
  caregiver: {
    caregiverId: 'cg', caregiverName: 'Frau Engel', freigegeben: true, vertragsstatus: 'aktiv',
    probleme: [] as string[], abgelaufeneQualifikationen: [] as unknown[],
    budgetWarnung: null as string | null, budgetBlockiert: false,
  },
  budget: { warnung: null as string | null, blockiert: false, prozent: 10, budgetTyp: 'entlastung' },
}
const spione = {
  pruefeClientFreigabe: vi.fn(async () => freigaben.client),
  pruefeEinsatzfreigabe: vi.fn(async () => freigaben.caregiver),
  pruefeBudget: vi.fn(async () => freigaben.budget),
}

vi.mock('@/lib/personal/einsatzfreigabe', () => ({
  pruefeClientFreigabe: (...a: unknown[]) => spione.pruefeClientFreigabe(...(a as [])),
  pruefeEinsatzfreigabe: (...a: unknown[]) => spione.pruefeEinsatzfreigabe(...(a as [])),
  pruefeBudget: (...a: unknown[]) => spione.pruefeBudget(...(a as [])),
}))

const {
  erzeugeEinsatzUndNachweis,
  buchungsLeistungsart,
  endzeitAus,
  aufloesbareBuchungsleistungen,
  EinsatzKetteFehler,
  istEinsatzKetteFehler,
} = await import('@/lib/bookings/einsatz-kette')

const ORG = '00000000-0000-4000-8000-000460629986'
const ACTOR = '11111111-1111-4111-8111-111111111111'
const KUNDE = '22222222-2222-4222-8222-222222222222'
const ENGEL = '33333333-3333-4333-8333-333333333333'
const CLIENT = '44444444-4444-4444-8444-444444444444'
const CAREGIVER = '55555555-5555-4555-8555-555555555555'
const ASSIGNMENT = '66666666-6666-4666-8666-666666666666'
const RECORD = '77777777-7777-4777-8777-777777777777'

const BUCHUNG = {
  id: 'booking-1',
  customer_id: KUNDE,
  angel_id: ENGEL,
  service: 'Haushaltshilfe',
  date: '2026-09-01',
  time: '09:00:00',
  duration_hours: 2,
  payment_method: 'privat' as string | null,
}

interface Welt {
  clients?: FakeAntwort
  caregivers?: FakeAntwort
  assignmentInsert?: FakeAntwort
  recordInsert?: FakeAntwort
  assignmentDelete?: FakeAntwort
}

function fake(w: Welt = {}) {
  return erstelleFakeSupabase((a: FakeAufruf): FakeAntwort => {
    if (a.tabelle === 'clients') return w.clients ?? { data: { id: CLIENT, first_name: 'A', last_name: 'B', address: 'Musterweg 1', zip_code: '60311' } }
    if (a.tabelle === 'caregivers') return w.caregivers ?? { data: { id: CAREGIVER, first_name: 'C', last_name: 'D', initials: 'CD' } }
    if (a.tabelle === 'assignments') {
      if (a.operation === 'delete') return w.assignmentDelete ?? { data: null, error: null }
      return w.assignmentInsert ?? { data: { id: ASSIGNMENT }, error: null }
    }
    if (a.tabelle === 'service_records') return w.recordInsert ?? { data: { id: RECORD }, error: null }
    return { data: null, error: null }
  })
}

beforeEach(() => {
  freigaben.client = { clientId: 'c', clientName: 'Frau Test', freigegeben: true, probleme: [] }
  freigaben.caregiver = {
    caregiverId: 'cg', caregiverName: 'Frau Engel', freigegeben: true, vertragsstatus: 'aktiv',
    probleme: [], abgelaufeneQualifikationen: [], budgetWarnung: null, budgetBlockiert: false,
  }
  freigaben.budget = { warnung: null, blockiert: false, prozent: 10, budgetTyp: 'entlastung' }
  for (const s of Object.values(spione)) s.mockClear()
})

// ═══════════════════════════════════════════════════════════════════════
// 1 — Leistungsart: das dritte Vokabular
// ═══════════════════════════════════════════════════════════════════════

describe('buchungsLeistungsart', () => {
  it('loest die Schreibweisen der Buchungsmasken auf Tarif-Schluessel auf', () => {
    expect(buchungsLeistungsart('Haushalt')).toBe('hauswirtschaft')
    expect(buchungsLeistungsart('Haushaltshilfe')).toBe('hauswirtschaft')
    expect(buchungsLeistungsart('Einkauf')).toBe('einkaufsservice')
    expect(buchungsLeistungsart('Einkaufsbegleitung')).toBe('einkaufsservice')
    expect(buchungsLeistungsart('Arztbesuch')).toBe('begleitservice')
    expect(buchungsLeistungsart('Arztbesuch-Begleitung')).toBe('begleitservice')
    expect(buchungsLeistungsart('Spazieren')).toBe('alltagsbegleitung')
  })

  it('ist unempfindlich gegen Gross-/Kleinschreibung und Umlaute', () => {
    expect(buchungsLeistungsart('  HAUSHALT  ')).toBe('hauswirtschaft')
    expect(buchungsLeistungsart('Mobilität')).toBe('alltagsbegleitung')
  })

  it('gibt null fuer Leistungen ohne entschiedenen Tarif — kein Ausweichen auf sonstige', () => {
    // Das ist der Kern des Fail-Closed: 'sonstige' traegt einen EIGENEN
    // Preis. Wer hier ausweicht, rechnet z. B. einen Krankenfahrdienst
    // zum Begleitungssatz ab.
    for (const s of ['Freizeit', 'Freizeitbegleitung', 'Apotheke', 'Aktivitäten', 'Krankenfahrdienst', 'Hygienebox']) {
      expect(buchungsLeistungsart(s), s).toBeNull()
    }
  })

  it('gibt null bei fehlender Leistung', () => {
    expect(buchungsLeistungsart(null)).toBeNull()
    expect(buchungsLeistungsart(undefined)).toBeNull()
    expect(buchungsLeistungsart('')).toBeNull()
  })

  it('loest niemals auf sonstige auf', () => {
    for (const s of [...aufloesbareBuchungsleistungen(), 'Haushaltshilfe', 'Begleitung']) {
      expect(buchungsLeistungsart(s)).not.toBe('sonstige')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2 — Zeitfenster
// ═══════════════════════════════════════════════════════════════════════

describe('endzeitAus', () => {
  it('rechnet Startzeit plus Dauer auf eine Endzeit', () => {
    expect(endzeitAus('09:00:00', 2)).toBe('11:00:00')
    expect(endzeitAus('09:30', 1.5)).toBe('11:00:00')
    expect(endzeitAus('08:15:00', 0.25)).toBe('08:30:00')
  })

  it('wirft bei einem Fenster ueber Mitternacht — ein assignment traegt nur EINEN Tag', () => {
    expect(() => endzeitAus('23:00:00', 2)).toThrow(EinsatzKetteFehler)
    expect(() => endzeitAus('23:00:00', 2)).toThrow(/Mitternacht/)
  })

  it('laesst Punkt Mitternacht als Ende gerade noch zu', () => {
    expect(endzeitAus('22:00:00', 2)).toBe('24:00:00')
  })

  it('wirft bei Dauer 0, negativer Dauer und fehlender Dauer', () => {
    for (const d of [0, -1, Number.NaN]) {
      expect(() => endzeitAus('09:00:00', d)).toThrow(/gültige Dauer/)
    }
  })

  it('wirft bei unlesbarer Uhrzeit', () => {
    expect(() => endzeitAus('spaeter', 1)).toThrow(/Ungültige Uhrzeit/)
    expect(() => endzeitAus('12:xx', 1)).toThrow(/Ungültige Uhrzeit/)
  })

  it('BEFUND: leere Uhrzeit wirft, statt still auf Mitternacht zu rutschen', () => {
    // Number('') ist 0 — der leere String ergab klaglos „00:00" und der
    // Einsatz landete auf Mitternacht statt in der Fehlerbehandlung.
    expect(() => endzeitAus('', 1)).toThrow(/Ungültige Uhrzeit/)
    expect(() => endzeitAus(':', 1)).toThrow(/Ungültige Uhrzeit/)
    expect(() => endzeitAus('09:', 1)).toThrow(/Ungültige Uhrzeit/)
  })

  it('wirft bei Uhrzeiten ausserhalb des Tages', () => {
    expect(() => endzeitAus('25:00', 1)).toThrow(/Ungültige Uhrzeit/)
    expect(() => endzeitAus('09:99', 1)).toThrow(/Ungültige Uhrzeit/)
  })

  it('traegt den Fehlercode ZEITFENSTER_UNGUELTIG', () => {
    try {
      endzeitAus('23:30', 3)
      throw new Error('haette werfen muessen')
    } catch (err) {
      expect(istEinsatzKetteFehler(err)).toBe(true)
      expect((err as InstanceType<typeof EinsatzKetteFehler>).code).toBe('ZEITFENSTER_UNGUELTIG')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3 — Der glueckliche Weg
// ═══════════════════════════════════════════════════════════════════════

describe('erzeugeEinsatzUndNachweis — vollstaendige Kette', () => {
  it('legt Einsatz und Nachweis-Entwurf an und gibt beide IDs zurueck', async () => {
    const f = fake()
    const erg = await erzeugeEinsatzUndNachweis(f.client, { booking: BUCHUNG, organizationId: ORG, actorId: ACTOR })

    expect(erg.assignmentId).toBe(ASSIGNMENT)
    expect(erg.serviceRecordId).toBe(RECORD)
    expect(erg.leistungsart).toBe('hauswirtschaft')
    expect(erg.startTime).toBe('09:00:00')
    expect(erg.endTime).toBe('11:00:00')
    expect(erg.warnungen).toEqual([])
  })

  it('traegt in service_type den TARIF-Schluessel, nicht den Buchungstext', async () => {
    // Sonst trifft die Tarifaufloesung im Rechnungslauf ins Leere und der
    // Einsatz bleibt unabrechenbar liegen.
    const f = fake()
    await erzeugeEinsatzUndNachweis(f.client, {
      booking: { ...BUCHUNG, service: 'Arztbesuch' }, organizationId: ORG, actorId: ACTOR,
    })
    const a = (f.ersterAuf('assignments', 'insert')!.payload) as Record<string, unknown>
    const r = (f.ersterAuf('service_records', 'insert')!.payload) as Record<string, unknown>
    expect(a.service_type).toBe('begleitservice')
    expect(r.service_type).toBe('begleitservice')
  })

  it('legt den Nachweis als Entwurf an — offen, ohne Betrag', async () => {
    const f = fake()
    await erzeugeEinsatzUndNachweis(f.client, { booking: BUCHUNG, organizationId: ORG, actorId: ACTOR })
    const r = (f.ersterAuf('service_records', 'insert')!.payload) as Record<string, unknown>
    expect(r.status).toBe('draft')
    expect(r.proof_status).toBe('ENTWURF')
    expect(r.billing_status).toBe('OFFEN')
    // Kein Betrag: der entsteht erst im Rechnungslauf aus dem verifizierten Tarif.
    expect(r).not.toHaveProperty('amount')
    // duration_minutes ist eine GENERATED-Spalte — mitgeliefert scheitert
    // der INSERT mit 428C9 (Befund Pilot-E2E 14.08.2026).
    expect(r).not.toHaveProperty('duration_minutes')
  })

  it('setzt den Einsatz auf GEPLANT und verweist auf die Buchung', async () => {
    const f = fake()
    await erzeugeEinsatzUndNachweis(f.client, { booking: BUCHUNG, organizationId: ORG, actorId: ACTOR })
    const a = (f.ersterAuf('assignments', 'insert')!.payload) as Record<string, unknown>
    expect(a.status).toBe('GEPLANT')
    expect(a.is_recurring).toBe(false)
    expect(a.created_by).toBe(ACTOR)
    expect(String(a.notes)).toContain(BUCHUNG.id)
  })

  it('verknuepft den Nachweis mit dem eben angelegten Einsatz', async () => {
    const f = fake()
    await erzeugeEinsatzUndNachweis(f.client, { booking: BUCHUNG, organizationId: ORG, actorId: ACTOR })
    const r = (f.ersterAuf('service_records', 'insert')!.payload) as Record<string, unknown>
    expect(r.assignment_id).toBe(ASSIGNMENT)
  })

  it('faellt ohne Uhrzeit auf 10:00 zurueck', async () => {
    const f = fake()
    const erg = await erzeugeEinsatzUndNachweis(f.client, {
      booking: { ...BUCHUNG, time: null }, organizationId: ORG, actorId: ACTOR,
    })
    expect(erg.startTime).toBe('10:00:00')
    expect(erg.endTime).toBe('12:00:00')
  })

  it('uebernimmt Adresse und PLZ des Klienten, wenn vorhanden', async () => {
    const f = fake()
    await erzeugeEinsatzUndNachweis(f.client, { booking: BUCHUNG, organizationId: ORG, actorId: ACTOR })
    const a = (f.ersterAuf('assignments', 'insert')!.payload) as Record<string, unknown>
    expect(a.address).toBe('Musterweg 1')
    expect(a.zip_code).toBe('60311')
  })

  it('laesst Adressfelder weg, wenn der Klient keine hat (statt null zu schreiben)', async () => {
    const f = fake({ clients: { data: { id: CLIENT, first_name: 'A', last_name: 'B', address: null, zip_code: null } } })
    await erzeugeEinsatzUndNachweis(f.client, { booking: BUCHUNG, organizationId: ORG, actorId: ACTOR })
    const a = (f.ersterAuf('assignments', 'insert')!.payload) as Record<string, unknown>
    expect(a).not.toHaveProperty('address')
    expect(a).not.toHaveProperty('zip_code')
  })

  it('setzt fehlende Initialen auf ?? statt den INSERT scheitern zu lassen', async () => {
    const f = fake({ caregivers: { data: { id: CAREGIVER, first_name: 'C', last_name: 'D', initials: null } } })
    await erzeugeEinsatzUndNachweis(f.client, { booking: BUCHUNG, organizationId: ORG, actorId: ACTOR })
    const r = (f.ersterAuf('service_records', 'insert')!.payload) as Record<string, unknown>
    expect(r.caregiver_initials).toBe('??')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4 — Mandantengrenze (RLS greift hier NICHT)
// ═══════════════════════════════════════════════════════════════════════

describe('erzeugeEinsatzUndNachweis — Mandantengrenze', () => {
  it('zieht den organization_id-Zaun auf JEDER Abfrage und in JEDEM Insert', async () => {
    const f = fake()
    await erzeugeEinsatzUndNachweis(f.client, { booking: BUCHUNG, organizationId: ORG, actorId: ACTOR })

    expect(hatOrgFence(f.ersterAuf('clients'), ORG)).toBe(true)
    expect(hatOrgFence(f.ersterAuf('caregivers'), ORG)).toBe(true)
    expect((f.ersterAuf('assignments', 'insert')!.payload as Record<string, unknown>).organization_id).toBe(ORG)
    expect((f.ersterAuf('service_records', 'insert')!.payload as Record<string, unknown>).organization_id).toBe(ORG)
  })

  it('sucht den Klienten ueber clients.user_id — nicht ueber die Buchungs-ID', async () => {
    const f = fake()
    await erzeugeEinsatzUndNachweis(f.client, { booking: BUCHUNG, organizationId: ORG, actorId: ACTOR })
    expect(hatFilter(f.ersterAuf('clients'), 'eq', 'user_id', KUNDE)).toBe(true)
    expect(hatFilter(f.ersterAuf('caregivers'), 'eq', 'user_id', ENGEL)).toBe(true)
  })

  it('ein Klient aus einem fremden Mandanten ist kein Klient (kein Treffer => KEIN_KLIENT)', async () => {
    const f = fake({ clients: { data: null, error: null } })
    await expect(erzeugeEinsatzUndNachweis(f.client, { booking: BUCHUNG, organizationId: ORG, actorId: ACTOR }))
      .rejects.toThrow(/keinen Klienten-Datensatz/)
    // Nichts wurde geschrieben.
    expect(f.auf('assignments')).toHaveLength(0)
    expect(f.auf('service_records')).toHaveLength(0)
  })

  it('legt weder Klient noch Betreuungskraft automatisch an', async () => {
    const f = fake({ caregivers: { data: null, error: null } })
    await expect(erzeugeEinsatzUndNachweis(f.client, { booking: BUCHUNG, organizationId: ORG, actorId: ACTOR }))
      .rejects.toThrow(EinsatzKetteFehler)
    expect(f.auf('clients').some(a => a.operation === 'insert')).toBe(false)
    expect(f.auf('caregivers').some(a => a.operation === 'insert')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5 — Fail-Closed an jedem Kettenglied
// ═══════════════════════════════════════════════════════════════════════

describe('erzeugeEinsatzUndNachweis — jeder Bruch wirft mit Code', () => {
  async function fehler(w: Welt, booking = BUCHUNG) {
    const f = fake(w)
    try {
      await erzeugeEinsatzUndNachweis(f.client, { booking, organizationId: ORG, actorId: ACTOR })
      throw new Error('haette werfen muessen')
    } catch (err) {
      if (!istEinsatzKetteFehler(err)) throw err
      return { err, f }
    }
  }

  it('nicht abrechenbare Leistung: KEINE_TARIFZUORDNUNG, noch VOR jedem Datenbankzugriff', async () => {
    const { err, f } = await fehler({}, { ...BUCHUNG, service: 'Hygienebox' })
    expect(err.code).toBe('KEINE_TARIFZUORDNUNG')
    expect(err.httpStatus).toBe(422)
    expect(f.aufrufe).toHaveLength(0)
  })

  it('Buchung ohne Kunde: KEIN_KLIENT', async () => {
    const { err } = await fehler({}, { ...BUCHUNG, customer_id: null })
    expect(err.code).toBe('KEIN_KLIENT')
  })

  it('Buchung ohne Engel: KEINE_BETREUUNGSKRAFT', async () => {
    const { err } = await fehler({}, { ...BUCHUNG, angel_id: null })
    expect(err.code).toBe('KEINE_BETREUUNGSKRAFT')
  })

  it('Klient nicht freigegeben: CLIENT_FREIGABE_FEHLT, mit Problemliste', async () => {
    freigaben.client = { clientId: CLIENT, clientName: 'Frau Test', freigegeben: false, probleme: ['Kein Vertrag'] }
    const { err, f } = await fehler({})
    expect(err.code).toBe('CLIENT_FREIGABE_FEHLT')
    expect(err.details.probleme).toEqual(['Kein Vertrag'])
    expect(f.auf('assignments')).toHaveLength(0)
  })

  it('Betreuungskraft ohne Einsatzfreigabe: EINSATZFREIGABE_FEHLT', async () => {
    freigaben.caregiver = { ...freigaben.caregiver, freigegeben: false, probleme: ['Führungszeugnis fehlt'] }
    const { err, f } = await fehler({})
    expect(err.code).toBe('EINSATZFREIGABE_FEHLT')
    expect(err.details.probleme).toEqual(['Führungszeugnis fehlt'])
    expect(f.auf('assignments')).toHaveLength(0)
  })

  it('Kette prueft NICHT schwaecher als die Disposition — beide Freigaben werden gestellt', async () => {
    const f = fake()
    await erzeugeEinsatzUndNachweis(f.client, { booking: BUCHUNG, organizationId: ORG, actorId: ACTOR })
    expect(spione.pruefeClientFreigabe).toHaveBeenCalledTimes(1)
    expect(spione.pruefeEinsatzfreigabe).toHaveBeenCalledTimes(1)
    // Die Klientenfreigabe muss auf das Einsatzdatum gestellt werden.
    expect(spione.pruefeClientFreigabe.mock.calls[0]).toEqual([expect.anything(), CLIENT, ORG, BUCHUNG.date])
  })

  it('Doppelbelegung wird als 409 erkannt, nicht als technischer Fehler', async () => {
    const { err } = await fehler({
      assignmentInsert: { data: null, error: { message: 'DOPPELBELEGUNG: Einsatz überschneidet sich' } },
    })
    expect(err.code).toBe('DOPPELBELEGUNG')
    expect(err.httpStatus).toBe(409)
  })

  it('jeder andere Insert-Fehler ist ASSIGNMENT_FEHLGESCHLAGEN mit 500', async () => {
    const { err } = await fehler({
      assignmentInsert: { data: null, error: { message: 'null value in column "client_id"' } },
    })
    expect(err.code).toBe('ASSIGNMENT_FEHLGESCHLAGEN')
    expect(err.httpStatus).toBe(500)
    expect(err.details.dbFehler).toContain('client_id')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6 — Kompensation: keine halbe Kette
// ═══════════════════════════════════════════════════════════════════════

describe('erzeugeEinsatzUndNachweis — Kompensation', () => {
  it('nimmt den Einsatz zurueck, wenn der Nachweis scheitert', async () => {
    const f = fake({ recordInsert: { data: null, error: { message: '428C9 duration_minutes is generated' } } })
    await expect(erzeugeEinsatzUndNachweis(f.client, { booking: BUCHUNG, organizationId: ORG, actorId: ACTOR }))
      .rejects.toThrow(/zurückgenommen/)

    const del = f.auf('assignments').find(a => a.operation === 'delete')
    expect(del, 'der eben angelegte Einsatz muss geloescht werden').toBeDefined()
    expect(hatFilter(del, 'eq', 'id', ASSIGNMENT)).toBe(true)
    // Auch die Kompensation bleibt im Mandanten.
    expect(hatOrgFence(del, ORG)).toBe(true)
  })

  it('meldet NACHWEIS_FEHLGESCHLAGEN mit dem DB-Grund', async () => {
    const f = fake({ recordInsert: { data: null, error: { message: 'violates check constraint' } } })
    try {
      await erzeugeEinsatzUndNachweis(f.client, { booking: BUCHUNG, organizationId: ORG, actorId: ACTOR })
      throw new Error('haette werfen muessen')
    } catch (err) {
      expect(istEinsatzKetteFehler(err)).toBe(true)
      const e = err as InstanceType<typeof EinsatzKetteFehler>
      expect(e.code).toBe('NACHWEIS_FEHLGESCHLAGEN')
      expect(e.httpStatus).toBe(500)
      expect(String(e.details.dbFehler)).toContain('check constraint')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7 — Abrechnungsart aus payment_method
// ═══════════════════════════════════════════════════════════════════════

describe('erzeugeEinsatzUndNachweis — Abrechnungsart', () => {
  async function nachweisFuer(paymentMethod: string | null) {
    const f = fake()
    const erg = await erzeugeEinsatzUndNachweis(f.client, {
      booking: { ...BUCHUNG, payment_method: paymentMethod }, organizationId: ORG, actorId: ACTOR,
    })
    return { zeile: f.ersterAuf('service_records', 'insert')!.payload as Record<string, unknown>, erg }
  }

  it("'kasse' wird als §45b gegen den Entlastungsbetrag gefuehrt", async () => {
    const { zeile } = await nachweisFuer('kasse')
    expect(zeile.budget_type).toBe('entlastung')
    expect(zeile.billing_type).toBe('§45b')
    expect(spione.pruefeBudget).toHaveBeenCalledTimes(1)
    expect(spione.pruefeBudget.mock.calls[0]).toEqual([expect.anything(), CLIENT, ORG, 'entlastung'])
  })

  it("'privat' laeuft gegen kein Kassenlimit — es wird gar kein Budget geprueft", async () => {
    const { zeile } = await nachweisFuer('privat')
    expect(zeile.budget_type).toBe('private')
    expect(zeile.billing_type).toBe('PRIVAT')
    expect(spione.pruefeBudget).not.toHaveBeenCalled()
  })

  it('unbekannte oder fehlende Zahlungsart faellt auf PRIVAT — nie auf Kasse', async () => {
    // Andersherum waere teuer: eine geratene Kassenleistung belastet ein
    // fremdes Budget und ist ohne Bescheid nicht abrechenbar.
    for (const m of [null, 'unbekannt', '']) {
      const { zeile } = await nachweisFuer(m)
      expect(zeile.billing_type, String(m)).toBe('PRIVAT')
    }
  })

  it("'kombi' wird als Kassenleistung angelegt und warnt vor der offenen Aufteilung", async () => {
    const { zeile, erg } = await nachweisFuer('kombi')
    expect(zeile.billing_type).toBe('§45b')
    expect(erg.warnungen).toHaveLength(1)
    expect(erg.warnungen[0]).toMatch(/Aufteilung/)
  })

  it('blockiertes Budget haelt die Kette an: BUDGET_BLOCKIERT, nichts geschrieben', async () => {
    freigaben.budget = { warnung: 'Entlastungsbetrag ausgeschöpft', blockiert: true, prozent: 105, budgetTyp: 'entlastung' }
    const f = fake()
    await expect(erzeugeEinsatzUndNachweis(f.client, {
      booking: { ...BUCHUNG, payment_method: 'kasse' }, organizationId: ORG, actorId: ACTOR,
    })).rejects.toThrow(/ausgeschöpft/)
    expect(f.auf('assignments')).toHaveLength(0)
  })

  it('eine Budgetwarnung ohne Blockade reicht die Warnung durch, ohne die Kette anzuhalten', async () => {
    freigaben.budget = { warnung: 'Budget zu 85 % verbraucht', blockiert: false, prozent: 85, budgetTyp: 'entlastung' }
    const { erg } = await nachweisFuer('kasse')
    expect(erg.warnungen).toContain('Budget zu 85 % verbraucht')
  })
})
