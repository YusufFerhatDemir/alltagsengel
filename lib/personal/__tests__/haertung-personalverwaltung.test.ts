/**
 * Härtung der Personalverwaltung — Befunde vom 27.08.2026
 *
 * Die Zusagen, die hier festgehalten werden:
 *
 *  A) MANDANTENSCHUTZ. Jeder Schreibweg der Personalverwaltung nimmt
 *     `caregiver_id` aus dem Request-Body und schreibt mit dem
 *     Dienstschlüssel, der RLS umgeht. Ohne Fence entsteht eine Zeile im
 *     eigenen Mandanten mit fremdem Mitarbeiter — und drei Auswertungs-
 *     Views joinen `caregivers` ohne Mandanten-Bedingung (live aus
 *     pg_views gelesen), holen also den Klarnamen des fremden
 *     Mitarbeiters in die eigene Auswertung.
 *
 *  B) URLAUBSGENEHMIGUNG. Die Kontobuchung lief NACH dem Statuswechsel.
 *     Scheiterte sie, stand der Antrag auf 'genehmigt', das Konto zeigte
 *     keinen Verbrauch, und nachbuchen ging nie mehr.
 *
 *  C) STAMMDATEN. Unbekannte Felder wurden still verworfen — die
 *     Mitarbeiterakte schickte zehn von elf Feldern unter Namen, die der
 *     Server nicht kennt, und meldete trotzdem „Gespeichert".
 *
 *  D) ERLAUBNISLISTEN UND WERTEBEREICHE. Enum- und Zahlenfelder gingen
 *     ungeprüft an die Datenbank; deren CHECK-Verletzung kam als
 *     „Interner Serverfehler" ohne Klartext zurück.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UserFacingError } from '../../api/user-facing-error'
import { assertCaregiverInOrg, caregiverGehoertZuOrg } from '../organization-guard'
import { createQualifikation, updateQualifikation } from '../qualifikationen'
import { createSchulung, assertSchulungszeitraum } from '../schulungen'
import { createUrlaubskonto, updateUrlaubskonto } from '../urlaubskonto'
import { createAbwesenheit, genehmigenAbwesenheit, urlaubsBuchung } from '../abwesenheiten'
import { createArbeitszeit } from '../arbeitszeiten'
import { listStammdaten, updateStammdaten, pruefeEinsatzgebietPlz } from '../stammdaten'
import { erstelleFakeSupabase, type FakeAufruf } from '@/__tests__/helpers/supabase-fake'

// ── Doppelgänger ──────────────────────────────────────────────────────

/**
 * @param caregiverTreffer Was die Fence-Abfrage auf `caregivers` liefert:
 *   'eigener'  → Zeile gefunden (gehört zur Organisation)
 *   'fremder'  → keine Zeile (gehört jemand anderem oder existiert nicht)
 *   'fehler'   → Lesefehler (fail-closed-Gegenprobe)
 */
function fakeMitFence(caregiverTreffer: 'eigener' | 'fremder' | 'fehler') {
  const fake = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === 'caregivers') {
      if (caregiverTreffer === 'fehler') return { data: null, error: { message: 'Verbindung weg' } }
      return { data: caregiverTreffer === 'eigener' ? { id: 'cg-1' } : null, error: null }
    }
    if (a.operation === 'insert') {
      return { data: { id: 'neu-1', ...(a.payload as Record<string, unknown>) }, error: null }
    }
    return { data: null, error: null }
  })
  return fake
}

function schreibAufrufe(fake: ReturnType<typeof fakeMitFence>): FakeAufruf[] {
  return fake.aufrufe.filter(a => a.operation === 'insert' || a.operation === 'update')
}

// ── A) Mandantenschutz ────────────────────────────────────────────────

test('caregiverGehoertZuOrg: filtert auf id UND organization_id', async () => {
  const fake = fakeMitFence('eigener')
  const ok = await caregiverGehoertZuOrg(fake.client as never, 'cg-1', 'org-1')
  assert.equal(ok, true)
  const filter = fake.aufrufe[0].filter.map(f => `${f.spalte}=${f.wert}`)
  assert.ok(filter.includes('id=cg-1'), `id fehlt: ${filter.join(',')}`)
  assert.ok(filter.includes('organization_id=org-1'), `org-Fence fehlt: ${filter.join(',')}`)
})

