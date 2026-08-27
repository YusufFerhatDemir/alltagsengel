// ═══════════════════════════════════════════════════════════════
// Tests: Sperr-Logik über lib/personal — Arbeitszeiten, Schulungen,
// Einsatzfreigabe. Ausführen: npm run test:unit
//
// Gemeinsamer Nenner: Alle drei Module lesen seit der Härtung den Bestand,
// BEVOR sie schreiben. Die Tests prüfen deshalb nicht nur die Fehlermeldung,
// sondern dass im Sperrfall gar kein Schreibzugriff abgesetzt wird.
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UserFacingError } from '../../api/user-facing-error'
import { updateArbeitszeit } from '../arbeitszeiten'
import { updateSchulung } from '../schulungen'
import { pruefeEinsatzfreigabe, setzeEinsatzfreigabe } from '../einsatzfreigabe'

type Call = { method: string; args: unknown[] }

/** Doppelgänger mit getrennter Lese- und Schreibkette. */
function client(bestand: unknown, schreibErgebnis: { data: unknown; error: unknown } = { data: { id: 'x-1' }, error: null }) {
  const calls: Call[] = []
  const builder: Record<string, unknown> = {}
  for (const m of ['insert', 'update', 'delete', 'select', 'eq', 'order', 'in']) {
    builder[m] = (...args: unknown[]) => { calls.push({ method: m, args }); return builder }
  }
  builder.maybeSingle = async () => ({ data: bestand, error: null })
  builder.single = async () => schreibErgebnis
  return { supabase: { from: () => builder } as never, calls }
}

const schrieb = (calls: Call[]) => calls.some(c => c.method === 'update' || c.method === 'insert')

// ── Arbeitszeiten ──────────────────────────────────────────────

test('updateArbeitszeit: gesperrte Zeit lässt sich nicht korrigieren', async () => {
  const { supabase, calls } = client({ gesperrt: true })
  await assert.rejects(
    () => updateArbeitszeit(supabase, 'az-1', 'org-1', { istMinuten: 500 }),
    (err: unknown) => err instanceof UserFacingError && (err as UserFacingError).status === 409,
  )
  assert.equal(schrieb(calls), false, 'Kein UPDATE auf einer gesperrten Arbeitszeit')
})

/**
 * Der eigentliche Grund für die Härtung: Der DB-Trigger prüft
 * `OLD.gesperrt = true AND NEW.gesperrt = true`. Wer `gesperrt: false`
 * mitschickt, fiel aus dieser Bedingung heraus und konnte den Zeitnachweis
 * im selben UPDATE verändern.
 */
test('updateArbeitszeit: Entsperren + Korrigieren in EINEM Aufruf ist gesperrt', async () => {
  const { supabase, calls } = client({ gesperrt: true })
  await assert.rejects(
    () => updateArbeitszeit(supabase, 'az-1', 'org-1', { gesperrt: false, istMinuten: 500 }),
    (err: unknown) => err instanceof UserFacingError && /Erst entsperren/.test((err as Error).message),
  )
  assert.equal(schrieb(calls), false)
})

test('updateArbeitszeit: reines Entsperren bleibt möglich', async () => {
  const { supabase, calls } = client({ gesperrt: true }, { data: { id: 'az-1', gesperrt: false }, error: null })
  await updateArbeitszeit(supabase, 'az-1', 'org-1', { gesperrt: false, bemerkung: 'Freigabe durch PDL' })
  assert.deepEqual(
    calls.find(c => c.method === 'update')!.args[0],
    { gesperrt: false, bemerkung: 'Freigabe durch PDL' },
  )
})

test('updateArbeitszeit: nicht gesperrte Zeit bleibt frei korrigierbar', async () => {
  const { supabase, calls } = client({ gesperrt: false }, { data: { id: 'az-1' }, error: null })
  await updateArbeitszeit(supabase, 'az-1', 'org-1', { istMinuten: 500 })
  assert.deepEqual(calls.find(c => c.method === 'update')!.args[0], { ist_minuten: 500 })
})

test('updateArbeitszeit: unbekannte Zeit meldet 404 statt DB-Fehler', async () => {
  const { supabase } = client(null)
  await assert.rejects(
    () => updateArbeitszeit(supabase, 'az-fremd', 'org-1', { istMinuten: 500 }),
    (err: unknown) => err instanceof UserFacingError && (err as UserFacingError).status === 404,
  )
})

