/**
 * Der Abrechnungslauf, der für immer auf „Export…" stehen blieb
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 72)
 *
 * `exportiereLauf()` schaltet den Lauf zuerst auf `export_laeuft` und
 * erledigt danach alles Übrige: Rechnungen, Klienten, Verordnungen und
 * Leistungen laden, Zertifikat prüfen, EDIFACT erzeugen, hochladen,
 * DAKOTA-Aufträge anlegen. Rund 370 Zeilen, an denen an vielen Stellen
 * geworfen wird — und KEINE davon holte den Lauf wieder heraus. Nur ein
 * einziger Fehlerfall (die EDIFACT-Erzeugung) hatte ein eigenes catch.
 *
 * Was das bedeutet, steht im Zustandstrigger, live aus `pg_proc` gelesen:
 *
 *     WHEN 'export_laeuft' THEN erlaubt :=
 *       ARRAY['bereit_zum_export', 'exportiert', 'validierung_fehlgeschlagen'];
 *
 * Aus `export_laeuft` führt kein Weg zurück nach `freigegeben` — und auch
 * keiner nach `storniert`. Ein neuer Exportversuch scheitert an der
 * Eingangsprüfung („Export nur aus freigegeben möglich"), stornieren geht
 * nicht, und der einzige Ausweg `validierung_fehlgeschlagen` wurde in
 * fast keinem Fehlerfall gesetzt.
 *
 * Die Kassenabrechnung eines ganzen Monats wäre ohne Eingriff in der
 * Datenbank nicht mehr zu versenden gewesen.
 *
 * `validierung_fehlgeschlagen` ist der richtige Ausgang: von dort führt
 * der Weg über `validierung_laeuft` zurück nach `geprueft` und
 * `freigegeben`. Der Lauf ist danach wieder versendbar.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'
import { exportiereLauf } from '@/lib/abrechnung/kassenabrechnung-engine'

const SRC = readFileSync('lib/abrechnung/kassenabrechnung-engine.ts', 'utf8')

/** Der Rumpf einer Top-Level-Funktion bis zur nächsten. */
function funktion(name: string): string {
  const ab = SRC.indexOf(`function ${name}(`)
  expect(ab, `${name} nicht gefunden`).toBeGreaterThan(-1)
  const rest = SRC.slice(ab + name.length)
  const bis = rest.search(/\n(export )?async function |\n\/\/ ── /)
  return rest.slice(0, bis === -1 ? undefined : bis)
}