test('caregiverGehoertZuOrg: FAIL-CLOSED — ein Lesefehler ist kein "ja"', async () => {
  const fake = fakeMitFence('fehler')
  assert.equal(await caregiverGehoertZuOrg(fake.client as never, 'cg-1', 'org-1'), false)
})

test('assertCaregiverInOrg: fremder Mitarbeiter wirft 404, nicht 403', async () => {
  const fake = fakeMitFence('fremder')
  await assert.rejects(
    () => assertCaregiverInOrg(fake.client as never, 'cg-fremd', 'org-1'),
    (e: unknown) => e instanceof UserFacingError && e.status === 404,
  )
})

test('assertCaregiverInOrg: fehlende caregiverId wirft 400', async () => {
  const fake = fakeMitFence('eigener')
  await assert.rejects(
    () => assertCaregiverInOrg(fake.client as never, '', 'org-1'),
    (e: unknown) => e instanceof UserFacingError && e.status === 400,
  )
})

test('createQualifikation: fremder Mitarbeiter — es wird NICHTS geschrieben', async () => {
  const fake = fakeMitFence('fremder')
  await assert.rejects(
    () => createQualifikation(fake.client as never, {
      organizationId: 'org-1', caregiverId: 'cg-fremd',
      title: 'Erweitertes Führungszeugnis', qualificationType: 'fuehrungszeugnis',
    }),
    /nicht gefunden/,
  )
  assert.deepEqual(schreibAufrufe(fake), [], 'Es darf keine Zeile entstanden sein')
})

test('createQualifikation: eigener Mitarbeiter geht durch', async () => {
  const fake = fakeMitFence('eigener')
  await createQualifikation(fake.client as never, {
    organizationId: 'org-1', caregiverId: 'cg-1',
    title: 'Erste Hilfe', qualificationType: 'erste_hilfe',
  })
  assert.equal(schreibAufrufe(fake).length, 1)
})

test('createSchulung: fremder Mitarbeiter — es wird NICHTS geschrieben', async () => {
  const fake = fakeMitFence('fremder')
  await assert.rejects(
    () => createSchulung(fake.client as never, {
      organizationId: 'org-1', caregiverId: 'cg-fremd',
      titel: 'Hygieneschulung', schulungsart: 'pflichtschulung',
      beginn: '2026-09-01', erstelltVon: 'user-1',
    }),
    /nicht gefunden/,
  )
  assert.deepEqual(schreibAufrufe(fake), [])
})

test('createUrlaubskonto: fremder Mitarbeiter — es wird NICHTS geschrieben', async () => {
  const fake = fakeMitFence('fremder')
  await assert.rejects(
    () => createUrlaubskonto(fake.client as never, {
      organizationId: 'org-1', caregiverId: 'cg-fremd', jahr: 2026, anspruchTage: 30,
    }),
    /nicht gefunden/,
  )
  assert.deepEqual(schreibAufrufe(fake), [])
})

test('createAbwesenheit: fremder Mitarbeiter — es wird NICHTS geschrieben', async () => {
  const fake = fakeMitFence('fremder')
  await assert.rejects(
    () => createAbwesenheit(fake.client as never, {
      organizationId: 'org-1', caregiverId: 'cg-fremd', absenceType: 'vacation',
      startDate: '2026-09-01', endDate: '2026-09-05', erstelltVon: 'user-1',
    }),
    /nicht gefunden/,
  )
  assert.deepEqual(schreibAufrufe(fake), [])
})

test('createArbeitszeit: fremder Mitarbeiter — es wird NICHTS geschrieben', async () => {
  const fake = fakeMitFence('fremder')
  await assert.rejects(
    () => createArbeitszeit(fake.client as never, {
      organizationId: 'org-1', caregiverId: 'cg-fremd', datum: '2026-09-01',
      startZeit: '08:00', endZeit: '12:00', istMinuten: 240,
    }),
    /nicht gefunden/,
  )
  assert.deepEqual(schreibAufrufe(fake), [])
})

test('Fence FAIL-CLOSED: ein Lesefehler auf caregivers lässt nicht schreiben', async () => {
  const fake = fakeMitFence('fehler')
  await assert.rejects(
    () => createUrlaubskonto(fake.client as never, {
      organizationId: 'org-1', caregiverId: 'cg-1', jahr: 2026, anspruchTage: 30,
    }),
    /nicht gefunden/,
  )
  assert.deepEqual(schreibAufrufe(fake), [])
})

