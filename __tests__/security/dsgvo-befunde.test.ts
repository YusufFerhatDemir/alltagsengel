// ═══════════════════════════════════════════════════════════════════════
// Security-Audit 2026-08-19 — die drei offenen DSGVO-Punkte
//
//   1. MITTEL-4  Stripe fehlte in der Datenschutzerklaerung (Art. 13 Abs. 1 lit. e)
//   2. NIEDRIG-5 Kein Art.-15-Selbstbedienungs-Export ausserhalb PflegeCoach
//   3. MITTEL-2  Analytics ohne Mandantenbezug — siehe org-fail-closed.test.ts
//                und client-side-writes.test.ts; hier nur der DSGVO-Teil:
//                die LLM-Aggregation darf keine mandantenfremden Besucherdaten
//                mehr enthalten.
//
//   Zusatz: NIEDRIG-6 — die Reset-Mail nannte eine Gueltigkeitsdauer, die der
//   Code nicht durchsetzen kann.
// ═══════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sammleAuskunft, QUELLEN_DIREKT, QUELLEN_ZWEISEITIG, type AuskunftClient } from '@/lib/dsgvo/auskunft'

const lesen = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

// ── MITTEL-4 ──────────────────────────────────────────────────────────
describe('MITTEL-4: Stripe steht in der Datenschutzerklaerung', () => {
  const datenschutz = lesen('app/datenschutz/page.tsx')

  it('Stripe ist als Auftragsverarbeiter benannt', () => {
    expect(datenschutz).toContain('Stripe')
    expect(datenschutz).toContain('Stripe Payments Europe')
  })

  it('Zweck, Rechtsgrundlage und Drittlandtransfer sind genannt', () => {
    expect(datenschutz).toContain('Art. 6 Abs. 1 lit. b DSGVO')
    expect(datenschutz).toContain('Standardvertragsklauseln')
  })

  it('es gibt einen Verweis auf die Stripe-Datenschutzerklaerung', () => {
    expect(datenschutz).toContain('stripe.com/de/privacy')
  })

  it('Stripe ist tatsaechlich integriert — der Abschnitt ist also nicht auf Vorrat', () => {
    expect(() => lesen('app/api/stripe/webhook/route.ts')).not.toThrow()
  })
})

