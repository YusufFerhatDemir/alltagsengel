/**
 * Vorlagenkatalog in `email_templates` übernehmen.
 *
 *   npx tsx --require ./scripts/test-stubs/server-only-stub.cjs scripts/seed-marketing-vorlagen.ts [--dry]
 *
 * WOZU
 * Der Katalog (lib/marketing/vorlagen.ts) lebt im Code; die Kampagnen-
 * Oberfläche wählt aber aus `email_templates`. Bis 12.09.2026 war die
 * Tabelle leer — es gab also keine einzige auswählbare Vorlage, obwohl 18
 * fertige im Repository standen. Der bestehende Weg dorthin
 * (POST /api/admin/marketing/vorlagen) verlangt eine Anmeldung.
 *
 * ÜBERSCHREIBT NICHTS: `synchronisiereVorlagen` legt nur an, was fehlt —
 * eine im Betrieb nachgebesserte Formulierung bleibt stehen. Vorlagen mit
 * Befund (fehlender Abmeldelink, 125 €, Abrechnungsversprechen vor der
 * §45a-Anerkennung) werden NICHT abgelegt und am Ende benannt.
 */
import { createClient } from '@supabase/supabase-js'
import { synchronisiereVorlagen, VORLAGEN, pruefeVorlage } from '../lib/marketing/vorlagen'
import { DEFAULT_ORG_ID } from '../lib/organizations/types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen'); process.exit(1) }

const trocken = process.argv.includes('--dry')

async function main() {
  const befunde = VORLAGEN.map(v => ({ key: v.templateKey, befund: pruefeVorlage(v) })).filter(b => !b.befund.ok)
  console.log(`Katalog: ${VORLAGEN.length} Vorlagen, davon ${befunde.length} mit Befund`)
  for (const b of befunde) console.log(`  ⚠ ${b.key}: ${b.befund.fehler.join(' ')}`)

  if (trocken) { console.log('Trockenlauf — nichts geschrieben.'); return }

  const sb = createClient(url!, key!, { auth: { persistSession: false } })
  const e = await synchronisiereVorlagen(sb as never, DEFAULT_ORG_ID)
  console.log(`angelegt: ${e.angelegt} · vorhanden: ${e.vorhanden} · uebersprungen: ${e.uebersprungen.length}`)
  for (const u of e.uebersprungen) console.log(`  übersprungen — ${u}`)

  const { data, error } = await sb.from('email_templates')
    .select('template_key, zielgruppe, consent_type')
    .eq('organization_id', DEFAULT_ORG_ID)
    .order('template_key')
  if (error) { console.error('Nachkontrolle fehlgeschlagen:', error.message); process.exit(1) }
  console.log(`\nIn der Tabelle: ${data?.length ?? 0}`)
  for (const z of data ?? []) console.log(`  ${z.template_key.padEnd(28)} ${z.zielgruppe.padEnd(9)} ${z.consent_type}`)
}
main().catch(e => { console.error(e); process.exit(1) })