// ── B) Urlaubsgenehmigung ─────────────────────────────────────────────

test('urlaubsBuchung: rechnet Tage einschließlich beider Randtage', () => {
  assert.deepEqual(
    urlaubsBuchung({ start_date: '2026-09-01', end_date: '2026-09-05', halber_tag: false } as never),
    { dauer: 5, jahr: 2026 },
  )
})

test('urlaubsBuchung: halber Tag zählt 0,5', () => {
  assert.equal(
    urlaubsBuchung({ start_date: '2026-09-01', end_date: '2026-09-01', halber_tag: true } as never).dauer,
    0.5,
  )
})

/**
 * Doppelgänger für die Genehmigungskette.
 *
 * @param konto null = für das Jahr existiert kein Urlaubskonto.
 * @param buchungScheitert true = die Vorprüfung geht durch, das
 *   CAS-Update auf dem Konto trifft aber nicht mehr (Nebenläufigkeit).
 */
function genehmigungsFake(
  konto: Record<string, unknown> | null,
  buchungScheitert = false,
) {
  const antrag = {
    id: 'ab-1', organization_id: 'org-1', caregiver_id: 'cg-1',
    status: 'beantragt', absence_type: 'vacation',
    start_date: '2026-09-01', end_date: '2026-09-05',
    halber_tag: false, erstellt_von: 'antragsteller',
  }
  const fake = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === 'absences') {
      if (a.operation === 'select') return { data: antrag, error: null }
      return { data: { ...antrag, ...(a.payload as Record<string, unknown>) }, error: null }
    }
    if (a.tabelle === 'personal_urlaubskonto') {
      if (a.operation === 'select') {
        return { data: konto ? { id: 'uk-1', ...konto } : null, error: null }
      }
      // CAS-Update: kein Treffer, wenn die Buchung scheitern soll.
      return { data: buchungScheitert ? null : { id: 'uk-1' }, error: null }
    }
    return { data: null, error: null }
  })
  return fake
}

test('genehmigenAbwesenheit: ohne Urlaubskonto bleibt der Antrag UNGENEHMIGT', async () => {
  const fake = genehmigungsFake(null)
  await assert.rejects(
    () => genehmigenAbwesenheit(fake.client as never, 'ab-1', 'org-1', 'pdl-1'),
    /kein Urlaubskonto/,
  )
  // Der eigentliche Befund: vorher lief das Status-Update ZUERST und blieb
  // stehen. Es darf jetzt gar nicht erst dazu kommen.
  const statusSchreibt = fake.aufrufe.filter(
    a => a.tabelle === 'absences' && a.operation === 'update'
  )
  assert.deepEqual(statusSchreibt, [], 'Der Antrag darf nicht auf genehmigt gesetzt worden sein')
})

test('genehmigenAbwesenheit: zu wenig Resturlaub — Antrag bleibt UNGENEHMIGT', async () => {
  const fake = genehmigungsFake({
    anspruch_tage: 30, uebertrag_vorjahr: 0, genommen_tage: 28, geplant_tage: 0,
  })
  await assert.rejects(
    () => genehmigenAbwesenheit(fake.client as never, 'ab-1', 'org-1', 'pdl-1'),
    /Nicht genug Resturlaub/,
  )
  assert.deepEqual(
    fake.aufrufe.filter(a => a.tabelle === 'absences' && a.operation === 'update'),
    [],
  )
})

test('genehmigenAbwesenheit: gedecktes Konto — Genehmigung UND Buchung', async () => {
  const fake = genehmigungsFake({
    anspruch_tage: 30, uebertrag_vorjahr: 0, genommen_tage: 0, geplant_tage: 0,
  })
  const ergebnis = await genehmigenAbwesenheit(fake.client as never, 'ab-1', 'org-1', 'pdl-1')
  assert.equal(ergebnis.status, 'genehmigt')
  const kontoUpdate = fake.aufrufe.find(
    a => a.tabelle === 'personal_urlaubskonto' && a.operation === 'update'
  )
  assert.ok(kontoUpdate, 'Das Urlaubskonto muss gebucht worden sein')
  assert.equal((kontoUpdate!.payload as Record<string, unknown>).genommen_tage, 5)
})

