// ═══════════════════════════════════════════════════════════════════════
// Wiederherstellung von Buchungs-Benachrichtigungen
// ═══════════════════════════════════════════════════════════════════════
//
// Registriert die drei Buchungsereignisse im Vorgangsregister. Damit kann
// der Wiederholungslauf eine gescheiterte Zustellung neu ausloesen,
// obwohl das Protokoll keinen Nachrichteninhalt enthaelt: er kennt Art
// ('booking-neu') und Referenz (bookings.id) und baut daraus dieselbe
// Nachricht wie beim Erstversand.
//
// GENAU EIN KANAL JE AUFRUF
// Nach einem Buchungsereignis gehen In-App, E-Mail und Push getrennt
// raus. Scheitert nur die E-Mail, darf die Wiederholung die In-App-
// Nachricht nicht ein zweites Mal ins Postfach legen — deshalb schaltet
// jeder Wiederhersteller auf den einen Kanal, der wiederholt wird.
//
// KEIN ZUSTELLKONTEXT IN DEN VERSANDAUFRUFEN
// Die Protokollzeile schreibt sendeIdempotent() drumherum. Wuerde hier
// zusaetzlich protokolliert, gaebe es pro Versuch zwei Zeilen und die
// Versuchsobergrenze waere nach der Haelfte erreicht.
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { createNotification, sendEmailNotificationErgebnis } from '@/lib/notifications'
import { sendPushToUser } from '@/lib/push'
import { esc } from '@/lib/notifications/html'
import type { SendeErgebnis } from '@/lib/notifications/retry'
import { registriereVorgang, type WiederherstellungKontext } from '@/lib/notifications/wiederherstellung'
import {
  baueBuchungsNachricht,
  BUCHUNGS_ARTEN,
  type BookingNotifyData,
  type BuchungsArt,
} from '@/lib/notifications/vorgaenge/buchung-inhalt'

const log = logger.child('vorgang-buchung')

