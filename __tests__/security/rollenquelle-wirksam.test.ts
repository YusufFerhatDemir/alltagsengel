/**
 * Rollenquelle: app_metadata.role UND profiles.role
 *
 * BEFUND (Track 4, 28.08.2026)
 * Das Projekt hatte zwei autoritative Rollenquellen und zwei GEGENLAEUFIGE
 * Lesarten davon:
 *
 *   proxy.ts / lib/auth/guard.ts / app/admin/layout.tsx:
 *     `app_metadata.role || profiles.role` — app_metadata gewinnt, und
 *     proxy.ts fragte profiles gar nicht erst ab, wenn app_metadata
 *     gesetzt war.
 *   Die dreizehn Fach-Guards (lib/**\/api-auth.ts):
 *     ausschliesslich `profiles.role`.
 *
 * Praktisch bedeutsam ist die Richtung des Rechteentzugs. app_metadata.role
 * wird NUR von /api/admin/manage-role geschrieben. Jede Herabstufung, die
 * direkt in der Datenbank passiert — der dokumentierte Weg fuer 'superadmin'
 * und der einzige Weg fuer eine Korrektur ausserhalb dieser Route —
 * hinterlaesst den alten, hoeheren Wert im Token. Der Torwaechter liess die
 * Person danach weiter in den Verwaltungsbereich, die Fach-Guards wiesen sie
 * ab. Ein Entzug, der nur zur Haelfte wirkt, ist keiner.
 *
 * REGEL, die diese Tests festhalten: profiles ist bindend, app_metadata
 * wirkt nur einschraenkend (Schnittmenge). Die Regel kann per Konstruktion
 * nur Rechte nehmen, nie geben.
 *
 * Die Gegenprobe-Tests am Ende fuehren die ALTE Regel noch einmal aus und
 * zeigen, dass sie das Gegenteil ergab.
 */

import { describe, it, expect } from 'vitest'
import {
  wirksameBerechtigungen,
  wirksamDarf,
  wirksamDarfAlle,
  wirksamDarfEines,
  wirksamIstAdministration,
  wirksamIstVerwaltungsrolle,
  wirksameRolle,
  berechtigungenVon,
  ROLLEN,
} from '@/lib/auth/rollen'

describe('wirksameBerechtigungen — profiles ist bindend', () => {
  it('ohne profiles-Rolle gibt es NICHTS, auch wenn app_metadata Admin sagt', () => {
    // Ein Token ohne zugehoerigen Personendatensatz ist kein Zugang.
    expect(wirksameBerechtigungen('superadmin', '')).toEqual([])
    expect(wirksameBerechtigungen('admin', null)).toEqual([])
    expect(wirksameBerechtigungen('admin', undefined)).toEqual([])
  })

  it('ohne app_metadata entscheidet profiles allein (Bestandsfall)', () => {
    // Bei den allermeisten Konten ist app_metadata.role nie geschrieben
    // worden — dieser Pfad darf sich nicht veraendert haben.
    for (const rolle of ROLLEN) {
      expect(wirksameBerechtigungen('', rolle)).toEqual(berechtigungenVon(rolle))
      expect(wirksameBerechtigungen(undefined, rolle)).toEqual(berechtigungenVon(rolle))
    }
  })

  it('bei Gleichstand aendert sich nichts', () => {
    expect(wirksameBerechtigungen('pdl', 'pdl')).toEqual(berechtigungenVon('pdl'))
  })
})

describe('Widerspruch: die schwaechere Quelle gewinnt', () => {
  it('veraltetes app_metadata=admin ueberstimmt profiles=kunde NICHT', () => {
    expect(wirksameBerechtigungen('admin', 'kunde')).toEqual([])
    expect(wirksamDarf('admin', 'kunde', 'abrechnung.schreiben')).toBe(false)
    expect(wirksamIstAdministration('admin', 'kunde')).toBe(false)
    expect(wirksamIstVerwaltungsrolle('admin', 'kunde')).toBe(false)
  })

  it('veraltetes app_metadata=admin ueberstimmt profiles=buchhaltung NICHT', () => {
    // Buchhaltung darf keine Gesundheitsdaten sehen — auch nicht mit
    // einem Token, das noch 'admin' sagt.
    expect(wirksamDarf('admin', 'buchhaltung', 'pflege.lesen')).toBe(false)
    expect(wirksamDarf('admin', 'buchhaltung', 'abrechnung.schreiben')).toBe(true)
  })

  it('veraltetes app_metadata=kunde beschneidet profiles=admin', () => {
    // Die Gegenrichtung: wer im Token herabgestuft ist, kommt auch mit
    // einem Admin-Profil nicht an die Vorbehaltsbereiche. Fail-closed.
    expect(wirksameBerechtigungen('kunde', 'admin')).toEqual([])
    expect(wirksamIstAdministration('kunde', 'admin')).toBe(false)
  })

  it('zwei verschiedene Fachrollen ergeben ihre Schnittmenge', () => {
    // qm und buchhaltung sind gleich weit, aber nicht ineinander
    // enthalten. Nur die Schnittmenge ist beiden gemeinsam — deshalb
    // entscheidet sie und nicht ein „nimm die mit weniger Eintraegen".
    const wirksam = wirksameBerechtigungen('qm', 'buchhaltung')
    expect(wirksam).toContain('stammdaten.lesen')
    expect(wirksam).toContain('einsatz.lesen')
    expect(wirksam).not.toContain('pflege.lesen')       // nur qm
    expect(wirksam).not.toContain('bankdaten.schreiben') // nur buchhaltung
    expect(wirksam).not.toContain('qm.schreiben')        // nur qm
  })

  it('kann nie mehr gewaehren als profiles allein', () => {
    for (const app of ROLLEN) {
      for (const profil of ROLLEN) {
        const wirksam = wirksameBerechtigungen(app, profil)
        const nurProfil = berechtigungenVon(profil)
        for (const b of wirksam) expect(nurProfil).toContain(b)
      }
    }
  })
})

