/**
 * Titel- und Beschreibungslängen der FESTEN Seiten.
 *
 * ── WARUM ES DIESEN TEST BRAUCHT ──────────────────────────────────────
 * `stadtseiten-metadaten.test.ts` prüft dieselben Grenzen — aber nur für
 * die vier Stadtseiten-Silos. Die festen Seiten und die Ratgeberartikel
 * hat nie jemand gemessen. Am 13.09.2026 fiel das an `/entlastungsbetrag`
 * auf: **207 Zeichen** Beschreibung, live ausgeliefert. Google schneidet
 * bei rund 160 ab — der Rest war geschrieben, bezahlt und unsichtbar.
 *
 * Ein Test, der nur einen Teil der Seiten sieht, ist genau so viel wert
 * wie kein Test für den Rest.
 *
 * ── WARUM DER SUFFIX MITZÄHLT ─────────────────────────────────────────
 * `app/layout.tsx` hängt über `title.template` an jeden Seitentitel
 * „ | Alltagsengel". Wer nur den rohen Titel misst, misst nicht das, was
 * in der Suchergebnisliste steht.
 */
import { describe, it, expect } from 'vitest'
import type { Metadata } from 'next'
import { SEITEN } from './_seiten'

/** Aus app/layout.tsx: `title.template`. */
const MARKEN_SUFFIX = ' | Alltagsengel'
const TITEL_MAX = 60
const BESCHREIBUNG_MAX = 160
/** Unter dieser Länge verschenkt eine Beschreibung Platz im Snippet. */
const BESCHREIBUNG_MIN = 70

interface Gemessen { pfad: string; titel: string; beschreibung: string }

async function alleSeiten(): Promise<Gemessen[]> {
  const raus: Gemessen[] = []
  for (const [pfad, laden] of Object.entries(SEITEN)) {
    const mod = await laden()
    const meta: Metadata | undefined = mod.metadata
    if (!meta) continue
    const rohTitel = typeof meta.title === 'string'
      ? meta.title
      : (meta.title as { absolute?: string; default?: string } | undefined)?.absolute
        ?? (meta.title as { default?: string } | undefined)?.default
        ?? ''
    // `absolute` umgeht das Template — dann zählt der Suffix NICHT mit.
    const absolut = typeof meta.title === 'object'
      && !!(meta.title as { absolute?: string })?.absolute
    raus.push({
      pfad,
      titel: absolut ? rohTitel : rohTitel + MARKEN_SUFFIX,
      beschreibung: typeof meta.description === 'string' ? meta.description : '',
    })
  }
  return raus
}

describe('Metadaten der festen Seiten', () => {
  it('jede Seite hat überhaupt Titel und Beschreibung', async () => {
    const fehlend = (await alleSeiten()).filter(s => !s.titel.trim() || !s.beschreibung.trim())
    expect(fehlend.map(s => s.pfad)).toEqual([])
  })

  it('kein Titel über 60 Zeichen — Suffix eingerechnet', async () => {
    const zuLang = (await alleSeiten())
      .filter(s => s.titel.length > TITEL_MAX)
      .map(s => `${s.pfad} (${s.titel.length})`)
    expect(zuLang).toEqual([])
  })

  it('keine Beschreibung über 160 Zeichen', async () => {
    // Der Fall vom 13.09.2026. Was drüber steht, liest niemand.
    const zuLang = (await alleSeiten())
      .filter(s => s.beschreibung.length > BESCHREIBUNG_MAX)
      .map(s => `${s.pfad} (${s.beschreibung.length})`)
    expect(zuLang).toEqual([])
  })

  it('keine Beschreibung unter 70 Zeichen — verschenkter Platz', async () => {
    const zuKurz = (await alleSeiten())
      .filter(s => s.beschreibung.length < BESCHREIBUNG_MIN)
      .map(s => `${s.pfad} (${s.beschreibung.length})`)
    expect(zuKurz).toEqual([])
  })

  it('keine zwei Seiten teilen sich dieselbe Beschreibung', async () => {
    // Zwei identische Snippets heissen fuer Google: eine der beiden Seiten
    // ist ueberfluessig.
    const nach = new Map<string, string[]>()
    for (const s of await alleSeiten()) {
      const k = s.beschreibung.trim().toLowerCase()
      if (!k) continue
      nach.set(k, [...(nach.get(k) ?? []), s.pfad])
    }
    const doppelt = [...nach.values()].filter(v => v.length > 1)
    expect(doppelt).toEqual([])
  })

  it('keine zwei Seiten teilen sich denselben Titel', async () => {
    const nach = new Map<string, string[]>()
    for (const s of await alleSeiten()) {
      const k = s.titel.trim().toLowerCase()
      nach.set(k, [...(nach.get(k) ?? []), s.pfad])
    }
    const doppelt = [...nach.values()].filter(v => v.length > 1)
    expect(doppelt).toEqual([])
  })
})
