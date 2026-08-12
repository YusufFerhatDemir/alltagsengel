import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// POST /api/admin/invoices/[id]/generate-pdf
// ═══════════════════════════════════════════════════════════════
// Baut ein mehrseitiges Belegpaket für eine Rechnung:
//   Seite 1: Belegübersicht (Belegnr., Klient, Zeitraum, Summe,
//            Liste der invoice_items) — bei Bedarf mehrseitig
//   je Seite: ein zugrunde liegender service_record mit Details +
//            eingebetteten Unterschrift-Bildern (service_signatures)
//
// Belegart richtet sich nach invoices.correction_type:
//   null → Rechnung · gutschrift → Gutschrift ·
//   storno/teilstorno → Stornorechnung · korrektur → Korrekturrechnung
// Korrekturbelege tragen zusätzlich den Bezug zur Originalrechnung und
// den protokollierten Korrekturgrund aus invoice_corrections.
//
// Lädt das PDF in den Storage-Bucket `service-proofs` hoch unter
// `invoice-packages/{invoiceId}.pdf` und schreibt/aktualisiert die
// invoice_packages-Zeile (Checksumme via sha256).
// ═══════════════════════════════════════════════════════════════

const PAGE_WIDTH = 595.28 // A4 @ 72dpi
const PAGE_HEIGHT = 841.89
const MARGIN = 50

// Belegarten: Titel + Hinweis, der auf dem Beleg stehen muss.
const DOCUMENT_KINDS: Record<string, { title: string; note: string | null; payable: boolean }> = {
  rechnung: { title: 'Rechnung', note: null, payable: true },
  gutschrift: {
    title: 'Gutschrift',
    note: 'Gutschrift zur unten genannten Rechnung — der Betrag wird angerechnet bzw. erstattet.',
    payable: false,
  },
  storno: {
    title: 'Stornorechnung',
    note: 'Diese Stornorechnung hebt die unten genannte Rechnung vollständig auf.',
    payable: false,
  },
  teilstorno: {
    title: 'Teilstorno',
    note: 'Dieser Beleg hebt die unten genannte Rechnung teilweise auf.',
    payable: false,
  },
  korrektur: {
    title: 'Korrekturrechnung',
    note: 'Diese Korrekturrechnung ersetzt die unten genannte Rechnung.',
    payable: true,
  },
}

