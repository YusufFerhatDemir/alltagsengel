// Verhalten der ENV-Prüfung: fehlende Pflichten, Lecks, Geltungsbereiche.
// Alle Fälle laufen gegen eine übergebene Quelle, nie gegen process.env —
// ein Test, der die echte Umgebung anfasst, ist von der Maschine abhängig,
// auf der er läuft.
import { describe, it, expect, vi } from 'vitest'
import {
  pruefeEnv,
  pruefeEnvBeimStart,
  findeGeheimnisLecks,
  istProduktionslauf,
  istBuildLauf,
  abbruchGruende,
  befundText,
  type EnvQuelle,
} from '@/lib/env'

/** Minimal vollständige Umgebung: das Datenbank-Trio. */
const KERN: EnvQuelle = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-platzhalter',
  SUPABASE_SERVICE_ROLE_KEY: 'secret-platzhalter',
}

/** Zusätzlich die Produktions-Pflichten. */
const PRODUKTION: EnvQuelle = {
  ...KERN,
  RESEND_API_KEY: 're_platzhalter',
  CRON_SECRET: 'cron-platzhalter',
}

function protokollAttrappe() {
  return { error: vi.fn(), warn: vi.fn() }
}

describe('pruefeEnv — Pflichtvariablen', () => {
  it('meldet nichts, wenn das Datenbank-Trio steht (Entwicklung)', () => {
    const befund = pruefeEnv(KERN, { produktion: false })
    expect(befund.fehlendePflicht).toEqual([])
    expect(befund.ok).toBe(true)
  })

  it('akzeptiert die neuen Supabase-Key-Namen genauso wie die Legacy-Namen', () => {
    const neu: EnvQuelle = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
      SUPABASE_SECRET_KEY: 'sb_secret_x',
    }
    expect(pruefeEnv(neu, { produktion: false }).fehlendePflicht).toEqual([])
  })

  it('meldet den geheimen Server-Key, wenn beide Namen fehlen', () => {
    const ohne = { ...KERN, SUPABASE_SERVICE_ROLE_KEY: undefined }
    const namen = pruefeEnv(ohne, { produktion: false }).fehlendePflicht.map((f) => f.name)
    expect(namen).toContain('SUPABASE_SECRET_KEY')
  })

  it('behandelt einen leeren String wie „nicht gesetzt"', () => {
    const leer = { ...KERN, NEXT_PUBLIC_SUPABASE_URL: '   ' }
    const namen = pruefeEnv(leer, { produktion: false }).fehlendePflicht.map((f) => f.name)
    expect(namen).toContain('NEXT_PUBLIC_SUPABASE_URL')
  })

  it('verlangt Mailversand und Cron-Token erst im Produktivbetrieb', () => {
    expect(pruefeEnv(KERN, { produktion: false }).fehlendePflicht).toEqual([])

    const namen = pruefeEnv(KERN, { produktion: true }).fehlendePflicht.map((f) => f.name)
    expect(namen).toContain('RESEND_API_KEY')
    expect(namen).toContain('CRON_SECRET')
  })

  it('ist im Produktivbetrieb vollständig zufrieden, wenn alle fünf stehen', () => {
    expect(pruefeEnv(PRODUKTION, { produktion: true }).ok).toBe(true)
  })
})

describe('findeGeheimnisLecks', () => {
  it('findet ein Geheimnis unter NEXT_PUBLIC_-Namen', () => {
    const lecks = findeGeheimnisLecks({
      ...KERN,
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: 'geleakt',
    })
    expect(lecks).toContain('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY')
  })

  it('findet auch ein nicht verzeichnetes Geheimnis am Namensmuster', () => {
    const lecks = findeGeheimnisLecks({
      ...KERN,
      NEXT_PUBLIC_IRGENDEIN_API_KEY: 'geleakt',
      NEXT_PUBLIC_NEUES_SECRET: 'geleakt',
    })
    expect(lecks).toContain('NEXT_PUBLIC_IRGENDEIN_API_KEY')
    expect(lecks).toContain('NEXT_PUBLIC_NEUES_SECRET')
  })

  it('hält die verzeichneten öffentlichen Variablen für in Ordnung', () => {
    // Diese drei tragen „KEY" im Namen und sind trotzdem korrekt öffentlich.
    const lecks = findeGeheimnisLecks({
      ...KERN,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BPx…',
    })
    expect(lecks).toEqual([])
  })

  it('ignoriert einen leeren Wert', () => {
    expect(findeGeheimnisLecks({ ...KERN, NEXT_PUBLIC_STRIPE_SECRET_KEY: '' })).toEqual([])
  })
})

