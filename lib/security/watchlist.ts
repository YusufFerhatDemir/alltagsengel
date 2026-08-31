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
  }
}

const SPALTEN =
  'id, user_id, organization_id, aktiv, alle_ereignisse, ohne_sperrfrist, ' +
  'melde_email, email_kontrolle, grund, angelegt_von, created_at'
/** Spaltensatz vor 20261018000004 — Rueckfallebene. */
const SPALTEN_ALT =
  'id, user_id, organization_id, aktiv, melde_email, grund, angelegt_von, created_at'

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
  let { data, error } = await admin
    .from('security_watchlist')
    .select(SPALTEN)
    .eq('aktiv', true)

  // 42703 = unbekannte Spalte: die Erweiterung 20261018000004 fehlt.
  // Noch einmal mit dem alten Spaltensatz, statt die Ueberwachung
  // wegen eines fehlenden Einrichtungsschritts komplett auszusetzen.
  if (error && (error.code === '42703' || error.code === 'PGRST204')) {
    const zweiter = await admin
      .from('security_watchlist')
      .select(SPALTEN_ALT)
      .eq('aktiv', true)
    // Der zweite Spaltensatz ist eine andere Form; die Typen des Clients
    // leiten sich vom Literal ab und passen deshalb nicht aufeinander.
    // Die Auswertung laeuft ohnehin ueber ausRoh().
    data = zweiter.data as unknown as typeof data
    error = zweiter.error
  }

  if (error) {
    if (error.code !== '42P01' && error.code !== 'PGRST205') {
      log.error('Ueberwachungsliste nicht lesbar', { errorCode: error.code })
    }
    return karte
  }

  for (const r of (data ?? []) as unknown as RohEintrag[]) {
    karte.set(r.user_id, ausRoh(r))
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
}

export async function leseWatchlist(
  admin: AdminClient,
  organizationId: string,
): Promise<WatchlistZeile[]> {
  let { data, error } = await admin
    .from('security_watchlist')
    .select(SPALTEN)
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .order('created_at', { ascending: false })

  if (error && (error.code === '42703' || error.code === 'PGRST204')) {
    const zweiter = await admin
      .from('security_watchlist')
      .select(SPALTEN_ALT)
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .order('created_at', { ascending: false })
    data = zweiter.data as unknown as typeof data
    error = zweiter.error
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
    return {
      ...e,
      kontoEmail,
      name: p?.name ?? null,
      rolle: p?.rolle ?? null,
      adressenAbweichung:
        !!e.emailKontrolle && !!kontoEmail
        && e.emailKontrolle.trim().toLowerCase() !== kontoEmail.trim().toLowerCase(),
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
  | { ok: true; eintragId: string; vorher: WatchlistEintrag | null }
  | { ok: false; grund: string }

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
  // Fail-closed beim EINSCHALTEN. Ausschalten bleibt jederzeit ohne
  // Huerde moeglich — eine Schranke davor waere genau falsch herum.
  if (eingabe.aktiv && eingabe.grund.trim().length < GRUND_MINDESTLAENGE) {
    return {
      ok: false,
      grund: `Die Begründung ist zu knapp (mindestens ${GRUND_MINDESTLAENGE} Zeichen). `
        + TRANSPARENZ_HINWEIS,
    }
  }

  try {
    const { data: bestand } = await admin
      .from('security_watchlist')
      .select(SPALTEN)
      .eq('user_id', eingabe.userId)
      .maybeSingle()

    const vorher = bestand ? ausRoh(bestand as unknown as RohEintrag) : null

    const zeile: Record<string, unknown> = {
      user_id: eingabe.userId,
      organization_id: eingabe.organizationId,
      aktiv: eingabe.aktiv,
      grund: eingabe.grund,
      melde_email: eingabe.meldeEmail ?? null,
      email_kontrolle: eingabe.emailKontrolle ?? null,
      alle_ereignisse: eingabe.alleEreignisse ?? true,
      ohne_sperrfrist: eingabe.ohneSperrfrist ?? true,
      angelegt_von: eingabe.angelegtVon,
    }

    let { data, error } = await admin
      .from('security_watchlist')
      .upsert(zeile, { onConflict: 'user_id' })
      .select('id')
      .single()

    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      // Ohne 20261018000004: die drei Spalten weglassen. Der Eintrag
      // wirkt dann mit dem Standardverhalten (voller Meldesatz, keine
      // Sperrfrist) — siehe ausRoh().
      delete zeile.alle_ereignisse
      delete zeile.ohne_sperrfrist
      delete zeile.email_kontrolle
      const zweiter = await admin
        .from('security_watchlist')
        .upsert(zeile, { onConflict: 'user_id' })
        .select('id')
        .single()
      data = zweiter.data
      error = zweiter.error
    }

    if (error) {
      log.error('Ueberwachungseintrag nicht geschrieben', { errorCode: error.code })
      return { ok: false, grund: `Eintrag nicht geschrieben (${error.code ?? 'unbekannt'})` }
    }

    leereZwischenspeicher()
    return { ok: true, eintragId: (data?.id as string) ?? '', vorher }
  } catch (err) {
    log.errorWithException('Ueberwachungseintrag fehlgeschlagen', err)
    return { ok: false, grund: 'Unerwarteter Fehler' }
  }
}
