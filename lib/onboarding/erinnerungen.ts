/**
 * Onboarding — Erinnerungslauf
 *
 * Zweigeteilt, und das ist der Punkt: `planeErinnerungen()` entscheidet
 * (rein, ohne Datenbank, vollständig testbar), `fuehreErinnerungslaufAus()`
 * führt aus. Eine Entscheidungsregel, die im Cron-Job steckt, ist nur im
 * Cron-Job prüfbar — also praktisch gar nicht.
 *
 * ── ERINNERN IST EIN EINGRIFF ──────────────────────────────────────────
 * Jede Nachricht geht an einen Menschen, der sich gerade NICHT gemeldet
 * hat. Der Plan steht in lib/onboarding/triggers.ts: zwei Stufen (nach
 * 1 und nach 3 Tagen ohne Aktivität), danach nie wieder. Im Zweifel wird
 * NICHT erinnert — eine ausbleibende Erinnerung kostet einen Kontakt,
 * eine zu viel kostet Vertrauen und landet beim nächsten Mal im
 * Spamordner, samt allem anderen, was wir dieser Person je schreiben.
 *
 * ── ABMELDUNGEN ───────────────────────────────────────────────────────
 * Onboarding-Erinnerungen sind TRANSAKTIONSPOST: sie betreffen einen
 * Vorgang, den die Person selbst begonnen hat. Sie verlangen deshalb
 * KEINE Newsletter-Einwilligung — die zu fordern hieße, fast niemanden
 * mehr erinnern zu dürfen, obwohl alle es erwarten.
 *
 * Was sie trotzdem aufhält, ist die SPERRLISTE: Hard Bounce, Spam-
 * Beschwerde, ausdrücklicher Widerspruch. Wer uns als Spam gemeldet hat,
 * bekommt keinen Anstoß mehr — auch keinen freundlichen.
 *
 * Ein Widerruf für eine einzelne Art (etwa Newsletter) hält sie dagegen
 * NICHT auf. Sonst bekäme niemand mehr eine Erinnerung zu einem Vorgang,
 * den er selbst begonnen hat, nur weil er keine Produktpost mag.
 *
 * ── KEINE DUBLETTEN ───────────────────────────────────────────────────
 * Versendet wird über sendeIdempotent(): der Unique-Index auf
 * (correlation_id, channel) lässt je Vorgang genau einen Erfolg zu, auch
 * wenn zwei Läufe gleichzeitig starten. Die correlation_id ist die
 * Fortschritts-ID plus Stufe — dieselbe Stufe kann damit nie zweimal
 * rausgehen, eine spätere Stufe schon.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { sendeIdempotent } from '@/lib/notifications/retry'
import { sendRawEmail } from '@/lib/notifications'
import { ladeEinwilligungsLage, normalisiereAdresse } from '@/lib/marketing/einwilligung'
import { esc } from '@/lib/notifications/html'
import { baueNachricht } from './notifications'
import { pruefeErinnerung, type NachrichtenAnlass } from './triggers'
import { offeneAblaeufe, vermerkeAutoNachricht, type OnboardingFortschritt } from './service'
import { gesamtSchritte } from './schritte'

const log = logger.child('onboarding:erinnerungen')

/** Wie viele Abläufe ein Lauf höchstens anfasst. */
export const MAX_JE_LAUF = 200

/**
 * Der Klartext als schlichtes HTML.
 *
 * Bewusst minimal und escapt: der Text stammt aus geprüften Vorlagen,
 * enthält aber Namen und Ortsangaben aus Nutzereingaben. Ohne esc() wäre
 * ein Nachname mit spitzer Klammer eine Lücke in jeder Mail.
 */
export function alsHtml(text: string): string {
  const absaetze = String(text ?? '')
    .split('\n\n')
    .map(a => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">`
      + `${esc(a).replace(/\n/g, '<br/>')}</p>`)
    .join('')
  return `<div style="font-family:system-ui,-apple-system,sans-serif;color:#222;">${absaetze}</div>`
}

export interface ErinnerungsEmpfaenger {
  userId: string
  email: string | null
  nachname: string | null
  anredeform: 'frau' | 'herr' | null
}

export interface GeplanteErinnerung {
  fortschrittId: string
  userId: string
  email: string
  anlass: NachrichtenAnlass
  /** Die wievielte Nachricht das ist (1-basiert). */
  stufe: number
  begruendung: string
  correlationId: string
}

export interface UebersprungeneErinnerung {
  fortschrittId: string
  grund: string
}

export interface Plan {
  geplant: GeplanteErinnerung[]
  uebersprungen: UebersprungeneErinnerung[]
}

/**
 * Zählt, wie viele automatische Nachrichten schon rausgingen.
 *
 * Aus `letzte_auto_nachricht` allein lässt sich das nicht ablesen —
 * dort steht nur der Zeitpunkt der letzten. Die Zahl kommt deshalb aus
 * der Zustellspur; der Aufrufer reicht sie herein.
 */
export type ErinnerungsZaehler = (fortschrittId: string) => number

