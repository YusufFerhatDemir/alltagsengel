#!/usr/bin/env node
/**
 * Live-Nachweis fuer Track 7 (API-Routes Security Audit).
 *
 * Prueft ausschliesslich TATSACHEN gegen die Produktionsdatenbank — keine
 * Annahmen aus dem Repo. Jeder Punkt beantwortet genau eine Frage, die
 * sich ohne Datenbank nicht beantworten laesst.
 *
 * Aufruf:  node scripts/verify-api-routes-live.mjs
 */
import { apiHeaders, secretKey, envWert } from './lib/supabase-keys.mjs'

const URL_ = envWert('NEXT_PUBLIC_SUPABASE_URL')
const KEY = secretKey()
if (!URL_ || !KEY) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const H = apiHeaders(KEY, { 'Content-Type': 'application/json' })

const ergebnisse = []
const pruefe = (id, ok, meldung) => ergebnisse.push({ id, ok, meldung })

async function orakel(sql) {
  const wrapped =
    `DO $ORK$ DECLARE r text; BEGIN `
    + `SELECT coalesce(string_agg(z::text, chr(10)), '(leer)') INTO r FROM (${sql}) t(z); `
    + `RAISE EXCEPTION 'ORAKEL:%', r; END $ORK$;`
  const res = await fetch(`${URL_}/rest/v1/rpc/_run_sql`, {
    method: 'POST', headers: H, body: JSON.stringify({ p: wrapped }),
  })
  const text = await res.text()
  let j = null
  try { j = JSON.parse(text) } catch { /* Fehlertexte sind nicht immer JSON */ }
  const msg = j?.message ?? text
  const i = msg.indexOf('ORAKEL:')
  if (i === -1) throw new Error(`Orakel unerwartet (HTTP ${res.status}): ${msg.slice(0, 300)}`)
  return msg.slice(i + 7).trim()
}

