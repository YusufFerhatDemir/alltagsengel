// ═══════════════════════════════════════════════════════════════════════
// Standortfreigabe — die Aufsichtsansicht lesen
// ═══════════════════════════════════════════════════════════════════════
//
// MANDANTENFILTER IM CODE
// Gelesen wird mit dem Dienstschluessel; dort greift RLS nicht. Der
// Mandantenfilter MUSS deshalb hier stehen — die Policy auf der Tabelle
// ist die zweite Tuer, nicht die erste (gleiche Begruendung wie in
// lib/security/abfrage.ts).
//
// DER ZEITRAUM IST BEGRENZT, UND ZWAR HIER
// „Standort-Historie nur soweit fuer betrieblichen Zweck" ist keine
// Absichtserklaerung, sondern eine Voreinstellung: ohne Zeitraum liefert
// diese Abfrage die letzten 24 Stunden, und weiter als
// ZEITRAUM_MAX_TAGE zurueck geht sie nicht. Wer mehr braucht, braucht
// einen Grund — und den kann eine Voreinstellung nicht liefern.
//
// KEINE FREITEXTSUCHE UEBER .or()
// Gefiltert wird ueber gebundene Werte. Ein roher Suchbegriff in
// `.or()` ist eine freie Abfrage (Befund PostgREST-or()-Einschleusung).
// ═══════════════════════════════════════════════════════════════════════

import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { istModus, MODUS_AUS, type Modus } from './modi'

type AdminClient = ReturnType<typeof createAdminClient>

export const PUNKTE_STANDARD = 500
export const PUNKTE_MAX = 5_000
/** Weiter zurueck liefert diese Abfrage nicht. */
export const ZEITRAUM_MAX_TAGE = 31
/** Ohne Zeitraum: die letzten 24 Stunden. */
export const ZEITRAUM_VORGABE_STUNDEN = 24

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface StandortFilter {
  /** Pflicht. Ohne Mandanten wird nicht gelesen. */
  organizationId: string
  userId?: string | null
  vonDatum?: string | null
  bisDatum?: string | null
  plattform?: string | null
  grenze?: number
}

export interface StandortPunkt {
  id: string
  userId: string
  latitude: number
  longitude: number
  accuracyMeters: number | null
  altitude: number | null
  speed: number | null
  heading: number | null
  timestampUtc: string
  createdAt: string
  sessionId: string | null
  serviceId: string | null
  plattform: string | null
  appVersion: string | null
  modus: string
  ip: string | null
  geraet: string | null
}

export interface KontoLage {
  userId: string
  name: string | null
  email: string | null
  rolle: string | null
  /** Aktueller Freigabemodus. 'off' auch dann, wenn nie etwas gesetzt wurde. */
  modus: Modus
  enabledAt: string | null
  disabledAt: string | null
  osPermissionGranted: boolean
  /** Letzter Punkt im gewaehlten Zeitraum. */
  letzterPunkt: StandortPunkt | null
  punkteImZeitraum: number
}

export interface StandortErgebnis {
  punkte: StandortPunkt[]
  konten: KontoLage[]
  von: string
  bis: string
  /** true, wenn die Punktzahl an die Grenze gestossen ist. */
  gekuerzt: boolean
  grenze: number
}

const SPALTEN =
  'id, user_id, latitude, longitude, accuracy_meters, altitude, speed, heading, '
  + 'timestamp_utc, created_at, session_id, service_id, platform, app_version, '
  + 'device_info, ip_address, erfasst_im_modus'

function begrenze(n: unknown, min: number, max: number, standard: number): number {
  const z = Number(n)
  if (!Number.isFinite(z)) return standard
  return Math.min(Math.max(Math.trunc(z), min), max)
}

/**
 * Zeitraum aufloesen. Ein unbrauchbares Datum wird VERWORFEN, nicht
 * geraten — ein stillschweigend auf „heute" gesetzter Zeitraum liefert
 * eine plausible, aber falsche Karte (dieselbe Regel wie in der
 * Sicherheitsspur).
 */
