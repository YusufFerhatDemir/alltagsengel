// ═══════════════════════════════════════════════════════════════
// Tests: Medikamentenmanagement — Validierung, Sperr-Logik,
// Verabreichungs-Sicherheitsprüfung
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aktualisiereMedikament,
  einnahmeZeiten,
  erfasseEingabe,
  erstelleMedikament,
  istAbgelaufen,
  setzeMedikamentStatus,
  validiereMedikament,
} from '../medikamente'
import type { Medikament } from '../types'

// ── Fake-Supabase-Client ─────────────────────────────────────────
// Konfigurierbar über `medikament` (Rückgabe für select/maybeSingle) —
// analog zum Muster in lib/wunden/__tests__/wunden.test.ts.

function fakeClient(opts: {
  medikament?: Record<string, unknown> | null
  /** Bereits dokumentierte Gaben — Antwort auf die Doppelgabe-Pruefung. */
  eingaben?: Array<Record<string, unknown>>
  /** Lesefehler der Doppelgabe-Pruefung (fail-closed-Fall). */
  eingabenFehler?: { message: string }
} = {}) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = []
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = []

  const supabase = {
    from(table: string) {
      return {
        select() {
          const kette: any = {
            eq: () => kette,
            // `limit()` schliesst die Listenabfrage ab — erfasseEingabe liest
            // damit die bereits dokumentierten Gaben.
            limit: async () => (
              opts.eingabenFehler
                ? { data: null, error: opts.eingabenFehler }
                : { data: opts.eingaben ?? [], error: null }
            ),
            maybeSingle: async () => ({ data: opts.medikament ?? null, error: null }),
            single: async () => ({ data: opts.medikament ?? null, error: null }),
          }
          return kette
        },
        insert(payload: Record<string, unknown>) {
          inserts.push({ table, payload })
          return { select: () => ({ single: async () => ({ data: { id: 'neu-1', ...payload }, error: null }) }) }
        },
        update(payload: Record<string, unknown>) {
          updates.push({ table, payload })
          const kette: any = {
            eq: () => kette,
            select: () => ({ single: async () => ({ data: { id: 'm-1', ...opts.medikament, ...payload }, error: null }) }),
          }
          return kette
        },
      }
    },
  }
  return { supabase: supabase as never, inserts, updates }
}

/**
 * Eine Zeile, wie sie in `medikamente` wirklich steht: `medikament_name`
 * und `dosierung` sind NOT NULL, und der CHECK `einnahme_mindestens_eine`
 * erzwingt mindestens eine Einnahmezeit. Die frueheren Attrappen hielten
 * nur `status` vor — damit liess sich die Pruefung des zusammengefuehrten
 * Standes in `aktualisiereMedikament` nicht abbilden.
 */
function bestandsMedikament(ueberschreibungen: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    organization_id: 'org-1',
    client_id: 'client-1',
    medikament_name: 'Ramipril',
    dosierung: '5mg',
    kategorie: 'herz_kreislauf',
    einheit: 'mg',
    einnahme_morgens: true,
    einnahme_mittags: false,
    einnahme_abends: false,
    einnahme_nachts: false,
    dauermedikation: true,
    status: 'aktiv',
    ...ueberschreibungen,
  }
}

const gueltigesMedikament = {
  medikament_name: 'Ramipril',
  dosierung: '5mg',
  client_id: 'client-1',
  einnahme_morgens: true,
}

// ── validiereMedikament / erstelleMedikament ──────────────────────

test('validiereMedikament verlangt Name, Dosierung, Klient', () => {
  assert.throws(() => validiereMedikament({ ...gueltigesMedikament, medikament_name: '' }), /Medikamentenname/)
  assert.throws(() => validiereMedikament({ ...gueltigesMedikament, dosierung: '  ' }), /Dosierung/)
  assert.throws(() => validiereMedikament({ ...gueltigesMedikament, client_id: undefined }), /Klient/)
})

test('validiereMedikament verlangt mindestens eine Einnahmezeit', () => {
  assert.throws(
    () => validiereMedikament({ ...gueltigesMedikament, einnahme_morgens: false }),
    /Einnahmezeit/,
  )
  assert.doesNotThrow(() => validiereMedikament({ ...gueltigesMedikament, einnahme_morgens: false, einnahme_nachts: true }))
})

test('validiereMedikament prüft PZN-Format', () => {
  assert.throws(() => validiereMedikament({ ...gueltigesMedikament, pzn: '123' }), /PZN/)
  assert.doesNotThrow(() => validiereMedikament({ ...gueltigesMedikament, pzn: '1234567' }))
})

