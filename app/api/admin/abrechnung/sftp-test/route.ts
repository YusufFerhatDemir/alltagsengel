import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { requireAdmin } from '@/lib/abrechnung/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { testeVerbindung, type TransportConfig } from '@/lib/abrechnung/transport'
import { ZERTIFIKAT_BUCKET } from '@/lib/abrechnung/zertifikate'
import { getActiveOrgId } from '@/lib/organizations/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Env-Variablen-Name für das SFTP-Passwort einer Annahmestelle. */
function sftpPasswortEnvName(name: string): string {
  return 'SECON_SFTP_PASSWORT_' + name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
}

/**
 * POST /api/admin/abrechnung/sftp-test
 * Body: { id: '<datenannahmestellen.id>' }
 * Testet die SFTP-Verbindung (Login + Verzeichnis-Check, kein Upload).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  try {
    const organizationId = await getActiveOrgId()
    if (!organizationId) return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 })

    const supabase = createAdminClient()
    const { data: das, error } = await supabase
      .from('datenannahmestellen')
      .select('*')
      .eq('id', id)
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .single()
    if (error || !das) return NextResponse.json({ error: 'Datenannahmestelle nicht gefunden' }, { status: 404 })
    if (!das.organization_id) {
      return NextResponse.json(
        { error: 'Gemeinsame Datenannahmestelle: SFTP-Test nur fuer eigene Kopie moeglich.' },
        { status: 403 }
      )
    }
    if (!das.sftp_host || !das.sftp_user) {
      return NextResponse.json({ error: 'SFTP-Host oder -User nicht konfiguriert' }, { status: 400 })
    }

    // SSH-Key aus privatem Bucket laden (falls hinterlegt)
    let sftpKey: Buffer | undefined
    if (das.sftp_key_url) {
      const { data: keyFile, error: keyErr } = await supabase.storage
        .from(ZERTIFIKAT_BUCKET)
        .download(das.sftp_key_url)
      if (keyErr || !keyFile) {
        return safeApiError(keyErr, req)
      }
      sftpKey = Buffer.from(await keyFile.arrayBuffer())
    }

    const envName = sftpPasswortEnvName(das.name)
    const passwort = process.env[envName]

    if (!sftpKey && !passwort) {
      return NextResponse.json({
        erfolg: false,
        protokoll:
          `Keine Zugangsdaten: weder SSH-Key hochgeladen noch Env-Variable ${envName} gesetzt.`,
      })
    }

    const config: TransportConfig = {
      datenannahmestelle: das.name,
      sftp_host: das.sftp_host,
      sftp_port: das.sftp_port || 22,
      sftp_user: das.sftp_user,
      sftp_key: sftpKey,
      sftp_passwort: passwort,
      sftp_verzeichnis: das.sftp_verzeichnis || undefined,
      antwort_verzeichnis: das.antwort_verzeichnis || undefined,
    }
    const ergebnis = await testeVerbindung(config)
    return NextResponse.json(ergebnis)
  } catch (e) {
    return safeApiError(e, req)
  }
}
