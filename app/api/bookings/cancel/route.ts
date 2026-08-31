import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyBookingCancelled, type BookingNotifyData } from '@/lib/notifications'
import { getActiveOrgIdOrDefault } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'
import { UserFacingError } from '@/lib/api/user-facing-error'
import {
  assertBuchungStornierbar,
  darfStornieren,
  rolleAusBuchung,
  type StornoRolle,
} from '@/lib/bookings/storno'
import { findeEinsatzZuBuchung } from '@/lib/bookings/assignment-bezug'

const log = logger.child('api:bookings:cancel')

interface BookingProfile {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

function firstOrSelf<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function kurzName(p: BookingProfile | null, rueckfall: string): string {
  if (!p) return rueckfall
  return `${p.first_name ?? ''} ${p.last_name?.[0] ?? ''}.`.trim() || rueckfall
}

/**
 * POST /api/bookings/cancel
 * Body: { bookingId, reason? }
 *
 * Storniert eine Buchung — und mit ihr die Kette, die beim Annehmen
 * entstanden ist (Einsatz + Leistungsnachweis-Entwurf).
 *
 * WARUM ES DIESE ROUTE GIBT
 * Der Uebergangs-Trigger erlaubt Kunde und Engel den Storno seit
 * 20260719000100, die Oberflaeche kennt die Beschriftung „Storniert" —
 * geschrieben hat den Status im Anwendungscode bis 31.08.2026 niemand. Ein
 * Kunde konnte eine gestellte Anfrage nicht zuruecknehmen.
 *
 * REIHENFOLGE (fail-closed)
 *   1. Lage vollstaendig laden: Buchung, Einsatz, Nachweis
 *   2. ueber die GANZE Kette entscheiden (lib/bookings/storno.ts)
 *   3. erst dann schreiben — Nachweis, Einsatz, Buchung
 *
 * Der Nachweis wird ZUERST storniert und die Buchung ZULETZT: bricht ein
 * Schritt ab, bleibt die Buchung im alten Zustand und der Vorgang ist
 * wiederholbar. Andersherum staende eine stornierte Buchung neben einem
 * offenen Nachweis — genau die halbe Kette, die Track A1 beseitigt hat.
 */
export const POST = withTracking(async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const { bookingId, reason } = await req.json()
    if (!bookingId || typeof bookingId !== 'string') {
      return NextResponse.json({ error: 'bookingId ist erforderlich' }, { status: 400 })
    }
    const grund = typeof reason === 'string' ? reason.trim().slice(0, 500) || null : null

    const orgId = await getActiveOrgIdOrDefault()

    const { data: bookingRaw, error: bookErr } = await supabase
      .from('bookings')
      .select(`
        id, customer_id, angel_id, service, date, time, duration_hours, total_amount, status,
        customer:profiles!bookings_customer_id_fkey(id, first_name, last_name, email),
        angel:angels!bookings_angel_id_fkey(id, profiles(id, first_name, last_name, email))
      `)
      .eq('id', bookingId)
      .eq('organization_id', orgId)
      .maybeSingle()

    // Ein Abfragefehler ist kein fehlender Datensatz — sonst meldet eine
    // Stoerung „nicht gefunden" und der Nutzer sucht bei sich.
    if (bookErr) {
      log.error('Buchung fuer Storno nicht ladbar', { code: bookErr.code, msg: bookErr.message })
      return NextResponse.json({ error: 'Die Buchung konnte nicht geladen werden.' }, { status: 503 })
    }
    if (!bookingRaw) {
      return NextResponse.json({ error: 'Buchung nicht gefunden' }, { status: 404 })
    }

    const booking = bookingRaw as unknown as {
      id: string
      customer_id: string | null
      angel_id: string | null
      service: string | null
      date: string
      time: string | null
      duration_hours: number | null
      total_amount: number | string | null
      status: string | null
      customer: BookingProfile | BookingProfile[] | null
      angel: { id: string; profiles: BookingProfile | BookingProfile[] | null } | { id: string; profiles: BookingProfile | BookingProfile[] | null }[] | null
    }

    const quellen = await holeRollenQuellenFuer(supabase, user)
    const istAdmin = quellenDuerfen(quellen, 'einsatz.schreiben')

    const rolle: StornoRolle | null = rolleAusBuchung(booking, user.id, istAdmin)
    if (!rolle || !darfStornieren(rolle, booking, user.id)) {
      return NextResponse.json(
        { error: 'Sie können diese Buchung nicht stornieren.' },
        { status: 403 },
      )
    }

    const admin = createAdminClient()

    // ── 1) Lage der Kette ──────────────────────────────────────────
    // Fuehrend ist `assignments.booking_id` (Migration 20261025000000) —
    // eine Spalte, auf die kein Fachprozess schreibt. Fehlt sie noch
    // (die Migration wird von Hand im SQL-Editor angewendet), faellt
    // findeEinsatzZuBuchung auf den alten Notiz-Bezug zurueck:
    // „Automatisch aus Buchung <id> erzeugt."
    //
    // Der Notiz-Weg hat Falsch-NEGATIVE — `notes` darf die Einsatzliste
    // bearbeiten, und wer die Notiz ergaenzt, kappt den Bezug. Genau
    // deshalb steht unten ein Riegel statt eines stillen Weiter: ein
    // Storno, der den Einsatz stehen laesst, schickt den Engel zu einem
    // abgesagten Termin.
    // Beide Abfragen werden HIER gebaut — voll typisiert am echten Client —
    // und als Funktionen hereingereicht. Der Rueckfall laeuft nur, wenn die
    // Spalte fehlt; im Regelfall kostet er nichts.
    const suche = await findeEinsatzZuBuchung({
      ueberSpalte: () => admin
        .from('assignments')
        .select('id, status')
        .eq('organization_id', orgId)
        .eq('booking_id', booking.id),
      ueberNotiz: () => admin
        .from('assignments')
        .select('id, status')
        .eq('organization_id', orgId)
        .like('notes', `%Buchung ${booking.id}%`),
    })

    if (!suche.ok) {
      log.error('Einsatz zur Buchung nicht ladbar', { code: suche.fehler.code, msg: suche.fehler.message })
      return NextResponse.json(
        { error: 'Der zugehörige Einsatz konnte nicht geprüft werden. Bitte erneut versuchen.' },
        { status: 503 },
      )
    }

    const einsatz = suche.einsatz

    // Eine ANGENOMMENE Buchung hat einen Einsatz — es sei denn, ein Admin
    // hat sie per force_override ohne Kette angenommen. Fehlt er hier,
    // wissen wir nicht, ob es ihn nie gab oder ob der Bezug gerissen ist.
    // Diese Frage darf der Storno nicht raten.
    if (booking.status === 'accepted' && !einsatz) {
      log.error('Angenommene Buchung ohne auffindbaren Einsatz', { bookingId: booking.id })
      if (!istAdmin) {
        return NextResponse.json(
          {
            error: 'Der zugehörige Einsatz konnte nicht zugeordnet werden. '
              + 'Bitte wenden Sie sich an Alltagsengel — wir stornieren den Termin für Sie.',
          },
          { status: 409 },
        )
      }
      // Der Admin sieht den Zustand und entscheidet; der Vorgang steht im
      // Protokoll (siehe `einsatz_fehlte` unten).
    }

    let nachweis: { id: string; status: string | null; billing_status: string | null; proof_status: string | null } | null = null
    if (einsatz) {
      const { data: nw, error: nwFehler } = await admin
        .from('service_records')
        .select('id, status, billing_status, proof_status')
        .eq('organization_id', orgId)
        .eq('assignment_id', einsatz.id)
        .maybeSingle()
      if (nwFehler) {
        log.error('Nachweis zur Buchung nicht ladbar', { code: nwFehler.code, msg: nwFehler.message })
        return NextResponse.json(
          { error: 'Der zugehörige Leistungsnachweis konnte nicht geprüft werden. Bitte erneut versuchen.' },
          { status: 503 },
        )
      }
      nachweis = nw ?? null
    }

    // ── 2) Entscheidung ueber die GANZE Kette ──────────────────────
    try {
      assertBuchungStornierbar(
        {
          buchungsStatus: booking.status,
          einsatzStatus: einsatz?.status ?? null,
          nachweis: nachweis
            ? { status: nachweis.status, billing_status: nachweis.billing_status, proof_status: nachweis.proof_status }
            : null,
        },
        rolle,
      )
    } catch (err) {
      if (err instanceof UserFacingError) {
        return NextResponse.json({ error: err.message }, { status: err.status })
      }
      throw err
    }

    // ── 3) Schreiben: Nachweis → Einsatz → Buchung ─────────────────
    if (nachweis) {
      const { error } = await admin
        .from('service_records')
        .update({ proof_status: 'STORNIERT', billing_status: 'STORNIERT', updated_at: new Date().toISOString() })
        .eq('id', nachweis.id)
        .eq('organization_id', orgId)
      if (error) {
        log.error('Nachweis-Storno fehlgeschlagen', { msg: error.message })
        return NextResponse.json(
          { error: 'Der Leistungsnachweis konnte nicht storniert werden. Es wurde nichts geändert.' },
          { status: 500 },
        )
      }
    }

    if (einsatz) {
      const { error } = await admin
        .from('assignments')
        .update({ status: 'STORNIERT' })
        .eq('id', einsatz.id)
        .eq('organization_id', orgId)
      if (error) {
        log.error('Einsatz-Storno fehlgeschlagen', { msg: error.message })
        return NextResponse.json(
          {
            error: 'Der Einsatz konnte nicht abgesagt werden. Die Buchung bleibt bestehen — '
              + 'bitte erneut versuchen.',
          },
          { status: 500 },
        )
      }
    }

    // Optimistic lock: parallele Storni (Doppelklick, beide Seiten
    // gleichzeitig) treffen dann 0 Zeilen.
    const { data: aktualisiert, error: buchungsFehler } = await admin
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', booking.id)
      .eq('organization_id', orgId)
      .eq('status', booking.status ?? '')
      .select('id')

    if (buchungsFehler) {
      log.error('Buchungs-Storno fehlgeschlagen', { msg: buchungsFehler.message })
      return NextResponse.json({ error: 'Die Stornierung konnte nicht gespeichert werden.' }, { status: 500 })
    }
    if (!aktualisiert || aktualisiert.length === 0) {
      return NextResponse.json(
        { error: 'Diese Buchung wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu.' },
        { status: 409 },
      )
    }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: user.id,
      actorRole: quellen.rolle ?? null,
      organizationId: orgId,
      entityType: 'booking',
      entityId: booking.id,
      details: {
        vorgang: 'buchung_storniert',
        durch: rolle,
        status_vorher: booking.status,
        assignment_id: einsatz?.id ?? null,
        service_record_id: nachweis?.id ?? null,
        einsatz_fehlte: booking.status === 'accepted' && !einsatz,
        // Solange hier `false` steht, haengt der Bezug allein an der
        // Notiz — die Migration 20261025000000 ist dann nicht angewendet.
        bezug_ueber_spalte: suche.ueberSpalte,
        grund,
      },
      request: req,
    })

    // ── 4) Gegenseite benachrichtigen ──────────────────────────────
    const cust = firstOrSelf(booking.customer)
    const angel = firstOrSelf(booking.angel)
    const ap = firstOrSelf(angel?.profiles)

    const notifyData: BookingNotifyData = {
      bookingId: booking.id,
      customerName: kurzName(cust, 'Kunde'),
      angelName: kurzName(ap, 'Engel'),
      service: booking.service || 'Alltagsbegleitung',
      date: booking.date,
      time: booking.time?.slice(0, 5) || '—',
      duration: booking.duration_hours || 2,
      amount: Number(booking.total_amount) || 0,
    }

    // Der Kunde storniert → der Engel erfaehrt es, und umgekehrt. Beim
    // Admin-Storno erfahren es beide, jeweils mit dem passenden Text.
    const empfaenger: Array<{ id: string; vonKunde: boolean }> = []
    if (rolle === 'kunde' && booking.angel_id) empfaenger.push({ id: booking.angel_id, vonKunde: true })
    if (rolle === 'engel' && booking.customer_id) empfaenger.push({ id: booking.customer_id, vonKunde: false })
    if (rolle === 'admin') {
      if (booking.angel_id) empfaenger.push({ id: booking.angel_id, vonKunde: true })
      if (booking.customer_id) empfaenger.push({ id: booking.customer_id, vonKunde: false })
    }

    for (const e of empfaenger) {
      try {
        await notifyBookingCancelled(admin, e.id, notifyData, e.vonKunde, grund, { organizationId: orgId })
      } catch (notifyErr) {
        // Nebenwirkung: der Storno selbst bleibt gueltig.
        log.errorWithException('Storno-Benachrichtigung fehlgeschlagen', notifyErr)
      }
    }

    return NextResponse.json({
      success: true,
      status: 'cancelled',
      assignment_id: einsatz?.id ?? null,
      service_record_id: nachweis?.id ?? null,
      durch: rolle,
    })
  } catch (err) {
    return safeApiError(err, req)
  }
})