// ── Schulungen ─────────────────────────────────────────────────

test('updateSchulung: bestandene Schulung ist als Nachweis gesperrt', async () => {
  const { supabase, calls } = client({ bestanden: true })
  await assert.rejects(
    () => updateSchulung(supabase, 's-1', 'org-1', { titel: 'Anderer Titel' }),
    (err: unknown) => err instanceof UserFacingError && (err as UserFacingError).status === 409,
  )
  assert.equal(schrieb(calls), false)
})

test('updateSchulung: ein Nachweis lässt sich nicht auf "nicht bestanden" zurückdrehen', async () => {
  const { supabase } = client({ bestanden: true })
  await assert.rejects(
    () => updateSchulung(supabase, 's-1', 'org-1', { bestanden: false }),
    (err: unknown) => err instanceof UserFacingError,
  )
})

test('updateSchulung: Auffrischung und Bemerkung bleiben pflegbar', async () => {
  const { supabase, calls } = client({ bestanden: true }, { data: { id: 's-1' }, error: null })
  await updateSchulung(supabase, 's-1', 'org-1', {
    naechsteAuffrischung: '2027-08-27',
    bemerkung: 'Auffrischung terminiert',
  })
  assert.deepEqual(calls.find(c => c.method === 'update')!.args[0], {
    naechste_auffrischung: '2027-08-27',
    bemerkung: 'Auffrischung terminiert',
  })
})

test('updateSchulung: noch nicht bestandene Schulung bleibt voll änderbar', async () => {
  for (const bestanden of [null, false]) {
    const { supabase, calls } = client({ bestanden }, { data: { id: 's-1' }, error: null })
    await updateSchulung(supabase, 's-1', 'org-1', { titel: 'Korrigierter Titel', bestanden: true })
    assert.deepEqual(calls.find(c => c.method === 'update')!.args[0], {
      titel: 'Korrigierter Titel', bestanden: true,
    })
  }
})

// ── Einsatzfreigabe ────────────────────────────────────────────

/**
 * Zwei Tabellen im Spiel: caregivers (Stammsatz) und
 * caregiver_qualifications (Nachweise). Der Doppelgänger unterscheidet
 * deshalb nach Tabellenname.
 */
function freigabeClient(cg: Record<string, unknown> | null, quals: Record<string, unknown>[]) {
  const calls: Call[] = []
  const supabase = {
    from(tabelle: string) {
      const builder: Record<string, unknown> = {}
      for (const m of ['update', 'select', 'eq']) {
        builder[m] = (...args: unknown[]) => { calls.push({ method: `${tabelle}.${m}`, args }); return builder }
      }
      builder.single = async () => cg
        ? { data: cg, error: null }
        : { data: null, error: { message: 'not found' } }
      // Die Qualifikationsabfrage endet ohne .single() — sie wird direkt awaited.
      builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve({ data: quals, error: null }).then(resolve, reject)
      return builder
    },
  }
  return { supabase: supabase as never, calls }
}

const HEUTE_PLUS = '2099-01-01'
const LAENGST_ABGELAUFEN = '2020-01-01'

function vollstaendigeQuals() {
  return [
    { id: 'q-1', title: 'Erweitertes Führungszeugnis', valid_until: HEUTE_PLUS, einsatzrelevant: true, pflicht: true },
    { id: 'q-2', title: 'Erste Hilfe Kurs', valid_until: HEUTE_PLUS, einsatzrelevant: true, pflicht: true },
  ]
}

const AKTIVER_MITARBEITER = {
  id: 'cg-1', first_name: 'Test', last_name: 'Engel',
  einsatzfreigabe: false, vertragsstatus: 'aktiv', status: 'aktiv',
}

test('setzeEinsatzfreigabe: erteilt die Freigabe bei vollständigen Nachweisen', async () => {
  const { supabase, calls } = freigabeClient(AKTIVER_MITARBEITER, vollstaendigeQuals())
  await setzeEinsatzfreigabe(supabase, 'cg-1', 'org-1', true)

  const update = calls.find(c => c.method === 'caregivers.update')!.args[0] as Record<string, unknown>
  assert.equal(update.einsatzfreigabe, true)
})

/**
 * Der Kern der Härtung: Vorher schrieb die POST-Route `einsatzfreigabe = true`
 * direkt aus dem Body — `pruefeEinsatzfreigabe` war reine Anzeige.
 */
