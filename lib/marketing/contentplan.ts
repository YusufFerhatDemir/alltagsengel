import 'server-only'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * Liest die Contentpläne aus `docs/marketing/` und macht sie auswertbar.
 *
 * WARUM PARSEN UND NICHT ABTIPPEN
 * Die Pläne sind Markdown und werden dort gepflegt — von Menschen, nicht
 * von diesem Modul. Sie in TypeScript zu duplizieren hieße: zwei Quellen,
 * die auseinanderdriften. Wer dann einen Text im Plan ändert, wundert
 * sich, warum im Dashboard der alte steht.
 *
 * Gelesen wird deshalb direkt vom Dateisystem — deshalb `server-only`. Die
 * Pläne liegen im Repository und sind Teil des Deploys; die Admin-Seite
 * wird wie die übrigen statisch vorgerendert. Eine Änderung im Plan ist
 * also mit dem nächsten Deploy sichtbar, nicht binnen Sekunden — was
 * zusammenpasst, denn auch der geänderte Plan kommt über einen Commit.
 *
 * ── VIER PLÄNE, VIER FORMATE, EIN PARSER ──────────────────────────────
 * Die Pläne sind zu verschiedenen Zeiten entstanden und sehen verschieden
 * aus. Ein Parser je Datei wäre vier Stellen zum Veralten; stattdessen
 * werden Kopf und Felder in allen vorkommenden Schreibweisen gelesen:
 *
 *   ## Post 01 -- Titel            **Datum:** · **Kategorie:** · **Text:**
 *   ## Post 1 — Do 10.09.2026      **Thema:** · ### Text (copy-paste-fertig):
 *   ### Tag 3 — Fr 12.09. | REEL   **Thema:** · **Caption:** · **Bildidee:**
 *   ## Kampagne 1: Quereinsteiger  **Veroeffentlichungsdatum:** · ### Post-Text
 *
 * Ein Feld wird erst als `**Name:**`, dann als `### Name` gesucht; für
 * Titel, Datum, Kategorie, Text, Briefing und Hashtags gibt es Ketten
 * gleichwertiger Namen (siehe unten). Was in keinem Feld steht, wird aus
 * dem Abschnittskopf gelesen — dort stehen in drei der vier Pläne Datum
 * und Kategorie.
 *
 * ── DAS JAHR STEHT IM DATEINAMEN ──────────────────────────────────────
 * `### Tag 1 — Mi 10.09.` nennt kein Jahr. Ohne Jahr gibt es kein
 * sortierbares Datum und damit keine Wochenfrequenz — also wird das Jahr
 * aus dem Dateinamen ergänzt (`…_09_2026_V2.md`). Das ist eine Annahme,
 * aber eine belegte: der Plan trägt seinen Zeitraum im Namen. Fehlt dort
 * eine Jahreszahl, bleibt das Datum null statt geraten.
 *
 * Hashtags stehen teils in einem eigenen Feld, teils am Textende. Beides
 * wird gelesen und aus dem Text gelöst, damit er ohne sie kopierbar ist.
 *
 * Weicht ein Abschnitt von allem ab, wird er ÜBERSPRUNGEN und gezählt.
 * Ein halb erkannter Post wäre schlimmer als ein fehlender: er sähe
 * vollständig aus. Die Zahl steht im Dashboard.
 */

export interface ContentStueck {
  /** Stabiler Schlüssel: Datei + Postnummer. Überlebt Umsortieren. */
  id: string
  quelle: string
  nummer: string
  titel: string
  datum: string | null
  /** Nur das Datum, falls ablesbar — für Sortierung und Wochenbildung. */
  datumIso: string | null
  kategorie: string | null
  plattform: string | null
  zielgruppe: string | null
  text: string
  hashtags: string[]
  bildBriefing: string | null
  cta: string | null
  /** Aus Kategorie/Text abgeleitet, wo erkennbar. */
  region: string | null
  /**
   * Redaktionshinweis aus dem Plan — eine Bedingung fürs Posten, kein
   * Posttext. Im Plan kursiv gesetzt, z. B. der Einwilligungsvorbehalt bei
   * Kundenstimmen. Er darf nicht mitgepostet und nicht verschluckt werden.
   */
  hinweis: string | null
}

