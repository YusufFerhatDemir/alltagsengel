// ═══════════════════════════════════════════════════════════════════════════
// SVIX-SIGNATUR — die Echtheitspruefung der Resend-Webhooks
//
// WARUM DAS NICHT WEGGELASSEN WERDEN DARF
//
// Ein Webhook-Endpunkt ist eine oeffentliche Adresse: jeder kann darauf
// POSTen. Ohne Signaturpruefung koennte irgendwer Ereignisse erfinden —
// und die Wirkung waere nicht „ein falscher Zaehler", sondern:
//
//   • `email.bounced` mit fremder Adresse → die Adresse landet auf der
//     Sperrliste und bekommt NIE WIEDER Post von uns. Ein Angreifer
//     koennte den gesamten Verteiler stilllegen, eine Adresse nach der
//     anderen, und im Datenbestand saehe es wie ein Zustellproblem aus.
//   • `email.complained` → zusaetzlich der Widerruf der Einwilligung.
//
// Deshalb ist dieses Modul fail-closed in jeder Richtung: fehlendes
// Geheimnis, fehlende Kopfzeilen, falsche Laenge, alter Zeitstempel und
// jede Ausnahme ergeben `false`. Es gibt keinen Weg, bei dem eine nicht
// geprueft Nachricht als echt durchgeht.
//
// ── DAS VERFAHREN ──────────────────────────────────────────────────────────
// Resend signiert nach dem Svix-Standard. Signiert wird die Zeichenkette
//
//     <svix-id>.<svix-timestamp>.<roher Rumpf>
//
// mit HMAC-SHA256. Der Schluessel ist der base64-dekodierte Teil hinter
// `whsec_`. Das Ergebnis steht base64-kodiert in `svix-signature`, dort
// als Liste `v1,<sig> v1,<sig>` — mehrere, weil bei einem
// Schluesselwechsel eine Zeit lang beide gelten.
//
// DER ROHE RUMPF ist wichtig: `JSON.parse` und wieder `JSON.stringify`
// aendert Reihenfolge und Leerzeichen, und die Signatur passt dann nie
// mehr. Die Route muss `request.text()` lesen, nicht `request.json()`.
//
// ── DER ZEITSTEMPEL ────────────────────────────────────────────────────────
// Ohne Altersgrenze waere eine einmal mitgeschnittene, echte Nachricht
// beliebig oft wiederholbar. Fuenf Minuten ist die Svix-Empfehlung und
// grosszuegig genug fuer Uhrenabweichungen zwischen den Rechnern.
// ═══════════════════════════════════════════════════════════════════════════

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Zulaessiges Alter einer Nachricht, in beide Richtungen. */
export const TOLERANZ_MS = 5 * 60 * 1000

export interface SvixKopfzeilen {
  id: string | null
  timestamp: string | null
  signature: string | null
}

/** Liest die drei Kopfzeilen. Svix sendet sie kleingeschrieben. */
export function svixKopfzeilen(request: Request): SvixKopfzeilen {
  return {
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
  }
}

export type SignaturErgebnis =
  | { ok: true }
  | { ok: false; grund: 'kein_geheimnis' | 'kopfzeilen' | 'zeitstempel' | 'signatur' }

/**
 * Prueft die Signatur einer Svix-/Resend-Nachricht.
 *
 * @param rumpf Der ROHE Rumpf, exakt wie empfangen (request.text()).
 * @param jetzt Zeitbasis — nur fuer Tests.
 */
export function pruefeSvixSignatur(
  rumpf: string,
  kopf: SvixKopfzeilen,
  geheimnis: string | undefined = process.env.RESEND_WEBHOOK_SECRET,
  jetzt: number = Date.now(),
): SignaturErgebnis {
  if (!geheimnis) return { ok: false, grund: 'kein_geheimnis' }
  if (!kopf.id || !kopf.timestamp || !kopf.signature) return { ok: false, grund: 'kopfzeilen' }

  const sekunden = Number(kopf.timestamp)
  if (!Number.isFinite(sekunden)) return { ok: false, grund: 'zeitstempel' }
  if (Math.abs(jetzt - sekunden * 1000) > TOLERANZ_MS) return { ok: false, grund: 'zeitstempel' }

  try {
    // `whsec_` ist nur ein Praefix zur Erkennung und gehoert nicht zum
    // Schluessel. Fehlt es, wird der Wert unveraendert als base64 gelesen.
    const roh = geheimnis.startsWith('whsec_') ? geheimnis.slice(6) : geheimnis
    const schluessel = Buffer.from(roh, 'base64')
    if (schluessel.length === 0) return { ok: false, grund: 'kein_geheimnis' }

    const erwartet = createHmac('sha256', schluessel)
      .update(`${kopf.id}.${kopf.timestamp}.${rumpf}`)
      .digest()

    // Die Kopfzeile traegt eine durch Leerzeichen getrennte Liste. Ein
    // Treffer genuegt — waehrend eines Schluesselwechsels stehen dort
    // zwei gueltige Signaturen.
    for (const teil of kopf.signature.split(' ')) {
      const [version, wert] = teil.split(',', 2)
      if (version !== 'v1' || !wert) continue
      const erhalten = Buffer.from(wert, 'base64')
      // Laengenpruefung VOR timingSafeEqual — die Funktion wirft sonst.
      if (erhalten.length !== erwartet.length) continue
      if (timingSafeEqual(erwartet, erhalten)) return { ok: true }
    }

    return { ok: false, grund: 'signatur' }
  } catch {
    return { ok: false, grund: 'signatur' }
  }
}
