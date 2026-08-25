// ═══════════════════════════════════════════════════════════════════════════
// Vollständigkeits- und Konsistenzprüfung des ENV-Verzeichnisses.
//
// Der teuerste Test hier ist der Scan über app/, lib/ und components/: er
// hält das Verzeichnis ehrlich. Ohne ihn wäre lib/env/register.ts nach drei
// Monaten wieder unvollständig — und ein unvollständiges Verzeichnis ist
// schlimmer als keines, weil es Vollständigkeit behauptet.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { ENV_REGISTER, akzeptierteNamen } from '@/lib/env'
import { VERSAND_FLAGS, NICHT_PRODUKTION_ERLAUBT } from '@/lib/config/versand-flags'

const WURZEL = path.resolve(__dirname, '..', '..')
const QUELLEN = ['app', 'lib', 'components', 'proxy.ts', 'next.config.ts', 'instrumentation.ts', 'instrumentation-client.ts']

/**
 * Kommentare vor dem Scan entfernen.
 *
 * Ohne das schlägt der Test an seinen eigenen Erklärtexten an: sowohl
 * lib/stripe/config.ts als auch lib/env/register.ts schreiben `process.env.X`
 * bzw. `process.env.NAME` in Fließtext. Ein Test, der Dokumentation für Code
 * hält, erzieht dazu, keine Dokumentation mehr zu schreiben.
 *
 * Bewusst simpel gehalten (Block- und Zeilenkommentare, keine Zeichenketten-
 * Analyse): ein `//` in einem String würde hier zu viel wegschneiden, was
 * höchstens einen Treffer verstecken kann — und dagegen steht die
 * Gegenprobe unten, die die bekannten Kern-Variablen finden MUSS.
 */
