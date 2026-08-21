import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { requireAdmin, requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { pruefeZertifikat, speichereAbsenderZertifikat } from '@/lib/abrechnung/zertifikate'
import { protokolliereRotation } from '@/lib/abrechnung/credentials'
import { logAuditEvent } from '@/lib/audit-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/abrechnung/zertifikat
 * Liste aller hinterlegten Zertifikate (Absender + Empfänger-Cache).
 */
export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    const orgId = await getActiveOrgId()
    if (!orgId) return NextResponse.json({ error: 'Keine Organisation zugewiesen' }, { status: 403 })

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('abrechnung_zertifikate')
      .select('id, ik_nummer, typ, gueltig_ab, gueltig_bis, fingerprint, zertifikat_url, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('typ')
      .order('ik_nummer')
    if (error) return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })

    const passwortGesetzt = Boolean(process.env.SECON_ZERT_PASSWORT)
    return NextResponse.json({ zertifikate: data || [], passwort_env_gesetzt: passwortGesetzt })
  } catch (e) {
    return safeApiError(e, request)
  }
}

/**
 * POST /api/admin/abrechnung/zertifikat
 * Upload des eigenen ITSG-Zertifikats (PKCS#12) als multipart/form-data:
 *   datei:    .p12-Datei
 *   passwort: PKCS#12-Passwort (wird NUR zur Validierung genutzt,
 *             nicht gespeichert — dauerhaft als Env SECON_ZERT_PASSWORT)
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminMitOrg()
  if (!auth.ok) return auth.response
  try {
    const orgId = auth.organizationId

    const form = await req.formData()
    const datei = form.get('datei') as File | null
    const passwort = String(form.get('passwort') || '')
    if (!datei) return NextResponse.json({ error: 'Keine Datei übermittelt' }, { status: 400 })
    if (datei.size > 1_000_000) return NextResponse.json({ error: 'Datei zu groß (max. 1 MB)' }, { status: 400 })

    const buf = Buffer.from(await datei.arrayBuffer())

    // Erst prüfen (liefert klare Fehlermeldung bei falschem Passwort)
    const pruefung = await pruefeZertifikat(buf, passwort)
    if (!pruefung.fingerprint) {
      return NextResponse.json(
        { error: `Zertifikat nicht lesbar: ${pruefung.fehler || 'unbekannter Fehler'}` },
        { status: 400 }
      )
    }

    // Vorgänger VOR dem Speichern feststellen: danach ist die neue Zeile da und
    // die Unterscheidung "erstmals hinterlegt" vs. "rotiert" nicht mehr möglich.
    const supabase = createAdminClient()
    const { data: vorgaenger } = await supabase
      .from('abrechnung_zertifikate')
      .select('fingerprint')
      .eq('organization_id', orgId)
      .eq('typ', 'absender')
      .neq('fingerprint', pruefung.fingerprint)
      .order('gueltig_bis', { ascending: false })
      .limit(1)
      .maybeSingle()

    const zert = await speichereAbsenderZertifikat(buf, passwort, orgId)

    await protokolliereRotation(supabase, {
      organizationId: orgId,
      credentialId: 'secon_absender_zertifikat',
      ereignis: vorgaenger ? 'rotiert' : 'hinterlegt',
      fingerprintNeu: zert.fingerprint,
      fingerprintAlt: vorgaenger?.fingerprint ?? null,
      gueltigBis: zert.gueltig_bis.toISOString().slice(0, 10),
      bezugLabel: `IK ${zert.ik_nummer}`,
      actorId: auth.userId,
    })

    await logAuditEvent({
      action: 'create',
      actorId: auth.userId,
      organizationId: orgId,
      entityType: 'abrechnung_zertifikat',
      entityId: zert.fingerprint,
      details: { ik_nummer: zert.ik_nummer, gueltig_ab: zert.gueltig_ab, gueltig_bis: zert.gueltig_bis },
      request: req,
    })

    return NextResponse.json({
      erfolg: true,
      zertifikat: {
        ik_nummer: zert.ik_nummer,
        gueltig_ab: zert.gueltig_ab,
        gueltig_bis: zert.gueltig_bis,
        fingerprint: zert.fingerprint,
      },
      hinweis: process.env.SECON_ZERT_PASSWORT
        ? undefined
        : 'WICHTIG: Passwort als Env-Variable SECON_ZERT_PASSWORT in Vercel hinterlegen — es wird nicht gespeichert.',
    })
  } catch (e) {
    return safeApiError(e, req)
  }
}
