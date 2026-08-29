#!/usr/bin/env node
/**
 * Der Geldweg — EINMAL KOMPLETT DURCHLAUFEN, gegen die Produktionsdatenbank.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WAS DIESES SKRIPT ANDERS MACHT ALS DIE ANDEREN verify:*-LAEUFE
 * ────────────────────────────────────────────────────────────────────────────
 * Die uebrigen Live-Pruefungen LESEN Tatsachen: existiert der Trigger, steht
 * das Recht, traegt die Spalte den Wert. Das ist notwendig und beantwortet
 * trotzdem nicht die eine Frage, auf die es beim Geld ankommt:
 *
 *     Laeuft die Kette Leistungsnachweis -> Unterschrift -> Sperre ->
 *     Rechnung -> Position -> Versand -> Zahlung WIRKLICH DURCH?
 *
 * Neun Trigger auf `service_records` und fuenf auf `invoices` koennen einzeln
 * alle richtig sein und sich in der Reihenfolge trotzdem gegenseitig blockieren
 * — genau das war der P0 aus 20260829011500: ein unterschriebener Nachweis war
 * `is_locked`, und `prevent_locked_record_change` verweigerte dem Abrechnen den
 * einzigen Statuswechsel, den es braucht. Jede Einzelpruefung war gruen, die
 * Kette war zu. Das faellt nur auf, wenn man sie laeuft.
 *
 * Dieses Skript laeuft sie. Es legt einen Klienten, einen Leistungsnachweis und
 * eine Rechnung wirklich an, mit allen Triggern scharf.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM DAS TROTZDEM NICHTS IN DER PRODUKTION HINTERLAESST
 * ────────────────────────────────────────────────────────────────────────────
 * Der ganze Ablauf steht in EINEM `DO`-Block, der am Ende IMMER mit
 * `RAISE EXCEPTION` endet — auch im Erfolgsfall. Eine Ausnahme rollt die
 * umgebende Transaktion vollstaendig zurueck. Es gibt keinen Pfad, auf dem
 * dieses Skript committet; der Bericht kommt ueber den Ausnahmetext zurueck.
 *
 * Zwei Nebenwirkungen wurden ausdruecklich geprueft, bevor der Lauf gebaut
 * wurde, weil sie einen Rollback ueberleben WUERDEN, wenn es sie gaebe:
 *   - Rechnungsnummern: `next_billing_number` zaehlt in der Tabelle
 *     `billing_number_sequences` per INSERT .. ON CONFLICT DO UPDATE hoch,
 *     nicht ueber `nextval`. Transaktional, faellt also zurueck. Es entsteht
 *     KEINE Luecke im Nummernkreis.
 *   - Versand: es wird nichts verschickt. Die Zeile in `invoice_email_log`
 *     ist ein Datenbankeintrag, kein Mailversand; der Versandweg selbst
 *     haengt an Anwendungs-Schaltern (FIRST_REAL_INVOICE_APPROVED), die
 *     dieses Skript nicht anfasst und nicht braucht.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WAS DER LAUF NICHT BEWEIST
 * ────────────────────────────────────────────────────────────────────────────
 * Das Lese-Orakel `public._run_sql` laeuft als sein Eigentuemer und umgeht
 * damit RLS. Dieser Lauf beweist die TRIGGER- UND RPC-KETTE, nicht die
 * Zeilensicherheit — die steht in `verify:abrechnung` und `verify:perimeter`.
 * Er beweist ausserdem nichts ueber die Anwendungsschicht darueber (Routen,
 * Berechtigungen, PDF, Mailversand); die liegt in vitest und in den
 * PGlite-Ketten.
 *
 * Aufruf:  npm run verify:geldweg
 * Exit 0 = die Kette laeuft durch, Exit 1 = mindestens eine Station offen.
 */

import { apiHeaders, envWert, secretKey, keyModellBericht } from './lib/supabase-keys.mjs'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

/** Stamm-Organisation (Alltagsengel UG) — dort liegen die verifizierten Tarife. */
const STAMM_ORG = '00000000-0000-4000-8000-000460629986'