async function main() {
  // ── B2: der Empfehlungsbonus ────────────────────────────────────────
  //
  // Der Kern des Befundes: die Route rief eine RPC auf, die es nicht gibt.
  // Ohne diese Pruefung ist das eine Behauptung.
  const rpc = await orakel(
    `select proname from pg_proc where proname = 'increment_referral_credit'`)
  pruefe(
    'B2.1 increment_referral_credit existiert live NICHT',
    rpc === '(leer)',
    `pg_proc: ${rpc}`,
  )

  const credit = await orakel(
    `select count(*)::text from information_schema.columns
     where table_name='profiles' and column_name='referral_credit'`)
  pruefe(
    'B2.2 profiles.referral_credit existiert (der Lese-Schreib-Weg kann buchen)',
    credit === '1',
    `Spalten: ${credit}`,
  )

  const skala = await orakel(
    `select coalesce(numeric_scale::text,'ohne') from information_schema.columns
     where table_name='profiles' and column_name='referral_credit'`)
  pruefe(
    'B2.3 referral_credit ist numeric OHNE Skala — der Wert ist EURO, nicht Cent',
    skala === 'ohne',
    `numeric_scale: ${skala}`,
  )

  const referrals = await orakel(
    `select 'gesamt='||count(*)||' offen='||count(*) filter (where status='pending')
       ||' abgeschlossen='||count(*) filter (where status='completed') from referrals`)
  pruefe(
    'B2.4 kein Bestand mit verbranntem Vorgang ohne Gutschrift (Backfill entbehrlich)',
    referrals.includes('gesamt=0'),
    referrals,
  )

  // ── B3: die Tourenvorlagen ──────────────────────────────────────────
  //
  // Zwei Fragen: gibt es den Fremdschluessel-Join ueberhaupt (sonst waere
  // der Befund harmlos), und liegt live eine fehlgeleitete Zeile?
  // Ueber pg_constraint, nicht ueber information_schema: der uebliche
  // Dreier-Join dort (table_constraints + key_column_usage +
  // constraint_column_usage) liefert bei mehrspaltigen bzw. mehreren
  // Constraints ein Kreuzprodukt und hier gar nichts — der erste Versuch
  // dieser Pruefung meldete faelschlich „kein FK".
  const fkJoin = await orakel(
    `select conname||' | '||pg_get_constraintdef(oid)
     from pg_constraint
     where conrelid='public.tour_templates'::regclass and contype='f'
       and conname like '%caregiver%'`)
  pruefe(
    'B3.1 caregiver_id zeigt OHNE Mandantenbedingung auf caregivers — der Embed folgt ihm',
    fkJoin.includes('REFERENCES caregivers(id)'),
    fkJoin,
  )

  const fence = await orakel(
    `select policyname||' permissive='||permissive from pg_policies
     where tablename='tour_templates' and policyname like '%org%'`)
  pruefe(
    'B3.2 tour_templates traegt einen org_fence — der Dienstschluessel umgeht ihn',
    fence !== '(leer)',
    fence,
  )

  const fremd = await orakel(
    `select 'zeilen='||count(*)||' fremde_caregiver='||count(*) filter (
        where t.caregiver_id is not null
          and not exists (select 1 from caregivers c
                          where c.id=t.caregiver_id and c.organization_id=t.organization_id))
     from tour_templates t`)
  pruefe(
    'B3.3 live KEINE Vorlage mit mandantenfremder caregiver_id (Befund war latent)',
    fremd.includes('fremde_caregiver=0'),
    fremd,
  )

  // ── B4: das KIM-Adressbuch ──────────────────────────────────────────
  //
  // Die Einordnung des Befundes haengt daran, WAS in der Tabelle steht und
  // ob die Mandantengrenze davon unabhaengig ist.
  const kimSpalten = await orakel(
    `select string_agg(column_name, ', ' order by ordinal_position)
     from information_schema.columns where table_name='kim_addresses'`)
  pruefe(
    'B4.1 kim_addresses fuehrt IK/LANR/BSNR — die or()-Einschleusung war ein Abfragewerkzeug darauf',
    kimSpalten.includes('ik_nummer') && kimSpalten.includes('lanr'),
    kimSpalten,
  )

  const kimFence = await orakel(
    `select policyname||' permissive='||permissive from pg_policies
     where tablename='kim_addresses' and policyname like '%org%'`)
  pruefe(
    'B4.2 kim_addresses traegt einen RESTRICTIVE org_fence — die Mandantengrenze fiel NICHT',
    kimFence.includes('RESTRICTIVE'),
    kimFence,
  )

  // ── B5: die zeitliche Begrenzung ────────────────────────────────────
  const rl = await orakel(
    `select proname from pg_proc where proname='api_rate_limit_hit'`)
  pruefe(
    'B5.1 api_rate_limit_hit existiert — rateLimitPersistent zaehlt wirklich in der DB',
    rl.includes('api_rate_limit_hit'),
    rl,
  )

  // ── Rahmen ──────────────────────────────────────────────────────────
  const orgs = await orakel(`select count(*)::text from organizations`)
  pruefe(
    'R.1 es gibt mehr als eine Organisation — ein Mandantenleck haette echte Fremdmandanten getroffen',
    Number(orgs) > 1,
    `organizations: ${orgs}`,
  )

  // ── Bericht ─────────────────────────────────────────────────────────
  const gruen = ergebnisse.filter(e => e.ok).length
  console.log('\nTrack 7 — Live-Nachweis\n' + '─'.repeat(60))
  for (const e of ergebnisse) {
    console.log(`${e.ok ? '✅' : '❌'} ${e.id}`)
    console.log(`    ${e.meldung}`)
  }
  console.log('─'.repeat(60))
  console.log(`${gruen}/${ergebnisse.length} gruen`)
  process.exit(gruen === ergebnisse.length ? 0 : 1)
}

main().catch(err => {
  console.error('Abbruch:', err.message)
  process.exit(2)
})