interface ProfilTeil {
  id?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

function ersteOderSelbst<T>(wert: T | T[] | null | undefined): T | null {
  if (Array.isArray(wert)) return wert[0] ?? null
  return wert ?? null
}

/** „Maria Schmidt" → „Maria S." — identisch zur Erstversand-Route. */
function kurzname(p: ProfilTeil | null, fallback: string): string {
  if (!p?.first_name) return fallback
  return `${p.first_name} ${p.last_name?.[0] || ''}.`
}

interface Geladen {
  data: BookingNotifyData
  grund: string | null
  kundeId: string | null
  engelId: string | null
  emailVon: Record<string, string | null>
}

/**
 * Laedt die Buchung samt Beteiligten.
 *
 * Der Mandantenfilter ist NICHT optional: der Lauf arbeitet mit dem
 * service_role-Client, RLS greift also nicht. Ohne den expliziten
 * organization_id-Filter koennte eine manipulierte Protokollzeile eine
 * fremde Buchung wiederherstellen lassen.
 */
async function ladeBuchung(
  admin: SupabaseClient,
  organizationId: string,
  bookingId: string
): Promise<Geladen | null> {
  const { data: roh, error } = await admin
    .from('bookings')
    .select(`
      id, customer_id, angel_id, service, date, time, duration_hours, total_amount,
      customer:profiles!bookings_customer_id_fkey(id, first_name, last_name, email),
      angel:angels!bookings_angel_id_fkey(id, profiles(id, first_name, last_name, email))
    `)
    .eq('id', bookingId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error || !roh) {
    if (error) log.warn('Buchung fuer Wiederholung nicht lesbar', { errorMessage: error.message })
    return null
  }

  const b = roh as unknown as Record<string, unknown>
  const kunde = ersteOderSelbst(b.customer as ProfilTeil | ProfilTeil[] | null)
  const engelZeile = ersteOderSelbst(b.angel as Record<string, unknown> | Record<string, unknown>[] | null)
  const engelProfil = ersteOderSelbst(
    (engelZeile?.profiles ?? null) as ProfilTeil | ProfilTeil[] | null
  )

  // decline_reason kennt die Live-Datenbank nicht ueberall (siehe
  // app/api/bookings/respond/route.ts). Eigene, tolerante Abfrage: fehlt
  // die Spalte, wird ohne Grund wiederholt statt gar nicht.
  let grund: string | null = null
  const { data: grundZeile, error: grundFehler } = await admin
    .from('bookings')
    .select('decline_reason')
    .eq('id', bookingId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!grundFehler && grundZeile) {
    const w = (grundZeile as Record<string, unknown>).decline_reason
    grund = typeof w === 'string' && w.trim() !== '' ? w : null
  }

  const zeit = b.time as string | null

  return {
    data: {
      bookingId: b.id as string,
      customerName: kurzname(kunde, 'Kunde'),
      angelName: kurzname(engelProfil, 'Engel'),
      service: (b.service as string) || 'Alltagsbegleitung',
      date: b.date as string,
      time: zeit?.slice(0, 5) || '—',
      duration: (b.duration_hours as number) || 2,
      amount: Number(b.total_amount) || 0,
    },
    grund,
    kundeId: (b.customer_id as string | null) ?? kunde?.id ?? null,
    engelId: (engelZeile?.id as string | null) ?? engelProfil?.id ?? null,
    emailVon: {
      ...(kunde?.id ? { [kunde.id]: kunde.email ?? null } : {}),
      ...(engelProfil?.id ? { [engelProfil.id]: engelProfil.email ?? null } : {}),
      ...(b.customer_id ? { [b.customer_id as string]: kunde?.email ?? null } : {}),
      ...(engelZeile?.id ? { [engelZeile.id as string]: engelProfil?.email ?? null } : {}),
    },
  }
}

/**
 * Fuehrt die Zustellung eines Buchungsereignisses auf GENAU EINEM Kanal
 * erneut aus.
 */
async function stelleWiederHer(
  art: BuchungsArt,
  kontext: WiederherstellungKontext
): Promise<SendeErgebnis> {
  const geladen = await ladeBuchung(kontext.admin, kontext.organizationId, kontext.vorgangRef)
  if (!geladen) {
    // Die Buchung ist weg (geloescht, anderer Mandant). Dauerhaft — ein
    // weiterer Versuch findet sie auch nicht.
    return {
      ok: false,
      fehler: { message: 'Buchung nicht gefunden oder anderer Mandant', statusCode: 404 },
    }
  }

  const empfaengerId = kontext.empfaengerId ?? null
  if (!empfaengerId) {
    return { ok: false, uebersprungen: true, fehler: 'Kein Empfaenger protokolliert' }
  }

  const nachricht = baueBuchungsNachricht(art, geladen.data, geladen.grund)

  if (kontext.channel === 'in_app') {
    const ok = await createNotification(kontext.admin, {
      userId: empfaengerId,
      type: nachricht.inApp.type,
      title: nachricht.inApp.title,
      body: nachricht.inApp.body,
      link: nachricht.inApp.link,
      data: nachricht.inApp.data,
    })
    return ok
      ? { ok: true }
      : { ok: false, fehler: 'In-App-Benachrichtigung konnte nicht gespeichert werden' }
  }

  if (kontext.channel === 'push') {
    const { sent, failed } = await sendPushToUser(empfaengerId, nachricht.push)
    if (sent > 0) return { ok: true }
    // Kein Abo und kein Fehlversuch: es gibt schlicht kein Geraet. Das
    // ist keine Stoerung und darf die Versuchsobergrenze nicht belasten.
    if (failed === 0) return { ok: false, uebersprungen: true, fehler: 'Kein Push-Abo vorhanden' }
    return { ok: false, fehler: 'Push-Zustellung fehlgeschlagen' }
  }

  if (kontext.channel === 'email') {
    // Aktuelle Adresse gewinnt: hat der Empfaenger sie seit dem
    // Fehlversuch geaendert, soll die Wiederholung dorthin gehen. Der
    // protokollierte Wert bleibt der Rueckfall.
    const aktuell = geladen.emailVon[empfaengerId] ?? null
    const to = aktuell || kontext.recipient
    if (!to || !to.includes('@')) {
      return { ok: false, uebersprungen: true, fehler: 'Keine E-Mail-Adresse hinterlegt' }
    }

    const vorname = to === aktuell ? empfaengerVorname(geladen, empfaengerId) : null
    const ergebnis = await sendEmailNotificationErgebnis(
      to,
      esc(vorname || nachricht.email.anredeFallback),
      nachricht.email.subject,
      nachricht.email.html
    )
    if (ergebnis.ok) return { ok: true, providerMessageId: ergebnis.messageId }
    return {
      ok: false,
      uebersprungen: ergebnis.uebersprungen === true,
      fehler: ergebnis.grund,
    }
  }

  // whatsapp: fuer Buchungsereignisse gibt es keinen solchen Versandweg.
  return { ok: false, uebersprungen: true, fehler: `Kanal ${kontext.channel} nicht vorgesehen` }
}

function empfaengerVorname(geladen: Geladen, empfaengerId: string): string | null {
  if (empfaengerId === geladen.kundeId) return geladen.data.customerName.split(' ')[0] || null
  if (empfaengerId === geladen.engelId) return geladen.data.angelName.split(' ')[0] || null
  return null
}

/** Kanaele, die der Erstversand fuer Buchungen bedient. */
const BUCHUNGS_KANAELE = ['in_app', 'email', 'push'] as const

for (const art of BUCHUNGS_ARTEN) {
  registriereVorgang(art, BUCHUNGS_KANAELE, kontext => stelleWiederHer(art, kontext))
}