/**
 * Der Kettenlauf.
 *
 * Aufbau: ein aeusserer Block, darin ein innerer, in dem gearbeitet wird.
 * Bricht der innere ab, wird der Abbruchgrund an den Bericht angehaengt statt
 * verschluckt — ein Lauf, der auf halber Strecke stehen bleibt, soll SAGEN,
 * wo er stehen geblieben ist, statt als „Fehler" ohne Ort zu enden.
 *
 * Jede Station schreibt genau eine Zeile `OK|name|detail` oder `ROT|name|detail`.
 */
const KETTENLAUF = `
DO $GELD$
DECLARE
  v_org         uuid := '${STAMM_ORG}';
  v_actor       uuid;
  v_caregiver   uuid;
  v_client      uuid;
  v_client2     uuid;
  v_sr          uuid;
  v_sr2         uuid;
  v_datum       date;
  v_periode     text;
  v_dauer       integer;
  v_hash        text;
  v_hash2       text;
  v_locked      boolean;
  v_status      text;
  v_pstatus     text;
  v_res         jsonb;
  v_invoice     uuid;
  v_nummer      text;
  v_summe       numeric;
  v_pos_anzahl  integer;
  v_pos_betrag  numeric;
  v_pos_tarif   uuid;
  v_pos_quelle  text;
  v_pos_abw     integer;
  v_preis_cent  integer;
  v_erwartet    numeric;
  v_paid        numeric;
  v_log         integer;
  v_sent        timestamptz;
  b             text := '';
BEGIN
  BEGIN
    -- ── Station 0: Stammdaten fuer den Lauf ────────────────────────────
    SELECT id INTO v_caregiver FROM public.caregivers
      WHERE organization_id = v_org LIMIT 1;
    SELECT id INTO v_actor FROM public.profiles
      WHERE role IN ('admin','superadmin') LIMIT 1;
    IF v_caregiver IS NULL OR v_actor IS NULL THEN
      RAISE EXCEPTION 'Stammdaten fehlen (caregiver=% actor=%)', v_caregiver, v_actor;
    END IF;

    -- Ein Werktag mitten im Monat, kein Feiertag: sonst wuerde ein
    -- Zuschlag den erwarteten Betrag verschieben und die Preisprobe
    -- unten waere kein Beleg mehr, sondern eine Zufallsuebereinstimmung.
    v_datum := date_trunc('month', current_date)::date + 14;
    WHILE EXTRACT(DOW FROM v_datum) IN (0,6)
       OR EXISTS (SELECT 1 FROM public.billing_feiertage f WHERE f.datum = v_datum) LOOP
      v_datum := v_datum + 1;
    END LOOP;
    v_periode := to_char(v_datum, 'YYYY-MM');

    INSERT INTO public.clients (organization_id, customer_number, first_name, last_name, zip_code, status)
    VALUES (v_org, 'E2E-GELDWEG-' || substr(gen_random_uuid()::text, 1, 8),
            'E2E', 'Geldweg', '60311', 'active')
    RETURNING id INTO v_client;

    INSERT INTO public.service_records
      (organization_id, client_id, caregiver_id, caregiver_initials, date,
       start_time, end_time, service_type, budget_type, billing_type,
       amount, status, proof_status)
    VALUES
      (v_org, v_client, v_caregiver, 'EE', v_datum,
       '10:00', '12:00', 'Alltagsbegleitung', 'private', 'PRIVAT',
       80.00, 'complete', 'ABGESCHLOSSEN')
    RETURNING id INTO v_sr;

    SELECT duration_minutes INTO v_dauer FROM public.service_records WHERE id = v_sr;
    b := b || format('OK|nachweis|angelegt am %s, %s Minuten, Leistungsart Alltagsbegleitung, budget_type private', v_datum, v_dauer) || chr(10);

    -- ── Station 1: Unterschrift -> Hash + Sperre ───────────────────────
    -- compute_signature_hash bildet den Hash aus id/client/date/start/end/
    -- amount/client_signed_at und setzt is_locked. sync_service_record_status
    -- zieht status auf 'signed' nach.
    UPDATE public.service_records
       SET proof_status      = 'UNTERSCHRIEBEN',
           client_signed_at  = now(),
           client_signature  = 'E2E-Kettenlauf',
           client_signer_role= 'KUNDE'
     WHERE id = v_sr;

    SELECT signature_hash, is_locked, status INTO v_hash, v_locked, v_status
      FROM public.service_records WHERE id = v_sr;

    IF v_hash ~ '^[0-9a-f]{64}$' AND v_locked AND v_status = 'signed' THEN
      b := b || format('OK|unterschrift|signature_hash %s… (64 hex), is_locked=true, status=%s', left(v_hash, 12), v_status) || chr(10);
    ELSE
      b := b || format('ROT|unterschrift|hash=%s locked=%s status=%s', coalesce(left(v_hash,12),'NULL'), v_locked, v_status) || chr(10);
    END IF;

    -- ── Station 2: die Sperre haelt ────────────────────────────────────
    -- Eine inhaltliche Aenderung am gesperrten Nachweis MUSS scheitern.
    -- Ohne diese Probe waere Station 3 wertlos: eine Sperre, die alles
    -- durchlaesst, laesst das Abrechnen selbstverstaendlich auch durch.
    BEGIN
      UPDATE public.service_records SET amount = amount + 1 WHERE id = v_sr;
      b := b || 'ROT|sperre|eine Betragsaenderung am gesperrten Nachweis ging DURCH' || chr(10);
    EXCEPTION WHEN OTHERS THEN
      b := b || format('OK|sperre|Betragsaenderung abgewiesen: %s', left(SQLERRM, 90)) || chr(10);
    END;

    -- ── Station 3: Rechnung aus dem gesperrten Nachweis (der P0) ───────
    SELECT public.create_invoice_draft_atomic(v_client, v_org, v_periode, 'private', v_actor)
      INTO v_res;

    IF coalesce(v_res->>'success','false') = 'true' THEN
      v_invoice := (v_res->>'invoice_id')::uuid;
      v_nummer  := v_res->>'invoice_number';
      v_summe   := (v_res->>'total_amount')::numeric;
      b := b || format('OK|rechnung|%s erstellt, %s Position(en), Summe %s EUR', v_nummer, v_res->>'line_count', v_summe) || chr(10);
    ELSE
      b := b || format('ROT|rechnung|RPC verweigert: %s', left(coalesce(v_res->>'message', v_res::text), 200)) || chr(10);
      RAISE EXCEPTION 'Kette bricht an der Rechnung ab — die folgenden Stationen haetten keinen Gegenstand.';
    END IF;

    -- ── Station 4: die Position traegt den Tarif, nicht die App-Zahl ───
    -- min(uuid) gibt es in Postgres nicht; die Probe darunter verlangt ohnehin
    -- genau eine Position, deshalb ist das erste Element gleichbedeutend.
    SELECT count(*), sum(amount), (array_agg(tariff_id))[1], min(price_source), min(abweichung_cent)
      INTO v_pos_anzahl, v_pos_betrag, v_pos_tarif, v_pos_quelle, v_pos_abw
      FROM public.invoice_items WHERE invoice_id = v_invoice;

    SELECT preis_cent INTO v_preis_cent FROM public.billing_tariffs WHERE id = v_pos_tarif;
    v_erwartet := round((v_preis_cent::numeric / 100.0) * (v_dauer::numeric / 60.0), 2);

    IF v_pos_anzahl = 1 AND v_pos_tarif IS NOT NULL AND v_pos_quelle = 'billing_tariffs'
       AND v_pos_betrag = v_erwartet THEN
      b := b || format('OK|position|1 Position, %s EUR = %s Cent/Std x %s Min aus Tarif %s (price_source=%s, abweichung_cent=%s)',
                       v_pos_betrag, v_preis_cent, v_dauer, left(v_pos_tarif::text,8), v_pos_quelle, v_pos_abw) || chr(10);
    ELSE
      b := b || format('ROT|position|anzahl=%s betrag=%s erwartet=%s tarif=%s quelle=%s',
                       v_pos_anzahl, v_pos_betrag, v_erwartet, v_pos_tarif, v_pos_quelle) || chr(10);
    END IF;

    IF v_summe = v_pos_betrag THEN
      b := b || format('OK|summe|Rechnungssumme %s EUR deckt sich mit der Summe der Positionen', v_summe) || chr(10);
    ELSE
      b := b || format('ROT|summe|Kopf %s EUR, Positionen %s EUR', v_summe, v_pos_betrag) || chr(10);
    END IF;

    -- ── Station 5: der Abrechnungsvermerk am Nachweis ──────────────────
    -- Das ist der Statuswechsel, den prevent_locked_record_change durchlassen
    -- muss: 'signed' -> 'invoiced' bei sonst unveraenderter Zeile. Geprueft
    -- wird zusaetzlich, dass Hash und Sperre den Wechsel UEBERLEBT haben —
    -- ein Abrechnen, das den Unterschriftsbeleg abraeumt, waere schlimmer
    -- als eines, das blockiert.
    SELECT status, proof_status, is_locked, signature_hash
      INTO v_status, v_pstatus, v_locked, v_hash2
      FROM public.service_records WHERE id = v_sr;

    IF v_status = 'invoiced' AND v_locked AND v_hash2 = v_hash THEN
      b := b || format('OK|abgerechnet|Nachweis steht auf invoiced, is_locked=true, signature_hash unveraendert (proof_status=%s)', v_pstatus) || chr(10);
    ELSE
      b := b || format('ROT|abgerechnet|status=%s locked=%s hash_gleich=%s', v_status, v_locked, (v_hash2 = v_hash)) || chr(10);
    END IF;

    -- ── Station 6: Rueckweg ist zu ─────────────────────────────────────
    BEGIN
      UPDATE public.service_records SET status = 'signed' WHERE id = v_sr;
      b := b || 'ROT|rueckweg|abgerechneter Nachweis liess sich auf signed zuruecksetzen' || chr(10);
    EXCEPTION WHEN OTHERS THEN
      b := b || format('OK|rueckweg|Ruecksetzen abgewiesen: %s', left(SQLERRM, 90)) || chr(10);
    END;

    -- ── Station 7: ohne Unterschrift keine Rechnung ────────────────────
    -- Eigener Klient, weil der Idempotenzschluessel der ersten Rechnung
    -- sonst VOR der Unterschriftspruefung greifen und den Riegel gar nicht
    -- zur Sprache bringen wuerde.
    INSERT INTO public.clients (organization_id, customer_number, first_name, last_name, zip_code, status)
    VALUES (v_org, 'E2E-GELDWEG-' || substr(gen_random_uuid()::text, 1, 8),
            'E2E', 'OhneUnterschrift', '60311', 'active')
    RETURNING id INTO v_client2;

    INSERT INTO public.service_records
      (organization_id, client_id, caregiver_id, caregiver_initials, date,
       start_time, end_time, service_type, budget_type, billing_type,
       amount, status, proof_status)
    VALUES
      (v_org, v_client2, v_caregiver, 'EE', v_datum,
       '10:00', '12:00', 'Alltagsbegleitung', 'private', 'PRIVAT',
       80.00, 'complete', 'ABGESCHLOSSEN')
    RETURNING id INTO v_sr2;

    SELECT public.create_invoice_draft_atomic(v_client2, v_org, v_periode, 'private', v_actor)
      INTO v_res;

    IF coalesce(v_res->>'success','true') = 'false' AND v_res->>'error' = 'MISSING_SIGNATURE' THEN
      b := b || format('OK|ohne_unterschrift|Rechnung verweigert (MISSING_SIGNATURE, %s von %s Nachweisen)', v_res->>'unsigned_count', v_res->>'line_count') || chr(10);
    ELSE
      b := b || format('ROT|ohne_unterschrift|RPC antwortete: %s', left(v_res::text, 200)) || chr(10);
    END IF;

    -- ── Station 8: Versandkette ────────────────────────────────────────
    -- entwurf -> geprueft -> freigegeben (+ frozen_at) -> uebermittelt.
    -- Jeder Schritt laeuft durch validate_invoice_status_transition; ein
    -- unerlaubter Uebergang wuerde hier abbrechen.
    UPDATE public.invoices SET status = 'geprueft' WHERE id = v_invoice;
    UPDATE public.invoices SET status = 'freigegeben', frozen_at = now() WHERE id = v_invoice;
    UPDATE public.invoices SET status = 'uebermittelt', sent_at = now(),
           transmission_status = 'uebermittelt' WHERE id = v_invoice;

    INSERT INTO public.invoice_email_log
      (organization_id, invoice_id, empfaenger_email, empfaenger_name, betreff, status, versendet_am)
    VALUES
      (v_org, v_invoice, 'e2e@example.invalid', 'E2E Geldweg',
       'Rechnung ' || v_nummer, 'versendet', now());

    SELECT count(*) INTO v_log FROM public.invoice_email_log WHERE invoice_id = v_invoice;
    SELECT sent_at, status INTO v_sent, v_status FROM public.invoices WHERE id = v_invoice;

    IF v_status = 'uebermittelt' AND v_sent IS NOT NULL AND v_log = 1 THEN
      b := b || format('OK|versand|entwurf->geprueft->freigegeben->uebermittelt, sent_at gesetzt, %s Zeile in invoice_email_log', v_log) || chr(10);
    ELSE
      b := b || format('ROT|versand|status=%s sent_at=%s protokollzeilen=%s', v_status, v_sent, v_log) || chr(10);
    END IF;

    -- ── Station 9: festgeschriebene Rechnung ist unveraenderlich ───────
    BEGIN
      UPDATE public.invoices SET total_amount = total_amount + 1 WHERE id = v_invoice;
      b := b || 'ROT|festschreibung|Betragsaenderung an der uebermittelten Rechnung ging DURCH' || chr(10);
    EXCEPTION WHEN OTHERS THEN
      b := b || format('OK|festschreibung|Betragsaenderung abgewiesen: %s', left(SQLERRM, 90)) || chr(10);
    END;

    -- ── Station 10: Zahlungsstatus ─────────────────────────────────────
    UPDATE public.invoices SET status = 'quittiert' WHERE id = v_invoice;
    UPDATE public.invoices SET status = 'bezahlt', paid_amount = v_summe WHERE id = v_invoice;

    SELECT status, paid_amount INTO v_status, v_paid FROM public.invoices WHERE id = v_invoice;
    IF v_status = 'bezahlt' AND v_paid = v_summe THEN
      b := b || format('OK|zahlung|uebermittelt->quittiert->bezahlt, paid_amount %s EUR = Rechnungssumme', v_paid) || chr(10);
    ELSE
      b := b || format('ROT|zahlung|status=%s paid_amount=%s summe=%s', v_status, v_paid, v_summe) || chr(10);
    END IF;

  EXCEPTION WHEN OTHERS THEN
    b := b || format('ROT|ABBRUCH|%s (SQLSTATE %s)', left(SQLERRM, 300), SQLSTATE) || chr(10);
  END;

  -- Immer. Damit rollt alles zurueck, was oben angelegt wurde.
  RAISE EXCEPTION 'ORAKEL:%', b;
END $GELD$;
`

