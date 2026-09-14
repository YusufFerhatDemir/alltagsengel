// ═══════════════════════════════════════════════════════════════════════
// Block 28 — Riegel gegen die Rueckkehr erfundener Kennzahlen
//
// Die Befunde dieses Blocks sind keine Tippfehler, sondern eine Haltung:
// eine Zahl hinschreiben, die plausibel aussieht. Ein Test auf das
// Rechenergebnis faengt das nicht — er prueft nur die Formel, die gerade
// dasteht. Diese Datei prueft den Quelltext der Seite selbst.
// ═══════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const WURZEL = join(__dirname, '..', '..')

/**
 * Quelltext OHNE Kommentare.
 *
 * Noetig, weil die Dateien dieses Blocks ihre eigenen Befunde woertlich
 * dokumentieren — der Kopfkommentar von page.tsx zitiert „95 %
 * API-Verfügbarkeit" und „Pitch Deck v2" als das, was dort nicht mehr
 * stehen soll. Ohne diesen Schnitt prueft der Riegel die Erklaerung
 * statt die Seite und schlaegt auf die Dokumentation an.
 */
function ohneKommentare(quelle: string): string {
  return quelle
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const seite = ohneKommentare(readFileSync(join(WURZEL, 'app/mis/page.tsx'), 'utf8'))

describe('Kontrollzentrum — keine erfundenen Zahlen', () => {
  it('rechnet den Umsatz nicht mehr aus der Buchungsanzahl', () => {
    // Der Befund: `revenue: (bookingCount || 0) * UNIT_ECONOMICS.billingRatePerHour`.
    // Eine Buchung ist weder eine Stunde noch ein Euro.
    expect(seite).not.toMatch(/bookingCount/)
    expect(seite).not.toMatch(/billingRatePerHour\s*[,)]?\s*$/m)
    expect(seite).not.toMatch(/\*\s*UNIT_ECONOMICS\.billingRatePerHour/)
  })

  it('fragt Supabase nicht mehr ohne Mandantenbedingung vom Browser aus ab', () => {
    // Die alte Seite holte profiles/bookings/angels client-seitig und
    // ganz ohne organization_id. Die Zahlen kommen jetzt aus
    // /api/mis/kennzahlen, wo die Organisation feststeht.
    expect(seite).not.toMatch(/from\(['"](profiles|bookings|angels)['"]\)/)
    expect(seite).not.toMatch(/@\/lib\/supabase\/client/)
    expect(seite).toMatch(/\/api\/mis\/kennzahlen/)
  })

  it('zeigt bei einem Fehler eine Störung an, statt Nullen stehen zu lassen', () => {
    expect(seite).toMatch(/role="alert"/)
    expect(seite).toMatch(/setDaten\(null\)/)
  })

  it('enthält keine erfundene Aktivitätenliste mehr', () => {
    // Woertlich: „Pitch Deck v2 hochgeladen — vor 2 Stunden", seit jeher
    // unveraendert im Quelltext.
    expect(seite).not.toMatch(/Pitch Deck v2/)
    expect(seite).not.toMatch(/vor \d+ Stunden/)
    expect(seite).not.toMatch(/vor \d+ Tag/)
  })

  it('behauptet keine gemessene Systemverfügbarkeit mehr', () => {
    // `<ProgressBar value={95} label="API-Verfügbarkeit" />` — eine
    // Konstante, als Messung dargestellt.
    expect(seite).not.toMatch(/API-Verfügbarkeit/)
    expect(seite).not.toMatch(/Speicherauslastung/)
    expect(seite).not.toMatch(/value=\{\s*\d+\s*\}\s*label=/)
  })

  it('hat die fest verdrahteten Marktzahlen aus der Seite entfernt', () => {
    // TAM stand fest auf 50 Mrd. €, waehrend mis_kpis 24,6 fuehrt.
    expect(seite).not.toMatch(/title="TAM"/)
    expect(seite).not.toMatch(/title="SAM"/)
    expect(seite).toMatch(/mis_kpis/)
  })

  it('trennt Planannahmen sichtbar von gemessenen Zahlen', () => {
    expect(seite).toMatch(/Planannahmen/)
    expect(seite).toMatch(/\(Plan\)/)
  })

  it('setzt keinen festen Trendpfeil mehr auf gemessene Karten', () => {
    // Alle vier KPI-Karten trugen trend="up", unabhaengig von den Daten.
    expect(seite).not.toMatch(/trend="up"/)
  })
})

describe('Kontrollzentrum — die Route ist die Stelle mit der Organisation', () => {
  const route = ohneKommentare(readFileSync(join(WURZEL, 'app/api/mis/kennzahlen/route.ts'), 'utf8'))

  it('verlangt dasselbe Recht wie die Seite', () => {
    expect(route).toMatch(/requireOpsAdmin\('berichte\.lesen'\)/)
  })

  it('gibt die Organisation aus dem Auth-Ergebnis weiter, nicht aus der Anfrage', () => {
    expect(route).toMatch(/auth\.ctx\.organizationId/)
    expect(route).not.toMatch(/searchParams\.get\(['"]organization/)
  })

  it('ist als withTracking-Export verdrahtet', () => {
    expect(route).toMatch(/export const GET = withTracking\(/)
  })
})
