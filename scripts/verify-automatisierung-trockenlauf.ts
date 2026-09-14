#!/usr/bin/env tsx
/**
 * verify-automatisierung-trockenlauf.ts
 * -------------------------------------
 * Faehrt ALLE taeglichen Automatisierungsketten gegen die Produktion —
 * lesend, und zeigt, was sie schreiben WUERDEN.
 *
 * ── WOZU ──────────────────────────────────────────────────────────
 * Elf Ketten sind gebaut, in lib/automation/index.ts verdrahtet und in
 * vercel.json getaktet (taeglich 05:00). Gelaufen ist keine: CRON_SECRET
 * ist nicht gesetzt, `pruefeCronGeheimnis` weist jeden Aufruf ab, und
 * `ops_aufgaben` traegt live 0 Zeilen.
 *
 * Am Tag, an dem das Geheimnis gesetzt wird, laufen alle elf auf einmal
 * gegen einen zwei Monate alten Bestand. Dieser Lauf beantwortet vorher,
 * was dann passiert: wie viele Aufgaben, wie viele Meldungen, wie viele
 * E-Mails — und ob eine Kette dabei auf einen Fehler laeuft.
 *
 * ── DREI RIEGEL ───────────────────────────────────────────────────
 * 1. DATENBANK: `nurLesenderClient` reicht jedes select durch und faengt
 *    jedes insert/update/upsert/delete/rpc ab. Der Riegel sitzt am
 *    Client, nicht in den Ketten — so kann keine Kette ihn vergessen.
 * 1b. DIE EIGENE FABRIK: vier Module (lib/audit-log.ts, notifications/
 *    delivery-log.ts, retry-worker.ts, retry.ts) holen sich ueber
 *    `createAdminClient()` einen EIGENEN Client und liefen damit am
 *    Proxy vorbei. Beim ersten Probelauf am 14.09.2026 erreichte der
 *    Audit-Eintrag der Lead-Kette wirklich die Datenbank und scheiterte
 *    nur am CHECK `mis_audit_log_action_check`. Der Preload-Hook
 *    scripts/test-stubs/admin-client-trockenlauf.cjs ersetzt die Fabrik
 *    deshalb durch denselben Proxy.
 * 2. E-MAIL: `sendEmailNotification` nimmt keinen Client und spricht
 *    Resend direkt an. Dieser Lauf leert deshalb RESEND_API_KEY, BEVOR
 *    die Module geladen werden, und bricht ab, falls das misslingt.
 *    `sendRawEmail` meldet dann `uebersprungen: true`, ohne zu werfen.
 *
 * Es wird NICHTS geschrieben und NICHTS versendet.
 *
 * `lib/supabase/admin.ts` traegt `server-only`; das wirft in einem
 * Node-Skript. Der Aufruf haengt deshalb denselben Stub vor, den auch
 * andere Pruefskripte benutzen (scripts/test-stubs/server-only-stub.cjs).
 * Der Guard schuetzt Browser-Bundles — dieses Skript IST der Server.
 *
 * Aufruf:  npm run verify:automatisierung
 */
import { readFileSync, existsSync } from 'node:fs'

// ── Reihenfolge ist wesentlich ────────────────────────────────────
// Erst die Umgebung entschaerfen, DANN die Module laden. `getResend()`
// liest den Schluessel zwar bei jedem Aufruf neu, andere Module lesen
// Umgebungsvariablen aber beim Laden. Wer hier erst importiert und dann
// aufraeumt, hat unter Umstaenden schon einen scharfen Versandweg im
// Speicher.
for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const hatteResendKey = Boolean(process.env.RESEND_API_KEY)
delete process.env.RESEND_API_KEY
// Push und SMS laufen ueber dieselbe Zustellspur — ebenfalls entschaerfen.
delete process.env.FCM_SERVER_KEY
delete process.env.TWILIO_AUTH_TOKEN

