// ═══════════════════════════════════════════════════════════════════
// Buchung → Einsatz → Leistungsnachweis (Track A1)
// ═══════════════════════════════════════════════════════════════════
//
// BEFUND (docs/FUNKTIONALE_LUECKENANALYSE.md, Bereich 3, P1):
//   `bookings` und `assignments` waren zwei getrennte Welten.
//   POST /api/bookings/respond setzte ausschliesslich `bookings.status`.
//   Ein Kunde buchte, der Engel nahm an — und in Einsatzplanung,
//   Leistungsnachweis und Abrechnung tauchte der Termin nie auf.
//
// Diese Datei ist die Bruecke. Sie uebersetzt eine angenommene Buchung
// aus der Marktplatz-Welt (profiles/angels) in die Betriebs-Welt
// (clients/caregivers/assignments/service_records) und legt dabei an:
//
//   1. ein `assignment` (Engel + Kunde + Zeitfenster, Status GEPLANT)
//   2. einen `service_record` als Entwurf (status='draft',
//      proof_status='ENTWURF', billing_status='OFFEN')
//
// ── Die drei Bruecken, die vorher fehlten ──────────────────────────
//
//   Kunde   bookings.customer_id → profiles.id → clients.user_id
//   Engel   bookings.angel_id    → angels.id (= profiles.id)
//                                → caregivers.user_id
//   Leistung bookings.service (Buchungsmaske) → Erfassungs-Schreibweise
//                                → tarifLeistungsart() → Tarif-Schluessel
//
// ── FAIL-CLOSED ────────────────────────────────────────────────────
// Jede der drei Bruecken kann reissen. Sie reisst dann LAUT: die
// Funktion wirft einen `EinsatzKetteFehler` mit Code und Klartext.
// Der Aufrufer MUSS daraufhin den Buchungsstatus zurueckdrehen — eine
// angenommene Buchung ohne Einsatz ist genau der Zustand, den diese
// Datei beseitigt.
//
// Bewusst NICHT gemacht:
//   • Keine Preise. `service_records.amount` bleibt leer; der Betrag
//     entsteht erst im Rechnungslauf ueber den verifizierten Tarif.
//   • Kein Ausweichen auf 'sonstige', wenn die Leistungsart keinen
//     Tarif hat (siehe lib/billing/leistungsarten.ts).
//   • Kein automatisches Anlegen von clients/caregivers. Ein Klient
//     ohne Vertrag und eine Betreuungskraft ohne Fuehrungszeugnis
//     duerfen nicht durch die Hintertuer entstehen.
//   • Keine neuen Tarif-Zuordnungen. BUCHUNG_ZU_ERFASSUNG unten bildet
//     nur Schreibweisen der Buchungsmasken auf bereits entschiedene
//     Erfassungs-Schreibweisen ab — welcher Tarif dahinter steht,
//     entscheidet weiterhin allein lib/billing/leistungsarten.ts.
// ═══════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { tarifLeistungsart, normalisiereLeistungsart, type TarifLeistungsart } from '@/lib/billing/leistungsarten'
import { pruefeEinsatzfreigabe, pruefeClientFreigabe, pruefeBudget } from '@/lib/personal/einsatzfreigabe'
import type { BudgetTyp } from '@/lib/config/budget-constants'

// ─── Fehlerklassen ─────────────────────────────────────────────────

export type KetteFehlerCode =
  | 'KEINE_TARIFZUORDNUNG'
  | 'ZEITFENSTER_UNGUELTIG'
  | 'KEIN_KLIENT'
  | 'KEINE_BETREUUNGSKRAFT'
  | 'CLIENT_FREIGABE_FEHLT'
  | 'EINSATZFREIGABE_FEHLT'
  | 'BUDGET_BLOCKIERT'
  | 'DOPPELBELEGUNG'
  | 'ASSIGNMENT_FEHLGESCHLAGEN'
  | 'NACHWEIS_FEHLGESCHLAGEN'

/**
 * Ein Bruch in der Kette Buchung → Einsatz → Nachweis.
 *
 * `nachricht` ist bewusst kundentauglicher Klartext (der Engel sieht sie
 * in der App), `details` traegt die maschinenlesbare Begruendung fuer
 * Oberflaeche und Audit-Trail.
 */