const PLAN_DATEIEN = [
  'CONTENTPLAN_30_TAGE_09_10_2026_V2.md',
  'CONTENTPLAN_14_TAGE_09_2026_V2.md',
  'RECRUITING_KAMPAGNEN_09_2026_V2.md',
  'SOCIAL_MEDIA_7_POSTS_09_2026.md',
]

/**
 * Abschnittskopf: Art, Nummer, Rest.
 *   `## Post 01 -- Was ist Alltagsbegleitung?`
 *   `### Tag 3 — Fr 12.09. | RECRUITING`
 *   `## Kampagne 1: Quereinsteiger Frankfurt & Offenbach`
 */
const KOPF_RE = /^#{2,3}\s+(Post|Tag|Kampagne)\s+(\d+)\s*(?::|--|—|–|-)\s*(.+)$/m
const TRENN_RE = /\n(?=#{2,3}\s+(?:Post|Tag|Kampagne)\s+\d)/

/** Feldnamen, die dasselbe bedeuten — erster Treffer gewinnt. */
const FELD_KETTEN = {
  titel: ['Thema'],
  datum: ['Datum', 'Veroeffentlichungsdatum', 'Veröffentlichungsdatum'],
  kategorie: ['Kategorie', 'Format', 'Typ'],
  text: ['Text', 'Post-Text', 'Caption'],
  briefing: ['Bild-/Video-Briefing', 'Bild-Briefing', 'Visual-Briefing', 'Bildidee', 'Konzept'],
  hashtags: ['Hashtags'],
} as const

const VERZEICHNIS = join(process.cwd(), 'docs', 'marketing')

/**
 * `10.09.2026 (Donnerstag)` → `2026-09-10`, `Mi 10.09.` → `2026-09-10`.
 *
 * Das Jahr im Text hat Vorrang; fehlt es, gilt `ersatzJahr` (aus dem
 * Dateinamen). Ohne beides: null — ein geratenes Jahr würde Stücke in die
 * falsche Kalenderwoche einsortieren und die Frequenzrechnung verfälschen.
 */
function datumIso(roh: string | null, ersatzJahr: string | null): string | null {
  if (!roh) return null
  const m = roh.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})?/)
  if (!m) return null
  const jahr = m[3] ?? ersatzJahr
  if (!jahr) return null
  return `${jahr}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** `CONTENTPLAN_14_TAGE_09_2026_V2.md` → `2026`. Ohne Jahreszahl: null. */
function jahrAusDateiname(dateiname: string): string | null {
  return dateiname.match(/(20\d{2})/)?.[1] ?? null
}

/** Städte, die eine eigene Landingpage haben — nur die gelten als Region. */
const REGIONEN = [
  'Frankfurt', 'Offenbach', 'Hanau', 'Maintal', 'Bad Homburg', 'Bad Vilbel',
  'Neu-Isenburg', 'Eschborn', 'Darmstadt', 'Wiesbaden', 'Mainz', 'Rodgau',
  'Main-Taunus', 'Rhein-Main',
]

function regionAus(text: string, titel: string): string | null {
  const heuhaufen = `${titel} ${text}`
  // Längster Treffer zuerst: „Bad Homburg" vor „Homburg", „Rhein-Main"
  // vor „Main" — sonst gewinnt die Teilzeichenkette.
  const treffer = REGIONEN
    .filter(r => heuhaufen.includes(r))
    .sort((a, b) => b.length - a.length)
  return treffer[0] ?? null
}

/**
 * Markdown-Rauschen abziehen, das nicht mitgepostet werden soll.
 *
 * Die Pläne setzen Posttexte teils in ein Blockquote (`> …`), um sie vom
 * Briefing abzugrenzen, und beenden Zeilen mit zwei Leerzeichen für den
 * Umbruch. Beides ist Auszeichnung der Plandatei, nicht Teil des Textes —
 * wer den Text kopiert, soll kein `>` in Instagram einfügen.
 *
 * Der Fettdruck bleibt: er markiert Betonung, über die die Redaktion
 * entscheidet, nicht die Struktur des Dokuments.
 */
function saubereZeilen(t: string): string {
  return t
    .split('\n')
    .map(z => z.replace(/^\s*>\s?/, '').replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Sonderzeichen entschärfen, damit Feldnamen wie `Bild-/Video-Briefing` tragen. */
function roh(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Liest ein Feld in beiden Schreibweisen.
 *
 * `**Name:** Wert` endet vor dem nächsten `**Feld:**` oder einer
 * `###`-Überschrift; `### Name:` endet vor der nächsten Überschrift. Ein
 * Klammerzusatz im Kopf (`### Text (copy-paste-fertig):`) wird geduldet —
 * er beschreibt den Inhalt, er ist nicht Teil des Namens.
 */
