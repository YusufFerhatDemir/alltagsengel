import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCaregiverSession } from '@/lib/native-auth'
import { createInvoiceDraft } from '@/lib/billing/core'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { ohneStornierte } from '@/lib/leistungsnachweis/status-sync'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'
const log = logger.child('auto-invoice')

// ═══════════════════════════════════════════════════════════════
// POST /api/billing/auto-invoice
// ═══════════════════════════════════════════════════════════════
// Schließt den Abrechnungs-Kreislauf automatisch: sobald ALLE
// Einsätze eines Klienten im Monat unterschrieben sind, wird die
// Rechnung + Positionen automatisch erzeugt — ohne manuellen
// Umweg über die Rechnungserstellung.
//
// Body (eine der beiden Varianten):
//   { service_record_id: "uuid" }              → Klient+Monat werden
//                                                 aus dem Record abgeleitet
//   { client_id: "uuid", month: "YYYY-MM" }    → direkt
//
// Ablauf:
//   1. Alle service_records des Klienten im Monat laden
//   2. Gibt es noch nicht-unterschriebene (draft/incomplete/complete)?
//      → { ready: false, pending: n } — KEINE Rechnung
//   3. Alle 'signed' und noch nicht abgerechnet?
//      → invoices + invoice_items anlegen, Records auf 'invoiced'
//   4. Erstellte Rechnung zurückgeben
//
// Auth: Admin (Cookie-Session) ODER Betreuungskraft (Native-App-
// Bearer-Token). Die eigentlichen Schreiboperationen laufen über
// service_role, da Betreuungskräfte laut RLS keine invoices anlegen
// dürfen — die Prüfung "alles unterschrieben" ersetzt die manuelle
// Freigabe.
//
// Betreuungskräfte dürfen NUR für Klienten auslösen, denen sie
// zugeordnet sind: bei service_record_id muss der Record ihnen
// gehören; bei client_id+month muss eine assignments-Zuordnung
// oder ein eigener Einsatz beim Klienten im Monat existieren.
// organization_id wird auf allen Inserts explizit vom Klienten
// übernommen (service_role umgeht RLS + current_org_id()-Default).
// ═══════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

type AuthContext =
  | { ok: true; role: 'admin'; actor: string }
  | { ok: true; role: 'caregiver'; actor: string; caregiverId: string }
  | { ok: false; status: number; error: string }

async function authorize(request: Request): Promise<AuthContext> {
  // 1) Admin über Cookie-Session
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const quellen = await holeRollenQuellenFuer(supabase, user)
      if (quellenDuerfen(quellen, 'abrechnung.schreiben')) {
        return { ok: true, role: 'admin', actor: `admin:${user.id}` }
      }
    }
  } catch {
    // Cookie-Pfad fehlgeschlagen → Bearer-Pfad versuchen
  }

  // 2) Betreuungskraft über Bearer-Token (Native App)
  const native = await requireCaregiverSession(request)
  if (native.ok) {
    return {
      ok: true,
      role: 'caregiver',
      actor: `caregiver:${native.caregiverId}`,
      caregiverId: native.caregiverId,
    }
  }

  return { ok: false, status: 401, error: 'Nicht autorisiert' }
}

