// ═══════════════════════════════════════════════════════════════════════
// Sicherheits-Audit — der Schreibweg
// ═══════════════════════════════════════════════════════════════════════
//
// Ein Aufruf, eine Zeile in security_audit_log. Alles, was den Aufruf
// beschreibt (IP, Geraet, Plattform, Organisation), wird HIER aus dem
// Request gezogen — nie aus dem Body. Was im Body steht, hat der Client
// geschrieben.
//
// FAIL-SOFT, ABER MIT SPUR
// Dieselbe Regel wie in lib/audit-log.ts: eine gescheiterte
// Protokollzeile darf die eigentliche Handlung nicht abbrechen — lieber
// eine funktionierende Anmeldung ohne Protokollzeile als eine
// ausgesperrte Pflegekraft. Der Fehlschlag geht aber ueber den
// strukturierten Logger raus und ist damit auffindbar; er wird NICHT
// verschluckt.
//
// GEHEIMNISSE
// `metadata` wird rekursiv gefiltert, bevor irgendetwas die Datenbank
// sieht (VERBOTENE_SCHLUESSEL). Zusaetzlich filtert
// public.log_security_event() in SQL noch einmal — zwei Siebe, weil
// dieses Sieb nur greift, wenn der Aufruf durch diese Datei geht.
// ═══════════════════════════════════════════════════════════════════════

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import {
  regelFuer,
  hoechsterSchweregrad,
  istKategorie,
  istSchweregrad,
  type Kategorie,
  type Schweregrad,
} from './ereignisse'
import { geraeteMerkmale, geraeteHash, ipAus, type Plattform } from './geraet'
import { leiteProvenienzAb, kennzeichen, type Provenienz } from './herkunft'

const log = logger.child('security-audit')

// ─────────────────────────────────────────────────────────────────────
// Geheimnisse
// ─────────────────────────────────────────────────────────────────────

/**
 * Schluessel, deren Wert NIE in die Spur darf. Der Abgleich laeuft
 * kleingeschrieben und als Teilzeichenkette: `neuesPasswort`,
 * `access_token` und `Authorization` fallen alle darunter.
 *
 * Die Liste ist bewusst grob. Ein zu Unrecht entfernter Wert kostet
 * Kontext in einer Protokollzeile; ein zu Unrecht behaltener Wert ist
 * ein Geheimnis in einer Tabelle, die per Definition lange aufbewahrt
 * wird.
 */
export const VERBOTENE_SCHLUESSEL: readonly string[] = [
  'passwor', 'password', 'passwd', 'pass',
  'token', 'jwt', 'bearer',
  'cookie', 'session_id', 'sessionid', 'session_token',
  'authorization', 'auth_header',
  'secret', 'geheim',
  'api_key', 'apikey', 'anon_key', 'service_role',
  'private_key', 'client_secret',
  'otp', 'totp', 'mfa_secret', 'recovery_code', 'backup_code',
  'iban', 'bic', 'kontonummer',
  'credit_card', 'kreditkarte', 'cvv',
]

export const ENTFERNT = '[entfernt]' as const

function istVerboten(schluessel: string): boolean {
  const k = schluessel.toLowerCase()
  return VERBOTENE_SCHLUESSEL.some(v => k.includes(v))
}

/**
 * Entfernt Geheimnisse rekursiv. Tiefe und Groesse sind gedeckelt:
 * eine Protokollzeile ist kein Datenspeicher, und ein unbeabsichtigt
 * durchgereichtes Objekt darf die Tabelle nicht sprengen.
 */
export function bereinigeMetadaten(wert: unknown, tiefe = 0): unknown {
  if (tiefe > 6) return '[zu tief]'
  if (wert === null || wert === undefined) return null
  if (typeof wert === 'string') return wert.length > 2000 ? wert.slice(0, 2000) + '…' : wert
  if (typeof wert === 'number' || typeof wert === 'boolean') return wert
  if (wert instanceof Date) return wert.toISOString()
  if (Array.isArray(wert)) return wert.slice(0, 100).map(e => bereinigeMetadaten(e, tiefe + 1))
  if (typeof wert === 'object') {
    const aus: Record<string, unknown> = {}
    let anzahl = 0
    for (const [k, v] of Object.entries(wert as Record<string, unknown>)) {
      if (anzahl++ >= 100) { aus['…'] = '[gekuerzt]'; break }
      aus[k] = istVerboten(k) ? ENTFERNT : bereinigeMetadaten(v, tiefe + 1)
    }
    return aus
  }
  // Funktionen, Symbole, BigInt: nichts, was in ein Protokoll gehoert.
  return String(wert).slice(0, 200)
}

