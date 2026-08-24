// ═══════════════════════════════════════════════════════════════════════════
// ENV-PRÜFUNG — liest Vorhandensein, nie Werte
//
// Diese Datei ist der einzige Ort, der `process.env` gegen das Verzeichnis in
// register.ts hält. Sie gibt ausschließlich NAMEN aus, niemals Werte: eine
// Fehlermeldung landet im Vercel-Log, und ein Log ist kein Tresor.
//
// FAIL-FAST, ABER NICHT BLIND (siehe `pruefeEnvBeimStart`):
// Es gibt zwei Klassen von Fehlern, und sie verdienen unterschiedliche
// Reaktionen.
//   • Die Anwendung KANN NICHT laufen (Datenbank-Trio fehlt) oder sie läuft
//     UNSICHER (ein Geheimnis steht unter einem `NEXT_PUBLIC_`-Namen und
//     landet damit im Browser-Bundle) → Start abbrechen.
//   • Eine Funktion fehlt (kein Mailversand, keine Cron-Auslösung) → laut
//     protokollieren, aber die Seite nicht abschalten. Eine Produktionsseite
//     wegen einer fehlenden Marketing-Variable herunterzufahren wäre ein
//     größerer Schaden als der, den es verhindert.
// Beides ist Absicht und nicht „halbes Fail-Fast".
// ═══════════════════════════════════════════════════════════════════════════

import { ENV_REGISTER, type EnvEintrag } from './register'

export type EnvQuelle = Record<string, string | undefined>

export interface FehlendeVariable {
  /** Der Haupt-Name. */
  name: string
  /** Alle akzeptierten Namen, inkl. Alternativen — für die Fehlermeldung. */
  akzeptiert: readonly string[]
  wann: EnvEintrag['wann']
  beschreibung: string
}

export interface EnvBefund {
  /** Keine Pflichtlücke im geprüften Geltungsbereich und kein Leck. */
  ok: boolean
  /** Pflichtvariablen, die im geprüften Geltungsbereich fehlen. */
  fehlendePflicht: FehlendeVariable[]
  /**
   * Geheimnisse, die unter einem `NEXT_PUBLIC_`-Namen gesetzt sind. Next.js
   * ersetzt solche Namen zur Build-Zeit textuell im Browser-Bundle — der Wert
   * steht dann im ausgelieferten JavaScript. Immer ein Abbruchgrund.
   */
  lecks: string[]
  /** Alles, was auffällt, aber nicht blockiert. */
  warnungen: string[]
  /** Wurde gegen den Produktions-Geltungsbereich geprüft? */
  produktion: boolean
}

const CLIENT_PRAEFIX = 'NEXT_PUBLIC_'

/**
 * Namensbestandteile, die auf ein Geheimnis hindeuten. Bewusst grob: die
 * Prüfung soll auch eine Variable fangen, die noch niemand ins Verzeichnis
 * eingetragen hat — genau der Fall, in dem ein Leck unbemerkt entsteht.
 */
const GEHEIM_MUSTER = /(SECRET|SERVICE_ROLE|PRIVATE|PASSWOR|PEPPER|CREDENTIAL|API_KEY|ACCESS_TOKEN|AUTH_TOKEN)/

/** Alle Namen, unter denen ein Eintrag gesetzt sein darf. */
export function akzeptierteNamen(eintrag: EnvEintrag): readonly string[] {
  return [eintrag.name, ...(eintrag.alternativen ?? [])]
}

/** Ist der Eintrag unter irgendeinem seiner Namen mit nicht-leerem Wert gesetzt? */
export function istGesetzt(eintrag: EnvEintrag, quelle: EnvQuelle): boolean {
  return akzeptierteNamen(eintrag).some((n) => (quelle[n] ?? '').trim() !== '')
}

/**
 * Läuft dieser Prozess im Produktivbetrieb?
 *
 * `VERCEL_ENV` ist die verlässliche Quelle: `NODE_ENV` steht auch beim
 * `next build` im CI auf 'production', und dort sind die Betriebsgeheimnisse
 * absichtlich nicht gesetzt (nur Platzhalter, siehe .github/workflows/ci.yml).
 * Würde man auf NODE_ENV prüfen, wäre jeder CI-Build rot.
 */
