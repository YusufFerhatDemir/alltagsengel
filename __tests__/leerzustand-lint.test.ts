/**
 * Tests fuer die Prevention-Control „Leerzustand aus verworfenem Ladefehler".
 * @see scripts/lint-leerzustand.ts
 *
 * Zwei Aufgaben, wie bei der Schwesterregel: die echte Form FINDEN und die
 * legitimen Formen NICHT anschlagen. Ohne den zweiten Teil wird eine
 * Prevention-Control abgeschaltet, sobald sie einmal zu laut war — und
 * dann faengt sie gar nichts mehr.
 */
import { describe, it, expect } from 'vitest'
import { pruefeQuelle } from '../scripts/lint-leerzustand'

describe('lint-leerzustand — findet die Form', () => {
  it('erkennt die leere Liste aus einem verworfenen Fehler', () => {
    // Die Urform: app/engel/dokumente, app/kunde/dokumente,
    // app/admin/rechnungen … bis 31.08.2026 an 55 Stellen.
    const quelle = `
      const { data } = await supabase.from('assignments').select('*')
      setEinsaetze(data || [])
    `
    const befunde = pruefeQuelle(quelle, 'x.tsx')
    expect(befunde).toHaveLength(1)
    expect(befunde[0].variable).toBe('data')
  })

  it('erkennt die umbenannte Form', () => {
    const quelle = `
      const { data: ridesData } = await supabase.from('krankenfahrten').select('*')
      setRides(ridesData || [])
    `
    const befunde = pruefeQuelle(quelle, 'x.tsx')
    expect(befunde).toHaveLength(1)
    expect(befunde[0].variable).toBe('ridesData')
  })

  it('erkennt auch den Weg ueber den Zustand statt ueber `|| []`', () => {
    // `setProfile(p)` ohne Fehlerpruefung: das Formular steht leer und
    // „Speichern" schreibt die Leere zurueck.
    const quelle = `
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p)
    `
    expect(pruefeQuelle(quelle, 'x.tsx')).toHaveLength(1)
  })

  it('erkennt `?? []` genauso wie `|| []`', () => {
    const quelle = `
      const { data: zeilen } = await supabase.from('invoices').select('*')
      const liste = zeilen ?? []
    `
    expect(pruefeQuelle(quelle, 'x.tsx')).toHaveLength(1)
  })

  it('findet mehrere Stellen in derselben Datei', () => {
    const quelle = `
      const { data: a } = await supabase.from('documents').select('*')
      setDocs(a || [])
      const { data: b } = await supabase.from('akten_dokumente').select('*')
      setAkte(b || [])
    `
    expect(pruefeQuelle(quelle, 'x.tsx')).toHaveLength(2)
  })
})

describe('lint-leerzustand — schlaegt bei den legitimen Formen nicht an', () => {
  it('laesst eine Abfrage MIT Fehlerpruefung durch', () => {
    const quelle = `
      const { data, error } = await supabase.from('assignments').select('*')
      if (error) { setLadeFehler(true); return }
      setEinsaetze(data || [])
    `
    expect(pruefeQuelle(quelle, 'x.tsx')).toHaveLength(0)
  })

  it('laesst ladeListe() durch — das ist ja der Fix', () => {
    const quelle = `
      const lage = await ladeListe<Zeile>(supabase.from('x').select('*'), 'bereich:zweck')
      if (istFehler(lage)) { setFehler(LADEFEHLER_TEXT); return }
      setZeilen(zeilenVon(lage))
    `
    expect(pruefeQuelle(quelle, 'x.tsx')).toHaveLength(0)
  })

  it('laesst auth.getUser() in Ruhe', () => {
    // Dort IST null bereits die Aussage „nicht angemeldet" und kein
    // verworfener Ladefehler.
    const quelle = `
      const { data } = await supabase.auth.getUser()
      setUser(data.user)
    `
    expect(pruefeQuelle(quelle, 'x.tsx')).toHaveLength(0)
  })

  it('schlaegt nicht an, wenn das Ergebnis gar nicht in eine Anzeige laeuft', () => {
    const quelle = `
      const { data } = await supabase.from('audit').insert(zeile)
      return data
    `
    expect(pruefeQuelle(quelle, 'x.tsx')).toHaveLength(0)
  })

  it('schlaegt nicht an, wenn die Verwertung weit hinter der Abfrage steht', () => {
    // Bewusste Grenze der Regel (siehe Kopf von scripts/lint-leerzustand.ts):
    // sie sieht nur das unmittelbare Fenster. Das hier haelt fest, dass die
    // Grenze bekannt ist und nicht versehentlich verschoben wird.
    const quelle = `
      const { data } = await supabase.from('x').select('*')
      ${'// Fuellzeile\n      '.repeat(70)}
      setListe(data || [])
    `
    expect(pruefeQuelle(quelle, 'x.tsx')).toHaveLength(0)
  })
})

describe('lint-leerzustand — laeuft ueber den echten Bestand sauber', () => {
  it('findet in app/ und components/ keine Stelle mehr', async () => {
    // Das ist die eigentliche Regressionssperre: die 55 Befunde vom
    // 31.08.2026 sind zu, und eine neue Stelle faellt hier auf, nicht erst
    // im Betrieb.
    const { readFileSync, readdirSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const SKIP = ['node_modules', '.next', 'dist', 'out', '__tests__']

    function sammeln(wurzel: string, treffer: string[] = []): string[] {
      let eintraege: string[]
      try { eintraege = readdirSync(wurzel) } catch { return treffer }
      for (const e of eintraege) {
        if (SKIP.includes(e)) continue
        const pfad = join(wurzel, e)
        if (statSync(pfad).isDirectory()) sammeln(pfad, treffer)
        else if (pfad.endsWith('.tsx') && !pfad.endsWith('.test.tsx')) treffer.push(pfad)
      }
      return treffer
    }

    const befunde = ['app', 'components']
      .flatMap(w => sammeln(w))
      .flatMap(d => pruefeQuelle(readFileSync(d, 'utf-8'), d))

    expect(
      befunde.map(b => `${b.datei}:${b.zeile} (${b.variable})`),
      'Neue Stelle, an der ein verworfener Abfragefehler als Leerzustand erscheint',
    ).toEqual([])
  })
})
