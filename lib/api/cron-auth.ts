// ═══════════════════════════════════════════════════════════════════════
// Cron-Bearer-Prüfung — eine Stelle statt acht Kopien
// ═══════════════════════════════════════════════════════════════════════
//
// WARUM ZENTRAL: Der Vergleich stand achtmal ausgeschrieben in den Routen.
// Fünf Kopien hatten den Null-Riegel `!process.env.CRON_SECRET`, zwei nicht
// (/api/cron/drip, /api/cron/indexnow). Ohne ihn lautet der Vergleichswert
// bei nicht gesetztem Geheimnis wörtlich "Bearer undefined" — genau diesen
// Header kann jeder schicken. Eine kopierte Sicherheitsprüfung driftet; eine
// gemeinsame nicht.
//
// WARUM timingSafeEqual: Ein `!==` auf Strings bricht beim ersten
// abweichenden Zeichen ab. Über das Netz ist das kaum auswertbar, aber der
// konstante Vergleich kostet nichts und nimmt die Frage vom Tisch. Die
// Längenprüfung davor ist Pflicht — timingSafeEqual wirft bei ungleich
// langen Puffern.
//
// FAIL-CLOSED: Kein Geheimnis gesetzt → 401. Die Automatisierung steht dann
// still, statt für jeden offen zu stehen.

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

/** Konstantzeit-Vergleich zweier Zeichenketten. */
function gleich(a: string, b: string): boolean {
  const pa = Buffer.from(a, 'utf8')
  const pb = Buffer.from(b, 'utf8')
  if (pa.length !== pb.length) return false
  return timingSafeEqual(pa, pb)
}

/**
 * Prüft den `Authorization: Bearer <CRON_SECRET>`-Header.
 *
 * @returns `null`, wenn der Aufruf berechtigt ist — sonst die fertige
 *          401-Antwort, die der Aufrufer direkt zurückgeben muss.
 *
 * Verwendung:
 *   const abweisung = pruefeCronGeheimnis(request)
 *   if (abweisung) return abweisung
 */
export function pruefeCronGeheimnis(request: Request): NextResponse | null {
  const geheimnis = process.env.CRON_SECRET
  if (!geheimnis) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const header = request.headers.get('authorization')
  if (!header || !gleich(header, `Bearer ${geheimnis}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

/**
 * Rohvergleich gegen CRON_SECRET, ohne Bearer-Präfix.
 *
 * Für Aufrufer, die das Geheimnis in einem eigenen Header transportieren
 * (`x-cron-secret` in /api/ops/workflow/processing) und den Misserfolg nicht
 * mit 401 beantworten, sondern auf eine Benutzerprüfung zurückfallen.
 * Fail-closed: ohne gesetztes CRON_SECRET immer `false`.
 */
export function istCronGeheimnis(wert: string | null | undefined): boolean {
  const geheimnis = process.env.CRON_SECRET
  if (!geheimnis || !wert) return false
  return gleich(wert, geheimnis)
}

/** Der Header, mit dem ein interner Aufruf sich selbst ausweist. */
export function cronAuthHeader(): string {
  return `Bearer ${process.env.CRON_SECRET ?? ''}`
}
