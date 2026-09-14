/**
 * Der zweite Faktor — die Haelfte, die beide Haelften war
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 95, 14.09.2026)
 *
 * Der zweite Faktor wird serverseitig an vier Stellen durchgesetzt. Drei
 * davon — lib/ops/api-auth.ts (der gesamte Betriebssystem-Bereich),
 * lib/abrechnung/require-admin.ts (rund fuenfundzwanzig Kassenweg-Routen)
 * und lib/auth/guard.ts (requireBerechtigung/requireAdministration) —
 * trafen ihre Entscheidung aus EINER Abfrage:
 *
 *     const { data: aal } = await supabase.auth.mfa
 *       .getAuthenticatorAssuranceLevel()
 *     if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') …
 *
 * Diese eine Abfrage traegt beide Haelften der Frage:
 *   `nextLevel`    — hat das Konto ueberhaupt einen Faktor?
 *   `currentLevel` — ist DIESE Sitzung damit erhoben worden?
 *
 * Faellt sie aus, fallen beide Haelften zusammen aus. Und weil ein Konto
 * ohne Faktor dasselbe `nextLevel: 'aal1'` liefert wie eine gescheiterte
 * Abfrage, war „nicht nachgesehen" von „nichts einzurichten" nicht zu
 * unterscheiden — der Riegel liess durch. Der `catch {}` in
 * lib/ops/api-auth.ts war leer, das `error` der Abfrage wurde in allen
 * drei Modulen verworfen: es gab nicht einmal eine Spur davon.
 *
 * Die vierte Stelle, lib/coach/api-auth.ts, macht es seit jeher richtig
 * und ist die Vorlage dieses Umbaus: sie liest die Faktorliste aus dem
 * Benutzerobjekt, das `auth.getUser()` ohnehin geliefert hat, und braucht
 * das Sitzungsniveau nur noch als zweite, UNABHAENGIGE Haelfte.
 *
 * Dazu kommt ein zweiter, feinerer Fall, den die alte Form gar nicht
 * treffen konnte: `nextLevel` wird von der Auth-Bibliothek aus der
 * Faktorliste IN DER SITZUNG abgeleitet. Ein Sitzungs-Cookie, das aelter
 * ist als die Einrichtung des Faktors, traegt sie nicht — `nextLevel`
 * blieb 'aal1', und der Riegel las daraus „kein Faktor".
 *
 * WAS BLEIBT: Wer KEINEN bestaetigten Faktor hat, kommt weiterhin durch.
 * Sonst kaeme niemand mehr an /admin/mfa-einrichtung heran. Diese eine
 * Fail-open-Richtung ist gewollt — sie haengt jetzt an der Faktorliste
 * und nicht mehr am Gelingen einer Abfrage.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  faktorenVon, niveauDerSitzung, zweiterFaktorRiegel, ZWEITER_FAKTOR_TEXT,
} from '../../lib/auth/zweiter-faktor'
import type { SupabaseClient } from '@supabase/supabase-js'

const BESTAETIGT = { id: 'f-1', factor_type: 'totp', status: 'verified' }
const ANGEFANGEN = { id: 'f-2', factor_type: 'totp', status: 'unverified' }

/** Auth-Doppelgaenger: nur die eine Methode, die der Riegel benutzt. */
function fakeClient(antwort: unknown, werfen = false) {
  const aal = vi.fn(async () => {
    if (werfen) throw new Error('Auth nicht erreichbar')
    return antwort
  })
  return { client: { auth: { mfa: { getAuthenticatorAssuranceLevel: aal } } } as unknown as SupabaseClient, aal }
}

const AAL2 = { data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }
const AAL1 = { data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }

describe('faktorenVon liest die Liste aus der Benutzerantwort', () => {
  it('nimmt sie, wenn sie da ist', () => {
    expect(faktorenVon({ id: 'u', factors: [BESTAETIGT] })).toEqual([BESTAETIGT])
  })

  it('und liefert sonst eine leere Liste statt undefined', () => {
    // Die Aufrufer entscheiden damit; `undefined` waere an jeder Stelle
    // eine eigene Fallunterscheidung — und irgendwo die falsche.
    for (const eingabe of [null, undefined, {}, { factors: null }, { factors: 'x' }, 42]) {
      expect(faktorenVon(eingabe), String(eingabe)).toEqual([])
    }
  })
})

