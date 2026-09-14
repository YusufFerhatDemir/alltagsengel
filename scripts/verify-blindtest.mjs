#!/usr/bin/env node
/**
 * verify-blindtest.mjs
 * --------------------
 * Prueft die Pruefer: welcher Lauf meldet gruen, ohne gemessen zu haben?
 *
 * BEFUND (Block 50, 14.09.2026)
 *
 * `public._run_sql` gibt seinen Messwert per `RAISE EXCEPTION` zurueck.
 * PostgREST liefert das als `{"code":"P0001","message":"<Messwert>"}` —
 * ein FEHLER sieht fast genauso aus: `{"message":"Invalid API key"}`.
 * Beide tragen `message`. 43 von 45 Prueflaeufen lasen nur `message` und
 * konnten beides nicht unterscheiden.
 *
 * Dazu kommt die zweite Form: eine NEGATIVE Sicherheitspruefung
 * (`status >= 400` heisst „anon wurde abgewiesen") trifft auch bei
 * HTTP 401 zu. Mit einem kaputten Schluessel meldet sie „abgewiesen" und
 * faerbt sich gruen, ohne je einen Riegel geprueft zu haben.
 *
 * Gemessen: VIER Laeufe bestanden mit absichtlich verfaelschten
 * Schluesseln — darunter `verify-security-p0.mjs`, der in den Notizen als
 * „9/9 gruen" gefuehrt wurde, und der in Block 47 von mir selbst gebaute
 * `verify-migrationsstand.ts`.
 *
 * SO ARBEITET DIESER LAUF
 * Er startet jeden Prueflauf, der das Lese-Orakel benutzt, mit
 * ABSICHTLICH KAPUTTEN Schluesseln — oeffentlich wie geheim. Wer dann
 * noch exit 0 meldet, hat nichts gemessen und sagt es nicht.
 *
 * Er schreibt NICHTS und erreicht die Datenbank nicht: die Schluessel
 * sind ungueltig, jede Anfrage endet mit 401.
 *
 * EXIT: 0 wenn kein Lauf blind ist, 1 sonst.
 *
 * Aufruf:  npm run verify:blindtest
 */
import { spawn, execSync } from 'node:child_process'

/**
 * Nur Laeufe, die das Lese-Orakel benutzen — nur die koennen so blind sein.
 *
 * Gesucht wird BEIDES: der rohe Aufruf `_run_sql` und der Helfer
 * `frageOrakel`. Ein erster Entwurf suchte nur das Literal — und uebersah
 * damit ausgerechnet die Skripte, die es richtig machen und ueber
 * lib/lese-orakel.mjs gehen. Ein Detektor, der die gute Form nicht kennt,
 * schrumpft mit jeder Verbesserung.
 */
const dateien = execSync(
  "grep -lE '_run_sql|frageOrakel' scripts/verify-* 2>/dev/null | sort", { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)
  .filter(d => !d.endsWith('verify-blindtest.mjs'))

// BEWUSST OHNE Schluessel-Praefix. Ein Platzhalter `sb_secret_…` sah fuer
// den Precommit-Guard aus wie ein echter Schluessel und blockierte den
// Commit — zu Recht. Der Blindtest braucht das Format nicht: er braucht
// einen Wert, den PostgREST ABWEIST, und das tut jeder unbrauchbare.
const KAPUTT_GEHEIM = 'UNGUELTIG-FUER-DEN-BLINDTEST-geheim'
const KAPUTT_OEFFENTLICH = 'UNGUELTIG-FUER-DEN-BLINDTEST-oeffentlich'

const umgebung = {
  ...process.env,
  SUPABASE_SECRET_KEY: KAPUTT_GEHEIM,
  SUPABASE_SERVICE_ROLE_KEY: KAPUTT_GEHEIM,
  // Auch den oeffentlichen: sonst besteht jede „anon darf das nicht"-
  // Pruefung weiterhin trivial, und der Blindtest waere selbst blind.
  NEXT_PUBLIC_SUPABASE_ANON_KEY: KAPUTT_OEFFENTLICH,
  SUPABASE_PUBLISHABLE_KEY: KAPUTT_OEFFENTLICH,
}

const GRENZE_MS = 60_000

function lauf(datei) {
  return new Promise(fertig => {
    const istTs = datei.endsWith('.ts')
    const kind = spawn(istTs ? 'npx' : 'node', istTs ? ['tsx', datei] : [datei], {
      env: umgebung, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let aus = ''
    kind.stdout.on('data', d => { aus += d })
    kind.stderr.on('data', d => { aus += d })
    const uhr = setTimeout(() => { kind.kill('SIGKILL'); fertig({ code: 'ZEIT', aus }) }, GRENZE_MS)
    kind.on('close', code => { clearTimeout(uhr); fertig({ code, aus }) })
    kind.on('error', err => { clearTimeout(uhr); fertig({ code: 'START', aus: String(err) }) })
  })
}

console.log('Blindtest: jeder Prueflauf mit absichtlich kaputten Schluesseln.')
console.log('Wer jetzt exit 0 meldet, hat nichts gemessen.\n')

const blind = [], sehend = [], unklar = []
for (const d of dateien) {
  const name = d.replace('scripts/', '')
  const r = await lauf(d)
  if (r.code === 0) { blind.push(name); console.log(`✗ BLIND   ${name}`) }
  else if (r.code === 'ZEIT' || r.code === 'START') { unklar.push(name); console.log(`?  ${r.code}    ${name}`) }
  else { sehend.push(name); console.log(`✓ sehend  ${name} (exit ${r.code})`) }
}

console.log(`\nsehend: ${sehend.length} | BLIND: ${blind.length} | unklar: ${unklar.length}`)

if (unklar.length > 0) {
  console.log('\nUNKLAR — weder bestanden noch widerlegt (Zeitgrenze oder Startfehler):')
  for (const n of unklar) console.log(`  ${n}`)
}
if (blind.length > 0) {
  console.log('\nBLIND — melden gruen, ohne gemessen zu haben:')
  for (const n of blind) console.log(`  ${n}`)
  console.log(
    '\nDer uebliche Fehler ist, nur `message` aus der Orakel-Antwort zu lesen.'
    + '\nRichtig ist `frageOrakel()` aus scripts/lib/lese-orakel.mjs — sie verlangt'
    + '\n`code === \'P0001\'`, den Beweis, dass der DO-Block gelaufen ist.'
    + '\nBei Verweigerungs-Feststellungen zusaetzlich `pruefeAnonErreichbar()`.',
  )
}

// `unklar` faerbt NICHT rot: eine Zeitgrenze ist eine Aussage ueber diesen
// Rechner, nicht ueber den Prueflauf. Sie steht oben, damit sie niemand
// uebersieht.
process.exit(blind.length === 0 ? 0 : 1)
