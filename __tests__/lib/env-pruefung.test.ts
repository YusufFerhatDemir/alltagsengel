/**
 * ENV-Prüfung — Startkontrolle der Umgebungsvariablen
 *
 * Sicherheitsrelevant und rein rechnend: die beste Kombination für einen
 * Test, und trotzdem war das Modul bisher ungeprüft, obwohl es an neun
 * Stellen eingebunden ist.
 *
 * Zwei Eigenschaften tragen die Last:
 *
 *   1. `findeGeheimnisLecks()` fängt ein Geheimnis, das unter einem
 *      NEXT_PUBLIC_-Namen steht — das landet im Browser-Bundle und ist
 *      damit veröffentlicht, nicht nur falsch abgelegt.
 *   2. `istProduktionslauf()` entscheidet über VERCEL_ENV, NICHT über
 *      NODE_ENV. Beim `next build` im CI steht NODE_ENV auf 'production',
 *      die Betriebsgeheimnisse sind dort aber absichtlich Platzhalter.
 *      Eine Prüfung auf NODE_ENV machte jeden CI-Build rot.
 *
 * Die Tests arbeiten mit einer übergebenen Quelle statt mit process.env —
 * so wird nichts am laufenden Prozess verändert.
 */

import { describe, it, expect } from 'vitest'
import {
  abbruchGruende, akzeptierteNamen, befundText, findeGeheimnisLecks,
  istBuildLauf, istGesetzt, istProduktionslauf, pruefeEnv,
} from '@/lib/env/pruefung'
import { ENV_REGISTER } from '@/lib/env/register'

/** Alles gesetzt, was 'immer' Pflicht ist — die Grundlage sauberer Läufe. */
function pflichtImmer(): Record<string, string> {
  const quelle: Record<string, string> = {}
  for (const eintrag of ENV_REGISTER) {
    if (eintrag.praefix) continue
    if (eintrag.notwendigkeit === 'pflicht' && eintrag.wann === 'immer') {
      quelle[eintrag.name] = 'gesetzt'
    }
  }
  return quelle
}