test('genehmigenAbwesenheit: scheitert die Buchung NACH dem Statuswechsel, geht der Antrag zurück auf beantragt', async () => {
  const fake = genehmigungsFake(
    { anspruch_tage: 30, uebertrag_vorjahr: 0, genommen_tage: 0, geplant_tage: 0 },
    true, // CAS trifft nie — eine zweite Genehmigung war schneller
  )
  await assert.rejects(
    () => genehmigenAbwesenheit(fake.client as never, 'ab-1', 'org-1', 'pdl-1'),
    /erneut versuchen/,
  )
  const absenceUpdates = fake.aufrufe.filter(
    a => a.tabelle === 'absences' && a.operation === 'update'
  )
  const letzte = absenceUpdates.at(-1)!.payload as Record<string, unknown>
  assert.equal(letzte.status, 'beantragt', 'Die Genehmigung muss zurückgerollt sein')
  assert.equal(letzte.genehmigt_von, null)
  assert.equal(letzte.genehmigt_am, null)
})

// ── C) Stammdaten ─────────────────────────────────────────────────────

function stammdatenFake() {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.operation === 'update') {
      return { data: { id: 'cg-1', ...(a.payload as Record<string, unknown>) }, error: null }
    }
    return { data: null, error: null }
  })
}

test('updateStammdaten: unbekannte Felder werden ABGEWIESEN statt still verworfen', async () => {
  const fake = stammdatenFake()
  // Genau die Nutzlast, die die Mitarbeiterakte früher geschickt hat.
  await assert.rejects(
    () => updateStammdaten(fake.client as never, 'cg-1', 'org-1', {
      notfallkontakt_name: 'Maria Muster',
      einsatzgebiet_plz: '60311',
      wochenstunden_soll: 20,
      vertragsstatus: 'aktiv',
    } as never),
    (e: unknown) =>
      e instanceof UserFacingError && e.status === 400 && /notfallkontakt_name/.test(e.message),
  )
  assert.deepEqual(
    fake.aufrufe.filter(a => a.operation === 'update'), [],
    'Bei unbekannten Feldern darf gar nichts geschrieben werden',
  )
})

test('updateStammdaten: der Notfallkontakt kommt jetzt tatsächlich an', async () => {
  const fake = stammdatenFake()
  await updateStammdaten(fake.client as never, 'cg-1', 'org-1', {
    notfallkontaktName: 'Maria Muster',
    notfallkontaktTelefon: '069 1234567',
  })
  const p = fake.aufrufe.find(a => a.operation === 'update')!.payload as Record<string, unknown>
  assert.equal(p.notfallkontakt_name, 'Maria Muster')
  assert.equal(p.notfallkontakt_telefon, '069 1234567')
})

test('updateStammdaten: Qualifikationsstufe und Fahrzeug/Führerschein sind speicherbar', async () => {
  const fake = stammdatenFake()
  await updateStammdaten(fake.client as never, 'cg-1', 'org-1', {
    qualifikationsstufe: 'pflegefachkraft',
    hatFahrzeug: true,
    hatFuehrerschein: false,
  })
  const p = fake.aufrufe.find(a => a.operation === 'update')!.payload as Record<string, unknown>
  assert.equal(p.qualification_level, 'pflegefachkraft')
  assert.equal(p.has_vehicle, true)
  assert.equal(p.has_drivers_license, false)
})

test('updateStammdaten: unbekannte Qualifikationsstufe wird lesbar abgewiesen', async () => {
  const fake = stammdatenFake()
  await assert.rejects(
    () => updateStammdaten(fake.client as never, 'cg-1', 'org-1', {
      qualifikationsstufe: 'chefarzt' as never,
    }),
    // Der eigentliche Punkt: UserFacingError statt nacktem Error, sonst
    // verkürzt der Sanitizer die Meldung zu „Interner Serverfehler".
    (e: unknown) => e instanceof UserFacingError && /Erlaubt:/.test(e.message),
  )
})

