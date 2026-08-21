/**
 * Structured Logger
 *
 * Leichtgewichtiger, abhaengigkeitsfreier Logger mit strukturierter Ausgabe.
 *
 * - Production: JSON-Zeilen (maschinenlesbar, kompatibel mit Vercel/Sentry)
 * - Development: lesbares Format mit Farben
 *
 * Log-Level: debug < info < warn < error
 * Konfiguration via LOG_LEVEL Umgebungsvariable (default: 'info' in prod, 'debug' in dev)
 *
 * Nutzung:
 *   import { logger } from '@/lib/logger'
 *   logger.info('Rechnung erstellt', { module: 'billing', invoiceId: '...' })
 *
 * Modul-Logger (empfohlen):
 *   const log = logger.child('billing')
 *   log.info('Rechnung erstellt', { invoiceId: '...' })
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  /** Modul/Bereich (z.B. 'billing', 'auth', 'admin') */
  module?: string
  /** Korrelations-ID (z.B. aus error-sanitizer) */
  correlationId?: string
  /** Benutzer-ID */
  userId?: string
  /** Beliebige weitere Felder */
  [key: string]: unknown
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  module?: string
  correlationId?: string
  userId?: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m',  // cyan
  info:  '\x1b[32m',  // green
  warn:  '\x1b[33m',  // yellow
  error: '\x1b[31m',  // red
}

const RESET = '\x1b[0m'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

function getMinLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined
  if (envLevel && envLevel in LEVEL_PRIORITY) return envLevel
  return isProduction() ? 'info' : 'debug'
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getMinLevel()]
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry)
}

function formatDev(entry: LogEntry): string {
  const color = LEVEL_COLORS[entry.level]
  const tag = entry.level.toUpperCase().padEnd(5)
  const mod = entry.module ? ` [${entry.module}]` : ''

  // Extract extra context fields (exclude standard ones)
  const extras: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(entry)) {
    if (['timestamp', 'level', 'message', 'module'].includes(key)) continue
    if (val === undefined) continue
    extras[key] = val
  }

  const extraStr = Object.keys(extras).length > 0
    ? ' ' + JSON.stringify(extras)
    : ''

  return `${color}${tag}${RESET}${mod} ${entry.message}${extraStr}`
}

// ---------------------------------------------------------------------------
// Core log function
// ---------------------------------------------------------------------------

function emitLog(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  }

  const formatted = isProduction() ? formatJson(entry) : formatDev(entry)

  switch (level) {
    case 'error':
      console.error(formatted)
      break
    case 'warn':
      console.warn(formatted)
      break
    case 'debug':
      console.debug(formatted)
      break
    default:
      console.log(formatted)
  }
}

// ---------------------------------------------------------------------------
// Error-Normalisierung
// ---------------------------------------------------------------------------

/**
 * Extrahiert loggbare Felder aus einem beliebigen Fehlerwert.
 *
 * Wichtig: Nicht jeder Fehler ist eine Error-Instanz. Supabase (PostgrestError),
 * Resend und fetch-Wrapper liefern einfache Objekte mit message/code/details.
 * String(obj) wuerde daraus '[object Object]' machen und die Ursache
 * verschlucken — deshalb werden diese Felder hier gezielt uebernommen.
 */
function normalizeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: err.message,
      ...(isProduction() ? {} : { stack: err.stack }),
    }
  }
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>
    const out: Record<string, unknown> = {
      errorName: typeof o.name === 'string' ? o.name : 'Object',
      errorMessage:
        typeof o.message === 'string' ? o.message : safeStringify(err),
    }
    if (typeof o.code === 'string' || typeof o.code === 'number') out.errorCode = o.code
    if (typeof o.details === 'string') out.errorDetails = o.details
    if (typeof o.hint === 'string') out.errorHint = o.hint
    if (typeof o.status === 'number') out.errorStatus = o.status
    return out
  }
  // Primitive (string/number/...) verhalten sich wie bisher: als Error gewertet,
  // damit bestehende Auswertungen auf errorName unveraendert greifen.
  return { errorName: 'Error', errorMessage: String(err) }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

// ---------------------------------------------------------------------------
// Logger class
// ---------------------------------------------------------------------------

class Logger {
  private defaultContext: LogContext

  constructor(defaultContext: LogContext = {}) {
    this.defaultContext = defaultContext
  }

  /**
   * Erzeugt einen Kind-Logger mit voreingestelltem Modul-Namen.
   *
   * const log = logger.child('billing')
   * log.info('Rechnung erstellt') // -> module: 'billing'
   */
  child(module: string, extraContext?: LogContext): Logger {
    return new Logger({ ...this.defaultContext, module, ...extraContext })
  }

  debug(message: string, context?: LogContext): void {
    emitLog('debug', message, { ...this.defaultContext, ...context })
  }

  info(message: string, context?: LogContext): void {
    emitLog('info', message, { ...this.defaultContext, ...context })
  }

  warn(message: string, context?: LogContext): void {
    emitLog('warn', message, { ...this.defaultContext, ...context })
  }

  error(message: string, context?: LogContext): void {
    emitLog('error', message, { ...this.defaultContext, ...context })
  }

  /**
   * Loggt einen Error mit automatischer Extraktion von name/message/stack.
   * Stack wird nur in Development mitgeloggt.
   */
  errorWithException(message: string, err: unknown, context?: LogContext): void {
    emitLog('error', message, {
      ...this.defaultContext,
      ...context,
      ...normalizeError(err),
    })
  }

  /**
   * Wie errorWithException, aber auf Level 'warn' — fuer nicht-blockierende
   * Fehler (z.B. fehlgeschlagene Benachrichtigung), die den Hauptpfad nicht
   * scheitern lassen.
   */
  warnWithException(message: string, err: unknown, context?: LogContext): void {
    emitLog('warn', message, {
      ...this.defaultContext,
      ...context,
      ...normalizeError(err),
    })
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const logger = new Logger()

// ---------------------------------------------------------------------------
// Pre-built module loggers (convenience)
// ---------------------------------------------------------------------------

export const billingLogger = logger.child('billing')
export const authLogger = logger.child('auth')
export const adminLogger = logger.child('admin')
export const auditLogger = logger.child('audit')
export const apiLogger = logger.child('api')
export const engelLogger = logger.child('engel')
export const kundeLogger = logger.child('kunde')
export const pflegeLogger = logger.child('pflege')
