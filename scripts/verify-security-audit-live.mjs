#!/usr/bin/env node
/**
 * Live-Pruefung des Security- und Audit-Systems (security_audit_log).
 *
 * Prueft NUR LESEND gegen die Produktionsdatenbank. Das Lese-Orakel
 * (`public._run_sql` + `RAISE EXCEPTION`) rollt seine Transaktion immer
 * zurueck; es kann per Konstruktion nichts festschreiben.
 *
 * WOZU DAS GUT IST. Migrationen werden in diesem Projekt von Hand im
 * Supabase-SQL-Editor angewendet (der Dienstschluessel darf kein DDL,
 * siehe scripts/apply-migration.mjs). „Datei liegt im Repo" heisst
 * deshalb NICHT „steht in der Datenbank". Dieses Skript beantwortet die
 * Frage, die allein zaehlt: was ist live wirklich da?
 *
 * Geprueft:
 *   S1) Tabellen vorhanden
 *   S2) severity hat einen CHECK — event_type ausdruecklich NICHT
 *   S3) RLS ist an, und es gibt genau eine SELECT-Policy, keine
 *       Schreib-Policy
 *   S4) anon hat NULL Rechte, authenticated nur SELECT
 *   S5) log_security_event() ist SECURITY DEFINER mit search_path und
 *       nur fuer service_role ausfuehrbar
 *   S6) Der Unveraenderlichkeits-Trigger steht
 *   S7) Der Fremdschluessel auf auth.users steht auf SET NULL
 *       (sonst blockiert jede Sicherheitszeile die DSGVO-Loeschung)
 *   S8) rollen_matrix fuehrt sicherheit.lesen — und hat marketing.verwalten
 *       nicht verloren (geteilte Funktion!)
 *   S9) Bestand: wie viele Zeilen, seit wann, welche Ereignistypen
 *  S10) Keine Spalte und kein Metadaten-Schluessel, der ein Geheimnis
 *       tragen koennte
 *
 * Aufruf:  npm run verify:security-audit
 * Exit 0 = alle Pruefungen bestanden, Exit 1 = mindestens eine offen.
 */

import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()

if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

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

const NICHT_ANGEWENDET =
  'Migration 20261018000002_security_audit_log.sql ist NICHT angewendet. '
  + 'Sie muss im Supabase-SQL-Editor als postgres laufen — der Dienstschluessel '
  + 'darf kein DDL (42501), und ein GRANT/REVOKE meldet dabei sogar faelschlich Erfolg.'