// ─────────────────────────────────────────────────────────────────────
// Eingabe
// ─────────────────────────────────────────────────────────────────────

export interface SicherheitsEreignis {
  /** Pflicht. Katalog in lib/security/ereignisse.ts — unbekannte Werte
   *  werden trotzdem geschrieben. */
  eventType: string
  /** Betroffenes Konto. NULL bei fehlgeschlagener Anmeldung zu einer
   *  unbekannten Adresse. */
  userId?: string | null
  /** Adress-Schnappschuss. Wird ergaenzt, wenn nur userId vorliegt. */
  userEmail?: string | null
  /** Weglassen ⇒ wird aus dem Konto aufgeloest. */
  organizationId?: string | null
  /** Weglassen ⇒ aus dem Katalog. */
  eventCategory?: Kategorie | string | null
  /** Weglassen ⇒ aus dem Katalog. Ein hoeherer Wert gewinnt, ein
   *  niedrigerer wird ignoriert (siehe hoechsterSchweregrad). */
  severity?: Schweregrad | null
  metadata?: Record<string, unknown>
  /**
   * Kennzeichnet dieses Ereignis ausdruecklich als NICHT-echt
   * ('TEST_ALERT', 'ADMIN_TEST', 'SYNTHETIC_EVENT').
   *
   * Kann nur HERABSTUFEN. Ein echter Wert wird hier verworfen — eine
   * echte Anmeldung entsteht ausschliesslich daraus, dass ein Mensch
   * einen HTTP-Aufruf gemacht hat, nie aus einer Behauptung des
   * Aufrufers. Siehe lib/security/herkunft.ts.
   */
  alsTest?: Provenienz | null
  /** Aufruf, aus dem IP, User-Agent, Plattform und App-Version kommen. */
  request?: Request | Headers | Record<string, string | undefined> | null
  /** Undurchsichtige Sitzungskennung. NIE ein Session-Token. */
  sessionReference?: string | null
  /**
   * Geraetepruefung ausfuehren (bekannt/unbekannt) und bei einem neuen
   * Geraet zusaetzlich `unknown_device` schreiben. Nur fuer Anmelde- und
   * Sitzungsereignisse sinnvoll.
   */
  geraetePruefung?: boolean
}

export interface EreignisErgebnis {
  ok: boolean
  /** Kennung des Eintrags — steht so auch in der Meldemail. */
  id: string | null
  /** Bei aktivierter Geraetepruefung: war das Geraet neu? */
  neuesGeraet?: boolean
  /** Bei aktivierter Geraetepruefung: die Geraete-Kennung. */
  geraeteHash?: string | null
  /** Die tatsaechlich geschriebene Organisation (ggf. aufgeloest). */
  organizationId?: string | null
  /** Die tatsaechlich geschriebene Adresse (ggf. nachgeschlagen). */
  userEmail?: string | null
  /**
   * Die ABGELEITETE Provenienz — echt oder nachgestellt. Steht so auch in
   * `metadata.provenienz` der geschriebenen Zeile und gehoert in jede
   * Meldung, die daraus entsteht.
   */
  provenienz?: Provenienz
}

// ─────────────────────────────────────────────────────────────────────
// Organisation
// ─────────────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Mandant eines Kontos — ohne Cookie, damit die Funktion auch dort
 * arbeitet, wo es keine Sitzung gibt (fehlgeschlagene Anmeldung,
 * Hintergrundlauf).
 *
 * Dieselbe Reihenfolge wie resolveUserOrgId() in
 * lib/organizations/server.ts: Mitgliedschaft → Engel → Klient → null.
 * Fail-closed: keine stille Zuordnung zur Stamm-Organisation.
 */
