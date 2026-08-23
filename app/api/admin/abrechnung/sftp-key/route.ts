import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { ZERTIFIKAT_BUCKET } from '@/lib/abrechnung/zertifikate'
import { protokolliereRotation } from '@/lib/abrechnung/credentials'
import { logAuditEvent } from '@/lib/audit-log'
import { createHash } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/abrechnung/sftp-key
 * multipart/form-data: das_id, datei (SSH Private Key, PEM/OpenSSH)
 * Speichert den Key im privaten Bucket und verknüpft ihn mit der
 * Datenannahmestelle. Keys landen NIE in der Datenbank.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminMitOrg('system.verwalten')
  if (!auth.ok) return auth.response
  try {
    const organizationId = auth.organizationId

    const form = await req.formData()
    const dasId = String(form.get('das_id') || '')
    const datei = form.get('datei') as File | null
    if (!dasId || !datei) return NextResponse.json({ error: 'das_id oder Datei fehlt' }, { status: 400 })
    if (datei.size > 100_000) return NextResponse.json({ error: 'Key-Datei zu groß' }, { status: 400 })

    const buf = Buffer.from(await datei.arrayBuffer())
    const text = buf.toString('utf8')
    if (!text.includes('PRIVATE KEY')) {
      return NextResponse.json(
        { error: 'Datei sieht nicht wie ein SSH Private Key aus (PEM/OpenSSH erwartet)' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const { data: das, error: dasErr } = await supabase
      .from('datenannahmestellen')
      .select('id, name, organization_id')
      .eq('id', dasId)
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .single()
    if (dasErr || !das) return NextResponse.json({ error: 'Datenannahmestelle nicht gefunden' }, { status: 404 })
    if (!das.organization_id) {
      return NextResponse.json(
        { error: 'Gemeinsame Datenannahmestelle kann nicht direkt bearbeitet werden. Bitte eigene Kopie anlegen.' },
        { status: 403 }
      )
    }

    // Ob es eine Rotation oder die Ersthinterlegung ist, entscheidet sich am
    // bisherigen Verweis — nach dem Upload wäre das nicht mehr unterscheidbar.
    const { data: bisher } = await supabase
      .from('datenannahmestellen')
      .select('sftp_key_url')
      .eq('id', das.id)
      .maybeSingle()

    const pfad = `sftp-keys/${das.id}.key`
    const { error: upErr } = await supabase.storage
      .from(ZERTIFIKAT_BUCKET)
      .upload(pfad, buf, { contentType: 'application/x-pem-file', upsert: true })
    if (upErr) return safeApiError(upErr, req)

    const { error: updErr } = await supabase
      .from('datenannahmestellen')
      .update({ sftp_key_url: pfad })
      .eq('id', das.id)
    if (updErr) return safeApiError(updErr, req)

    // Fingerprint über den Dateiinhalt, damit ein Austausch nachweisbar ist.
    // Der Key selbst verlässt den Bucket nicht — in die Datenbank geht nur
    // dieser Hash.
    const fingerprint = createHash('sha256').update(buf).digest('hex').slice(0, 32)
    await protokolliereRotation(supabase, {
      organizationId,
      credentialId: 'sftp_ssh_key',
      ereignis: bisher?.sftp_key_url ? 'rotiert' : 'hinterlegt',
      fingerprintNeu: fingerprint,
      ablageOrt: `${ZERTIFIKAT_BUCKET}:${pfad}`,
      bezugId: das.id,
      bezugLabel: das.name,
      actorId: auth.userId,
    })

    await logAuditEvent({
      action: 'update',
      actorId: auth.userId,
      organizationId,
      entityType: 'datenannahmestelle',
      entityId: das.id,
      details: { sftp_key_url: pfad, das_name: das.name },
      request: req,
    })

    return NextResponse.json({ erfolg: true, pfad })
  } catch (e) {
    return safeApiError(e, req)
  }
}
