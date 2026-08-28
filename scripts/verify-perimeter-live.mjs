#!/usr/bin/env node
/**
 * Track 13 — Live-Tatsachen zum unauthentifizierten Perimeter.
 *
 * Prueft NUR LESEND gegen die Produktionsdatenbank. Das Lese-Orakel
 * (`public._run_sql` + `RAISE EXCEPTION`) rollt seine Transaktion immer
 * zurueck; es kann per Konstruktion nichts festschreiben.
 *
 * DIE ANGRIFFSFLAECHE DIESES TRACKS. Tracks 1-12 haben durchweg einen
 * ANGEMELDETEN Akteur vorausgesetzt: darf dieser Nutzer diese Zeile sehen,
 * schreiben, abrechnen. Hier steht die Frage davor — was kann jemand OHNE
 * Konto? Die Antwort ist an dieser Stelle nicht RLS: `anon` hat live auf
 * KEINER der 310 public-Tabellen ein Schreibrecht. Der Weg nach innen
 * fuehrt ausschliesslich ueber die oeffentlichen Routen, und die schreiben
 * mit dem DIENSTSCHLUESSEL — RLS sieht sie nie. Der Riegel ist dort der
 * Routen-Code, sonst nichts.
 *
 * Geprueft werden die Tatsachen, auf denen die Befunde stehen:
 *
 *   B1) Steht die offene INSERT-Policy auf `lead_inquiries` noch? Und
 *       kann die Rolle `authenticated` dort wirklich schreiben?
 *   N1) Hat `anon` irgendwo Schreibrechte? Ist RLS ueberall an?
 *   N2) Gibt es SECDEF-Funktionen, die `anon` ausfuehren darf?
 *   N3) Laeuft der persistente Ratenzaehler wirklich — und wird er benutzt?
 *   B4) Wie viele visitor_locations-Zeilen haengen an einem Konto?
 *   B5) Wie alt und wie gross ist der Bestand an vollen IP-Adressen?
 *   B6) Steht der Newsletter-Verteiler leer (macht Altlinks harmlos)?
 *
 * Aufruf:  npm run verify:perimeter
 * Exit 0 = alle Pruefungen bestanden, Exit 1 = mindestens eine offen.
 */

import { apiHeaders, envWert, publishableKey, secretKey } from './lib/supabase-keys.mjs'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
const ANON = publishableKey()

if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

/** Lese-Orakel: das Ergebnis kommt ueber die RAISE-Meldung zurueck. */
async function rohesOrakel(doBlock) {
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: doBlock }),
  })
  const text = await res.text()
  const t = text.match(/ORAKEL:([\s\S]*?)","/) || text.match(/ORAKEL:([\s\S]*?)"\}/) || text.match(/ORAKEL:([\s\S]*?)"/)
  if (t) return t[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
  return `(kein Treffer) HTTP ${res.status} ${text.slice(0, 300)}`
}

async function orakel(sql) {
  return rohesOrakel(
    `DO $ORK$ DECLARE r text; BEGIN `
    + `SELECT coalesce(string_agg(z::text, chr(10)), '(leer)') INTO r FROM (${sql.replace(/\s+/g, ' ')}) t(z); `
    + `RAISE EXCEPTION 'ORAKEL:%', r; END $ORK$;`,
  )
}

/**
 * Schreibprobe unter einer anderen Rolle.
 *
 * Der abschliessende RAISE bricht die Transaktion ab — die Zeile wird NIE
 * festgeschrieben. Nach `SET LOCAL ROLE` darf kein weiterer Tabellen-
 * zugriff folgen: `RESET ROLE` faellt auf die Sitzungsrolle zurueck, die
 * auf public.* keine Rechte hat.
 */
async function schreibProbe(rolle) {
  return rohesOrakel(`DO $ORK$
DECLARE r text;
BEGIN
  BEGIN
    SET LOCAL ROLE ${rolle};
    INSERT INTO public.lead_inquiries(name, phone, plz, message, status, notes)
    VALUES ('TRACK13-PROBE-NICHT-ECHT', '0000000', '00000', 'audit-probe', 'FREI-GEWAEHLTER-STATUS', 'audit-probe');
    r := 'ERFOLGREICH';
  EXCEPTION WHEN others THEN
    r := 'abgewiesen: ' || SQLSTATE;
  END;
  RAISE EXCEPTION 'ORAKEL:%', r;
END $ORK$;`)
}

