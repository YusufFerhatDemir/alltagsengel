import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { requireAdmin } from '@/lib/abrechnung/require-admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { ladeEmpfaengerZertifikat } from '@/lib/abrechnung/zertifikate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // ITSG-Verzeichnis ist mehrere MB groß

/**
 * POST /api/admin/abrechnung/itsg
 * Body: { ik: '123456789', neu_laden?: boolean }
 * Lädt das Empfänger-Zertifikat der IK aus dem öffentlichen
 * ITSG-Trust-Center-Verzeichnis und cacht es in der DB.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  try {
    const orgId = await getActiveOrgId()
    if (!orgId) return NextResponse.json({ error: 'Keine Organisation zugewiesen' }, { status: 403 })

    const body = await req.json()
    const ik = String(body.ik || '').replace(/\D/g, '')
    if (!/^\d{9}$/.test(ik)) {
      return NextResponse.json({ error: 'IK-Nummer muss 9 Ziffern haben' }, { status: 400 })
    }
    const zert = await ladeEmpfaengerZertifikat(ik, {
      cacheIgnorieren: Boolean(body.neu_laden),
      organizationId: orgId,
    })
    return NextResponse.json({
      erfolg: true,
      zertifikat: {
        ik_nummer: zert.ik_nummer,
        gueltig_ab: zert.gueltig_ab,
        gueltig_bis: zert.gueltig_bis,
        fingerprint: zert.fingerprint,
      },
    })
  } catch (e) {
    return safeApiError(e, req)
  }
}
