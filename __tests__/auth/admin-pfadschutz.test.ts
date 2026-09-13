/**
 * Der Pfadschutz für /admin und /mis.
 *
 * @see lib/auth/bereiche.ts   — die Berechtigungsmatrix
 * @see proxy.ts               — die Stelle, die sie durchsetzt
 *
 * ── WAS BEIM RELEASE-CHECK AM 13.09.2026 GEPRÜFT WURDE ────────────────
 * `darfPfad` wird in `app/admin/layout.tsx` benutzt, um Menüeinträge
 * auszublenden. Das allein wäre **kein Schutz**: wer die Adresse kennt,
 * tippt sie. Der Verdacht lag nahe — er war falsch. `proxy.ts` prüft
 * dieselbe Matrix bei jedem Aufruf auf `/admin` und `/mis` und leitet um,
 * bevor die Seite überhaupt gerendert wird.
 *
 * Dieser Test hält beides fest: die fail-closed-Eigenschaft der Matrix
 * UND die Tatsache, dass der Proxy sie durchsetzt. Fiele der Aufruf in
 * `proxy.ts` weg, bliebe der Menüfilter zurück — und der sähe genauso
 * aus, schützt aber nichts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { darfPfad } from '@/lib/auth/bereiche'

const FACHROLLEN = ['pdl', 'qm', 'buchhaltung'] as const

describe('Berechtigungsmatrix ist fail-closed', () => {
  it.each(FACHROLLEN)('%s erreicht einen unbekannten Unterpfad NICHT', (rolle) => {
    // Der entscheidende Fall: jemand legt ein neues Modul unter /admin an
    // und vergisst den Eintrag in der Matrix. Fail-closed heisst, dass es
    // dann admin/superadmin vorbehalten bleibt — nicht, dass es offen ist.
    expect(darfPfad(rolle as never, '/admin/ein-voellig-neues-modul')).toBe(false)
    expect(darfPfad(rolle as never, '/mis/ein-voellig-neues-modul')).toBe(false)
  })

  it('admin erreicht auch einen unbekannten Unterpfad', () => {
    expect(darfPfad('admin' as never, '/admin/ein-voellig-neues-modul')).toBe(true)
  })

  it('trennt die Fachbereiche voneinander', () => {
    // Ohne diese Trennung haette die Buchhaltung Zugriff auf die
    // Pflegedokumentation, nur weil beides unter /admin liegt.
    expect(darfPfad('buchhaltung' as never, '/admin/pflege-doku')).toBe(false)
    expect(darfPfad('pdl' as never, '/admin/personal')).toBe(true)
  })

  it('eine leere oder unsinnige Rolle kommt nirgends hin', () => {
    for (const r of ['', 'ADMIN', 'gast', '__proto__']) {
      expect(darfPfad(r as never, '/admin/personal'), r).toBe(false)
    }
  })
})

describe('proxy.ts setzt die Matrix durch', () => {
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')

  it('ruft darfPfad für /admin UND /mis auf', () => {
    // Der Menuefilter im Layout blendet nur aus. Faellt dieser Aufruf weg,
    // ist der Schutz weg und sieht trotzdem unveraendert aus.
    expect(proxy).toMatch(/darfPfad\(\s*role\s*,\s*pathname/)
    const block = proxy.slice(proxy.indexOf('darfPfad(role, pathname') - 400)
    expect(block).toContain("area === '/admin'")
    expect(block).toContain("area === '/mis'")
  })

  it('leitet bei fehlender Berechtigung um, statt durchzulassen', () => {
    const i = proxy.indexOf('darfPfad(role, pathname')
    const danach = proxy.slice(i, i + 400)
    expect(danach).toContain('NextResponse.redirect')
  })

  it('faengt eine Ausnahme fail-closed ab', () => {
    // Ein Fehler im Proxy darf nicht in „Zugriff erlaubt" enden.
    expect(proxy).toMatch(/FAIL-CLOSED/i)
  })
})
