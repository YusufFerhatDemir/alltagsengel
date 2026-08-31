// ═══════════════════════════════════════════════════════════════════════
// Track 6 — Mandanten-Streuung in die Stamm-Organisation
// ═══════════════════════════════════════════════════════════════════════
//
// 190 Tabellen tragen live `organization_id NOT NULL DEFAULT current_org_id()`.
// current_org_id() liest auth.uid(); beim Dienstschluessel gibt es keinen
// angemeldeten Nutzer, die Fallback-Kette laeuft ins Leere und endet in einer
// FEST VERDRAHTETEN Stamm-Organisation. Ein Dienstschluessel-Insert ohne
// organization_id legt die Zeile deshalb beim falschen Mandanten ab — und der
// eigene sieht sie hinter dem RESTRICTIVE org_fence gar nicht mehr.
//
// Diese Suite fuehrt die ALTE Form jeder behobenen Stelle noch einmal aus und
// verlangt, dass die Lint-Regel sie faengt. Ohne diese Gegenproben waere ein
// gruener Lint-Lauf nur der Beweis, dass die Regel nichts findet — nicht, dass
// sie etwas finden KANN.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { pruefeQuelltext } from '../scripts/lint-org-id-inserts'

const lies = (p: string) => readFileSync(p, 'utf-8')

describe('Lint-Regel R1 — Dienstschluessel-Insert ohne Mandant', () => {
  it('faengt die ALTE Form des Unterschriften-Endpunkts (service_signatures)', () => {
    const alt = `
      import { createAdminClient } from '@/lib/supabase/admin'
      export async function POST() {
        const admin = createAdminClient()
        await admin.from('service_signatures').insert({
          service_record_id,
          signer_role,
          signer_name,
          signature_image,
        })
      }
    `
    const treffer = pruefeQuelltext(alt, 'alt/signatures.ts')
    expect(treffer).toHaveLength(1)
    expect(treffer[0].regel).toBe('R1')
    expect(treffer[0].tabelle).toBe('service_signatures')
  })

  it('faengt die ALTE Form des Zertifikat-Fallbacks (abrechnung_zertifikate)', () => {
    const alt = `
      import { createAdminClient } from '@/lib/supabase/admin'
      const admin = createAdminClient()
      const { organization_id: _omit, ...ohneOrg } = zeile
      await admin.from('abrechnung_zertifikate').upsert(ohneOrg, { onConflict: 'ik_nummer,typ' })
    `
    const treffer = pruefeQuelltext(alt, 'alt/zertifikat.ts')
    expect(treffer.map((t) => t.tabelle)).toContain('abrechnung_zertifikate')
  })

  it('laesst einen Dienstschluessel-Insert MIT organization_id durch', () => {
    const neu = `
      import { createAdminClient } from '@/lib/supabase/admin'
      const admin = createAdminClient()
      await admin.from('service_signatures').insert({
        organization_id: record.organization_id,
        service_record_id,
      })
    `
    expect(pruefeQuelltext(neu, 'neu/signatures.ts')).toHaveLength(0)
  })

  it('ignoriert Tabellen ohne current_org_id()-Default', () => {
    const src = `
      import { createAdminClient } from '@/lib/supabase/admin'
      const admin = createAdminClient()
      await admin.from('payments').insert({ betrag_cent: 100 })
    `
    expect(pruefeQuelltext(src, 'x/payments.ts')).toHaveLength(0)
  })
})

