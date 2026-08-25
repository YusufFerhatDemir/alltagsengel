import { createClient } from '@/lib/supabase/server'
import { rolleDarf } from '@/lib/auth/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { freezeInvoice } from '@/lib/billing/core'
import { getActiveOrgId } from '@/lib/organizations/server'
import { versandFlagsStand } from '@/lib/config/versand-flags'
import { protokolliereVersandFlags } from '@/lib/config/versand-flags-audit'
import { safeApiError } from '@/lib/api/error-sanitizer'

/**
 * POST /api/billing/invoices/[id]/freeze
 * Rechnung festschreiben (Snapshot + Preise einfrieren).
 * Nur fuer Administratoren.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Auth-Pruefung
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!profile || !rolleDarf(profile.role, 'abrechnung.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 })
    }

    // Org-Fence: der Admin-Client umgeht RLS (BYPASSRLS), die Zugehoerigkeit
    // der Rechnung muss deshalb hier explizit geprueft werden.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    // Admin-Client fuer die eigentlichen Operationen
    const admin = createAdminClient()

    const { data: invoice } = await admin
      .from('invoices')
      .select('id')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!invoice) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 })
    }

    // Auto-Versand nur, wenn ausdruecklich freigeschaltet: eine Rechnung an
    // den Kunden zu schicken ist der einzige Schritt der Kette, der nach
    // draussen geht. Ohne das Flag bleibt der Versand manuell ueber
    // POST /api/billing/invoices/[id]/versenden.
    //
    // Die Auswertung liegt in lib/config/versand-flags.ts: dort haengt am
    // Schalter zusaetzlich die Umgebungstrennung (eine Vercel-Variable fuer
    // „All Environments" wuerde sonst auch in jedem Branch-Preview echte Post
    // ausloesen).
    const flags = versandFlagsStand()
    // Vor dem Versand festhalten, welcher Betriebsmodus galt — aber nur bei
    // Wechsel. Fail-soft: kippt den Versand nicht.
    await protokolliereVersandFlags(admin, {
      organizationId, actorId: user.id, stand: flags,
    })

    const result = await freezeInvoice(admin, id, user.id, organizationId, {
      autoVersand: flags.rechnung.aktiv,
    })

    return NextResponse.json(result)
  } catch (err) {
    return safeApiError(err, _request)
  }
}
