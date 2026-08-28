#!/usr/bin/env node
/**
 * Track 12 — Live-Tatsachen zu Abrechnung und Finanzfluessen.
 *
 * Prueft NUR LESEND gegen die Produktionsdatenbank. Das Lese-Orakel
 * (`public._run_sql` + `RAISE EXCEPTION`) rollt seine Transaktion immer
 * zurueck — es kann per Konstruktion nichts schreiben und kein DDL
 * ausfuehren.
 *
 * Geprueft werden die Tatsachen, auf denen die Befunde des Tracks stehen:
 *
 *   A) Ist die Stundensatz-Sperre aus Track 9 wirklich live? Nicht die
 *      Migrationsdatei zaehlt, sondern has_column_privilege.
 *   B) Welche Geldtabellen kann `authenticated` ueberhaupt schreiben?
 *      Wo das der Fall ist, ist RLS die einzige Grenze.
 *   C) Kommt `anon` an die Geldtabellen? (Erwartet: nein.)
 *   D) Hebt eine FOR-ALL-Policy die engeren Policies auf `service_records`
 *      auf? Das ist der Weg, auf dem B2 laeuft.
 *   E) Waehlt der Obergrenzen-Trigger fuer JEDE §45b-Zeitstunden-
 *      Leistungsart dieselbe Grenze? Dann kann er 30 und 25 EUR nicht
 *      auseinanderhalten.
 *   F) Gibt es negative Einsatzdauern — und einen Riegel dagegen?
 *   G) Wie steht es um den Unterschriftsbeleg im Bestand?
 *
 * Aufruf:  npm run verify:abrechnung
 * Exit 0 = alle Pruefungen bestanden, Exit 1 = mindestens eine offen.
 */

import { apiHeaders, envWert, publishableKey, secretKey } from './lib/supabase-keys.mjs'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

