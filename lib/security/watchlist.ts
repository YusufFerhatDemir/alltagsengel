// ═══════════════════════════════════════════════════════════════════════
// Ueberwachungsliste — ACCOUNT_SECURITY_ALERTS je Konto
// ═══════════════════════════════════════════════════════════════════════
//
// WAS DER SCHALTER IST
// `security_watchlist.aktiv` IST ACCOUNT_SECURITY_ALERTS. Kein zweiter
// Mechanismus, keine Sonderbehandlung einzelner Adressen im Code: wer
// gemeldet wird, steht in genau dieser Tabelle plus der Menge der
// privilegierten Rollen (lib/security/benachrichtigung.ts). Beides ist
// abfragbar, beides steht in der Oberflaeche.
//
// IDENTIFIKATION UEBER user_id, NICHT UEBER DIE ADRESSE
// Die Adresse eines Kontos ist veraenderlich — sie ist sogar eines der
// Ereignisse, die dieses System meldet. Wer die Ueberwachung an sie
// haengt, verliert sie in dem Moment, in dem es darauf ankaeme. Die
// Zuordnung laeuft deshalb ausschliesslich ueber `user_id`;
// `email_kontrolle` ist eine Gegenprobe und sonst nichts.
//
// ZWISCHENSPEICHER
// Jedes Sicherheitsereignis fragt „ist dieses Konto ueberwacht?". Ohne
// Zwischenspeicher waere das eine Abfrage pro Anmeldung, pro
// Verwaltungshandlung, pro Kontoaenderung. 60 Sekunden sind kurz genug,
// dass ein neu eingetragenes Konto sofort greift, und lang genug, dass
// ein Massenlauf nicht hundertmal dieselbe Frage stellt.
// ═══════════════════════════════════════════════════════════════════════

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

import {
  befristungFuer, istAbgelaufen, pruefeAngaben, neuesFristende,
  HOECHSTDAUER_TAGE, type Befristung,
} from './befristung'

const log = logger.child('security-watchlist')

type AdminClient = ReturnType<typeof createAdminClient>

export interface WatchlistEintrag {
  id: string
  userId: string
  organizationId: string | null
  aktiv: boolean
  alleEreignisse: boolean
  ohneSperrfrist: boolean
  meldeEmail: string | null
  emailKontrolle: string | null
  grund: string
  angelegtVon: string | null
  createdAt: string
  /**
   * Ausdrueckliches Fristende (Migration 20261024000000). `null`, solange
   * die Spalte fehlt — dann gilt allein die abgeleitete Hoechstdauer.
   */
  befristetBis: string | null
}

/** Rohform, wie sie aus PostgREST kommt. */
interface RohEintrag {
  id: string
  user_id: string
  organization_id: string | null
  aktiv: boolean
  alle_ereignisse?: boolean | null
  ohne_sperrfrist?: boolean | null
  melde_email: string | null
  email_kontrolle?: string | null
  grund: string
  angelegt_von: string | null
  created_at: string
  befristet_bis?: string | null
}

/**
 * Die drei Spalten aus 20261018000004 werden mit `?? true` gelesen.
 *
 * Grund: die Migration kann noch fehlen (oder zurueckgerollt sein). Ein
 * `undefined` darf dann nicht als „nein" durchgehen — sonst schaltete
 * ein fehlender Einrichtungsschritt die Ueberwachung still ab, und
 * genau das ist der Fehler, den ein Sicherheitssystem nicht machen darf.
 * Im Zweifel wird MEHR gemeldet, nicht weniger.
 */
function ausRoh(r: RohEintrag): WatchlistEintrag {
  return {
    id: r.id,
    userId: r.user_id,
    organizationId: r.organization_id,
    aktiv: r.aktiv,
    alleEreignisse: r.alle_ereignisse ?? true,
    ohneSperrfrist: r.ohne_sperrfrist ?? true,
    meldeEmail: r.melde_email,
    emailKontrolle: r.email_kontrolle ?? null,
    grund: r.grund,
    angelegtVon: r.angelegt_von,
    createdAt: r.created_at,
    befristetBis: r.befristet_bis ?? null,
  }
}

