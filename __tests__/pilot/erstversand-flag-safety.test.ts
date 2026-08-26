/**
 * PILOT_ERSTVERSAND_FREIGEGEBEN — was die Variable kann und was nicht
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Diese Suite hält eine Architekturaussage fest, die man sonst nur durch
 * Lesen von vier Dateien wieder herleiten kann:
 *
 *   Die Variable schaltet AUSSCHLIESSLICH die Ausstellung eines
 *   Einmal-Tokens frei. Sie versendet nichts, sie erlaubt keinem
 *   geplanten Lauf etwas, und sie ersetzt keinen der beiden
 *   Versand-Schalter.
 *
 * Der Grund für Tests statt eines Kommentars: die gefährliche Änderung
 * wäre nicht, die Variable zu lockern — sie wäre, sie irgendwo ZUSÄTZLICH
 * abzufragen und damit zu einem zweiten, schwächeren Versandschalter zu
 * machen. Ein Quelltext-Scan fängt genau das.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import {
  erstversandFreigabe,
  FREIGABE_ENV,
  FREIGABE_AN_WERT,
  FIRST_REAL_INVOICE_APPROVED,
} from '@/lib/pilot/send-gate'

const WURZEL = process.cwd()

function dateienUnter(verzeichnis: string, endungen = ['.ts', '.tsx']): string[] {
  const treffer: string[] = []
  const gehe = (pfad: string) => {
    for (const eintrag of readdirSync(pfad)) {
      if (eintrag === 'node_modules' || eintrag.startsWith('.')) continue
      const voll = join(pfad, eintrag)
      if (statSync(voll).isDirectory()) gehe(voll)
      else if (endungen.some(e => eintrag.endsWith(e))) treffer.push(voll)
    }
  }
  gehe(verzeichnis)
  return treffer
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Der Wert selbst
// ═══════════════════════════════════════════════════════════════════════

describe('Grundstellung', () => {
  it('die einkompilierte Konstante steht auf false', () => {
    // Sie auf true zu setzen ist ein Commit im Diff — genau das ist der Zweck.
    expect(FIRST_REAL_INVOICE_APPROVED).toBe(false)
  })

  it('ohne die Variable ist nichts freigegeben', () => {
    expect(erstversandFreigabe({}).freigegeben).toBe(false)
    expect(erstversandFreigabe({}).herkunft).toBe('keine')
  })

  it('nur der exakte Wert „1" gibt frei', () => {
    for (const wert of ['0', 'true', 'ja', 'yes', 'TRUE', ' 1', '1 ', '', 'on']) {
      expect(erstversandFreigabe({ [FREIGABE_ENV]: wert }).freigegeben, `Wert "${wert}"`).toBe(false)
    }
    expect(erstversandFreigabe({ [FREIGABE_ENV]: FREIGABE_AN_WERT }).freigegeben).toBe(true)
  })

  it('die Begründung nennt den Variablennamen, damit niemand raten muss', () => {
    expect(erstversandFreigabe({}).grund).toContain(FREIGABE_ENV)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Die Reichweite der Variable
// ═══════════════════════════════════════════════════════════════════════

describe('Reichweite', () => {
  const lesestellen = dateienUnter(join(WURZEL, 'app'))
    .concat(dateienUnter(join(WURZEL, 'lib')))
    .filter(d => {
      const inhalt = readFileSync(d, 'utf8')
      // Nur echte Auswertungen zählen, keine Erwähnung in einem Kommentar
      // oder in der Beschreibung des Variablenregisters.
      return inhalt.includes(FREIGABE_ENV)
        && !d.endsWith(join('lib', 'env', 'register.ts'))
    })
    .map(d => relative(WURZEL, d))

  it('wird ausserhalb des Registers nur an einer Stelle ausgewertet', () => {
    // Jede weitere Lesestelle wäre ein zweiter Versandschalter mit
    // anderer Strenge — und der schwächere gewinnt immer.
    const echte = lesestellen.filter(d => !d.includes(join('app', 'api', 'billing')))
    expect(echte, `Unerwartete Lesestellen: ${echte.join(', ')}`)
      .toEqual([join('lib', 'pilot', 'send-gate.ts')])
  })

  it('kein geplanter Lauf wertet sie aus', () => {
    // Ein Cron, der die Variable liest, könnte ohne Mensch versenden.
    const crons = dateienUnter(join(WURZEL, 'app', 'api', 'cron'))
    for (const c of crons) {
      expect(readFileSync(c, 'utf8'), relative(WURZEL, c)).not.toContain(FREIGABE_ENV)
    }
  })

  it('der Versandweg selbst wertet sie nicht aus', () => {
    // Belegt die Trennung: die Variable regelt die FREIGABE, nicht den
    // VERSAND. Wer das ändert, macht sie zu einem Versandschalter.
    const versand = readFileSync(join(WURZEL, 'lib/billing/versand/rechnung-versand.ts'), 'utf8')
    expect(versand).not.toContain(FREIGABE_ENV)
    expect(versand).not.toContain('FIRST_REAL_INVOICE_APPROVED')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Verhältnis zu den beiden Versand-Schaltern
// ═══════════════════════════════════════════════════════════════════════

describe('Kein Ersatz für die Versand-Schalter', () => {
  it('ersetzt RECHNUNGSVERSAND_AUTOMATISCH nicht', () => {
    // Die beiden liegen in verschiedenen Modulen und werden nie
    // gegeneinander verrechnet. Stünde hier ein `||`, hätte eine der
    // beiden Variablen die andere überflüssig gemacht.
    const gate = readFileSync(join(WURZEL, 'lib/pilot/send-gate.ts'), 'utf8')
    expect(gate).not.toContain('RECHNUNGSVERSAND_AUTOMATISCH')
    expect(gate).not.toContain('MAHNVERSAND_AUTOMATISCH')
  })

  it('die Freigabe allein erzeugt kein Token — der Pilot entscheidet mit', () => {
    // erzeugeSendeToken() nimmt kein Preflight-Ergebnis entgegen, sondern
    // führt den Piloten selbst aus. Käme das Urteil aus dem Request-Body,
    // stellte sich die Oberfläche ihre eigene Freigabe aus.
    const gate = readFileSync(join(WURZEL, 'lib/pilot/send-gate.ts'), 'utf8')
    expect(gate).toContain('await pruefeRechnungFuerPilot(admin,')
    expect(gate).toMatch(/preflight_status:\s*'READY_FOR_SEND'/)
  })

  it('das Token bindet an Rechnung, Empfänger und Betrag', () => {
    // Ohne alle drei Bindungen wäre eine Freigabe für Rechnung A eine
    // Freigabe für jede Rechnung.
    const gate = readFileSync(join(WURZEL, 'lib/pilot/send-gate.ts'), 'utf8')
    for (const code of ['rechnung_abweichend', 'empfaenger_abweichend', 'betrag_abweichend']) {
      expect(gate, code).toContain(code)
    }
  })
})
