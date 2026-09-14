// ═══════════════════════════════════════════════════════════════════════
// Wiederholungslauf fuer Benachrichtigungen (Retry-Worker + Dead Letter)
// ═══════════════════════════════════════════════════════════════════════
//
// WAS VORHER FEHLTE
// notification_delivery_log (20260923000000) protokolliert jeden
// Zustellversuch, und lib/notifications/retry.ts kann idempotent
// nachversenden. Es gab aber keinen Aufrufer: eine an einem
// Resend-Ausfall gescheiterte Mail blieb fuer immer liegen. Dieser
// Worker ist dieser Aufrufer; er haengt am Cron
// /api/cron/zustellung-retry (alle 5 Minuten).
//
// DIE FUENF SICHERUNGEN
//   1. SPERRE — zustellung_retry_beanspruchen(). Genau ein Lauf
//      gleichzeitig, gehalten von einer Tabellenzeile (kein Session-Lock;
//      Begruendung in der Migration). Ein abgestuerzter Lauf gibt die
//      Sperre ueber den Herzschlag nach staleMinuten wieder frei.
//   2. IDEMPOTENZ — jeder Versand laeuft durch sendeIdempotent(), also
//      durch die fail-closed Vorabpruefung UND den partiellen
//      Unique-Index uq_notification_delivery_log_erfolg. Selbst wenn
//      Sperre 1 versagt, kann derselbe Vorgang nicht zweimal rausgehen.
//   3. WARTEZEIT — exponentiell (1, 5, 15, 60, 240 Minuten). Ein
//      Provider-Ausfall fuehrt nicht zu Hunderten Versuchen.
//   4. OBERGRENZE — nach MAX_VERSUCHE geht der Vorgang ins Dead Letter
//      und wird nie wieder angefasst.
//   5. FEHLERKLASSE — was dauerhaft nicht zustellbar ist (ungueltige
//      Adresse, geloeschte Buchung), landet SOFORT im Dead Letter, statt
//      fuenf Stunden Wartezeit zu verbrennen.
//
// ABSTURZSICHER
// Der Fortschritt liegt nicht im Prozess, sondern in den Zeilen: jeder
// Versuch schreibt seine eigene Protokollzeile. Stirbt der Worker nach
// dem dritten von zehn Vorgaengen, sieht der naechste Lauf drei
// Vorgaenge mit frischem Versuch (die warten jetzt) und sieben
// unveraenderte — er macht bei Nummer vier weiter. Es gibt keinen
// Zwischenstand, der verloren gehen koennte.
//
// MANDANTENGRENZE
// Der Lauf ist mandantenuebergreifend, die Verarbeitung nicht: jede
// Abfrage filtert explizit auf organization_id, und die
// organization_id wandert in jede geschriebene Zeile.
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import {
  protokolliereZustellung,
  zustellspurSchemaBereit,
  type ZustellGrund,
  type ZustellKanal,
} from '@/lib/notifications/delivery-log'
import {
  MAX_VERSUCHE,
  offeneZustellungen,
  sendeIdempotent,
  wartezeitMinuten,
  type OffeneZustellung,
} from '@/lib/notifications/retry'
import { istDauerhaft } from '@/lib/notifications/fehlerklassen'
import { holeWiederhersteller } from '@/lib/notifications/wiederherstellung'
// Nebenwirkungs-Import: fuellt das Vorgangsregister. Ohne ihn kennt der
// Lauf keine einzige Vorgangsart und schiebt alles ins Dead Letter.
import '@/lib/notifications/vorgaenge'

const log = logger.child('retry-worker')

/** Sperre gilt als verwaist, wenn der Herzschlag aelter ist. */
const STALE_MINUTEN = 10

/**
 * Wie lange eine 'queued'-Zeile stehen darf, bevor sie als haengen
 * geblieben gilt. Kuerzer als die erste Wartezeit waere unsinnig — der
 * Erstversand laeuft ja noch.
 */
const QUEUED_SCHWELLE_MINUTEN = 10

