// ═══════════════════════════════════════════════════════════════
// E-Mail-Vorlage: Rechnungsversand an den Kunden
// ═══════════════════════════════════════════════════════════════
//
// ABSENDER/UNTERSCHRIFT: immer „Alltagsengel" bzw. „Ihr Team von
// Alltagsengel" — nie ein persoenlicher Name (Namens-Policy;
// persoenliche Namen stehen ausschliesslich in Impressum und
// Datenschutzerklaerung).
//
// KEINE GESUNDHEITSDATEN IM MAILTEXT: Der Mailkoerper nennt nur
// Vertrags- und Zahlungsdaten (Rechnungsnummer, Zeitraum, Betrag,
// Faelligkeit, Bankverbindung). Die Leistungspositionen und
// Unterschriften stehen ausschliesslich im PDF-Anhang.
//
// Die Funktion ist bewusst rein (keine DB, kein Netz) — damit ist sie
// ohne Supabase-Stub testbar.
// ═══════════════════════════════════════════════════════════════

/** HTML-Escaping fuer alles, was aus Stammdaten stammt (Namen, Bank, Nummern). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface RechnungEmailDaten {
  /** Anrede-Nachname, z. B. „Müller" (ohne Herr/Frau) */
  empfaengerName: string
  /** „Rechnung", „Korrekturrechnung", „Gutschrift", … */
  belegart: string
  rechnungsnummer: string
  /** ISO-Datum (YYYY-MM-DD) oder null */
  zeitraumVon: string | null
  zeitraumBis: string | null
  /** Gesamtbetrag in Euro */
  betragEuro: number
  /** Faelligkeit als ISO-Datum oder null */
  faelligAm: string | null
  /** true, wenn der Beleg vom Kunden zu zahlen ist (Rechnung/Korrektur) */
  zahlbar: boolean
  organisationsName: string
  iban?: string | null
  bic?: string | null
  bank?: string | null
}

export interface RechnungEmail {
  subject: string
  html: string
  text: string
  /** Dateiname des PDF-Anhangs */
  dateiname: string
}

function datumDe(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00+01:00` : iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function euro(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function ibanAnzeige(iban: string): string {
  return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim()
}

/** Erzeugt einen dateisystemtauglichen Namen fuer den PDF-Anhang. */
export function anhangDateiname(belegart: string, rechnungsnummer: string): string {
  const sicher = `${belegart}_${rechnungsnummer}`
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return `${sicher || 'Rechnung'}.pdf`
}

export function baueRechnungEmail(d: RechnungEmailDaten): RechnungEmail {
  const subject = `${d.belegart} ${d.rechnungsnummer} von Alltagsengel`
  const anrede = d.empfaengerName.trim()
    ? `Guten Tag ${d.empfaengerName.trim()},`
    : 'Guten Tag,'

  const zeitraum = d.zeitraumVon || d.zeitraumBis
    ? `${datumDe(d.zeitraumVon)} – ${datumDe(d.zeitraumBis)}`
    : '—'

  const zeilen: [string, string][] = [
    [`${d.belegart}snummer`, d.rechnungsnummer],
    ['Leistungszeitraum', zeitraum],
    ['Betrag', euro(d.betragEuro)],
  ]
  if (d.zahlbar && d.faelligAm) zeilen.push(['Zahlbar bis', datumDe(d.faelligAm)])

  const bankZeilen: [string, string][] = []
  if (d.zahlbar) {
    if (d.iban) bankZeilen.push(['IBAN', ibanAnzeige(d.iban)])
    if (d.bic) bankZeilen.push(['BIC', d.bic])
    if (d.bank) bankZeilen.push(['Bank', d.bank])
    bankZeilen.push(['Verwendungszweck', d.rechnungsnummer])
  }

  const einleitung = d.zahlbar
    ? `im Anhang finden Sie unsere ${esc(d.belegart)} für die von uns erbrachten Leistungen. Die Einzelpositionen und die dazugehörigen Leistungsnachweise sind im PDF aufgeführt.`
    : `im Anhang finden Sie den Beleg „${esc(d.belegart)}" zu Ihrer Rechnung. Eine Zahlung ist dafür nicht erforderlich.`

  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F5F2EC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1612;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:22px;font-weight:700;color:#1A1612;">Alltags<span style="color:#C9963C;">Engel</span></span>
    </div>
    <div style="background:#fff;border-radius:16px;padding:32px 28px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <p style="margin:0 0 14px;font-size:15px;">${esc(anrede)}</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.6;">${einleitung}</p>

      <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">
        ${zeilen.map(([k, v]) => `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;width:44%;font-size:13px;">${esc(k)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;font-size:13px;">${esc(v)}</td>
        </tr>`).join('')}
      </table>

      ${bankZeilen.length ? `<div style="background:#F0EBE0;border-radius:10px;padding:14px 18px;margin:0 0 18px;font-size:13px;line-height:1.7;">
        <strong style="display:block;margin-bottom:6px;">Bankverbindung</strong>
        ${bankZeilen.map(([k, v]) => `${esc(k)}: ${esc(v)}<br/>`).join('')}
        Empfänger: ${esc(d.organisationsName)}
      </div>` : ''}

      <p style="margin:0 0 6px;font-size:13px;color:#666;line-height:1.6;">
        Bei Rückfragen zu dieser ${esc(d.belegart)} antworten Sie einfach auf diese E-Mail
        oder nennen Sie uns die ${esc(d.belegart)}snummer.
      </p>

      <p style="margin:22px 0 0;font-size:14px;">Herzliche Grüße<br/><strong>Ihr Team von Alltagsengel</strong></p>
    </div>
    <div style="text-align:center;margin-top:24px;font-size:11px;color:#aaa;line-height:1.6;">
      <p style="margin:0 0 4px;">${esc(d.organisationsName)}</p>
      <p style="margin:0;">Diese E-Mail wurde automatisch erzeugt. Der Beleg befindet sich im PDF-Anhang.</p>
    </div>
  </div>
</body>
</html>`

  const text = [
    anrede,
    '',
    d.zahlbar
      ? `im Anhang finden Sie unsere ${d.belegart} für die von uns erbrachten Leistungen.`
      : `im Anhang finden Sie den Beleg „${d.belegart}" zu Ihrer Rechnung. Eine Zahlung ist dafür nicht erforderlich.`,
    '',
    ...zeilen.map(([k, v]) => `${k}: ${v}`),
    ...(bankZeilen.length
      ? ['', 'Bankverbindung:', ...bankZeilen.map(([k, v]) => `${k}: ${v}`), `Empfänger: ${d.organisationsName}`]
      : []),
    '',
    'Herzliche Grüße',
    'Ihr Team von Alltagsengel',
    '',
    d.organisationsName,
  ].join('\n')

  return {
    subject,
    html,
    text,
    dateiname: anhangDateiname(d.belegart, d.rechnungsnummer),
  }
}
