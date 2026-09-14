#!/usr/bin/env tsx
/**
 * verify-budgetdeckel-live.ts
 * ---------------------------
 * Beantwortet EINE Frage gegen die Produktion: hält der Budgetdeckel —
 * und erfährt jemand, wenn ein Budget zur Neige geht?
 *
 * ── WARUM ES DIESEN LAUF BRAUCHT ──────────────────────────────────
 *
 * `client_budgets` trägt als einzige der Geldtabellen KEINEN Trigger
 * (invoices: 6, service_records: 9, client_budgets: 0). Der Deckel lebt
 * ausschliesslich in TypeScript — eine bewusste Entscheidung, aber eine,
 * die man nachmessen können muss.
 *
 * ── WAS DER ENTLASTUNGSBETRAG IST ─────────────────────────────────
 *
 * 131 €/Monat ist der ANSPRUCH, nicht der Deckel. § 45b SGB XI ist ein
 * Jahresbetrag von 1.572 €, der flexibel abgerufen werden darf: 400 € in
 * einem Monat sind zulässig, solange das Jahr sie trägt. Ein monatliches
 * Limit wäre fachlich falsch — `monthly_amount` ist Rechengrösse, nicht
 * Schranke.
 *
 * Was verfällt, ist der ÜBERTRAG aus dem Vorjahr: am 30.06. des
 * Folgejahres (§ 45b Abs. 1 S. 5). Danach zählt er nicht mehr zum Deckel.
 *
 * ── WAS ER TUT ────────────────────────────────────────────────────
 *
 * Er ruft dieselbe Funktion auf, die die Einsatzplanung aufruft
 * (`pruefeBudget`), und stellt ihr Ergebnis dem Rohbestand gegenüber. Er
 * schreibt NICHTS.
 *
 * Aufruf:  npm run verify:budgetdeckel
 */
import { readFileSync, existsSync } from 'node:fs'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const eur = (n: number) => `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

async function main(): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js')
  const { pruefeBudget } = await import('../lib/personal/einsatzfreigabe')
  const { uebertragGiltNoch } = await import('../lib/billing/core/budget-cap')
  const { DEFAULT_ORG_ID } = await import('../lib/organizations/types')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Supabase-Zugang fehlt.'); process.exit(1) }

  const sb = createClient(url, key)
  const orgId = process.env.BUDGET_ORG_ID || DEFAULT_ORG_ID
  const jahr = new Date().getFullYear()
  const monat = new Date().toISOString().slice(0, 7)

  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(' BUDGETDECKEL — hält er, und warnt jemand rechtzeitig?')
  console.log(` ${new Date().toISOString()}`)
  console.log(' § 45b: 131 €/Monat Anspruch = 1.572 €/Jahr, flexibel abrufbar.')
  console.log(' Es wird NICHTS geschrieben.')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  const { data: budgets, error } = await sb
    .from('client_budgets')
    .select('client_id, used_amount, annual_amount, carryover_amount, carryover_expires, combined_used_amount, combined_annual_amount')
    .eq('organization_id', orgId)
    .eq('year', jahr)

  if (error) { console.error('client_budgets nicht lesbar:', error.message); process.exit(1) }
  if (!budgets || budgets.length === 0) {
    console.log('  Keine Budgets für dieses Jahr — nichts zu prüfen.')
    process.exit(0)
  }

  let ueberschritten = 0
  let verfallenMitgezaehlt = 0
  let nahAnDerGrenze = 0

  for (const b of budgets) {
    const { data: c } = await sb.from('clients').select('first_name, last_name').eq('id', b.client_id).maybeSingle()
    const name = `${c?.first_name ?? '?'} ${c?.last_name ?? ''}`.trim()

    const jahresbetrag = Number(b.annual_amount) || 0
    const uebertrag = Number(b.carryover_amount) || 0
    const genutzt = Number(b.used_amount) || 0

    // Gilt der Übertrag heute noch? Nach dem 30.06. zählt er nicht mehr.
    const uebertragGueltig = !b.carryover_expires || uebertragGiltNoch(monat, b.carryover_expires as string)
    const deckelRoh = jahresbetrag + uebertrag
    const deckelEcht = jahresbetrag + (uebertragGueltig ? uebertrag : 0)

    console.log(`── ${name} ──`)
    console.log(`   Jahresbetrag        ${eur(jahresbetrag)}`)
    if (uebertrag > 0) {
      const marke = uebertragGueltig ? 'gilt noch' : `VERFALLEN am ${b.carryover_expires}`
      console.log(`   Übertrag            ${eur(uebertrag)}  (${marke})`)
      if (!uebertragGueltig) verfallenMitgezaehlt++
    }
    console.log(`   Deckel heute        ${eur(deckelEcht)}${deckelEcht !== deckelRoh ? `  (roh addiert waere ${eur(deckelRoh)})` : ''}`)
    console.log(`   verbraucht          ${eur(genutzt)}  =  ${deckelEcht > 0 ? Math.round((genutzt / deckelEcht) * 100) : 0} %`)
    console.log(`   Rest                ${eur(Math.max(0, deckelEcht - genutzt))}`)

    if (genutzt > deckelEcht) { console.log('   ✗ ÜBER DEM DECKEL'); ueberschritten++ }
    else if (genutzt / Math.max(deckelEcht, 1) >= 0.8) { console.log('   ⚠ über 80 % — Warnschwelle erreicht'); nahAnDerGrenze++ }

    for (const typ of ['entlastung', 'verhinderungspflege'] as const) {
      try {
        const r = await pruefeBudget(sb as never, b.client_id, orgId, typ)
        const w = r.warnung ? `„${String(r.warnung).slice(0, 70)}"` : 'keine'
        console.log(`   pruefeBudget(${typ.padEnd(20)}) ${String(r.prozent).padStart(5)} %  blockiert=${r.blockiert}  Warnung: ${w}`)
      } catch (e) {
        console.log(`   pruefeBudget(${typ.padEnd(20)}) FEHLER: ${(e as Error).message}`)
      }
    }
    console.log()
  }

  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(` Budgets geprüft            : ${budgets.length}`)
  console.log(` über 80 %                  : ${nahAnDerGrenze}`)
  console.log(` über dem Deckel            : ${ueberschritten}`)
  console.log(` mit verfallenem Übertrag   : ${verfallenMitgezaehlt}`)
  if (ueberschritten > 0) {
    console.log(' ❌ Mindestens ein Budget ist überschritten — das gehört geklärt.')
  } else {
    console.log(' ✅ Kein Budget über dem Deckel.')
  }
  console.log('═══════════════════════════════════════════════════════════════════')
  // Immer 0: ein volles Budget ist ein Betriebszustand, kein Programmfehler.
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
