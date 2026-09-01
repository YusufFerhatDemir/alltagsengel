// ═══════════════════════════════════════════════════════════════
// BEWERTUNGEN — zentrale Lese-/Schreibschicht mit Mandanten-Fence
// ═══════════════════════════════════════════════════════════════
// Warum diese Datei existiert:
//
// `angel_reviews` hat KEINE organization_id — der Mandant haengt an der
// Buchung (`bookings.organization_id`). Jede Leseabfrage muss die
// Bewertungen deshalb ueber ihre Buchung gegen die aktive Org pruefen.
// Passiert das an drei Stellen per Copy-Paste, faellt frueher oder
// spaeter eine davon aus dem Fence — genau so entstand der PII-Leak im
// GET-Handler. Deshalb: genau ein Pfad, den API-Route und RSC teilen.
//
// Kontrakt:
//   - Es wird der Service-Role-Client benutzt (RLS umgangen), also MUSS
//     hier jeder Fence explizit stehen.
//   - Fail-closed: Bewertung ohne auffindbare Buchung in der aktiven Org
//     wird verworfen, nicht ausgeliefert.
//   - Ausgeliefert werden ausschliesslich die Felder aus
//     `OeffentlicheBewertung` — kein customer_id, kein booking_id,
//     kein Nachname.

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

/** Maximal ausgelieferte Bewertungen pro Engel-Abfrage. */
export const MAX_BEWERTUNGEN = 50

/** Maximale Kommentarlaenge (die DB hat keine Begrenzung). */
export const MAX_KOMMENTAR_LAENGE = 2000

/**
 * Das einzige Format, das den Server verlaesst.
 * Bewusst OHNE customer_id/booking_id: beides sind stabile Identifikatoren,
 * mit denen sich Bewertungen auf konkrete Personen bzw. Buchungen
 * zurueckfuehren lassen.
 */
export type OeffentlicheBewertung = {
  id: string
  rating: number
  punctuality: number | null
  friendliness: number | null
  reliability: number | null
  comment: string
  created_at: string
  /** Nur Vorname + Avatarfarbe — nie der Nachname. */
  verfasser: { first_name: string | null; avatar_color: string | null }
}

/** Spalten, die aus angel_reviews ueberhaupt gelesen werden duerfen. */
const LESE_SPALTEN =
  'id, booking_id, customer_id, rating, punctuality, friendliness, reliability, comment, created_at'

type RohBewertung = {
  id: string
  booking_id: string
  customer_id: string | null
  rating: number
  punctuality: number | null
  friendliness: number | null
  reliability: number | null
  comment: string | null
  created_at: string
}

/**
 * Filtert Bewertungen auf jene, deren Buchung in `orgId` liegt.
 * Fail-closed: Buchung nicht gefunden → Bewertung faellt raus.
 */
async function nurEigeneOrg(
  admin: ReturnType<typeof createAdminClient>,
  bewertungen: RohBewertung[],
  orgId: string
): Promise<RohBewertung[]> {
  const buchungsIds = [...new Set(bewertungen.map(b => b.booking_id).filter(Boolean))]
  if (buchungsIds.length === 0) return []

  const { data: buchungen, error } = await admin
    .from('bookings')
    .select('id')
    .in('id', buchungsIds)
    .eq('organization_id', orgId)

  if (error) return [] // fail-closed
  const erlaubt = new Set((buchungen || []).map(b => b.id))
  return bewertungen.filter(b => erlaubt.has(b.booking_id))
}

/** Vornamen der Verfasser nachladen (nie Nachnamen). */
async function ladeVerfasser(
  admin: ReturnType<typeof createAdminClient>,
  kundenIds: string[]
): Promise<Map<string, { first_name: string | null; avatar_color: string | null }>> {
  const ids = [...new Set(kundenIds.filter(Boolean))]
  const map = new Map<string, { first_name: string | null; avatar_color: string | null }>()
  if (ids.length === 0) return map

  // MITTEL — bewusst nicht fail-closed: faellt diese Abfrage aus, fehlen
  // Vorname und Farbe, die Bewertung selbst bleibt aber vollstaendig und
  // richtig. Eine Bewertungsliste wegen eines fehlenden Vornamens ganz zu
  // verweigern waere unverhaeltnismaessig. Der Fehler gehoert trotzdem
  // ins Protokoll, damit er nicht voellig unsichtbar bleibt.
  const { data, error } = await admin
    .from('profiles')
    .select('id, first_name, avatar_color')
    .in('id', ids)

  if (error) {
    logger.child('reviews').warn(
      'Verfassernamen nicht lesbar — Bewertungen erscheinen ohne Vornamen',
      { errorMessage: error.message },
    )
  }

  for (const p of data || []) {
    map.set(p.id, { first_name: p.first_name ?? null, avatar_color: p.avatar_color ?? null })
  }
  return map
}