function euroFmt(n: number | null | undefined): string {
  const v = typeof n === 'number' ? n : 0
  return v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function dateFmt(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { userId, organizationId: orgId } = auth.ctx

  try {
    const { id: invoiceId } = await params
    const supabase = await createClient()
    const admin = createAdminClient()

    // ── Rechnung + Klient + Positionen laden — org-fenced ──
    const { data: invoice, error: invErr } = await admin
      .from('invoices')
      .select('id, invoice_number, invoice_number_formatted, client_id, period_start, period_end, total_amount, budget_amount, private_amount, status, correction_of, correction_type, client:clients(first_name, last_name, address, city, zip_code, insurance_name, insurance_number)')
      .eq('id', invoiceId)
      .eq('organization_id', orgId)
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden' }, { status: 404 })
    }

    const invoiceNumber = invoice.invoice_number_formatted || invoice.invoice_number || '—'
    const kind = DOCUMENT_KINDS[invoice.correction_type || 'rechnung'] || DOCUMENT_KINDS.rechnung

    // ── Bezug + Korrekturgrund bei Korrekturbelegen ──
    let originalNumber: string | null = null
    let correctionReason: string | null = null

    if (invoice.correction_of) {
      const { data: originalInvoice } = await admin
        .from('invoices')
        .select('invoice_number, invoice_number_formatted')
        .eq('id', invoice.correction_of)
        .eq('organization_id', orgId)
        .maybeSingle()
      originalNumber = originalInvoice?.invoice_number_formatted || originalInvoice?.invoice_number || null

      const { data: correction } = await admin
        .from('invoice_corrections')
        .select('reason')
        .eq('correction_invoice_id', invoiceId)
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .maybeSingle()
      correctionReason = correction?.reason || null
    }

    const { data: items, error: itemsErr } = await supabase
      .from('invoice_items')
      .select('id, service_record_id, description, date, duration_minutes, amount, budget_type')
      .eq('invoice_id', invoiceId)
      .order('date', { ascending: true })

    if (itemsErr) {
      return NextResponse.json({ error: `Positionen-Fehler: ${itemsErr.message}` }, { status: 500 })
    }

    const invoiceItems = items || []

    // ── Zugrunde liegende service_records + Unterschriften laden ──
    const recordIds = invoiceItems.map(i => i.service_record_id).filter(Boolean) as string[]
    let records: any[] = []
    let signaturesByRecord: Record<string, any[]> = {}

    if (recordIds.length > 0) {
      const { data: recData } = await supabase
        .from('service_records')
        .select('id, date, start_time, end_time, duration_minutes, service_type, budget_type, amount, status, caregiver:caregivers(first_name, last_name)')
        .in('id', recordIds)
      records = recData || []

      const { data: sigData } = await supabase
        .from('service_signatures')
        .select('id, service_record_id, signer_role, signer_name, signature_image, signed_at')
        .in('service_record_id', recordIds)

      signaturesByRecord = (sigData || []).reduce((acc: Record<string, any[]>, s: any) => {
        if (!acc[s.service_record_id]) acc[s.service_record_id] = []
        acc[s.service_record_id].push(s)
        return acc
      }, {})
    }

    // ── PDF aufbauen (DejaVuSans für türkische/deutsche Zeichen) ──
    const pdfDoc = await PDFDocument.create()
    pdfDoc.registerFontkit(fontkit)

    let fontRegular: any
    let fontBold: any
    try {
      const fontsDir = join(process.cwd(), 'public', 'fonts')
      const regularBytes = await readFile(join(fontsDir, 'DejaVuSans.ttf'))
      const boldBytes = await readFile(join(fontsDir, 'DejaVuSans-Bold.ttf'))
      fontRegular = await pdfDoc.embedFont(regularBytes, { subset: true })
      fontBold = await pdfDoc.embedFont(boldBytes, { subset: true })
    } catch {
      const { StandardFonts } = await import('pdf-lib')
      fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
      fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    }

    const client = (invoice as any).client || {}
    const clientName = `${client.first_name || ''} ${client.last_name || ''}`.trim() || '—'

    // ── Seite 1 ff.: Belegübersicht ──
    {
      let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      let y = PAGE_HEIGHT - MARGIN
      const colX = { date: MARGIN, desc: MARGIN + 70, dur: MARGIN + 300, budget: MARGIN + 350, amount: PAGE_WIDTH - MARGIN - 70 }

      // Kopfzeilen der Positionstabelle — werden auf jeder Folgeseite
      // wiederholt, damit die Spalten auch dort lesbar bleiben.
      const drawTableHeader = () => {
        page.drawText('Datum', { x: colX.date, y, size: 9, font: fontBold, color: rgb(0.4, 0.4, 0.4) })
        page.drawText('Leistung', { x: colX.desc, y, size: 9, font: fontBold, color: rgb(0.4, 0.4, 0.4) })
        page.drawText('Dauer', { x: colX.dur, y, size: 9, font: fontBold, color: rgb(0.4, 0.4, 0.4) })
        page.drawText('Budget', { x: colX.budget, y, size: 9, font: fontBold, color: rgb(0.4, 0.4, 0.4) })
        page.drawText('Betrag', { x: colX.amount, y, size: 9, font: fontBold, color: rgb(0.4, 0.4, 0.4) })
        y -= 14
        page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) })
        y -= 14
      }

      // Bricht auf eine neue Seite um, sobald der Platz knapp wird.
      // Vorher wurde y einfach auf den Seitenanfang zurueckgesetzt — die
      // restlichen Positionen wurden dadurch UEBER den Kopfbereich derselben
      // Seite gezeichnet und waren unlesbar.
      const ensureSpace = (needed: number, repeatHeader = false) => {
        if (y - needed >= MARGIN + 40) return
        drawFooter(page, fontRegular, kind.payable)
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        y = PAGE_HEIGHT - MARGIN
        page.drawText(`${kind.title} ${invoiceNumber} (Fortsetzung)`, {
          x: MARGIN, y, size: 11, font: fontBold, color: rgb(0.35, 0.35, 0.35),
        })
        y -= 24
        if (repeatHeader) drawTableHeader()
      }

      page.drawText('Alltagsengel', { x: MARGIN, y, size: 20, font: fontBold, color: rgb(0.15, 0.11, 0.07) })
      y -= 30
      page.drawText(kind.title, { x: MARGIN, y, size: 15, font: fontBold, color: rgb(0.3, 0.3, 0.3) })
      y -= 26

      if (kind.note) {
        page.drawText(kind.note, { x: MARGIN, y, size: 9, font: fontRegular, color: rgb(0.45, 0.35, 0.2) })
        y -= 18
      }
      y -= 8

      const infoLines: [string, string][] = [
        [`${kind.title}snummer:`, invoiceNumber],
        ['Klient:', clientName],
        ['Adresse:', `${client.address || ''}${client.zip_code ? ', ' + client.zip_code : ''} ${client.city || ''}`.trim() || '—'],
        ['Pflegekasse:', client.insurance_name || '—'],
        ['Versicherungsnr.:', client.insurance_number || '—'],
        ['Zeitraum:', `${dateFmt(invoice.period_start)} – ${dateFmt(invoice.period_end)}`],
      ]
      if (originalNumber) infoLines.push(['Bezug Rechnung:', originalNumber])
      if (correctionReason) infoLines.push(['Grund:', correctionReason.slice(0, 60)])

      for (const [k, v] of infoLines) {
        page.drawText(k, { x: MARGIN, y, size: 11, font: fontBold, color: rgb(0.35, 0.35, 0.35) })
        page.drawText(String(v), { x: MARGIN + 150, y, size: 11, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
        y -= 18
      }

      y -= 12
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) })
      y -= 20

      page.drawText('Leistungspositionen', { x: MARGIN, y, size: 12, font: fontBold, color: rgb(0.15, 0.11, 0.07) })
      y -= 20

      drawTableHeader()

      if (invoiceItems.length === 0) {
        // Gutschriften und Stornobelege haben keine eigenen Positionen —
        // sie beziehen sich als Ganzes auf die Originalrechnung.
        page.drawText(
          originalNumber
            ? `${kind.title} zur Rechnung ${originalNumber}`
            : 'Keine Einzelpositionen',
          { x: colX.date, y, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) }
        )
        page.drawText(euroFmt(invoice.total_amount), { x: colX.amount, y, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
        y -= 16
      }

      for (const item of invoiceItems) {
        ensureSpace(16, true)
        page.drawText(dateFmt(item.date), { x: colX.date, y, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
        page.drawText((item.description || '—').slice(0, 34), { x: colX.desc, y, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
        page.drawText(item.duration_minutes ? `${item.duration_minutes} Min` : '—', { x: colX.dur, y, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
        page.drawText(item.budget_type || '—', { x: colX.budget, y, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
        page.drawText(euroFmt(item.amount), { x: colX.amount, y, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
        y -= 16
      }

      // Summenblock braucht zusammenhaengend Platz — sonst reisst er ab.
      ensureSpace(80)
      y -= 10
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) })
      y -= 22

      page.drawText('Gesamtsumme:', { x: MARGIN, y, size: 12, font: fontBold, color: rgb(0.15, 0.11, 0.07) })
      page.drawText(euroFmt(invoice.total_amount), { x: colX.amount, y, size: 12, font: fontBold, color: rgb(0.15, 0.11, 0.07) })
      y -= 18
      page.drawText(`davon Budget (§45b etc.): ${euroFmt(invoice.budget_amount)}`, { x: MARGIN, y, size: 10, font: fontRegular, color: rgb(0.35, 0.35, 0.35) })
      y -= 14
      page.drawText(`davon Privat: ${euroFmt(invoice.private_amount)}`, { x: MARGIN, y, size: 10, font: fontRegular, color: rgb(0.35, 0.35, 0.35) })

      drawFooter(page, fontRegular, kind.payable)
    }

    // ── Je service_record eine Detailseite mit Unterschriften ──
    for (const item of invoiceItems) {
      const record = records.find(r => r.id === item.service_record_id)
      if (!record) continue

      const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      let y = PAGE_HEIGHT - MARGIN

      page.drawText('Leistungsnachweis', { x: MARGIN, y, size: 16, font: fontBold, color: rgb(0.15, 0.11, 0.07) })
      y -= 28

      const caregiverName = `${record.caregiver?.first_name || ''} ${record.caregiver?.last_name || ''}`.trim() || '—'
      const detailLines = [
        ['Datum:', dateFmt(record.date)],
        ['Klient:', clientName],
        ['Betreuungskraft:', caregiverName],
        ['Leistung:', record.service_type || '—'],
        ['Zeit:', record.start_time && record.end_time ? `${String(record.start_time).slice(0, 5)} – ${String(record.end_time).slice(0, 5)}` : '—'],
        ['Dauer:', record.duration_minutes ? `${record.duration_minutes} Min` : '—'],
        ['Budget:', record.budget_type || '—'],
        ['Betrag:', euroFmt(record.amount)],
        ['Status:', record.status || '—'],
      ]
      for (const [k, v] of detailLines) {
        page.drawText(k, { x: MARGIN, y, size: 11, font: fontBold, color: rgb(0.35, 0.35, 0.35) })
        page.drawText(String(v), { x: MARGIN + 150, y, size: 11, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
        y -= 18
      }

      y -= 12
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) })
      y -= 24

      page.drawText('Unterschriften', { x: MARGIN, y, size: 12, font: fontBold, color: rgb(0.15, 0.11, 0.07) })
      y -= 18

      const signatures = signaturesByRecord[record.id] || []
      if (signatures.length === 0) {
        page.drawText('Keine digitale Unterschrift vorhanden.', { x: MARGIN, y, size: 10, font: fontRegular, color: rgb(0.6, 0.2, 0.2) })
        y -= 16
      } else {
        for (const sig of signatures) {
          try {
            const imgBytes = await loadSignatureImageBytes(sig.signature_image)
            if (imgBytes) {
              const embedded = await embedImageBytes(pdfDoc, imgBytes)
              if (embedded) {
                const maxW = 200
                const maxH = 80
                const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1)
                const w = embedded.width * scale
                const h = embedded.height * scale
                if (y - h < MARGIN + 30) y = PAGE_HEIGHT - MARGIN - 40
                page.drawImage(embedded.image, { x: MARGIN, y: y - h, width: w, height: h })
                y -= h + 6
              }
            }
          } catch (imgErr) {
            console.error('[generate-pdf] Signatur-Einbettung fehlgeschlagen:', imgErr)
          }
          const roleLabel = sig.signer_role === 'client' ? 'Klient' : 'Betreuungskraft'
          page.drawText(`${roleLabel}: ${sig.signer_name} — ${dateFmt(sig.signed_at)}`, {
            x: MARGIN, y, size: 9, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
          })
          y -= 20
        }
      }

      drawFooter(page, fontRegular, kind.payable)
    }

    const pdfBytes = await pdfDoc.save()
    const pageCount = pdfDoc.getPageCount()
    const checksum = crypto.createHash('sha256').update(pdfBytes).digest('hex')

    // ── Upload in Storage (service-proofs, service_role — RLS-frei) ──
    const adminClient = createAdminClient()
    const storagePath = `invoice-packages/${invoiceId}.pdf`

    const { error: uploadErr } = await adminClient.storage
      .from('service-proofs')
      .upload(storagePath, Buffer.from(pdfBytes), {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadErr) {
      return NextResponse.json({ error: `Upload-Fehler: ${uploadErr.message}` }, { status: 500 })
    }

    const { data: signedUrlData, error: signErr } = await adminClient.storage
      .from('service-proofs')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 30) // 30 Tage

    if (signErr || !signedUrlData?.signedUrl) {
      return NextResponse.json({ error: `Signierte URL fehlgeschlagen: ${signErr?.message}` }, { status: 500 })
    }

    const pdfUrl = signedUrlData.signedUrl

    // ── invoice_packages upsert ──
    const { error: pkgErr } = await supabase
      .from('invoice_packages')
      .upsert({
        invoice_id: invoiceId,
        pdf_url: pdfUrl,
        page_count: pageCount,
        generated_by: userId,
        generated_at: new Date().toISOString(),
        checksum,
      }, { onConflict: 'invoice_id' })

    if (pkgErr) {
      return NextResponse.json({ error: `invoice_packages-Fehler: ${pkgErr.message}` }, { status: 500 })
    }

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      organizationId: orgId,
      entityType: 'invoice_package',
      entityId: invoiceId,
      details: {
        invoice_number: invoiceNumber,
        document_kind: kind.title,
        page_count: pageCount,
        checksum,
      },
      request: req,
    })

    return NextResponse.json({ pdf_url: pdfUrl, page_count: pageCount, checksum })
  } catch (err: any) {
    console.error('[api/admin/invoices/generate-pdf] Unerwarteter Fehler:', err)
    return NextResponse.json({ error: err.message || 'Unerwarteter Fehler' }, { status: 500 })
  }
}

function drawFooter(page: any, font: any, payable = true) {
  page.drawText('Alltagsengel UG (haftungsbeschr.) · Amtsgericht Frankfurt am Main, HRB 140351', {
    x: MARGIN, y: 38, size: 7, font, color: rgb(0.55, 0.55, 0.55),
  })
  // Zahlungsaufforderung nur auf zahlbaren Belegen — auf einer Gutschrift oder
  // einem Storno waere sie schlicht falsch.
  page.drawText(
    payable
      ? 'Bankverbindung: Alltagsengel UG · Sparkasse · Zahlbar innerhalb von 30 Tagen'
      : 'Alltagsengel UG · Sparkasse · Dieser Beleg ist keine Zahlungsaufforderung',
    { x: MARGIN, y: 28, size: 7, font, color: rgb(0.55, 0.55, 0.55) }
  )
}

// Lädt Bild-Bytes aus signature_image: entweder Data-URL (base64) oder externe URL
async function loadSignatureImageBytes(signatureImage: string): Promise<Uint8Array | null> {
  if (!signatureImage) return null
  if (signatureImage.startsWith('data:')) {
    const base64 = signatureImage.split(',')[1]
    if (!base64) return null
    return new Uint8Array(Buffer.from(base64, 'base64'))
  }
  if (signatureImage.startsWith('http')) {
    const res = await fetch(signatureImage)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  }
  return null
}

// Bettet PNG oder JPG ein (best effort — versucht zuerst PNG, dann JPG)
async function embedImageBytes(pdfDoc: PDFDocument, bytes: Uint8Array): Promise<{ image: any; width: number; height: number } | null> {
  try {
    const png = await pdfDoc.embedPng(bytes)
    return { image: png, width: png.width, height: png.height }
  } catch {
    try {
      const jpg = await pdfDoc.embedJpg(bytes)
      return { image: jpg, width: jpg.width, height: jpg.height }
    } catch (e) {
      console.error('[generate-pdf] Bild konnte weder als PNG noch JPG eingebettet werden:', e)
      return null
    }
  }
}
