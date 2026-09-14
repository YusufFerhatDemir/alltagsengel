import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createQualifikation, updateQualifikation } from '../qualifikationen'
import { UserFacingError } from '@/lib/api/user-facing-error'

function mockInsertClient(data: Record<string, unknown>) {
  return {
    // Seit dem Mandanten-Fence (lib/personal/organization-guard.ts) liest
    // createQualifikation zuerst `caregivers`.
    from: (tabelle: string) => tabelle === 'caregivers' ? ({
      select: () => {
        const lese: any = { eq: () => lese, maybeSingle: async () => ({ data: { id: 'cg-1' }, error: null }) }
        return lese
      },
    }) : ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data, error: null }),
        }),
      }),
    }),
  } as never
}

function mockListClient(data: Record<string, unknown>[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            data,
            error: null,
            then: (fn: any) => fn({ data, error: null }),
          }),
          eq: () => ({
            order: () => ({
              data,
              error: null,
              then: (fn: any) => fn({ data, error: null }),
            }),
            eq: () => ({
              order: () => ({
                data,
                error: null,
                then: (fn: any) => fn({ data, error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
  } as never
}

test('createQualifikation: wirft bei leerem Titel', async () => {
  const supabase = mockInsertClient({})
  await assert.rejects(
    () => createQualifikation(supabase, {
      organizationId: 'org-1',
      caregiverId: 'cg-1',
      title: '',
      qualificationType: 'sonstige',
    }),
    /Pflichtfeld/,
  )
})

test('createQualifikation: setzt Defaults korrekt', async () => {
  const inserted: Record<string, unknown>[] = []
  const supabase = {
    // `caregivers` = Mandanten-Fence vor dem Schreiben.
    from: (tabelle: string) => tabelle === 'caregivers' ? ({
      select: () => {
        const lese: any = { eq: () => lese, maybeSingle: async () => ({ data: { id: 'cg-1' }, error: null }) }
        return lese
      },
    }) as any : ({
      insert(payload: Record<string, unknown>) {
        inserted.push(payload)
        return {
          select: () => ({
            single: async () => ({
              data: { id: 'q-1', ...payload },
              error: null,
            }),
          }),
        }
      },
    }),
  } as never

  const result = await createQualifikation(supabase, {
    organizationId: 'org-1',
    caregiverId: 'cg-1',
    title: 'Erweitertes Führungszeugnis',
    qualificationType: 'fuehrungszeugnis',
  })

  assert.equal(inserted.length, 1)
  assert.equal(inserted[0].status, 'valid')
  assert.equal(inserted[0].pflicht, false)
  assert.equal(inserted[0].einsatzrelevant, false)
  assert.equal(result.title, 'Erweitertes Führungszeugnis')
})

test('createQualifikation: pflicht + einsatzrelevant werden durchgereicht', async () => {
  const inserted: Record<string, unknown>[] = []
  const supabase = {
    // `caregivers` = Mandanten-Fence vor dem Schreiben.
    from: (tabelle: string) => tabelle === 'caregivers' ? ({
      select: () => {
        const lese: any = { eq: () => lese, maybeSingle: async () => ({ data: { id: 'cg-1' }, error: null }) }
        return lese
      },
    }) as any : ({
      insert(payload: Record<string, unknown>) {
        inserted.push(payload)
        return {
          select: () => ({
            single: async () => ({
              data: { id: 'q-2', ...payload },
              error: null,
            }),
          }),
        }
      },
    }),
  } as never

  await createQualifikation(supabase, {
    organizationId: 'org-1',
    caregiverId: 'cg-1',
    title: 'Erste Hilfe',
    qualificationType: 'fortbildung',
    pflicht: true,
    einsatzrelevant: true,
    validUntil: '2028-12-31',
  })

  assert.equal(inserted[0].pflicht, true)
  assert.equal(inserted[0].einsatzrelevant, true)
  assert.equal(inserted[0].valid_until, '2028-12-31')
})

test('updateQualifikation: wirft bei leeren Änderungen', async () => {
  const supabase = {
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }),
  } as never

  await assert.rejects(
    () => updateQualifikation(supabase, 'q-1', 'org-1', {}),
    /Keine Änderungen/,
  )
})

// ═══════════════════════════════════════════════════════════════════════
// Block 29 — der Prüfvermerk muss sich auf ein Dokument beziehen
// ═══════════════════════════════════════════════════════════════════════

/**
 * Doppelgänger für den Belegweg: `updateQualifikation` liest den Bestand,
 * sobald der Patch `verifiziert` oder `dokumentId` berührt, und schreibt
 * danach.
 */
function mockBelegClient(bestand: Record<string, unknown> | null) {
  const geschrieben: Record<string, unknown>[] = []
  const supabase = {
    from: () => ({
      select: () => {
        const lese: any = { eq: () => lese, maybeSingle: async () => ({ data: bestand, error: null }) }
        return lese
      },
      update: (werte: Record<string, unknown>) => {
        geschrieben.push(werte)
        return {
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { id: 'q-1', ...bestand, ...werte }, error: null }),
              }),
            }),
          }),
        }
      },
    }),
  } as never
  return { supabase, geschrieben }
}

