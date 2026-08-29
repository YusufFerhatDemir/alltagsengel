import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createArbeitszeit, updateArbeitszeit } from '../arbeitszeiten'

function insertClient() {
  const inserts: Array<Record<string, unknown>> = []
  const supabase = {
    // Seit dem Mandanten-Fence (lib/personal/organization-guard.ts) liest
    // jeder Schreibweg zuerst `caregivers` und bricht ab, wenn der
    // Mitarbeiter nicht zur Organisation gehoert. Der Doppelgaenger muss
    // diesen Lesepfad kennen, sonst prueft der Test nicht mehr den
    // Schreibvorgang, sondern nur noch die neue Sperre.
    from: (tabelle: string) => tabelle === 'caregivers' ? ({
      select: () => {
        const lese: any = { eq: () => lese, maybeSingle: async () => ({ data: { id: 'cg-1' }, error: null }) }
        return lese
      },
    }) as any : ({
      insert(payload: Record<string, unknown>) {
        inserts.push(payload)
        return {
          select: () => ({
            single: async () => ({ data: { id: 'az-1', ...payload }, error: null }),
          }),
        }
      },
    }),
  }
  return { supabase: supabase as never, inserts }
}

/**
 * `updateArbeitszeit` liest seit der Sperr-Haertung den Bestand, bevor es
 * schreibt (select → eq → eq → maybeSingle). Der Doppelgaenger bildet
 * deshalb BEIDE Ketten ab; `existing` ist zugleich der gelesene Bestand.
 */
function updateClient(existing: Record<string, unknown>, failMsg?: string) {
  const updates: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      select: () => {
        const lese: any = {
          eq: () => lese,
          maybeSingle: async () => ({ data: existing, error: null }),
        }
        return lese
      },
      update(payload: Record<string, unknown>) {
        updates.push(payload)
        const kette: any = {
          eq: () => kette,
          select: () => ({
            single: async () => failMsg
              ? { data: null, error: { message: failMsg } }
              : { data: { ...existing, ...payload }, error: null },
          }),
        }
        return kette
      },
    }),
  }
  return { supabase: supabase as never, updates }
}

test('createArbeitszeit: setzt Defaults (quelle=manuell, pause=0)', async () => {
  const { supabase, inserts } = insertClient()
  await createArbeitszeit(supabase, {
    organizationId: 'org-1', caregiverId: 'cg-1', datum: '2026-08-11',
    startZeit: '08:00', endZeit: '16:00', istMinuten: 480,
  })
  assert.equal(inserts[0].quelle, 'manuell')
  assert.equal(inserts[0].pause_minuten, 0)
})

test('createArbeitszeit: weist ungültige Quelle ab', async () => {
  const { supabase } = insertClient()
  await assert.rejects(
    () => createArbeitszeit(supabase, {
      organizationId: 'org-1', caregiverId: 'cg-1', datum: '2026-08-11',
      startZeit: '08:00', endZeit: '16:00', istMinuten: 480, quelle: 'falsch' as any,
    }),
    /Ungültiger Wert/,
  )
})

test('updateArbeitszeit: übersetzt gesperrte-Arbeitszeit-Fehler', async () => {
  const { supabase } = updateClient({}, 'Gesperrte Arbeitszeit kann nicht bearbeitet werden.')
  // Geprüft wird die ÜBERSETZUNG der Datenbankmeldung, also muss der Aufruf
  // bis zum UPDATE kommen. Ein Patch auf `istMinuten` täte das seit GAP-13
  // nicht mehr: die Herleitung aus Beginn und Ende bricht vorher ab, und
  // der Fall wäre grün, ohne je an der Übersetzung vorbeigekommen zu sein.
  await assert.rejects(
    () => updateArbeitszeit(supabase, 'az-1', 'org-1', { bemerkung: 'Korrektur durch PDL' }),
    /Gesperrte Arbeitszeit/,
  )
})

test('updateArbeitszeit: weist leere Änderungen ab', async () => {
  const { supabase } = updateClient({})
  await assert.rejects(
    () => updateArbeitszeit(supabase, 'az-1', 'org-1', {}),
    /Keine Änderungen/,
  )
})

test('updateArbeitszeit: mappt camelCase → snake_case korrekt', async () => {
  const { supabase, updates } = updateClient({ id: 'az-1' })
  await updateArbeitszeit(supabase, 'az-1', 'org-1', {
    startZeit: '09:00', endZeit: '17:00', pauseMinuten: 30, istMinuten: 450,
  })
  assert.equal(updates[0].start_zeit, '09:00')
  assert.equal(updates[0].end_zeit, '17:00')
  assert.equal(updates[0].pause_minuten, 30)
  assert.equal(updates[0].ist_minuten, 450)
})

test('createArbeitszeit: weist übergebene Ist-Minuten ab, die nicht zu den Zeiten passen', async () => {
  // Vor GAP-13 (29.08.2026) kam `istMinuten` unverändert aus dem Rumpf in
  // die Spalte; abgewiesen wurde nur, was für sich genommen unplausibel
  // war (<= 0 oder > 24 h). Seitdem wird der Wert aus Beginn, Ende und
  // Pause HERGELEITET und ein mitgeschickter Wert dagegen geprüft. Damit
  // greift bei 0 nicht mehr die Plausibilität, sondern der Abgleich — und
  // das ist der schärfere Riegel: er weist auch die 60 ab, die für sich
  // plausibel aussieht und zu einer Zwölfstundenschicht gehört.
  const { supabase } = insertClient()
  await assert.rejects(
    () => createArbeitszeit(supabase, {
      organizationId: 'org-1', caregiverId: 'cg-1', datum: '2026-08-11',
      startZeit: '08:00', endZeit: '16:00', istMinuten: 0,
    }),
    /passen nicht zu Beginn, Ende und Pause/,
  )
  await assert.rejects(
    () => createArbeitszeit(supabase, {
      organizationId: 'org-1', caregiverId: 'cg-1', datum: '2026-08-11',
      startZeit: '08:00', endZeit: '20:00', istMinuten: 60,
    }),
    /passen nicht zu Beginn, Ende und Pause/,
  )
})

