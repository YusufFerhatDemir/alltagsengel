// PflegeCoach Produktgrenze — node:test
// Ausführen: npx tsx --test lib/coach/produktgrenze.test.ts  (oder npm run test:unit)
//
// ═══════════════════════════════════════════════════════════════
// Dies ist ein STRUKTURTEST über den Quelltext, kein Verhaltenstest.
// Er sichert drei Zusagen, die man beim Weiterbauen leicht verletzt und
// die kein Unit-Test über eine einzelne Funktion erwischen würde:
//
//  1. Im ungegateten Produktbereich steht keine Aussage über eine
//     Kassenerstattung oder eine bestehende DiPA-Zulassung.
//  2. Die DiPA-spezifischen Oberflächen (Anspruchsprüfung, Freischaltung)
//     sind an die Schalter gebunden — Seite UND API.
//  3. Jede schreibende Coach-API prüft die Pflicht-Einwilligung. Eine neue
//     Schreibroute ohne `schreibzugriff: true` fällt hier auf, statt still
//     an der Einwilligung vorbei Gesundheitsdaten anzulegen.
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = fileURLToPath(new URL('../../', import.meta.url))
const PRODUKT_UI = join(WURZEL, 'app/pflegecoach')
const COACH_API = join(WURZEL, 'app/api/coach')

function dateienUnter(verzeichnis: string, endungen: string[]): string[] {
  const treffer: string[] = []
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag)
    if (statSync(pfad).isDirectory()) treffer.push(...dateienUnter(pfad, endungen))
    else if (endungen.some(e => eintrag.endsWith(e))) treffer.push(pfad)
  }
  return treffer
}

const relativ = (pfad: string) => pfad.slice(WURZEL.length)

// ── 1. Keine Erstattungs- oder Zulassungsaussagen ──────────────

/**
 * Nur der IMMER sichtbare Teil des Produkts. `anspruch/` und
 * `freischaltung/` sind bewusst ausgenommen: Sie erscheinen ausschließlich
 * im DiPA-Modus und dürfen dann über Kostenträger sprechen — dass sie
 * gegatet sind, prüft Abschnitt 2.
 */
const UNGEGATETE_UI = dateienUnter(PRODUKT_UI, ['.tsx', '.ts'])
  .filter(p => !relativ(p).includes('/anspruch/') && !relativ(p).includes('/freischaltung/'))

/**
 * Verbotene Aussagen — bewusst eng gefasst auf Behauptungen ÜBER DAS
 * PRODUKT. Sachinformation zu gesetzlichen Leistungen des Nutzers
 * (Entlastungsbetrag, Verhinderungspflege, Pflegekurse) ist ausdrücklich
 * erlaubt und wird hier nicht getroffen.
 */
const VERBOTENE_AUSSAGEN: Array<{ muster: RegExp; grund: string }> = [
  { muster: /erstattungsf(ä|ae)hig/i, grund: 'behauptet Erstattungsfähigkeit' },
  { muster: /kostener(stattung|statten)/i, grund: 'behauptet Kostenerstattung' },
  { muster: /kosten(ü|ue)bernahme/i, grund: 'behauptet Kostenübernahme' },
  { muster: /bfarm[- ]?(gelistet|zugelassen|verzeichnis)/i, grund: 'behauptet BfArM-Listung' },
  { muster: /dipa[- ]?(zulassung|zugelassen|gelistet)/i, grund: 'behauptet DiPA-Zulassung' },
  { muster: /zugelassene digitale pflegeanwendung/i, grund: 'behauptet Zulassung als DiPA' },
  { muster: /von (der|Ihrer) (pflege|kranken)kasse (erstattet|bezahlt|(ü|ue)bernommen)/i, grund: 'behauptet Kassenfinanzierung des Produkts' },
]