const PRUEFUNGEN = [
  {
    id: 'B1a',
    titel: 'lead_inquiries traegt KEINE offene INSERT-Policy mehr',
    erwartung: 'Policy "Anyone can submit lead inquiry" ist entfernt',
    lauf: () => orakel(
      `select coalesce(string_agg(policyname, ', '), '(keine)') as z
       from pg_policies
       where schemaname='public' and tablename='lead_inquiries'
         and permissive='PERMISSIVE' and cmd='INSERT' and btrim(coalesce(with_check,''))='true'`,
    ),
    pruefe: t => t.includes('(keine)') || t.includes('(leer)'),
    hinweisWennRot:
      'Migration 20261018000000 ist NICHT angewendet. Bis dahin kann jedes angemeldete '
      + 'Konto beliebige Zeilen in die Lead-Pipeline schreiben.',
  },
  {
    id: 'B1b',
    titel: 'Rolle authenticated kann NICHT in lead_inquiries schreiben',
    erwartung: 'abgewiesen (Probe rollt immer zurueck)',
    lauf: () => schreibProbe('authenticated'),
    pruefe: t => t.includes('abgewiesen'),
    hinweisWennRot: 'Der Befund B1 ist offen — siehe 20261018000000.',
  },
  {
    id: 'B1c',
    titel: 'GEGENPROBE: anon kann es auch nicht (Grant-Ebene)',
    erwartung: 'abgewiesen: 42501',
    lauf: () => schreibProbe('anon'),
    pruefe: t => t.includes('abgewiesen'),
    hinweisWennRot: 'anon hat ein INSERT-Grant auf lead_inquiries bekommen.',
  },
  {
    id: 'B1d',
    titel: 'lead_inquiries.status traegt einen CHECK',
    erwartung: 'lead_inquiries_status_check vorhanden',
    lauf: () => orakel(
      `select coalesce(string_agg(conname, ', '), '(keiner)') as z
       from pg_constraint
       where conrelid='public.lead_inquiries'::regclass and contype='c'`,
    ),
    pruefe: t => t.includes('lead_inquiries_status_check'),
    hinweisWennRot: 'Migration 20261018000000 ist nicht angewendet — freie Statuswerte moeglich.',
  },
  {
    id: 'N1',
    titel: 'anon hat auf KEINER public-Tabelle Schreibrechte, RLS ueberall an',
    erwartung: 'anon_insert=0 anon_update=0 anon_delete=0 rls_aus=0',
    lauf: () => orakel(
      `select 'tabellen='||count(*)::text
         ||' anon_insert='||count(*) filter (where has_table_privilege('anon','public.'||c.relname,'INSERT'))::text
         ||' anon_update='||count(*) filter (where has_table_privilege('anon','public.'||c.relname,'UPDATE'))::text
         ||' anon_delete='||count(*) filter (where has_table_privilege('anon','public.'||c.relname,'DELETE'))::text
         ||' rls_aus='||count(*) filter (where not c.relrowsecurity)::text as z
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind='r'`,
    ),
    pruefe: t =>
      t.includes('anon_insert=0') && t.includes('anon_update=0')
      && t.includes('anon_delete=0') && t.includes('rls_aus=0'),
    hinweisWennRot: 'Eine Tabelle ist fuer anon schreibbar oder ohne RLS — das ist ein P0.',
  },
  {
    id: 'N2',
    titel: 'Keine SECURITY-DEFINER-Funktion ist fuer anon ausfuehrbar',
    erwartung: 'secdef_und_anon=0',
    lauf: () => orakel(
      `select 'funktionen='||count(*)::text
         ||' anon_ausfuehrbar='||count(*) filter (where has_function_privilege('anon',p.oid,'EXECUTE'))::text
         ||' secdef_und_anon='||count(*) filter (where p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE'))::text as z
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.prokind='f'`,
    ),
    pruefe: t => t.includes('secdef_und_anon=0'),
    hinweisWennRot:
      'Eine SECDEF-Funktion laeuft mit den Rechten ihres Eigentuemers und ist fuer anon '
      + 'aufrufbar — sie umgeht damit RLS vollstaendig.',
  },
  {
    id: 'N3',
    titel: 'Der persistente Ratenzaehler existiert, ist SECDEF mit festem search_path und wird benutzt',
    erwartung: 'secdef=true, search_path gesetzt, api_rate_limits mit Zeilen',
    lauf: () => orakel(
      `select 'secdef='||p.prosecdef::text
         ||' config='||coalesce(array_to_string(p.proconfig,','),'(keins)')
         ||' anon_S='||has_table_privilege('anon','public.api_rate_limits','SELECT')::text
         ||' zeilen='||(select count(*) from public.api_rate_limits)::text as z
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='api_rate_limit_hit'`,
    ),
    pruefe: t => t.includes('secdef=true') && t.includes('search_path=') && t.includes('anon_S=false'),
    hinweisWennRot:
      'Ohne diese RPC faellt rateLimitPersistent auf den instanzlokalen Zaehler zurueck — '
      + 'dann sind ALLE Perimeter-Limits auf Vercel wirkungslos.',
  },
  {
    id: 'B4',
    titel: 'Bewegungsspuren: wie viele Zeilen haengen an einem Konto?',
    erwartung: 'nur Bericht — die Zahl begruendet den Loeschkatalog-Eintrag',
    nurBericht: true,
    lauf: () => orakel(
      `select 'visitor_locations: gesamt='||count(*)::text
         ||' mit_user_id='||count(user_id)::text
         ||' verschiedene_konten='||count(distinct user_id)::text
         ||' mit_ip='||count(ip_address)::text as z
       from public.visitor_locations
       union all
       select 'page_views: gesamt='||count(*)::text
         ||' mit_user_id='||count(user_id)::text
         ||' verschiedene_konten='||count(distinct user_id)::text
         ||' mit_ip='||count(ip_address)::text
       from public.page_views`,
    ),
  },
  {
    id: 'B5',
    titel: 'Bestand an vollen IP-Adressen und sein Alter',
    erwartung: 'nur Bericht — Grundlage der Aufbewahrungsfristen',
    nurBericht: true,
    lauf: () => orakel(
      `select 'visitors: n='||count(*)::text||' mit_ip='||count(*) filter (where ip is not null and ip<>'')::text
         ||' verschiedene='||count(distinct ip)::text||' ab='||coalesce(min(created_at)::date::text,'-') as z
       from public.visitors
       union all
       select 'visitor_locations: n='||count(*)::text||' mit_ip='||count(ip_address)::text
         ||' verschiedene='||count(distinct ip_address)::text||' ab='||coalesce(min(created_at)::date::text,'-')
       from public.visitor_locations
       union all
       select 'conversions: n='||count(*)::text||' mit_ip='||count(ip)::text
         ||' verschiedene='||count(distinct ip)::text||' ab='||coalesce(min(created_at)::date::text,'-')
       from public.conversions
       union all
       select 'page_views: n='||count(*)::text||' mit_ip='||count(ip_address)::text
         ||' verschiedene='||count(distinct ip_address)::text||' ab='||coalesce(min(viewed_at)::date::text,'-')
       from public.page_views
       union all
       select 'analytics_events: n='||count(*)::text||' mit_ip_hash='||count(ip_hash)::text
         ||' verschiedene=-'||' ab='||coalesce(min(created_at)::date::text,'-')
       from public.analytics_events`,
    ),
  },
  {
    id: 'B5b',
    titel: 'Trockenlauf-Vorschau: was der Aufbewahrungslauf entfernen wuerde',
    erwartung: 'nur Bericht — vor dem Scharfschalten anzusehen',
    nurBericht: true,
    lauf: () => orakel(
      `select 'visitors_ip>7d='||(select count(*) from public.visitors where created_at < now()-interval '7 days' and ip is not null)::text
         ||' visitors_zeilen>90d='||(select count(*) from public.visitors where created_at < now()-interval '90 days')::text
         ||' vl_ip>7d='||(select count(*) from public.visitor_locations where created_at < now()-interval '7 days' and ip_address is not null)::text
         ||' vl_zeilen>90d='||(select count(*) from public.visitor_locations where created_at < now()-interval '90 days')::text
         ||' conv_ip>30d='||(select count(*) from public.conversions where created_at < now()-interval '30 days' and ip is not null)::text
         ||' pv_ip>7d='||(select count(*) from public.page_views where viewed_at < now()-interval '7 days' and ip_address is not null)::text
         ||' pv_zeilen>90d='||(select count(*) from public.page_views where viewed_at < now()-interval '90 days')::text
         ||' ae_zeilen>180d='||(select count(*) from public.analytics_events where created_at < now()-interval '180 days')::text as z`,
    ),
  },
  {
    id: 'B6',
    titel: 'Newsletter-Verteiler: Bestand (macht tokenlose Altlinks harmlos)',
    erwartung: 'nur Bericht',
    nurBericht: true,
    lauf: () => orakel(
      `select 'newsletter_subscribers='||count(*)::text
         ||' aktiv='||count(*) filter (where active)::text as z
       from public.newsletter_subscribers`,
    ),
  },
]

