import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOrgRole } from '@/lib/organizations/server'
import { pruefeZertifikat, ZERTIFIKAT_BUCKET } from '@/lib/abrechnung/zertifikate'
import { datumBerlin } from '@/lib/utils/timezone';

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/organizations/zertifikat
 * Onboarding Schritt 3: ITSG-Zertifikat einer Organisation hochladen.
 * multipart/form-data: organization_id, datei (.p12 oder .pem), passwort (bei .p12)
 * Nur Owner/Admin der Organisation.
 */
export async function POST(req: NextRequest) {
  try {
    // Falscher Content-Type laesst formData() werfen. Ohne diesen eigenen
    // Zweig landete das im aeusseren catch und die Route antwortete mit
    // 500 auf einen reinen Eingabefehler.
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return NextResponse.json(
        { error: 'Erwartet wird multipart/form-data mit organization_id und datei.' },
        { status: 400 }
      )
    }
    const organizationId = String(form.get('organization_id') || '')
    const datei = form.get('datei') as File | null
    const passwort = form.get('passwort') != null ? String(form.get('passwort')) : undefined

    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) {
      return NextResponse.json({ error: 'Ungültige Organisations-ID' }, { status: 400 })
    }
    const auth = await requireOrgRole(organizationId, ['owner', 'admin'])
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    if (!datei) return NextResponse.json({ error: 'Keine Datei übermittelt' }, { status: 400 })
    if (datei.size > 1_000_000) return NextResponse.json({ error: 'Datei zu groß (max. 1 MB)' }, { status: 400 })

    const buf = Buffer.from(await datei.arrayBuffer())
    const pruefung = await pruefeZertifikat(buf, passwort)
    if (!pruefung.fingerprint) {
      return NextResponse.json(
        { error: `Zertifikat nicht lesbar: ${pruefung.fehler || 'unbekannter Fehler'}` },
        { status: 400 }
      )
    }
    if (!pruefung.gueltig) {
      return NextResponse.json({ error: pruefung.fehler || 'Zertifikat abgelaufen' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: org } = await admin
      .from('organizations')
      .select('id, ik_nummer, onboarding_step')
      .eq('id', organizationId)
      .single()
    if (!org) return NextResponse.json({ error: 'Organisation nicht gefunden' }, { status: 404 })

    // IK im Zertifikat muss zur Organisation passen (sofern auslesbar)
    if (pruefung.ik_nummer && org.ik_nummer && pruefung.ik_nummer !== org.ik_nummer) {
      return NextResponse.json(
        { error: `Zertifikat ist auf IK ${pruefung.ik_nummer} ausgestellt, die Organisation hat IK ${org.ik_nummer}.` },
        { status: 400 }
      )
    }

    const istP12 = passwort !== undefined && !buf.toString('utf8').includes('-----BEGIN CERTIFICATE-----')
    const pfad = `zertifikate/org-${organizationId}.${istP12 ? 'p12' : 'pem'}`
    const { error: upErr } = await admin.storage
      .from(ZERTIFIKAT_BUCKET)
      .upload(pfad, buf, {
        contentType: istP12 ? 'application/x-pkcs12' : 'application/x-pem-file',
        upsert: true,
      })
    if (upErr) return NextResponse.json({ error: `Storage-Upload fehlgeschlagen: ${upErr.message}` }, { status: 500 })

    const zeile = {
      ik_nummer: org.ik_nummer || pruefung.ik_nummer,
      typ: 'absender',
      zertifikat_url: pfad,
      gueltig_bis: datumBerlin(pruefung.ablauf),
      fingerprint: pruefung.fingerprint,
      organization_id: organizationId,
    }
    let { error: dbErr } = await admin
      .from('abrechnung_zertifikate')
      .upsert(zeile, { onConflict: 'ik_nummer,typ' })
    if (dbErr && /organization_id/.test(dbErr.message)) {
      // Fallback, solange die Phase-3-Migration noch nicht angewendet ist
      const { organization_id: _omit, ...ohneOrg } = zeile
      ;({ error: dbErr } = await admin
        .from('abrechnung_zertifikate')
        .upsert(ohneOrg, { onConflict: 'ik_nummer,typ' }))
    }
    if (dbErr) return NextResponse.json({ error: `DB-Update fehlgeschlagen: ${dbErr.message}` }, { status: 500 })

    // Onboarding-Fortschritt
    if ((org.onboarding_step ?? 0) < 3) {
      await admin.from('organizations').update({ onboarding_step: 3 }).eq('id', organizationId)
    }

    return NextResponse.json({
      ok: true,
      ik_nummer: zeile.ik_nummer,
      gueltig_bis: zeile.gueltig_bis,
      fingerprint: pruefung.fingerprint,
    })
  } catch (e: any) {
    console.error('[api] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
