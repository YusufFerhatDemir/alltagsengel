#!/usr/bin/env node
/**
 * OFFENE POSTEN → ZAHLUNGSEINGANG → MAHNWESEN, live gegen Produktion.
 *
 * ── WAS DIESER LAUF NICHT TUT ─────────────────────────────────────────────
 *
 * Er erzeugt KEINE Rechnung, KEINE Mahnung, KEINE Zahlung, und er
 * verschickt nichts. Zwei getrennte Gruende, warum das hier strenger
 * gehandhabt wird als in den anderen Ketten:
 *
 *   1. Rechnungsnummern kommen aus `billing_number_sequences`. Eine
 *      angelegte und wieder geloeschte Pruefrechnung hinterliesse eine
 *      LUECKE im Nummernkreis — ein Buchhaltungsmangel, den kein
 *      Aufraeumen wieder heilt.
 *   2. Eine Mahnung ist eine Aussage nach aussen. Selbst wenn der Versand
 *      hinter ENV-Schaltern liegt, wird hier nichts in eine
 *      Versandwarteschlange gestellt.
 *
 * Der Lauf ist deshalb in zwei Teile geschnitten:
 *
 *   TEIL A — NUR LESEN. Die Fachmodule (OPOS-Manager, Mahn-Sicherheitstor)
 *            werden gegen den ECHTEN Bestand ausgefuehrt. Sie schreiben
 *            nichts; `pruefeMahnbarkeit` ist ausdruecklich lesend.
 *   TEIL B — SCHREIBEND, ABER OHNE FOLGEN. Alles laeuft in EINEM
 *            `DO`-Block im Lese-Orakel `public._run_sql`, der IMMER mit
 *            `RAISE EXCEPTION` endet. Die Transaktion rollt vollstaendig
 *            zurueck — dieselbe Bauart wie `npm run verify:geldweg`.
 *
 * ── DER BEFUND, DER DIESEN LAUF AUSGELOEST HAT ────────────────────────────
 *
 * `invoices_status_check` laesst ZWEI Vokabulare zu: ein deutsches
 * (entwurf, uebermittelt, bezahlt, storniert, strittig …) und ein aelteres
 * englisches (draft, sent, paid, rejected, disputed). Der Bestand nutzt
 * beide. Die Sperrliste des Mahntors kannte nur das deutsche — Pruefpunkt 3
 * meldete woertlich „Status ‚paid' ist mahnfaehig". Andere Punkte fingen
 * die beiden vorhandenen Faelle ab; ein ENTWURF (`draft`) mit offenem
 * Betrag waere durchgelaufen. Station M5 misst genau das.
 *
 * Aufruf:  npm run verify:opos-mahnwesen
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
import { getOposListe, getKlientSalden } from '../lib/billing/opos/opos-manager.ts'
import { pruefeMahnbarkeit, GESPERRTE_STATUS } from '../lib/billing/dunning/mahn-safety-gate.ts'
import { RECHNUNG_ERLEDIGT } from '../lib/billing/status-vokabular.ts'
import { DUNNING_DAYS, DUNNING_FEES_CENTS, DUNNING_LEVEL_ORDER } from '../lib/billing/core/dunning.ts'

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

const ergebnisse = []
function pruefe(id, titel, bestanden, gemessen) {
  ergebnisse.push({ id, bestanden })
  console.log(`\n[${id}] ${bestanden ? 'OK     ' : 'OFFEN  '} ${titel}`)
  console.log(`  ${String(gemessen).split('\n').join('\n  ')}`)
}

/** Lese-Orakel: der Block endet IMMER mit RAISE, die Transaktion rollt zurueck. */
async function orakel(sql) {
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    // apiHeaders und nicht von Hand: die neuen publishable/secret-Schluessel
    // sind keine JWTs und werden als `Bearer` mit „Invalid JWT" abgewiesen.
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

const euro = cent => `${(cent / 100).toFixed(2)} EUR`

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' OFFENE POSTEN → ZAHLUNG → MAHNWESEN — live gegen Produktion')
console.log(` ${new Date().toISOString()}`)
console.log(' Teil A liest nur. Teil B laeuft in einer Transaktion, die IMMER')
console.log(' zurueckrollt — es entsteht keine Rechnung, keine Mahnung, keine Zahlung.')
console.log('═══════════════════════════════════════════════════════════════════')

