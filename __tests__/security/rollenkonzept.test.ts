// ═══════════════════════════════════════════════════════════════════════
// Rollenkonzept — Least Privilege
// ═══════════════════════════════════════════════════════════════════════
// Geprueft werden die Zusagen des Modells, nicht seine Schreibweise:
// wer WAS NICHT darf. Ein Test, der nur nachzaehlt, was in der Matrix
// steht, wuerde jede kuenftige Fehlaenderung mitmachen.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  ROLLEN,
  ROLLEN_MATRIX,
  ROLLEN_BEZEICHNUNG,
  BERECHTIGUNGEN,
  NUR_ADMINISTRATION,
  hatBerechtigung,
  hatEineBerechtigung,
  hatAlleBerechtigungen,
  istRolle,
  istAdministration,
  istVerwaltungsrolle,
  rolleDarf,
  berechtigungenVon,
  type Berechtigung,
} from '@/lib/auth/rollen'
import { darfPfad, berechtigungFuerPfad, bereichFuerPfad, BEREICHE } from '@/lib/auth/bereiche'

describe('Rollenkatalog', () => {
  it('kennt genau die neun vorgesehenen Rollen', () => {
    expect([...ROLLEN].sort()).toEqual([
      'admin', 'angehoerige', 'buchhaltung', 'engel', 'fahrer',
      'kunde', 'pdl', 'qm', 'superadmin',
    ])
  })

  it('hat fuer jede Rolle einen Matrixeintrag und eine Bezeichnung', () => {
    for (const r of ROLLEN) {
      expect(ROLLEN_MATRIX[r], `Matrixeintrag fehlt: ${r}`).toBeDefined()
      expect(ROLLEN_BEZEICHNUNG[r], `Bezeichnung fehlt: ${r}`).toBeTruthy()
    }
  })

  it('vergibt keine Berechtigung, die es nicht gibt', () => {
    for (const r of ROLLEN) {
      for (const b of ROLLEN_MATRIX[r]) {
        expect(BERECHTIGUNGEN, `${r} traegt unbekannte Berechtigung ${b}`).toContain(b)
      }
    }
  })

  it('erkennt Unfug nicht als Rolle', () => {
    for (const wert of ['Admin', 'ADMIN', 'root', '', ' admin', null, undefined, 42, {}]) {
      expect(istRolle(wert)).toBe(false)
    }
  })
})

describe('Verweigern ist der Normalfall', () => {
  it('gibt einer unbekannten Rolle nichts', () => {
    for (const b of BERECHTIGUNGEN) {
      expect(hatBerechtigung('hausmeister', b)).toBe(false)
      expect(hatBerechtigung(null, b)).toBe(false)
      expect(hatBerechtigung(undefined, b)).toBe(false)
      expect(hatBerechtigung('', b)).toBe(false)
    }
  })

  it('gibt Kundschaft, Engeln, Fahrdienst und Angehoerigen keine Verwaltungsrechte', () => {
    for (const r of ['kunde', 'engel', 'fahrer', 'angehoerige'] as const) {
      expect(berechtigungenVon(r)).toHaveLength(0)
      expect(istVerwaltungsrolle(r)).toBe(false)
      for (const b of BERECHTIGUNGEN) {
        expect(rolleDarf(r, b), `${r} sollte ${b} nicht haben`).toBe(false)
      }
    }
  })
})

describe('Vorbehaltsbereiche', () => {
  it('haelt Tarifaenderung, Benutzer- und Systemverwaltung bei der Administration', () => {
    for (const b of NUR_ADMINISTRATION) {
      for (const r of ROLLEN) {
        const erwartet = istAdministration(r)
        expect(hatBerechtigung(r, b), `${r} / ${b}`).toBe(erwartet)
      }
    }
  })

  it('fuehrt tarife.schreiben, benutzer.verwalten und system.verwalten als Vorbehalt', () => {
    expect([...NUR_ADMINISTRATION].sort()).toEqual([
      'benutzer.verwalten', 'system.verwalten', 'tarife.schreiben',
    ])
  })
})

