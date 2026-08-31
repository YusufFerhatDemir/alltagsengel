#!/usr/bin/env node
/**
 * ROLLEN-RLS-AUDIT — die 52 blinden Seite/Rolle-Paare, scharf geprueft.
 *
 * `lint:rls-sicht` liest POLICIES und schliesst daraus, wer was saehe. Das
 * ist eine Herleitung. Dieses Skript fragt stattdessen die Datenbank
 * SELBST: es schluepft in die Rolle und misst, was wirklich
 * zurueckkommt — Lesen wie Schreiben, eigener Mandant wie fremder.
 *
 * ── WIE IMPERSONIERT WIRD ─────────────────────────────────────────────────
 *
 * Nicht ueber einen selbst gebauten JWT (dafuer braeuchte es das
 * Signiergeheimnis), sondern ueber die beiden Stellschrauben, an denen
 * PostgREST selbst dreht:
 *
 *     SET LOCAL ROLE authenticated;
 *     SELECT set_config('request.jwt.claims', '{"sub":"…"}', true);
 *
 * `auth.uid()` liest genau diesen GUC, `aktuelle_rolle()` schlaegt damit
 * profiles.role nach und `darf()` fragt die Rollenmatrix. Die Auswertung
 * ist also Zeichen fuer Zeichen dieselbe wie bei einer echten Anfrage aus
 * dem Browser — nur ohne Browser, ohne Oberflaeche und ohne Netz. Genau
 * deshalb beweist ein Ergebnis hier, dass eine Sperre SERVERSEITIG haelt
 * und nicht bloss ein ausgegrauter Knopf ist.
 *
 * ── WARUM DAS SCHREIBEN NICHTS ANRICHTET ──────────────────────────────────
 *
 * Alles laeuft im Lese-Orakel `public._run_sql`, dessen Block IMMER mit
 * RAISE EXCEPTION endet. Die Transaktion rollt in jedem Fall zurueck —
 * auch die Rollenaenderung am Testkonto, auch jeder geglueckte Schreib-
 * versuch. Waere eine Sperre kaputt, wuerde dieses Skript das melden,
 * ohne den Schaden zu hinterlassen.
 *
 * ── WARUM NICHT `RESET ROLE` ──────────────────────────────────────────────
 *
 * `RESET ROLE` faellt auf die SESSION-Rolle zurueck — und das ist unter
 * PostgREST nicht `service_role`, sondern die Login-Rolle des
 * Verbindungspools (`authenticator`). Die hat auf nichts Rechte. Ein
 * `RESET ROLE` mitten im Block liess deshalb jede folgende Abfrage mit
 * „permission denied for function current_org_id" scheitern — was wie ein
 * Rechtefehler aussieht und in Wirklichkeit ein Fehler des Pruefers war.
 * Der Block merkt sich stattdessen `current_user` und stellt ihn
 * ausdruecklich wieder her.
 *
 * ── WARUM DIE ROLLE VORHER GESETZT WIRD ───────────────────────────────────
 *
 * In der Produktionsdatenbank gibt es KEIN Konto mit pdl, qm oder
 * buchhaltung (Stand 31.08.2026: nur admin, superadmin, engel, fahrer,
 * kunde). Ohne ein solches Konto liesse sich ihre Sicht gar nicht messen.
 * Das Skript setzt deshalb einem echten Konto INNERHALB der Transaktion
 * die zu pruefende Rolle — und nimmt sie mit dem Rollback wieder weg.
 *
 * Aufruf:  npm run audit:rls-rollen
 * Exit 0 = kein Befund, Exit 1 = mindestens ein Befund.
 */

import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'
import { ROLLEN_MATRIX } from '../lib/auth/rollen.ts'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
const ANON = envWert('NEXT_PUBLIC_SUPABASE_ANON_KEY')
if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

/** Die Tabellen aus den 52 Befunden von lint:rls-sicht. */
const TABELLEN = [
  'absences', 'applications', 'bookings', 'care_notes', 'caregiver_bonuses',
  'caregiver_documents', 'caregiver_initials_history', 'caregiver_qualifications',
  'caregivers', 'client_preferred_substitutes', 'cooperation_partners',
  'datenannahmestellen', 'documents', 'dta_dakota_auftraege', 'einsatz_absagen',
  'invoices', 'kostentraeger_kontakte', 'monthly_closings', 'ocr_results',
  'partner_visits', 'payment_allocations', 'payment_status', 'review_errors',
  'state_settings', 'substitution_requests', 'verordnung_leistungen', 'verordnungen',
]

