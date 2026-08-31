/**
 * Rollen: Startseite, Navigation, Abmeldung.
 *
 * __tests__/auth/startseite.test.ts haelt die KARTE fest — welche Rolle
 * welches Ziel bekommt. Diese Suite prueft, ob die Bereiche dahinter
 * ueberhaupt existieren und benutzbar sind. Beides sind verschiedene
 * Fragen: eine Zuordnung kann korrekt sein und trotzdem auf eine Seite
 * zeigen, die es nicht gibt, oder in einen Bereich fuehren, aus dem man
 * nicht wieder herauskommt.
 *
 * BEFUND 31.08.2026, der diese Suite ausgeloest hat
 * Das Angehoerigenportal war der EINZIGE der sechs Bereiche ohne
 * Abmeldung — kein Profil, kein Menue, kein signOut(). Wer sich dort
 * anmeldete, blieb angemeldet. Auf dem geteilten Tablet einer Familie
 * sieht die naechste Person damit die Pflegeakte eines Angehoerigen, ohne
 * je ein Passwort eingegeben zu haben. Kein Test hat das gemerkt, weil
 * jede bestehende Suite die Frage „darf sie hinein?" stellte und keine die
 * Frage „kommt sie wieder heraus?".
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ROLLEN, type Rolle } from '@/lib/auth/rollen'
import { ANMELDE_STARTSEITE, BEREICHS_STARTSEITE } from '@/lib/auth/startseite'
import { darfPfad } from '@/lib/auth/bereiche'

/** Die sechs geschuetzten Bereiche aus proxy.ts (PROTECTED_PREFIXES). */
const BEREICHE = ['/admin', '/kunde', '/engel', '/fahrer', '/mis', '/angehoerige'] as const

function tsxDateien(wurzel: string, treffer: string[] = []): string[] {
  if (!existsSync(wurzel)) return treffer
  for (const e of readdirSync(wurzel)) {
    const pfad = join(wurzel, e)
    if (statSync(pfad).isDirectory()) tsxDateien(pfad, treffer)
    else if (pfad.endsWith('.tsx') || pfad.endsWith('.ts')) treffer.push(pfad)
  }
  return treffer
}

