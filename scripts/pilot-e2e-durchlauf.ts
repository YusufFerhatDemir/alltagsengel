/**
 * Pilot — vollständiger E2E-Durchlauf der Kundenkette gegen die ECHTE Datenbank
 *
 * Legt einen rein SYNTHETISCHEN Mandanten an, schickt einen synthetischen
 * Kunden durch alle 13 Kettenschritte und prüft nach jedem Schritt mit der
 * produktiven Bewertungslogik (lib/pilot/kundenkette.ts), ob der Stand
 * korrekt umspringt. Am Ende wird alles restlos wieder gelöscht.
 *
 * WARUM GEGEN DIE ECHTE DB: die Unit-Tests in
 * __tests__/billing/pilot-kundenkette.test.ts arbeiten mit einem Stub, der
 * die `select`-Strings ignoriert. Genau dort lag der Fehler, den dieses
 * Skript findet: eine Spalte, die es live nicht gibt, wird vom Stub still
 * mitgeliefert, von PostgREST aber mit 42703 abgelehnt.
 *
 * KEINE ECHTEN KUNDENDATEN. Alle Datensätze tragen den Marker E2E_PILOT_ und
 * hängen an einer eigens angelegten Organisation. Gelöscht wird ausschliesslich,
 * was an dieser Organisation hängt — niemals an einer bestehenden.
 *
 * Aufruf:
 *   npx tsx scripts/pilot-e2e-durchlauf.ts             — Durchlauf inkl. Aufräumen
 *   npx tsx scripts/pilot-e2e-durchlauf.ts --behalten  — Daten stehen lassen (Debug)
 *   npx tsx scripts/pilot-e2e-durchlauf.ts --nur-aufraeumen — Altlasten entfernen
 *   npx tsx scripts/pilot-e2e-durchlauf.ts --stand [orgId]
 *       — druckt NUR LESEND, was /admin/pilot für einen echten Mandanten
 *         anzeigt (Stand je Kunde und nächster Schritt). Ohne orgId die
 *         Stamm-Organisation.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ermittleKundenKette, ermittleKundenKetten } from '../lib/pilot/kundenkette'
import { ermittleVoraussetzungen } from '../lib/pilot/voraussetzungen'
import { KETTEN_SCHRITTE } from '../lib/pilot/schritte'
import { DEFAULT_ORG_ID as STAMM_ORG_ID } from '../lib/organizations/types'
import type { SchrittId, SchrittStand } from '../lib/pilot/types'

// ── Env laden (gleiches Muster wie scripts/readiness-live.ts) ────────
for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
if (!URL_ || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY werden benötigt.')
  process.exit(1)
}

/**
 * Marker, an dem synthetische Daten erkennbar sind. Enthält bewusst „TEST",
 * damit die bestehende Datenhygiene (scripts/bereinige-testdaten.ts und das
 * Go-Live-Dashboard) diesen Mandanten als Testmandanten zählt statt ihn für
 * einen echten Kunden zu halten.
 */
const MARKER = 'E2E_TEST_PILOT'

/**
 * FESTE Organisations-ID statt einer neuen je Lauf.
 *
 * Grund: sobald der Durchlauf eine Rechnung erzeugt hat, ist die
 * Organisationszeile wegen des unveränderlichen billing_audit_trail nicht
 * mehr löschbar. Mit einer festen ID bleibt genau EINE leere Hülle stehen,
 * nicht eine pro Lauf.
 */
const ORG_ID = '00000000-0000-4000-8000-00000000e2e1'

