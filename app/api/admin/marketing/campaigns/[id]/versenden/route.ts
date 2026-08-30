import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { requireMarketing } from '@/lib/marketing/api-auth'
import { fuehreVersandAus, pruefeVersandtore, type Kampagne } from '@/lib/marketing/versand'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════════════════
// PRODUKTIONSVERSAND — der einzige Weg, der echte Empfänger erreicht
//
// Alles, was diese Route tut, ist: Kampagne laden, `fuehreVersandAus`
// aufrufen, Ergebnis protokollieren. Die Tore stehen im Modul, nicht hier —
// sonst gaebe es zwei Orte, an denen die Erlaubnis entschieden wird, und
// einer davon waere irgendwann der laschere.
//
// Der Audit-Eintrag ist Pflicht und laeuft ueber logAuditEventOrWarn: ein
// Massenversand ohne Spur, wer ihn ausgeloest hat, ist kein Vorgang,
// sondern ein Ereignis.
// ═══════════════════════════════════════════════════════════════════════════

export const POST = withTracking(async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('email_campaigns')
      .select('id, organization_id, name, template_key, segment_key, status, dry_run_am, empfaenger_anzahl, freigegeben_am, freigegeben_fuer_anzahl, versendet_am')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return NextResponse.json({ error: 'Kampagne nicht gefunden.' }, { status: 404 })

    const kampagne = data as unknown as Kampagne

    // Vorpruefung gegen die zuletzt bekannte Zahl — der eigentliche
    // Torschluss passiert nochmals im Modul gegen die FRISCH ermittelte.
    // Die Doppelung ist Absicht: hier fuer eine sprechende Antwort, dort
    // fuer die Wirksamkeit.
    const tore = pruefeVersandtore(kampagne, kampagne.empfaenger_anzahl ?? 0)
    if (!tore.erlaubt) {
      return NextResponse.json({ error: tore.gruende.join(' '), versandtore: tore }, { status: 409 })
    }

    const ergebnis = await fuehreVersandAus(supabase, kampagne, auth.ctx.userId)

    await logAuditEventOrWarn({
      action: ergebnis.ok ? 'marketing_kampagne_versendet' : 'marketing_kampagne_versand_abgebrochen',
      entityType: 'email_campaign',
      entityId: kampagne.id,
      actorId: auth.ctx.userId,
      organizationId: auth.ctx.organizationId,
      details: {
        kampagne: kampagne.name,
        segment: kampagne.segment_key,
        vorlage: kampagne.template_key,
        gesendet: ergebnis.gesendet,
        fehlgeschlagen: ergebnis.fehlgeschlagen,
        uebersprungen: ergebnis.uebersprungen,
        ...(ergebnis.abbruchgrund ? { abbruchgrund: ergebnis.abbruchgrund } : {}),
      },
    })

    if (!ergebnis.ok) {
      return NextResponse.json({ error: ergebnis.abbruchgrund, ...ergebnis }, { status: 409 })
    }

    return NextResponse.json(ergebnis)
  } catch (err) {
    return safeApiError(err, request)
  }
})
