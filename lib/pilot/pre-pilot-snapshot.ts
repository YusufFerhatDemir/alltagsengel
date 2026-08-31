// ═══════════════════════════════════════════════════════════════════════════
// PRE_PILOT_SNAPSHOT — der Zustand, gegen den der erste echte Geldvorgang läuft
//
// PROBLEM, DAS DIESE DATEI LÖST
// Vor dem ersten begleiteten Echtlauf muss beantwortet sein, GEGEN WAS er
// läuft: welcher Commit ist deployt, welche Datenbank hängt daran, welche
// Schalter stehen wie. Diese Angaben lagen bisher in einem Handoff-Dokument —
// also in Prosa, von Hand gepflegt, mit dem Stand von gestern. Ein Dokument
// kann nicht falsch werden; eine Messung schon, und genau das ist ihr Wert.
//
// ── DIE WICHTIGSTE UNTERSCHEIDUNG DIESER DATEI ─────────────────────────────
// Jeder Punkt trägt seine HERKUNFT:
//
//   'gemessen'      Zur Laufzeit gegen die echte Umgebung/Datenbank ermittelt.
//   'gemeldet'      Vom Aufrufer hereingereicht (Git, CI — dazu unten mehr).
//   'dokumentiert'  Ein belegter Wert aus einem Prüflauf, der hier nicht
//                   wiederholbar ist. Nie grün, immer mit Prüfbefehl.
//   'nicht_messbar' Es gibt keinen Wert. Nicht 0, nicht „ok".
//
// Ohne diese Unterscheidung sähe ein abgeschriebener Wert genauso aus wie ein
// gemessener, und der Snapshot wäre ein zweites Handoff-Dokument mit dem
// Anschein von Messung. Das wäre schlechter als gar keiner.
//
// ── WARUM GIT UND CI NICHT GEMESSEN WERDEN KÖNNEN ──────────────────────────
// Zur Laufzeit gibt es kein Arbeitsverzeichnis: `git rev-parse` läuft auf
// dem Rechner, der deployt hat, nicht in der Serverless-Funktion. Messbar ist
// genau EIN Git-Wert — `VERCEL_GIT_COMMIT_SHA`, der Commit, aus dem der
// laufende Code gebaut wurde. `origin/main` und der CI-Ausgang müssen von
// außen hereingereicht werden (`gemeldet`), und sie sind dann als solche
// gekennzeichnet.
//
// Der Vergleich der beiden ist trotzdem der wertvollste Punkt im ganzen
// Snapshot: weicht der laufende Commit von `origin/main` ab, beschreibt jede
// Aussage darunter einen anderen Stand als den, der gerade Post verschicken
// würde.
//
// ── DIESE DATEI SCHREIBT NICHTS ────────────────────────────────────────────
// Kein Insert, kein Update, kein Audit-Eintrag, keine Statusänderung. Sie ist
// beliebig oft aufrufbar. Ein Regressionstest hält das fest.
//
// ── FAIL-CLOSED ────────────────────────────────────────────────────────────
// Eine Messung, die scheitert, ergibt `null` und einen Hinweis — nie einen
// beruhigenden Ersatzwert. Die drei Zusicherungen am Ende (Rechnungsversand
// aus, Mahnversand aus, CAMT trocken) sind `boolean | null`; `null` heißt
// „nicht feststellbar" und zählt ausdrücklich NICHT als „aus".
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { versandFlagsStand } from '@/lib/config/versand-flags'
import { camtImportModus } from '@/lib/billing/camt/camt-modus'
import { istProduktionslauf, type EnvQuelle } from '@/lib/env/pruefung'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type SnapshotHerkunft = 'gemessen' | 'gemeldet' | 'dokumentiert' | 'nicht_messbar'

/**
 * Vier Zustände, nicht drei. `'ungeprueft'` ist kein Zwischenwert zwischen
 * gelb und rot, sondern eine andere Aussage: hier steht keine Zahl.
 */
export type SnapshotAmpel = 'gruen' | 'gelb' | 'rot' | 'ungeprueft'

export type SnapshotWert = string | number | boolean | null

export interface SnapshotPunkt {
  schluessel: string
  titel: string
  wert: SnapshotWert
  herkunft: SnapshotHerkunft
  ampel: SnapshotAmpel
  /** Ein Satz Klartext: was hier steht und was es bedeutet. */
  befund: string
}

