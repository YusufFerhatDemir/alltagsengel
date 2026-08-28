// ═══════════════════════════════════════════════════════════════════════
// Endgültige Kontolöschung nach Ablauf der Widerrufsfrist (Art. 17 DSGVO)
// ═══════════════════════════════════════════════════════════════════════
//
// AUSGANGSLAGE (Track 11, live geprüft mit
// `node scripts/verify-loeschkette-live.mjs`):
//
//   * Die Löschung lief ausschließlich in der Edge Function
//     `supabase/functions/account-hard-delete`, aufgerufen von einem
//     pg_cron-Job (Migration 20260918020000). Der Job baut seine URL aus
//     `current_setting('app.settings.supabase_url', true)` — diese GUC ist
//     live NICHT gesetzt. `NULL || '/functions/v1/…'` ist NULL, der
//     `net.http_post` läuft ins Leere. Die endgültige Löschung ist also
//     nie gelaufen und hätte auch nie laufen können.
//   * Zusätzlich hätte sie den Geheimnis-Check der Function gar nicht
//     bestehen können: der Job schickt den service_role_key als Bearer,
//     die Function vergleicht gegen CRON_SECRET.
//   * Und die Function löschte `bookings` — obwohl die Migration
//     20260804400000 für genau diese Tabelle das Gegenteil entschieden
//     hatte („Buchungsdaten — erhalten bleiben", ON DELETE SET NULL).
//
// Deshalb liegt die Ausführung jetzt hier: im Anwendungscode, wo die
// Umgebungsvariablen ohnehin stehen, wo `lib/api/cron-auth.ts` den
// fail-closed-Türsteher bereits stellt und wo sich der Ablauf ohne
// Datenbank prüfen lässt. Der Takt kommt über `vercel.json` →
// `/api/cron/konto-loeschung`.
//
// WAS gelöscht wird und was bleibt, steht NICHT hier, sondern in
// lib/dsgvo/loeschkatalog.ts — eine Entscheidung je Spalte, mit Grund.
//
// DREI EIGENSCHAFTEN, die den Unterschied zur Vorgängerin ausmachen:
//
//  1. VORPRÜFUNG. Spalten, deren Fremdschlüssel live auf NO ACTION steht,
//     verhindern das Löschen in `auth.users`. Sie werden ZUERST gezählt.
//     Liegt dort eine Zeile, bricht der Lauf ab, BEVOR er irgendetwas
//     gelöscht hat. Die Alternative wäre der halb gelöschte Zustand:
//     Nachrichten, Geräte und Profil weg — Konto aber noch da.
//  2. JEDER Fehler wird geprüft. Die Vorgängerin prüfte zwei von zehn
//     Schritten; ein fehlgeschlagenes `profiles`-Delete fiel niemandem
//     auf, und die Bestätigungsmail ging trotzdem raus.
//  3. Die Bestätigungsmail geht NUR bei vollständigem Erfolg, und sie
//     benennt, was aufbewahrt bleibt.
// ═══════════════════════════════════════════════════════════════════════

import { blockierendeEintraege, zuBehalten, zuLoeschen } from './loeschkatalog'

/** Postgres-Fehlercodes, die in diesem Ablauf eine eigene Bedeutung haben. */
const FEHLENDE_TABELLE = '42P01'
const FEHLENDE_SPALTE = '42703'
const FREMDSCHLUESSEL_VERLETZT = '23503'

export interface DbFehler {
  message: string
  code?: string
}

/** Der Ausschnitt des Supabase-Clients, den dieses Modul braucht. */
export interface LoeschClient {
  from(tabelle: string): {
    select(
      spalten: string,
      optionen?: { count?: 'exact'; head?: boolean },
    ): {
      eq(spalte: string, wert: unknown): PromiseLike<{ count?: number | null; error: DbFehler | null }>
    }
    delete(): {
      eq(spalte: string, wert: unknown): PromiseLike<{ error: DbFehler | null }>
    }
  }
}

export type LoeschStatus =
  /** Konto und alle Katalogzeilen sind weg. */
  | 'geloescht'
  /** Eine Zeile mit blockierendem Fremdschlüssel steht im Weg. Nichts gelöscht. */
  | 'blockiert'
  /** Ein Schritt schlug fehl. Der Lauf brach an dieser Stelle ab. */
  | 'fehler'

