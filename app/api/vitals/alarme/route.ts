import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { berechneAktuelleAlarme, listThresholds, listVitals } from '@/lib/vitals/vitals'

/**
 * GET — Aktive Grenzwert-Alarme der Organisation.
 * Bewertet je Klient und Vitaltyp die jüngste Messung der letzten 7 Tage
 * (Zeitfenster per ?tage= übersteuerbar).
 */
export async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const tage = Math.min(Number(params.get('tage')) || 7, 90)
    const vonDatum = new Date(Date.now() - tage * 24 * 60 * 60 * 1000).toISOString()

    const admin = createAdminClient()
    const [messungen, grenzwerte] = await Promise.all([
      listVitals(admin, { organizationId: auth.ctx.organizationId, vonDatum, limit: 2000 }),
      listThresholds(admin, auth.ctx.organizationId),
    ])

    const alarme = berechneAktuelleAlarme(messungen, grenzwerte)
    return NextResponse.json({ alarme, zeitfensterTage: tage, messungenGeprueft: messungen.length })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
