import { createClient } from '@/lib/supabase/server'
import { centRunden } from '@/lib/geld'
import { rolleDarf } from '@/lib/auth/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { preFlightValidierung, monatsGrenzen, euroZuCent } from '@/lib/abrechnung/kassenabrechnung-engine'
import { generateAlleDateien, type AbrechnungsFall, type GeneratorOptionen } from '@/lib/abrechnung/edifact-generator'
import { validateEDIFACT } from '@/lib/abrechnung/edifact-validator'
import { generateAuftragsdatei } from '@/lib/abrechnung/auftragsdatei'
import { getActiveOrgId } from '@/lib/organizations/server'
import { getOrgIK } from '@/lib/config/org-config'
import { logBillingAction } from '@/lib/billing/core/audit'
import { pflegegradVon } from '@/lib/clients/pflegegrad'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('dta/dry-run')

export const maxDuration = 60

/**
 * POST /api/billing/dta/dry-run
 *
 * Vollständiger interner Durchlauf des DTA-Workflows OHNE:
 * - Daten in die Datenbank zu schreiben
 * - SECON-Verschlüsselung (benötigt echtes Zertifikat)
 * - SFTP-Übertragung
 *
 * Prüft: PreFlight → Rechnungsdaten → EDIFACT-Generierung → Validierung
 *        → Auftragsdatei → Routing → Ergebnisbericht
 */
