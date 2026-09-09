import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import {
  istLeistung, istRegion, istPflegegrad, WARTELISTE_MAX,
} from '@/lib/warteliste/katalog'
import { entwurfAnlegenOhneAbbruch, vornameAus } from '@/lib/email/entwuerfe'

const log = logger.child('waitlist')

// ═══════════════════════════════════════════════════════════════════════
// KUNDEN-WARTELISTE — Vormerkung entgegennehmen
//
// Schreibt mit dem Dienstschluessel, nicht als anon: dieselbe Bauweise wie
// /api/lead-inquiry seit dem 28.08.2026. Rate-Limit, Honeypot und
// Laengenpruefung sitzen hier — an einer offenen Tabellentuer saesse
// nichts davon, und die Tabelle waere in einer Nacht vollgeschrieben.
// ═══════════════════════════════════════════════════════════════════════

const supabaseAdmin = createAdminClient()

/** PostgREST meldet eine fehlende Tabelle so. Siehe Behandlung unten. */
const TABELLE_FEHLT = 'PGRST205'
/** Verletzung eines UNIQUE-Index — hier: schon vorgemerkt. */
const DUPLIKAT = '23505'

function text(wert: unknown, max: number): string | null {
  if (typeof wert !== 'string') return null
  const t = wert.trim()
  if (!t || t.length > max) return null
  return t
}

