import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgIdOrDefault } from '@/lib/organizations/server'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('api:notify-admin-registration')

export const POST = withTracking(async function POST(req: NextRequest) {
  try {
    // Auth-Check: Nur authentifizierte User dürfen diese Route aufrufen
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    const { userId, role, firstName, lastName, email, phone } = await req.json()
    if (!userId || !role) return NextResponse.json({ error: 'Missing data' }, { status: 400 })

    // Sicherheit: User darf nur sich selbst melden
    if (userId !== user.id) {
      return NextResponse.json({ error: 'Nicht berechtigt' }, { status: 403 })
    }

    const supabase = createAdminClient()
    // Frisch registrierter Nutzer hat noch keine Org-Bindung — bewusster
    // Stamm-Org-Fallback (Audit MITTEL-1, dokumentierte Ausnahme). Ohne ihn
    // wuerde die Benachrichtigung an die Admins ALLER Mandanten gehen.
    const orgId = await getActiveOrgIdOrDefault()

    // ── org_fence, fail-closed ─────────────────────────────────────────
    // Der Zaun war bedingt: `.in('id', memberIdList)` wurde NUR angehaengt,
    // wenn die Mitgliederliste nicht leer war. Beide Wege, auf denen sie
    // leer bleibt — ein Fehler der Abfrage (RLS, Netz, Schema-Drift) und
    // eine Organisation ohne Mitglieder — liessen die Abfrage damit OHNE
    // Zaun laufen: die Meldung ueber den frisch registrierten Nutzer
    // (Name, E-Mail, Telefon, Rolle) ging an die Admins JEDES Mandanten.
    // Genau der Fall, den der Kommentar darueber ausschliessen wollte.
    //
    // Ein Zaun, der bei Stoerung aufgeht, ist keiner. Ohne belegte
    // Empfaengerliste geht die Meldung an niemanden.
    if (!orgId) {
      log.error('Keine Organisation aufloesbar — Registrierungsmeldung nicht versendet')
      return NextResponse.json({ success: true, sent: 0, grund: 'keine_organisation' })
    }

    const { data: members, error: membersError } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId)

    if (membersError) {
      log.errorWithException(
        'Mitgliederliste nicht lesbar — Registrierungsmeldung nicht versendet',
        new Error(membersError.message),
      )
      return NextResponse.json({ success: true, sent: 0, grund: 'mitglieder_nicht_lesbar' })
    }

    const memberIdList = (members ?? []).map(m => m.user_id)
    if (memberIdList.length === 0) {
      log.warn('Organisation ohne Mitglieder — Registrierungsmeldung nicht versendet', { orgId })
      return NextResponse.json({ success: true, sent: 0, grund: 'keine_mitglieder' })
    }

    // Dieselbe Unterscheidung wie bei der Mitgliederliste oben: „kein
    // Administrator in dieser Organisation" und „die Liste ist nicht
    // lesbar" enden sonst beide in einem stillen sent: 0 — und die
    // Registrierung eines neuen Engels bleibt unbemerkt liegen.
    const { data: admins, error: adminsError } = await supabase
      .from('profiles')
      .select('id, email, first_name')
      .in('role', ['admin', 'superadmin'])
      .in('id', memberIdList)

    if (adminsError) {
      log.errorWithException(
        'Administratorenliste nicht lesbar — Registrierungsmeldung nicht versendet',
        new Error(adminsError.message),
      )
      return NextResponse.json({ success: true, sent: 0, grund: 'admins_nicht_lesbar' })
    }

    if (!admins || admins.length === 0) return NextResponse.json({ success: true, sent: 0 })

    const roleLabels: Record<string, string> = { engel: 'Engel', kunde: 'Kunde', fahrer: 'Fahrer' }
    const roleLabel = roleLabels[role] || role
    const name = `${firstName || ''} ${lastName || ''}`.trim() || 'Unbekannt'
    const title = `Neue Registrierung: ${name} (${roleLabel})`
    const body = `${name} hat sich als ${roleLabel} registriert.\nE-Mail: ${email || '—'}\nTelefon: ${phone || '—'}`

    // Send notification to each admin
    const inserts = admins.map(admin => ({
      user_id: admin.id,
      type: 'system' as const,
      title,
      body,
      data: { registration_user_id: userId, role, email, firstName, lastName },
      link: '/mis/team',
    }))

    const { error } = await supabase.from('notifications').insert(inserts)
    if (error) log.errorWithException('Notification insert error', error)

    return NextResponse.json({ success: true, sent: admins.length })
  } catch (err) {
    return safeApiError(err, req)
  }
})
