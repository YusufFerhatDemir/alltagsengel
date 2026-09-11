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
  bundeslandFuerRegion, interesseFuerPflegegrad, regionLabel,
} from '@/lib/warteliste/katalog'
import { entwurfAnlegenOhneAbbruch, vornameAus } from '@/lib/email/entwuerfe'

const log = logger.child('waitlist')

// ═══════════════════════════════════════════════════════════════════════
// KUNDEN-WARTELISTE — Vormerkung entgegennehmen
//
// ZIELTABELLE IST `state_waitlist` — die EINE Warteliste.
// Sie steht live seit 20260808100000, traegt RLS und vier Policies und
// haengt bereits am Expansion-Modul: /api/expansion/waitlist schreibt
// hinein, notify-waitlist liest daraus, /admin/expansion zeigt sie. Eine
// zweite Tabelle fuer denselben Vorgang („benachrichtigt werden, sobald
// ihr bei mir startet") haette zwei Antworten auf eine Frage erzeugt.
//
// Die frueher geplante `waitlist_customers` ist deshalb am 11.09.2026
// zurueckgenommen worden; ihre Migration traegt einen entsprechenden
// Vermerk und wird nicht angewendet.
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

    // E-Mail ist PFLICHT, und das hat zwei Gruende:
    // 1. `state_waitlist.email` ist NOT NULL — ohne Adresse scheitert der
    //    Eintrag ohnehin mit 23502.
    // 2. Die automatische Bestaetigung braucht sie. Eine Vormerkung, die
    //    niemand bestaetigen kann, ist ein Zettel in einer Schublade.
    // Telefon bleibt freiwillig und wird als Rueckruf-Weg mitgefuehrt.
    if (!email) {
      return NextResponse.json(
        { error: 'Bitte geben Sie eine E-Mail-Adresse an — wir bestätigen Ihre Vormerkung darüber.' },
        { status: 400 },
      )
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
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

    const bundesland = bundeslandFuerRegion(region)
    const plz = typeof body.plz === 'string' && /^[0-9]{5}$/.test(body.plz.trim())
      ? body.plz.trim()
      : null

    // Die Spalten, die `state_waitlist` seit jeher hat. Dieser Teil laeuft
    // AUCH ohne die Erweiterung 20261102000000.
    const kern = {
      organization_id: DEFAULT_ORG_ID,
      bundesland,
      plz,
      ort: region ? regionLabel(region) : null,
      name,
      email,
      telefon: phone,
      // Einwertig, meint die Finanzierungsart — nicht die Leistung.
      interesse: interesseFuerPflegegrad(pflegegrad),
      benachrichtigen: true,
      quelle: text(body.utm_source, WARTELISTE_MAX.utm) || 'warteliste',
    }

    // Die Spalten aus der Erweiterung. Steht sie noch nicht, faellt der
    // Schreibweg unten auf `kern` zurueck.
    const erweitert = {
      ...kern,
      pflegegrad,
      gewuenschte_leistungen: leistungen,
      nachricht,
      status: 'neu',
      utm_medium: text(body.utm_medium, WARTELISTE_MAX.utm),
      utm_campaign: text(body.utm_campaign, WARTELISTE_MAX.utm),
    }

    let { data: angelegt, error: dbFehler } = await supabaseAdmin
      .from('state_waitlist')
      .insert(erweitert)
      .select('id')
      .single()

    // Unbekannte Spalte → die Erweiterung 20261102000000 fehlt noch. DDL
    // geht aus einer Agentensitzung nicht (42501), also muss der Funnel
    // ohne sie laufen koennen. Der zweite Versuch schreibt den Kern;
    // Pflegegrad, Leistungen und Nachricht gehen dabei verloren, und das
    // wird protokolliert statt verschwiegen.
    //
    // ZWEI CODES, und der erste ist der haeufigere: PostgREST faengt eine
    // unbekannte Spalte bereits im Schema-Cache ab (PGRST204) und kommt gar
    // nicht bis Postgres, das 42703 melden wuerde. Wer nur auf 42703
    // prueft, hat einen Rueckfall, der nie greift — genau so ist dieser
    // Weg beim ersten E2E-Lauf am 11.09.2026 mit „Speicherfehler"
    // gescheitert.
    if (dbFehler?.code === 'PGRST204' || dbFehler?.code === '42703') {
      log.warn(
        'state_waitlist ohne Kunden-Funnel-Spalten — Migration 20261102000000 fehlt. '
        + 'Eintrag wird ohne Pflegegrad, Leistungen und Nachricht gespeichert.',
      )
      const rueckfall = await supabaseAdmin
        .from('state_waitlist')
        .insert(kern)
        .select('id')
        .single()
      angelegt = rueckfall.data
      dbFehler = rueckfall.error
    }

    if (dbFehler) {
      // ── Schon vorgemerkt ────────────────────────────────────────────
      // uq_waitlist_org_land_email greift: dieselbe Adresse, dasselbe
      // Bundesland. Kein Fehler des Menschen davor, sondern die richtige
      // Antwort — er steht bereits auf der Liste. 200 statt 409, weil das
      // Ergebnis aus seiner Sicht dasselbe ist.
      if (dbFehler.code === DUPLIKAT) {
        return NextResponse.json(
          { success: true, bereits_vorgemerkt: true },
          { status: 200 },
        )
      }

      // ── Tabelle steht nicht ─────────────────────────────────────────
      // Sollte nicht vorkommen: `state_waitlist` ist seit dem 08.08.2026
      // live. Bleibt trotzdem stehen — eine Erfolgsmeldung waere hier die
      // teuerste Luege der Seite: der Interessent glaubte sich vorgemerkt
      // und stuende nirgends.
      if (dbFehler.code === TABELLE_FEHLT) {
        log.error('state_waitlist nicht erreichbar — Schema pruefen.')
        return NextResponse.json(
          {
            error: 'Die Warteliste ist gerade nicht erreichbar. Bitte versuchen Sie es später erneut oder rufen Sie uns an.',
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
    {
      await entwurfAnlegenOhneAbbruch({
        vorlageId: 'warteliste_welcome',
        empfaengerEmail: email,
        empfaengerName: name,
        bezugTabelle: 'state_waitlist',
        bezugId: angelegt?.id ?? null,
        werte: { vorname: vornameAus(name) },
      })
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    return safeApiError(err, request)
  }
})
