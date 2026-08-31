// ═══════════════════════════════════════════════════════════════════════
// Buchungs-Benachrichtigungen: der Nachrichtentext
// ═══════════════════════════════════════════════════════════════════════
//
// WARUM DER TEXT HIER LIEGT UND NICHT MEHR IN lib/notifications.ts
// Der Wiederholungslauf muss eine gescheiterte Buchungsmail neu bauen —
// das Protokoll enthaelt keinen Inhalt. Waeren die Texte weiterhin in
// den Versandfunktionen eingebettet, gaebe es zwangslaeufig eine zweite,
// leicht abweichende Fassung fuer den Nachversand. Der Kunde bekaeme
// dann je nach Zufall zwei verschiedene Mails zum selben Ereignis.
//
// Diese Datei ist deshalb die EINZIGE Quelle des Textes. Sowohl der
// Erstversand (lib/notifications.ts) als auch die Wiederholung
// (lib/notifications/vorgaenge/buchung.ts) bauen daraus.
//
// KEINE IMPORTE AUS lib/notifications.ts — sonst entsteht ein
// Zirkelbezug (Versand → Text → Versand). Das Escaping liegt dafuer in
// lib/notifications/html.ts.
// ═══════════════════════════════════════════════════════════════════════

import { esc } from '@/lib/notifications/html'

export const BUCHUNGS_ARTEN = [
  'booking-neu',
  'booking-zusage',
  'booking-absage',
  // Storno (31.08.2026). ZWEI Arten, nicht eine: der Text richtet sich an
  // die jeweils ANDERE Seite. „Ihr Kunde hat abgesagt" und „Ihr Termin
  // wurde abgesagt" sind verschiedene Nachrichten mit verschiedenen
  // Anschlusshandlungen — eine gemeinsame Art muesste beides zugleich
  // sagen und saehe fuer beide falsch aus.
  'booking-storno-kunde',
  'booking-storno-engel',
] as const
export type BuchungsArt = (typeof BUCHUNGS_ARTEN)[number]

export interface BookingNotifyData {
  bookingId: string
  customerName: string
  angelName: string
  service: string
  date: string
  time: string
  duration: number
  amount: number
}

export interface BuchungsNachricht {
  inApp: {
    type: 'booking'
    title: string
    body: string
    link: string
    data: Record<string, unknown>
  }
  email: {
    subject: string
    /** Innerer HTML-Block; das Rahmentemplate kommt aus lib/notifications.ts. */
    html: string
    /** Anrede, falls der Empfaenger keinen Vornamen hat. */
    anredeFallback: string
  }
  push: {
    title: string
    body: string
    tag: string
    url: string
    actions: Array<{ action: string; title: string }>
  }
  /**
   * Native Push (FCM). Bewusst eigenes Feld statt einer Kopie von `push`:
   * bei der Absage endet der Web-Push-Text mit einer Handlungsaufforderung
   * ("Jetzt anderen Engel finden"), die zum Aktionsknopf gehoert — den es
   * bei FCM nicht gibt.
   */
  fcm: {
    title: string
    body: string
    tag: string
    url: string
  }
}