function feld(block: string, name: string): string | null {
  const n = roh(name)

  // ENDE ist überall `(?![\s\S])` und nie `$`: der zweite Ausdruck braucht
  // das m-Flag für `^`, und mit diesem Flag bedeutet `$` das ZEILENende.
  // Ein `$` hier hätte die träge Gruppe nach der ersten Textzeile beendet
  // — jedes mehrzeilige Feld wäre auf seinen Anfang gekürzt worden, ohne
  // dass es auffällt.
  const fett = block.match(new RegExp(
    `\\*\\*${n}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*[A-Za-zÄÖÜäöü/ .-]+:\\*\\*|\\n#{2,4}\\s|\\n---|(?![\\s\\S]))`,
  ))
  if (fett && fett[1].trim()) return saubereZeilen(fett[1])

  // `### Text (copy-paste-fertig):` und `### Text (Caption …` — der
  // Klammerzusatz beschreibt den Inhalt und darf auch unverschlossen sein.
  const ueberschrift = block.match(new RegExp(
    `^#{3,4}\\s+${n}\\s*(?:\\(.*?\\)?)?\\s*:?\\s*\\n([\\s\\S]*?)(?=\\n#{2,4}\\s|\\n---|(?![\\s\\S]))`,
    'm',
  ))
  if (ueberschrift && ueberschrift[1].trim()) return saubereZeilen(ueberschrift[1])

  return null
}

/** Erster Treffer aus einer Kette gleichwertiger Feldnamen. */
function erstesFeld(block: string, namen: readonly string[]): string | null {
  for (const name of namen) {
    const wert = feld(block, name)
    if (wert) return wert
  }
  return null
}

/**
 * Trennt kursive Einzelzeilen als Redaktionshinweis vom Posttext.
 *
 * Eine Zeile, die komplett in `*…*` steht, ist in diesen Plänen eine
 * Anweisung an die Redaktion, kein Satz für die Veröffentlichung. Im
 * 7-Posts-Plan ist es der Vorbehalt, dass die Kundenstimmen erfunden sind
 * und echte nur mit schriftlicher Einwilligung verwendet werden dürfen.
 *
 * Im Text stehen lassen hieße: er wird mitgepostet. Löschen hieße: niemand
 * liest die Bedingung. Also ein eigenes Feld.
 */
function hinweisTrennen(text: string): { text: string; hinweis: string | null } {
  const zeilen = text.split('\n')
  const hinweise: string[] = []
  const rest = zeilen.filter(z => {
    if (/^\*[^*].*\*$/.test(z.trim())) {
      hinweise.push(z.trim().replace(/^\*|\*$/g, '').trim())
      return false
    }
    return true
  })
  return {
    text: rest.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    hinweis: hinweise.length > 0 ? hinweise.join(' ') : null,
  }
}