/** Die Verwaltungsrollen, die es in der Datenbank noch nicht gibt. */
const ROLLEN = ['pdl', 'qm', 'buchhaltung']

const STAMM_ORG = '00000000-0000-4000-8000-000460629986'

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
  const i = msg.indexOf('AUDIT:')
  if (i === -1) return { fehler: `HTTP ${res.status} ${msg.slice(0, 400)}` }
  return { text: msg.slice(i + 6).replace(/\\n/g, '\n').replace(/\\"/g, '"') }
}

const befunde = []
function befund(schwere, id, text) {
  befunde.push({ schwere, id, text })
}

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' ROLLEN-RLS-AUDIT — Impersonation gegen die Produktionsdatenbank')
console.log(` ${new Date().toISOString()}`)
console.log('═══════════════════════════════════════════════════════════════════')

// ── Vorlauf: ein Konto zum Umschalten und die Mandantenlage ───────────────
const vorlauf = await orakel(`DO $A$ DECLARE r text; BEGIN
  SELECT
    (SELECT id::text FROM public.profiles WHERE role='kunde' AND deleted_at IS NULL ORDER BY id LIMIT 1)
    || '|' ||
    (SELECT count(*)::text FROM public.profiles WHERE role IN ('pdl','qm','buchhaltung'))
    || '|' ||
    (SELECT count(*)::text FROM public.organizations)
  INTO r;
  RAISE EXCEPTION 'AUDIT:%', r; END $A$;`)

if (vorlauf.fehler) { console.error(vorlauf.fehler); process.exit(2) }
const [testKonto, echteVerwaltungskonten, orgAnzahl] = vorlauf.text.trim().split('|')

console.log(`\nTestkonto (Rolle wird in der Transaktion umgeschaltet): ${testKonto}`)
console.log(`Konten mit pdl/qm/buchhaltung in Produktion:            ${echteVerwaltungskonten}`)
console.log(`Organisationen:                                        ${orgAnzahl}`)
if (echteVerwaltungskonten === '0') {
  console.log('\nℹ  Es gibt live KEIN Konto mit einer dieser Rollen. Die 52 Befunde von')
  console.log('   lint:rls-sicht sind damit heute theoretisch — messbar sind sie nur so,')
  console.log('   wie dieses Skript es tut.')
}

// ── A) Lesen je Rolle und Tabelle ─────────────────────────────────────────
//
// Gemessen wird gegen den GESAMTBESTAND: „0 von 0" ist keine Sperre,
// sondern eine leere Tabelle. Nur „0 von N>0" ist eine Aussage.
console.log('\n── A) Lesen: was sieht die Rolle wirklich? ─────────────────────────')

// Welche Berechtigung verlangt die LESE-Policy je Tabelle?
const leserechte = new Map()
const leseRoh = await orakel(`DO $A$ DECLARE r text; BEGIN
  SELECT coalesce(string_agg(zeile, chr(10)), '(leer)') INTO r FROM (
    SELECT p.tablename || '=' || coalesce(string_agg(DISTINCT m[1], ','), '') AS zeile
      FROM pg_policies p
      LEFT JOIN LATERAL regexp_matches(coalesce(p.qual, ''),
                                       'darf\\(''([^'']+)''', 'g') AS m ON true
     WHERE p.schemaname='public' AND p.permissive='PERMISSIVE'
       AND p.cmd IN ('ALL','SELECT')
       AND p.tablename = ANY (ARRAY[${TABELLEN.map(t => `'${t}'`).join(',')}])
     GROUP BY p.tablename
  ) t;
  RAISE EXCEPTION 'AUDIT:%', r; END $A$;`)
if (!leseRoh.fehler && leseRoh.text.trim() !== '(leer)') {
  for (const z of leseRoh.text.split('\n').filter(Boolean)) {
    const [tab, liste] = z.trim().split('=')
    leserechte.set(tab, (liste ?? '').split(',').filter(Boolean))
  }
}

const sicht = new Map() // rolle -> Map(tabelle -> {sichtbar, gesamt})

