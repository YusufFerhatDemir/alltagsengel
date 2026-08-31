// ═══════════════════════════════════════════════════════════════════
// ABSENDER-SCHUTZ — kein persoenlicher Name in Kundenrichtung
// ═══════════════════════════════════════════════════════════════════
// Die Hausregel gilt fuer JEDE Kommunikation in Kundenrichtung:
// E-Mail, WhatsApp, SMS, In-App-Chat, Pressetexte, automatisierte
// Mails. Absender und Unterschrift sind immer „Alltagsengel", nie eine
// Person.
//
// Umgesetzt war sie an genau EINER Stelle: `sanitizeNames()` lag in
// lib/whatsapp/confidence.ts und wurde nur vom WhatsApp-Webhook
// aufgerufen. Die beiden anderen Kanaele, die frei formulierten
// Modelltext an Kunden zurueckgeben — /api/beratung-chat und
// /api/ai-chat — reichten die Antwort ungefiltert durch. Beide haben
// die Regel zwar im Systemprompt stehen, aber ein Systemprompt ist eine
// Bitte, kein Riegel: genau fuer den Fall, dass das Modell sie
// ignoriert, wurde dieser Filter ueberhaupt geschrieben.
//
// Deshalb liegt die Liste jetzt hier, kanalneutral. lib/whatsapp/
// confidence.ts reicht unveraendert weiter — Verhalten und Signatur
// dort bleiben Zeichen fuer Zeichen dieselben, die bestehenden Tests
// laufen unveraendert.
//
// AUSDRUECKLICH NICHT betroffen: Impressum, Datenschutzerklaerung und
// der Briefkopf-Fuss. Dort steht der Name des Geschaeftsfuehrers, weil
// § 35a GmbHG ihn auf Geschaeftsbriefen verlangt — das ist eine
// Pflichtangabe, keine Unterschrift.
// ═══════════════════════════════════════════════════════════════════

/**
 * Personen-Namen, die in keiner Antwort an Kunden auftauchen duerfen.
 * Laengere Schreibweisen zuerst — sonst ersetzt 'Yusuf' den Vornamen
 * aus 'Yusuf Ferhat Demir' und laesst 'Ferhat Demir' stehen.
 */
export const VERBOTENE_ABSENDERNAMEN = [
  'Yusuf Ferhat Demir',
  'Yusuf Ferhat',
  'Yusuf Demir',
  'Yusuf',
  'Y. Cilcioglu',
  'Cilcioglu',
] as const

/** Wodurch ein gefundener Name ersetzt wird. */
export const ERSATZ_ABSENDER = 'das Alltagsengel-Team'

export interface AbsenderPruefung {
  sanitized: string
  didReplace: boolean
  replaced: string[]
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Ersetzt persoenliche Namen durch „das Alltagsengel-Team".
 *
 * Verhalten unveraendert gegenueber der frueheren Fassung in
 * lib/whatsapp/confidence.ts, einschliesslich der Nachbesserung gegen
 * „das das Alltagsengel-Team".
 */
export function schuetzeAbsender(text: string): AbsenderPruefung {
  let out = text
  const replaced: string[] = []
  for (const name of VERBOTENE_ABSENDERNAMEN) {
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'gi')
    if (re.test(out)) {
      replaced.push(name)
      out = out.replace(re, ERSATZ_ABSENDER)
    }
  }
  out = out.replace(/das das Alltagsengel-Team/gi, ERSATZ_ABSENDER)
  return { sanitized: out, didReplace: replaced.length > 0, replaced }
}

/**
 * Nur die Frage, ob etwas zu beanstanden ist — fuer Pruefungen und
 * Zaeune, die nichts veraendern wollen.
 */
export function enthaeltAbsendername(text: string): boolean {
  return VERBOTENE_ABSENDERNAMEN.some(
    (name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(text),
  )
}