test('createArbeitszeit: weist eine Schicht ab, aus der sich 0 Minuten ergeben', async () => {
  // Der Weg, auf dem „Ist-Minuten müssen größer als 0 sein" seit GAP-13
  // noch erreichbar ist: nicht über den übergebenen Wert, sondern über die
  // Herleitung. Eine Pause, die den ganzen Dienst auffrisst, ergibt netto
  // 0 — ohne diesen Fall wäre die Plausibilitätsprüfung auf diesem Pfad
  // gar nicht mehr abgedeckt.
  const { supabase } = insertClient()
  await assert.rejects(
    () => createArbeitszeit(supabase, {
      organizationId: 'org-1', caregiverId: 'cg-1', datum: '2026-08-11',
      startZeit: '08:00', endZeit: '12:00', pauseMinuten: 240,
    }),
    /Ist-Minuten müssen größer als 0 sein/,
  )
})

test('createArbeitszeit: weist istMinuten > 24h ab', async () => {
  // Der Wert wird weiterhin abgewiesen, seit GAP-13 aber mit einer anderen
  // Begründung: nicht „mehr als 24 Stunden", sondern „passt nicht zu den
  // Zeiten". Die 24-Stunden-Schranke in `assertPlausibleZeiten` ist auf
  // DIESEM Pfad nicht mehr erreichbar — `nettoMinuten()` begrenzt die
  // Herleitung von sich aus auf 0…1440. Sie bleibt dort stehen, weil die
  // Funktion auch von anderen Stellen aufgerufen wird; hier wird geprüft,
  // was dieser Pfad tatsächlich tut, statt eine Meldung zu erwarten, die
  // er nicht mehr erzeugen kann.
  const { supabase } = insertClient()
  await assert.rejects(
    () => createArbeitszeit(supabase, {
      organizationId: 'org-1', caregiverId: 'cg-1', datum: '2026-08-11',
      startZeit: '08:00', endZeit: '16:00', istMinuten: 1441,
    }),
    /passen nicht zu Beginn, Ende und Pause/,
  )
})

test('createArbeitszeit: weist negative Pause ab', async () => {
  const { supabase } = insertClient()
  await assert.rejects(
    () => createArbeitszeit(supabase, {
      organizationId: 'org-1', caregiverId: 'cg-1', datum: '2026-08-11',
      startZeit: '08:00', endZeit: '16:00', istMinuten: 480, pauseMinuten: -10,
    }),
    /Pause-Minuten dürfen nicht negativ sein/,
  )
})

test('createArbeitszeit: akzeptiert Nachtdienst über Mitternacht (Ende < Start)', async () => {
  const { supabase, inserts } = insertClient()
  // 22:00 - 06:00 ist ein legitimer Nachtdienst, kein "Ende vor Start"-Fehler.
  await createArbeitszeit(supabase, {
    organizationId: 'org-1', caregiverId: 'cg-1', datum: '2026-08-11',
    startZeit: '22:00', endZeit: '06:00', istMinuten: 480,
  })
  assert.equal(inserts[0].start_zeit, '22:00')
  assert.equal(inserts[0].end_zeit, '06:00')
})

test('updateArbeitszeit: weist istMinuten im Patch ab, die nicht zum Bestand passen', async () => {
  // Der Bestand trägt jetzt Zeiten: ohne sie bräche die Herleitung schon an
  // „Start- und Endzeit müssen im Format HH:MM angegeben werden" ab, und
  // der Fall wäre grün, ohne den Abgleich je erreicht zu haben.
  const { supabase } = updateClient({
    id: 'az-1', start_zeit: '08:00', end_zeit: '16:00', pause_minuten: 30,
  })
  await assert.rejects(
    () => updateArbeitszeit(supabase, 'az-1', 'org-1', { istMinuten: -5 }),
    /passen nicht zu Beginn, Ende und Pause/,
  )
})

test('updateArbeitszeit: eine Pausenkorrektur allein zieht die Ist-Minuten nach', async () => {
  // Der Grund, warum aus dem VERSCHMOLZENEN Stand hergeleitet wird und
  // nicht aus dem Patch: wer nur die Pause korrigiert, ändert damit die
  // Arbeitszeit. Bliebe `ist_minuten` unangetastet, stünde in der Zeile
  // eine Arbeitszeit, die nicht mehr zu ihren eigenen Zeiten passt — und
  // jede spätere ArbZG-Prüfung führe den alten Wert.
  const { supabase, updates } = updateClient({
    id: 'az-1', start_zeit: '08:00', end_zeit: '16:00', pause_minuten: 30,
  })
  await updateArbeitszeit(supabase, 'az-1', 'org-1', { pauseMinuten: 60 })
  assert.equal(updates[0].pause_minuten, 60)
  assert.equal(updates[0].ist_minuten, 420)
})
