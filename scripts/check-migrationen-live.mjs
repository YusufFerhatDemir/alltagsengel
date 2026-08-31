#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * Welche Migration steht live — und welche nur im Repo?
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WARUM ES DAS BRAUCHT
 *
 * Dieses Projekt hat keine funktionierende Migrationsbuchhaltung. Die
 * Dateien ab `20260901…` tragen ZUKUNFTS-Zeitstempel (bewusst, wegen der
 * Anwendungsreihenfolge von `rollen_matrix()`), und `supabase db push`
 * ist deshalb ausdruecklich verboten — es saehe alle als „nicht
 * angewendet". Die Frage „ist X live?" wurde bisher aus
 * `docs/MIGRATION_LEDGER.md` beantwortet, also aus einer von Hand
 * gepflegten Liste.
 *
 * Am 31.08.2026 stimmte diese Liste an fuenf Stellen nicht:
 *
 *   - Der Ledger fuehrte drei Marketing-Migrationen als „OFFEN". Alle
 *     drei stehen live (6 Tabellen, `marketing.verwalten` in
 *     `rollen_matrix()`, `mis_audit_log_action_check` erweitert).
 *   - Umgekehrt galten `20261008000000` und `20261009000000` als
 *     erledigt; live fehlen die Funktionen bzw. der eindeutige Index.
 *
 * Beide Richtungen sind gefaehrlich. „Faelschlich offen" kostet Zeit;
 * „faelschlich live" laesst eine Sperre als vorhanden gelten, die es
 * nicht gibt — bei `20261009000000` heisst das: zwei aktive
 * Massnahmenplaene je Klient sind weiter moeglich.
 *
 * ── WIE GEPRUEFT WIRD ─────────────────────────────────────────────────
 *
 * Nicht durch Nachbilden der Migration, sondern durch eine Frage an den
 * Katalog nach dem OBJEKT, das sie hinterlaesst: eine Funktion, ein
 * Trigger, ein eindeutiger Index, ein CHECK, eine Policy, ein Recht.
 * Steht das Objekt, ist die Migration angewendet.
 *
 * Zwei Fallen sind darin schon eingearbeitet:
 *
 *   1. RECHTE: `information_schema.*_privileges` zeigt PUBLIC-Grants
 *      nicht und meldete `angels` faelschlich als ungeschuetzt. Rechte
 *      werden ausschliesslich mit `has_*_privilege()` geprueft.
 *   2. NAMEN: der Constraint auf `kim_audit_log` heisst nicht
 *      `…action…`, sondern `kim_audit_log_aktion_check`. Eine Probe, die
 *      per LIKE raet, meldet „fehlt", wo nichts fehlt. Jede Probe nennt
 *      deshalb den exakten Namen.
 *
 * Der Katalog deckt die Dateien ab `20261006000000` ab. Alles davor gilt
 * seit dem 27.08.2026 als angewendet (227+ Migrationen, damals gegen die
 * Live-Datenbank geprueft).
 *
 * Aufruf:  npm run check:migrationen
 * Exit 0 = alle geprueften Migrationen stehen, 1 = mindestens eine fehlt.
 */

import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Es wurde NICHTS geprueft — dieser Lauf ist kein Nachweis.')
  process.exit(2)
}

/**
 * Je Migration: der SQL-Ausdruck, der die Zahl der gefundenen Objekte
 * liefert, und wie viele es sein muessen. `was` steht im Bericht.
 */