try {
  // ══ TEIL A — NUR LESEN ════════════════════════════════════════════════

  // ── M1) Der Mahnstufenkatalog ist in sich stimmig ──────────────────────
  //
  // Reine Werte, aber der Massstab fuer alles Folgende: eine Stufe, die
  // frueher faellig ist als die vorige, oder eine Gebuehr, die sinkt,
  // macht jede Eskalation unvorhersehbar.
  const stufen = DUNNING_LEVEL_ORDER.filter(s => s !== 'offen' && s !== 'bezahlt')
  let tageSteigen = true
  let gebuehrenSteigen = true
  for (let i = 1; i < stufen.length; i++) {
    if (DUNNING_DAYS[stufen[i]] <= DUNNING_DAYS[stufen[i - 1]]) tageSteigen = false
    if (DUNNING_FEES_CENTS[stufen[i]] < DUNNING_FEES_CENTS[stufen[i - 1]]) gebuehrenSteigen = false
  }
  pruefe('M1', 'Mahnstufen werden spaeter faellig und nie billiger',
    tageSteigen && gebuehrenSteigen,
    stufen.map(s => `${s}: ab ${DUNNING_DAYS[s]} Tagen, ${euro(DUNNING_FEES_CENTS[s])}`).join('\n'))

  // ── M2) Die offenen Posten stimmen mit den Rechnungen ueberein ─────────
  const uebersicht = await getOposListe(admin, ORG)
  const { data: rechnungen } = await admin.from('invoices')
    .select('id, invoice_number, status, total_amount, paid_amount, due_date')
    .eq('organization_id', ORG).is('deleted_at', null)
  const alle = rechnungen ?? []
  const erwartet = alle.filter(r =>
    !RECHNUNG_ERLEDIGT.includes(String(r.status))
    && Math.round(((r.total_amount ?? 0) - (r.paid_amount ?? 0)) * 100) > 0)
  const summeErwartet = erwartet.reduce(
    (n, r) => n + Math.round(((r.total_amount ?? 0) - (r.paid_amount ?? 0)) * 100), 0)
  pruefe('M2', 'Die OPOS-Liste zeigt genau die Rechnungen, auf denen noch etwas offen steht',
    uebersicht.gesamtAnzahl === erwartet.length && uebersicht.gesamtOffen === summeErwartet,
    `${alle.length} Rechnungen im Mandanten, davon ${erwartet.length} mit Restbetrag\n`
    + `OPOS: ${uebersicht.gesamtAnzahl} Posten, ${euro(uebersicht.gesamtOffen)} `
    + `(erwartet ${erwartet.length} / ${euro(summeErwartet)})\n`
    + uebersicht.offenePosten.map(p => `  ${p.invoiceNumber} [${p.status}] offen ${euro(p.offenCent)}`
      + ` — ${p.alterTage} Tage, Klasse ${p.altersKlasse}`).join('\n'))

  // ── M2b) Endzustaende bleiben draussen — in BEIDEN Vokabularen ─────────
  //
  // Der zweite Teil desselben Befundes. Die OPOS-Abfrage schloss frueher
  // nur die deutschen Endzustaende aus. Eine stornierte Rechnung im
  // englischen Wortlaut (`cancelled`) behaelt ihren Betrag — sie stand
  // damit weiter in den offenen Posten, und die ausgewiesene Forderung
  // war zu hoch.
  const drinObwohlErledigt = uebersicht.offenePosten.filter(p => {
    const r = alle.find(x => x.id === p.invoiceId)
    return r && RECHNUNG_ERLEDIGT.includes(String(r.status))
  })
  pruefe('M2b', 'Keine erledigte Rechnung steht in den offenen Posten',
    drinObwohlErledigt.length === 0
      && RECHNUNG_ERLEDIGT.includes('cancelled') && RECHNUNG_ERLEDIGT.includes('storniert'),
    `Endzustaende laut gemeinsamer Liste: ${RECHNUNG_ERLEDIGT.join(', ')}\n`
    + `in der OPOS-Liste trotz Endzustand: ${drinObwohlErledigt.length} (erwartet 0)`)

  // ── M3) Die Altersstruktur ordnet richtig ein ──────────────────────────
  const a = uebersicht.altersstruktur
  const summeKlassen = a.klasse0_30.summe + a.klasse30_60.summe
    + a.klasse60_90.summe + a.klasse90plus.summe
  const anzahlKlassen = a.klasse0_30.anzahl + a.klasse30_60.anzahl
    + a.klasse60_90.anzahl + a.klasse90plus.anzahl
  pruefe('M3', 'Die Altersstruktur teilt genau die Posten auf, die die Liste zeigt',
    summeKlassen === uebersicht.gesamtOffen && anzahlKlassen === uebersicht.gesamtAnzahl,
    `0–30 ${a.klasse0_30.anzahl}/${euro(a.klasse0_30.summe)} | `
    + `30–60 ${a.klasse30_60.anzahl}/${euro(a.klasse30_60.summe)} | `
    + `60–90 ${a.klasse60_90.anzahl}/${euro(a.klasse60_90.summe)} | `
    + `90+ ${a.klasse90plus.anzahl}/${euro(a.klasse90plus.summe)}\n`
    + `Summe der Klassen ${euro(summeKlassen)} gegen Gesamt ${euro(uebersicht.gesamtOffen)}`)

  // ── M4) Der Klientensaldo ist die Summe seiner Posten ──────────────────
  const salden = await getKlientSalden(admin, ORG)
  const saldoSumme = salden.reduce((n, s) => n + (s.offenGesamt ?? 0), 0)
  const saldoAnzahl = salden.reduce((n, s) => n + (s.rechnungenOffen ?? 0), 0)
  pruefe('M4', 'Die Klientensalden summieren sich auf dieselbe offene Forderung',
    saldoSumme === uebersicht.gesamtOffen && saldoAnzahl === uebersicht.gesamtAnzahl,
    `${salden.length} Klienten | Summe ${euro(saldoSumme)} gegen ${euro(uebersicht.gesamtOffen)}\n`
    + salden.map(s => `  ${s.clientName}: ${euro(s.offenGesamt)} aus ${s.rechnungenOffen} Rechnung(en)`
      + `, aelteste Faelligkeit ${s.aeltesteFaelligkeit ?? '—'}`).join('\n'))

  // ── M5) Das Mahntor kennt BEIDE Vokabulare der Statusspalte ────────────
  //
  // Der Befund vom 31.08.2026. `invoices_status_check` laesst deutsche UND
  // englische Werte zu; die Sperrliste kannte nur die deutschen. Punkt 3
  // meldete deshalb „Status ,paid' ist mahnfaehig" und hat live nie etwas
  // gesperrt — gefaehrlich nicht bei `paid` (Punkt 4 faengt es), sondern
  // bei `draft` und `rejected`: offener Betrag, ueberfaellig, alle zehn
  // Punkte frei.
  const englisch = ['draft', 'paid', 'cancelled', 'rejected', 'disputed']
  const mahnfaehigBleibt = ['sent', 'uebermittelt', 'partial', 'teilweise_bezahlt', 'freigegeben']
  const fehlend = englisch.filter(s => !GESPERRTE_STATUS.has(s))
  const zuvielGesperrt = mahnfaehigBleibt.filter(s => GESPERRTE_STATUS.has(s))
  pruefe('M5', 'Die Sperrliste deckt beide Vokabulare von invoices.status ab',
    fehlend.length === 0 && zuvielGesperrt.length === 0,
    `gesperrt: ${[...GESPERRTE_STATUS].join(', ')}\n`
    + `englische Werte, die fehlen: ${fehlend.join(', ') || '(keine)'}\n`
    + `mahnfaehige Werte, die faelschlich gesperrt waeren: ${zuvielGesperrt.join(', ') || '(keine)'}`)

  // ── M6) Das Tor am echten Bestand ──────────────────────────────────────
  const tore = []
  for (const r of alle) {
    const g = await pruefeMahnbarkeit(admin, { invoiceId: r.id, organizationId: ORG })
    tore.push({ r, g })
  }
  const falschMahnbar = tore.filter(({ r, g }) =>
    g.darfMahnen && GESPERRTE_STATUS.has(String(r.status)))
  pruefe('M6', 'Keine Rechnung in einem gesperrten Status gilt als mahnbar',
    falschMahnbar.length === 0,
    tore.map(({ r, g }) => `${r.invoice_number} (${r.status}) ⇒ ${g.status}`
      + ` offen ${euro(g.offenCent)}, ${g.tageUeberfaellig} Tage`
      + (g.sperren.length ? `\n    gesperrt durch: ${g.sperren.join(' | ')}` : '')).join('\n'))

  // ── M7) Jede Sperre wird EINZELN ausgewiesen ───────────────────────────
  //
  // Ein Tor, das nur „nein" sagt, ist im Betrieb unbrauchbar: niemand
  // weiss, was zu tun ist. Alle zehn Punkte muessen einen Stand tragen.
  const unvollstaendig = tore.filter(({ g }) =>
    g.punkte.length !== 10 || g.punkte.some(p => !p.stand || !p.befund))
  pruefe('M7', 'Das Tor begruendet alle zehn Pruefpunkte, nicht nur das Ergebnis',
    unvollstaendig.length === 0,
    `${tore.length} Rechnungen geprueft, ${unvollstaendig.length} mit unvollstaendiger Begruendung\n`
    + (tore[0] ? tore[0].g.punkte.map(p => `  ${p.nummer}. [${p.stand}] ${p.titel}`).join('\n') : ''))

  // ══ TEIL B — SCHREIBEND, IN EINER TRANSAKTION, DIE ZURUECKROLLT ═══════

  const teilB = await orakel(`DO $kette$
DECLARE
  v_klient uuid; v_rechnung uuid; v_mahn uuid; v_zahlung uuid;
  v_bericht text := '';
  v_stufe text; v_gebuehr int; v_bezahlt numeric; v_offen int;
  v_kennung text := 'PRUEF-OPOS-' || substr(md5(clock_timestamp()::text), 1, 8);
  v_fehler text;
BEGIN
  -- Pruefklient
  INSERT INTO public.clients (customer_number, first_name, last_name, organization_id)
  VALUES (v_kennung, 'Pruefung', v_kennung, '${ORG}') RETURNING id INTO v_klient;

  -- Eine Rechnung OHNE Nummernkreis: invoice_number wird von Hand gesetzt,
  -- damit billing_number_sequences unberuehrt bleibt. Auch das rollt
  -- zurueck, aber eine Sequenz, die man gar nicht erst anfasst, kann auch
  -- keine Luecke bekommen.
  INSERT INTO public.invoices (
    organization_id, client_id, invoice_number, status,
    total_amount, paid_amount, period_start, period_end, due_date)
  VALUES ('${ORG}', v_klient, v_kennung, 'uebermittelt',
          100.00, 0, CURRENT_DATE - 75, CURRENT_DATE - 60, CURRENT_DATE - 45)
  RETURNING id INTO v_rechnung;
  v_bericht := v_bericht || 'B1|Pruefrechnung ' || v_kennung || ' angelegt, 100,00 EUR, 45 Tage ueberfaellig' || chr(10);

  -- B2) Mahneintrag
  INSERT INTO public.dunning_entries (
    organization_id, invoice_id, dunning_level, due_date,
    amount_due_cents, amount_paid_cents)
  VALUES ('${ORG}', v_rechnung, 'offen', CURRENT_DATE - 45, 10000, 0)
  RETURNING id INTO v_mahn;
  v_bericht := v_bericht || 'B2|Mahneintrag auf Stufe offen, 10000 Cent faellig' || chr(10);

  -- B3) Eskalation samt Gebuehr — so, wie advanceDunning() es schreibt
  UPDATE public.dunning_entries
     SET dunning_level = 'mahnung_1', dunning_fee_cents = 250,
         last_dunning_at = now()
   WHERE id = v_mahn
  RETURNING dunning_level, dunning_fee_cents INTO v_stufe, v_gebuehr;
  v_bericht := v_bericht || 'B3|Stufe ' || v_stufe || ', Gebuehr ' || v_gebuehr || ' Cent' || chr(10);

  -- B4) Eine Stufe, die es nicht gibt, muss der CHECK abweisen
  BEGIN
    UPDATE public.dunning_entries SET dunning_level = 'inkasso' WHERE id = v_mahn;
    v_bericht := v_bericht || 'B4|DURCHGELASSEN — erfundene Mahnstufe angenommen' || chr(10);
  EXCEPTION WHEN check_violation THEN
    v_bericht := v_bericht || 'B4|erfundene Mahnstufe abgewiesen (CHECK)' || chr(10);
  END;

  -- B5) Zahlungseingang
  INSERT INTO public.payments (
    organization_id, payment_date, amount_cents, payment_method,
    payer_type, payer_name, verwendungszweck, matching_status)
  VALUES ('${ORG}', CURRENT_DATE, 4000, 'ueberweisung',
          'kunde', 'Pruefung', v_kennung, 'nicht_zugeordnet')
  RETURNING id INTO v_zahlung;

  INSERT INTO public.payment_allocations (
    organization_id, payment_id, invoice_id, amount_cents, allocation_type)
  VALUES ('${ORG}', v_zahlung, v_rechnung, 4000, 'teilzahlung');

  UPDATE public.invoices SET paid_amount = 40.00 WHERE id = v_rechnung
  RETURNING paid_amount INTO v_bezahlt;
  v_bericht := v_bericht || 'B5|Teilzahlung 40,00 EUR zugeordnet, paid_amount=' || v_bezahlt || chr(10);

  -- B6) Eine Zuordnung ueber den offenen Rest hinaus
  BEGIN
    INSERT INTO public.payment_allocations (
      organization_id, payment_id, invoice_id, amount_cents, allocation_type)
    VALUES ('${ORG}', v_zahlung, v_rechnung, -100, 'teilzahlung');
    v_bericht := v_bericht || 'B6|DURCHGELASSEN — negative Zuordnung angenommen' || chr(10);
  EXCEPTION WHEN check_violation THEN
    v_bericht := v_bericht || 'B6|negative Zuordnung abgewiesen (CHECK amount_cents > 0)' || chr(10);
  END;

  -- B7) Der Mahneintrag zieht den offenen Betrag nach
  UPDATE public.dunning_entries
     SET amount_paid_cents = 4000
   WHERE id = v_mahn
  RETURNING amount_open_cents INTO v_offen;
  v_bericht := v_bericht || 'B7|offener Betrag laut Mahneintrag: '
            || COALESCE(v_offen::text, 'NULL (nicht berechnet)') || ' Cent' || chr(10);

  -- B8) Mandantengrenze: ein Mahneintrag auf eine fremde Rechnung
  BEGIN
    SELECT count(*)::text INTO v_fehler
      FROM public.invoices
     WHERE id = v_rechnung AND organization_id <> '${ORG}';
    v_bericht := v_bericht || 'B8|Pruefrechnung unter fremdem Mandanten sichtbar: '
              || v_fehler || ' (erwartet 0)' || chr(10);
  END;

  -- B9) Der Statusweg laesst sich nicht abkuerzen
  --
  -- validate_invoice_status_transition kennt die erlaubten Uebergaenge.
  -- Von "uebermittelt" direkt auf "bezahlt" zu springen hiesse, die
  -- Quittierung des Kostentraegers zu ueberspringen — und damit eine
  -- Zahlung zu verbuchen, die niemand bestaetigt hat.
  BEGIN
    UPDATE public.invoices SET status = 'bezahlt' WHERE id = v_rechnung;
    v_bericht := v_bericht || 'B9|DURCHGELASSEN — uebermittelt direkt auf bezahlt' || chr(10);
  EXCEPTION WHEN OTHERS THEN
    v_bericht := v_bericht || 'B9|Abkuerzung abgewiesen: ' || SQLERRM || chr(10);
  END;

  -- B10) Der vorgesehene Weg samt Restzahlung
  UPDATE public.invoices SET status = 'quittiert' WHERE id = v_rechnung;
  UPDATE public.invoices SET paid_amount = 100.00, status = 'bezahlt' WHERE id = v_rechnung;
  SELECT (total_amount - paid_amount) INTO v_bezahlt FROM public.invoices WHERE id = v_rechnung;
  v_bericht := v_bericht || 'B10|ueber quittiert nach bezahlt, offen danach: '
            || v_bezahlt || ' EUR' || chr(10);

  RAISE EXCEPTION 'KETTE:%', v_bericht;
END $kette$;`)

  if (teilB.fehler) {
    pruefe('B', 'Teil B (schreibend, rollt zurueck) laeuft durch', false, teilB.fehler)
  } else {
    const zeilen = teilB.text.split('\n').map(z => z.trim()).filter(Boolean)
    const holen = id => zeilen.find(z => z.startsWith(`${id}|`))?.slice(id.length + 1) ?? '(nicht gemeldet)'
    pruefe('M8', 'Ein Mahneintrag entsteht und eskaliert samt Gebuehr',
      holen('B2') !== '(nicht gemeldet)' && /mahnung_1/.test(holen('B3')),
      `${holen('B1')}\n${holen('B2')}\n${holen('B3')}`)
    pruefe('M9', 'Eine erfundene Mahnstufe weist die Datenbank ab',
      holen('B4').startsWith('erfundene Mahnstufe abgewiesen'), holen('B4'))
    pruefe('M10', 'Eine Teilzahlung wird zugeordnet und schlaegt auf die Rechnung durch',
      /paid_amount=40/.test(holen('B5')), holen('B5'))
    pruefe('M11', 'Eine negative Zuordnung weist die Datenbank ab',
      holen('B6').startsWith('negative Zuordnung abgewiesen'), holen('B6'))
    pruefe('M12', 'Der Mahneintrag fuehrt den offenen Betrag mit',
      /6000/.test(holen('B7')), `${holen('B7')}  (erwartet 6000 = 10000 − 4000)`)
    pruefe('M13', 'Die Pruefrechnung ist unter keinem fremden Mandanten sichtbar',
      /: 0 /.test(holen('B8')), holen('B8'))
    pruefe('M14', 'Der Statusweg laesst sich nicht abkuerzen',
      holen('B9').startsWith('Abkuerzung abgewiesen'), holen('B9'))
    pruefe('M16', 'Ueber den vorgesehenen Weg ist die Rechnung danach ausgeglichen',
      /offen danach: 0/.test(holen('B10')), holen('B10'))
  }

  // ── M15) Und es ist wirklich nichts stehen geblieben ───────────────────
  const nachher = await admin.from('invoices')
    .select('id, invoice_number').eq('organization_id', ORG).is('deleted_at', null)
  const pruefreste = (nachher.data ?? []).filter(r => String(r.invoice_number).startsWith('PRUEF-OPOS-'))
  const { data: klientreste } = await admin.from('clients')
    .select('id').like('customer_number', 'PRUEF-OPOS-%')
  const { data: zahlreste } = await admin.from('payments')
    .select('id').like('verwendungszweck', 'PRUEF-OPOS-%')
  pruefe('M15', 'Teil B hat nichts hinterlassen — keine Rechnung, kein Klient, keine Zahlung',
    pruefreste.length === 0 && (klientreste ?? []).length === 0 && (zahlreste ?? []).length === 0,
    `Pruefrechnungen ${pruefreste.length} | Pruefklienten ${(klientreste ?? []).length} | `
    + `Pruefzahlungen ${(zahlreste ?? []).length} (jeweils 0 erwartet)\n`
    + `Rechnungen im Mandanten unveraendert: ${(nachher.data ?? []).length} (vorher ${alle.length})`)
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
