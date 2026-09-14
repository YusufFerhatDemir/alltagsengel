#!/usr/bin/env node
/**
 * SAMMELRECHNUNGSLAUF UND MONATSABSCHLUSS, live gegen Produktion.
 *
 * ── WAS DIESER LAUF NICHT TUT ─────────────────────────────────────────────
 *
 * Er erzeugt KEINE Rechnung. Das ist kein Vorsichtsreflex, sondern eine
 * Rechnung mit Folgen: Rechnungsnummern kommen aus
 * `billing_number_sequences`, und eine angelegte und wieder geloeschte
 * Pruefrechnung hinterliesse eine LUECKE im Nummernkreis — ein
 * Buchhaltungsmangel, den kein Aufraeumen wieder heilt. Dieselbe Regel wie
 * in `verify:opos-mahnwesen`.
 *
 * Daraus folgt der Zuschnitt:
 *
 *   TEIL A — NUR LESEN. Die Invarianten des BESTANDS. Ein Sammellauf ist
 *            ein Vorgang mit Kopfsatz und Gruppenzeilen; laufen die
 *            auseinander, zaehlt die Uebersicht etwas anderes, als
 *            tatsaechlich abgerechnet wurde.
 *   TEIL B — SCHREIBEND, ABER OHNE FOLGEN. Alles in EINEM `DO`-Block im
 *            Lese-Orakel `public._run_sql`, der IMMER mit `RAISE EXCEPTION`
 *            endet. Die Transaktion rollt vollstaendig zurueck.
 *
 * ── WARUM DIESE KETTE ─────────────────────────────────────────────────────
 *
 * `verify:geldweg` faehrt die EINZELrechnung von der Leistung bis zur
 * Zahlung. Der Weg, der im Betrieb tatsaechlich benutzt wird, ist aber der
 * Monatslauf ueber alle Klienten — und der war live nie geprueft. Zwei
 * Dinge koennen dort schiefgehen, die in der Einzelkette gar nicht
 * vorkommen:
 *
 *   1. ZWEI LAEUFE GLEICHZEITIG. Derselbe Monat zweimal abgerechnet heisst
 *      zwei Rechnungen an dieselbe Familie.
 *   2. KOPF UND ZEILEN LAUFEN AUSEINANDER. Die Uebersicht meldet „14
 *      erstellt", und in den Zeilen stehen 11. Welche Zahl stimmt, sieht
 *      niemand.
 *
 * Aufruf:  npm run verify:sammelrechnung
 */

import { readFileSync, existsSync } from 'node:fs'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

import { createClient } from '@supabase/supabase-js'
import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'
import { fuehreSammelrechnungslaufAus, UEBERSPRING_CODES as CODES_AUS_MODUL } from '../lib/billing/core/sammelrechnung.ts'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
const ORG = '00000000-0000-4000-8000-000460629986'

if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  console.error('Es wurde NICHTS geprueft — dieser Lauf ist kein Nachweis.')
  process.exit(2)
}