for (const rolle of ROLLEN) {
  const liste = TABELLEN.map(t => `'${t}'`).join(',')
  const sql = `DO $A$
DECLARE
  r text := '';
  t text;
  gesamt bigint;
  sichtbar bigint;
  gesamtwerte jsonb := '{}'::jsonb;
BEGIN
  -- 1) Gesamtbestand als Dienstschluessel, VOR der Impersonation.
  FOR t IN SELECT unnest(ARRAY[${liste}]) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO gesamt;
    gesamtwerte := gesamtwerte || jsonb_build_object(t, gesamt);
  END LOOP;

  -- 2) Testkonto auf die zu pruefende Rolle setzen. Rollt mit zurueck.
  --
  -- Die Claims werden VORHER geleert. Nicht um den Riegel
  -- prevent_role_escalation zu umgehen, sondern weil er genau diesen Fall
  -- selbst vorsieht: „coalesce(current_setting('request.jwt.claims',true),'')
  -- = '' ⇒ RETURN NEW" ist der servergestuetzte Pfad fuer Migrationen und
  -- Wartung. PostgREST fuellt die Claims bei JEDER Anfrage, auch mit dem
  -- Dienstschluessel — ohne das Leeren scheiterte die Vorbereitung des
  -- Audits an einem Riegel, der gegen etwas ganz anderes gerichtet ist
  -- (die Selbst-Hochstufung eines angemeldeten Nutzers).
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.profiles SET role = '${rolle}' WHERE id = '${testKonto}'::uuid;

  -- 3) In die Rolle schluepfen. Ab hier gilt RLS wie fuer echte Anfragen.
  PERFORM set_config('request.jwt.claims',
    '{"sub":"${testKonto}","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  FOR t IN SELECT unnest(ARRAY[${liste}]) LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO sichtbar;
    EXCEPTION WHEN others THEN
      sichtbar := -1;  -- Zugriff verweigert (fehlender Grant o. ae.)
    END;
    r := r || t || '=' || sichtbar::text || '/' || (gesamtwerte->>t) || chr(10);
  END LOOP;

  RESET ROLE;
  RAISE EXCEPTION 'AUDIT:%', r;
END $A$;`

  const erg = await orakel(sql)
  if (erg.fehler) {
    console.log(`   ${rolle}: NICHT MESSBAR — ${erg.fehler}`)
    befund('HOCH', `A-${rolle}`, `Sicht der Rolle ${rolle} nicht messbar: ${erg.fehler}`)
    continue
  }

  const karte = new Map()
  for (const zeile of erg.text.split('\n')) {
    const m = zeile.trim().match(/^([a-z_0-9]+)=(-?\d+)\/(\d+)$/)
    if (m) karte.set(m[1], { sichtbar: Number(m[2]), gesamt: Number(m[3]) })
  }
  sicht.set(rolle, karte)

  const blind = [...karte.entries()].filter(([, v]) => v.sichtbar === 0 && v.gesamt > 0)
  const verweigert = [...karte.entries()].filter(([, v]) => v.sichtbar === -1)
  const sieht = [...karte.entries()].filter(([, v]) => v.sichtbar > 0)
  const leer = [...karte.entries()].filter(([, v]) => v.gesamt === 0)

  console.log(`\n   Rolle "${rolle}": sieht ${sieht.length}, blind ${blind.length}, `
    + `verweigert ${verweigert.length}, Tabelle leer ${leer.length}`)
  if (verweigert.length > 0) {
    console.log(`      Zugriff verweigert:  ${verweigert.map(([t]) => t).join(', ')}`)
  }

  // Die beiden Richtungen getrennt beurteilen.
  //
  // (1) ERLAUBTER ZUGRIFF MUSS FUNKTIONIEREN. Verlangt die Lese-Policy ein
  //     Recht, das diese Rolle HAT, und sie sieht trotzdem nichts, dann
  //     widersprechen sich Policy und Wirklichkeit — das ist ein Befund.
  // (2) Traegt die Tabelle gar keine darf()-Lese-Policy, ist es die bekannte
  //     Luecke aus lint:rls-sicht: kein Vertraulichkeitsproblem (die Rolle
  //     sieht ZU WENIG), aber eine stille Falschaussage der Oberflaeche.
  const eigeneRechte = new Set(ROLLEN_MATRIX[rolle] ?? [])
  const widerspruch = []
  const bekannteLuecke = []
  for (const [t, v] of blind) {
    const verlangt = leserechte.get(t) ?? []
    if (verlangt.length === 0) bekannteLuecke.push(t)
    else if (verlangt.some(x => eigeneRechte.has(x))) widerspruch.push(`${t} (hat ${verlangt.filter(x => eigeneRechte.has(x)).join('/')})`)
    // sonst: Recht fehlt bewusst — gewollt, kein Befund.
  }
  if (bekannteLuecke.length > 0) {
    console.log(`      ohne darf()-Lesepolicy (bekannte Luecke): ${bekannteLuecke.join(', ')}`)
    befund('MITTEL', `A-${rolle}`,
      `${rolle} sieht trotz Bestand nichts in: ${bekannteLuecke.join(', ')} — `
      + 'diese Tabellen tragen keine Lese-Policy, die eine Berechtigung auswertet.')
  }
  if (widerspruch.length > 0) {
    console.log(`      WIDERSPRUCH Policy vs. Wirklichkeit: ${widerspruch.join(', ')}`)
    befund('HOCH', `A-${rolle}`,
      `${rolle} hat das verlangte Recht, sieht aber nichts: ${widerspruch.join(', ')}.`)
  }

  // Positivkontrolle: mindestens eine Tabelle MUSS sichtbar sein, sonst
  // misst das Audit nur, dass gar nichts geht.
  if (sieht.length === 0 && [...karte.values()].some(v => v.gesamt > 0)) {
    befund('HOCH', `A-${rolle}`,
      `${rolle} sieht in KEINER der ${TABELLEN.length} Tabellen eine Zeile — `
      + 'die Impersonation misst dann moeglicherweise nur einen Totalausfall.')
  } else if (sieht.length > 0) {
    console.log(`      Positivkontrolle: sieht Zeilen in ${sieht.map(([t, v]) => `${t}(${v.sichtbar})`).join(', ')} ✓`)
  }
}

