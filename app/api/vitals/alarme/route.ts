import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { berechneAktuelleAlarme } from '@/lib/vitals/vitals'
import { listThresholds, listVitals } from '@/lib/vitals/server'
import { grenzwertAlarmeAktiv } from '@/lib/vitals/config'

/**
 * GET — Aktive Grenzwert-Alarme der Organisation.
 * Bewertet je Klient und Vitaltyp die jüngste Messung der letzten 7 Tage
 * (Zeitfenster per ?tage= übersteuerbar).
 */
export async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    // MDR-Kill-Switch: Ohne regulatorische Freigabe werden keine Alarme
    // berechnet oder ausgeliefert (s. lib/vitals/config.ts).
    if (!grenzwertAlarmeAktiv()) {
      return NextResponse.json({ alarme: [], alarmeAktiv: false, zeitfensterTage: 0, messungenGeprueft: 0 })
    }

    const params = new URL(request.url).searchParams
    const tage = Math.min(Number(params.get('tage')) || 7, 90)
    const vonDatum = new Date(Date.now() - tage * 24 * 60 * 60 * 1000).toISOString()

    const admin = createAdminClient()
    const [messungen, grenzwerte] = await Promise.all([
      listVitals(admin, { organizationId: auth.ctx.organizationId, vonDatum, limit: 2000 }),
      listThresholds(admin, auth.ctx.organizationId),
    ])

    const alarme = berechneAktuelleAlarme(messungen, grenzwerte)
    return NextResponse.json({ alarme, alarmeAktiv: true, zeitfensterTage: tage, messungenGeprueft: messungen.length })
  } catch (err) {
    return safeApiError(err, request)
  }
}
