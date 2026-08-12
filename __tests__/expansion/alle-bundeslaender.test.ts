// ═══════════════════════════════════════════════════════════════
// END-TO-END: alle 16 Bundesländer, unabhängig voneinander
// ═══════════════════════════════════════════════════════════════
// Prüft die Vorgabe aus Phase 2 Punkt 1 und 7 vollständig:
//
//   • Jedes Bundesland ist EINZELN steuerbar — eine Freischaltung in
//     einem Land darf kein anderes beeinflussen.
//   • Jedes Bundesland hat mindestens eine eindeutig zuordenbare PLZ,
//     sonst ließe sich die Kassenabrechnung dort nie aktivieren.
//   • Ist ein Land nicht anerkannt: Werbung, Registrierung, Warteliste
//     und Privatleistungen laufen, Kassenleistungen sind gesperrt.
//   • Der Hinweistext entspricht wörtlich der Vorgabe.
// ═══════════════════════════════════════════════════════════════

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bundeslandFuerPlz,
  eindeutigesBundeslandFuerPlz,
} from '@/lib/expansion/plz-bundesland'
import {
  BUNDESLAND_CODES,
  BUNDESLAND_NAMEN,
  TEXT_KASSE_IM_VERFAHREN,
  type BundeslandCode,
  type StateSettingsPublic,
} from '@/lib/expansion/types'

// ── Steuerbare Attrappe der Datenbank ───────────────────────────
const zeilen: StateSettingsPublic[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ data: zeilen, error: null }) }),
    }),
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
    }),
  }),
}))

async function ladeModul() {
  vi.resetModules()
  return import('@/lib/expansion/state-settings')
}

function zeile(
  bundesland: BundeslandCode,
  over: Partial<StateSettingsPublic> = {}
): StateSettingsPublic {
  return {
    organization_id: '00000000-0000-4000-8000-000460629986',
    bundesland,
    bundesland_label: BUNDESLAND_NAMEN[bundesland],
    status: 'ANTRAG_EINGEREICHT',
    marketing_enabled: true,
    registration_enabled: true,
    waitinglist_enabled: true,
    private_enabled: true,
    insurance_enabled: false,
    effective_date: null,
    ansprechpartner_name: null,
    ansprechpartner_email: null,
    ansprechpartner_telefon: null,
    ...over,
  }
}

/** Reale, eindeutig zuordenbare Postleitzahlen je Bundesland. */
const PLZ_PROBEN: Record<BundeslandCode, string[]> = {
  baden_wuerttemberg:     ['70173', '79098', '68159', '88212'],  // Stuttgart, Freiburg, Mannheim, Ravensburg
  bayern:                 ['80331', '90402', '63739', '89231'],  // München, Nürnberg, Aschaffenburg, Neu-Ulm
  berlin:                 ['10115', '12043', '13353', '14109'],  // Mitte, Neukölln, Wedding, Wannsee
  brandenburg:            ['14467', '03046', '15230', '16816'],  // Potsdam, Cottbus, Frankfurt/O., Neuruppin
  bremen:                 ['28195', '27568'],                    // Bremen, Bremerhaven
  hamburg:                ['20095', '22087', '21109'],           // Zentrum, Uhlenhorst, Wilhelmsburg
  hessen:                 ['60311', '65183', '34117', '55246'],  // Frankfurt, Wiesbaden, Kassel, Mainz-Kostheim
  mecklenburg_vorpommern: ['19053', '18055', '17489'],           // Schwerin, Rostock, Greifswald
  niedersachsen:          ['30159', '26121', '38100', '37412'],  // Hannover, Oldenburg, Braunschweig, Herzberg
  nordrhein_westfalen:    ['40213', '50667', '44135', '53111'],  // Düsseldorf, Köln, Dortmund, Bonn
  rheinland_pfalz:        ['55116', '54290', '67059', '76829'],  // Mainz, Trier, Ludwigshafen, Landau
  saarland:               ['66111', '66424', '66663'],           // Saarbrücken, Homburg, Merzig
  sachsen:                ['01067', '04109', '09111'],           // Dresden, Leipzig, Chemnitz
  sachsen_anhalt:         ['39104', '06108', '06844'],           // Magdeburg, Halle, Dessau
  schleswig_holstein:     ['24103', '23552', '25813'],           // Kiel, Lübeck, Husum
  thueringen:             ['99084', '07743', '98527', '36404'],  // Erfurt, Jena, Suhl, Vacha
}

beforeEach(() => {
  zeilen.length = 0
})

// ════════════════════════════════════════════════════════════════
describe('PLZ-Erkennung: jedes Bundesland ist erreichbar', () => {
  it('deckt alle 16 Bundesländer mit Proben ab', () => {
    expect(Object.keys(PLZ_PROBEN).sort()).toEqual([...BUNDESLAND_CODES].sort())
  })

  it.each(BUNDESLAND_CODES)('%s: alle Proben werden eindeutig erkannt', code => {
    for (const plz of PLZ_PROBEN[code]) {
      const treffer = bundeslandFuerPlz(plz)
      expect(treffer.code, `${plz} → ${treffer.code}, erwartet ${code}`).toBe(code)
      expect(treffer.sicher, `${plz} ist nicht eindeutig — Kasse dort nie aktivierbar`).toBe(true)
      expect(eindeutigesBundeslandFuerPlz(plz)).toBe(code)
    }
  })

  it('jedes Bundesland hat mindestens eine eindeutige PLZ', () => {
    // Ohne eine einzige eindeutige PLZ liesse sich die Kassenabrechnung in
    // diesem Land nie freischalten — der Guard verlangt Eindeutigkeit.
    const ohne = BUNDESLAND_CODES.filter(
      code => !PLZ_PROBEN[code].some(plz => eindeutigesBundeslandFuerPlz(plz) === code)
    )
    expect(ohne).toEqual([])
  })

  it('findet für jedes Bundesland auch im vollen PLZ-Raum eindeutige Treffer', () => {
    const gefunden = new Set<string>()
    for (let n = 1000; n <= 99999; n += 7) {
      const code = eindeutigesBundeslandFuerPlz(String(n).padStart(5, '0'))
      if (code) gefunden.add(code)
    }
    expect([...gefunden].sort()).toEqual([...BUNDESLAND_CODES].sort())
  })
})