describe('niveauDerSitzung meldet nur, was sie wirklich gelesen hat', () => {
  it('gibt das Niveau der Sitzung zurueck', async () => {
    expect(await niveauDerSitzung(fakeClient(AAL2).client)).toBe('aal2')
    expect(await niveauDerSitzung(fakeClient(AAL1).client)).toBe('aal1')
  })

  it('meldet null, wenn die Abfrage einen Fehler traegt', async () => {
    // Die Auth-Schicht wirft nicht — sie gibt `error` zurueck. Wer nur
    // `data` zerlegt, sieht eine gescheiterte Abfrage als „aal1".
    expect(await niveauDerSitzung(fakeClient({ data: null, error: { message: 'x' } }).client)).toBeNull()
  })

  it('meldet null, wenn die Abfrage wirft', async () => {
    expect(await niveauDerSitzung(fakeClient(null, true).client)).toBeNull()
  })

  it('meldet null bei einem unbekannten Niveau', async () => {
    expect(await niveauDerSitzung(fakeClient({ data: { currentLevel: 'aal3' }, error: null }).client)).toBeNull()
    expect(await niveauDerSitzung(fakeClient({ data: {}, error: null }).client)).toBeNull()
  })
})

describe('Der Riegel: ohne Faktor offen, mit Faktor fail-closed', () => {
  it('laesst ein Konto ohne Faktor durch', async () => {
    expect(await zweiterFaktorRiegel(fakeClient(AAL1).client, [])).toBeNull()
  })

  it('fragt fuer ein Konto ohne Faktor das Niveau gar nicht erst ab', async () => {
    const { client, aal } = fakeClient(AAL1)
    await zweiterFaktorRiegel(client, [])
    expect(aal).not.toHaveBeenCalled()
  })

  it('zaehlt eine angefangene Einrichtung nicht als Faktor', async () => {
    // Sonst sperrt der erste abgebrochene Versuch das Konto aus — und
    // zwar aus der Seite, auf der man ihn beenden wuerde.
    const { client, aal } = fakeClient(AAL1)
    expect(await zweiterFaktorRiegel(client, [ANGEFANGEN])).toBeNull()
    expect(aal).not.toHaveBeenCalled()
  })

  it('laesst ein Konto mit Faktor auf AAL2 durch', async () => {
    expect(await zweiterFaktorRiegel(fakeClient(AAL2).client, [BESTAETIGT])).toBeNull()
  })

  it('sperrt ein Konto mit Faktor auf AAL1', async () => {
    const antwort = await zweiterFaktorRiegel(fakeClient(AAL1).client, [BESTAETIGT])
    expect(antwort?.status).toBe(403)
    expect(await antwort!.json()).toEqual({ error: ZWEITER_FAKTOR_TEXT })
  })

  it('SPERRT, wenn das Niveau nicht feststellbar ist — der Befund', async () => {
    // Die drei Lagen, die vorher alle „durch" hiessen.
    for (const [name, lage] of [
      ['Abfrage wirft', fakeClient(null, true)],
      ['Abfrage meldet error', fakeClient({ data: null, error: { message: 'x' } })],
      ['Abfrage liefert nichts', fakeClient({ data: null, error: null })],
    ] as const) {
      const antwort = await zweiterFaktorRiegel(lage.client, [BESTAETIGT])
      expect(antwort?.status, name).toBe(403)
    }
  })

  it('sperrt auch, wenn nextLevel die Einrichtung nicht kennt', async () => {
    // Ein Sitzungs-Cookie von VOR der Einrichtung traegt keine Faktoren;
    // die Auth-Bibliothek meldet dann nextLevel 'aal1'. Die alte Form las
    // daraus „kein Faktor" und liess durch.
    const antwort = await zweiterFaktorRiegel(
      fakeClient({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }).client,
      [BESTAETIGT],
    )
    expect(antwort?.status).toBe(403)
  })

  it('behandelt eine fehlende Liste wie „kein Faktor"', async () => {
    expect(await zweiterFaktorRiegel(fakeClient(AAL1).client, null)).toBeNull()
    expect(await zweiterFaktorRiegel(fakeClient(AAL1).client, undefined)).toBeNull()
  })
})

