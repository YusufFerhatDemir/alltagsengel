import { NextRequest, NextResponse } from 'next/server'
import { rolleDarf } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { datumBerlin } from '@/lib/utils/timezone';
import { safeDbError } from '@/lib/utils/api-error'
import { mitStatusSync } from '@/lib/leistungsnachweis/status-sync'
import { assertKlientenUnterschrift, assertStornierbar } from '@/lib/leistungsnachweis/nachweis-regeln'
import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { tarifLeistungsart, bekannteLeistungsarten } from '@/lib/billing/leistungsarten'
import { pruefeBudget } from '@/lib/personal/einsatzfreigabe'
import type { BudgetTyp } from '@/lib/config/budget-constants'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen, type RollenQuellen } from '@/lib/auth/rollen-quelle'

/**
 * service_records.budget_type ist ein anderes Vokabular als
 * client_budgets/pruefeBudget (BudgetTyp = 'entlastung'|'verhinderungspflege').
 * 'verhinderung' ist der aktuell LIVE Constraint-Wert, 'verhinderungspflege'
 * der Zielwert nach Migration 20260831030000 (noch nicht angewendet) — beide
 * werden hier abgefangen, damit die Pruefung unabhaengig vom Migrationsstand
 * funktioniert. 'private'/'carryover' laufen nicht gegen ein Kassenlimit.
 */
function budgetTypFuerPruefung(serviceRecordBudgetType: string): BudgetTyp | null {
  if (serviceRecordBudgetType === 'entlastung') return 'entlastung'
  if (serviceRecordBudgetType === 'verhinderung' || serviceRecordBudgetType === 'verhinderungspflege') return 'verhinderungspflege'
  return null
}

async function requireAuth(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, response: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }) }
  // BEIDE Quellen: profiles ist bindend, app_metadata schraenkt zusaetzlich
  // ein (lib/auth/rollen.ts). Vorher stand hier allein profiles.role — eine
  // Herabstufung, die nur im Token steht, blieb damit wirkungslos.
  const quellen = await holeRollenQuellenFuer(supabase, user)
  if (!quellen.profilRolle) return { ok: false as const, response: NextResponse.json({ error: 'Profil nicht gefunden' }, { status: 403 }) }
  return { ok: true as const, userId: user.id, role: quellen.rolle, quellen }
}

function requireAdmin(auth: { ok: true; quellen: RollenQuellen }) {
  if (!quellenDuerfen(auth.quellen, 'einsatz.schreiben')) {
    return NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 })
  }
  return null
}

/**
 * Lehnt eine Leistungsart ab, die sich nicht auf einen Tarif abbilden lässt.
 *
 * Bewusst kein Ausweichen auf 'sonstige': das würde eine nicht abrechenbare
 * Leistung zum Begleitungssatz abrechnen. Lieber hier absagen — die Ursache
 * (fehlender Tarif) ist dann noch behebbar, bevor der Einsatz läuft.
 */
function pruefeLeistungsart(serviceType: string): NextResponse | null {
  if (tarifLeistungsart(serviceType)) return null
  return NextResponse.json(
    {
      error:
        `Leistungsart „${serviceType}" hat keine Tarifzuordnung — ein Leistungsnachweis ` +
        `dazu wäre nicht abrechenbar. Entweder eine der bekannten Leistungsarten wählen ` +
        `oder zuerst einen Tarif dafür hinterlegen (Abrechnung → Tarife).`,
      bekannteLeistungsarten: bekannteLeistungsarten(),
    },
    { status: 422 },
  )
}

/**
 * Audit-Eintrag fuer jeden Schreibvorgang am Leistungsnachweis.
 *
 * Bis 2026-08-23 schrieb diese Route KEINEN Audit-Eintrag — bei 30 live
 * erfassten Nachweisen standen 0 zugehoerige Zeilen in `mis_audit_log`
 * (Lueckenanalyse Bereich 14, P2). Fuer Abrechnungsunterlagen nach SGB XI
 * ist die Nachvollziehbarkeit jeder Aenderung Pflicht.
 *
 * `logAuditEventOrWarn` ist das Pflichtmuster des Projekts (durch
 * Regressionstest ueber app/ und lib/ erzwungen): der Eintrag darf den
 * fachlichen Vorgang nicht scheitern lassen, aber auch nicht still
 * verschwinden.
 */
async function protokolliere(
  req: NextRequest,
  auth: { userId: string; role: string },
  organizationId: string,
  action: 'create' | 'update',
  entityId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await logAuditEventOrWarn({
    action,
    actorId: auth.userId,
    actorRole: auth.role,
    organizationId,
    entityType: 'service_record',
    entityId,
    details,
    request: req,
  })
}