const KATALOG = [
  { datei: '20261006000000_sepa_batch_items_kein_doppelter_einzug',
    was: 'eindeutiger Index uq_sepa_batch_items_invoice_offen',
    soll: 1,
    sql: `SELECT count(*) FROM pg_indexes WHERE indexname='uq_sepa_batch_items_invoice_offen'` },
  { datei: '20261007000000_pflege_risiko_dashboard_org_fence',
    was: 'org_fence-Policy auf den Risiko-Tabellen',
    soll: 1, mindestens: true,
    sql: `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'pflege_risik%' AND policyname LIKE '%org_fence%'` },
  { datei: '20261007000002_sis_abschluss_sperre_haertung',
    was: 'prevent_locked_sis_edit + prevent_locked_sis_child_edit',
    soll: 2,
    sql: `SELECT count(*) FROM pg_proc WHERE proname IN ('prevent_locked_sis_edit','prevent_locked_sis_child_edit')` },
  { datei: '20261008000000_vitalwerte_plausibilitaet_db_check',
    was: 'die vier Funktionen vitals_plausibel_*',
    soll: 4,
    sql: `SELECT count(*) FROM pg_proc WHERE proname LIKE 'vitals_plausibel%'` },
  { datei: '20261009000000_pflege_massnahmenplaene_ein_aktiver_plan',
    was: 'eindeutiger Index uq_pflege_massnahmenplaene_ein_aktiver_plan',
    soll: 1,
    sql: `SELECT count(*) FROM pg_indexes WHERE indexname='uq_pflege_massnahmenplaene_ein_aktiver_plan'` },
  { datei: '20261009000002_coach_freischaltung_bestellung_unique',
    was: 'Index idx_coach_freischaltungen_bestellung',
    soll: 1,
    sql: `SELECT count(*) FROM pg_indexes WHERE indexname='idx_coach_freischaltungen_bestellung'` },
  { datei: '20261009000004_pflege_anamnese_abschluss_sperre_haertung',
    was: 'prevent_locked_anamnese_edit',
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='prevent_locked_anamnese_edit'` },
  { datei: '20261010000000_medikamente_abgesetzt_sperre_db',
    was: 'Trigger trg_locked_medikament auf medikamente',
    soll: 1,
    sql: `SELECT count(*) FROM pg_trigger WHERE tgname='trg_locked_medikament'` },
  { datei: '20261010000002_wund_kindtabellen_sperre_db',
    was: 'die drei Trigger trg_locked_wound_*',
    soll: 3,
    sql: `SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_locked_wound_assessment','trg_locked_wound_treatment','trg_locked_wound_photo')` },
  { datei: '20261010000004_pflege_verlauf_backdating_sperre_db',
    was: 'Trigger trg_verlauf_periode_offen',
    soll: 1,
    sql: `SELECT count(*) FROM pg_trigger WHERE tgname='trg_verlauf_periode_offen'` },
  { datei: '20261010000006_kim_audit_anhang_abgewiesen',
    // Der Constraint heisst 'aktion', nicht 'action'. Eine LIKE-Probe
    // meldete hier faelschlich „fehlt".
    was: "kim_audit_log_aktion_check kennt 'anhang_abgewiesen'",
    soll: 1,
    sql: `SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
           WHERE t.relname='kim_audit_log' AND c.conname='kim_audit_log_aktion_check'
             AND pg_get_constraintdef(c.oid) LIKE '%anhang_abgewiesen%'` },
  { datei: '20261011000000_dienstplan_nachtdienst_doppelbelegung',
    was: 'Trigger trg_check_doppelbelegung',
    soll: 1,
    sql: `SELECT count(*) FROM pg_trigger WHERE tgname='trg_check_doppelbelegung'` },
  { datei: '20261011000001_medikament_eingaben_doppelgabe',
    was: 'eindeutiger Index uq_medikament_eingaben_gabe',
    soll: 1,
    sql: `SELECT count(*) FROM pg_indexes WHERE indexname='uq_medikament_eingaben_gabe'` },
  { datei: '20261012000000_assignment_overlap_nachtdienst',
    // Die alte Fassung verglich nur Minuten innerhalb EINES Tages. Der
    // Mitternachtsuebergang steckt im Versatz-Ausdruck; der ist das
    // Kennzeichen der neuen Fassung.
    was: 'check_assignment_overlap rechnet ueber Mitternacht (versatz * 1440)',
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='check_assignment_overlap'
            AND pg_get_functiondef(oid) LIKE '%versatz * 1440%'` },
  { datei: '20261013000000_rechnung_stornierte_nachweise',
    was: 'create_invoice_draft_atomic schliesst Stornos aus',
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='create_invoice_draft_atomic'
            AND pg_get_functiondef(oid) LIKE '%storn%'` },
  { datei: '20261013000002_budget_used_amount_statuswerte',
    was: 'rechne_budget_verbrauch_neu',
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='rechne_budget_verbrauch_neu'` },
  { datei: '20261014000000_rollenmatrix_bonus_verwalten',
    was: "rollen_matrix() kennt 'bonus.verwalten'",
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='rollen_matrix' AND pg_get_functiondef(oid) LIKE '%bonus.verwalten%'` },
  { datei: '20261015000000_angels_policy_haertung',
    // Rechte NIE ueber information_schema pruefen — dort fehlen
    // PUBLIC-Grants, und die Antwort war faelschlich „kein Recht".
    was: 'angels: UPDATE nur auf den vier freigegebenen Spalten',
    soll: 1,
    sql: `SELECT count(*) WHERE NOT has_table_privilege('authenticated','public.angels','UPDATE')
            AND has_column_privilege('authenticated','public.angels','bio','UPDATE')
            AND NOT has_column_privilege('authenticated','public.angels','hourly_rate','UPDATE')` },
  { datei: '20261016000000_loeschkette_bookings_angel_fk',
    was: 'bookings-Fremdschluessel mit ON DELETE SET NULL',
    soll: 1, mindestens: true,
    sql: `SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
           WHERE t.relname='bookings' AND c.contype='f' AND c.confdeltype='n'` },
  { datei: '20261017000000_abrechnungsintegritaet_leistungsnachweis',
    was: 'Trigger trg_a_unterschrift_beleg',
    soll: 1,
    sql: `SELECT count(*) FROM pg_trigger WHERE tgname='trg_a_unterschrift_beleg'` },
  { datei: '20261017000002_obergrenze_angebotstyp',
    was: 'angebotstyp_von_leistungsart',
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='angebotstyp_von_leistungsart'` },
  { datei: '20261018000000_rollenmatrix_sicherheit_lesen',
    was: "rollen_matrix() kennt 'sicherheit.lesen'",
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='rollen_matrix' AND pg_get_functiondef(oid) LIKE '%sicherheit.lesen%'` },
  { datei: '20261018000002_security_audit_log',
    was: 'log_security_event',
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='log_security_event'` },
  { datei: '20261018000004_security_watchlist_kontoalarm',
    was: 'Trigger trg_security_audit_profil_aenderung',
    soll: 1,
    sql: `SELECT count(*) FROM pg_trigger WHERE tgname='trg_security_audit_profil_aenderung'` },
  { datei: '20261019000000_marketing_crm',
    was: 'die sechs Marketing-Tabellen',
    soll: 6,
    sql: `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
            AND table_name IN ('marketing_consents','email_suppression_list','email_templates',
                               'email_campaigns','email_campaign_logs','marketing_automations')` },
  { datei: '20261019000002_rollenmatrix_marketing_verwalten',
    was: "rollen_matrix() kennt 'marketing.verwalten'",
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='rollen_matrix' AND pg_get_functiondef(oid) LIKE '%marketing.verwalten%'` },
  { datei: '20261019000004_audit_action_marketing',
    was: 'mis_audit_log_action_check kennt die Marketing-Aktionen',
    soll: 1,
    sql: `SELECT count(*) FROM pg_constraint WHERE conname='mis_audit_log_action_check'
            AND pg_get_constraintdef(oid) LIKE '%marketing%'` },
  { datei: '20261020000000_standortfreigabe',
    was: 'location_sharing_settings + location_updates',
    soll: 2,
    sql: `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
            AND table_name IN ('location_sharing_settings','location_updates')` },
  { datei: '20261021000000_campaign_logs_provider_id',
    was: 'email_campaign_logs.provider_id',
    soll: 1,
    sql: `SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
            AND table_name='email_campaign_logs' AND column_name='provider_id'` },
  { datei: '20261021000002_secdef_trigger_revoke',
    // Umgekehrte Zaehlrichtung: hier muss die Zahl auf NULL stehen.
    was: 'keine SECURITY-DEFINER-Triggerfunktion mehr fuer anon ausfuehrbar',
    soll: 0,
    sql: `SELECT count(*) FROM pg_proc p WHERE p.prosecdef
            AND p.pronamespace='public'::regnamespace AND p.prorettype='trigger'::regtype
            AND has_function_privilege('anon', p.oid, 'EXECUTE')` },
  { datei: '20261021000004_is_internal_staff_ohne_buero',
    was: "is_internal_staff() nennt 'buero' nicht mehr",
    soll: 1,
    sql: `SELECT count(*) FROM pg_proc WHERE proname='is_internal_staff'
            AND pg_get_functiondef(oid) NOT LIKE '%buero%'` },
  { datei: '20261022000000_rk_lesepolicies_verwaltungsrollen',
    was: 'die 24 Lesepolicies rk_<tabelle>_lesen',
    soll: 24,
    sql: `SELECT count(*) FROM pg_policies WHERE schemaname='public'
            AND policyname LIKE 'rk\\_%\\_lesen' AND cmd='SELECT'
            AND qual LIKE '%current_org_id()%'
            AND tablename IN ('absences','applications','bookings','care_notes','caregiver_bonuses',
              'caregiver_documents','caregiver_initials_history','caregiver_qualifications',
              'client_preferred_substitutes','cooperation_partners','datenannahmestellen',
              'dta_dakota_auftraege','einsatz_absagen','kostentraeger_kontakte','monthly_closings',
              'ocr_results','partner_visits','payment_allocations','payment_status','review_errors',
              'state_settings','substitution_requests','verordnung_leistungen','verordnungen')` },
]

const FELD = '<<|>>'

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
  const i = msg.indexOf('ORAKEL:')
  if (i === -1) throw new Error(`HTTP ${res.status}: ${msg.slice(0, 500)}`)
  return msg.slice(i + 7).replace(/\\n/g, '\n')
}

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' MIGRATIONEN — steht sie live, oder nur im Repo?')
console.log(` ${new Date().toISOString()}`)
console.log('═══════════════════════════════════════════════════════════════════')
console.log()
console.log(`Geprueft werden ${KATALOG.length} Migrationen ab 20261006000000.`)
console.log('Alles davor gilt seit dem 27.08.2026 als angewendet (227+ Dateien).')
console.log()