const supabase = createClient(URL_, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const behalten = process.argv.includes('--behalten')
const nurAufraeumen = process.argv.includes('--nur-aufraeumen')

// ── Ausgabe ─────────────────────────────────────────────────────────
const GRUEN = '\x1b[32m', ROT = '\x1b[31m', GELB = '\x1b[33m', GRAU = '\x1b[90m', AUS = '\x1b[0m'
const ZEICHEN: Record<SchrittStand, string> = {
  erledigt: `${GRUEN}●${AUS}`,
  laeuft: `${GELB}◐${AUS}`,
  offen: `${GRAU}○${AUS}`,
  blockiert: `${ROT}✕${AUS}`,
  entfaellt: `${GRAU}–${AUS}`,
}

let fehler = 0
const befunde: string[] = []

function meldeFehler(text: string) {
  fehler++
  befunde.push(text)
  console.log(`   ${ROT}BEFUND${AUS} ${text}`)
}

// ── Insert-Helfer: bricht laut ab statt still leere Daten zu liefern ──
async function einfuegen(
  tabelle: string,
  zeile: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from(tabelle)
    .insert(zeile as never)
    .select()
    .single()
  if (error) throw new Error(`INSERT ${tabelle} fehlgeschlagen: ${error.code} ${error.message}`)
  return data as Record<string, unknown>
}

async function aktualisieren(tabelle: string, id: string, werte: Record<string, unknown>) {
  const { error } = await supabase.from(tabelle).update(werte).eq('id', id)
  if (error) throw new Error(`UPDATE ${tabelle} fehlgeschlagen: ${error.code} ${error.message}`)
}

// ── Kette auswerten und prüfen ──────────────────────────────────────
interface Erwartung {
  /** Schritt, der nach dieser Phase erledigt sein MUSS. */
  erledigt: SchrittId[]
}

async function pruefeKette(
  orgId: string,
  clientId: string,
  phase: string,
  erwartung: Erwartung,
): Promise<void> {
  const kette = await ermittleKundenKette(supabase as unknown as SupabaseClient, orgId, clientId)
  if (!kette) {
    meldeFehler(`${phase}: Kette nicht ermittelbar (Kunde nicht gefunden).`)
    return
  }

  const zeile = kette.schritte.map(s => ZEICHEN[s.stand]).join(' ')
  const naechster = kette.aktuellerSchritt
    ? `${kette.aktuellerSchritt.nr}. ${kette.aktuellerSchritt.label}`
    : 'Kette vollständig'
  console.log(
    `${zeile}  ${String(kette.fortschritt.erledigt).padStart(2)}/${kette.fortschritt.anwendbar}` +
    `  ${phase.padEnd(28)} → ${naechster}`,
  )

  // Datenfehler sind ein eigener Befund: eine Kette, die auf nicht lesbaren
  // Tabellen beruht, darf nicht als "offen" durchgehen.
  for (const d of kette.datenfehler) meldeFehler(`${phase}: ${d}`)

  for (const id of erwartung.erledigt) {
    const s = kette.schritte.find(x => x.id === id)
    if (!s) { meldeFehler(`${phase}: Schritt ${id} fehlt in der Kette.`); continue }
    if (s.stand !== 'erledigt') {
      meldeFehler(
        `${phase}: Schritt ${s.nr} „${s.label}" müsste erledigt sein, ist aber „${s.stand}" (${s.wert ?? '—'}).`,
      )
    }
  }
}

// ── Aufräumen ───────────────────────────────────────────────────────
/**
 * Löscht in FK-sicherer Reihenfolge alles, was an der synthetischen
 * Organisation hängt. Läuft auch im Fehlerfall.
 *
 * BEKANNTE GRENZE — dieselbe wie in scripts/bereinige-testdaten.ts:
 * billing_audit_trail und wf_audit_log sind absichtlich unveränderlich
 * (BEFORE-DELETE-Trigger) und zeigen per Fremdschlüssel auf `organizations`.
 * Sobald der Durchlauf eine Rechnung erzeugt hat, ist die Organisationszeile
 * nicht mehr löschbar. Alle Personen- und Leistungsdaten verschwinden
 * trotzdem restlos; stehen bleibt eine leere Hülle mit Marker im Namen.
 * Der Audit-Trigger wird dafür NICHT abgeschaltet.
 */
async function aufraeumen(orgId: string): Promise<void> {
  const reihenfolge = [
    'payment_allocations',
    'payments',
    'invoice_packages',
    'invoices',
    'service_signatures',
    'service_records',
    'assignments',
    'client_budgets',
    'clients',
    'caregivers',
    'datev_exports',
    // Von Triggern nebenbei geschrieben — ohne sie scheitert das Löschen der
    // Organisation am Fremdschlüssel.
    'wf_statistik',
  ]
  for (const tabelle of reihenfolge) {
    const { error } = await supabase.from(tabelle).delete().eq('organization_id', orgId)
    if (error) console.log(`   ${GELB}Aufräumen${AUS} ${tabelle}: ${error.message}`)
  }

  // Beweis statt Annahme: sind wirklich keine Personen-/Leistungsdaten mehr da?
  const reste: string[] = []
  for (const tabelle of reihenfolge) {
    const { count } = await supabase
      .from(tabelle)
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
    if ((count ?? 0) > 0) reste.push(`${tabelle} (${count})`)
  }
  if (reste.length > 0) {
    console.log(`   ${ROT}Reste${AUS} ${reste.join(', ')}`)
  } else {
    console.log('   Alle Personen- und Leistungsdaten entfernt.')
  }

  const { error } = await supabase.from('organizations').delete().eq('id', orgId)
  if (error) {
    console.log(
      `   ${GELB}Organisationshülle bleibt stehen${AUS} (${orgId}): ${error.message}\n` +
      '   Erwartet, sobald eine Rechnung erzeugt wurde — der Audit-Trail ist unveränderlich.',
    )
  }
}

/**
 * Entfernt Reste früherer Läufe. Erfasst neben dem festen Testmandanten auch
 * die Hüllen älterer Läufe, die noch eine eigene ID hatten.
 */
async function altlastenEntfernen(): Promise<number> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    // PostgREST-Wildcard ist `*`, nicht `%`.
    .or(`id.eq.${ORG_ID},name.like.E2E_PILOT*,name.like.${MARKER}*`)
  if (error) throw new Error(`Altlasten nicht lesbar: ${error.message}`)
  for (const org of data ?? []) {
    console.log(`Entferne Reste aus ${org.name} (${org.id})`)
    await aufraeumen(org.id)
    // Hüllen, die der Audit-Trail festhält, wenigstens eindeutig als
    // Testmandant kennzeichnen — sonst stehen sie in jeder Mandantenliste
    // wie ein echter Kunde.
    if (!String(org.name).startsWith(MARKER)) {
      const { error: umbenennFehler } = await supabase
        .from('organizations')
        .update({ name: `${MARKER}_ALTLAST_${String(org.id).slice(0, 8)}` })
        .eq('id', org.id)
      if (umbenennFehler) {
        console.log(`   ${GELB}Umbenennen${AUS} ${org.id}: ${umbenennFehler.message}`)
      } else {
        console.log(`   Hülle als Testmandant gekennzeichnet.`)
      }
    }
  }
  return (data ?? []).length
}