export interface PlanEingabe {
  ablaeufe: readonly OnboardingFortschritt[]
  empfaenger: ReadonlyMap<string, ErinnerungsEmpfaenger>
  /** Adressen, die widersprochen haben oder gesperrt sind. */
  keineNachricht: ReadonlySet<string>
  bisherigeErinnerungen: ErinnerungsZaehler
  jetzt?: Date
}

/**
 * Entscheidet, wer jetzt eine Erinnerung bekommt.
 *
 * Rein rechnend. Jeder Ausschluss wird mit Grund festgehalten — ein Lauf,
 * der nur sagt „3 versendet", verbirgt genau die Fälle, die jemand sehen
 * müsste.
 */
export function planeErinnerungen(eingabe: PlanEingabe): Plan {
  const jetzt = eingabe.jetzt ?? new Date()
  const geplant: GeplanteErinnerung[] = []
  const uebersprungen: UebersprungeneErinnerung[] = []

  for (const ablauf of eingabe.ablaeufe) {
    const person = eingabe.empfaenger.get(ablauf.userId)
    const adresse = normalisiereAdresse(person?.email ?? null)

    if (!adresse) {
      uebersprungen.push({ fortschrittId: ablauf.id, grund: 'Keine E-Mail-Adresse hinterlegt.' })
      continue
    }
    if (eingabe.keineNachricht.has(adresse)) {
      // Widerspruch oder Sperrliste — auch ein freundlicher Anstoß ist
      // dann einer zu viel.
      uebersprungen.push({ fortschrittId: ablauf.id, grund: 'Adresse gesperrt oder widersprochen.' })
      continue
    }

    const bisher = eingabe.bisherigeErinnerungen(ablauf.id)
    const entscheidung = pruefeErinnerung({
      typ: ablauf.typ,
      aktuellerSchritt: ablauf.aktuellerSchritt,
      gesamtSchritte: ablauf.gesamtSchritte,
      fehlendeAngaben: ablauf.fehlendeAngaben,
      createdAt: ablauf.createdAt,
      updatedAt: ablauf.updatedAt,
      letzteAutoNachricht: ablauf.letzteAutoNachricht,
      abgeschlossenAm: ablauf.abgeschlossenAm,
      bisherigeErinnerungen: bisher,
    }, jetzt)

    if (!entscheidung.faellig || !entscheidung.anlass) {
      uebersprungen.push({ fortschrittId: ablauf.id, grund: entscheidung.begruendung })
      continue
    }

    const stufe = bisher + 1
    geplant.push({
      fortschrittId: ablauf.id,
      userId: ablauf.userId,
      email: adresse,
      anlass: entscheidung.anlass,
      stufe,
      begruendung: entscheidung.begruendung,
      // Stufe im Schlüssel: dieselbe Stufe kann nie zweimal rausgehen,
      // eine spätere schon.
      correlationId: `${ablauf.id}:erinnerung:${stufe}`,
    })
  }

  return { geplant, uebersprungen }
}

// ---------------------------------------------------------------------------
// Ausführung
// ---------------------------------------------------------------------------

export interface LaufErgebnis {
  organizationId: string
  betrachtet: number
  versendet: number
  uebersprungen: number
  fehlgeschlagen: number
  /** Gründe, aus denen nicht erinnert wurde — für die Betriebssicht. */
  gruende: UebersprungeneErinnerung[]
}

export interface LaufOptionen {
  organizationId: string
  /** Basis-URL für den Fortsetzen-Link. */
  basisUrl: string
  /** Nur planen, nichts versenden. */
  trockenlauf?: boolean
  maxJeLauf?: number
  jetzt?: Date
}

/** Wie oft für diesen Vorgang schon eine Erinnerung erfolgreich rausging. */
async function zaehleBisherige(
  admin: SupabaseClient,
  fortschrittIds: readonly string[],
): Promise<Map<string, number>> {
  const zaehler = new Map<string, number>()
  if (fortschrittIds.length === 0) return zaehler

  // Die Zustellspur ist die Wahrheit: dort steht je Stufe eine Zeile.
  const { data, error } = await admin
    .from('notification_delivery_log')
    .select('correlation_id')
    .in('status', ['sent', 'delivered'])
    .like('correlation_id', '%:erinnerung:%')

  if (error) {
    // Fail-closed: ohne belastbare Zahl wird NICHT erinnert. Eine zu viel
    // ist schlimmer als eine zu wenig.
    throw new Error(`Erinnerungszähler nicht lesbar: ${error.message}`)
  }

  for (const zeile of data ?? []) {
    const id = String(zeile.correlation_id ?? '').split(':')[0]
    if (id) zaehler.set(id, (zaehler.get(id) ?? 0) + 1)
  }
  return zaehler
}

/**
 * Führt den Erinnerungslauf für einen Mandanten aus.
 *
 * Reihenfolge: erst versenden, DANN vermerken. Andersherum verstummte man
 * nach einem einzigen Fehlversuch — der Vermerk stünde, die Nachricht
 * wäre nie angekommen.
 */
