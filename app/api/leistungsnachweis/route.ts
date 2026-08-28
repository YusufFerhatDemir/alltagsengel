import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { PDFDocument, rgb, type PDFPage, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgIK } from '@/lib/config/org-config'
import { BUDGET_TYPE_PDF, QUALIFICATION_LEVEL } from '@/lib/admin/ops'
import { modulAktivFuerPlz } from '@/lib/expansion/state-settings'
import { getActiveOrgId } from '@/lib/organizations/server'
import { one } from '@/lib/supabase/join'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { ladeUnterschriftsBild } from '@/lib/signaturen/unterschrift-bild'
import { ohneStornierte } from '@/lib/leistungsnachweis/status-sync'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'
const log = logger.child('leistungsnachweis')

// ═══════════════════════════════════════════════════════════════
// GET /api/leistungsnachweis?client_id=…&month=YYYY-MM
// ═══════════════════════════════════════════════════════════════
// Erzeugt den offiziellen Monats-Leistungsnachweis als PDF — mit
// ALLEN Feldern, die die Pflegekasse zur Anerkennung braucht:
//   • Leistungserbringer inkl. IK-Nummer
//   • Klient: Name, Geburtsdatum, Versichertennummer, Pflegekasse,
//     Pflegegrad
//   • Leistungszeitraum (Monat/Jahr)
//   • Einsatz-Tabelle: Datum, Uhrzeit von–bis, Dauer, Leistungsart,
//     Budget-Topf (korrektes SGB-XI-Label!), Betrag
//   • Betreuungskraft: Name, Lebenslange Nummer, Qualifikation
//   • BEIDE Unterschriften (Betreuungskraft + Klient/Angehörige)
//     — zusammengeführt aus service_signatures (Native-App-Pfad)
//     UND service_records.client_signature (Admin-Pfad)
//   • Summen pro Budget-Topf + Gesamtsumme + Rechtstext
//
// Antwort: application/pdf (direkter Download, kein Storage-Umweg).
// Zugriff: Admin/Superadmin ODER der Klient selbst (eigene Daten).
// ═══════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

const PAGE_WIDTH = 595.28 // A4 @ 72dpi
const PAGE_HEIGHT = 841.89
const MARGIN = 50

// Leistungserbringer-Stammdaten. IK-Nummer kommt über getOrgIK() (P0-5) —
// organizations-Tabelle bzw. ALLTAGSENGEL_IK, kein hartcodierter Default mehr.
const COMPANY = {
  name: 'Alltagsengel UG (haftungsbeschränkt)',
  short: 'Alltagsengel',
  address: 'Neue Mainzer Str. 66-68',
  city: '60311 Frankfurt am Main',
  email: 'info@alltagsengel.care',
}

const GOLD = rgb(0.79, 0.59, 0.24)
const COAL = rgb(0.15, 0.11, 0.07)
const GREY = rgb(0.4, 0.4, 0.4)
const LIGHT = rgb(0.85, 0.85, 0.85)

// pdf-lib Helvetica ist WinAnsi — U+202F (schmales geschütztes
// Leerzeichen mancher ICU-Versionen) vorsorglich ersetzen.
function txt(s: string): string {
  return s.replace(/ /g, ' ')
}

function euroFmt(n: number | null | undefined): string {
  const v = typeof n === 'number' ? n : 0
  return txt(v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }))
}