describe('Geltungsbereich', () => {
  it('liest VERCEL_ENV vor NODE_ENV', () => {
    expect(istProduktionslauf({ VERCEL_ENV: 'production', NODE_ENV: 'development' })).toBe(true)
    expect(istProduktionslauf({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toBe(false)
  })

  it('hält einen CI-Build nicht für Produktion', () => {
    // Sonst wäre jeder GitHub-Actions-Build rot: dort stehen nur Platzhalter.
    expect(istProduktionslauf({ NODE_ENV: 'production', CI: 'true' })).toBe(false)
  })

  it('erkennt den Next.js-Build', () => {
    expect(istBuildLauf({ NEXT_PHASE: 'phase-production-build' })).toBe(true)
    expect(istBuildLauf({})).toBe(false)
  })

  it('warnt, wenn eine Entwicklungs-Variable in Produktion gesetzt ist', () => {
    const befund = pruefeEnv({ ...PRODUKTION, DISABLE_RATE_LIMIT_FOR_E2E: '1' }, { produktion: true })
    expect(befund.warnungen.join(' ')).toContain('DISABLE_RATE_LIMIT_FOR_E2E')
    // Eine Warnung blockiert den Start nicht.
    expect(abbruchGruende(befund)).toEqual([])
  })
})

describe('abbruchGruende — was den Start wirklich stoppt', () => {
  it('stoppt bei fehlendem Datenbank-Trio', () => {
    const befund = pruefeEnv({}, { produktion: false })
    expect(abbruchGruende(befund).length).toBe(3)
  })

  it('stoppt bei einem Leck', () => {
    const befund = pruefeEnv({ ...KERN, NEXT_PUBLIC_STRIPE_SECRET_KEY: 'x' }, { produktion: false })
    expect(abbruchGruende(befund).join(' ')).toContain('NEXT_PUBLIC_STRIPE_SECRET_KEY')
  })

  it('stoppt NICHT bei fehlendem Mailversand in Produktion', () => {
    // Bewusst: eine laufende Seite ohne Mailversand ist besser als keine
    // Seite. Der Befund wird laut protokolliert, nicht verschwiegen.
    const befund = pruefeEnv(KERN, { produktion: true })
    expect(befund.fehlendePflicht.map((f) => f.name)).toContain('RESEND_API_KEY')
    expect(abbruchGruende(befund)).toEqual([])
  })
})

describe('pruefeEnvBeimStart', () => {
  it('wirft, wenn das Datenbank-Trio fehlt', () => {
    const p = protokollAttrappe()
    expect(() => pruefeEnvBeimStart({}, p)).toThrow(/Start abgebrochen/)
    expect(p.error).toHaveBeenCalled()
  })

  it('wirft bei einem Leck, auch wenn sonst alles steht', () => {
    const p = protokollAttrappe()
    expect(() =>
      pruefeEnvBeimStart({ ...PRODUKTION, VERCEL_ENV: 'production', NEXT_PUBLIC_CRON_SECRET: 'x' }, p),
    ).toThrow(/NEXT_PUBLIC_CRON_SECRET/)
  })

  it('läuft durch, wenn die Umgebung vollständig ist', () => {
    const p = protokollAttrappe()
    const befund = pruefeEnvBeimStart({ ...PRODUKTION, VERCEL_ENV: 'production' }, p)
    expect(befund.ok).toBe(true)
    expect(p.error).not.toHaveBeenCalled()
  })

  it('bricht einen Build NIE ab, sondern warnt nur', () => {
    // Der Vercel-/CI-Build läuft mit Platzhaltern. Würde die Prüfung dort
    // werfen, wäre kein Deployment mehr möglich — der Schutz hätte sich
    // gegen das Projekt gedreht.
    const p = protokollAttrappe()
    expect(() => pruefeEnvBeimStart({ NEXT_PHASE: 'phase-production-build' }, p)).not.toThrow()
    expect(p.warn).toHaveBeenCalled()
  })

  it('gibt niemals einen Wert aus, nur Namen', () => {
    const geheim = 'streng-geheimer-wert-4711'
    const befund = pruefeEnv({ ...KERN, NEXT_PUBLIC_MEIN_SECRET: geheim }, { produktion: false })
    const text = befundText(befund)
    expect(text).toContain('NEXT_PUBLIC_MEIN_SECRET')
    expect(text).not.toContain(geheim)
  })
})