describe('Lint-Regel R2 — Modul kennt den Mandanten und schreibt ihn nicht', () => {
  it('faengt die ALTE Form des HKP-Verordnungsdienstes (verordnungen)', () => {
    const alt = `
      import type { SupabaseClient } from '@supabase/supabase-js'
      export async function legeHkpVerordnungAn(
        supabase: SupabaseClient,
        organizationId: string,
      ) {
        await supabase.from('verordnungen').insert({
          client_id: eingabe.clientId,
          arzt_name: eingabe.arztName,
        })
      }
    `
    const treffer = pruefeQuelltext(alt, 'alt/verordnung-service.ts')
    expect(treffer).toHaveLength(1)
    expect(treffer[0].regel).toBe('R2')
    expect(treffer[0].tabelle).toBe('verordnungen')
  })

  it('faengt die ALTE Form des Rechnungspakets (invoice_packages)', () => {
    const alt = `
      import type { SupabaseClient } from '@supabase/supabase-js'
      export async function erzeugeRechnungsPaket(admin: SupabaseClient, orgId: string) {
        await admin.from('invoice_packages').upsert({
          invoice_id: invoiceId,
          pdf_url: pdfUrl,
        }, { onConflict: 'invoice_id' })
      }
    `
    const treffer = pruefeQuelltext(alt, 'alt/rechnung-paket.ts')
    expect(treffer.map((t) => t.tabelle)).toContain('invoice_packages')
  })

  it('erkennt organization_id auch ueber eine Variable hinweg', () => {
    const neu = `
      import type { SupabaseClient } from '@supabase/supabase-js'
      export async function f(supabase: SupabaseClient, organizationId: string) {
        const zeile = { organization_id: organizationId, client_id: 'x' }
        await supabase.from('verordnungen').insert(zeile)
      }
    `
    expect(pruefeQuelltext(neu, 'neu/f.ts')).toHaveLength(0)
  })

  it('erkennt organization_id transitiv ueber einen Spread', () => {
    const neu = `
      import type { SupabaseClient } from '@supabase/supabase-js'
      export async function f(client: SupabaseClient, organizationId: string) {
        const zeile = { organization_id: organizationId, user_id: 'u' }
        const nutzlast = { ...zeile }
        await client.from('fcm_tokens').upsert(nutzlast, { onConflict: 'user_id,token' })
      }
    `
    expect(pruefeQuelltext(neu, 'neu/token-store.ts')).toHaveLength(0)
  })

  it('erkennt organization_id in einer gemappten Zeilenliste', () => {
    const neu = `
      import type { SupabaseClient } from '@supabase/supabase-js'
      export async function f(supabase: SupabaseClient, organizationId: string) {
        const rows = ids.map((empfaengerId) => ({
          organization_id: organizationId,
          empfaenger_id: empfaengerId,
        }))
        await supabase.from('ops_nachrichten_empfaenger').insert(rows)
      }
    `
    expect(pruefeQuelltext(neu, 'neu/nachrichten.ts')).toHaveLength(0)
  })
})

