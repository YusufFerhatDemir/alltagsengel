// ═══════════════════════════════════════════════════════════════════
// Pilot — Stand der Kundenkette je Kunde
// ═══════════════════════════════════════════════════════════════════
//
// Ermittelt für einen oder mehrere Kunden, wie weit sie auf dem Weg
// Kunde → … → DATEV gekommen sind, und was der nächste konkrete Schritt ist.
//
// GRUNDSATZ: nur lesen, nie schreiben. Diese Datei bewertet den Ist-Zustand
// und ändert ihn nicht — der Pilot soll den Betrieb sichtbar machen, nicht
// im Hintergrund Daten „geradeziehen".
//
// STATUSFALLEN, die hier bewusst berücksichtigt sind:
//
//   • service_records führt ZWEI Statusfelder (status und proof_status).
//     Nur `status` steuert Rechnung und Budget — der Nachweis-Schritt wertet
//     deshalb `status` aus, nicht proof_status. Siehe
//     lib/leistungsnachweis/status-sync.ts.
//
//   • service_records.status='signed' bedeutet NICHT, dass eine Unterschrift
//     existiert: der Wert wird auch von Importen und Altbestand gesetzt.
//     Der Signatur-Schritt zählt deshalb Zeilen in service_signatures und
//     verlässt sich nicht auf den Status.
//
//   • invoices führt zwei Status-Wortschätze parallel: den neuen der
//     Status-Machine ('entwurf'…'bezahlt') und Alt-Werte ('sent','paid',
//     'disputed'). Bezahlt-Erkennung läuft deshalb über Beträge, nicht über
//     den Status-String.
//
//   • invoices.total_amount steht in EURO, nicht in Cent — payments und
//     payment_allocations dagegen in Cent. Die Umrechnung passiert hier an
//     genau einer Stelle.
//
//   • client_budgets führt LIVE genau eine Zeile je Kunde und Jahr:
//     annual_amount/monthly_amount = § 45b Entlastungsbetrag,
//     combined_annual_amount = § 42a VP/KZP. Eine Spalte `budget_type`
//     gibt es dort nicht (die Migration 20260831020000_d2_vp_budget.sql,
//     die sie einführen würde, ist nicht angewendet). Ein Select darauf
//     lässt die GANZE Abfrage mit 42703 scheitern.
//
// KEIN STILLES SCHLUCKEN VON FEHLERN: jede Abfrage wird auf `error` geprüft.
// Eine nicht lesbare Tabelle führt zu Stand „blockiert" mit der echten
// Fehlermeldung — niemals zu einem beruhigenden „0 Datensätze". Genau dieser
// Unterschied entscheidet, ob die Seite einen Defekt zeigt oder ihn verdeckt.
// ═══════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { berlinParts } from '@/lib/utils/timezone'
import { KETTEN_SCHRITTE, schrittHref } from './schritte'
import type { KundenKette, KundenSchritt, SchrittId, SchrittStand } from './types'

/** service_records.status-Werte, die als abrechenbar gelten. */
const ABRECHENBARE_RECORD_STATUS = ['signed', 'complete', 'invoiced']

/** Cent-Toleranz beim Bezahlt-Vergleich (Rundung Euro→Cent). */
const CENT_TOLERANZ = 1

interface KettenRohdaten {
  client: {
    id: string
    first_name: string | null
    last_name: string | null
    geburtsdatum: string | null
    date_of_birth: string | null
    address: string | null
    zip_code: string | null
    city: string | null
    phone: string | null
    email: string | null
    pflegegrad: number | null
    pflegekasse_name: string | null
  }
  budgets: {
    year: number
    /** § 45b Entlastungsbetrag. */
    annual_amount: number | null
    /** § 42a gemeinsamer Jahresbetrag (VP/KZP), erst ab PG 2. */
    combined_annual_amount: number | null
  }[]
  assignments: { id: string; caregiver_id: string | null; assignment_date: string | null; status: string | null }[]
  freigegebeneEngel: Set<string>
  records: { id: string; status: string | null; amount: number | null; date: string | null }[]
  signaturen: { service_record_id: string; signer_role: string | null }[]
  invoices: {
    id: string
    invoice_number_formatted: string | null
    invoice_number: string | null
    status: string | null
    total_amount: number | null
    paid_amount: number | null
    period_start: string | null
    period_end: string | null
    created_at: string | null
  }[]
  pakete: { invoice_id: string }[]
  zuordnungen: { invoice_id: string; amount_cents: number | null }[]
  datevExports: { zeitraum_von: string; zeitraum_bis: string; status: string | null }[]
  /** Tabelle → Fehlermeldung, wenn die Abfrage nicht gelesen werden konnte. */
  fehler: Record<string, string>
}

