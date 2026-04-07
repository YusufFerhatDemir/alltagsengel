// ═══════════════════════════════════════════════════════════
// Passwort-Validierung — Gemeinsame Logik für alle Formulare
// Mindestanforderungen: 8 Zeichen, 1 Großbuchstabe, 1 Zahl, 1 Sonderzeichen
// ═══════════════════════════════════════════════════════════

export interface PasswordValidationResult {
  valid: boolean
  errors: string[]
  strength: 'weak' | 'medium' | 'strong'
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = []

  if (password.length < 8) {
    errors.push('Mindestens 8 Zeichen')
  }

  if (!/[A-ZÄÖÜ]/.test(password)) {
    errors.push('Mindestens 1 Großbuchstabe')
  }

  if (!/[a-zäöüß]/.test(password)) {
    errors.push('Mindestens 1 Kleinbuchstabe')
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Mindestens 1 Zahl')
  }

  if (!/[^A-Za-z0-9äöüÄÖÜß]/.test(password)) {
    errors.push('Mindestens 1 Sonderzeichen (!@#$%...)')
  }

  // Stärke berechnen
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-ZÄÖÜ]/.test(password) && /[a-zäöüß]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9äöüÄÖÜß]/.test(password)) score++
  if (password.length >= 16) score++

  let strength: 'weak' | 'medium' | 'strong' = 'weak'
  if (score >= 5) strength = 'strong'
  else if (score >= 3) strength = 'medium'

  return {
    valid: errors.length === 0,
    errors,
    strength,
  }
}

// Häufige/schwache Passwörter blockieren
const COMMON_PASSWORDS = [
  'password', 'passwort', '12345678', '123456789', 'qwertyui',
  'abcdefgh', 'iloveyou', 'admin123', 'welcome1', 'letmein1',
  'password1', 'passwort1', '11111111', '00000000', 'testtest',
]

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.includes(password.toLowerCase())
}