describe('Die behobenen Stellen tragen den Mandanten jetzt wirklich', () => {
  const faelle: [string, string, string][] = [
    ['app/api/native/signatures/route.ts', 'service_signatures', 'record.organization_id'],
    ['lib/abrechnung/sgb-v/verordnung-service.ts', 'verordnungen', 'organizationId'],
    ['lib/pdf/rechnung-paket.ts', 'invoice_packages', 'orgId'],
  ]
  for (const [datei, tabelle, quelle] of faelle) {
    it(`${datei} → ${tabelle}`, () => {
      const src = lies(datei)
      expect(src).toContain(`organization_id: ${quelle}`)
      expect(pruefeQuelltext(src, datei)).toHaveLength(0)
    })
  }

  it('der Tourenweg gibt den Mandanten an saveServiceRecord weiter', () => {
    const src = lies('app/api/tours/[id]/stops/route.ts')
    expect(src).toMatch(/saveServiceRecord\(admin, \{\s*(?:\/\/[^\n]*\n\s*)*organization_id: auth\.ctx\.organizationId,/)
  })

  it('saveServiceRecord schreibt einen uebergebenen Mandanten mit', () => {
    const src = lies('lib/admin/service-records.ts')
    expect(src).toContain('input.organization_id ? { organization_id: input.organization_id }')
  })

  it('das Zertifikat hat keinen Weg mehr, den Mandanten wegzulassen', () => {
    const src = lies('app/api/organizations/zertifikat/route.ts')
    expect(src).not.toContain('ohneOrg')
  })

  it('die Geraete-Registrierung ist fail-closed auf den Mandanten', () => {
    const src = lies('lib/notifications/push/token-store.ts')
    expect(src).toContain("if (!istUuid(organizationId))")
    expect(src).not.toContain('delete nutzlast.organization_id')
  })
})

describe('Oeffentliche Website — Stamm-Organisation steht ausdruecklich da', () => {
  const oeffentlich = [
    'app/api/lead-inquiry/route.ts',
    // `app/api/newsletter/route.ts` stand hier bis zum 31.08.2026. Die
    // Route legt seitdem NICHTS mehr an: sie loest nur noch die
    // Bestaetigungsmail aus, und der Verteilereintrag entsteht erst nach
    // dem Klick im Postfach. Der INSERT ist damit nach
    // lib/marketing/abonnent.ts gewandert — und wird dort geprueft
    // (siehe unten). Die Zeile hier ersatzlos zu streichen waere falsch
    // gewesen: dann waere die Regel mit dem INSERT verschwunden.
    'app/api/track-conversion/route.ts',
    'app/api/analytics/vitals/route.ts',
    'app/api/whatsapp/webhook/route.ts',
  ]
  for (const datei of oeffentlich) {
    it(`${datei} setzt DEFAULT_ORG_ID statt sich auf den DB-Default zu verlassen`, () => {
      const src = lies(datei)
      expect(src).toContain('organization_id: DEFAULT_ORG_ID')
      expect(src).toContain("from '@/lib/organizations/types'")
      expect(pruefeQuelltext(src, datei)).toHaveLength(0)
    })
  }
})

describe('Verteilereintrag nach Doppel-Opt-in', () => {
  it('lib/marketing/abonnent.ts setzt die Organisation ausdruecklich', () => {
    // Hierher ist der INSERT aus app/api/newsletter/route.ts gezogen.
    // Der Weg laeuft mit dem Dienstschluessel ohne auth.uid(); der
    // Spalten-Default current_org_id() faellt dann auf die Stamm-
    // Organisation zurueck — aber als fail-open-Rueckfall, nicht als
    // Aussage.
    const src = lies('lib/marketing/abonnent.ts')
    expect(src).toContain('organization_id: organizationId')
    expect(src).toContain("from('newsletter_subscribers')")
  })

  it('app/api/newsletter/route.ts legt selbst nichts mehr an', () => {
    // Die Gegenprobe zum Umzug: bliebe hier ein INSERT stehen, gaebe es
    // wieder zwei Wege mit verschiedener Rechtsfolge — genau der Befund,
    // der am 31.08.2026 behoben wurde.
    const src = lies('app/api/newsletter/route.ts')
    expect(src).not.toContain(".from('newsletter_subscribers')")
    expect(src).toContain('sendeBestaetigungsmail')
  })
})

describe('Die Tatsachengrundlage der Regel', () => {
  it('org-default-tables.json listet die live gelesenen Tabellen', () => {
    const konfig = JSON.parse(lies('scripts/org-default-tables.json'))
    expect(Array.isArray(konfig.tabellen)).toBe(true)
    expect(konfig.tabellen.length).toBeGreaterThan(150)
    // Stichproben aus den in diesem Track behandelten Wegen.
    for (const t of ['service_signatures', 'invoice_packages', 'verordnungen', 'service_records', 'fcm_tokens']) {
      expect(konfig.tabellen).toContain(t)
    }
    // Gegenprobe: Tabellen OHNE den Default gehoeren nicht hinein.
    for (const t of ['payments', 'signaturen', 'sepa_mandates']) {
      expect(konfig.tabellen).not.toContain(t)
    }
  })
})
