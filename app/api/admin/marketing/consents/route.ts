import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { requireMarketing } from '@/lib/marketing/api-auth'
import {
  erteileEinwilligung,
  normalisiereAdresse,
  widerrufeEinwilligung,
} from '@/lib/marketing/einwilligung'
import { istConsentQuelle, istConsentTyp } from '@/lib/marketing/typen'

// ═══════════════════════════════════════════════════════════════════════════
// EINWILLIGUNGEN — ansehen, eintragen, widerrufen
//
// ── WARUM EINE EINWILLIGUNG HIER UEBERHAUPT EINTRAGBAR IST ─────────────────
// Der Normalfall ist das Doppel-Opt-in ueber ein Formular; niemand traegt
// dort Einwilligungen von Hand ein. Es gibt aber zwei echte Faelle:
// eine schriftlich im Vertrag erteilte Einwilligung, und die telefonische
// Zusage, die anschliessend bestaetigt wird.
//
// Deshalb ist `source` PFLICHT und aus einer geschlossenen Liste. „Woher
// stammt diese Einwilligung" ist genau die Frage, die eine Aufsichtsbehoerde
// stellt — eine Einwilligung ohne Herkunft ist keine.
//
// ── DER WIDERRUF SPERRT MIT ────────────────────────────────────────────────
// DELETE widerruft NICHT nur, sondern setzt die Adresse zugleich auf die
// Sperrliste. Ohne das liesse die naechste Anmeldung ueber ein beliebiges
// Formular den Widerruf verschwinden.
// ═══════════════════════════════════════════════════════════════════════════

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const email = normalisiereAdresse(url.searchParams.get('email'))

    const supabase = createAdminClient()
    let abfrage = supabase
      .from('marketing_consents')
      .select('id, email, user_id, consent_type, granted_at, revoked_at, source, text_version, notiz')
      .eq('organization_id', auth.ctx.organizationId)
      .order('granted_at', { ascending: false })
      .limit(500)

    if (email) abfrage = abfrage.eq('email', email)

    const { data, error } = await abfrage
    if (error) throw new Error(error.message)

    const zeilen = data ?? []
    return NextResponse.json({
      einwilligungen: zeilen,
      anzahl: zeilen.length,
      offen: zeilen.filter((z) => !z.revoked_at).length,
      widerrufen: zeilen.filter((z) => z.revoked_at).length,
      nachArt: zeilen
        .filter((z) => !z.revoked_at)
        .reduce<Record<string, number>>((o, z) => {
          const t = z.consent_type as string
          o[t] = (o[t] ?? 0) + 1
          return o
        }, {}),
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const rumpf = await request.json().catch(() => null)
    const email = normalisiereAdresse(rumpf?.email)
    const consentTyp = rumpf?.consent_type
    const quelle = rumpf?.source

    if (!email) return NextResponse.json({ error: 'Adresse fehlt.' }, { status: 400 })
    if (!istConsentTyp(consentTyp)) {
      return NextResponse.json({ error: 'Unbekannte Einwilligungsart.' }, { status: 400 })
    }
    if (!istConsentQuelle(quelle)) {
      return NextResponse.json(
        {
          error:
            'Herkunft der Einwilligung fehlt oder ist unbekannt. Sie ist Pflicht — eine ' +
            'Einwilligung ohne nachweisbare Herkunft ist nach Art. 7 Abs. 1 DSGVO keine.',
        },
        { status: 400 },
      )
    }
    // Ein von Hand eingetragenes Doppel-Opt-in waere eine Falschangabe: das
    // Verfahren erzeugt seinen Nachweis selbst, ueber den bestaetigten Link.
    if (quelle === 'doppel_opt_in' || quelle === 'website_formular') {
      return NextResponse.json(
        {
          error:
            'Diese Herkunft entsteht nur im Anmeldeweg selbst und lässt sich nicht von Hand ' +
            'eintragen. Für eine vertraglich oder schriftlich erteilte Einwilligung „vertrag" ' +
            'oder „schriftlich" wählen.',
        },
        { status: 400 },
      )
    }

    const ergebnis = await erteileEinwilligung(createAdminClient(), {
      organizationId: auth.ctx.organizationId,
      email,
      consentTyp,
      quelle,
      userId: typeof rumpf?.user_id === 'string' ? rumpf.user_id : null,
      notiz: typeof rumpf?.notiz === 'string' ? rumpf.notiz : null,
    })

    if (!ergebnis.ok) return NextResponse.json({ error: ergebnis.grund }, { status: 409 })
    return NextResponse.json({ ok: true, email, consentTyp })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const DELETE = withTracking(async function DELETE(request: Request) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const email = normalisiereAdresse(url.searchParams.get('email'))
    const roh = url.searchParams.get('consent_type') ?? 'alle'
    if (!email) return NextResponse.json({ error: 'Adresse fehlt.' }, { status: 400 })
    if (roh !== 'alle' && !istConsentTyp(roh)) {
      return NextResponse.json({ error: 'Unbekannte Einwilligungsart.' }, { status: 400 })
    }

    const ergebnis = await widerrufeEinwilligung(
      createAdminClient(),
      auth.ctx.organizationId,
      email,
      roh as 'alle',
      'manuell',
    )
    if (!ergebnis.ok) return NextResponse.json({ error: ergebnis.grund }, { status: 500 })

    return NextResponse.json({
      ok: true,
      email,
      widerrufen: ergebnis.widerrufen,
      gesperrt: ergebnis.gesperrt,
      hinweis: 'Die Adresse steht jetzt zusätzlich auf der Sperrliste.',
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
