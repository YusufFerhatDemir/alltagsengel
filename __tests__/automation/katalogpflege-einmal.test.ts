/**
 * Block 30 — der Feiertagskatalog gehoert EINMAL pro Lauf gepflegt.
 *
 * BEFUND (14.09.2026): `billing_feiertage` hat kein `organization_id` —
 * Feiertage sind bundesweite Tatsachen, kein Mandantengut. Die Kette
 * stand trotzdem in der Mandantenschleife von
 * `fuehreTaeglicheAutomatisierungAus` und lief damit einmal JE
 * Organisation. Der Trockenlauf gegen Produktion zeigte es:
 *
 *     je Organisation: 78 Schreibvorgaenge, davon 76x billing_feiertage
 *     ueber sechs Mandanten: 470 gesamt
 *
 * Fuenf der sechs Laeufe konnten nichts tun als Unique-Verletzungen zu
 * erzeugen (unique_feiertag_datum_bl). Schlimmer als die vergebliche
 * Arbeit war der Bericht: jede Organisation wies „importiert: 76" fuer
 * Daten aus, die ihr gar nicht gehoeren.
 *
 * Denselben Fall loest die Cron-Route beim Aufraeumen der Zustellspur
 * bereits richtig („bewusst EINMAL pro Lauf, nicht je Organisation").
 *
 * Nach der Behebung: je Organisation 2, gesamt 90.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createAutomationMock } from './_mock'

const pflegeSpion = vi.fn(async () => ({ jahre: [2026, 2027], importiert: 0, vorhanden: 76, fehler: [] }))

vi.mock('@/lib/automation/feiertage-pflege', () => ({
  pflegeFeiertagskatalog: (...args: unknown[]) => pflegeSpion(...(args as [])),
}))

const ORG = '00000000-0000-4000-8000-000460629986'

describe('Katalogpflege in der Mandantenschleife', () => {
  let mock: ReturnType<typeof createAutomationMock>

  beforeEach(() => {
    pflegeSpion.mockClear()
    mock = createAutomationMock()
  })

  it('läuft per Default mit — der Einzelanstoß über /api/admin/automatisierung braucht das', async () => {
    const { fuehreTaeglicheAutomatisierungAus } = await import('@/lib/automation')
    const ergebnis = await fuehreTaeglicheAutomatisierungAus(mock.client as never, ORG)
    expect(pflegeSpion).toHaveBeenCalledTimes(1)
    expect(ergebnis.ketten.feiertage_katalog).toBeDefined()
  })

  it('bleibt aus, wenn der Aufrufer sie selbst übernimmt', async () => {
    const { fuehreTaeglicheAutomatisierungAus } = await import('@/lib/automation')
    const ergebnis = await fuehreTaeglicheAutomatisierungAus(mock.client as never, ORG, ORG, {
      katalogpflege: false,
    })
    expect(pflegeSpion).not.toHaveBeenCalled()
    // Nicht als fehlgeschlagene Kette ausweisen — sie war nicht Teil
    // dieses Laufs. Ein `{ ok: false }` hier waere eine Falschmeldung.
    expect(ergebnis.ketten.feiertage_katalog).toBeUndefined()
  })

  it('läuft über sechs Mandanten genau einmal statt sechsmal', async () => {
    const { fuehreTaeglicheAutomatisierungAus } = await import('@/lib/automation')
    const mandanten = ['org-1', 'org-2', 'org-3', 'org-4', 'org-5', 'org-6']

    // So wie app/api/cron/automatisierung es tut: Schleife ohne Katalog …
    for (const org of mandanten) {
      await fuehreTaeglicheAutomatisierungAus(mock.client as never, org, org, { katalogpflege: false })
    }
    expect(pflegeSpion).not.toHaveBeenCalled()

    // … und danach EINMAL die Katalogpflege.
    const { pflegeFeiertagskatalog } = await import('@/lib/automation/feiertage-pflege')
    await pflegeFeiertagskatalog(mock.client as never)
    expect(pflegeSpion).toHaveBeenCalledTimes(1)
  })

  it('reicht die übrigen Ketten unverändert durch', async () => {
    // Die Option darf NUR den Katalog betreffen — sonst fiele mit ihr
    // stillschweigend halb Kette 1 bis 13 aus.
    const { fuehreTaeglicheAutomatisierungAus } = await import('@/lib/automation')
    const mit = await fuehreTaeglicheAutomatisierungAus(mock.client as never, ORG)
    const ohne = await fuehreTaeglicheAutomatisierungAus(mock.client as never, ORG, ORG, {
      katalogpflege: false,
    })

    const mitOhneKatalog = Object.keys(mit.ketten).filter(k => k !== 'feiertage_katalog').sort()
    expect(Object.keys(ohne.ketten).sort()).toEqual(mitOhneKatalog)
    expect(mitOhneKatalog.length).toBeGreaterThan(5)
  })
})
