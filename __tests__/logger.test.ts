/**
 * Tests fuer den Structured Logger
 * @see lib/logger.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Dynamischer Import, damit wir NODE_ENV/LOG_LEVEL pro Test setzen koennen
// ---------------------------------------------------------------------------

async function importLogger() {
  // Jeder Import braucht einen frischen Modul-Cache
  vi.resetModules()
  return import('@/lib/logger')
}

describe('Structured Logger', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  // -----------------------------------------------------------------------
  // Production JSON output
  // -----------------------------------------------------------------------

  it('gibt in Production JSON-Zeilen aus', async () => {
    process.env.NODE_ENV = 'production'
    const { logger } = await importLogger()

    logger.info('Test-Nachricht', { module: 'test', userId: 'u-123' })

    expect(console.log).toHaveBeenCalledTimes(1)
    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const parsed = JSON.parse(output)

    expect(parsed.level).toBe('info')
    expect(parsed.message).toBe('Test-Nachricht')
    expect(parsed.module).toBe('test')
    expect(parsed.userId).toBe('u-123')
    expect(parsed.timestamp).toBeDefined()
    // ISO-8601 Format
    expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp)
  })

  // -----------------------------------------------------------------------
  // Log levels
  // -----------------------------------------------------------------------

  it('nutzt console.error fuer error-Level', async () => {
    process.env.NODE_ENV = 'production'
    const { logger } = await importLogger()

    logger.error('Schwerer Fehler')

    expect(console.error).toHaveBeenCalledTimes(1)
    const parsed = JSON.parse((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(parsed.level).toBe('error')
  })

  it('nutzt console.warn fuer warn-Level', async () => {
    process.env.NODE_ENV = 'production'
    const { logger } = await importLogger()

    logger.warn('Warnung')

    expect(console.warn).toHaveBeenCalledTimes(1)
    const parsed = JSON.parse((console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(parsed.level).toBe('warn')
  })

  // -----------------------------------------------------------------------
  // Level filtering
  // -----------------------------------------------------------------------

  it('filtert debug-Nachrichten in Production (default LOG_LEVEL=info)', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.LOG_LEVEL
    const { logger } = await importLogger()

    logger.debug('Unsichtbar')
    logger.info('Sichtbar')

    expect(console.debug).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledTimes(1)
  })

  it('respektiert LOG_LEVEL=error — nur error sichtbar', async () => {
    process.env.NODE_ENV = 'production'
    process.env.LOG_LEVEL = 'error'
    const { logger } = await importLogger()

    logger.debug('Unsichtbar')
    logger.info('Unsichtbar')
    logger.warn('Unsichtbar')
    logger.error('Sichtbar')

    expect(console.debug).not.toHaveBeenCalled()
    expect(console.log).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  // -----------------------------------------------------------------------
  // Child logger
  // -----------------------------------------------------------------------

  it('child() setzt module automatisch', async () => {
    process.env.NODE_ENV = 'production'
    const { logger } = await importLogger()

    const billingLog = logger.child('billing')
    billingLog.info('Rechnung erstellt', { invoiceId: 'inv-1' })

    const parsed = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(parsed.module).toBe('billing')
    expect(parsed.invoiceId).toBe('inv-1')
  })

  it('child()-Kontext laesst sich pro Aufruf erweitern', async () => {
    process.env.NODE_ENV = 'production'
    const { logger } = await importLogger()

    const log = logger.child('auth')
    log.warn('Rate-Limit erreicht', { ip: '1.2.3.4' })

    const parsed = JSON.parse((console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(parsed.module).toBe('auth')
    expect(parsed.ip).toBe('1.2.3.4')
  })

  // -----------------------------------------------------------------------
  // errorWithException
  // -----------------------------------------------------------------------

  it('errorWithException extrahiert Error-Details', async () => {
    process.env.NODE_ENV = 'production'
    const { logger } = await importLogger()

    const err = new TypeError('Ungueltig')
    logger.errorWithException('Verarbeitung fehlgeschlagen', err, { module: 'billing' })

    const parsed = JSON.parse((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(parsed.errorName).toBe('TypeError')
    expect(parsed.errorMessage).toBe('Ungueltig')
    expect(parsed.module).toBe('billing')
    // In Production kein Stack
    expect(parsed.stack).toBeUndefined()
  })

  it('errorWithException zeigt Stack in Development', async () => {
    process.env.NODE_ENV = 'development'
    process.env.LOG_LEVEL = 'error'
    const { logger } = await importLogger()

    const err = new Error('Test')
    logger.errorWithException('Fehler', err)

    const output = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0]
    // Development-Format enthaelt den Stack im JSON-Teil
    expect(output).toContain('stack')
  })

  // -----------------------------------------------------------------------
  // Pre-built loggers
  // -----------------------------------------------------------------------

  it('exportiert vorgefertigte Modul-Logger', async () => {
    process.env.NODE_ENV = 'production'
    const { billingLogger, authLogger, adminLogger, auditLogger } = await importLogger()

    billingLogger.info('test')
    expect(JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]).module).toBe('billing')

    authLogger.info('test')
    expect(JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[1][0]).module).toBe('auth')

    adminLogger.info('test')
    expect(JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[2][0]).module).toBe('admin')

    auditLogger.info('test')
    expect(JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[3][0]).module).toBe('audit')
  })

  // -----------------------------------------------------------------------
  // Development format (human-readable)
  // -----------------------------------------------------------------------

  it('gibt in Development lesbares Format aus', async () => {
    process.env.NODE_ENV = 'development'
    process.env.LOG_LEVEL = 'info'
    const { logger } = await importLogger()

    logger.info('Hallo Welt', { module: 'test' })

    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]
    // Sollte KEINE JSON-Zeile sein, sondern lesbares Format mit Level-Tag
    expect(output).toContain('INFO')
    expect(output).toContain('[test]')
    expect(output).toContain('Hallo Welt')
  })

  // -----------------------------------------------------------------------
  // Non-Error in errorWithException
  // -----------------------------------------------------------------------

  it('errorWithException behandelt nicht-Error-Objekte', async () => {
    process.env.NODE_ENV = 'production'
    const { logger } = await importLogger()

    logger.errorWithException('Problem', 'string-fehler')

    const parsed = JSON.parse((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(parsed.errorMessage).toBe('string-fehler')
    expect(parsed.errorName).toBe('Error')
  })

  it('errorWithException extrahiert message/code aus Nicht-Error-Objekten', async () => {
    process.env.NODE_ENV = 'production'
    const { logger } = await importLogger()

    // Supabase (PostgrestError) und Resend liefern einfache Objekte, keine
    // Error-Instanzen. String(obj) waere '[object Object]' — die Ursache
    // muss trotzdem im Log landen.
    logger.errorWithException('DB-Fehler', {
      message: 'duplicate key value',
      code: '23505',
      details: 'Key (id)=(1) already exists.',
      hint: 'unique constraint',
    })

    const parsed = JSON.parse((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(parsed.errorMessage).toBe('duplicate key value')
    expect(parsed.errorCode).toBe('23505')
    expect(parsed.errorDetails).toBe('Key (id)=(1) already exists.')
    expect(parsed.errorHint).toBe('unique constraint')
  })

  it('errorWithException verschluckt Objekte ohne message nicht', async () => {
    process.env.NODE_ENV = 'production'
    const { logger } = await importLogger()

    logger.errorWithException('Fehler', { foo: 'bar' })

    const parsed = JSON.parse((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(parsed.errorMessage).toBe('{"foo":"bar"}')
  })

  it('warnWithException loggt auf Level warn statt error', async () => {
    process.env.NODE_ENV = 'production'
    const { logger } = await importLogger()

    logger.warnWithException('Nicht blockierend', new Error('kaputt'), { module: 'test' })

    expect(console.error).not.toHaveBeenCalled()
    const parsed = JSON.parse((console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(parsed.level).toBe('warn')
    expect(parsed.module).toBe('test')
    expect(parsed.errorName).toBe('Error')
    expect(parsed.errorMessage).toBe('kaputt')
  })

  it('child-Logger-Kontext bleibt bei errorWithException erhalten', async () => {
    process.env.NODE_ENV = 'production'
    const { logger } = await importLogger()

    logger.child('billing').errorWithException('Rechnung kaputt', new Error('x'), { invoiceId: 'r-1' })

    const parsed = JSON.parse((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(parsed.module).toBe('billing')
    expect(parsed.invoiceId).toBe('r-1')
  })
})
