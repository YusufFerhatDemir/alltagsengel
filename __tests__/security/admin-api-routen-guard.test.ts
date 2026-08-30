/**
 * Jede Admin-API-Route hat eine Zugangsschranke — in JEDEM Handler
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Unter `app/api/admin/**` liegen Zugangsdaten zur Datenannahmestelle,
 * SFTP-Schluessel, Zertifikate, KIM-Postfaecher, Signaturen,
 * Angehoerigenzugaenge, Preiskonfiguration und die Pilotsteuerung. Es
 * gibt keine `middleware.ts`, die diese Pfade abfaengt (nur `proxy.ts`
 * fuer die Seiten) — jede Route bringt ihre Schranke selbst mit.
 *
 * Genau deshalb dieser Test: eine neu angelegte Route ist die einfachste
 * Art, ein Loch zu reissen. Sie faellt niemandem auf, weil nichts
 * fehlschlaegt — sie funktioniert einfach fuer alle.
 *
 * Geprueft wird JEDER exportierte Handler einzeln, nicht die Datei. Der
 * haeufigere Fehler ist naemlich nicht die ganz ungeschuetzte Datei,
 * sondern der eine nachgereichte DELETE-Handler unter drei geschuetzten.
 *
 * Der Test liest Quelltext. Er beweist nicht, dass die Schranke haelt —
 * das tun die Suiten zu den einzelnen Guards (z. B.
 * __tests__/abrechnung/require-admin.test.ts). Er beweist, dass ueberall
 * eine da ist.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { HANDLER_NAMEN, handlerKopfMuster, handlerRumpf } from '../helpers/route-quelle'

const WURZEL = path.resolve(__dirname, '../..')

/**
 * Bekannte Schranken des Hauses. Ein Handler muss mindestens eine davon
 * aufrufen. Neue Guards gehoeren hier hinein — bewusst als Liste, damit
 * das Hinzufuegen eines Guards eine sichtbare Entscheidung ist.
 */
const GUARDS = [
  'requireAdmin',        // deckt auch requireAdminMitOrg ab
  'requireKimAdmin',
  'requireSigAdmin',
  'requireSigUser',
  'requireAngehAdmin',
  'requireOpsAdmin',
  // Duenne Huelle um requireOpsAdmin('bonus.verwalten'). Eigener Helfer,
  // weil das Bonusmodul ueber Verguetung entscheidet und deshalb genau die
  // Antwort geben muss, die die bonus_*-Policies live geben (is_admin()) —
  // vorher stand dort berichte.lesen und liess pdl/qm/buchhaltung in eine
  // stille Leerliste bzw. einen erfundenen Serverfehler laufen.
  'requireBonusVerwaltung',
  // Der allgemeine Berechtigungs-Guard aus lib/auth/guard.ts. Er ermittelt
  // die Rolle aus BEIDEN nicht selbst beschreibbaren Quellen
  // (profiles bindend, app_metadata einschraenkend) und prueft gegen die
  // Rollenmatrix — dieselbe Entscheidung wie die Fach-Guards oben, nur
  // ohne eigene Huelle. Benutzt von /api/admin/security/audit-log
  // ('sicherheit.lesen').
  'requireBerechtigung',
  'checkAdmin',
  'handleVerifizierungPatch',
  'handleDetailGet',
  'verifyCronAuth',
]

/**
 * Ein Teil der Routen prueft von Hand statt ueber einen Helfer: Sitzung
 * holen, Rolle aus profiles lesen, gegen die Berechtigungsmatrix pruefen.
 * Das ist zulaessig — aber NUR vollstaendig.
 *
 * Entscheidend ist das UND: `auth.getUser()` allein beantwortet die Frage
 * „ist jemand angemeldet", nicht „darf dieser jemand das hier". Unter
 * /api/admin liegen Zugangsdaten und Zertifikate; angemeldet ist dort
 * auch jeder Kunde und jeder Engel. Eine Route, die nur die Sitzung
 * prueft, gilt diesem Test deshalb als ungeschuetzt.
 */