const admin = createClient(URL_BASIS, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * Die Codes aus `lib/billing/core/sammelrechnung.ts`.
 *
 * Bewusst hier wiederholt statt importiert: dieser Lauf prueft den
 * BESTAND gegen das Vokabular. Wuerde er die Liste aus demselben Modul
 * ziehen, das sie schreibt, koennte ein stillschweigend eingefuehrter Code
 * niemals auffallen.
 */
const UEBERSPRING_CODES = [
  'LEISTUNGSART_UNBEKANNT', 'BUDGETTYP_UNBEKANNT', 'TARIF_FEHLT',
  'TARIF_NICHT_VERIFIZIERT', 'TARIF_MEHRDEUTIG', 'UNTERSCHRIFT_FEHLT',
  'BUDGETLAGE_UNBEKANNT', 'FEHLER',
]

/** Endzustaende eines Monatsabschlusses (lib/abrechnung/monatsabschluss.ts). */
const CLOSING_ENDZUSTAENDE = ['closed', 'sent']

const ergebnisse = []
function pruefe(id, titel, bestanden, gemessen) {
  ergebnisse.push({ id, bestanden })
  console.log(`\n[${id}] ${bestanden ? 'OK     ' : 'OFFEN  '} ${titel}`)
  console.log(`  ${String(gemessen).split('\n').join('\n  ')}`)
}
function bericht(id, titel, gemessen) {
  console.log(`\n[${id}] BERICHT  ${titel}`)
  console.log(`  ${String(gemessen).split('\n').join('\n  ')}`)
}

/** Lese-Orakel: der Block endet IMMER mit RAISE, die Transaktion rollt zurueck. */
async function orakel(sql) {
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: sql }),
  })
  const text = await res.text()
  let j = null
  try { j = JSON.parse(text) } catch { /* Fehlertexte sind nicht immer JSON */ }
  const msg = j?.message ?? text
  const i = msg.indexOf('KETTE:')
  if (i === -1) return { fehler: `HTTP ${res.status} ${msg.slice(0, 500)}` }
  return { text: msg.slice(i + 6).replace(/\\n/g, '\n').replace(/\\"/g, '"') }
}

const euro = cent => `${((cent ?? 0) / 100).toFixed(2)} EUR`

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' SAMMELRECHNUNGSLAUF + MONATSABSCHLUSS — live gegen Produktion')
console.log(` ${new Date().toISOString()}`)
console.log(' Teil A liest nur. Teil B laeuft in einer Transaktion, die IMMER')
console.log(' zurueckrollt — es entsteht KEINE Rechnung und keine Nummernluecke.')
console.log('═══════════════════════════════════════════════════════════════════')