function euroZuCent(euro: number | null | undefined): number {
  return Math.round((euro ?? 0) * 100)
}

/** Was eine Supabase-Abfrage minimal zurückgibt — Daten oder Fehler. */
interface Antwort<T> {
  data: T[] | null
  error?: { message?: string; code?: string } | null
}

/**
 * Nimmt eine Abfrage-Antwort entgegen und trennt Daten von Fehlern.
 * Ein Fehler landet in `fehler[tabelle]` und wird NICHT zu einer leeren
 * Liste geglättet — sonst liest sich ein kaputter Select wie „nichts da".
 */
function auswerten<T>(
  tabelle: string,
  antwort: Antwort<T>,
  fehler: Record<string, string>,
): T[] {
  if (antwort.error) {
    fehler[tabelle] = `${antwort.error.code ?? 'Fehler'}: ${antwort.error.message ?? 'unbekannt'}`
    return []
  }
  return antwort.data ?? []
}

function schritt(
  id: SchrittId,
  clientId: string,
  stand: SchrittStand,
  wert: string | null,
  naechsterSchritt: string | null,
): KundenSchritt {
  const def = KETTEN_SCHRITTE.find(s => s.id === id)
  if (!def) throw new Error(`Unbekannter Kettenschritt: ${id}`)
  return {
    ...def,
    stand,
    wert,
    naechsterSchritt: stand === 'erledigt' || stand === 'entfaellt' ? null : naechsterSchritt,
    aktionHref: schrittHref(def.href, clientId),
  }
}

/**
 * Lädt alle Rohdaten für eine Menge von Kunden in einem Rutsch.
 * Bewusst gebündelt, damit die Übersichtsseite nicht N×13 Queries auslöst.
 */
