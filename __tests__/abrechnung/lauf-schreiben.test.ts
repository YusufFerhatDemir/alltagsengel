/**
 * Zustandswechsel eines Abrechnungslaufs.
 * @see lib/abrechnung/lauf-schreiben.ts
 *
 * ── DER BEFUND VOM 13.09.2026 ─────────────────────────────────────────
 * Dreizehn Schreibvorgänge auf `abrechnungslaeufe` standen als nacktes
 * `await supabase…` da — ohne Destrukturierung, ohne `error`-Prüfung, ohne
 * Rückfrage, ob eine Zeile getroffen wurde. Verteilt über Engine, Versand,
 * Rückläufer und Korrekturläufe. **Keiner** wurde ausgewertet.
 *
 * Das ist die Zustandsmaschine, die Abrechnungen an Kostenträger steuert.
 * Geht ein Übergang verloren, läuft der Vorgang weiter, als wäre er
 * geschehen: die Engine validiert einen Lauf, der in der Datenbank noch
 * „erstellt" heißt, und exportiert ihn danach.
 */
import { describe, it, expect, vi } from 'vitest'
import { aktualisiereLauf } from '@/lib/abrechnung/lauf-schreiben'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const LAUF = '22222222-2222-4222-8222-222222222222'

function fake(antwort: { data?: unknown; error?: { message: string } | null }) {
  return erstelleFakeSupabase((a: FakeAufruf) =>
    a.tabelle === 'abrechnungslaeufe' ? { data: antwort.data ?? null, error: antwort.error ?? null } : undefined)
}

const update = (f: ReturnType<typeof fake>) =>
  f.aufrufe.find(a => a.tabelle === 'abrechnungslaeufe' && a.operation === 'update')

describe('aktualisiereLauf', () => {
  it('schreibt die Nutzlast und verlangt eine Rückmeldung', async () => {
    const f = fake({ data: [{ id: LAUF }] })
    await aktualisiereLauf(f.client as never, LAUF, { status: 'geprueft' }, { schritt: 'Validierung bestanden' })
    const u = update(f)
    expect(u, 'kein Update abgesetzt').toBeDefined()
    expect((u!.payload as any).status).toBe('geprueft')
    expect(u!.spalten, 'ohne select() bleibt die Wirkung unbekannt').toBeTruthy()
  })

  it('wirft, wenn KEINE Zeile getroffen wurde', async () => {
    // Genau der Fall, den PostgREST ohne Fehler zurueckgibt.
    const f = fake({ data: [] })
    await expect(
      aktualisiereLauf(f.client as never, LAUF, { status: 'exportiert' }, { schritt: 'Export abgeschlossen' }),
    ).rejects.toThrow(/ohne Wirkung/)
  })

  it('nennt den Schritt in der Ausnahme, nicht nur die Tabelle', async () => {
    // Wer den Fehler liest, soll ohne Stacktrace wissen, welcher Uebergang
    // gescheitert ist.
    const f = fake({ data: [] })
    await expect(
      aktualisiereLauf(f.client as never, LAUF, {}, { schritt: 'Uebermittlung gestartet' }),
    ).rejects.toThrow(/Uebermittlung gestartet/)
  })

  it('reicht einen Datenbankfehler mit Schrittnamen weiter', async () => {
    const f = fake({ error: { message: 'Verbindung weg' } })
    await expect(
      aktualisiereLauf(f.client as never, LAUF, {}, { schritt: 'Export gestartet' }),
    ).rejects.toThrow(/Export gestartet fehlgeschlagen: Verbindung weg/)
  })

  it('hängt den Mandantenfilter an, wenn der Aufrufer ihn kennt', async () => {
    const f = fake({ data: [{ id: LAUF }] })
    await aktualisiereLauf(f.client as never, LAUF, {}, { schritt: 'x', organizationId: ORG })
    expect(hatOrgFence(update(f), ORG)).toBe(true)
  })

  it('ohne organizationId wird KEIN leerer Filter gesetzt', async () => {
    // Ein `.eq('organization_id', undefined)` traefe nichts und liesse den
    // Uebergang scheinbar scheitern.
    const f = fake({ data: [{ id: LAUF }] })
    await aktualisiereLauf(f.client as never, LAUF, {}, { schritt: 'x' })
    expect(update(f)!.filter.some(x => x.spalte === 'organization_id')).toBe(false)
  })

  it('setzt eine Bedingung auf den erwarteten Vorzustand', async () => {
    // Damit ein zweiter, gleichzeitiger Durchlauf denselben Lauf nicht ein
    // zweites Mal weiterschaltet.
    const f = fake({ data: [{ id: LAUF }] })
    await aktualisiereLauf(f.client as never, LAUF, { status: 'geprueft' },
      { schritt: 'Validierung bestanden', vonStatus: 'validierung_laeuft' })
    expect(hatFilter(update(f), 'eq', 'status', 'validierung_laeuft')).toBe(true)
  })

  it('nennt den Vorzustand im Fehler, wenn er nicht mehr stimmt', async () => {
    const f = fake({ data: [] })
    await expect(
      aktualisiereLauf(f.client as never, LAUF, {}, { schritt: 'x', vonStatus: 'erstellt' }),
    ).rejects.toThrow(/steht nicht mehr auf/)
  })

  it('weist eine fehlende Lauf-ID ab, ohne zu schreiben', async () => {
    const f = fake({ data: [{ id: LAUF }] })
    await expect(
      aktualisiereLauf(f.client as never, '', {}, { schritt: 'x' }),
    ).rejects.toThrow(/keine Lauf-ID/)
    expect(update(f)).toBeUndefined()
  })
})