// ── B) Schreiben: haelt die Sperre auch beim Schreiben? ───────────────────
//
// Die wichtigere Haelfte. Eine Rolle, die nichts SIEHT, aber schreiben
// koennte, waere schlimmer als eine, die zu viel sieht.
console.log('\n── B) Schreiben: kann die Rolle aendern, was sie nicht sehen darf? ──')

// Welche Berechtigung verlangt die SCHREIB-Policy je Tabelle? Aus den
// Policies gelesen, nicht geraten — sonst prueft das Audit eine Regel,
// die so nirgends steht.
const schreibrechte = new Map()
const rechteRoh = await orakel(`DO $A$ DECLARE r text; BEGIN
  SELECT coalesce(string_agg(zeile, chr(10)), '(leer)') INTO r FROM (
    SELECT p.tablename || '=' || coalesce(string_agg(DISTINCT m[1], ','), '') AS zeile
      FROM pg_policies p
      LEFT JOIN LATERAL regexp_matches(coalesce(p.with_check, p.qual, ''),
                                       'darf\\(''([^'']+)''', 'g') AS m ON true
     WHERE p.schemaname='public' AND p.permissive='PERMISSIVE'
       AND p.cmd IN ('ALL','UPDATE','INSERT')
       AND p.tablename = ANY (ARRAY[${TABELLEN.map(t => `'${t}'`).join(',')}])
     GROUP BY p.tablename
  ) t;
  RAISE EXCEPTION 'AUDIT:%', r; END $A$;`)
if (!rechteRoh.fehler && rechteRoh.text.trim() !== '(leer)') {
  for (const z of rechteRoh.text.split('\n').filter(Boolean)) {
    const [tab, liste] = z.trim().split('=')
    schreibrechte.set(tab, (liste ?? '').split(',').filter(Boolean))
  }
}