test('Produktbereich enthält keine Erstattungs- oder Zulassungsaussage', () => {
  const funde: string[] = []
  for (const pfad of [...UNGEGATETE_UI, join(WURZEL, 'lib/coach/inhalte.ts')]) {
    const text = readFileSync(pfad, 'utf8')
    for (const { muster, grund } of VERBOTENE_AUSSAGEN) {
      const treffer = text.match(muster)
      if (treffer) funde.push(`${relativ(pfad)}: ${grund} („${treffer[0]}")`)
    }
  }
  assert.deepEqual(funde, [], `Unzulässige Produktaussagen:\n${funde.join('\n')}`)
})

/**
 * Die Gegenprobe zu Abschnitt 1: Dort wird geprüft, dass NICHTS Falsches
 * behauptet wird. Hier, dass das Nötige tatsächlich dasteht. Der
 * Selbstzahler-Hinweis ist der verkaufsrelevante Teil der Zweckbestimmung —
 * fällt er beim Umbau der Startseite heraus, verkauft das Produkt sich
 * ohne seine eigene Abgrenzung.
 */
test('Produktseite trägt die Negativabgrenzung und bindet sie an den DiPA-Schalter', () => {
  const text = readFileSync(join(WURZEL, 'app/pflegecoach/start/page.tsx'), 'utf8')
  assert.match(text, /kein medizinisches Produkt/i, 'MDR-Abgrenzung fehlt auf der Produktseite')
  assert.match(text, /keine Kassenleistung/i, 'Selbstzahler-Abgrenzung fehlt auf der Produktseite')
  assert.match(
    text, /useDipaModus\(\)/,
    'Die Kassen-Abgrenzung muss an COACH_DIPA_MODUS gebunden sein — hartkodiert wäre sie ' +
    'in einem tatsächlichen DiPA-Verfahren falsch'
  )
})

/**
 * Die Anfrage ist ein vorvertraglicher Kontakt, kein Produktvorgang. Sie
 * darf deshalb keinen Datensatz anlegen — sonst entstünde ein Nutzer, der
 * nie eingewilligt hat.
 */
