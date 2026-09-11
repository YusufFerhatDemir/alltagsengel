import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import { regionLabel, istRegion } from '@/lib/warteliste/katalog'
import { sendeAutomatischeBestaetigung, vornameAus } from '@/lib/email/auto-versand'
import {
  BEWERBUNG_MAX, type BewerbungDaten,
  istQualifikation, istFuehrerschein, istSprache,
  istVerfuegbarkeit, istStunden, istBeschaeftigungsart,
  qualifikationLabel,
} from '@/lib/bewerbung/katalog'

const log = logger.child('apply')

// ═══════════════════════════════════════════════════════════════════════
// BEWERBUNG — Engel werden
//
// Schreibt nach `lead_inquiries` mit `art = 'bewerbung'`. Das ist die
// Tabelle, in der die Bewerbungen ohnehin seit jeher landen; `applications`
// ist laut Migration 20261027000000 tot und traegt null Zeilen.
//
// ZWEI DINGE, DIE DIESE ROUTE BESSER MACHT ALS DER BISHERIGE WEG
// 1. `art` wird gesetzt. /api/lead-inquiry kennt die Spalte nicht, alle 34
//    bisherigen Bewerbungen liegen deshalb auf dem Default 'anfrage' und
//    sind nur an `source='engel-bewerbung'` erkennbar.
// 2. Eine E-Mail wird abgefragt. Bisher traegt KEINE der eingegangenen
//    Bewerbungen eine Adresse — die Freigabe-Mail in
//    /admin/applications/actions.ts konnte deshalb nie ausgeloest werden.
//
// Die Zusatzangaben gehen als jsonb nach `bewerbung_daten`; keine neue
// Migration noetig.
// ═══════════════════════════════════════════════════════════════════════

const supabaseAdmin = createAdminClient()

function text(wert: unknown, max: number): string | null {
  if (typeof wert !== 'string') return null
  const t = wert.trim()
  if (!t || t.length > max) return null
  return t
}

function auswahlListe(wert: unknown, pruefer: (w: unknown) => boolean): string[] {
  if (!Array.isArray(wert)) return []
  return [...new Set(wert.filter(pruefer))] as string[]
}

export const POST = withTracking(async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    if (!(await rateLimitPersistent(`apply:${ip}`, 8, 10 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'Zu viele Anfragen — bitte versuchen Sie es in einigen Minuten erneut.' },
        { status: 429 },
      )
    }

    const body = await request.json()

    // Honeypot: bewusst 201, damit der Bot nichts merkt.
    if (body.website) {
      return NextResponse.json({ success: true }, { status: 201 })
    }

    const name = text(body.name, BEWERBUNG_MAX.name)
    const email = text(body.email, BEWERBUNG_MAX.email)
    const phone = text(body.phone, BEWERBUNG_MAX.phone)
    const motivation = text(body.motivation, BEWERBUNG_MAX.motivation)

    if (!name) {
      return NextResponse.json({ error: 'Bitte gib deinen Namen an.' }, { status: 400 })
    }
    if (!phone) {
      return NextResponse.json({ error: 'Bitte gib deine Telefonnummer an.' }, { status: 400 })
    }
    if ((phone.match(/[0-9]/g) || []).length < 6) {
      return NextResponse.json({ error: 'Bitte gib eine gültige Telefonnummer an.' }, { status: 400 })
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: 'Bitte gib eine gültige E-Mail-Adresse an.' }, { status: 400 })
    }

    const plz = typeof body.plz === 'string' ? body.plz.trim() : ''
    if (plz && !/^[0-9]{5}$/.test(plz)) {
      return NextResponse.json({ error: 'Ungültige Postleitzahl.' }, { status: 400 })
    }

    if (body.datenschutz !== true) {
      return NextResponse.json({ error: 'Bitte bestätige die Datenschutzhinweise.' }, { status: 400 })
    }

    // Auswahlfelder fail-closed: unbekannte Werte werden verworfen, nicht
    // durchgereicht. Ein manipuliertes Formular schriebe sonst freien Text
    // in die Auswertung.
    const qualifikation = istQualifikation(body.qualifikation) ? body.qualifikation : undefined
    const region = istRegion(body.region) ? body.region : null

    const daten: BewerbungDaten = {
      version: 1,
      qualifikation,
      fuehrerschein: istFuehrerschein(body.fuehrerschein) ? body.fuehrerschein : undefined,
      sprachen: auswahlListe(body.sprachen, istSprache),
      verfuegbarkeit: auswahlListe(body.verfuegbarkeit, istVerfuegbarkeit),
      stunden: istStunden(body.stunden) ? body.stunden : undefined,
      beschaeftigungsart: istBeschaeftigungsart(body.beschaeftigungsart) ? body.beschaeftigungsart : undefined,
      motivation: motivation ?? undefined,
    }

    // `service` bleibt die Kurzfassung fuer die Listenansicht — dieselbe
    // Form wie bisher („Engel-Bewerbung (…)"), damit die 34 Altbestaende
    // und die neuen Zeilen nebeneinander lesbar bleiben.
    const service = qualifikation
      ? `Engel-Bewerbung (${qualifikationLabel(qualifikation)})`
      : 'Engel-Bewerbung'

    // `lead_inquiries` hat keine Spalte `region` — der Ort steckt in der
    // PLZ. Die ausdrueckliche Regionsangabe wird deshalb in die
    // Bewerbungsdaten gelegt, statt sie stillschweigend zu verwerfen.
    if (region) daten.region = region

    const zeile = {
      organization_id: DEFAULT_ORG_ID,
      art: 'bewerbung',
      name,
      email,
      phone,
      plz,
      service,
      // Bleibt 'engel-bewerbung': daran haengt die Auswertung im
      // Marketing-Dashboard und der Filter in /admin/applications.
      source: 'engel-bewerbung',
      message: motivation,
      status: 'new',
      eingereicht_am: new Date().toISOString(),
      bewerbung_daten: daten,
      utm_source: text(body.utm_source, 120),
    }

    const { data: angelegt, error: dbFehler } = await supabaseAdmin
      .from('lead_inquiries')
      .insert(zeile)
      .select('id')
      .single()

    if (dbFehler) {
      log.errorWithException('Bewerbung konnte nicht gespeichert werden', dbFehler)
      return NextResponse.json({ error: 'Speicherfehler' }, { status: 500 })
    }

    // ── Bestaetigung SOFORT senden ──────────────────────────────────
    // Transaktional, idempotent ueber die Zustellspur, protokolliert.
    //
    // Nur mit E-Mail — und das ist hier die Ausnahme, nicht die Regel: das
    // frueherer Kurzformular hat keine Adresse abgefragt, alle 34
    // Altbestaende tragen keine. Ueber dieses Formular kommt sie jetzt
    // herein, und damit wird die Bestaetigung ueberhaupt erst moeglich.
    if (email && angelegt?.id) {
      await sendeAutomatischeBestaetigung({
        vorlageId: 'bewerber_eingang',
        empfaengerEmail: email,
        empfaengerName: name,
        vorgangArt: 'bewerbung-bestaetigung',
        vorgangRef: angelegt.id,
        werte: { vorname: vornameAus(name) },
      })
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    return safeApiError(err, request)
  }
})
