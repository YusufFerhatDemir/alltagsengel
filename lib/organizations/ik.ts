// ═══════════════════════════════════════════════════════════════
// IK-Nummer (Institutionskennzeichen) — Prüfziffern-Validierung
// ═══════════════════════════════════════════════════════════════
// Aufbau (9 Ziffern): KK RR SSSS P
//   KK   = Klassifikation (Stellen 1–2)
//   RR   = Regionalbereich (Stellen 3–4)
//   SSSS = Seriennummer (Stellen 5–8)
//   P    = Prüfziffer (Stelle 9) über die Stellen 3–8 nach dem
//          Luhn-Verfahren: Gewichte 2,1,2,1,2,1, zweistellige
//          Produkte werden quersummiert, Prüfziffer = Summe mod 10.
// Referenz-Check: IK Alltagsengel 460629986 → Stellen 3–8 = 062998,
//   gewichtet 0·2,6·1,2·2,9·1,9·2→9,8·1 → 0+6+4+9+9+8 = 36 → 6 ✓

export interface IkValidationResult {
  valid: boolean
  error?: string
}

export function validateIkNummer(ik: string): IkValidationResult {
  const cleaned = ik.replace(/\s/g, '')
  if (!/^\d{9}$/.test(cleaned)) {
    return { valid: false, error: 'IK-Nummer muss aus genau 9 Ziffern bestehen.' }
  }
  const digits = cleaned.split('').map(Number)
  const weights = [2, 1, 2, 1, 2, 1]
  let sum = 0
  for (let i = 0; i < 6; i++) {
    const product = digits[i + 2] * weights[i]
    sum += product > 9 ? product - 9 : product
  }
  const expected = sum % 10
  if (digits[8] !== expected) {
    return { valid: false, error: `Prüfziffer falsch (erwartet ${expected}). Bitte IK-Nummer kontrollieren.` }
  }
  return { valid: true }
}