// ── Durchlauf ───────────────────────────────────────────────────────
async function durchlauf(): Promise<void> {
  const orgId = ORG_ID
  const heute = new Date().toISOString().slice(0, 10)
  const jahr = new Date().getFullYear()
  const lauf = Date.now().toString(36).toUpperCase()

  console.log(`\nSynthetischer Mandant ${MARKER} (${orgId}), Lauf ${lauf}`)
  console.log(`Kettenschritte: ${KETTEN_SCHRITTE.map(s => s.nr).join(' ')}\n`)

  try {
    // upsert: die Hülle überlebt frühere Läufe (unveränderlicher Audit-Trail).
    const { error: orgFehler } = await supabase.from('organizations').upsert({
      id: orgId,
      name: MARKER,
      address: { strasse: 'Teststrasse 1', plz: '60311', ort: 'Frankfurt am Main', bundesland: 'hessen' },
      settings: {},
      bundesland: 'hessen',
      status: 'active',
      billing_plan: 'intern',
      iban: 'DE02120300000000202051',
    } as never)
    if (orgFehler) throw new Error(`Testmandant nicht anlegbar: ${orgFehler.message}`)

    // ── Phase 1: Kunde ────────────────────────────────────────────
    const client = await einfuegen('clients', {
      organization_id: orgId,
      customer_number: `${MARKER}-${lauf}-K1`,
      first_name: 'Testine',
      last_name: 'Synthetika',
      geburtsdatum: '1940-01-01',
      address: 'Teststrasse 2',
      zip_code: '60311',
      city: 'Frankfurt am Main',
      phone: '069 0000000',
      status: 'active',
    })
    const clientId = client.id as string
    await pruefeKette(orgId, clientId, '1 Kunde angelegt', { erledigt: ['kunde'] })

    // ── Phase 2: Pflegegrad ───────────────────────────────────────
    await aktualisieren('clients', clientId, { pflegegrad: 2, pflegegrad_seit: `${jahr}-01-01` })
    await pruefeKette(orgId, clientId, '2 Pflegegrad erfasst', { erledigt: ['kunde', 'pflegegrad'] })

    // ── Phase 3: Budget ───────────────────────────────────────────
    await einfuegen('client_budgets', {
      organization_id: orgId,
      client_id: clientId,
      year: jahr,
      monthly_amount: 131,
      annual_amount: 1572,
      combined_annual_amount: 3539,
      status: 'active',
    })
    await pruefeKette(orgId, clientId, '3 Budget angelegt', { erledigt: ['budget'] })

    // ── Phase 4+5: Betreuungskraft und Termin ─────────────────────
    // Schritt 4 misst die Zuordnung über einen Einsatz — er kann deshalb
    // nicht vor Schritt 5 erledigt sein. Das ist so gewollt (siehe
    // Kriterium in lib/pilot/schritte.ts), wird hier aber mitgeprüft.
    const engel = await einfuegen('caregivers', {
      organization_id: orgId,
      first_name: 'Synthia',
      last_name: 'Testkraft',
      initials: 'ST',
      einsatzfreigabe: true,
      einsatzfreigabe_am: heute,
      status: 'active',
    })
    const engelId = engel.id as string

    await einfuegen('assignments', {
      organization_id: orgId,
      client_id: clientId,
      caregiver_id: engelId,
      assignment_date: heute,
      start_time: '09:00',
      end_time: '11:00',
      service_type: 'Alltagsbegleitung',
      status: 'active',
      is_recurring: false,
    })
    await pruefeKette(orgId, clientId, '4+5 Engel und Termin', { erledigt: ['engel', 'termin'] })

    // ── Phase 6: Leistungsnachweis ────────────────────────────────
    const record = await einfuegen('service_records', {
      organization_id: orgId,
      client_id: clientId,
      caregiver_id: engelId,
      date: heute,
      start_time: '09:00',
      end_time: '11:00',
      // duration_minutes wird live von der Datenbank berechnet (GENERATED).
      // Ein mitgeschickter Wert lässt den INSERT mit 428C9 scheitern.
      service_type: 'Alltagsbegleitung',
      budget_type: 'entlastung',
      caregiver_initials: 'ST',
      amount: 70,
      status: 'draft',
    })
    const recordId = record.id as string
    if (record.duration_minutes !== 120) {
      meldeFehler(
        `service_records.duration_minutes wird nicht wie erwartet aus 09:00–11:00 berechnet ` +
        `(erhalten: ${JSON.stringify(record.duration_minutes)}). Abrechnung nach Stunden hängt daran.`,
      )
    }
    await pruefeKette(orgId, clientId, '6 Leistungsnachweis', { erledigt: ['leistungsnachweis'] })

    // ── Phase 7: Signatur ─────────────────────────────────────────
    await einfuegen('service_signatures', {
      organization_id: orgId,
      service_record_id: recordId,
      signer_role: 'client',
      signer_name: 'Testine Synthetika',
      signature_image: 'data:image/png;base64,iVBORw0KGgo=',
    })
    await pruefeKette(orgId, clientId, '7 Signatur geleistet', { erledigt: ['signatur'] })

    // ── Phase 8: Freigabe ─────────────────────────────────────────
    await aktualisieren('service_records', recordId, { status: 'signed' })
    await pruefeKette(orgId, clientId, '8 Nachweis freigegeben', { erledigt: ['freigabe'] })

    // ── Phase 9: Rechnung ─────────────────────────────────────────
    const invoice = await einfuegen('invoices', {
      organization_id: orgId,
      client_id: clientId,
      invoice_number: `${MARKER}-${lauf}-RE-0001`,
      invoice_number_formatted: `${MARKER}-${lauf}-RE-0001`,
      period_start: heute,
      period_end: heute,
      total_amount: 70,
      private_amount: 70,
      status: 'sent',
      billing_type: 'privat',
    })
    const invoiceId = invoice.id as string
    await pruefeKette(orgId, clientId, '9 Rechnung erstellt', { erledigt: ['rechnung'] })

    // ── Phase 10: Belegpaket (PDF) ────────────────────────────────
    await einfuegen('invoice_packages', {
      organization_id: orgId,
      invoice_id: invoiceId,
      pdf_url: `e2e/${lauf}/beleg.pdf`,
      page_count: 2,
    })
    await pruefeKette(orgId, clientId, '10 Belegpaket erzeugt', { erledigt: ['pdf'] })

    // ── Phase 11+12: Zahlungseingang und OPOS ─────────────────────
    // 70,00 € Rechnung (EURO) gegen 7000 Cent Zahlung — genau die
    // Umrechnung, an der die Bezahlt-Erkennung schon einmal gescheitert ist.
    //
    // Es gibt ZWEI Wege, auf denen eine Rechnung als bezahlt gilt:
    //   a) payments + payment_allocations — der belastbare Weg
    //   b) invoices.paid_amount — Altbestand ohne Zuordnung
    // Der E2E prüft a) und weicht bei einem Live-Defekt auf b) aus, damit
    // die Schritte 12 und 13 trotzdem geprüft werden. Der Ausweichweg wird
    // als Befund gemeldet, nicht stillschweigend genommen.
    let zahlungswegOk = true
    try {
      const payment = await einfuegen('payments', {
        organization_id: orgId,
        payment_date: heute,
        amount_cents: 7000,
        payment_method: 'ueberweisung',
        payer_type: 'kunde',
        payer_name: 'Testine Synthetika',
        matching_status: 'manuell_zugeordnet',
        allocated_cents: 7000,
      })
      await einfuegen('payment_allocations', {
        organization_id: orgId,
        payment_id: payment.id,
        invoice_id: invoiceId,
        amount_cents: 7000,
        allocation_type: 'vollzahlung',
      })
    } catch (e) {
      zahlungswegOk = false
      meldeFehler(
        `Zahlungseingang über payments/payment_allocations ist live nicht möglich: ` +
        `${e instanceof Error ? e.message : String(e)} — OPOS-Ausgleich und Mahnwesen hängen daran.`,
      )
      // Ausweichweg, damit 12 und 13 trotzdem geprüft werden.
      await aktualisieren('invoices', invoiceId, {
        paid_amount: 70, status: 'paid', bezahlt: true, bezahlt_am: heute,
      })
    }
    await pruefeKette(
      orgId, clientId,
      zahlungswegOk ? '11+12 Zahlung und OPOS' : '11+12 Zahlung (Ausweichweg)',
      { erledigt: ['zahlung', 'opos'] },
    )

    // ── Phase 13: DATEV ───────────────────────────────────────────
    await einfuegen('datev_exports', {
      organization_id: orgId,
      zeitraum_von: `${jahr}-01-01`,
      zeitraum_bis: `${jahr}-12-31`,
      buchungen_anzahl: 1,
      status: 'erstellt',
      kontenrahmen: 'SKR03',
    })
    await pruefeKette(orgId, clientId, '13 In DATEV übergeben', {
      erledigt: KETTEN_SCHRITTE.map(s => s.id),
    })

    // ── Abschluss: Kette muss vollständig sein ────────────────────
    const final = await ermittleKundenKette(supabase as unknown as SupabaseClient, orgId, clientId)
    if (!final?.vollstaendig) {
      meldeFehler(
        `Kette nicht vollständig: ${final?.fortschritt.erledigt}/${final?.fortschritt.anwendbar} ` +
        `(offen: ${final?.schritte.filter(s => s.stand !== 'erledigt').map(s => `${s.nr}. ${s.label} = ${s.stand}`).join(', ')})`,
      )
    } else {
      console.log(`\n${GRUEN}Kette vollständig durchlaufen: 13/13 (100 %).${AUS}`)
    }
  } finally {
    if (behalten) {
      console.log(`\n${GELB}--behalten: synthetische Daten bleiben stehen (Org ${orgId}).${AUS}`)
      console.log(`Entfernen mit: npx tsx scripts/pilot-e2e-durchlauf.ts --nur-aufraeumen`)
    } else {
      console.log('\nRäume synthetische Daten auf …')
      await aufraeumen(orgId)
    }
  }
}