const ausdruck = KATALOG
  .map((e, i) => `'${i}=' || (${e.sql})::text`)
  .join(` || '${FELD}' || `)
const roh = await orakel(
  `DO $ora$ DECLARE r text; BEGIN SELECT ${ausdruck} INTO r; RAISE EXCEPTION 'ORAKEL:%', r; END $ora$;`,
)
const zahlen = Object.fromEntries(roh.split(FELD).map(s => {
  const [i, n] = s.split('=')
  return [Number(i), Number(n)]
}))

const offen = []
for (const [i, e] of KATALOG.entries()) {
  const ist = zahlen[i]
  const steht = e.mindestens ? ist >= e.soll : ist === e.soll
  const marke = steht ? '✅' : '❌'
  console.log(`${marke} ${e.datei}`)
  console.log(`     ${e.was} — gefunden ${ist}, erwartet ${e.mindestens ? '≥' : ''}${e.soll}`)
  if (!steht) offen.push(e)
}

console.log()
console.log('═══════════════════════════════════════════════════════════════════')
if (offen.length === 0) {
  console.log(` ✅ Alle ${KATALOG.length} geprueften Migrationen stehen live.`)
  console.log('═══════════════════════════════════════════════════════════════════')
  process.exit(0)
}
console.log(` ${offen.length} MIGRATION(EN) STEHEN NICHT LIVE:`)
for (const e of offen) console.log(`   ${e.datei}`)
console.log()
console.log(' Anwenden im Supabase-SQL-Editor als `postgres`. Ueber den')
console.log(' Dienstschluessel scheitert jedes DDL am Eigentuemer (42501) —')
console.log(' geprueft am 31.08.2026 mit CREATE POLICY auf public.absences.')
console.log('═══════════════════════════════════════════════════════════════════')
process.exit(1)
