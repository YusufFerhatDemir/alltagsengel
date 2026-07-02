#!/usr/bin/env node
/**
 * seed-betriebssystem.mjs
 * ───────────────────────
 * Legt realistische Testdaten für das Betriebssystem Phase 1 an:
 * Klienten, Betreuungskraft, Leistungsnachweise (service_records),
 * Budget-Einträge (client_budgets), Rechnungen (invoices/items) und
 * eine strittige Rechnung (invoice_disputes).
 *
 * Läuft REST-basiert über PostgREST mit dem SERVICE_ROLE_KEY
 * (kein direkter DB-Zugriff/psql nötig). Idempotent: räumt eigene
 * Seed-Daten (customer_number 'AE-TEST-*') vorher auf.
 *
 * Nebeneffekt: prüft empirisch, ob bereits ein DB-Trigger die
 * client_budgets.used_amount automatisch pflegt (siehe TRIGGER-PROBE).
 *
 * Ausführung:  node scripts/seed-betriebssystem.mjs
 * Benötigt ENV (aus .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ── ENV laden (.env.local dann .env) ────────────────────────────
function loadEnv() {
  const env = { ...process.env }
  for (const f of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(join(ROOT, f), 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (m && !(m[1] in env && env[m[1]])) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    } catch { /* Datei optional */ }
  }
  return env
}

const ENV = loadEnv()
const URL = ENV.NEXT_PUBLIC_SUPABASE_URL
const KEY = ENV.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen.')
  process.exit(1)
}

const H = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
}

// ── REST-Helfer ─────────────────────────────────────────────────
async function rest(method, path, { body, prefer } = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  }
  return data
}

const insert = (table, rows) =>
  rest('POST', table, { body: rows, prefer: 'return=representation' })
// Leistungsnachweise: intended Status via recStatus() auf DB-erlaubten Wert mappen
const insertRecords = (rows) =>
  insert('service_records', rows.map((r) => {
    // Verhinderung, das auf 'entlastung' zurückfällt, würde used_amount
    // (bestehender Trigger) verfälschen → bewusst als 'draft' speichern.
    const forceDraft = r.budget_type === 'verhinderung' && !BUDGET_OK
    return {
      ...r,
      budget_type: recBudget(r.budget_type),
      status: forceDraft ? 'draft' : recStatus(r.status),
    }
  }))
const patch = (table, filter, body) =>
  rest('PATCH', `${table}?${filter}`, { body, prefer: 'return=representation' })
const del = (table, filter) =>
  rest('DELETE', `${table}?${filter}`, { prefer: 'return=representation' })
const select = (table, query) => rest('GET', `${table}?${query}`)

const euro = (n) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
const YEAR = 2026

// Erlaubt die DB die echten App-Status (signed/invoiced/…)? Wird von
// probeConstraints() gesetzt. Falls nein (Constraint-Bug noch nicht per
// Migration behoben) → Fallback auf einen ERLAUBTEN, NICHT-'draft' Status
// ('paid'), damit der bestehende used_amount-Trigger die Einsätze weiterhin
// zählt. 'draft'-Einsätze bleiben 'draft' (Trigger ignoriert sie bewusst).
let STATUS_OK = false
const recStatus = (intended) =>
  STATUS_OK ? intended : (intended === 'draft' ? 'draft' : 'paid')

// Analog für budget_type: erlaubt die DB verhinderung/carryover/private?
// Falls nein → Fallback auf 'entlastung'. Verhinderungspflege-Einsätze,
// die so zurückfallen, werden als 'draft' gespeichert (siehe insertRecords),
// damit sie used_amount (via bestehendem Trigger) NICHT verfälschen.
let BUDGET_OK = false
const recBudget = (intended) => (BUDGET_OK ? intended : 'entlastung')