/**
 * Druckt den Pilot-Stand eines echten Mandanten — exakt die Werte, die
 * /admin/pilot rendert. Rein lesend, verändert nichts.
 */
async function standAnzeigen(orgId: string): Promise<void> {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) throw new Error(`Kunden nicht lesbar: ${error.message}`)

  const ketten = await ermittleKundenKetten(
    supabase as unknown as SupabaseClient,
    orgId,
    (clients ?? []).map(c => c.id),
  )

  console.log(`\nPilot-Stand für Organisation ${orgId} — ${ketten.length} aktive Kunden\n`)
  for (const k of ketten) {
    console.log(
      `${k.schritte.map(s => ZEICHEN[s.stand]).join(' ')}  ` +
      `${String(k.fortschritt.erledigt).padStart(2)}/${k.fortschritt.anwendbar}  ` +
      `${k.name.padEnd(22)} → ${k.aktuellerSchritt ? `${k.aktuellerSchritt.nr}. ${k.aktuellerSchritt.label}` : 'Kette vollständig'}`,
    )
    if (k.datenfehler.length > 0) {
      for (const f of k.datenfehler) console.log(`   ${ROT}Datenfehler${AUS} ${f}`)
    }
    if (k.aktuellerSchritt?.naechsterSchritt) {
      console.log(`   ${GRAU}${k.aktuellerSchritt.naechsterSchritt}${AUS}`)
    }
  }

  const vor = await ermittleVoraussetzungen(supabase as unknown as SupabaseClient, orgId)
  console.log(
    `\nBetriebs-Checkliste: ${vor.zusammenfassung.gruen} grün, ` +
    `${vor.zusammenfassung.gelb} gelb, ${vor.zusammenfassung.rot} rot — ` +
    `Echtbetrieb ${vor.echtbetriebFreigegeben ? `${GRUEN}freigegeben${AUS}` : `${ROT}gesperrt${AUS}`}`,
  )
  for (const p of vor.punkte.filter(p => p.ampel !== 'gruen')) {
    console.log(`  ${p.ampel === 'rot' ? ROT : GELB}${p.ampel}${AUS} ${p.pflicht ? '[PFLICHT] ' : ''}${p.label}: ${p.wert ?? '—'}`)
  }
}

// ── Einstieg ────────────────────────────────────────────────────────
async function main() {
  const standIndex = process.argv.indexOf('--stand')
  if (standIndex >= 0) {
    const orgId = process.argv[standIndex + 1]?.startsWith('--')
      ? undefined
      : process.argv[standIndex + 1]
    await standAnzeigen(orgId ?? STAMM_ORG_ID)
    return
  }

  if (nurAufraeumen) {
    const n = await altlastenEntfernen()
    console.log(n === 0 ? 'Keine Altlasten gefunden.' : `${n} Altlast-Mandanten entfernt.`)
    return
  }

  await altlastenEntfernen()
  await durchlauf()

  console.log('')
  if (fehler === 0) {
    console.log(`${GRUEN}E2E-Durchlauf ohne Befund.${AUS}`)
  } else {
    console.log(`${ROT}${fehler} Befund(e):${AUS}`)
    befunde.forEach((b, i) => console.log(`  ${i + 1}. ${b}`))
    process.exitCode = 1
  }
}

main().catch(e => {
  console.error(`\n${ROT}Abbruch:${AUS} ${e instanceof Error ? e.message : String(e)}`)
  process.exitCode = 1
})