test('updateStammdaten: unplausible Zahlenwerte werden abgewiesen', async () => {
  const fake = stammdatenFake()
  for (const patch of [
    { wochenstundenSoll: 200 },
    { wochenstundenSoll: -1 },
    { urlaubstageJahresanspruch: 400 },
    { einsatzgebietRadiusKm: -5 },
  ]) {
    await assert.rejects(
      () => updateStammdaten(fake.client as never, 'cg-1', 'org-1', patch),
      (e: unknown) => e instanceof UserFacingError,
      `durchgelassen: ${JSON.stringify(patch)}`,
    )
  }
})

test('updateStammdaten: Probezeitende muss ein ISO-Datum sein', async () => {
  const fake = stammdatenFake()
  await assert.rejects(
    () => updateStammdaten(fake.client as never, 'cg-1', 'org-1', { probezeitende: '31.12.2026' }),
    /JJJJ-MM-TT/,
  )
})

test('pruefeEinsatzgebietPlz: nimmt gültige PLZ, entdoppelt und trimmt', () => {
  assert.deepEqual(pruefeEinsatzgebietPlz([' 60311 ', '65183', '60311', '']), ['60311', '65183'])
})

test('pruefeEinsatzgebietPlz: weist Nicht-Listen und Falschformate ab', () => {
  assert.throws(() => pruefeEinsatzgebietPlz('60311' as never), /Liste von Postleitzahlen/)
  assert.throws(() => pruefeEinsatzgebietPlz(['6031']), /keine gültige Postleitzahl/)
  assert.throws(() => pruefeEinsatzgebietPlz(['60311 Frankfurt']), /keine gültige Postleitzahl/)
})

test('listStammdaten: `search` filtert wirklich (vorher wurde der Parameter ignoriert)', async () => {
  const zeilen = [
    { id: '1', first_name: 'Anna', last_name: 'Berger', email: 'a@x.de', phone: null },
    { id: '2', first_name: 'Bernd', last_name: 'Krause', email: 'b@x.de', phone: null },
  ]
  const fake = erstelleFakeSupabase(() => ({ data: zeilen, error: null }))
  const alle = await listStammdaten(fake.client as never, { organizationId: 'org-1' })
  assert.equal(alle.length, 2)

  const fake2 = erstelleFakeSupabase(() => ({ data: zeilen, error: null }))
  const treffer = await listStammdaten(fake2.client as never, { organizationId: 'org-1', search: 'krau' })
  assert.equal(treffer.length, 1)
  assert.equal(treffer[0].last_name, 'Krause')
})

// ── D) Erlaubnislisten und Wertebereiche ──────────────────────────────

test('createQualifikation: unbekannte Qualifikationsart wird lesbar abgewiesen', async () => {
  const fake = fakeMitFence('eigener')
  await assert.rejects(
    () => createQualifikation(fake.client as never, {
      organizationId: 'org-1', caregiverId: 'cg-1',
      title: 'Pflegefachkraft', qualificationType: 'Pflegefachkraft',
    }),
    // Freitext war der Default der Oberfläche — er verletzt den Live-CHECK
    // caregiver_qualifications_qualification_type_check.
    (e: unknown) => e instanceof UserFacingError && e.status === 400,
  )
  assert.deepEqual(schreibAufrufe(fake), [])
})

test('createQualifikation: fehlende Qualifikationsart ist ein Pflichtfeld-Fehler, kein 500er', async () => {
  const fake = fakeMitFence('eigener')
  await assert.rejects(
    () => createQualifikation(fake.client as never, {
      organizationId: 'org-1', caregiverId: 'cg-1', title: 'Irgendwas', qualificationType: '',
    }),
    (e: unknown) => e instanceof UserFacingError && /Pflichtfeld/.test(e.message),
  )
})

test('createQualifikation: unbekannter Status wird abgewiesen', async () => {
  const fake = fakeMitFence('eigener')
  await assert.rejects(
    () => createQualifikation(fake.client as never, {
      organizationId: 'org-1', caregiverId: 'cg-1',
      title: 'Hygiene', qualificationType: 'hygiene', status: 'gueltig',
    }),
    (e: unknown) => e instanceof UserFacingError,
  )
})

