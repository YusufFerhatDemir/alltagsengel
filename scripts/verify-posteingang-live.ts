/**
 * Live-Beleg Priority Inbox: PRODUKTIONSCODE gegen die Live-Datenbank.
 *
 *   npx tsx --require ./scripts/test-stubs/server-only-stub.cjs scripts/verify-posteingang-live.ts
 *
 * Nur lesend, versendet nichts. Zeigt dieselbe Liste wie /admin/posteingang
 * (dieselben Funktionen aus lib/leads/posteingang.ts) — damit lässt sich die
 * Seite ohne Anmeldung prüfen. Exit 1, wenn eine Quelle nicht lesbar ist.
 */
import { createClient } from '@supabase/supabase-js'
import {
  ausWarteliste, ausBewerbung, ausAnfrage, sortierePosteingang, zaehlePosteingang,
  posteingangSatz, AMPEL_META, ART_META, type PosteingangEintrag,
} from '../lib/leads/posteingang'
import { BEWERBUNG_FILTER } from '../lib/admin/ops'
import { DEFAULT_ORG_ID } from '../lib/organizations/types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Supabase-Zugang fehlt'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })
const jetzt = new Date()
let rot = false

async function main() {
  const [wl, bew, anf] = await Promise.all([
    sb.from('state_waitlist')
      .select('id, name, email, telefon, status, pflegegrad, ort, bundesland, gewuenschte_leistungen, nachricht, quelle, created_at, updated_at')
      .eq('organization_id', DEFAULT_ORG_ID),
    sb.from('lead_inquiries')
      .select('id, name, email, phone, status, source, created_at, updated_at, follow_up_date, bewerbung_daten')
      .eq('organization_id', DEFAULT_ORG_ID).or(BEWERBUNG_FILTER).in('status', ['new', 'contacted', 'qualified']),
    sb.from('lead_inquiries')
      .select('id, name, email, phone, status, source, created_at, updated_at, follow_up_date')
      .eq('organization_id', DEFAULT_ORG_ID).eq('art', 'anfrage').neq('source', 'engel-bewerbung')
      .in('status', ['new', 'contacted', 'qualified']),
  ])
  for (const [name, r] of [['state_waitlist', wl], ['Bewerbungen', bew], ['Anfragen', anf]] as const) {
    if (r.error) { rot = true; console.log(`FEHLER ${name}: ${r.error.message}`) }
  }

  const eintraege: PosteingangEintrag[] = []
  for (const z of wl.data ?? []) {
    const e = ausWarteliste({
      id: z.id, name: z.name, email: z.email, telefon: z.telefon, status: z.status,
      pflegegrad: z.pflegegrad ?? null, region: z.ort ?? null, bundesland: z.bundesland ?? null,
      gewuenschte_leistungen: Array.isArray(z.gewuenschte_leistungen) ? z.gewuenschte_leistungen : [],
      nachricht: z.nachricht ?? null, quelle: z.quelle ?? null,
      created_at: z.created_at, updated_at: z.updated_at ?? null,
    }, jetzt)
    if (e) eintraege.push(e)
  }
  for (const z of bew.data ?? []) { const e = ausBewerbung(z as never, jetzt); if (e) eintraege.push(e) }
  for (const z of anf.data ?? []) { const e = ausAnfrage(z as never, jetzt); if (e) eintraege.push(e) }

  const liste = sortierePosteingang(eintraege)
  const z = zaehlePosteingang(liste)
  console.log(`Lauf: ${jetzt.toISOString()}`)
  console.log(posteingangSatz(z))
  console.log(`je Art: Warteliste ${z.jeArt.warteliste} · Bewerbungen ${z.jeArt.bewerbung} · Anfragen ${z.jeArt.anfrage}`)
  console.log(
    `Kennzahlen: >24h ${z.gelb} · >48h ${z.orange} · >72h ${z.rot} · >7 Tage ${z.schwarz} · `
    + `ältester ${Math.floor(z.aeltesteStunden / 24)} Tage · heute fällig ${z.heuteFaellig} · `
    + `Rückrufe ${z.rueckrufe} · Termine ${z.termine}\n`,
  )
  console.log('Ampel  Art           Offen  Stufe           Name                      Nächster Schritt')
  for (const e of liste.slice(0, 25)) {
    console.log(
      `${AMPEL_META[e.ampel].label.padEnd(12).slice(0, 12)} ${ART_META[e.art].label.padEnd(13)} `
      + `${String(e.stundenOffen).padStart(4)}h ${e.stufeLabel.padEnd(15).slice(0, 15)} `
      + `${e.name.padEnd(25).slice(0, 25)} ${e.hinweis.slice(0, 40)}`,
    )
  }
  if (liste.length > 25) console.log(`… und ${liste.length - 25} weitere`)
  console.log(rot ? '\nERGEBNIS: ROT' : '\nERGEBNIS: GRÜN')
  process.exit(rot ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
