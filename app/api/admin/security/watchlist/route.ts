// ═══════════════════════════════════════════════════════════════════════
// /api/admin/security/watchlist — ACCOUNT_SECURITY_ALERTS verwalten
// ═══════════════════════════════════════════════════════════════════════
//
// GET  — die Ueberwachungsliste der aktiven Organisation
// POST — Alarm fuer ein Konto ein- oder ausschalten
//
// BERECHTIGUNG: 'sicherheit.lesen' (Vorbehalt der Administration).
// Bewusst dieselbe wie fuer die Spur selbst: wer die Ueberwachung
// einrichten darf, sieht ohnehin alles, was sie erzeugt.
//
// IDENTIFIKATION UEBER user_id
// Der Rumpf verlangt `userId`. Eine Adresse wird NUR als Gegenprobe
// entgegengenommen (`emailKontrolle`) und in der Antwort mit der
// tatsaechlichen Adresse des Kontos verglichen. Grund: die Adresse ist
// veraenderlich — sie ist sogar eines der Ereignisse, die dieses System
// meldet. Eine Ueberwachung, die an ihr haengt, verliert das Konto in
// dem Moment, in dem es darauf ankaeme.
//
// JEDE AENDERUNG IST SELBST EIN EREIGNIS
// Ein- und Ausschalten schreiben `watchlist_change` (kritisch) mit
// Vorher/Nachher. Wer die Ueberwachung abschaltet, hinterlaesst eine
// Spur — sonst waere der erste Schritt eines Missbrauchs, sie
// stillzulegen.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { requireBerechtigung } from '@/lib/auth/guard'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { leseWatchlist, setzeUeberwachung } from '@/lib/security/watchlist'
import { erfasseSicherheitsereignis } from '@/lib/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireBerechtigung('sicherheit.lesen')
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const eintraege = await leseWatchlist(admin, auth.ctx.organizationId)
    return NextResponse.json({ eintraege }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireBerechtigung('sicherheit.lesen')
  if (!auth.ok) return auth.response

  try {
    const rumpf = await request.json().catch(() => null) as {
      userId?: unknown
      aktiv?: unknown
      grund?: unknown
      meldeEmail?: unknown
      emailKontrolle?: unknown
      alleEreignisse?: unknown
      ohneSperrfrist?: unknown
    } | null

    const userId = typeof rumpf?.userId === 'string' ? rumpf.userId.trim() : ''
    if (!UUID_RE.test(userId)) {
      return NextResponse.json(
        { error: 'Konto-Kennung (userId) fehlt oder ist keine gültige UUID.' },
        { status: 400 },
      )
    }

    const aktivGewuenscht = rumpf?.aktiv !== false
    const grund = typeof rumpf?.grund === 'string' ? rumpf.grund.trim() : ''
    if (aktivGewuenscht && grund.length < 5) {
      // Ein Eintrag ohne Grund ist in einem halben Jahr nicht mehr
      // erklaerbar — und genau dann wird jemand fragen, warum dieses
      // Konto ueberwacht wurde. Die eigentliche Huerde (Mindestlaenge
      // und die vier Pflichtangaben) sitzt in lib/security/watchlist.ts;
      // das hier faengt nur den offensichtlich leeren Fall frueh ab.
      //
      // Beim ABSCHALTEN gilt sie NICHT: eine Schranke davor, eine
      // Ueberwachung zu beenden, waere genau falsch herum.
      return NextResponse.json(
        { error: 'Bitte einen Grund angeben (mindestens 5 Zeichen).' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()

    // Das Konto muss existieren UND zu dieser Organisation gehoeren.
    // Ohne diese Pruefung koennte eine Administration ein Konto eines
    // fremden Mandanten ueberwachen.
    const { data: profil } = await admin
      .from('profiles')
      .select('id, email, first_name, last_name, role')
      .eq('id', userId)
      .maybeSingle()

    if (!profil) {
      return NextResponse.json({ error: 'Zu dieser Kennung gibt es kein Konto.' }, { status: 404 })
    }

    const { data: mitglied } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    const { data: engel } = await admin
      .from('caregivers')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    const { data: klient } = await admin
      .from('clients')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (!mitglied && !engel && !klient) {
      return NextResponse.json(
        { error: 'Dieses Konto gehört nicht zu Ihrer Organisation.' },
        { status: 403 },
      )
    }

    const aktiv = aktivGewuenscht
    const emailKontrolle = typeof rumpf?.emailKontrolle === 'string'
      ? rumpf.emailKontrolle.trim() || null
      : null
    const kontoEmail = (profil.email as string) || null
    const adressenAbweichung =
      !!emailKontrolle && !!kontoEmail
      && emailKontrolle.toLowerCase() !== kontoEmail.toLowerCase()

    const ergebnis = await setzeUeberwachung(admin, {
      userId,
      organizationId: auth.ctx.organizationId,
      aktiv,
      grund,
      meldeEmail: typeof rumpf?.meldeEmail === 'string' ? rumpf.meldeEmail.trim() || null : null,
      emailKontrolle,
      alleEreignisse: rumpf?.alleEreignisse !== false,
      ohneSperrfrist: rumpf?.ohneSperrfrist !== false,
      angelegtVon: auth.ctx.userId,
    })

    if (!ergebnis.ok) {
      // Eine unvollstaendige Anordnung ist ein Eingabefehler, kein
      // Serverfehler. Vorher ging beides als 500 hinaus — die Verwaltung
      // sah „bei uns ist etwas kaputt", wo „bitte Rechtsgrundlage
      // ergaenzen" gemeint war, und die Ueberwachung landete in der
      // Fehlerauswertung des Betriebs.
      return NextResponse.json(
        { error: ergebnis.grund },
        { status: ergebnis.art === 'eingabe' ? 400 : 500 },
      )
    }

    await erfasseSicherheitsereignis({
      eventType: 'watchlist_change',
      userId,
      userEmail: kontoEmail,
      organizationId: auth.ctx.organizationId,
      request,
      metadata: {
        funktion: 'security_watchlist',
        vorher: ergebnis.vorher
          ? { aktiv: ergebnis.vorher.aktiv, grund: ergebnis.vorher.grund }
          : null,
        nachher: { aktiv, grund },
        // Ohne die Frist im Protokoll liesse sich hinterher nicht
        // belegen, BIS WANN angeordnet war — und genau danach fragt eine
        // Pruefung bei einer personenbezogenen Sondermassnahme.
        befristet_bis: aktiv ? ergebnis.befristung.laeuftAbAm : null,
        frist_neu_gestartet: ergebnis.fristNeuGestartet,
        veranlasst_von: auth.ctx.userId,
        veranlasser_rolle: auth.ctx.rolle,
        adressen_abweichung: adressenAbweichung,
        ergebnis: 'SUCCESS',
      },
    })

    return NextResponse.json({
      ok: true,
      eintragId: ergebnis.eintragId,
      konto: {
        userId,
        email: kontoEmail,
        name: [profil.first_name, profil.last_name].filter(Boolean).join(' ').trim() || null,
        rolle: (profil.role as string) ?? null,
      },
      // Die Gegenprobe steht in der ANTWORT, nicht nur im Protokoll: wer
      // die Ueberwachung einrichtet, soll sofort sehen, wenn die
      // angegebene Adresse nicht die des Kontos ist.
      adressenAbweichung,
      // Der WAHRE Zustand nach dem Schreiben. „aktiv" allein waere seit
      // der Frist eine Falschauskunft: ein Eintrag kann eingeschaltet
      // und trotzdem wirkungslos sein.
      befristung: ergebnis.befristung,
      fristNeuGestartet: ergebnis.fristNeuGestartet,
      wirktJetzt: aktiv && !ergebnis.befristung.abgelaufen,
      hinweis: adressenAbweichung
        ? `Die angegebene Adresse (${emailKontrolle}) weicht von der Adresse des Kontos (${kontoEmail}) ab. Die Überwachung hängt an der Konto-Kennung, nicht an der Adresse — prüfen Sie, ob das richtige Konto gemeint war.`
        : null,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