/** Datumsformat aller Buchungsnachrichten — identisch in allen Kanaelen. */
export function buchungsDatum(datum: string): string {
  return new Date(datum).toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Baut alle Kanaltexte zu einem Buchungsereignis.
 *
 * `grund` wird nur bei 'booking-absage' ausgewertet und darf null sein —
 * die Live-Datenbank kennt bookings.decline_reason nicht ueberall, und
 * eine Wiederholung ohne Grund ist besser als keine Nachricht.
 */
export function baueBuchungsNachricht(
  art: BuchungsArt,
  data: BookingNotifyData,
  grund?: string | null
): BuchungsNachricht {
  const dateStr = buchungsDatum(data.date)

  if (art === 'booking-neu') {
    return {
      inApp: {
        type: 'booking',
        title: 'Neue Buchungsanfrage',
        body: `${data.customerName} möchte ${data.service} am ${dateStr} um ${data.time} Uhr buchen (${data.duration}h, ${data.amount.toFixed(2)}€).`,
        link: `/engel/buchungen`,
        data: { bookingId: data.bookingId },
      },
      email: {
        anredeFallback: 'Engel',
        subject: `Neue Buchungsanfrage von ${data.customerName}`,
        html: `
        <p>Sie haben eine neue Buchungsanfrage erhalten:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;width:120px;">Kunde</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${esc(data.customerName)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Leistung</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(data.service)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Datum</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${dateStr}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Uhrzeit</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(data.time)} Uhr</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Dauer</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.duration} Stunden</td></tr>
          <tr><td style="padding:8px 12px;color:#888;">Betrag</td><td style="padding:8px 12px;font-weight:600;">${data.amount.toFixed(2)}€</td></tr>
        </table>
        <p>Bitte öffnen Sie die App, um die Anfrage anzunehmen oder abzulehnen.</p>
        <a href="https://alltagsengel.care/engel/buchungen" style="display:inline-block;padding:12px 28px;background:#C9963C;color:#1A1612;text-decoration:none;border-radius:10px;font-weight:600;margin-top:8px;">Anfrage ansehen</a>
      `,
      },
      push: {
        title: 'Neue Buchungsanfrage',
        body: `${data.customerName} möchte ${data.service} am ${dateStr} um ${data.time} Uhr buchen.`,
        tag: `booking-${data.bookingId}`,
        url: '/engel/buchungen',
        actions: [{ action: 'open', title: 'Ansehen' }],
      },
      fcm: {
        title: 'Neue Buchungsanfrage',
        body: `${data.customerName} möchte ${data.service} am ${dateStr} um ${data.time} Uhr buchen.`,
        tag: `booking-${data.bookingId}`,
        url: '/engel/buchungen',
      },
    }
  }

  if (art === 'booking-zusage') {
    return {
      inApp: {
        type: 'booking',
        title: 'Buchung bestätigt!',
        body: `${data.angelName} hat Ihre Buchung für ${data.service} am ${dateStr} angenommen.`,
        link: `/kunde/bestaetigt/${data.bookingId}`,
        data: { bookingId: data.bookingId },
      },
      email: {
        anredeFallback: 'Kunde',
        subject: `${data.angelName} hat Ihre Buchung bestätigt`,
        html: `
        <p>Gute Nachrichten! Ihr Termin wurde bestätigt:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;width:120px;">Engel</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${esc(data.angelName)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Leistung</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(data.service)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Datum</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${dateStr}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Uhrzeit</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(data.time)} Uhr</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Dauer</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.duration} Stunden</td></tr>
          <tr><td style="padding:8px 12px;color:#888;">Betrag</td><td style="padding:8px 12px;font-weight:600;">${data.amount.toFixed(2)}€</td></tr>
        </table>
        <div style="background:#F0EBE0;border-radius:10px;padding:14px 18px;margin:16px 0;">
          <strong>Versicherungsschutz aktiv</strong><br/>
          Haftpflicht bis 5 Mio. € · Unfallversicherung · Sachschäden bis 50.000€
        </div>
        <a href="https://alltagsengel.care/kunde/bestaetigt/${data.bookingId}" style="display:inline-block;padding:12px 28px;background:#2D8F5E;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;margin-top:8px;">Buchung ansehen</a>
      `,
      },
      push: {
        title: 'Buchung bestätigt!',
        body: `${data.angelName} hat Ihre Buchung für ${data.service} am ${dateStr} angenommen.`,
        tag: `booking-confirmed-${data.bookingId}`,
        url: `/kunde/bestaetigt/${data.bookingId}`,
        actions: [{ action: 'open', title: 'Ansehen' }],
      },
      fcm: {
        title: 'Buchung bestätigt!',
        body: `${data.angelName} hat Ihre Buchung für ${data.service} am ${dateStr} angenommen.`,
        tag: `booking-confirmed-${data.bookingId}`,
        url: `/kunde/bestaetigt/${data.bookingId}`,
      },
    }
  }

  if (art === 'booking-storno-kunde' || art === 'booking-storno-engel') {
    // Wer abgesagt hat, bestimmt Empfaenger, Anrede und Anschlusshandlung.
    const vomKunden = art === 'booking-storno-kunde'
    const absagender = vomKunden ? data.customerName : data.angelName
    const ziel = vomKunden ? '/engel/buchungen' : '/kunde/home'
    const grundZeile = grund ? ` Grund: ${grund}` : ''
    const titel = 'Termin abgesagt'
    const kurz = `${absagender} hat den Termin für ${data.service} am ${dateStr} um ${data.time} Uhr abgesagt.`

    return {
      inApp: {
        type: 'booking',
        title: titel,
        body: vomKunden
          ? `${kurz} Der Einsatz wurde aus Ihrer Einsatzliste entfernt.`
          : `${kurz}${grundZeile} Sie können gerne einen anderen Engel anfragen.`,
        link: ziel,
        data: { bookingId: data.bookingId },
      },
      email: {
        anredeFallback: vomKunden ? 'Engel' : 'Kunde',
        subject: `Termin am ${dateStr} wurde abgesagt`,
        html: `
        <p>${vomKunden ? 'ein Kunde hat einen bestätigten Termin abgesagt:' : 'Ihr Termin wurde leider abgesagt:'}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;width:120px;">${vomKunden ? 'Kunde' : 'Engel'}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${esc(absagender)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Leistung</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(data.service)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Datum</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${dateStr}</td></tr>
          <tr><td style="padding:8px 12px;color:#888;">Uhrzeit</td><td style="padding:8px 12px;">${esc(data.time)} Uhr</td></tr>
        </table>
        ${grund ? `<p style="color:#666;">Begründung: ${esc(grund)}</p>` : ''}
        <p>${vomKunden
          ? 'Der Einsatz wurde aus Ihrer Einsatzliste entfernt. Es ist nichts weiter zu tun.'
          : 'Es stehen weitere Engel in Ihrer Nähe zur Verfügung — Sie können jederzeit einen neuen Termin anfragen.'}</p>
        <a href="https://alltagsengel.care${ziel}" style="display:inline-block;padding:12px 28px;background:#C9963C;color:#1A1612;text-decoration:none;border-radius:10px;font-weight:600;margin-top:8px;">${vomKunden ? 'Einsätze ansehen' : 'Anderen Engel finden'}</a>
      `,
      },
      push: {
        title: titel,
        body: kurz,
        tag: `booking-cancelled-${data.bookingId}`,
        url: ziel,
        actions: [{ action: 'open', title: vomKunden ? 'Einsätze ansehen' : 'Anderen Engel finden' }],
      },
      fcm: {
        title: titel,
        body: kurz,
        tag: `booking-cancelled-${data.bookingId}`,
        url: ziel,
      },
    }
  }

  // Ab hier bleibt nur 'booking-absage'. Der Rueckfall ist bewusst
  // benannt: eine neu eingefuehrte Art wuerde sonst stillschweigend den
  // Ablehnungstext erhalten.
  const grundText = grund ? ` Grund: ${grund}` : ''
  return {
    inApp: {
      type: 'booking',
      title: 'Anfrage abgelehnt',
      body: `${data.angelName} kann Ihre Anfrage für ${data.service} am ${dateStr} leider nicht annehmen.${grundText} Wir finden gerne einen anderen Engel für Sie.`,
      link: `/kunde/home`,
      data: { bookingId: data.bookingId },
    },
    email: {
      anredeFallback: 'Kunde',
      subject: `Ihre Anfrage vom ${dateStr} konnte nicht angenommen werden`,
      html: `
        <p>leider kann ${esc(data.angelName)} Ihre Anfrage nicht annehmen:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;width:120px;">Leistung</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(data.service)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Datum</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${dateStr}</td></tr>
          <tr><td style="padding:8px 12px;color:#888;">Uhrzeit</td><td style="padding:8px 12px;">${esc(data.time)} Uhr</td></tr>
        </table>
        ${grund ? `<p style="color:#666;">Begründung: ${esc(grund)}</p>` : ''}
        <p>Das ist kein Problem — es stehen weitere Engel in Ihrer Nähe zur Verfügung. Suchen Sie einfach einen neuen Termin aus.</p>
        <a href="https://alltagsengel.care/kunde/home" style="display:inline-block;padding:12px 28px;background:#C9963C;color:#1A1612;text-decoration:none;border-radius:10px;font-weight:600;margin-top:8px;">Anderen Engel finden</a>
      `,
    },
    push: {
      title: 'Anfrage abgelehnt',
      body: `${data.angelName} kann Ihre Anfrage für ${dateStr} leider nicht annehmen. Jetzt anderen Engel finden.`,
      tag: `booking-declined-${data.bookingId}`,
      url: '/kunde/home',
      actions: [{ action: 'open', title: 'Anderen Engel finden' }],
    },
    fcm: {
      title: 'Anfrage abgelehnt',
      body: `${data.angelName} kann Ihre Anfrage für ${dateStr} leider nicht annehmen.`,
      tag: `booking-declined-${data.bookingId}`,
      url: '/kunde/home',
    },
  }
}