// ════════════════════════════════════════════════════════════════
// 1) Cleanup — eigene Seed-Daten entfernen (re-runnable)
// ════════════════════════════════════════════════════════════════
async function cleanup() {
  const clients = await select('clients', `customer_number=like.AE-TEST-*&select=id`)
  const ids = clients.map((c) => c.id)
  if (ids.length) {
    const inList = `(${ids.join(',')})`
    // Kinder zuerst (falls keine ON DELETE CASCADE Constraints greifen)
    const invoices = await select('invoices', `client_id=in.${inList}&select=id`)
    const invIds = invoices.map((i) => i.id)
    if (invIds.length) {
      const invIn = `(${invIds.join(',')})`
      await del('invoice_disputes', `invoice_id=in.${invIn}`)
      await del('invoice_items', `invoice_id=in.${invIn}`)
      await del('invoices', `id=in.${invIn}`)
    }
    await del('service_records', `client_id=in.${inList}`)
    await del('client_budgets', `client_id=in.${inList}`)
    await del('clients', `id=in.${inList}`)
  }
  await del('caregivers', `email=eq.betreuung.test@alltagsengel.care`)
  console.log(`🧹 Cleanup: ${ids.length} bestehende Test-Klienten entfernt.`)
}

// ════════════════════════════════════════════════════════════════
// 2) Stammdaten
// ════════════════════════════════════════════════════════════════
async function seedCaregiver() {
  const [cg] = await insert('caregivers', [{
    first_name: 'Maria',
    last_name: 'Schmidt',
    initials: 'M.S.',
    phone: '030 5551234',
    email: 'betreuung.test@alltagsengel.care',
    city: 'Berlin',
    zip_code: '10247',
    has_drivers_license: true,
    has_vehicle: true,
    languages: ['Deutsch', 'Polnisch'],
    status: 'active',
    emergency_pool: true,
  }])
  return cg
}

const CLIENTS = [
  {
    customer_number: 'AE-TEST-0001',
    first_name: 'Gerlinde', last_name: 'Hoffmann',
    date_of_birth: '1948-03-12',
    address: 'Lindenstraße 42', zip_code: '10969', city: 'Berlin',
    phone: '030 5510001', email: 'g.hoffmann.test@example.de',
    care_level: 2, care_level_since: '2024-11-01',
    insurance_name: 'AOK Nordost – Die Gesundheitskasse',
    insurance_number: 'A123456789',
    status: 'active',
    notes: 'Wünscht feste Betreuungskraft, vormittags. Testdatensatz.',
  },
  {
    customer_number: 'AE-TEST-0002',
    first_name: 'Werner', last_name: 'Krause',
    date_of_birth: '1941-07-25',
    address: 'Am Treptower Park 8', zip_code: '12435', city: 'Berlin',
    phone: '030 5510002', email: 'w.krause.test@example.de',
    care_level: 3, care_level_since: '2023-05-15',
    insurance_name: 'Techniker Krankenkasse – Pflegekasse',
    insurance_number: 'T987654321',
    status: 'active',
    notes: 'Beginnende Demenz, intensive Betreuung. Nutzt zusätzlich Verhinderungspflege. Testdatensatz.',
  },
  {
    customer_number: 'AE-TEST-0003',
    first_name: 'Ingrid', last_name: 'Bauer',
    date_of_birth: '1950-12-03',
    address: 'Kastanienallee 15', zip_code: '14467', city: 'Potsdam',
    phone: '0331 5510003', email: 'i.bauer.test@example.de',
    care_level: 2, care_level_since: '2025-02-20',
    insurance_name: 'BARMER – Pflegekasse',
    insurance_number: 'B456789123',
    status: 'active',
    notes: 'Vorjahresübertrag aus 2025 (verfällt 30.06.). Testdatensatz.',
  },
]