describe('Buchhaltung sieht keine Gesundheitsdaten', () => {
  const verboten: Berechtigung[] = ['pflege.lesen', 'pflege.schreiben', 'personal.lesen', 'personal.schreiben']

  it.each(verboten)('buchhaltung hat %s nicht', b => {
    expect(hatBerechtigung('buchhaltung', b)).toBe(false)
  })

  it('darf dafuer Rechnungen und Bankdaten bearbeiten', () => {
    expect(hatAlleBerechtigungen('buchhaltung', [
      'abrechnung.lesen', 'abrechnung.schreiben', 'bankdaten.lesen', 'bankdaten.schreiben',
    ])).toBe(true)
  })

  it('darf Tarife lesen, aber nicht aendern', () => {
    expect(hatBerechtigung('buchhaltung', 'tarife.lesen')).toBe(true)
    expect(hatBerechtigung('buchhaltung', 'tarife.schreiben')).toBe(false)
  })
})

describe('PDL fuehrt den Betrieb, aber nicht die Kasse', () => {
  it('darf Pflege, Personal, Einsaetze und Stammdaten aendern', () => {
    expect(hatAlleBerechtigungen('pdl', [
      'pflege.schreiben', 'personal.schreiben', 'einsatz.schreiben', 'stammdaten.schreiben',
    ])).toBe(true)
  })

  it('darf Rechnungen lesen, aber nicht schreiben', () => {
    expect(hatBerechtigung('pdl', 'abrechnung.lesen')).toBe(true)
    expect(hatBerechtigung('pdl', 'abrechnung.schreiben')).toBe(false)
  })

  it('kommt an keine Bankdaten', () => {
    expect(hatEineBerechtigung('pdl', ['bankdaten.lesen', 'bankdaten.schreiben'])).toBe(false)
  })
})

describe('QM prueft, ohne das Gepruefte zu aendern', () => {
  it('darf Pflege, Personal, Einsaetze und Stammdaten nur lesen', () => {
    expect(hatAlleBerechtigungen('qm', [
      'pflege.lesen', 'personal.lesen', 'einsatz.lesen', 'stammdaten.lesen',
    ])).toBe(true)
    expect(hatEineBerechtigung('qm', [
      'pflege.schreiben', 'personal.schreiben', 'einsatz.schreiben', 'stammdaten.schreiben',
    ])).toBe(false)
  })

  it('schreibt nur im eigenen QM-Bestand', () => {
    expect(hatBerechtigung('qm', 'qm.schreiben')).toBe(true)
  })

  it('sieht weder Abrechnung noch Bankdaten noch Tarife', () => {
    expect(hatEineBerechtigung('qm', [
      'abrechnung.lesen', 'abrechnung.schreiben',
      'bankdaten.lesen', 'bankdaten.schreiben',
      'tarife.lesen', 'tarife.schreiben',
    ])).toBe(false)
  })
})

describe('Administration behaelt alles', () => {
  it.each(['admin', 'superadmin'] as const)('%s hat jede Berechtigung', r => {
    for (const b of BERECHTIGUNGEN) {
      expect(hatBerechtigung(r, b), `${r} fehlt ${b}`).toBe(true)
    }
  })
})

describe('Bereichskatalog', () => {
  it('verweist nur auf bekannte Berechtigungen', () => {
    for (const [pfad, regel] of Object.entries(BEREICHE)) {
      expect(BERECHTIGUNGEN, `${pfad}.lesen`).toContain(regel.lesen)
      if (regel.schreiben) expect(BERECHTIGUNGEN, `${pfad}.schreiben`).toContain(regel.schreiben)
    }
  })

  it('waehlt den laengsten passenden Praefix', () => {
    expect(bereichFuerPfad('/api/admin/abrechnung/sftp-key')).toBe('/api/admin/abrechnung/sftp-key')
    expect(bereichFuerPfad('/api/admin/abrechnung/lauf/42')).toBe('/api/admin/abrechnung')
  })

  it('unterscheidet Lesen und Schreiben nach HTTP-Methode', () => {
    expect(berechtigungFuerPfad('/admin/leistungspreise', 'GET')).toBe('tarife.lesen')
    expect(berechtigungFuerPfad('/admin/leistungspreise', 'POST')).toBe('tarife.schreiben')
  })

  it('kennt Pfade ohne Regel und behauptet nichts', () => {
    expect(berechtigungFuerPfad('/admin/gibtsnicht')).toBeNull()
  })
})

