import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserOrganizations, getActiveOrgId } from '@/lib/organizations/server'
import { validateIkNummer } from '@/lib/organizations/ik'
import { ACTIVE_ORG_COOKIE, PLAN_FEATURES, BUNDESLAENDER } from '@/lib/organizations/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/organizations
 * Organisationen des eingeloggten Users + aktive Organisation.
 * Liefert bewusst 200 mit leerer Liste, solange die Phase-3-Migration
 * noch nicht angewendet ist (UI degradiert dann auf „Alltagsengel").
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const organizations = await getUserOrganizations(user.id)
  const activeOrgId = await getActiveOrgId()
  return NextResponse.json({ organizations, active_org_id: activeOrgId })
}

/**
 * POST /api/organizations
 * Neue Organisation anlegen (Onboarding Schritt 1–2).
 * Body: { name, ik_nummer, address: {strasse, plz, ort}, bundesland }
 * Der anlegende User wird Owner; Free-Subscription wird erzeugt;
 * die neue Org wird direkt als aktive Org gesetzt.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  const name = String(body?.name || '').trim()
  const ikNummer = String(body?.ik_nummer || '').replace(/\s/g, '')
  const bundesland = String(body?.bundesland || '').trim()
  const address = {
    strasse: String(body?.address?.strasse || '').trim(),
    plz: String(body?.address?.plz || '').trim(),
    ort: String(body?.address?.ort || '').trim(),
    bundesland,
  }

  if (name.length < 3) {
    return NextResponse.json({ error: 'Bitte einen Firmennamen angeben (min. 3 Zeichen).' }, { status: 400 })
  }
  const ikCheck = validateIkNummer(ikNummer)
  if (!ikCheck.valid) {
    return NextResponse.json({ error: ikCheck.error }, { status: 400 })
  }
  if (bundesland && !(BUNDESLAENDER as readonly string[]).includes(bundesland)) {
    return NextResponse.json({ error: 'Unbekanntes Bundesland.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // IK darf nur einmal existieren
  const { data: existing } = await admin
    .from('organizations').select('id').eq('ik_nummer', ikNummer).maybeSingle()
  if (existing) {
    return NextResponse.json(
      { error: 'Für diese IK-Nummer existiert bereits eine Organisation. Bitte den Support kontaktieren.' },
      { status: 409 }
    )
  }

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      name,
      ik_nummer: ikNummer,
      address,
      bundesland: bundesland || null,
      billing_plan: 'free',
      status: 'onboarding',
      onboarding_step: 2,
    })
    .select()
    .single()
  if (orgErr || !org) {
    const hint = orgErr?.code === '42P01'
      ? ' (Phase-3-Migration noch nicht angewendet)' : ''
    return NextResponse.json({ error: `Organisation konnte nicht angelegt werden${hint}: ${orgErr?.message}` }, { status: 500 })
  }

  const { error: memberErr } = await admin
    .from('organization_members')
    .insert({ organization_id: org.id, user_id: user.id, role: 'owner' })
  if (memberErr) {
    await admin.from('organizations').delete().eq('id', org.id)
    return NextResponse.json({ error: `Mitgliedschaft konnte nicht angelegt werden: ${memberErr.message}` }, { status: 500 })
  }

  await admin.from('organization_subscriptions').insert({
    organization_id: org.id,
    plan: 'free',
    status: 'active',
    features: PLAN_FEATURES.free,
  })

  // Org-Kontext ins JWT (app_metadata nur serverseitig setzbar) + Cookie
  try {
    await admin.auth.admin.updateUserById(user.id, { app_metadata: { org_id: org.id } })
  } catch { /* nicht kritisch — Membership-Fallback greift */ }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_ORG_COOKIE, org.id, {
    path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 * 60 * 24 * 365,
  })

  return NextResponse.json({ organization: org })
}