async function laufen(sql) {
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: sql }),
  })
  const text = await res.text()
  let j = null
  try { j = JSON.parse(text) } catch { /* Fehlertexte sind nicht immer JSON */ }
  const msg = j?.message ?? text
  const i = msg.indexOf('ORAKEL:')
  if (i === -1) throw new Error(`Kettenlauf unerwartet (HTTP ${res.status}): ${msg.slice(0, 800)}`)
  return msg.slice(i + 7)
}

const TRENNER = '═'.repeat(78)

console.log(TRENNER)
console.log('GELDWEG — Kettenlauf gegen die Produktionsdatenbank')
console.log(keyModellBericht())
console.log('Der Lauf endet immer mit RAISE EXCEPTION; nichts davon wird committet.')
console.log(TRENNER)

let bericht
try {
  bericht = await laufen(KETTENLAUF)
} catch (fehler) {
  console.error('\nFEHLGESCHLAGEN — der Lauf kam nicht bis zum Bericht:')
  console.error(fehler.message)
  process.exit(1)
}

const zeilen = bericht.split('\n').map((z) => z.trim()).filter(Boolean)
let rot = 0
for (const zeile of zeilen) {
  const [marke, name, ...rest] = zeile.split('|')
  const detail = rest.join('|')
  if (marke === 'OK') {
    console.log(`  OK    ${name.padEnd(18)} ${detail}`)
  } else {
    rot += 1
    console.log(`  OFFEN ${name.padEnd(18)} ${detail}`)
  }
}

console.log(TRENNER)
if (zeilen.length === 0) {
  console.log('Der Lauf hat keine einzige Station gemeldet — das ist KEIN gruenes Ergebnis.')
  process.exit(1)
}
console.log(`${zeilen.length - rot} von ${zeilen.length} Stationen bestanden.`)
if (rot > 0) {
  console.log('Die Kette ist an mindestens einer Stelle offen — Details oben.')
  process.exit(1)
}
console.log('Die Kette laeuft durch: Nachweis -> Unterschrift -> Sperre -> Rechnung')
console.log('-> Position -> Abrechnungsvermerk -> Versand -> Zahlung.')
process.exit(0)