export function zeitraum(
  vonRoh: string | null | undefined,
  bisRoh: string | null | undefined,
  jetzt: Date = new Date(),
): { von: string; bis: string } {
  const parse = (wert: string | null | undefined, endeDesTages: boolean): Date | null => {
    if (!wert) return null
    const roh = /^\d{4}-\d{2}-\d{2}$/.test(wert)
      ? `${wert}T${endeDesTages ? '23:59:59.999' : '00:00:00.000'}Z`
      : wert
    const d = new Date(roh)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const bis = parse(bisRoh, true) ?? jetzt
  const vonGewuenscht =
    parse(vonRoh, false) ?? new Date(bis.getTime() - ZEITRAUM_VORGABE_STUNDEN * 3_600_000)

  // Die Obergrenze wird nicht als Fehler gemeldet, sondern eingehalten.
  // Ein abgelehnter Zeitraum verleitet zum naechsten Versuch; ein
  // gekuerzter zeigt, wo die Grenze liegt.
  const frueheste = new Date(bis.getTime() - ZEITRAUM_MAX_TAGE * 86_400_000)
  const von = vonGewuenscht < frueheste ? frueheste : vonGewuenscht

  return { von: von.toISOString(), bis: bis.toISOString() }
}

function punktAus(z: Record<string, unknown>): StandortPunkt {
  const geraet = z.device_info as Record<string, unknown> | null
  const teile = [geraet?.browser, geraet?.betriebssystem].filter(
    (t): t is string => typeof t === 'string' && t !== 'unbekannt',
  )
  return {
    id: String(z.id),
    userId: String(z.user_id),
    latitude: Number(z.latitude),
    longitude: Number(z.longitude),
    accuracyMeters: z.accuracy_meters == null ? null : Number(z.accuracy_meters),
    altitude: z.altitude == null ? null : Number(z.altitude),
    speed: z.speed == null ? null : Number(z.speed),
    heading: z.heading == null ? null : Number(z.heading),
    timestampUtc: String(z.timestamp_utc),
    createdAt: String(z.created_at),
    sessionId: (z.session_id as string | null) ?? null,
    serviceId: (z.service_id as string | null) ?? null,
    plattform: (z.platform as string | null) ?? null,
    appVersion: (z.app_version as string | null) ?? null,
    modus: String(z.erfasst_im_modus),
    ip: (z.ip_address as string | null) ?? null,
    geraet: teile.length ? teile.join(' auf ') : null,
  }
}

/**
 * Punkte und Kontenlage in einem Zug.
 *
 * Die Kontenliste enthaelt AUCH Konten ohne Punkt im Zeitraum, solange
 * sie eine Freigabe haben. Das ist der Unterschied zwischen „meldet
 * nichts" und „ist nicht freigegeben" — und genau den soll die Ansicht
 * zeigen koennen, statt beides als Leerstelle darzustellen.
 */
export async function leseStandort(
  admin: AdminClient,
  filter: StandortFilter,
): Promise<StandortErgebnis> {
  if (!UUID_RE.test(filter.organizationId)) {
    throw new Error('Standortansicht: organizationId ist keine gueltige Kennung')
  }
  if (filter.userId && !UUID_RE.test(filter.userId)) {
    throw new Error('Standortansicht: userId ist keine gueltige Kennung')
  }

  const { von, bis } = zeitraum(filter.vonDatum, filter.bisDatum)
  const grenze = begrenze(filter.grenze, 1, PUNKTE_MAX, PUNKTE_STANDARD)

  let q = admin
    .from('location_updates')
    .select(SPALTEN)
    .eq('organization_id', filter.organizationId)
    .gte('timestamp_utc', von)
    .lte('timestamp_utc', bis)
    .order('timestamp_utc', { ascending: false })
    .limit(grenze)

  if (filter.userId) q = q.eq('user_id', filter.userId)
  if (filter.plattform) q = q.eq('platform', filter.plattform)

  const { data, error } = await q
  if (error) throw error

  const punkte = ((data ?? []) as Record<string, unknown>[]).map(punktAus)

  // ── Freigaben des Mandanten ──────────────────────────────────────
  let fq = admin
    .from('location_sharing_settings')
    .select('user_id, mode, enabled_at, disabled_at, os_permission_granted')
    .eq('organization_id', filter.organizationId)
  if (filter.userId) fq = fq.eq('user_id', filter.userId)

  const { data: freigaben, error: fehlerFreigaben } = await fq
  if (fehlerFreigaben) throw fehlerFreigaben

  const lage = new Map<string, KontoLage>()
  for (const f of (freigaben ?? []) as Record<string, unknown>[]) {
    const userId = String(f.user_id)
    const modus = f.mode
    lage.set(userId, {
      userId,
      name: null,
      email: null,
      rolle: null,
      modus: istModus(modus) ? modus : MODUS_AUS,
      enabledAt: (f.enabled_at as string | null) ?? null,
      disabledAt: (f.disabled_at as string | null) ?? null,
      osPermissionGranted: f.os_permission_granted === true,
      letzterPunkt: null,
      punkteImZeitraum: 0,
    })
  }

  // Punkte den Konten zuordnen. Die Liste ist absteigend sortiert —
  // der erste Treffer je Konto ist der juengste.
  for (const p of punkte) {
    let eintrag = lage.get(p.userId)
    if (!eintrag) {
      // Punkte ohne Freigabezeile: kann nur ein Bestand sein, dessen
      // Freigabe nach der Erhebung geloescht wurde. Sichtbar machen,
      // nicht verschweigen.
      eintrag = {
        userId: p.userId, name: null, email: null, rolle: null,
        modus: MODUS_AUS, enabledAt: null, disabledAt: null,
        osPermissionGranted: false, letzterPunkt: null, punkteImZeitraum: 0,
      }
      lage.set(p.userId, eintrag)
    }
    if (!eintrag.letzterPunkt) eintrag.letzterPunkt = p
    eintrag.punkteImZeitraum += 1
  }

  // ── Namen ────────────────────────────────────────────────────────
  const kennungen = [...lage.keys()]
  if (kennungen.length) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, first_name, last_name, email, role')
      .in('id', kennungen)

    for (const p of (profile ?? []) as Record<string, unknown>[]) {
      const eintrag = lage.get(String(p.id))
      if (!eintrag) continue
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
      eintrag.name = name || null
      eintrag.email = (p.email as string | null) ?? null
      eintrag.rolle = (p.role as string | null) ?? null
    }
  }

  const konten = [...lage.values()].sort((a, b) => {
    const ta = a.letzterPunkt?.timestampUtc ?? ''
    const tb = b.letzterPunkt?.timestampUtc ?? ''
    if (ta !== tb) return tb.localeCompare(ta)
    return (a.name ?? a.userId).localeCompare(b.name ?? b.userId)
  })

  return { punkte, konten, von, bis, gekuerzt: punkte.length >= grenze, grenze }
}