async function ladeRohdaten(
  supabase: SupabaseClient,
  organizationId: string,
  clientIds: string[],
): Promise<Map<string, KettenRohdaten>> {
  const jahr = parseInt(berlinParts(new Date()).year, 10)

  const [clientsRes, budgetsRes, assignmentsRes, engelRes, recordsRes, invoicesRes, datevRes] =
    await Promise.all([
      supabase
        .from('clients')
        .select('id, first_name, last_name, geburtsdatum, date_of_birth, address, zip_code, city, phone, email, pflegegrad, pflegekasse_name')
        .eq('organization_id', organizationId)
        .in('id', clientIds),
      // budget_type gibt es live NICHT — siehe Kopfkommentar. Ausgewertet
      // werden die Spalten, die den Anspruch tatsächlich tragen.
      supabase
        .from('client_budgets')
        .select('client_id, year, annual_amount, combined_annual_amount')
        .eq('organization_id', organizationId)
        .eq('year', jahr)
        .in('client_id', clientIds),
      supabase
        .from('assignments')
        .select('id, client_id, caregiver_id, assignment_date, status')
        .eq('organization_id', organizationId)
        .in('client_id', clientIds),
      supabase
        .from('caregivers')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('einsatzfreigabe', true),
      supabase
        .from('service_records')
        .select('id, client_id, status, amount, date')
        .eq('organization_id', organizationId)
        .in('client_id', clientIds),
      supabase
        .from('invoices')
        .select('id, client_id, invoice_number_formatted, invoice_number, status, total_amount, paid_amount, period_start, period_end, created_at')
        .eq('organization_id', organizationId)
        .in('client_id', clientIds)
        .is('deleted_at', null),
      supabase
        .from('datev_exports')
        .select('zeitraum_von, zeitraum_bis, status')
        .eq('organization_id', organizationId),
    ])

  const fehler: Record<string, string> = {}
  const alleClients = auswerten('clients', clientsRes, fehler)
  const alleBudgets = auswerten('client_budgets', budgetsRes, fehler)
  const alleAssignments = auswerten('assignments', assignmentsRes, fehler)
  const alleEngel = auswerten('caregivers', engelRes, fehler)
  const alleRecords = auswerten('service_records', recordsRes, fehler)
  const alleInvoices = auswerten('invoices', invoicesRes, fehler)
  const datevExports = auswerten('datev_exports', datevRes, fehler) as KettenRohdaten['datevExports']

  const recordIds = alleRecords.map(r => r.id)
  const invoiceIds = alleInvoices.map(i => i.id)

  // Signaturen und Belegpakete hängen an Nachweisen bzw. Rechnungen, nicht am
  // Kunden — sie werden über die eben ermittelten IDs nachgeladen.
  const [signaturenRes, paketeRes, zuordnungenRes] = await Promise.all([
    recordIds.length > 0
      ? supabase
          .from('service_signatures')
          .select('service_record_id, signer_role')
          .eq('organization_id', organizationId)
          .in('service_record_id', recordIds)
      : Promise.resolve({ data: [] as { service_record_id: string; signer_role: string | null }[] }),
    invoiceIds.length > 0
      ? supabase
          .from('invoice_packages')
          .select('invoice_id')
          .eq('organization_id', organizationId)
          .in('invoice_id', invoiceIds)
      : Promise.resolve({ data: [] as { invoice_id: string }[] }),
    invoiceIds.length > 0
      ? supabase
          .from('payment_allocations')
          .select('invoice_id, amount_cents')
          .eq('organization_id', organizationId)
          .in('invoice_id', invoiceIds)
      : Promise.resolve({ data: [] as { invoice_id: string; amount_cents: number | null }[] }),
  ])

  const alleSignaturen = auswerten('service_signatures', signaturenRes, fehler)
  const allePakete = auswerten('invoice_packages', paketeRes, fehler)
  const alleZuordnungen = auswerten('payment_allocations', zuordnungenRes, fehler)

  const freigegebeneEngel = new Set(alleEngel.map(c => c.id))

  const map = new Map<string, KettenRohdaten>()
  for (const client of alleClients) {
    const eigeneRecords = alleRecords.filter(r => r.client_id === client.id)
    const eigeneRecordIds = new Set(eigeneRecords.map(r => r.id))
    const eigeneInvoices = alleInvoices.filter(i => i.client_id === client.id)
    const eigeneInvoiceIds = new Set(eigeneInvoices.map(i => i.id))

    map.set(client.id, {
      client,
      budgets: alleBudgets.filter(b => b.client_id === client.id),
      assignments: alleAssignments.filter(a => a.client_id === client.id),
      freigegebeneEngel,
      records: eigeneRecords,
      signaturen: alleSignaturen.filter(s => eigeneRecordIds.has(s.service_record_id)),
      invoices: eigeneInvoices,
      pakete: allePakete.filter(p => eigeneInvoiceIds.has(p.invoice_id)),
      zuordnungen: alleZuordnungen.filter(z => eigeneInvoiceIds.has(z.invoice_id)),
      datevExports,
      fehler,
    })
  }

  return map
}

/**
 * Beschriftet eine Budgetzeile aus den Spalten, die den Anspruch tragen.
 * § 45b und § 42a stehen in derselben Zeile nebeneinander — sie werden
 * getrennt benannt, weil sie verschiedene Rechtsgrundlagen und verschiedene
 * Verfallsregeln haben.
 */
function budgetBeschriftung(b: { annual_amount: number | null; combined_annual_amount: number | null }): string {
  const teile: string[] = []
  if (b.annual_amount) teile.push(`§ 45b ${b.annual_amount} €`)
  if (b.combined_annual_amount) teile.push(`§ 42a ${b.combined_annual_amount} €`)
  return teile.length > 0 ? teile.join(' + ') : 'Budgetzeile ohne Betrag'
}

