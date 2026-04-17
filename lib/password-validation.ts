// ═══════════════════════════════════════════════════════════
// Passwort-Validierung — Gemeinsame Logik für alle Formulare
//
// Zwei Ebenen:
//   1. validatePassword(password)          — synchron, Regex + Länge.
//                                             Geeignet für onChange-Hints im UI.
//   2. validatePasswordAsync(password, …)  — asynchron, mit zxcvbn-ts (DE-Dictionary).
//                                             Pflicht-Gate beim Submit und auf dem Server.
//
// Mindestanforderungen (sync):
//   - 8 Zeichen, 1 Großbuchstabe, 1 Kleinbuchstabe, 1 Zahl, 1 Sonderzeichen
//
// Zusätzlich (async, zxcvbn-Score ≥ 3):
//   - Blockt Wörterbuch-Treffer (DE + internationale Top-Listen),
//     Tastatur-Muster (qwertz, 123456, asdfasdf), Wiederholungen,
//     Sequenzen und User-spezifische Strings (E-Mail, Vor-/Nachname).
//
// Analogie: Die Regex-Prüfung ist der Mindest-Dress-Code am Eingang
// (Hemd, Hose, Schuhe — darf keiner ohne rein). zxcvbn ist der Türsteher
// mit Internet-Anschluss, der zusätzlich merkt, wenn jemand mit der
// Frankfurt-Eintracht-Fußball-Klatsch-Combo „schalke04!" ankommt und
// sagt „kennen wir schon, geh nach Hause".
// ═══════════════════════════════════════════════════════════

export interface PasswordValidationResult {
  valid: boolean
  errors: string[]
  strength: 'weak' | 'medium' | 'strong'
  /** zxcvbn-Score (0 = trivial, 4 = sehr stark). Nur bei validatePasswordAsync gesetzt. */
  score?: number
  /** zxcvbn-Feedback — Warnung + konkrete Vorschläge für den Nutzer. */
  feedback?: {
    warning?: string
    suggestions?: string[]
  }
}

// ── Synchrone Basis-Validierung ────────────────────────────────
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

  // Stärke heuristisch (nur Sync-Fallback — zxcvbn überschreibt das im Async-Pfad)
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

// ── zxcvbn-ts lazy singleton ───────────────────────────────────
// Dictionary-Dateien sind größer als der Rest der Library zusammen,
// daher via dynamic import + einmalige Initialisierung im Modul-Scope.
// So zahlt eine Session den Dictionary-Load genau einmal.
let zxcvbnReady: Promise<(pw: string, userInputs?: (string | number)[]) => {
  score: 0 | 1 | 2 | 3 | 4
  feedback: { warning: string | null; suggestions: string[] }
}> | null = null

function getZxcvbn() {
  if (!zxcvbnReady) {
    zxcvbnReady = (async () => {
      const [core, common, de] = await Promise.all([
        import('@zxcvbn-ts/core'),
        import('@zxcvbn-ts/language-common'),
        import('@zxcvbn-ts/language-de'),
      ])
      core.zxcvbnOptions.setOptions({
        translations: de.translations,
        graphs: common.adjacencyGraphs,
        dictionary: {
          ...common.dictionary,
          ...de.dictionary,
        },
      })
      return (pw: string, userInputs: (string | number)[] = []) => {
        const result = core.zxcvbn(pw, userInputs)
        return {
          score: result.score,
          feedback: {
            warning: result.feedback.warning,
            suggestions: result.feedback.suggestions,
          },
        }
      }
    })()
  }
  return zxcvbnReady
}

// ── Asynchrone Voll-Validierung ────────────────────────────────
/**
 * Prüft Passwort gegen Regex-Mindestregeln UND zxcvbn-Dictionary.
 * Score < 3 (→ „zu schwach") wird als Fehler gemeldet.
 *
 * @param password  Das eingegebene Passwort.
 * @param userInputs Optionale Liste von Strings, die zxcvbn als persönlich
 *                   bekannt behandelt (E-Mail, Vor-/Nachname, Marke). Dadurch
 *                   wird z. B. „Alltagsengel2024!" als schwach erkannt,
 *                   wenn „Alltagsengel" im Kontext des Nutzers vorkommt.
 */
export async function validatePasswordAsync(
  password: string,
  userInputs: string[] = []
): Promise<PasswordValidationResult> {
  const base = validatePassword(password)

  // Wenn die Regex-Regeln schon scheitern, sparen wir uns zxcvbn nicht
  // (der Nutzer soll zugleich Feedback zu Dictionary-Treffern sehen),
  // führen die Prüfung aber trotzdem aus.
  try {
    const zx = await getZxcvbn()
    const result = zx(password, userInputs)

    let zxStrength: 'weak' | 'medium' | 'strong' = 'weak'
    if (result.score >= 3) zxStrength = 'strong'
    else if (result.score === 2) zxStrength = 'medium'

    if (result.score < 3) {
      // Nutzerfreundliche Fehlermeldung — zxcvbn-Feedback ist schon DE-lokalisiert.
      const msg = result.feedback.warning
        ? `Zu schwach: ${result.feedback.warning}`
        : 'Passwort zu schwach (Wörterbuch-Treffer oder gängiges Muster)'
      base.errors.push(msg)
      base.valid = false
    }

    return {
      ...base,
      valid: base.errors.length === 0,
      strength: zxStrength,
      score: result.score,
      feedback: {
        warning: result.feedback.warning || undefined,
        suggestions: result.feedback.suggestions,
      },
    }
  } catch (err) {
    // Fail-safe: Wenn zxcvbn nicht lädt (z. B. Netzfehler), nur Regex-Regeln.
    // Wir blockieren den Nutzer NICHT zusätzlich, damit der Login/Register
    // nicht komplett ausfällt — im Zweifel sind die Regex-Regeln die
    // minimale Linie. Das Ereignis landet im Log.
    console.warn('[password-validation] zxcvbn load failed — fallback to regex only.', err)
    return base
  }
}

// ── Legacy-Common-Password-Liste (deprecated, zxcvbn ersetzt das) ─────────
// Beibehalten, damit bestehende Call-Sites nicht brechen. zxcvbn kennt
// deutlich mehr Muster (30 000+ gängige Passwörter + DE-Wörterbuch +
// Keyboard-Layouts + Sequenzen), daher ist diese Liste nur noch Fallback.
const COMMON_PASSWORDS = [
  'password', 'passwort', '12345678', '123456789', 'qwertyui',
  'abcdefgh', 'iloveyou', 'admin123', 'welcome1', 'letmein1',
  'password1', 'passwort1', '11111111', '00000000', 'testtest',
]

/** @deprecated Nutze stattdessen `validatePasswordAsync`. */
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.includes(password.toLowerCase())
}
