import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'

const ERLAUBTE_STATUS = ['verified', 'unverified', 'blocked'] as const
type TarifStatus = (typeof ERLAUBTE_STATUS)[number]

function istTarifStatus(v: unknown): v is TarifStatus {
  return typeof v === 'string' && (ERLAUBTE_STATUS as readonly string[]).includes(v)
}

/**
 * PATCH /api/billing/tariffs/[id]/verifizierung
 *
 * Der EINZIGE zulaessige Weg, tarif_status zu aendern. POST /api/billing/tariffs
 * ignoriert tarif_status im Body bewusst — neue Tarife starten immer als
 * 'unverified'. Diese Route ist der kontrollierte, auditierbare Freigabeprozess:
 * Admin-Gate + Pflichtquelle bei verified/blocked. Jede Aenderung landet
 * zusaetzlich automatisch in billing_tariff_audit (Trigger trg_billing_tariff_audit).
 *
 * Body: { status: 'verified' | 'unverified' | 'blocked', quelle: string }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { userId, organizationId, name } = auth.ctx

  try {
    const { id } = await params
    const body = await request.json().catch(() => null)

    const status = body?.status
    const quelle = typeof body?.quelle === 'string' ? body.quelle.trim() : ''

    if (!istTarifStatus(status)) {
      return NextResponse.json(
        { error: `Ungültiger Status "${status}". Erlaubt: ${ERLAUBTE_STATUS.join(', ')}.` },
        { status: 400 }
      )
    }
    if ((status === 'verified' || status === 'blocked') && quelle.length < 5) {
      return NextResponse.json(
        { error: 'Für "verified" und "blocked" ist eine Rechtsquelle (min. 5 Zeichen) verpflichtend anzugeben.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Mandantentrennung: der Admin-Client umgeht RLS, organization_id deshalb
    // explizit im Filter statt sich auf RLS zu verlassen.
    const { data: bestehend, error: loadError } = await admin
      .from('billing_tariffs')
      .select('id, leistungsart, tarif_status, organization_id, deleted_at')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (loadError || !bestehend) {
      return NextResponse.json({ error: 'Tarif nicht gefunden.' }, { status: 404 })
    }
    if (bestehend.deleted_at) {
      return NextResponse.json({ error: 'Tarif ist gelöscht.' }, { status: 400 })
    }

    const { data: tariff, error } = await admin
      .from('billing_tariffs')
      .update({
        tarif_status: status,
        verifiziert_am: new Date().toISOString(),
        verifiziert_von: `${name} (${userId})`,
        verifizierungs_quelle: quelle || null,
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single()

    if (error) {
      console.error('Tarif-Verifizierung fehlgeschlagen:', error)
      return NextResponse.json({ error: 'Verifizierung konnte nicht gespeichert werden.' }, { status: 500 })
    }

    return NextResponse.json({
      tariff,
      vorherigerStatus: bestehend.tarif_status,
    })
  } catch (err) {
    console.error('Unerwarteter Fehler bei der Tarif-Verifizierung:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