// ── Drei Schemastaende, drei Spaltensaetze ──────────────────────────
// Diese Tabelle ist zweimal gewachsen, und beide Migrationen brauchen
// einen Menschen im SQL-Editor (DDL ist ueber den Dienstschluessel
// gesperrt, 42501). Der Code muss deshalb mit JEDEM der drei Staende
// arbeiten — auch mit dem, der gerade live ist.
//
// Gestaffelt wird von neu nach alt: faellt eine Stufe mit 42703 durch,
// laeuft die naechste. Der frueher zweistufige Rueckfall sprang von der
// obersten Stufe direkt auf den aeltesten Satz und verlor dabei
// `alle_ereignisse`, `ohne_sperrfrist` und `email_kontrolle` — Angaben,
// die live vorhanden sind.
/** Mit 20261024000000 (Frist und Zweck). Live am 01.09.2026 NICHT vorhanden. */
const SPALTEN_FRIST =
  'id, user_id, organization_id, aktiv, alle_ereignisse, ohne_sperrfrist, ' +
  'melde_email, email_kontrolle, grund, angelegt_von, created_at, befristet_bis'
/** Mit 20261018000004 — der Stand, der live gilt. */
const SPALTEN =
  'id, user_id, organization_id, aktiv, alle_ereignisse, ohne_sperrfrist, ' +
  'melde_email, email_kontrolle, grund, angelegt_von, created_at'
/** Spaltensatz vor 20261018000004 — Rueckfallebene. */
const SPALTEN_ALT =
  'id, user_id, organization_id, aktiv, melde_email, grund, angelegt_von, created_at'

const STAFFEL = [SPALTEN_FRIST, SPALTEN, SPALTEN_ALT] as const

/** 42703/PGRST204 = die Spalte gibt es (noch) nicht — eine Stufe tiefer. */
function fehltSpalte(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204'
}

// ─────────────────────────────────────────────────────────────────────
// Zwischenspeicher
// ─────────────────────────────────────────────────────────────────────

const CACHE_MS = 60_000
let cache: { zeit: number; eintraege: Map<string, WatchlistEintrag> } | null = null

/** Nur fuer Tests und fuer den Schreibweg (nach einer Aenderung leeren). */
export function leereZwischenspeicher(): void {
  cache = null
}

async function ladeAktive(admin: AdminClient): Promise<Map<string, WatchlistEintrag>> {
  const karte = new Map<string, WatchlistEintrag>()

  // Die Staffel von neu nach alt. Faellt eine Stufe mit 42703 durch,
  // fehlt die Migration dieser Stufe — dann die naechste, statt die
  // Ueberwachung wegen eines fehlenden Einrichtungsschritts komplett
  // auszusetzen.
  let data: unknown = null
  let error: { code?: string; message?: string } | null = null
  for (const spalten of STAFFEL) {
    const versuch = await admin
      .from('security_watchlist')
      .select(spalten)
      .eq('aktiv', true)
    data = versuch.data
    error = versuch.error
    if (!fehltSpalte(error)) break
  }

  if (error) {
    if (error.code !== '42P01' && error.code !== 'PGRST205') {
      log.error('Ueberwachungsliste nicht lesbar', { errorCode: error.code })
    }
    return karte
  }

  // ── Befristung (Befund 31.08.2026) ──────────────────────────────────
  // Ein Eintrag, dessen Frist abgelaufen ist, wird hier NICHT aufgenommen.
  // Damit endet die Ueberwachung von selbst, ohne dass jemand daran denken
  // muss — der ganze Zweck einer Frist. Begruendung und Richtung des
  // fail-closed stehen in lib/security/befristung.ts.
  //
  // Die Zeile bleibt in der Datenbank stehen und ist in der Verwaltung
  // weiter sichtbar (als „abgelaufen"). Sie still zu loeschen waere das
  // Gegenteil von Transparenz: dann waere hinterher nicht mehr
  // nachvollziehbar, dass ueberhaupt beobachtet wurde.
  const jetzt = new Date()
  let abgelaufen = 0
  for (const r of (data ?? []) as unknown as RohEintrag[]) {
    if (istAbgelaufen(r.created_at, jetzt, r.befristet_bis)) { abgelaufen += 1; continue }
    karte.set(r.user_id, ausRoh(r))
  }
  if (abgelaufen > 0) {
    log.info('Abgelaufene Ueberwachungen nicht beruecksichtigt', {
      anzahl: abgelaufen, hoechstdauerTage: HOECHSTDAUER_TAGE,
    })
  }
  return karte
}

