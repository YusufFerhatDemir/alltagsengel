import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { sammleFristen } from '@/lib/automation/fristen-sammler'

// ═══════════════════════════════════════════════════════════════
// Fristen-Dashboard API — aggregiert Fristen aus allen Quellen
// ═══════════════════════════════════════════════════════════════

export async function GET() {
  const auth = await requireOpsAdmin('qm.lesen')
  if (!auth.ok) return auth.response

  const orgId = auth.ctx.organizationId
  const admin = createAdminClient()

  const { fristen, warnungen } = await sammleFristen(admin, orgId)

  const zusammenfassung = {
    ueberfaellig: fristen.filter(f => f.dringlichkeit === 'ueberfaellig').length,
    kritisch: fristen.filter(f => f.dringlichkeit === 'kritisch').length,
    warnung: fristen.filter(f => f.dringlichkeit === 'warnung').length,
    ok: fristen.filter(f => f.dringlichkeit === 'ok').length,
    gesamt: fristen.length,
  }

  return NextResponse.json({
    fristen: fristen.map(f => ({
      id: f.id,
      typ: f.typ,
      titel: f.titel,
      beschreibung: f.beschreibung,
      bezug: f.bezug,
      faellig_am: f.faelligAm,
      tage_verbleibend: f.tageVerbleibend,
      dringlichkeit: f.dringlichkeit,
      quelle: f.quelle,
    })),
    zusammenfassung,
    ...(warnungen.length > 0 ? { warnungen } : {}),
  })
}
