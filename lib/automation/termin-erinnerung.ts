/**
 * Kette 12 — Terminerinnerung an Kunde und Angehoerige.
 *
 * Erinnerungen gab es bis 2026-08-23 nur nach INNEN: fehlende Nachweise,
 * fehlende Unterschriften, ablaufende Fristen — alle an Mitarbeiter, PDL
 * oder Admin. Der Kunde selbst bekam nie ein „Ihr Termin morgen um 10 Uhr"
 * (Lueckenanalyse Bereich 11, P2). Fuer einen Dienst, dessen Kunden
 * ueberwiegend hochbetagt sind, ist das der praktisch haeufigste Grund fuer
 * einen Fehlbesuch.
 *
 * EMPFAENGER
 *   1. der Kunde selbst ueber `clients.user_id`
 *   2. jeder aktive Angehoerigen-Zugang zu diesem Klienten
 *      (`angehoerigen_zugaenge.status='aktiv'`)
 * Beides sind In-App-Benachrichtigungen (`notifications`). Bewusst KEIN
 * E-Mail-Versand: der laeuft im Projekt ueber Resend und ist ohne
 * `RESEND_API_KEY` still wirkungslos — eine Terminerinnerung, die
 * unbemerkt nicht rausgeht, ist schlechter als keine.
 *
 * LIVE-VORBEHALT: `clients.user_id` ist bei allen vier Live-Klienten NULL
 * (bekannter Befund aus Bereich 3). Die Kette meldet das dann als
 * `ohneEmpfaenger` — laut statt still. Sobald die Verknuepfung Kundenprofil
 * ↔ Klientendatensatz steht, erinnert sie ohne weitere Aenderung.
 *
 * DUBLETTENSCHUTZ: hoechstens eine Erinnerung je (Einsatz, Empfaenger).
 * Der Schluessel steht in `notifications.data->>assignment_id`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { logger } from '@/lib/logger'
const log = logger.child('termin-erinnerung')

/** Vorlauf in Tagen: erinnert wird am Vortag. */
export const ERINNERUNG_VORLAUF_TAGE = 1

/** Einsaetze in diesen Zustaenden werden nicht erinnert. */
const KEINE_ERINNERUNG_BEI = new Set(['STORNIERT', 'cancelled', 'BEENDET', 'NO_SHOW'])

interface Empfaenger {
  userId: string
  art: 'kunde' | 'angehoerige'
}

export interface TerminErinnerungErgebnis {
  geprueft: number
  erinnert: number
  ohneEmpfaenger: number
  fehler: string[]
}

/** 'HH:MM:SS' → 'HH:MM'; unbrauchbare Werte werden weggelassen. */
function uhrzeit(zeit: string | null): string | null {
  if (!zeit) return null
  const t = zeit.slice(0, 5)
  return /^\d{2}:\d{2}$/.test(t) ? t : null
}

function zieldatum(heute: Date): string {
  const d = new Date(heute)
  d.setDate(d.getDate() + ERINNERUNG_VORLAUF_TAGE)
  return d.toISOString().slice(0, 10)
}

async function bereitsErinnert(
  supabase: SupabaseClient,
  userId: string,
  assignmentId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'reminder')
    .eq('data->>assignment_id', assignmentId)
    .limit(1)
    .maybeSingle()

  if (error) {
    // Fail-closed fuer Dubletten: im Zweifel lieber nicht erinnern als
    // denselben Termin mehrfach melden (gleiche Regel wie in
    // fristen-warnung.ts).
    log.error('Dublettenpruefung fehlgeschlagen', { errorMessage: error.message })
    return true
  }
  return !!data
}

/**
 * Erinnert Kunden und Angehoerige an die Einsaetze des Folgetags.
 * Taeglicher Cron-Aufruf vorausgesetzt; ein ausgefallener Lauf wird NICHT
 * nachgeholt — eine Erinnerung fuer einen bereits vergangenen Termin waere
 * wertlos.
 */
