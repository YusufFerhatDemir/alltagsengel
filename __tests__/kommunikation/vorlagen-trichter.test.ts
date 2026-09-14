/**
 * Die Vorlagen zu den Trichterstufen.
 * @see lib/email/templates.ts, lib/kunde/pipeline.ts, lib/bewerbung/pipeline.ts
 *
 * ── WAS HIER GEPRÜFT WIRD ─────────────────────────────────────────────
 * Nicht der Wortlaut — der gehört der Geschäftsführung. Geprüft werden die
 * Eigenschaften, an denen eine Vorlage scheitern kann, ohne dass es beim
 * Schreiben auffällt:
 *
 *   1. Kein persönlicher Name als Absender oder Unterschrift. Kundenseitig
 *      heißt der Absender „Alltagsengel", niemals eine Einzelperson.
 *   2. Keine Zusage der Kostenübernahme. Die Anerkennung nach § 45a SGB XI
 *      steht aus; „Ihre Pflegekasse übernimmt" wäre eine Falschaussage.
 *   3. Ein Termin ist ein Pflichtfeld. Eine Einladung ohne Termin ist eine
 *      Mail mit einer Lücke, die erst der Empfänger bemerkt.
 *   4. Jede Vorlage rendert, und jede eingesetzte Angabe ist escaped.
 */
import { describe, it, expect } from 'vitest'
import { EMAIL_VORLAGEN, vorlageFinden, vorlageRendern } from '@/lib/email/templates'

/** Die Vorlagen, die zu einem Stufenwechsel gehören. */
const TRICHTER = [
  'kunde_erstgespraech_termin', 'kunde_erstgespraech_erinnerung',
  'kunde_angebot', 'kunde_vertrag', 'kunde_absage',
  'bewerber_probearbeit', 'bewerber_erinnerung',
]

describe('Vorlagen zu den Trichterstufen', () => {
  it('es gibt sie alle', () => {
    for (const id of TRICHTER) expect(vorlageFinden(id), id).not.toBeNull()
  })

  it('jede trägt eine Kennung genau einmal', () => {
    const ids = EMAIL_VORLAGEN.map(v => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ein Termin ist immer ein Pflichtfeld', () => {
    for (const id of TRICHTER) {
      const v = vorlageFinden(id)!
      const termin = v.felder.find(f => f.key === 'termin')
      if (termin) expect(termin.pflicht, id).toBe(true)
    }
  })

  it('meldet fehlende Pflichtfelder, statt eine Lücke zu senden', () => {
    const r = vorlageRendern(vorlageFinden('kunde_erstgespraech_termin')!, { vorname: 'Anna' })
    expect(r.fehlendeFelder.length).toBeGreaterThan(0)
  })

  it('rendert vollständig ohne Beanstandung', () => {
    const r = vorlageRendern(vorlageFinden('bewerber_probearbeit')!, {
      vorname: 'Anna', termin: '20.09.2026, 9 Uhr', treffpunkt: 'Büro Frankfurt',
    })
    expect(r.fehlendeFelder).toEqual([])
    expect(r.rumpfHtml).toContain('20.09.2026')
    expect(r.betreff.length).toBeGreaterThan(5)
  })

  it('escaped eingesetzte Angaben', () => {
    // Eine Vorlage ist HTML. Ein Ort mit spitzem Winkel darin waere sonst
    // eine Luecke.
    const r = vorlageRendern(vorlageFinden('kunde_erstgespraech_termin')!, {
      vorname: 'A', termin: '<script>alert(1)</script>', ort: 'zu Hause',
    })
    expect(r.rumpfHtml).not.toContain('<script>')
    expect(r.rumpfHtml).toContain('&lt;script&gt;')
  })
})

describe('Kundenkommunikation — die Regeln aus CLAUDE.md', () => {
  const alleTexte = EMAIL_VORLAGEN.map(v => {
    const werte = Object.fromEntries(v.felder.map(f => [f.key, f.beispiel || 'X']))
    return `${v.betreff(werte)} ${v.rumpf(werte)}`
  }).join('\n')

  it('nennt keinen persönlichen Namen als Absender', () => {
    // Absender und Unterschrift sind IMMER „Alltagsengel" — nie eine
    // Einzelperson. Die Namen stehen bewusst hier, damit der Test
    // fehlschlägt, wenn einer in eine Vorlage rutscht.
    for (const name of ['Yusuf', 'Cilcioglu', 'Abdullah']) {
      expect(alleTexte, name).not.toContain(name)
    }
  })

  it('verspricht keine Kostenübernahme durch die Pflegekasse', () => {
    // Die Anerkennung nach § 45a SGB XI steht aus. „Ihre Pflegekasse
    // übernimmt die Kosten" waere eine Zusage, die wir nicht halten koennen.
    expect(alleTexte).not.toMatch(/Pflegekasse übernimmt/i)
    expect(alleTexte).not.toMatch(/übernimmt (die )?Kosten/i)
  })

  it('nennt den Entlastungsbetrag mit 131 €, nie mit 125 €', () => {
    expect(alleTexte).not.toContain('125')
    if (alleTexte.includes('Entlastungsbetrag')) expect(alleTexte).toContain('131')
  })

  it('nennt das Anerkennungsverfahren, wo der Entlastungsbetrag steht', () => {
    for (const v of EMAIL_VORLAGEN) {
      const werte = Object.fromEntries(v.felder.map(f => [f.key, f.beispiel || 'X']))
      const text = v.rumpf(werte)
      if (!text.includes('Entlastungsbetrag')) continue
      expect(text, v.id).toMatch(/Anerkennungsverfahren/)
    }
  })

  it('verlinkt nur auf die betriebene Domain', () => {
    expect(alleTexte).not.toContain('alltagsengel.de')
    expect(alleTexte).not.toContain('alltagsengel.org')
  })
})
