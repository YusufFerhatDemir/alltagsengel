/**
 * Marketing-Lagebericht — Primärquellen, nur lesend, kein Versand.
 *
 *   npx tsx --require ./scripts/test-stubs/server-only-stub.cjs scripts/marketing-status-12-09.ts
 *
 * Quellen: Content-Katalog aus den Plandateien (lib/marketing/contentplan.ts),
 * `marketing_content_status`, `email_templates` und `lead_inquiries` live.
 */
import { createClient } from '@supabase/supabase-js'
import { ladeContentKatalog, frequenzProWoche, wochenStart } from '../lib/marketing/contentplan'
import { pruefeVorlage, VORLAGEN, ABRECHNUNGS_VERSPRECHEN, ANERKENNUNG_45A_LIEGT_VOR } from '../lib/marketing/vorlagen'
import { DEFAULT_ORG_ID } from '../lib/organizations/types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Supabase-Zugang fehlt'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })

const HEUTE = '2026-09-12'

async function main() {
  // ── 1. Content-Katalog ──────────────────────────────────────────────
  const k = ladeContentKatalog()
  const mitDatum = k.stuecke.filter(s => s.datumIso)
  const ueberfaellig = mitDatum.filter(s => s.datumIso! < HEUTE)
  const heute = mitDatum.filter(s => s.datumIso === HEUTE)
  const kommend = mitDatum.filter(s => s.datumIso! > HEUTE)
  console.log('### 1. Content-Katalog')
  console.log(`Dateien: ${k.dateien.length} — ${k.dateien.join(', ')}`)
  console.log(`Stücke gesamt: ${k.stuecke.length} · mit Datum: ${mitDatum.length} · ohne Datum: ${k.stuecke.length - mitDatum.length} · übersprungene Abschnitte: ${k.uebersprungen}`)
  console.log(`vor ${HEUTE} (überfällig): ${ueberfaellig.length} · heute: ${heute.length} · künftig: ${kommend.length}`)
  const jeQuelle = new Map<string, number>()
  k.stuecke.forEach(s => jeQuelle.set(s.quelle, (jeQuelle.get(s.quelle) ?? 0) + 1))
  for (const [q, n] of [...jeQuelle].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)} ${q}`)

  // ── 2. Bearbeitungsstand ────────────────────────────────────────────
  console.log('\n### 2. marketing_content_status')
  const st = await sb.from('marketing_content_status').select('content_id, status, kanal, veroeffentlicht_am').eq('organization_id', DEFAULT_ORG_ID)
  if (st.error) console.log(`FEHLER: ${st.error.code} ${st.error.message}`)
  else {
    const zaehler: Record<string, number> = { offen: 0, geplant: 0, veroeffentlicht: 0, verworfen: 0 }
    for (const z of st.data ?? []) zaehler[z.status] = (zaehler[z.status] ?? 0) + 1
    const gefuehrt = st.data?.length ?? 0
    console.log(`geführte Zeilen: ${gefuehrt} von ${k.stuecke.length} Stücken`)
    console.log(`  veröffentlicht: ${zaehler.veroeffentlicht} · geplant: ${zaehler.geplant} · offen (Zeile vorhanden): ${zaehler.offen} · verworfen: ${zaehler.verworfen}`)
    console.log(`  ohne Zeile (gilt als offen): ${k.stuecke.length - gefuehrt}`)
  }

  // ── 3. E-Mail-Vorlagen ──────────────────────────────────────────────
  console.log('\n### 3. email_templates')
  const tpl = await sb.from('email_templates').select('template_key, zielgruppe, consent_type, betreff, html').eq('organization_id', DEFAULT_ORG_ID)
  if (tpl.error) console.log(`FEHLER: ${tpl.error.message}`)
  else {
    const zeilen = tpl.data ?? []
    console.log(`in der Tabelle: ${zeilen.length} · im Katalog: ${VORLAGEN.length} · ANERKENNUNG_45A_LIEGT_VOR = ${ANERKENNUNG_45A_LIEGT_VOR}`)
    const fehlen = VORLAGEN.filter(v => !zeilen.some(z => z.template_key === v.templateKey)).map(v => v.templateKey)
    console.log(`fehlend: ${fehlen.length ? fehlen.join(', ') : 'keine'}`)
    let verstoss45a = 0, falscherBetrag = 0, ohneAbmeldelink = 0
    for (const z of zeilen) {
      const text = `${z.betreff} ${z.html}`
      const treffer = [...text.matchAll(ABRECHNUNGS_VERSPRECHEN)]
      if (treffer.length) { verstoss45a++; console.log(`  §45a-VERSTOSS ${z.template_key}: „${treffer[0][0]}"`) }
      if (/125\s*(€|EUR|Euro)/i.test(text)) { falscherBetrag++; console.log(`  125-€-VERSTOSS ${z.template_key}`) }
      if (!z.html.includes('{{abmeldelink}}')) { ohneAbmeldelink++; console.log(`  OHNE ABMELDELINK ${z.template_key}`) }
      const b = pruefeVorlage({ betreff: z.betreff, html: z.html })
      if (!b.ok) console.log(`  pruefeVorlage rot ${z.template_key}: ${b.fehler.join(' ')}`)
    }
    console.log(`§45a-Verstöße: ${verstoss45a} · 125-€-Nennungen: ${falscherBetrag} · ohne Abmeldelink: ${ohneAbmeldelink}`)
    console.log(`131 € im Text (Platzhalter {{entlastungsbetrag}} zählt mit): ${zeilen.filter(z => /\{\{entlastungsbetrag\}\}|131\s*€/.test(z.html)).length}`)
  }

  // ── 4. Fälligkeitsplan ──────────────────────────────────────────────
  console.log('\n### 4. Fälligkeiten')
  const zeigen = mitDatum.filter(s => s.datumIso! >= '2026-09-11' && s.datumIso! <= '2026-09-28')
  for (const s of zeigen) {
    const lage = s.datumIso! < HEUTE ? 'ÜBERFÄLLIG' : s.datumIso === HEUTE ? 'HEUTE' : 'geplant'
    console.log(`  ${s.datumIso}  ${lage.padEnd(11)} ${s.nummer.padEnd(4)} ${(s.plattform ?? '—').padEnd(12).slice(0, 12)} ${s.titel.slice(0, 58)}`)
  }
  console.log('  Frequenz je Woche (Ziel 5):')
  for (const w of frequenzProWoche(mitDatum).slice(-6)) console.log(`    KW ab ${w.woche}: ${w.anzahl}`)

  // ── 5. Herkunft der Leads ───────────────────────────────────────────
  console.log('\n### 5. lead_inquiries nach source/utm_source')
  const leads = await sb.from('lead_inquiries').select('source, utm_source, art, status, created_at').eq('organization_id', DEFAULT_ORG_ID)
  if (leads.error) console.log(`FEHLER: ${leads.error.message}`)
  else {
    const m = new Map<string, number>()
    for (const z of leads.data ?? []) {
      const s = `${z.source ?? '—'} | ${z.utm_source ?? '(ohne UTM)'}`
      m.set(s, (m.get(s) ?? 0) + 1)
    }
    console.log(`Leads gesamt: ${leads.data?.length ?? 0}`)
    for (const [s, n] of [...m].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${s}`)
    const mitUtm = (leads.data ?? []).filter(z => z.utm_source).length
    console.log(`mit utm_source: ${mitUtm} / ${leads.data?.length ?? 0}`)
  }

  const wl = await sb.from('state_waitlist').select('quelle, utm_medium, utm_campaign').eq('organization_id', DEFAULT_ORG_ID)
  console.log(`state_waitlist: ${wl.error ? 'FEHLER ' + wl.error.message : `${wl.data?.length ?? 0} Zeilen`}`)
  console.log(`\nwochenStart(heute) = ${wochenStart(HEUTE)}`)
}
main().catch(e => { console.error(e); process.exit(1) })