// ════════════════════════════════════════════════════════════════
// 3) Leistungsnachweis-Vorlagen pro Klient
// ════════════════════════════════════════════════════════════════
// Erzeugt regelmäßige Einsätze über einen Zeitraum.
function makeRecords({ start, count, everyDays, service, budget_type, minutes, amount, status = 'signed' }) {
  const rows = []
  const d = new Date(start + 'T00:00:00Z')
  for (let i = 0; i < count; i++) {
    const date = new Date(d.getTime() + i * everyDays * 86400000)
    const iso = date.toISOString().slice(0, 10)
    const startH = 9
    const endMin = startH * 60 + minutes
    rows.push({
      date: iso,
      start_time: `${String(startH).padStart(2, '0')}:00:00`,
      end_time: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}:00`,
      // duration_minutes ist eine GENERATED column (aus start/end) → nicht setzen
      service_type: service,
      budget_type,
      amount,
      caregiver_initials: 'M.S.',
      // status 'signed' verlangt (DB-Check) eine Unterschrift → Platzhalter-Signatur
      client_signature: status === 'signed'
        ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        : null,
      status,
    })
  }
  return rows
}

// Gerlinde (PG2) — moderate Nutzung → 🟢 grün (~21 %)
const RECORDS_1 = [
  ...makeRecords({ start: '2026-04-08', count: 3, everyDays: 21, service: 'Alltagsbegleitung', budget_type: 'entlastung', minutes: 120, amount: 68 }),
  ...makeRecords({ start: '2026-05-13', count: 1, everyDays: 1, service: 'Einkaufshilfe', budget_type: 'entlastung', minutes: 90, amount: 51 }),
  ...makeRecords({ start: '2026-06-24', count: 1, everyDays: 1, service: 'Arztbegleitung', budget_type: 'entlastung', minutes: 120, amount: 68, status: 'complete' }),
]

// Werner (PG3) — intensiv → 🔴 rot (~97 %) + zusätzlich Verhinderungspflege (§42a)
const RECORDS_2 = [
  ...makeRecords({ start: '2026-02-05', count: 10, everyDays: 14, service: 'Demenzbetreuung', budget_type: 'entlastung', minutes: 240, amount: 152 }),
  ...makeRecords({ start: '2026-03-15', count: 3, everyDays: 30, service: 'Betreuung / Gesellschaft', budget_type: 'verhinderung', minutes: 300, amount: 300 }),
]

// Ingrid (PG2) — mittlere Nutzung → 🟡 gelb (~75 %) + Vorjahresübertrag (verfallen)
const RECORDS_3 = [
  ...makeRecords({ start: '2026-01-20', count: 10, everyDays: 16, service: 'Haushaltshilfe', budget_type: 'entlastung', minutes: 150, amount: 130 }),
]

// ════════════════════════════════════════════════════════════════
// 4) Budget-Vorlagen (used_amount zunächst 0 → für Trigger-Probe)
// ════════════════════════════════════════════════════════════════
function makeBudget(client_id, { carryover = 0, carryover_expires = null, combined = 0, requires_application = false } = {}) {
  return {
    client_id,
    year: YEAR,
    monthly_amount: 131,          // §45b Entlastungsbetrag 131 €/Monat
    annual_amount: 1572,          // 131 × 12
    carryover_amount: carryover,
    carryover_expires,
    used_amount: 0,               // wird nach Insert der Records geprüft/gesetzt
    used_from_carryover: 0,
    private_amount: 0,
    status: 'active',
    combined_annual_amount: combined ? 3539 : 0,  // §42a gemeinsamer Jahresbetrag PG2-5
    combined_used_amount: 0,
    combined_type: combined ? 'verhinderung' : null,
    requires_application,
  }
}

// Prüft empirisch, ob die DB die echten App-Werte akzeptiert
// (status 'signed', budget_type 'verhinderung'). Setzt STATUS_OK/BUDGET_OK.
// Jede Testzeile wird sofort wieder gelöscht.
async function probeConstraints(client_id, caregiver_id) {
  const base = { ...RECORDS_1[0], client_id, caregiver_id }
  // status
  try {
    const [row] = await insert('service_records', [{ ...base, status: 'signed' }])
    await del('service_records', `id=eq.${row.id}`); STATUS_OK = true
  } catch (e) { if (!/status_check/.test(e.message)) throw e }
  // budget_type
  try {
    const [row] = await insert('service_records', [{ ...base, status: 'draft', budget_type: 'verhinderung' }])
    await del('service_records', `id=eq.${row.id}`); BUDGET_OK = true
  } catch (e) { if (!/budget_type_check/.test(e.message)) throw e }
}

// Summiert Beträge über die (intended) Quell-Arrays nach Budget-Topf.
const sumType = (rows, kind) => rows
  .filter((r) => kind === 'verhinderung'
    ? r.budget_type === 'verhinderung'
    : ['entlastung', 'carryover'].includes(r.budget_type))
  .reduce((s, r) => s + Number(r.amount), 0)

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════
async function main() {
  console.log('🌱 Seed Betriebssystem Phase 1 – Start\n')
  await cleanup()

  const caregiver = await seedCaregiver()
  console.log(`👤 Betreuungskraft: ${caregiver.first_name} ${caregiver.last_name} (${caregiver.id})`)

  const clients = await insert('clients', CLIENTS)
  console.log(`👥 Klienten: ${clients.length} angelegt`)

  const byNum = Object.fromEntries(clients.map((c) => [c.customer_number, c]))
  const c1 = byNum['AE-TEST-0001'], c2 = byNum['AE-TEST-0002'], c3 = byNum['AE-TEST-0003']

  // Check-Constraints prüfen (App-Status 'signed' / budget_type 'verhinderung' erlaubt?)
  await probeConstraints(c1.id, caregiver.id)
  console.log(`🔧 status-Constraint:      App-Werte ${STATUS_OK ? 'erlaubt ✅' : 'NICHT erlaubt ⚠️  → Fallback "draft"'}`)
  console.log(`🔧 budget_type-Constraint: App-Werte ${BUDGET_OK ? 'erlaubt ✅' : 'NICHT erlaubt ⚠️  → Fallback "entlastung"'}`)

  // Budgets (used_amount = 0)
  const budgets = await insert('client_budgets', [
    makeBudget(c1.id),
    makeBudget(c2.id, { combined: 1 }),
    makeBudget(c3.id, { carryover: 150, carryover_expires: '2026-06-30' }),
  ])
  console.log(`💰 Budgets: ${budgets.length} angelegt (used_amount = 0)`)

  // ── TRIGGER-PROBE ──────────────────────────────────────────────
  // Ein NICHT-'draft' Record für c1 wird eingefügt; danach prüfen wir,
  // ob used_amount sich VON SELBST verändert hat (→ Trigger vorhanden).
  const probe = await insertRecords([{ ...RECORDS_1[0], client_id: c1.id, caregiver_id: caregiver.id }])
  const probeAmount = Number(probe[0].amount)
  const [budgetAfterProbe] = await select('client_budgets', `id=eq.${budgets[0].id}&select=used_amount`)
  const triggerExists = Number(budgetAfterProbe.used_amount) > 0
  console.log(`\n🔎 TRIGGER-PROBE: nach 1 Einsatz (${euro(probeAmount)}, Status "${probe[0].status}") ist used_amount = ${euro(Number(budgetAfterProbe.used_amount))}`)
  console.log(triggerExists
    ? '   → ✅ Ein DB-Trigger pflegt client_budgets.used_amount automatisch (kein neuer Trigger nötig).'
    : '   → ⚠️  KEIN Trigger aktiv. used_amount wird unten manuell gesetzt.')

  // Restliche Records einfügen
  const rest1 = RECORDS_1.slice(1).map((r) => ({ ...r, client_id: c1.id, caregiver_id: caregiver.id }))
  const rows2 = RECORDS_2.map((r) => ({ ...r, client_id: c2.id, caregiver_id: caregiver.id }))
  const rows3 = RECORDS_3.map((r) => ({ ...r, client_id: c3.id, caregiver_id: caregiver.id }))

  const recs1 = [...probe, ...(rest1.length ? await insertRecords(rest1) : [])]
  const recs2 = await insertRecords(rows2)
  const recs3 = await insertRecords(rows3)
  console.log(`📋 Leistungsnachweise: ${recs1.length + recs2.length + recs3.length} angelegt`)

  // ── Budget-Töpfe abgleichen ────────────────────────────────────
  //  used_amount (§45b Entlastungsbetrag): pflegt der BESTEHENDE Trigger
  //    aus den nicht-'draft' entlastung-Einsätzen. Nur als Fallback (kein
  //    Trigger vorhanden) setzen wir ihn manuell.
  //  combined_used_amount (§42a Verhinderungspflege): KEIN Trigger → immer
  //    manuell aus den verhinderung-Einsätzen setzen.
  const used = {
    [c1.id]: { u: sumType(RECORDS_1, 'entlastung'), c: sumType(RECORDS_1, 'verhinderung') },
    [c2.id]: { u: sumType(RECORDS_2, 'entlastung'), c: sumType(RECORDS_2, 'verhinderung') },
    [c3.id]: { u: sumType(RECORDS_3, 'entlastung'), c: sumType(RECORDS_3, 'verhinderung') },
  }
  for (const b of budgets) {
    const u = used[b.client_id]
    const body = { combined_used_amount: u.c }
    if (!triggerExists) body.used_amount = u.u
    await patch('client_budgets', `id=eq.${b.id}`, body)
  }

  // Ist-Stand aus der DB lesen (used_amount = Trigger-Ergebnis)
  const finalBudgets = Object.fromEntries(
    (await select('client_budgets', `id=in.(${budgets.map((b) => b.id).join(',')})&select=client_id,used_amount,combined_used_amount`))
      .map((b) => [b.client_id, b]))
  console.log('💰 Budget-Ist (used_amount = Trigger-Ergebnis):')
  console.log(`   Gerlinde (PG2): ${euro(Number(finalBudgets[c1.id].used_amount))} / ${euro(1572)}  → 🟢`)
  console.log(`   Werner   (PG3): ${euro(Number(finalBudgets[c2.id].used_amount))} / ${euro(1572)} (§45b)  +  ${euro(Number(finalBudgets[c2.id].combined_used_amount))} / ${euro(3539)} (§42a)  → 🔴`)
  console.log(`   Ingrid   (PG2): ${euro(Number(finalBudgets[c3.id].used_amount))} / ${euro(1572 + 150)} (inkl. Übertrag)  → 🟡`)

  // ════════════════════════════════════════════════════════════════
  // 5) Rechnungen
  // ════════════════════════════════════════════════════════════════
  // Rechnung 1 (Gerlinde) — versendet, offen
  const inv1Recs = recs1.filter((r) => r.date >= '2026-05-01' && r.date <= '2026-06-30')
  const inv1Total = inv1Recs.reduce((s, r) => s + Number(r.amount), 0)
  const [inv1] = await insert('invoices', [{
    invoice_number: 'RE-2026-0001',
    client_id: c1.id,
    insurance_name: c1.insurance_name, insurance_number: c1.insurance_number,
    period_start: '2026-05-01', period_end: '2026-06-30',
    total_amount: inv1Total, budget_amount: inv1Total, private_amount: 0,
    status: 'sent', sent_at: '2026-07-01T09:00:00Z',
    notes: 'Abrechnung Mai–Juni 2026 über Entlastungsbetrag §45b.',
  }])
  await insert('invoice_items', inv1Recs.map((r) => ({
    invoice_id: inv1.id, service_record_id: r.id,
    description: r.service_type, date: r.date,
    duration_minutes: r.duration_minutes, amount: r.amount, budget_type: r.budget_type,
  })))
  await patch('service_records', `id=in.(${inv1Recs.map((r) => r.id).join(',')})`, { status: recStatus('invoiced') })

  // Rechnung 2 (Werner) — Teilzahlung + Streitfall (invoice_disputes)
  // Nach service_type filtern (stabil, unabhängig vom budget_type-Fallback)
  const inv2Recs = recs2.filter((r) => r.service_type === 'Demenzbetreuung' && r.date <= '2026-04-30')
  const inv2Total = inv2Recs.reduce((s, r) => s + Number(r.amount), 0)
  const inv2Paid = inv2Total - 152  // Kasse zahlt einen Einsatz nicht (fehlende Unterschrift)
  const [inv2] = await insert('invoices', [{
    invoice_number: 'RE-2026-0002',
    client_id: c2.id,
    insurance_name: c2.insurance_name, insurance_number: c2.insurance_number,
    period_start: '2026-02-01', period_end: '2026-04-30',
    total_amount: inv2Total, budget_amount: inv2Total, private_amount: 0,
    status: 'disputed', sent_at: '2026-05-05T09:00:00Z',
    paid_at: '2026-05-28T00:00:00Z', paid_amount: inv2Paid,
    rejection_reason: 'Ein Leistungsnachweis ohne Unterschrift des Klienten.',
    notes: 'Demenzbetreuung Q1 2026. Ein Einsatz strittig.',
  }])
  await insert('invoice_items', inv2Recs.map((r) => ({
    invoice_id: inv2.id, service_record_id: r.id,
    description: r.service_type, date: r.date,
    duration_minutes: r.duration_minutes, amount: r.amount, budget_type: r.budget_type,
  })))
  await patch('service_records', `id=in.(${inv2Recs.map((r) => r.id).join(',')})`, { status: recStatus('invoiced') })
  await insert('invoice_disputes', [{
    invoice_id: inv2.id,
    original_amount: inv2Total, paid_amount: inv2Paid,  // difference = GENERATED column
    reason: 'Fehlende Unterschrift auf Leistungsnachweis – Kasse verweigert Erstattung eines Einsatzes.',
    can_appeal: true,
    missing_document: 'Unterschriebener Leistungsnachweis (Demenzbetreuung)',
    budget_exceeded: false, charge_private: false,
    status: 'open',
    notes: 'Unterschrift wird bei Angehörigen nachgefordert; anschließend Widerspruch bei der Pflegekasse.',
  }])

  // Rechnung 3 (Ingrid) — vollständig bezahlt
  const inv3Recs = recs3.filter((r) => r.date <= '2026-03-31')
  const inv3Total = inv3Recs.reduce((s, r) => s + Number(r.amount), 0)
  const [inv3] = await insert('invoices', [{
    invoice_number: 'RE-2026-0003',
    client_id: c3.id,
    insurance_name: c3.insurance_name, insurance_number: c3.insurance_number,
    period_start: '2026-01-01', period_end: '2026-03-31',
    total_amount: inv3Total, budget_amount: inv3Total, private_amount: 0,
    status: 'paid', sent_at: '2026-04-02T09:00:00Z',
    paid_at: '2026-04-20T00:00:00Z', paid_amount: inv3Total,
    notes: 'Abrechnung Q1 2026 – vollständig erstattet.',
  }])
  await insert('invoice_items', inv3Recs.map((r) => ({
    invoice_id: inv3.id, service_record_id: r.id,
    description: r.service_type, date: r.date,
    duration_minutes: r.duration_minutes, amount: r.amount, budget_type: r.budget_type,
  })))
  await patch('service_records', `id=in.(${inv3Recs.map((r) => r.id).join(',')})`, { status: recStatus('invoiced') })

  console.log(`\n🧾 Rechnungen: 3 angelegt`)
  console.log(`   RE-2026-0001 (Gerlinde): ${euro(inv1Total)} – versendet`)
  console.log(`   RE-2026-0002 (Werner):   ${euro(inv2Total)} – strittig (bezahlt ${euro(inv2Paid)}, 1 Dispute offen)`)
  console.log(`   RE-2026-0003 (Ingrid):   ${euro(inv3Total)} – bezahlt`)

  console.log('\n✅ Seed abgeschlossen.')
  console.log(`   Trigger aktiv: ${triggerExists ? 'JA' : 'NEIN – Migration anwenden'}`)
}

main().catch((e) => { console.error('\n❌ Seed fehlgeschlagen:', e.message); process.exit(1) })