export interface KontoErgebnis {
  userId: string
  status: LoeschStatus
  /** Tabellen, aus denen tatsächlich gelöscht wurde. */
  geloescht: string[]
  /** Katalogzeilen, deren Tabelle/Spalte es (noch) nicht gibt. */
  uebersprungen: Array<{ tabelle: string; spalte: string; grund: string }>
  /** Bei 'blockiert': welche Tabellen Zeilen halten. */
  blockiertDurch?: string[]
  /** Bei 'fehler': wo und warum. */
  fehler?: string
}

export interface LaufErgebnis {
  gepruefte: number
  geloescht: number
  blockiert: number
  fehler: number
  konten: KontoErgebnis[]
}

export interface LoeschUmgebung {
  /** Dienstschlüssel-Client. RLS ist hier nicht die Grenze — der Katalog ist es. */
  client: LoeschClient
  /** Löscht das Konto in `auth.users`. */
  loescheAuthKonto(userId: string): Promise<{ error: DbFehler | null }>
  /** E-Mail des Kontos, für die Bestätigung. `null`, wenn nicht ermittelbar. */
  holeEmail(userId: string): Promise<string | null>
  /** Bestätigungsmail. Fehler hier brechen den Lauf NICHT ab — gelöscht ist gelöscht. */
  sendeBestaetigung?(email: string, vorname: string, verbleibt: string[]): Promise<void>
  /** Protokolleintrag. Fehler hier brechen den Lauf NICHT ab. */
  protokolliere?(ergebnis: KontoErgebnis, email: string | null): Promise<void>
}

export interface LoeschKandidat {
  id: string
  first_name?: string | null
  last_name?: string | null
  deleted_at: string
}

/** Frist, nach deren Ablauf endgültig gelöscht wird. */
export const FRIST_TAGE = 60

/** Der Zeitpunkt, vor dem `deleted_at` liegen muss. */
export function loeschStichtag(jetzt: Date): Date {
  return new Date(jetzt.getTime() - FRIST_TAGE * 24 * 60 * 60 * 1000)
}

/**
 * Ist dieser Fehler ein „die Tabelle/Spalte gibt es hier nicht"?
 *
 * Das ist kein Grund, den Lauf abzubrechen: der Katalog ist absichtlich
 * etwas weiter als das Schema einer einzelnen Umgebung (Shadow-DB,
 * Testumgebung). Er wird aber PROTOKOLLIERT — ein Tippfehler im Katalog
 * soll nicht als stille Nichtlöschung durchgehen.
 */
function istUnbekannteQuelle(fehler: DbFehler): boolean {
  return fehler.code === FEHLENDE_TABELLE || fehler.code === FEHLENDE_SPALTE
}

/**
 * Zählt die Zeilen, die das endgültige Löschen blockieren würden.
 *
 * Fail-closed: ein Fehler beim Zählen wird als „blockiert" gewertet, nicht
 * als „frei". Wer nicht weiß, ob etwas im Weg steht, darf nicht löschen.
 */
async function pruefeBlockaden(
  client: LoeschClient,
  userId: string,
): Promise<{ frei: true } | { frei: false; tabellen: string[] }> {
  const treffer: string[] = []
  for (const eintrag of blockierendeEintraege()) {
    const { count, error } = await client
      .from(eintrag.tabelle)
      .select('id', { count: 'exact', head: true })
      .eq(eintrag.spalte, userId)
    if (error) {
      if (istUnbekannteQuelle(error)) continue
      treffer.push(`${eintrag.tabelle}.${eintrag.spalte} (nicht prüfbar: ${error.message})`)
      continue
    }
    if ((count ?? 0) > 0) treffer.push(`${eintrag.tabelle}.${eintrag.spalte}`)
  }
  return treffer.length === 0 ? { frei: true } : { frei: false, tabellen: treffer }
}

/**
 * Löscht ein einzelnes Konto endgültig.
 *
 * Exportiert, damit der Ablauf einzeln prüfbar ist — der Lauf darüber
 * ist nur die Schleife.
 */