export function istProduktionslauf(quelle: EnvQuelle = process.env): boolean {
  if (quelle.VERCEL_ENV) return quelle.VERCEL_ENV === 'production'
  return quelle.NODE_ENV === 'production' && !quelle.CI
}

/**
 * Läuft gerade ein Next.js-Build (statt eines Servers)?
 *
 * Zur Build-Zeit gelten die Laufzeit-Pflichten nicht: der Build erzeugt
 * Seiten, er verschickt keine Mails und löst keine Crons aus.
 */
export function istBuildLauf(quelle: EnvQuelle = process.env): boolean {
  return quelle.NEXT_PHASE === 'phase-production-build'
}

/**
 * Geheimnisse, die im Browser-Bundle landen würden.
 *
 * Zwei Wege, denselben Fehler zu finden:
 *   1. Für jeden als geheim verzeichneten Eintrag: steht derselbe Name
 *      zusätzlich mit `NEXT_PUBLIC_`-Präfix in der Umgebung?
 *   2. Umgekehrt: trägt irgendein gesetzter `NEXT_PUBLIC_*`-Name ein
 *      Geheimnis-Muster, ohne im Verzeichnis als Client-Variable zu stehen?
 * Der zweite Weg findet auch, was niemand eingetragen hat.
 */
export function findeGeheimnisLecks(quelle: EnvQuelle = process.env): string[] {
  const lecks = new Set<string>()

  for (const eintrag of ENV_REGISTER) {
    if (!eintrag.geheim) continue
    for (const name of akzeptierteNamen(eintrag)) {
      const oeffentlich = name.startsWith(CLIENT_PRAEFIX) ? name : CLIENT_PRAEFIX + name
      if ((quelle[oeffentlich] ?? '').trim() !== '') lecks.add(oeffentlich)
    }
  }

  const erlaubt = new Set<string>()
  for (const eintrag of ENV_REGISTER) {
    if (eintrag.geheim) continue
    for (const name of akzeptierteNamen(eintrag)) erlaubt.add(name)
  }

  for (const [name, wert] of Object.entries(quelle)) {
    if (!name.startsWith(CLIENT_PRAEFIX)) continue
    if ((wert ?? '').trim() === '') continue
    if (erlaubt.has(name)) continue
    if (GEHEIM_MUSTER.test(name)) lecks.add(name)
  }

  return [...lecks].sort()
}

/**
 * Vollständiger Befund.
 *
 * `produktion` steuert nur, ob die Einträge mit `wann: 'produktion'`
 * mitgeprüft werden. Die Einträge mit `wann: 'immer'` gelten überall,
 * die mit `wann: 'entwicklung'` nie — sie werden stattdessen zur Warnung,
 * sobald sie im Produktivbetrieb auftauchen.
 */
export function pruefeEnv(
  quelle: EnvQuelle = process.env,
  optionen: { produktion?: boolean } = {},
): EnvBefund {
  const produktion = optionen.produktion ?? istProduktionslauf(quelle)
  const fehlendePflicht: FehlendeVariable[] = []
  const warnungen: string[] = []

  for (const eintrag of ENV_REGISTER) {
    // Präfix-Einträge haben keinen festen Namen — es ist nicht bekannt, wie
    // viele Datenannahmestellen es gibt. Nichts zu prüfen.
    if (eintrag.praefix) continue

    const gesetzt = istGesetzt(eintrag, quelle)

    if (eintrag.notwendigkeit === 'pflicht') {
      const giltJetzt = eintrag.wann === 'immer' || (eintrag.wann === 'produktion' && produktion)
      if (giltJetzt && !gesetzt) {
        fehlendePflicht.push({
          name: eintrag.name,
          akzeptiert: akzeptierteNamen(eintrag),
          wann: eintrag.wann,
          beschreibung: eintrag.beschreibung,
        })
      }
    }

    // Eine reine Entwicklungs-Variable in Produktion ist immer ein Fehler in
    // der Konfiguration — DISABLE_RATE_LIMIT_FOR_E2E dort gesetzt hebt die
    // Ratenbegrenzung für die echte Welt auf.
    if (eintrag.wann === 'entwicklung' && produktion && gesetzt) {
      warnungen.push(
        `${eintrag.name} ist im Produktivbetrieb gesetzt, gehört aber nur in Entwicklung/Test.`,
      )
    }
  }

  const lecks = findeGeheimnisLecks(quelle)

  return {
    ok: fehlendePflicht.length === 0 && lecks.length === 0,
    fehlendePflicht,
    lecks,
    warnungen,
    produktion,
  }
}