/** Hashtags aus einem Textstück — in Reihenfolge, ohne Doppelte. */
function hashtagsAus(text: string): string[] {
  const treffer = text.match(/#[\wÄÖÜäöüß]+/g) ?? []
  return [...new Set(treffer)]
}

function parseDatei(dateiname: string): { stuecke: ContentStueck[]; uebersprungen: number } {
  const pfad = join(VERZEICHNIS, dateiname)
  if (!existsSync(pfad)) return { stuecke: [], uebersprungen: 0 }

  const inhalt = readFileSync(pfad, 'utf-8')
  const ersatzJahr = jahrAusDateiname(dateiname)
  const stuecke: ContentStueck[] = []
  let uebersprungen = 0

  for (const teil of inhalt.split(TRENN_RE)) {
    const kopf = teil.match(KOPF_RE)
    if (!kopf) continue

    const [, art, nummer, rest] = kopf

    // Der Kopf trägt in drei der vier Pläne mehr als einen Titel:
    // `Fr 12.09. | RECRUITING` ist Datum UND Kategorie.
    const [vorStrich, nachStrich] = rest.split('|').map(t => t.trim())

    const rohFeld = erstesFeld(teil, FELD_KETTEN.text)
    const { text: rohText, hinweis } = rohFeld
      ? hinweisTrennen(rohFeld)
      : { text: null as string | null, hinweis: null }
    if (!rohText) {
      // Kein Text = kein veröffentlichungsfertiges Stück. Das trifft die
      // Story-Abschnitte im 14-Tage-Plan: sie beschreiben eine Bildfolge,
      // keinen Beitrag.
      uebersprungen++
      continue
    }

    // Hashtags stehen entweder in einem eigenen Feld oder am Textende.
    // In beiden Fällen werden sie aus dem Text gelöst, damit er ohne sie
    // kopierbar ist und die Tags einzeln danebenstehen.
    const hashtagFeld = erstesFeld(teil, FELD_KETTEN.hashtags)
    const tagZeile = rohText.match(/(^|\n)(#[^\n]+)\s*$/)
    const hashtags = hashtagFeld
      ? hashtagsAus(hashtagFeld)
      : tagZeile ? hashtagsAus(tagZeile[2]) : []
    const text = !hashtagFeld && tagZeile
      ? rohText.slice(0, tagZeile.index).trim()
      : rohText

    const datum = erstesFeld(teil, FELD_KETTEN.datum) ?? vorStrich

    stuecke.push({
      id: `${dateiname}#${art}-${nummer}`,
      quelle: dateiname,
      nummer: `${art} ${nummer}`,
      // `**Thema:**` ist der sprechende Titel, wo er existiert; sonst der
      // Kopf ohne den Kategorie-Teil.
      titel: erstesFeld(teil, FELD_KETTEN.titel) ?? vorStrich,
      datum,
      datumIso: datumIso(datum, ersatzJahr),
      // Die Recruiting-Kampagnen nennen ihre Kategorie nicht — sie sind
      // eine. Das aus dem Kopf zu schließen ist keine Annahme, sondern
      // steht dort.
      kategorie: erstesFeld(teil, FELD_KETTEN.kategorie)
        ?? nachStrich
        ?? (art === 'Kampagne' ? 'Recruiting' : null),
      plattform: feld(teil, 'Plattform'),
      zielgruppe: feld(teil, 'Zielgruppe'),
      text,
      hashtags,
      bildBriefing: erstesFeld(teil, FELD_KETTEN.briefing),
      cta: feld(teil, 'CTA'),
      region: regionAus(text, vorStrich),
      hinweis,
    })
  }

  return { stuecke, uebersprungen }
}

export interface ContentKatalog {
  stuecke: ContentStueck[]
  /** Dateien, die gelesen wurden — für die Herkunftsangabe im Dashboard. */
  dateien: string[]
  /** Abschnitte, die nicht ins Format passten. Sichtbar machen, nicht verschweigen. */
  uebersprungen: number
}

export function ladeContentKatalog(): ContentKatalog {
  const stuecke: ContentStueck[] = []
  const dateien: string[] = []
  let uebersprungen = 0

  for (const datei of PLAN_DATEIEN) {
    const ergebnis = parseDatei(datei)
    if (ergebnis.stuecke.length > 0 || ergebnis.uebersprungen > 0) dateien.push(datei)
    stuecke.push(...ergebnis.stuecke)
    uebersprungen += ergebnis.uebersprungen
  }

  // Datierte zuerst, chronologisch; undatierte hinten.
  stuecke.sort((a, b) => {
    if (a.datumIso && b.datumIso) return a.datumIso.localeCompare(b.datumIso)
    if (a.datumIso) return -1
    if (b.datumIso) return 1
    return a.id.localeCompare(b.id)
  })

  return { stuecke, dateien, uebersprungen }
}

/** Kalenderwoche (Montag) als ISO-Datum — für die Frequenzrechnung. */
export function wochenStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export interface WochenFrequenz {
  woche: string
  anzahl: number
  /** Vorgabe aus dem Auftrag: mindestens fünf Veröffentlichungen je Woche. */
  erfuellt: boolean
}

export const ZIEL_PRO_WOCHE = 5

export function frequenzProWoche(stuecke: ContentStueck[]): WochenFrequenz[] {
  const m = new Map<string, number>()
  for (const s of stuecke) {
    if (!s.datumIso) continue
    const w = wochenStart(s.datumIso)
    m.set(w, (m.get(w) ?? 0) + 1)
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([woche, anzahl]) => ({ woche, anzahl, erfuellt: anzahl >= ZIEL_PRO_WOCHE }))
}
