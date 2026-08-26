/**
 * LAUFZEIT-HERKUNFT — welcher Code misst hier gegen welche Datenbank?
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Die Übersicht darüber, gegen welchen Stand eine Freigabe gälte, hat drei
 * Weisen zu versagen, und jede sieht harmlos aus:
 *
 *   1. SIE GIBT EIN GEHEIMNIS AUS. Ein Dashboard, das „RESEND_API_KEY:
 *      re_abc…" zeigt, hat den Schlüssel an jeden weitergegeben, der die
 *      Seite oder das JSON sieht. Hier darf nur „ja"/„nein" stehen.
 *
 *   2. SIE BEHAUPTET, WAS SIE NICHT WISSEN KANN. `git HEAD`, `origin/main`
 *      und der CI-Ausgang sind in einem Serverless-Lauf nicht feststellbar.
 *      Ein Wert mit dem Etikett „gemessen" wäre eine Erfindung.
 *
 *   3. SIE VERWECHSELT „NICHT MESSBAR" MIT „NEIN". Fehlt VERCEL_ENV, ist
 *      der Lauf nicht etwa „keine Produktion" — es ist unbekannt, und der
 *      Unterschied entscheidet, ob jemand hier gefahrlos klickt.
 */

import { describe, it, expect } from 'vitest'
import { ermittleLaufzeitHerkunft, supabaseProjektKennung } from '@/lib/pilot/laufzeit-herkunft'

const GEHEIM = 're_geheimer_wert_der_nie_erscheinen_darf'

const PROD: Record<string, string | undefined> = {
  VERCEL_ENV: 'production',
  VERCEL_GIT_COMMIT_SHA: 'd5343832772a1e58a806d0369ec8f895d601a530',
  VERCEL_GIT_COMMIT_REF: 'main',
  NEXT_PUBLIC_SUPABASE_URL: 'https://beispielprojekt.supabase.co',
  RESEND_API_KEY: GEHEIM,
  CRON_SECRET: GEHEIM,
  SUPABASE_SERVICE_ROLE_KEY: GEHEIM,
}

describe('Keine Geheimnisse', () => {
  it('gibt keinen einzigen Geheimniswert zurück', () => {
    const h = ermittleLaufzeitHerkunft(PROD)
    expect(JSON.stringify(h)).not.toContain(GEHEIM)
  })

  it('sagt zu den Schlüsseln nur, OB sie gesetzt sind', () => {
    const h = ermittleLaufzeitHerkunft(PROD)
    const resend = h.punkte.find(p => p.schluessel === 'resend')
    expect(resend?.wert).toBe('ja')
    const ohne = ermittleLaufzeitHerkunft({ ...PROD, RESEND_API_KEY: undefined })
    expect(ohne.punkte.find(p => p.schluessel === 'resend')?.wert).toBe('nein')
  })

  it('sagt ausdrücklich, dass „gesetzt" nicht „gültig" heisst', () => {
    // Ein gesetzter, aber abgelaufener Schlüssel sieht hier grün aus.
    const h = ermittleLaufzeitHerkunft(PROD)
    const resend = h.punkte.find(p => p.schluessel === 'resend')
    expect(resend?.bedeutung).toMatch(/gültig|verify-resend/i)
  })
})

describe('Keine Behauptungen', () => {
  it('nennt weder git HEAD noch origin/main noch einen CI-Ausgang', () => {
    const h = ermittleLaufzeitHerkunft(PROD)
    const schluessel = h.punkte.map(p => p.schluessel)
    expect(schluessel).not.toContain('git_head')
    expect(schluessel).not.toContain('origin_main')
    expect(schluessel).not.toContain('ci')
  })

  it('jeder Punkt trägt entweder „gemessen" mit Wert oder „nicht_messbar" ohne', () => {
    for (const quelle of [PROD, {}]) {
      for (const p of ermittleLaufzeitHerkunft(quelle).punkte) {
        if (p.stand === 'gemessen') expect(p.wert, p.schluessel).not.toBeNull()
        else expect(p.wert, p.schluessel).toBeNull()
      }
    }
  })

  it('jeder Punkt erklärt, was er bedeutet', () => {
    for (const p of ermittleLaufzeitHerkunft({}).punkte) {
      expect(p.bedeutung.length, p.schluessel).toBeGreaterThan(20)
    }
  })
})

describe('Nicht messbar ist nicht „nein"', () => {
  it('ohne VERCEL_ENV steht der Punkt auf nicht_messbar', () => {
    const h = ermittleLaufzeitHerkunft({})
    const u = h.punkte.find(p => p.schluessel === 'umgebung')
    expect(u?.stand).toBe('nicht_messbar')
    expect(u?.wert).toBeNull()
  })

  it('produktion ist nur bei VERCEL_ENV=production wahr', () => {
    expect(ermittleLaufzeitHerkunft(PROD).produktion).toBe(true)
    expect(ermittleLaufzeitHerkunft({ ...PROD, VERCEL_ENV: 'preview' }).produktion).toBe(false)
    expect(ermittleLaufzeitHerkunft({}).produktion).toBe(false)
  })

  it('die Zusammenfassung gibt zu, wenn die Herkunft unvollständig ist', () => {
    const h = ermittleLaufzeitHerkunft({})
    expect(h.zusammenfassung).toMatch(/nicht vollständig messbar/i)
  })
})

describe('Commit und Projekt', () => {
  it('kürzt den Commit auf sieben Stellen', () => {
    const h = ermittleLaufzeitHerkunft(PROD)
    expect(h.punkte.find(p => p.schluessel === 'commit')?.wert).toBe('d534383')
  })

  it('sagt ausdrücklich, dass der laufende Commit nichts über origin/main aussagt', () => {
    const h = ermittleLaufzeitHerkunft(PROD)
    expect(h.punkte.find(p => p.schluessel === 'commit')?.bedeutung).toMatch(/Remote-Stand/i)
  })

  it('zieht die Projektkennung aus der Supabase-URL', () => {
    expect(supabaseProjektKennung('https://beispielprojekt.supabase.co')).toBe('beispielprojekt')
  })

  it('liefert bei eigenbetriebenen Instanzen den Host statt einer Erfindung', () => {
    expect(supabaseProjektKennung('https://db.intern.example')).toBe('db.intern.example')
  })

  it('liefert null statt einer Ausnahme bei unbrauchbarer URL', () => {
    expect(supabaseProjektKennung('kein-url')).toBeNull()
    expect(supabaseProjektKennung(undefined)).toBeNull()
    expect(supabaseProjektKennung('')).toBeNull()
  })

  it('die Zusammenfassung nennt Commit und Projekt zusammen', () => {
    const h = ermittleLaufzeitHerkunft(PROD)
    expect(h.zusammenfassung).toContain('d534383')
    expect(h.zusammenfassung).toContain('beispielprojekt')
  })
})