/**
 * Ab wann eine Zustellung OHNE Vorgangsbezug ins Dead Letter geht.
 *
 * Solche Zeilen kann niemand wiederherstellen (Protokoll ohne Inhalt,
 * correlation_id ist ein Hash). Sie sofort wegzuraeumen waere aber
 * falsch: waehrend eines Deployments kann eine Zeile von einer alten
 * Instanz stammen, deren Vorgangsart die neue schon kennt. Ein Tag
 * Karenz deckt das ab.
 */
const OHNE_VORGANG_NACH_STUNDEN = 24

/** Vorgaenge je Lauf. Deckel gegen ein durchgelaufenes Zeitbudget. */
const MAX_VORGAENGE = 200

/** Zeitbudget. Vercel-Funktionen haben eine harte Obergrenze. */
const ZEITBUDGET_MS = 45_000

/**
 * Nach so vielen ANGEFASSTEN Vorgaengen wird der Herzschlag erneuert.
 *
 * Gezaehlt wird jeder Vorgang, den die Schleife in die Hand nimmt — auch
 * ein wartender. Ein Lauf, der 200 Zeilen durchsieht und keine einzige
 * versendet, braucht seinen Herzschlag genauso: sonst haelt er eine
 * Sperre, die von aussen wie verwaist aussieht.
 */
const HEARTBEAT_ALLE = 20

export interface RetryWorkerOptionen {
  admin?: SupabaseClient
  zeitbudgetMs?: number
  maxVorgaenge?: number
  staleMinuten?: number
  queuedSchwelleMinuten?: number
  ohneVorgangNachStunden?: number
  /** Nur diese Organisationen bearbeiten (Tests, gezielter Nachlauf). */
  organisationen?: string[]
  /** Zeitquelle — in Tests einsetzbar, um Wartezeiten zu ueberspringen. */
  jetzt?: () => number
}

export interface RetryWorkerMetriken {
  /** Vorgaenge, bei denen tatsaechlich ein Versand versucht wurde. */
  verarbeitet: number
  erfolgreich: number
  fehlgeschlagen: number
  deadLetter: number
  /** Kein Versand noetig/moeglich (kein Abo, kein Schluessel, kein Empfaenger). */
  uebersprungen: number
  /** Noch in der Wartezeit — im naechsten Lauf wieder dran. */
  wartend: number
  /** Zeilen ohne correlation_id: strukturell nicht wiederholbar. */
  ohneVorgangsId: number
  organisationen: number
}

export type RetryWorkerStatus = 'fertig' | 'abgebrochen' | 'blockiert' | 'nicht_bereit'

export interface RetryWorkerErgebnis {
  ok: boolean
  status: RetryWorkerStatus
  laufId: string | null
  /** true, wenn eine verwaiste Sperre uebernommen wurde. */
  uebernommen: boolean
  grund?: string
  /**
   * true, wenn der Lauf seinen Abschluss NICHT in die Datenbank bekam.
   *
   * Der Eintrag steht dann weiter auf 'laeuft', und der naechste Lauf
   * ist entweder blockiert oder meldet faelschlich, der vorige sei
   * abgestuerzt. Ohne dieses Feld waere das an der Rueckgabe nicht
   * ablesbar (Block 100).
   */
  abschlussOffen?: boolean
  dauerMs: number
  metriken: RetryWorkerMetriken
}

function leereMetriken(): RetryWorkerMetriken {
  return {
    verarbeitet: 0,
    erfolgreich: 0,
    fehlgeschlagen: 0,
    deadLetter: 0,
    uebersprungen: 0,
    wartend: 0,
    ohneVorgangsId: 0,
    organisationen: 0,
  }
}

async function holeClient(admin?: SupabaseClient): Promise<SupabaseClient | null> {
  if (admin) return admin
  try {
    const mod = await import('@/lib/supabase/admin')
    return mod.createAdminClient()
  } catch (err) {
    log.errorWithException('Kein Admin-Client fuer den Wiederholungslauf', err)
    return null
  }
}