for (const rolle of ROLLEN) {
  const liste = TABELLEN.map(t => `'${t}'`).join(',')
  const sql = `DO $A$
DECLARE
  r text := '';
  t text;
  ziel text;
  betroffen int;
  ausgangsrolle text := current_user;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.profiles SET role = '${rolle}' WHERE id = '${testKonto}'::uuid;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"${testKonto}","role":"authenticated"}', true);

  FOR t IN SELECT unnest(ARRAY[${liste}]) LOOP
    -- Eine echte Zeilenkennung, als Dienstschluessel geholt.
    EXECUTE format('SELECT id::text FROM public.%I LIMIT 1', t) INTO ziel;
    CONTINUE WHEN ziel IS NULL;

    SET LOCAL ROLE authenticated;
    BEGIN
      -- Beruehrt kein Feld inhaltlich; gemessen wird nur, ob RLS die
      -- Zeile ueberhaupt zum Schreiben freigibt.
      EXECUTE format('UPDATE public.%I SET id = id WHERE id = %L', t, ziel);
      GET DIAGNOSTICS betroffen = ROW_COUNT;
    EXCEPTION WHEN others THEN
      betroffen := -1;  -- abgewiesen
    END;
    EXECUTE format('SET LOCAL ROLE %I', ausgangsrolle);

    IF betroffen > 0 THEN
      r := r || t || '=SCHREIBBAR(' || betroffen::text || ')' || chr(10);
    END IF;
  END LOOP;

  IF r = '' THEN r := '(keine Tabelle schreibbar)'; END IF;
  RAISE EXCEPTION 'AUDIT:%', r;
END $A$;`

  const erg = await orakel(sql)
  if (erg.fehler) {
    console.log(`   ${rolle}: nicht messbar — ${erg.fehler.slice(0, 160)}`)
    befund('HOCH', `B-${rolle}`, `Schreibpruefung fuer ${rolle} nicht messbar.`)
    continue
  }
  const schreibbar = erg.text.trim()
  if (schreibbar === '(keine Tabelle schreibbar)') {
    console.log(`   Rolle "${rolle}": keine der ${TABELLEN.length} Tabellen schreibbar`)
    continue
  }

  // Schreibbar ist nicht automatisch falsch. Ob es falsch ist, entscheidet
  // die Rollenmatrix: verlangt die Schreib-Policy der Tabelle ein Recht,
  // das diese Rolle laut ROLLEN_MATRIX HAT, dann ist der Zugriff genau so
  // gewollt. Ein Pruefer, der jeden Schreibzugriff meldet, meldet vor
  // allem, dass das System funktioniert.
  const rechte = new Set(ROLLEN_MATRIX[rolle] ?? [])
  for (const z of schreibbar.split('\n').filter(Boolean)) {
    const tabelle = z.split('=')[0]
    const verlangt = schreibrechte.get(tabelle) ?? []
    const gedeckt = verlangt.filter(r => rechte.has(r))
    if (gedeckt.length > 0) {
      console.log(`   Rolle "${rolle}": ${tabelle} schreibbar — gedeckt durch ${gedeckt.join(', ')} ✓`)
    } else if (verlangt.length === 0) {
      console.log(`   Rolle "${rolle}": ${tabelle} SCHREIBBAR, Policy verlangt kein Recht ← BEFUND`)
      befund('KRITISCH', `B-${rolle}`,
        `${rolle} kann ${tabelle} schreiben; die Schreib-Policy prueft ueberhaupt keine `
        + 'Berechtigung. Wer schreiben darf, ist damit nirgends entschieden.')
    } else {
      console.log(`   Rolle "${rolle}": ${tabelle} SCHREIBBAR ohne ${verlangt.join('/')} ← BEFUND`)
      befund('KRITISCH', `B-${rolle}`,
        `${rolle} kann ${tabelle} schreiben, obwohl die Policy ${verlangt.join(' oder ')} `
        + 'verlangt und die Rollenmatrix ihr das nicht gibt.')
    }
  }
}

// ── C) Mandantengrenze und IDOR ───────────────────────────────────────────
//
// Getrennt gefragt, weil es zwei Fehler sind: „ich sehe fremde Mandanten"
// und „ich komme mit einer geratenen Kennung an eine fremde Zeile".
console.log('\n── C) Mandantengrenze und Objektbindung ────────────────────────────')