test('Anfrage-Route schreibt nichts in den Produktdatenbestand', () => {
  const text = readFileSync(join(WURZEL, 'app/api/coach/anfrage/route.ts'), 'utf8')
  for (const verboten of [/supabase/i, /from\(['"]coach_/]) {
    assert.ok(
      !verboten.test(text),
      `Anfrage-Route greift auf die Datenbank zu (${verboten}) — sie darf nur eine E-Mail senden`
    )
  }
})

// ── 2. DiPA-Oberflächen sind an die Schalter gebunden ──────────

const GEGATETE_QUELLEN: Array<{ datei: string; muss: RegExp[] }> = [
  {
    datei: 'app/pflegecoach/anspruch/page.tsx',
    muss: [/dipaModus\(\)/, /redirect\('\/pflegecoach'\)/],
  },
  {
    datei: 'app/api/coach/anspruch/route.ts',
    muss: [/dipaModus\(\)/],
  },
  {
    datei: 'app/pflegecoach/freischaltung/page.tsx',
    muss: [/dipaModus\(\)/, /freischaltungPflicht\(\)/, /redirect\('\/pflegecoach'\)/],
  },
  {
    datei: 'app/api/coach/freischaltung/route.ts',
    muss: [/dipaModus\(\)/, /freischaltungPflicht\(\)/],
  },
]

test('DiPA-spezifische Seiten und Routen sind an die Schalter gebunden', () => {
  for (const { datei, muss } of GEGATETE_QUELLEN) {
    const text = readFileSync(join(WURZEL, datei), 'utf8')
    for (const muster of muss) {
      assert.ok(muster.test(text), `${datei}: erwartetes Gate ${muster} fehlt`)
    }
  }
})

test('Anspruchs-Route antwortet ohne DiPA-Modus mit 404 in jedem Handler', () => {
  const text = readFileSync(join(WURZEL, 'app/api/coach/anspruch/route.ts'), 'utf8')
  const handler = text.split(/export async function /).slice(1)
  assert.ok(handler.length >= 2, 'Es werden mindestens GET und POST erwartet')
  for (const block of handler) {
    const name = block.slice(0, block.indexOf('('))
    assert.match(block, /if \(!dipaModus\(\)\)/, `Handler ${name} ohne dipaModus()-Prüfung`)
    assert.match(block, /status: 404/, `Handler ${name} verrät die Existenz statt 404 zu liefern`)
  }
})

// ── 3. Schreibende Coach-APIs prüfen die Einwilligung ──────────

const SCHREIB_METHODEN = ['POST', 'PATCH', 'PUT', 'DELETE']

/**
 * Bewusste Ausnahmen. Jede Zeile muss begründet sein — wer eine neue
 * Ausnahme einträgt, trifft eine datenschutzrechtliche Entscheidung.
 */
const OHNE_EINWILLIGUNGSPRUEFUNG: Record<string, string> = {
  'app/api/coach/profil/route.ts:POST':
    'Legt das Profil an — die Einwilligung entsteht erst im selben Onboarding-Schritt danach.',
  'app/api/coach/profil/route.ts:PATCH':
    'Nur Darstellung (Schriftgrad, Kontrast) und Abschluss-Vermerk. Barrierefreiheit muss auch nach einem Widerruf einstellbar bleiben.',
  'app/api/coach/consents/route.ts:POST':
    'Erteilt und widerruft die Einwilligung selbst — eine Prüfung würde den Wiedereinstieg blockieren.',
  'app/api/coach/loeschung/route.ts:DELETE':
    'Art. 17 DSGVO: Löschen muss gerade nach dem Widerruf möglich sein.',
  'app/api/coach/freischaltung/route.ts:POST':
    'Zugangsverwaltung, keine Gesundheitsdaten; läuft bewusst im Systemkontext.',
  'app/api/coach/nutzung/route.ts:POST':
    'Eigenes, strengeres Tor (Deployment-Schalter + gesonderte Einwilligung) und bewusst nicht blockierend.',
  'app/api/coach/anfrage/route.ts:POST':
    'Vorvertragliche Kontaktanfrage ohne Anmeldung: verarbeitet ausschließlich Kontaktdaten ' +
    '(Art. 6 Abs. 1 lit. b DSGVO), keine Gesundheitsdaten, und schreibt nichts in den ' +
    'Produktdatenbestand — es gibt hier noch keinen Nutzer, der einwilligen könnte.',
}

test('jede schreibende Coach-Route prüft die Pflicht-Einwilligung', () => {
  const luecken: string[] = []
  for (const pfad of dateienUnter(COACH_API, ['route.ts'])) {
    const text = readFileSync(pfad, 'utf8')
    for (const block of text.split(/export async function /).slice(1)) {
      const name = block.slice(0, block.indexOf('('))
      if (!SCHREIB_METHODEN.includes(name)) continue
      const schluessel = `${relativ(pfad)}:${name}`
      if (schluessel in OHNE_EINWILLIGUNGSPRUEFUNG) continue
      if (!/requireCoachUser\(\{[^}]*schreibzugriff:\s*true/.test(block)) {
        luecken.push(schluessel)
      }
    }
  }
  assert.deepEqual(
    luecken, [],
    'Schreibroute ohne Einwilligungsprüfung (requireCoachUser({ schreibzugriff: true })) — ' +
    `oder mit Begründung in OHNE_EINWILLIGUNGSPRUEFUNG eintragen:\n${luecken.join('\n')}`
  )
})

test('die Ausnahmeliste enthält keine verwaisten Einträge', () => {
  // Verhindert, dass eine Ausnahme stehen bleibt, nachdem die Route
  // umbenannt oder entfernt wurde — sonst deckt sie irgendwann etwas ab,
  // das niemand mehr geprüft hat.
  for (const schluessel of Object.keys(OHNE_EINWILLIGUNGSPRUEFUNG)) {
    const [datei, methode] = schluessel.split(':')
    const text = readFileSync(join(WURZEL, datei), 'utf8')
    assert.ok(
      text.includes(`export async function ${methode}`),
      `Ausnahme ${schluessel} zeigt auf einen Handler, den es nicht (mehr) gibt`
    )
  }
})