export const GET = withTracking(async function GET(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireAuth(supabase)
  if (!auth.ok) return auth.response

  const adminErr = requireAdmin(auth)
  if (adminErr) return adminErr

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const month = searchParams.get('month')
  const caregiverId = searchParams.get('caregiver_id')
  const clientId = searchParams.get('client_id')
  const proofStatus = searchParams.get('proof_status')
  const billingStatus = searchParams.get('billing_status')

  if (id) {
    const { data, error } = await supabase
      .from('service_records')
      .select('*, client:clients(first_name, last_name, zip_code), caregiver:caregivers(first_name, last_name, initials)')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single()
    if (error) return safeDbError(error, 404)

    const { data: auditLog } = await supabase
      .from('service_record_audit_log')
      .select('*')
      .eq('record_id', id)
      .order('created_at', { ascending: false })
      .limit(50)

    return NextResponse.json({ ...data, audit_log: auditLog || [] })
  }

  let query = supabase
    .from('service_records')
    .select('*, client:clients(first_name, last_name), caregiver:caregivers(first_name, last_name, initials)')
    .eq('organization_id', organizationId)
    .order('date', { ascending: false })
    .limit(200)

  if (month) {
    const start = `${month}-01`
    const d = new Date(start)
    d.setMonth(d.getMonth() + 1)
    d.setDate(0)
    const end = datumBerlin(d)
    query = query.gte('date', start).lte('date', end)
  }
  if (caregiverId) query = query.eq('caregiver_id', caregiverId)
  if (clientId) query = query.eq('client_id', clientId)
  if (proofStatus) query = query.eq('proof_status', proofStatus)
  if (billingStatus) query = query.eq('billing_status', billingStatus)

  const { data, error } = await query
  if (error) return safeDbError(error)
  return NextResponse.json(data)
})

export const POST = withTracking(async function POST(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireAuth(supabase)
  if (!auth.ok) return auth.response

  const adminErr = requireAdmin(auth)
  if (adminErr) return adminErr

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
  }

  const body = await req.json()
  const {
    client_id, caregiver_id, date, start_time, end_time,
    service_type, budget_type, billing_type, caregiver_initials,
    amount, notes, assignment_id, leistung_beschreibung,
    gps_start_lat, gps_start_lng, force_override,
  } = body

  if (!client_id || !caregiver_id || !date || !start_time || !end_time || !service_type) {
    return NextResponse.json({ error: 'Pflichtfelder fehlen' }, { status: 400 })
  }

  // Abrechenbarkeit VOR der Erfassung prüfen: ohne Tarifzuordnung scheitert
  // erst die Rechnung Wochen später mit MISSING_VALID_TARIFF — die Leistung
  // ist dann längst erbracht und der Nachweis unterschrieben.
  const leistungsartFehler = pruefeLeistungsart(service_type)
  if (leistungsartFehler) return leistungsartFehler

  const { data: clientOk } = await supabase
    .from('clients').select('id').eq('id', client_id).eq('organization_id', organizationId).maybeSingle()
  if (!clientOk) {
    return NextResponse.json({ error: 'Klient nicht gefunden oder gehört nicht zur Organisation.' }, { status: 404 })
  }
  const { data: caregiverOk } = await supabase
    .from('caregivers').select('id').eq('id', caregiver_id).eq('organization_id', organizationId).maybeSingle()
  if (!caregiverOk) {
    return NextResponse.json({ error: 'Betreuungskraft nicht gefunden oder gehört nicht zur Organisation.' }, { status: 404 })
  }

  // duration_minutes wird NICHT mitgeschickt: die Spalte ist auf
  // service_records eine GENERATED-Spalte und wird aus start_time/end_time
  // berechnet. Ein mitgelieferter Wert lässt den INSERT mit 428C9 scheitern
  // („cannot insert a non-DEFAULT value into column"). Befund aus dem
  // Pilot-E2E vom 14.08.2026, siehe docs/PILOT_E2E_BERICHT.md.
  const insertData: Record<string, unknown> = {
    organization_id: organizationId,
    client_id,
    caregiver_id,
    date,
    start_time,
    end_time,
    service_type,
    budget_type: budget_type || 'private',
    billing_type: billing_type || 'PRIVAT',
    caregiver_initials: caregiver_initials || '??',
    status: 'draft',
    proof_status: 'ENTWURF',
    billing_status: 'OFFEN',
  }
  if (amount != null) insertData.amount = amount
  if (notes) insertData.notes = notes
  if (assignment_id) insertData.assignment_id = assignment_id
  if (leistung_beschreibung) insertData.leistung_beschreibung = leistung_beschreibung
  if (gps_start_lat != null) insertData.gps_start_lat = gps_start_lat
  if (gps_start_lng != null) insertData.gps_start_lng = gps_start_lng

  // Budget-Pruefung bei Leistungserfassung (Automatisierungskette 6):
  // Entlastungsbetrag warnt nur (Eigenanteil moeglich, § 45b kennt keine
  // Kassen-Deckelung der Leistungserbringung). VP/KZP blockiert hart bei
  // Ueberschreitung, weil § 42a ein festes Kombinationsbudget ist.
  let budgetWarnung: string | null = null
  const budgetTypFuerCheck = budgetTypFuerPruefung(budget_type || 'private')
  if (budgetTypFuerCheck) {
    const budgetErgebnis = await pruefeBudget(supabase, client_id, organizationId, budgetTypFuerCheck)
    budgetWarnung = budgetErgebnis.warnung
    if (budgetTypFuerCheck === 'verhinderungspflege' && budgetErgebnis.blockiert && !force_override) {
      return NextResponse.json({
        error: budgetErgebnis.warnung ?? 'VP/KZP-Kombinationsbudget überschritten.',
        hinweis: 'Mit force_override: true kann der Nachweis trotzdem erfasst werden.',
      }, { status: 422 })
    }
  }

  const { data, error } = await supabase.from('service_records').insert(insertData).select().single()
  if (error) return safeDbError(error)

  await protokolliere(req, auth, organizationId, 'create', data.id, {
    vorgang: 'leistungsnachweis_erfasst',
    client_id: data.client_id,
    caregiver_id: data.caregiver_id,
    datum: data.date,
    service_type: data.service_type,
    budget_type: data.budget_type,
    proof_status: data.proof_status,
    budget_warnung: budgetWarnung ?? null,
    force_override: body.force_override === true,
  })

  return NextResponse.json(budgetWarnung ? { ...data, budget_warnung: budgetWarnung } : data, { status: 201 })
})