export class EinsatzKetteFehler extends Error {
  readonly code: KetteFehlerCode
  readonly details: Record<string, unknown>
  /** 422 = fachlich blockiert (behebbar), 409 = Konflikt, 500 = technisch. */
  readonly httpStatus: number

  constructor(
    code: KetteFehlerCode,
    nachricht: string,
    details: Record<string, unknown> = {},
    httpStatus = 422,
  ) {
    super(nachricht)
    this.name = 'EinsatzKetteFehler'
    this.code = code
    this.details = details
    this.httpStatus = httpStatus
  }
}

export function istEinsatzKetteFehler(err: unknown): err is EinsatzKetteFehler {
  return err instanceof EinsatzKetteFehler
}

// ─── Leistungsart: Buchungsmaske → Erfassungs-Schreibweise ─────────

/**
 * Die Buchungsmasken benutzen ein DRITTES Vokabular, das weder zu den
 * Erfassungsmasken noch zum Tarifwerk passt:
 *
 *   app/kunde/buchen-service/page.tsx  'Begleitung' 'Arztbesuch' 'Einkauf'
 *                                      'Haushalt' 'Freizeit' 'Apotheke'
 *                                      'Spazieren' 'Aktivitäten'
 *   app/kunde/buchen/[id]/page.tsx     'Alltagsbegleitung'
 *                                      'Arztbesuch-Begleitung'
 *                                      'Einkaufsbegleitung' 'Haushaltshilfe'
 *                                      'Freizeitbegleitung'
 *                                      'Krankenfahrdienst' 'Hygienebox'
 *
 * Hier stehen NUR Schreibvarianten von Leistungen, deren Tarifzuordnung
 * in lib/billing/leistungsarten.ts bereits fachlich entschieden ist —
 * 'Haushalt' ist dasselbe wie 'Haushaltshilfe', 'Spazieren' dasselbe wie
 * 'Spaziergang'. Es entsteht dadurch KEIN neuer Preis.
 *
 * Bewusst NICHT abgebildet, weil dafuer erst ein Tarif entschieden werden
 * muss (das ist eine Preisentscheidung, keine Schreibweise):
 *   'Freizeit' / 'Freizeitbegleitung', 'Apotheke', 'Aktivitäten',
 *   'Krankenfahrdienst', 'Hygienebox'
 * Diese Buchungen laufen fail-closed in KEINE_TARIFZUORDNUNG.
 */
const BUCHUNG_ZU_ERFASSUNG: Record<string, string> = {
  'haushalt': 'haushaltshilfe',
  'einkauf': 'einkaufshilfe',
  'arztbesuch': 'arztbegleitung',
  'arztbesuch-begleitung': 'arztbegleitung',
  'spazieren': 'spaziergang',
}

/**
 * Loest die Leistungsart einer Buchung auf einen Tarif-Schluessel auf.
 * `null` heisst: diese Buchung ist nicht abrechenbar.
 */
export function buchungsLeistungsart(service: string | null | undefined): TarifLeistungsart | null {
  if (!service) return null
  const direkt = tarifLeistungsart(service)
  if (direkt) return direkt
  const erfassung = BUCHUNG_ZU_ERFASSUNG[normalisiereLeistungsart(service)]
  return erfassung ? tarifLeistungsart(erfassung) : null
}

/** Alle Buchungs-Schreibweisen, die aufloesbar sind — fuer Fehlermeldungen. */
export function aufloesbareBuchungsleistungen(): string[] {
  return Object.keys(BUCHUNG_ZU_ERFASSUNG).sort()
}

// ─── Abrechnungsart: payment_method → budget_type/billing_type ─────

interface Abrechnungsart {
  budgetType: 'private' | 'entlastung'
  billingType: 'PRIVAT' | '§45b'
  /** Budget-Topf fuer pruefeBudget(), null = laeuft gegen kein Kassenlimit. */
  budgetPruefung: BudgetTyp | null
  warnung: string | null
}

/**
 * `bookings.payment_method` kennt 'kasse' | 'privat' | 'kombi'.
 *
 * 'kombi' wird als Kassenleistung angelegt: die Aufteilung zwischen
 * Entlastungsbetrag und Eigenanteil entsteht erst bei der Rechnung und
 * wird hier NICHT geraten. Der Hinweis dazu geht als Warnung zurueck.
 */