test('updateQualifikation: Prüfvermerk ohne Dokument wird abgewiesen', async () => {
  // „Geprüft" über ein Dokument, das es nicht gibt.
  const { supabase, geschrieben } = mockBelegClient({ dokument_id: null, verifiziert_am: null })
  await assert.rejects(
    () => updateQualifikation(supabase, 'q-1', 'org-1', { verifiziert: true }, 'user-1'),
    (err: unknown) => err instanceof UserFacingError && /ohne hinterlegtes Dokument/.test((err as Error).message),
  )
  assert.equal(geschrieben.length, 0, 'Ohne Dokument darf nichts geschrieben werden')
})

test('updateQualifikation: Dokument und Prüfvermerk im selben Zug sind erlaubt', async () => {
  const { supabase, geschrieben } = mockBelegClient({ dokument_id: null, verifiziert_am: null })
  await updateQualifikation(supabase, 'q-1', 'org-1', { dokumentId: 'dok-1', verifiziert: true }, 'user-1')
  assert.equal(geschrieben[0].dokument_id, 'dok-1')
  assert.equal(geschrieben[0].verifiziert_von, 'user-1')
  assert.ok(geschrieben[0].verifiziert_am)
})

test('updateQualifikation: Prüfvermerk auf bereits hinterlegtem Dokument bleibt möglich', async () => {
  const { supabase, geschrieben } = mockBelegClient({ dokument_id: 'dok-1', verifiziert_am: null })
  await updateQualifikation(supabase, 'q-1', 'org-1', { verifiziert: true }, 'user-1')
  assert.equal(geschrieben[0].verifiziert_von, 'user-1')
})

test('updateQualifikation: Dokumententausch löscht den alten Prüfvermerk', async () => {
  // Sonst bürgt der Vermerk für ein Blatt, das niemand gesehen hat.
  const { supabase, geschrieben } = mockBelegClient({ dokument_id: 'dok-alt', verifiziert_am: '2026-09-01T09:00:00Z' })
  await updateQualifikation(supabase, 'q-1', 'org-1', { dokumentId: 'dok-neu' }, 'user-1')
  assert.equal(geschrieben[0].dokument_id, 'dok-neu')
  assert.equal(geschrieben[0].verifiziert_am, null)
  assert.equal(geschrieben[0].verifiziert_von, null)
})

test('updateQualifikation: Dokumententausch MIT neuer Prüfung behält den Vermerk', async () => {
  const { supabase, geschrieben } = mockBelegClient({ dokument_id: 'dok-alt', verifiziert_am: '2026-09-01T09:00:00Z' })
  await updateQualifikation(supabase, 'q-1', 'org-1', { dokumentId: 'dok-neu', verifiziert: true }, 'user-2')
  assert.equal(geschrieben[0].verifiziert_von, 'user-2')
  assert.ok(geschrieben[0].verifiziert_am)
})

test('updateQualifikation: unveränderte dokument_id lässt den Vermerk stehen', async () => {
  const { supabase, geschrieben } = mockBelegClient({ dokument_id: 'dok-1', verifiziert_am: '2026-09-01T09:00:00Z' })
  await updateQualifikation(supabase, 'q-1', 'org-1', { dokumentId: 'dok-1', bemerkung: 'Notiz' }, 'user-1')
  assert.equal(geschrieben[0].verifiziert_am, undefined, 'Der Vermerk darf unangetastet bleiben')
})

test('updateQualifikation: unbekannte Qualifikation wird als 404 abgewiesen', async () => {
  const { supabase, geschrieben } = mockBelegClient(null)
  await assert.rejects(
    () => updateQualifikation(supabase, 'q-weg', 'org-1', { verifiziert: true }, 'user-1'),
    (err: unknown) => err instanceof UserFacingError && /nicht gefunden/.test((err as Error).message),
  )
  assert.equal(geschrieben.length, 0)
})

test('updateQualifikation: ein Patch ohne Belegbezug liest den Bestand gar nicht', async () => {
  // Der zusaetzliche Lesevorgang faellt nur an, wo er gebraucht wird.
  let gelesen = 0
  const supabase = {
    from: () => ({
      select: () => { gelesen++; const l: any = { eq: () => l, maybeSingle: async () => ({ data: {}, error: null }) }; return l },
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'q-1' }, error: null }) }) }) }) }),
    }),
  } as never
  await updateQualifikation(supabase, 'q-1', 'org-1', { bemerkung: 'nur eine Notiz' })
  assert.equal(gelesen, 0)
})