test('setzeEinsatzfreigabe: verweigert die Freigabe ohne Führungszeugnis', async () => {
  const nurErsteHilfe = [vollstaendigeQuals()[1]]
  const { supabase, calls } = freigabeClient(AKTIVER_MITARBEITER, nurErsteHilfe)

  await assert.rejects(
    () => setzeEinsatzfreigabe(supabase, 'cg-1', 'org-1', true),
    (err: unknown) => err instanceof UserFacingError && /Führungszeugnis/.test((err as Error).message),
  )
  assert.ok(!calls.some(c => c.method === 'caregivers.update'), 'Ohne Nachweis darf nichts geschrieben werden')
})

test('setzeEinsatzfreigabe: verweigert die Freigabe bei abgelaufenem Erste-Hilfe-Nachweis', async () => {
  const abgelaufen = vollstaendigeQuals()
  abgelaufen[1].valid_until = LAENGST_ABGELAUFEN
  const { supabase } = freigabeClient(AKTIVER_MITARBEITER, abgelaufen)

  await assert.rejects(
    () => setzeEinsatzfreigabe(supabase, 'cg-1', 'org-1', true),
    (err: unknown) => err instanceof UserFacingError && /Erste-Hilfe/.test((err as Error).message),
  )
})

test('setzeEinsatzfreigabe: verweigert die Freigabe bei gekündigtem Vertrag', async () => {
  const gekuendigt = { ...AKTIVER_MITARBEITER, vertragsstatus: 'gekuendigt' }
  const { supabase } = freigabeClient(gekuendigt, vollstaendigeQuals())

  await assert.rejects(
    () => setzeEinsatzfreigabe(supabase, 'cg-1', 'org-1', true),
    (err: unknown) => err instanceof UserFacingError && /Vertragsstatus/.test((err as Error).message),
  )
})

test('setzeEinsatzfreigabe: Entziehen ist IMMER möglich, auch bei fehlenden Nachweisen', async () => {
  // Eine Sperre darf nie an einer Prüfung scheitern — sonst bliebe eine
  // Betreuungskraft freigegeben, gerade weil ihre Nachweise fehlen.
  const { supabase, calls } = freigabeClient({ ...AKTIVER_MITARBEITER, einsatzfreigabe: true }, [])
  await setzeEinsatzfreigabe(supabase, 'cg-1', 'org-1', false)

  const update = calls.find(c => c.method === 'caregivers.update')!.args[0] as Record<string, unknown>
  assert.equal(update.einsatzfreigabe, false)
  assert.equal(update.einsatzfreigabe_am, null)
})

test('pruefeEinsatzfreigabe: nennt die abgelaufene Pflichtqualifikation im Klartext', async () => {
  const abgelaufen = vollstaendigeQuals()
  abgelaufen[0].valid_until = LAENGST_ABGELAUFEN
  const { supabase } = freigabeClient({ ...AKTIVER_MITARBEITER, einsatzfreigabe: true }, abgelaufen)

  const ergebnis = await pruefeEinsatzfreigabe(supabase, 'cg-1', 'org-1')
  assert.equal(ergebnis.freigegeben, false)
  assert.ok(
    ergebnis.probleme.some(p => /Führungszeugnis.*abgelaufen/.test(p)),
    `Klartext erwartet, bekam: ${JSON.stringify(ergebnis.probleme)}`,
  )
  assert.equal(ergebnis.abgelaufeneQualifikationen.length, 1)
})

test('pruefeEinsatzfreigabe: meldet die fehlende Freigabe weiterhin als Problem', async () => {
  const { supabase } = freigabeClient(AKTIVER_MITARBEITER, vollstaendigeQuals())
  const ergebnis = await pruefeEinsatzfreigabe(supabase, 'cg-1', 'org-1')

  assert.equal(ergebnis.freigegeben, false)
  assert.deepEqual(ergebnis.probleme, ['Einsatzfreigabe ist nicht erteilt'])
})

test('pruefeEinsatzfreigabe: freigegebener Mitarbeiter mit allen Nachweisen ist sauber', async () => {
  const { supabase } = freigabeClient({ ...AKTIVER_MITARBEITER, einsatzfreigabe: true }, vollstaendigeQuals())
  const ergebnis = await pruefeEinsatzfreigabe(supabase, 'cg-1', 'org-1')

  assert.equal(ergebnis.freigegeben, true)
  assert.deepEqual(ergebnis.probleme, [])
})