export async function loescheKonto(
  umgebung: LoeschUmgebung,
  kandidat: LoeschKandidat,
): Promise<KontoErgebnis> {
  const userId = kandidat.id
  const ergebnis: KontoErgebnis = { userId, status: 'geloescht', geloescht: [], uebersprungen: [] }

  // Die E-Mail VOR dem Löschen holen — danach gibt es das Konto nicht mehr.
  let email: string | null = null
  try {
    email = await umgebung.holeEmail(userId)
  } catch {
    email = null
  }

  // ── 1) Vorprüfung ──────────────────────────────────────────────
  const blockade = await pruefeBlockaden(umgebung.client, userId)
  if (!blockade.frei) {
    ergebnis.status = 'blockiert'
    ergebnis.blockiertDurch = blockade.tabellen
    await protokolliereStill(umgebung, ergebnis, email)
    return ergebnis
  }

  // ── 2) Katalog abarbeiten ──────────────────────────────────────
  for (const eintrag of zuLoeschen()) {
    const { error } = await umgebung.client
      .from(eintrag.tabelle)
      .delete()
      .eq(eintrag.spalte, userId)
    if (!error) {
      ergebnis.geloescht.push(eintrag.tabelle)
      continue
    }
    if (istUnbekannteQuelle(error)) {
      ergebnis.uebersprungen.push({
        tabelle: eintrag.tabelle,
        spalte: eintrag.spalte,
        grund: `${error.code}: ${error.message}`,
      })
      continue
    }
    ergebnis.status = error.code === FREMDSCHLUESSEL_VERLETZT ? 'blockiert' : 'fehler'
    if (ergebnis.status === 'blockiert') ergebnis.blockiertDurch = [eintrag.tabelle]
    ergebnis.fehler = `${eintrag.tabelle}.${eintrag.spalte}: ${error.message}`
    await protokolliereStill(umgebung, ergebnis, email)
    return ergebnis
  }

  // ── 3) Profil ──────────────────────────────────────────────────
  // Bewusst NICHT im Katalog: profiles ist kein Fachdatensatz, sondern
  // der Anker selbst. Sein Fehlschlag ist immer ein Abbruch.
  const { error: profilFehler } = await umgebung.client
    .from('profiles')
    .delete()
    .eq('id', userId)
  if (profilFehler) {
    ergebnis.status = profilFehler.code === FREMDSCHLUESSEL_VERLETZT ? 'blockiert' : 'fehler'
    ergebnis.fehler = `profiles.id: ${profilFehler.message}`
    await protokolliereStill(umgebung, ergebnis, email)
    return ergebnis
  }
  ergebnis.geloescht.push('profiles')

  // ── 4) Anmeldekonto ────────────────────────────────────────────
  const { error: authFehler } = await umgebung.loescheAuthKonto(userId)
  if (authFehler) {
    ergebnis.status = authFehler.code === FREMDSCHLUESSEL_VERLETZT ? 'blockiert' : 'fehler'
    ergebnis.fehler = `auth.users: ${authFehler.message}`
    await protokolliereStill(umgebung, ergebnis, email)
    return ergebnis
  }
  ergebnis.geloescht.push('auth.users')

  // ── 5) Protokoll und Bestätigung ───────────────────────────────
  await protokolliereStill(umgebung, ergebnis, email)
  if (email && umgebung.sendeBestaetigung) {
    try {
      await umgebung.sendeBestaetigung(
        email,
        kandidat.first_name?.trim() || 'Sie',
        zuBehalten().map(e => e.begruendung),
      )
    } catch {
      // Fail-soft: die Löschung ist vollzogen. Eine nicht zugestellte
      // Bestätigung macht sie nicht rückgängig und darf den Lauf nicht
      // zu 'fehler' erklären — sonst käme das Konto beim nächsten Lauf
      // erneut dran und der Fehlschlag wiederholte sich ewig.
    }
  }
  return ergebnis
}

async function protokolliereStill(
  umgebung: LoeschUmgebung,
  ergebnis: KontoErgebnis,
  email: string | null,
): Promise<void> {
  if (!umgebung.protokolliere) return
  try {
    await umgebung.protokolliere(ergebnis, email)
  } catch {
    // Das Protokoll ist wichtig, aber es darf eine bereits vollzogene
    // Löschung nicht in einen Fehlerzustand ziehen.
  }
}

/**
 * Der Lauf: alle fälligen Konten der Reihe nach.
 *
 * Ein blockiertes oder fehlgeschlagenes Konto hält die anderen nicht auf.
 */
export async function fuehreKontoLoeschungAus(
  umgebung: LoeschUmgebung,
  kandidaten: LoeschKandidat[],
): Promise<LaufErgebnis> {
  const konten: KontoErgebnis[] = []
  for (const kandidat of kandidaten) {
    konten.push(await loescheKonto(umgebung, kandidat))
  }
  return {
    gepruefte: konten.length,
    geloescht: konten.filter(k => k.status === 'geloescht').length,
    blockiert: konten.filter(k => k.status === 'blockiert').length,
    fehler: konten.filter(k => k.status === 'fehler').length,
    konten,
  }
}