// ── anon-Lesetest ueber die Perimeter-Tabellen ────────────────────────
const PERIMETER_TABELLEN = [
  'lead_inquiries', 'newsletter_subscribers', 'conversions',
  'analytics_events', 'visitors', 'visitor_locations', 'page_views', 'api_rate_limits',
]

async function anonLesetest() {
  if (!ANON) return { ok: false, meldung: 'Kein oeffentlicher Schluessel gesetzt — Test uebersprungen.' }
  const befunde = []
  for (const t of PERIMETER_TABELLEN) {
    const res = await fetch(`${URL_BASIS}/rest/v1/${t}?select=*&limit=1`, {
      headers: apiHeaders(ANON, { Prefer: 'count=exact' }),
    })
    const rumpf = await res.text()
    // 200 mit leerem Array ist mehrdeutig (RLS filtert vs. Tabelle leer),
    // deshalb wird der Rumpf IMMER mitgemeldet statt nur der Status.
    //
    // Der Unterschied zwischen 401 und 200 [] ist dabei kein Zufall und
    // gehoert sichtbar: 401 heisst, die Sperre haengt an einem
    // Funktionsrecht (`permission denied for function current_org_id`),
    // 200 [] heisst, sie haengt an einer Policy. Das erste ist die
    // schmalere Grundlage — wer EXECUTE auf current_org_id an anon
    // zurueckgibt, oeffnet alle Tabellen dieser Gruppe in einem Zug.
    const leckt = res.status === 200 && rumpf.trim() !== '[]'
    befunde.push(`${t}: HTTP ${res.status} ${leckt ? 'LECK ' : ''}${rumpf.slice(0, 90).replace(/\s+/g, ' ')}`)
  }
  return { ok: !befunde.some(b => b.includes('LECK')), meldung: befunde.join('\n  ') }
}