/**
 * Eintrag zu einem Konto — oder `null`, wenn es nicht ueberwacht wird.
 *
 * Fehler beim Lesen ergeben `null`: die Meldung an privilegierte Konten
 * laeuft dann trotzdem, nur der Zusatzsatz fuer ueberwachte Konten
 * faellt weg. Der Fehler steht im Protokoll.
 */
export async function ueberwachungFuer(
  admin: AdminClient,
  userId: string,
): Promise<WatchlistEintrag | null> {
  try {
    if (!cache || Date.now() - cache.zeit > CACHE_MS) {
      cache = { zeit: Date.now(), eintraege: await ladeAktive(admin) }
    }
    return cache.eintraege.get(userId) ?? null
  } catch (err) {
    log.errorWithException('Ueberwachungspruefung fehlgeschlagen', err, { userId })
    return null
  }
}

/** Alle Konto-Kennungen mit aktivem Alarm. Fuer den Spiegel im Audit-Log. */
export async function ueberwachteKonten(admin: AdminClient): Promise<ReadonlySet<string>> {
  try {
    if (!cache || Date.now() - cache.zeit > CACHE_MS) {
      cache = { zeit: Date.now(), eintraege: await ladeAktive(admin) }
    }
    return new Set(cache.eintraege.keys())
  } catch {
    return new Set()
  }
}

// ─────────────────────────────────────────────────────────────────────
// Lesen fuer die Oberflaeche
// ─────────────────────────────────────────────────────────────────────

export interface WatchlistZeile extends WatchlistEintrag {
  /** Adresse des KONTOS (nicht die angegebene Gegenprobe-Adresse). */
  kontoEmail: string | null
  name: string | null
  rolle: string | null
  /** true, wenn email_kontrolle von der Adresse des Kontos abweicht. */
  adressenAbweichung: boolean
  /**
   * Frist des Eintrags. Ein abgelaufener Eintrag steht weiter in der
   * Liste — er WIRKT nur nicht mehr (siehe ladeAktive). Ihn verschwinden
   * zu lassen waere das Gegenteil von Transparenz: dann waere hinterher
   * nicht mehr nachvollziehbar, dass beobachtet wurde.
   */
  befristung: Befristung
  /**
   * Wirkt der Eintrag JETZT? `aktiv` allein reicht als Antwort nicht mehr,
   * seit es eine Frist gibt — und eine Liste, die „aktiv" sagt, wo nichts
   * mehr passiert, ist eine Falschauskunft.
   */
  wirktJetzt: boolean
}