/** Zaehlt Zeilen, die in den letzten Minuten entstanden sind. */
async function neueZeilen(
  sb: { from: (t: string) => { select: (s: string, o: unknown) => { gte: (a: string, b: string) => Promise<{ count: number | null; error: unknown }> } } },
  tabelle: string,
  seit: string,
): Promise<number | null> {
  try {
    const { count, error } = await sb.from(tabelle)
      .select('id', { count: 'exact', head: true }).gte('created_at', seit)
    return error ? null : (count ?? 0)
  } catch { return null }
}

/** Tabellen, in die ein Trockenlauf auf keinen Fall schreiben darf. */
const UNBERUEHRT = [
  'ops_aufgaben', 'notifications', 'notification_delivery_log',
  'mis_audit_log', 'billing_feiertage',
]

async function main(): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js')
  const { nurLesenderClient, trockenlaufGefahr } = await import('../lib/automation/trockenlauf')

  const gefahr = trockenlaufGefahr()
  if (gefahr) {
    console.error(`ABBRUCH — ${gefahr}`)
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.log('Keine Zugangsdaten — uebersprungen.'); return }

  // Der Proxy MUSS stehen, bevor `lib/automation` geladen wird: der
  // Preload-Hook liefert ihn an jeden `createAdminClient()`-Aufruf aus und
  // wirft, solange er fehlt.
  const echtFuerProxy = createClient(url, key)
  const global = nurLesenderClient(echtFuerProxy)
  ;(globalThis as Record<string, unknown>).__TROCKENLAUF_ADMIN__ = global.client

  const { fuehreTaeglicheAutomatisierungAus } = await import('../lib/automation')
  const { pflegeFeiertagskatalog } = await import('../lib/automation/feiertage-pflege')

  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(' AUTOMATISIERUNGSKETTEN — Trockenlauf gegen Produktion')
  console.log(` ${new Date().toISOString()}`)
  console.log(` Resend-Schluessel war gesetzt: ${hatteResendKey ? 'ja, fuer diesen Lauf geleert' : 'nein'}`)
  console.log(' Es wird NICHTS geschrieben und NICHTS versendet.')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  const echt = createClient(url, key)
  const beginn = new Date(Date.now() - 60_000).toISOString()
  const vorher: Record<string, number | null> = {}
  for (const t of UNBERUEHRT) vorher[t] = await neueZeilen(echt as never, t, beginn)

  const { data: orgs, error } = await echt.from('organizations').select('id, name')
  if (error) { console.error('Organisationen nicht lesbar:', error.message); process.exit(1) }

  let fehlerhafteKetten = 0
  let schreibvorgaengeGesamt = 0

  for (const org of orgs ?? []) {
    console.log(`── Organisation: ${org.name} ─────────────────────────────`)
    const { client, protokoll } = nurLesenderClient(echt)

    let ergebnis: Awaited<ReturnType<typeof fuehreTaeglicheAutomatisierungAus>>
    try {
      // katalogpflege: false — genau wie in app/api/cron/automatisierung.
      // Der Trockenlauf muss zeigen, was SCHARF passiert; liefe der
      // Katalog hier je Mandant, berichtete er einen Lauf, den es nicht
      // mehr gibt.
      ergebnis = await fuehreTaeglicheAutomatisierungAus(client, String(org.id), String(org.id), {
        katalogpflege: false,
      })
    } catch (err) {
      console.error(`  ABBRUCH der gesamten Automatisierung: ${(err as Error).message}`)
      fehlerhafteKetten++
      continue
    }

    for (const [name, stand] of Object.entries(ergebnis.ketten)) {
      if (stand.ok) {
        const kurz = JSON.stringify(stand.ergebnis ?? {})
        console.log(`  ✓ ${name.padEnd(32)} ${kurz.length > 110 ? kurz.slice(0, 110) + '…' : kurz}`)
      } else {
        fehlerhafteKetten++
        console.log(`  ✗ ${name.padEnd(32)} ${stand.fehler}`)
      }
    }

    const jeTabelle = protokoll.jeTabelle()
    const gesamt = protokoll.vorgaenge.length
    schreibvorgaengeGesamt += gesamt
    console.log(`\n  Schreibvorgaenge, die scharf entstanden waeren: ${gesamt}`)
    for (const [tabelle, n] of Object.entries(jeTabelle).sort((a, b) => b[1] - a[1])) {
      console.log(`     ${String(n).padStart(5)}x  ${tabelle}`)
    }
    const methoden = protokoll.jeMethode()
    console.log(`     nach Art: ${Object.entries(methoden).map(([m, n]) => `${n}x ${m}`).join(', ') || '—'}`)
    console.log()
  }

  // ── Katalogpflege: EINMAL, nach der Schleife ────────────────────
  // Genau wie in app/api/cron/automatisierung. `billing_feiertage` hat
  // kein `organization_id`; in der Mandantenschleife lief die Pflege
  // einmal je Organisation und jede wies "importiert: 76" fuer
  // bundesweite Daten aus.
  console.log('── Katalogpflege (mandantenuebergreifend, einmal pro Lauf) ──')
  {
    const { client, protokoll } = nurLesenderClient(echt)
    try {
      const katalog = await pflegeFeiertagskatalog(client)
      console.log(`  ✓ feiertage_katalog              ${JSON.stringify(katalog)}`)
      if (katalog.fehler.length > 0) fehlerhafteKetten++
    } catch (err) {
      fehlerhafteKetten++
      console.log(`  ✗ feiertage_katalog              ${(err as Error).message}`)
    }
    const gesamt = protokoll.vorgaenge.length
    schreibvorgaengeGesamt += gesamt
    // Im Trockenlauf meldet jeder abgefangene Insert Erfolg, deshalb steht
    // hier die volle Zahl. SCHARF faengt der Unique-Index
    // (unique_feiertag_datum_bl) alles ab, was schon im Katalog steht —
    // live sind das 76 von 76 Zeilen, der Lauf schreibt dann nichts.
    console.log(`  Schreibvorgaenge, die scharf VERSUCHT wuerden: ${gesamt}`)
    console.log()
  }

  // ── Der Beweis, dass der Riegel gehalten hat ────────────────────
  // Nicht „der Proxy sagt, er habe abgefangen", sondern: ist in der
  // Datenbank etwas entstanden? Das ist die einzige Frage, die zaehlt.
  console.log('── NACHWEIS: es wurde nichts geschrieben ──────────────────')
  let geschrieben = 0
  for (const t of UNBERUEHRT) {
    const nachher = await neueZeilen(echt as never, t, beginn)
    const delta = (nachher ?? 0) - (vorher[t] ?? 0)
    if (delta !== 0) geschrieben += delta
    console.log(`  ${delta === 0 ? '✓' : '✗'} ${t.padEnd(30)} neue Zeilen waehrend des Laufs: ${delta}`)
  }
  console.log()

  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(` Ketten mit Fehler        : ${fehlerhafteKetten}`)
  console.log(` Tatsaechlich geschrieben : ${geschrieben} (muss 0 sein)`)
  console.log(` Schreibvorgaenge gesamt  : ${schreibvorgaengeGesamt} (verworfen)`)
  if (fehlerhafteKetten === 0) {
    console.log(' ✅ Alle Ketten laufen durch. Die Zahlen oben sind das, was beim')
    console.log('    Setzen von CRON_SECRET am ersten Tag entstehen wuerde.')
  } else {
    console.log(' ❌ Mindestens eine Kette laeuft auf einen Fehler — VOR dem')
    console.log('    Scharfschalten beheben.')
  }
  console.log('═══════════════════════════════════════════════════════════════════')
  if (geschrieben !== 0) {
    console.log(' ❌ ACHTUNG: der Trockenlauf hat geschrieben. Ein Weg umgeht den Proxy.')
  }
  process.exit(fehlerhafteKetten === 0 && geschrieben === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