export async function erinnereAnKommendeTermine(
  supabase: SupabaseClient,
  organizationId: string,
  heute: Date = new Date(),
): Promise<TerminErinnerungErgebnis> {
  const ergebnis: TerminErinnerungErgebnis = {
    geprueft: 0,
    erinnert: 0,
    ohneEmpfaenger: 0,
    fehler: [],
  }

  const datum = zieldatum(heute)

  const { data: einsaetze, error } = await supabase
    .from('assignments')
    .select('id, assignment_date, start_time, end_time, status, service_type, client_id')
    .eq('organization_id', organizationId)
    .eq('assignment_date', datum)

  if (error) {
    ergebnis.fehler.push(`Einsaetze laden: ${error.message}`)
    return ergebnis
  }

  const offen = (einsaetze ?? []).filter(e => !KEINE_ERINNERUNG_BEI.has(String(e.status)))
  ergebnis.geprueft = offen.length
  if (offen.length === 0) return ergebnis

  // Empfaenger je Klient einmal aufloesen — mehrere Einsaetze am selben Tag
  // fuer denselben Klienten sind der Normalfall.
  const clientIds = Array.from(new Set(offen.map(e => e.client_id).filter(Boolean) as string[]))
  const empfaengerJeClient = new Map<string, Empfaenger[]>()
  const nameJeClient = new Map<string, string>()

  if (clientIds.length > 0) {
    // Beide Empfaengerabfragen tragen ihren Fehler jetzt in `fehler`. Vorher
    // war ein Ausfall hier nicht von „dieser Klient hat keine hinterlegten
    // Empfaenger" zu unterscheiden: der Lauf meldete `erinnert: 0` neben
    // `ohneEmpfaenger: n` und galt als sauber durchgelaufen — waehrend
    // schlicht niemand seine Terminerinnerung bekommen hatte.
    const { data: klienten, error: klientenFehler } = await supabase
      .from('clients')
      .select('id, user_id, first_name, last_name')
      .in('id', clientIds)
    if (klientenFehler) {
      ergebnis.fehler.push(`Klientendaten nicht lesbar — Kunden ohne Erinnerung: ${klientenFehler.message}`)
    }
    for (const k of klienten ?? []) {
      nameJeClient.set(k.id, [k.first_name, k.last_name].filter(Boolean).join(' ').trim())
      if (k.user_id) empfaengerJeClient.set(k.id, [{ userId: k.user_id, art: 'kunde' }])
    }

    const { data: zugaenge, error: zugaengeFehler } = await supabase
      .from('angehoerigen_zugaenge')
      .select('client_id, user_id')
      .eq('organization_id', organizationId)
      .eq('status', 'aktiv')
      .in('client_id', clientIds)
    if (zugaengeFehler) {
      ergebnis.fehler.push(`Angehörigen-Zugänge nicht lesbar — Angehörige ohne Erinnerung: ${zugaengeFehler.message}`)
    }
    for (const z of zugaenge ?? []) {
      const liste = empfaengerJeClient.get(z.client_id) ?? []
      if (!liste.some(e => e.userId === z.user_id)) {
        liste.push({ userId: z.user_id, art: 'angehoerige' })
      }
      empfaengerJeClient.set(z.client_id, liste)
    }
  }

  for (const einsatz of offen) {
    const clientId = einsatz.client_id as string | null
    const empfaenger = clientId ? empfaengerJeClient.get(clientId) ?? [] : []

    if (empfaenger.length === 0) {
      ergebnis.ohneEmpfaenger++
      continue
    }

    const von = uhrzeit(einsatz.start_time as string | null)
    const bis = uhrzeit(einsatz.end_time as string | null)
    const zeitText = von ? (bis ? `${von}–${bis} Uhr` : `ab ${von} Uhr`) : 'im Tagesverlauf'
    const leistung = typeof einsatz.service_type === 'string' && einsatz.service_type
      ? einsatz.service_type
      : 'Betreuung'
    const klientName = clientId ? nameJeClient.get(clientId) : null

    const titel = 'Erinnerung: Ihr Termin morgen'
    const text = klientName
      ? `Morgen (${datum}) ist ein Einsatz für ${klientName} geplant: ${leistung}, ${zeitText}.`
      : `Morgen (${datum}) ist ein Einsatz geplant: ${leistung}, ${zeitText}.`

    for (const { userId, art } of empfaenger) {
      try {
        if (await bereitsErinnert(supabase, userId, einsatz.id)) continue

        const ok = await createNotification(supabase, {
          userId,
          type: 'reminder',
          title: titel,
          body: text,
          // Zielseite je Portal — ein Angehoeriger darf /kunde gar nicht
          // betreten (proxy.ts ROLE_ACCESS), ein Link dorthin liefe fuer ihn
          // in den Redirect auf die eigene Startseite.
          link: art === 'angehoerige' ? '/angehoerige/termine' : '/kunde/kalender',
          data: {
            assignment_id: einsatz.id,
            assignment_date: datum,
            client_id: clientId,
          },
        })
        if (ok) {
          ergebnis.erinnert++
        } else {
          ergebnis.fehler.push(`${einsatz.id}/${userId}: Benachrichtigung nicht angelegt`)
        }
      } catch (err) {
        ergebnis.fehler.push(`${einsatz.id}/${userId}: ${(err as Error).message}`)
      }
    }
  }

  return ergebnis
}