function dateFmt(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function timeFmt(t: string | null | undefined): string {
  if (!t) return '—'
  return String(t).slice(0, 5)
}

export const GET = withTracking(async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    let clientId = url.searchParams.get('client_id')
    const verordnungId = url.searchParams.get('verordnung_id')
    const month = url.searchParams.get('month') || url.searchParams.get('monat') // YYYY-MM

    if ((!clientId && !verordnungId) || !month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: 'client_id ODER verordnung_id sowie month (Format YYYY-MM) erforderlich' },
        { status: 400 }
      )
    }

    // ── Auth: Admin ODER der Klient selbst ──
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }
    const quellen = await holeRollenQuellenFuer(supabase, user)
    const isAdmin = quellenDuerfen(quellen, 'einsatz.lesen')

    const admin = createAdminClient()
    const orgId = await getActiveOrgId()
    // Fail-closed (Audit MITTEL-1)
    if (!orgId) return NextResponse.json({ error: 'Keine Organisation zugewiesen' }, { status: 403 })
    // Org MITGEBEN: ohne zweiten Parameter faellt getOrgIK auf die Stamm-
    // Organisation zurueck. Der Leistungsnachweis traegt die IK des
    // Leistungserbringers gegenueber der Pflegekasse — ein anderer
    // Mandant haette hier die IK von Alltagsengel ausgewiesen.
    const companyIk = await getOrgIK(admin, orgId)

    // ── Optional: Verordnung laden (liefert Genehmigungsnummer + Klient) ──
    let verordnung: {
      id: string
      client_id: string
      genehmigung_aktenzeichen: string | null
      genehmigung_bis: string | null
      kostentraeger_name: string | null
      kostentraeger_ik_nummer: string | null
    } | null = null
    if (verordnungId) {
      const { data: vo, error: voErr } = await admin
        .from('verordnungen')
        .select('id, client_id, genehmigung_aktenzeichen, genehmigung_bis, kostentraeger_name, kostentraeger_ik_nummer')
        .eq('id', verordnungId)
        .eq('organization_id', orgId)
        .single()
      if (voErr || !vo) {
        return NextResponse.json({ error: 'Verordnung nicht gefunden' }, { status: 404 })
      }
      verordnung = vo
      if (!clientId) clientId = vo.client_id
      if (clientId !== vo.client_id) {
        return NextResponse.json({ error: 'Verordnung gehört zu einem anderen Klienten' }, { status: 400 })
      }
    }

    // ── Klient laden (alle Pflegekassen-relevanten Felder) ──
    const { data: client, error: clientErr } = await admin
      .from('clients')
      .select('id, user_id, first_name, last_name, date_of_birth, care_level, address, city, zip_code, insurance_name, insurance_number, versichertennummer, pflegekasse_name, pflegekasse_ik')
      .eq('id', clientId)
      .eq('organization_id', orgId)
      .single()

    if (clientErr || !client) {
      return NextResponse.json({ error: 'Klient nicht gefunden' }, { status: 404 })
    }
    if (!isAdmin && client.user_id !== user.id) {
      return NextResponse.json({ error: 'Kein Zugriff auf diesen Klienten' }, { status: 403 })
    }

    // ── Leistungszeitraum ──
    const [yearStr, monthStr] = month.split('-')
    const year = Number(yearStr)
    const monthNum = Number(monthStr)
    const periodStart = `${month}-01`
    const lastDay = new Date(year, monthNum, 0).getDate()
    const periodEnd = `${month}-${String(lastDay).padStart(2, '0')}`
    const periodLabel = txt(new Date(year, monthNum - 1, 1)
      .toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', month: 'long', year: 'numeric' }))

    // ── Einsätze des Monats (erfasst/unterschrieben/abgerechnet) ──
    const baseQuery = admin
      .from('service_records')
      .select('id, date, start_time, end_time, duration_minutes, service_type, budget_type, amount, status, proof_status, billing_status, client_signature, caregiver_initials, caregiver_id, caregiver:caregivers(id, first_name, last_name, lifetime_registration_number, ik_nummer, qualification_level)')
      .eq('client_id', clientId)
      .eq('organization_id', orgId)
    const { data: records, error: recErr } = await (verordnung ? baseQuery.eq('verordnung_id', verordnung.id) : baseQuery)
      .gte('date', periodStart)
      .lte('date', periodEnd)
      .in('status', ['complete', 'signed', 'invoiced'])
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })

    if (recErr) {
      return safeApiError(recErr, request)
    }
    interface LeistungsnachweisRecord {
      id: string; date: string; start_time?: string; end_time?: string
      duration_minutes?: number; service_type?: string; budget_type?: string
      amount?: number; status?: string; client_signature?: string
      // Ausdruecklich getypt, nicht ueber die Index-Signatur: sonst waeren
      // beide `unknown`, der Typ erfuellte StornoFelder nicht und
      // ohneStornierte() faellt auf StornoFelder zurueck.
      proof_status?: string | null; billing_status?: string | null
      caregiver_initials?: string; client_id?: string; caregiver_id?: string
      caregiver?: { id: string; first_name: string; last_name: string; lifetime_registration_number?: string; ik_nummer?: string; qualification_level?: string } | null
      [key: string]: unknown
    }
    // Ein STORNIERTER Nachweis gehoert nicht auf den Leistungsnachweis.
    // 'STORNIERT' hat kein Gegenstueck im status-Werteset (siehe
    // lib/leistungsnachweis/status-sync.ts), der Widerruf bleibt deshalb
    // auf status='signed' stehen und kam ueber den .in('status', …)-Filter
    // ungehindert durch. Dieses PDF ist das Blatt, das die Pflegekasse zur
    // Anerkennung bekommt — eine widerrufene Leistung darauf ist eine
    // Forderung fuer etwas, das ausdruecklich zurueckgenommen wurde.
    const alleRows = (records || []).map(r => ({ ...r, caregiver: one(r.caregiver) })) as LeistungsnachweisRecord[]
    const rows = ohneStornierte(alleRows)
    const stornierteAnzahl = alleRows.length - rows.length
    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: stornierteAnzahl > 0
            ? `Keine erfassten Einsätze für ${periodLabel} — ${stornierteAnzahl} storniert.`
            : `Keine erfassten Einsätze für ${periodLabel}`,
        },
        { status: 404 }
      )
    }

    // ── Unterschriften aus BEIDEN Quellen zusammenführen ──
    //  1) service_signatures (Native App): Bild + Rolle + Zeitstempel
    //  2) service_records.client_signature / caregiver_initials (Admin-Pfad)
    const recordIds = rows.map(r => r.id)
    const { data: sigData } = await admin
      .from('service_signatures')
      .select('service_record_id, signer_role, signer_name, signature_image, signed_at')
      .in('service_record_id', recordIds)
      .order('signed_at', { ascending: false })

    interface ServiceSignature {
      service_record_id: string; signer_role: string; signer_name?: string
      signature_image?: string; signed_at?: string
    }
    const signatures = (sigData || []) as ServiceSignature[]
    // Neueste Unterschrift je Rolle für den Monats-Nachweis
    const clientSigImage = signatures.find(s => s.signer_role === 'client') || null
    const caregiverSigImage = signatures.find(s => s.signer_role === 'caregiver') || null
    // Fallback Admin-Pfad: Text-Signatur / Kürzel aus service_records
    const clientSigText = rows.map(r => r.client_signature).find(Boolean) || null
    const caregiverInitials = rows.map(r => r.caregiver_initials).find(Boolean) || null

    // ── Summen pro Budget-Topf ──
    const sums: Record<string, number> = {}
    let total = 0
    for (const r of rows) {
      const bt = r.budget_type || 'private'
      const amount = Number(r.amount) || 0
      sums[bt] = (sums[bt] || 0) + amount
      total += amount
    }

    // ── Beteiligte Betreuungskräfte (dedupliziert) ──
    const caregiverMap = new Map<string, any>()
    for (const r of rows) {
      const cg = r.caregiver
      if (cg?.id && !caregiverMap.has(cg.id)) caregiverMap.set(cg.id, cg)
    }
    const caregivers = Array.from(caregiverMap.values())

    // ═══════════════════ PDF aufbauen ═══════════════════
    const pdfDoc = await PDFDocument.create()
    pdfDoc.registerFontkit(fontkit)
    // DejaVuSans für türkische/deutsche Zeichen (ğ, ş, ç, İ, ö, ü, ä, ß)
    const fontsDir = join(process.cwd(), 'public', 'fonts')
    const regularBytes = await readFile(join(fontsDir, 'DejaVuSans.ttf'))
    const boldBytes = await readFile(join(fontsDir, 'DejaVuSans-Bold.ttf'))
    const fontRegular = await pdfDoc.embedFont(regularBytes)
    const fontBold = await pdfDoc.embedFont(boldBytes)

    // Darf dieser Nachweis wie ein einreichbarer Kassennachweis aussehen?
    // Massgeblich ist das Bundesland des Klienten (PLZ) und dessen
    // Freischaltung — nicht der Sitz der Organisation.
    const kassenfaehig = await modulAktivFuerPlz('elnw_enabled', client.zip_code)

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    let y = PAGE_HEIGHT - MARGIN

    function newPage() {
      drawFooter(page, fontRegular, kassenfaehig)
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }
    function ensureSpace(needed: number) {
      if (y - needed < MARGIN + 40) newPage()
    }

    // ── Kopf: 3-spaltig — Logo-Bereich links, Firma Mitte, Adresse rechts ──
    page.drawText('Alltagsengel', { x: MARGIN, y: y - 4, size: 18, font: fontBold, color: GOLD })
    page.drawText(COMPANY.name, { x: 218, y, size: 11, font: fontBold, color: COAL })
    page.drawText(txt('Alltagsbegleitung & Entlastung'), { x: 218, y: y - 13, size: 9, font: fontRegular, color: GREY })
    const rightX = PAGE_WIDTH - MARGIN - 150
    page.drawText(COMPANY.address, { x: rightX, y, size: 9, font: fontRegular, color: GREY })
    page.drawText(COMPANY.city, { x: rightX, y: y - 12, size: 9, font: fontRegular, color: GREY })
    page.drawText(COMPANY.email, { x: rightX, y: y - 24, size: 9, font: fontRegular, color: GREY })
    page.drawText(txt(`IK-Nummer: ${companyIk}`), { x: rightX, y: y - 36, size: 9, font: fontBold, color: COAL })
    y -= 52
    // Goldene Linie (Standard-Briefkopf)
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1.5, color: GOLD })
    y -= 28

    // ── Titel + Zeitraum ──
    page.drawText('Leistungsnachweis', { x: MARGIN, y, size: 17, font: fontBold, color: COAL })
    page.drawText(txt(`Leistungszeitraum: ${periodLabel}`), {
      x: PAGE_WIDTH - MARGIN - fontBold.widthOfTextAtSize(txt(`Leistungszeitraum: ${periodLabel}`), 11),
      y: y + 3, size: 11, font: fontBold, color: COAL,
    })
    y -= 28

    // ── Klienten-Daten ──
    const clientName = `${client.first_name || ''} ${client.last_name || ''}`.trim() || '—'
    const versNr = client.versichertennummer || client.insurance_number || '—'
    const kasse = client.pflegekasse_name || client.insurance_name || '—'
    const clientLines: [string, string][] = [
      ['Versicherte/r:', clientName],
      ['Geburtsdatum:', dateFmt(client.date_of_birth)],
      ['Anschrift:', txt(`${client.address || ''}${client.zip_code ? ', ' + client.zip_code : ''} ${client.city || ''}`.trim() || '—')],
      ['Versichertennummer:', versNr],
      ['Pflegekasse:', txt(`${kasse}${client.pflegekasse_ik ? ` (IK ${client.pflegekasse_ik})` : ''}`)],
      ['Pflegegrad:', client.care_level ? `Pflegegrad ${client.care_level}` : '—'],
    ]
    if (verordnung) {
      clientLines.push(['Genehmigungsnummer:', verordnung.genehmigung_aktenzeichen || '—'])
      if (verordnung.kostentraeger_name) {
        clientLines.push([
          'Kostenträger:',
          txt(`${verordnung.kostentraeger_name}${verordnung.kostentraeger_ik_nummer ? ` (IK ${verordnung.kostentraeger_ik_nummer})` : ''}`),
        ])
      }
      if (verordnung.genehmigung_bis) {
        clientLines.push(['Genehmigt bis:', dateFmt(verordnung.genehmigung_bis)])
      }
    }
    for (const [k, v] of clientLines) {
      page.drawText(txt(k), { x: MARGIN, y, size: 10, font: fontBold, color: GREY })
      page.drawText(txt(String(v)), { x: MARGIN + 130, y, size: 10, font: fontRegular, color: COAL })
      y -= 15
    }
    y -= 10

    // ── Leistungs-Tabelle ──
    const col = {
      date: MARGIN,             // Datum
      time: MARGIN + 62,        // Uhrzeit von–bis
      dur: MARGIN + 138,        // Dauer
      service: MARGIN + 185,    // Leistungsart
      budget: MARGIN + 300,     // Budget-Topf
      amount: PAGE_WIDTH - MARGIN - 55, // Betrag
    }

    function drawTableHeader() {
      page.drawText('Datum', { x: col.date, y, size: 8.5, font: fontBold, color: GREY })
      page.drawText('Uhrzeit', { x: col.time, y, size: 8.5, font: fontBold, color: GREY })
      page.drawText('Dauer', { x: col.dur, y, size: 8.5, font: fontBold, color: GREY })
      page.drawText('Leistungsart', { x: col.service, y, size: 8.5, font: fontBold, color: GREY })
      page.drawText('Budget-Topf', { x: col.budget, y, size: 8.5, font: fontBold, color: GREY })
      page.drawText('Betrag', { x: col.amount, y, size: 8.5, font: fontBold, color: GREY })
      y -= 11
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.75, color: GOLD })
      y -= 13
    }

    drawTableHeader()
    for (const r of rows) {
      if (y < MARGIN + 60) {
        newPage()
        drawTableHeader()
      }
      const uhrzeit = r.start_time && r.end_time
        ? `${timeFmt(r.start_time)}–${timeFmt(r.end_time)}`
        : '—'
      const dauer = r.duration_minutes ? `${r.duration_minutes} Min` : '—'
      const budgetLabel = BUDGET_TYPE_PDF[r.budget_type as string] || r.budget_type || '—'
      page.drawText(dateFmt(r.date), { x: col.date, y, size: 8.5, font: fontRegular, color: COAL })
      page.drawText(txt(uhrzeit), { x: col.time, y, size: 8.5, font: fontRegular, color: COAL })
      page.drawText(dauer, { x: col.dur, y, size: 8.5, font: fontRegular, color: COAL })
      page.drawText(txt((r.service_type || '—').slice(0, 24)), { x: col.service, y, size: 8.5, font: fontRegular, color: COAL })
      page.drawText(txt(budgetLabel).slice(0, 34), { x: col.budget, y, size: 8, font: fontRegular, color: COAL })
      const amountStr = euroFmt(r.amount)
      page.drawText(amountStr, {
        x: PAGE_WIDTH - MARGIN - fontRegular.widthOfTextAtSize(amountStr, 8.5),
        y, size: 8.5, font: fontRegular, color: COAL,
      })
      y -= 14
    }

    y -= 4
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: LIGHT })
    y -= 18

    // ── Summen pro Budget-Topf + Gesamtsumme ──
    ensureSpace(30 + Object.keys(sums).length * 15 + 40)
    page.drawText(txt('Summen nach Budget-Topf'), { x: MARGIN, y, size: 11, font: fontBold, color: COAL })
    y -= 17
    for (const [bt, sum] of Object.entries(sums)) {
      const label = BUDGET_TYPE_PDF[bt] || bt
      page.drawText(txt(label), { x: MARGIN + 10, y, size: 9.5, font: fontRegular, color: GREY })
      const s = euroFmt(sum)
      page.drawText(s, {
        x: PAGE_WIDTH - MARGIN - fontRegular.widthOfTextAtSize(s, 9.5),
        y, size: 9.5, font: fontRegular, color: COAL,
      })
      y -= 15
    }
    y -= 4
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.75, color: GOLD })
    y -= 16
    page.drawText('Gesamtsumme:', { x: MARGIN, y, size: 12, font: fontBold, color: COAL })
    const totalStr = euroFmt(total)
    page.drawText(totalStr, {
      x: PAGE_WIDTH - MARGIN - fontBold.widthOfTextAtSize(totalStr, 12),
      y, size: 12, font: fontBold, color: COAL,
    })
    y -= 30

    // ── Betreuungskraft-Daten ──
    ensureSpace(30 + caregivers.length * 15)
    page.drawText(txt('Leistungserbringende Betreuungskraft / -kräfte'), { x: MARGIN, y, size: 11, font: fontBold, color: COAL })
    y -= 17
    if (caregivers.length === 0) {
      page.drawText(txt('Keine Betreuungskraft zugeordnet.'), { x: MARGIN + 10, y, size: 9.5, font: fontRegular, color: GREY })
      y -= 15
    }
    for (const cg of caregivers) {
      const name = `${cg.first_name || ''} ${cg.last_name || ''}`.trim() || '—'
      const qual = QUALIFICATION_LEVEL[cg.qualification_level as string]?.label || cg.qualification_level || '—'
      const lln = cg.lifetime_registration_number
        ? `Lebenslange Nr.: ${cg.lifetime_registration_number}`
        : 'Lebenslange Nr.: —'
      page.drawText(txt(`${name}  ·  ${lln}  ·  Qualifikation: ${qual}`), {
        x: MARGIN + 10, y, size: 9.5, font: fontRegular, color: COAL,
      })
      y -= 15
    }
    y -= 20

    // ── Unterschriften (beide Quellen zusammengeführt) ──
    ensureSpace(150)
    page.drawText('Unterschriften', { x: MARGIN, y, size: 11, font: fontBold, color: COAL })
    y -= 14
    page.drawText(txt('Hiermit wird die ordnungsgemäße Erbringung der oben aufgeführten Leistungen bestätigt.'), {
      x: MARGIN, y, size: 8.5, font: fontRegular, color: GREY,
    })
    y -= 12

    const sigBoxW = (PAGE_WIDTH - 2 * MARGIN - 30) / 2
    const sigBoxH = 70
    const sigTop = y
    const leftBoxX = MARGIN
    const rightBoxX = MARGIN + sigBoxW + 30

    // Betreuungskraft (links)
    await drawSignatureBox(pdfDoc, page, fontRegular, fontBold, {
      x: leftBoxX, top: sigTop, width: sigBoxW, height: sigBoxH,
      title: 'Unterschrift Betreuungskraft',
      image: caregiverSigImage?.signature_image || null,
      fallbackText: caregiverSigImage
        ? null
        : (caregiverInitials ? `gez. ${caregiverInitials}` : null),
      meta: caregiverSigImage
        ? txt(`${caregiverSigImage.signer_name} — ${dateFmt(caregiverSigImage.signed_at)}`)
        : (caregiverInitials ? txt('Kürzel aus Einsatzdokumentation') : null),
    })

    // Klient / Angehörige (rechts)
    await drawSignatureBox(pdfDoc, page, fontRegular, fontBold, {
      x: rightBoxX, top: sigTop, width: sigBoxW, height: sigBoxH,
      title: txt('Unterschrift Klient/in bzw. Angehörige/r'),
      image: clientSigImage?.signature_image
        || (clientSigText && String(clientSigText).startsWith('data:') ? clientSigText : null),
      fallbackText: clientSigImage || (clientSigText && String(clientSigText).startsWith('data:'))
        ? null
        : (clientSigText ? `gez. ${String(clientSigText).slice(0, 40)}` : null),
      meta: clientSigImage
        ? txt(`${clientSigImage.signer_name} — ${dateFmt(clientSigImage.signed_at)}`)
        : (clientSigText ? txt('Erfasst über Verwaltung') : null),
    })

    y = sigTop - sigBoxH - 34

    drawFooter(page, fontRegular, kassenfaehig)

    const pdfBytes = await pdfDoc.save()
    const fileName = `Leistungsnachweis_${(client.last_name || 'Klient').replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '_')}_${month}.pdf`

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})