function abrechnungsartFuer(paymentMethod: string | null | undefined): Abrechnungsart {
  if (paymentMethod === 'kasse') {
    return { budgetType: 'entlastung', billingType: '§45b', budgetPruefung: 'entlastung', warnung: null }
  }
  if (paymentMethod === 'kombi') {
    return {
      budgetType: 'entlastung',
      billingType: '§45b',
      budgetPruefung: 'entlastung',
      warnung:
        'Kombi-Abrechnung: Die Aufteilung zwischen Entlastungsbetrag und Eigenanteil ' +
        'ist vor der Rechnungsstellung manuell festzulegen.',
    }
  }
  return { budgetType: 'private', billingType: 'PRIVAT', budgetPruefung: null, warnung: null }
}

// ─── Zeitfenster ───────────────────────────────────────────────────

/**
 * Rechnet `time` + `duration_hours` in eine Endzeit um.
 * Ein Fenster, das ueber Mitternacht laeuft, ist als ein einzelner
 * `assignment` nicht darstellbar (der Ueberschneidungs-Trigger vergleicht
 * start_time/end_time innerhalb EINES Tages) — deshalb fail-closed.
 */
export function endzeitAus(startzeit: string, dauerStunden: number): string {
  // Number('') ist 0, nicht NaN: ein leerer oder halber Zeitstring
  // ergab damit klaglos „00:00" und legte den Einsatz auf Mitternacht,
  // statt den Bruch zu melden. Deshalb erst die Form pruefen, dann rechnen.
  const teile = startzeit.split(':')
  const h = Number(teile[0])
  const m = teile.length > 1 ? Number(teile[1]) : 0
  const stelligkeitOk =
    /^\d{1,2}$/.test(teile[0] ?? '')
    && (teile.length === 1 || /^\d{1,2}$/.test(teile[1] ?? ''))
  if (!stelligkeitOk || !Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) {
    throw new EinsatzKetteFehler('ZEITFENSTER_UNGUELTIG', `Ungültige Uhrzeit „${startzeit}".`, { startzeit })
  }
  if (!Number.isFinite(dauerStunden) || dauerStunden <= 0) {
    throw new EinsatzKetteFehler(
      'ZEITFENSTER_UNGUELTIG',
      'Die Buchung hat keine gültige Dauer.',
      { dauerStunden },
    )
  }
  const endeMinuten = h * 60 + m + Math.round(dauerStunden * 60)
  if (endeMinuten > 24 * 60) {
    throw new EinsatzKetteFehler(
      'ZEITFENSTER_UNGUELTIG',
      `Der Einsatz würde um ${startzeit.slice(0, 5)} beginnen und über Mitternacht hinauslaufen. ` +
      'Solche Buchungen müssen in zwei Einsätze geteilt werden.',
      { startzeit, dauerStunden },
    )
  }
  const eh = Math.floor(endeMinuten / 60)
  const em = endeMinuten % 60
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`
}

// ─── Hauptfunktion ─────────────────────────────────────────────────

export interface BuchungFuerKette {
  id: string
  customer_id: string | null
  angel_id: string | null
  service: string | null
  date: string
  time: string | null
  duration_hours: number | null
  payment_method?: string | null
  notes?: string | null
}

export interface KetteErgebnis {
  assignmentId: string
  serviceRecordId: string
  clientId: string
  caregiverId: string
  leistungsart: TarifLeistungsart
  assignmentDate: string
  startTime: string
  endTime: string
  warnungen: string[]
}

/**
 * Legt zu einer angenommenen Buchung Einsatz und Leistungsnachweis-Entwurf an.
 *
 * Reihenfolge ist Absicht: erst alle Pruefungen (billig, ohne Seiteneffekt),
 * dann `assignments`, dann `service_records`. Scheitert der Nachweis, wird
 * der eben angelegte Einsatz wieder entfernt — sonst bliebe ein Einsatz
 * ohne Nachweis stehen, also genau die halbe Kette, die es zu vermeiden gilt.
 *
 * @param admin  Service-Role-Client. Der antwortende Engel hat auf
 *               `assignments`/`service_records` keine Schreibrechte; die
 *               Mandantengrenze wird hier explizit ueber `organizationId`
 *               in JEDER Abfrage gezogen, nicht ueber RLS.
 * @throws EinsatzKetteFehler bei jedem Bruch in der Kette.
 */
export async function erzeugeEinsatzUndNachweis(
  admin: SupabaseClient,
  args: {
    booking: BuchungFuerKette
    organizationId: string
    actorId: string
  },
): Promise<KetteErgebnis> {
  const { booking, organizationId, actorId } = args
  const warnungen: string[] = []

  // ── 1) Leistungsart → Tarif-Schluessel ──────────────────────────
  // Zuerst, weil es der billigste Fail-closed-Check ist und weil eine
  // nicht abrechenbare Leistung gar nicht erst geplant werden soll.
  const leistungsart = buchungsLeistungsart(booking.service)
  if (!leistungsart) {
    throw new EinsatzKetteFehler(
      'KEINE_TARIFZUORDNUNG',
      `Für die gebuchte Leistung „${booking.service ?? '—'}" ist kein Tarif hinterlegt. ` +
      'Der Einsatz wäre nicht abrechenbar. Bitte zuerst einen Tarif dafür anlegen ' +
      '(Abrechnung → Tarife).',
      { service: booking.service },
    )
  }

  // ── 2) Zeitfenster ──────────────────────────────────────────────
  const startzeit = booking.time || '10:00:00'
  const endzeit = endzeitAus(startzeit, booking.duration_hours ?? 0)

  // ── 3) Bruecke Kunde → Klient ───────────────────────────────────
  if (!booking.customer_id) {
    throw new EinsatzKetteFehler('KEIN_KLIENT', 'Die Buchung hat keinen Kunden.', { bookingId: booking.id })
  }
  const { data: client } = await admin
    .from('clients')
    .select('id, first_name, last_name, address, zip_code')
    .eq('user_id', booking.customer_id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!client) {
    throw new EinsatzKetteFehler(
      'KEIN_KLIENT',
      'Zu diesem Kunden gibt es noch keinen Klienten-Datensatz in der Verwaltung. ' +
      'Ohne ihn kann kein Einsatz geplant und kein Leistungsnachweis geführt werden.',
      { customerId: booking.customer_id, hinweis: 'clients.user_id auf das Kundenprofil setzen' },
    )
  }

  // ── 4) Bruecke Engel → Betreuungskraft ──────────────────────────
  if (!booking.angel_id) {
    throw new EinsatzKetteFehler('KEINE_BETREUUNGSKRAFT', 'Die Buchung hat keinen Engel.', { bookingId: booking.id })
  }
  const { data: caregiver } = await admin
    .from('caregivers')
    .select('id, first_name, last_name, initials')
    .eq('user_id', booking.angel_id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!caregiver) {
    throw new EinsatzKetteFehler(
      'KEINE_BETREUUNGSKRAFT',
      'Zu diesem Engel gibt es noch keinen Mitarbeiter-Datensatz in der Verwaltung. ' +
      'Ohne ihn kann kein Einsatz geplant werden.',
      { angelId: booking.angel_id, hinweis: 'caregivers.user_id auf das Engel-Profil setzen' },
    )
  }

  // ── 5) Freigaben — dieselben Pruefungen wie POST /api/einsatzplanung ──
  // Ein Einsatz, der ueber die Buchungsstrecke entsteht, darf nicht
  // schwaecher geprueft sein als einer, den die Disposition anlegt.
  const clientCheck = await pruefeClientFreigabe(admin, client.id, organizationId, booking.date)
  if (!clientCheck.freigegeben) {
    throw new EinsatzKetteFehler(
      'CLIENT_FREIGABE_FEHLT',
      `Klient „${clientCheck.clientName}" ist nicht für Einsätze freigegeben.`,
      { probleme: clientCheck.probleme },
    )
  }

  const freigabe = await pruefeEinsatzfreigabe(admin, caregiver.id, organizationId)
  if (!freigabe.freigegeben) {
    throw new EinsatzKetteFehler(
      'EINSATZFREIGABE_FEHLT',
      `Für „${freigabe.caregiverName}" liegt keine Einsatzfreigabe vor.`,
      { probleme: freigabe.probleme, abgelaufeneQualifikationen: freigabe.abgelaufeneQualifikationen },
    )
  }

  // ── 6) Budget ───────────────────────────────────────────────────
  const abrechnung = abrechnungsartFuer(booking.payment_method)
  if (abrechnung.warnung) warnungen.push(abrechnung.warnung)

  if (abrechnung.budgetPruefung) {
    const budget = await pruefeBudget(admin, client.id, organizationId, abrechnung.budgetPruefung)
    if (budget.blockiert) {
      throw new EinsatzKetteFehler(
        'BUDGET_BLOCKIERT',
        budget.warnung ?? 'Das Budget des Klienten lässt diesen Einsatz nicht zu.',
        { budgetTyp: abrechnung.budgetPruefung },
      )
    }
    if (budget.warnung) warnungen.push(budget.warnung)
  }

  // ── 7) Einsatz anlegen ──────────────────────────────────────────
  // service_type traegt bewusst den kanonischen Tarif-Schluessel und nicht
  // den Buchungstext: nur so trifft die Tarifaufloesung im Rechnungslauf.
  const assignmentInsert: Record<string, unknown> = {
    organization_id: organizationId,
    client_id: client.id,
    caregiver_id: caregiver.id,
    assignment_date: booking.date,
    start_time: startzeit,
    end_time: endzeit,
    service_type: leistungsart,
    status: 'GEPLANT',
    is_recurring: false,
    created_by: actorId,
    notes: `Automatisch aus Buchung ${booking.id} erzeugt.`,
  }
  if (client.address) assignmentInsert.address = client.address
  if (client.zip_code) assignmentInsert.zip_code = client.zip_code

  const { data: assignment, error: assignmentError } = await admin
    .from('assignments')
    .insert(assignmentInsert)
    .select('id')
    .single()

  if (assignmentError || !assignment) {
    const meldung = assignmentError?.message ?? 'unbekannt'
    if (meldung.includes('DOPPELBELEGUNG')) {
      throw new EinsatzKetteFehler(
        'DOPPELBELEGUNG',
        'Zu dieser Zeit ist bereits ein anderer Einsatz eingeplant.',
        { assignmentDate: booking.date, startzeit, endzeit },
        409,
      )
    }
    throw new EinsatzKetteFehler(
      'ASSIGNMENT_FEHLGESCHLAGEN',
      'Der Einsatz konnte nicht angelegt werden.',
      { dbFehler: meldung },
      500,
    )
  }

  // ── 8) Leistungsnachweis-Entwurf ────────────────────────────────
  // KEIN `amount`: der Betrag entsteht erst im Rechnungslauf aus dem
  // verifizierten Tarif. `duration_minutes` fehlt ebenfalls bewusst —
  // GENERATED-Spalte, ein mitgelieferter Wert laesst den INSERT mit
  // 428C9 scheitern (Befund Pilot-E2E 14.08.2026).
  const recordInsert: Record<string, unknown> = {
    organization_id: organizationId,
    client_id: client.id,
    caregiver_id: caregiver.id,
    assignment_id: assignment.id,
    date: booking.date,
    start_time: startzeit,
    end_time: endzeit,
    service_type: leistungsart,
    budget_type: abrechnung.budgetType,
    billing_type: abrechnung.billingType,
    caregiver_initials: caregiver.initials || '??',
    status: 'draft',
    proof_status: 'ENTWURF',
    billing_status: 'OFFEN',
    notes: `Entwurf aus Buchung ${booking.id}.`,
  }

  const { data: record, error: recordError } = await admin
    .from('service_records')
    .insert(recordInsert)
    .select('id')
    .single()

  if (recordError || !record) {
    // Kompensation: ohne Nachweis ist der Einsatz die halbe Kette.
    // Loeschen statt stehenlassen — er ist Sekunden alt und hat noch
    // keinen Bezug ausserhalb dieser Funktion.
    await admin.from('assignments').delete().eq('id', assignment.id).eq('organization_id', organizationId)
    throw new EinsatzKetteFehler(
      'NACHWEIS_FEHLGESCHLAGEN',
      'Der Leistungsnachweis-Entwurf konnte nicht angelegt werden; der Einsatz wurde zurückgenommen.',
      { dbFehler: recordError?.message ?? 'unbekannt' },
      500,
    )
  }

  return {
    assignmentId: assignment.id,
    serviceRecordId: record.id,
    clientId: client.id,
    caregiverId: caregiver.id,
    leistungsart,
    assignmentDate: booking.date,
    startTime: startzeit,
    endTime: endzeit,
    warnungen,
  }
}
