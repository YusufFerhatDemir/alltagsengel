import { createClient } from '@supabase/supabase-js'
import { ausAnfrage, ausBewerbung, type RohLead } from '@/lib/leads/posteingang'
import { KOERBE, zaehleKoerbe, korbGesamt, ohneKorb } from '@/lib/leads/koerbe'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const sb = createClient(url, key, { auth: { persistSession: false } })
const jetzt = new Date()

async function main() {
  
  const { data, error } = await sb.from('lead_inquiries')
    .select('id,name,email,phone,status,art,source,created_at,updated_at,follow_up_date,bewerbung_daten')
  if (error) { console.error('Lesefehler:', error.message); process.exit(1) }
  
  const eintraege = (data ?? []).flatMap((z: any) => {
    const r = z as RohLead
    // Einordnung wie in der App (scripts/verify-posteingang-live.ts:35):
    // Bewerbungen erkennt man an `source`, NICHT an der Spalte `art` — live
    // tragen nur 2 von 36 Bewerbungen art='bewerbung', der Rest 'anfrage'.
    const istBewerbung = z.source === 'engel-bewerbung' || z.art === 'bewerbung'
    const e = istBewerbung ? ausBewerbung(r, jetzt) : ausAnfrage(r, jetzt)
    return e ? [e] : []
  })
  
  console.log(`offene Eintraege: ${eintraege.length}`)
  const z = zaehleKoerbe(eintraege, jetzt)
  for (const k of KOERBE) console.log(`  ${k.label.padEnd(16)} ${String(z[k.key]).padStart(3)}`)
  console.log(`  ${'—'.repeat(20)}`)
  console.log(`  ${'in >=1 Korb'.padEnd(16)} ${String(korbGesamt(eintraege, jetzt)).padStart(3)}`)
  const luecken = ohneKorb(eintraege, jetzt)
  console.log(`  ${'OHNE Korb'.padEnd(16)} ${String(luecken.length).padStart(3)}`)
  for (const l of luecken.slice(0, 8)) {
    console.log(`     ${l.art}/${l.followUp} ${l.stundenOffen}h wv=${l.wiedervorlage ?? '—'} quelle=${l.quelle ?? '—'} ${l.name}`)
  }
  
}
main()
