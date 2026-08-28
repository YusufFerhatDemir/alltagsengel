import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { getActiveOrgId } from '@/lib/organizations/server'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'

export const GET = withTracking(async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const quellen = await holeRollenQuellenFuer(supabase, user)

    if (!quellenDuerfen(quellen, 'abrechnung.lesen')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const admin = createAdminClient()

    const [orgRes, zertRes, dasRes, stateRes, laufRes] = await Promise.all([
      admin.from('organizations').select('ik_nummer, name').eq('id', organizationId).single(),
      admin.from('abrechnung_zertifikate').select('typ, gueltig_bis, ik_nummer, fingerprint').eq('organization_id', organizationId).order('gueltig_bis', { ascending: false }),
      admin.from('datenannahmestellen').select('id, name, ik_nummer, sftp_host, sftp_user, sftp_key_url, aktiv').or(`organization_id.eq.${organizationId},organization_id.is.null`).order('name'),
      admin.from('state_settings').select('bundesland, status, kassenrechnung_enabled, dakota_export_enabled').eq('organization_id', organizationId),
      // abrechnungslaeufe hat KEIN created_at — die Spalte heisst erstellt_am.
      // Mit created_at lieferte PostgREST 42703, `laufRes.data ?? []` schluckte
      // den Fehler und die DTA-Seite zeigte dauerhaft "keine Laeufe".
      admin.from('abrechnungslaeufe').select('id, status, abrechnungsmonat, bundesland, kostentraeger_ik, erstellt_am').eq('organization_id', organizationId).order('erstellt_am', { ascending: false }).limit(20),
    ])

    const absenderZert = zertRes.data?.find(z => z.typ === 'absender')
    const empfaengerZerts = zertRes.data?.filter(z => z.typ === 'empfaenger') ?? []
    const aktiveDas = dasRes.data?.filter(d => d.aktiv) ?? []
    const sftpKonfiguriert = aktiveDas.filter(d => d.sftp_host && d.sftp_user)
    const mitKey = sftpKonfiguriert.filter(d => d.sftp_key_url)
    const seconPasswort = !!process.env.SECON_ZERT_PASSWORT

    const laeufe = laufRes.data ?? []
    const uebermittelt = laeufe.filter(l => ['uebermittelt', 'quittiert', 'angenommen', 'abgeschlossen'].includes(l.status))
    const bereit = laeufe.filter(l => ['bereit_zur_uebermittlung', 'exportiert'].includes(l.status))
    const fehler = laeufe.filter(l => ['abgelehnt', 'teilweise_abgelehnt', 'korrektur_erforderlich', 'validierung_fehlgeschlagen'].includes(l.status))

    const bundeslaender = stateRes.data ?? []
    const kassenAktiv = bundeslaender.filter(b => b.kassenrechnung_enabled)
    const dakotaAktiv = bundeslaender.filter(b => b.dakota_export_enabled)

    const configItems = [
      {
        id: 'eigene_ik',
        label: 'Eigene IK-Nummer',
        status: orgRes.data?.ik_nummer ? 'ok' : 'fehlt',
        wert: orgRes.data?.ik_nummer || null,
        hinweis: orgRes.data?.ik_nummer ? null : 'EXTERNE KONFIGURATION ERFORDERLICH — IK in der Organisationstabelle oder als ALLTAGSENGEL_IK Env-Variable hinterlegen',
      },
      {
        id: 'absender_zertifikat',
        label: 'SECON-Absenderzertifikat (ITSG)',
        status: absenderZert
          ? new Date(absenderZert.gueltig_bis) > new Date() ? 'ok' : 'abgelaufen'
          : 'fehlt',
        wert: absenderZert ? `IK ${absenderZert.ik_nummer}, gültig bis ${new Date(absenderZert.gueltig_bis).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}` : null,
        hinweis: absenderZert
          ? new Date(absenderZert.gueltig_bis) > new Date() ? null : 'Zertifikat abgelaufen — beim ITSG Trust Center verlängern'
          : 'EXTERNE KONFIGURATION ERFORDERLICH — PKCS#12 vom ITSG Trust Center hochladen',
      },
      {
        id: 'secon_passwort',
        label: 'SECON-Zertifikat-Passwort (Env)',
        status: seconPasswort ? 'ok' : 'fehlt',
        wert: seconPasswort ? 'SECON_ZERT_PASSWORT gesetzt' : null,
        hinweis: seconPasswort ? null : 'EXTERNE KONFIGURATION ERFORDERLICH — Vercel → Settings → Environment Variables → SECON_ZERT_PASSWORT',
      },
      {
        id: 'empfaenger_zertifikate',
        label: 'Empfänger-Zertifikate (Datenannahmestellen)',
        status: empfaengerZerts.length > 0 ? 'ok' : 'fehlt',
        wert: empfaengerZerts.length > 0 ? `${empfaengerZerts.length} Zertifikat(e) geladen` : null,
        hinweis: empfaengerZerts.length > 0 ? null : 'Empfänger-Zertifikate aus dem ITSG-Verzeichnis laden (Einstellungen → Empfänger-Zertifikate)',
      },
      {
        id: 'datenannahmestellen',
        label: 'Datenannahmestellen (SFTP)',
        status: sftpKonfiguriert.length > 0 ? 'ok' : aktiveDas.length > 0 ? 'unvollstaendig' : 'fehlt',
        wert: sftpKonfiguriert.length > 0
          ? `${sftpKonfiguriert.length} konfiguriert (${mitKey.length} mit SSH-Key)`
          : aktiveDas.length > 0 ? `${aktiveDas.length} angelegt, aber SFTP-Daten fehlen` : null,
        hinweis: sftpKonfiguriert.length > 0
          ? mitKey.length < sftpKonfiguriert.length ? `${sftpKonfiguriert.length - mitKey.length} Annahmestelle(n) ohne SSH-Key — EXTERNE KONFIGURATION ERFORDERLICH` : null
          : 'EXTERNE KONFIGURATION ERFORDERLICH — Datenannahmestellen mit SFTP-Zugangsdaten anlegen',
      },
      {
        id: 'kassenabrechnung',
        label: 'Kassenabrechnung freigeschaltet',
        status: kassenAktiv.length > 0 ? 'ok' : 'fehlt',
        wert: kassenAktiv.length > 0 ? `${kassenAktiv.length} Bundesland/-länder` : null,
        hinweis: kassenAktiv.length > 0 ? null : 'Kassenabrechnung in keinem Bundesland freigeschaltet',
      },
      {
        id: 'dakota_export',
        label: 'DAKOTA-Export freigeschaltet',
        status: dakotaAktiv.length > 0 ? 'ok' : 'warnung',
        wert: dakotaAktiv.length > 0 ? `${dakotaAktiv.length} Bundesland/-länder` : null,
        hinweis: dakotaAktiv.length > 0 ? null : 'DAKOTA-Export nicht freigeschaltet — DTA-Dateien können erstellt, aber nicht übermittelt werden',
      },
    ]

    const uebermittlungsStatus = {
      bereit: bereit.length,
      uebermittelt: uebermittelt.length,
      fehler: fehler.length,
      letzterLauf: laeufe[0] ?? null,
    }

    const modus = dakotaAktiv.length > 0 && absenderZert && sftpKonfiguriert.length > 0
      ? 'produktion'
      : 'test'

    return NextResponse.json({
      modus,
      configItems,
      uebermittlungsStatus,
      zusammenfassung: {
        bereit: configItems.filter(c => c.status === 'ok').length,
        gesamt: configItems.length,
        fehlend: configItems.filter(c => c.status === 'fehlt').length,
        warnungen: configItems.filter(c => ['abgelaufen', 'unvollstaendig', 'warnung'].includes(c.status)).length,
      },
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