export type AbschnittId =
  | 'code'
  | 'deployment'
  | 'datenbank'
  | 'migrationen'
  | 'sicherheit'
  | 'zustellung'
  | 'schalter'

export interface SnapshotAbschnitt {
  id: AbschnittId
  titel: string
  ampel: SnapshotAmpel
  punkte: SnapshotPunkt[]
}

/**
 * Die drei Zusicherungen des Auftrags, einzeln und maschinenlesbar.
 *
 * `null` ist ausdrücklich nicht `true`. Wer diesen Block auswertet, darf
 * `!== false` nie als „ist aus" lesen.
 */
export interface Zusicherungen {
  /** RECHNUNGSVERSAND_AUTOMATISCH wirkt NICHT. */
  rechnungsversandAus: boolean | null
  /** MAHNVERSAND_AUTOMATISCH wirkt NICHT. */
  mahnversandAus: boolean | null
  /** CAMT_IMPORT_MODE bucht NICHT. */
  camtTrocken: boolean | null
  /** Alle drei gemessen und erfüllt. */
  alleRuhend: boolean
}

/**
 * Gesamtzustand der Automatik.
 *
 * RUHEND     Kein Automat kann von selbst Geld bewegen oder Post verschicken.
 * SCHARF     Mindestens einer kann es.
 * UNGEPRUEFT Mindestens eine der drei Fragen ist nicht beantwortbar.
 *
 * Bewusst KEIN Wort wie „bereit" oder „freigegeben": der Snapshot misst, er
 * erlaubt nichts.
 */
export type PilotZustand = 'RUHEND' | 'SCHARF' | 'UNGEPRUEFT'

export interface PrePilotSnapshot {
  erstelltAm: string
  organizationId: string
  zustand: PilotZustand
  abschnitte: SnapshotAbschnitt[]
  zusicherungen: Zusicherungen
  /** Messungen, die technisch nicht ausgeführt werden konnten. */
  hinweise: string[]
  freigabeHinweis: string
}

/** Was der Aufrufer beisteuern kann, weil die Laufzeit es nicht weiß. */
export interface GemeldeterStand {
  /** `git rev-parse HEAD` auf dem Rechner, der deployt hat. */
  gitHead?: string
  /** `git rev-parse origin/main`. */
  originMain?: string
  ciStatus?: 'gruen' | 'rot' | 'unbekannt'
  /** Kennung des CI-Laufs, damit die Aussage nachschlagbar ist. */
  ciLauf?: string
}

export interface SnapshotEingaben {
  organizationId: string
  /** Umgebungsquelle. Injizierbar, damit jede Schalterlage testbar ist. */
  quelle?: EnvQuelle
  gemeldet?: GemeldeterStand
  /** Zeitstempel — injizierbar für reproduzierbare Tests. */
  jetzt?: Date
}

export const SNAPSHOT_FREIGABE_HINWEIS =
  'Dieser Snapshot ist eine Messung, keine Freigabe. Er stellt fest, wogegen ein '
  + 'Echtlauf liefe — er erlaubt keinen. Jede Geldaktion wird unabhängig davon im '
  + 'Backend geprüft (Preflight, Einmal-Freigabe, Festschreibung, Dublettensperre, '
  + 'Mandantenzaun).'

// ---------------------------------------------------------------------------
// Dokumentierte Werte
// ---------------------------------------------------------------------------

/**
 * Der Supabase-Projekt-Ref, gegen den der Pilot laufen soll.
 *
 * Kein Geheimnis: der Wert steht in `NEXT_PUBLIC_SUPABASE_URL` und damit
 * ohnehin im Browser-Bundle. Er steht hier, damit ein Snapshot, der
 * versehentlich gegen eine Shadow- oder Testinstanz läuft, das SAGT statt
 * einen grünen Bericht über die falsche Datenbank zu liefern.
 */
export const ERWARTETER_PROJEKT_REF = 'nnwyktkqibdjxgimjyuq'

/**
 * Sicherheitslage aus dem letzten vollständigen Prüflauf.
 *
 * Diese Zahlen stammen aus `pg_tables.rowsecurity` bzw. `pg_policies` und
 * sind über PostgREST NICHT abfragbar — der Katalog ist dort nicht
 * exponiert. Sie erscheinen deshalb als 'dokumentiert' mit dem Prüfbefehl
 * daneben und werden NIE grün: ein abgeschriebener Wert ist kein Beleg für
 * den Zustand von heute.
 */
