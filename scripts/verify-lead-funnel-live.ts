/**
 * Live-Beleg Lead-Funnel: fährt den PRODUKTIONSCODE gegen die Live-DB.
 *
 *   npx tsx --require ./scripts/test-stubs/server-only-stub.cjs scripts/verify-lead-funnel-live.ts
 *
 * Nur lesend. Versendet nichts, schreibt nichts — die Tages-Kette
 * `lead_follow_up` meldet selbst im 05:00-Cron.
 *
 * Belegt:
 *  1. zaehleLeadFollowUps() — genau die Zählung der Kette, live
 *  2. Warteliste: Stufe + Priorität + Aufschlüsselung je Eintrag
 *  3. Bewerbungen: feine Stufe, Wiedervorlage, Follow-up je Eintrag
 * Exit 1, wenn eine Abfrage scheitert.
 */
import { createClient } from '@supabase/supabase-js'
import { zaehleLeadFollowUps } from '../lib/automation/lead-follow-up'
import { berechnePrioritaet, sortiereWarteliste, type WartelisteLead } from '../lib/warteliste/prioritaet'
import { stufeAusDbWert, wartelisteStufeMeta } from '../lib/warteliste/katalog'
import { stufeFuerBewerbung, followUpFuerBewerbung, wiedervorlageFuerBewerbung, bewerberStufe } from '../lib/bewerbung/pipeline'
import { BEWERBUNG_FILTER } from '../lib/admin/ops'
import { DEFAULT_ORG_ID } from '../lib/organizations/types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })
const jetzt = new Date()
let rot = false

async function main() {
  console.log(`Lauf: ${jetzt.toISOString()}  Org: ${DEFAULT_ORG_ID}\n`)

  const z = await zaehleLeadFollowUps(sb as any, DEFAULT_ORG_ID, jetzt)
  console.log('── 1. zaehleLeadFollowUps (Kette 13, ohne Versand) ──')
  console.log(JSON.stringify({ warteliste: z.warteliste, bewerbungen: z.bewerbungen, anfragen: z.anfragen }, null, 1))
  if (z.fehler.length) { rot = true; console.log('FEHLER:', z.fehler) }

  const { data: wl, error: e1 } = await sb.from('state_waitlist')
    .select('id, name, status, pflegegrad, ort, bundesland, gewuenschte_leistungen, nachricht, quelle, created_at, updated_at')
    .eq('organization_id', DEFAULT_ORG_ID)
  if (e1) { rot = true; console.log('state_waitlist:', e1.message) }
  const leads: (WartelisteLead & { name: string })[] = (wl ?? []).map((r: any) => ({
    id: r.id, name: r.name, stufe: stufeAusDbWert(r.status), pflegegrad: r.pflegegrad, region: r.ort,
    bundesland: r.bundesland, gewuenschte_leistungen: r.gewuenschte_leistungen ?? [], nachricht: r.nachricht,
    quelle: r.quelle, created_at: r.created_at, updated_at: r.updated_at,
  }))
  console.log(`\n── 2. Warteliste (${leads.length} Einträge), sortiert nach Priorität ──`)
  for (const l of sortiereWarteliste(leads, 'prioritaet', x => berechnePrioritaet(x, jetzt))) {
    const p = berechnePrioritaet(l, jetzt)
    console.log(`${String(p.punkte).padStart(5)}  ${wartelisteStufeMeta(l.stufe).label.padEnd(11)} ${p.followUp.padEnd(10)} ${l.name}`)
    console.log(`       ${p.teile.map(t => `${t.kriterium}:${t.grund}(+${t.punkte})`).join(' | ')}`)
  }

  const { data: bw, error: e2 } = await sb.from('lead_inquiries')
    .select('id, name, status, created_at, updated_at, follow_up_date, bewerbung_daten')
    .eq('organization_id', DEFAULT_ORG_ID).or(BEWERBUNG_FILTER).order('created_at', { ascending: false })
  if (e2) { rot = true; console.log('lead_inquiries:', e2.message) }
  const stufen: Record<string, number> = {}
  const fu: Record<string, number> = {}
  for (const r of bw ?? []) {
    const { stufe } = stufeFuerBewerbung(r.bewerbung_daten, r.status)
    stufen[stufe] = (stufen[stufe] ?? 0) + 1
    const f = followUpFuerBewerbung({ stufe, created_at: r.created_at, updated_at: r.updated_at, follow_up_date: r.follow_up_date }, jetzt)
    fu[f] = (fu[f] ?? 0) + 1
  }
  console.log(`\n── 3. Bewerbungen (${bw?.length ?? 0}) ──`)
  console.log('Stufen:', JSON.stringify(stufen), '\nFollow-up:', JSON.stringify(fu))
  console.log('Jüngste 3:')
  for (const r of (bw ?? []).slice(0, 3)) {
    const { stufe } = stufeFuerBewerbung(r.bewerbung_daten, r.status)
    const e = { stufe, created_at: r.created_at, updated_at: r.updated_at, follow_up_date: r.follow_up_date }
    console.log(`  ${bewerberStufe(stufe).label.padEnd(20)} WV=${wiedervorlageFuerBewerbung(e) ?? '—'}  FU=${followUpFuerBewerbung(e, jetzt)}  ${r.name}`)
  }

  console.log(rot ? '\nERGEBNIS: ROT' : '\nERGEBNIS: GRÜN')
  process.exit(rot ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
