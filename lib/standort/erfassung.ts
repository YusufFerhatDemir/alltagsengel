// ═══════════════════════════════════════════════════════════════════════
// Standortfreigabe — einen Punkt annehmen
// ═══════════════════════════════════════════════════════════════════════
//
// WER MELDET, ENTSCHEIDET NICHT DER RUMPF.
// Die Konto-Kennung kommt aus der serverseitig gepruefte Sitzung; dieses
// Modul bekommt sie als Parameter und liest sie nie aus der Nutzlast.
// Genauso IP, Plattform und Geraet: aus den Kopfzeilen des Aufrufs,
// nicht aus dem Rumpf (dieselbe Regel wie lib/security/audit.ts).
//
// DREI TORE, BEVOR EIN PUNKT ENTSTEHT
//   1. Es gibt eine Freigabe, und ihr Modus ist nicht 'off'.
//   2. Im Modus 'during_service': es laeuft gerade ein Einsatz DIESER
//      Person. Ohne laufenden Einsatz wird der Punkt abgewiesen — das
//      ist der ganze Unterschied zwischen diesem Modus und dem
//      Dauermodus, und er darf nicht auf der Ehrlichkeit des Clients
//      beruhen.
//   3. Der Trigger auf der Tabelle prueft (1) und die Einsatz-Pflicht
//      noch einmal in der Datenbank — fuer alles, was nicht durch
//      diesen Code geht.
//
// EIN ABGEWIESENER PUNKT IST EIN EREIGNIS.
// Jede Abweisung schreibt `location_update_rejected` in die
// Sicherheitsspur. Ein Einzelfall ist ein nachlaufender Client; eine
// Serie ist ein Befund — und ohne Spur waere weder das eine noch das
// andere sichtbar.
// ═══════════════════════════════════════════════════════════════════════

import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { erfasseSicherheitsereignis } from '@/lib/security'
import { geraeteMerkmale, ipAus } from '@/lib/security/geraet'
import { leseEinstellung } from './einstellungen'
import { MODUS_AUS, plattformFuerPunkt, type Modus } from './modi'

type AdminClient = ReturnType<typeof createAdminClient>

const log = logger.child('standort:erfassung')

/**
 * Vor- und Nachlauf um die geplante Einsatzzeit, in Minuten.
 *
 * Ohne Toleranz waere der Modus in der Praxis unbrauchbar: die Anfahrt
 * gehoert zum Einsatz, und ein Nachweis wird selten auf die Minute
 * begonnen. Mit zu grosser Toleranz waere „nur waehrend des Einsatzes"
 * eine Formulierung ohne Inhalt. 15 Minuten ist die Groessenordnung
 * eines Wegs zwischen zwei Klienten.
 */
export const EINSATZ_TOLERANZ_MINUTEN = 15

// ─────────────────────────────────────────────────────────────────────
// Zeit in Europe/Berlin
// ─────────────────────────────────────────────────────────────────────
// Die Datenbank fuehrt `date` und `time without time zone` — also
// Ortszeit ohne Zone. Ein Vergleich gegen UTC waere im Sommer eine
// Stunde daneben und im Winter zwei; genau so entstehen Modi, die
// „meistens" richtig sind.

function berlinTeile(zeitpunkt: Date): { datum: string; minuten: number } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const teile = Object.fromEntries(f.formatToParts(zeitpunkt).map(t => [t.type, t.value]))
  const stunde = Number(teile.hour === '24' ? '0' : teile.hour)
  return {
    datum: `${teile.year}-${teile.month}-${teile.day}`,
    minuten: stunde * 60 + Number(teile.minute),
  }
}

