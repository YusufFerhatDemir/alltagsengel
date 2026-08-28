import { NextResponse, NextRequest } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { schreibeGutschrift } from '@/lib/referral/gutschrift'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('referral/complete')

// ═══════════════════════════════════════════════════════════════════════
// POST /api/referral/complete — Empfehlung abschliessen und Bonus buchen
// ═══════════════════════════════════════════════════════════════════════
//
// Der Nutzer muss angemeldet sein und kann nur die eigene Empfehlung
// abschliessen (user_id === auth.uid()).
//
// ZWEI BEFUNDE aus Track 7 (28.08.2026), beide behoben:
//
// ERSTENS DIE GUTSCHRIFT KAM NIE AN. Sie lief ueber
// `rpc('increment_referral_credit')` in einem try/catch mit einem
// Lese-Schreib-Fallback im catch-Zweig. Die Funktion existiert live nicht
// (aus pg_proc gelesen), und `supabase.rpc()` wirft nicht — der Fehler
// steht im Rueckgabewert. Also lief weder die RPC noch der Fallback, und
// die Route antwortete trotzdem „Bonus für beide Seiten gutgeschrieben“.
// Die Buchung liegt jetzt in lib/referral/gutschrift.ts und ihr Ergebnis
// wird geprueft.
//
// ZWEITENS KEIN SCHUTZ GEGEN DEN ZWEITEN AUFRUF. Gelesen wurde
// `status='pending'`, geschrieben wurde danach `.eq('id', …)` OHNE
// Statusbedingung. Zwei gleichzeitige Aufrufe kamen beide an der Pruefung
// vorbei und haetten beide gebucht — sobald die Gutschrift ueberhaupt
// wirkt, ist das der doppelte Bonus auf beiden Seiten. Der Vorgang wird
// jetzt ZUERST per Compare-and-Swap beansprucht (pending → completed) und
// erst danach gebucht; wer den Wettlauf verliert, bekommt 409 statt einer
// zweiten Buchung.
//
// Scheitert eine Gutschrift NACH dem Beanspruchen, wird der Vorgang auf
// 'pending' zurueckgesetzt und die Route antwortet 503 — lieber ein
// wiederholbarer Fehlschlag als ein verbrannter Vorgang ohne Geld.
// ═══════════════════════════════════════════════════════════════════════

export const POST = withTracking(async function POST(request: NextRequest) {
  try {
    // Auth-Prüfung: Nur eingeloggte Nutzer
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const user_id = typeof body?.user_id === 'string' ? body.user_id : ''

    if (!user_id) {
      return NextResponse.json({ error: 'user_id erforderlich' }, { status: 400 })
    }

    // Sicherheit: Nutzer kann nur eigene Referrals abschließen
    if (user.id !== user_id) {
      return NextResponse.json({ error: 'Nicht autorisiert für diesen Nutzer' }, { status: 403 })
    }

    const supabaseAdmin = createAdminClient()

    // Pending Referral für diesen User finden
    const { data: referral } = await supabaseAdmin
      .from('referrals')
      .select('*')
      .eq('referred_id', user_id)
      .eq('status', 'pending')
      .maybeSingle()

    if (!referral) {
      return NextResponse.json({ message: 'Kein offenes Referral' })
    }

    const { data: completedBooking } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('customer_id', user_id)
      .eq('status', 'completed')
      .limit(1)
      .maybeSingle()

    if (!completedBooking) {
      return NextResponse.json(
        { error: 'Referral-Bonus erfordert mindestens eine abgeschlossene Buchung.' },
        { status: 400 }
      )
    }

    const bonus = typeof referral.bonus_amount === 'number' && referral.bonus_amount > 0
      ? referral.bonus_amount
      : 20

    // ── 1. Vorgang BEANSPRUCHEN (Compare-and-Swap) ──────────────────
    // Erst der Statuswechsel, dann das Geld: so kann es den Bonus nur
    // einmal geben, auch wenn zwei Anfragen gleichzeitig hier ankommen.
    const { data: beansprucht, error: claimFehler } = await supabaseAdmin
      .from('referrals')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        referrer_credited: true,
        referred_credited: true,
      })
      .eq('id', referral.id)
      .eq('status', 'pending')
      .select('id')

    if (claimFehler) {
      log.error('Referral konnte nicht beansprucht werden', { code: claimFehler.code })
      return NextResponse.json(
        { error: 'Der Empfehlungsbonus konnte gerade nicht gebucht werden. Bitte später erneut versuchen.' },
        { status: 503 }
      )
    }
    if (!beansprucht?.length) {
      // Ein paralleler Aufruf war schneller — genau EINE Buchung.
      return NextResponse.json({ error: 'Dieser Empfehlungsbonus wurde bereits gebucht.' }, { status: 409 })
    }

    // ── 2. Gutschriften ─────────────────────────────────────────────
    const fuerWerber = await schreibeGutschrift(supabaseAdmin, referral.referrer_id, bonus)
    const fuerGeworbenen = fuerWerber.ok
      ? await schreibeGutschrift(supabaseAdmin, referral.referred_id, bonus)
      : { ok: false, fehler: 'übersprungen' }

    if (!fuerWerber.ok || !fuerGeworbenen.ok) {
      // Rueckabwicklung: der Vorgang darf nicht als abgeschlossen
      // stehenbleiben, wenn kein Geld geflossen ist — sonst ist er
      // verbrannt und niemand merkt es. Gleiche Linie wie
      // genehmigenAbwesenheit und protokolliereSignaturAudit.
      await supabaseAdmin
        .from('referrals')
        .update({
          status: 'pending',
          completed_at: null,
          referrer_credited: false,
          referred_credited: false,
        })
        .eq('id', referral.id)

      log.error('Gutschrift fehlgeschlagen — Referral zurückgesetzt', {
        werber: fuerWerber.fehler ?? null,
        geworbener: fuerGeworbenen.fehler ?? null,
      })
      return NextResponse.json(
        { error: 'Der Empfehlungsbonus konnte nicht gutgeschrieben werden. Bitte später erneut versuchen.' },
        { status: 503 }
      )
    }

    // ── 3. Benachrichtigung an den Werber ───────────────────────────
    const { error: hinweisFehler } = await supabaseAdmin.from('notifications').insert({
      user_id: referral.referrer_id,
      title: 'Empfehlungsbonus erhalten!',
      message: `Deine Empfehlung hat die erste Buchung abgeschlossen. Du hast ${bonus} € Guthaben erhalten!`,
      type: 'referral',
    })
    // Der Hinweis ist Beiwerk: das Geld ist gebucht, ein fehlgeschlagener
    // Hinweis darf die Buchung nicht zurueckdrehen. Er verschwindet aber
    // auch nicht still.
    if (hinweisFehler) {
      log.error('Referral-Benachrichtigung nicht zugestellt', { code: hinweisFehler.code })
    }

    return NextResponse.json({
      success: true,
      message: `${bonus} € Bonus für beide Seiten gutgeschrieben`,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