// ── Lauf ──────────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════════')
console.log(' Track 13 — Der unauthentifizierte Perimeter (Live-Pruefung)')
console.log('═══════════════════════════════════════════════════════════════')

let offen = 0
let berichte = 0

for (const p of PRUEFUNGEN) {
  const text = await p.lauf()
  if (p.nurBericht) {
    berichte++
    console.log(`\n[${p.id}] BERICHT  ${p.titel}`)
    console.log(`  ${text.split('\n').join('\n  ')}`)
    continue
  }
  const bestanden = p.pruefe(text)
  if (!bestanden) offen++
  console.log(`\n[${p.id}] ${bestanden ? 'OK     ' : 'OFFEN  '} ${p.titel}`)
  console.log(`  erwartet: ${p.erwartung}`)
  console.log(`  gemessen: ${text.split('\n').join('\n            ')}`)
  if (!bestanden && p.hinweisWennRot) console.log(`  → ${p.hinweisWennRot}`)
}

const anon = await anonLesetest()
if (!anon.ok) offen++
console.log(`\n[N4] ${anon.ok ? 'OK     ' : 'OFFEN  '} anon liest aus keiner Perimeter-Tabelle Zeilen`)
console.log(`  ${anon.meldung}`)

const geprueft = PRUEFUNGEN.filter(p => !p.nurBericht).length + 1
console.log('\n───────────────────────────────────────────────────────────────')
console.log(` ${geprueft - offen} von ${geprueft} Pruefungen bestanden, ${berichte} Berichte.`)
if (offen > 0) {
  console.log(' Offene Punkte sind oben mit OFFEN markiert.')
}
console.log('───────────────────────────────────────────────────────────────')

process.exit(offen > 0 ? 1 : 0)
