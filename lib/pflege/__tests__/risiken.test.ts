// ═══════════════════════════════════════════════════════════════
// Tests: Risiken — Typ-/Schweregrad-Validierung, Soft-Delete, Kennzahlen,
// Audit-Log-Verdrahtung (pflege_audit_log)
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SCHWEREGRAD_RANG, createRisiko, deaktiviereRisiko, istKritisch,
  updateRisiko, zusammenfassungRisiken,
} from '../risiken'
import { RISIKO_SCHWEREGRAD_WERTE, RISIKO_TYP_WERTE } from '../types'
import type { PflegeRisiko, PflegeRisikoDashboardZeile } from '../types'

/**
 * Mock routet nach Tabellenname, damit pflege_risiken- und
 * pflege_audit_log-Schreibzugriffe unterscheidbar sind. `inserts`/`updates`
 * bleiben tabellen-gemischt (chronologische Reihenfolge) — Tests, die nur
 * den fachlichen Schreibzugriff prüfen, filtern per `nur()`.
 */
function schreibClient(bestand: Record<string, unknown> = { id: 'r-1', aktiv: true }) {
  const inserts: Array<{ tabelle: string; payload: Record<string, unknown> }> = []
  const updates: Array<{ tabelle: string; payload: Record<string, unknown> }> = []
  const supabase = {
    from(tabelle: string) {
      return {
        insert(payload: Record<string, unknown>) {
          inserts.push({ tabelle, payload })
          return { select: () => ({ single: async () => ({ data: { id: 'r-1', organization_id: 'org-1', ...payload }, error: null }) }) }
        },
        update(payload: Record<string, unknown>) {
          updates.push({ tabelle, payload })
          const kette: any = {
            eq: () => kette,
            select: () => ({ single: async () => ({ data: { ...bestand, ...payload }, error: null }) }),
          }
          return kette
        },
      }
    },
  }
  const nur = (liste: typeof inserts, tabelle: string) => liste.filter(e => e.tabelle === tabelle).map(e => e.payload)
  return { supabase: supabase as never, inserts, updates, nur }
}

test('SCHWEREGRAD_RANG deckt alle erlaubten Schweregrade streng aufsteigend ab', () => {
  assert.deepEqual(Object.keys(SCHWEREGRAD_RANG).sort(), [...RISIKO_SCHWEREGRAD_WERTE].sort())
  const werte = RISIKO_SCHWEREGRAD_WERTE.map(s => SCHWEREGRAD_RANG[s])
  for (let i = 1; i < werte.length; i++) {
    assert.ok(werte[i] > werte[i - 1], 'Rangfolge muss streng aufsteigend sein')
  }
})

test('istKritisch trennt bei "hoch"', () => {
  assert.equal(istKritisch({ schweregrad: 'niedrig' }), false)
  assert.equal(istKritisch({ schweregrad: 'mittel' }), false)
  assert.equal(istKritisch({ schweregrad: 'hoch' }), true)
  assert.equal(istKritisch({ schweregrad: 'kritisch' }), true)
})

test('createRisiko akzeptiert alle in der Migration erlaubten Risikotypen', async () => {
  for (const typ of RISIKO_TYP_WERTE) {
    const { supabase, inserts, nur } = schreibClient()
    await createRisiko(supabase, {
      organizationId: 'org-1', clientId: 'client-1', risikoTyp: typ,
      bezeichnung: 'Testeintrag', erstelltVon: 'user-1',
    })
    assert.equal(nur(inserts, 'pflege_risiken')[0].risiko_typ, typ)
  }
})

test('createRisiko weist unbekannte Typen und Schweregrade zurück', async () => {
  let dbAufgerufen = false
  const supabase = { from() { dbAufgerufen = true; return {} as never } }
  const basis = { organizationId: 'org-1', clientId: 'client-1', bezeichnung: 'X', erstelltVon: 'user-1' }

  await assert.rejects(
    () => createRisiko(supabase as never, { ...basis, risikoTyp: 'kaffeerisiko' as never }),
    /Ungültiger Wert "kaffeerisiko" für risiko_typ/
  )
  await assert.rejects(
    () => createRisiko(supabase as never, { ...basis, risikoTyp: 'allergie', schweregrad: 'extrem' as never }),
    /Ungültiger Wert "extrem" für schweregrad/
  )
  await assert.rejects(
    () => createRisiko(supabase as never, { ...basis, bezeichnung: '  ', risikoTyp: 'allergie' }),
    /Bezeichnung ist ein Pflichtfeld/
  )
  assert.equal(dbAufgerufen, false)
})

