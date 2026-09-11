/**
 * Drip-Kampagne — Mailtexte (Tag 3 / 7 / 14).
 *
 * Aus app/api/drip/route.ts herausgelöst, damit die Texte testbar sind:
 * eine route.ts darf ausser den HTTP-Handlern nichts exportieren, sonst
 * scheitert der Vercel-Build.
 *
 * Regeln (CLAUDE.md, Kundenkommunikation): Anrede über kundenAnrede(),
 * Gruß „Herzliche Grüße — Ihr Team von Alltagsengel“, kein persönlicher
 * Name. Keine konkreten Stundenpreise (Preisentscheidung steht aus), keine
 * Kassenabrechnungs-Zusage (§45a im Anerkennungsverfahren).
 */
import { KUNDEN_GRUSS_HTML } from '@/lib/kommunikation/anrede'

export function wrapEmail(content: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F2EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:24px">
  <div style="text-align:center;padding:20px 0">
    <img src="https://alltagsengel.care/icon-192x192.png" width="60" height="60" alt="Alltagsengel" style="border-radius:12px">
  </div>
  <div style="background:white;border-radius:16px;padding:32px 28px;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
    ${content}
  </div>
  <div style="text-align:center;padding:20px 0;font-size:12px;color:#999">
    Alltagsengel · Neue Mainzer Straße 66-68 · 60311 Frankfurt am Main<br>
    <a href="https://alltagsengel.care/datenschutz" style="color:#C9963C">Datenschutz</a>
  </div>
</div>
</body></html>`
}

// ═══ E-Mail Templates ═══
export const DRIP_VORLAGEN = {
  day3: {
    subject: '131 € im Monat — nutzen Sie schon Ihren Entlastungsbetrag?',
    html: (anrede: string) => wrapEmail(`
      <h2 style="color:#1A1612;font-size:22px;margin:0 0 16px">${anrede}</h2>
      <p style="color:#444;line-height:1.6;font-size:15px">
        wussten Sie, dass Ihnen mit einem Pflegegrad <strong>131 € pro Monat</strong> für Alltagshilfe zustehen?
        Das ist der sogenannte <strong>Entlastungsbetrag nach §45b SGB XI</strong> — und viele Menschen nutzen ihn nicht.
      </p>
      <p style="color:#444;line-height:1.6;font-size:15px">
        Der Betrag ist für Unterstützung im Alltag gedacht — zum Beispiel Einkaufsbegleitung,
        Arztbesuche, Gesellschaft oder Haushaltshilfe. Ob er für ein konkretes Angebot eingesetzt werden kann, setzt die Anerkennung des Anbieters nach §45a SGB XI voraus — Alltagsengel befindet sich derzeit im Anerkennungsverfahren.
        Zu Ihren Finanzierungswegen beraten wir Sie gern kostenlos.
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="https://alltagsengel.care/kunde/home" style="display:inline-block;background:#C9963C;color:#1A1612;padding:14px 36px;border-radius:12px;font-weight:700;text-decoration:none;font-size:16px">
          Jetzt Engel finden
        </a>
      </div>
      <p style="color:#888;font-size:13px">${KUNDEN_GRUSS_HTML}</p>
    `),
  },

  day7: {
    subject: 'Ihr erster Engel wartet auf Sie',
    html: (anrede: string) => wrapEmail(`
      <h2 style="color:#1A1612;font-size:22px;margin:0 0 16px">${anrede}</h2>
      <p style="color:#444;line-height:1.6;font-size:15px">
        Sie haben sich vor einer Woche bei Alltagsengel registriert — großartig!
        Aber wir haben bemerkt, dass Sie noch keine Buchung gemacht haben.
      </p>
      <p style="color:#444;line-height:1.6;font-size:15px">
        In Ihrer Region gibt es bereits <strong>geschulte und geprüfte Alltagsbegleiter</strong>, die für Sie da sein können.
        Eine Buchung dauert nur 2 Minuten:
      </p>
      <ol style="color:#444;line-height:1.8;font-size:15px">
        <li>Service wählen (Einkauf, Arzt, Gesellschaft...)</li>
        <li>Wunschtermin angeben</li>
        <li>Engel wird automatisch zugewiesen</li>
      </ol>
      <p style="color:#444;line-height:1.6;font-size:15px">
        Die Kosten richten sich nach Umfang und Art der Unterstützung — Sie erhalten vorab ein
        individuelles Angebot. Die Anerkennung nach §45a SGB XI für die Abrechnung über den
        Entlastungsbetrag läuft — bis dahin rechnen wir privat ab.
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="https://alltagsengel.care/kunde/buchen" style="display:inline-block;background:#C9963C;color:#1A1612;padding:14px 36px;border-radius:12px;font-weight:700;text-decoration:none;font-size:16px">
          Erste Buchung starten
        </a>
      </div>
      <p style="color:#888;font-size:13px">${KUNDEN_GRUSS_HTML}</p>
    `),
  },

  day14: {
    subject: 'Gut zu wissen: Ihr Entlastungsbetrag von 131 €',
    html: (anrede: string, referralCode: string) => wrapEmail(`
      <h2 style="color:#1A1612;font-size:22px;margin:0 0 16px">${anrede}</h2>
      <p style="color:#444;line-height:1.6;font-size:15px">
        Ihr Entlastungsbetrag von <strong>131 € pro Monat</strong> sammelt sich an, wenn Sie ihn nicht nutzen.
        Nicht verbrauchte Beträge eines Jahres können noch bis zum 30. Juni des Folgejahres eingesetzt
        werden — danach verfallen sie. Für die Abrechnung über den Entlastungsbetrag läuft unsere
        Anerkennung nach §45a SGB XI; wir beraten Sie gern kostenlos zu Ihren Finanzierungswegen.
      </p>
      <div style="background:#F7F2EA;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid #C9963C">
        <p style="margin:0;color:#1A1612;font-size:15px;font-weight:600">
          🎁 Bonus: Empfehlen Sie Alltagsengel weiter!
        </p>
        <p style="margin:8px 0 0;color:#444;font-size:14px">
          Teilen Sie Ihren persönlichen Empfehlungslink und Sie erhalten <strong>20 € Guthaben</strong>,
          wenn sich jemand registriert und die erste Buchung abschließt.
        </p>
        <p style="margin:12px 0 0">
          <a href="https://alltagsengel.care/?ref=${referralCode}" style="color:#C9963C;font-weight:600;font-size:14px">
            Ihr Link: alltagsengel.care/?ref=${referralCode}
          </a>
        </p>
      </div>
      <div style="text-align:center;margin:28px 0">
        <a href="https://alltagsengel.care/kunde/buchen" style="display:inline-block;background:#C9963C;color:#1A1612;padding:14px 36px;border-radius:12px;font-weight:700;text-decoration:none;font-size:16px">
          Jetzt Buchung starten
        </a>
      </div>
      <p style="color:#888;font-size:13px">${KUNDEN_GRUSS_HTML}</p>
    `),
  },
}