function ohneKommentare(quelltext: string): string {
  return quelltext.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

function dateienSammeln(start: string, ergebnis: string[] = []): string[] {
  if (!fs.existsSync(start)) return ergebnis
  const st = fs.statSync(start)
  if (st.isFile()) {
    if (/\.(ts|tsx|mts)$/.test(start)) ergebnis.push(start)
    return ergebnis
  }
  for (const eintrag of fs.readdirSync(start)) {
    if (eintrag === 'node_modules' || eintrag === '__tests__') continue
    dateienSammeln(path.join(start, eintrag), ergebnis)
  }
  return ergebnis
}

function gefundeneNamen(): Map<string, string[]> {
  const treffer = new Map<string, string[]>()
  for (const wurzel of QUELLEN) {
    for (const datei of dateienSammeln(path.join(WURZEL, wurzel))) {
      if (/\.test\.tsx?$/.test(datei)) continue
      const inhalt = ohneKommentare(fs.readFileSync(datei, 'utf8'))
      for (const m of inhalt.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        const name = m[1]
        const liste = treffer.get(name) ?? []
        liste.push(path.relative(WURZEL, datei))
        treffer.set(name, liste)
      }
    }
  }
  return treffer
}

const ALLE_VERZEICHNETEN = new Set(ENV_REGISTER.flatMap((e) => [...akzeptierteNamen(e)]))

describe('ENV-Verzeichnis', () => {
  it('kennt jede Variable, die im Laufzeit-Code literal gelesen wird', () => {
    const gefunden = gefundeneNamen()
    const fehlend = [...gefunden.entries()]
      .filter(([name]) => !ALLE_VERZEICHNETEN.has(name))
      .map(([name, dateien]) => `${name} (u. a. ${dateien[0]})`)

    expect(
      fehlend,
      'Nicht verzeichnete Umgebungsvariablen — in lib/env/register.ts eintragen:\n' + fehlend.join('\n'),
    ).toEqual([])
  })

  it('findet den Laufzeit-Code überhaupt (Gegenprobe zum Kommentar-Filter)', () => {
    // Ohne diese Probe könnte ein zu gieriger Filter alles wegschneiden und
    // der Vollständigkeitstest wäre still immer grün.
    const gefunden = gefundeneNamen()
    // Bewusst KEIN Versand-Schalter mehr in dieser Liste: die beiden werden
    // seit lib/config/versand-flags.ts nicht mehr literal gelesen, sondern
    // ueber eine Namensliste. Der Scan sieht sie deshalb nicht — ihre
    // Vollstaendigkeit haelt der Test „kennt die beiden Versand-Schalter"
    // weiter unten, und zwar aus derselben Namensliste heraus.
    for (const pflicht of ['NEXT_PUBLIC_SUPABASE_URL', 'CRON_SECRET', 'RESEND_API_KEY']) {
      expect(gefunden.has(pflicht), `${pflicht} im Scan nicht gefunden`).toBe(true)
    }
    expect(gefunden.size).toBeGreaterThan(30)
  })

  it('hat keine doppelten Namen', () => {
    const gesehen = new Set<string>()
    const doppelt: string[] = []
    for (const eintrag of ENV_REGISTER) {
      for (const name of akzeptierteNamen(eintrag)) {
        if (gesehen.has(name)) doppelt.push(name)
        gesehen.add(name)
      }
    }
    expect(doppelt).toEqual([])
  })

  it('führt kein Geheimnis unter einem NEXT_PUBLIC_-Namen', () => {
    // Der harte Kern der Client-Sicherheit: Next.js ersetzt NEXT_PUBLIC_*
    // textuell im Browser-Bundle. Ein als geheim verzeichneter Eintrag mit
    // diesem Präfix wäre ein ausgeliefertes Geheimnis.
    const verstoesse = ENV_REGISTER
      .filter((e) => e.geheim)
      .flatMap((e) => akzeptierteNamen(e))
      .filter((n) => n.startsWith('NEXT_PUBLIC_'))
    expect(verstoesse).toEqual([])
  })

  it('markiert jede NEXT_PUBLIC_-Variable als client oder plattform', () => {
    const falsch = ENV_REGISTER
      .filter((e) => e.name.startsWith('NEXT_PUBLIC_') && e.geltung === 'server')
      .map((e) => e.name)
    expect(falsch).toEqual([])
  })

  it('gibt jedem Eintrag eine Beschreibung', () => {
    const ohne = ENV_REGISTER.filter((e) => e.beschreibung.trim().length < 10).map((e) => e.name)
    expect(ohne).toEqual([])
  })

  it('hält die Pflicht-Liste klein und begründet', () => {
    // Jede Pflichtvariable mehr ist eine Umgebung mehr, die nicht startet.
    // Der Test ist eine Sperrklinke: wer hier etwas hinzufügt, soll die Zahl
    // bewusst anfassen müssen.
    const pflicht = ENV_REGISTER.filter((e) => e.notwendigkeit === 'pflicht').map((e) => e.name)
    expect(pflicht.sort()).toEqual([
      'CRON_SECRET',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
      'RESEND_API_KEY',
      'SUPABASE_SECRET_KEY',
    ])
  })

  it('kennt die beiden Versand-Schalter und markiert sie als nach außen wirkend', () => {
    // Die Namen kommen aus VERSAND_FLAGS, nicht aus einer zweiten Liste hier:
    // seit die Schalter zentral ausgewertet werden, findet der literale
    // process.env-Scan sie nicht mehr. Dieser Test ist damit die Stelle, die
    // ihre Verzeichnung erzwingt — er muss aus der Quelle lesen, sonst
    // koennte ein dritter Schalter unverzeichnet dazukommen.
    expect(VERSAND_FLAGS.length).toBe(2)
    for (const name of VERSAND_FLAGS) {
      const eintrag = ENV_REGISTER.find((e) => e.name === name)
      expect(eintrag, `${name} fehlt im Verzeichnis`).toBeDefined()
      expect(eintrag!.wirktNachAussen, `${name} muss als nach außen wirkend markiert sein`).toBe(true)
      expect(eintrag!.notwendigkeit).toBe('optional')
    }
  })

  it('verzeichnet auch die Variablen, die nur zentral ausgewertet werden', () => {
    // Dieselbe Luecke wie bei den Schaltern: NICHT_PRODUKTION_ERLAUBT und
    // CAMT_IMPORT_MODE werden ueber Konstanten bzw. in einem Modul gelesen,
    // das der Scan nicht als literalen Zugriff erkennt.
    for (const name of [NICHT_PRODUKTION_ERLAUBT, 'CAMT_IMPORT_MODE']) {
      expect(
        ALLE_VERZEICHNETEN.has(name),
        `${name} fehlt im Verzeichnis (lib/env/register.ts)`,
      ).toBe(true)
    }
  })
})