/**
 * Neueste Zeile je (Vorgang, Kanal).
 *
 * Nach vier Fehlversuchen stehen vier failed-Zeilen im Protokoll. Ohne
 * diese Verdichtung wuerde der Lauf denselben Vorgang viermal anfassen —
 * die drei Wiederholungen liefen zwar in sendeIdempotent auf die
 * Wartezeit, kosteten aber je zwei Abfragen.
 */
function verdichte(zeilen: OffeneZustellung[]): OffeneZustellung[] {
  const neueste = new Map<string, OffeneZustellung>()
  for (const z of zeilen) {
    if (!z.correlationId) continue
    const schluessel = `${z.correlationId}:${z.channel}`
    const bisher = neueste.get(schluessel)
    if (!bisher) {
      neueste.set(schluessel, z)
      continue
    }
    // Hoechster Versuchszaehler gewinnt; bei Gleichstand das juengere
    // created_at. attempt_count ist die belastbarere Groesse, weil
    // Zeitstempel bei parallelen Laeufen dicht beieinander liegen.
    const neuer =
      z.attemptCount > bisher.attemptCount ||
      (z.attemptCount === bisher.attemptCount && z.createdAt > bisher.createdAt)
    if (neuer) neueste.set(schluessel, z)
  }
  return Array.from(neueste.values())
}

/**
 * Schreibt die Dead-Letter-Zeile.
 *
 * Status 'skipped' — nicht 'failed': ein Fehlversuch war es nicht, es
 * wurde gar nicht mehr gesendet. `grund` macht die Zeile fuer die
 * Betriebsansicht filterbar und blendet den Vorgang in
 * offeneZustellungen() dauerhaft aus.
 */
async function insDeadLetter(
  admin: SupabaseClient,
  zeile: OffeneZustellung,
  grund: ZustellGrund,
  fehler?: unknown
): Promise<void> {
  await protokolliereZustellung(
    {
      organizationId: zeile.organizationId,
      correlationId: zeile.correlationId,
      notificationId: zeile.notificationId,
      vorgangArt: zeile.vorgangArt,
      vorgangRef: zeile.vorgangRef,
      vorgangEmpfaenger: zeile.vorgangEmpfaenger,
      channel: zeile.channel,
      recipient: zeile.recipient,
      status: 'skipped',
      grund,
      fehler: fehler ?? zeile.sanitizedError,
      attemptCount: Math.max(1, zeile.attemptCount),
    },
    admin
  )
  log.warn('Zustellung ins Dead Letter', {
    organizationId: zeile.organizationId,
    channel: zeile.channel,
    correlationId: zeile.correlationId ?? undefined,
    vorgangArt: zeile.vorgangArt ?? undefined,
    versuche: zeile.attemptCount,
    grund,
  })
}

interface Fortschritt {
  metriken: RetryWorkerMetriken
  abbruch: string | null
  /** Vorgaenge seit dem letzten Herzschlag — organisationsuebergreifend. */
  seitHerzschlag: number
}