export const DOKUMENTIERTE_SICHERHEITSLAGE = {
  tabellenGesamt: 308,
  tabellenMitRls: 308,
  pruefbefehl: 'npm run audit:rls',
  orgFenceAusnahmen: ['organization_members', 'state_waitlist'],
  quelle: 'docs/reports/MASTER_HANDOFF_LATEST.md §2 (Stand 26.08.2026)',
} as const

/**
 * Die fünf jüngsten Migrationsdateien im Repo.
 *
 * WARUM EINE KONSTANTE UND KEIN VERZEICHNIS-SCAN: `supabase/migrations`
 * wird nicht mit ins Serverless-Bundle gepackt — ein `readdir` zur Laufzeit
 * fände dort nichts und lieferte eine leere Liste, die wie „keine
 * Migrationen" aussähe.
 *
 * `__tests__/pilot/pre-pilot-snapshot.test.ts` hält diese Liste gegen das
 * echte Verzeichnis. Wird sie beim nächsten Migrationsschritt vergessen,
 * ist das ein roter Test und kein stiller Falschstand.
 *
 * ‼️ „Im Repo" ist NICHT „angewendet". Ob eine Migration live eingespielt
 * ist, beantwortet dieser Snapshot ausdrücklich nicht — dafür gibt es die
 * Verifikationsskripte unter `scripts/verify-*.mjs`.
 */
export const JUENGSTE_MIGRATIONEN = [
  '20261023000003_rollback_rechnung_eingangsstatus.sql',
  '20261023000004_eingangsriegel_lauf_und_vpkzp.sql',
  '20261023000005_rollback_eingangsriegel_lauf_und_vpkzp.sql',
  '20261024000000_watchlist_befristung.sql',
  '20261024000001_rollback_watchlist_befristung.sql',
  // HINWEIS (Track 13): die Perimeter-Migrationen stehen hier NICHT,
  // obwohl sie die zuletzt hinzugekommenen sind. Sie tragen seit dem
  // 28.08.2026 einen ECHTEN Zeitstempel (20260828180000/…0001, Regel aus
  // docs/MIGRATION_LEDGER.md) und sortieren damit VOR dem 20261017-Block
  // mit seinen Zukunfts-Nummern. „Die fuenf juengsten Dateien" heisst in
  // diesem Verzeichnis also nicht mehr „die zuletzt entstandenen" —
  // solange beide Nummernkreise nebeneinander liegen, ist das unvermeidbar
  // und hier ausdruecklich festgehalten statt stillschweigend hingenommen.
  //
  // NACHTRAG 29.08.2026: dasselbe gilt inzwischen fuer sechs weitere
  // Dateien (20260829005500…005701 — Zeitkorrektur-Akteur, Pflegevisite,
  // Dienstplanfreigabe) und die FHIR-Migration 20260829010000/…0001. Alle
  // tragen einen echten Zeitstempel nach der Ledger-Regel und sortieren
  // deshalb ebenfalls vor den Zukunfts-Nummern. Diese Liste bleibt damit
  // unveraendert, OBWOHL acht Migrationen dazugekommen sind — was hier
  // steht, sind die groessten Dateinamen, nicht die neuesten Dateien.
  // Solange der 20261017-Block existiert, ist diese Konstante fuer die
  // Frage „was ist zuletzt dazugekommen" NICHT zu gebrauchen.
] as const

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function punkt(
  schluessel: string,
  titel: string,
  wert: SnapshotWert,
  herkunft: SnapshotHerkunft,
  ampel: SnapshotAmpel,
  befund: string,
): SnapshotPunkt {
  return { schluessel, titel, wert, herkunft, ampel, befund }
}

/**
 * Ampel eines Abschnitts aus seinen Punkten.
 *
 * Reihenfolge ist fail-closed: rot schlägt ungeprüft schlägt gelb. Anders
 * als im Control Center steht 'ungeprueft' hier NICHT über 'rot' — ein
 * belegter Fehler ist die schwerere Aussage als eine fehlende Messung, und
 * er darf von ihr nicht verdeckt werden.
 */