/** Mehrzeiliger Bericht — enthält ausschließlich Namen, nie Werte. */
export function befundText(befund: EnvBefund): string {
  const zeilen: string[] = []

  if (befund.lecks.length) {
    zeilen.push('SICHERHEIT — Geheimnis unter öffentlichem Namen (landet im Browser-Bundle):')
    for (const name of befund.lecks) zeilen.push(`  • ${name}`)
  }

  if (befund.fehlendePflicht.length) {
    zeilen.push(
      `Fehlende Pflicht-Umgebungsvariablen (${befund.produktion ? 'Produktivbetrieb' : 'alle Umgebungen'}):`,
    )
    for (const f of befund.fehlendePflicht) {
      const namen = f.akzeptiert.length > 1 ? f.akzeptiert.join(' oder ') : f.name
      zeilen.push(`  • ${namen} — ${f.beschreibung}`)
    }
  }

  for (const w of befund.warnungen) zeilen.push(`Warnung: ${w}`)

  return zeilen.join('\n')
}

/**
 * Was muss den Start abbrechen?
 *
 * Nur das, was die Anwendung unbrauchbar oder unsicher macht:
 *   • ein Leck (Geheimnis im Browser-Bundle),
 *   • eine fehlende Pflichtvariable mit `wann: 'immer'` — das ist genau das
 *     Datenbank-Trio, ohne das keine einzige Anfrage beantwortet werden kann.
 * Fehlende Produktions-Pflichten (Mailversand, Cron-Token) werden laut
 * protokolliert, brechen aber nicht ab — siehe Kopf dieser Datei.
 */
export function abbruchGruende(befund: EnvBefund): string[] {
  const gruende: string[] = []
  for (const name of befund.lecks) {
    gruende.push(`${name}: Geheimnis unter öffentlichem Namen — würde im Browser-Bundle ausgeliefert.`)
  }
  for (const f of befund.fehlendePflicht) {
    if (f.wann !== 'immer') continue
    const namen = f.akzeptiert.length > 1 ? f.akzeptiert.join(' oder ') : f.name
    gruende.push(`${namen} fehlt — ${f.beschreibung}`)
  }
  return gruende
}

/**
 * Start-Prüfung. Wird aus instrumentation.ts aufgerufen.
 *
 * Gibt den Befund zurück, damit Tests ihn auswerten können; wirft, wenn
 * `abbruchGruende()` etwas findet. Während eines Builds wird nur gelesen und
 * protokolliert — ein Build hat keine Laufzeit-Geheimnisse und darf an ihrem
 * Fehlen nicht scheitern.
 */
export function pruefeEnvBeimStart(
  quelle: EnvQuelle = process.env,
  protokoll: Pick<Console, 'error' | 'warn'> = console,
): EnvBefund {
  const befund = pruefeEnv(quelle)
  const text = befundText(befund)

  if (istBuildLauf(quelle)) {
    if (text) protokoll.warn(`[env] Build-Lauf — nur Hinweis:\n${text}`)
    return befund
  }

  if (befund.lecks.length || befund.fehlendePflicht.length) protokoll.error(`[env]\n${text}`)
  else if (befund.warnungen.length) protokoll.warn(`[env]\n${text}`)

  const gruende = abbruchGruende(befund)
  if (gruende.length) {
    throw new Error(
      'Start abgebrochen — Umgebung unvollständig oder unsicher:\n' +
        gruende.map((g) => `  • ${g}`).join('\n'),
    )
  }

  return befund
}