export const POST = withTracking(async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    // Etwas grosszuegiger als /api/lead-inquiry (5/10 Min): das Formular ist
    // laenger, ein Tippfehler beim Absenden soll niemanden aussperren.
    if (!(await rateLimitPersistent(`waitlist:${ip}`, 8, 10 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'Zu viele Anfragen — bitte versuchen Sie es in einigen Minuten erneut.' },
        { status: 429 },
      )
    }

    const body = await request.json()

    // Honeypot: unsichtbares Feld. Bewusst 201, damit der Bot nichts merkt.
    if (body.website) {
      return NextResponse.json({ success: true }, { status: 201 })
    }

    const name = text(body.name, WARTELISTE_MAX.name)
    const email = text(body.email, WARTELISTE_MAX.email)
    const phone = text(body.phone, WARTELISTE_MAX.phone)
    const nachricht = text(body.nachricht, WARTELISTE_MAX.nachricht)

    if (!name) {
      return NextResponse.json({ error: 'Bitte geben Sie Ihren Namen an.' }, { status: 400 })
    }

    // Ohne Rueckweg ist eine Vormerkung wertlos — wir koennen den Bescheid
    // dann niemandem melden. Dieselbe Bedingung steht als CHECK in der
    // Datenbank; hier steht sie, damit der Mensch davor einen Satz liest
    // und keine Postgres-Meldung.
    if (!email && !phone) {
      return NextResponse.json(
        { error: 'Bitte geben Sie eine E-Mail-Adresse oder eine Telefonnummer an — sonst können wir Sie nicht benachrichtigen.' },
        { status: 400 },
      )
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' }, { status: 400 })
    }

    if (phone && (phone.match(/[0-9]/g) || []).length < 6) {
      return NextResponse.json({ error: 'Bitte geben Sie eine gültige Telefonnummer an.' }, { status: 400 })
    }

    // Datenschutz-Einwilligung: ohne sie wird nichts gespeichert.
    if (body.datenschutz !== true) {
      return NextResponse.json(
        { error: 'Bitte bestätigen Sie die Datenschutzhinweise.' },
        { status: 400 },
      )
    }

    // Auswahlfelder fail-closed: ein unbekannter Wert wird verworfen, nicht
    // durchgereicht. Sonst schriebe ein manipuliertes Formular freien Text
    // in eine Spalte, deren CHECK ihn danach abweist — mit „Speicherfehler"
    // als einziger Rueckmeldung.
    const region = istRegion(body.region) ? body.region : null
    const pflegegrad = istPflegegrad(body.pflegegrad) ? body.pflegegrad : null

    const roheLeistungen: unknown[] = Array.isArray(body.gewuenschte_leistungen)
      ? body.gewuenschte_leistungen
      : []
    const leistungen: string[] = [...new Set(
      roheLeistungen.filter((w): w is string => istLeistung(w)),
    )]

    const zeile = {
      // Ausdruecklich gesetzt statt auf den Spalten-Default current_org_id()
      // zu vertrauen: dieser Weg laeuft ohne auth.uid(), der Default waere
      // dort ein fail-open-Rueckfall statt einer Aussage.
      organization_id: DEFAULT_ORG_ID,
      name,
      email,
      phone,
      region,
      pflegegrad,
      gewuenschte_leistungen: leistungen,
      nachricht,
      utm_source: text(body.utm_source, WARTELISTE_MAX.utm),
      utm_medium: text(body.utm_medium, WARTELISTE_MAX.utm),
      utm_campaign: text(body.utm_campaign, WARTELISTE_MAX.utm),
      status: 'neu',
    }

    const { data: angelegt, error: dbFehler } = await supabaseAdmin
      .from('waitlist_customers')
      .insert(zeile)
      .select('id')
      .single()

    if (dbFehler) {
      // ── Schon vorgemerkt ────────────────────────────────────────────
      // Der Teil-Unique-Index greift. Das ist kein Fehler des Menschen
      // davor, sondern die richtige Antwort: er steht bereits auf der
      // Liste. 200 statt 409, weil das Ergebnis aus seiner Sicht dasselbe
      // ist — er ist vorgemerkt.
      if (dbFehler.code === DUPLIKAT) {
        return NextResponse.json(
          { success: true, bereits_vorgemerkt: true },
          { status: 200 },
        )
      }

      // ── Tabelle steht noch nicht ────────────────────────────────────
      // Die Migration 20261031000000 kann nur ein Mensch im
      // Supabase-SQL-Editor als `postgres` anwenden; ueber den
      // Dienstschluessel scheitert jedes DDL am Eigentuemer (42501).
      // Solange sie fehlt, wird das AUSDRUECKLICH gemeldet — eine
      // Erfolgsmeldung waere hier die teuerste Luege der ganzen Seite:
      // der Interessent glaubte sich vorgemerkt und stuende nirgends.
      if (dbFehler.code === TABELLE_FEHLT) {
        log.error('waitlist_customers fehlt — Migration 20261031000000 ist nicht angewendet.')
        return NextResponse.json(
          {
            error: 'Die Warteliste ist noch nicht freigeschaltet. Bitte versuchen Sie es später erneut oder rufen Sie uns an.',
            code: 'WARTELISTE_NICHT_BEREIT',
          },
          { status: 503 },
        )
      }

      log.errorWithException('Vormerkung konnte nicht gespeichert werden', dbFehler)
      return NextResponse.json({ error: 'Speicherfehler' }, { status: 500 })
    }

    // ── Bestaetigung vorbereiten, NICHT senden ──────────────────────
    // Vorgabe: keine automatisch versendeten E-Mails. Der Eintrag erzeugt
    // deshalb einen ENTWURF, den die Verwaltung unter /admin/waitlist sieht
    // und mit einem Klick sendet. Ohne diesen Schritt muesste sie jede
    // Vormerkung von Hand nacharbeiten — mit ihm ist es ein Knopf.
    //
    // Scheitert der Entwurf, laeuft die Vormerkung trotzdem durch: die
    // Vormerkung ist das Wertvolle, der Entwurf nur die Bequemlichkeit.
    if (email) {
      await entwurfAnlegenOhneAbbruch({
        vorlageId: 'warteliste_welcome',
        empfaengerEmail: email,
        empfaengerName: name,
        bezugTabelle: 'waitlist_customers',
        bezugId: angelegt?.id ?? null,
        werte: { vorname: vornameAus(name) },
      })
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    return safeApiError(err, request)
  }
})