test('validiereMedikament: Enddatum darf nicht vor Beginndatum liegen', () => {
  assert.throws(
    () => validiereMedikament({ ...gueltigesMedikament, beginn_datum: '2026-06-01', end_datum: '2026-01-01' }),
    /Enddatum/,
  )
})

test('validiereMedikament lehnt unbekannte Kategorie ab', () => {
  assert.throws(() => validiereMedikament({ ...gueltigesMedikament, kategorie: 'homoeopathie' }), /Ungültige Kategorie/)
})

test('erstelleMedikament legt mit Status "aktiv" an', async () => {
  const { supabase, inserts } = fakeClient()
  const created = await erstelleMedikament(supabase, 'org-1', 'user-1', gueltigesMedikament)
  assert.equal(inserts[0].payload.status, 'aktiv')
  assert.equal(inserts[0].payload.organization_id, 'org-1')
  assert.equal(created.medikament_name, 'Ramipril')
})

// ── aktualisiereMedikament: Sperr-Logik ───────────────────────────

test('aktualisiereMedikament blockiert Bearbeitung eines abgesetzten Medikaments', async () => {
  const { supabase } = fakeClient({ medikament: bestandsMedikament({ status: 'abgesetzt' }) })
  await assert.rejects(
    () => aktualisiereMedikament(supabase, 'org-1', 'm-1', { dosierung: '10mg' }),
    /kann nicht mehr bearbeitet werden/,
  )
})

test('aktualisiereMedikament erlaubt Bearbeitung eines aktiven Medikaments', async () => {
  const { supabase, updates } = fakeClient({ medikament: bestandsMedikament({ status: 'aktiv' }) })
  await aktualisiereMedikament(supabase, 'org-1', 'm-1', { dosierung: '10mg' })
  assert.equal(updates[0].payload.dosierung, '10mg')
})

test('aktualisiereMedikament wirft bei unbekanntem Medikament', async () => {
  const { supabase } = fakeClient({ medikament: null })
  await assert.rejects(
    () => aktualisiereMedikament(supabase, 'org-1', 'unbekannt', { dosierung: '10mg' }),
    /nicht gefunden/,
  )
})

// ── setzeMedikamentStatus: Absetzgrund + Historie ─────────────────

test('setzeMedikamentStatus verlangt Absetzgrund bei "abgesetzt"', async () => {
  const { supabase } = fakeClient({ medikament: { id: 'm-1', status: 'aktiv' } })
  await assert.rejects(
    () => setzeMedikamentStatus(supabase, 'org-1', 'm-1', 'abgesetzt'),
    /Absetzgrund/,
  )
  await assert.rejects(
    () => setzeMedikamentStatus(supabase, 'org-1', 'm-1', 'abgesetzt', '   '),
    /Absetzgrund/,
  )
})

test('setzeMedikamentStatus setzt abgesetzt_am/-grund beim Absetzen', async () => {
  const { supabase, updates } = fakeClient({ medikament: { id: 'm-1', status: 'aktiv' } })
  await setzeMedikamentStatus(supabase, 'org-1', 'm-1', 'abgesetzt', 'Arzt hat umgestellt')
  assert.equal(updates[0].payload.abgesetzt_grund, 'Arzt hat umgestellt')
  assert.ok(typeof updates[0].payload.abgesetzt_am === 'string')
})

test('setzeMedikamentStatus löscht abgesetzt_am/-grund bei Reaktivierung', async () => {
  const { supabase, updates } = fakeClient({ medikament: { id: 'm-1', status: 'abgesetzt', abgesetzt_am: '2026-01-01', abgesetzt_grund: 'alt' } })
  await setzeMedikamentStatus(supabase, 'org-1', 'm-1', 'aktiv')
  assert.equal(updates[0].payload.abgesetzt_am, null, 'abgesetzt_am muss bei Reaktivierung gelöscht werden')
  assert.equal(updates[0].payload.abgesetzt_grund, null, 'abgesetzt_grund muss bei Reaktivierung gelöscht werden')
})

test('setzeMedikamentStatus lehnt unbekannten Status ab', async () => {
  const { supabase } = fakeClient({ medikament: { id: 'm-1', status: 'aktiv' } })
  await assert.rejects(
    () => setzeMedikamentStatus(supabase, 'org-1', 'm-1', 'geloescht' as never),
    /Ungültiger Status/,
  )
})

// ── erfasseEingabe: Patientensicherheit ───────────────────────────

const basisEingabe = {
  medikament_id: 'm-1',
  client_id: 'client-1',
  einnahme_zeit: 'morgens',
  geplant_um: '2026-08-27T08:00:00.000Z',
  status: 'gegeben',
}

