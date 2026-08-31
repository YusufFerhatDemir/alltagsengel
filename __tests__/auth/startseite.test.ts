/**
 * Tests fuer Rolle → Startseite.
 * @see lib/auth/startseite.ts
 *
 * Der Punkt dieser Suite ist nicht, die Karte abzuschreiben, sondern die
 * beiden Eigenschaften festzunageln, die vorher verletzt waren:
 *   1. Jede Rolle hat ueberhaupt ein Ziel — keine faellt still auf
 *      /kunde/home zurueck.
 *   2. Das Ziel liegt in einem Bereich, den die Rolle betreten DARF.
 *      Genau das war fuer fahrer und angehoerige im Callback verletzt.
 */
import { describe, it, expect } from 'vitest'
import { ROLLEN, type Rolle } from '@/lib/auth/rollen'
import {
  ANMELDE_STARTSEITE,
  BEREICHS_STARTSEITE,
  UNBEKANNTE_ROLLE_ZIEL,
  startseiteNachAnmeldung,
  startseiteBeiFalschemBereich,
  anmeldeZielIstErlaubt,
} from '@/lib/auth/startseite'

/**
 * Spiegel von ROLE_ACCESS aus proxy.ts. proxy.ts laesst sich hier nicht
 * importieren (next/server), deshalb steht die Zuordnung hier — der Test
 * unten haelt sie mit der echten Datei deckungsgleich.
 */
const BEREICHE_JE_ROLLE: Record<Rolle, string[]> = {
  admin:       ['/admin', '/mis', '/kunde', '/engel', '/fahrer', '/angehoerige'],
  superadmin:  ['/admin', '/mis', '/kunde', '/engel', '/fahrer', '/angehoerige'],
  pdl:         ['/admin', '/mis'],
  qm:          ['/admin', '/mis'],
  buchhaltung: ['/admin', '/mis'],
  kunde:       ['/kunde'],
  engel:       ['/engel'],
  fahrer:      ['/fahrer'],
  angehoerige: ['/angehoerige'],
}

describe('Rolle → Startseite', () => {
  it('kennt jede Rolle aus dem Rollenkatalog', () => {
    for (const rolle of ROLLEN) {
      expect(ANMELDE_STARTSEITE[rolle], `Anmeldeziel fehlt fuer ${rolle}`).toBeTruthy()
      expect(BEREICHS_STARTSEITE[rolle], `Bereichsziel fehlt fuer ${rolle}`).toBeTruthy()
    }
  })

  it('schickt keine Rolle beim Anmelden in einen fremden Bereich', () => {
    // Das war der eigentliche Befund: fahrer und angehoerige landeten ueber
    // den Callback in /kunde — einem Bereich, den ihnen der Proxy verwehrt.
    for (const rolle of ROLLEN) {
      expect(
        anmeldeZielIstErlaubt(rolle, BEREICHE_JE_ROLLE),
        `${rolle} wird nach ${ANMELDE_STARTSEITE[rolle]} geschickt, darf dort aber nicht hin`,
      ).toBe(true)
    }
  })

  it('schickt keine Rolle beim Rueckverweis in einen fremden Bereich', () => {
    // Sonst verweist der Proxy im Kreis.
    for (const rolle of ROLLEN) {
      const ziel = BEREICHS_STARTSEITE[rolle]
      const erlaubt = BEREICHE_JE_ROLLE[rolle].some(b => ziel === b || ziel.startsWith(b + '/'))
      expect(erlaubt, `${rolle} wird nach ${ziel} zurueckverwiesen, darf dort aber nicht hin`).toBe(true)
    }
  })

  it('laesst keine Fachrolle in der Kunden-App landen', () => {
    for (const rolle of ['pdl', 'qm', 'buchhaltung', 'superadmin'] as const) {
      expect(startseiteNachAnmeldung(rolle)).not.toBe('/kunde/home')
    }
  })

  it('schickt fahrer und angehoerige in ihren eigenen Bereich', () => {
    expect(startseiteNachAnmeldung('fahrer')).toBe('/fahrer/home')
    expect(startseiteNachAnmeldung('angehoerige')).toBe('/angehoerige')
  })

  it('behaelt /mis als Anmeldeziel der Administration', () => {
    expect(startseiteNachAnmeldung('admin')).toBe('/mis')
    expect(startseiteNachAnmeldung('superadmin')).toBe('/mis')
    // Der Rueckverweis bleibt bewusst /admin/home — die niedrigste
    // Anforderung, damit keine Schleife entsteht.
    expect(startseiteBeiFalschemBereich('admin')).toBe('/admin/home')
  })

  it('faellt bei leerer oder unbekannter Rolle auf ein definiertes Ziel', () => {
    expect(startseiteNachAnmeldung('')).toBe(UNBEKANNTE_ROLLE_ZIEL)
    expect(startseiteNachAnmeldung(null)).toBe(UNBEKANNTE_ROLLE_ZIEL)
    expect(startseiteNachAnmeldung(undefined)).toBe(UNBEKANNTE_ROLLE_ZIEL)
    expect(startseiteNachAnmeldung('hausmeister')).toBe(UNBEKANNTE_ROLLE_ZIEL)
    expect(startseiteBeiFalschemBereich('hausmeister')).toBe(UNBEKANNTE_ROLLE_ZIEL)
  })

  it('haelt den Bereichs-Spiegel mit proxy.ts deckungsgleich', async () => {
    // Ohne diese Pruefung veraltet die Kopie oben und die beiden Tests
    // darueber pruefen gegen eine Zuordnung, die es nicht mehr gibt.
    const { readFileSync } = await import('node:fs')
    const quelle = readFileSync('proxy.ts', 'utf-8')
    const block = quelle.slice(
      quelle.indexOf('const ROLE_ACCESS'),
      quelle.indexOf('// ═══ Startseite pro Rolle'),
    )
    for (const rolle of ROLLEN) {
      const zeile = new RegExp(`${rolle}\\s*:\\s*\\[([^\\]]*)\\]`).exec(block)
      expect(zeile, `${rolle} fehlt in ROLE_ACCESS von proxy.ts`).not.toBeNull()
      const bereiche = zeile![1].split(',').map(t => t.trim().replace(/['"]/g, '')).filter(Boolean)
      expect(bereiche.sort()).toEqual([...BEREICHE_JE_ROLLE[rolle]].sort())
    }
  })

  it('proxy.ts leitet ROLE_HOME aus der gemeinsamen Karte ab', async () => {
    // Sonst driftet die dritte Kopie wieder auseinander.
    const { readFileSync } = await import('node:fs')
    const quelle = readFileSync('proxy.ts', 'utf-8')
    expect(quelle).toContain('BEREICHS_STARTSEITE')
    expect(quelle).toMatch(/const ROLE_HOME[^=]*=\s*BEREICHS_STARTSEITE/)
  })
})
