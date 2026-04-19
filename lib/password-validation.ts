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

// ── HIBP "Have I Been Pwned" — k-Anonymity Breach Check ─────────
//
// Idee: Wir wollen wissen, ob ein Passwort bereits in einem
// öffentlichen Datenleck aufgetaucht ist (z. B. LinkedIn 2012,
// Adobe 2013, Yahoo 2014 — Milliarden Datensätze). Aber wir wollen
// das Passwort NIEMALS im Klartext oder als vollen Hash an einen
// fremden Server schicken.
//
// Lösung (k-Anonymity, von Troy Hunt erfunden):
//   1. SHA-1 vom Passwort bilden (z. B. "P@ssw0rd" → "21BD12...")
//   2. Nur die ersten 5 Zeichen des Hashes an die API schicken
//   3. Server schickt eine Liste ALLER Passwort-Hashes zurück,
//      die mit diesen 5 Zeichen anfangen (typisch: 300-800 Stück)
//   4. Wir suchen lokal in der Liste, ob unser voller Hash drin ist
//
// Analogie: Du fragst beim Telefonbuch "wer hat eine Nummer mit
// Vorwahl 0211?" und bekommst alle Düsseldorfer zurück. Niemand
// weiß welche genaue Nummer du eigentlich gesucht hast — du
// schaust selbst nach.
//
// Verwendet Web Crypto API (verfügbar in Node 20+, allen modernen
// Browsern, Edge Runtime, Deno). Kein npm-Package nötig.
// ════════════════════════════════════════════════════════════════

const HIBP_API_URL = 'https://api.pwnedpasswords.com/range/'
const HIBP_TIMEOUT_MS = 3000 // 3s — Login soll nicht hängen wenn API langsam

/**
 * Prüft, ob `password` in einem bekannten Datenleck enthalten ist.
 *
 * Verwendet die HIBP "Pwned Passwords" k-Anonymity API:
 *   POST nicht nötig — GET reicht, nur die ersten 5 Zeichen des SHA-1.
 *
 * @returns `true` wenn das Passwort kompromittiert ist, sonst `false`.
 *          Bei Netzfehler / Timeout: `false` (fail-safe — User wird
 *          nicht blockiert wenn die API down ist; das Ereignis landet
 *          im console.warn).
 */
export async function checkPasswordBreach(password: string): Promise<boolean> {
  if (!password) return false

  try {
    // SHA-1 via Web Crypto API
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-1', data)
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()

    const prefix = hashHex.slice(0, 5)
    const suffix = hashHex.slice(5)

    // Timeout via AbortController — Login darf nicht ewig warten
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(`${HIBP_API_URL}${prefix}`, {
        method: 'GET',
        signal: controller.signal,
        // Add-Padding: Server sendet zufällige Hash-Länge zurück, damit
        // ein Angreifer aus der Response-Größe nichts ableiten kann.
        headers: { 'Add-Padding': 'true' },
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      console.warn('[checkPasswordBreach] HIBP API returned non-OK:', response.status)
      return false
    }

    const text = await response.text()

    // Format pro Zeile: "SUFFIX:COUNT"  (z. B. "1E4C9B93F3F0682250B6CF8331B7EE68FD8:3303003")
    // Padding-Eintraege haben COUNT=0 — wir ignorieren sie (zur Sicherheit).
    const lines = text.split('\n')
    for (const line of lines) {
      const [hashSuffix, countStr] = line.trim().split(':')
      if (!hashSuffix) continue
      if (hashSuffix.toUpperCase() === suffix && Number(countStr) > 0) {
        return true
      }
    }
    return false
  } catch (err: any) {
    // Fail-safe: Netzfehler / Timeout / SubtleCrypto-Probleme
    if (err?.name === 'AbortError') {
      console.warn('[checkPasswordBreach] HIBP API timeout — skipping breach check')
    } else {
      console.warn('[checkPasswordBreach] HIBP check failed — skipping:', err?.message || err)
    }
    return false
  }
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
 * @param options.checkBreach Wenn true (Default), wird zusätzlich gegen
 *                   die HIBP-Datenleck-Datenbank geprüft. Setze false,
 *                   wenn du nicht ins Internet willst (z. B. in Tests).
 */
export async function validatePasswordAsync(
  password: string,
  userInputs: string[] = [],
  options: { checkBreach?: boolean } = {}
): Promise<PasswordValidationResult> {
  const { checkBreach = true } = options
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

    // ── HIBP-Breach-Check ───────────────────────────────────────
    // Parallelisierung wäre möglich (Promise.all mit zxcvbn), aber:
    // 1. zxcvbn lädt schon Dictionary-Files → dominiert die Latenz
    // 2. HIBP nur prüfen wenn die Basics OK sind, sonst Netz-Verschwendung
    // 3. Wenn Regex-Regeln versagen, ist HIBP irrelevant — Nutzer muss
    //    sowieso ein neues Passwort wählen
    if (checkBreach && base.errors.length === 0 && password.length >= 8) {
      const isBreached = await checkPasswordBreach(password)
      if (isBreached) {
        base.errors.push(
          'Dieses Passwort wurde in einem Datenleak gefunden. Bitte wähle ein anderes.'
        )
        base.valid = false
      }
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