describe('istProduktionslauf', () => {
  it('folgt VERCEL_ENV, wenn es gesetzt ist', () => {
    expect(istProduktionslauf({ VERCEL_ENV: 'production' })).toBe(true)
    expect(istProduktionslauf({ VERCEL_ENV: 'preview' })).toBe(false)
    expect(istProduktionslauf({ VERCEL_ENV: 'development' })).toBe(false)
  })

  it('lässt VERCEL_ENV über NODE_ENV gewinnen', () => {
    // Ein Preview-Deployment ist kein Produktivbetrieb, auch wenn Next
    // dort NODE_ENV auf 'production' setzt.
    expect(istProduktionslauf({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toBe(false)
  })

  it('wertet NODE_ENV=production im CI NICHT als Produktivbetrieb', () => {
    // Genau die Falle: sonst wäre jeder CI-Build rot, weil dort nur
    // Platzhalter stehen.
    expect(istProduktionslauf({ NODE_ENV: 'production', CI: 'true' })).toBe(false)
    expect(istProduktionslauf({ NODE_ENV: 'production' })).toBe(true)
  })

  it('ist bei leerer Umgebung kein Produktivbetrieb', () => {
    expect(istProduktionslauf({})).toBe(false)
  })
})

describe('istBuildLauf', () => {
  it('erkennt die Build-Phase', () => {
    expect(istBuildLauf({ NEXT_PHASE: 'phase-production-build' })).toBe(true)
    expect(istBuildLauf({ NEXT_PHASE: 'phase-production-server' })).toBe(false)
    expect(istBuildLauf({})).toBe(false)
  })
})

describe('istGesetzt', () => {
  const eintrag = { name: 'A', alternativen: ['B'] } as never

  it('gilt unter jedem akzeptierten Namen', () => {
    expect(istGesetzt(eintrag, { A: 'x' })).toBe(true)
    expect(istGesetzt(eintrag, { B: 'x' })).toBe(true)
    expect(akzeptierteNamen(eintrag)).toEqual(['A', 'B'])
  })

  it('wertet leere und reine Leerzeichen-Werte als NICHT gesetzt', () => {
    // Eine Variable, die in Vercel angelegt aber leer ist, wäre sonst
    // „vorhanden" — und der Ausfall fiele erst im Betrieb auf.
    expect(istGesetzt(eintrag, { A: '' })).toBe(false)
    expect(istGesetzt(eintrag, { A: '   ' })).toBe(false)
    expect(istGesetzt(eintrag, {})).toBe(false)
  })
})

describe('findeGeheimnisLecks', () => {
  it('findet ein verzeichnetes Geheimnis unter NEXT_PUBLIC_-Namen', () => {
    const geheim = ENV_REGISTER.find(e => e.geheim && !e.praefix)!
    const lecks = findeGeheimnisLecks({ [`NEXT_PUBLIC_${geheim.name}`]: 'wert' })
    expect(lecks).toContain(`NEXT_PUBLIC_${geheim.name}`)
  })

  it('findet auch ein NICHT verzeichnetes Geheimnis am Namensmuster', () => {
    // Der wichtigere der beiden Wege: er fängt, was noch niemand
    // eingetragen hat — genau der Fall, in dem ein Leck unbemerkt entsteht.
    for (const name of [
      'NEXT_PUBLIC_STRIPE_SECRET', 'NEXT_PUBLIC_DB_PASSWORD',
      'NEXT_PUBLIC_SOME_API_KEY', 'NEXT_PUBLIC_ACCESS_TOKEN',
      'NEXT_PUBLIC_SERVICE_ROLE_X', 'NEXT_PUBLIC_PRIVATE_KEY',
    ]) {
      expect(findeGeheimnisLecks({ [name]: 'wert' }), name).toContain(name)
    }
  })

  it('meldet verzeichnete öffentliche Variablen NICHT als Leck', () => {
    const oeffentlich = ENV_REGISTER.find(
      e => !e.geheim && !e.praefix && e.name.startsWith('NEXT_PUBLIC_'),
    )
    if (!oeffentlich) return
    expect(findeGeheimnisLecks({ [oeffentlich.name]: 'wert' })).not.toContain(oeffentlich.name)
  })

  it('meldet leere Werte nicht', () => {
    // Eine angelegte, aber leere Variable ist kein ausgeliefertes Geheimnis.
    expect(findeGeheimnisLecks({ NEXT_PUBLIC_SOME_SECRET: '' })).toEqual([])
    expect(findeGeheimnisLecks({ NEXT_PUBLIC_SOME_SECRET: '  ' })).toEqual([])
  })

  it('ignoriert Geheimnisse ohne öffentliches Präfix', () => {
    // Serverseitig gesetzte Geheimnisse sind der Normalfall, kein Leck.
    expect(findeGeheimnisLecks({ SOME_API_KEY: 'wert', DB_PASSWORD: 'wert' })).toEqual([])
  })

  it('liefert jeden Namen nur einmal und sortiert', () => {
    const lecks = findeGeheimnisLecks({
      NEXT_PUBLIC_Z_SECRET: 'a', NEXT_PUBLIC_A_SECRET: 'b',
    })
    expect(lecks).toEqual([...new Set(lecks)])
    expect(lecks).toEqual([...lecks].sort())
  })
})

describe('pruefeEnv', () => {
  it('ist bei vollständiger Umgebung in Ordnung', () => {
    const befund = pruefeEnv(pflichtImmer(), { produktion: false })
    expect(befund.fehlendePflicht).toEqual([])
    expect(befund.lecks).toEqual([])
    expect(befund.ok).toBe(true)
  })

  it('meldet fehlende Immer-Pflichten auch außerhalb der Produktion', () => {
    const befund = pruefeEnv({}, { produktion: false })
    expect(befund.ok).toBe(false)
    expect(befund.fehlendePflicht.every(f => f.wann === 'immer')).toBe(true)
    expect(befund.fehlendePflicht.length).toBeGreaterThan(0)
  })

  it('prüft Produktions-Pflichten nur im Produktivbetrieb', () => {
    const ohne = pruefeEnv(pflichtImmer(), { produktion: false })
    const mit = pruefeEnv(pflichtImmer(), { produktion: true })
    expect(mit.fehlendePflicht.length).toBeGreaterThan(ohne.fehlendePflicht.length)
    expect(mit.fehlendePflicht.some(f => f.wann === 'produktion')).toBe(true)
  })

  it('warnt vor Entwicklungs-Variablen im Produktivbetrieb', () => {
    const entwicklung = ENV_REGISTER.find(e => e.wann === 'entwicklung' && !e.praefix)
    if (!entwicklung) return
    const befund = pruefeEnv({ ...pflichtImmer(), [entwicklung.name]: '1' }, { produktion: true })
    expect(befund.warnungen.join(' ')).toContain(entwicklung.name)
  })

  it('ist bei einem Leck NICHT ok, auch wenn nichts fehlt', () => {
    const befund = pruefeEnv({ ...pflichtImmer(), NEXT_PUBLIC_X_SECRET: 'wert' }, { produktion: false })
    expect(befund.ok).toBe(false)
    expect(befund.lecks).toContain('NEXT_PUBLIC_X_SECRET')
  })

  it('überspringt Präfix-Einträge', () => {
    // Für sie gibt es keinen festen Namen — es ist nicht bekannt, wie
    // viele Datenannahmestellen es gibt.
    const befund = pruefeEnv({}, { produktion: true })
    const praefixNamen = ENV_REGISTER.filter(e => e.praefix).map(e => e.name)
    for (const name of praefixNamen) {
      expect(befund.fehlendePflicht.map(f => f.name)).not.toContain(name)
    }
  })
})

describe('abbruchGruende', () => {
  it('bricht bei einem Leck ab', () => {
    const befund = pruefeEnv({ ...pflichtImmer(), NEXT_PUBLIC_X_SECRET: 'wert' }, { produktion: false })
    expect(abbruchGruende(befund).join(' ')).toContain('NEXT_PUBLIC_X_SECRET')
  })

  it('bricht bei fehlenden Immer-Pflichten ab', () => {
    expect(abbruchGruende(pruefeEnv({}, { produktion: false })).length).toBeGreaterThan(0)
  })

  it('bricht bei fehlenden PRODUKTIONS-Pflichten NICHT ab', () => {
    // Mailversand und Cron-Token fehlen laut, aber sie machen die
    // Anwendung nicht unbrauchbar — ein Abbruch nähme alles mit.
    const befund = pruefeEnv(pflichtImmer(), { produktion: true })
    expect(befund.fehlendePflicht.some(f => f.wann === 'produktion')).toBe(true)
    expect(abbruchGruende(befund)).toEqual([])
  })

  it('ist bei sauberer Umgebung leer', () => {
    expect(abbruchGruende(pruefeEnv(pflichtImmer(), { produktion: false }))).toEqual([])
  })
})

describe('befundText', () => {
  it('nennt ausschließlich Namen, niemals Werte', () => {
    // Der Text landet im Log. Ein Wert darin wäre genau das Leck, das
    // die Prüfung verhindern soll.
    const geheimwert = 'sk-streng-geheim-4711'
    const text = befundText(pruefeEnv(
      { NEXT_PUBLIC_X_SECRET: geheimwert }, { produktion: true },
    ))
    expect(text).toContain('NEXT_PUBLIC_X_SECRET')
    expect(text).not.toContain(geheimwert)
  })

  it('ist bei sauberem Befund leer', () => {
    expect(befundText(pruefeEnv(pflichtImmer(), { produktion: false }))).toBe('')
  })

  it('nennt alternative Namen als Auswahl', () => {
    const mitAlternativen = ENV_REGISTER.find(
      e => e.alternativen?.length && e.notwendigkeit === 'pflicht' && !e.praefix,
    )
    if (!mitAlternativen) return
    const text = befundText(pruefeEnv({}, { produktion: true }))
    if (text.includes(mitAlternativen.name)) expect(text).toContain(' oder ')
  })
})
