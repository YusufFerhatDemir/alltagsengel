// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS_INPUT_REQUIRED
//
// Die Kernaussage dieses Moduls ist eine BEHAUPTUNG ÜBER DEN CODE: „die
// offenen Geschäftsangaben halten den Rechnungspilot nicht auf." Sie steht
// sonst in Berichten, und in Berichten veraltet sie unbemerkt.
//
// Diese Suite prüft sie deshalb nicht durch Nachlesen, sondern indem sie die
// Dateien des Rechnungswegs LIEST und feststellt, dass keine davon DATEV
// oder ChairMatch importiert. Baut jemand morgen eine Kontenprüfung in die
// Festschreibung ein, wird dieser Test rot — bevor die falsche Aussage im
// nächsten Handoff landet.
//
// Zweitens: es darf KEINE Zahl darin stehen. Kein Preis, keine
// Beraternummer, keine Mandantennummer. Auch dafür gibt es hier einen Test.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  ermittleBusinessInputs,
  businessInputsBerichtText,
  ALLE_EINGABEN,
  DATEV_EINGABEN,
  CHAIRMATCH_EINGABEN,
  STORNO_EINGABEN,
  LAEUFT_UNABHAENGIG,
  LAEUFT_NICHT_OHNE_D1_D2,
  RECHNUNGSPILOT_ABHAENGIGKEITEN,
} from '@/lib/pilot/business-inputs'
import { BERATER_VORGABE_ERFORDERLICH } from '@/lib/billing/datev/datev-validator'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const WURZEL = join(__dirname, '..', '..')

function fake(datevConfig: Record<string, unknown> | null) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === 'organizations') return { data: { datev_config: datevConfig } }
    return { data: null }
  })
}