try {
  // ══ TEIL A — NUR LESEN ════════════════════════════════════════════════

  const { data: laeufe, error: laufFehler } = await admin
    .from('sammelrechnungslaeufe')
    .select('id, period_month, status, gruppen_gesamt, gruppen_erstellt, gruppen_uebersprungen, '
      + 'gruppen_fehlgeschlagen, gruppen_offen, summe_cent, gestartet_am, heartbeat_am, beendet_am, versuch')
    .eq('organization_id', ORG)
  if (laufFehler) throw new Error(`Laeufe nicht lesbar: ${laufFehler.message}`)

  const { data: gruppen, error: gruppenFehler } = await admin
    .from('sammelrechnungslauf_gruppen')
    .select('id, lauf_id, client_id, budget_type, status, code, invoice_id, betrag_cent')
    .eq('organization_id', ORG)
  if (gruppenFehler) throw new Error(`Gruppen nicht lesbar: ${gruppenFehler.message}`)

  bericht('S0', 'Bestand',
    `${(laeufe ?? []).length} Sammellaeufe, ${(gruppen ?? []).length} Gruppenzeilen\n`
    + `Status: ${JSON.stringify(
      (laeufe ?? []).reduce((m, l) => ({ ...m, [l.status]: (m[l.status] ?? 0) + 1 }), {}))}`)

  // ── S1) Ein beendeter Lauf hat keine offenen Gruppen ──────────────────
  //
  // `gruppen_offen > 0` bei beendetem Lauf heisst: der Lauf gilt als fertig,
  // und irgendwo stehen Klienten, die nie abgerechnet wurden. Niemand sucht
  // danach, weil die Uebersicht „abgeschlossen" zeigt.
  const beendet = (laeufe ?? []).filter(l => l.status !== 'laeuft')
  const mitOffenen = beendet.filter(l => (l.gruppen_offen ?? 0) > 0)
  pruefe('S1', 'Kein beendeter Lauf laesst Gruppen offen',
    mitOffenen.length === 0,
    `beendete Laeufe ${beendet.length}, davon mit offenen Gruppen ${mitOffenen.length} (0 erwartet)`
    + (mitOffenen.length ? `\n${mitOffenen.map(l => `${l.period_month} (${l.id}): ${l.gruppen_offen} offen`).join('\n')}` : ''))

  // ── S2) Kopfzahlen und Gruppenzeilen sagen dasselbe ───────────────────
  const abweichungen = []
  for (const l of beendet) {
    const g = (gruppen ?? []).filter(x => x.lauf_id === l.id)
    if (g.length === 0) continue // Lauf ohne Gruppen: S3 behandelt das
    const erstellt = g.filter(x => x.status === 'erstellt').length
    const uebersprungen = g.filter(x => x.status === 'uebersprungen').length
    const fehlgeschlagen = g.filter(x => x.status === 'fehlgeschlagen').length
    const summe = g.filter(x => x.status === 'erstellt')
      .reduce((s, x) => s + (x.betrag_cent ?? 0), 0)
    const teile = []
    if (erstellt !== (l.gruppen_erstellt ?? 0)) teile.push(`erstellt Kopf ${l.gruppen_erstellt} ≠ Zeilen ${erstellt}`)
    if (uebersprungen !== (l.gruppen_uebersprungen ?? 0)) teile.push(`uebersprungen Kopf ${l.gruppen_uebersprungen} ≠ Zeilen ${uebersprungen}`)
    if (fehlgeschlagen !== (l.gruppen_fehlgeschlagen ?? 0)) teile.push(`fehlgeschlagen Kopf ${l.gruppen_fehlgeschlagen} ≠ Zeilen ${fehlgeschlagen}`)
    if (summe !== (l.summe_cent ?? 0)) teile.push(`Summe Kopf ${euro(l.summe_cent)} ≠ Zeilen ${euro(summe)}`)
    if (teile.length) abweichungen.push(`${l.period_month} (${l.id}): ${teile.join(', ')}`)
  }
  pruefe('S2', 'Kopfzahlen des Laufs decken sich mit den Gruppenzeilen',
    abweichungen.length === 0,
    `geprueft ${beendet.length} beendete Laeufe, Abweichungen ${abweichungen.length} (0 erwartet)`
    + (abweichungen.length ? `\n${abweichungen.join('\n')}` : ''))

  // ── S3) Keine Rechnung haengt an zwei Gruppen ─────────────────────────
  //
  // Waere sie es, zaehlte sie in zwei Laeufen mit — und der Umsatz des
  // Monats stuende doppelt in der Auswertung.
  const proRechnung = new Map()
  for (const g of gruppen ?? []) {
    if (!g.invoice_id) continue
    proRechnung.set(g.invoice_id, (proRechnung.get(g.invoice_id) ?? 0) + 1)
  }
  const doppelt = [...proRechnung.entries()].filter(([, n]) => n > 1)
  pruefe('S3', 'Keine Rechnung steht in zwei Gruppenzeilen',
    doppelt.length === 0,
    `Rechnungen mit Gruppenbezug ${proRechnung.size}, davon mehrfach ${doppelt.length} (0 erwartet)`
    + (doppelt.length ? `\n${doppelt.map(([id, n]) => `${id}: ${n}×`).join('\n')}` : ''))

  // ── S4) Kein verwaister Lauf blockiert den Monat ──────────────────────
  //
  // Ein Lauf auf `laeuft` mit altem Lebenszeichen sperrt jeden weiteren
  // Versuch fuer denselben Monat (`SAMMELRECHNUNG_LAEUFT`). Die RPC
  // uebernimmt ihn nach 15 Minuten — bis dahin ist der Monat zu.
  const jetzt = Date.now()
  const laufend = (laeufe ?? []).filter(l => l.status === 'laeuft')
  const verwaist = laufend.filter(l => {
    const hb = l.heartbeat_am ? Date.parse(l.heartbeat_am) : 0
    return jetzt - hb > 15 * 60 * 1000
  })
  pruefe('S4', 'Kein Lauf steht ohne frisches Lebenszeichen auf „laeuft"',
    verwaist.length === 0,
    `laufend ${laufend.length}, davon aelter als 15 Minuten ${verwaist.length} (0 erwartet)`
    + (verwaist.length ? `\n${verwaist.map(l => `${l.period_month}: letztes Lebenszeichen ${l.heartbeat_am}`).join('\n')}` : ''))

  // ── S5) Jede uebersprungene Gruppe nennt einen bekannten Grund ────────
  //
  // Der Code IST die Begruendung, warum eine Familie diesen Monat keine
  // Rechnung bekommt. Ein leerer oder unbekannter Code heisst: niemand
  // weiss, warum nicht abgerechnet wurde.
  const uebersprungen = (gruppen ?? []).filter(g => g.status === 'uebersprungen')
  const ohneCode = uebersprungen.filter(g => !g.code || !UEBERSPRING_CODES.includes(g.code))
  pruefe('S5', 'Jede uebersprungene Gruppe traegt einen bekannten Code',
    ohneCode.length === 0,
    `uebersprungen ${uebersprungen.length}, ohne bekannten Code ${ohneCode.length} (0 erwartet)`
    + (ohneCode.length ? `\n${ohneCode.map(g => `${g.client_id}/${g.budget_type}: „${g.code ?? 'leer'}"`).join('\n')}` : ''))

  // ── S6) Der Nummernkreis ist lueckenlos und eindeutig ─────────────────
  const { data: rechnungen, error: reFehler } = await admin
    .from('invoices')
    .select('id, invoice_number, invoice_number_formatted, created_at')
    .eq('organization_id', ORG)
  if (reFehler) throw new Error(`Rechnungen nicht lesbar: ${reFehler.message}`)

  const nummern = (rechnungen ?? []).map(r => r.invoice_number).filter(Boolean)
  const mehrfach = [...nummern.reduce((m, n) => m.set(n, (m.get(n) ?? 0) + 1), new Map())]
    .filter(([, n]) => n > 1)
  pruefe('S6', 'Keine Rechnungsnummer ist doppelt vergeben',
    mehrfach.length === 0,
    `Rechnungen ${(rechnungen ?? []).length}, doppelte Nummern ${mehrfach.length} (0 erwartet)`
    + (mehrfach.length ? `\n${mehrfach.map(([n, c]) => `${n}: ${c}×`).join('\n')}` : ''))

  // ── S7) Der Zaehler steht nicht unter der hoechsten vergebenen Nummer ─
  //
  // Stuende er darunter, vergaebe der naechste Lauf eine Nummer, die es
  // schon gibt — und der Unique-Index liesse die Rechnung scheitern,
  // mitten in einem Monatslauf.
  const { data: sequenzen, error: seqFehler } = await admin
    .from('billing_number_sequences')
    .select('prefix, year, last_number')
    .eq('organization_id', ORG)
  if (seqFehler) throw new Error(`Nummernkreis nicht lesbar: ${seqFehler.message}`)

  const zuNiedrig = []
  for (const s of sequenzen ?? []) {
    const muster = new RegExp(`^${s.prefix}-${s.year}-(\\d+)$`)
    const hoechste = (rechnungen ?? [])
      .map(r => String(r.invoice_number_formatted ?? r.invoice_number ?? '').match(muster))
      .filter(Boolean)
      .reduce((max, m) => Math.max(max, Number(m[1])), 0)
    if (hoechste > (s.last_number ?? 0)) {
      zuNiedrig.push(`${s.prefix}-${s.year}: Zaehler ${s.last_number}, hoechste vergeben ${hoechste}`)
    }
  }
  pruefe('S7', 'Der Nummernzaehler liegt nicht unter der hoechsten vergebenen Nummer',
    zuNiedrig.length === 0,
    `Nummernkreise ${(sequenzen ?? []).length}, zu niedrig ${zuNiedrig.length} (0 erwartet)`
    + (zuNiedrig.length ? `\n${zuNiedrig.join('\n')}` : ''))

  // ── S8) Ein abgeschlossener Monatsabschluss traegt seinen Zeitpunkt ───
  //
  // `closed`/`sent` ohne `closed_at` heisst: der Endzustand ist gesetzt,
  // aber wann und durch wen steht nirgends. Genau so sieht es aus, wenn
  // ein Vorschaulauf einen Endzustand ueberschrieben hat.
  const { data: closings, error: closeFehler } = await admin
    .from('monthly_closings')
    .select('id, client_id, year, month, status, closed_at, finalized_at, total_records')
    .eq('organization_id', ORG)
  if (closeFehler) throw new Error(`Monatsabschluesse nicht lesbar: ${closeFehler.message}`)

  const abgeschlossen = (closings ?? []).filter(c => CLOSING_ENDZUSTAENDE.includes(c.status))
  const ohneZeitpunkt = abgeschlossen.filter(c => !c.closed_at && !c.finalized_at)
  pruefe('S8', 'Jeder abgeschlossene Monatsabschluss traegt einen Abschlusszeitpunkt',
    ohneZeitpunkt.length === 0,
    `Abschluesse ${(closings ?? []).length}, davon abgeschlossen ${abgeschlossen.length}, `
    + `ohne Zeitpunkt ${ohneZeitpunkt.length} (0 erwartet)`
    + (ohneZeitpunkt.length ? `\n${ohneZeitpunkt.map(c => `${c.client_id} ${c.year}-${c.month}`).join('\n')}` : ''))

  // ── S9) Ein Monat je Klient genau einmal ──────────────────────────────
  const proMonat = new Map()
  for (const c of closings ?? []) {
    const k = `${c.client_id}|${c.year}-${c.month}`
    proMonat.set(k, (proMonat.get(k) ?? 0) + 1)
  }
  const doppelteMonate = [...proMonat.entries()].filter(([, n]) => n > 1)
  pruefe('S9', 'Kein Klient hat denselben Monat zweimal abgeschlossen',
    doppelteMonate.length === 0,
    `Monats-Klient-Paare ${proMonat.size}, doppelt ${doppelteMonate.length} (0 erwartet)`
    + (doppelteMonate.length ? `\n${doppelteMonate.map(([k, n]) => `${k}: ${n}×`).join('\n')}` : ''))

  // ══ TEIL B — SCHREIBEND, ABER OHNE FOLGEN ═════════════════════════════

  // ── S10) Zwei Laeufe im selben Monat: der zweite wird abgewiesen ──────
  //
  // Der teuerste Fehler dieses Wegs. Zweimal derselbe Monat heisst zwei
  // Rechnungen an dieselbe Familie — und die zweite faellt erst auf, wenn
  // jemand anruft.
  const monatProbe = '2099-01'
  const b = await orakel(`
DO $$
DECLARE
  v_org       uuid := '${ORG}';
  v_actor     uuid;
  v_erste     uuid;
  v_zweite    uuid;
  v_meldung   text := '';
  b           text := '';
BEGIN
  SELECT id INTO v_actor FROM public.profiles WHERE role IN ('admin','superadmin') LIMIT 1;

  SELECT lauf_id INTO v_erste
    FROM public.sammelrechnung_lauf_beanspruchen(v_org, '${monatProbe}', v_actor);
  b := b || format('OK|erste_beanspruchung|Lauf %s angelegt', left(v_erste::text, 8)) || chr(10);

  BEGIN
    SELECT lauf_id INTO v_zweite
      FROM public.sammelrechnung_lauf_beanspruchen(v_org, '${monatProbe}', v_actor);
    b := b || format('ROT|zweite_beanspruchung|ging DURCH (Lauf %s) — derselbe Monat waere zweimal abgerechnet worden', left(v_zweite::text, 8)) || chr(10);
  EXCEPTION WHEN OTHERS THEN
    v_meldung := SQLERRM;
    IF v_meldung LIKE 'SAMMELRECHNUNG_LAEUFT%' THEN
      b := b || format('OK|zweite_beanspruchung|abgewiesen: %s', left(v_meldung, 80)) || chr(10);
    ELSE
      b := b || format('ROT|zweite_beanspruchung|abgewiesen, aber mit fremdem Fehler: %s', left(v_meldung, 120)) || chr(10);
    END IF;
  END;

  -- Ein ungueltiger Monat darf gar nicht erst einen Lauf anlegen.
  BEGIN
    PERFORM public.sammelrechnung_lauf_beanspruchen(v_org, '2099-13', v_actor);
    b := b || 'ROT|monatspruefung|„2099-13" wurde angenommen' || chr(10);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'SAMMELRECHNUNG_MONAT_UNGUELTIG%' THEN
      b := b || 'OK|monatspruefung|ungueltiger Monat abgewiesen' || chr(10);
    ELSE
      b := b || format('ROT|monatspruefung|fremder Fehler: %s', left(SQLERRM, 120)) || chr(10);
    END IF;
  END;

  -- Ohne Mandant kein Lauf: der Mandantenfilter ist hier die einzige Grenze.
  BEGIN
    PERFORM public.sammelrechnung_lauf_beanspruchen(NULL, '${monatProbe}', v_actor);
    b := b || 'ROT|mandantenpflicht|Lauf ohne Mandant angelegt' || chr(10);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'SAMMELRECHNUNG_OHNE_MANDANT%' THEN
      b := b || 'OK|mandantenpflicht|Lauf ohne Mandant abgewiesen' || chr(10);
    ELSE
      b := b || format('ROT|mandantenpflicht|fremder Fehler: %s', left(SQLERRM, 120)) || chr(10);
    END IF;
  END;

  RAISE EXCEPTION 'KETTE:%', b;
END $$;`)

  if (b.fehler) {
    pruefe('S10', 'Doppellauf-Schutz des Sammelrechnungslaufs', false, `Orakel-Fehler: ${b.fehler}`)
  } else {
    for (const zeile of b.text.split('\n').filter(Boolean)) {
      const [ampel, name, detail] = zeile.split('|')
      pruefe(`S10·${name}`, detail ?? name, ampel === 'OK', detail ?? '')
    }
  }

  // ── S12) Das Vokabular im Modul deckt sich mit dem hier gepruefen ────
  //
  // S5 misst den Bestand gegen die Liste OBEN in dieser Datei. Wird im
  // Modul ein Code ergaenzt und hier nicht, prueft S5 ab dann gegen ein
  // veraltetes Vokabular und meldet echte Gruppen als „unbekannt" — oder,
  // schlimmer, es faellt gar nicht auf. Deshalb hier der Abgleich.
  const nurImModul = CODES_AUS_MODUL.filter(c => !UEBERSPRING_CODES.includes(c))
  const nurHier = UEBERSPRING_CODES.filter(c => !CODES_AUS_MODUL.includes(c))
  pruefe('S12', 'Das Vokabular dieses Laufs deckt sich mit dem Modul',
    nurImModul.length === 0 && nurHier.length === 0,
    `Codes im Modul ${CODES_AUS_MODUL.length}, hier ${UEBERSPRING_CODES.length}\n`
    + `nur im Modul: ${nurImModul.join(', ') || '—'}\n`
    + `nur hier: ${nurHier.join(', ') || '—'}`)

  // ── S13) Trockenlauf ueber alle Monate mit offenen Nachweisen ────────
  //
  // Die echte Engine gegen den echten Bestand, `dryRun: true`. Sie kehrt vor
  // `createInvoiceDraft` um und schreibt auch kein Protokoll — geprueft wird
  // das in S14, nicht geglaubt.
  //
  // Nicht „der letzte Monat", sondern JEDER Monat, in dem unterschriebene
  // Nachweise ohne Rechnung liegen. Ein fester Monat haette genau die
  // Monate uebersehen, um die es geht: die alten.
  const { data: offeneNachweise, error: nwFehler } = await admin
    .from('service_records')
    .select('id, date, status, client_id, budget_type, proof_status, signature_hash')
    .eq('organization_id', ORG)
    .in('status', ['signed', 'complete'])
  if (nwFehler) throw new Error(`Nachweise nicht lesbar: ${nwFehler.message}`)

  // Dieselbe Regel wie `istUnterschrieben` in lib/billing/core/sammelrechnung.ts
  // — hier absichtlich nachgebildet und nicht importiert: geprueft wird der
  // BESTAND gegen die Regel, nicht die Regel gegen sich selbst.
  const belegt = r => r.proof_status === 'UNTERSCHRIEBEN' || r.signature_hash != null
  const ohneBeleg = (offeneNachweise ?? []).filter(r => !belegt(r))

  const monate = [...new Set((offeneNachweise ?? []).map(r => String(r.date).slice(0, 7)))].sort()

  const vorher = {
    laeufe: (laeufe ?? []).length,
    gruppen: (gruppen ?? []).length,
    rechnungen: (rechnungen ?? []).length,
  }

  const monatsZeilen = []
  /** Jede Nachweis-Kennung, die in irgendeinem Trockenlauf auftauchte. */
  const beruecksichtigt = new Set()

  for (const monat of monate) {
    const trocken = await fuehreSammelrechnungslaufAus(admin, {
      organizationId: ORG,
      periodMonth: monat,
      actorId: null,
      dryRun: true,
    })
    for (const g of trocken.vorschau ?? []) for (const id of g.recordIds ?? []) beruecksichtigt.add(id)
    for (const u of trocken.uebersprungen ?? []) for (const id of u.recordIds ?? []) beruecksichtigt.add(id)

    const gruende = (trocken.uebersprungen ?? []).reduce((m, u) => {
      const k = u.code ?? 'OHNE_CODE'
      return { ...m, [k]: (m[k] ?? 0) + 1 }
    }, {})
    monatsZeilen.push(
      `${monat}: abrechenbar ${trocken.vorschau?.length ?? 0}, uebersprungen ${trocken.uebersprungen?.length ?? 0}`
      + (Object.keys(gruende).length ? ` (${Object.entries(gruende).map(([k, n]) => `${k}×${n}`).join(', ')})` : ''))
  }

  bericht('S13', `Trockenlauf ueber ${monate.length} Monat(e) mit offenen Nachweisen`,
    `${(offeneNachweise ?? []).length} Nachweise auf signed/complete ohne Rechnung, `
    + `davon OHNE Unterschriftsbeleg ${ohneBeleg.length}\n`
    + (monatsZeilen.join('\n') || 'keine Monate mit offenen Nachweisen'))

  // ── S13c) Der Statuswert „signed" deckt sich mit dem Beleg ───────────
  //
  // `status='signed'` ist ein Wort, `istUnterschrieben` verlangt einen
  // BELEG — proof_status='UNTERSCHRIEBEN' oder einen Signatur-Hash. Fallen
  // die auseinander, sieht die Nachweisliste unterschrieben aus, und der
  // Monatslauf ueberspringt genau diese Nachweise mit UNTERSCHRIFT_FEHLT.
  // Die Leistung ist erbracht, die Rechnung kommt nie, und die beiden
  // Ansichten widersprechen sich, ohne dass eine von beiden luegt.
  const signiertOhneBeleg = (offeneNachweise ?? []).filter(r => r.status === 'signed' && !belegt(r))
  pruefe('S13c', 'Jeder Nachweis auf „signed" traegt auch einen Unterschriftsbeleg',
    signiertOhneBeleg.length === 0,
    `auf signed ${(offeneNachweise ?? []).filter(r => r.status === 'signed').length}, `
    + `davon ohne Beleg ${signiertOhneBeleg.length} (0 erwartet)`
    + (signiertOhneBeleg.length
      ? `\nDiese Nachweise sind fuer den Monatslauf nicht abrechenbar (UNTERSCHRIFT_FEHLT):\n`
        + signiertOhneBeleg.slice(0, 10)
          .map(r => `  ${r.date} Klient ${String(r.client_id).slice(0, 8)} proof_status=${r.proof_status ?? 'NULL'} hash=${r.signature_hash ? 'ja' : 'nein'}`)
          .join('\n')
        + (signiertOhneBeleg.length > 10 ? `\n  … und ${signiertOhneBeleg.length - 10} weitere` : '')
      : ''))

  // ── S13b) Kein offener Nachweis faellt aus der Betrachtung ────────────
  //
  // Der eigentliche Punkt. Ein unterschriebener Nachweis muss im
  // Trockenlauf entweder als abrechenbar auftauchen ODER mit einem Grund
  // uebersprungen werden. Taucht er in KEINEM von beidem auf, rechnet ihn
  // niemand ab und niemand weiss, warum — die Leistung ist erbracht, das
  // Geld bleibt aus, und keine Liste zeigt es an.
  const unsichtbar = (offeneNachweise ?? []).filter(r => !beruecksichtigt.has(r.id))
  pruefe('S13b', 'Jeder offene Nachweis taucht im Trockenlauf auf — abrechenbar oder mit Grund',
    unsichtbar.length === 0,
    `offene Nachweise ${(offeneNachweise ?? []).length}, in keinem Trockenlauf ${unsichtbar.length} (0 erwartet)`
    + (unsichtbar.length
      ? `\n${unsichtbar.slice(0, 10).map(r => `${r.date} ${r.status} Klient ${String(r.client_id).slice(0, 8)} budget=${r.budget_type ?? '—'}`).join('\n')}`
        + (unsichtbar.length > 10 ? `\n… und ${unsichtbar.length - 10} weitere` : '')
      : ''))

  // ── S14) Der Trockenlauf hat wirklich nichts geschrieben ─────────────
  //
  // Das ist die Pruefung, die den Trockenlauf ueberhaupt benutzbar macht.
  // „dryRun steht im Code" ist keine Zusage; gezaehlt wird vorher und
  // nachher.
  const [nachLaeufe, nachGruppen, nachRechnungen] = await Promise.all([
    admin.from('sammelrechnungslaeufe').select('id').eq('organization_id', ORG),
    admin.from('sammelrechnungslauf_gruppen').select('id').eq('organization_id', ORG),
    admin.from('invoices').select('id').eq('organization_id', ORG),
  ])
  const nachher2 = {
    laeufe: (nachLaeufe.data ?? []).length,
    gruppen: (nachGruppen.data ?? []).length,
    rechnungen: (nachRechnungen.data ?? []).length,
  }
  pruefe('S14', 'Der Trockenlauf hat nichts geschrieben',
    nachher2.laeufe === vorher.laeufe
      && nachher2.gruppen === vorher.gruppen
      && nachher2.rechnungen === vorher.rechnungen,
    `Laeufe ${vorher.laeufe} → ${nachher2.laeufe} | Gruppen ${vorher.gruppen} → ${nachher2.gruppen} | `
    + `Rechnungen ${vorher.rechnungen} → ${nachher2.rechnungen} (jeweils unveraendert erwartet)`)

  // ── S11) Teil B hat nichts hinterlassen ───────────────────────────────
  const { data: nachher } = await admin
    .from('sammelrechnungslaeufe')
    .select('id, period_month').eq('organization_id', ORG)
  const reste = (nachher ?? []).filter(l => String(l.period_month).startsWith('2099-'))
  pruefe('S11', 'Teil B hat keinen Pruef-Lauf hinterlassen',
    reste.length === 0,
    `Laeufe im Pruefmonat 2099-* ${reste.length} (0 erwartet)\n`
    + `Laeufe im Mandanten: ${(nachher ?? []).length} (vorher ${(laeufe ?? []).length})`)
} catch (err) {
  console.error(`\n❌ ABBRUCH: ${err instanceof Error ? err.message : String(err)}`)
  ergebnisse.push({ id: 'ABBRUCH', bestanden: false })
}

const offen = ergebnisse.filter(e => !e.bestanden)
console.log('\n═══════════════════════════════════════════════════════════════════')
console.log(` ${ergebnisse.length - offen.length} von ${ergebnisse.length} Pruefungen bestanden.`)
if (offen.length > 0) console.log(` OFFEN: ${offen.map(e => e.id).join(', ')}`)
console.log('═══════════════════════════════════════════════════════════════════')
process.exit(offen.length > 0 ? 1 : 0)