async function verarbeiteOrganisation(
  admin: SupabaseClient,
  organizationId: string,
  opt: Required<Pick<RetryWorkerOptionen, 'maxVorgaenge' | 'queuedSchwelleMinuten' | 'ohneVorgangNachStunden' | 'jetzt'>> & { fristMs: number },
  stand: Fortschritt,
  heartbeat: () => Promise<void>
): Promise<void> {
  const roh = await offeneZustellungen(organizationId, { limit: 500, admin })

  stand.metriken.ohneVorgangsId += roh.filter(z => !z.correlationId).length
  const vorgaenge = verdichte(roh)

  for (const zeile of vorgaenge) {
    if (stand.abbruch) return
    if (opt.jetzt() > opt.fristMs) {
      stand.abbruch = 'zeitbudget_erschoepft'
      return
    }
    if (stand.metriken.verarbeitet >= opt.maxVorgaenge) {
      stand.abbruch = 'obergrenze_erreicht'
      return
    }

    // Herzschlag nach ANGEFASSTEN Vorgaengen, nicht nach versendeten.
    // Ein Lauf, der 200 wartende Zeilen durchsieht, verschickt nichts —
    // sein Herzschlag muss trotzdem weiterlaufen, sonst uebernimmt der
    // naechste Lauf eine Sperre, die gar nicht verwaist ist.
    stand.seitHerzschlag++
    if (stand.seitHerzschlag >= HEARTBEAT_ALLE) {
      stand.seitHerzschlag = 0
      await heartbeat()
      // Sofort nach dem Lebenszeichen nachsehen, nicht erst beim
      // naechsten Durchlauf: haben wir die Sperre verloren, waere dieser
      // eine Vorgang schon der erste, den zwei Laeufe zugleich anfassen.
      if (stand.abbruch) return
    }

    // ── Obergrenze: endgueltig aufgeben ──
    if (zeile.attemptCount >= MAX_VERSUCHE) {
      await insDeadLetter(admin, zeile, 'max_versuche_erreicht')
      stand.metriken.deadLetter++
      continue
    }

    // ── Kein Vorgangsbezug: nicht wiederherstellbar ──
    const hersteller = holeWiederhersteller(zeile.vorgangArt, zeile.channel)
    if (!hersteller) {
      const alterMs = opt.jetzt() - new Date(zeile.createdAt).getTime()
      if (alterMs >= opt.ohneVorgangNachStunden * 3_600_000) {
        await insDeadLetter(admin, zeile, 'nicht_wiederherstellbar')
        stand.metriken.deadLetter++
      } else {
        stand.metriken.wartend++
      }
      continue
    }

    // ── 'queued' erst nach der Schwelle anfassen: der Erstversand
    //    koennte gerade noch laufen. ──
    const alterMs = opt.jetzt() - new Date(zeile.createdAt).getTime()
    if (zeile.status === 'queued' && alterMs < opt.queuedSchwelleMinuten * 60_000) {
      stand.metriken.wartend++
      continue
    }

    // ── Wartezeit (der harte Riegel sitzt zusaetzlich in sendeIdempotent) ──
    const basis = zeile.letzterVersuch ?? zeile.createdAt
    const wartenBis = new Date(basis).getTime() + wartezeitMinuten(zeile.attemptCount) * 60_000
    if (Number.isFinite(wartenBis) && opt.jetzt() < wartenBis) {
      stand.metriken.wartend++
      continue
    }

    // ── Versand ──
    let letzterFehler: unknown = null
    const ergebnis = await sendeIdempotent({
      kontext: {
        organizationId: zeile.organizationId,
        correlationId: zeile.correlationId as string,
        notificationId: zeile.notificationId,
        vorgangArt: zeile.vorgangArt,
        vorgangRef: zeile.vorgangRef,
        vorgangEmpfaenger: zeile.vorgangEmpfaenger,
      },
      channel: zeile.channel,
      provider: providerFuer(zeile.channel),
      recipient: zeile.recipient,
      admin,
      senden: async () => {
        const r = await hersteller({
          admin,
          organizationId: zeile.organizationId,
          vorgangRef: zeile.vorgangRef as string,
          empfaengerId: zeile.vorgangEmpfaenger,
          recipient: zeile.recipient,
          channel: zeile.channel,
          correlationId: zeile.correlationId as string,
        })
        letzterFehler = r.fehler ?? null
        return r
      },
    })

    switch (ergebnis.status) {
      case 'versendet':
        stand.metriken.verarbeitet++
        stand.metriken.erfolgreich++
        break
      case 'fehlgeschlagen':
        stand.metriken.verarbeitet++
        stand.metriken.fehlgeschlagen++
        // Dauerhafte Fehler nicht noch viermal wiederholen.
        if (istDauerhaft(letzterFehler)) {
          await insDeadLetter(
            admin,
            { ...zeile, attemptCount: ergebnis.versuch },
            'dauerhaft_fehlgeschlagen',
            letzterFehler
          )
          stand.metriken.deadLetter++
        } else if (ergebnis.versuch >= MAX_VERSUCHE) {
          // Der Versuch, der die Grenze reisst, schliesst gleich ab —
          // sonst laege der Vorgang noch einen Lauf lang herum.
          await insDeadLetter(
            admin,
            { ...zeile, attemptCount: ergebnis.versuch },
            'max_versuche_erreicht',
            letzterFehler
          )
          stand.metriken.deadLetter++
        }
        break
      case 'uebersprungen':
        stand.metriken.uebersprungen++
        break
      case 'wartet':
        stand.metriken.wartend++
        break
      case 'aufgegeben':
        await insDeadLetter(admin, zeile, 'max_versuche_erreicht')
        stand.metriken.deadLetter++
        break
      case 'bereits_zugestellt':
        // Zwischen Abfrage und Versand hat jemand anders zugestellt —
        // oder die Zustellspur war nicht lesbar (fail-closed).
        stand.metriken.uebersprungen++
        break
    }

  }
}