const PRUEFUNGEN = [
  {
    id: 'S1',
    titel: 'Die drei Tabellen stehen',
    erwartung: 'security_audit_log, security_known_devices, security_watchlist',
    lauf: () => orakel(
      `select coalesce(string_agg(table_name, ', ' order by table_name), '(keine)') as z
         from information_schema.tables
        where table_schema='public'
          and table_name in ('security_audit_log','security_known_devices','security_watchlist')`,
    ),
    pruefe: t => t.includes('security_audit_log')
      && t.includes('security_known_devices')
      && t.includes('security_watchlist'),
    hinweisWennRot: NICHT_ANGEWENDET,
  },
  {
    id: 'S2',
    titel: 'CHECK nur auf severity — event_type bleibt offen',
    erwartung: 'severity: ja | event_type: nein',
    lauf: () => orakel(
      `select 'severity: ' ||
              case when exists (
                select 1 from pg_constraint c
                 where c.conrelid = 'public.security_audit_log'::regclass
                   and c.contype = 'c'
                   and pg_get_constraintdef(c.oid) ilike '%severity%'
              ) then 'ja' else 'NEIN' end
           || ' | event_type: ' ||
              case when exists (
                select 1 from pg_constraint c
                 where c.conrelid = 'public.security_audit_log'::regclass
                   and c.contype = 'c'
                   and pg_get_constraintdef(c.oid) ilike '%event_type%'
              ) then 'JA' else 'nein' end as z`,
    ),
    pruefe: t => t.includes('severity: ja') && t.includes('event_type: nein'),
    hinweisWennRot:
      'Ein CHECK auf event_type laesst den INSERT scheitern, sobald ein neuer '
      + 'Ereignistyp auftaucht — und verliert genau die Faelle, die niemand '
      + 'vorhergesehen hat.',
  },
  {
    id: 'S3',
    titel: 'RLS an, nur eine SELECT-Policy, keine Schreib-Policy',
    erwartung: 'rls=t | select=1 | schreibend=0',
    lauf: () => orakel(
      `select 'rls=' || (select relrowsecurity::text from pg_class where oid='public.security_audit_log'::regclass)
           || ' | select=' || (select count(*) from pg_policies where schemaname='public' and tablename='security_audit_log' and cmd='SELECT')
           || ' | schreibend=' || (select count(*) from pg_policies where schemaname='public' and tablename='security_audit_log' and cmd in ('INSERT','UPDATE','DELETE','ALL')) as z`,
    ),
    pruefe: t => t.includes('rls=t') && t.includes('select=1') && t.includes('schreibend=0'),
    hinweisWennRot:
      'Eine Schreib-Policy macht aus dem Protokoll eine Behauptung: wer einen '
      + 'Eintrag nachtraeglich aendern kann, hat keine Spur.',
  },
  {
    id: 'S4',
    titel: 'anon hat nichts, authenticated nur SELECT',
    erwartung: 'alle anon-Rechte false, authenticated select=true insert=false',
    lauf: () => orakel(
      `select 'anon:'
           || ' s=' || has_table_privilege('anon','public.security_audit_log','SELECT')::text
           || ' i=' || has_table_privilege('anon','public.security_audit_log','INSERT')::text
           || ' u=' || has_table_privilege('anon','public.security_audit_log','UPDATE')::text
           || ' d=' || has_table_privilege('anon','public.security_audit_log','DELETE')::text
           || ' | authenticated:'
           || ' s=' || has_table_privilege('authenticated','public.security_audit_log','SELECT')::text
           || ' i=' || has_table_privilege('authenticated','public.security_audit_log','INSERT')::text
           || ' u=' || has_table_privilege('authenticated','public.security_audit_log','UPDATE')::text
           || ' d=' || has_table_privilege('authenticated','public.security_audit_log','DELETE')::text as z`,
    ),
    pruefe: t => {
      const [a, b] = t.split('|')
      return !!a && !!b
        && !/s=true|i=true|u=true|d=true/.test(a)
        && /s=true/.test(b) && !/i=true|u=true|d=true/.test(b)
    },
    hinweisWennRot:
      'information_schema luegt bei PUBLIC-Grants — hier wird has_table_privilege '
      + 'gefragt, das ist die einzige verlaessliche Quelle.',
  },
  {
    id: 'S5',
    titel: 'log_security_event(): SECDEF mit search_path, nur service_role',
    erwartung: 'secdef=t searchpath=ja anon=false authenticated=false service=true',
    lauf: () => orakel(
      `select 'secdef=' || p.prosecdef::text
           || ' searchpath=' || case when array_to_string(coalesce(p.proconfig,'{}'),',') ilike '%search_path%' then 'ja' else 'NEIN' end
           || ' anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
           || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
           || ' service=' || has_function_privilege('service_role', p.oid, 'EXECUTE')::text as z
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='log_security_event'`,
    ),
    pruefe: t => t.includes('secdef=t') && t.includes('searchpath=ja')
      && t.includes('anon=false') && t.includes('authenticated=false') && t.includes('service=true'),
    hinweisWennRot:
      'Jede public-Funktion ist per Default anon-ausfuehrbar. Ohne REVOKE ist '
      + 'das eine offene Schreibtuer in die Sicherheitsspur.',
  },
  {
    id: 'S6',
    titel: 'Unveraenderlichkeits-Trigger steht und ist scharf',
    erwartung: 'trg_security_audit_log_unveraenderlich, enabled=O',
    lauf: () => orakel(
      `select coalesce(string_agg(tgname || ' enabled=' || tgenabled::text, ', '), '(keiner)') as z
         from pg_trigger
        where tgrelid = 'public.security_audit_log'::regclass and not tgisinternal`,
    ),
    pruefe: t => t.includes('trg_security_audit_log_unveraenderlich') && t.includes('enabled=O'),
    hinweisWennRot:
      'Ohne Trigger kann der Dienstschluessel die Spur ueberschreiben — RLS haelt '
      + 'ihn nicht auf, service_role umgeht sie.',
  },
  {
    id: 'S7',
    titel: 'Fremdschluessel auf auth.users steht auf SET NULL',
    erwartung: 'a (= ON DELETE SET NULL)',
    lauf: () => orakel(
      `select coalesce(string_agg(c.conname || '=' || c.confdeltype::text, ', '), '(keiner)') as z
         from pg_constraint c
        where c.conrelid='public.security_audit_log'::regclass and c.contype='f'`,
    ),
    pruefe: t => t.includes('=a'),
    hinweisWennRot:
      'Steht der Fremdschluessel auf NO ACTION, blockiert jede Sicherheitszeile '
      + 'die endgueltige Kontoloeschung (Art. 17 DSGVO) mit 23503.',
  },
  {
    id: 'S8',
    titel: 'Rollenmatrix: sicherheit.lesen da, marketing.verwalten nicht verloren',
    erwartung: 'admin: sicherheit=t marketing=t | pdl: sicherheit=f',
    lauf: () => orakel(
      `select 'admin: sicherheit=' || ('sicherheit.lesen' = any(public.rollen_matrix('admin')))::text
           || ' marketing=' || ('marketing.verwalten' = any(public.rollen_matrix('admin')))::text
           || ' | pdl: sicherheit=' || ('sicherheit.lesen' = any(public.rollen_matrix('pdl')))::text as z`,
    ),
    pruefe: t => t.includes('sicherheit=true') && t.includes('marketing=true') && t.includes('pdl: sicherheit=false'),
    hinweisWennRot:
      'public.rollen_matrix ist eine GETEILTE Funktion — die zuletzt angewendete '
      + 'Migration gewinnt. Faellt sicherheit.lesen heraus, traegt nur noch der '
      + 'zweite Weg in ist_sicherheitsadmin() (is_admin()). Reihenfolge pruefen: '
      + '20261018000000 muss NACH 20261019000002 laufen, oder 20261019000002 muss '
      + 'die vollstaendige Liste aus lib/auth/rollen.ts fuehren.',
  },
  {
    id: 'S10',
    titel: 'Keine Spalte, die ein Geheimnis tragen koennte',
    erwartung: 'keine',
    // Die Abfrage muss ZUERST feststellen, dass es die Tabelle gibt.
    // Sonst liefert sie „(keine) verdaechtige Spalte" auch dann, wenn es
    // ueberhaupt keine Spalte gibt — ein gruener Haken fuer eine Pruefung,
    // die gar nicht stattgefunden hat.
    lauf: () => orakel(
      `select case
                when not exists (
                  select 1 from information_schema.tables
                   where table_schema='public' and table_name='security_audit_log'
                ) then 'TABELLE FEHLT'
                else coalesce((
                  select string_agg(column_name, ', ')
                    from information_schema.columns
                   where table_schema='public' and table_name='security_audit_log'
                     and (column_name ilike '%passwor%' or column_name ilike '%token%'
                       or column_name ilike '%cookie%' or column_name ilike '%secret%'
                       or column_name ilike '%mac%')
                ), 'keine')
              end as z`,
    ),
    pruefe: t => t.includes('keine') && !t.includes('TABELLE FEHLT'),
    hinweisWennRot:
      '„TABELLE FEHLT" heisst: Migration nicht angewendet, die Pruefung hat '
      + 'nicht stattgefunden. Steht dort ein Spaltenname, gehoert die Spalte '
      + 'entfernt — siehe docs/security/AUDIT_SYSTEM.md, Abschnitt 2.',
  },

  // ── Berichte (kein Pass/Fail, aber die Zahlen, die man wissen will) ──
  {
    id: 'S9',
    nurBericht: true,
    titel: 'Bestand der Sicherheitsspur',
    lauf: () => orakel(
      `select event_type || ': ' || anzahl::text || ' (aelteste ' || coalesce(aeltester::text,'—') || ')' as z
         from (
           select event_type, count(*) as anzahl, min(created_at)::date as aeltester
             from public.security_audit_log
            group by event_type
            order by count(*) desc
            limit 25
         ) s`,
    ),
  },
  {
    id: 'S11',
    nurBericht: true,
    titel: 'Metadaten-Schluessel im Bestand (Gegenprobe zum Geheimnis-Filter)',
    lauf: () => orakel(
      `select k || ': ' || n::text as z from (
         select k, count(*) as n
           from public.security_audit_log l, jsonb_object_keys(coalesce(l.metadata,'{}'::jsonb)) k
          group by k order by count(*) desc limit 30
       ) s`,
    ),
  },
  {
    id: 'S12',
    nurBericht: true,
    titel: 'Ueberwachte Konten (security_watchlist)',
    lauf: () => orakel(
      `select coalesce(count(*)::text, '0') || ' Eintraege, davon aktiv: '
           || coalesce(count(*) filter (where aktiv)::text, '0') as z
         from public.security_watchlist`,
    ),
  },
]

// ── Lauf ──────────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════════')
console.log(' Security- und Audit-System — Live-Pruefung')
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

const geprueft = PRUEFUNGEN.filter(p => !p.nurBericht).length
console.log('\n───────────────────────────────────────────────────────────────')
console.log(` ${geprueft - offen} von ${geprueft} Pruefungen bestanden, ${berichte} Berichte.`)
if (offen > 0) console.log(' Offene Punkte sind oben mit OFFEN markiert.')
console.log('───────────────────────────────────────────────────────────────')

process.exit(offen > 0 ? 1 : 0)