const cross = await orakel(`DO $A$
DECLARE
  r text := '';
  fremd uuid;
  fremdzeile text;
  n bigint;
  ausgangsrolle text := current_user;
BEGIN
  SELECT id INTO fremd FROM public.organizations
   WHERE id <> '${STAMM_ORG}'::uuid ORDER BY created_at LIMIT 1;

  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.profiles SET role = 'pdl' WHERE id = '${testKonto}'::uuid;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"${testKonto}","role":"authenticated"}', true);

  -- C1: eigener Mandant laut current_org_id()
  SET LOCAL ROLE authenticated;
  r := r || 'C1 eigener_mandant=' || coalesce(public.current_org_id()::text,'NULL') || chr(10);
  r := r || 'C2 aktuelle_rolle=' || coalesce(public.aktuelle_rolle(),'NULL') || chr(10);
  r := r || 'C3 is_admin=' || public.is_admin()::text || chr(10);
  r := r || 'C4 darf_stammdaten_lesen=' || public.darf('stammdaten.lesen')::text || chr(10);
  r := r || 'C5 darf_benutzer_verwalten=' || public.darf('benutzer.verwalten')::text || chr(10);
  r := r || 'C6 darf_sicherheit_lesen=' || public.darf('sicherheit.lesen')::text || chr(10);

  -- C7: Zeilen FREMDER Mandanten in einer mandantengefuehrten Tabelle
  BEGIN
    EXECUTE format(
      'SELECT count(*) FROM public.clients WHERE organization_id <> %L', '${STAMM_ORG}')
      INTO n;
  EXCEPTION WHEN others THEN n := -1; END;
  r := r || 'C7 fremde_klienten_sichtbar=' || n::text || chr(10);

  -- C8/C9: IDOR — eine KONKRETE fremde Zeile gezielt anfragen.
  --
  -- Es gibt live keinen zweiten Mandanten MIT Klienten. Ein Test, der
  -- deshalb „nichts gefunden" meldet, hat nichts geprueft — also wird die
  -- fremde Zeile hier ANGELEGT. Sie rollt mit der Transaktion zurueck.
  -- Ohne diesen Schritt waere die Aussage „kein IDOR" unbelegt.
  EXECUTE format('SET LOCAL ROLE %I', ausgangsrolle);
  SELECT id::text INTO fremdzeile FROM public.clients
   WHERE organization_id <> '${STAMM_ORG}'::uuid LIMIT 1;

  IF fremdzeile IS NULL AND fremd IS NOT NULL THEN
    INSERT INTO public.clients (customer_number, first_name, last_name, organization_id)
    VALUES ('AUDIT-IDOR-' || substr(md5(random()::text), 1, 8),
            'Audit', 'Fremdmandant', fremd)
    RETURNING id::text INTO fremdzeile;
    r := r || 'C8 fremde_zeile=angelegt_fuer_die_pruefung' || chr(10);
  ELSE
    r := r || 'C8 fremde_zeile=' || coalesce('vorhanden', 'keine') || chr(10);
  END IF;

  SET LOCAL ROLE authenticated;
  IF fremdzeile IS NULL THEN
    r := r || 'C9 idor=NICHT_PRUEFBAR_kein_zweiter_mandant' || chr(10);
  ELSE
    -- Gezielt ueber die Kennung, so wie es eine geratene oder abgeschriebene
    -- Objekt-ID taete.
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.clients WHERE id = %L', fremdzeile) INTO n;
    EXCEPTION WHEN others THEN n := -1; END;
    r := r || 'C9 idor_lesen=' || n::text || chr(10);

    -- Und schreibend: ein UPDATE auf die fremde Zeile.
    BEGIN
      EXECUTE format('UPDATE public.clients SET first_name = ''Fremdzugriff'' WHERE id = %L', fremdzeile);
      GET DIAGNOSTICS n = ROW_COUNT;
    EXCEPTION WHEN others THEN n := -1; END;
    r := r || 'C10 idor_schreiben=' || n::text || chr(10);
  END IF;

  EXECUTE format('SET LOCAL ROLE %I', ausgangsrolle);
  RAISE EXCEPTION 'AUDIT:%', r;
END $A$;`)

if (cross.fehler) {
  console.log(`   nicht messbar: ${cross.fehler.slice(0, 200)}`)
  befund('HOCH', 'C', `Mandanten-/IDOR-Pruefung nicht messbar: ${cross.fehler.slice(0, 120)}`)
} else {
  for (const zeile of cross.text.split('\n').filter(Boolean)) console.log(`   ${zeile.trim()}`)
  const w = (k) => (cross.text.match(new RegExp(`${k}=([^\\s]+)`)) ?? [])[1]

  if (w('C3 is_admin') === 'true' || cross.text.includes('C3 is_admin=true')) {
    befund('KRITISCH', 'C3', 'pdl erfuellt is_admin() — versteckte Verwaltungsrechte.')
  }
  if (cross.text.includes('C5 darf_benutzer_verwalten=true')) {
    befund('KRITISCH', 'C5', 'pdl darf Benutzer verwalten — nicht in ROLLEN_MATRIX vorgesehen.')
  }
  if (cross.text.includes('C6 darf_sicherheit_lesen=true')) {
    befund('KRITISCH', 'C6', 'pdl darf die Sicherheitsspur lesen — Vorbehalt der Administration.')
  }
  const fremde = Number(w('C7 fremde_klienten_sichtbar'))
  if (Number.isFinite(fremde) && fremde > 0) {
    befund('KRITISCH', 'C7', `Mandantengrenze offen: ${fremde} fremde Klientenzeilen sichtbar.`)
  }
  if (cross.text.includes('C9 idor=NICHT_PRUEFBAR')) {
    befund('HOCH', 'C9', 'IDOR nicht pruefbar — es liess sich keine fremde Zeile herstellen.')
  }
  const idorLesen = Number(w('C9 idor_lesen'))
  if (Number.isFinite(idorLesen) && idorLesen > 0) {
    befund('KRITISCH', 'C9', `IDOR lesend: eine gezielt angefragte fremde Zeile ist lesbar (${idorLesen}).`)
  }
  const idorSchreiben = Number(w('C10 idor_schreiben'))
  if (Number.isFinite(idorSchreiben) && idorSchreiben > 0) {
    befund('KRITISCH', 'C10', `IDOR schreibend: eine fremde Zeile liess sich aendern (${idorSchreiben}).`)
  }
}