// ════════════════════════════════════════════════════════════════
describe('Nicht anerkannt: vier Module offen, Kasse zu', () => {
  it.each(BUNDESLAND_CODES)('%s', async code => {
    zeilen.push(zeile(code))
    const { bundeslandLage } = await ladeModul()
    const lage = await bundeslandLage(PLZ_PROBEN[code][0])

    expect(lage.bundesland).toBe(code)
    expect(lage.werbung).toBe(true)
    expect(lage.registrierung).toBe(true)
    expect(lage.warteliste).toBe(true)
    expect(lage.privatleistungen).toBe(true)
    expect(lage.kassenabrechnung).toBe(false)
    expect(lage.hinweis).toBe(TEXT_KASSE_IM_VERFAHREN)
  })
})

// ════════════════════════════════════════════════════════════════
describe('Anerkannt: Kassenabrechnung frei', () => {
  it.each(BUNDESLAND_CODES)('%s', async code => {
    zeilen.push(zeile(code, { status: 'ANERKANNT', insurance_enabled: true }))
    const { bundeslandLage, zahlungsartFuerPlz } = await ladeModul()

    for (const plz of PLZ_PROBEN[code]) {
      const lage = await bundeslandLage(plz)
      expect(lage.bundesland).toBe(code)
      expect(lage.kassenabrechnung).toBe(true)
      expect(lage.privatleistungen).toBe(true)
      expect(await zahlungsartFuerPlz(plz)).toBe('kasse')
    }
  })
})

// ════════════════════════════════════════════════════════════════
describe('Unabhängigkeit: eine Freischaltung wirkt nur in ihrem Land', () => {
  it.each(BUNDESLAND_CODES)('nur %s ist frei, die anderen 15 nicht', async freies => {
    // Alle 16 Länder anlegen, genau eines freischalten.
    for (const code of BUNDESLAND_CODES) {
      zeilen.push(
        code === freies
          ? zeile(code, { status: 'ANERKANNT', insurance_enabled: true })
          : zeile(code)
      )
    }

    const { bundeslandLage } = await ladeModul()

    for (const code of BUNDESLAND_CODES) {
      const lage = await bundeslandLage(PLZ_PROBEN[code][0])
      expect(
        lage.kassenabrechnung,
        `${code} sollte ${code === freies ? 'frei' : 'gesperrt'} sein`
      ).toBe(code === freies)
      // Die unabhängigen Module bleiben in JEDEM Land offen.
      expect(lage.registrierung).toBe(true)
      expect(lage.warteliste).toBe(true)
    }
  })
})

// ════════════════════════════════════════════════════════════════
describe('Teilfreischaltung: Privat ja, Kasse nein', () => {
  it.each(BUNDESLAND_CODES)('%s erlaubt Privat ohne Kasse', async code => {
    zeilen.push(zeile(code, { private_enabled: true, insurance_enabled: false }))
    const { bundeslandLage, kassenabrechnungMoeglich } = await ladeModul()

    const lage = await bundeslandLage(PLZ_PROBEN[code][0])
    expect(lage.privatleistungen).toBe(true)
    expect(lage.kassenabrechnung).toBe(false)
    expect(await kassenabrechnungMoeglich(PLZ_PROBEN[code][0])).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════
describe('Alles aus: nur noch Werbung', () => {
  it.each(BUNDESLAND_CODES)('%s respektiert abgeschaltete Module', async code => {
    zeilen.push(zeile(code, {
      status: 'ABGELEHNT',
      registration_enabled: false,
      waitinglist_enabled: false,
      private_enabled: false,
      insurance_enabled: false,
    }))
    const { bundeslandLage } = await ladeModul()

    const lage = await bundeslandLage(PLZ_PROBEN[code][0])
    expect(lage.werbung).toBe(true)
    expect(lage.registrierung).toBe(false)
    expect(lage.warteliste).toBe(false)
    expect(lage.privatleistungen).toBe(false)
    expect(lage.kassenabrechnung).toBe(false)
    expect(lage.hinweis).toContain('keine Anerkennung')
  })
})

// ════════════════════════════════════════════════════════════════
describe('Wortlaut der Vorgabe', () => {
  it('entspricht wörtlich dem Text der Geschäftsführung', () => {
    expect(TEXT_KASSE_IM_VERFAHREN).toBe(
      'Die Anerkennung für die Abrechnung mit den Pflegekassen befindet sich derzeit '
      + 'im Genehmigungsverfahren. Sie können sich bereits registrieren und werden '
      + 'automatisch informiert, sobald die Kassenabrechnung verfügbar ist.'
    )
  })

  it('erscheint in allen 16 Ländern, solange keine Anerkennung vorliegt', async () => {
    for (const code of BUNDESLAND_CODES) zeilen.push(zeile(code))
    const { bundeslandLage } = await ladeModul()

    for (const code of BUNDESLAND_CODES) {
      const lage = await bundeslandLage(PLZ_PROBEN[code][0])
      expect(lage.hinweis).toBe(TEXT_KASSE_IM_VERFAHREN)
    }
  })
})
