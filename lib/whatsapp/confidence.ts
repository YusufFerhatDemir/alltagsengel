/**
 * WhatsApp Bot — Confidence-Heuristik + Name-Sanitizer.
 *
 * Nach jeder KI-Antwort prüfen wir, ob der Bot Unsicherheit signalisiert.
 * Bei Unsicherheit: Antwort NICHT senden, sondern Draft speichern + Holding-Message senden.
 *
 * Zweite Sicherheitsschicht: KI-Antwort darf NIE einen persönlichen Namen enthalten.
 * Falls doch (Halluzination): sanitisieren auf "das Alltagsengel-Team".
 */

import { schuetzeAbsender } from '@/lib/kommunikation/absender-schutz'

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
 * Falls die KI eigenständig einen Namen einbaut (z.B. "Yusuf meldet sich gleich"),
 * ersetze ihn defensiv durch "das Alltagsengel-Team".
 *
 * Liste und Logik liegen seit dem 31.08.2026 kanalneutral in
 * lib/kommunikation/absender-schutz.ts — dieselbe Regel gilt fuer
 * E-Mail, SMS und die beiden KI-Chats, die sie vorher nicht anwandten.
 * Verhalten und Signatur hier sind unveraendert; diese Funktion bleibt
 * der Einstieg des WhatsApp-Webhooks.
 *
 * Returns: { sanitized: string, didReplace: boolean, replaced: string[] }
 */
export function sanitizeNames(reply: string): {
  sanitized: string
  didReplace: boolean
  replaced: string[]
} {
  return schuetzeAbsender(reply)
}

/**
 * Holding-Message wenn Bot unsicher ist und Draft gespeichert wird.
 * Wortlaut bewusst gleich wie Eskalations-Reply, damit der Kunde
 * keine zwei verschiedenen "warte"-Formulierungen sieht.
 */
export const HOLDING_REPLY = `Vielen Dank für Ihre Nachricht. Das Alltagsengel-Team meldet sich in Kürze persönlich bei Ihnen. 🙏`
