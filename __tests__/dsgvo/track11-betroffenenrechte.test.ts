// ═══════════════════════════════════════════════════════════════════════
// Track 11 — Betroffenenrechte: Löschbestätigung, Auskunft, Takt
// ═══════════════════════════════════════════════════════════════════════
//
// Drei kleinere Befunde derselben Fläche:
//
//   B5  Die PflegeCoach-Löschung meldete `geloescht: true`, ohne zu
//       prüfen, ob überhaupt eine Zeile entfernt wurde. `.delete()` ohne
//       `.select()` meldet keinen Fehler, wenn RLS alle Zeilen
//       weggefiltert hat — PostgREST löscht dann null Zeilen und
//       antwortet zufrieden.
//   B6  `DELETE /api/user/delete` probierte ein Passwort gegen GoTrue,
//       ohne Ratenbegrenzung und ohne den Fehlversuch zu protokollieren —
//       während die Anmeldeseite für genau dasselbe eine Sperre nach
//       fünf Versuchen hat.
//   B7  Die Bestätigungsmail nach der endgültigen Löschung behauptete,
//       „alle damit verknüpften Daten" seien gelöscht, und zählte die
//       Buchungen ausdrücklich mit auf. Beides trifft nicht zu.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const WURZEL = path.join(__dirname, '..', '..')
const lies = (rel: string) => readFileSync(path.join(WURZEL, rel), 'utf-8')

/**
 * Quelltext ohne Kommentare.
 *
 * Noetig, weil die Kopfkommentare dieser Dateien den ALTEN Wortlaut
 * woertlich zitieren, um den Befund festzuhalten. Ein Test, der den
 * blossen Dateiinhalt durchsucht, wuerde daran haengenbleiben — und man
 * muesste die Begruendung aus dem Code entfernen, um ihn gruen zu
 * bekommen. Genau das waere der falsche Anreiz.
 */