function vortag(datum: string): string {
  const d = new Date(`${datum}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** 'HH:MM:SS' → Minuten seit Mitternacht. Unbrauchbares ergibt null. */
function minutenAus(zeit: unknown): number | null {
  if (typeof zeit !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})/.exec(zeit)
  if (!m) return null
  const stunden = Number(m[1])
  const minuten = Number(m[2])
  if (stunden > 23 || minuten > 59) return null
  return stunden * 60 + minuten
}

export interface EinsatzZeile {
  id: string
  date: string
  start_time: string
  end_time: string
}

/**
 * Laeuft dieser Einsatz gerade?
 *
 * `heuteMinuten` ist die Ortszeit des Aufrufs, `bezugDatum` das Datum,
 * an dem die Zeile haengt. Ein Nachtdienst hat end_time <= start_time
 * (Befund „duration_minutes ist generiert / Nachtdienst ueber
 * Mitternacht") — er laeuft dann entweder noch am Vortag oder schon am
 * Folgetag, und beides muss hier vorkommen. Ohne diesen Zweig waere
 * genau die Schicht ohne Standort, in der er am ehesten gebraucht wird.
 *
 * Exportiert, obwohl nur `laufenderEinsatz` sie benutzt: das ist die
 * einzige Stelle des Moduls mit echter Fallunterscheidung, und sie soll
 * ohne Datenbank pruefbar sein.
 */
export function laeuftGerade(
  zeile: EinsatzZeile,
  heuteDatum: string,
  heuteMinuten: number,
): boolean {
  const start = minutenAus(zeile.start_time)
  const ende = minutenAus(zeile.end_time)
  if (start === null || ende === null) return false

  const t = EINSATZ_TOLERANZ_MINUTEN
  const ueberMitternacht = ende <= start

  if (zeile.date === heuteDatum) {
    if (!ueberMitternacht) return heuteMinuten >= start - t && heuteMinuten <= ende + t
    // Heute begonnen, laeuft in den Folgetag: der spaete Teil des Tages.
    return heuteMinuten >= start - t
  }

  // Zeile von gestern: nur ein Nachtdienst kann heute noch laufen, und
  // nur bis zu seinem Ende am fruehen Morgen.
  return ueberMitternacht && heuteMinuten <= ende + t
}

export interface LaufenderEinsatz {
  id: string
  datum: string
  von: string
  bis: string
}

/**
 * Der gerade laufende Einsatz dieser Person — oder null.
 *
 * Gesucht wird ueber `caregivers.user_id`; ein Konto ohne
 * Pflegekraft-Datensatz hat keine Einsaetze und bekommt deshalb im
 * Einsatzmodus nie einen Punkt geschrieben. Das ist die richtige
 * Richtung: der Modus heisst „waehrend des Einsatzes".
 */
export async function laufenderEinsatz(
  admin: AdminClient,
  userId: string,
  jetzt: Date = new Date(),
): Promise<LaufenderEinsatz | null> {
  const { data: engel } = await admin
    .from('caregivers')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  const caregiverId = engel?.id as string | undefined
  if (!caregiverId) return null

  const { datum, minuten } = berlinTeile(jetzt)

  const { data, error } = await admin
    .from('service_records')
    .select('id, date, start_time, end_time')
    // Gestern mit dabei — sonst faellt der Nachtdienst nach Mitternacht
    // aus der Abfrage, noch bevor `laeuftGerade` ihn beurteilen kann.
    .in('date', [datum, vortag(datum)])
    .eq('caregiver_id', caregiverId)
    // Ein stornierter Nachweis ist kein laufender Einsatz. `proof_status`
    // allein entscheidet hier nichts weiter — nur diesen Ausschluss
    // (Befund „Storno-Nachweis wurde abgerechnet": abrechenbar nie ueber
    // status allein; umgekehrt gilt fuer den Ausschluss dasselbe).
    .neq('proof_status', 'STORNIERT')
    .order('start_time', { ascending: false })
    .limit(50)

  if (error) throw error

  const treffer = ((data ?? []) as EinsatzZeile[])
    .find(z => laeuftGerade(z, datum, minuten))

  return treffer
    ? { id: treffer.id, datum: treffer.date, von: treffer.start_time, bis: treffer.end_time }
    : null
}

// ─────────────────────────────────────────────────────────────────────
// Der Punkt
// ─────────────────────────────────────────────────────────────────────

export interface StandortMeldung {
  latitude: number
  longitude: number
  accuracyMeters?: number | null
  altitude?: number | null
  speed?: number | null
  heading?: number | null
  /** Zeitpunkt der Messung auf dem Geraet. */
  timestampUtc?: string | null
  sessionId?: string | null
  /** Nur ein Vorschlag des Clients; er wird gegengeprueft. */
  serviceId?: string | null
  appVersion?: string | null
}

export type ErfassungsErgebnis =
  | { ok: true; id: string; modus: Modus; serviceId: string | null }
  | { ok: false; status: number; grund: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Endliche Zahl im Bereich, sonst null. Kein Runden, kein Raten. */
function zahl(wert: unknown, min: number, max: number): number | null {
  const n = typeof wert === 'number' ? wert : Number(wert)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return n
}

/**
 * Zeitstempel der Messung. Ein unbrauchbarer Wert wird VERWORFEN und
 * durch den Eingangszeitpunkt ersetzt — nicht abgelehnt: ein Geraet mit
 * falsch gestellter Uhr soll seinen Standort trotzdem melden koennen,
 * aber keine Zeitangabe erfinden duerfen. Ein Zeitpunkt weit in der
 * Zukunft ist immer falsch.
 */
function messzeitpunkt(wert: unknown, jetzt: Date): string {
  if (typeof wert !== 'string') return jetzt.toISOString()
  const d = new Date(wert)
  if (Number.isNaN(d.getTime())) return jetzt.toISOString()
  if (d.getTime() > jetzt.getTime() + 5 * 60_000) return jetzt.toISOString()
  // Aelter als ein Tag: eine Nachlieferung aus dem Funkloch ist
  // plausibel, ein Monat alter Punkt nicht.
  if (d.getTime() < jetzt.getTime() - 24 * 3_600_000) return jetzt.toISOString()
  return d.toISOString()
}

async function abweisen(
  userId: string,
  organizationId: string | null,
  request: Request | Headers | null | undefined,
  status: number,
  grund: string,
  metadata: Record<string, unknown>,
): Promise<{ ok: false; status: number; grund: string }> {
  try {
    await erfasseSicherheitsereignis({
      eventType: 'location_update_rejected',
      userId,
      organizationId,
      request: request ?? undefined,
      metadata: { funktion: 'Standortmeldung', ergebnis: 'BLOCKED', ...metadata },
    })
  } catch (err) {
    log.errorWithException('Standort: Abweisung nicht protokolliert', err)
  }
  return { ok: false, status, grund }
}

/**
 * Nimmt eine Standortmeldung an — oder weist sie begruendet ab.
 */
export async function erfasseStandort(
  admin: AdminClient,
  userId: string,
  meldung: StandortMeldung,
  request?: Request | Headers | null,
): Promise<ErfassungsErgebnis> {
  const jetzt = new Date()
  const einstellung = await leseEinstellung(admin, userId)

  if (einstellung.modus === MODUS_AUS || !einstellung.enabledByUser) {
    return abweisen(userId, einstellung.organizationId, request, 409,
      'Für dieses Konto ist keine Standortfreigabe aktiv.',
      { grund: 'keine_freigabe', modus: einstellung.modus })
  }

  const lat = zahl(meldung.latitude, -90, 90)
  const lng = zahl(meldung.longitude, -180, 180)
  if (lat === null || lng === null) {
    return {
      ok: false,
      status: 400,
      grund: 'Breiten- und Längengrad fehlen oder liegen außerhalb des gültigen Bereichs.',
    }
  }

  // ── Einsatzmodus: es muss wirklich einer laufen ──────────────────
  let serviceId: string | null = null
  if (einstellung.modus === 'during_service') {
    const einsatz = await laufenderEinsatz(admin, userId, jetzt)
    if (!einsatz) {
      return abweisen(userId, einstellung.organizationId, request, 409,
        'Es läuft gerade kein Einsatz. In diesem Modus wird außerhalb der '
        + 'Einsatzzeit kein Standort erfasst.',
        { grund: 'kein_laufender_einsatz', modus: einstellung.modus })
    }

    // Der Client darf eine Einsatz-Kennung mitschicken; sie gilt nur,
    // wenn sie DIE des laufenden Einsatzes ist. Alles andere waere eine
    // fremde Kennung, die der Punkt sonst tragen wuerde.
    const gemeldet = typeof meldung.serviceId === 'string' ? meldung.serviceId.trim() : ''
    if (gemeldet && UUID_RE.test(gemeldet) && gemeldet !== einsatz.id) {
      return abweisen(userId, einstellung.organizationId, request, 409,
        'Die gemeldete Einsatz-Kennung gehört nicht zum laufenden Einsatz.',
        { grund: 'einsatz_kennung_abweichend', modus: einstellung.modus })
    }
    serviceId = einsatz.id
  }

  const merkmale = geraeteMerkmale(request ?? null)
  const ip = ipAus(request ?? null)

  const { data, error } = await admin
    .from('location_updates')
    .insert({
      user_id: userId,
      organization_id: einstellung.organizationId,
      latitude: lat,
      longitude: lng,
      accuracy_meters: zahl(meldung.accuracyMeters, 0, 100_000),
      altitude: zahl(meldung.altitude, -12_000, 12_000),
      speed: zahl(meldung.speed, 0, 1_000),
      heading: zahl(meldung.heading, 0, 359.999999),
      timestamp_utc: messzeitpunkt(meldung.timestampUtc, jetzt),
      session_id: typeof meldung.sessionId === 'string'
        ? meldung.sessionId.trim().slice(0, 128) || null
        : null,
      service_id: serviceId,
      platform: plattformFuerPunkt(merkmale.plattform),
      app_version: merkmale.appVersion
        ?? (typeof meldung.appVersion === 'string' ? meldung.appVersion.slice(0, 40) : null),
      device_info: merkmale.deviceInfo,
      ip_address: ip,
      erfasst_im_modus: einstellung.modus,
    })
    .select('id')
    .single()

  if (error) {
    // Der Trigger der Tabelle hat abgewiesen — das ist kein Serverfehler,
    // sondern das dritte Tor, und es gehoert genauso in die Spur wie die
    // beiden davor.
    return abweisen(userId, einstellung.organizationId, request, 409,
      'Die Standortmeldung wurde abgewiesen.',
      { grund: 'datenbank_riegel', modus: einstellung.modus, code: error.code ?? null })
  }

  return { ok: true, id: String((data as { id: string }).id), modus: einstellung.modus, serviceId }
}
