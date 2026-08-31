// ═══════════════════════════════════════════════════════════════════
// Absender-Schutz: kein persoenlicher Name in Kundenrichtung
// ═══════════════════════════════════════════════════════════════════
// Hausregel: Absender und Unterschrift sind in JEDER Kommunikation an
// Kunden „Alltagsengel", nie eine Person.
//
// Umgesetzt war sie an genau einer Stelle — im WhatsApp-Webhook. Der
// oeffentliche Beratungs-Chat (/api/beratung-chat) gab die
// Modellantwort ungefiltert an den Besucher zurueck. Sein Systemprompt
// verbietet Namen zwar, aber ein Systemprompt ist eine Bitte; der
// Filter existiert genau fuer den Fall, dass sie ignoriert wird.
//
// ABGRENZUNG, bewusst: /api/ai-chat bleibt ungefiltert. Der Endpunkt
// ist adminpflichtig (quellenSindAdministration) und speist den
// MIS-Assistenten — das ist interne Nutzung, keine Kundenrichtung. Und
// Impressum, Datenschutz und Briefkopf-Fuss nennen den
// Geschaeftsfuehrer weiterhin: § 35a GmbHG verlangt die Angabe auf
// Geschaeftsbriefen.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  schuetzeAbsender,
  enthaeltAbsendername,
  VERBOTENE_ABSENDERNAMEN,
  ERSATZ_ABSENDER,
} from '@/lib/kommunikation/absender-schutz'
import { sanitizeNames } from '@/lib/whatsapp/confidence'

const WURZEL = process.cwd()

describe('schuetzeAbsender ersetzt jeden gefuehrten Namen', () => {
  it.each([...VERBOTENE_ABSENDERNAMEN])('%s verschwindet aus der Antwort', (name) => {
    const erg = schuetzeAbsender(`Guten Tag, ${name} meldet sich gleich bei Ihnen.`)
    expect(erg.didReplace).toBe(true)
    expect(erg.sanitized).toContain(ERSATZ_ABSENDER)
    expect(erg.sanitized.toLowerCase()).not.toContain(name.toLowerCase())
  })

  it('greift unabhaengig von Gross- und Kleinschreibung', () => {
    expect(schuetzeAbsender('yusuf ruft an').sanitized).toBe(`${ERSATZ_ABSENDER} ruft an`)
    expect(schuetzeAbsender('YUSUF ruft an').sanitized).toBe(`${ERSATZ_ABSENDER} ruft an`)
  })

  it('ersetzt die laengste Schreibweise, nicht nur den Vornamen', () => {
    const erg = schuetzeAbsender('Fragen Sie Yusuf Ferhat Demir.')
    expect(erg.sanitized).toBe(`Fragen Sie ${ERSATZ_ABSENDER}.`)
    expect(erg.sanitized).not.toMatch(/Ferhat|Demir/)
  })

  it('reduziert die Doppelung "das das Alltagsengel-Team"', () => {
    expect(schuetzeAbsender('Das Yusuf hilft.').sanitized).toBe(`${ERSATZ_ABSENDER} hilft.`)
  })

  it('laesst eine saubere Antwort unveraendert', () => {
    const original = 'Gerne, das Alltagsengel-Team meldet sich in Kürze bei Ihnen.'
    const erg = schuetzeAbsender(original)
    expect(erg.didReplace).toBe(false)
    expect(erg.replaced).toEqual([])
    expect(erg.sanitized).toBe(original)
  })

  it('trifft keine Teilwoerter', () => {
    // Wortgrenze: ein Name darf nicht mitten in einem anderen Wort
    // ersetzt werden.
    const erg = schuetzeAbsender('Die Cilcioglustrasse ist gesperrt.')
    expect(erg.didReplace).toBe(false)
  })

  it('enthaeltAbsendername beantwortet dieselbe Frage, ohne zu veraendern', () => {
    expect(enthaeltAbsendername('Yusuf ruft an')).toBe(true)
    expect(enthaeltAbsendername('Das Alltagsengel-Team ruft an')).toBe(false)
  })
})