export async function leseWatchlist(
  admin: AdminClient,
  organizationId: string,
  heute: Date = new Date(),
): Promise<WatchlistZeile[]> {
  let data: unknown = null
  let error: { code?: string; message?: string } | null = null
  for (const spalten of STAFFEL) {
    const versuch = await admin
      .from('security_watchlist')
      .select(spalten)
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .order('created_at', { ascending: false })
    data = versuch.data
    error = versuch.error
    if (!fehltSpalte(error)) break
  }
  if (error) return []

  const eintraege = ((data ?? []) as unknown as RohEintrag[]).map(ausRoh)
  if (eintraege.length === 0) return []

  const ids = [...new Set(eintraege.map(e => e.userId))]
  const { data: profile } = await admin
    .from('profiles')
    .select('id, first_name, last_name, email, role')
    .in('id', ids)

  const nach = new Map<string, { name: string | null; email: string | null; rolle: string | null }>()
  for (const p of profile ?? []) {
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
    nach.set(p.id as string, {
      name: name || null,
      email: (p.email as string) || null,
      rolle: (p.role as string) || null,
    })
  }

  return eintraege.map(e => {
    const p = nach.get(e.userId)
    const kontoEmail = p?.email ?? null
    const befristung = befristungFuer(e.createdAt, heute, e.befristetBis)
    return {
      ...e,
      kontoEmail,
      name: p?.name ?? null,
      rolle: p?.rolle ?? null,
      adressenAbweichung:
        !!e.emailKontrolle && !!kontoEmail
        && e.emailKontrolle.trim().toLowerCase() !== kontoEmail.trim().toLowerCase(),
      befristung,
      wirktJetzt: e.aktiv && !befristung.abgelaufen,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────
// Schreiben
// ─────────────────────────────────────────────────────────────────────

export interface WatchlistEingabe {
  userId: string
  organizationId: string | null
  aktiv: boolean
  grund: string
  meldeEmail?: string | null
  emailKontrolle?: string | null
  alleEreignisse?: boolean
  ohneSperrfrist?: boolean
  angelegtVon: string
  /**
   * Bezugsdatum. Kommt von aussen, damit „die Frist startet neu" gegen
   * ein festes Datum pruefbar ist — dieselbe Regel wie in befristung.ts.
   */
  heute?: Date
}

/**
 * Mindestlaenge der Begruendung beim EINSCHALTEN einer Ueberwachung.
 *
 * WARUM DAS EIN RIEGEL UND KEINE BITTE IST
 * Die Ueberwachung eines einzelnen Beschaeftigtenkontos protokolliert
 * jede Anmeldung, jedes Geraet und jede IP einer namentlich bekannten
 * Person. Sie ist damit keine Systemeinstellung, sondern eine Massnahme
 * gegen einen Menschen — und die braucht einen Grund, der aufgeschrieben
 * ist, bevor sie laeuft, nicht danach.
 *
 * Der bestehende Eintrag vom 30.08.2026 lautet „Kontoueberwachung auf
 * Anweisung der Geschaeftsfuehrung". Das benennt WER es angeordnet hat,
 * aber nicht WARUM, auf welcher Grundlage, wie lange und ob die
 * betroffene Person davon weiss. Genau diese vier Angaben verlangt der
 * Hinweistext in der Oberflaeche.
 *
 * 40 Zeichen sind keine inhaltliche Pruefung — die kann Code nicht
 * leisten. Sie schliessen nur das aus, was sicher zu wenig ist
 * („Test", „siehe Mail", ein Leerzeichen). Was drinsteht, verantwortet
 * die Person, die einschaltet; ihr Name steht in `angelegt_von`.
 */
export const GRUND_MINDESTLAENGE = 40

/**
 * Wortlaut fuer Oberflaeche und Fehlermeldung. Eine Stelle, damit die
 * Anforderung ueberall gleich lautet.
 */
export const TRANSPARENZ_HINWEIS =
  'Die Überwachung eines einzelnen Kontos zeichnet Anmeldungen, Geräte und '
  + 'IP-Adressen einer namentlich bekannten Person auf. Sie ist nur zulässig, '
  + 'wenn sie offen erfolgt. Bitte im Grund festhalten: (1) der konkrete Anlass, '
  + '(2) die Rechtsgrundlage, (3) der vorgesehene Zeitraum und (4) ob und wann '
  + 'die betroffene Person informiert wurde. Eine verdeckte Dauerüberwachung ist '
  + 'ausgeschlossen.'

export type SchreibErgebnis =
  | {
      ok: true
      eintragId: string
      vorher: WatchlistEintrag | null
      /** Die Frist, die ab jetzt gilt. */
      befristung: Befristung
      /**
       * true, wenn diese Anordnung die Frist NEU gestartet hat (neuer
       * Eintrag, wieder eingeschaltet oder nach Ablauf erneut angeordnet).
       * false beim blossen Bearbeiten einer laufenden Massnahme — dort
       * bleibt die Frist stehen, sonst liesse sich eine Ueberwachung
       * durch wiederholtes Speichern unbegrenzt verlaengern.
       */
      fristNeuGestartet: boolean
    }
  | {
      ok: false
      grund: string
      /**
       * `eingabe` = die Anordnung war unvollstaendig (Begruendung zu
       * knapp, Pflichtangaben fehlen). Das ist KEIN Serverfehler, und die
       * Route muss es als 400 beantworten: eine 400 sagt „bitte ergaenzen",
       * eine 500 sagt „bei uns ist etwas kaputt" — und schickt die
       * Verwaltung auf Fehlersuche am falschen Ort.
       */
      art: 'eingabe' | 'schreibfehler'
    }

/**
 * Legt einen Eintrag an oder aktualisiert ihn (ein Eintrag je Konto,
 * UNIQUE auf user_id).
 *
 * Der Vorzustand wird VORHER gelesen und zurueckgegeben — der Aufrufer
 * schreibt daraus das `watchlist_change`-Ereignis mit Vorher/Nachher.
 * Ohne diesen Schritt stuende in der Spur „geaendert" ohne Angabe, was.
 */
export async function setzeUeberwachung(
  admin: AdminClient,
  eingabe: WatchlistEingabe,
): Promise<SchreibErgebnis> {
  const jetzt = eingabe.heute ?? new Date()

  // Fail-closed beim EINSCHALTEN. Ausschalten bleibt jederzeit ohne
  // Huerde moeglich — eine Schranke davor waere genau falsch herum.
  if (eingabe.aktiv && eingabe.grund.trim().length < GRUND_MINDESTLAENGE) {
    return {
      ok: false,
      art: 'eingabe',
      grund: `Die Begründung ist zu knapp (mindestens ${GRUND_MINDESTLAENGE} Zeichen). `
        + TRANSPARENZ_HINWEIS,
    }
  }

  // ── Die vier Pflichtangaben (Befund 31.08.2026) ─────────────────────
  // Die Laenge allein belegt nichts. Ein Fliesstext ueber 40 Zeichen
  // erfuellte die bisherige Huerde, ohne zu sagen, WOZU beobachtet wird
  // und WORAUF sich das stuetzt — und genau danach fragt im Ernstfall
  // die Aufsichtsbehoerde. Die Marken sind in
  // lib/security/befristung.ts beschrieben; die Oberflaeche gibt eine
  // Vorlage vor, damit sie niemand auswendig kennen muss.
  if (eingabe.aktiv) {
    const angaben = pruefeAngaben(eingabe.grund)
    if (!angaben.ok) return { ok: false, art: 'eingabe', grund: angaben.meldung }
  }

  try {
    let bestand: unknown = null
    for (const spalten of STAFFEL) {
      const versuch = await admin
        .from('security_watchlist')
        .select(spalten)
        .eq('user_id', eingabe.userId)
        .maybeSingle()
      bestand = versuch.data
      if (!fehltSpalte(versuch.error)) break
    }

    const vorher = bestand ? ausRoh(bestand as RohEintrag) : null

    // ── Wann die Frist neu startet (Befund 01.09.2026) ────────────────
    // Vorher hing die Frist allein an `created_at`, und `created_at`
    // wurde beim Upsert nie angefasst. Folge: ein abgelaufener Eintrag
    // liess sich nicht wieder anordnen — „Einschalten" schrieb
    // `aktiv = true`, die Frist war im selben Moment wieder vorbei, und
    // die Oberflaeche meldete „Alarm ist aktiv". Eine Befristung ohne
    // Rueckweg ist keine Frist, sondern ein Einwegventil.
    //
    // Neu startet die Frist genau dann, wenn eingeschaltet wird und die
    // Massnahme NICHT ohnehin schon laeuft: bei einem neuen Eintrag,
    // nach dem Abschalten und nach Ablauf. Laeuft sie bereits, bleibt
    // `created_at` stehen — sonst liesse sich eine Ueberwachung durch
    // wiederholtes Speichern still verlaengern, und genau das soll die
    // Frist verhindern.
    const laeuftBereits = !!vorher && vorher.aktiv
      && !istAbgelaufen(vorher.createdAt, jetzt, vorher.befristetBis)
    const fristNeuGestartet = eingabe.aktiv && !laeuftBereits

    // Ausschalten ohne Begruendungstext ist zulaessig — die Huerde sitzt
    // vor dem Einschalten, nicht davor, eine Massnahme zu beenden.
    // `grund` ist aber NOT NULL, also wird der bestehende Text
    // uebernommen. Gibt es gar keinen Eintrag, ist nichts abzuschalten;
    // das ist eine Eingabefrage, kein Serverfehler.
    if (!eingabe.aktiv && !eingabe.grund.trim()) {
      if (!vorher) {
        return {
          ok: false,
          art: 'eingabe',
          grund: 'Zu diesem Konto gibt es keinen Überwachungseintrag, der abzuschalten wäre.',
        }
      }
    }

    const zeile: Record<string, unknown> = {
      user_id: eingabe.userId,
      organization_id: eingabe.organizationId,
      aktiv: eingabe.aktiv,
      grund: eingabe.grund.trim() || vorher?.grund || eingabe.grund,
      melde_email: eingabe.meldeEmail ?? null,
      email_kontrolle: eingabe.emailKontrolle ?? null,
      alle_ereignisse: eingabe.alleEreignisse ?? true,
      ohne_sperrfrist: eingabe.ohneSperrfrist ?? true,
      angelegt_von: eingabe.angelegtVon,
    }

    if (fristNeuGestartet) zeile.created_at = jetzt.toISOString()

    // `befristet_bis` (Migration 20261024000000): dort steht ein CHECK,
    // der einen AKTIVEN Eintrag ohne Frist gar nicht erst entstehen
    // laesst. Wer die Spalte nicht mitschreibt, bekommt nach dem
    // Anwenden der Migration bei JEDEM Einschalten einen 23514 — und der
    // faellt nicht in den Spalten-Rueckfall, weil er kein 42703 ist.
    // Der Wert ist derselbe, den der Anwendungscode ohnehin annimmt.
    const startFuerFrist = fristNeuGestartet
      ? jetzt.toISOString()
      : (vorher?.createdAt ?? jetzt.toISOString())
    if (eingabe.aktiv) {
      zeile.befristet_bis = fristNeuGestartet
        ? neuesFristende(jetzt)
        : (vorher?.befristetBis ?? befristungFuer(startFuerFrist, jetzt).laeuftAbAm)
    }

    // Beim Schreiben dieselbe Staffel wie beim Lesen: erst mit allen
    // Spalten, dann ohne die jeweils juengste Migration.
    let data: { id?: unknown } | null = null
    let error: { code?: string; message?: string } | null = null
    // Jede Stufe bekommt eine EIGENE Nutzlast. Wuerde dasselbe Objekt
    // weitergereicht und beschnitten, saehe man hinterher nicht mehr,
    // was auf welcher Stufe tatsaechlich hinausging — weder im Test noch
    // beim Nachlesen eines Fehlers.
    for (const stufe of [0, 1, 2]) {
      const nutzlast = { ...zeile }
      if (stufe >= 1) delete nutzlast.befristet_bis
      if (stufe >= 2) {
        // Ohne 20261018000004: die drei Spalten weglassen. Der Eintrag
        // wirkt dann mit dem Standardverhalten (voller Meldesatz, keine
        // Sperrfrist) — siehe ausRoh().
        delete nutzlast.alle_ereignisse
        delete nutzlast.ohne_sperrfrist
        delete nutzlast.email_kontrolle
      }
      const versuch = await admin
        .from('security_watchlist')
        .upsert(nutzlast, { onConflict: 'user_id' })
        .select('id')
        .single()
      data = versuch.data
      error = versuch.error
      if (!fehltSpalte(error)) break
    }

    if (error) {
      log.error('Ueberwachungseintrag nicht geschrieben', { errorCode: error.code })
      return {
        ok: false,
        art: 'schreibfehler',
        grund: `Eintrag nicht geschrieben (${error.code ?? 'unbekannt'})`,
      }
    }

    leereZwischenspeicher()

    // Die Frist, die JETZT gilt — nicht die, die angeordnet werden
    // sollte. Der Aufrufer meldet damit den wahren Zustand, statt
    // „aktiv" zu behaupten.
    const befristung = befristungFuer(
      startFuerFrist,
      jetzt,
      eingabe.aktiv ? (zeile.befristet_bis as string | undefined) ?? null : vorher?.befristetBis ?? null,
    )

    return {
      ok: true,
      eintragId: (data?.id as string) ?? '',
      vorher,
      befristung,
      fristNeuGestartet,
    }
  } catch (err) {
    log.errorWithException('Ueberwachungseintrag fehlgeschlagen', err)
    return { ok: false, art: 'schreibfehler', grund: 'Unerwarteter Fehler' }
  }
}