export async function fuehreErinnerungslaufAus(
  admin: SupabaseClient,
  optionen: LaufOptionen,
): Promise<LaufErgebnis> {
  const jetzt = optionen.jetzt ?? new Date()
  const grenze = optionen.maxJeLauf ?? MAX_JE_LAUF

  const ablaeufe = (await offeneAblaeufe(admin, {
    organizationId: optionen.organizationId,
    limit: grenze,
  }))

  const ergebnis: LaufErgebnis = {
    organizationId: optionen.organizationId,
    betrachtet: ablaeufe.length,
    versendet: 0,
    uebersprungen: 0,
    fehlgeschlagen: 0,
    gruende: [],
  }
  if (ablaeufe.length === 0) return ergebnis

  // ── Empfänger und Widerspruchslage ──────────────────────────────────
  const userIds = [...new Set(ablaeufe.map(a => a.userId))]
  const { data: profile, error: profilFehler } = await admin
    .from('profiles')
    .select('id, email, last_name')
    .in('id', userIds)

  if (profilFehler) throw new Error(`Empfänger nicht lesbar: ${profilFehler.message}`)

  const empfaenger = new Map<string, ErinnerungsEmpfaenger>(
    (profile ?? []).map(p => [String(p.id), {
      userId: String(p.id),
      email: (p.email as string | null) ?? null,
      nachname: (p.last_name as string | null) ?? null,
      // Die Anredeform wird NICHT geraten — lieber neutral als falsch.
      anredeform: null,
    }]),
  )

  const adressen = [...empfaenger.values()]
    .map(e => normalisiereAdresse(e.email))
    .filter(Boolean)

  // Die Einwilligungsart ist hier OHNE Bedeutung: gelesen wird
  // ausschliesslich `gesperrt`, und die Sperrliste gilt unabhaengig von
  // der Art. Ein Widerruf FÜR EINE ART (etwa Newsletter) haelt eine
  // Transaktionsnachricht bewusst NICHT auf — sonst bekaeme niemand mehr
  // eine Erinnerung zu einem Vorgang, den er selbst begonnen hat, nur
  // weil er keine Produktpost mag.
  const lage = await ladeEinwilligungsLage(admin, optionen.organizationId, adressen, 'produktinfo')
  const keineNachricht = new Set<string>(lage.gesperrt)

  const zaehler = await zaehleBisherige(admin, ablaeufe.map(a => a.id))

  const plan = planeErinnerungen({
    ablaeufe,
    empfaenger,
    keineNachricht,
    bisherigeErinnerungen: id => zaehler.get(id) ?? 0,
    jetzt,
  })

  ergebnis.uebersprungen = plan.uebersprungen.length
  ergebnis.gruende = plan.uebersprungen

  if (optionen.trockenlauf) return ergebnis

  // ── Versand ─────────────────────────────────────────────────────────
  for (const erinnerung of plan.geplant) {
    const ablauf = ablaeufe.find(a => a.id === erinnerung.fortschrittId)
    if (!ablauf) continue

    const person = empfaenger.get(erinnerung.userId)
    const nachricht = baueNachricht(erinnerung.anlass, {
      typ: ablauf.typ,
      empfaenger: { nachname: person?.nachname ?? null, anredeform: person?.anredeform ?? null },
      aktuellerSchritt: ablauf.aktuellerSchritt,
      gesamtSchritte: ablauf.gesamtSchritte || gesamtSchritte(ablauf.typ),
      fehlendeAngaben: ablauf.fehlendeAngaben,
      fortsetzenUrl: `${optionen.basisUrl.replace(/\/+$/, '')}/onboarding/${ablauf.typ}`,
    })

    try {
      const versand = await sendeIdempotent({
        kontext: {
          organizationId: optionen.organizationId,
          correlationId: erinnerung.correlationId,
          vorgangArt: 'onboarding_erinnerung',
          vorgangRef: ablauf.id,
          vorgangEmpfaenger: ablauf.userId,
        },
        channel: 'email',
        provider: 'resend',
        recipient: erinnerung.email,
        admin,
        senden: () => sendRawEmail({
          to: erinnerung.email,
          subject: nachricht.betreff,
          html: alsHtml(nachricht.text),
          text: nachricht.text,
        }),
      })

      if (versand.status === 'versendet') {
        ergebnis.versendet++
        // ERST nach erfolgreichem Versand vermerken.
        await vermerkeAutoNachricht(admin, ablauf.id, jetzt.toISOString())
      } else if (versand.status === 'fehlgeschlagen') {
        ergebnis.fehlgeschlagen++
        ergebnis.gruende.push({ fortschrittId: ablauf.id, grund: versand.grund ?? 'Versand fehlgeschlagen' })
      } else {
        ergebnis.uebersprungen++
        ergebnis.gruende.push({ fortschrittId: ablauf.id, grund: versand.grund ?? versand.status })
      }
    } catch (err) {
      // Ein Fehlschlag darf den Lauf nicht abbrechen — sonst bekommt
      // niemand hinter dieser Zeile je eine Erinnerung.
      ergebnis.fehlgeschlagen++
      log.errorWithException('Erinnerung fehlgeschlagen', err, { ablauf: ablauf.id })
    }
  }

  return ergebnis
}
