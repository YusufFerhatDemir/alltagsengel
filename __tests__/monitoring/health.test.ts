import { describe, it, expect } from 'vitest'
import { recordMetric, getMetrics, resetMetrics } from '@/lib/monitoring/metrics'

describe('monitoring/metrics', () => {
  it('leerer Buffer gibt Nullwerte', () => {
    resetMetrics()
    const m = getMetrics()
    expect(m.totalRequests).toBe(0)
    expect(m.totalErrors).toBe(0)
    expect(m.errorRate).toBe(0)
    expect(m.endpoints).toHaveLength(0)
    expect(m.instanceStartedAt).toBeTruthy()
  })

  it('recordMetric speichert und getMetrics aggregiert', () => {
    resetMetrics()

    recordMetric({ path: '/api/health', method: 'GET', statusCode: 200, durationMs: 10, timestamp: Date.now() })
    recordMetric({ path: '/api/health', method: 'GET', statusCode: 200, durationMs: 20, timestamp: Date.now() })
    recordMetric({ path: '/api/health', method: 'GET', statusCode: 500, durationMs: 100, timestamp: Date.now() })

    const m = getMetrics()
    expect(m.totalRequests).toBe(3)
    expect(m.totalErrors).toBe(1)
    // 1/3 ≈ 33.33%
    expect(m.errorRate).toBeGreaterThan(33)
    expect(m.errorRate).toBeLessThan(34)

    const ep = m.endpoints.find(e => e.path === '/api/health')
    expect(ep).toBeDefined()
    expect(ep!.count).toBe(3)
    expect(ep!.errors).toBe(1)
    expect(ep!.p50).toBe(20)
    expect(ep!.p99).toBe(100)
  })

  it('mehrere Endpunkte werden getrennt aggregiert', () => {
    resetMetrics()

    recordMetric({ path: '/api/a', method: 'GET', statusCode: 200, durationMs: 5, timestamp: Date.now() })
    recordMetric({ path: '/api/b', method: 'POST', statusCode: 201, durationMs: 15, timestamp: Date.now() })
    recordMetric({ path: '/api/b', method: 'POST', statusCode: 500, durationMs: 50, timestamp: Date.now() })

    const m = getMetrics()
    expect(m.totalRequests).toBe(3)
    expect(m.endpoints).toHaveLength(2)

    const epB = m.endpoints.find(e => e.path === '/api/b')
    expect(epB!.count).toBe(2)
    expect(epB!.errors).toBe(1)
    expect(epB!.errorRate).toBe(50)
  })

  it('Ring-Buffer ueberschreibt aelteste Eintraege', () => {
    resetMetrics()

    // 1001 Eintraege schreiben — Buffer hat max 1000
    for (let i = 0; i < 1001; i++) {
      recordMetric({
        path: `/api/test${i}`,
        method: 'GET',
        statusCode: 200,
        durationMs: i,
        timestamp: Date.now(),
      })
    }

    const m = getMetrics()
    // Buffer hat max 1000 Eintraege
    expect(m.totalRequests).toBe(1000)
    // Der erste Eintrag (test0) wurde ueberschrieben
    expect(m.endpoints.find(e => e.path === '/api/test0')).toBeUndefined()
    // Der letzte ist da
    expect(m.endpoints.find(e => e.path === '/api/test1000')).toBeDefined()
  })

  it('nur 5xx zaehlt als Fehler, 4xx nicht', () => {
    resetMetrics()

    recordMetric({ path: '/api/x', method: 'GET', statusCode: 400, durationMs: 5, timestamp: Date.now() })
    recordMetric({ path: '/api/x', method: 'GET', statusCode: 404, durationMs: 5, timestamp: Date.now() })
    recordMetric({ path: '/api/x', method: 'GET', statusCode: 500, durationMs: 5, timestamp: Date.now() })
    recordMetric({ path: '/api/x', method: 'GET', statusCode: 502, durationMs: 5, timestamp: Date.now() })

    const m = getMetrics()
    expect(m.totalErrors).toBe(2)
    expect(m.endpoints[0].errors).toBe(2)
  })

  it('uptimeSecs ist positiv', () => {
    resetMetrics()
    const m = getMetrics()
    expect(m.uptimeSecs).toBeGreaterThanOrEqual(0)
  })
})