function providerFuer(channel: ZustellKanal) {
  switch (channel) {
    case 'email':
      return 'resend' as const
    case 'push':
      return 'web_push' as const
    case 'whatsapp':
      return 'whatsapp_api' as const
    default:
      return 'supabase' as const
  }
}

/**
 * Fuehrt einen Wiederholungslauf ueber alle Mandanten aus.
 *
 * Wirft nicht: jeder Ausgang wird als Ergebnis gemeldet, damit der
 * Cron-Endpunkt eine ehrliche Antwort geben kann. Ein blockierter Lauf
 * ('blockiert') ist KEIN Fehler — er heisst nur, dass gerade ein anderer
 * laeuft.
 */
export async function fuehreWiederholungslaufAus(
  optionen: RetryWorkerOptionen = {}
): Promise<RetryWorkerErgebnis> {
  const jetzt = optionen.jetzt ?? (() => Date.now())
  const start = jetzt()
  const metriken = leereMetriken()

  const admin = await holeClient(optionen.admin)
  if (!admin) {
    return {
      ok: false, status: 'nicht_bereit', laufId: null, uebernommen: false,
      grund: 'Kein Datenbank-Client', dauerMs: 0, metriken,
    }
  }

  // Ohne die Vorgangsspalten koennte der Lauf weder zuordnen noch
  // abschliessen — dann lieber gar nichts tun als Zeilen anfassen, die
  // er nicht sauber beenden kann.
  if (!(await zustellspurSchemaBereit(admin))) {
    log.warn(
      'Wiederholungslauf uebersprungen — Migration 20260927000000 ist auf dieser Datenbank nicht eingespielt.'
    )
    return {
      ok: false, status: 'nicht_bereit', laufId: null, uebernommen: false,
      grund: 'Schema-Erweiterung 20260927000000 fehlt', dauerMs: jetzt() - start, metriken,
    }
  }

  // ── Sperre beanspruchen ──
  let laufId: string | null = null
  let uebernommen = false
  const { data: beansprucht, error: sperrFehler } = await admin.rpc(
    'zustellung_retry_beanspruchen',
    { p_stale_minuten: optionen.staleMinuten ?? STALE_MINUTEN }
  )

  if (sperrFehler) {
    const meldung = sperrFehler.message || ''
    if (meldung.includes('ZUSTELLUNG_RETRY_LAEUFT')) {
      log.info('Wiederholungslauf uebersprungen — es laeuft bereits einer')
      return {
        ok: true, status: 'blockiert', laufId: null, uebernommen: false,
        grund: 'Es laeuft bereits ein Wiederholungslauf', dauerMs: jetzt() - start, metriken,
      }
    }
    log.warn('Wiederholungslauf konnte nicht beansprucht werden', { errorMessage: meldung })
    return {
      ok: false, status: 'nicht_bereit', laufId: null, uebernommen: false,
      grund: 'Sperre nicht beanspruchbar', dauerMs: jetzt() - start, metriken,
    }
  }

  const kopf = Array.isArray(beansprucht) ? beansprucht[0] : beansprucht
  laufId = (kopf?.lauf_id as string | undefined) ?? null
  uebernommen = Boolean(kopf?.uebernommen)
  if (uebernommen) {
    log.warn('Verwaiste Sperre uebernommen — der vorige Lauf ist abgestuerzt', { laufId })
  }

  const stand: Fortschritt = { metriken, abbruch: null, seitHerzschlag: 0 }

  /**
   * Lebenszeichen — UND die Antwort darauf, ob die Sperre noch uns gehoert.
   *
   * BEFUND (Block 100): hier stand ein blindes
   * `await admin.rpc('zustellung_retry_heartbeat', …)`.
   *
   * `supabase.rpc()` WIRFT NICHT — ein Fehler kommt als `error` im
   * Ergebnis zurueck. Und die RPC gibt mehr zurueck als „erledigt": sie
   * ist `RETURNS boolean` und liefert `FOUND` des UPDATE
   * `WHERE id = p_lauf_id AND status = 'laeuft'` (live aus pg_proc
   * gelesen). `false` heisst also: dieser Lauf ist nicht mehr der
   * Inhaber — jemand anderes hat die Sperre uebernommen.
   *
   * Genau diese Antwort wurde weggeworfen. Der Lauf arbeitete dann
   * weiter an derselben Zustellwarteschlange wie der neue Inhaber —
   * zwei Arbeiter auf denselben Zeilen, und der Kanal versendet
   * doppelt. Der Kommentar in `verarbeiteOrganisation` benennt die
   * Gefahr sogar („sonst uebernimmt der naechste Lauf eine Sperre, die
   * gar nicht verwaist ist"), nur sah sie niemand nach.
   *
   * Dreissig Zeilen weiter oben prueft `zustellung_retry_beanspruchen`
   * seinen Fehler bis zur Fallunterscheidung. Wieder dasselbe: der
   * Schritt, der entscheidet, war lockerer als sein Nachbar.
   */
  const heartbeat = async (): Promise<void> => {
    if (!laufId) return
    const { data: nochUnser, error: herzFehler } = await admin.rpc(
      'zustellung_retry_heartbeat', { p_lauf_id: laufId },
    )

    if (herzFehler) {
      // Kein Lebenszeichen heisst: die Sperre verfaellt. Weiterzuarbeiten
      // hiesse, auf ihr Verfallen zu setzen.
      stand.abbruch = 'herzschlag_nicht_moeglich'
      log.error('Lebenszeichen nicht absetzbar — Lauf bricht ab, bevor die Sperre verfaellt', {
        laufId, errorMessage: herzFehler.message,
      })
      return
    }

    if (nochUnser === false) {
      stand.abbruch = 'sperre_verloren'
      log.error('Sperre wurde uebernommen — Lauf bricht ab, um Doppelzustellung zu vermeiden', { laufId })
    }
  }
  const opt = {
    maxVorgaenge: optionen.maxVorgaenge ?? MAX_VORGAENGE,
    queuedSchwelleMinuten: optionen.queuedSchwelleMinuten ?? QUEUED_SCHWELLE_MINUTEN,
    ohneVorgangNachStunden: optionen.ohneVorgangNachStunden ?? OHNE_VORGANG_NACH_STUNDEN,
    jetzt,
    fristMs: start + (optionen.zeitbudgetMs ?? ZEITBUDGET_MS),
  }

  try {
    let orgs = optionen.organisationen ?? null
    if (!orgs) {
      const { data, error } = await admin.from('organizations').select('id')
      if (error) throw new Error(`Organisationen nicht lesbar: ${error.message}`)
      orgs = (data ?? []).map(o => o.id as string)
    }
    metriken.organisationen = orgs.length

    for (const organizationId of orgs) {
      if (stand.abbruch) break
      try {
        await verarbeiteOrganisation(admin, organizationId, opt, stand, heartbeat)
      } catch (err) {
        // Ein kaputter Mandant darf die uebrigen nicht mitreissen.
        log.errorWithException('Wiederholungslauf: Mandant uebersprungen', err, { organizationId })
      }
    }

    // Auch dieser Aufruf war blind. `zustellung_retry_abschliessen` ist
    // ebenfalls `RETURNS boolean`: `false` heisst, der Eintrag stand
    // schon nicht mehr auf 'laeuft'. Bleibt der Abschluss aus, steht der
    // Lauf weiter offen — der naechste ist dann entweder blockiert oder
    // meldet faelschlich, der vorige sei abgestuerzt.
    //
    // Geworfen wird hier NICHT: die Arbeit ist getan, und ein Wurf
    // machte aus einem erfolgreichen Lauf einen gescheiterten. Sichtbar
    // muss es trotzdem sein — im Protokoll und in der Rueckgabe.
    const { data: abgeschlossen, error: abschlussFehler } = await admin.rpc(
      'zustellung_retry_abschliessen', {
        p_lauf_id: laufId,
        p_verarbeitet: metriken.verarbeitet,
        p_erfolgreich: metriken.erfolgreich,
        p_fehlgeschlagen: metriken.fehlgeschlagen,
        p_dead_letter: metriken.deadLetter,
        p_uebersprungen: metriken.uebersprungen,
        p_abbruchgrund: stand.abbruch,
      },
    )

    const abschlussOffen = Boolean(abschlussFehler) || abgeschlossen === false
    if (abschlussOffen) {
      log.error('Wiederholungslauf nicht abgeschlossen — der Eintrag bleibt auf "laeuft"', {
        laufId,
        errorMessage: abschlussFehler?.message ?? 'der Lauf stand nicht mehr auf "laeuft"',
      })
    }

    const dauerMs = jetzt() - start
    log.info('Wiederholungslauf beendet', { laufId, dauerMs, ...metriken, abbruch: stand.abbruch ?? undefined })

    return {
      ok: true,
      status: stand.abbruch ? 'abgebrochen' : 'fertig',
      laufId,
      uebernommen,
      grund: stand.abbruch ?? undefined,
      abschlussOffen,
      dauerMs,
      metriken,
    }
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err)
    log.errorWithException('Wiederholungslauf abgebrochen', err, { laufId })
    // Sperre freigeben — die offenen Zustellungen stehen weiterhin im
    // Protokoll, der naechste Lauf macht dort weiter.
    // Das `.then(() => undefined, () => undefined)` von hier ist weg.
    // Sein Ablehnungszweig war toter Code: `supabase.rpc()` wirft nicht,
    // es LEHNT AUCH NICHT AB — ein Fehler kommt als `error` im Ergebnis.
    // Der Zusatz sah nach bewusstem Wegsehen aus und hat in Wahrheit nie
    // etwas abgefangen.
    const { data: freigegeben, error: freigabeFehler } = await admin.rpc(
      'zustellung_retry_abschliessen', {
        p_lauf_id: laufId,
        p_verarbeitet: metriken.verarbeitet,
        p_erfolgreich: metriken.erfolgreich,
        p_fehlgeschlagen: metriken.fehlgeschlagen,
        p_dead_letter: metriken.deadLetter,
        p_uebersprungen: metriken.uebersprungen,
        p_abbruchgrund: grund.slice(0, 200),
      },
    )

    const freigabeOffen = Boolean(freigabeFehler) || freigegeben === false
    if (freigabeOffen) {
      // Der gefaehrlichere der beiden Faelle: der Lauf ist abgestuerzt
      // UND die Sperre bleibt stehen. Bis sie verfaellt, laeuft gar
      // nichts mehr.
      log.error('Sperre nach Abbruch nicht freigegeben — der Eintrag bleibt auf "laeuft"', {
        laufId,
        errorMessage: freigabeFehler?.message ?? 'der Lauf stand nicht mehr auf "laeuft"',
      })
    }

    return {
      ok: false,
      status: 'abgebrochen',
      laufId,
      uebernommen,
      grund,
      abschlussOffen: freigabeOffen,
      dauerMs: jetzt() - start,
      metriken,
    }
  }
}