export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await authorize(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json().catch(() => ({}))
    const { service_record_id, client_id, month } = body as {
      service_record_id?: string
      client_id?: string
      month?: string
    }

    const admin = createAdminClient()
    const orgId = await getActiveOrgId()
    // Fail-closed (Audit MITTEL-1)
    if (!orgId) return NextResponse.json({ error: 'Keine Organisation zugewiesen' }, { status: 403 })

    // ── Klient + Monat auflösen ──
    let resolvedClientId = client_id || null
    let resolvedMonth = month || null
    // Zuordnung bereits über den eigenen Record belegt?
    let assignmentVerified = false

    if (service_record_id) {
      const { data: rec, error: recErr } = await admin
        .from('service_records')
        .select('id, client_id, caregiver_id, date')
        .eq('id', service_record_id)
        .eq('organization_id', orgId)
        .single()
      if (recErr || !rec) {
        return NextResponse.json({ error: 'Leistungsnachweis nicht gefunden' }, { status: 404 })
      }
      if (auth.role === 'caregiver') {
        if (rec.caregiver_id !== auth.caregiverId) {
          return NextResponse.json({ error: 'Kein Zugriff auf diesen Leistungsnachweis' }, { status: 403 })
        }
        assignmentVerified = true
      }
      resolvedClientId = rec.client_id
      resolvedMonth = String(rec.date).slice(0, 7)
    }

    if (!resolvedClientId || !resolvedMonth || !/^\d{4}-\d{2}$/.test(resolvedMonth)) {
      return NextResponse.json(
        { error: 'service_record_id ODER client_id + month (YYYY-MM) erforderlich' },
        { status: 400 }
      )
    }

    const [yearStr, monthStr] = resolvedMonth.split('-')
    const year = Number(yearStr)
    const monthNum = Number(monthStr)
    const periodStart = `${resolvedMonth}-01`
    const lastDay = new Date(year, monthNum, 0).getDate()
    const periodEnd = `${resolvedMonth}-${String(lastDay).padStart(2, '0')}`

    // ── Zuordnung Betreuungskraft↔Klient erzwingen (P0 B-1) ──
    // Vor JEDEM Datenzugriff: eine Betreuungskraft darf nur für
    // Klienten auslösen, denen sie zugeordnet ist. Sonst 403 —
    // auch bei unbekannter client_id (kein Existenz-Orakel).
    if (auth.role === 'caregiver' && !assignmentVerified) {
      const { data: assignment } = await admin
        .from('assignments')
        .select('id')
        .eq('caregiver_id', auth.caregiverId)
        .eq('client_id', resolvedClientId)
        .eq('organization_id', orgId)
        .limit(1)
        .maybeSingle()
      if (!assignment) {
        const { data: ownRecord } = await admin
          .from('service_records')
          .select('id')
          .eq('caregiver_id', auth.caregiverId)
          .eq('client_id', resolvedClientId)
          .gte('date', periodStart)
          .lte('date', periodEnd)
          .limit(1)
          .maybeSingle()
        if (!ownRecord) {
          return NextResponse.json({ error: 'Kein Zugriff auf diesen Klienten' }, { status: 403 })
        }
      }
    }

    // ── Klient (Versicherungsdaten + organization_id) — org-fence ──
    const { data: client, error: clientErr } = await admin
      .from('clients')
      .select('id, organization_id, insurance_name, insurance_number, pflegekasse_name, versichertennummer')
      .eq('id', resolvedClientId)
      .eq('organization_id', orgId)
      .single()
    if (clientErr || !client) {
      return NextResponse.json({ error: 'Klient nicht gefunden' }, { status: 404 })
    }

    // ── Alle Einsätze des Klienten im Monat — org-fence ──
    const { data: records, error: monthErr } = await admin
      .from('service_records')
      // signature_hash/client_signed_at/client_signature muessen mit: ohne sie
      // laesst sich der Unterschriftsbeleg nicht pruefen und `proof_status`
      // allein waere wieder die einzige Auskunft (Track 12, B2).
      .select('id, date, service_type, duration_minutes, amount, budget_type, status, proof_status, billing_status, signature_hash, client_signed_at, client_signature')
      .eq('client_id', resolvedClientId)
      .eq('organization_id', orgId)
      .gte('date', periodStart)
      .lte('date', periodEnd)
    if (monthErr) {
      return safeApiError(monthErr, request)
    }

    // Stornierte Nachweise fallen VOR jeder weiteren Rechnung heraus.
    // Zwei Wirkungen hatte das Fehlen dieses Filters:
    //   1) Ein Storno bleibt wegen des fehlenden status-Gegenstuecks auf
    //      'complete' stehen und galt als "noch nicht unterschrieben" —
    //      damit war der ganze Monat dauerhaft nicht abrechenbar, ohne dass
    //      es einen Weg gegeben haette, den Nachweis noch zu unterschreiben.
    //   2) Stand er auf 'signed', wanderte er in signedIds und wurde weiter
    //      unten auf status='invoiced' gestempelt — ein Widerruf, den die
    //      Oberflaeche danach als abgerechnet fuehrt.
    const alleRecords = records || []
    const all = ohneStornierte(alleRecords)
    const storniert = alleRecords.length - all.length
    if (all.length === 0) {
      return NextResponse.json({
        ready: false,
        reason: storniert > 0
          ? `Keine abrechenbaren Einsätze im Monat (${storniert} storniert)`
          : 'Keine Einsätze im Monat',
        invoice: null,
      })
    }

    // ── Vollständigkeits-Check: ALLE unterschrieben? ──
    const pending = all.filter(r => !['signed', 'invoiced'].includes(r.status))
    if (pending.length > 0) {
      return NextResponse.json({
        ready: false,
        reason: `${pending.length} Einsatz/Einsätze noch nicht unterschrieben`
          + (storniert > 0 ? ` (${storniert} storniert, nicht berücksichtigt)` : ''),
        pending: pending.map(r => ({ id: r.id, date: r.date, status: r.status })),
        invoice: null,
      })
    }

    const signed = all.filter(r => r.status === 'signed')
    if (signed.length === 0) {
      return NextResponse.json({
        ready: true,
        reason: 'Alle Einsätze bereits abgerechnet',
        invoice: null,
      })
    }

    // ── Doppel-Abrechnung ausschließen (invoice_items-Verknüpfung) ──
    const signedIds = signed.map(r => r.id)
    const { data: billedItems, error: billedErr } = await admin
      .from('invoice_items')
      .select('service_record_id')
      .in('service_record_id', signedIds)
    // DIESE ABFRAGE IST DER DOPPELABRECHNUNGS-SCHUTZ, nicht eine Beigabe.
    //
    // Ihr Ergebnis ist die einzige Auskunft darueber, welche Nachweise
    // schon an einer Rechnung haengen. Faellt sie aus, war `billedItems`
    // bisher null, die Menge der bereits abgerechneten Kennungen leer —
    // und damit galt JEDER unterschriebene Einsatz erneut als offen. Die
    // Route haette denselben Monat ein zweites Mal in Rechnung gestellt,
    // ohne dass irgendwo ein Fehler sichtbar geworden waere: ein
    // Netzaussetzer oder Schema-Drift genuegte, um dem Klienten dieselbe
    // Leistung doppelt zu berechnen.
    //
    // „Ich habe keine Rechnungsposition gefunden" und „ich konnte nicht
    // nachsehen" sind hier verschiedene Aussagen, und nur die erste
    // rechtfertigt eine neue Rechnung. Deshalb fail-closed: lieber keine
    // Rechnung als eine zweite.
    if (billedErr) {
      log.error('Doppelabrechnungs-Pruefung fehlgeschlagen — es wird NICHT abgerechnet', {
        clientId: resolvedClientId, month: resolvedMonth, errorMessage: billedErr.message,
      })
      return safeApiError(billedErr, request)
    }
    const billedIds = new Set((billedItems || []).map((i: any) => i.service_record_id))
    const billable = signed.filter(r => !billedIds.has(r.id))

    if (billable.length === 0) {
      // Records hängen schon an einer Rechnung — Status nachziehen
      await admin.from('service_records').update({ status: 'invoiced' }).in('id', signedIds)
      return NextResponse.json({
        ready: true,
        reason: 'Alle unterschriebenen Einsätze sind bereits einer Rechnung zugeordnet',
        invoice: null,
      })
    }

    // ── Unterschriftsbeleg ───────────────────────────────────────────
    // `status === 'signed'` oben sagt nur, dass jemand den Nachweis auf
    // unterschrieben GESETZT hat. Eine Pflegekraft kann das live per
    // PostgREST auf ihrer eigenen Zeile selbst tun (Policy `sr_engel_own`
    // ist FOR ALL) — und genau diese Route darf sie mit ihrem
    // Native-Bearer-Token anschliessend aufrufen. Ohne eine Beleg-Pruefung
    // liefe die Kette vom selbstgesetzten Status bis zur fertigen Rechnung
    // durch, ohne dass je ein Kunde unterschrieben hat.
    //
    // Die Pruefung sitzt bewusst NICHT hier, sondern in createInvoiceDraft
    // (lib/billing/core/invoice-engine.ts) — an der einen Stelle, durch die
    // jeder Rechnungsweg laeuft. Eine zweite Kopie hier waere eine zweite
    // Wahrheit, die auseinanderlaufen kann; und ein kuenftiger Weg, der
    // diese Route nicht benutzt, waere von ihr nicht gedeckt.
    // Siehe lib/billing/nachweis-beleg.ts.

    // ═══ GUARD: Direkter Supabase-Insert durch Billing-Engine ersetzt ═══
    // Alte direkte Inserts (invoices + invoice_items + service_records)
    // sind entfernt. Stattdessen wird createInvoiceDraft() aus der
    // Billing-Engine verwendet → Idempotenz, Audit-Trail, fortlaufende
    // Nummern, Status-Maschine.
    // Siehe: feature/unified-invoice-creation (PR-Guard)

    // Budget-Typen der abrechenbaren Records ermitteln
    const budgetTypes = [...new Set(billable.map(r => r.budget_type || 'entlastung'))]

    const engineResults = []
    const warnings: string[] = []

    for (const budgetType of budgetTypes) {
      try {
        const result = await createInvoiceDraft(admin, {
          clientId: resolvedClientId,
          periodMonth: resolvedMonth,
          budgetType,
          actorId: auth.actor.split(':')[1] || 'auto-invoice',
        })
        engineResults.push({ ...result, budgetType })
      } catch (engineErr: any) {
        log.errorWithException(`Engine-Fehler für ${budgetType}:`, engineErr)
        warnings.push(`${budgetType}: ${engineErr.message}`)
      }
    }

    if (engineResults.length === 0) {
      return NextResponse.json({
        error: 'Rechnungserstellung fehlgeschlagen',
        warnings,
      }, { status: 500 })
    }

    // ── Rückwärtskompatible Antwort ──
    // Altes Format: { invoice: {full obj}, items: [...], record_count }
    // Neues Format: zusätzlich invoices[] + invoiceIds[]
    // Bestehende Clients lesen "invoice" und "items", neue können
    // "invoices" nutzen.
    const primary = engineResults[0]

    // Vollständiges Invoice-Objekt laden (Rückwärtskompatibilität)
    const { data: fullInvoice } = await admin
      .from('invoices')
      .select()
      .eq('id', primary.invoiceId)
      .single()

    // Items laden (Rückwärtskompatibilität)
    //
    // HIER BLEIBT DER FEHLER BEWUSST UNGEPRUEFT — anders als bei der
    // Doppelabrechnungs-Pruefung weiter oben.
    //
    // Diese beiden Abfragen laufen NACH `createInvoiceDraft`: die Rechnung
    // steht zu diesem Zeitpunkt bereits in der Datenbank. Ein 500 waere
    // hier die gefaehrlichere Antwort — der Aufrufer laese „Abrechnung
    // fehlgeschlagen", versuchte es erneut, und der zweite Lauf traefe auf
    // die inzwischen existierende Rechnung. Fail-closed ist nicht ueberall
    // die sichere Richtung; an dieser Stelle ist es die Rueckmeldung, die
    // zur Doppelabrechnung einlaedt.
    //
    // Beide Werte sind reine Anzeige-Rueckfaelle: `primary` traegt Nummer
    // und Betrag der erzeugten Rechnung ohnehin schon.
    const { data: invoiceItems } = await admin
      .from('invoice_items')
      .select()
      .eq('invoice_id', primary.invoiceId)

    log.info(`${engineResults.length} Rechnung(en) via Engine erstellt für Klient ${resolvedClientId}, Monat ${resolvedMonth} durch ${auth.actor}`)

    return NextResponse.json({
      ready: true,
      created: true,
      // Rückwärtskompatibel: einzelnes invoice-Objekt (erste/einzige Rechnung)
      invoice: fullInvoice || {
        id: primary.invoiceId,
        invoice_number: primary.invoiceNumber,
        total_amount: primary.totalAmountCents / 100,
      },
      items: invoiceItems || [],
      record_count: billable.length,
      // Neu: alle erzeugten Rechnungen (bei mehreren Budget-Typen)
      invoices: engineResults,
      invoiceIds: engineResults.map(r => r.invoiceId),
      warnings: warnings.length > 0 ? warnings : undefined,
    }, { status: 201 })
  } catch (err) {
    return safeApiError(err, request)
  }
})