// ── Unterschrift-Box: Bild einbetten ODER Text-Fallback ODER leer ──
async function drawSignatureBox(
  pdfDoc: PDFDocument,
  page: PDFPage,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  opts: {
    x: number
    top: number
    width: number
    height: number
    title: string
    image: string | null
    fallbackText: string | null
    meta: string | null
  }
) {
  const { x, top, width, height, title, image, fallbackText, meta } = opts
  const bottom = top - height

  let drewImage = false
  if (image) {
    try {
      const bytes = await loadSignatureImageBytes(image)
      if (bytes) {
        const embedded = await embedImageBytes(pdfDoc, bytes)
        if (embedded) {
          const scale = Math.min((width - 10) / embedded.width, (height - 10) / embedded.height, 1)
          const w = embedded.width * scale
          const h = embedded.height * scale
          page.drawImage(embedded.image, { x: x + 5, y: bottom + 8, width: w, height: h })
          drewImage = true
        }
      }
    } catch (e) {
      log.errorWithException('Signatur-Einbettung fehlgeschlagen', e)
    }
  }
  if (!drewImage && fallbackText) {
    page.drawText(fallbackText.replace(/ /g, ' '), {
      x: x + 5, y: bottom + 24, size: 12, font: fontRegular, color: rgb(0.2, 0.2, 0.35),
    })
  }

  // Unterschriftslinie + Beschriftung
  page.drawLine({ start: { x, y: bottom + 4 }, end: { x: x + width, y: bottom + 4 }, thickness: 0.75, color: rgb(0.3, 0.3, 0.3) })
  page.drawText(title, { x, y: bottom - 10, size: 8.5, font: fontBold, color: rgb(0.3, 0.3, 0.3) })
  if (meta) {
    page.drawText(meta, { x, y: bottom - 21, size: 7.5, font: fontRegular, color: rgb(0.5, 0.5, 0.5) })
  } else if (!drewImage && !fallbackText) {
    page.drawText('Unterschrift liegt nicht digital vor', {
      x, y: bottom - 21, size: 7.5, font: fontRegular, color: rgb(0.7, 0.3, 0.3),
    })
  }
}