describe('der WhatsApp-Pfad verhaelt sich unveraendert', () => {
  // Die Auslagerung darf am bestehenden Kanal nichts aendern. Diese
  // Faelle sind woertlich die der bisherigen Tests.
  const faelle = [
    'Yusuf Ferhat Demir meldet sich gleich.',
    'Hallo, Yusuf kümmert sich darum.',
    'Herr Cilcioglu ist zuständig.',
    'das Yusuf Ferhat Demir ruft Sie an',
    'Yusuf Demir und Y. Cilcioglu',
    'Wir helfen Ihnen gerne weiter.',
  ]

  it.each(faelle)('sanitizeNames liefert dasselbe wie schuetzeAbsender: %s', (text) => {
    expect(sanitizeNames(text)).toEqual(schuetzeAbsender(text))
  })

  it('kein Name bleibt in einer der Antworten stehen', () => {
    for (const text of faelle) {
      expect(enthaeltAbsendername(sanitizeNames(text).sanitized)).toBe(false)
    }
  })
})

describe('Zaun: jeder kundengerichtete KI-Kanal filtert', () => {
  /**
   * Kanaele, die frei formulierten Modelltext an Kunden zurueckgeben.
   * Neue LLM-Endpunkte gehoeren hier hinein — oder in die
   * Begruendungsliste darunter.
   */
  const KUNDENKANAELE = [
    'app/api/beratung-chat/route.ts',
    'app/api/whatsapp/webhook/route.ts',
  ]

  /** Endpunkte mit LLM, die bewusst NICHT filtern — mit Grund. */
  const INTERN: Record<string, string> = {
    'app/api/ai-chat/route.ts':
      'adminpflichtig (quellenSindAdministration), speist den MIS-Assistenten — interne Nutzung',
  }

  it.each(KUNDENKANAELE)('%s ruft den Absender-Schutz auf', (pfad) => {
    const quelle = readFileSync(join(WURZEL, pfad), 'utf8')
    expect(quelle).toMatch(/schuetzeAbsender|sanitizeNames/)
  })

  it('kein LLM-Endpunkt ist unbedacht: jeder ist entweder gefiltert oder begruendet intern', () => {
    // Findet alle Endpunkte, die ein Sprachmodell aufrufen.
    const gefunden: string[] = []
    const suche = (verzeichnis: string) => {
      const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
      for (const name of readdirSync(verzeichnis)) {
        const pfad = join(verzeichnis, name)
        if (statSync(pfad).isDirectory()) suche(pfad)
        else if (name === 'route.ts') {
          const q = readFileSync(pfad, 'utf8')
          if (/generativelanguage|api\.openai\.com|api\.anthropic\.com/.test(q)) {
            gefunden.push(pfad.replace(WURZEL + '/', ''))
          }
        }
      }
    }
    suche(join(WURZEL, 'app/api'))

    expect(gefunden.length).toBeGreaterThan(0)
    const unbedacht = gefunden.filter(
      (p) => !KUNDENKANAELE.includes(p) && !(p in INTERN),
    )
    expect(unbedacht).toEqual([])
  })

  it('die als intern gefuehrten Endpunkte sind wirklich zugangsbeschraenkt', () => {
    for (const pfad of Object.keys(INTERN)) {
      const quelle = readFileSync(join(WURZEL, pfad), 'utf8')
      expect(quelle).toMatch(/quellenSindAdministration|requireOpsAdmin/)
    }
  })
})

describe('Impressumspflicht bleibt unberuehrt', () => {
  it('der Briefkopf nennt den Geschaeftsfuehrer weiterhin (§ 35a GmbHG)', () => {
    // Gegenprobe zur Regel: die Pflichtangabe auf Geschaeftsbriefen ist
    // KEINE Unterschrift und darf nicht wegsaniert werden. Ohne diesen
    // Fall wuerde ein spaeterer „Sweep ueber alle Namen" sie entfernen.
    const quelle = readFileSync(join(WURZEL, 'lib/pdf/briefkopf.ts'), 'utf8')
    expect(quelle).toMatch(/geschaeftsfuehrer/i)
  })
})
