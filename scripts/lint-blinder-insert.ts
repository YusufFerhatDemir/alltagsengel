/**
 * lint-blinder-insert — findet INSERT/UPSERT, deren Ergebnis niemand ansieht
 *
 * ── DAS MUSTER ────────────────────────────────────────────────────────
 * PostgREST wirft nicht. Ein abgewiesener INSERT — RLS, CHECK,
 * Fremdschluessel, UNIQUE, Ausfall — kommt als `error` IM ERGEBNIS
 * zurueck. Wer das Ergebnis gar nicht erst bindet, kann ihn nicht sehen:
 *
 *     await supabase.from('klaerfaelle').insert({ … })
 *     klaerfaelle++                                  // ← zaehlt ins Leere
 *
 * Ein `try/catch` darum faengt nichts: es wird nichts geworfen.
 *
 * Gefunden wurde das Muster in den Bloecken 96 bis 98 dreimal mit echter
 * Folge: der Klaerfall des CAMT-Imports, den es nicht gab, aber gezaehlt
 * wurde; der Storno ohne seinen Unveraenderlichkeits-Beleg; die
 * Gutschrift ohne Pruefsumme. In allen drei Faellen stand der richtige
 * Umgang bereits einige Zeilen entfernt in derselben Datei.
 *
 * ── SCHWESTERPRUEFUNG ─────────────────────────────────────────────────
 * `lint-stilles-update` prueft die andere Haelfte: UPDATE/DELETE, die bei
 * NULL getroffenen Zeilen „Erfolg" melden. Beide zusammen decken die
 * Frage ab „wurde wirklich geschrieben?".
 *
 * ── WAS ALS BEHOBEN GILT ──────────────────────────────────────────────
 * Das Ergebnis wird gebunden — `const { error } = await …` oder
 * `const x = await …`. OB der Aufrufer es dann auswertet, sieht dieses
 * Skript nicht; dafuer sind die Tests da. Es findet die Faelle, in denen
 * es gar nicht erst moeglich ist.
 *
 *     npm run lint:blinder-insert
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const REPO = process.cwd()

/**
 * `lib` UND `app`.
 *
 * Anders als bei `lint-stilles-update` ist die Begrenzung auf Server
 * Actions hier falsch: „null getroffene Zeilen" ist in einem Stapellauf
 * ein zulaessiges Ergebnis, ein ABGEWIESENER Insert nie. Die drei
 * Befunde aus den Bloecken 96 bis 98 lagen denn auch alle in `lib/`.
 */
const WURZELN = ['lib', 'app']
const ENDUNGEN = ['.ts', '.tsx']

/** Verzeichnisse, die kein Anwendungscode sind. */
const AUS = new Set(['node_modules', '.next', 'dist', 'build', '__tests__', '__mocks__', 'out'])

export interface Befund {
  datei: string
  zeile: number
  tabelle: string
  operation: string
  ausschnitt: string
}

function dateien(verzeichnis: string, raus: string[] = []): string[] {
  let eintraege: string[]
  try {
    eintraege = readdirSync(verzeichnis)
  } catch {
    return raus
  }
  for (const e of eintraege) {
    if (AUS.has(e)) continue
    const p = join(verzeichnis, e)
    if (statSync(p).isDirectory()) dateien(p, raus)
    else if (ENDUNGEN.some(x => e.endsWith(x)) && !e.includes('.test.')) raus.push(p)
  }
  return raus
}

/**
 * Ein `await` am ANWEISUNGSANFANG — das Ergebnis wird nirgends gebunden.
 *
 * Absichtlich an der Zeilenform festgemacht statt an einem Parser: ein
 * `const { error } = await supabase…` traegt das `await` mitten in der
 * Zeile, ein blindes `await supabase…` steht allein am Zeilenanfang
 * (nach Einrueckung). Dieselbe Unterscheidung nimmt ein Leser vor.
 *
 * `return await`, `void await` und `] = await` gelten NICHT als blind:
 * dort geht das Ergebnis irgendwohin.
 */
export function istBlind(text: string, awaitIndex: number): boolean {
  const zeilenAnfang = text.lastIndexOf('\n', awaitIndex) + 1
  const davor = text.slice(zeilenAnfang, awaitIndex)
  return /^[ \t]*$/.test(davor)
}

/**
 * Nimmt die Kette ab dem `await` bis zum Ende des Ausdrucks.
 * Wie in lint-stilles-update: grob, aber ausreichend.
 */
export function kette(text: string, start: number): string {
  const stueck = text.slice(start, Math.min(text.length, start + 1200))
  const ende = stueck.indexOf('\n\n')
  return ende > 0 ? stueck.slice(0, ende) : stueck
}