// ── D) anon und service_role ──────────────────────────────────────────────
console.log('\n── D) anon und Dienstschluessel ────────────────────────────────────')

const grants = await orakel(`DO $A$ DECLARE r text; BEGIN
  SELECT coalesce(string_agg(
      c.relname || ':' ||
      has_table_privilege('anon','public.'||c.relname,'SELECT')::text || ',' ||
      has_table_privilege('anon','public.'||c.relname,'INSERT')::text || ',' ||
      has_table_privilege('anon','public.'||c.relname,'UPDATE')::text || ',' ||
      has_table_privilege('anon','public.'||c.relname,'DELETE')::text
      || ',rls=' || c.relrowsecurity::text, chr(10)), '(leer)')
    INTO r
    FROM pg_class c
   WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
     AND c.relname = ANY (ARRAY[${TABELLEN.map(t => `'${t}'`).join(',')}]);
  RAISE EXCEPTION 'AUDIT:%', r; END $A$;`)

if (grants.fehler) {
  befund('HOCH', 'D', `anon-Grants nicht messbar: ${grants.fehler.slice(0, 120)}`)
} else {
  let schreibend = 0, lesend = 0, rlsAus = 0
  for (const z of grants.text.split('\n').filter(Boolean)) {
    const [name, rest] = z.trim().split(':')
    if (!rest) continue
    const [s, i, u, d, rlsTeil] = rest.split(',')
    if (i === 'true' || u === 'true' || d === 'true') {
      schreibend++
      befund('KRITISCH', 'D1', `anon hat Schreibrecht auf ${name} (I=${i} U=${u} D=${d}).`)
    }
    if (s === 'true') lesend++
    if (rlsTeil === 'rls=false') {
      rlsAus++
      befund('KRITISCH', 'D2', `RLS ist auf ${name} abgeschaltet.`)
    }
  }
  console.log(`   ${TABELLEN.length} Tabellen geprueft: anon-Schreibrechte ${schreibend}, `
    + `anon-SELECT-Grant ${lesend}, RLS abgeschaltet ${rlsAus}`)
  console.log('   (Ein SELECT-Grant allein ist kein Leck, solange RLS keine Zeile durchlaesst —')
  console.log('    das prueft E gegen den echten oeffentlichen Schluessel.)')
}

// ── E) Gegenprobe ueber HTTP mit dem oeffentlichen Schluessel ─────────────
//
// Der Katalog kann irren; die Anfrage von aussen kann es nicht. Sie geht
// denselben Weg wie ein Browser.
if (ANON) {
  console.log('\n── E) Gegenprobe von aussen (oeffentlicher Schluessel) ─────────────')
  let lecks = 0
  for (const t of TABELLEN) {
    const res = await fetch(`${URL_BASIS}/rest/v1/${t}?select=*&limit=1`, {
      // apiHeaders() statt eines rohen Bearer-Headers: die neuen
      // Supabase-Schluessel (sb_publishable_…) sind keine JWTs, und die API
      // antwortet darauf mit „Invalid JWT". Ein Regressionsscan haelt das
      // im ganzen Repo fest.
      headers: apiHeaders(ANON),
    })
    const rumpf = await res.text()
    let zeilen = 0
    try { const j = JSON.parse(rumpf); zeilen = Array.isArray(j) ? j.length : 0 } catch { /* Fehlertext */ }
    if (zeilen > 0) {
      lecks++
      befund('KRITISCH', 'E', `anon liest ${zeilen} Zeile(n) aus ${t} ueber die oeffentliche API.`)
      console.log(`   ${t.padEnd(30)} HTTP ${res.status}  ← LECK`)
    }
  }
  console.log(`   ${TABELLEN.length} Tabellen angefragt, ${lecks} geben Zeilen heraus.`)
}

// ── F) Kennen Datenbank und Anwendung dieselben Rollen? ───────────────────
//
// Drei Stellen fuehren unabhaengig voneinander eine Rollenliste: der CHECK
// auf profiles.role, die Helferfunktion is_internal_staff() und
// ROLLEN_MATRIX in lib/auth/rollen.ts. Laufen sie auseinander, entsteht
// eine Rolle, der die DATENBANK vertraut, waehrend die Anwendung sie nicht
// kennt — oder umgekehrt. Beides faellt im Betrieb erst auf, wenn jemand
// die Rolle vergibt.
console.log('\n── F) Rollenlisten: Datenbank gegen Anwendung ──────────────────────')