export async function organisationFuerKonto(
  admin: AdminClient,
  userId: string,
): Promise<string | null> {
  // GEPRUEFT 01.09.2026 (Dienstschluessel-Pass) — dass die vier
  // Abfragen unten ihren Fehler verwerfen, ist Absicht: jede endet im
  // Zweifel bei `return null`, und `null` heisst hier „kein Mandant
  // feststellbar", nicht „Stamm-Organisation". Das ist genau die
  // fail-closed-Zusage aus dem Kopf dieser Funktion.
  //
  // Der Preis ist benannt: bei einer Stoerung verliert die
  // Sicherheitsmeldung ihren Zustellkontext und geht als Einmalversuch
  // hinaus (siehe die Erlaeuterung zur vierten Quelle weiter unten).
  // Das ist hinnehmbar — eine falsche Mandantenzuordnung an einer
  // Sicherheitsmeldung waere es nicht.
  try {
    const { data: mitglied } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (mitglied?.organization_id) return mitglied.organization_id as string

    const { data: engel } = await admin
      .from('caregivers')
      .select('organization_id')
      .eq('user_id', userId)
      .not('organization_id', 'is', null)
      .limit(1)
      .maybeSingle()
    if (engel?.organization_id) return engel.organization_id as string

    const { data: klient } = await admin
      .from('clients')
      .select('organization_id')
      .eq('user_id', userId)
      .not('organization_id', 'is', null)
      .limit(1)
      .maybeSingle()
    if (klient?.organization_id) return klient.organization_id as string

    // VIERTE QUELLE — die Ueberwachungsliste.
    //
    // BEFUND 31.08.2026, live gemessen: ein Konto mit der Rolle `engel`
    // steht in KEINER der drei Tabellen oben. Engel liegen in `angels`,
    // und die Tabelle hat weder user_id noch organization_id. Fuer die
    // groesste Nutzergruppe des Systems lieferte diese Funktion damit
    // immer null — und das ist nicht folgenlos:
    // meldeSicherheitsereignis() haengt den Zustellkontext NUR an, wenn
    // eine Organisation feststeht. Ohne sie ging jede Sicherheitsmeldung
    // als Einmalversuch raus: keine Zeile in notification_delivery_log,
    // keine Provider-Nachrichten-ID im eigenen Bestand, keine
    // Wiederholung. Ein Fehlschlag waere endgueltig und unsichtbar
    // gewesen. Gemessen an der Testmeldung 8dfd95d7: die Mail kam an —
    // aber belegen liess sich das nur bei Resend selbst, nirgends hier.
    //
    // WARUM DAS KEINE STILLE ZUORDNUNG IST
    // Der Kopf dieser Funktion sagt „fail-closed: keine stille Zuordnung
    // zur Stamm-Organisation" — und dabei bleibt es. Ein Eintrag in
    // security_watchlist ist keine Vermutung, sondern eine ausdrueckliche
    // Festlegung eines Menschen: dieses Konto gehoert zu diesem
    // Mandanten und wird dort ueberwacht. Sie wird nur gelesen, wenn sie
    // AKTIV ist; eine abgeschaltete Ueberwachung entscheidet nichts.
    const { data: ueberwachung } = await admin
      .from('security_watchlist')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('aktiv', true)
      .not('organization_id', 'is', null)
      .limit(1)
      .maybeSingle()
    if (ueberwachung?.organization_id) return ueberwachung.organization_id as string

    return null
  } catch {
    return null
  }
}

/**
 * Konto zu einer Adresse — fuer den fehlgeschlagenen Anmeldeversuch.
 *
 * Ohne diese Aufloesung stuende jeder Fehlversuch mandantenlos in der
 * Spur, und die Sicherheitsansicht einer Organisation saehe die Angriffe
 * auf ihre eigenen Konten nicht. Gelesen wird `profiles.email` — die
 * Adminliste der Auth-Nutzer (listUsers) waere fuer jeden Fehlversuch
 * ein Vollscan.
 *
 * Ein `null` bedeutet: zu dieser Adresse gibt es kein Konto. Genau diese
 * Zeilen bleiben ohne Mandanten (siehe Migrationskopf) — und genau sie
 * sind das Merkmal fuer ein Durchprobieren von aussen.
 */