const ohneKommentare = (quelle: string) =>
  quelle
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(z => !z.trimStart().startsWith('//'))
    .join('\n')

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — PflegeCoach-Löschung braucht einen Wirkungsnachweis', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  /** Baut die Route mit einem Supabase-Doppelgänger, dessen Delete `entfernt` zurückgibt. */
  async function ladeRoute(entfernt: unknown, fehler: { message: string } | null = null) {
    const geloescht: string[] = []
    vi.doMock('@/lib/coach/api-auth', () => ({
      requireCoachUser: async () => ({
        ok: true,
        user: { id: 'u1' },
        coachUser: { id: 'coach-1' },
        supabase: {
          rpc: async () => ({ data: 'pseudo-1', error: null }),
          from: (tabelle: string) => ({
            delete: () => ({
              eq: (_s: string, w: unknown) => {
                geloescht.push(`${tabelle}:${String(w)}`)
                const ergebnis = { data: entfernt, error: fehler }
                return {
                  select: async () => ergebnis,
                  then: (aufloesen: (v: unknown) => unknown) => Promise.resolve(ergebnis).then(aufloesen),
                }
              },
            }),
          }),
        },
      }),
    }))
    vi.doMock('@/lib/monitoring/tracker', () => ({ withTracking: (fn: unknown) => fn }))
    const modul = await import('@/app/api/coach/loeschung/route')
    return { modul, geloescht }
  }

  const anfrage = () =>
    new Request('http://x/api/coach/loeschung', {
      method: 'DELETE',
      body: JSON.stringify({ bestaetigung: 'LOESCHEN' }),
    })

  it('meldet Erfolg, wenn tatsächlich eine Zeile entfernt wurde', async () => {
    const { modul } = await ladeRoute([{ id: 'coach-1' }])
    const antwort = await modul.DELETE(anfrage())
    expect(antwort.status).toBe(200)
    expect(await antwort.json()).toMatchObject({ geloescht: true, entfernteDatensaetze: 1 })
  })

  it('GEGENPROBE: null gelöschte Zeilen sind kein Erfolg mehr', async () => {
    // Genau dieser Fall — RLS filtert alles weg, PostgREST meldet keinen
    // Fehler — ergab vorher „geloescht: true".
    const { modul } = await ladeRoute([])
    const antwort = await modul.DELETE(anfrage())
    expect(antwort.status).toBe(500)
    expect((await antwort.json()).error).toContain('nicht gelöscht')
  })

  it('verlangt weiterhin das Bestätigungswort', async () => {
    const { modul } = await ladeRoute([{ id: 'coach-1' }])
    const antwort = await modul.DELETE(
      new Request('http://x/api/coach/loeschung', { method: 'DELETE', body: JSON.stringify({}) }),
    )
    expect(antwort.status).toBe(400)
  })

  it('löscht die pseudonymen Nutzungsdaten vor dem Konto', async () => {
    const { modul, geloescht } = await ladeRoute([{ id: 'coach-1' }])
    await modul.DELETE(anfrage())
    expect(geloescht[0]).toBe('coach_nutzungsereignisse:pseudo-1')
    expect(geloescht[geloescht.length - 1]).toBe('coach_users:coach-1')
  })
})

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — /api/user/delete ist kein unbegrenztes Passwort-Orakel mehr', () => {
  const quelle = lies('app/api/user/delete/route.ts')

  it('begrenzt die Versuche persistent je Konto', () => {
    expect(quelle).toContain('rateLimitPersistent')
    expect(quelle).toMatch(/rateLimitPersistent\(`user-delete:\$\{user\.id\}`/)
  })

  it('die Begrenzung steht VOR der Passwortprüfung', () => {
    expect(quelle.indexOf('rateLimitPersistent')).toBeLessThan(quelle.indexOf('signInWithPassword'))
  })

  it('protokolliert den Fehlversuch in derselben Spur wie die Anmeldeseite', () => {
    // mis_auth_log mit 'login_failed' — NICHT mis_audit_log: dessen
    // action-Spalte traegt live einen CHECK ueber eine feste Werteliste,
    // ein neuer Wert wuerde den Insert scheitern lassen und der
    // Fehlversuch waere wieder unsichtbar.
    const stelle = quelle.indexOf('signInError')
    const block = quelle.slice(stelle, stelle + 1600)
    expect(block).toContain("from('mis_auth_log')")
    expect(block).toContain("action: 'login_failed'")
  })

  it('nutzt die persistente Zählung, nicht die instanz-lokale', () => {
    // lib/rate-limit.ts zählt im Prozessspeicher — auf Vercel startet
    // jede neue Instanz bei null.
    expect(quelle).not.toMatch(/from '@\/lib\/rate-limit'/)
  })
})

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — die Bestätigungsmail sagt die Wahrheit', () => {
  const quelle = ohneKommentare(lies('lib/emails/account-deletion.ts'))

  it('behauptet nicht mehr, es sei ALLES gelöscht', () => {
    expect(quelle).not.toContain('alle\n      damit verknuepften Daten')
    expect(quelle).not.toMatch(/Konto und alle[\s\S]{0,40}verknuepften Daten/)
  })

  it('zählt Buchungen nicht mehr als gelöscht auf', () => {
    // Buchungen bleiben als Beleg stehen (§ 147 AO) — die Migration
    // 20260804400000 hat das entschieden.
    const geloeschtBlock = quelle.slice(
      quelle.indexOf('Was wurde geloescht?'),
      quelle.indexOf('Was aus rechtlichen Gruenden bleibt'),
    )
    expect(geloeschtBlock.length).toBeGreaterThan(50)
    expect(geloeschtBlock).not.toMatch(/Buchungen/)
  })

  it('nennt einen eigenen Abschnitt für das, was bleibt', () => {
    expect(quelle).toContain('Was aus rechtlichen Gruenden bleibt')
    expect(quelle).toContain('Art. 17 Abs. 3 lit. b DSGVO')
  })

  it('escapt die Katalogtexte, bevor sie ins HTML gehen', () => {
    expect(quelle).toContain('escapeHtml(z)')
  })

  it('unterschreibt mit Alltagsengel, nicht mit einem Personennamen', () => {
    expect(quelle).toContain('Ihr Team von Alltagsengel')
  })
})

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — der Takt: Cron-Route statt NULL-URL', () => {
  it('die Route existiert und hängt am zentralen fail-closed Türsteher', () => {
    const route = lies('app/api/cron/konto-loeschung/route.ts')
    expect(route).toContain('pruefeCronGeheimnis')
    expect(route).toContain('fuehreKontoLoeschungAus')
  })

  it('sie ist in vercel.json eingeplant', () => {
    const vercel = JSON.parse(lies('vercel.json')) as { crons: Array<{ path: string; schedule: string }> }
    const eintrag = vercel.crons.find(c => c.path === '/api/cron/konto-loeschung')
    expect(eintrag).toBeTruthy()
    expect(eintrag?.schedule).toBe('0 3 * * *')
  })

  it('der Protokolleintrag trägt den Mandanten ausdrücklich', () => {
    // organization_members hängt per CASCADE am Konto und ist nach der
    // Löschung weg — der Mandant wird deshalb VORHER gemerkt. Ohne ihn
    // fiele der Eintrag über current_org_id() in die Stamm-Organisation
    // (Track 6), weil der Dienstschlüssel kein auth.uid() hat.
    const route = lies('app/api/cron/konto-loeschung/route.ts')
    expect(route).toContain('organization_id: orgVonKonto.get(ergebnis.userId) ?? DEFAULT_ORG_ID')
    expect(route.indexOf('orgVonKonto.set')).toBeLessThan(route.indexOf('fuehreKontoLoeschungAus(umgebung'))
  })

  it('die abgelöste Edge Function ist stillgelegt und fail-closed', () => {
    const fn = ohneKommentare(lies('supabase/functions/account-hard-delete/index.ts'))
    // Stillgelegt, solange nicht ausdrücklich freigeschaltet.
    expect(fn).toContain("HARD_DELETE_EDGE_AKTIV")
    expect(fn).toContain('410')
    // GEGENPROBE zum alten Zustand: `if (cronSecret && …)` liess bei
    // fehlendem Geheimnis jeden durch.
    expect(fn).not.toMatch(/if \(cronSecret && providedSecret !== cronSecret\)/)
    expect(fn).toMatch(/if \(!cronSecret\) \{[\s\S]{0,80}403/)
  })

  it('die stillgelegte Function löscht nichts mehr, bevor der Türsteher geprüft hat', () => {
    const fn = lies('supabase/functions/account-hard-delete/index.ts')
    expect(fn.indexOf('HARD_DELETE_EDGE_AKTIV')).toBeLessThan(fn.indexOf(".from('notifications')"))
  })
})

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — Auskunft nach Art. 15 bleibt an den Nutzer-Client gebunden', () => {
  // NEGATIVBEFUND, festgehalten als Test: der Export liest ausschliesslich
  // mit dem RLS-Client. Ein Fehler in der Quellenliste kann deshalb keine
  // fremden Daten ausliefern. Ein spaeterer Umbau auf den Dienstschluessel
  // wuerde genau diese Eigenschaft still aufheben — hier faellt er auf.
  const route = lies('app/api/user/export/route.ts')
  const modul = lies('lib/dsgvo/auskunft.ts')

  it('die Route benutzt keinen Dienstschlüssel', () => {
    expect(route).not.toContain('createAdminClient')
  })

  it('das Sammelmodul kennt den Dienstschlüssel gar nicht', () => {
    expect(modul).not.toContain('createAdminClient')
    expect(modul).not.toContain('SERVICE_ROLE')
  })

  it('der Export ist ratenbegrenzt und wird protokolliert', () => {
    expect(route).toContain('rateLimitPersistent')
    expect(route).toContain("action: 'data_export'")
  })
})