/** Lese-Orakel: Ergebnis kommt ueber die RAISE-Meldung zurueck. */
export async function orakel(sql) {
  const wrapped =
    `DO $ORK$ DECLARE r text; BEGIN `
    + `SELECT coalesce(string_agg(z::text, chr(10)), '(leer)') INTO r FROM (${sql}) t(z); `
    + `RAISE EXCEPTION 'ORAKEL:%', r; END $ORK$;`
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: wrapped }),
  })
  const text = await res.text()
  const treffer = text.match(/ORAKEL:([\s\S]*?)","/)
    || text.match(/ORAKEL:([\s\S]*?)"\}/)
    || text.match(/ORAKEL:([\s\S]*?)"/)
  if (treffer) return treffer[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
  return `(kein Treffer) HTTP ${res.status} ${text.slice(0, 500)}`
}

/**
 * Bildet die Auswahl von `enforce_tariff_obergrenze` NACH — Stand nach
 * Migration 20261017000002, also inklusive Angebotstyp.
 *
 * WARUM DAS HIER NACHGEZOGEN WURDE (28.08.2026): bis hierher stand in
 * dieser Konstante die Auswahl VOR der Migration. Sie hat damit eine Frage
 * beantwortet, die der Trigger gar nicht mehr stellt — und E1 meldete
 * `hauswirtschaft=3000`, also OFFEN, obwohl die Migration live war. Der
 * Live-Quelltext aus pg_proc ist gegen das Repo-Artefakt geprueft und bis
 * auf SQL-Kommentare identisch. Eine Pruefung, deren Abfrage sich vom
 * geprueften Gegenstand wegbewegt, meldet nicht „unsicher", sondern
 * falsch — hier zu streng, anderswo waere es zu milde.
 *
 * Deshalb steht daneben E2: die Nachbildung allein kann nie beweisen,
 * dass sie noch die des Triggers IST. E2 liest den Trigger-Quelltext
 * selbst und schlaegt an, sobald er sich wieder unterscheidet.
 */
const TRIGGER_AUSWAHL = (leistungsart) =>
  "select o.obergrenze_cent::text "
  + "from public.billing_gesetzliche_obergrenzen o "
  + "where o.ist_aktiv and o.bestaetigt = TRUE and o.rechtsgrundlage = '§45b SGB XI' "
  + "and o.verguetungsart = 'zeit_stunde' "
  + "and (o.bundesland is null or o.bundesland = 'hessen') "
  + `and (o.leistungsart is null or o.leistungsart = '${leistungsart}') `
  + "and o.gueltig_ab <= current_date and (o.gueltig_bis is null or o.gueltig_bis >= current_date) "
  // DIE Bedingung aus 20261017000002 — ohne sie sind die beiden hessischen
  // Zeilen fuer den Filter gleichwertig und LIMIT 1 entscheidet der Planer.
  + `and (public.angebotstyp_von_leistungsart('${leistungsart}') is null `
  + `     or o.angebotstyp is null `
  + `     or o.angebotstyp = public.angebotstyp_von_leistungsart('${leistungsart}')) `
  + "order by (o.bundesland is not null) desc, (o.leistungsart is not null) desc, "
  + "(o.angebotstyp is not null) desc, "
  + `case when public.angebotstyp_von_leistungsart('${leistungsart}') is null `
  + "     then o.obergrenze_cent else 0 end desc, "
  + "o.gueltig_ab desc limit 1"

/**
 * Jede Pruefung liefert { ok, meldung }. `erwartung` beschreibt, was gruen
 * heisst — damit im Protokoll steht, WOGEGEN geprueft wurde, und nicht nur
 * das Ergebnis.
 */
const PRUEFUNGEN = [
  {
    id: 'A1',
    titel: 'Track-9-Sperre: authenticated darf angels.hourly_rate NICHT schreiben',
    erwartung: 'hourly_rate/qualification/is_certified/is_45b_capable = false, is_online = true',
    sql: "select c||'='||has_column_privilege('authenticated','public.angels',c,'UPDATE')::text "
      + "from unnest(array['hourly_rate','qualification','is_certified','is_45b_capable','is_online']) c",
    pruefe: (t) =>
      t.includes('hourly_rate=false') && t.includes('qualification=false')
      && t.includes('is_certified=false') && t.includes('is_45b_capable=false')
      && t.includes('is_online=true'),
  },
  {
    id: 'A2',
    titel: 'angels: kein table-weites UPDATE fuer authenticated',
    erwartung: 'false — sonst waere der Spalten-GRANT wirkungslos',
    sql: "select has_table_privilege('authenticated','public.angels','UPDATE')::text",
    pruefe: (t) => t.trim() === 'false',
  },
  {
    id: 'B1',
    titel: 'Geldtabellen: wo ist RLS die einzige Grenze?',
    erwartung: 'nur Bericht — jede Zeile mit UPDATE=true haengt allein an ihren Policies',
    sql: "select t||' SELECT='||has_table_privilege('authenticated',t,'SELECT')::text"
      + "||' INSERT='||has_table_privilege('authenticated',t,'INSERT')::text"
      + "||' UPDATE='||has_table_privilege('authenticated',t,'UPDATE')::text "
      + "from unnest(array['public.invoices','public.invoice_items','public.payments',"
      + "'public.payment_allocations','public.client_budgets','public.billing_tariffs',"
      + "'public.leistungspreise','public.service_records']) t",
    pruefe: () => true,
    nurBericht: true,
  },
  {
    id: 'C1',
    titel: 'anon kommt an keine Geldtabelle',
    erwartung: 'jede Abfrage 401/403 — geprueft mit dem oeffentlichen Schluessel',
    anonTest: [
      'client_budgets', 'service_records', 'payments', 'payment_allocations',
      'invoices', 'invoice_items', 'billing_tariffs', 'leistungspreise', 'angels',
    ],
  },
  {
    id: 'D1',
    titel: 'service_records: hebt eine FOR-ALL-Policy die engeren Policies auf?',
    erwartung: "keine Policy mit cmd='ALL', die auf eigene_caregiver_ids() zeigt "
      + '(Migration 20261017000000 entfernt sr_engel_own)',
    sql: "select policyname||' | '||cmd from pg_policies where schemaname='public' "
      + "and tablename='service_records' and cmd='ALL' and qual ilike '%eigene_caregiver_ids%'",
    pruefe: (t) => t.trim() === '(leer)',
  },
  {
    id: 'E1',
    titel: 'Obergrenze: trennt der Trigger Betreuung (30 EUR) von Entlastung (25 EUR)?',
    erwartung: 'betreuung_45a → 3000 UND demenzbetreuung → 3000 UND '
      + 'hauswirtschaft → 2500 UND einkaufsservice → 2500 '
      + '(Migration 20261017000002, live seit 28.08.2026)',
    sql: `select 'betreuung_45a='||coalesce((${TRIGGER_AUSWAHL('betreuung_45a')}),'-')`
      + `||' demenzbetreuung='||coalesce((${TRIGGER_AUSWAHL('demenzbetreuung')}),'-')`
      + `||' hauswirtschaft='||coalesce((${TRIGGER_AUSWAHL('hauswirtschaft')}),'-')`
      + `||' einkaufsservice='||coalesce((${TRIGGER_AUSWAHL('einkaufsservice')}),'-')`,
    pruefe: (t) =>
      t.includes('betreuung_45a=3000') && t.includes('demenzbetreuung=3000')
      && t.includes('hauswirtschaft=2500') && t.includes('einkaufsservice=2500'),
  },
  {
    id: 'E2',
    titel: 'Obergrenze: faehrt der Trigger wirklich die Auswahl, die E1 nachbildet?',
    erwartung: 'enforce_tariff_obergrenze ruft angebotstyp_von_leistungsart auf, '
      + 'und die Funktion existiert — sonst prueft E1 eine Abfrage, die der '
      + 'Trigger gar nicht stellt (genau dieser Drift liess E1 die bereits '
      + 'angewendete Migration als offen melden)',
    sql: "select coalesce((select case when prosrc like '%angebotstyp_von_leistungsart%' "
      + "then 'TRIGGER_ZIEHT_ANGEBOTSTYP' else 'TRIGGER_ALTE_FASSUNG' end "
      + "from pg_proc where proname='enforce_tariff_obergrenze'), 'TRIGGER_FEHLT')"
      + "||' '||coalesce((select 'FUNKTION_DA' from pg_proc "
      + "where proname='angebotstyp_von_leistungsart' limit 1), 'FUNKTION_FEHLT')",
    pruefe: (t) => t.includes('TRIGGER_ZIEHT_ANGEBOTSTYP') && t.includes('FUNKTION_DA'),
  },
  {
    id: 'R1',
    titel: 'Wegepauschale: sagen Code und Datenbank dasselbe?',
    erwartung:
      'kein §45b-Tarif auf tarif_status=verified fuer eine Leistungsart, die '
      + 'lib/billing/obergrenzen.ts in OHNE_PFLUV_GRUNDLAGE fuehrt. Steht hier '
      + 'etwas, widersprechen sich zwei Stellen im System — das ist eine '
      + 'RECHTLICHE Frage (Restposten R1 aus Track 12) und wird bewusst NICHT '
      + 'im Code entschieden, sondern bei jedem Lauf benannt',
    // Die Liste steht bewusst hier UND in obergrenzen.ts: das Skript kann
    // kein TypeScript importieren. Weicht eine der beiden ab, faellt es
    // ueber den Test in __tests__/billing auf, der beide gegeneinander haelt.
    sql: "select leistungsart || ' | ' || rechtsgrundlage || ' | ' || tarif_status "
      + "|| ' | ' || preis_cent::text || ' Cent' "
      + "from public.billing_tariffs "
      + "where leistungsart in ('wegepauschale') "
      + "and rechtsgrundlage <> 'privat' and ist_aktiv and tarif_status = 'verified' "
      + "order by 1",
    pruefe: () => true,
    // BERICHT, nicht Sperre: eine dauerhaft rote Pruefung, an der niemand
    // etwas aendern DARF, wird nach zwei Wochen ueberlesen — und nimmt die
    // echten roten Zeilen daneben mit.
    nurBericht: true,
  },
  {
    id: 'F1',
    titel: 'Einsatzdauer: gibt es negative Dauern im Bestand?',
    erwartung: '0 — eine negative Dauer erzeugt eine Rechnungsposition, die Geld abzieht',
    sql: "select count(*)::text from service_records where end_time < start_time",
    pruefe: (t) => t.trim() === '0',
  },
  {
    id: 'F2',
    titel: 'Einsatzdauer: sperrt ein CHECK das Ende vor dem Beginn?',
    erwartung: 'service_records_zeitfenster_gueltig vorhanden '
      + '(Migration 20261017000000; bis dahin haelt nur der Anwendungscode)',
    sql: "select conname from pg_constraint where conrelid='public.service_records'::regclass "
      + "and contype='c' and conname='service_records_zeitfenster_gueltig'",
    pruefe: (t) => t.includes('service_records_zeitfenster_gueltig'),
  },
  {
    id: 'G1',
    titel: 'Unterschriftsbeleg: Nachweise, die als unterschrieben gelten, ohne Beleg',
    erwartung: '0 — sonst ist ein Nachweis abrechenbar, den niemand unterschrieben hat',
    sql: "select count(*)::text from service_records "
      + "where proof_status in ('UNTERSCHRIEBEN','ABGERECHNET') "
      + "and (signature_hash is null or client_signed_at is null) "
      + "and coalesce(btrim(client_signature),'') in ('','false')",
    pruefe: (t) => t.trim() === '0',
  },
  {
    id: 'G2',
    titel: 'Beleg-Pflicht an der Datenbank: Trigger vorhanden?',
    erwartung: 'trg_a_unterschrift_beleg (Migration 20261017000000)',
    sql: "select tgname from pg_trigger where tgrelid='public.service_records'::regclass "
      + "and not tgisinternal and tgname='trg_a_unterschrift_beleg'",
    pruefe: (t) => t.includes('trg_a_unterschrift_beleg'),
  },
  {
    id: 'G3',
    titel: 'Manipulationsschutz: wie viele Nachweise sind gesperrt (is_locked)?',
    erwartung: 'nur Bericht — is_locked entsteht ausschliesslich mit client_signed_at',
    sql: "select 'gesamt='||count(*)::text||' gesperrt='||count(*) filter (where is_locked)::text"
      + "||' mit_hash='||count(*) filter (where signature_hash is not null)::text"
      + "||' abgerechnet='||count(*) filter (where status='invoiced')::text from service_records",
    pruefe: () => true,
    nurBericht: true,
  },
]

async function anonPruefung(tabellen) {
  const ANON = publishableKey()
  if (!ANON) return { ok: false, text: 'kein publishable/anon key gefunden — nicht geprueft' }
  const zeilen = []
  let offen = 0
  for (const t of tabellen) {
    const res = await fetch(`${URL_BASIS}/rest/v1/${t}?select=*&limit=1`, { headers: apiHeaders(ANON) })
    const erlaubt = res.status === 200 || res.status === 206
    if (erlaubt) offen++
    zeilen.push(`${t.padEnd(22)} HTTP ${res.status}${erlaubt ? '  ← LESBAR' : ''}`)
  }
  return { ok: offen === 0, text: zeilen.join('\n') }
}

async function main() {
  console.log('Track 12 — Abrechnung & Finanzfluesse: Live-Pruefung (nur lesend)\n')

  let offen = 0
  let bericht = 0

  for (const p of PRUEFUNGEN) {
    let ergebnis
    let ok

    if (p.anonTest) {
      const a = await anonPruefung(p.anonTest)
      ergebnis = a.text
      ok = a.ok
    } else {
      ergebnis = await orakel(p.sql)
      ok = ergebnis.startsWith('(kein Treffer)') ? false : p.pruefe(ergebnis)
    }

    const marke = p.nurBericht ? 'BERICHT' : ok ? 'OK     ' : 'OFFEN  '
    if (p.nurBericht) bericht++
    else if (!ok) offen++

    console.log(`[${marke}] ${p.id}  ${p.titel}`)
    if (!p.nurBericht) console.log(`          erwartet: ${p.erwartung}`)
    for (const zeile of ergebnis.split('\n')) console.log(`          ${zeile}`)
    console.log()
  }

  const gepruefte = PRUEFUNGEN.length - bericht
  console.log(`${gepruefte - offen} von ${gepruefte} Pruefungen bestanden, ${bericht} reine Berichte.`)
  if (offen > 0) {
    console.log(
      '\nBEIDE Migrationen dieses Tracks sind angewendet (nachgemessen 28.08.2026):\n'
      + '20261017000000 ueber D1/F2/G2, 20261017000002 ueber E1/E2 — der Live-\n'
      + 'Quelltext aus pg_proc wurde gegen das Repo-Artefakt gehalten und ist bis\n'
      + 'auf SQL-Kommentare identisch. Ein offener Punkt ist hier deshalb ab jetzt\n'
      + 'ein echter Befund und kein Wartestand.',
    )
  }
  process.exit(offen === 0 ? 0 : 1)
}

const direktAufgerufen = process.argv[1] && process.argv[1].endsWith('verify-abrechnung-live.mjs')
if (direktAufgerufen) main()
