/**
 * Resend-Webhook — welche Antwort auf welche Lage
 *
 * Rein rechnend: nimmt den Grund einer nicht bestandenen Signaturpruefung
 * und liefert Status, Rumpf und Kopfzeilen. Ohne Next.js, ohne Logger,
 * ohne Datenbank — und damit pruefbar.
 *
 * ── WARUM DIE STATUSCODES SICH UNTERSCHEIDEN MUESSEN ───────────────────
 * Ein Webhook-Empfaenger antwortet nicht fuer Menschen, sondern fuer eine
 * Maschine, die daraus ableitet, ob sie es nochmal versuchen soll. Alles
 * auf 401 zu werfen ist deshalb nicht nur ungenau, es ist falsch:
 *
 *   503  Bei UNS fehlt der Schluessel. Die Nachricht ist womoeglich echt,
 *        wir koennen es nur nicht pruefen. Resend SOLL es wiederholen —
 *        sobald der Wert gesetzt ist, kommt das Ereignis an. Mit
 *        Retry-After, damit in der Zwischenzeit nicht gehaemmert wird.
 *
 *   400  Die Svix-Kopfzeilen fehlen. Fehlerhaft aufgebaute Anfrage, keine
 *        fehlgeschlagene Authentifizierung. Ein 401 zeigte bei der
 *        Fehlersuche auf den Schluessel, wo in Wirklichkeit die
 *        Kopfzeilen fehlen — und man sucht am falschen Ende.
 *
 *   401  Zeitstempel zu alt oder Signatur passt nicht. Der Angriffs- bzw.
 *        Schluesselwechsel-Fall. Hier ist Wiederholen sinnlos.
 *
 * ── KEIN GEHEIMNIS IN DER ANTWORT ──────────────────────────────────────
 * Weder der erwartete noch der erhaltene Signaturwert steht im Rumpf.
 * Beides waere ein Orakel: wer beliebig oft probieren und die Differenz
 * lesen kann, braucht den Schluessel nicht mehr. Genannt wird
 * ausschliesslich der NAME der fehlenden Variable — ein Variablenname ist
 * kein Geheimnis, und ohne ihn steht bei der Fehlersuche nur „nicht
 * konfiguriert" da.
 */

import type { SignaturErgebnis } from './webhook-signatur'

export type AbweisungsGrund = Extract<SignaturErgebnis, { ok: false }>['grund']

/**
 * Wartezeit bis zum naechsten Versuch (Sekunden). Nur beim 503 gesetzt —
 * dort ist der Fehler behebbar. Bei 400/401 waere die Angabe eine
 * Einladung, es weiter zu versuchen.
 */
export const WIEDERHOLUNG_NACH_SEKUNDEN = 300

export interface WebhookAntwort {
  status: number
  rumpf: Record<string, unknown>
  kopfzeilen?: Record<string, string>
  /** Was ins Log gehoert — nie ein Geheimnis. */
  protokoll: { schwere: 'error' | 'warn'; text: string; details?: Record<string, unknown> }
}

export function signaturAbweisung(grund: AbweisungsGrund): WebhookAntwort {
  if (grund === 'kein_geheimnis') {
    return {
      status: 503,
      kopfzeilen: { 'Retry-After': String(WIEDERHOLUNG_NACH_SEKUNDEN) },
      rumpf: {
        error: 'Webhook nicht konfiguriert.',
        fehlend: 'RESEND_WEBHOOK_SECRET',
        hinweis:
          'Der Signaturschlüssel des Resend-Webhooks ist auf dem Server nicht gesetzt '
          + 'oder nicht als base64 lesbar. Ohne ihn lässt sich die Echtheit der Nachricht '
          + 'nicht prüfen; sie wird deshalb nicht verarbeitet. Den Wert im Resend-Dashboard '
          + 'unter Webhooks → Signing Secret (Form whsec_…) abrufen und als Server-Variable '
          + 'setzen. Danach wiederholte Zustellungen werden angenommen.',
        wiederholen: true,
      },
      protokoll: {
        schwere: 'error',
        text: 'RESEND_WEBHOOK_SECRET fehlt oder ist unbrauchbar — Webhook wird nicht verarbeitet',
      },
    }
  }

  if (grund === 'kopfzeilen') {
    return {
      status: 400,
      rumpf: {
        error: 'Unvollständige Anfrage.',
        hinweis: 'Die Kopfzeilen svix-id, svix-timestamp und svix-signature werden erwartet.',
        wiederholen: false,
      },
      protokoll: { schwere: 'warn', text: 'Webhook ohne vollständige Svix-Kopfzeilen abgewiesen' },
    }
  }

  return {
    status: 401,
    rumpf: {
      error: 'Signatur ungültig.',
      // Der Grund darf genannt werden: er verrät nichts über den
      // Schlüssel, hilft aber bei einem Uhrenversatz sofort weiter.
      grund: grund === 'zeitstempel' ? 'zeitstempel_ausserhalb_toleranz' : 'signatur_passt_nicht',
      wiederholen: false,
    },
    protokoll: {
      schwere: 'warn',
      text: 'Webhook mit ungültiger Signatur abgewiesen',
      details: { grund },
    },
  }
}