describe('unbekannte Werte', () => {
  it('unbekannte profiles-Rolle ergibt nichts', () => {
    expect(wirksameBerechtigungen('', 'gibtsnicht')).toEqual([])
  })

  it('unbekannte app_metadata-Rolle beschneidet auf nichts (fail-closed)', () => {
    // Ein Tippfehler in der Rollenzuweisung darf niemals MEHR ergeben.
    expect(wirksameBerechtigungen('gibtsnicht', 'admin')).toEqual([])
    expect(wirksamIstAdministration('gibtsnicht', 'admin')).toBe(false)
  })

  it('Leerzeichen zaehlen als „nicht gesetzt"', () => {
    expect(wirksameBerechtigungen('   ', 'pdl')).toEqual(berechtigungenVon('pdl'))
  })
})

describe('wirksamDarfEines / wirksamDarfAlle', () => {
  it('Eines: mindestens eine reicht', () => {
    expect(wirksamDarfEines('', 'buchhaltung', ['pflege.lesen', 'abrechnung.lesen'])).toBe(true)
    expect(wirksamDarfEines('', 'buchhaltung', ['pflege.lesen', 'pflege.schreiben'])).toBe(false)
  })

  it('Alle: eine fehlende genuegt zum Nein', () => {
    expect(wirksamDarfAlle('', 'buchhaltung', ['abrechnung.lesen', 'bankdaten.lesen'])).toBe(true)
    expect(wirksamDarfAlle('', 'buchhaltung', ['abrechnung.lesen', 'pflege.lesen'])).toBe(false)
  })

  it('Alle: leere Liste ist erfuellt — aber nur mit gueltiger Rolle', () => {
    expect(wirksamDarfAlle('', 'buchhaltung', [])).toBe(true)
    expect(wirksamDarfAlle('admin', '', [])).toBe(true)
  })
})

describe('wirksameRolle — Beschriftung zur Entscheidung', () => {
  it('ohne profiles-Rolle gibt es keinen Namen', () => {
    expect(wirksameRolle('admin', '')).toBe('')
  })

  it('ohne app_metadata steht die profiles-Rolle', () => {
    expect(wirksameRolle('', 'pdl')).toBe('pdl')
  })

  it('bei Widerspruch steht die engere', () => {
    expect(wirksameRolle('admin', 'engel')).toBe('engel')
    expect(wirksameRolle('engel', 'admin')).toBe('engel')
    expect(wirksameRolle('qm', 'admin')).toBe('qm')
  })
})

describe('Gegenprobe: die ALTE Regel ergab das Gegenteil', () => {
  /** So stand es bis zum 28.08.2026 in proxy.ts, guard.ts und layout.tsx. */
  const alteRegel = (app: string, profil: string) => app || profil

  it('alte Regel liess einen in der DB herabgestuften Admin durch', () => {
    // Herabstufung admin -> kunde, nur in profiles geschrieben.
    expect(alteRegel('admin', 'kunde')).toBe('admin')
    expect(berechtigungenVon(alteRegel('admin', 'kunde'))).toContain('benutzer.verwalten')

    // Neue Regel: nichts mehr.
    expect(wirksameBerechtigungen('admin', 'kunde')).toEqual([])
  })

  it('alte Regel gab einem Token ohne Profil volle Rechte', () => {
    expect(alteRegel('superadmin', '')).toBe('superadmin')
    expect(berechtigungenVon(alteRegel('superadmin', '')).length).toBeGreaterThan(0)

    expect(wirksameBerechtigungen('superadmin', '')).toEqual([])
  })

  it('alte Regel und Fach-Guards widersprachen sich', () => {
    // Genau die Spaltung, um die es geht: derselbe Nutzer, zwei Antworten.
    const torwaechter = berechtigungenVon(alteRegel('admin', 'kunde'))   // proxy.ts
    const fachGuard = berechtigungenVon('kunde')                          // lib/**/api-auth.ts
    expect(torwaechter.length).toBeGreaterThan(0)
    expect(fachGuard).toEqual([])

    // Jetzt geben beide dieselbe Antwort.
    expect(wirksameBerechtigungen('admin', 'kunde')).toEqual(fachGuard)
  })
})
