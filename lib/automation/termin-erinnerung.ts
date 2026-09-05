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
 *   3. FALLBACK: Hat der Klient kein user_id aber eine E-Mail-Adresse,
 *      wird die Erinnerung DIREKT per E-Mail an clients.email gesendet.
 *      Das loest das user_id=NULL-Problem bei Bestandskunden, ohne auf
 *      die Migration warten zu muessen.
 *
 * KANAELE
 *   - In-App (notifications-Tabelle) fuer alle mit user_id
 *   - E-Mail (Resend) fuer alle Empfaenger mit hinterlegter E-Mail-Adresse
 *   - E-Mail-Direktversand an clients.email als Fallback wenn user_id=NULL
 *
 * DUBLETTENSCHUTZ: hoechstens eine Erinnerung je (Einsatz, Empfaenger).
 * Der Schluessel steht in `notifications.data->>assignment_id` (In-App)
 * bzw. wird ueber den Idempotenzschluessel bei Resend abgesichert (E-Mail).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotification, sendEmailNotification } from '@/lib/notifications'
import { esc } from '@/lib/notifications/html'
import { logger } from '@/lib/logger'
const log = logger.child('termin-erinnerung')

/** Vorlauf in Tagen: erinnert wird am Vortag. */
export const ERINNERUNG_VORLAUF_TAGE = 1

/** Einsaetze in diesen Zustaenden werden nicht erinnert. */
const KEINE_ERINNERUNG_BEI = new Set(['STORNIERT', 'cancelled', 'BEENDET', 'NO_SHOW'])

interface Empfaenger {
  userId: string
  art: 'kunde' | 'angehoerige'
  email?: string | null
}

/** Klient ohne user_id aber mit E-Mail — Direktversand. */
interface DirektEmpfaenger {
  clientId: string
  email: string
  name: string
}

