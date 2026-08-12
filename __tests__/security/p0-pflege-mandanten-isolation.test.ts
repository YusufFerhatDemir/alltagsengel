/**
 * P0: Mandanten-Isolation + Sichtbarkeitsfilter im Pflege-Modul.
 *
 * Vier Regressionen aus dem Pflege-Review vom 08.08.2026:
 *
 * 1) app/api/pflege/anamnesen/route.ts (POST) spreizte `...felder` (Rest des Bodys)
 *    NACH `organizationId`/`erstelltVon`. Da beide Keys nicht aus dem Body
 *    herausdestrukturiert wurden, blieben sie im Rest — ein Admin von Org A konnte
 *    per {"organizationId": "<org-B>"} in einen fremden Mandanten schreiben. Die Route
 *    nutzt createAdminClient() (Service-Role, BYPASSRLS), die WITH-CHECK-Policy greift
 *    also nicht. Doppelt abgesichert: Keys aus dem Body destrukturiert UND der Spread
 *    steht jetzt VOR den Auth-Werten.
 *
 * 2) requirePflegeUser() fiel bei gültigem Token ohne Profil-Zeile still auf
 *    role: 'engel' zurück — ein profilloser Account bekam Engel-Schreibrechte.
 *
 * 3) Die Engel-Pflegedoku las pflege_diagnosen/pflege_risiken ohne aktiv-Filter:
 *    deaktivierte/veraltete Einträge wurden dem Engel als aktuell angezeigt.
 *
 * 4) Die Kunden-Pflegedoku las pflege_massnahmenplaene ohne Status-Filter und konnte
 *    so einen Entwurf oder einen abgelaufenen Plan als "Ihr Versorgungsplan" zeigen.
 *
 * Die Tests prüfen die Quelltexte statisch (kein DB-Zugriff) — analog
 * p0-personal-mandanten-isolation.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8')

const ANAMNESEN_ROUTE = 'app/api/pflege/anamnesen/route.ts'
const API_AUTH = 'lib/pflege/api-auth.ts'
const ENGEL_PAGE = 'app/engel/pflegedoku/[clientId]/page.tsx'
const KUNDE_PAGE = 'app/kunde/pflegedoku/page.tsx'

/** Schneidet das Objekt-Literal ab `startIndex` bis zur schliessenden Klammer heraus. */
function objektLiteralAb(src: string, startIndex: number): string {
  let depth = 0
  for (let i = startIndex; i < src.length; i++) {
    const c = src[i]
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') {
      if (depth === 0) return src.slice(startIndex, i)
      depth--
    }
  }
  return src.slice(startIndex)
}

describe('P0-1: anamnesen POST kann organizationId nicht aus dem Body überschreiben', () => {
  const src = read(ANAMNESEN_ROUTE)

  it('destrukturiert organizationId und erstelltVon aus dem Body heraus', () => {
    // Das Rest-Element `...felder` darf die Auth-Keys nicht mehr enthalten.
    const destructure = src.match(/const\s*\{[\s\S]*?\.\.\.felder\s*\}\s*=\s*body/)
    expect(destructure, `keine {...felder} = body-Destrukturierung in ${ANAMNESEN_ROUTE}`).not.toBeNull()
    expect(destructure![0]).toMatch(/\borganizationId\s*:/)
    expect(destructure![0]).toMatch(/\berstelltVon\s*:/)
  })

  it('spreizt ...felder VOR organizationId und erstelltVon (Auth-Werte gewinnen)', () => {
    const spread = src.indexOf('...felder,')
    expect(spread, `kein ...felder-Spread in ${ANAMNESEN_ROUTE}`).toBeGreaterThan(-1)

    const tail = objektLiteralAb(src, spread)
    expect(tail, 'organizationId muss NACH dem ...felder-Spread stehen').toMatch(/\borganizationId\b/)
    expect(tail, 'erstelltVon muss NACH dem ...felder-Spread stehen').toMatch(/\berstelltVon\s*:/)
  })

  it('setzt organizationId und erstelltVon aus auth.ctx, nicht aus dem Body', () => {
    expect(src).toMatch(/const\s*\{[^}]*\borganizationId\b[^}]*\}\s*=\s*auth\.ctx/)
    expect(src).toMatch(/erstelltVon:\s*userId/)
    // body.organizationId darf nirgends als Wert durchgereicht werden.
    expect(src).not.toMatch(/organizationId:\s*body\./)
  })
})

describe('P0-2: requirePflegeUser lehnt User ohne Profil ab', () => {
  const src = read(API_AUTH)
  const fn = src.slice(src.indexOf('export async function requirePflegeUser'))

  it('gibt 403 "Kein Profil gefunden." zurück, wenn keine Profil-Zeile existiert', () => {
    expect(fn).toMatch(/if\s*\(\s*!profile\s*\)/)
    expect(fn).toMatch(/Kein Profil gefunden\./)
    const check = fn.slice(fn.indexOf('if (!profile'))
    expect(check.slice(0, 300)).toMatch(/status:\s*403/)
  })

  it('fällt nicht mehr über optional chaining still auf role engel zurück', () => {
    // profile?.role würde bei fehlendem Profil den Fallback 'engel' liefern.
    expect(fn).not.toMatch(/profile\?\.role/)
  })

  it('der !profile-Check steht vor dem Erfolgs-Return', () => {
    const checkAt = fn.indexOf('if (!profile')
    // Nicht die Typ-Signatur ({ ok: true; userId… }), sondern das Erfolgs-return treffen.
    const okAt = fn.indexOf('return { ok: true')
    expect(checkAt).toBeGreaterThan(-1)
    expect(okAt).toBeGreaterThan(-1)
    expect(checkAt).toBeLessThan(okAt)
  })
})

describe('P0-3: Engel-Pflegedoku zeigt nur aktive Diagnosen und Risiken', () => {
  const src = read(ENGEL_PAGE)

  it.each(['pflege_diagnosen', 'pflege_risiken'])('%s-Query filtert auf aktiv=true', tabelle => {
    const at = src.indexOf(`from('${tabelle}')`)
    expect(at, `keine ${tabelle}-Query in ${ENGEL_PAGE}`).toBeGreaterThan(-1)
    // Bis zum Zeilenende: die Query ist eine einzeilige Kette im Promise.all.
    const kette = src.slice(at, src.indexOf('\n', at))
    expect(kette, `${tabelle} ohne aktiv-Filter`).toMatch(/\.eq\('aktiv',\s*true\)/)
  })

  it('der Maßnahmenplan bleibt auf status=aktiv gefiltert', () => {
    const at = src.indexOf("from('pflege_massnahmenplaene')")
    const kette = src.slice(at, src.indexOf('\n', at))
    expect(kette).toMatch(/\.eq\('status',\s*'aktiv'\)/)
  })
})

describe('P0-4: Kunden-Pflegedoku zeigt nur den aktiven Maßnahmenplan', () => {
  const src = read(KUNDE_PAGE)

  it('pflege_massnahmenplaene-Query filtert auf status=aktiv', () => {
    const at = src.indexOf("from('pflege_massnahmenplaene')")
    expect(at, `keine pflege_massnahmenplaene-Query in ${KUNDE_PAGE}`).toBeGreaterThan(-1)
    const kette = src.slice(at, src.indexOf('\n', at))
    expect(kette, 'Plan-Query ohne status-Filter — Entwürfe/abgelaufene Pläne sichtbar')
      .toMatch(/\.eq\('status',\s*'aktiv'\)/)
  })
})