// ── NIEDRIG-5 ─────────────────────────────────────────────────────────
describe('NIEDRIG-5: Art.-15-Selbstbedienungs-Export', () => {
  const route = lesen('app/api/user/export/route.ts')

  it('die Route existiert und ist auth-pflichtig', () => {
    expect(route).toContain('supabase.auth.getUser()')
    expect(route).toContain('401')
  })

  it('sie ist ratenbegrenzt (Art. 12 Abs. 5 DSGVO)', () => {
    // Delta-Check Phase 4.5: der Auskunftsexport nutzt jetzt den
    // PERSISTENTEN Limiter. Der bisherige rateLimit() zaehlte in einer Map
    // im Modul-Scope, also pro Serverless-Instanz — auf Vercel liess sich
    // die Grenze durch wiederholte Aufrufe (neue Instanz = neuer Zaehler)
    // umgehen. Fuer einen Vollexport der eigenen Daten ist das die teuerste
    // Anfrage, die ein angemeldeter Nutzer stellen kann.
    expect(route).toContain('rateLimitPersistent(')
  })

  it('sie protokolliert den Export als Audit-Event', () => {
    expect(route).toContain("action: 'data_export'")
  })

  it('sie liest NICHT mit dem Service-Role-Key — RLS entscheidet ueber die Zeilen', () => {
    expect(route).not.toContain('createAdminClient')
    expect(lesen('lib/dsgvo/auskunft.ts')).not.toContain('createAdminClient')
  })

  it('sie wird als Download ausgeliefert', () => {
    expect(route).toContain('Content-Disposition')
    expect(route).toContain('attachment')
  })

  it('Kunden- und Engel-Profil verlinken den Export', () => {
    expect(lesen('app/kunde/profil/page.tsx')).toContain('/api/user/export')
    expect(lesen('app/engel/profil/page.tsx')).toContain('/api/user/export')
  })

  it('die Datenschutzerklaerung nennt den Weg', () => {
    const d = lesen('app/datenschutz/page.tsx')
    expect(d).toContain('Art. 15 Abs. 3 DSGVO')
    expect(d).toContain('Meine Daten herunterladen')
  })

  it('jede Quelle filtert auf die Nutzer-ID — keine ungefilterte Tabelle', () => {
    for (const q of [...QUELLEN_DIREKT, ...QUELLEN_ZWEISEITIG]) {
      expect(q.spalte, `${q.tabelle} ohne Filterspalte`).toBeTruthy()
      expect(q.bezeichnung, `${q.tabelle} ohne Klartext-Bezeichnung`).toBeTruthy()
    }
  })

  it('sammelt die Daten und filtert dabei ausschliesslich auf die eigene ID', async () => {
    const filter: Array<[string, string, unknown]> = []
    const client: AuskunftClient = {
      from: (tabelle: string) => ({
        select: () => ({
          eq: (spalte: string, wert: unknown) => {
            filter.push([tabelle, spalte, wert])
            return Promise.resolve({ data: [{ id: `${tabelle}-1` }], error: null })
          },
        }),
      }),
    }

    const auskunft = await sammleAuskunft(client, { id: 'user-1', email: 'a@b.de' }, '2026-08-19T10:00:00.000Z')

    expect(auskunft.abschnitte.length).toBe(QUELLEN_DIREKT.length + QUELLEN_ZWEISEITIG.length)
    expect(filter.every(([, , wert]) => wert === 'user-1')).toBe(true)
    expect(auskunft.rechtsgrundlage).toContain('Art. 15 Abs. 3 DSGVO')
    expect(auskunft.nichtEnthalten.length).toBeGreaterThan(0)
  })

  it('eine nicht lesbare Quelle laesst die Auskunft nicht scheitern, wird aber vermerkt', async () => {
    const client: AuskunftClient = {
      from: (tabelle: string) => ({
        select: () => ({
          eq: () =>
            tabelle === 'angels'
              ? Promise.resolve({ data: null, error: { message: 'weg', code: '42P01' } })
              : Promise.resolve({ data: [], error: null }),
        }),
      }),
    }
    const auskunft = await sammleAuskunft(client, { id: 'user-1', email: null }, '2026-08-19T10:00:00.000Z')
    const angels = auskunft.abschnitte.find(a => a.tabelle === 'angels')
    expect(angels?.hinweis).toContain('42P01')
  })

  it('zweiseitige Quellen liefern jede Zeile nur einmal', async () => {
    const client: AuskunftClient = {
      from: () => ({
        select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'gleiche-zeile' }], error: null }) }),
      }),
    }
    const auskunft = await sammleAuskunft(client, { id: 'user-1', email: null }, '2026-08-19T10:00:00.000Z')
    const nachrichten = auskunft.abschnitte.find(a => a.tabelle === 'messages')
    expect(nachrichten?.anzahl).toBe(1)
  })
})

// ── MITTEL-2 (DSGVO-Teil) ─────────────────────────────────────────────
describe('MITTEL-2: keine mandantenfremden Besucherdaten mehr an das LLM', () => {
  const aiChat = lesen('app/api/ai-chat/route.ts')

  it('visitor_locations wird org-gefenced gelesen', () => {
    expect(aiChat).toMatch(/from\('visitor_locations'\)[\s\S]{0,200}?\.eq\('organization_id', orgId\)/)
  })

  it('die Route ist ohne Organisation fail-closed', () => {
    expect(aiChat).toMatch(/if\s*\(!orgId\)/)
    expect(aiChat).toContain('403')
  })
})

// ── NIEDRIG-6 ─────────────────────────────────────────────────────────
describe('NIEDRIG-6: die Reset-Mail verspricht keine Dauer mehr, die der Code nicht haelt', () => {
  const route = lesen('app/api/auth/send-reset/route.ts')

  it('keine konkrete Stundenangabe im Mailtext', () => {
    const mailtext = route.slice(route.indexOf('<p style="color:#888'))
    expect(mailtext).not.toContain('1 Stunde gültig')
  })

  it('die belegbare Eigenschaft steht drin: begrenzt gueltig und einmal verwendbar', () => {
    expect(route).toContain('begrenzte Zeit gültig')
    expect(route).toContain('einmal verwenden')
  })
})