describe('Die Entscheidung liegt NICHT mehr bei nextLevel', () => {
  const QUELLE = readFileSync('lib/auth/zweiter-faktor.ts', 'utf8')
  const AUSGEFUEHRT = QUELLE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(z => !z.trim().startsWith('//')).join('\n')

  it('wertet nextLevel im ausgefuehrten Teil gar nicht aus', () => {
    // Im Kommentar steht es — dort gehoert die Begruendung hin.
    expect(AUSGEFUEHRT).not.toContain('nextLevel')
  })

  it('verwirft das error der Niveau-Abfrage nicht', () => {
    expect(AUSGEFUEHRT).toContain('const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()')
    expect(AUSGEFUEHRT).toContain('if (error) {')
  })

  it('protokolliert beide Ausfallarten, statt sie zu schlucken', () => {
    // Ein leerer catch-Block war der Ausgangsbefund: eine Pruefung, die
    // gerade nicht stattfinden kann, darf nicht spurlos bleiben.
    expect(AUSGEFUEHRT).not.toMatch(/catch\s*\{\s*\}/)
    expect((AUSGEFUEHRT.match(/authLogger\.warnWithException\(/g) ?? []).length).toBe(2)
  })
})

describe('Alle drei Guards benutzen denselben Riegel', () => {
  const MODULE = [
    'lib/ops/api-auth.ts',
    'lib/abrechnung/require-admin.ts',
    'lib/auth/guard.ts',
  ]

  for (const datei of MODULE) {
    const quelle = readFileSync(datei, 'utf8')
    const ausgefuehrt = quelle
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter(z => !z.trim().startsWith('//')).join('\n')

    it(`${datei} ruft zweiterFaktorRiegel auf`, () => {
      expect(ausgefuehrt).toContain('zweiterFaktorRiegel(')
    })

    it(`${datei} leitet das AAL-Niveau NICHT mehr selbst ab`, () => {
      // Der Kern: die Entscheidung darf nicht wieder aus der einen
      // Abfrage entstehen, nur weil sie dort bequemer zur Hand ist.
      expect(ausgefuehrt).not.toContain('getAuthenticatorAssuranceLevel')
      expect(ausgefuehrt).not.toContain('nextLevel')
    })

    it(`${datei} uebergibt eine echte Faktorliste`, () => {
      // Ein `zweiterFaktorRiegel(supabase, [])` waere der Riegel, der
      // immer durchlaesst — syntaktisch richtig und fachlich leer.
      expect(ausgefuehrt).toMatch(/zweiterFaktorRiegel\([^)]*\.faktoren\)/)
    })
  }
})

describe('Die Faktorliste kommt ohne zusaetzlichen Aufruf', () => {
  /**
   * Nur der ausgefuehrte Teil. Die Kopfkommentare beider Module
   * ERKLAEREN `auth.getUser()` — ein Test, der ueber die eigene
   * Begruendung stolpert, erzieht dazu, die Begruendung wegzulassen.
   */
  function ohneKommentare(datei: string): string {
    return readFileSync(datei, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter(z => !z.trim().startsWith('//')).join('\n')
  }

  for (const datei of ['lib/auth/rollen-quelle.ts', 'lib/auth/guard.ts']) {
    it(`${datei} reicht sie aus der Benutzerantwort durch`, () => {
      const quelle = ohneKommentare(datei)
      expect(quelle).toContain('faktoren: faktorenVon(user)')
      // Kein zweiter getUser() dafuer — das waere ein Netzaufruf pro
      // Anfrage auf jedem Geldweg, aus genau dem Grund, aus dem
      // holeRollenQuellenFuer() ueberhaupt existiert.
      expect((quelle.match(/auth\.getUser\(\)/g) ?? []).length).toBe(1)
    })
  }
})