async function lauf(datevConfig: Record<string, unknown> | null = null) {
  const f = fake(datevConfig)
  const b = await ermittleBusinessInputs(f.client as unknown as SupabaseClient, ORG)
  return { b, f }
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Die Unabhängigkeit — gegen den Code geprüft, nicht behauptet
// ═══════════════════════════════════════════════════════════════════════

describe('Unabhängigkeit des Rechnungswegs', () => {
  it('jede benannte Datei des Rechnungswegs existiert', () => {
    for (const datei of RECHNUNGSPILOT_ABHAENGIGKEITEN.weg) {
      expect(existsSync(join(WURZEL, datei)), `${datei} fehlt`).toBe(true)
    }
  })

  it('keine Datei des Rechnungswegs importiert DATEV oder ChairMatch', () => {
    const verstoesse: string[] = []
    for (const datei of RECHNUNGSPILOT_ABHAENGIGKEITEN.weg) {
      const inhalt = readFileSync(join(WURZEL, datei), 'utf8')
      // Nur echte Importzeilen prüfen — ein Verweis im Kommentar
      // („DATEV liest diese Tabelle") ist keine Abhängigkeit.
      const importe = inhalt
        .split('\n')
        .filter(z => /^\s*import\b/.test(z) || /\bfrom\s+['"]@\//.test(z))
        .join('\n')
      for (const verboten of RECHNUNGSPILOT_ABHAENGIGKEITEN.verboteneImporte) {
        if (importe.toLowerCase().includes(verboten.toLowerCase())) {
          verstoesse.push(`${datei} importiert "${verboten}"`)
        }
      }
    }
    expect(verstoesse).toEqual([])
  })

  it('der Rechnungsweg liest auch keine DATEV- oder ChairMatch-Tabelle', () => {
    const verbotenTabellen = [
      'datev_exports', 'datev_kontenzuordnung', 'protect_pricing', 'compliance_plans',
    ]
    const verstoesse: string[] = []
    for (const datei of RECHNUNGSPILOT_ABHAENGIGKEITEN.weg) {
      const inhalt = readFileSync(join(WURZEL, datei), 'utf8')
      for (const tabelle of verbotenTabellen) {
        if (inhalt.includes(`from('${tabelle}')`)) {
          verstoesse.push(`${datei} liest ${tabelle}`)
        }
      }
    }
    expect(verstoesse).toEqual([])
  })

  it('rechnungspilotBlockiert ist false — und der Grund steht im Bericht', async () => {
    const { b } = await lauf()
    expect(b.rechnungspilotBlockiert).toBe(false)
    expect(b.laeuftUnabhaengig.length).toBeGreaterThan(0)
    expect(b.laeuftNicht.length).toBeGreaterThan(0)
  })

  it('was ohne D1/D2 nicht läuft, ist ausschliesslich DATEV-Sache', () => {
    for (const eintrag of LAEUFT_NICHT_OHNE_D1_D2) {
      expect(eintrag.toLowerCase()).toMatch(/datev|kanzlei|abstimmung/)
    }
  })

  it('was unabhängig läuft, nennt keinen DATEV- und keinen ChairMatch-Schritt', () => {
    for (const eintrag of LAEUFT_UNABHAENGIG) {
      expect(eintrag.toLowerCase()).not.toContain('datev')
      expect(eintrag.toLowerCase()).not.toContain('chairmatch')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Nichts wird erfunden
// ═══════════════════════════════════════════════════════════════════════

describe('Keine erfundenen Werte', () => {
  it('das Modul enthält keine Beraternummer, keine Mandantennummer, keinen Preis', () => {
    const quelle = readFileSync(join(WURZEL, 'lib/pilot/business-inputs.ts'), 'utf8')
    // Zahlenliterale sind erlaubt (Aufzählungen, Kennungen wie D1/C5),
    // aber nichts, was wie ein Betrag oder eine Kanzleinummer aussieht.
    const verdaechtig = quelle.match(/\b\d{4,}\b/g) ?? []
    const erlaubt = new Set(['20260310', '20260826', '4', '16'])
    expect(verdaechtig.filter(x => !erlaubt.has(x))).toEqual([])
    expect(quelle).not.toMatch(/_cents\s*[:=]\s*\d/)
    expect(quelle).not.toMatch(/beraternummer\s*[:=]\s*['"\d]/i)
  })

  it('auch der Textbericht nennt keinen Betrag', async () => {
    const { b } = await lauf({ beraternummer: '12345', mandantennummer: '67890' })
    const text = businessInputsBerichtText(b)
    // Der GESETZTE Wert darf nicht auftauchen — geprüft wird die Existenz,
    // nie der Wert.
    expect(text).not.toContain('12345')
    expect(text).not.toContain('67890')
  })

  it('gibt den DATEV-Konfigurationswert auch in der JSON-Antwort nie zurück', async () => {
    const { b } = await lauf({ beraternummer: '12345', mandantennummer: '67890' })
    const json = JSON.stringify(b)
    expect(json).not.toContain('12345')
    expect(json).not.toContain('67890')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Das Register
// ═══════════════════════════════════════════════════════════════════════

describe('Register', () => {
  it('deckt D1–D6, C1–C5 und S1–S2 ab', () => {
    expect(DATEV_EINGABEN.map(e => e.id)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6'])
    expect(CHAIRMATCH_EINGABEN.map(e => e.id)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5'])
    // S1/S2 kamen mit dem Storno-Weg dazu: Frist und Ausfallgebuehr sind
    // Vertragsfragen, keine technischen. Sie stehen hier, damit sie nicht
    // als Kommentar in lib/bookings/storno.ts verschwinden.
    expect(STORNO_EINGABEN.map(e => e.id)).toEqual(['S1', 'S2'])
    expect(ALLE_EINGABEN).toHaveLength(13)
  })

  it('bleibt mit der Liste des DATEV-Validators im Gleichschritt', () => {
    // Die Anzahl ist der Abgleich: kommt dort eine Vorgabe dazu, muss sie
    // hier ankommen. Ohne diesen Test laufen die beiden Listen still
    // auseinander — dasselbe Muster wie NICHT_MAHNFAEHIG / GESPERRTE_STATUS.
    expect(BERATER_VORGABE_ERFORDERLICH).toHaveLength(DATEV_EINGABEN.length)
    expect(BERATER_VORGABE_ERFORDERLICH[0].toLowerCase()).toContain('beraternummer')
    expect(BERATER_VORGABE_ERFORDERLICH[1].toLowerCase()).toContain('mandantennummer')
  })

  it('nur D1 und D2 sind blockierend', () => {
    const blockierend = ALLE_EINGABEN.filter(e => e.schwere === 'blockierend').map(e => e.id)
    expect(blockierend).toEqual(['D1', 'D2'])
  })

  it('jeder Punkt sagt, was er NICHT blockiert', () => {
    for (const e of ALLE_EINGABEN) {
      expect(e.blockiertNicht.length).toBeGreaterThan(10)
      expect(e.quelle.length).toBeGreaterThan(3)
      expect(e.wirkungOffen.length).toBeGreaterThan(10)
    }
  })

  it('kein Punkt nennt eine Person beim Namen', () => {
    for (const e of ALLE_EINGABEN) {
      expect(e.quelle).toMatch(/^(Steuerkanzlei|Geschäftsführung|Geschäftsführung \/ Steuerkanzlei)$/)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Der Live-Stand
// ═══════════════════════════════════════════════════════════════════════

describe('Live-Stand', () => {
  it('ohne DATEV-Konfiguration stehen D1 und D2 auf offen', async () => {
    const { b } = await lauf(null)
    const d1 = b.eingaben.find(e => e.id === 'D1')!
    const d2 = b.eingaben.find(e => e.id === 'D2')!
    expect(d1.stand).toBe('offen')
    expect(d2.stand).toBe('offen')
  })

  it('mit beiden Nummern stehen D1 und D2 auf gesetzt', async () => {
    const { b } = await lauf({ beraternummer: '12345', mandantennummer: '67890' })
    expect(b.eingaben.find(e => e.id === 'D1')!.stand).toBe('gesetzt')
    expect(b.eingaben.find(e => e.id === 'D2')!.stand).toBe('gesetzt')
  })

  it('nur die Beraternummer gesetzt: D1 gesetzt, D2 offen', async () => {
    const { b } = await lauf({ beraternummer: '12345' })
    expect(b.eingaben.find(e => e.id === 'D1')!.stand).toBe('gesetzt')
    expect(b.eingaben.find(e => e.id === 'D2')!.stand).toBe('offen')
  })

  it('D3–D6 bleiben offen — ein Standardwert ist kein bestätigter Wert', async () => {
    const { b } = await lauf({ beraternummer: '12345', mandantennummer: '67890' })
    for (const id of ['D3', 'D4', 'D5', 'D6']) {
      const e = b.eingaben.find(x => x.id === id)!
      expect(e.stand).toBe('offen')
      expect(e.befund).toContain('nicht bestätigt')
    }
  })

  it('ChairMatch steht auf nicht_pruefbar — nicht auf offen', async () => {
    const { b } = await lauf()
    for (const e of b.eingaben.filter(x => x.bereich === 'chairmatch')) {
      expect(e.stand).toBe('nicht_pruefbar')
      expect(e.befund).toContain('anderes Supabase-Projekt')
    }
    expect(b.jeBereich.chairmatch.nichtPruefbar).toBe(5)
    expect(b.jeBereich.chairmatch.offen).toBe(0)
  })

  it('fragt KEINE ChairMatch-Tabelle ab', async () => {
    const { f } = await lauf()
    const chairmatch = f.aufrufe.filter(a =>
      ['protect_pricing', 'compliance_plans'].includes(a.tabelle))
    expect(chairmatch).toEqual([])
  })

  it('schreibt nichts', async () => {
    const { f } = await lauf()
    expect(f.aufrufe.filter(a => a.operation !== 'select')).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Bericht
// ═══════════════════════════════════════════════════════════════════════

describe('Bericht', () => {
  it('nennt die Kernaussage weit oben', async () => {
    const { b } = await lauf()
    const zeilen = businessInputsBerichtText(b).split('\n')
    const treffer = zeilen.findIndex(z => z.includes('RECHNUNGSPILOT BLOCKIERT: NEIN'))
    expect(treffer).toBeGreaterThan(-1)
    expect(treffer).toBeLessThan(12)
  })

  it('führt jeden Punkt mit Kennung, Stand und Frage auf', async () => {
    const { b } = await lauf()
    const text = businessInputsBerichtText(b)
    for (const e of ALLE_EINGABEN) {
      expect(text).toContain(e.id)
      expect(text).toContain(e.frage)
    }
  })
})