function ampelAus(punkte: SnapshotPunkt[]): SnapshotAmpel {
  if (punkte.some(p => p.ampel === 'rot')) return 'rot'
  if (punkte.some(p => p.ampel === 'ungeprueft')) return 'ungeprueft'
  if (punkte.some(p => p.ampel === 'gelb')) return 'gelb'
  return 'gruen'
}

/** Die ersten sieben Stellen — die übliche Kurzform, und genug zum Vergleich. */
function kurz(sha: string | undefined | null): string | null {
  if (!sha) return null
  const sauber = sha.trim()
  return sauber === '' ? null : sauber.slice(0, 7)
}

/**
 * Projekt-Ref aus der Supabase-URL.
 *
 * `https://abc123.supabase.co` → `abc123`. Ein anderer Aufbau ergibt `null`
 * statt eines geratenen Teilstrings.
 */
export function projektRefAus(url: string | undefined): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    const teile = host.split('.')
    if (teile.length < 3) return null
    return teile[0] || null
  } catch {
    return null
  }
}

/**
 * Zählt Zeilen und fängt jeden Fehler ab — ein Lesefehler ergibt `null`.
 *
 * Dieselbe Bauart wie `zaehle()` im Control Center, bewusst nicht von dort
 * importiert: sie ist dort modulprivat, und ein Export nur für diese Datei
 * machte aus einem Detail eine Schnittstelle.
 */