function drawFooter(page: PDFPage, font: PDFFont, kassenfaehig: boolean) {
  // Ist die Kassenabrechnung im Bundesland des Klienten noch nicht
  // freigeschaltet, darf das PDF NICHT wie ein einreichbarer Kassennachweis
  // aussehen. Der Nachweis bleibt vollstaendig erhalten — er wird nur als
  // das gekennzeichnet, was er dann ist: eine Leistungsdokumentation.
  const lines = kassenfaehig
    ? [
      'Dieser Leistungsnachweis dient der Abrechnung von Betreuungs- und Entlastungsleistungen nach dem SGB XI',
      '(insb. §45a/§45b Entlastungsbetrag und §39 Verhinderungspflege). Die aufgeführten Leistungen wurden wie',
      `dokumentiert erbracht. ${COMPANY.name} · ${COMPANY.address}, ${COMPANY.city} · ${COMPANY.email}`,
    ]
    : [
      'LEISTUNGSDOKUMENTATION — NICHT ZUR EINREICHUNG BEI DER PFLEGEKASSE.',
      'Die Anerkennung nach §45a SGB XI liegt für das Bundesland des Klienten derzeit nicht vor; eine Abrechnung',
      'über die Pflegekasse ist damit nicht möglich. Die Leistungen wurden wie dokumentiert erbracht.',
      `${COMPANY.name} · ${COMPANY.address}, ${COMPANY.city} · ${COMPANY.email}`,
    ]
  let fy = kassenfaehig ? 52 : 61
  for (const [i, line] of lines.entries()) {
    const warnzeile = !kassenfaehig && i === 0
    page.drawText(line, {
      x: MARGIN, y: fy, size: warnzeile ? 8 : 7, font,
      color: warnzeile ? rgb(0.75, 0.25, 0.2) : rgb(0.55, 0.55, 0.55),
    })
    fy -= 9
  }
}

// Bild-Bytes aus signature_image — Herkunfts-, Zeit- und Groessengrenze
// liegen in lib/signaturen/unterschrift-bild.ts. `signature_image` kommt aus
// der Native-App bzw. dem OCR-Weg: ein ungepruefter fetch darauf war ein
// serverseitiger Abruf einer frei waehlbaren Adresse.
async function loadSignatureImageBytes(signatureImage: string): Promise<Uint8Array | null> {
  return ladeUnterschriftsBild(signatureImage)
}

// Bettet PNG oder JPG ein (best effort)
async function embedImageBytes(pdfDoc: PDFDocument, bytes: Uint8Array): Promise<{ image: any; width: number; height: number } | null> {
  try {
    const png = await pdfDoc.embedPng(bytes)
    return { image: png, width: png.width, height: png.height }
  } catch {
    try {
      const jpg = await pdfDoc.embedJpg(bytes)
      return { image: jpg, width: jpg.width, height: jpg.height }
    } catch (e) {
      log.errorWithException('Bild weder PNG noch JPG', e)
      return null
    }
  }
}