export const POST = withTracking(async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !rolleDarf(profile.role, 'abrechnung.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const body = await request.json()
    const { abrechnungsmonat, bundesland, kostentraegerIk } = body

    if (!abrechnungsmonat || !bundesland) {
      return NextResponse.json(
        { error: 'abrechnungsmonat und bundesland sind Pflichtfelder.' },
        { status: 400 },
      )
    }

    const start = Date.now()
    const schritte: Array<{
      schritt: string
      status: 'ok' | 'warnung' | 'fehler' | 'uebersprungen'
      details: string
      dauer_ms?: number
    }> = []

    const admin = createAdminClient()

    // ── 1. PreFlight ────────────────────────────────────────────
    const pfStart = Date.now()
    const validierung = await preFlightValidierung(admin, {
      organizationId,
      abrechnungsmonat,
      bundesland,
      kostentraegerIk,
    })

    schritte.push({
      schritt: '1. Pre-Flight-Validierung',
      status: validierung.bestanden ? 'ok' : 'fehler',
      details: validierung.bestanden
        ? `${validierung.alle.length} Prüfpunkte bestanden (${validierung.warnungen.length} Warnungen)`
        : `${validierung.fehler.length} Pflichtfehler: ${validierung.fehler.map(f => f.label).join(', ')}`,
      dauer_ms: Date.now() - pfStart,
    })

    if (!validierung.bestanden) {
      return NextResponse.json({
        modus: 'dry-run',
        ergebnis: 'NICHT BEREIT',
        schritte,
        validierung,
        dauer_ms: Date.now() - start,
      })
    }

    // ── 2. Rechnungen laden ─────────────────────────────────────
    const rlStart = Date.now()
    let rechnungenQuery = admin
      .from('invoices')
      .select('id, client_id, total_amount, invoice_number_formatted, billing_type, period_start, period_end')
      .eq('organization_id', organizationId)
      .gte('period_start', monatsGrenzen(abrechnungsmonat).von)
      .lte('period_start', monatsGrenzen(abrechnungsmonat).bis)
      .in('status', ['freigegeben', 'erneut_eingereicht'])
      .is('deleted_at', null)

    if (kostentraegerIk) {
      rechnungenQuery = rechnungenQuery.eq('billing_type', 'kasse')
    }

    const { data: rechnungen } = await rechnungenQuery
    // total_amount steht in EURO — vor jeder Cent-Rechnung umrechnen.
    const gesamtCent = rechnungen?.reduce((s, r) => s + euroZuCent(r.total_amount), 0) ?? 0

    schritte.push({
      schritt: '2. Rechnungen geladen',
      status: rechnungen?.length ? 'ok' : 'fehler',
      details: rechnungen?.length
        ? `${rechnungen.length} Rechnungen, Gesamtbetrag: ${(gesamtCent / 100).toFixed(2)} €`
        : 'Keine freigegebenen Rechnungen gefunden',
      dauer_ms: Date.now() - rlStart,
    })

    if (!rechnungen?.length) {
      return NextResponse.json({
        modus: 'dry-run',
        ergebnis: 'NICHT BEREIT',
        schritte,
        validierung,
        dauer_ms: Date.now() - start,
      })
    }

    // ── 3. Kundendaten + Leistungsnachweise ─────────────────────
    const kdStart = Date.now()
    const clientIds = [...new Set(rechnungen.map(r => r.client_id))]
    const { data: clients } = await admin
      .from('clients')
      .select('id, first_name, last_name, versichertennummer, geburtsdatum, care_level, pflegegrad, pflegekasse_ik, address, city, zip_code')
      .in('id', clientIds)
      .eq('organization_id', organizationId)

    const clientMap = new Map(clients?.map(c => [c.id, c]) ?? [])

    // Kostentraeger-Daten aus Verordnungen (clients hat kein kostentraeger_ik)
    const { data: verordnungenDry } = await admin
      .from('verordnungen')
      .select('id, client_id, kostentraeger_ik_nummer, kostentraeger_name')
      .in('client_id', clientIds)
      .eq('genehmigung_status', 'genehmigt')
      .eq('organization_id', organizationId)

    const ktByClient = new Map<string, { ik: string; name: string }>()
    for (const v of verordnungenDry ?? []) {
      if (v.kostentraeger_ik_nummer && !ktByClient.has(v.client_id)) {
        ktByClient.set(v.client_id, { ik: v.kostentraeger_ik_nummer, name: v.kostentraeger_name || '' })
      }
    }

    // Fallback: Kostentraeger aus Rechnungen
    for (const inv of rechnungen) {
      if (!ktByClient.has(inv.client_id)) {
        const { data: invDet } = await admin
          .from('invoices')
          .select('kostentraeger_ik, kostentraeger_name')
          .eq('id', inv.id)
          .single()
        if (invDet?.kostentraeger_ik) {
          ktByClient.set(inv.client_id, { ik: invDet.kostentraeger_ik, name: invDet.kostentraeger_name || '' })
        }
      }
    }

    const periodMonth = abrechnungsmonat.slice(0, 7)
    const drStart = `${periodMonth}-01`
    const drLastDay = new Date(Number(periodMonth.slice(0, 4)), Number(periodMonth.slice(5, 7)), 0).getDate()
    const drEnd = `${periodMonth}-${String(drLastDay).padStart(2, '0')}`
    const { data: records } = await admin
      .from('service_records')
      .select('id, client_id, date, service_type, duration_minutes, amount, caregiver_id, caregiver:caregivers(first_name, last_name), proof_status')
      .in('client_id', clientIds)
      .eq('organization_id', organizationId)
      .gte('date', drStart)
      .lte('date', drEnd)
      .in('status', ['complete', 'signed', 'invoiced'])

    const unsigniert = records?.filter((r: any) => r.proof_status !== 'UNTERSCHRIEBEN') ?? []

    schritte.push({
      schritt: '3. Kundendaten + Leistungsnachweise',
      status: unsigniert.length > 0 ? 'warnung' : 'ok',
      details: `${clientIds.length} Kunden, ${records?.length ?? 0} Leistungsnachweise` +
        (unsigniert.length > 0 ? ` (${unsigniert.length} nicht unterschrieben)` : ''),
      dauer_ms: Date.now() - kdStart,
    })

    // ── 4. AbrechnungsFall-Objekte aufbauen ──────────────────────
    const faelleMap = new Map<string, AbrechnungsFall>()
    for (const inv of rechnungen) {
      const client = clientMap.get(inv.client_id)
      if (!client) continue

      const kt = ktByClient.get(inv.client_id)
      const clientRecords = records?.filter((r: any) => r.client_id === inv.client_id) ?? []
      const leistungen = clientRecords.map((r: any) => {
        const menge = (r.duration_minutes ?? 60) / 60
        const gesamtCent = euroZuCent(r.amount)
        const einzelpreisCent = menge > 0 ? centRunden(gesamtCent / menge) : gesamtCent
        return {
          datum: r.date,
          leistungsart: r.service_type || 'alltagsbegleitung_45a',
          menge,
          einzelpreis_cent: einzelpreisCent,
          uhrzeit: undefined,
          dauer_minuten: r.duration_minutes ?? 60,
          pflegekraft_name: r.caregiver
            ? `${r.caregiver.first_name || ''} ${r.caregiver.last_name || ''}`.trim()
            : 'Alltagsengel',
        }
      })

      const kostentraegerIk = kt?.ik || client.pflegekasse_ik || ''
      const key = `${inv.client_id}_${kostentraegerIk || 'UNBEKANNT'}`
      if (!faelleMap.has(key)) {
        faelleMap.set(key, {
          verordnung_id: inv.id,
          client: {
            versichertennummer: client.versichertennummer || '',
            geburtsdatum: client.geburtsdatum || '',
            nachname: client.last_name || '',
            vorname: client.first_name || '',
            pflegegrad: pflegegradVon(client) ?? 0,
            strasse: client.address,
            plz: client.zip_code,
            ort: client.city,
          },
          kostentraeger: {
            ik_nummer: kostentraegerIk,
            pflegekasse_ik: client.pflegekasse_ik || kostentraegerIk,
            name: kt?.name || '',
          },
          leistungen: [],
          abrechnungsmonat: abrechnungsmonat.replace('-', ''),
        })
      }
      faelleMap.get(key)!.leistungen.push(...leistungen)
    }

    const faelle = [...faelleMap.values()]

    schritte.push({
      schritt: '4. Abrechnungsfälle aufgebaut',
      status: faelle.length > 0 ? 'ok' : 'fehler',
      details: `${faelle.length} Abrechnungsfälle für ${new Set(faelle.map(f => f.kostentraeger.ik_nummer)).size} Kostenträger`,
    })

    if (faelle.length === 0) {
      return NextResponse.json({
        modus: 'dry-run',
        ergebnis: 'NICHT BEREIT',
        schritte,
        validierung,
        dauer_ms: Date.now() - start,
      })
    }

    // ── 5. EDIFACT generieren ────────────────────────────────────
    const edStart = Date.now()
    let absenderIk: string
    try {
      absenderIk = await getOrgIK(admin, organizationId)
    } catch {
      schritte.push({
        schritt: '5. EDIFACT-Generierung',
        status: 'fehler',
        details: 'Eigene IK-Nummer nicht konfiguriert',
      })
      return NextResponse.json({
        modus: 'dry-run',
        ergebnis: 'NICHT BEREIT',
        schritte,
        validierung,
        dauer_ms: Date.now() - start,
      })
    }

    // Org-Name fuer EDIFACT aus DB
    let absenderName = 'Alltagsengel UG'
    const { data: orgDry } = await admin
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single()
    if (orgDry?.name) absenderName = orgDry.name

    const optionen: GeneratorOptionen = {
      bundesland,
      absender_name: absenderName,
      dateiindikator: '0',
    }

    let dateien
    try {
      dateien = generateAlleDateien(faelle, absenderIk, optionen)
    } catch (err) {
      schritte.push({
        schritt: '5. EDIFACT-Generierung',
        status: 'fehler',
        details: `Generierung fehlgeschlagen: ${(err as Error).message}`,
        dauer_ms: Date.now() - edStart,
      })
      return NextResponse.json({
        modus: 'dry-run',
        ergebnis: 'NICHT BEREIT',
        schritte,
        validierung,
        dauer_ms: Date.now() - start,
      })
    }

    schritte.push({
      schritt: '5. EDIFACT-Generierung',
      status: 'ok',
      details: `${dateien.length} EDIFACT-Datei(en), ${dateien.reduce((s, d) => s + d.anzahl_nachrichten, 0)} Nachrichten, ${(dateien.reduce((s, d) => s + d.gesamtbetrag_cent, 0) / 100).toFixed(2)} €`,
      dauer_ms: Date.now() - edStart,
    })

    // ── 6. EDIFACT validieren ────────────────────────────────────
    const valStart = Date.now()
    const validierungsFehler: string[] = []
    for (const datei of dateien) {
      const val = validateEDIFACT(datei.inhalt)
      if (!val.ok) {
        validierungsFehler.push(...val.fehler.map(f => `${datei.logischer_dateiname}: ${f.meldung}`))
      }
    }

    schritte.push({
      schritt: '6. EDIFACT-Validierung (3 Stufen)',
      status: validierungsFehler.length === 0 ? 'ok' : 'fehler',
      details: validierungsFehler.length === 0
        ? `Alle ${dateien.length} Dateien bestanden Prüfstufe 1-3`
        : `${validierungsFehler.length} Fehler: ${validierungsFehler.slice(0, 3).join('; ')}`,
      dauer_ms: Date.now() - valStart,
    })

    // ── 7. Auftragsdatei (Anlage 3) ──────────────────────────────
    const aufStart = Date.now()
    const auftragsdateien = dateien.map(datei => {
      try {
        const inhalt = generateAuftragsdatei({
          absender_ik: absenderIk,
          datenannahmestelle_ik: datei.datenannahmestelle.ik,
          dateiname: datei.logischer_dateiname,
          dateigroesse_nutzdaten: new TextEncoder().encode(datei.inhalt).length,
        })
        return { datei: datei.logischer_dateiname, ok: true, groesse: inhalt.length }
      } catch (err) {
        return { datei: datei.logischer_dateiname, ok: false, fehler: (err as Error).message }
      }
    })

    const aufOk = auftragsdateien.filter(a => a.ok)
    schritte.push({
      schritt: '7. Auftragsdateien (Anlage 3)',
      status: aufOk.length === auftragsdateien.length ? 'ok' : 'fehler',
      details: `${aufOk.length}/${auftragsdateien.length} Auftragsdateien generiert (348 Byte fix)`,
      dauer_ms: Date.now() - aufStart,
    })

    // ── 8. Routing (Kostenträger → Datenannahmestelle) ──────────
    const routingStart = Date.now()
    const { data: aktiveDas } = await admin
      .from('datenannahmestellen')
      .select('id, name, ik_nummer, sftp_host, sftp_user, sftp_key_url, zustaendig_fuer')
      .eq('aktiv', true)
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)

    const routingErgebnisse = dateien.map(datei => {
      const zustaendig = aktiveDas?.filter(d =>
        Array.isArray(d.zustaendig_fuer) && d.zustaendig_fuer.includes(datei.datenannahmestelle.ik)
      ) ?? []
      const mitSftp = zustaendig.filter(d => d.sftp_host && d.sftp_user)
      return {
        empfaenger_ik: datei.datenannahmestelle.ik,
        empfaenger_name: datei.datenannahmestelle.name,
        annahmestelle_gefunden: zustaendig.length > 0,
        sftp_konfiguriert: mitSftp.length > 0,
        ssh_key: mitSftp.some(d => d.sftp_key_url),
      }
    })

    const alleGeroutet = routingErgebnisse.every(r => r.annahmestelle_gefunden)
    const alleSftp = routingErgebnisse.every(r => r.sftp_konfiguriert)

    schritte.push({
      schritt: '8. Routing → Datenannahmestellen',
      status: alleGeroutet && alleSftp ? 'ok' : alleGeroutet ? 'warnung' : 'fehler',
      details: alleGeroutet
        ? alleSftp
          ? `Alle ${routingErgebnisse.length} Empfänger zugeordnet und SFTP konfiguriert`
          : `Alle ${routingErgebnisse.length} Empfänger zugeordnet, aber SFTP-Daten fehlen`
        : `${routingErgebnisse.filter(r => !r.annahmestelle_gefunden).length} Empfänger ohne Datenannahmestelle`,
      dauer_ms: Date.now() - routingStart,
    })

    // ── 9. SECON-Vorbereitung (Prüfung, kein echtes Verschlüsseln) ─
    const { data: absenderZert } = await admin
      .from('abrechnung_zertifikate')
      .select('gueltig_bis, ik_nummer')
      .eq('typ', 'absender')
      .eq('organization_id', organizationId)
      .order('gueltig_bis', { ascending: false })
      .limit(1)
      .maybeSingle()

    const seconPasswort = !!process.env.SECON_ZERT_PASSWORT
    const absenderOk = absenderZert?.gueltig_bis && new Date(absenderZert.gueltig_bis) > new Date()

    const empfaengerIks = [...new Set(dateien.map(d => d.datenannahmestelle.ik))]
    const { data: empfaengerZerts } = await admin
      .from('abrechnung_zertifikate')
      .select('ik_nummer, gueltig_bis')
      .eq('typ', 'empfaenger')
      .eq('organization_id', organizationId)
      .in('ik_nummer', empfaengerIks)

    const empfaengerGueltig = empfaengerZerts?.filter(z => new Date(z.gueltig_bis) > new Date()) ?? []
    const fehlendeEmpfaenger = empfaengerIks.filter(ik => !empfaengerGueltig.some(z => z.ik_nummer === ik))

    schritte.push({
      schritt: '9. SECON-Verschlüsselung (Vorbereitung)',
      status: absenderOk && seconPasswort && fehlendeEmpfaenger.length === 0 ? 'ok'
        : absenderOk && seconPasswort ? 'warnung' : 'fehler',
      details: [
        absenderOk ? 'Absenderzertifikat gültig' : 'Absenderzertifikat fehlt/abgelaufen',
        seconPasswort ? 'SECON_ZERT_PASSWORT gesetzt' : 'SECON_ZERT_PASSWORT fehlt',
        fehlendeEmpfaenger.length === 0
          ? `${empfaengerGueltig.length} Empfängerzertifikat(e) gültig`
          : `Empfängerzertifikate fehlen für: ${fehlendeEmpfaenger.join(', ')}`,
      ].join(' · '),
    })

    // ── 10. DAKOTA/SFTP-Übermittlung (Simulation) ────────────────
    schritte.push({
      schritt: '10. DAKOTA/SFTP-Übermittlung',
      status: 'uebersprungen',
      details: 'Dry-Run — keine externe Übermittlung durchgeführt (nur interne Validierung)',
    })

    // ── Ergebnis ─────────────────────────────────────────────────
    const fehlerSchritte = schritte.filter(s => s.status === 'fehler')
    const warnungSchritte = schritte.filter(s => s.status === 'warnung')

    const ergebnis = fehlerSchritte.length === 0 && validierungsFehler.length === 0
      ? 'BEREIT ZUR ÜBERMITTLUNG'
      : 'NICHT BEREIT'

    // Protokollieren, damit "letzter Dry-Run" in der Readiness-Ansicht aus
    // einer echten Quelle stammt. Best effort — der Dry-Run selbst schreibt
    // sonst nichts und darf an einem Audit-Fehler nicht scheitern.
    await logBillingAction(admin, {
      entityType: 'dta_validierung',
      organizationId,
      entityId: organizationId,
      action: 'dry_run_ausgefuehrt',
      newState: {
        ergebnis,
        fehler: fehlerSchritte.length,
        warnungen: warnungSchritte.length,
        dateien: dateien.length,
      },
      actorId: user.id,
    }).catch(err => log.errorWithException('Audit fehlgeschlagen', err))

    return NextResponse.json({
      modus: 'dry-run',
      ergebnis,
      schritte,
      zusammenfassung: {
        ok: schritte.filter(s => s.status === 'ok').length,
        warnungen: warnungSchritte.length,
        fehler: fehlerSchritte.length,
        uebersprungen: schritte.filter(s => s.status === 'uebersprungen').length,
      },
      dateien_vorschau: dateien.map(d => ({
        logischer_dateiname: d.logischer_dateiname,
        datenannahmestelle: d.datenannahmestelle.name,
        empfaenger_ik: d.datenannahmestelle.ik,
        nachrichten: d.anzahl_nachrichten,
        betrag_euro: (d.gesamtbetrag_cent / 100).toFixed(2),
        groesse_bytes: new TextEncoder().encode(d.inhalt).length,
      })),
      routing: routingErgebnisse,
      validierung,
      fehlerliste: fehlerSchritte.length > 0
        ? fehlerSchritte.map(s => `${s.schritt}: ${s.details}`)
        : undefined,
      dauer_ms: Date.now() - start,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