function zuOeffentlich(
  roh: RohBewertung,
  verfasser: Map<string, { first_name: string | null; avatar_color: string | null }>
): OeffentlicheBewertung {
  return {
    id: roh.id,
    rating: roh.rating,
    punctuality: roh.punctuality,
    friendliness: roh.friendliness,
    reliability: roh.reliability,
    comment: roh.comment ?? '',
    created_at: roh.created_at,
    verfasser: (roh.customer_id && verfasser.get(roh.customer_id)) || {
      first_name: null,
      avatar_color: null,
    },
  }
}

/**
 * Bewertungen eines Engels — gefenced auf die aktive Organisation.
 * Reihenfolge bewusst: erst max. MAX_BEWERTUNGEN Zeilen holen, dann
 * fencen. So bleibt die `in()`-Liste der Buchungspruefung beschraenkt.
 */
export async function ladeEngelBewertungen(
  angelId: string,
  orgId: string,
  limit: number = MAX_BEWERTUNGEN
): Promise<OeffentlicheBewertung[]> {
  if (!angelId || !orgId) return []
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('angel_reviews')
    .select(LESE_SPALTEN)
    .eq('angel_id', angelId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, MAX_BEWERTUNGEN))

  if (error || !data) return []

  const eigene = await nurEigeneOrg(admin, data as RohBewertung[], orgId)
  const verfasser = await ladeVerfasser(admin, eigene.map(b => b.customer_id!).filter(Boolean))
  return eigene.map(b => zuOeffentlich(b, verfasser))
}

/**
 * Bewertung zu EINER Buchung.
 * Zugriff nur fuer: Kunde der Buchung, Engel der Buchung, Admin.
 * Jeweils zusaetzlich gefenced auf die aktive Organisation.
 *
 * Rueckgabe `{ erlaubt: false }` → Aufrufer antwortet mit 404, nicht 403:
 * ein 403 wuerde die Existenz fremder Buchungen bestaetigen.
 */
export async function ladeBuchungsBewertung(
  bookingId: string,
  userId: string,
  orgId: string,
  istAdmin: boolean
): Promise<{ erlaubt: boolean; bewertung: OeffentlicheBewertung | null }> {
  if (!bookingId || !userId || !orgId) return { erlaubt: false, bewertung: null }
  const admin = createAdminClient()

  const { data: buchung, error } = await admin
    .from('bookings')
    .select('id, customer_id, angel_id, organization_id')
    .eq('id', bookingId)
    .maybeSingle()

  if (error || !buchung) return { erlaubt: false, bewertung: null }
  if (buchung.organization_id !== orgId) return { erlaubt: false, bewertung: null }

  const beteiligt = buchung.customer_id === userId || buchung.angel_id === userId
  if (!beteiligt && !istAdmin) return { erlaubt: false, bewertung: null }

  const { data: roh } = await admin
    .from('angel_reviews')
    .select(LESE_SPALTEN)
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (!roh) return { erlaubt: true, bewertung: null }

  const verfasser = await ladeVerfasser(admin, [(roh as RohBewertung).customer_id!])
  return { erlaubt: true, bewertung: zuOeffentlich(roh as RohBewertung, verfasser) }
}

/**
 * Durchschnittsbewertung des Engels neu berechnen.
 *
 * Muss ueber den Admin-Client laufen: die `angels`-RLS erlaubt UPDATE nur
 * dem Engel selbst bzw. Admins — der Kunde, der gerade bewertet hat, ist
 * beides nicht. Vorher lief der Update ueber den User-Client und schlug
 * damit still fehl, die Durchschnittsnote blieb also stehen.
 *
 * `total_jobs` wird bewusst NICHT mitgeschrieben: das Feld zaehlt
 * erledigte Auftraege, nicht Bewertungen.
 */
export async function aktualisiereEngelDurchschnitt(angelId: string): Promise<void> {
  if (!angelId) return
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('angel_reviews')
    .select('rating')
    .eq('angel_id', angelId)

  if (error || !data || data.length === 0) return

  const schnitt = data.reduce((summe, r) => summe + (r.rating || 0), 0) / data.length
  await admin
    .from('angels')
    .update({ rating: Math.round(schnitt * 10) / 10 })
    .eq('id', angelId)
}

/** true, wenn der User Admin/Superadmin ist. Fail-closed bei Fehlern. */
export async function istAdminUser(userId: string): Promise<boolean> {
  if (!userId) return false
  try {
    const admin = createAdminClient()
    // GEPRUEFT 01.09.2026 — verworfener Fehler mit der richtigen
    // Wirkung: `data` bleibt null, `data?.role` ist undefined, die
    // Funktion gibt false zurueck. „Im Zweifel kein Administrator" ist
    // die Zusage im Kopf dieser Funktion. Nicht auf „Fehler werfen"
    // umbauen, ohne den Aufrufer in app/api/reviews/route.ts mitzuziehen.
    const { data } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
    return data?.role === 'admin' || data?.role === 'superadmin'
  } catch {
    return false
  }
}