describe('exportiereLauf — der Zustand wird wieder freigegeben', () => {
  const RUMPF = funktion('exportiereLauf')

  it('schaltet weiterhin zuerst auf export_laeuft', () => {
    expect(RUMPF).toContain("{ status: 'export_laeuft' }")
  })

  it('und alles danach steht unter einem try', () => {
    expect(RUMPF.indexOf("{ status: 'export_laeuft' }"))
      .toBeLessThan(RUMPF.indexOf('try {'))
    expect(RUMPF).toContain('return await fuehreExportDurch(')
  })

  it('jeder Abbruch löst die Sperre', () => {
    expect(RUMPF).toContain('catch (err) {')
    expect(RUMPF).toContain('await loeseExportSperre(supabase, lauf, laufId, err)')
  })

  it('und die ursprüngliche Ausnahme geht nicht verloren', () => {
    // Der Grund des Abbruchs ist die Auskunft, die jemand braucht. Die
    // Befreiung ist ein Zusatz, kein Ersatz.
    expect(RUMPF).toContain('throw err')
    expect(RUMPF).toMatch(/throw new Error\(`\$\{err instanceof Error \? err\.message/)
  })
})

describe('loeseExportSperre — was sie tut und was nicht', () => {
  const RUMPF = funktion('loeseExportSperre')

  it('schreibt in den einzigen Ausgang, den der Trigger zulässt', () => {
    expect(RUMPF).toContain("{ status: 'validierung_fehlgeschlagen' }")
  })

  it('und nur, solange der Lauf noch auf export_laeuft steht', () => {
    expect(RUMPF).toContain("if (stand.status !== 'export_laeuft') return null")
    // Zusätzlich als Bedingung am Schreibvorgang selbst — gegen zwei
    // gleichzeitige Durchläufe.
    expect(RUMPF).toContain("vonStatus: 'export_laeuft'")
  })

  it('nimmt den Lesefehler entgegen, statt ihn für „schon vermerkt" zu halten', () => {
    expect(RUMPF).toContain('const { data: stand, error: leseFehler }')
    expect(RUMPF).toContain('if (leseFehler) {')
  })

  it('meldet, wenn die Befreiung selbst scheitert — mit der Folge', () => {
    expect(RUMPF).toMatch(/weder exportieren noch stornieren/)
  })

  it('prüft auch den Protokolleintrag', () => {
    expect(RUMPF).toContain('const { error: protokollFehler }')
    expect(RUMPF).toContain('if (protokollFehler) {')
  })

  it('sagt dabei, dass der Lauf trotzdem wieder versendbar ist', () => {
    // Ein fehlender Protokolleintrag ist ein anderer Schaden als eine
    // stehengebliebene Sperre — die Meldung darf beides nicht vermengen.
    const teil = RUMPF.slice(RUMPF.indexOf('if (protokollFehler) {'))
    expect(teil).toMatch(/wieder versendbar/)
  })

  it('gibt im Normalfall nichts zurück', () => {
    // Der Ausschnitt reicht bis in den Kommentarkopf der naechsten
    // Funktion — geprüft wird deshalb der Abschluss des Rumpfes, nicht
    // das Ende des Ausschnitts.
    expect(RUMPF).toContain('\n  return null\n}')
  })
})

describe('Die näheren Fehlerpfade bleiben unangetastet', () => {
  it('die EDIFACT-Erzeugung vermerkt weiterhin selbst', () => {
    const RUMPF = funktion('fuehreExportDurch')
    expect(RUMPF).toContain("fehler_quelle: 'export'")
    expect(RUMPF).toContain("fehler_quelle: 'validierung'")
    expect((RUMPF.match(/status: 'validierung_fehlgeschlagen'/g) ?? []).length)
      .toBeGreaterThanOrEqual(2)
  })

  it('und werden von der Sperrenlösung nicht doppelt vermerkt', () => {
    // Sie haben den Lauf bereits weitergeschaltet; die Statusabfrage in
    // loeseExportSperre steigt dann aus.
    const RUMPF = funktion('loeseExportSperre')
    expect(RUMPF.indexOf("if (stand.status !== 'export_laeuft') return null"))
      .toBeLessThan(RUMPF.indexOf('aktualisiereLauf'))
  })
})

describe('Der Zustandstrigger, gegen den das gemessen wurde', () => {
  it('ist in der Migration genauso hinterlegt wie live', () => {
    const MIG = readFileSync(
      'supabase/migrations/20260808220000_kassenabrechnung_dta_dakota.sql', 'utf8',
    )
    const zeile = MIG.split('\n').find(z => z.includes("WHEN 'export_laeuft' THEN"))
    expect(zeile).toBeDefined()
    const idx = MIG.indexOf("WHEN 'export_laeuft' THEN")
    const folge = MIG.slice(idx, idx + 200)
    expect(folge).toContain('validierung_fehlgeschlagen')
    // Kein Rueckweg nach freigegeben und kein storniert — das IST der Befund.
    expect(folge.slice(0, folge.indexOf('WHEN', 5) === -1 ? 160 : folge.indexOf('WHEN', 5)))
      .not.toContain("'freigegeben'")
  })
})


// ════════════════════════════════════════════════════════════════════
// Im Lauf, nicht nur im Quelltext
// ════════════════════════════════════════════════════════════════════

const LAUF = 'lauf-1'
const ORG = '11111111-1111-4111-8111-111111111111'

/**
 * Fake, der den Export gleich am ersten Schritt nach der Statusumschaltung
 * scheitern laesst — der Fall, der den Lauf vorher festgesetzt hat.
 *
 * Der Status wird MITGEFUEHRT: sonst koennte der Test nicht unterscheiden,
 * ob die Befreiung geschrieben wurde oder ob sie nur versucht wurde.
 */
function exportFake(over: {
  rechnungenFehler?: { message: string; code?: string }
  statusLeseFehler?: { message: string; code?: string }
  befreiungFehler?: { message: string; code?: string }
  protokollFehler?: { message: string; code?: string }
} = {}) {
  let status = 'freigegeben'
  const fake = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === 'abrechnungslaeufe') {
      if (a.operation === 'update') {
        const neu = (a.payload as { status?: string })?.status
        if (neu === 'validierung_fehlgeschlagen' && over.befreiungFehler) {
          return { error: over.befreiungFehler }
        }
        if (neu) status = neu
        return { data: [{ id: LAUF }] }
      }
      if (over.statusLeseFehler && status === 'export_laeuft') {
        return { error: over.statusLeseFehler }
      }
      return { data: { id: LAUF, status, organization_id: ORG, bundesland: 'hessen' } }
    }
    if (a.tabelle === 'dta_lauf_rechnungen') {
      return over.rechnungenFehler
        ? { error: over.rechnungenFehler }
        : { data: [] }
    }
    if (a.tabelle === 'dta_fehlerprotokoll') {
      return over.protokollFehler ? { error: over.protokollFehler } : { data: null }
    }
    return {}
  })
  return { fake, stand: () => status }
}

async function exportVersuch(over: Parameters<typeof exportFake>[0] = {}) {
  const { fake, stand } = exportFake(over)
  let fehler: Error | null = null
  try {
    await exportiereLauf(fake.client, LAUF, '999999999', 'actor-1')
  } catch (e) {
    fehler = e as Error
  }
  return { fehler, stand: stand(), aufrufe: fake.aufrufe }
}

describe('Der Lauf bleibt nicht auf export_laeuft stehen', () => {
  it('ein Abbruch beim Laden der Rechnungen setzt ihn auf validierung_fehlgeschlagen', async () => {
    const r = await exportVersuch({ rechnungenFehler: { message: 'connection reset', code: '08006' } })
    expect(r.fehler).not.toBeNull()
    expect(r.stand).toBe('validierung_fehlgeschlagen')
  })

  it('auch eine leere Rechnungsliste fuehrt nicht in die Sackgasse', async () => {
    // Sie wirft „Keine Rechnungen im Lauf" — vorher genauso festsetzend.
    const r = await exportVersuch()
    expect(r.fehler?.message).toMatch(/Keine Rechnungen im Lauf/)
    expect(r.stand).toBe('validierung_fehlgeschlagen')
  })

  it('der Abbruch landet im Fehlerprotokoll', async () => {
    const r = await exportVersuch()
    const protokoll = r.aufrufe.filter(a => a.tabelle === 'dta_fehlerprotokoll')
    expect(protokoll).toHaveLength(1)
    expect((protokoll[0].payload as { fehler_meldung: string }).fehler_meldung)
      .toMatch(/Export abgebrochen/)
  })

  it('die urspruengliche Ausnahme bleibt die Auskunft', async () => {
    const r = await exportVersuch({ rechnungenFehler: { message: 'connection reset', code: '08006' } })
    expect(r.fehler?.message).toMatch(/Keine Rechnungen im Lauf/)
  })
})

describe('Wenn die Befreiung selbst scheitert', () => {
  it('sagt die Meldung, dass der Lauf feststeht', async () => {
    const r = await exportVersuch({ befreiungFehler: { message: 'permission denied', code: '42501' } })
    expect(r.stand).toBe('export_laeuft')
    expect(r.fehler?.message).toMatch(/weder exportieren noch stornieren/)
  })

  it('und der Grund des Abbruchs steht weiterhin darin', async () => {
    const r = await exportVersuch({ befreiungFehler: { message: 'permission denied', code: '42501' } })
    expect(r.fehler?.message).toMatch(/Keine Rechnungen im Lauf/)
  })

  it('ein unlesbarer Stand wird nicht als „schon vermerkt" gelesen', async () => {
    const r = await exportVersuch({ statusLeseFehler: { message: 'connection reset', code: '08006' } })
    expect(r.fehler?.message).toMatch(/nicht gelesen werden/)
    expect(r.stand).toBe('export_laeuft')
  })

  it('ein fehlender Protokolleintrag wird benannt, ohne die Befreiung kleinzureden', async () => {
    const r = await exportVersuch({ protokollFehler: { message: 'x', code: '42501' } })
    expect(r.stand).toBe('validierung_fehlgeschlagen')
    expect(r.fehler?.message).toMatch(/wieder versendbar/)
  })
})
