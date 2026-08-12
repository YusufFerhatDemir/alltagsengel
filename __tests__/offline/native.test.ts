import { describe, it, expect } from 'vitest'
import { laeuftInCapacitor as kameraLaeuftInCapacitor, dateiZuFoto, WebDateiKameraAdapter, erstelleKameraAdapter } from '@/lib/offline/kamera'
import { laeuftInCapacitor as gpsLaeuftInCapacitor, pruefePositionInnerhalbRadius, WebGeolocationAdapter, erstelleGpsAdapter } from '@/lib/offline/gps'

// ── Kamera-Adapter (Block 20 — kein @capacitor/camera installiert,
//    Web-Fallback über <input capture> + FileReader) ────────────────

describe('laeuftInCapacitor (Kamera)', () => {
  it('gibt false zurück außerhalb eines Browser-/WebView-Kontexts', () => {
    expect(kameraLaeuftInCapacitor()).toBe(false)
  })
})

describe('dateiZuFoto', () => {
  it('lehnt Nicht-Bilddateien ab', async () => {
    const datei = new File(['pdf-inhalt'], 'dokument.pdf', { type: 'application/pdf' })
    await expect(dateiZuFoto(datei)).rejects.toThrow('Nur Bilddateien')
  })
})

describe('WebDateiKameraAdapter', () => {
  it('wirft, wenn ohne setzeDatei() aufgenommen wird', async () => {
    const adapter = new WebDateiKameraAdapter()
    await expect(adapter.aufnehmen()).rejects.toThrow('Keine Datei übergeben')
  })

  it('ist als nicht-nativ gekennzeichnet', () => {
    const adapter = new WebDateiKameraAdapter()
    expect(adapter.istNativ).toBe(false)
  })

  it('reicht die Validierung von dateiZuFoto durch (Nicht-Bild wird abgelehnt)', async () => {
    const adapter = new WebDateiKameraAdapter()
    adapter.setzeDatei(new File(['x'], 'a.txt', { type: 'text/plain' }))
    await expect(adapter.aufnehmen()).rejects.toThrow('Nur Bilddateien')
  })
})

describe('erstelleKameraAdapter', () => {
  it('liefert einen WebDateiKameraAdapter, solange kein natives Plugin installiert ist', () => {
    const adapter = erstelleKameraAdapter()
    expect(adapter.istNativ).toBe(false)
    expect(adapter).toBeInstanceOf(WebDateiKameraAdapter)
  })
})

// ── GPS-Adapter (Block 20 — kein @capacitor/geolocation installiert,
//    Web-Geolocation-API als echte Default-Implementierung) ─────────

describe('laeuftInCapacitor (GPS)', () => {
  it('gibt false zurück außerhalb eines Browser-/WebView-Kontexts', () => {
    expect(gpsLaeuftInCapacitor()).toBe(false)
  })
})

describe('pruefePositionInnerhalbRadius', () => {
  it('erkennt eine Position innerhalb des Radius', () => {
    const position = { lat: 50.1109, lng: 8.6821, genauigkeit_m: 10, erfasst_am: Date.now() }
    const check = pruefePositionInnerhalbRadius(position, 50.1109, 8.6821, 150)
    expect(check.withinRadius).toBe(true)
    expect(check.distanceM).toBe(0)
  })

  it('erkennt eine Position außerhalb des Radius', () => {
    // ~1° Breitengrad-Unterschied ≈ 111 km — weit außerhalb jedes plausiblen Radius.
    const position = { lat: 51.1109, lng: 8.6821, genauigkeit_m: 10, erfasst_am: Date.now() }
    const check = pruefePositionInnerhalbRadius(position, 50.1109, 8.6821, 150)
    expect(check.withinRadius).toBe(false)
    expect(check.distanceM).toBeGreaterThan(100_000)
  })
})

describe('WebGeolocationAdapter', () => {
  it('lehnt ab, wenn navigator.geolocation nicht verfügbar ist (Node-Testumgebung)', async () => {
    const adapter = new WebGeolocationAdapter()
    await expect(adapter.aktuellePosition()).rejects.toThrow('Geolocation-API nicht verfügbar')
  })

  it('ist als nicht-nativ gekennzeichnet', () => {
    const adapter = new WebGeolocationAdapter()
    expect(adapter.istNativ).toBe(false)
  })
})

describe('erstelleGpsAdapter', () => {
  it('liefert einen WebGeolocationAdapter, solange kein natives Plugin installiert ist', () => {
    const adapter = erstelleGpsAdapter()
    expect(adapter.istNativ).toBe(false)
    expect(adapter).toBeInstanceOf(WebGeolocationAdapter)
  })
})