test('erfasseEingabe blockiert Verabreichung eines pausierten Medikaments', async () => {
  const { supabase } = fakeClient({ medikament: { client_id: 'client-1', status: 'pausiert' } })
  await assert.rejects(
    () => erfasseEingabe(supabase, 'org-1', 'user-1', basisEingabe),
    /nicht aktiv/,
  )
})

test('erfasseEingabe blockiert Verabreichung eines abgesetzten Medikaments', async () => {
  const { supabase } = fakeClient({ medikament: { client_id: 'client-1', status: 'abgesetzt' } })
  await assert.rejects(
    () => erfasseEingabe(supabase, 'org-1', 'user-1', basisEingabe),
    /nicht aktiv/,
  )
})

test('erfasseEingabe erlaubt Verabreichung eines aktiven Medikaments', async () => {
  const { supabase, inserts } = fakeClient({ medikament: { client_id: 'client-1', status: 'aktiv' } })
  const eingabe = await erfasseEingabe(supabase, 'org-1', 'user-1', basisEingabe)
  assert.equal(inserts[0].payload.status, 'gegeben')
  assert.ok(typeof (inserts[0].payload as { gegeben_um: string | null }).gegeben_um === 'string')
  assert.equal(eingabe.medikament_id, 'm-1')
})

test('erfasseEingabe: Medikament muss zum angegebenen Klienten gehören', async () => {
  const { supabase } = fakeClient({ medikament: { client_id: 'client-ANDERER', status: 'aktiv' } })
  await assert.rejects(
    () => erfasseEingabe(supabase, 'org-1', 'user-1', basisEingabe),
    /gehört nicht zum angegebenen Klienten/,
  )
})

test('erfasseEingabe wirft bei unbekanntem Medikament (auch fremder Organisation)', async () => {
  const { supabase } = fakeClient({ medikament: null })
  await assert.rejects(
    () => erfasseEingabe(supabase, 'org-1', 'user-1', basisEingabe),
    /nicht gefunden/,
  )
})

test('erfasseEingabe verlangt Verweigerungsgrund bei Status "verweigert"', async () => {
  const { supabase } = fakeClient({ medikament: { client_id: 'client-1', status: 'aktiv' } })
  await assert.rejects(
    () => erfasseEingabe(supabase, 'org-1', 'user-1', { ...basisEingabe, status: 'verweigert' }),
    /Verweigerungsgrund/,
  )
  const { supabase: ok, inserts } = fakeClient({ medikament: { client_id: 'client-1', status: 'aktiv' } })
  await erfasseEingabe(ok, 'org-1', 'user-1', { ...basisEingabe, status: 'verweigert', verweigert_grund: 'Übelkeit' })
  assert.equal(inserts[0].payload.verweigert_grund, 'Übelkeit')
})

test('erfasseEingabe lehnt ungültige Einnahmezeit/Status ab', async () => {
  const { supabase } = fakeClient({ medikament: { client_id: 'client-1', status: 'aktiv' } })
  await assert.rejects(
    () => erfasseEingabe(supabase, 'org-1', 'user-1', { ...basisEingabe, einnahme_zeit: 'zwischendurch' }),
    /Ungültige Einnahmezeit/,
  )
  await assert.rejects(
    () => erfasseEingabe(supabase, 'org-1', 'user-1', { ...basisEingabe, status: 'unbekannt' }),
    /Ungültiger Eingabestatus/,
  )
})

test('erfasseEingabe setzt gegeben_um nur bei Status "gegeben"', async () => {
  const { supabase, inserts } = fakeClient({ medikament: { client_id: 'client-1', status: 'aktiv' } })
  await erfasseEingabe(supabase, 'org-1', 'user-1', { ...basisEingabe, status: 'geplant' })
  assert.equal(inserts[0].payload.gegeben_um, null)
})

// ── Reine Hilfsfunktionen ──────────────────────────────────────────

test('einnahmeZeiten listet nur gesetzte Zeiten', () => {
  const m = { einnahme_morgens: true, einnahme_mittags: false, einnahme_abends: true, einnahme_nachts: false } as Medikament
  assert.deepEqual(einnahmeZeiten(m), ['morgens', 'abends'])
})

test('istAbgelaufen: Dauermedikation läuft nie ab', () => {
  const m = { dauermedikation: true, end_datum: '2020-01-01' } as Medikament
  assert.equal(istAbgelaufen(m), false)
})

test('istAbgelaufen: ohne Enddatum nicht abgelaufen', () => {
  const m = { dauermedikation: false, end_datum: null } as Medikament
  assert.equal(istAbgelaufen(m), false)
})

test('istAbgelaufen: Enddatum in der Vergangenheit → abgelaufen', () => {
  const m = { dauermedikation: false, end_datum: '2020-01-01' } as Medikament
  assert.equal(istAbgelaufen(m), true)
})
