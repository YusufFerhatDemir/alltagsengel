import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import {
  speichereDatenannahmestelle,
  importiereDatenannahmestellen,
  type DatenannahmestelleEingabe,
} from '@/lib/abrechnung/stammdaten'
import { logBillingAction } from '@/lib/billing/core/audit'
import { logger } from '@/lib/logger'
const log = logger.child('stammdaten/datenannahmestellen')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERLAUBTE_FELDER: (keyof DatenannahmestelleEingabe)[] = [
  'ik_nummer', 'name', 'kassenart', 'bundesland', 'sftp_host', 'sftp_port',
  'sftp_user', 'sftp_verzeichnis', 'antwort_verzeichnis', 'kim_adresse',
  'zustaendig_fuer', 'leistungsarten', 'dateiformat', 'aktiv',
  'gueltig_ab', 'gueltig_bis',
]

/**
 * Nimmt ausschliesslich die erlaubten Felder an.
 *
 * `sftp_key_url` steht bewusst NICHT auf der Liste: der SSH-Key wird ueber
 * `/api/admin/abrechnung/sftp-key` hochgeladen, nicht ueber ein JSON-Feld.
 * Genauso wenig darf `organization_id` von aussen gesetzt werden.
 */
function nurErlaubteFelder(roh: Record<string, unknown>): DatenannahmestelleEingabe {
  const sauber: Record<string, unknown> = {}
  for (const feld of ERLAUBTE_FELDER) {
    if (roh[feld] !== undefined) sauber[feld] = roh[feld]
  }
  return sauber as unknown as DatenannahmestelleEingabe
}

/**
 * GET — Datenannahmestellen der eigenen Organisation plus global gepflegte
 * (organization_id IS NULL, z. B. ITSCare/BITMARCK).
 *
 * Liefert bewusst KEINE Zugangsdaten im Klartext: `sftp_key_url` wird nur als
 * Ja/Nein gemeldet, ein SSH-Key gehoert nicht in eine API-Antwort.
 */
export async function GET(request: Request) {
  const auth = await requireAdminMitOrg()
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('datenannahmestellen')
      .select('id, name, ik_nummer, kassenart, bundesland, sftp_host, sftp_port, sftp_user, sftp_verzeichnis, antwort_verzeichnis, sftp_key_url, kim_adresse, zustaendig_fuer, leistungsarten, dateiformat, aktiv, gueltig_ab, gueltig_bis, verbindung_status, letzte_verbindung_am, organization_id, updated_at')
      .or(`organization_id.eq.${auth.organizationId},organization_id.is.null`)
      .is('deleted_at', null)
      .order('name')

    if (error) {
      log.error('Laden fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }

    const stellen = (data ?? []).map(({ sftp_key_url, organization_id, ...rest }) => ({
      ...rest,
      ssh_key_hinterlegt: Boolean(sftp_key_url),
      global: organization_id === null,
      /** Global gepflegte Stellen sind fuer diesen Mandanten nicht editierbar. */
      editierbar: organization_id === auth.organizationId,
    }))

    return NextResponse.json({ datenannahmestellen: stellen })
  } catch (e) {
    return safeApiError(e, request)
  }
}

/** POST — einzelne Datenannahmestelle oder Massenimport (`dryRun` per Vorgabe an). */
export async function POST(req: NextRequest) {
  const auth = await requireAdminMitOrg()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
    }

    const admin = createAdminClient()

    if (Array.isArray(body.zeilen)) {
      if (body.zeilen.length > 500) {
        return NextResponse.json({ error: 'Maximal 500 Zeilen pro Import' }, { status: 400 })
      }
      const dryRun = body.dryRun !== false
      const zeilen = body.zeilen.map((z: Record<string, unknown>) => nurErlaubteFelder(z ?? {}))
      const ergebnis = await importiereDatenannahmestellen(admin, auth.organizationId, zeilen, { dryRun })

      if (!dryRun && ergebnis.erfolgreich > 0) {
        await logBillingAction(admin, {
          entityType: 'dta_annahmestelle',
      organizationId: auth.organizationId,
          entityId: auth.organizationId,
          action: 'datenannahmestellen_importiert',
          newState: { gesamt: ergebnis.gesamt, erfolgreich: ergebnis.erfolgreich, fehlerhaft: ergebnis.fehlerhaft },
          actorId: auth.userId,
        }).catch(err => log.errorWithException('Audit fehlgeschlagen', err))
      }

      return NextResponse.json(ergebnis, { status: ergebnis.fehlerhaft > 0 ? 207 : 200 })
    }

    const eingabe = nurErlaubteFelder(body)
    const ergebnis = await speichereDatenannahmestelle(admin, auth.organizationId, eingabe)

    if (!ergebnis.ok) {
      return NextResponse.json({ error: 'Validierung fehlgeschlagen', fehler: ergebnis.fehler, warnungen: ergebnis.warnungen }, { status: 400 })
    }

    await logBillingAction(admin, {
      entityType: 'dta_annahmestelle',
      organizationId: auth.organizationId,
      entityId: ergebnis.id!,
      action: 'datenannahmestelle_gespeichert',
      newState: { ik_nummer: eingabe.ik_nummer, name: eingabe.name, kassenart: eingabe.kassenart },
      actorId: auth.userId,
    }).catch(err => log.errorWithException('Audit fehlgeschlagen', err))

    return NextResponse.json({ erfolg: true, id: ergebnis.id, warnungen: ergebnis.warnungen })
  } catch (e) {
    return safeApiError(e, req)
  }
}

/** DELETE — Soft-Delete. Global gepflegte Stellen sind nicht loeschbar. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdminMitOrg()
  if (!auth.ok) return auth.response

  try {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id ist Pflicht' }, { status: 400 })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('datenannahmestellen')
      .update({ deleted_at: new Date().toISOString(), aktiv: false })
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle()

    if (error) {
      log.error('Loeschen fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Nicht gefunden oder nicht editierbar' }, { status: 404 })

    await logBillingAction(admin, {
      entityType: 'dta_annahmestelle',
      organizationId: auth.organizationId,
      entityId: id,
      action: 'datenannahmestelle_geloescht',
      actorId: auth.userId,
    }).catch(err => log.errorWithException('Audit fehlgeschlagen', err))

    return NextResponse.json({ erfolg: true })
  } catch (e) {
    return safeApiError(e, req)
  }
}
