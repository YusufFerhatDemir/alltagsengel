// ═══════════════════════════════════════════════════════════════════════
// Fehlerklassen des Zustellwegs — voruebergehend oder dauerhaft?
// ═══════════════════════════════════════════════════════════════════════
//
// Der Wiederholungslauf braucht genau eine Entscheidung: lohnt sich ein
// weiterer Versuch?
//
//   vorübergehend  Netzfehler, Zeitüberschreitung, 429, 5xx, Provider
//                  gerade nicht erreichbar → erneut versuchen
//   dauerhaft      Die Nachricht kann so nie zugestellt werden
//                  (ungültige Adresse, abgelehnte Eingabe) → sofort
//                  ins Dead Letter, ohne die vier Wartezeiten zu
//                  verbrennen
//
// IM ZWEIFEL VORÜBERGEHEND. Ein zu Unrecht als dauerhaft eingestufter
// Fehler kostet eine Nachricht, die nie ankommt; ein zu Unrecht als
// vorübergehend eingestufter kostet nur vier weitere Versuche über
// wenige Stunden. Die Asymmetrie ist der Grund für den Default.
//
// WARUM 401/403 NICHT DAUERHAFT SIND
// Ein abgelehnter Schlüssel ist ein Betriebsproblem, kein Empfänger-
// problem: nach dem Nachziehen des Schlüssels in Vercel soll der
// nächste Lauf die liegengebliebenen Nachrichten zustellen. Würde man
// das als dauerhaft werten, wäre jede Nachricht während einer
// Schlüsselrotation unwiederbringlich verloren.
// ═══════════════════════════════════════════════════════════════════════

export type Fehlerklasse = 'voruebergehend' | 'dauerhaft'

/**
 * Textmuster, die eine Zustellung dauerhaft unmöglich machen. Bewusst
 * eng gehalten — siehe „im Zweifel vorübergehend" oben.
 */
const DAUERHAFT_MUSTER: readonly RegExp[] = [
  // Resend / generische Adressvalidierung
  /\bvalidation[_\s-]?error\b/i,
  /\binvalid[_\s-]?(to[_\s-]?)?(email|address|recipient|parameter)\b/i,
  /\b(email|address|recipient)\s+is\s+invalid\b/i,
  /\bnot\s+a\s+valid\s+(email|address)\b/i,
  /\bunprocessable[_\s]?entity\b/i,
  // Empfänger existiert nicht / will nicht
  /\b(mailbox|recipient|user)\s+(not\s+found|unknown|does\s+not\s+exist)\b/i,
  /\bno\s+such\s+user\b/i,
  /\bunsubscribed\b/i,
  /\bsuppress(ed|ion)\b/i,
  /\bhard\s*bounce\b/i,
  /\bblocked[_\s]?recipient\b/i,
  // Web-Push: Abo ist weg (410 Gone / 404)
  /\bsubscription\s+(has\s+)?expired\b/i,
  /\bunsubscribed\s+or\s+expired\b/i,
  // WhatsApp Cloud API
  /\brecipient\s+phone\s+number\s+not\s+in\s+allowed\s+list\b/i,
  /\binvalid\s+phone\s+number\b/i,
]

/** Statuscodes, bei denen ein weiterer Versuch nichts ändert. */
const DAUERHAFT_CODES: ReadonlySet<number> = new Set([400, 404, 410, 422])

/**
 * Statuscodes, die trotz 4xx wiederholt werden: Rate Limit und
 * Authentifizierung. Steht vor der Code-Prüfung, damit ein künftiger
 * Eintrag in DAUERHAFT_CODES diese nicht versehentlich einfängt.
 */
const VORUEBERGEHEND_CODES: ReadonlySet<number> = new Set([401, 402, 403, 408, 409, 425, 429])

function statusAus(fehler: unknown): number | null {
  if (typeof fehler === 'number' && Number.isFinite(fehler)) return fehler
  if (fehler && typeof fehler === 'object') {
    const o = fehler as Record<string, unknown>
    for (const feld of ['statusCode', 'status', 'code', 'httpStatus']) {
      const w = o[feld]
      if (typeof w === 'number' && w >= 100 && w < 600) return w
      if (typeof w === 'string' && /^\d{3}$/.test(w)) return Number(w)
    }
  }
  return null
}

function textAus(fehler: unknown): string {
  if (typeof fehler === 'string') return fehler
  if (fehler instanceof Error) return fehler.message
  if (fehler && typeof fehler === 'object') {
    const o = fehler as Record<string, unknown>
    const teile = ['message', 'name', 'error', 'reason', 'detail']
      .map(f => o[f])
      .filter(w => typeof w === 'string') as string[]
    if (teile.length > 0) return teile.join(' ')
    try {
      return JSON.stringify(fehler)
    } catch {
      return ''
    }
  }
  return ''
}

/**
 * Klassifiziert einen Zustellfehler.
 *
 * Reihenfolge: erst die eindeutig wiederholbaren Statuscodes, dann die
 * dauerhaften Codes, zuletzt die Textmuster. Ohne jeden Anhaltspunkt
 * gilt „vorübergehend".
 */
export function klassifiziereFehler(fehler: unknown): Fehlerklasse {
  if (fehler === null || fehler === undefined) return 'voruebergehend'

  const status = statusAus(fehler)
  if (status !== null) {
    if (VORUEBERGEHEND_CODES.has(status)) return 'voruebergehend'
    if (DAUERHAFT_CODES.has(status)) return 'dauerhaft'
    if (status >= 500) return 'voruebergehend'
  }

  const text = textAus(fehler)
  if (text) {
    // Ein im Text genannter Statuscode zählt genauso wie ein Feld —
    // Provider-SDKs verpacken ihn gern in die Meldung.
    const imText = text.match(/\b(?:status(?:code)?|http|error)\D{0,3}(\d{3})\b/i)
    if (imText) {
      const code = Number(imText[1])
      if (VORUEBERGEHEND_CODES.has(code)) return 'voruebergehend'
      if (DAUERHAFT_CODES.has(code)) return 'dauerhaft'
      if (code >= 500) return 'voruebergehend'
    }
    if (DAUERHAFT_MUSTER.some(m => m.test(text))) return 'dauerhaft'
  }

  return 'voruebergehend'
}

export function istDauerhaft(fehler: unknown): boolean {
  return klassifiziereFehler(fehler) === 'dauerhaft'
}