const rollenLage = await orakel(`DO $A$ DECLARE r text; BEGIN
  SELECT 'check=' || coalesce((
      SELECT substr(pg_get_constraintdef(oid), 1, 400) FROM pg_constraint
       WHERE conrelid='public.profiles'::regclass
         AND pg_get_constraintdef(oid) ILIKE '%role%' LIMIT 1), '(kein CHECK)')
    || chr(10) || 'staff=' || coalesce((
      SELECT replace(pg_get_functiondef(oid), chr(10), ' ') FROM pg_proc
       WHERE proname='is_internal_staff' AND pronamespace='public'::regnamespace), '(fehlt)')
    INTO r;
  RAISE EXCEPTION 'AUDIT:%', r; END $A$;`)

if (rollenLage.fehler) {
  befund('HOCH', 'F', `Rollenlisten nicht lesbar: ${rollenLage.fehler.slice(0, 120)}`)
} else {
  const checkZeile = (rollenLage.text.match(/check=([^\n]*)/) ?? [])[1] ?? ''
  const staffZeile = (rollenLage.text.match(/staff=([\s\S]*)/) ?? [])[1] ?? ''
  const ausCheck = [...checkZeile.matchAll(/'([a-z_]+)'::text/g)].map(m => m[1])
  // NUR aus dem ARRAY[...] lesen. Ein einfaches Muster ueber alle
  // Zeichenketten faengt sonst auch `SET search_path TO 'public'` mit und
  // meldet „public" als Rolle — ein Fehlalarm, der die echte Abweichung
  // (buero) neben sich unsichtbar macht.
  const arrayTeil = (staffZeile.match(/ARRAY\s*\[([^\]]*)\]/) ?? [])[1] ?? ''
  const ausStaff = [...arrayTeil.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
  const ausApp = Object.keys(ROLLEN_MATRIX)

  console.log(`   profiles-CHECK:      ${ausCheck.join(', ') || '(keine)'}`)
  console.log(`   is_internal_staff(): ${ausStaff.join(', ') || '(keine)'}`)
  console.log(`   ROLLEN_MATRIX:       ${ausApp.join(', ')}`)

  // Eine Rolle, der is_internal_staff() vertraut, die der CHECK aber nicht
  // zulaesst: heute unerreichbar, morgen ein stiller Zugang — es genuegt,
  // den CHECK zu erweitern.
  const staffOhneCheck = ausStaff.filter(r => ausCheck.length > 0 && !ausCheck.includes(r))
  if (staffOhneCheck.length > 0) {
    console.log(`   ⚠  is_internal_staff() vertraut ${staffOhneCheck.join(', ')} — vom CHECK NICHT zugelassen`)
    befund('NIEDRIG', 'F1',
      `is_internal_staff() nennt ${staffOhneCheck.join(', ')}; der CHECK auf profiles.role `
      + 'laesst diesen Wert nicht zu. Heute unerreichbar — wer den CHECK erweitert, '
      + 'schafft damit unbeabsichtigt einen Zugang an der Rollenmatrix vorbei.')
  }

  // Eine Rolle im CHECK, die die Anwendung nicht kennt: darf() gaebe ihr
  // nichts, die Oberflaeche wuesste nicht, wohin mit ihr.
  const checkOhneApp = ausCheck.filter(r => !ausApp.includes(r))
  if (checkOhneApp.length > 0) {
    console.log(`   ⚠  CHECK erlaubt ${checkOhneApp.join(', ')} — ROLLEN_MATRIX kennt sie nicht`)
    befund('NIEDRIG', 'F2',
      `Der CHECK auf profiles.role erlaubt ${checkOhneApp.join(', ')}, die Anwendung kennt `
      + 'diese Rolle nicht.')
  }

  const staffInApp = ausStaff.filter(r => ausApp.includes(r))
  if (staffOhneCheck.length === 0 && checkOhneApp.length === 0) {
    console.log(`   Alle drei Listen decken sich (${staffInApp.length} Staff-Rollen im Modell) ✓`)
  }
}

// ── Ergebnis ──────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════════')
if (befunde.length === 0) {
  console.log(' KEIN BEFUND.')
  console.log(' Kein Schreibzugriff, keine Mandantenueberschreitung, kein IDOR,')
  console.log(' keine versteckten Verwaltungsrechte, kein anon-Leck.')
  console.log('═══════════════════════════════════════════════════════════════════')
  process.exit(0)
}
console.log(` ${befunde.length} BEFUND(E):`)
for (const b of befunde) console.log(`   [${b.schwere}] ${b.id}  ${b.text}`)
console.log('═══════════════════════════════════════════════════════════════════')
process.exit(1)