test('createRisiko setzt "mittel" als Vorgabe-Schweregrad und aktiviert das Risiko', async () => {
  const { supabase, inserts, nur } = schreibClient()
  await createRisiko(supabase, {
    organizationId: 'org-1', clientId: 'client-1', risikoTyp: 'sturzrisiko',
    bezeichnung: 'Unsicherer Gang', erstelltVon: 'user-1',
  })
  const risikoInsert = nur(inserts, 'pflege_risiken')[0]
  assert.equal(risikoInsert.schweregrad, 'mittel')
  assert.equal(risikoInsert.bezeichnung, 'Unsicherer Gang')
})

test('createRisiko protokolliert die Erstellung in pflege_audit_log', async () => {
  const { supabase, inserts, nur } = schreibClient()
  const risiko = await createRisiko(supabase, {
    organizationId: 'org-1', clientId: 'client-1', risikoTyp: 'allergie',
    bezeichnung: 'Nussallergie', erstelltVon: 'user-9',
  }) as PflegeRisiko

  const logEintrag = nur(inserts, 'pflege_audit_log')[0]
  assert.ok(logEintrag, 'Audit-Log-Eintrag muss geschrieben werden')
  assert.equal(logEintrag.entitaet_typ, 'risiko')
  assert.equal(logEintrag.entitaet_id, risiko.id)
  assert.equal(logEintrag.aktion, 'erstellt')
  assert.equal(logEintrag.akteur_id, 'user-9')
  assert.equal(logEintrag.organization_id, 'org-1')
})

test('updateRisiko validiert vor dem Schreiben und trimmt die Bezeichnung', async () => {
  const { supabase, updates, nur } = schreibClient()
  await assert.rejects(
    () => updateRisiko(supabase, 'r-1', 'org-1', { schweregrad: 'sehr_hoch' as never }),
    /Ungültiger Wert "sehr_hoch" für schweregrad/
  )
  await assert.rejects(
    () => updateRisiko(supabase, 'r-1', 'org-1', { bezeichnung: '   ' }),
    /Bezeichnung darf nicht leer sein/
  )
  await assert.rejects(
    () => updateRisiko(supabase, 'r-1', 'org-1', {}),
    /Keine Änderungen übergeben/
  )

  await updateRisiko(supabase, 'r-1', 'org-1', { bezeichnung: '  Nussallergie  ' })
  assert.deepEqual(nur(updates, 'pflege_risiken')[0], { bezeichnung: 'Nussallergie' })
})

test('updateRisiko protokolliert "aktualisiert" in pflege_audit_log', async () => {
  const { supabase, inserts, nur } = schreibClient()
  await updateRisiko(supabase, 'r-1', 'org-1', { bezeichnung: 'Neue Bezeichnung' })

  const logEintrag = nur(inserts, 'pflege_audit_log')[0]
  assert.ok(logEintrag, 'Audit-Log-Eintrag muss geschrieben werden')
  assert.equal(logEintrag.entitaet_typ, 'risiko')
  assert.equal(logEintrag.entitaet_id, 'r-1')
  assert.equal(logEintrag.aktion, 'aktualisiert')
})

test('deaktiviereRisiko ist ein Soft-Delete über aktiv=false und protokolliert "geloescht"', async () => {
  const { supabase, updates, inserts, nur } = schreibClient()
  const risiko = await deaktiviereRisiko(supabase, 'r-1', 'org-1')
  assert.deepEqual(nur(updates, 'pflege_risiken')[0], { aktiv: false })
  assert.equal((risiko as PflegeRisiko).aktiv, false)

  const logEintrag = nur(inserts, 'pflege_audit_log')[0]
  assert.ok(logEintrag, 'Audit-Log-Eintrag muss geschrieben werden')
  assert.equal(logEintrag.aktion, 'geloescht')
})

test('zusammenfassungRisiken zählt Schweregrade und Prüfstatus getrennt', () => {
  const zeilen = [
    { schweregrad: 'kritisch', pruefstatus: 'ueberfaellig' },
    { schweregrad: 'hoch', pruefstatus: 'bald_faellig' },
    { schweregrad: 'hoch', pruefstatus: 'ok' },
    { schweregrad: 'mittel', pruefstatus: 'keine_pruefung' },
    { schweregrad: 'niedrig', pruefstatus: 'ueberfaellig' },
  ] as PflegeRisikoDashboardZeile[]

  assert.deepEqual(zusammenfassungRisiken(zeilen), {
    gesamt: 5,
    kritisch: 1,
    hoch: 2,
    ueberfaellig: 2,
    bald_faellig: 1,
    ohne_pruefung: 1,
  })
})

test('zusammenfassungRisiken liefert für eine leere Liste lauter Nullen', () => {
  assert.deepEqual(zusammenfassungRisiken([]), {
    gesamt: 0, kritisch: 0, hoch: 0, ueberfaellig: 0, bald_faellig: 0, ohne_pruefung: 0,
  })
})