test('updateQualifikation: der Prüfvermerk trägt den angemeldeten Benutzer, nicht den Body', async () => {
  const fake = erstelleFakeSupabase((a: FakeAufruf) =>
    a.operation === 'update'
      ? { data: { id: 'q-1', ...(a.payload as Record<string, unknown>) }, error: null }
      : { data: null, error: null }
  )
  await updateQualifikation(fake.client as never, 'q-1', 'org-1', { verifiziert: true }, 'pdl-42')
  const p = fake.aufrufe.find(a => a.operation === 'update')!.payload as Record<string, unknown>
  assert.equal(p.verifiziert_von, 'pdl-42')
  assert.ok(typeof p.verifiziert_am === 'string' && p.verifiziert_am.length > 0)
})

test('updateQualifikation: Prüfvermerk zurücknehmen leert beide Spalten', async () => {
  const fake = erstelleFakeSupabase((a: FakeAufruf) =>
    a.operation === 'update'
      ? { data: { id: 'q-1', ...(a.payload as Record<string, unknown>) }, error: null }
      : { data: null, error: null }
  )
  await updateQualifikation(fake.client as never, 'q-1', 'org-1', { verifiziert: false }, 'pdl-42')
  const p = fake.aufrufe.find(a => a.operation === 'update')!.payload as Record<string, unknown>
  assert.equal(p.verifiziert_von, null)
  assert.equal(p.verifiziert_am, null)
})

test('updateQualifikation: ungültiges Ablaufdatum wird abgewiesen', async () => {
  const fake = erstelleFakeSupabase(() => ({ data: null, error: null }))
  await assert.rejects(
    () => updateQualifikation(fake.client as never, 'q-1', 'org-1', { validUntil: '31.12.2028' }, 'pdl-1'),
    /JJJJ-MM-TT/,
  )
})

test('assertSchulungszeitraum: Beginn ist Pflicht, Ende darf nicht davor liegen', () => {
  assert.throws(() => assertSchulungszeitraum(undefined, null), /Pflichtfeld/)
  assert.throws(() => assertSchulungszeitraum('01.09.2026', null), /Pflichtfeld/)
  assert.throws(() => assertSchulungszeitraum('2026-09-10', '2026-09-01'), /nicht vor dem Beginn/)
  assert.doesNotThrow(() => assertSchulungszeitraum('2026-09-01', '2026-09-01'))
  assert.doesNotThrow(() => assertSchulungszeitraum('2026-09-01', null))
})

test('createSchulung: ohne Beginn wird nichts geschrieben', async () => {
  const fake = fakeMitFence('eigener')
  await assert.rejects(
    () => createSchulung(fake.client as never, {
      organizationId: 'org-1', caregiverId: 'cg-1',
      titel: 'Brandschutz', schulungsart: 'pflichtschulung',
      beginn: undefined as never, erstelltVon: 'user-1',
    }),
    /Pflichtfeld/,
  )
  assert.deepEqual(schreibAufrufe(fake), [])
})

test('createUrlaubskonto: Jahr außerhalb des Live-CHECK wird lesbar abgewiesen', async () => {
  const fake = fakeMitFence('eigener')
  for (const jahr of [2019, 2100, 2026.5]) {
    await assert.rejects(
      () => createUrlaubskonto(fake.client as never, {
        organizationId: 'org-1', caregiverId: 'cg-1', jahr, anspruchTage: 30,
      }),
      (e: unknown) => e instanceof UserFacingError,
      `durchgelassen: ${jahr}`,
    )
  }
  assert.deepEqual(schreibAufrufe(fake), [])
})

test('createUrlaubskonto: negativer oder unplausibler Anspruch wird abgewiesen', async () => {
  const fake = fakeMitFence('eigener')
  for (const tage of [-1, Number.NaN, 1e9]) {
    await assert.rejects(
      () => createUrlaubskonto(fake.client as never, {
        organizationId: 'org-1', caregiverId: 'cg-1', jahr: 2026, anspruchTage: tage,
      }),
      (e: unknown) => e instanceof UserFacingError,
      `durchgelassen: ${tage}`,
    )
  }
})

test('updateUrlaubskonto: negative genommene Tage werden abgewiesen', async () => {
  const fake = erstelleFakeSupabase(() => ({ data: null, error: null }))
  await assert.rejects(
    () => updateUrlaubskonto(fake.client as never, 'uk-1', 'org-1', { genommenTage: -5 }),
    /darf nicht negativ sein/,
  )
  assert.deepEqual(fake.aufrufe.filter(a => a.operation === 'update'), [])
})