function inlineSchranke(rumpf: string): boolean {
  const sitzung = /auth\.getUser\s*\(/.test(rumpf)
  // Track 7 (28.08.2026): die Rollenentscheidung laeuft in den Routen nicht
  // mehr ueber `rolleDarf(profile.role, …)`, sondern ueber BEIDE
  // Rollenquellen (quellenDuerfen / quellenSindAdministration /
  // quellenSindRolle aus lib/auth/rollen-quelle.ts). Der Test haelt sonst
  // die alte, schwaechere Form fest und meldet die staerkere als „keine
  // Schranke". Die urspruengliche Aussage bleibt unveraendert: gefragt
  // wird nach einer BERECHTIGUNG, nicht nur nach der Anmeldung.
  const rollenEntscheidung =
    /rolleDarf\s*\(/.test(rumpf)
    || /quellenDuerfen\s*\(/.test(rumpf)
    || /quellenSindAdministration\s*\(/.test(rumpf)
    || /quellenSindRolle\s*\(/.test(rumpf)
    || /role\s*!==\s*'superadmin'/.test(rumpf)
    || /role\s*===\s*'superadmin'/.test(rumpf)
  return sitzung && rollenEntscheidung
}

const HANDLER = HANDLER_NAMEN

function routenDateien(start: string): string[] {
  const treffer: string[] = []
  const lauf = (verzeichnis: string) => {
    for (const eintrag of readdirSync(verzeichnis)) {
      const voll = path.join(verzeichnis, eintrag)
      if (statSync(voll).isDirectory()) lauf(voll)
      else if (eintrag === 'route.ts') treffer.push(path.relative(WURZEL, voll))
    }
  }
  lauf(path.join(WURZEL, start))
  return treffer.sort()
}

const DATEIEN = routenDateien('app/api/admin')

// ═══════════════════════════════════════════════════════════════════
describe('app/api/admin/** — jeder Handler hat eine Schranke', () => {
  it('findet ueberhaupt Routen (der Scanner selbst muss funktionieren)', () => {
    // Ohne diese Zusicherung waere eine leere Liste ein gruener Test.
    expect(DATEIEN.length).toBeGreaterThan(20)
  })

  for (const datei of DATEIEN) {
    describe(datei, () => {
      const src = readFileSync(path.join(WURZEL, datei), 'utf-8')
      const vorhanden = HANDLER.filter(h => handlerKopfMuster(h).test(src))

      it('exportiert mindestens einen Handler', () => {
        expect(vorhanden.length).toBeGreaterThan(0)
      })

      for (const h of vorhanden) {
        it(`${h} prueft Anmeldung UND Berechtigung`, () => {
          const rumpf = handlerRumpf(src, h)
          expect(rumpf, `Rumpf von ${h} nicht lesbar`).toBeTruthy()
          const helfer = GUARDS.filter(g => rumpf!.includes(g))
          const geschuetzt = helfer.length > 0 || inlineSchranke(rumpf!)
          expect(
            geschuetzt,
            `${datei}::${h} hat keine Zugangsschranke. Entweder einen Helfer `
            + `aufrufen (${GUARDS.join(', ')}) oder von Hand pruefen: `
            + 'auth.getUser() UND quellenDuerfen(). Neuer Helfer? In GUARDS eintragen.',
          ).toBe(true)
        })
      }
    })
  }
})

// ═══════════════════════════════════════════════════════════════════
describe('Der Scanner erkennt eine ungeschuetzte Route', () => {
  // Gegenprobe: ohne sie koennte der Scanner alles durchwinken und der
  // Test waere ein gruener Platzhalter.
  const BEISPIEL = `
    import { NextResponse } from 'next/server'
    export async function GET() {
      return NextResponse.json({ geheim: true })
    }
    export async function DELETE(req: Request) {
      const auth = await requireAdminMitOrg('system.verwalten')
      if (!auth.ok) return auth.response
      return NextResponse.json({ ok: true })
    }
  `

  it('meldet den ungeschuetzten GET', () => {
    const rumpf = handlerRumpf(BEISPIEL, 'GET')!
    expect(GUARDS.filter(g => rumpf.includes(g))).toHaveLength(0)
    expect(inlineSchranke(rumpf)).toBe(false)
  })

  it('wertet eine reine Anmeldepruefung NICHT als Schranke', () => {
    // Der Fall, den dieser Test eigentlich fangen soll: die Route sieht
    // geschuetzt aus, weil sie 401 kennt — aber jeder angemeldete Kunde
    // kommt durch.
    const nurSitzung = `
      export async function GET() {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'nope' }, { status: 401 })
        return NextResponse.json({ geheim: true })
      }
    `
    expect(inlineSchranke(handlerRumpf(nurSitzung, 'GET')!)).toBe(false)
  })

  it('wertet Sitzung UND Rollenpruefung als Schranke', () => {
    const vollstaendig = `
      export async function GET() {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'nope' }, { status: 401 })
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (!profile || !rolleDarf(profile.role, 'system.verwalten')) {
          return NextResponse.json({ error: 'nope' }, { status: 403 })
        }
        return NextResponse.json({ ok: true })
      }
    `
    expect(inlineSchranke(handlerRumpf(vollstaendig, 'GET')!)).toBe(true)
  })

  it('erkennt den gewrappten Handler — und meldet ihn ungeschuetzt', () => {
    // Die Form, in der die Routen seit dem Request-Tracking exportiert
    // werden. Wuerde der Scanner sie nicht kennen, faende er in KEINER
    // Datei mehr einen Handler — und liesse alles durch, ohne rot zu
    // werden.
    const gewrappt = `
      export const GET = withTracking(async function GET(req: NextRequest) {
        return NextResponse.json({ geheim: true })
      })
    `
    const rumpf = handlerRumpf(gewrappt, 'GET')
    expect(rumpf, 'gewrappter Rumpf nicht lesbar').toBeTruthy()
    expect(GUARDS.filter(g => rumpf!.includes(g))).toHaveLength(0)
    expect(inlineSchranke(rumpf!)).toBe(false)
  })

  it('laesst den gewrappten, geschuetzten Handler durch — mit Next-Signatur', () => {
    const gewrappt = `
      export const PATCH = withTracking(async function PATCH(
        request: Request,
        { params }: { params: Promise<{ id: string }> },
      ): Promise<NextResponse<{ ok: boolean }>> {
        const auth = await requireAdminMitOrg('system.verwalten')
        if (!auth.ok) return auth.response
        return NextResponse.json({ ok: true })
      })
    `
    const rumpf = handlerRumpf(gewrappt, 'PATCH')!
    expect(rumpf).toContain('requireAdminMitOrg')
    // Der Rumpf endet an der schliessenden Klammer der Funktion, nicht
    // an der des withTracking-Aufrufs.
    expect(rumpf.trimEnd().endsWith('}')).toBe(true)
  })

  it('laesst den geschuetzten DELETE durch — auch mit Next-Signatur', () => {
    // Die zerlegte Parameterliste `{ params }: { params: Promise<{…}> }`
    // ist der Grund fuer die dreistufige Rumpfsuche. Ein naiver Scanner
    // schneidet hier den Typ statt des Rumpfes heraus und meldet jede
    // dieser Routen falsch als ungeschuetzt.
    const rumpf = handlerRumpf(BEISPIEL, 'DELETE')!
    expect(rumpf).toContain('requireAdminMitOrg')
    expect(GUARDS.filter(g => rumpf.includes(g)).length).toBeGreaterThan(0)
  })
})