export interface TerminErinnerungErgebnis {
  geprueft: number
  erinnert: number
  /** Per E-Mail direkt erreichte Klienten ohne user_id. */
  direktPerEmail: number
  ohneEmpfaenger: number
  /** Klienten, die per safe_link_clients_user_id verknuepft wurden. */
  userIdVerknuepft: number
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
 * Baut den HTML-Koerper fuer die Termin-Erinnerungs-E-Mail.
 * Absender/Unterschrift: immer „Alltagsengel", nie persoenlich.
 */
function erinnerungsEmailHtml(datum: string, leistung: string, zeitText: string, klientName: string | null): string {
  const bezug = klientName
    ? `für <strong>${esc(klientName)}</strong>`
    : ''
  return `
    <p style="font-size:16px;font-weight:600;color:#C9963C;margin-bottom:4px;">
      Erinnerung an Ihren Termin morgen
    </p>
    <p>
      morgen (${esc(datum)}) ist ein Einsatz ${bezug} geplant:
    </p>
    <div style="background:rgba(201,150,60,0.08);border-radius:12px;padding:18px 20px;margin:20px 0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;color:#666;width:100px;">Leistung:</td>
          <td style="padding:6px 0;font-weight:600;">${esc(leistung)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#666;">Uhrzeit:</td>
          <td style="padding:6px 0;font-weight:600;">${esc(zeitText)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#666;">Datum:</td>
          <td style="padding:6px 0;font-weight:600;">${esc(datum)}</td>
        </tr>
      </table>
    </div>
    <p style="color:#666;font-size:13px;">
      Falls Sie den Termin absagen oder verschieben möchten, melden Sie sich
      bitte telefonisch bei uns oder über die App.
    </p>
  `
}

/**
 * Versucht, fehlende clients.user_id per safe_link_clients_user_id
 * zu verknuepfen. Best-effort: schlaegt die RPC fehl (z. B. weil die
 * Migration noch nicht eingespielt ist), wird nur gewarnt.
 */
async function versucheUserIdVerknuepfung(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('safe_link_clients_user_id', {
      p_organization_id: organizationId,
    })
    if (error) {
      // Funktion existiert noch nicht — das ist OK, die Migration kommt spaeter.
      log.info('safe_link_clients_user_id nicht verfuegbar', { errorMessage: error.message })
      return 0
    }
    const verknuepft = typeof data === 'object' && data !== null ? (data as any).verknuepft ?? 0 : 0
    if (verknuepft > 0) {
      log.info(`${verknuepft} Klienten mit user_id verknuepft`, { organizationId })
    }
    return verknuepft
  } catch {
    return 0
  }
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
    direktPerEmail: 0,
    ohneEmpfaenger: 0,
    userIdVerknuepft: 0,
    fehler: [],
  }

  // ── Schritt 0: Versuche fehlende user_id zu verknuepfen ───────
  // Laeuft VOR der Empfaengeraufloesung, damit frisch verknuepfte
  // Klienten sofort ihre In-App-Erinnerung bekommen.
  ergebnis.userIdVerknuepft = await versucheUserIdVerknuepfung(supabase, organizationId)

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
  /** Klienten ohne user_id aber mit E-Mail — Direktversand als Fallback. */
  const direktJeClient = new Map<string, DirektEmpfaenger>()

  if (clientIds.length > 0) {
    const { data: klienten, error: klientenFehler } = await supabase
      .from('clients')
      .select('id, user_id, first_name, last_name, email')
      .in('id', clientIds)
    if (klientenFehler) {
      ergebnis.fehler.push(`Klientendaten nicht lesbar — Kunden ohne Erinnerung: ${klientenFehler.message}`)
    }
    for (const k of klienten ?? []) {
      const kName = [k.first_name, k.last_name].filter(Boolean).join(' ').trim()
      nameJeClient.set(k.id, kName)
      if (k.user_id) {
        empfaengerJeClient.set(k.id, [{ userId: k.user_id, art: 'kunde' }])

        // E-Mail-Adresse des Nutzers fuer den E-Mail-Kanal holen
        // (wird spaeter beim Versand benoetigt)
      } else if (k.email && k.email.trim()) {
        // FALLBACK: user_id ist NULL, aber E-Mail ist da.
        // Direkt per E-Mail erinnern, damit Bestandskunden nicht leer ausgehen.
        direktJeClient.set(k.id, {
          clientId: k.id,
          email: k.email.trim(),
          name: kName || 'Kunde',
        })
      }
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

  // ── E-Mail-Adressen der Empfaenger laden (fuer den E-Mail-Kanal) ──
  const alleUserIds = new Set<string>()
  for (const empfListe of empfaengerJeClient.values()) {
    for (const e of empfListe) alleUserIds.add(e.userId)
  }
  const emailJeUser = new Map<string, { email: string; firstName: string }>()
  if (alleUserIds.size > 0) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, first_name')
      .in('id', Array.from(alleUserIds))
    for (const p of profile ?? []) {
      if (p.email) emailJeUser.set(p.id, { email: p.email, firstName: p.first_name || '' })
    }
  }

  for (const einsatz of offen) {
    const clientId = einsatz.client_id as string | null
    const empfaenger = clientId ? empfaengerJeClient.get(clientId) ?? [] : []
    const direktEmpf = clientId ? direktJeClient.get(clientId) : undefined

    if (empfaenger.length === 0 && !direktEmpf) {
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

    // ── In-App + E-Mail an registrierte Empfaenger ──────────────
    for (const { userId, art } of empfaenger) {
      try {
        if (await bereitsErinnert(supabase, userId, einsatz.id)) continue

        const ok = await createNotification(supabase, {
          userId,
          type: 'reminder',
          title: titel,
          body: text,
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

        // E-Mail-Kanal: zusaetzlich per E-Mail erinnern.
        // Senioren oeffnen die App nicht regelmaessig — eine E-Mail
        // erreicht sie zuverlaessiger.
        const profil = emailJeUser.get(userId)
        if (profil?.email) {
          try {
            await sendEmailNotification(
              profil.email,
              esc(profil.firstName || klientName || 'Kunde'),
              titel,
              erinnerungsEmailHtml(datum, leistung, zeitText, art === 'angehoerige' ? klientName ?? null : null),
            )
          } catch (mailErr) {
            // E-Mail-Fehler ist NICHT fatal — die In-App-Erinnerung steht.
            log.errorWithException('Termin-Erinnerungs-E-Mail fehlgeschlagen', mailErr)
          }
        }
      } catch (err) {
        ergebnis.fehler.push(`${einsatz.id}/${userId}: ${(err as Error).message}`)
      }
    }

    // ── Direkt-E-Mail an Klienten ohne user_id (Fallback) ───────
    if (direktEmpf && empfaenger.length === 0) {
      try {
        await sendEmailNotification(
          direktEmpf.email,
          esc(direktEmpf.name),
          titel,
          erinnerungsEmailHtml(datum, leistung, zeitText, null),
        )
        ergebnis.direktPerEmail++
      } catch (mailErr) {
        ergebnis.fehler.push(`${einsatz.id}/direkt-email(${clientId}): ${(mailErr as Error).message}`)
      }
    }
  }

  return ergebnis
}