// duration_minutes fehlt bewusst: GENERATED-Spalte, siehe POST oben.
// Ein UPDATE darauf scheitert genauso wie ein INSERT.
const ERLAUBTE_PATCH_FELDER = new Set([
  'date', 'start_time', 'end_time',
  'service_type', 'budget_type', 'billing_type',
  'amount', 'notes', 'leistung_beschreibung',
  'caregiver_initials', 'gps_end_lat', 'gps_end_lng',
])

export const PATCH = withTracking(async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireAuth(supabase)
  if (!auth.ok) return auth.response

  const adminErr = requireAdmin(auth)
  if (adminErr) return adminErr

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
  }

  const body = await req.json()
  const { id, action } = body

  if (!id) return NextResponse.json({ error: 'id erforderlich' }, { status: 400 })

  if (action === 'sign') {
    const { data: current } = await supabase
      .from('service_records').select('proof_status, status, client_signature').eq('id', id).eq('organization_id', organizationId).single()
    if (!current) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    if (current.proof_status !== 'ABGESCHLOSSEN') {
      return NextResponse.json({ error: 'Unterschrift nur im Status ABGESCHLOSSEN möglich' }, { status: 409 })
    }

    // Fail-closed: der Statuswechsel auf UNTERSCHRIEBEN loest in der
    // Datenbank signature_hash + is_locked aus und macht den Nachweis damit
    // abrechenbar (die Rechnungs-RPC prueft genau diese beiden Merkmale).
    // Ohne echte Unterschrift waere das ein Beleg, den niemand
    // unterschrieben hat — und er liesse sich danach nicht mehr korrigieren.
    // Die Native-App legt ihre Unterschrift getrennt in service_signatures
    // ab; dieser Weg zaehlt deshalb mit.
    const { count: digitaleSignaturen } = await supabase
      .from('service_signatures')
      .select('id', { count: 'exact', head: true })
      .eq('service_record_id', id)
      .eq('signer_role', 'client')
    try {
      assertKlientenUnterschrift({
        neueSignatur: body.client_signature,
        bestandsSignatur: current.client_signature,
        digitaleSignaturen: digitaleSignaturen ?? 0,
      })
    } catch (err) {
      return apiErrorResponse(err, req, 422)
    }

    const signData: Record<string, unknown> = {
      proof_status: 'UNTERSCHRIEBEN',
      client_signed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (body.client_signature) signData.client_signature = body.client_signature
    if (body.client_signer_name) signData.client_signer_name = body.client_signer_name
    if (body.client_signer_role) signData.client_signer_role = body.client_signer_role
    if (body.gps_end_lat != null) signData.gps_end_lat = body.gps_end_lat
    if (body.gps_end_lng != null) signData.gps_end_lng = body.gps_end_lng

    // status MUSS im selben UPDATE mit: der Signatur-Trigger setzt is_locked=true,
    // danach blockiert prevent_locked_record_change() jedes Folge-UPDATE.
    const signUpdate = mitStatusSync(signData, 'UNTERSCHRIEBEN', current.status)

    const { data, error } = await supabase
      .from('service_records').update(signUpdate).eq('id', id).eq('organization_id', organizationId).select().single()
    if (error) {
      if (error.message.includes('gesperrt')) {
        return NextResponse.json({ error: 'Leistungsnachweis ist gesperrt' }, { status: 423 })
      }
      return safeDbError(error)
    }

    await protokolliere(req, auth, organizationId, 'update', id, {
      vorgang: 'leistungsnachweis_unterschrieben',
      proof_status_von: current.proof_status,
      proof_status_nach: 'UNTERSCHRIEBEN',
      unterzeichner: body.client_signer_name ?? null,
      unterzeichner_rolle: body.client_signer_role ?? null,
      gps_erfasst: body.gps_end_lat != null && body.gps_end_lng != null,
    })

    return NextResponse.json(data)
  }

  if (action === 'confirm') {
    const { data: current } = await supabase
      .from('service_records').select('proof_status, status').eq('id', id).eq('organization_id', organizationId).single()
    if (!current) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    if (current.proof_status !== 'ENTWURF') {
      return NextResponse.json({ error: 'Bestätigung nur im Status ENTWURF möglich' }, { status: 409 })
    }

    const confirmUpdate = mitStatusSync(
      { proof_status: 'ABGESCHLOSSEN', caregiver_confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      'ABGESCHLOSSEN',
      current.status,
    )

    const { data, error } = await supabase
      .from('service_records')
      .update(confirmUpdate)
      .eq('id', id).eq('organization_id', organizationId).select().single()
    if (error) return safeDbError(error)

    await protokolliere(req, auth, organizationId, 'update', id, {
      vorgang: 'leistungsnachweis_bestaetigt',
      proof_status_von: current.proof_status,
      proof_status_nach: 'ABGESCHLOSSEN',
    })

    return NextResponse.json(data)
  }

  if (action === 'cancel') {
    if (!quellenDuerfen(auth.quellen, 'einsatz.schreiben')) {
      return NextResponse.json({ error: 'Nur Admins können stornieren' }, { status: 403 })
    }

    // Erlaubnisliste statt Sperrliste: ein Nachweis, der schon auf einer
    // Rechnung steht, darf am Nachweis nicht storniert werden — die Rechnung
    // bliebe sonst mit einer stornierten Position stehen.
    const { data: stand } = await supabase
      .from('service_records')
      .select('status, billing_status, proof_status')
      .eq('id', id).eq('organization_id', organizationId).maybeSingle()
    if (!stand) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    try {
      assertStornierbar(stand)
    } catch (err) {
      return apiErrorResponse(err, req, 409)
    }

    const { data, error } = await supabase
      .from('service_records')
      .update({ proof_status: 'STORNIERT', billing_status: 'STORNIERT', updated_at: new Date().toISOString() })
      .eq('id', id).eq('organization_id', organizationId).select().single()
    if (error) return safeDbError(error)

    await protokolliere(req, auth, organizationId, 'update', id, {
      vorgang: 'leistungsnachweis_storniert',
      proof_status_nach: 'STORNIERT',
      billing_status_nach: 'STORNIERT',
      grund: typeof body.grund === 'string' ? body.grund : null,
    })

    return NextResponse.json(data)
  }

  // Auch beim Ändern: eine Leistungsart ohne Tarif macht den Nachweis
  // nachträglich unabrechenbar.
  if (typeof body.service_type === 'string') {
    const leistungsartFehler = pruefeLeistungsart(body.service_type)
    if (leistungsartFehler) return leistungsartFehler
  }

  const safeUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const [key, val] of Object.entries(body)) {
    if (ERLAUBTE_PATCH_FELDER.has(key) && val !== undefined) {
      safeUpdates[key] = val
    }
  }

  const { data, error } = await supabase
    .from('service_records')
    .update(safeUpdates)
    .eq('id', id).eq('organization_id', organizationId).select().single()
  if (error) {
    if (error.message.includes('gesperrt')) {
      return NextResponse.json({ error: 'Leistungsnachweis ist gesperrt' }, { status: 423 })
    }
    return safeDbError(error)
  }

  // geaenderte_felder statt Werte: dieselbe Tiefe wie im uebrigen System.
  // Eine echte Feldhistorie (Wert davor) fehlt projektweit — sie steht als
  // eigener Befund in der Lueckenanalyse (Bereich 14) und wird hier nicht
  // vorgetaeuscht.
  await protokolliere(req, auth, organizationId, 'update', id, {
    vorgang: 'leistungsnachweis_geaendert',
    geaenderte_felder: Object.keys(safeUpdates).filter(k => k !== 'updated_at'),
  })

  return NextResponse.json(data)
})