/** Route → Datei im App-Router. Nur die beiden Formen, die hier vorkommen. */
function seiteExistiert(route: string): boolean {
  const basis = join('app', route.replace(/^\//, ''))
  return existsSync(join(basis, 'page.tsx')) || existsSync(join(basis, 'page.ts'))
}

describe('Rollen: Startseite, Navigation, Abmeldung', () => {
  it('jede Rolle hat ein Anmeldeziel, das es als Seite wirklich gibt', () => {
    // Eine Weiterleitung auf eine Route ohne Datei endet in der 404 —
    // aus Sicht der Person: „Anmeldung hat geklappt, Seite gibt es nicht."
    for (const rolle of ROLLEN) {
      const ziel = ANMELDE_STARTSEITE[rolle]
      expect(seiteExistiert(ziel), `Anmeldeziel ${ziel} (${rolle}) hat keine page.tsx`).toBe(true)
    }
  })

  it('jede Rolle hat ein Rueckverweis-Ziel, das es als Seite wirklich gibt', () => {
    for (const rolle of ROLLEN) {
      const ziel = BEREICHS_STARTSEITE[rolle]
      expect(seiteExistiert(ziel), `Rueckverweis-Ziel ${ziel} (${rolle}) hat keine page.tsx`).toBe(true)
    }
  })

  it('jede Verwaltungsrolle darf ihr eigenes Anmeldeziel auch oeffnen', () => {
    // Der Proxy prueft /admin und /mis zusaetzlich per darfPfad(). Faellt
    // das Anmeldeziel dort durch, verweist er zurueck — auf dieselbe Seite.
    // Genau diese Schleife ist der Grund, warum /admin/home (niedrigste
    // Anforderung: berichte.lesen) das Rueckverweis-Ziel ist.
    for (const rolle of ['pdl', 'qm', 'buchhaltung', 'admin', 'superadmin'] as const) {
      const anmelde = ANMELDE_STARTSEITE[rolle]
      const rueck = BEREICHS_STARTSEITE[rolle]
      expect(darfPfad(rolle, anmelde), `${rolle} darf sein Anmeldeziel ${anmelde} nicht oeffnen`).toBe(true)
      expect(darfPfad(rolle, rueck), `${rolle} darf sein Rueckverweis-Ziel ${rueck} nicht oeffnen`).toBe(true)
    }
  })

  it('jeder geschuetzte Bereich bietet eine Abmeldung an', () => {
    // Das ist die Regressionssperre fuer den Befund oben.
    for (const bereich of BEREICHE) {
      const wurzel = join('app', bereich.replace(/^\//, ''))
      const dateien = tsxDateien(wurzel)
      const mitAbmeldung = dateien.filter(d => /auth\.signOut\s*\(/.test(readFileSync(d, 'utf-8')))
      expect(
        mitAbmeldung.length,
        `Bereich ${bereich} hat keine Abmeldung — wer sich dort anmeldet, kommt nicht wieder heraus`,
      ).toBeGreaterThan(0)
    }
  })

  it('schreibt die Abmeldung in die Sicherheitsspur, BEVOR die Sitzung endet', () => {
    // Nach signOut() ist serverseitig nicht mehr feststellbar, wer sich
    // abgemeldet hat — die Spur waere leer. Geprueft werden die Bereiche
    // mit eigener Abmelde-Schaltflaeche; /kunde, /engel und /fahrer melden
    // bewusst ohne Spur ab (kein Verwaltungszugang).
    for (const datei of ['app/admin/layout.tsx', 'app/angehoerige/page.tsx']) {
      const quelle = readFileSync(datei, 'utf-8')
      const spur = quelle.indexOf('protokolliereAbmeldung')
      const abmeldung = quelle.indexOf('auth.signOut')
      expect(spur, `${datei} protokolliert die Abmeldung nicht`).toBeGreaterThan(-1)
      expect(
        spur < abmeldung,
        `${datei} ruft protokolliereAbmeldung() NACH signOut() — dann ist die Sitzung schon weg`,
      ).toBe(true)
    }
  })

  it('zeigt jeder Verwaltungsrolle mindestens einen Navigationspunkt', () => {
    // Die Navigation filtert mit darfPfad() — derselben Funktion, die auch
    // der Proxy benutzt. Eine Rolle ohne sichtbaren Punkt saehe eine leere
    // Seitenleiste und haette keinen Weg weiter.
    const layout = readFileSync('app/admin/layout.tsx', 'utf-8')
    const ziele = [...layout.matchAll(/href:\s*'(\/(?:admin|mis)[^']*)'/g)].map(m => m[1])
    expect(ziele.length, 'keine Navigationsziele in app/admin/layout.tsx gefunden').toBeGreaterThan(20)

    for (const rolle of ['pdl', 'qm', 'buchhaltung'] as const) {
      const sichtbar = ziele.filter(z => darfPfad(rolle, z))
      expect(sichtbar.length, `${rolle} sieht keinen einzigen Navigationspunkt`).toBeGreaterThan(0)
    }
  })

  it('filtert die Navigation mit derselben Funktion wie der Proxy', () => {
    // Sonst zeigt die Seitenleiste Punkte an, die der Proxy beim Klick
    // wieder wegleitet — oder verbirgt Punkte, die erlaubt waeren.
    const layout = readFileSync('app/admin/layout.tsx', 'utf-8')
    expect(layout).toContain("from '@/lib/auth/bereiche'")
    expect(layout).toMatch(/items:\s*g\.items\.filter\(i\s*=>\s*darfPfad\(/)

    const proxy = readFileSync('proxy.ts', 'utf-8')
    expect(proxy).toContain('darfPfad(role, pathname, request.method)')
  })

  it('haelt die Rollenliste, die Startseiten-Karte und ROLE_ACCESS gleich gross', () => {
    // Eine neue Rolle, die nur in ROLLEN steht, bekommt sonst still
    // UNBEKANNTE_ROLLE_ZIEL und landet in der Kunden-App.
    const proxy = readFileSync('proxy.ts', 'utf-8')
    const block = proxy.slice(proxy.indexOf('const ROLE_ACCESS'), proxy.indexOf('// ═══ Startseite pro Rolle'))
    for (const rolle of ROLLEN) {
      expect(block, `${rolle} fehlt in ROLE_ACCESS`).toContain(`${rolle}:`)
    }
    expect(Object.keys(ANMELDE_STARTSEITE).sort()).toEqual([...ROLLEN].sort() as Rolle[])
    expect(Object.keys(BEREICHS_STARTSEITE).sort()).toEqual([...ROLLEN].sort() as Rolle[])
  })
})
