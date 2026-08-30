import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { requireMarketing } from '@/lib/marketing/api-auth'
import { normalisiereAdresse, sperreAdresse } from '@/lib/marketing/einwilligung'
import { istSperrgrund } from '@/lib/marketing/typen'

// ═══════════════════════════════════════════════════════════════════════════
// SPERRLISTE — ansehen, eintragen, entfernen
//
// ── DAS ENTFERNEN IST DER HEIKLE TEIL ──────────────────────────────────────
// Eine Adresse von der Sperrliste zu nehmen heisst: dieser Mensch bekommt
// wieder Werbung. Wenn er dort steht, weil er WIDERSPROCHEN hat
// (reason = 'abmeldung' oder 'spam_beschwerde'), waere das Entfernen ein
// Verstoss gegen Art. 21 Abs. 3 DSGVO — der Widerspruch gilt fort, bis die
// Person selbst etwas anderes sagt.
//
// Deshalb laesst DELETE genau zwei Gruende zu: 'hard_bounce' und
// 'ungueltig'. Beides sind technische Befunde ueber die ADRESSE, kein
// Wille der Person. Ein Bounce, der auf einem Serverausfall beruhte, darf
// korrigierbar sein.
//
// 'abmeldung', 'spam_beschwerde', 'soft_bounce_dauerhaft' und 'manuell'
// bleiben stehen. Wer sie loesen will, tut das nach einer dokumentierten
// Ruecksprache mit der Person — und dann ueber eine neue Einwilligung, die
// den Vorgang belegt.
// ═══════════════════════════════════════════════════════════════════════════

/** Gründe, deren Eintrag ein technischer Befund ist — nur diese sind lösbar. */
const LOESBARE_GRUENDE = new Set(['hard_bounce', 'ungueltig'])

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('email_suppression_list')
      .select('id, email, reason, added_at, notiz')
      .eq('organization_id', auth.ctx.organizationId)
      .order('added_at', { ascending: false })
      .limit(500)

    if (error) throw new Error(error.message)

    const zeilen = data ?? []
    return NextResponse.json({
      eintraege: zeilen.map((z) => ({ ...z, loesbar: LOESBARE_GRUENDE.has(z.reason as string) })),
      anzahl: zeilen.length,
      nachGrund: zeilen.reduce<Record<string, number>>((o, z) => {
        const g = z.reason as string
        o[g] = (o[g] ?? 0) + 1
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
    const grund = rumpf?.reason ?? 'manuell'

    if (!email) return NextResponse.json({ error: 'Adresse fehlt.' }, { status: 400 })
    if (!istSperrgrund(grund)) return NextResponse.json({ error: 'Unbekannter Sperrgrund.' }, { status: 400 })

    const ergebnis = await sperreAdresse(
      createAdminClient(),
      auth.ctx.organizationId,
      email,
      grund,
      auth.ctx.userId,
      typeof rumpf?.notiz === 'string' ? rumpf.notiz : null,
    )
    if (!ergebnis.ok) return NextResponse.json({ error: ergebnis.grund }, { status: 400 })

    return NextResponse.json({ ok: true, email })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const DELETE = withTracking(async function DELETE(request: Request) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const email = normalisiereAdresse(new URL(request.url).searchParams.get('email'))
    if (!email) return NextResponse.json({ error: 'Adresse fehlt.' }, { status: 400 })

    const supabase = createAdminClient()
    const { data: eintrag, error: lesefehler } = await supabase
      .from('email_suppression_list')
      .select('id, reason')
      .eq('organization_id', auth.ctx.organizationId)
      .eq('email', email)
      .maybeSingle()

    if (lesefehler) throw new Error(lesefehler.message)
    if (!eintrag) return NextResponse.json({ error: 'Nicht auf der Sperrliste.' }, { status: 404 })

    if (!LOESBARE_GRUENDE.has(eintrag.reason as string)) {
      return NextResponse.json(
        {
          error:
            `Dieser Eintrag steht mit dem Grund „${eintrag.reason}" und lässt sich nicht entfernen. ` +
            'Er beruht auf dem Willen der Person, nicht auf einem technischen Befund — der ' +
            'Widerspruch gilt nach Art. 21 Abs. 3 DSGVO fort. Wer wieder Post bekommen möchte, ' +
            'erteilt dazu eine neue, belegte Einwilligung.',
        },
        { status: 409 },
      )
    }

    const { data, error } = await supabase
      .from('email_suppression_list')
      .delete()
      .eq('id', eintrag.id)
      .eq('organization_id', auth.ctx.organizationId)
      .select('id')

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Nichts entfernt.' }, { status: 409 })
    }

    return NextResponse.json({ ok: true, email })
  } catch (err) {
    return safeApiError(err, request)
  }
})