export async function kontoFuerEmail(
  admin: AdminClient,
  email: string | null | undefined,
): Promise<{ userId: string; email: string } | null> {
  const adresse = email?.trim().toLowerCase()
  if (!adresse || !adresse.includes('@')) return null
  try {
    // Gleichheit, NICHT ilike: in einem LIKE-Muster sind `%` und `_`
    // Platzhalter, und `_` kommt in Adressen regelmaessig vor —
    // `john_doe@…` traefe damit auch `johnXdoe@…` und ordnete den
    // Fehlversuch dem falschen Mandanten zu. GoTrue legt Adressen
    // kleingeschrieben an, der Vergleich unten ist deshalb exakt.
    const { data } = await admin
      .from('profiles')
      .select('id, email')
      .eq('email', adresse)
      .limit(1)
      .maybeSingle()
    if (!data?.id) return null
    return { userId: data.id as string, email: (data.email as string) || adresse }
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────
// Geraete
// ─────────────────────────────────────────────────────────────────────

/**
 * Merkt sich das Geraet und meldet, ob es neu war.
 *
 * Beim ALLERERSTEN Geraet eines Kontos wird bewusst KEIN „unbekanntes
 * Geraet" gemeldet: es gibt noch nichts, wovon es abweichen koennte,
 * und eine Meldung direkt nach der Registrierung erzieht nur dazu,
 * solche Mails zu ignorieren.
 */
export async function geraetPruefen(
  admin: AdminClient,
  userId: string,
  plattform: Plattform,
  userAgent: string | null,
  bezeichnung: string,
): Promise<{ neu: boolean; hash: string }> {
  const hash = geraeteHash(userId, plattform, userAgent)
  try {
    const { data: bekannt } = await admin
      .from('security_known_devices')
      .select('id, seen_count')
      .eq('user_id', userId)
      .eq('device_hash', hash)
      .maybeSingle()

    if (bekannt?.id) {
      await admin
        .from('security_known_devices')
        .update({ last_seen_at: new Date().toISOString(), seen_count: (bekannt.seen_count ?? 0) + 1 })
        .eq('id', bekannt.id)
      return { neu: false, hash }
    }

    const { count } = await admin
      .from('security_known_devices')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    await admin.from('security_known_devices').insert({
      user_id: userId,
      device_hash: hash,
      platform: plattform,
      user_agent: userAgent,
      device_label: bezeichnung,
    })

    return { neu: (count ?? 0) > 0, hash }
  } catch (err) {
    // Ein Fehler in der Geraetepruefung darf das Ereignis selbst nicht
    // verhindern. „Nicht neu" ist der stillere der beiden Irrtuemer und
    // erzeugt keine Falschmeldung.
    log.errorWithException('Geraetepruefung fehlgeschlagen', err, { userId })
    return { neu: false, hash }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Schreiben
// ─────────────────────────────────────────────────────────────────────

/**
 * „Die Tabelle gibt es (noch) nicht" — Postgres meldet 42P01, PostgREST
 * verpackt dasselbe als PGRST205.
 */
function fehltDieTabelle(error: { code?: string | null; message?: string | null }): boolean {
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const m = (error.message ?? '').toLowerCase()
  return m.includes('does not exist') && m.includes('security_audit_log')
}

/**
 * Schreibt ein Sicherheitsereignis.
 *
 * Rueckgabe ist NICHT als Guard fuer die eigentliche Handlung gedacht
 * (Fail-soft-Prinzip) — nur zum Melden und fuer die Ereigniskennung in
 * der Benachrichtigung.
 */
export async function logSecurityEvent(ereignis: SicherheitsEreignis): Promise<EreignisErgebnis> {
  try {
    const admin = createAdminClient()
    const regel = regelFuer(ereignis.eventType)

    const merkmale = geraeteMerkmale(ereignis.request ?? null)
    const ip = ipAus(ereignis.request ?? null)

    const kategorie = istKategorie(ereignis.eventCategory)
      ? ereignis.eventCategory
      : regel.kategorie

    const schweregrad = istSchweregrad(ereignis.severity)
      ? hoechsterSchweregrad(regel.schweregrad, ereignis.severity)
      : regel.schweregrad

    let organizationId = ereignis.organizationId ?? null
    if (!organizationId && ereignis.userId) {
      organizationId = await organisationFuerKonto(admin, ereignis.userId)
    }

    let email = ereignis.userEmail ?? null
    if (!email && ereignis.userId) {
      const { data } = await admin.auth.admin.getUserById(ereignis.userId)
      email = data?.user?.email ?? null
    }

    let neuesGeraet: boolean | undefined
    // Nicht `geraeteHash` nennen: das ist der Name der importierten
    // Funktion, und eine Verschattung im selben Modul liest sich falsch.
    let kennung: string | null = null
    const metadata: Record<string, unknown> = {
      ...(ereignis.metadata ?? {}),
    }

    // ── Provenienz ──────────────────────────────────────────────────
    // ABGELEITET, nicht uebernommen. Ein Aufrufer kann sie nicht setzen:
    // `metadata.provenienz` aus der Eingabe wird ueberschrieben, und die
    // Testerklaerung kann nur herabstufen.
    //
    // „Echter Aufruf" heisst: es liegt ein Request/Headers-Objekt vor,
    // das einen User-Agent traegt. Ein Skript, ein Cron-Lauf oder ein
    // Nachzuegler hat das nicht — die schreiben ohne `request`. Das ist
    // die Grenze zwischen „ein Mensch hat gehandelt" und „eine Maschine
    // hat nachgetragen", und sie ergibt sich aus dem SCHREIBWEG statt
    // aus einer Angabe, die man auch danebensetzen kann.
    const ausEchtemAufruf = !!ereignis.request && !!merkmale.userAgent
    const provenienz = leiteProvenienzAb(ereignis.eventType, {
      ausEchtemAufruf,
      alsTestErklaert: ereignis.alsTest ?? null,
    })
    // Drei Schluessel aus EINER Quelle: provenienz (genau), is_test
    // (die eine Frage, die im Ernstfall zaehlt) und source (grob, fuer
    // Auswertungen). Sie werden gemeinsam gesetzt und koennen deshalb
    // nicht auseinanderlaufen. Ein vom Aufrufer mitgegebener Wert wird
    // dabei UEBERSCHRIEBEN — die Kennzeichnung ist nicht verhandelbar.
    Object.assign(metadata, kennzeichen(provenienz))

    if (ereignis.geraetePruefung && ereignis.userId) {
      const { neu, hash } = await geraetPruefen(
        admin, ereignis.userId, merkmale.plattform, merkmale.userAgent, merkmale.bezeichnung,
      )
      neuesGeraet = neu
      kennung = hash
      metadata.geraet_hash = hash
      metadata.geraet_neu = neu
    }

    const zeile = {
      user_id: ereignis.userId ?? null,
      user_email: email,
      organization_id: organizationId,
      event_type: ereignis.eventType,
      event_category: kategorie,
      ip_address: ip,
      user_agent: merkmale.userAgent,
      platform: merkmale.plattform,
      device_info: merkmale.deviceInfo,
      app_version: merkmale.appVersion,
      session_reference: ereignis.sessionReference ?? null,
      metadata: bereinigeMetadaten(metadata) as Record<string, unknown>,
      severity: schweregrad,
    }

    const { data, error } = await admin
      .from('security_audit_log')
      .insert(zeile)
      .select('id')
      .single()

    if (error) {
      // Solange die Migration nicht angewendet ist, gibt es die Tabelle
      // nicht. Das ist KEIN Fehlschlag im Betrieb, sondern ein noch
      // offener Einrichtungsschritt — und es waere bei jeder einzelnen
      // Anmeldung eine Fehlermeldung. Deshalb eine eigene, ruhigere
      // Meldung mit klarer Handlungsanweisung statt error-Rauschen, das
      // nach einer Woche niemand mehr liest.
      if (fehltDieTabelle(error)) {
        log.warn('Sicherheitsspur nicht eingerichtet — Migration 20261018000002 fehlt', {
          eventType: ereignis.eventType,
        })
        return { ok: false, id: null, neuesGeraet, geraeteHash: kennung, organizationId, userEmail: email, provenienz }
      }
      // AUTH-002: kein rohes Fehlerobjekt ins Protokoll.
      log.error('SICHERHEITSSPUR-LUECKE — Eintrag nicht geschrieben', {
        errorCode: error.code,
        errorMessage: error.message,
        eventType: ereignis.eventType,
        // LogContext.userId ist `string | undefined` — `null` waere ein
        // Typfehler und im Protokoll ohnehin dasselbe wie „nicht gesetzt".
        userId: ereignis.userId ?? undefined,
      })
      return { ok: false, id: null, neuesGeraet, geraeteHash: kennung, organizationId, userEmail: email, provenienz }
    }

    return { ok: true, id: (data?.id as string) ?? null, neuesGeraet, geraeteHash: kennung, organizationId, userEmail: email, provenienz }
  } catch (err) {
    log.errorWithException('SICHERHEITSSPUR-LUECKE — unerwarteter Fehler', err, {
      eventType: ereignis.eventType,
    })
    return { ok: false, id: null }
  }
}
