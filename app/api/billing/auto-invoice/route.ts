import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCaregiverSession } from '@/lib/native-auth'

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
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile && ['admin', 'superadmin'].includes(profile.role)) {
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

export async function POST(request: Request) {
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

    // ── Klient (Versicherungsdaten + organization_id) ──
    const { data: client, error: clientErr } = await admin
      .from('clients')
      .select('id, organization_id, insurance_name, insurance_number, pflegekasse_name, versichertennummer')
      .eq('id', resolvedClientId)
      .single()
    if (clientErr || !client) {
      return NextResponse.json({ error: 'Klient nicht gefunden' }, { status: 404 })
    }

    // ── Alle Einsätze des Klienten im Monat ──
    const { data: records, error: monthErr } = await admin
      .from('service_records')
      .select('id, date, service_type, duration_minutes, amount, budget_type, status')
      .eq('client_id', resolvedClientId)
      .gte('date', periodStart)
      .lte('date', periodEnd)
    if (monthErr) {
      return NextResponse.json({ error: `Lade-Fehler: ${monthErr.message}` }, { status: 500 })
    }

    const all = records || []
    if (all.length === 0) {
      return NextResponse.json({ ready: false, reason: 'Keine Einsätze im Monat', invoice: null })
    }

    // ── Vollständigkeits-Check: ALLE unterschrieben? ──
    const pending = all.filter(r => !['signed', 'invoiced'].includes(r.status))
    if (pending.length > 0) {
      return NextResponse.json({
        ready: false,
        reason: `${pending.length} Einsatz/Einsätze noch nicht unterschrieben`,
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
    const { data: billedItems } = await admin
      .from('invoice_items')
      .select('service_record_id')
      .in('service_record_id', signedIds)
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

    // ── Rechnung anlegen ──
    const totalAmount = billable.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const budgetAmount = billable
      .filter(r => r.budget_type !== 'private')
      .reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const privateAmount = totalAmount - budgetAmount
    const shortId = Math.random().toString(36).slice(2, 8).toUpperCase()
    const invoiceNumber = `RE-${yearStr}${monthStr}-${shortId}`

    const { data: invoice, error: invErr } = await admin
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        client_id: resolvedClientId,
        organization_id: client.organization_id,
        insurance_name: client?.pflegekasse_name || client?.insurance_name || null,
        insurance_number: client?.versichertennummer || client?.insurance_number || null,
        period_start: periodStart,
        period_end: periodEnd,
        total_amount: totalAmount,
        budget_amount: budgetAmount,
        private_amount: privateAmount,
        status: 'draft',
      })
      .select()
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ error: `Rechnung-Fehler: ${invErr?.message}` }, { status: 500 })
    }

    // ── Positionen anlegen ──
    const items = billable.map(r => ({
      invoice_id: invoice.id,
      service_record_id: r.id,
      organization_id: client.organization_id,
      description: r.service_type || 'Leistung',
      date: r.date,
      duration_minutes: r.duration_minutes,
      amount: r.amount,
      budget_type: r.budget_type,
    }))
    const { data: createdItems, error: itemsErr } = await admin
      .from('invoice_items')
      .insert(items)
      .select()

    if (itemsErr) {
      // Rollback der leeren Rechnung, damit kein Torso stehen bleibt
      await admin.from('invoices').delete().eq('id', invoice.id)
      return NextResponse.json({ error: `Positionen-Fehler: ${itemsErr.message}` }, { status: 500 })
    }

    // ── Records auf 'invoiced' ──
    const { error: updErr } = await admin
      .from('service_records')
      .update({ status: 'invoiced' })
      .in('id', billable.map(r => r.id))
    if (updErr) {
      console.error('[auto-invoice] Status-Update-Fehler:', updErr)
    }

    console.log(`[auto-invoice] ${invoiceNumber} erstellt (${billable.length} Positionen, ${totalAmount.toFixed(2)} €) durch ${auth.actor}`)

    return NextResponse.json({
      ready: true,
      created: true,
      invoice,
      items: createdItems || [],
      record_count: billable.length,
    }, { status: 201 })
  } catch (err: any) {
    console.error('[api/billing/auto-invoice] Unerwarteter Fehler:', err)
    return NextResponse.json({ error: err.message || 'Unerwarteter Fehler' }, { status: 500 })
  }
}