describe('darfPfad — serverseitige Bereichssperre', () => {
  it('laesst die Administration ueberall durch', () => {
    for (const p of ['/admin/sepa', '/admin/users', '/admin/pflegedoku', '/admin/gibtsnicht']) {
      expect(darfPfad('admin', p)).toBe(true)
      expect(darfPfad('superadmin', p)).toBe(true)
    }
  })

  it('sperrt einen unbekannten Unterpfad fuer Fachrollen (fail-closed)', () => {
    for (const r of ['pdl', 'qm', 'buchhaltung']) {
      expect(darfPfad(r, '/admin/ein-neuer-bereich')).toBe(false)
    }
  })

  it('haelt die Buchhaltung aus der Pflegedokumentation heraus', () => {
    expect(darfPfad('buchhaltung', '/admin/pflegedoku')).toBe(false)
    expect(darfPfad('buchhaltung', '/admin/wunddokumentation')).toBe(false)
    expect(darfPfad('buchhaltung', '/admin/medikamente')).toBe(false)
    expect(darfPfad('buchhaltung', '/admin/sis')).toBe(false)
  })

  it('haelt PDL und QM aus den Bankdaten heraus', () => {
    expect(darfPfad('pdl', '/admin/sepa')).toBe(false)
    expect(darfPfad('qm', '/admin/sepa')).toBe(false)
    expect(darfPfad('buchhaltung', '/admin/sepa')).toBe(true)
  })

  it('haelt alle Fachrollen aus der Benutzerverwaltung heraus', () => {
    for (const r of ['pdl', 'qm', 'buchhaltung', 'engel', 'kunde']) {
      expect(darfPfad(r, '/admin/users')).toBe(false)
    }
  })

  it('laesst Tarife lesen, aber nicht aendern', () => {
    expect(darfPfad('buchhaltung', '/admin/leistungspreise', 'GET')).toBe(true)
    expect(darfPfad('buchhaltung', '/admin/leistungspreise', 'POST')).toBe(false)
    expect(darfPfad('pdl', '/admin/leistungspreise', 'GET')).toBe(true)
    expect(darfPfad('pdl', '/admin/leistungspreise', 'POST')).toBe(false)
  })

  it('gibt jeder Verwaltungsrolle eine Startseite — sonst gaebe es eine Weiterleitungsschleife', () => {
    for (const r of ['pdl', 'qm', 'buchhaltung']) {
      expect(darfPfad(r, '/admin/home'), `${r} kommt nicht auf die eigene Startseite`).toBe(true)
    }
  })

  it('laesst jede Verwaltungsrolle ihre MFA einrichten', () => {
    for (const r of ['pdl', 'qm', 'buchhaltung']) {
      expect(darfPfad(r, '/admin/mfa-einrichtung')).toBe(true)
      expect(darfPfad(r, '/admin/mfa-pruefen')).toBe(true)
    }
  })

  it('sperrt Kundschaft und Engel aus jedem Verwaltungspfad aus', () => {
    for (const r of ['kunde', 'engel', 'fahrer', 'angehoerige', null, 'unbekannt']) {
      for (const p of ['/admin/home', '/admin/sepa', '/mis', '/admin/mfa-einrichtung']) {
        expect(darfPfad(r, p), `${r} / ${p}`).toBe(false)
      }
    }
  })
})
