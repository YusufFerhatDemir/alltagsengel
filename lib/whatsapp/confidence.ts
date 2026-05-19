/**
 * WhatsApp Bot — Confidence-Heuristik + Name-Sanitizer.
 *
 * Nach jeder KI-Antwort prüfen wir, ob der Bot Unsicherheit signalisiert.
 * Bei Unsicherheit: Antwort NICHT senden, sondern Draft speichern + Holding-Message senden.
 *
 * Zweite Sicherheitsschicht: KI-Antwort darf NIE einen persönlichen Namen enthalten.
 * Falls doch (Halluzination): sanitisieren auf "das Alltagsengel-Team".
 */

/**
 * Phrasen die signalisieren: der Bot weiß die Antwort nicht sicher.
 * Lower-cased Matching auf der KI-Antwort.
 */
const LOW_CONFIDENCE_MARKERS = [
  'ich weiß nicht',
  'ich weiss nicht',
  'das weiß ich nicht',
  'leider kann ich',
  'leider weiß ich',
  'kann ich nicht beantworten',
  'kann ich Ihnen nicht',
  'kann ich dir nicht',
  'bin ich mir nicht sicher',
  'bin nicht der richtige',
  'sind wir die falsche',
  'da kann ich nicht weiterhelfen',
  'das müsste',
  'lass mich nachfragen',
  'kläre das gerne',
  'wir klären das',
  'nicht sicher',
]

/**
 * Phrasen die nur die KANONISCHE Eskalations-Antwort verwendet.
 * Wenn die KI eine davon eigenständig generiert, ist sie effektiv unsicher
 * und wir geben das Gespräch ans Team weiter.
 */
const SELF_ESCALATION_MARKERS = [
  'team meldet sich',
  'meldet sich in kürze',
  'meldet sich persönlich',
  'meldet sich gleich persönlich',
  'wir melden uns persönlich',
  'wir melden uns gleich',
]

export function isLowConfidenceReply(reply: string): { lowConfidence: boolean; marker?: string } {
  const lower = reply.toLowerCase()
  for (const marker of [...LOW_CONFIDENCE_MARKERS, ...SELF_ESCALATION_MARKERS]) {
    if (lower.includes(marker)) {
      return { lowConfidence: true, marker }
    }
  }
  return { lowConfidence: false }
}

/**
 * Personen-Namen die NIE in Bot-Antworten auftauchen sollen.
 * Falls die KI halluziniert: ersetzen + Warning loggen.
 */
const FORBIDDEN_NAMES = [
  'Yusuf Ferhat Demir',
  'Yusuf Ferhat',
  'Yusuf Demir',
  'Yusuf',
  'Y. Cilcioglu',
  'Cilcioglu',
]

/**
 * Falls die KI eigenständig einen Namen einbaut (z.B. "Yusuf meldet sich gleich"),
 * ersetze ihn defensiv durch "das Alltagsengel-Team".
 *
 * Returns: { sanitized: string, didReplace: boolean, replaced: string[] }
 */
export function sanitizeNames(reply: string): {
  sanitized: string
  didReplace: boolean
  replaced: string[]
} {
  let out = reply
  const replaced: string[] = []
  for (const name of FORBIDDEN_NAMES) {
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'gi')
    if (re.test(out)) {
      replaced.push(name)
      out = out.replace(re, 'das Alltagsengel-Team')
    }
  }
  // Doppelung "das das Alltagsengel-Team" wieder reduzieren
  out = out.replace(/das das Alltagsengel-Team/gi, 'das Alltagsengel-Team')
  return { sanitized: out, didReplace: replaced.length > 0, replaced }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Holding-Message wenn Bot unsicher ist und Draft gespeichert wird.
 * Wortlaut bewusst gleich wie Eskalations-Reply, damit der Kunde
 * keine zwei verschiedenen "warte"-Formulierungen sieht.
 */
export const HOLDING_REPLY = `Vielen Dank für Ihre Nachricht. Das Alltagsengel-Team meldet sich in Kürze persönlich bei Ihnen. 🙏`