async function zaehle(
  hinweise: string[],
  label: string,
  bauen: () => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number | null> {
  try {
    const { count, error } = await bauen()
    if (error) {
      hinweise.push(`${label}: ${(error as { message?: string })?.message ?? 'unbekannter Fehler'}`)
      return null
    }
    return count ?? 0
  } catch (err) {
    hinweise.push(`${label}: ${(err as Error).message}`)
    return null
  }
}

// ---------------------------------------------------------------------------
// 1. Code — Git und CI
// ---------------------------------------------------------------------------

function abschnittCode(gemeldet: GemeldeterStand, quelle: EnvQuelle): SnapshotAbschnitt {
  const laufend = kurz(quelle.VERCEL_GIT_COMMIT_SHA)
  const head = kurz(gemeldet.gitHead)
  const origin = kurz(gemeldet.originMain)

  const punkte: SnapshotPunkt[] = []

  punkte.push(laufend
    ? punkt('laufender_commit', 'Laufender Commit', laufend, 'gemessen', 'gruen',
        `Der ausgeführte Code stammt aus ${laufend} (VERCEL_GIT_COMMIT_SHA).`)
    : punkt('laufender_commit', 'Laufender Commit', null, 'nicht_messbar', 'ungeprueft',
        'VERCEL_GIT_COMMIT_SHA ist nicht gesetzt — außerhalb von Vercel ist der Commit des laufenden Codes nicht feststellbar.'))

  punkte.push(head
    ? punkt('git_head', 'git HEAD (gemeldet)', head, 'gemeldet', 'gruen',
        `Der Aufrufer meldet ${head} als lokalen HEAD. Nicht nachgeprüft — zur Laufzeit gibt es kein Arbeitsverzeichnis.`)
    : punkt('git_head', 'git HEAD (gemeldet)', null, 'nicht_messbar', 'ungeprueft',
        'Nicht hereingereicht. `git rev-parse HEAD` läuft auf dem Rechner, der deployt — nicht in der Serverless-Funktion.'))

  punkte.push(origin
    ? punkt('origin_main', 'origin/main (gemeldet)', origin, 'gemeldet', 'gruen',
        `Der Aufrufer meldet ${origin} als Remote-Wahrheit.`)
    : punkt('origin_main', 'origin/main (gemeldet)', null, 'nicht_messbar', 'ungeprueft',
        'Nicht hereingereicht. Ohne diesen Wert ist nicht feststellbar, ob der laufende Code dem Remote-Stand entspricht.'))

  // Der eigentliche Punkt dieses Abschnitts.
  const vergleichbar = [laufend, head, origin].filter((x): x is string => x !== null)
  if (vergleichbar.length < 2) {
    punkte.push(punkt('commit_gleichstand', 'Stände identisch', null, 'nicht_messbar', 'ungeprueft',
      'Mindestens zwei der drei Commit-Werte fehlen — ein Abgleich ist nicht möglich.'))
  } else {
    const einig = vergleichbar.every(x => x === vergleichbar[0])
    punkte.push(einig
      ? punkt('commit_gleichstand', 'Stände identisch', true, 'gemessen', 'gruen',
          `Alle bekannten Commit-Werte stimmen überein (${vergleichbar[0]}).`)
      : punkt('commit_gleichstand', 'Stände identisch', false, 'gemessen', 'rot',
          `Die Commit-Werte weichen ab: ${[
            laufend ? `laufend ${laufend}` : null,
            head ? `HEAD ${head}` : null,
            origin ? `origin/main ${origin}` : null,
          ].filter(Boolean).join(', ')}. Jede Aussage in diesem Snapshot beschreibt dann einen anderen Stand als den, der gerade Post verschicken würde.`))
  }

  const ci = gemeldet.ciStatus
  punkte.push(
    ci === 'gruen'
      ? punkt('ci', 'CI-Ausgang (gemeldet)', 'gruen', 'gemeldet', 'gruen',
          `CI ist grün gemeldet${gemeldet.ciLauf ? ` (Lauf ${gemeldet.ciLauf})` : ''}.`)
      : ci === 'rot'
        ? punkt('ci', 'CI-Ausgang (gemeldet)', 'rot', 'gemeldet', 'rot',
            `CI ist rot gemeldet${gemeldet.ciLauf ? ` (Lauf ${gemeldet.ciLauf})` : ''}. Ein Echtlauf gegen einen roten Stand ist kein begleiteter Pilot, sondern ein Versuch.`)
        : punkt('ci', 'CI-Ausgang (gemeldet)', ci ?? null, 'nicht_messbar', 'ungeprueft',
            'Kein CI-Ausgang hereingereicht. Zur Laufzeit ist er nicht abfragbar.'),
  )

  return { id: 'code', titel: 'Code — Commit und CI', ampel: ampelAus(punkte), punkte }
}

// ---------------------------------------------------------------------------
// 2. Deployment
// ---------------------------------------------------------------------------

function abschnittDeployment(quelle: EnvQuelle): SnapshotAbschnitt {
  const env = quelle.VERCEL_ENV ?? null
  const produktion = istProduktionslauf(quelle)
  const region = quelle.VERCEL_REGION ?? null

  const punkte: SnapshotPunkt[] = [
    env
      ? punkt('vercel_env', 'Vercel-Umgebung', env, 'gemessen', env === 'production' ? 'gruen' : 'gelb',
          env === 'production'
            ? 'Der Lauf ist ein Produktionslauf.'
            : `Der Lauf läuft in der Umgebung „${env}". Ein Pilot gehört in die Produktion — alles andere trifft eine andere Datenbank oder einen anderen Code.`)
      : punkt('vercel_env', 'Vercel-Umgebung', null, 'nicht_messbar', 'gelb',
          'VERCEL_ENV ist nicht gesetzt — der Lauf findet außerhalb von Vercel statt (lokal, Test oder CI).'),
    punkt('produktionslauf', 'Produktionslauf', produktion, 'gemessen', produktion ? 'gruen' : 'gelb',
      produktion
        ? 'lib/env/pruefung.ts stuft diesen Lauf als Produktion ein — die Versand-Schalter wirken hier.'
        : 'Kein Produktionslauf. Die Versand-Schalter wirken hier nur mit zusätzlich gesetztem VERSAND_NICHT_PRODUKTION_ERLAUBT.'),
    region
      ? punkt('region', 'Region', region, 'gemessen', 'gruen', `Ausführungsregion ${region}.`)
      : punkt('region', 'Region', null, 'nicht_messbar', 'gelb', 'VERCEL_REGION ist nicht gesetzt.'),
  ]

  return { id: 'deployment', titel: 'Deployment', ampel: ampelAus(punkte), punkte }
}

// ---------------------------------------------------------------------------
// 3. Datenbank
// ---------------------------------------------------------------------------

async function abschnittDatenbank(
  supabase: SupabaseClient,
  orgId: string,
  quelle: EnvQuelle,
  hinweise: string[],
): Promise<SnapshotAbschnitt> {
  const ref = projektRefAus(quelle.NEXT_PUBLIC_SUPABASE_URL)

  // Erreichbarkeit UND Mandantenexistenz in einem: eine Zählung auf genau
  // diese Organisation. Kommt 0 zurück, ist die Verbindung in Ordnung und
  // der Mandant falsch — zwei Fehlerbilder, die ohne diese Frage
  // ununterscheidbar wären.
  const org = await zaehle(hinweise, 'organizations', () =>
    supabase.from('organizations').select('id', { count: 'exact', head: true }).eq('id', orgId))

  const auditZeilen = await zaehle(hinweise, 'billing_audit_trail', () =>
    supabase.from('billing_audit_trail').select('id', { count: 'exact', head: true }).eq('organization_id', orgId))

  const punkte: SnapshotPunkt[] = [
    ref === null
      ? punkt('projekt_ref', 'Supabase-Projekt', null, 'nicht_messbar', 'rot',
          'NEXT_PUBLIC_SUPABASE_URL fehlt oder hat einen unerwarteten Aufbau — gegen welche Datenbank dieser Lauf arbeitet, ist nicht feststellbar.')
      : ref === ERWARTETER_PROJEKT_REF
        ? punkt('projekt_ref', 'Supabase-Projekt', ref, 'gemessen', 'gruen',
            `Der Lauf arbeitet gegen ${ref} — die erwartete Produktionsinstanz.`)
        : punkt('projekt_ref', 'Supabase-Projekt', ref, 'gemessen', 'rot',
            `Der Lauf arbeitet gegen ${ref}, erwartet war ${ERWARTETER_PROJEKT_REF}. Jede Zahl in diesem Snapshot stammt aus einer anderen Datenbank als der, um die es geht.`),

    org === null
      ? punkt('db_erreichbar', 'Datenbank erreichbar', null, 'nicht_messbar', 'rot',
          'Die Zählabfrage auf `organizations` ist gescheitert — siehe Hinweise.')
      : org > 0
        ? punkt('db_erreichbar', 'Datenbank erreichbar', true, 'gemessen', 'gruen',
            'Die Datenbank antwortet und der angefragte Mandant existiert.')
        : punkt('db_erreichbar', 'Datenbank erreichbar', false, 'gemessen', 'rot',
            `Die Datenbank antwortet, aber die Organisation ${orgId} existiert dort nicht. Alle folgenden Zählungen wären leer — nicht weil nichts da ist, sondern weil der Mandant nicht stimmt.`),

    auditZeilen === null
      ? punkt('audit_system', 'Audit-System', null, 'nicht_messbar', 'rot',
          '`billing_audit_trail` ist nicht lesbar. Ein Geldvorgang ohne funktionierendes Audit ist nicht nachvollziehbar.')
      : punkt('audit_system', 'Audit-System', auditZeilen, 'gemessen', 'gruen',
          `\`billing_audit_trail\` ist erreichbar und trägt ${auditZeilen} Eintrag/Einträge für diesen Mandanten.`),
  ]

  return { id: 'datenbank', titel: 'Datenbank', ampel: ampelAus(punkte), punkte }
}

// ---------------------------------------------------------------------------
// 4. Migrationen
// ---------------------------------------------------------------------------

function abschnittMigrationen(): SnapshotAbschnitt {
  const punkte: SnapshotPunkt[] = [
    punkt('juengste_migrationen', 'Jüngste Migrationen im Repo', JUENGSTE_MIGRATIONEN.join(', '),
      'dokumentiert', 'ungeprueft',
      'Die fünf jüngsten Dateien unter `supabase/migrations`. Ein Regressionstest hält die Liste gegen das echte Verzeichnis.'),
    punkt('angewendet', 'Live angewendet?', null, 'nicht_messbar', 'ungeprueft',
      'Ob diese Migrationen live eingespielt sind, ist über PostgREST nicht feststellbar — `supabase_migrations.schema_migrations` liegt in einem nicht exponierten Schema. Nachweis nur über die Skripte unter `scripts/verify-*.mjs` oder den SQL-Editor.'),
  ]
  return { id: 'migrationen', titel: 'Migrationen', ampel: ampelAus(punkte), punkte }
}

// ---------------------------------------------------------------------------
// 5. Sicherheit
// ---------------------------------------------------------------------------

function abschnittSicherheit(): SnapshotAbschnitt {
  const d = DOKUMENTIERTE_SICHERHEITSLAGE
  const punkte: SnapshotPunkt[] = [
    punkt('rls', 'RLS-Abdeckung', `${d.tabellenMitRls}/${d.tabellenGesamt}`, 'dokumentiert', 'ungeprueft',
      `Aus ${d.quelle}. Über PostgREST nicht nachprüfbar (pg_tables ist dort nicht exponiert) — Prüfbefehl: \`${d.pruefbefehl}\`.`),
    punkt('org_fence', 'org_fence RESTRICTIVE', `alle relevanten Tabellen, ${d.orgFenceAusnahmen.length} dokumentierte Ausnahmen`,
      'dokumentiert', 'ungeprueft',
      `Ausnahmen: ${d.orgFenceAusnahmen.join(', ')}. Aus ${d.quelle}. Ein abgeschriebener Wert ist kein Beleg für heute.`),
  ]
  return { id: 'sicherheit', titel: 'Sicherheit (dokumentiert, nicht gemessen)', ampel: ampelAus(punkte), punkte }
}

// ---------------------------------------------------------------------------
// 6. Zustellung
// ---------------------------------------------------------------------------

/**
 * Nur VORHANDENSEIN, nie Werte.
 *
 * Ein Snapshot landet im Protokoll und womöglich in einem Bericht. Ein
 * API-Schlüssel hat dort nichts verloren — auch nicht abgekürzt.
 */
function abschnittZustellung(quelle: EnvQuelle): SnapshotAbschnitt {
  const resend = typeof quelle.RESEND_API_KEY === 'string' && quelle.RESEND_API_KEY !== ''
  const cron = typeof quelle.CRON_SECRET === 'string' && quelle.CRON_SECRET !== ''

  const punkte: SnapshotPunkt[] = [
    punkt('resend', 'Resend konfiguriert', resend, 'gemessen', resend ? 'gruen' : 'gelb',
      resend
        ? 'RESEND_API_KEY ist gesetzt. Ob der Schlüssel gültig ist, sagt das nicht — dafür gibt es `scripts/verify-resend.mjs` (liest, versendet nicht).'
        : 'RESEND_API_KEY ist nicht gesetzt. Der Versand meldet dann „übersprungen", setzt sent_at NICHT und ist damit nachholbar.'),
    punkt('cron', 'CRON_SECRET gesetzt', cron, 'gemessen', cron ? 'gruen' : 'gelb',
      cron
        ? 'CRON_SECRET ist gesetzt — geplante Läufe können sich ausweisen.'
        : 'CRON_SECRET fehlt. Geplante Läufe werden abgewiesen; für einen begleiteten Einzelvorgang ist das unerheblich, für den Regelbetrieb nicht.'),
  ]
  return { id: 'zustellung', titel: 'Zustellung', ampel: ampelAus(punkte), punkte }
}

// ---------------------------------------------------------------------------
// 7. Schalter — der Kern
// ---------------------------------------------------------------------------

function abschnittSchalter(quelle: EnvQuelle): { abschnitt: SnapshotAbschnitt; zusicherungen: Zusicherungen } {
  const flags = versandFlagsStand(quelle)
  const camt = camtImportModus(quelle)

  const rechnungsversandAus = !flags.rechnung.aktiv
  const mahnversandAus = !flags.mahnung.aktiv
  const camtTrocken = !camt.buchend

  const punkte: SnapshotPunkt[] = [
    punkt('rechnungsversand', 'Automatischer Rechnungsversand', flags.rechnung.aktiv, 'gemessen',
      flags.rechnung.aktiv ? 'rot' : 'gruen',
      flags.rechnung.aktiv
        ? 'SCHARF: ein Automat kann ohne weiteres Zutun echte Rechnungen verschicken.'
        : flags.rechnung.grund),
    punkt('mahnversand', 'Automatischer Mahnversand', flags.mahnung.aktiv, 'gemessen',
      flags.mahnung.aktiv ? 'rot' : 'gruen',
      flags.mahnung.aktiv
        ? 'SCHARF: ein Automat kann ohne weiteres Zutun echte Mahnungen verschicken.'
        : flags.mahnung.grund),
    punkt('camt_modus', 'CAMT-Betriebsart', camt.modus, 'gemessen',
      camt.buchend ? 'rot' : 'gruen',
      camt.buchend
        ? 'SCHARF: ein Kontoauszugsimport legt Zahlungseingänge an und ordnet sie zu.'
        : camt.grund),
  ]

  // Ungültige Werte sind kein Nebengeräusch: sie bedeuten, dass jemand am
  // Schalter war und das Ergebnis nicht ist, was er wollte.
  for (const w of flags.warnungen) {
    punkte.push(punkt('schalter_warnung', 'Hinweis zur Schalterlage', w, 'gemessen', 'gelb', w))
  }
  if (!camt.wertGueltig) {
    punkte.push(punkt('camt_wert', 'CAMT_IMPORT_MODE-Wert', false, 'gemessen', 'gelb', camt.grund))
  }

  const zusicherungen: Zusicherungen = {
    rechnungsversandAus,
    mahnversandAus,
    camtTrocken,
    alleRuhend: rechnungsversandAus && mahnversandAus && camtTrocken,
  }

  return {
    abschnitt: { id: 'schalter', titel: 'Schalter — Automatik', ampel: ampelAus(punkte), punkte },
    zusicherungen,
  }
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

/**
 * Erstellt den Snapshot. Schreibt nichts.
 */
export async function erstellePrePilotSnapshot(
  supabase: SupabaseClient,
  eingaben: SnapshotEingaben,
): Promise<PrePilotSnapshot> {
  const { organizationId, quelle = process.env, gemeldet = {}, jetzt } = eingaben
  const hinweise: string[] = []

  const schalter = abschnittSchalter(quelle)

  const abschnitte: SnapshotAbschnitt[] = [
    abschnittCode(gemeldet, quelle),
    abschnittDeployment(quelle),
    await abschnittDatenbank(supabase, organizationId, quelle, hinweise),
    abschnittMigrationen(),
    abschnittSicherheit(),
    abschnittZustellung(quelle),
    schalter.abschnitt,
  ]

  const z = schalter.zusicherungen
  const zustand: PilotZustand =
    z.rechnungsversandAus === null || z.mahnversandAus === null || z.camtTrocken === null
      ? 'UNGEPRUEFT'
      : z.alleRuhend ? 'RUHEND' : 'SCHARF'

  return {
    erstelltAm: (jetzt ?? new Date()).toISOString(),
    organizationId,
    zustand,
    abschnitte,
    zusicherungen: z,
    hinweise,
    freigabeHinweis: SNAPSHOT_FREIGABE_HINWEIS,
  }
}

// ---------------------------------------------------------------------------
// Menschenlesbare Fassung
// ---------------------------------------------------------------------------

const AMPEL_ZEICHEN: Record<SnapshotAmpel, string> = {
  gruen: '[ok]',
  gelb: '[!]',
  rot: '[XX]',
  ungeprueft: '[--]',
}

/**
 * Der Snapshot als Text.
 *
 * Zeile 1 trägt das Urteil, damit niemand scrollen muss, um zu sehen, ob
 * gerade etwas scharf ist.
 */
export function snapshotAlsText(s: PrePilotSnapshot): string {
  const kopf: Record<PilotZustand, string> = {
    RUHEND: 'RUHEND — kein Automat kann von selbst Geld bewegen oder Post verschicken.',
    SCHARF: 'SCHARF — mindestens ein Automat kann von selbst handeln. Siehe Abschnitt „Schalter".',
    UNGEPRUEFT: 'UNGEPRUEFT — mindestens eine der drei Schalterfragen ist nicht beantwortbar.',
  }

  const zeilen: string[] = [
    `PRE-PILOT-SNAPSHOT: ${kopf[s.zustand]}`,
    '',
    `Erstellt:     ${s.erstelltAm}`,
    `Mandant:      ${s.organizationId}`,
    '',
  ]

  for (const a of s.abschnitte) {
    zeilen.push(`${AMPEL_ZEICHEN[a.ampel]} ${a.titel}`)
    for (const p of a.punkte) {
      const wert = p.wert === null ? '—' : String(p.wert)
      zeilen.push(`     ${AMPEL_ZEICHEN[p.ampel]} ${p.titel}: ${wert}  (${p.herkunft})`)
      zeilen.push(`         ${p.befund}`)
    }
    zeilen.push('')
  }

  if (s.hinweise.length > 0) {
    zeilen.push('Nicht ausführbare Messungen:')
    for (const h of s.hinweise) zeilen.push(`  - ${h}`)
    zeilen.push('')
  }

  zeilen.push(s.freigabeHinweis)
  return zeilen.join('\n')
}