/**
 * Welche Tabellen ein Schritt braucht. Ist eine davon nicht lesbar, ist der
 * Stand des Schritts UNBEKANNT — er wird als blockiert mit der echten
 * Fehlermeldung ausgewiesen und nicht als „offen" beschönigt.
 */
const SCHRITT_QUELLEN: Record<SchrittId, string[]> = {
  kunde: ['clients'],
  pflegegrad: ['clients'],
  budget: ['client_budgets'],
  engel: ['assignments', 'caregivers'],
  termin: ['assignments'],
  leistungsnachweis: ['service_records'],
  signatur: ['service_records', 'service_signatures'],
  freigabe: ['service_records'],
  rechnung: ['invoices'],
  pdf: ['invoices', 'invoice_packages'],
  zahlung: ['invoices', 'payment_allocations'],
  opos: ['invoices', 'payment_allocations'],
  datev: ['invoices', 'datev_exports'],
}

/** Baut die Kette aus bereits geladenen Rohdaten. */
function baueKette(clientId: string, d: KettenRohdaten): KundenKette {
  const c = d.client
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Ohne Namen'
  const schritte: KundenSchritt[] = []

  // ── 1. Kunde ────────────────────────────────────────────────────
  const stammFehlend: string[] = []
  if (!c.first_name || !c.last_name) stammFehlend.push('Name')
  if (!c.geburtsdatum && !c.date_of_birth) stammFehlend.push('Geburtsdatum')
  if (!c.address) stammFehlend.push('Anschrift')
  if (!c.zip_code) stammFehlend.push('PLZ')
  if (!c.phone && !c.email) stammFehlend.push('Telefon oder E-Mail')
  schritte.push(schritt(
    'kunde', clientId,
    stammFehlend.length === 0 ? 'erledigt' : 'laeuft',
    stammFehlend.length === 0 ? 'Stammdaten vollständig' : `fehlt: ${stammFehlend.join(', ')}`,
    `Stammdaten ergänzen: ${stammFehlend.join(', ')}`,
  ))

  // ── 2. Pflegegrad ───────────────────────────────────────────────
  const pg = c.pflegegrad
  schritte.push(schritt(
    'pflegegrad', clientId,
    pg && pg >= 1 ? 'erledigt' : 'offen',
    pg && pg >= 1 ? `Pflegegrad ${pg}` : 'kein Pflegegrad',
    'Pflegegrad aus dem Bescheid der Pflegekasse eintragen. Ohne ihn entsteht kein Budget und keine Kassenleistung — Selbstzahler-Rechnungen sind trotzdem möglich.',
  ))

  // ── 3. Budget ───────────────────────────────────────────────────
  const budgets = d.budgets
  const budgetStand: SchrittStand = budgets.length > 0
    ? 'erledigt'
    : pg && pg >= 1 ? 'offen' : 'blockiert'
  schritte.push(schritt(
    'budget', clientId,
    budgetStand,
    budgets.length > 0
      ? budgets.map(budgetBeschriftung).join(' · ')
      : 'kein Budget für das laufende Jahr',
    budgetStand === 'blockiert'
      ? 'Erst Pflegegrad erfassen — ohne ihn besteht kein Budgetanspruch.'
      : 'Budget anlegen (Entlastungsbetrag ab PG 1, VP/KZP ab PG 2).',
  ))

  // ── 4. Betreuungskraft ──────────────────────────────────────────
  const zugeordneteEngel = new Set(
    d.assignments.map(a => a.caregiver_id).filter((id): id is string => Boolean(id)),
  )
  const freigegebenZugeordnet = [...zugeordneteEngel].filter(id => d.freigegebeneEngel.has(id))
  const engelStand: SchrittStand = freigegebenZugeordnet.length > 0
    ? 'erledigt'
    : zugeordneteEngel.size > 0 ? 'blockiert' : 'offen'
  schritte.push(schritt(
    'engel', clientId,
    engelStand,
    zugeordneteEngel.size === 0
      ? 'keine Betreuungskraft zugeordnet'
      : `${zugeordneteEngel.size} zugeordnet, davon ${freigegebenZugeordnet.length} mit Einsatzfreigabe`,
    engelStand === 'blockiert'
      ? 'Zugeordnete Betreuungskraft hat keine Einsatzfreigabe — Qualifikationsnachweise prüfen und freigeben.'
      : 'Einsatz mit einer freigegebenen Betreuungskraft anlegen.',
  ))

  // ── 5. Termin ───────────────────────────────────────────────────
  schritte.push(schritt(
    'termin', clientId,
    d.assignments.length > 0 ? 'erledigt' : 'offen',
    `${d.assignments.length} Einsätze geplant`,
    'Einsatz in der Einsatzplanung anlegen.',
  ))

  // ── 6. Leistungsnachweis ────────────────────────────────────────
  const records = d.records
  schritte.push(schritt(
    'leistungsnachweis', clientId,
    records.length > 0 ? 'erledigt' : d.assignments.length > 0 ? 'offen' : 'blockiert',
    `${records.length} Nachweise erfasst`,
    d.assignments.length > 0
      ? 'Leistungsnachweis zum erbrachten Einsatz erfassen.'
      : 'Erst Einsatz planen — ohne Termin gibt es nichts nachzuweisen.',
  ))

  // ── 7. Signaturen ───────────────────────────────────────────────
  // Bewusst über service_signatures, NICHT über status='signed': der Status
  // wird auch von Importen gesetzt und beweist keine Unterschrift.
  const signierteRecordIds = new Set(d.signaturen.map(s => s.service_record_id))
  const signaturStand: SchrittStand = records.length === 0
    ? 'blockiert'
    : signierteRecordIds.size === records.length
      ? 'erledigt'
      : signierteRecordIds.size > 0 ? 'laeuft' : 'offen'
  schritte.push(schritt(
    'signatur', clientId,
    signaturStand,
    records.length === 0
      ? 'keine Nachweise vorhanden'
      : `${signierteRecordIds.size} von ${records.length} Nachweisen unterschrieben`,
    records.length === 0
      ? 'Erst Leistungsnachweis erfassen.'
      : 'Fehlende Unterschriften einholen — ohne sie ist der Nachweis im Streitfall nicht belegt.',
  ))

  // ── 8. Freigabe ─────────────────────────────────────────────────
  const abrechenbar = records.filter(r => ABRECHENBARE_RECORD_STATUS.includes(r.status ?? ''))
  const freigabeStand: SchrittStand = records.length === 0
    ? 'blockiert'
    : abrechenbar.length === records.length
      ? 'erledigt'
      : abrechenbar.length > 0 ? 'laeuft' : 'offen'
  schritte.push(schritt(
    'freigabe', clientId,
    freigabeStand,
    records.length === 0
      ? 'keine Nachweise vorhanden'
      : `${abrechenbar.length} von ${records.length} Nachweisen abrechenbar`,
    records.length === 0
      ? 'Erst Leistungsnachweis erfassen.'
      : 'Offene Nachweise prüfen und freigeben — nur „signed"/„complete" gehen in eine Rechnung ein.',
  ))

  // ── 9. Rechnung ─────────────────────────────────────────────────
  const invoices = d.invoices
  const ohneNummer = invoices.filter(i => !i.invoice_number_formatted && !i.invoice_number)
  const rechnungStand: SchrittStand = invoices.length === 0
    ? (abrechenbar.length > 0 ? 'offen' : 'blockiert')
    : ohneNummer.length > 0 ? 'laeuft' : 'erledigt'
  schritte.push(schritt(
    'rechnung', clientId,
    rechnungStand,
    invoices.length === 0
      ? 'keine Rechnung'
      : ohneNummer.length > 0
        ? `${invoices.length} Rechnungen, davon ${ohneNummer.length} ohne Rechnungsnummer`
        : `${invoices.length} Rechnungen`,
    invoices.length === 0
      ? (abrechenbar.length > 0
          ? 'Rechnung aus den freigegebenen Nachweisen erstellen.'
          : 'Erst Nachweise freigeben — ohne abrechenbare Nachweise entsteht keine Rechnung.')
      : 'Rechnungen ohne fortlaufende Nummer sind nicht rechtskonform (§ 14 Abs. 4 Nr. 4 UStG) — Nummernkreis prüfen.',
  ))

  // ── 10. PDF ─────────────────────────────────────────────────────
  const mitPaket = new Set(d.pakete.map(p => p.invoice_id))
  const pdfStand: SchrittStand = invoices.length === 0
    ? 'blockiert'
    : mitPaket.size === invoices.length
      ? 'erledigt'
      : mitPaket.size > 0 ? 'laeuft' : 'offen'
  schritte.push(schritt(
    'pdf', clientId,
    pdfStand,
    invoices.length === 0
      ? 'keine Rechnung vorhanden'
      : `${mitPaket.size} von ${invoices.length} Rechnungen mit Belegpaket`,
    invoices.length === 0
      ? 'Erst Rechnung erstellen.'
      : 'Belegpaket erzeugen — es enthält Rechnung, Nachweise und Unterschriften und ist der Beleg gegenüber dem Kunden.',
  ))

  // ── 11. Zahlungseingang ─────────────────────────────────────────
  // Bezahlt-Erkennung über Beträge, nicht über den Status-String: invoices
  // führt alte ('paid','sent') und neue Statuswerte parallel.
  const sollCent = invoices.reduce((s, i) => s + euroZuCent(i.total_amount), 0)
  const zugeordnetCent = d.zuordnungen.reduce((s, z) => s + (z.amount_cents ?? 0), 0)
  const gebuchtCent = invoices.reduce((s, i) => s + euroZuCent(i.paid_amount), 0)
  // Die belastbarere Quelle ist die Zuordnung; paid_amount deckt Altbestand ab.
  const bezahltCent = Math.max(zugeordnetCent, gebuchtCent)
  const zahlungStand: SchrittStand = invoices.length === 0
    ? 'blockiert'
    : bezahltCent <= 0
      ? 'offen'
      : bezahltCent + CENT_TOLERANZ >= sollCent ? 'erledigt' : 'laeuft'
  schritte.push(schritt(
    'zahlung', clientId,
    zahlungStand,
    invoices.length === 0
      ? 'keine Rechnung vorhanden'
      : `${(bezahltCent / 100).toFixed(2)} € von ${(sollCent / 100).toFixed(2)} € eingegangen`
        + (zugeordnetCent === 0 && gebuchtCent > 0 ? ' (nur als bezahlt gebucht, ohne Zahlungszuordnung)' : ''),
    invoices.length === 0
      ? 'Erst Rechnung erstellen.'
      : 'Zahlungseingang erfassen und der Rechnung zuordnen.',
  ))

  // ── 12. OPOS ────────────────────────────────────────────────────
  const offenCent = Math.max(0, sollCent - bezahltCent)
  const oposStand: SchrittStand = invoices.length === 0
    ? 'blockiert'
    : offenCent <= CENT_TOLERANZ ? 'erledigt' : 'laeuft'
  schritte.push(schritt(
    'opos', clientId,
    oposStand,
    invoices.length === 0
      ? 'keine Rechnung vorhanden'
      : offenCent <= CENT_TOLERANZ
        ? 'keine offene Forderung'
        : `${(offenCent / 100).toFixed(2)} € offen`,
    invoices.length === 0
      ? 'Erst Rechnung erstellen.'
      : 'Offene Forderung verfolgen — bei Überschreiten der Fälligkeit greift der Mahnlauf.',
  ))

  // ── 13. DATEV ───────────────────────────────────────────────────
  // Erledigt, wenn für JEDE Rechnung ein nicht fehlgeschlagener Export
  // existiert, dessen Zeitraum das Rechnungsdatum einschliesst.
  // Werteset laut Migration 20260812180000:
  // 'erstellt' | 'heruntergeladen' | 'importiert' | 'fehler'.
  const erfolgreicheExporte = d.datevExports.filter(e => e.status !== 'fehler')
  const abgedeckt = invoices.filter(i => {
    const datum = (i.created_at ?? '').slice(0, 10)
    if (!datum) return false
    return erfolgreicheExporte.some(e => e.zeitraum_von <= datum && e.zeitraum_bis >= datum)
  })
  const datevStand: SchrittStand = invoices.length === 0
    ? 'blockiert'
    : abgedeckt.length === invoices.length
      ? 'erledigt'
      : abgedeckt.length > 0 ? 'laeuft' : 'offen'
  schritte.push(schritt(
    'datev', clientId,
    datevStand,
    invoices.length === 0
      ? 'keine Rechnung vorhanden'
      : `${abgedeckt.length} von ${invoices.length} Rechnungen in einem abgeschlossenen Export`,
    invoices.length === 0
      ? 'Erst Rechnung erstellen.'
      : 'DATEV-Export für den Zeitraum erstellen und an den Steuerberater übergeben.',
  ))

  // ── Nicht lesbare Tabellen überschreiben den Stand ───────────────
  // Muss NACH dem Aufbau laufen: die Bewertung oben hat mangels Daten
  // „offen"/„blockiert" gerechnet, ohne zu wissen, dass die Zeilen gar nicht
  // erst geladen werden konnten. Ohne diesen Durchgang sähe ein 42703 exakt
  // aus wie ein Kunde ohne Budget.
  const geprueft = schritte.map(s => {
    const kaputt = SCHRITT_QUELLEN[s.id].filter(t => d.fehler[t])
    if (kaputt.length === 0) return s
    return {
      ...s,
      stand: 'blockiert' as SchrittStand,
      wert: 'Stand nicht ermittelbar',
      naechsterSchritt:
        `Technischer Fehler beim Lesen von ${kaputt.map(t => `${t} (${d.fehler[t]})`).join(', ')}. ` +
        'Der Stand dieses Schritts ist unbekannt — er ist NICHT als „nichts vorhanden" zu lesen.',
    }
  })

  // ── Auswertung ──────────────────────────────────────────────────
  const anwendbar = geprueft.filter(s => s.stand !== 'entfaellt')
  const erledigt = anwendbar.filter(s => s.stand === 'erledigt')
  const aktuellerSchritt = geprueft.find(s => s.stand !== 'erledigt' && s.stand !== 'entfaellt') ?? null

  return {
    clientId,
    name,
    abrechnungsweg: c.pflegekasse_name ? 'kasse' : 'privat',
    schritte: geprueft,
    datenfehler: Object.entries(d.fehler).map(([tabelle, meldung]) => `${tabelle}: ${meldung}`),
    fortschritt: {
      erledigt: erledigt.length,
      anwendbar: anwendbar.length,
      prozent: anwendbar.length === 0 ? 0 : Math.round((erledigt.length / anwendbar.length) * 100),
    },
    aktuellerSchritt,
    vollstaendig: erledigt.length === anwendbar.length,
  }
}

/** Kette für einen einzelnen Kunden. */
export async function ermittleKundenKette(
  supabase: SupabaseClient,
  organizationId: string,
  clientId: string,
): Promise<KundenKette | null> {
  const daten = await ladeRohdaten(supabase, organizationId, [clientId])
  const roh = daten.get(clientId)
  return roh ? baueKette(clientId, roh) : null
}

/**
 * Ketten für mehrere Kunden — für die Übersichtsseite.
 * Sortiert nach Fortschritt absteigend: wer am weitesten ist, steht oben.
 */
export async function ermittleKundenKetten(
  supabase: SupabaseClient,
  organizationId: string,
  clientIds: string[],
): Promise<KundenKette[]> {
  if (clientIds.length === 0) return []
  const daten = await ladeRohdaten(supabase, organizationId, clientIds)
  return [...daten.entries()]
    .map(([id, roh]) => baueKette(id, roh))
    .sort((a, b) => b.fortschritt.erledigt - a.fortschritt.erledigt || a.name.localeCompare(b.name, 'de'))
}
