// ═══════════════════════════════════════════════════════════════
// POST /api/expansion/states/[bundesland]/notify-waitlist
// ═══════════════════════════════════════════════════════════════
// Benachrichtigt die Warteliste eines freigeschalteten Bundeslands.
//
// BEWUSST GETRENNT von der Freischaltung: Der Versand an potenziell
// hunderte Empfänger ist eine nach außen wirkende Aktion und passiert
// nur nach ausdrücklicher Bestätigung ({ bestaetigt: true }).
//
// GET liefert vorab eine Vorschau (Anzahl + Beispiel-Empfänger),
// damit die Geschäftsführung sieht, was passieren würde.
//
// Absender/Unterschrift: immer „Alltagsengel", nie ein persönlicher Name.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmailNotification } from '@/lib/notifications'
import { requireExpansionAdmin } from '@/lib/expansion/api-auth'
import { normalizeBundesland } from '@/lib/expansion/plz-bundesland'
import { BUNDESLAND_NAMEN, type BundeslandCode } from '@/lib/expansion/types'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://alltagsengel.care'
const MAX_PRO_LAUF = 200

interface RouteContext {
  params: Promise<{ bundesland: string }>
}

function mailText(land: string, name: string | null): string {
  const anrede = name ? `Hallo ${name},` : 'Hallo,'
  return `
    <p>${anrede}</p>
    <p>
      gute Nachrichten: Die Abrechnung über die Pflegekasse ist ab sofort auch in
      <strong>${land}</strong> möglich. Sie können Ihre Entlastungsleistungen nach
      §45b SGB XI jetzt direkt über uns abrechnen lassen.
    </p>
    <p>
      Sie hatten sich bei uns auf die Warteliste eingetragen — deshalb erhalten Sie
      diese Nachricht.
    </p>
    <p>
      <a href="${APP_URL}/kunde/buchen-service"
         style="display:inline-block;padding:12px 22px;background:#C9963C;color:#1A1612;
                border-radius:8px;text-decoration:none;font-weight:600;">
        Jetzt Leistung buchen
      </a>
    </p>
    <p>
      Wenn Sie keine weiteren Nachrichten von uns wünschen, antworten Sie einfach
      kurz auf diese E-Mail.
    </p>
    <p>Herzliche Grüße<br>Ihr Team von Alltagsengel</p>
  `
}

async function ladeStatus(orgId: string, bundesland: BundeslandCode) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('state_settings')
    .select('insurance_enabled, status')
    .eq('organization_id', orgId)
    .eq('bundesland', bundesland)
    .maybeSingle()
  return data
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireExpansionAdmin()
  if (!auth.ok) return auth.response

  const { bundesland: roh } = await context.params
  const bundesland = normalizeBundesland(roh)
  if (!bundesland) {
    return NextResponse.json({ error: `Unbekanntes Bundesland: "${roh}"` }, { status: 400 })
  }

  const admin = createAdminClient()
  const { count } = await admin
    .from('state_waitlist')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', auth.orgId)
    .eq('bundesland', bundesland)
    .eq('benachrichtigen', true)
    .is('notified_at', null)

  const status = await ladeStatus(auth.orgId, bundesland)

  return NextResponse.json({
    bundesland,
    bundesland_label: BUNDESLAND_NAMEN[bundesland],
    freigeschaltet: status?.insurance_enabled === true,
    empfaenger_offen: count ?? 0,
    max_pro_lauf: MAX_PRO_LAUF,
    hinweis: 'Der Versand startet erst mit POST { "bestaetigt": true }.',
  })
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireExpansionAdmin()
  if (!auth.ok) return auth.response

  const { bundesland: roh } = await context.params
  const bundesland = normalizeBundesland(roh)
  if (!bundesland) {
    return NextResponse.json({ error: `Unbekanntes Bundesland: "${roh}"` }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  if (body?.bestaetigt !== true) {
    return NextResponse.json(
      {
        error: 'Versand nicht bestätigt. Diese Aktion verschickt E-Mails an externe '
          + 'Empfänger und muss mit { "bestaetigt": true } ausdrücklich freigegeben werden.',
      },
      { status: 428 }
    )
  }

  // Nur benachrichtigen, wenn wirklich freigeschaltet ist — sonst wäre die
  // Mail sachlich falsch.
  const status = await ladeStatus(auth.orgId, bundesland)
  if (!status?.insurance_enabled) {
    return NextResponse.json(
      {
        error: `Für ${BUNDESLAND_NAMEN[bundesland]} ist die Kassenabrechnung nicht `
          + 'freigeschaltet. Eine Freischaltungs-Benachrichtigung wäre inhaltlich falsch.',
      },
      { status: 409 }
    )
  }

  const admin = createAdminClient()

  // ═══ Empfänger ATOMAR beanspruchen ═══
  // Erst markieren, dann versenden. Zwei parallele Läufe (Doppelklick, zweiter
  // Tab, Retry) würden sonst dieselben Adressen zweimal anschreiben: das
  // SELECT beider Läufe sähe dieselben Zeilen mit notified_at IS NULL.
  // Das UPDATE … RETURNING ist atomar, jede Zeile geht nur an einen Lauf.
  const { data: ids, error: claimError } = await admin
    .rpc('claim_waitlist_batch', {
      p_org_id: auth.orgId,
      p_bundesland: bundesland,
      p_limit: MAX_PRO_LAUF,
    })

  if (claimError) {
    console.error('[expansion/notify-waitlist] Beanspruchen fehlgeschlagen:', claimError.message)
    return NextResponse.json(
      { error: 'Warteliste konnte nicht geladen werden' },
      { status: 500 }
    )
  }

  const empfaenger = (ids ?? []) as Array<{ id: string; email: string; name: string | null }>
  const land = BUNDESLAND_NAMEN[bundesland]
  const betreff = `Pflegekassenabrechnung jetzt auch in ${land} möglich`
  let versendet = 0
  const fehlgeschlagen: string[] = []

  for (const e of empfaenger) {
    const ok = await sendEmailNotification(
      e.email,
      e.name || 'Sie',
      betreff,
      mailText(land, e.name)
    )
    if (ok) {
      versendet++
    } else {
      fehlgeschlagen.push(e.email)
      // Markierung zurücknehmen, damit ein späterer Lauf es erneut versucht.
      await admin
        .from('state_waitlist')
        .update({ notified_at: null })
        .eq('id', e.id)
    }
  }

  return NextResponse.json({
    ok: true,
    bundesland,
    versendet,
    fehlgeschlagen: fehlgeschlagen.length,
    verbleibend_hinweis: empfaenger.length === MAX_PRO_LAUF
      ? `Es wurden ${MAX_PRO_LAUF} Mails verschickt (Obergrenze je Lauf). `
        + 'Bitte erneut aufrufen, um die restlichen Empfänger zu benachrichtigen.'
      : null,
  })
}