export function pruefeQuelle(text: string, datei: string): Befund[] {
  const befunde: Befund[] = []
  const muster = /\bawait\b/g
  let m: RegExpExecArray | null

  while ((m = muster.exec(text)) !== null) {
    if (!istBlind(text, m.index)) continue
    const k = kette(text, m.index)
    // Der Ausdruck muss unmittelbar ein Supabase-Zugriff sein — ein
    // `await irgendeineFunktion(...)`, die intern schreibt, ist hier
    // nicht gemeint (die hat ihre eigene Rueckgabe).
    const tab = /^await\s+[\w.]+\s*\n?\s*\.from\(\s*['"`]([A-Za-z0-9_]+)['"`]\s*\)/.exec(k)
    if (!tab) continue
    const schreibt = /\.(insert|upsert)\s*\(/.exec(k)
    if (!schreibt) continue

    befunde.push({
      datei,
      zeile: text.slice(0, m.index).split('\n').length,
      tabelle: tab[1],
      operation: schreibt[1],
      ausschnitt: k.split('\n').slice(0, 2).map(z => z.trim()).join(' ').slice(0, 100),
    })
  }
  return befunde
}

export function pruefe(datei: string): Befund[] {
  return pruefeQuelle(readFileSync(datei, 'utf8'), relative(REPO, datei))
}

/**
 * Bestand vom 14.09.2026 — 24 Stellen.
 *
 * ── WAS DIESE LISTE IST UND WAS NICHT ─────────────────────────────────
 * Sie ist KEINE Freigabe. Keiner dieser Schreibwege prueft sein Ergebnis;
 * sie sind eingefroren, damit die Zahl nur noch sinken kann und NEUE
 * Faelle den Lauf rot machen. Wer einen davon anfasst, bindet das
 * Ergebnis, wertet es aus und nimmt die Zeile hier heraus.
 *
 * Dass die Liste so lang ist, ist der Befund — nicht ihr Inhalt. Sie
 * kommentarlos abzuarbeiten waere falsch: die meisten stehen in
 * FEHLERZWEIGEN, und dort ist „werfen" die falsche Antwort — ein Wurf
 * dort verdeckt die Ursache, die gerade protokolliert werden soll. Der
 * richtige Umgang ist derselbe wie bei den Ruecknahmen in
 * lib/billing/core/invoice-engine.ts: nicht werfen, aber auch nicht
 * schweigen. Das entscheidet man je Fall, nicht in einem Durchlauf.
 */
export const BESTAND: { datei: string; tabelle: string }[] = [
  // ── Pruef- und Fehlerprotokolle in FEHLERZWEIGEN ──────────────────
  // Diese Zeilen HALTEN FEST, dass etwas schiefging. Bleiben sie aus, ist
  // der Fehlschlag unsichtbar — aber ein Wurf an dieser Stelle verdeckt
  // den urspruenglichen Fehler. Sie brauchen den Umgang „Rest sichtbar
  // machen", nicht „abbrechen".
  { datei: 'lib/abrechnung/kassenabrechnung-engine.ts', tabelle: 'dta_validierungen' },
  { datei: 'lib/abrechnung/kassenabrechnung-engine.ts', tabelle: 'dta_lauf_rechnungen' },
  { datei: 'lib/abrechnung/kassenabrechnung-engine.ts', tabelle: 'dta_fehlerprotokoll' },
  { datei: 'lib/abrechnung/versand.ts', tabelle: 'dta_fehlerprotokoll' },
  { datei: 'lib/abrechnung/ruecklaeufer.ts', tabelle: 'dta_ruecklaeufer_positionen' },
  { datei: 'lib/abrechnung/betriebsmodus.ts', tabelle: 'abrechnung_betriebsmodus_historie' },

  // ── Pruefpfade ────────────────────────────────────────────────────
  // Ein Pruefeintrag, der nicht entsteht, ist eine Luecke in genau der
  // Spur, die spaeter belegen soll, was geschehen ist. mis_audit_log
  // traegt zusaetzlich einen CHECK auf `action` — ein neuer Wert laesst
  // den Insert lautlos scheitern (siehe die gleichnamige Notiz).
  { datei: 'lib/security/benachrichtigung.ts', tabelle: 'security_audit_log' },
  { datei: 'app/admin/monatsabschluss/[clientId]/actions.ts', tabelle: 'audit_logs' },
  { datei: 'app/api/admin/pricing/route.ts', tabelle: 'kf_pricing_audit' },
  { datei: 'app/api/cron/konto-loeschung/route.ts', tabelle: 'mis_audit_log' },
  { datei: 'app/mis/privacy/actions.ts', tabelle: 'mis_privacy_audit_log' },

  // ── DATEV-Export ──────────────────────────────────────────────────
  { datei: 'lib/billing/datev/export-service.ts', tabelle: 'datev_exports' },

  // ── Fachliche Nebenwege ───────────────────────────────────────────
  { datei: 'app/api/organizations/route.ts', tabelle: 'organization_subscriptions' },
  { datei: 'app/api/visitor-alert/route.ts', tabelle: 'notifications' },
  { datei: 'app/api/whatsapp/webhook/route.ts', tabelle: 'whatsapp_conversations' },

  // ── Reichweitenmessung ────────────────────────────────────────────
  // Hier ist fail-soft die richtige Richtung: eine verlorene Zaehlzeile
  // darf keine Seite und keinen Vorgang scheitern lassen. Sie bleiben
  // trotzdem in der Liste — „fail-soft" heisst nicht „unbeobachtbar",
  // und die Entscheidung gehoert an den Einzelfall.
  { datei: 'app/api/analytics/vitals/route.ts', tabelle: 'analytics_events' },
  { datei: 'app/api/track/route.ts', tabelle: 'visitors' },
  { datei: 'app/api/track/route.ts', tabelle: 'visitor_locations' },
  { datei: 'app/api/track-conversion/route.ts', tabelle: 'conversions' },
]

export function imBestand(b: Befund): boolean {
  return BESTAND.some(e => e.datei === b.datei && e.tabelle === b.tabelle)
}

/**
 * Eintraege, die keinen Befund mehr decken.
 *
 * Ohne diese Gegenprobe bliebe eine aufgeraeumte Stelle als offene Tuer
 * in der Liste stehen: ein Rueckfall in derselben Datei auf dieselbe
 * Tabelle waere „im Bestand" und kaeme durch. Dieselbe Regel wie in
 * lint-stilles-update und lint-leerzustand.
 */
export function veraltet(alle: Befund[]): typeof BESTAND {
  return BESTAND.filter(e => !alle.some(b => b.datei === e.datei && b.tabelle === e.tabelle))
}

function main() {
  const alle: Befund[] = []
  for (const w of WURZELN) {
    for (const d of dateien(join(REPO, w))) alle.push(...pruefe(d))
  }
  const neu = alle.filter(b => !imBestand(b))
  const tote = veraltet(alle)

  console.log('── INSERT/UPSERT ohne Blick aufs Ergebnis ──────────────────')
  console.log(`   geprüft:           ${WURZELN.join(', ')}/**/*.{ts,tsx}`)
  console.log(`   Treffer gesamt:    ${alle.length}`)
  console.log(`   im Bestand:        ${alle.length - neu.length}`)
  console.log(`   Ausnahmen:         ${BESTAND.length}${tote.length > 0 ? `, davon ${tote.length} veraltet` : ''}`)
  console.log('')

  if (tote.length > 0) {
    console.log(`❌ ${tote.length} Ausnahme(n) decken keinen Befund mehr:\n`)
    for (const e of tote) console.log(`   ${e.datei}  [insert auf ${e.tabelle}]`)
    console.log('')
    console.log('   Diese Zeilen gehören aus BESTAND heraus. Solange sie stehen, käme')
    console.log('   ein Rückfall in derselben Datei auf dieselbe Tabelle als „im')
    console.log('   Bestand" durch — die Ausnahme wäre dann eine offene Tür.')
    console.log('')
    process.exit(1)
  }

  if (neu.length === 0) {
    console.log('✓ Kein Befund.')
    return
  }

  console.log(`❌ ${neu.length} Schreibvorgang/-gänge ohne Blick aufs Ergebnis:\n`)
  for (const b of neu) {
    console.log(`   ${b.datei}:${b.zeile}  [${b.operation} auf ${b.tabelle}]`)
    console.log(`      ${b.ausschnitt}`)
  }
  console.log('')
  console.log('   Abhilfe: das Ergebnis binden — `const { data, error } = await …`')
  console.log('   mit `.select(\'id\')` — und auswerten. PostgREST WIRFT NICHT: ein')
  console.log('   abgewiesener INSERT kommt als `error` im Ergebnis zurück, und ein')
  console.log('   try/catch darum fängt nichts.')
  process.exit(1)
}

// Nur als Lauf, nicht beim Import aus einem Test.
if (process.argv[1] && process.argv[1].endsWith('lint-blinder-insert.ts')) main()
